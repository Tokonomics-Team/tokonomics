/**
 * Exact response cache.
 *
 * Answer replay is deliberately stricter than retrieval: a response is reusable only
 * when every input that can affect the answer has the same SHA-256 fingerprint.
 * Approximate matches are exposed as non-answer hints only.
 */

import { createHash } from 'crypto';

export interface ResponseCacheSafety {
    intent: string;
    hasToolCalls?: boolean;
    partialStream?: boolean;
    cancelled?: boolean;
    failed?: boolean;
    unresolvedWorkspace?: boolean;
    timeSensitive?: boolean;
}

export interface ResponseCacheRequest {
    requestText: string;
    conversation: readonly unknown[];
    workspace: {
        roots: readonly string[];
        snapshotGeneration: number;
        ignorePolicyVersion: string;
        files: readonly { path: string; contentHash: string; sourceVersion: string }[];
    };
    evidence: readonly { id: string; contentHash: string }[];
    model: { provider: string; id: string };
    tools: readonly unknown[];
    compilerConfiguration: unknown;
    policies: unknown;
    extensionVersion: string;
    safety: ResponseCacheSafety;
}

export interface CacheEntry {
    fingerprint: string;
    normalizedQuery: string;
    queryShingles: ReadonlySet<string>;
    response: string;
    timestamp: number;
    hitCount: number;
    dependentFiles: ReadonlySet<string>;
}

export interface CacheLookupResult {
    hit: boolean;
    response?: string;
    tier?: 'exact_sha256';
    similarityScore?: number;
    ageMs?: number;
    bypassReason?: string;
    totalHits: number;
    totalMisses: number;
    hitRatePercent: number;
}

export interface CacheHint {
    fingerprint: string;
    similarityScore: number;
    ageMs: number;
}

export interface CacheStats {
    size: number;
    maxSize: number;
    totalHits: number;
    exactHits: number;
    semanticHits: number;
    semanticHints: number;
    totalMisses: number;
    bypassed: number;
    hitRatePercent: number;
    oldestEntryAgeMs: number;
}

const CACHEABLE_INTENTS = new Set(['question', 'explain']);
const MUTATING_INTENTS = new Set(['edit', 'generate', 'refactor', 'test']);

export class ResponseCache {
    private cache = new Map<string, CacheEntry>();
    private insertionOrder: string[] = [];
    private totalHits = 0;
    private exactHits = 0;
    private totalMisses = 0;
    private bypassed = 0;
    private semanticHints = 0;

    constructor(
        private readonly maxSize: number = 100,
        private readonly ttlMs: number = 30 * 60 * 1000,
        private readonly hintSimilarityThreshold: number = 0.88
    ) {}

    public lookup(request: ResponseCacheRequest): CacheLookupResult {
        const bypassReason = this.ineligibilityReason(request.safety);
        if (bypassReason) {
            this.bypassed++;
            return this.buildMissResult(bypassReason);
        }

        const fingerprint = ResponseCache.fingerprint(request);
        const entry = this.cache.get(fingerprint);
        if (!entry) {
            this.totalMisses++;
            return this.buildMissResult();
        }

        const ageMs = Date.now() - entry.timestamp;
        if (ageMs > this.ttlMs) {
            this.delete(fingerprint);
            this.totalMisses++;
            return this.buildMissResult('expired');
        }

        entry.hitCount++;
        this.totalHits++;
        this.exactHits++;
        this.touch(fingerprint);
        return {
            hit: true,
            response: entry.response,
            tier: 'exact_sha256',
            similarityScore: 1,
            ageMs,
            totalHits: this.totalHits,
            totalMisses: this.totalMisses,
            hitRatePercent: this.getHitRate()
        };
    }

    public store(request: ResponseCacheRequest, response: string, terminalState: 'completed' | 'partial' | 'cancelled' | 'failed'): boolean {
        const safety: ResponseCacheSafety = {
            ...request.safety,
            partialStream: request.safety.partialStream || terminalState === 'partial',
            cancelled: request.safety.cancelled || terminalState === 'cancelled',
            failed: request.safety.failed || terminalState === 'failed'
        };
        if (terminalState !== 'completed' || this.ineligibilityReason(safety) || !response.trim()) return false;

        this.sweepExpired();
        const fingerprint = ResponseCache.fingerprint(request);
        while (!this.cache.has(fingerprint) && this.cache.size >= this.maxSize && this.insertionOrder.length > 0) {
            this.delete(this.insertionOrder[0]);
        }

        this.cache.set(fingerprint, {
            fingerprint,
            normalizedQuery: this.normalizeQuery(request.requestText),
            queryShingles: this.generateShingles(this.normalizeQuery(request.requestText)),
            response,
            timestamp: Date.now(),
            hitCount: 0,
            dependentFiles: new Set(request.workspace.files.map(file => file.path))
        });
        this.touch(fingerprint);
        return true;
    }

    /** Similar entries may guide retrieval, but never expose or replay cached answers. */
    public findHints(request: ResponseCacheRequest, limit: number = 3): readonly CacheHint[] {
        if (this.ineligibilityReason(request.safety)) return Object.freeze([]);
        this.sweepExpired();
        const shingles = this.generateShingles(this.normalizeQuery(request.requestText));
        const hints = [...this.cache.values()].map(entry => ({
            fingerprint: entry.fingerprint,
            similarityScore: this.jaccard(shingles, entry.queryShingles),
            ageMs: Date.now() - entry.timestamp
        })).filter(hint => hint.similarityScore >= this.hintSimilarityThreshold)
            .sort((a, b) => b.similarityScore - a.similarityScore || a.fingerprint.localeCompare(b.fingerprint))
            .slice(0, Math.max(0, limit));
        this.semanticHints += hints.length;
        return Object.freeze(hints);
    }

