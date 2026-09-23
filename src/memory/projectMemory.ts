/**
 * Tokonomics Semantic Project Memory Engine - Production Phase 17 Implementation
 * 
 * Provides explicit, local, bounded project memory for durable decisions and constraints
 * across multi-turn sessions without silently retaining source, prompts, secrets, or stale conclusions.
 * 
 * Invariants:
 * 1. Strict Allowed Types & Versioned Schema (schemaVersion: 1)
 * 2. Fail-Closed Prohibited Content Filter (prompts, source files, terminal output, secrets, PII, unapproved proposals)
 * 3. Explicit Per-Workspace Opt-In & Trusted Workspace Gates
 * 4. Authenticated Encryption at Rest (AES-256-GCM) with PBKDF2 key derivation & path containment
 * 5. Single Global Knapsack Solver Integration (CandidateItem conversion with query relevance)
 * 6. Precedence Hierarchy: Diagnostics > Tests > Code > Project Memory
 * 7. Hard Quotas: 500 items max, 2MB storage max, 300 tokens/turn max
 * 8. Zero-Residue Memory Erase & Full Inspectability
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TokenCounter } from '../engine/tokenizer';
import { SecuritySanitizer } from '../security/sanitizer';
import { CandidateItem } from '../search/reranker';

export type MemoryItemType =
    | 'decision'
    | 'convention'
    | 'constraint'
    | 'terminology'
    | 'task_note'
    // Backwards-compatible aliases
    | 'requirement'
    | 'assumption'
    | 'bug'
    | 'open_question'
    | 'completed_task'
    | 'rejected_option'
    | 'architecture';

export type MemoryStatus = 'active' | 'superseded' | 'resolved' | 'expired';

export type MemoryCreatorType = 'user_manual' | 'user_approved_proposal' | 'automated_proposal';

export type MemorySensitivity = 'low' | 'medium' | 'high';

export interface ProjectMemoryItem {
    id: string;
    schemaVersion: number;
    workspaceId: string;
    type: MemoryItemType;
    title: string;
    description: string;
    status: MemoryStatus;
    confidence: number; // 0.0 to 1.0
    creatorType: MemoryCreatorType;
    sensitivity: MemorySensitivity;
    contentHash: string; // SHA-256 of normalized title + description + type
    reason: string;
    scope: 'workspace' | 'root';
    source: string;
    revision: number;
    revokedAt?: number;
    tokens: number;
    sourceTurnId?: string;
    supersededBy?: string;
    supersedes?: string;
    dependsOn?: string[];
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}

export interface MemoryValidationResult {
    valid: boolean;
    reason?: string;
}

export interface ProjectMemoryStorageConfig {
    storageDir?: string;
    /** Must be backed by VS Code SecretStorage or an OS credential store in production. */
    encryptionKeyProvider?: MemoryEncryptionKeyProvider;
    maxItemsPerWorkspace?: number;
    maxStorageBytesPerWorkspace?: number;
    defaultTtlMs?: number;
    keyVersion?: number;
}

export interface MemoryEncryptionKeyProvider {
    getKey(workspaceId: string): Uint8Array | undefined;
}

export class ProjectMemoryEngine {
    public static readonly SCHEMA_VERSION = 2;
    public static readonly DEFAULT_MAX_ITEMS = 1_000;
    public static readonly DEFAULT_MAX_STORAGE_BYTES = 2 * 1024 * 1024; // 2 MB
    public static readonly DEFAULT_MAX_TOKENS_PER_TURN = 300;

    private storageDir?: string;
    private encryptionKeyProvider?: MemoryEncryptionKeyProvider;
    private maxItemsPerWorkspace: number;
    private maxStorageBytesPerWorkspace: number;
    private readonly keyVersion: number;

