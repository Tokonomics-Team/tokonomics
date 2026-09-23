/**
 * Tokonomics MMR (Maximal Marginal Relevance) Diversity Ranker
 * Balances relevance against redundancy to prevent duplicate code variants from crowding context.
 * Features stable tie-breaking and file/category minimum representation guarantees.
 */

import { RankedCandidate } from './reranker';

export class MmrDiversityRanker {
    /**
     * Re-orders candidates using Maximal Marginal Relevance (MMR)
     * MMR = argmax [ lambda * Sim1(d, Q) - (1 - lambda) * max Sim2(d, dj) ]
     * with stable tie-breaking and minimum representation constraints.
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

        // Track represented files and categories for minimum representation guarantee
        const representedFiles = new Set<string>();
        const representedCategories = new Set<string>();

        // Pick highest relevance item first (preferring mandatory items)
        let firstIdx = 0;
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].mandatory && !remaining[firstIdx].mandatory) {
                firstIdx = i;
                break;
            }
        }
        const first = remaining.splice(firstIdx, 1)[0];
        selected.push(first);
        if (first.filePath) representedFiles.add(first.filePath);
        if (first.category) representedCategories.add(first.category);

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

                // Standard MMR Score
                let mmrScore = lambda * relevance - (1 - lambda) * maxSimToSelected;

                // Minimum Representation Boost: Prioritize unrepresented files or evidence categories
                const isNewFile = candidate.filePath && !representedFiles.has(candidate.filePath);
                const isNewCategory = candidate.category && !representedCategories.has(candidate.category);
                if (isNewFile || isNewCategory) {
                    mmrScore += 0.08;
                }

                // Mandatory candidate preservation boost
                if (candidate.mandatory) {
                    mmrScore += 0.20;
                }

                if (mmrScore > bestMmrScore) {
                    bestMmrScore = mmrScore;
                    bestIdx = i;
                } else if (Math.abs(mmrScore - bestMmrScore) < 1e-5 && bestIdx >= 0) {
                    // Stable Tie-Breaking:
                    // 1. Mandatory candidate preferred
                    // 2. Higher sourceScore
                    // 3. Deterministic lexical ID comparison
                    const currentBest = remaining[bestIdx];
                    if (candidate.mandatory !== currentBest.mandatory) {
                        if (candidate.mandatory) bestIdx = i;
                    } else {
                        const scoreA = candidate.sourceScore || candidate.initialScore || 0;
                        const scoreB = currentBest.sourceScore || currentBest.initialScore || 0;
                        if (scoreA !== scoreB) {
                            if (scoreA > scoreB) bestIdx = i;
                        } else if (candidate.id.localeCompare(currentBest.id) < 0) {
                            bestIdx = i;
                        }
                    }
                }
            }

            if (bestIdx >= 0) {
                const chosen = remaining.splice(bestIdx, 1)[0];
                selected.push(chosen);
                if (chosen.filePath) representedFiles.add(chosen.filePath);
                if (chosen.category) representedCategories.add(chosen.category);
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
        // 1. Vector cosine similarity if embeddings present (supporting Float32Array and number[])
        if (a.embedding && b.embedding) {
            let dot = 0, normA = 0, normB = 0;
            const len = Math.min(a.embedding.length, b.embedding.length);
            for (let i = 0; i < len; i++) {
                const valA = a.embedding[i];
                const valB = b.embedding[i];
                if (!Number.isFinite(valA) || !Number.isFinite(valB)) continue;
                dot += valA * valB;
                normA += valA * valA;
                normB += valB * valB;
            }
            if (normA <= 1e-8 || normB <= 1e-8) return 0;
            const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
            return Number.isFinite(sim) ? Math.max(-1.0, Math.min(1.0, sim)) : 0;
        }

        // 2. Token Jaccard similarity fallback
        const tokensA = new Set(a.content.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0));
        const tokensB = new Set(b.content.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0));
        let intersection = 0;
        for (const t of tokensA) {
            if (tokensB.has(t)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }
}
