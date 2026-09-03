import { ExperimentEvidence, ExperimentPromotionDecision } from './experimentTypes';

export interface PromotionRequirements {
    readonly minimumSampleSize: number;
    readonly minimumSuccessUplift: number;
    readonly maximumPValue: number;
    readonly maximumLatencyRegressionRatio: number;
    readonly successNonInferiorityMargin: number;
    readonly minimumRelativeCostImprovement: number;
    readonly productionReachable: boolean;
    readonly fallbackVerified: boolean;
    readonly independentlyDisableable: boolean;
    readonly privacyConsentVerified: boolean;
    readonly resourceBudgetVerified: boolean;
}

const DEFAULT_REQUIREMENTS: PromotionRequirements = Object.freeze({
    minimumSampleSize: 30,
    minimumSuccessUplift: 0.02,
    maximumPValue: 0.05,
    maximumLatencyRegressionRatio: 1.10,
    successNonInferiorityMargin: 0.02,
    minimumRelativeCostImprovement: 0.05,
    productionReachable: false,
    fallbackVerified: false,
    independentlyDisableable: false,
    privacyConsentVerified: false,
    resourceBudgetVerified: false
});

export class ExperimentPromotionEvaluator {
    public static evaluate(evidence: ExperimentEvidence, input: Partial<PromotionRequirements> = {}): ExperimentPromotionDecision {
        const requirements = { ...DEFAULT_REQUIREMENTS, ...input };
        const allValidOutcomes = evidence.outcomes.filter(outcome => this.validOutcome(outcome));
        const outcomes = allValidOutcomes.slice(0, 10_000);
        const reasons: string[] = [];
        if (allValidOutcomes.length > outcomes.length) reasons.push('maximum_observation_limit_exceeded');
        if (evidence.source !== 'external-independent') reasons.push('independent_external_benchmark_required');
        if (!evidence.oracleIndependent) reasons.push('independent_oracle_required');
        if (!evidence.artifactBound || !/^[0-9a-f]{64}$/i.test(evidence.artifactSha256 || '')) reasons.push('artifact_binding_required');
        if (!evidence.datasetFrozen || !/^[0-9a-f]{64}$/i.test(evidence.datasetSha256 || '')) reasons.push('frozen_dataset_required');
        if (outcomes.length < requirements.minimumSampleSize) reasons.push('minimum_sample_size_not_met');
        if (!requirements.productionReachable) reasons.push('production_reachability_not_proven');
        if (!requirements.fallbackVerified) reasons.push('deterministic_fallback_not_verified');
        if (!requirements.independentlyDisableable) reasons.push('independent_kill_switch_not_verified');
        if (!requirements.privacyConsentVerified) reasons.push('privacy_consent_not_verified');
        if (!requirements.resourceBudgetVerified) reasons.push('resource_budget_not_verified');

        if (outcomes.length === 0) return this.emptyDecision(reasons);
        const baselineWins = outcomes.filter(item => item.baselineSuccess && !item.candidateSuccess).length;
        const candidateWins = outcomes.filter(item => !item.baselineSuccess && item.candidateSuccess).length;
        const baselineSuccessRate = outcomes.filter(item => item.baselineSuccess).length / outcomes.length;
        const candidateSuccessRate = outcomes.filter(item => item.candidateSuccess).length / outcomes.length;
        const deltas = outcomes.map(item => Number(item.candidateSuccess) - Number(item.baselineSuccess));
        const successDelta = this.mean(deltas);
        const successDelta95CI = this.meanConfidenceInterval(deltas);
        const mcnemarExactPValue = this.exactTwoSidedBinomial(Math.min(baselineWins, candidateWins), baselineWins + candidateWins);
        const baselineCostPerSuccess = this.costPerSuccess(outcomes.map(item => ({ success: item.baselineSuccess, cost: item.baselineCostUSD })));
        const candidateCostPerSuccess = this.costPerSuccess(outcomes.map(item => ({ success: item.candidateSuccess, cost: item.candidateCostUSD })));
        const netCostPerSuccessDelta = Number.isFinite(baselineCostPerSuccess) && Number.isFinite(candidateCostPerSuccess)
            ? baselineCostPerSuccess - candidateCostPerSuccess : null;
        const netCostPerSuccessDelta95CI = netCostPerSuccessDelta === null ? null : this.bootstrapCostDelta(outcomes);
        const relativeCostPerSuccessImprovement = netCostPerSuccessDelta === null || baselineCostPerSuccess === 0
            ? null : netCostPerSuccessDelta / baselineCostPerSuccess;
        const baselineLatencyP95 = this.percentile(outcomes.map(item => item.baselineLatencyMs), 0.95);
        const candidateLatencyP95Ms = this.percentile(outcomes.map(item => item.candidateLatencyMs), 0.95);

        const qualityPath = successDelta >= requirements.minimumSuccessUplift && successDelta95CI[0] > 0
            && mcnemarExactPValue <= requirements.maximumPValue && netCostPerSuccessDelta !== null && netCostPerSuccessDelta >= 0;
        const costPath = successDelta95CI[0] >= -requirements.successNonInferiorityMargin
            && relativeCostPerSuccessImprovement !== null && relativeCostPerSuccessImprovement >= requirements.minimumRelativeCostImprovement
            && netCostPerSuccessDelta95CI !== null && netCostPerSuccessDelta95CI[0] > 0;
        if (netCostPerSuccessDelta === null) reasons.push('cost_per_success_not_comparable');
        if (!qualityPath && !costPath) reasons.push('statistically_meaningful_quality_or_cost_uplift_not_proven');
        if (candidateLatencyP95Ms > baselineLatencyP95 * requirements.maximumLatencyRegressionRatio) reasons.push('latency_guardrail_failed');

        const promotionPath = qualityPath ? 'quality' : costPath ? 'cost' : null;

        return Object.freeze({
            decision: reasons.length === 0 ? 'promote' : 'hold', promotionPath, reasons: Object.freeze(reasons), sampleSize: outcomes.length,
            baselineSuccessRate, candidateSuccessRate, successDelta, successDelta95CI: Object.freeze(successDelta95CI),
            mcnemarExactPValue, netCostPerSuccessDelta,
            netCostPerSuccessDelta95CI: netCostPerSuccessDelta95CI ? Object.freeze(netCostPerSuccessDelta95CI) : null,
            relativeCostPerSuccessImprovement, candidateLatencyP95Ms
        });
    }