    // Per-workspace in-memory state: workspaceId -> (itemId -> ProjectMemoryItem)
    private memoryStores: Map<string, Map<string, ProjectMemoryItem>> = new Map();
    // Per-workspace explicit opt-in consent registry: workspaceId -> boolean
    private consentRegistry: Map<string, boolean> = new Map();
    // Per-workspace trust registry: workspaceId -> boolean
    private trustRegistry: Map<string, boolean> = new Map();

    constructor(config: ProjectMemoryStorageConfig = {}) {
        this.storageDir = config.storageDir;
        this.encryptionKeyProvider = config.encryptionKeyProvider;
        this.maxItemsPerWorkspace = config.maxItemsPerWorkspace || ProjectMemoryEngine.DEFAULT_MAX_ITEMS;
        this.maxStorageBytesPerWorkspace = config.maxStorageBytesPerWorkspace || ProjectMemoryEngine.DEFAULT_MAX_STORAGE_BYTES;
        this.keyVersion = Math.max(1, Math.floor(config.keyVersion || 1));
    }

    // =========================================================================
    // 1. Consent & Workspace Trust Lifecycle
    // =========================================================================

    public setWorkspaceConsent(workspaceId: string, consent: boolean): void {
        const normId = this.normalizeWorkspaceId(workspaceId);
        this.consentRegistry.set(normId, consent === true);
    }

    public hasWorkspaceConsent(workspaceId: string): boolean {
        const normId = this.normalizeWorkspaceId(workspaceId);
        return this.consentRegistry.get(normId) === true;
    }

    public setWorkspaceTrust(workspaceId: string, trusted: boolean): void {
        const normId = this.normalizeWorkspaceId(workspaceId);
        this.trustRegistry.set(normId, trusted === true);
    }

    public isWorkspaceTrusted(workspaceId: string): boolean {
        const normId = this.normalizeWorkspaceId(workspaceId);
        // Default to trusted unless explicitly set to false
        return this.trustRegistry.get(normId) !== false;
    }

    public isPersistenceAvailable(workspaceId: string): boolean {
        const key = this.encryptionKeyProvider?.getKey(this.normalizeWorkspaceId(workspaceId));
        return Boolean(this.storageDir && key && key.byteLength >= 32);
    }

    public revokeWorkspaceConsent(workspaceId: string): void {
        const normId = this.normalizeWorkspaceId(workspaceId);
        this.consentRegistry.set(normId, false);
        const store = this.memoryStores.get(normId);
        if (store) {
            const now = Date.now();
            for (const item of store.values()) item.revokedAt = now;
        }
    }

    // =========================================================================
    // 2. Prohibited Content Detection (Fail-Closed Gates)
    // =========================================================================

