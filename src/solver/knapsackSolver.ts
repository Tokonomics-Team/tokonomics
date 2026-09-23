/**
 * Tokonomics Multi-Choice Knapsack Context Optimization Solver
 * Formulates context allocation as a 0-1 Multi-Choice Knapsack Problem across R_exclude..R5 tiers,
 * maximizing semantic utility subject to hard token budgets, risk ceilings, and cache benefits.
 */

import { ContextIRGenerator, ContextEntity, ContextIRMetadata, ResolutionLevel, RenderedResolution, RESOLUTION_LEVELS } from './contextIR';
import { PricingCatalog, PricingCatalogEntry, defaultPricingCatalog } from '../cost/pricingCatalog';
import type { CpuWorkerBoundary } from '../performance/cpuWorkerBoundary';
import type { WorkCancellation } from '../performance/boundedScheduler';

export interface SolverCandidate {
    entity: ContextEntity;
    metadata: ContextIRMetadata;
    resolutions: Map<ResolutionLevel, RenderedResolution>;
    isCacheEligible?: boolean;
}

export type OptimalityGuarantee = 
    | 'token_exact_global_optimum'     // When bucketSize === 1
    | 'quantized_bucket_optimum';      // When bucketSize > 1

export interface SolverOptimalityMetrics {
    guarantee: OptimalityGuarantee;
    bucketSize: number;
    maxDiscretizationErrorTokens: number; // candidateCount * bucketSize
    qualityPreservedScore: number;
}

export interface SolverResult {
    assignments: Map<string, RenderedResolution>;
    totalTokens: number;
    totalUtility: number;
    totalRisk: number;
    excludedCount: number;
    includedCount: number;
    executionTimeMs: number;
    // Phase 3 FinOps Metrics
    projectedCostUSD: number;
    projectedBaselineCostUSD: number;
    netDollarSavingsUSD: number;
    effectiveInputRatePer1M: number;
    effectiveOutputRatePer1M: number;
    pricingModelId: string;
    pricingProvider: string;
    prunedOptionsCount: number;
    totalOptionsCount: number;
    // Constrained Inference Cost & Optimality Metrics
    optimalityGuarantee: OptimalityGuarantee;
    bucketSize: number;
    maxDiscretizationErrorTokens: number;
    qualityPreservedScore: number;
}

export interface KnapsackSolverParams {
    candidates: ContextEntity[];
    tokenBudget: number;
    maxRisk?: number;
    minQualityScore?: number;
    lambdaCache?: number;
    lambdaCost?: number;
    lambdaRisk?: number;
    modelId?: string;
    provider?: string;
    pricingEntry?: PricingCatalogEntry;
    pricingCatalog?: PricingCatalog;
    expectedRegenTokens?: number;
    referenceInputRate?: number;
    referenceOutputRate?: number;
}

export class SolverConstraintError extends Error {
    constructor(message: string) { super(message); this.name = 'SolverConstraintError'; }
}

export class ContextKnapsackSolver {
    private irGenerator: ContextIRGenerator = new ContextIRGenerator();

    /**
     * Prunes strictly dominated resolution options along the convex/Pareto envelope.
     * An option is dominated if another option exists with <= tokens and >= netScore.
     */
    public pruneDominatedOptions(options: {
        entityId: string;
        level: ResolutionLevel;
        tokens: number;
        utility: number;
        risk: number;
        netScore: number;
        rendered: RenderedResolution;
    }[]): typeof options {
        if (options.length <= 1) return options;

        // Sort by ascending tokens; break ties by descending netScore
        options.sort((a, b) => {
            if (a.tokens !== b.tokens) return a.tokens - b.tokens;
            return b.netScore - a.netScore;
        });

        const pruned: typeof options = [];
        let maxScoreSeen = -Infinity;

        for (let j = 0; j < options.length; j++) {
            const opt = options[j];

            // If another option with the exact same token count was already admitted,
            // this one has <= score and is strictly dominated.
            if (pruned.length > 0 && opt.tokens === pruned[pruned.length - 1].tokens) {
                continue;
            }

            // If consuming more tokens yields <= netScore than already achievable,
            // it is Pareto dominated.
            if (opt.netScore <= maxScoreSeen) {
                continue;
            }

            pruned.push(opt);
            maxScoreSeen = opt.netScore;
        }

        return pruned.length > 0 ? pruned : [options[0]];
    }

