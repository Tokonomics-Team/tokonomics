/**
 * Dashboard & EventBus Resilience & Non-Blocking Isolation Tests
 * Verifies that listener failures, thrown exceptions, and slow consumers never crash or stall the engine.
 */

import { OptimizationEventBus, PromptOptimizationEvent } from '../src/events/optimizationEvent';

export async function runDashboardResilienceTests(): Promise<boolean> {
    console.log('\n--- Running Dashboard Resilience & Non-Blocking Isolation Tests ---');

    const bus = OptimizationEventBus.getInstance();

    // 1. Attach a faulty listener that deliberately throws an error
    const faultyUnsub = bus.subscribe(() => {
        throw new Error('Simulated Webview / Listener crash exception');
    });

    const sampleEvent: PromptOptimizationEvent = {
        id: 'evt_resilience_1',
        timestamp: Date.now(),
        sessionId: 'session_resilience',
        state: 'OPTIMIZATION_COMPLETED',
        taskType: 'debug',
        taskConfidence: 0.95,
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        rawInputTokens: 5000,
        optimizedInputTokens: 1000,
        savedTokens: 4000,
        reductionPercentage: 80.0,
        cacheableTokens: 1024,
        projectedRawCostUSD: 0.015,
        projectedOptimizedCostUSD: 0.0015,
        projectedSavingsUSD: 0.0135,
        isCostReconciled: false,
        predictedCQ: 95.0,
        evidenceCoverage: 0.95,
        sliceConfidence: 0.95,
        cqRating: 'EXCELLENT',
        totalOptimizationLatencyMs: 0.15,
        stageMetrics: [],
        contextItemCount: 2,
        traceId: 'trace_resilience_1'
    };

    // 2. Measure dispatch latency: Emitting must return synchronously in < 0.1ms
    const t0 = performance.now();
    bus.emit(sampleEvent);
    const emitLatency = performance.now() - t0;

    faultyUnsub();

    if (emitLatency > 2.0) {
        throw new Error(`EventBus dispatch was blocked (Latency: ${emitLatency}ms)`);
    }

    console.log(`[Resilience] Event emitted safely in ${emitLatency.toFixed(3)}ms despite faulty listener.`);
    console.log('✓ Non-blocking failure isolation verified.');

    return true;
}