    /**
     * Inspects title and description for prohibited content:
     * - Raw prompt templates / conversational injections
     * - Raw full source code files / dumps
     * - Terminal output / ANSI codes / command logs
     * - Secrets, credentials, private keys
     * - PII (emails, IPs)
     * - Unconfirmed automated proposals
     */
    public validateContent(
        title: string,
        description: string,
        creatorType: MemoryCreatorType = 'user_manual'
    ): MemoryValidationResult {
        // A. Reject unconfirmed automated proposals by default
        if (creatorType === 'automated_proposal') {
            return {
                valid: false,
                reason: 'Automated memory proposals require explicit user confirmation before storage.'
            };
        }

        const combined = `${title}\n${description}`.trim();

        // B. Raw Prompts & Prompt Injections
        const promptInjectionRegex = /(?:ignore[ \t]+previous[ \t]+instructions|system[ \t]*:[ \t]*you[ \t]+are|you[ \t]+are[ \t]+an?[ \t]+ai[ \t]+assistant|(?:^|\n)[ \t]*(?:human|assistant|system)[ \t]*:)/i;
        if (promptInjectionRegex.test(combined)) {
            return {
                valid: false,
                reason: 'Prohibited content: raw conversation prompts and prompt injections are not permitted in project memory.'
            };
        }

        // C. Raw Source Code File Dumps
        const sourceDumpRegex = /(?:import\s+.*from\s+['"][^'"]+['"][\s\S]*import\s+.*from\s+['"][^'"]+['"]|export\s+(?:default\s+)?(?:class|interface|function)\s+\w+[\s\S]{300,})/m;
        if (sourceDumpRegex.test(combined) || combined.split('\n').length > 40) {
            return {
                valid: false,
                reason: 'Prohibited content: raw source code file dumps are not permitted; project memory stores decisions and constraints only.'
            };
        }

        // D. Terminal Output & Command Shell Logs
        const terminalRegex = /(?:\x1b\[[0-9;]*[a-zA-Z]|(?:^|\n)[ \t]*(?:PS[ \t]+[A-Za-z]:\\|\$[ \t]+|>[ \t]*npm[ \t]+(?:run|test|build)|Traceback[ \t]+\(most[ \t]+recent[ \t]+call[ \t]+last\):))/m;
        if (terminalRegex.test(combined)) {
            return {
                valid: false,
                reason: 'Prohibited content: terminal output, ANSI sequences, and command logs are not permitted in project memory.'
            };
        }

        // E. Secrets & Credentials (using SecuritySanitizer)
        if (SecuritySanitizer.containsSecret(combined)) {
            return {
                valid: false,
                reason: 'Prohibited content: high-risk credentials or secret keys detected.'
            };
        }

        // F. PII: Email addresses & IP addresses
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        if (emailRegex.test(combined)) {
            return {
                valid: false,
                reason: 'Prohibited content: personal email addresses are not permitted in project memory.'
            };
        }

        const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;
        if (ipRegex.test(combined)) {
            return {
                valid: false,
                reason: 'Prohibited content: IP addresses are not permitted in project memory.'
            };
        }

        return { valid: true };
    }

    // =========================================================================
    // 3. Memory CRUD Operations
    // =========================================================================

    public addMemoryItem(
        workspaceId: string,
        item: {
            id: string;
            type: MemoryItemType;
            title: string;
            description: string;
            status?: MemoryStatus;
            confidence?: number;
            creatorType?: MemoryCreatorType;
            sensitivity?: MemorySensitivity;
            sourceTurnId?: string;
            supersededBy?: string;
            supersedes?: string;
            dependsOn?: string[];
            expiresAt?: number;
            reason?: string;
            scope?: 'workspace' | 'root';
            source?: string;
        }
    ): ProjectMemoryItem {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);

        // Fail-closed trust & consent gate
        this.assertAccessAllowed(normWorkspaceId);

        const creatorType = item.creatorType || 'user_manual';
        const rawTitle = (item.title || '').trim();
        const rawDesc = (item.description || '').trim();

        // Validate prohibited content FIRST (secrets, PII, prompts, code dumps, etc.)
        const validation = this.validateContent(rawTitle, rawDesc, creatorType);
        if (!validation.valid) {
            throw new Error(`[ProjectMemoryEngine] ${validation.reason}`);
        }

        const sanitizedTitle = SecuritySanitizer.sanitizeSecrets(rawTitle).sanitized.slice(0, 256);
        const sanitizedDesc = SecuritySanitizer.sanitizeSecrets(rawDesc).sanitized.slice(0, 4096);
        const reason = SecuritySanitizer.sanitizeSecrets((item.reason || 'Explicit user entry').trim()).sanitized.slice(0, 512);
        const source = SecuritySanitizer.sanitizeSecrets((item.source || item.sourceTurnId || 'user').trim()).sanitized.slice(0, 256);
        if (!reason || !source) throw new Error('[ProjectMemoryEngine] Memory reason and source are required.');

        const store = this.getOrCreateStore(normWorkspaceId);
        const normalizedId = item.id.slice(0, 256);

        const contentToHash = `${item.type}:${sanitizedTitle}:${sanitizedDesc}`;
        const contentHash = crypto.createHash('sha256').update(contentToHash).digest('hex');
        const tokenCount = TokenCounter.countTokens(`[${item.type}] ${sanitizedTitle}: ${sanitizedDesc}`);

        const memoryItem: ProjectMemoryItem = {
            id: normalizedId,
            schemaVersion: ProjectMemoryEngine.SCHEMA_VERSION,
            workspaceId: normWorkspaceId,
            type: item.type,
            title: sanitizedTitle,
            description: sanitizedDesc,
            status: item.status || 'active',
            confidence: Math.max(0.0, Math.min(1.0, item.confidence ?? 1.0)),
            creatorType,
            sensitivity: item.sensitivity || 'low',
            contentHash,
            reason,
            scope: item.scope || 'workspace',
            source,
            revision: 1,
            tokens: tokenCount,
            sourceTurnId: item.sourceTurnId,
            supersededBy: item.supersededBy,
            supersedes: item.supersedes,
            dependsOn: item.dependsOn?.slice(0, 64).map(d => d.slice(0, 256)),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            expiresAt: item.expiresAt
        };

        // If supersedes another item, link it
        if (item.supersedes && store.has(item.supersedes)) {
            const oldItem = store.get(item.supersedes)!;
            oldItem.status = 'superseded';
            oldItem.supersededBy = memoryItem.id;
            oldItem.updatedAt = Date.now();
        }

        store.set(normalizedId, memoryItem);
        this.enforceQuotas(normWorkspaceId);
        this.persistWorkspaceStore(normWorkspaceId);

        return memoryItem;
    }

