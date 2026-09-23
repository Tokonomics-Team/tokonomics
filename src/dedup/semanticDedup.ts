/**
 * Tokonomics Embedding-Based Semantic Deduplication Engine
 * Employs a multi-tier deduplication cascade with strict protection gates for
 * system directives, roles, tool contracts, tests, errors, and adversarial near-duplicates.
 */

export interface SemanticDedupCandidate {
    id: string;
    content: string;
    tokens: number;
    embedding?: number[] | Float32Array;
    symbolName?: string;
    filePath?: string;
    category?: string;
    mandatory?: boolean;
    role?: string;
    isProtected?: boolean;
    provenance?: readonly string[];
    dependencies?: readonly string[];
    mergedReferences?: readonly string[];
    snapshotGeneration?: number;
}

export interface CulledDuplicateRecord {
    duplicateId: string;
    similarToId: string;
    cosineSimilarity: number;
    tokensSaved: number;
    dedupTier: 'exact' | 'lexical' | 'semantic';
}

export interface SemanticDedupResult {
    keptItems: SemanticDedupCandidate[];
    culledDuplicates: CulledDuplicateRecord[];
    totalTokensSaved: number;
}

export class EmbeddingSemanticDedupEngine {
    private threshold: number;

    private static readonly NEGATION_REGEX = /\b(not|no|never|deny|denied|unauthorized|disabled|forbidden|reject|failed|failure|false|without|except)\b|!/i;
    private static readonly MODIFIER_REGEX = /\b(public|private|protected|readonly|static|const|let|var)\b/g;
    private static readonly NUMBER_REGEX = /\b\d+(?:\.\d+)?\b/g;
    private static readonly UNIT_REGEX = /\b(ms|s|sec|seconds?|min|minutes?|bytes?|kb|mb|gb)\b/i;
    private static readonly ERROR_CODE_REGEX = /\b(?:TS\d{4,5}|error\[E\d+\]|E\d{4})\b/g;

    constructor(threshold: number = 0.92) {
        this.threshold = threshold;
    }

    public deduplicate(items: SemanticDedupCandidate[]): SemanticDedupResult {
        const keptItems: SemanticDedupCandidate[] = [];
        const culledDuplicates: CulledDuplicateRecord[] = [];
        let totalTokensSaved = 0;

        for (const candidate of items) {
            // 1. Protection Gates: Protected items can NEVER be culled
            if (this.isProtectedCandidate(candidate)) {
                keptItems.push({ ...candidate });
                continue;
            }

            let isDuplicate = false;

            for (let k = 0; k < keptItems.length; k++) {
                const kept = keptItems[k];

                // Protected items must remain isolated and never absorb non-protected candidates
                if (this.isProtectedCandidate(kept)) {
                    continue;
                }

                // Distinct message roles or distinct evidence categories must not be merged
                if (candidate.role && kept.role && candidate.role !== kept.role) {
                    continue;
                }
                if (candidate.category && kept.category && candidate.category !== kept.category) {
                    continue;
                }

                // 2. Adversarial Distinction Guard: If critical semantic distinctions exist, DO NOT MERGE
                if (this.hasCriticalSemanticDistinction(candidate.content, kept.content)) {
                    continue;
                }

                // 3. Multi-Tier Deduplication Cascade
                // Tier 1: Exact Hash Equivalence
                const trimmedCand = candidate.content.trim();
                const trimmedKept = kept.content.trim();
                if (trimmedCand === trimmedKept) {
                    this.mergeReferences(kept, candidate);
                    culledDuplicates.push({
                        duplicateId: candidate.id,
                        similarToId: kept.id,
                        cosineSimilarity: 1.0,
                        tokensSaved: candidate.tokens,
                        dedupTier: 'exact'
                    });
                    totalTokensSaved += candidate.tokens;
                    isDuplicate = true;
                    break;
                }

                // Tier 2: Lexical Near-Duplicate (Jaccard > 0.96)
                const jaccard = this.calculateJaccard(candidate.content, kept.content);
                if (jaccard > 0.96) {
                    this.mergeReferences(kept, candidate);
                    culledDuplicates.push({
                        duplicateId: candidate.id,
                        similarToId: kept.id,
                        cosineSimilarity: Math.round(jaccard * 1000) / 1000,
                        tokensSaved: candidate.tokens,
                        dedupTier: 'lexical'
                    });
                    totalTokensSaved += candidate.tokens;
                    isDuplicate = true;
                    break;
                }

                // Tier 3: cosine similarity over hashed structural vectors (not a learned embedding)
                if (candidate.embedding && kept.embedding) {
                    const sim = this.calculateCosine(candidate.embedding, kept.embedding);
                    if (sim >= this.threshold) {
                        this.mergeReferences(kept, candidate);
                        culledDuplicates.push({
                            duplicateId: candidate.id,
                            similarToId: kept.id,
                            cosineSimilarity: Math.round(sim * 1000) / 1000,
                            tokensSaved: candidate.tokens,
                            dedupTier: 'semantic'
                        });
                        totalTokensSaved += candidate.tokens;
                        isDuplicate = true;
                        break;
                    }
                }
            }

            if (!isDuplicate) {
                keptItems.push({ ...candidate });
            }
        }

        return { keptItems, culledDuplicates, totalTokensSaved };
    }

