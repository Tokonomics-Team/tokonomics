/**
 * Tokonomics Embedding-Based Semantic Deduplication Engine
 * Uses dense vector embeddings and cosine similarity to identify and cull
 * semantically identical or redundant code and documentation blocks.
 */

export interface SemanticDedupCandidate {
    id: string;
    content: string;
    tokens: number;
    embedding: number[];
}

export interface SemanticDedupResult {
    keptItems: SemanticDedupCandidate[];
    culledDuplicates: { duplicateId: string; similarToId: string; cosineSimilarity: number; tokensSaved: number }[];
    totalTokensSaved: number;
}

export class EmbeddingSemanticDedupEngine {
    private threshold: number;

    constructor(threshold: number = 0.92) {
        this.threshold = threshold;
    }

    public deduplicate(items: SemanticDedupCandidate[]): SemanticDedupResult {
        const keptItems: SemanticDedupCandidate[] = [];
        const culledDuplicates: { duplicateId: string; similarToId: string; cosineSimilarity: number; tokensSaved: number }[] = [];
        let totalTokensSaved = 0;

        for (const candidate of items) {
            let isDuplicate = false;

            for (const kept of keptItems) {
                const sim = this.calculateCosine(candidate.embedding, kept.embedding);
                if (sim >= this.threshold) {
                    culledDuplicates.push({
                        duplicateId: candidate.id,
                        similarToId: kept.id,
                        cosineSimilarity: Math.round(sim * 1000) / 1000,
                        tokensSaved: candidate.tokens
                    });
                    totalTokensSaved += candidate.tokens;
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                keptItems.push(candidate);
            }
        }

        return { keptItems, culledDuplicates, totalTokensSaved };
    }

    private calculateCosine(vecA: number[], vecB: number[]): number {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
    }
}