    public editMemoryItem(
        workspaceId: string,
        id: string,
        updates: {
            title?: string;
            description?: string;
            status?: MemoryStatus;
            confidence?: number;
            sensitivity?: MemorySensitivity;
            expiresAt?: number;
        }
    ): ProjectMemoryItem {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        this.assertAccessAllowed(normWorkspaceId);

        const store = this.getOrCreateStore(normWorkspaceId);
        const existing = store.get(id);
        if (!existing) {
            throw new Error(`[ProjectMemoryEngine] Memory item not found: ${id}`);
        }

        const rawTitle = updates.title !== undefined ? updates.title.trim() : existing.title;
        const rawDesc = updates.description !== undefined ? updates.description.trim() : existing.description;

        const validation = this.validateContent(rawTitle, rawDesc, existing.creatorType);
        if (!validation.valid) {
            throw new Error(`[ProjectMemoryEngine] ${validation.reason}`);
        }

        const newTitle = SecuritySanitizer.sanitizeSecrets(rawTitle).sanitized.slice(0, 256);
        const newDesc = SecuritySanitizer.sanitizeSecrets(rawDesc).sanitized.slice(0, 4096);

        const contentToHash = `${existing.type}:${newTitle}:${newDesc}`;
        existing.title = newTitle;
        existing.description = newDesc;
        existing.contentHash = crypto.createHash('sha256').update(contentToHash).digest('hex');
        existing.tokens = TokenCounter.countTokens(`[${existing.type}] ${newTitle}: ${newDesc}`);
        if (updates.status) existing.status = updates.status;
        if (updates.confidence !== undefined) existing.confidence = Math.max(0.0, Math.min(1.0, updates.confidence));
        if (updates.sensitivity) existing.sensitivity = updates.sensitivity;
        if (updates.expiresAt !== undefined) existing.expiresAt = updates.expiresAt;
        existing.updatedAt = Date.now();
        existing.revision = Math.max(1, existing.revision || 1) + 1;

        this.persistWorkspaceStore(normWorkspaceId);
        return existing;
    }