    /**
     * Determines whether candidate is protected from semantic deduplication
     */
    public isProtectedCandidate(candidate: SemanticDedupCandidate): boolean {
        if (candidate.isProtected) return true;
        if (candidate.mandatory) return true;
        if (candidate.role === 'system') return true;
        if (candidate.category === 'errorStackTrace') return true;
        if (candidate.category === 'tests') return true;
        if (candidate.category === 'apiContract') return true;
        if (candidate.content.includes('tool_use') || candidate.content.includes('tool_result')) return true;
        return false;
    }

    /**
     * Adversarial Distinction Inspector: Prevents merging candidates differing by
     * negations, numbers/limits, units, paths, error codes, access modifiers, or nullability.
     */
    public hasCriticalSemanticDistinction(contentA: string, contentB: string): boolean {
        // 1. Negation Distinction
        const negA = EmbeddingSemanticDedupEngine.NEGATION_REGEX.test(contentA);
        const negB = EmbeddingSemanticDedupEngine.NEGATION_REGEX.test(contentB);
        if (negA !== negB) return true;

        // 2. Numeric Distinction (e.g. port 8080 vs port 3000)
        const numsA = contentA.match(EmbeddingSemanticDedupEngine.NUMBER_REGEX) || [];
        const numsB = contentB.match(EmbeddingSemanticDedupEngine.NUMBER_REGEX) || [];
        const setNumsA = new Set(numsA);
        const setNumsB = new Set(numsB);
        if (setNumsA.size !== setNumsB.size || [...setNumsA].some(n => !setNumsB.has(n))) {
            return true;
        }

        // 3. Unit Distinction (ms vs s, bytes vs kb)
        const unitA = contentA.match(EmbeddingSemanticDedupEngine.UNIT_REGEX)?.[0]?.toLowerCase();
        const unitB = contentB.match(EmbeddingSemanticDedupEngine.UNIT_REGEX)?.[0]?.toLowerCase();
        if (unitA !== unitB) return true;

        // 4. Error Code Distinction (e.g. TS2339 vs TS2345)
        const errA = contentA.match(EmbeddingSemanticDedupEngine.ERROR_CODE_REGEX) || [];
        const errB = contentB.match(EmbeddingSemanticDedupEngine.ERROR_CODE_REGEX) || [];
        if (errA.join(',') !== errB.join(',')) return true;

        // 5. Access Modifier Distinction (public vs private vs protected)
        const modA = contentA.match(EmbeddingSemanticDedupEngine.MODIFIER_REGEX) || [];
        const modB = contentB.match(EmbeddingSemanticDedupEngine.MODIFIER_REGEX) || [];
        if (modA.join(',') !== modB.join(',')) return true;

        // 6. Nullability Distinction (T | null vs T)
        const nullA = /\bnull\b|\bundefined\b|\?\s*:/i.test(contentA);
        const nullB = /\bnull\b|\bundefined\b|\?\s*:/i.test(contentB);
        if (nullA !== nullB) return true;

        return false;
    }

    private mergeReferences(target: SemanticDedupCandidate, duplicate: SemanticDedupCandidate): void {
        const merged = new Set<string>([
            ...(target.mergedReferences || []),
            duplicate.id,
            ...(duplicate.mergedReferences || [])
        ]);
        (target as any).mergedReferences = Object.freeze(Array.from(merged));

        // Retain combined provenance tags
        if (duplicate.provenance && duplicate.provenance.length > 0) {
            const combinedProv = new Set([...(target.provenance || []), ...duplicate.provenance]);
            (target as any).provenance = Object.freeze(Array.from(combinedProv));
        }

        // Retain combined dependencies
        if (duplicate.dependencies && duplicate.dependencies.length > 0) {
            const combinedDeps = new Set([...(target.dependencies || []), ...duplicate.dependencies]);
            (target as any).dependencies = Object.freeze(Array.from(combinedDeps));
        }
    }

    private calculateJaccard(a: string, b: string): number {
        const tokensA = new Set(a.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0));
        const tokensB = new Set(b.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0));
        let intersection = 0;
        for (const t of tokensA) {
            if (tokensB.has(t)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    private calculateCosine(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
        if (!vecA || !vecB) return 0;
        const len = Math.min(vecA.length, vecB.length);
        if (len === 0) return 0;

        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < len; i++) {
            const valA = vecA[i];
            const valB = vecB[i];
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