    public invalidateForFile(filePath: string): number {
        const normalized = filePath.replace(/\\/g, '/').toLowerCase();
        const targets = [...this.cache.entries()].filter(([, entry]) =>
            [...entry.dependentFiles].some(file => file.replace(/\\/g, '/').toLowerCase() === normalized)
        ).map(([fingerprint]) => fingerprint);
        targets.forEach(fingerprint => this.delete(fingerprint));
        return targets.length;
    }

    public clear(): void {
        this.cache.clear();
        this.insertionOrder = [];
        this.totalHits = 0;
        this.exactHits = 0;
        this.semanticHints = 0;
        this.totalMisses = 0;
        this.bypassed = 0;
    }

    public estimateMemoryBytes(): number {
        let bytes = 0;
        for (const entry of this.cache.values()) {
            bytes += (entry.fingerprint.length + entry.normalizedQuery.length + entry.response.length) * 2;
            bytes += entry.queryShingles.size * 40 + entry.dependentFiles.size * 80 + 64;
        }
        return bytes;
    }

    public getStats(): CacheStats {
        let oldestEntryAgeMs = 0;
        for (const entry of this.cache.values()) oldestEntryAgeMs = Math.max(oldestEntryAgeMs, Date.now() - entry.timestamp);
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            totalHits: this.totalHits,
            exactHits: this.exactHits,
            semanticHits: 0,
            semanticHints: this.semanticHints,
            totalMisses: this.totalMisses,
            bypassed: this.bypassed,
            hitRatePercent: this.getHitRate(),
            oldestEntryAgeMs
        };
    }

    public static fingerprint(request: ResponseCacheRequest): string {
        const material = {
            schema: 'tokonomics.response-cache.v1',
            requestText: request.requestText,
            conversation: request.conversation,
            workspace: {
                ...request.workspace,
                roots: [...request.workspace.roots].sort(),
                files: [...request.workspace.files].sort((a, b) => a.path.localeCompare(b.path))
            },
            evidence: [...request.evidence].sort((a, b) => a.id.localeCompare(b.id)),
            model: request.model,
            tools: request.tools,
            compilerConfiguration: request.compilerConfiguration,
            policies: request.policies,
            extensionVersion: request.extensionVersion
        };
        return createHash('sha256').update(stableSerialize(material)).digest('hex');
    }

    private ineligibilityReason(safety: ResponseCacheSafety): string | undefined {
        const intent = safety.intent.toLowerCase();
        if (MUTATING_INTENTS.has(intent) || !CACHEABLE_INTENTS.has(intent)) return `intent:${intent || 'unknown'}`;
        if (safety.hasToolCalls) return 'tool-call';
        if (safety.partialStream) return 'partial-stream';
        if (safety.cancelled) return 'cancelled';
        if (safety.failed) return 'failed';
        if (safety.unresolvedWorkspace) return 'unresolved-workspace';
        if (safety.timeSensitive) return 'time-sensitive';
        return undefined;
    }

    private normalizeQuery(query: string): string {
        return query.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    private generateShingles(text: string): ReadonlySet<string> {
        const words = text.split(/\s+/).slice(0, 120).filter(Boolean);
        const shingles = new Set<string>(words.map(word => `1:${word}`));
        for (let i = 0; i < words.length - 1; i++) shingles.add(`2:${words[i]}_${words[i + 1]}`);
        for (let i = 0; i < words.length - 2; i++) shingles.add(`3:${words[i]}_${words[i + 1]}_${words[i + 2]}`);
        return shingles;
    }

    private jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
        if (a.size === 0 || b.size === 0) return 0;
        let intersection = 0;
        for (const value of a) if (b.has(value)) intersection++;
        return intersection / (a.size + b.size - intersection);
    }

    private sweepExpired(): void {
        const now = Date.now();
        for (const [fingerprint, entry] of this.cache) if (now - entry.timestamp > this.ttlMs) this.delete(fingerprint);
    }

    private delete(fingerprint: string): void {
        this.cache.delete(fingerprint);
        this.insertionOrder = this.insertionOrder.filter(value => value !== fingerprint);
    }

    private touch(fingerprint: string): void {
        this.insertionOrder = this.insertionOrder.filter(value => value !== fingerprint);
        this.insertionOrder.push(fingerprint);
    }

    private getHitRate(): number {
        const attempts = this.totalHits + this.totalMisses;
        return attempts === 0 ? 0 : Math.round((this.totalHits / attempts) * 100);
    }

    private buildMissResult(bypassReason?: string): CacheLookupResult {
        return {
            hit: false,
            bypassReason,
            totalHits: this.totalHits,
            totalMisses: this.totalMisses,
            hitRatePercent: this.getHitRate()
        };
    }
}

export function isTimeSensitiveRequest(text: string): boolean {
    return /\b(latest|current|currently|today|tonight|now|recent|news|weather|price|stock|market|exchange rate|schedule|time|date)\b/i.test(text);
}

function stableSerialize(value: unknown): string {
    if (value === undefined) return '"<undefined>"';
    if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}
