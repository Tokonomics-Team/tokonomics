import * as assert from 'assert';
import { PromptOptimizationEvent } from '../src/events/optimizationEvent';
import { RequestLedger } from '../src/events/requestLedger';
import { LiveMetricsAggregator } from '../src/metrics/liveAggregator';

function event(id: string, timestamp: number, overrides: Partial<PromptOptimizationEvent> = {}): PromptOptimizationEvent {
    return {
        id,
        timestamp,
        sessionId: 'phase7-session',
        state: 'OPTIMIZATION_COMPLETED',
        taskType: 'debug',
        taskConfidence: 0.9,
        provider: 'test-provider',
        model: 'test-model',
        rawInputTokens: 1_000,
        optimizedInputTokens: 400,
        savedTokens: 600,
        reductionPercentage: 60,
        cacheableTokens: 200,
        cachedTokens: 0,
        projectedRawCostUSD: 0.01,
        projectedOptimizedCostUSD: 0.004,
        projectedSavingsUSD: 0.006,
        isCostReconciled: false,
        costStatus: 'projected',
        predictedCQ: 92,
        evidenceCoverage: 0.9,
        sliceConfidence: 0.95,
        cqRating: 'EXCELLENT',
        totalOptimizationLatencyMs: 12,
        stageMetrics: [{ stageName: 'compiler', tokensBefore: 1_000, tokensAfter: 400, tokensSaved: 600, latencyMs: 12 }],
        contextItemCount: 2,
        traceId: `${id}:compile`,
        snapshotGeneration: 17,
        cacheState: 'eligible',
        fallbackReasons: [],
        selectionTrace: [{ selectionHash: 'a'.repeat(64), resolution: 'full', tokenCount: 400, contentHash: 'b'.repeat(64) }],
        redactionCount: 1,
        budgetTrace: { inputLimit: 4_000, outputReserve: 500, finalInputTokens: 400, projectedTotalTokens: 900 },
        ...overrides
    };
}

