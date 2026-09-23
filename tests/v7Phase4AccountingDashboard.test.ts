import * as assert from 'assert';
import { boundedPercentage, explainCostState, normalizeAccountingEvent } from '../src/cost/accountingTruth';
import { defaultPricingCatalog } from '../src/cost/pricingCatalog';
import { LiveMetricsAggregator } from '../src/metrics/liveAggregator';
import { RequestLedger } from '../src/events/requestLedger';
import type { PromptOptimizationEvent } from '../src/events/optimizationEvent';

function event(overrides: Partial<PromptOptimizationEvent> = {}): PromptOptimizationEvent {
    return {
        id: 'phase4', timestamp: 10, sessionId: 's', state: 'OPTIMIZATION_COMPLETED',
        taskType: 'general', taskConfidence: 1, provider: 'unknown', model: 'unknown',
        rawInputTokens: 100, optimizedInputTokens: 40, savedTokens: 999, reductionPercentage: 999,
        cacheableTokens: 0, projectedRawCostUSD: 0, projectedOptimizedCostUSD: 0,
        projectedSavingsUSD: 0, isCostReconciled: false, costStatus: 'unavailable',
        predictedCQ: 80, evidenceCoverage: 1, sliceConfidence: 1, cqRating: 'GOOD',
        totalOptimizationLatencyMs: 1, stageMetrics: [], contextItemCount: 0, traceId: 'phase4',
        ...overrides
    };
}

export function runV7Phase4AccountingDashboardTests(): boolean {
    console.log('\n--- Running v7.0.1 Phase 4 accounting/dashboard truth tests ---');

    for (let value = -1000; value <= 1000; value += 7.3) {
        const bounded = boundedPercentage(value);
        assert.ok(bounded >= 0 && bounded <= 100 && Number.isFinite(bounded));
    }
    assert.strictEqual(boundedPercentage(Number.NaN), 0);

    const missing = normalizeAccountingEvent(event());
    assert.strictEqual(missing.savedTokens, 60, 'Savings must be derived without overlapping counters');
    assert.strictEqual(missing.reductionPercentage, 60);
    assert.strictEqual(missing.tokenState, 'heuristic_estimate');
    assert.strictEqual(missing.costState, 'pricing_unavailable');
    assert.strictEqual(missing.costUnavailableReason, 'pricing_not_found');
    assert.match(explainCostState(missing), /No versioned price/);

    const projected = normalizeAccountingEvent(event({
        model: 'gpt-5.4-2026-03-05', provider: 'openai', costStatus: 'projected',
        pricingSource: 'https://openai.com/api/pricing/', pricingCatalogVersion: '2026-09-06.v3',
        projectedRawCostUSD: 0.001, projectedOptimizedCostUSD: 0.0004, projectedSavingsUSD: 0.0006
    }));
    assert.strictEqual(projected.costState, 'projected');
    assert.strictEqual(projected.costUnavailableReason, undefined);

    const reconciled = normalizeAccountingEvent(event({
        state: 'COST_RECONCILED', costStatus: 'reconciled', actualRawCostUSD: 0.001,
        actualOptimizedCostUSD: 0.0005, actualSavingsUSD: 0.0005
    }));
    assert.strictEqual(reconciled.tokenState, 'provider_reported');
    assert.strictEqual(reconciled.costState, 'reconciled');

    assert.strictEqual(defaultPricingCatalog.resolveStrict('gpt-5.4-2026-03-05', 'openai').modelId, 'gpt-5.4');
    assert.strictEqual(defaultPricingCatalog.resolveStrict('claude-sonnet-4-5-20250929', 'anthropic').modelId, 'claude-sonnet-4-6');
    assert.strictEqual(defaultPricingCatalog.resolveStrict('deepseek-v4-pro', 'deepseek').rates.outputCostPer1M, 0.87);
    assert.throws(() => defaultPricingCatalog.resolveStrict('future-unknown-model', 'openai'), /No versioned pricing/);

    const ledger = new RequestLedger({ maxRecords: 8, maxBytes: 50_000 });
    ledger.append(projected);
    const summary = new LiveMetricsAggregator(ledger, () => 20, 0).getAggregateSummary('session');
    assert.strictEqual(summary.rawTokens, 100);
    assert.strictEqual(summary.optimizedTokens, 40);
    assert.strictEqual(summary.savedCostUSD, 0.0006);

    console.log('Accounting states, arithmetic bounds, aliases, missing pricing, and ledger projections passed.');
    return true;
}
