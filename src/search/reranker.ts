/**
 * Tokonomics Reranking Engine
 *
 * Two stages: cosine similarity over hashed structural vectors, then optional lexical interaction
 * reranking, then hybrid scoring.
 *
 * A note on naming, because the type names here invite a wrong reading. "Cross-encoder" in the
 * literature means a learned transformer that jointly encodes a query and a candidate. Nothing of
 * the sort ships in this extension. What is called a cross-encoder below is a deterministic lexical
 * interaction scorer: exact symbol alignment, term-frequency-weighted co-occurrence, bigram matching
 * and negation detection. It is useful and it is not a learned model, and the runtime metadata says
 * so via `scoringMode: 'lexical_interaction'`.
 *
 * The identifiers are retained because they appear in persisted configuration and receipt data;
 * renaming them would break stored state to fix a comment. The descriptions are what a reader sees,
 * so the descriptions are what were corrected.
 */

import { CancellationToken } from './embeddingProvider';

export interface CandidateItem {
    id: string;
    filePath: string;
    symbolName: string;
    content: string;
    tokens?: number;
    role?: string;
    embedding?: number[] | Float32Array;
    initialScore?: number;
    category?: string;
    sourceKind?: string;
    contentHash?: string;
    dependencies?: readonly string[];
    provenance?: readonly string[];
    mandatory?: boolean;
    sourceScore?: number;
    fusedScore?: number;
    diversityScore?: number;
    isProtected?: boolean;
    mergedReferences?: readonly string[];
    updatedAt?: number;
    lineStart?: number;
    lineEnd?: number;
}

export interface RankedCandidate extends CandidateItem {
    rerankScore: number;
    rank: number;
    rerankerUsed: 'cosine' | 'cross_encoder' | 'hybrid';
}

export interface Reranker {
    rank(query: string, candidates: CandidateItem[], queryVector?: number[] | Float32Array): Promise<RankedCandidate[]>;
}

export interface CrossEncoderMetadata {
    readonly providerId: string;
    readonly modelName: string;
    readonly version: string;
    readonly isLocal: boolean;
    readonly maxBatchSize: number;
    readonly timeoutMs: number;
    readonly scoringMode: 'lexical_interaction' | 'learned_cross_encoder';
}

export interface CrossEncoderScoreResult {
    readonly candidateId: string;
    readonly crossScore: number;
}

export interface CrossEncoderProvider {
    readonly metadata: CrossEncoderMetadata;
    scorePairs(
        query: string,
        candidates: readonly { id: string; content: string; symbolName?: string }[],
        cancellationToken?: CancellationToken
    ): Promise<CrossEncoderScoreResult[]>;
}

/**
 * Deterministic lexical interaction reranker. Fully offline; no learned model.
 *
 * Scores a query against a candidate using exact symbol alignment, token co-occurrence weighted by
 * term frequency, bigram matching and negation detection. The class name says cross-encoder for
 * compatibility with persisted identifiers; the algorithm is lexical and deterministic, and claiming
 * otherwise would overstate what the extension contains.
 */
export class DeterministicLocalCrossEncoder implements CrossEncoderProvider {
    public readonly metadata: CrossEncoderMetadata;

    private static readonly NEGATION_TOKENS = new Set([
        'not', 'no', 'never', 'deny', 'denied', 'unauthorized', 'disabled', 'forbidden',
        'reject', 'rejected', 'failed', 'failure', 'false', 'without', 'except'
    ]);

    constructor(options?: { timeoutMs?: number; maxBatchSize?: number; version?: string }) {
        this.metadata = Object.freeze({
            providerId: 'tokonomics_deterministic_local_cross_encoder',
            modelName: 'tokonomics-cross-interaction-v1',
            version: options?.version ?? '1.0.0',
            isLocal: true,
            maxBatchSize: options?.maxBatchSize ?? 32,
            timeoutMs: options?.timeoutMs ?? 30
            ,scoringMode: 'lexical_interaction'
        });
    }

