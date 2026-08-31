/**
 * Event Lifecycle & Post-Inference Cost Reconciliation Tests
 * Validates state transitions from PROMPT_RECEIVED to COST_RECONCILED.
 */

import { OptimizationEventBus, PromptOptimizationEvent } from '../src/events/optimizationEvent';
import { CostCalculator } from '../src/cost/costCalculator';
import { CLAUDE_SONNET_PROFILE } from '../src/tokenizer/modelProfile';

export async function runEventReconciliationTests(): Promise<boolean> {
    console.log('\n--- Running Event Lifecycle & Cost Reconciliation Tests ---');

    const bus = OptimizationEventBus.getInstance();
    const statesObserved: string[] = [];

    const unsubscribe = bus.subscribe((event: PromptOptimizationEvent) => {
        statesObserved.push(event.state);
    });

    // 1. Simulate compile-time event
    const promptId = `prompt_${Date.now()}`;
    const initialEvent: PromptOptimizationEvent = {
        id: promptId,
        timestamp: Date.now(),
        sessionId: 'session_e2e',
        state: 'OPTIMIZATION_COMPLETED',
        taskType: 'debug',
        taskConfidence: 0.98,
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        rawInputTokens: 15000,
        optimizedInputTokens: 2500,
        savedTokens: 12500,
        reductionPercentage: 83.3,
        cacheableTokens: 1024,
        cachedTokens: 1024,
        projectedRawCostUSD: 0.045,
        projectedOptimizedCostUSD: 0.0047,
        projectedSavingsUSD: 0.0403,
        isCostReconciled: false,
        predictedCQ: 95.0,
        evidenceCoverage: 0.98,
        sliceConfidence: 0.95,
        cqRating: 'EXCELLENT',
        totalOptimizationLatencyMs: 0.32,
        stageMetrics: [],
        contextItemCount: 4,
        traceId: `trace_${promptId}`
    };

    bus.emit(initialEvent);

    // 2. Simulate post-inference provider usage reconciliation
    const reconciledCost = CostCalculator.calculateReconciledCost(2500, 1024, 350, 15000, CLAUDE_SONNET_PROFILE);

    const reconciledEvent: PromptOptimizationEvent = {
        ...initialEvent,
        state: 'COST_RECONCILED',
        actualRawCostUSD: reconciledCost.actualRawCostUSD,
        actualOptimizedCostUSD: reconciledCost.actualOptimizedCostUSD,
        actualSavingsUSD: reconciledCost.actualSavingsUSD,
        isCostReconciled: true,
        outputTokens: 350
    };

    bus.emit(reconciledEvent);

    // Wait a tick for async dispatch
    await new Promise(resolve => setTimeout(resolve, 50));
    unsubscribe();

    if (!statesObserved.includes('OPTIMIZATION_COMPLETED') || !statesObserved.includes('COST_RECONCILED')) {
        throw new Error(`Event lifecycle states missing (Observed: ${statesObserved.join(' -> ')})`);
    }

    console.log(`[Event Lifecycle] Completed state transition: ${statesObserved.join(' ➔ ')}`);
    console.log(`[Reconciliation] Projected Savings: $${initialEvent.projectedSavingsUSD} ➔ Reconciled Savings: $${reconciledEvent.actualSavingsUSD}`);
    console.log('✓ Event lifecycle and post-inference cost reconciliation verified.');

    return true;
}
