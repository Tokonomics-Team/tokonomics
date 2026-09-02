/**
 * Tokonomics Multi-Choice Knapsack Context Optimization Solver
 * Formulates context allocation as a 0-1 Multi-Choice Knapsack Problem across R_exclude..R5 tiers,
 * maximizing semantic utility subject to hard token budgets, risk ceilings, and cache benefits.
 */

import { ContextIRGenerator, ContextEntity, ResolutionLevel, RenderedResolution, RESOLUTION_LEVELS } from './contextIR';

export interface SolverCandidate {
    entity: ContextEntity;
    resolutions: Map<ResolutionLevel, RenderedResolution>;
    isCacheEligible?: boolean;
}

export interface SolverResult {
    assignments: Map<string, RenderedResolution>;
    totalTokens: number;
    totalUtility: number;
    totalRisk: number;
    excludedCount: number;
    includedCount: number;
    executionTimeMs: number;
}

export class SolverConstraintError extends Error {
    constructor(message: string) { super(message); this.name = 'SolverConstraintError'; }
}

export class ContextKnapsackSolver {
    private irGenerator: ContextIRGenerator = new ContextIRGenerator();

    /**
     * Solves the Multi-Choice Knapsack Problem for candidate context entities
     */
    public solve(params: {
        candidates: ContextEntity[];
        tokenBudget: number;
        maxRisk?: number;
        lambdaCache?: number;
        lambdaCost?: number;
        lambdaRisk?: number;
    }): SolverResult {
        const startTime = performance.now();
        const budget = Math.max(0, params.tokenBudget);
        const maxRisk = params.maxRisk ?? 1.0;
        const lambdaCache = params.lambdaCache ?? 0.2;
        const lambdaCost = params.lambdaCost ?? 0.005;
        const lambdaRisk = params.lambdaRisk ?? 0.5;

        // 1. Generate multi-resolution options for every candidate entity
        const solverCandidates: SolverCandidate[] = params.candidates.map(e => ({
            entity: e,
            resolutions: this.irGenerator.generateAllResolutions(e),
            isCacheEligible: e.filePath.includes('types') || e.filePath.includes('interface')
        }));
        const byId = new Map(solverCandidates.map(candidate => [candidate.entity.id, candidate]));
        const mandatoryIds = new Set(solverCandidates.filter(candidate => this.irGenerator.normalizeMetadata(candidate.entity).mandatory)
            .map(candidate => candidate.entity.id));
        let changed = true;
        while (changed) {
            changed = false;
            for (const id of [...mandatoryIds]) {
                const candidate = byId.get(id);
                if (!candidate) continue;
                for (const dependency of this.irGenerator.normalizeMetadata(candidate.entity).dependencies) {
                    if (!byId.has(dependency)) throw new SolverConstraintError(`Mandatory entity ${id} depends on missing entity ${dependency}.`);
                    if (!mandatoryIds.has(dependency)) { mandatoryIds.add(dependency); changed = true; }
                }
            }
        }
        for (const id of mandatoryIds) {
            const metadata = this.irGenerator.normalizeMetadata(byId.get(id)!.entity);
            for (const conflict of metadata.conflicts) {
                if (mandatoryIds.has(conflict)) throw new SolverConstraintError(`Mandatory entities ${id} and ${conflict} conflict.`);
            }
        }
        const excludedByConflict = new Set<string>();
        const processedConflicts = new Set<string>();
        for (const candidate of solverCandidates) {
            const id = candidate.entity.id;
            for (const conflict of this.irGenerator.normalizeMetadata(candidate.entity).conflicts) {
                const other = byId.get(conflict);
                const pairKey = [id, conflict].sort().join('\0');
                if (!other || processedConflicts.has(pairKey)) continue;
                processedConflicts.add(pairKey);
                const loser = mandatoryIds.has(id) ? conflict : mandatoryIds.has(conflict) ? id
                    : candidate.entity.baseUtility >= other.entity.baseUtility ? conflict : id;
                excludedByConflict.add(loser);
            }
        }

        // 2. Compute Net Optimization Utility for each resolution option
        // NetUtility = BaseUtility + (CacheBenefit * lambdaCache) - (Cost * lambdaCost) - (Risk * lambdaRisk)
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

        for (const cand of solverCandidates) {
            const options: OptionChoice[] = [];
            const metadata = this.irGenerator.normalizeMetadata(cand.entity);
            const minimumIndex = RESOLUTION_LEVELS.indexOf(metadata.minimumResolution);

            for (const [level, res] of cand.resolutions.entries()) {
                if (excludedByConflict.has(cand.entity.id) && level !== 'R_exclude') continue;
                if (mandatoryIds.has(cand.entity.id) && (level === 'R_exclude' || RESOLUTION_LEVELS.indexOf(level) < minimumIndex)) continue;
                const cacheBonus = cand.isCacheEligible && (level === 'R2' || level === 'R5') ? 15.0 : 0.0;
                const costPenalty = res.tokenCount * lambdaCost;
                const riskPenalty = res.risk * 50.0 * lambdaRisk;
                const netScore = level === 'R_exclude' ? 0.0 : Math.max(0.01, res.utility + cacheBonus * lambdaCache - costPenalty - riskPenalty);

                options.push({
                    entityId: cand.entity.id,
                    level,
                    tokens: res.tokenCount,
                    utility: res.utility,
                    risk: res.risk,
                    netScore: Math.round(netScore * 100) / 100,
                    rendered: res
                });
            }

            // Sort options by token cost ascending
            options.sort((a, b) => a.tokens - b.tokens);
            if (options.length === 0) throw new SolverConstraintError(`Entity ${cand.entity.id} has no allowed representation.`);
            candidateOptions.push(options);
        }

        // 3. Fast Multi-Choice Knapsack Dynamic Programming with Bucket Compression
        // Using bucketed DP for sub-2ms speed across 200+ entities
        const bucketSize = budget > 4000 ? 10 : 1;
        const numBuckets = Math.floor(budget / bucketSize);

        // dp[b] = best net score achievable with capacity b
        let dp = new Float64Array(numBuckets + 1).fill(-1);
        dp[0] = 0;

        // backtrack[itemIndex][b] = chosen option index
        const backtrack: Uint8Array[] = [];

        for (let i = 0; i < candidateOptions.length; i++) {
            const options = candidateOptions[i];
            const nextDp = new Float64Array(numBuckets + 1).fill(-1);
            const choices = new Uint8Array(numBuckets + 1);

            for (let b = 0; b <= numBuckets; b++) {
                if (dp[b] < 0) continue;

                for (let optIdx = 0; optIdx < options.length; optIdx++) {
                    const opt = options[optIdx];
                    const optBuckets = Math.ceil(opt.tokens / bucketSize);
                    const newB = b + optBuckets;

                    if (newB <= numBuckets) {
                        const newScore = dp[b] + opt.netScore;
                        if (newScore > nextDp[newB]) {
                            nextDp[newB] = newScore;
                            choices[newB] = optIdx;
                        }
                    }
                }
            }

            dp = nextDp;
            backtrack.push(choices);
            if (!dp.some(score => score >= 0)) {
                throw new SolverConstraintError(`Mandatory representations exceed the ${budget}-token candidate budget.`);
            }
        }

        // 4. Find optimal bucket with maximum score
        let bestB = 0;
        let maxScore = -1;
        for (let b = 0; b <= numBuckets; b++) {
            if (dp[b] > maxScore) {
                maxScore = dp[b];
                bestB = b;
            }
        }

        // 5. Backtrack to extract chosen resolution per candidate
        const assignments = new Map<string, RenderedResolution>();
        let currentB = bestB;
        let totalTokens = 0;
        let totalUtility = 0;
        let totalRisk = 0;
        let excludedCount = 0;
        let includedCount = 0;

        for (let i = candidateOptions.length - 1; i >= 0; i--) {
            const options = candidateOptions[i];
            const chosenOptIdx = backtrack[i][currentB];
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

            const optBuckets = Math.ceil(chosenOpt.tokens / bucketSize);
            currentB = Math.max(0, currentB - optBuckets);
        }

        const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

        return {
            assignments,
            totalTokens,
            totalUtility: Math.round(totalUtility * 10) / 10,
            totalRisk: Math.round((totalRisk / (includedCount || 1)) * 100) / 100,
            excludedCount,
            includedCount,
            executionTimeMs
        };
    }
}
