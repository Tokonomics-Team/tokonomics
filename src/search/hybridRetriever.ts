/**
 * Tokonomics Hybrid Retrieval Engine
 * Combines in-memory BM25 Okapi lexical retrieval with dense vector cosine similarity
 * via Reciprocal Rank Fusion (RRF), featuring a 100% deterministic fallback for No-ML Core.
 */

import { DeterministicLocalEmbeddingProvider, EmbeddingProvider } from './embeddingProvider';
import { BoundedVectorIndex, VectorIndexEntry } from './vectorIndex';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { InvertedPostingsIndex } from './invertedIndex';

export interface IndexableDocument {
    id: string;
    filePath: string;
    symbolName: string;
    content: string;
    embedding?: number[] | Float32Array;
    contentHash?: string;
    lineStart?: number;
    lineEnd?: number;
}

export interface RetrievalResult {
    id: string;
    filePath: string;
    symbolName: string;
    content: string;
    bm25Rank?: number;
    denseRank?: number;
    bm25Score: number;
    denseScore: number;
    rrfScore: number;
}

export class BM25Index {
    private invertedIndex: InvertedPostingsIndex = new InvertedPostingsIndex();
    private k1: number = 1.2;
    private b: number = 0.75;

    public tokenize(text: string): string[] {
        // Splits by whitespace, punctuation, and camelCase / snake_case
        return text
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9_]/g, ' ')
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    public addDocument(id: string, content: string): void {
        const tokens = this.tokenize(content);
        this.invertedIndex.addDocument(id, tokens);
    }

    public removeDocument(id: string): boolean {
        return this.invertedIndex.removeDocument(id);
    }

    public hasDocument(id: string): boolean {
        return this.invertedIndex.hasDocument(id);
    }

    public getInvertedIndex(): InvertedPostingsIndex {
        return this.invertedIndex;
    }

    public get docCount(): number {
        return this.invertedIndex.getDocCount();
    }

    public get avgDocLength(): number {
        return this.invertedIndex.getAvgDocLength();
    }

    public get totalDocTokens(): number {
        return this.invertedIndex.getTotalDocTokens();
    }

    public search(query: string, topK: number = 20): { id: string; score: number }[] {
        const queryTokens = this.tokenize(query);
        return this.invertedIndex.searchBM25(queryTokens, topK, this.k1, this.b);
    }

    public clear(): void {
        this.invertedIndex.clear();
    }
}

export class DenseVectorIndex {
    private boundedIndex: BoundedVectorIndex;

    constructor(boundedIndex?: BoundedVectorIndex) {
        this.boundedIndex = boundedIndex || new BoundedVectorIndex();
    }

    public addVector(id: string, vector: number[] | Float32Array, fileKey: string = id, contentHash: string = 'hash'): void {
        const floatVec = vector instanceof Float32Array ? vector : new Float32Array(vector);
        this.boundedIndex.addOrUpdateEntry({
            id,
            fileKey,
            contentHash,
            parserVersion: this.boundedIndex.parserVersion,
            embeddingVersion: this.boundedIndex.embeddingVersion,
            vector: floatVec
        });
    }

    public cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        const len = Math.min(a.length, b.length);

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

    public search(queryVector: number[] | Float32Array, topK: number = 20): { id: string; score: number }[] {
        const floatVec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
        const results = this.boundedIndex.search(floatVec, topK);
        return results.map(r => ({ id: r.entry.id, score: r.score }));
    }

    public removeVector(id: string): boolean {
        return this.boundedIndex.removeEntry(id);
    }

    public clear(): void {
        this.boundedIndex.clear();
    }

    public getBoundedIndex(): BoundedVectorIndex {
        return this.boundedIndex;
    }
}

export class HybridRetriever {
    private documents: Map<string, IndexableDocument> = new Map();
    private bm25: BM25Index = new BM25Index();
    private denseIndex: BoundedVectorIndex;
    private denseWrapper: DenseVectorIndex;
    private embeddingProvider: EmbeddingProvider;
    private fileChunkMap: Map<string, Set<string>> = new Map();
    private fileHashes: Map<string, string> = new Map();

    constructor(options?: {
        vectorIndex?: BoundedVectorIndex;
        embeddingProvider?: EmbeddingProvider;
    }) {
        this.denseIndex = options?.vectorIndex || new BoundedVectorIndex();
        this.denseWrapper = new DenseVectorIndex(this.denseIndex);
        this.embeddingProvider = options?.embeddingProvider || new DeterministicLocalEmbeddingProvider();
    }