export function runPhase7ObservabilityLedgerTests(): boolean {
    console.log('\n--- Running Phase 7 Authoritative Observability & Dashboard Tests ---');

    // A compiled request and its reconciliation are one prompt, with the latest
    // authoritative economics replacing (not adding to) the projection.
    const now = new Date(2026, 8, 2, 12, 0, 0, 0).getTime();
    const ledger = new RequestLedger();
    const compiled = event('reconciled-request', now - 1_000);
    const reconciled = event('reconciled-request', now, {
        state: 'COST_RECONCILED', traceId: 'reconciled-request:usage',
        costStatus: 'reconciled', isCostReconciled: true,
        actualRawCostUSD: 0.012, actualOptimizedCostUSD: 0.005, actualSavingsUSD: 0.007,
        cachedTokens: 100, cacheState: 'provider_read'
    });
    assert.ok(ledger.append(compiled));
    assert.ok(ledger.append(reconciled));
    assert.strictEqual(ledger.append(reconciled), undefined, 'An identical lifecycle record must be idempotent');
    const aggregate = new LiveMetricsAggregator(ledger, () => now, now - 60_000).getAggregateSummary('session');
    assert.strictEqual(aggregate.totalPrompts, 1);
    assert.strictEqual(aggregate.rawTokens, 1_000);
    assert.strictEqual(aggregate.savedCostUSD, 0.007);
    assert.strictEqual(aggregate.costedPrompts, 1);
    assert.strictEqual(aggregate.reconciledPrompts, 1);
    assert.strictEqual(aggregate.cacheHitRatio, 0.25);

    // Distinct updates sharing a state/trace remain append-only, while lifecycle
    // regressions and timestamp regressions cannot replace an authoritative tail.
    const stageA = event('stages', now - 500, { state: 'OPTIMIZATION_STAGE_UPDATED', traceId: 'stages:trace', savedTokens: 100 });
    const stageB = event('stages', now - 500, { state: 'OPTIMIZATION_STAGE_UPDATED', traceId: 'stages:trace', savedTokens: 200 });
    assert.ok(ledger.append(stageA));
    assert.ok(ledger.append(stageB));
    assert.strictEqual(ledger.getRequestEntries('stages').length, 2);
    assert.strictEqual(ledger.append(event('stages', now - 600, { state: 'OPTIMIZATION_STARTED' })), undefined);
    assert.ok(Object.isFrozen(ledger.getEntries()[0]));
    assert.ok(Object.isFrozen(ledger.getEntries()[0].event));

    // Windows are recalculated from request timestamps: local calendar day,
    // exact rolling 168 hours, current activation session, and all retained data.
    const windows = new RequestLedger();
    const day = 24 * 60 * 60 * 1_000;
    windows.append(event('today', now - 60 * 60 * 1_000));
    windows.append(event('session-old', now - day));
    windows.append(event('rolling', now - 6 * day));
    windows.append(event('expired', now - 8 * day));
    const windowed = new LiveMetricsAggregator(windows, () => now, now - 2 * day);
    assert.strictEqual(windowed.getAggregateSummary('today').totalPrompts, 1);
    assert.strictEqual(windowed.getAggregateSummary('session').totalPrompts, 2);
    assert.strictEqual(windowed.getAggregateSummary('7_days').totalPrompts, 3);
    assert.strictEqual(windowed.getAggregateSummary('lifetime').totalPrompts, 4);
    const localStart = LiveMetricsAggregator.localDayStart(now);
    assert.strictEqual(new Date(localStart).getHours(), 0);
    const boundary = new RequestLedger();
    boundary.append(event('before-midnight', localStart - 1));
    boundary.append(event('at-midnight', localStart));
    assert.strictEqual(new LiveMetricsAggregator(boundary, () => now, 0).getAggregateSummary('today').totalPrompts, 1);

    // Missing economics and an empty window stay unavailable; they are never
    // converted into zero-dollar savings or fabricated quality/latency values.
    const unavailable = new RequestLedger();
    unavailable.append(event('unknown-cost', now, { costStatus: 'unavailable' }));
    const unknownSummary = new LiveMetricsAggregator(unavailable, () => now, 0).getAggregateSummary('lifetime');
    assert.strictEqual(unknownSummary.savedCostUSD, null);
    assert.strictEqual(unknownSummary.costedPrompts, 0);
    const emptySummary = new LiveMetricsAggregator(new RequestLedger(), () => now, 0).getAggregateSummary('lifetime');
    assert.strictEqual(emptySummary.averagePredictedCQ, null);
    assert.strictEqual(emptySummary.averageEvidenceCoverage, null);
    assert.strictEqual(emptySummary.averageOptimizationLatencyMs, null);

    // The exported decision trace exposes hashes and numeric evidence only.
    const trace = ledger.getDecisionTrace('reconciled-request');
    assert.ok(trace);
    assert.strictEqual(trace!.selections[0].selectionHash, 'a'.repeat(64));
    const serializedTrace = JSON.stringify(trace);
    assert.ok(!serializedTrace.includes('src/'));
    assert.ok(!serializedTrace.includes('prompt'));
    assert.strictEqual(trace!.snapshotGeneration, 17);
    assert.strictEqual(trace!.costStatus, 'reconciled');

    // Retained lifetime evidence restores with immutable records and does not
    // resurrect malformed storage entries.
    let persisted: unknown = [];
    const memento = {
        get: <T>(_key: string, fallback?: T): T => (persisted === undefined ? fallback : persisted) as T,
        update: async (_key: string, value: unknown): Promise<void> => { persisted = JSON.parse(JSON.stringify(value)); }
    };
    const persistentLedger = new RequestLedger();
    persistentLedger.configurePersistence(memento);
    persistentLedger.append(event('persisted', now));
    const restoredLedger = new RequestLedger();
    restoredLedger.configurePersistence(memento);
    assert.strictEqual(restoredLedger.getLatestRequestEvents().length, 1);
    assert.strictEqual(restoredLedger.getLatestRequestEvents()[0].id, 'persisted');

    // Failures/cancellations have a terminal, countable representation without
    // being misreported as completed prompts.
    const failures = new RequestLedger();
    failures.append(event('cancelled', now, { state: 'OPTIMIZATION_FAILED', traceId: 'cancelled:failure', errorCode: 'CANCELLED', costStatus: 'unavailable' }));
    const failureSummary = new LiveMetricsAggregator(failures, () => now, 0).getAggregateSummary('lifetime');
    assert.strictEqual(failureSummary.totalPrompts, 1);
    assert.strictEqual(failureSummary.completedPrompts, 0);
    assert.strictEqual(failureSummary.failedPrompts, 1);

    console.log('Phase 7 append-only, exactly-once, window, reconciliation, unavailable-value, and privacy contracts passed.');
    return true;
}
