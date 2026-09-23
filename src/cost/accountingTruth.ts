import type { PromptOptimizationEvent } from '../events/optimizationEvent';
import { TaskContext } from '../finops/taskContext';

export type TokenEvidenceState = 'heuristic_estimate' | 'tokenizer_measured' | 'provider_reported' | 'unavailable';
export type CostEvidenceState = 'projected' | 'reconciled' | 'billed_unavailable' | 'pricing_unavailable';
export type CostUnavailableReason =
    | 'provider_usage_not_reported'
    | 'pricing_not_found'
    | 'provider_billing_unavailable'
    | 'request_not_sent'
    | 'measurement_failed';

/** Normalize accounting claims once, before the event enters the authoritative ledger. */
export function normalizeAccountingEvent(event: PromptOptimizationEvent): PromptOptimizationEvent {
    const raw = finiteNonNegative(event.rawInputTokens);
    const optimized = Math.min(raw, finiteNonNegative(event.optimizedInputTokens));
    const saved = Math.max(0, raw - optimized);
    const tokenState = event.tokenState ?? inferTokenState(event);
    const costState = event.costState ?? inferCostState(event);
    const legacyCostStatus = costState === 'reconciled' ? 'reconciled'
        : costState === 'projected' ? 'projected' : 'unavailable';

    return Object.freeze({
        ...event,
        taskId: TaskContext.resolve(event.id, event.sessionId, event.taskId),
        rawInputTokens: raw,
        optimizedInputTokens: optimized,
        savedTokens: saved,
        reductionPercentage: boundedPercentage(raw > 0 ? (saved / raw) * 100 : 0),
        tokenState,
        costState,
        costStatus: legacyCostStatus,
        costUnavailableReason: costState === 'billed_unavailable' || costState === 'pricing_unavailable'
            ? event.costUnavailableReason ?? defaultCostReason(costState, event.state)
            : undefined
    });
}

export function boundedPercentage(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

export function effectiveCostState(event: Readonly<PromptOptimizationEvent>): CostEvidenceState {
    return event.costState ?? inferCostState(event);
}

export function explainCostState(event: Readonly<PromptOptimizationEvent>): string {
    const state = effectiveCostState(event);
    if (state === 'reconciled') return 'Observed usage priced with versioned rates; avoided cost uses a hypothetical uncached baseline, not a bill.';
    if (state === 'projected') return 'Projected from measured or estimated tokens and versioned pricing.';
    const reason = event.costUnavailableReason ?? defaultCostReason(state, event.state);
    const labels: Record<CostUnavailableReason, string> = {
        provider_usage_not_reported: 'Provider usage was not reported for this request.',
        pricing_not_found: 'No versioned price matches the selected provider and model.',
        provider_billing_unavailable: 'The provider does not expose billed cost for this request.',
        request_not_sent: 'The request did not reach the model provider.',
        measurement_failed: 'Token or pricing measurement did not complete.'
    };
    return labels[reason];
}

function inferTokenState(event: Readonly<PromptOptimizationEvent>): TokenEvidenceState {
    if (!Number.isFinite(event.rawInputTokens) || !Number.isFinite(event.optimizedInputTokens)) return 'unavailable';
    if (event.state === 'MODEL_USAGE_RECEIVED' || event.state === 'COST_RECONCILED') return 'provider_reported';
    return 'heuristic_estimate';
}

function inferCostState(event: Readonly<PromptOptimizationEvent>): CostEvidenceState {
    if (event.costStatus === 'reconciled' && hasActualCost(event)) return 'reconciled';
    if (event.costStatus === 'projected' && hasProjectedCost(event) && Boolean(event.pricingSource)) return 'projected';
    if (!event.pricingSource) return 'pricing_unavailable';
    return event.state === 'PROMPT_RECEIVED' || event.state === 'OPTIMIZATION_STARTED'
        ? 'pricing_unavailable' : 'billed_unavailable';
}

function hasActualCost(event: Readonly<PromptOptimizationEvent>): boolean {
    return Number.isFinite(event.actualRawCostUSD) && Number.isFinite(event.actualOptimizedCostUSD) && Number.isFinite(event.actualSavingsUSD);
}

function hasProjectedCost(event: Readonly<PromptOptimizationEvent>): boolean {
    return Number.isFinite(event.projectedRawCostUSD) && Number.isFinite(event.projectedOptimizedCostUSD) && Number.isFinite(event.projectedSavingsUSD);
}

function defaultCostReason(state: CostEvidenceState, lifecycle: PromptOptimizationEvent['state']): CostUnavailableReason {
    if (state === 'pricing_unavailable') return 'pricing_not_found';
    if (lifecycle === 'OPTIMIZATION_FAILED') return 'request_not_sent';
    return 'provider_usage_not_reported';
}

function finiteNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
