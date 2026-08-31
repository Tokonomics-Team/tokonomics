/**
 * Tokonomics Lexical Near-Duplicate Deduplication Engine
 * Uses n-gram character/word shingling and Jaccard similarity to identify
 * near-duplicate boilerplate and conversational turns.
 */

export interface LexicalDedupCandidate {
    id: string;
    content: string;
    tokens: number;
}

export interface LexicalDedupResult {
    keptItems: LexicalDedupCandidate[];
    culledDuplicates: { duplicateId: string; similarToId: string; jaccardSimilarity: number; tokensSaved: number }[];
    totalTokensSaved: number;
}

export class LexicalNearDedupEngine {
    private threshold: number;

    constructor(threshold: number = 0.85) {
        this.threshold = threshold;
    }

    public deduplicate(items: LexicalDedupCandidate[]): LexicalDedupResult {
        const keptItems: LexicalDedupCandidate[] = [];
        const culledDuplicates: { duplicateId: string; similarToId: string; jaccardSimilarity: number; tokensSaved: number }[] = [];
        let totalTokensSaved = 0;

        for (const candidate of items) {
            let isDuplicate = false;

            for (const kept of keptItems) {
                const sim = this.calculateJaccard(candidate.content, kept.content);
                if (sim >= this.threshold) {
                    culledDuplicates.push({
                        duplicateId: candidate.id,
                        similarToId: kept.id,
                        jaccardSimilarity: Math.round(sim * 100) / 100,
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

    private calculateJaccard(textA: string, textB: string): number {
        const shinglesA = this.getShingles(textA);
        const shinglesB = this.getShingles(textB);

        if (shinglesA.size === 0 || shinglesB.size === 0) return 0;

        let intersection = 0;
        for (const s of shinglesA) {
            if (shinglesB.has(s)) intersection++;
        }

        const union = shinglesA.size + shinglesB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    private getShingles(text: string, k: number = 3): Set<string> {
        const words = text.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ' ').trim().split(/\s+/);
        const shingles = new Set<string>();
        for (let i = 0; i <= words.length - k; i++) {
            shingles.add(words.slice(i, i + k).join(' '));
        }
        return shingles.size > 0 ? shingles : new Set(words);
    }
}