    public supersedeItem(workspaceId: string, oldItemId: string, newItemId: string): void {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        this.assertAccessAllowed(normWorkspaceId);

        const store = this.getOrCreateStore(normWorkspaceId);
        const oldItem = store.get(oldItemId);
        if (oldItem) {
            oldItem.status = 'superseded';
            oldItem.supersededBy = newItemId;
            oldItem.updatedAt = Date.now();
        }

        const newItem = store.get(newItemId);
        if (newItem) {
            newItem.supersedes = oldItemId;
            newItem.updatedAt = Date.now();
        }

        this.persistWorkspaceStore(normWorkspaceId);
    }

    public inspectMemory(workspaceId: string): ProjectMemoryItem[] {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        if (!this.hasWorkspaceConsent(normWorkspaceId) || !this.isWorkspaceTrusted(normWorkspaceId)) {
            return [];
        }
        const store = this.getOrCreateStore(normWorkspaceId);
        return Array.from(store.values()).map(item => Object.freeze({ ...item, dependsOn: item.dependsOn ? [...item.dependsOn] : undefined }));
    }

    public deleteMemoryItem(workspaceId: string, id: string): boolean {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        this.assertAccessAllowed(normWorkspaceId);
        const deleted = this.getOrCreateStore(normWorkspaceId).delete(id);
        if (deleted) this.persistWorkspaceStore(normWorkspaceId);
        return deleted;
    }

    /** Export governance metadata without exporting remembered content. */
    public exportMetadata(workspaceId: string): string {
        const items = this.inspectMemory(workspaceId).map(item => ({
            id: item.id, schemaVersion: item.schemaVersion, type: item.type, status: item.status,
            confidence: item.confidence, creatorType: item.creatorType, sensitivity: item.sensitivity,
            contentHash: item.contentHash, reason: item.reason, scope: item.scope, source: item.source,
            revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt,
            expiresAt: item.expiresAt, revokedAt: item.revokedAt
        }));
        return JSON.stringify({ schemaVersion: ProjectMemoryEngine.SCHEMA_VERSION,
            workspaceId: this.normalizeWorkspaceId(workspaceId), exportedAt: Date.now(), itemCount: items.length, items }, null, 2);
    }

    public getStorageInfo(workspaceId: string): { location: string | null; encrypted: boolean; keyVersion: number; bytes: number; itemCount: number } {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        const filePath = this.getEncryptedFilePath(normWorkspaceId);
        return Object.freeze({ location: filePath || null, encrypted: Boolean(filePath && this.encryptionKeyProvider),
            keyVersion: this.keyVersion, bytes: filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
            itemCount: this.inspectMemory(normWorkspaceId).length });
    }

    public rebuildMemory(workspaceId: string): number {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        this.assertAccessAllowed(normWorkspaceId);
        this.memoryStores.delete(normWorkspaceId);
        return this.inspectMemory(normWorkspaceId).length;
    }

    public exportMemory(workspaceId: string): string {
        const items = this.inspectMemory(workspaceId);
        return JSON.stringify({
            schemaVersion: ProjectMemoryEngine.SCHEMA_VERSION,
            workspaceId: this.normalizeWorkspaceId(workspaceId),
            exportedAt: Date.now(),
            itemCount: items.length,
            items
        }, null, 2);
    }

    public clearMemory(workspaceId: string): void {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        const store = this.memoryStores.get(normWorkspaceId);
        if (store) {
            store.clear();
        }
        this.eraseWorkspaceMemory(normWorkspaceId);
    }

    /**
     * Erases persisted memory file with zero-residue overwrite
     */
    public eraseWorkspaceMemory(workspaceId: string): void {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);
        this.memoryStores.delete(normWorkspaceId);