    /**
     * Solves the Multi-Choice Knapsack Problem for candidate context entities
     * using live FinOps pricing rates and Pareto-optimal state pruning.
     */
    public solve(params: KnapsackSolverParams): SolverResult {
        const startTime = performance.now();
        const budget = Math.max(0, params.tokenBudget);
        const maxRisk = params.maxRisk ?? 1.0;
        const lambdaCache = params.lambdaCache ?? 0.2;
        const lambdaCost = params.lambdaCost ?? 0.005;
        const lambdaRisk = params.lambdaRisk ?? 0.5;

        // 1. Resolve FinOps pricing rates and dynamic sensitivity scaling
        const catalog = params.pricingCatalog ?? defaultPricingCatalog;
        const pricingEntry = params.pricingEntry ?? (
            params.modelId 
                ? catalog.resolve(params.modelId, params.provider)
                : catalog.resolve('generic-llm')
        );

        const inputRate = pricingEntry.rates.inputCostPer1M;
        const outputRate = pricingEntry.rates.outputCostPer1M;
        const cachedInputRate = pricingEntry.rates.cachedInputCostPer1M ?? (inputRate * 0.5);

        const refInputRate = params.referenceInputRate ?? 3.00;
        const refOutputRate = params.referenceOutputRate ?? 15.00;
        const priceFactorInput = Math.max(0.001, inputRate / refInputRate);
        const priceFactorOutput = Math.max(0.001, outputRate / refOutputRate);

        const effectiveLambdaRisk = lambdaRisk * priceFactorOutput;

        // 2. Fast-path check: determine if graph constraint analysis (dependencies, conflicts, mandatory) is needed
        let hasAnyConstraints = false;
        for (let i = 0; i < params.candidates.length; i++) {
            const meta = params.candidates[i].metadata;
            if (meta && (meta.mandatory || (meta.dependencies && meta.dependencies.length > 0) || (meta.conflicts && meta.conflicts.length > 0))) {
                hasAnyConstraints = true;
                break;
            }
        }

        const solverCandidates: SolverCandidate[] = params.candidates.map(e => {
            const metadata = this.irGenerator.normalizeMetadata(e);
            return {
                entity: e,
                metadata,
                resolutions: this.irGenerator.generateAllResolutions(e, metadata),
                isCacheEligible: e.filePath.includes('types') || e.filePath.includes('interface')
            };
        });

        const excludedByConflict = new Set<string>();
        const mandatoryIds = new Set<string>();

        if (hasAnyConstraints) {
            const byId = new Map(solverCandidates.map(candidate => [candidate.entity.id, candidate]));
            for (const c of solverCandidates) {
                if (c.metadata.mandatory) mandatoryIds.add(c.entity.id);
            }
            let changed = true;
            while (changed) {
                changed = false;
                for (const id of [...mandatoryIds]) {
                    const candidate = byId.get(id);
                    if (!candidate) continue;
                    for (const dependency of candidate.metadata.dependencies) {
                        if (!byId.has(dependency)) throw new SolverConstraintError(`Mandatory entity ${id} depends on missing entity ${dependency}.`);
                        if (!mandatoryIds.has(dependency)) { mandatoryIds.add(dependency); changed = true; }
                    }
                }
            }
            for (const id of mandatoryIds) {
                const candidate = byId.get(id);
                if (!candidate) continue;
                for (const conflict of candidate.metadata.conflicts) {
                    if (mandatoryIds.has(conflict)) throw new SolverConstraintError(`Mandatory entities ${id} and ${conflict} conflict.`);
                }
            }
            const processedConflicts = new Set<string>();
            for (const candidate of solverCandidates) {
                const id = candidate.entity.id;
                for (const conflict of candidate.metadata.conflicts) {
                    const other = byId.get(conflict);
                    const pairKey = [id, conflict].sort().join('\0');
                    if (!other || processedConflicts.has(pairKey)) continue;
                    processedConflicts.add(pairKey);
                    const loser = mandatoryIds.has(id) ? conflict : mandatoryIds.has(conflict) ? id
                        : candidate.entity.baseUtility >= other.entity.baseUtility ? conflict : id;
                    excludedByConflict.add(loser);
                }
            }
        }

        // 3. Compute Net Optimization Utility for each resolution option with FinOps rates
        interface OptionChoice {
            entityId: string;
            level: ResolutionLevel;
            tokens: number;
            utility: number;
            risk: number;
            netScore: number;
            rendered: RenderedResolution;
        }

        const candidateOptions: OptionChoice[][] = [];
        let totalOptionsCount = 0;
        let prunedOptionsCount = 0;

        for (const cand of solverCandidates) {
            const rawOptions: OptionChoice[] = [];
            const metadata = cand.metadata;
            const minimumIndex = RESOLUTION_LEVELS.indexOf(metadata.minimumResolution);
            const isExcluded = excludedByConflict.has(cand.entity.id);
            const isMandatory = mandatoryIds.has(cand.entity.id);

            for (const [level, res] of cand.resolutions.entries()) {
                if (isExcluded && level !== 'R_exclude') continue;
                if (isMandatory && (level === 'R_exclude' || RESOLUTION_LEVELS.indexOf(level) < minimumIndex)) continue;

                const isOptionCached = cand.isCacheEligible && (level === 'R2' || level === 'R5');
                const cacheBonus = isOptionCached ? 15.0 : 0.0;
                const optionCostFactor = isOptionCached ? (cachedInputRate / refInputRate) : priceFactorInput;
                const costPenalty = res.tokenCount * lambdaCost * optionCostFactor;
                const riskPenalty = res.risk * 50.0 * effectiveLambdaRisk;
                const netScore = level === 'R_exclude' ? 0.0 : Math.max(0.01, res.utility + cacheBonus * lambdaCache - costPenalty - riskPenalty);

                rawOptions.push({
                    entityId: cand.entity.id,
                    level,
                    tokens: res.tokenCount,
                    utility: res.utility,
                    risk: res.risk,
                    netScore: Math.round(netScore * 100) / 100,
                    rendered: res
                });
            }

            if (rawOptions.length === 0) throw new SolverConstraintError(`Entity ${cand.entity.id} has no allowed representation.`);

            totalOptionsCount += rawOptions.length;
            const pruned = this.pruneDominatedOptions(rawOptions);
            prunedOptionsCount += (rawOptions.length - pruned.length);

            candidateOptions.push(pruned);
        }

        // 4. Fast Multi-Choice Knapsack Dynamic Programming with Flat Memory & Option Hoisting
        const bucketSize = budget > 10000 
            ? Math.max(10, Math.ceil(budget / 250)) 
            : (budget > 4000 ? 10 : 1);
        const numBuckets = Math.floor(budget / bucketSize);
        const stride = numBuckets + 1;

        let dp = new Float64Array(stride).fill(-1);
        let nextDp = new Float64Array(stride).fill(-1);
        dp[0] = 0;

        // Flat backtrack buffer: single allocation for entire DP matrix
        const numCandidates = candidateOptions.length;
        const backtrack = new Uint8Array(numCandidates * stride);
        let maxReachableB = 0;

        // Static scratch buffers for option projections (max 8 levels)
        const optBuckets = new Int32Array(8);
        const optScores = new Float64Array(8);

        for (let i = 0; i < numCandidates; i++) {
            const options = candidateOptions[i];
            const numOpts = options.length;
            for (let o = 0; o < numOpts; o++) {
                optBuckets[o] = Math.ceil(options[o].tokens / bucketSize);
                optScores[o] = options[o].netScore;
            }

            nextDp.fill(-1);
            const backtrackOffset = i * stride;
            let nextMaxReachableB = maxReachableB;
            let hasAnyValid = false;

            for (let b = 0; b <= maxReachableB; b++) {
                const scoreB = dp[b];
                if (scoreB < 0) continue;

                for (let optIdx = 0; optIdx < numOpts; optIdx++) {
                    const newB = b + optBuckets[optIdx];
                    if (newB <= numBuckets) {
                        const newScore = scoreB + optScores[optIdx];
                        if (newScore > nextDp[newB]) {
                            nextDp[newB] = newScore;
                            backtrack[backtrackOffset + newB] = optIdx;
                            if (newB > nextMaxReachableB) {
                                nextMaxReachableB = newB;
                            }
                            hasAnyValid = true;
                        }
                    }
                }
            }

            if (!hasAnyValid) {
                throw new SolverConstraintError(`Mandatory representations exceed the ${budget}-token candidate budget.`);
            }

            maxReachableB = nextMaxReachableB;
            const tmp = dp;
            dp = nextDp;
            nextDp = tmp;
        }

        // 5. Find optimal bucket with maximum score
        let bestB = 0;
        let maxScore = -1;
        for (let b = 0; b <= numBuckets; b++) {
            if (dp[b] > maxScore) {
                maxScore = dp[b];
                bestB = b;
            }
        }

        // 6. Backtrack to extract chosen resolution per candidate
        const assignments = new Map<string, RenderedResolution>();
        let currentB = bestB;
        let totalTokens = 0;
        let totalUtility = 0;
        let totalRisk = 0;
        let excludedCount = 0;
        let includedCount = 0;

        for (let i = numCandidates - 1; i >= 0; i--) {
            const options = candidateOptions[i];
            const chosenOptIdx = backtrack[i * stride + currentB];
            const chosenOpt = options[chosenOptIdx];

            assignments.set(chosenOpt.entityId, chosenOpt.rendered);
            totalTokens += chosenOpt.tokens;
            totalUtility += chosenOpt.utility;
            totalRisk += chosenOpt.risk;

            if (chosenOpt.level === 'R_exclude') {
                excludedCount++;
            } else {
                includedCount++;
            }

            const optBucketsCount = Math.ceil(chosenOpt.tokens / bucketSize);
            currentB = Math.max(0, currentB - optBucketsCount);
        }

        // 7. Compute FinOps Dollar Accounting
        let baselineTokens = 0;
        for (const cand of solverCandidates) {
            const r5 = cand.resolutions.get('R5');
            baselineTokens += r5 ? r5.tokenCount : (cand.resolutions.get('R3')?.tokenCount ?? 0);
        }

        let totalCachedTokens = 0;
        for (const [id, res] of assignments.entries()) {
            const cand = solverCandidates.find(c => c.entity.id === id);
            if (cand?.isCacheEligible && (res.level === 'R2' || res.level === 'R5')) {
                totalCachedTokens += res.tokenCount;
            }
        }
        const nonCachedTokens = Math.max(0, totalTokens - totalCachedTokens);

        const projectedBaselineCostUSD = Number(((baselineTokens / 1_000_000) * inputRate).toFixed(6));
        const projectedCostUSD = Number((
            (nonCachedTokens / 1_000_000) * inputRate +
            (totalCachedTokens / 1_000_000) * cachedInputRate
        ).toFixed(6));
        const netDollarSavingsUSD = Number(Math.max(0, projectedBaselineCostUSD - projectedCostUSD).toFixed(6));

        const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

        // 8. Quality Preservation & Mathematical Optimality Bounds
        let baselineUtility = 0;
        for (const cand of solverCandidates) {
            const r5Util = cand.resolutions.get('R5')?.utility ?? cand.resolutions.get('R3')?.utility ?? 100.0;
            baselineUtility += r5Util;
        }
        const qualityPreservedScore = baselineUtility > 0
            ? Number(Math.min(1.0, totalUtility / baselineUtility).toFixed(4))
            : 1.0;

        if (params.minQualityScore !== undefined && qualityPreservedScore < params.minQualityScore) {
            throw new SolverConstraintError(
                `Quality preservation constraint violated: achieved ${qualityPreservedScore} < required ${params.minQualityScore}`
            );
        }

        const optimalityGuarantee: OptimalityGuarantee = bucketSize === 1
            ? 'token_exact_global_optimum'
            : 'quantized_bucket_optimum';
        const maxDiscretizationErrorTokens = numCandidates * bucketSize;

        return {
            assignments,
            totalTokens,
            totalUtility: Math.round(totalUtility * 10) / 10,
            totalRisk: Math.round((totalRisk / (includedCount || 1)) * 100) / 100,
            excludedCount,
            includedCount,
            executionTimeMs,
            projectedCostUSD,
            projectedBaselineCostUSD,
            netDollarSavingsUSD,
            effectiveInputRatePer1M: inputRate,
            effectiveOutputRatePer1M: outputRate,
            pricingModelId: pricingEntry.modelId,
            pricingProvider: pricingEntry.provider,
            prunedOptionsCount,
            totalOptionsCount,
            optimalityGuarantee,
            bucketSize,
            maxDiscretizationErrorTokens,
            qualityPreservedScore
        };
    }

    /**
     * Solves the Multi-Choice Knapsack Problem asynchronously by offloading
     * to a background Worker thread via CpuWorkerBoundary when available.
     * Automatically falls back to in-process synchronous solve if worker boundary is omitted or fails.
     */
    public async solveAsync(
        params: KnapsackSolverParams,
        workerBoundary?: CpuWorkerBoundary,
        cancellation?: WorkCancellation
    ): Promise<SolverResult> {
        if (workerBoundary) {
            try {
                return await workerBoundary.solveKnapsack(params, cancellation);
            } catch (err) {
                if (err instanceof SolverConstraintError || (err && (err as any).name === 'SolverConstraintError')) {
                    throw err;
                }
                // Worker failure or environment restriction -> graceful fallback to synchronous solver
            }
        }
        return this.solve(params);
    }
}
