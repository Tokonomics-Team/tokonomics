/**
 * Independent Unit Tests for 3-Run Scientific Experimentation Metrics Calculation
 * Validates mathematical correctness of:
 * - Context Success Preservation Ratio (Tokonomics / FullContext <= 1.0)
 * - Absolute Improvement (Tokonomics - Baseline)
 * - Relative Improvement ((Tokonomics - Baseline) / Baseline)
 * - Task Success Uplift vs Full Context
 * - Division-by-zero protection
 * - Edge cases: both 100%, both non-100%, baseline > Tokonomics, Tokonomics > baseline
 */

import * as assert from 'assert';
import { ThreeRunExperimentEngine } from '../../validation/runner/threeRunExperimentEngine';

export function runThreeRunMetricsTests() {
    console.log('--- Running 3-Run Scientific Metrics Mathematical Invariants Tests ---');

    // 1. Both 100% Test Case (Standard Benchmark Outcome)
    const both100 = ThreeRunExperimentEngine.calculateMetrics(65, 100, 100, 100);
    assert.strictEqual(both100.baselinePct, 65.0);
    assert.strictEqual(both100.fullContextPct, 100.0);
    assert.strictEqual(both100.tokonomicsPct, 100.0);
    assert.strictEqual(both100.absoluteImprovement, 35.0);
    assert.strictEqual(both100.relativeImprovement, 53.8);
    assert.strictEqual(both100.preservationRatio, 1.0, '100% / 100% must equal 1.0');
    assert.strictEqual(both100.upliftPct, undefined);

    // 2. Both Non-100% (e.g. Tokonomics 80%, Full Context 90%)
    const partialPreservation = ThreeRunExperimentEngine.calculateMetrics(50, 90, 80, 100);
    assert.strictEqual(partialPreservation.baselinePct, 50.0);
    assert.strictEqual(partialPreservation.fullContextPct, 90.0);
    assert.strictEqual(partialPreservation.tokonomicsPct, 80.0);
    assert.strictEqual(partialPreservation.absoluteImprovement, 30.0);
    assert.strictEqual(partialPreservation.relativeImprovement, 60.0);
    assert.strictEqual(partialPreservation.preservationRatio, 0.889, '80% / 90% must equal 0.889');
    assert.strictEqual(partialPreservation.upliftPct, undefined);

    // 3. Tokonomics Exceeds Full Context Reference (e.g. Full Context 85%, Tokonomics 95%)
    const upliftCase = ThreeRunExperimentEngine.calculateMetrics(60, 85, 95, 100);
    assert.strictEqual(upliftCase.preservationRatio, 1.0, 'Preservation ratio must be capped at 1.0');
    assert.strictEqual(upliftCase.upliftPct, 10.0, 'Uplift must be reported separately as +10.0% points');

    // 4. Baseline Exceeds Tokonomics (Negative Improvement)
    const regressionCase = ThreeRunExperimentEngine.calculateMetrics(80, 90, 70, 100);
    assert.strictEqual(regressionCase.absoluteImprovement, -10.0);
    assert.strictEqual(regressionCase.relativeImprovement, -12.5);
    assert.strictEqual(regressionCase.preservationRatio, 0.778);

    // 5. Zero Baseline (Division-by-Zero Protection)
    const zeroBase = ThreeRunExperimentEngine.calculateMetrics(0, 80, 80, 100);
    assert.strictEqual(zeroBase.baselinePct, 0.0);
    assert.strictEqual(zeroBase.relativeImprovement, 100.0, 'Handled without NaN');
    assert.strictEqual(zeroBase.preservationRatio, 1.0);

    // 6. Zero Total Tasks Protection
    const zeroTotal = ThreeRunExperimentEngine.calculateMetrics(0, 0, 0, 0);
    assert.strictEqual(zeroTotal.baselinePct, 0);
    assert.strictEqual(zeroTotal.preservationRatio, 1.0);

    console.log('✓ All 3-Run mathematical metrics invariants verified.');
}