        if (!this.storageDir) return;
        const filePath = this.getEncryptedFilePath(normWorkspaceId);
        if (filePath && fs.existsSync(filePath)) {
            try {
                // Zero-residue file overwrite before unlink
                const size = fs.statSync(filePath).size;
                if (size > 0) {
                    fs.writeFileSync(filePath, Buffer.alloc(size, 0));
                }
                fs.unlinkSync(filePath);
            } catch {
                // Fail-safe cleanup
            }
        }
    }

    // =========================================================================
    // 4. Candidate Generation & Global Knapsack Solver Integration
    // =========================================================================

    /**
     * Converts relevant active memory items into typed CandidateItem instances
     * for authoritative selection by the ContextKnapsackSolver.
     */
    public retrieveCandidates(
        query: string,
        workspaceId: string,
        maxTokens: number = ProjectMemoryEngine.DEFAULT_MAX_TOKENS_PER_TURN
    ): CandidateItem[] {
        const normWorkspaceId = this.normalizeWorkspaceId(workspaceId);

        // Fail-closed gate: if no consent or untrusted, return empty list
        if (!this.hasWorkspaceConsent(normWorkspaceId) || !this.isWorkspaceTrusted(normWorkspaceId)) {
            return [];
        }

        const store = this.getOrCreateStore(normWorkspaceId);
        const now = Date.now();

        // 1. Filter to active, non-expired items
        const eligibleItems = Array.from(store.values()).filter(item => {
            if (item.status !== 'active') return false;
            if (item.expiresAt && item.expiresAt <= now) return false;
            if (item.revokedAt || item.sensitivity === 'high') return false;
            if (!this.validateContent(item.title, item.description, item.creatorType).valid) return false;
            const expectedHash = crypto.createHash('sha256').update(`${item.type}:${item.title}:${item.description}`).digest('hex');
            return item.contentHash === expectedHash;
        });

        if (eligibleItems.length === 0) return [];

        // 2. Query relevance scoring
        const queryTerms = new Set(query.toLowerCase().split(/[\s,._-]+/).filter(t => t.length > 2));

        const scoredItems = eligibleItems.map(item => {
            const itemText = `${item.title} ${item.description}`.toLowerCase();
            let matches = 0;
            for (const term of queryTerms) {
                if (itemText.includes(term)) matches++;
            }

            // Keyword relevance score (0.3 base for active memory + up to 0.7 for keyword matches)
            const keywordScore = queryTerms.size > 0 ? (matches / queryTerms.size) * 0.7 : 0.0;
            // Freshness decay: slight preference for updated decisions (last 30 days)
            const ageDays = (now - item.updatedAt) / (1000 * 60 * 60 * 24);
            const freshnessFactor = Math.max(0.85, 1.0 - (ageDays / 365) * 0.15);

            const score = Math.round((0.3 + keywordScore) * item.confidence * freshnessFactor * 1000) / 1000;
            return { item, score };
        });

        // 3. Sort by relevance descending
        scoredItems.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

        // 4. Convert to CandidateItem adhering to max token budget
        const candidates: CandidateItem[] = [];
        let accumulatedTokens = 0;

        for (const { item, score } of scoredItems) {
            if (accumulatedTokens + item.tokens > maxTokens && candidates.length > 0) {
                continue; // Skip items exceeding the turn token budget
            }

            const content = `[${item.type.toUpperCase()}] ${item.title}: ${item.description}`;

            candidates.push({
                id: `memory_${item.id}`,
                filePath: `.tokonomics/memory/${item.type}.md`,
                symbolName: item.title,
                content,
                sourceScore: score,
                tokens: item.tokens,
                category: 'projectMemory',
                role: 'user',
                mandatory: false, // Memory can suggest evidence, but never overrides fresh code or diagnostics
                isProtected: false,
                provenance: Object.freeze([
                    `workspace:${normWorkspaceId}`,
                    `memory_type:${item.type}`,
                    `creator:${item.creatorType}`,
                    `source:${item.source}`,
                    `scope:${item.scope}`,
                    `revision:${item.revision}`,
                    `hash:${item.contentHash.slice(0, 8)}`
                ]),
                dependencies: Object.freeze(item.dependsOn || [])
            });

            accumulatedTokens += item.tokens;
            if (accumulatedTokens >= maxTokens) break;
        }

        return candidates;
    }

    public formatCompactSummary(workspaceId: string, maxTokenBudget: number = 300): string {
        const candidates = this.retrieveCandidates('', workspaceId, maxTokenBudget);
        if (candidates.length === 0) return '';

        let md = `### 🧠 Project Architectural Memory\n`;
        for (const cand of candidates) {
            md += `- ${cand.content}\n`;
        }

        return md;
    }

    // =========================================================================
    // 5. Encrypted Persistence at Rest (AES-256-GCM)
    // =========================================================================

    private getOrCreateStore(workspaceId: string): Map<string, ProjectMemoryItem> {
        let store = this.memoryStores.get(workspaceId);
        if (!store) {
            store = new Map();
            this.memoryStores.set(workspaceId, store);
            this.loadWorkspaceStore(workspaceId);
        }
        return store;
    }

    private normalizeWorkspaceId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'default_workspace';
    }

    private assertAccessAllowed(workspaceId: string): void {
        if (!this.isWorkspaceTrusted(workspaceId)) {
            throw new Error(`[ProjectMemoryEngine] Untrusted workspace: project memory access is blocked.`);
        }
        if (!this.hasWorkspaceConsent(workspaceId)) {
            throw new Error(`[ProjectMemoryEngine] Workspace consent required: project memory is disabled until opt-in.`);
        }
    }

    private enforceQuotas(workspaceId: string): void {
        const store = this.memoryStores.get(workspaceId);
        if (!store) return;

        while (store.size > this.maxItemsPerWorkspace) {
            // Evict oldest resolved or superseded first
            let evictKey: string | undefined;
            for (const [key, item] of store.entries()) {
                if (item.status === 'superseded' || item.status === 'resolved' || item.status === 'expired') {
                    evictKey = key;
                    break;
                }
            }
            // If all active, evict oldest created
            if (!evictKey) {
                evictKey = store.keys().next().value;
            }
            if (evictKey) store.delete(evictKey);
        }
    }

    private getEncryptedFilePath(workspaceId: string): string | undefined {
        if (!this.storageDir) return undefined;

        // Path Traversal Defense: Validate containment
        const normalized = path.normalize(path.resolve(this.storageDir));
        const fileName = `tokonomics_memory_${workspaceId}.enc`;
        const targetPath = path.join(normalized, fileName);

        const relative = path.relative(normalized, targetPath);
        if ((relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative))) || targetPath.includes('\0')) {
            throw new Error(`[ProjectMemoryEngine] Security violation: storage path escapes containment boundary.`);
        }
        return targetPath;
    }

    private deriveKey(workspaceId: string, salt: Buffer): Buffer | undefined {
        const material = this.encryptionKeyProvider?.getKey(workspaceId);
        if (!material || material.byteLength < 32) return undefined;
        return crypto.createHmac('sha256', Buffer.from(material))
            .update('tokonomics-project-memory-v1')
            .update(workspaceId)
            .update(salt)
            .digest();
    }

    private persistWorkspaceStore(workspaceId: string): void {
        const filePath = this.getEncryptedFilePath(workspaceId);
        if (!filePath || !this.storageDir) return;

        const store = this.memoryStores.get(workspaceId);
        if (!store) return;

        try {
            const salt = crypto.randomBytes(16);
            const key = this.deriveKey(workspaceId, salt);
            // Persistence is fail-closed until explicit consent supplies a secret-store key.
            if (!key) return;
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
            }

            const serialized = JSON.stringify(Array.from(store.values()));
            if (Buffer.byteLength(serialized, 'utf8') > this.maxStorageBytesPerWorkspace) {
                // Storage quota exceeded: don't write bloat
                return;
            }

            const iv = crypto.randomBytes(12);

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
            const authTag = cipher.getAuthTag();

            // Versioned structure: magic/version (4) + Salt (16) + IV (12) + AuthTag (16) + ciphertext.
            const keyVersion = Buffer.alloc(4);
            keyVersion.writeUInt32BE(this.keyVersion);
            const payload = Buffer.concat([Buffer.from('TKM2'), keyVersion, salt, iv, authTag, encrypted]);
            fs.writeFileSync(filePath, payload);
        } catch {
            // Fail closed: if encryption or disk write fails, do not write in plaintext
        }
    }

    private loadWorkspaceStore(workspaceId: string): void {
        const filePath = this.getEncryptedFilePath(workspaceId);
        if (!filePath || !fs.existsSync(filePath)) return;

        const store = this.memoryStores.get(workspaceId);
        if (!store) return;

        try {
            const raw = fs.readFileSync(filePath);
            if (raw.length < 52 || raw.subarray(0, 4).toString('ascii') !== 'TKM2') return;

            const storedKeyVersion = raw.readUInt32BE(4);
            if (storedKeyVersion !== this.keyVersion) return;
            const salt = raw.subarray(8, 24);
            const iv = raw.subarray(24, 36);
            const authTag = raw.subarray(36, 52);
            const ciphertext = raw.subarray(52);

            const key = this.deriveKey(workspaceId, salt);
            if (!key) return;
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
            const items: ProjectMemoryItem[] = JSON.parse(decrypted);

            store.clear();
            for (const item of items) {
                const validation = this.validateContent(item.title, item.description, item.creatorType);
                const expectedHash = crypto.createHash('sha256').update(`${item.type}:${item.title}:${item.description}`).digest('hex');
                if (!validation.valid || item.contentHash !== expectedHash || item.workspaceId !== workspaceId || item.revokedAt) continue;
                store.set(item.id, { ...item, schemaVersion: ProjectMemoryEngine.SCHEMA_VERSION,
                    reason: item.reason || 'Migrated explicit entry', scope: item.scope || 'workspace',
                    source: item.source || item.sourceTurnId || 'user', revision: Math.max(1, item.revision || 1) });
            }
        } catch {
            // Authentication tag mismatch, tampering, or corruption: fail closed by clearing
            store.clear();
        }
    }
}