    public async scorePairs(
        query: string,
        candidates: readonly { id: string; content: string; symbolName?: string }[],
        cancellationToken?: CancellationToken
    ): Promise<CrossEncoderScoreResult[]> {
        const startTime = Date.now();
        const results: CrossEncoderScoreResult[] = [];

        if (!query || candidates.length === 0) {
            return candidates.map(c => ({ candidateId: c.id, crossScore: 0.5 }));
        }

        const queryNormalized = query.toLowerCase();
        const queryTokens = queryNormalized.split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0);
        const queryTokenSet = new Set(queryTokens);
        const queryHasNegation = queryTokens.some(t => DeterministicLocalCrossEncoder.NEGATION_TOKENS.has(t));

        // Generate query bigrams
        const queryBigrams = new Set<string>();
        for (let i = 0; i < queryTokens.length - 1; i++) {
            queryBigrams.add(`${queryTokens[i]} ${queryTokens[i + 1]}`);
        }

        // Process in bounded batches
        const batchSize = this.metadata.maxBatchSize;
        for (let b = 0; b < candidates.length; b += batchSize) {
            if (cancellationToken?.isCancellationRequested) {
                throw new Error('Cross-encoder scoring cancelled by caller');
            }
            if (Date.now() - startTime > this.metadata.timeoutMs) {
                // Timeout reached: fill remaining with baseline neutral score
                for (let rem = b; rem < candidates.length; rem++) {
                    results.push({ candidateId: candidates[rem].id, crossScore: 0.5 });
                }
                break;
            }

            const slice = candidates.slice(b, b + batchSize);
            for (const cand of slice) {
                const contentNorm = cand.content.toLowerCase();
                const contentTokens = contentNorm.split(/[^a-zA-Z0-9_]+/).filter(t => t.length > 0);
                const contentTokenSet = new Set(contentTokens);

                // 1. Term Overlap with Length Normalization
                let termMatches = 0;
                for (const t of queryTokens) {
                    if (contentTokenSet.has(t)) {
                        termMatches++;
                    }
                }
                const termScore = queryTokens.length > 0 ? termMatches / queryTokens.length : 0;

                // 2. Exact Symbol Name Match
                let symbolScore = 0;
                if (cand.symbolName) {
                    const symNorm = cand.symbolName.toLowerCase();
                    if (queryNormalized.includes(symNorm)) {
                        symbolScore = 0.35;
                    } else if (queryTokenSet.has(symNorm)) {
                        symbolScore = 0.30;
                    }
                }

                // 3. Bigram Phrase Alignment
                let bigramMatches = 0;
                for (let i = 0; i < contentTokens.length - 1; i++) {
                    const bg = `${contentTokens[i]} ${contentTokens[i + 1]}`;
                    if (queryBigrams.has(bg)) {
                        bigramMatches++;
                    }
                }
                const bigramScore = queryBigrams.size > 0 ? Math.min(0.25, (bigramMatches / queryBigrams.size) * 0.25) : 0;

                // 4. Negation & Polarity Congruence
                const candHasNegation = contentTokens.some(t => DeterministicLocalCrossEncoder.NEGATION_TOKENS.has(t));
                let polarityPenalty = 0;
                if (queryHasNegation !== candHasNegation && queryHasNegation) {
                    polarityPenalty = 0.15; // Query explicitly searches for negation, but doc has none
                }

                // Combined Raw Cross Score
                const rawScore = 0.45 * termScore + symbolScore + bigramScore - polarityPenalty;
                const normalizedScore = Math.max(0.01, Math.min(0.99, rawScore));

                results.push({
                    candidateId: cand.id,
                    crossScore: Math.round(normalizedScore * 1000) / 1000
                });
            }
        }

        return results;
    }
}

