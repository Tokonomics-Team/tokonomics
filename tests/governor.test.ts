/**
 * Unit & Benchmark Tests for Deterministic Context Governor
 * Validates deterministic repeatability, risk overrides, evidence safety gates, and overhead bounds.
 */

import * as assert from 'assert';
import { DeterministicContextGovernor } from '../src/governor/contextGovernor';
import { IntentExtractor } from '../src/governor/intentExtractor';
import { ContextRiskEngine } from '../src/governor/riskEngine';
import { EvidenceSafetyGate } from '../src/governor/evidenceSafetyGate';
import { ContextGovernorInput, EvidenceCategory } from '../src/governor/governorTypes';
import { performance } from 'perf_hooks';

export function runGovernorTests(): boolean {
    console.log('\n--- Running Deterministic Context Governor Tests ---');

    const governor = DeterministicContextGovernor.getInstance();

    // 1. Test Deterministic Repeatability
    const input1: ContextGovernorInput = {
        userPrompt: 'Debug the NullPointerException in AuthService.ts line 45',
        activeFilePath: 'src/auth/AuthService.ts',
        cursorLine: 45
    };
    const decision1A = governor.evaluateContext(input1);
    const decision1B = governor.evaluateContext(input1);

    assert.strictEqual(decision1A.taskType, 'debug', 'Task type should be debug');
    assert.strictEqual(decision1A.taskType, decision1B.taskType, 'Deterministic repeatability failed for taskType');
    assert.strictEqual(decision1A.retrievalMode, decision1B.retrievalMode, 'Deterministic repeatability failed for retrievalMode');
    assert.strictEqual(decision1A.optimizationAggressiveness, decision1B.optimizationAggressiveness, 'Deterministic repeatability failed for aggressiveness');
    console.log('  ✓ Deterministic Repeatability Invariant verified.');

    // 2. Test High-Risk Safety Override (Public API change + Low slice confidence)
    const highRiskInput: ContextGovernorInput = {
        userPrompt: 'Refactor public interface PaymentGateway',
        activeFilePath: 'src/payments/gateway.ts',
        isPublicApiModified: true,
        sliceConfidenceEstimate: 0.72
    };
    const highRiskDecision = governor.evaluateContext(highRiskInput);
    assert.strictEqual(highRiskDecision.riskLevel, 'high', 'Risk level should be high');
    assert.strictEqual(highRiskDecision.optimizationAggressiveness, 'conservative', 'High risk must force conservative optimization');
    assert.ok(highRiskDecision.maxRecommendedReductionPct <= 50, 'High risk must cap reduction <= 50%');
    console.log('  ✓ High-Risk Correctness Override Invariant verified.');

    // 3. Test Critical Risk Override (Dynamic construct + Public API + Diagnostics)
    const criticalRiskInput: ContextGovernorInput = {
        userPrompt: 'Fix dynamic reflection dispatcher',
        isPublicApiModified: true,
        hasDynamicConstructs: true,
        sliceConfidenceEstimate: 0.65,
        diagnosticsCount: 5
    };
    const critDecision = governor.evaluateContext(criticalRiskInput);
    assert.strictEqual(critDecision.riskLevel, 'critical', 'Risk level should be critical');
    assert.strictEqual(critDecision.optimizationAggressiveness, 'none', 'Critical risk must force 0% reduction');
    console.log('  ✓ Critical Risk Zero-Reduction Invariant verified.');

    // 4. Test Evidence Safety Gate Subset Invariant (Required ⊆ Provided)
    const decision = governor.evaluateContext({ userPrompt: 'Write unit tests for OrderService' });
    const providedFull: EvidenceCategory[] = ['targetImplementation', 'tests', 'fixtures', 'mocks', 'apiContract'];
    const safetyFull = governor.validateEvidenceSafety(decision, providedFull);
    assert.strictEqual(safetyFull.passed, true, 'Full evidence should pass safety gate');
    assert.strictEqual(safetyFull.actionTaken, 'proceed');

    // Missing critical evidence (missing 'tests' for test task)
    const providedIncomplete: EvidenceCategory[] = ['targetImplementation', 'apiContract'];
    const safetyIncomplete = governor.validateEvidenceSafety(decision, providedIncomplete);
    assert.strictEqual(safetyIncomplete.passed, false, 'Missing critical evidence must fail safety gate');
    assert.strictEqual(safetyIncomplete.actionTaken, 'fail_closed_fallback');
    console.log('  ✓ Evidence Safety Gate RequiredEvidence ⊆ ProvidedEvidence Invariant verified.');

    // 5. Test Performance Overhead (< 0.05ms, < 1MB RAM)
    const iterations = 500;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        governor.evaluateContext(input1);
    }
    const elapsedMs = performance.now() - start;
    const avgLatencyMs = elapsedMs / iterations;
    assert.ok(avgLatencyMs < 0.05, `Governor latency ${avgLatencyMs.toFixed(4)}ms must be < 0.05ms`);
    console.log(`  ✓ Governor Latency Overhead verified: ${avgLatencyMs.toFixed(4)}ms/call (< 0.05ms target).`);

    return true;
}
