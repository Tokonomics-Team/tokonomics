/**
 * Tokonomics Hybrid Retrieval Engine
 * Combines in-memory BM25 Okapi lexical retrieval with dense vector cosine similarity
 * via Reciprocal Rank Fusion (RRF), featuring a 100% deterministic fallback for No-ML Core.
 */

export interface IndexableDocument {
    id: string;
    filePath: string;
    symbolName: string;
    content: string;
    embedding?: number[];
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
    private docCount: number = 0;
    private avgDocLength: number = 0;
    private docLengths: Map<string, number> = new Map();
    private docTermFreqs: Map<string, Map<string, number>> = new Map();
    private termDocFreqs: Map<string, number> = new Map();

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
        const tf = new Map<string, number>();

        for (const t of tokens) {
            tf.set(t, (tf.get(t) || 0) + 1);
        }

        this.docTermFreqs.set(id, tf);
        this.docLengths.set(id, tokens.length);

        // Update document frequencies
        for (const term of tf.keys()) {
            this.termDocFreqs.set(term, (this.termDocFreqs.get(term) || 0) + 1);
        }

        this.docCount++;
        let totalLen = 0;
        for (const len of this.docLengths.values()) {
            totalLen += len;
        }
        this.avgDocLength = totalLen / (this.docCount || 1);
    }

    public search(query: string, topK: number = 20): { id: string; score: number }[] {
        const queryTokens = this.tokenize(query);
        const scores = new Map<string, number>();

        for (const q of queryTokens) {
            const df = this.termDocFreqs.get(q) || 0;
            if (df === 0) continue;

            // Okapi IDF formula: ln(1 + (N - df + 0.5)/(df + 0.5))
            const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));

            for (const [docId, tfMap] of this.docTermFreqs.entries()) {
                const tf = tfMap.get(q) || 0;
                if (tf === 0) continue;

                const docLen = this.docLengths.get(docId) || this.avgDocLength;
                const numerator = tf * (this.k1 + 1);
                const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / (this.avgDocLength || 1)));
                const termScore = idf * (numerator / (denominator || 1));

                scores.set(docId, (scores.get(docId) || 0) + termScore);
            }
        }

        return Array.from(scores.entries())
            .map(([id, score]) => ({ id, score: Math.round(score * 100) / 100 }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    public clear(): void {
        this.docCount = 0;
        this.avgDocLength = 0;
        this.docLengths.clear();
        this.docTermFreqs.clear();
        this.termDocFreqs.clear();
    }
}

export class DenseVectorIndex {
    private vectors: Map<string, number[]> = new Map();

    public addVector(id: string, vector: number[]): void {
        this.vectors.set(id, vector);
    }

    public cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        const len = Math.min(a.length, b.length);

        for (let i = 0; i < len; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public search(queryVector: number[], topK: number = 20): { id: string; score: number }[] {
        const scores: { id: string; score: number }[] = [];

        for (const [id, vec] of this.vectors.entries()) {
            const sim = this.cosineSimilarity(queryVector, vec);
            scores.push({ id, score: Math.round(sim * 1000) / 1000 });
        }

        return scores.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    public clear(): void {
        this.vectors.clear();
    }
}

export class HybridRetriever {
    private documents: Map<string, IndexableDocument> = new Map();
    private bm25: BM25Index = new BM25Index();
    private dense: DenseVectorIndex = new DenseVectorIndex();

    public indexDocument(doc: IndexableDocument): void {
        this.documents.set(doc.id, doc);
        this.bm25.addDocument(doc.id, `${doc.filePath} ${doc.symbolName} ${doc.content}`);
        if (doc.embedding && doc.embedding.length > 0) {
            this.dense.addVector(doc.id, doc.embedding);
        }
    }

    /**
     * Executes hybrid retrieval combining BM25 and dense embeddings via Reciprocal Rank Fusion
     */
    public retrieve(params: {
        query: string;
        queryVector?: number[];
        topK?: number;
        enableDense?: boolean;
        rrfK?: number;
    }): RetrievalResult[] {
        const topK = params.topK || 10;
        const rrfK = params.rrfK || 60;
        const enableDense = params.enableDense && !!params.queryVector;

        // 1. Run BM25 Lexical Search
        const bm25Hits = this.bm25.search(params.query, topK * 2);
        const bm25RankMap = new Map<string, { rank: number; score: number }>();
        bm25Hits.forEach((hit, idx) => {
            bm25RankMap.set(hit.id, { rank: idx + 1, score: hit.score });
        });

        // 2. Run Dense Cosine Search (if enabled)
        const denseRankMap = new Map<string, { rank: number; score: number }>();
        if (enableDense && params.queryVector) {
            const denseHits = this.dense.search(params.queryVector, topK * 2);
            denseHits.forEach((hit, idx) => {
                denseRankMap.set(hit.id, { rank: idx + 1, score: hit.score });
            });
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

        return fusedResults.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, topK);
    }

    public clear(): void {
        this.documents.clear();
        this.bm25.clear();
        this.dense.clear();
    }
}