    public getEmbeddingProvider(): EmbeddingProvider {
        return this.embeddingProvider;
    }

    public getVectorIndex(): BoundedVectorIndex {
        return this.denseIndex;
    }

    public getBM25Index(): BM25Index {
        return this.bm25;
    }

    public indexDocument(doc: IndexableDocument): void {
        // If document already exists, remove it first to keep terms and vectors clean
        if (this.documents.has(doc.id)) {
            this.removeDocument(doc.id);
        }

        this.documents.set(doc.id, doc);
        this.bm25.addDocument(doc.id, `${doc.filePath} ${doc.symbolName} ${doc.content}`);
        if (doc.embedding && doc.embedding.length > 0) {
            this.denseWrapper.addVector(doc.id, doc.embedding, doc.filePath, doc.contentHash || 'hash');
        }

        // Track chunk under file for incremental updates
        let chunks = this.fileChunkMap.get(doc.filePath);
        if (!chunks) {
            chunks = new Set();
            this.fileChunkMap.set(doc.filePath, chunks);
        }
        chunks.add(doc.id);
    }

    /**
     * Incrementally removes a single document chunk from all indexes in O(1) time
     */
    public removeDocument(id: string): boolean {
        const doc = this.documents.get(id);
        if (!doc) return false;

        this.documents.delete(id);
        this.bm25.removeDocument(id);
        this.denseWrapper.removeVector(id);

        const chunks = this.fileChunkMap.get(doc.filePath);
        if (chunks) {
            chunks.delete(id);
            if (chunks.size === 0) {
                this.fileChunkMap.delete(doc.filePath);
            }
        }
        return true;
    }

    /**
     * Incrementally removes all document chunks for a specific file
     */
    public removeFile(filePath: string): number {
        const chunks = this.fileChunkMap.get(filePath);
        if (!chunks || chunks.size === 0) return 0;

        let count = 0;
        for (const chunkId of [...chunks]) {
            if (this.removeDocument(chunkId)) {
                count++;
            }
        }
        this.fileChunkMap.delete(filePath);
        this.fileHashes.delete(filePath);
        return count;
    }

    /**
     * Incrementally indexes all files and symbols from an immutable WorkspaceSnapshot
     * Uses content hashes and file chunk tracking for sub-millisecond delta re-indexing.
     */
    public async indexSnapshot(snapshot: WorkspaceSnapshot, options?: { maxChunks?: number }): Promise<number> {
        let chunkCount = 0;
        const maxChunks = options?.maxChunks ?? 5000;

        // 1. Detect and remove deleted files (previously tracked files missing from current snapshot)
        for (const trackedFile of [...this.fileChunkMap.keys()]) {
            if (!snapshot.files.has(trackedFile)) {
                this.removeFile(trackedFile);
            }
        }

        // 2. Incremental update: only index new or modified files
        for (const fileRecord of snapshot.files.values()) {
            if (chunkCount >= maxChunks) break;

            const existingHash = this.fileHashes.get(fileRecord.relativePath);
            if (existingHash && existingHash === fileRecord.contentHash && this.fileChunkMap.has(fileRecord.relativePath)) {
                // Completely unchanged file: skip indexing
                continue;
            }

            // If file was previously indexed with an older hash, purge stale chunks first
            if (existingHash) {
                this.removeFile(fileRecord.relativePath);
            }

            this.fileHashes.set(fileRecord.relativePath, fileRecord.contentHash);

            // Feed corpus statistics so the embedding provider can down-weight ubiquitous
            // identifiers. Without this the dense vector is a re-hash of the same tokens BM25
            // already ranks, and fusing the two adds little independent signal.
            this.embeddingProvider.observeCorpus?.([fileRecord.skeleton]);

            // Index file skeleton
            const fileDocId = `${fileRecord.relativePath}:skeleton`;
            let embedding: Float32Array | undefined;
            try {
                embedding = await this.embeddingProvider.embedQuery(fileRecord.skeleton.slice(0, 1000));
            } catch {
                // Fallback: zero or omit embedding
            }

            const doc: IndexableDocument = {
                id: fileDocId,
                filePath: fileRecord.relativePath,
                symbolName: fileRecord.symbols[0]?.name || '',
                content: fileRecord.skeleton,
                contentHash: fileRecord.contentHash,
                embedding
            };
            this.indexDocument(doc);
            chunkCount++;

            // Index individual symbols
            for (const sym of fileRecord.symbols.slice(0, 10)) {
                if (chunkCount >= maxChunks) break;
                const symDocId = `${fileRecord.relativePath}:${sym.name}:${sym.line}`;
                let symEmbedding: Float32Array | undefined;
                try {
                    symEmbedding = await this.embeddingProvider.embedQuery(`${sym.name} ${sym.signature}`);
                } catch {}

                const symDoc: IndexableDocument = {
                    id: symDocId,
                    filePath: fileRecord.relativePath,
                    symbolName: sym.name,
                    content: sym.signature,
                    contentHash: fileRecord.contentHash,
                    lineStart: sym.line,
                    lineEnd: sym.line,
                    embedding: symEmbedding
                };
                this.indexDocument(symDoc);
                chunkCount++;
            }
        }

        return chunkCount;
    }