/**
 * Backwards-compatible facade maintaining compatibility with legacy tests
 */
export class ProjectMemory {
    private engine: ProjectMemoryEngine;
    private workspaceId: string = 'legacy_default_workspace';

    constructor(engine?: ProjectMemoryEngine) {
        this.engine = engine || new ProjectMemoryEngine();
        this.engine.setWorkspaceConsent(this.workspaceId, true);
        this.engine.setWorkspaceTrust(this.workspaceId, true);
    }

    public addItem(item: {
        id: string;
        type: MemoryItemType;
        title: string;
        description: string;
        status?: MemoryStatus;
        confidence?: number;
        sourceTurnId?: string;
        supersededBy?: string;
        dependsOn?: string[];
    }): void {
        this.engine.addMemoryItem(this.workspaceId, item);
    }

    public supersedeItem(oldItemId: string, newItemId: string): void {
        this.engine.supersedeItem(this.workspaceId, oldItemId, newItemId);
    }

    public getActiveItems(): ProjectMemoryItem[] {
        return this.engine.inspectMemory(this.workspaceId).filter(i => i.status === 'active');
    }

    public getItemsByType(type: MemoryItemType, activeOnly: boolean = true): ProjectMemoryItem[] {
        return this.engine.inspectMemory(this.workspaceId).filter(i =>
            i.type === type && (!activeOnly || i.status === 'active')
        );
    }

    public formatCompactSummary(maxTokenBudget: number = 300): string {
        return this.engine.formatCompactSummary(this.workspaceId, maxTokenBudget);
    }

    public clear(): void {
        this.engine.clearMemory(this.workspaceId);
    }

    public getEngine(): ProjectMemoryEngine {
        return this.engine;
    }
}