export class CosineReranker implements Reranker {
    public async rank(
        query: string,
        candidates: CandidateItem[],
        queryVector?: number[] | Float32Array
    ): Promise<RankedCandidate[]> {
        const results: RankedCandidate[] = [];

        for (const cand of candidates) {
            let sim = cand.initialScore || cand.sourceScore || cand.fusedScore || 0;
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

        results.sort((a, b) => b.rerankScore - a.rerankScore || a.id.localeCompare(b.id));
        results.forEach((r, idx) => { r.rank = idx + 1; });
        return results;
    }

    private cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const valA = a[i];
            const valB = b[i];
            if (!Number.isFinite(valA) || !Number.isFinite(valB)) continue;
            dot += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        }
        return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    }
}

export class CrossEncoderReranker implements Reranker {
    private fallbackCosine: CosineReranker = new CosineReranker();
    private provider: CrossEncoderProvider;
    private maxRerankTopK: number;
    private enabled: boolean;

    constructor(
        crossEncoderModelAvailable: boolean = true,
        provider?: CrossEncoderProvider,
        maxRerankTopK: number = 20
    ) {
        this.enabled = crossEncoderModelAvailable;
        this.provider = provider || new DeterministicLocalCrossEncoder();
        this.maxRerankTopK = maxRerankTopK;
    }

    public async rank(
        query: string,
        candidates: CandidateItem[],
        queryVector?: number[] | Float32Array,
        cancellationToken?: CancellationToken
    ): Promise<RankedCandidate[]> {
        if (candidates.length === 0) return [];

        // 1. Initial Cosine / Lexical baseline
        const baselineRanked = await this.fallbackCosine.rank(query, candidates, queryVector);

        // If provider unavailable or disabled, return baseline directly
        if (!this.enabled || !this.provider || candidates.length === 0) {
            return baselineRanked;
        }

        try {
            // 2. Bounded Reranking: Apply only to capped top-K candidates
            const topCandidates = baselineRanked.slice(0, this.maxRerankTopK);
            const remainingCandidates = baselineRanked.slice(this.maxRerankTopK);

            const scoreResults = await this.provider.scorePairs(
                query,
                topCandidates.map(c => ({ id: c.id, content: c.content, symbolName: c.symbolName })),
                cancellationToken
            );

            if (scoreResults.length === 0) {
                return baselineRanked;
            }

            const scoreMap = new Map<string, number>();
            for (const s of scoreResults) {
                scoreMap.set(s.candidateId, s.crossScore);
            }

            const rerankedTop: RankedCandidate[] = topCandidates.map(cand => {
                const crossScore = scoreMap.get(cand.id);
                const initial = cand.initialScore || cand.sourceScore || cand.fusedScore || 0.5;
                // Blended score: 60% lexical interaction, 40% initial evidence score.
                const finalScore = crossScore !== undefined
                    ? Math.round((0.6 * crossScore + 0.4 * initial) * 1000) / 1000
                    : cand.rerankScore;

                return {
                    ...cand,
                    rerankScore: finalScore,
                    rank: 0,
                    rerankerUsed: 'cross_encoder' as const
                };
            });

            // Sort reranked top-K
            rerankedTop.sort((a, b) => b.rerankScore - a.rerankScore || a.id.localeCompare(b.id));

            const combined = [...rerankedTop, ...remainingCandidates];
            combined.forEach((item, idx) => {
                item.rank = idx + 1;
            });

            return combined;
        } catch {
            // Fail-closed complete fallback to baseline cosine/lexical ranking
            return baselineRanked;
        }
    }
}

export class HybridReranker implements Reranker {
    private cosine: CosineReranker = new CosineReranker();
    private cross: CrossEncoderReranker;

    constructor(crossProvider?: CrossEncoderProvider) {
        this.cross = new CrossEncoderReranker(true, crossProvider);
    }

    public async rank(
        query: string,
        candidates: CandidateItem[],
        queryVector?: number[] | Float32Array
    ): Promise<RankedCandidate[]> {
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

        merged.sort((a, b) => b.rerankScore - a.rerankScore || a.id.localeCompare(b.id));
        merged.forEach((r, idx) => { r.rank = idx + 1; });
        return merged;
    }
}