    /**
     * Executes hybrid retrieval combining BM25 and dense embeddings via Reciprocal Rank Fusion (RRF)
     * Features 100% deterministic fallback to lexical BM25 if dense retrieval is disabled or fails.
     */
    public retrieve(params: {
        query: string;
        queryVector?: number[] | Float32Array;
        topK?: number;
        enableDense?: boolean;
        rrfK?: number;
    }): RetrievalResult[] {
        const topK = params.topK || 10;
        const rrfK = params.rrfK || 60;
        const enableDense = params.enableDense !== false;

        // 1. Run BM25 Lexical Search (Always Authoritative Baseline)
        const bm25Hits = this.bm25.search(params.query, topK * 2);
        const bm25RankMap = new Map<string, { rank: number; score: number }>();
        bm25Hits.forEach((hit, idx) => {
            bm25RankMap.set(hit.id, { rank: idx + 1, score: hit.score });
        });

        // 2. Run Dense Cosine Search (Protected by deterministic fail-closed fallback)
        const denseRankMap = new Map<string, { rank: number; score: number }>();
        if (enableDense) {
            try {
                let vec = params.queryVector;
                if (!vec && this.embeddingProvider instanceof DeterministicLocalEmbeddingProvider) {
                    // Synchronously compute deterministic vector if not explicitly provided
                    const provider = this.embeddingProvider as any;
                    if (typeof provider.computeVector === 'function') {
                        vec = provider.computeVector(params.query);
                    }
                }

                if (vec && vec.length > 0) {
                    const floatVec = vec instanceof Float32Array ? vec : new Float32Array(vec);
                    const denseHits = this.denseWrapper.search(floatVec, topK * 2);
                    denseHits.forEach((hit, idx) => {
                        denseRankMap.set(hit.id, { rank: idx + 1, score: hit.score });
                    });
                }
            } catch {
                // Fail-closed: dense failure leaves denseRankMap empty, triggering complete BM25 fallback
            }
        }

        // 3. Reciprocal Rank Fusion (RRF)
        const candidateIds = new Set<string>([...bm25RankMap.keys(), ...denseRankMap.keys()]);
        const fusedResults: RetrievalResult[] = [];

        for (const id of candidateIds) {
            const doc = this.documents.get(id);
            if (!doc) continue;

            const bm25Entry = bm25RankMap.get(id);
            const denseEntry = denseRankMap.get(id);

            let rrfScore = 0;
            if (bm25Entry) {
                rrfScore += 1.0 / (rrfK + bm25Entry.rank);
            }
            if (denseEntry) {
                rrfScore += 1.0 / (rrfK + denseEntry.rank);
            }

            fusedResults.push({
                id: doc.id,
                filePath: doc.filePath,
                symbolName: doc.symbolName,
                content: doc.content,
                bm25Rank: bm25Entry?.rank,
                denseRank: denseEntry?.rank,
                bm25Score: bm25Entry?.score || 0,
                denseScore: denseEntry?.score || 0,
                rrfScore: Math.round(rrfScore * 10000) / 10000
            });
        }

        return fusedResults.sort((a, b) => b.rrfScore - a.rrfScore || a.id.localeCompare(b.id)).slice(0, topK);
    }

    public clear(): void {
        this.documents.clear();
        this.bm25.clear();
        this.denseIndex.clear();
        this.fileChunkMap.clear();
        this.fileHashes.clear();
    }

    public dispose(): void {
        this.clear();
        this.denseIndex.dispose();
        if (typeof this.embeddingProvider.dispose === 'function') {
            this.embeddingProvider.dispose();
        }
    }
}
