/**
 * Tokonomics Reranking Engine
 * Two-stage reranker pipeline: Bi-Encoder Cosine ➔ Optional Cross-Encoder ➔ Hybrid Scoring.
 * Features deterministic fallback to Cosine/Lexical scoring if Cross-Encoder is disabled or fails.
 */

export interface CandidateItem {
    id: string;
    filePath: string;
    symbolName: string;
    content: string;
    embedding?: number[];
    initialScore?: number;
}

export interface RankedCandidate extends CandidateItem {
    rerankScore: number;
    rank: number;
    rerankerUsed: 'cosine' | 'cross_encoder' | 'hybrid';
}

export interface Reranker {
    rank(query: string, candidates: CandidateItem[], queryVector?: number[]): Promise<RankedCandidate[]>;
}

export class CosineReranker implements Reranker {
    public async rank(query: string, candidates: CandidateItem[], queryVector?: number[]): Promise<RankedCandidate[]> {
        const results: RankedCandidate[] = [];

        for (const cand of candidates) {
            let sim = cand.initialScore || 0;
            if (queryVector && cand.embedding) {
                sim = this.cosineSimilarity(queryVector, cand.embedding);
            }
            results.push({
                ...cand,
                rerankScore: Math.round(sim * 1000) / 1000,
                rank: 0,
                rerankerUsed: 'cosine'
            });
        }

        results.sort((a, b) => b.rerankScore - a.rerankScore);
        results.forEach((r, idx) => { r.rank = idx + 1; });
        return results;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    }
}

export class CrossEncoderReranker implements Reranker {
    private fallbackCosine: CosineReranker = new CosineReranker();

    constructor(private crossEncoderModelAvailable: boolean = false) {}

    public async rank(query: string, candidates: CandidateItem[], queryVector?: number[]): Promise<RankedCandidate[]> {
        // Deterministic Fallback Cascade: If ML model not loaded, fall back immediately to Cosine
        if (!this.crossEncoderModelAvailable) {
            return this.fallbackCosine.rank(query, candidates, queryVector);
        }

        try {
            // Simulated local quantized cross-encoder token-interaction score
            const queryTokens = new Set(query.toLowerCase().split(/\s+/));
            const results: RankedCandidate[] = [];

            for (const cand of candidates) {
                const contentTokens = cand.content.toLowerCase().split(/\s+/);
                let matchCount = 0;
                for (const t of contentTokens) {
                    if (queryTokens.has(t)) matchCount++;
                }

                const interactionScore = matchCount / (contentTokens.length + 5);
                const score = 0.5 * (cand.initialScore || 0.5) + 0.5 * interactionScore;

                results.push({
                    ...cand,
                    rerankScore: Math.round(score * 1000) / 1000,
                    rank: 0,
                    rerankerUsed: 'cross_encoder'
                });
            }

            results.sort((a, b) => b.rerankScore - a.rerankScore);
            results.forEach((r, idx) => { r.rank = idx + 1; });
            return results;
        } catch {
            // Safe fallback on exception
            return this.fallbackCosine.rank(query, candidates, queryVector);
        }
    }
}

export class HybridReranker implements Reranker {
    private cosine: CosineReranker = new CosineReranker();
    private cross: CrossEncoderReranker = new CrossEncoderReranker(false);

    public async rank(query: string, candidates: CandidateItem[], queryVector?: number[]): Promise<RankedCandidate[]> {
        const cosineResults = await this.cosine.rank(query, candidates, queryVector);
        const crossResults = await this.cross.rank(query, candidates, queryVector);

        const scoreMap = new Map<string, number>();
        cosineResults.forEach(r => { scoreMap.set(r.id, r.rerankScore * 0.5); });
        crossResults.forEach(r => { 
            scoreMap.set(r.id, (scoreMap.get(r.id) || 0) + r.rerankScore * 0.5); 
        });

        const merged = candidates.map(c => ({
            ...c,
            rerankScore: Math.round((scoreMap.get(c.id) || 0) * 1000) / 1000,
            rank: 0,
            rerankerUsed: 'hybrid' as const
        }));

        merged.sort((a, b) => b.rerankScore - a.rerankScore);
        merged.forEach((r, idx) => { r.rank = idx + 1; });
        return merged;
    }
}