    private static emptyDecision(reasons: string[]): ExperimentPromotionDecision {
        return Object.freeze({ decision: 'hold', promotionPath: null, reasons: Object.freeze(reasons), sampleSize: 0,
            baselineSuccessRate: null, candidateSuccessRate: null, successDelta: null, successDelta95CI: null,
            mcnemarExactPValue: null, netCostPerSuccessDelta: null, netCostPerSuccessDelta95CI: null,
            relativeCostPerSuccessImprovement: null, candidateLatencyP95Ms: null });
    }

    private static validOutcome(outcome: ExperimentEvidence['outcomes'][number]): boolean {
        return Boolean(outcome.taskId) && [outcome.baselineCostUSD, outcome.candidateCostUSD, outcome.baselineLatencyMs, outcome.candidateLatencyMs]
            .every(value => Number.isFinite(value) && value >= 0);
    }

    private static costPerSuccess(items: readonly { success: boolean; cost: number }[]): number {
        const successes = items.filter(item => item.success).length;
        return successes === 0 ? Number.POSITIVE_INFINITY : items.reduce((sum, item) => sum + item.cost, 0) / successes;
    }

    private static mean(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }

    private static meanConfidenceInterval(values: readonly number[]): [number, number] {
        if (values.length < 2) return [values[0] || 0, values[0] || 0];
        const mean = this.mean(values);
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
        const margin = 1.96 * Math.sqrt(variance / values.length);
        return [Math.max(-1, mean - margin), Math.min(1, mean + margin)];
    }

    private static percentile(values: readonly number[], quantile: number): number {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
    }

    private static bootstrapCostDelta(outcomes: readonly ExperimentEvidence['outcomes'][number][]): [number, number] | null {
        let state = outcomes.reduce((hash, item) => {
            for (const char of item.taskId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
            return hash;
        }, 2166136261) || 1;
        const samples: number[] = [];
        const iterations = outcomes.length > 2_000 ? 250 : 1_000;
        for (let iteration = 0; iteration < iterations; iteration++) {
            const selected: ExperimentEvidence['outcomes'][number][] = [];
            for (let index = 0; index < outcomes.length; index++) {
                state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
                selected.push(outcomes[state % outcomes.length]);
            }
            const baseline = this.costPerSuccess(selected.map(item => ({ success: item.baselineSuccess, cost: item.baselineCostUSD })));
            const candidate = this.costPerSuccess(selected.map(item => ({ success: item.candidateSuccess, cost: item.candidateCostUSD })));
            if (Number.isFinite(baseline) && Number.isFinite(candidate)) samples.push(baseline - candidate);
        }
        if (samples.length < Math.max(30, iterations * 0.8)) return null;
        return [this.percentile(samples, 0.025), this.percentile(samples, 0.975)];
    }

    private static exactTwoSidedBinomial(smallerDiscordant: number, discordant: number): number {
        if (discordant === 0) return 1;
        const logProbabilities: number[] = [];
        for (let index = 0; index <= smallerDiscordant; index++) {
            logProbabilities.push(this.logCombination(discordant, index) - discordant * Math.log(2));
        }
        const maximum = Math.max(...logProbabilities);
        const logTail = maximum + Math.log(logProbabilities.reduce((sum, value) => sum + Math.exp(value - maximum), 0));
        return Math.min(1, 2 * Math.exp(logTail));
    }

    private static logCombination(n: number, k: number): number {
        const m = Math.min(k, n - k);
        let result = 0;
        for (let index = 1; index <= m; index++) result += Math.log(n - m + index) - Math.log(index);
        return result;
    }
}
