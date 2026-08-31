/**
 * Tokonomics MMR (Maximal Marginal Relevance) Diversity Ranker
 * Balances relevance against redundancy to prevent duplicate code variants from crowding context.
 */

import { RankedCandidate } from './reranker';

export class MmrDiversityRanker {
    /**
     * Re-orders candidates using MMR
     * MMR = argmax [ lambda * Sim1(d, Q) - (1 - lambda) * max Sim2(d, dj) ]
     */
    public rankDiversity(
        candidates: RankedCandidate[],
        topK: number = 10,
        lambda: number = 0.7
    ): RankedCandidate[] {
        if (candidates.length <= 1) {
            return candidates;
        }

        const selected: RankedCandidate[] = [];
        const remaining = [...candidates];

        // Pick highest relevance item first
        const first = remaining.shift()!;
        selected.push(first);

        while (selected.length < topK && remaining.length > 0) {
            let bestIdx = -1;
            let bestMmrScore = -Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const relevance = candidate.rerankScore;

                // Compute maximum similarity to already selected items
                let maxSimToSelected = 0;
                for (const s of selected) {
                    const sim = this.computeInterDocumentSimilarity(candidate, s);
                    if (sim > maxSimToSelected) {
                        maxSimToSelected = sim;
                    }
                }

                // MMR formula
                const mmrScore = lambda * relevance - (1 - lambda) * maxSimToSelected;

                if (mmrScore > bestMmrScore) {
                    bestMmrScore = mmrScore;
                    bestIdx = i;
                }
            }

            if (bestIdx >= 0) {
                selected.push(remaining.splice(bestIdx, 1)[0]);
            } else {
                break;
            }
        }

        selected.forEach((item, idx) => {
            item.rank = idx + 1;
        });

        return selected;
    }

    private computeInterDocumentSimilarity(a: RankedCandidate, b: RankedCandidate): number {
        // 1. Vector cosine similarity if embeddings present
        if (a.embedding && b.embedding) {
            let dot = 0, normA = 0, normB = 0;
            const len = Math.min(a.embedding.length, b.embedding.length);
            for (let i = 0; i < len; i++) {
                dot += a.embedding[i] * b.embedding[i];
                normA += a.embedding[i] * a.embedding[i];
                normB += b.embedding[i] * b.embedding[i];
            }
            return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
        }

        // 2. Token Jaccard similarity fallback
        const tokensA = new Set(a.content.toLowerCase().split(/\s+/));
        const tokensB = new Set(b.content.toLowerCase().split(/\s+/));
        let intersection = 0;
        for (const t of tokensA) {
            if (tokensB.has(t)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }
}
