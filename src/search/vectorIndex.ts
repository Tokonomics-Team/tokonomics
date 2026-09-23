/**
 * Tokonomics Bounded Workspace-Local Vector Index
 * Provides content-addressed, quota-enforced vector indexing with exact invalidation,
 * LRU eviction, and snapshot-safe reconciliation.
 */

import { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export interface VectorIndexEntry {
    readonly id: string;
    readonly fileKey: string;
    readonly symbolName?: string;
    readonly lineStart?: number;
    readonly lineEnd?: number;
    readonly contentHash: string;
    readonly parserVersion: string;
    readonly embeddingVersion: string;
    readonly vector: Float32Array;
    readonly timestamp: number;
}

export interface VectorSearchResult {
    readonly entry: VectorIndexEntry;
    readonly score: number;
    readonly rank: number;
}

export interface BoundedVectorIndexOptions {
    readonly maxVectors?: number;
    readonly maxMemoryMB?: number;
    readonly parserVersion?: string;
    readonly embeddingVersion?: string;
    readonly workspaceId?: string;
}

export class BoundedVectorIndex {
    private readonly entries: Map<string, VectorIndexEntry> = new Map();
    private readonly fileToEntryIds: Map<string, Set<string>> = new Map();
    
    public readonly maxVectors: number;
    public readonly maxMemoryBytes: number;
    public readonly parserVersion: string;
    public readonly embeddingVersion: string;
    public readonly workspaceId: string;

    constructor(options?: BoundedVectorIndexOptions) {
        this.maxVectors = options?.maxVectors ?? 5000;
        this.maxMemoryBytes = (options?.maxMemoryMB ?? 16) * 1024 * 1024;
        this.parserVersion = options?.parserVersion ?? '1.0.0';
        this.embeddingVersion = options?.embeddingVersion ?? '1.0.0';
        this.workspaceId = options?.workspaceId ?? 'default_workspace';
    }

    /**
     * Adds or updates a vector entry with LRU eviction when quotas are exceeded
     */
    public addOrUpdateEntry(entryData: Omit<VectorIndexEntry, 'timestamp'>): void {
        // Enforce version compatibility
        if (entryData.embeddingVersion !== this.embeddingVersion || entryData.parserVersion !== this.parserVersion) {
            return;
        }

        // Evict if capacity reached
        if (this.entries.size >= this.maxVectors && !this.entries.has(entryData.id)) {
            this.evictOldest();
        }

        // Memory budget check (approx 4 bytes per float + metadata overhead ~256 bytes)
        const approxBytes = this.estimateMemoryUsage();
        if (approxBytes >= this.maxMemoryBytes && !this.entries.has(entryData.id)) {
            this.evictOldest();
        }

        const entry: VectorIndexEntry = {
            ...entryData,
            timestamp: Date.now()
        };

        this.entries.set(entry.id, entry);

        // Map to fileKey
        let set = this.fileToEntryIds.get(entry.fileKey);
        if (!set) {
            set = new Set();
            this.fileToEntryIds.set(entry.fileKey, set);
        }
        set.add(entry.id);
    }

    /**
     * Searches index using cosine similarity against query vector
     */
    public search(queryVector: Float32Array, topK: number = 20): VectorSearchResult[] {
        if (!queryVector || queryVector.length === 0 || this.entries.size === 0) {
            return [];
        }

        const scored: { entry: VectorIndexEntry; score: number }[] = [];

        for (const entry of this.entries.values()) {
            const score = this.cosineSimilarity(queryVector, entry.vector);
            if (score > 0) {
                scored.push({ entry, score: Math.round(score * 10000) / 10000 });
            }
        }

        scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));

        return scored.slice(0, topK).map((item, idx) => ({
            entry: item.entry,
            score: item.score,
            rank: idx + 1
        }));
    }

    /**
     * Purges all vectors associated with a specific file
     */
    public invalidateFile(fileKey: string): number {
        const ids = this.fileToEntryIds.get(fileKey);
        if (!ids || ids.size === 0) return 0;

        let count = 0;
        for (const id of ids) {
            if (this.entries.delete(id)) {
                count++;
            }
        }
        this.fileToEntryIds.delete(fileKey);
        return count;
    }

    /**
     * Removes a single vector entry by ID
     */
    public removeEntry(id: string): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;
        const set = this.fileToEntryIds.get(entry.fileKey);
        if (set) {
            set.delete(id);
            if (set.size === 0) {
                this.fileToEntryIds.delete(entry.fileKey);
            }
        }
        return this.entries.delete(id);
    }

    /**
     * Reconciles index against immutable snapshot: invalidates missing or modified files
     */
    public reconcileSnapshot(snapshot: WorkspaceSnapshot): number {
        let purgedCount = 0;
        const currentFileKeys = new Set(snapshot.files.keys());

        for (const fileKey of Array.from(this.fileToEntryIds.keys())) {
            const snapshotRecord = snapshot.files.get(fileKey);
            if (!snapshotRecord) {
                // File deleted or excluded from snapshot
                purgedCount += this.invalidateFile(fileKey);
            } else {
                // Check if any indexed chunk has mismatched contentHash
                const ids = this.fileToEntryIds.get(fileKey);
                if (ids) {
                    for (const id of ids) {
                        const entry = this.entries.get(id);
                        if (entry && entry.contentHash !== snapshotRecord.contentHash) {
                            purgedCount += this.invalidateFile(fileKey);
                            break;
                        }
                    }
                }
            }
        }

        return purgedCount;
    }

    /**
     * Invalidates entire index on model or parser version upgrade
     */
    public invalidateOnVersionMismatch(currentEmbeddingVersion: string, currentParserVersion: string): boolean {
        if (this.embeddingVersion !== currentEmbeddingVersion || this.parserVersion !== currentParserVersion) {
            this.clear();
            return true;
        }
        return false;
    }

    public clear(): void {
        this.entries.clear();
        this.fileToEntryIds.clear();
    }

    public dispose(): void {
        this.clear();
    }

    public size(): number {
        return this.entries.size;
    }

    public has(id: string): boolean {
        return this.entries.has(id);
    }

    public get(id: string): VectorIndexEntry | undefined {
        return this.entries.get(id);
    }

    public estimateMemoryUsage(): number {
        let total = 0;
        for (const entry of this.entries.values()) {
            total += (entry.vector.byteLength || 256) + 300; // vector bytes + object metadata overhead
        }
        return total;
    }

    private evictOldest(): void {
        let oldestId: string | undefined;
        let oldestTime = Infinity;

        for (const [id, entry] of this.entries.entries()) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestId = id;
            }
        }

        if (oldestId) {
            const entry = this.entries.get(oldestId);
            if (entry) {
                const set = this.fileToEntryIds.get(entry.fileKey);
                if (set) {
                    set.delete(oldestId);
                    if (set.size === 0) {
                        this.fileToEntryIds.delete(entry.fileKey);
                    }
                }
            }
            this.entries.delete(oldestId);
        }
    }

    private cosineSimilarity(a: Float32Array, b: Float32Array): number {
        if (!a || !b) return 0;
        const len = Math.min(a.length, b.length);
        if (len === 0) return 0;

        let dot = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < len; i++) {
            const valA = a[i];
            const valB = b[i];
            if (!Number.isFinite(valA) || !Number.isFinite(valB)) continue;
            dot += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        }

        if (normA <= 1e-8 || normB <= 1e-8) return 0;
        const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
        return Number.isFinite(sim) ? Math.max(-1.0, Math.min(1.0, sim)) : 0;
    }
}
