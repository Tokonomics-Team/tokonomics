import * as assert from 'assert';
import { CostCalculator } from '../../src/cost/costCalculator';
import { CLAUDE_SONNET_PROFILE } from '../../src/tokenizer/modelProfile';

export function runPhase19And20PricingReconciliationValidation(): boolean {
    console.log('--- Phase 19 & 20: Model Pricing Profiles & Cost Reconciliation ---');

    // 1. Projected Cost (Zero Speculation: based solely on input token delta)
    const projected = CostCalculator.calculateProjectedCost(10000, 2000, 0, CLAUDE_SONNET_PROFILE);

    assert.ok(projected.savingsUSD > 0, 'Projected cost saved must be positive');
    assert.strictEqual(projected.savingsPercentage, 80, '80% token savings must be reflected exactly');

    // 2. Post-Inference Reconciled Cost with Model Usage Headers
    const reconciled = CostCalculator.calculateReconciledCost(2000, 1000, 300, 10000, CLAUDE_SONNET_PROFILE);

    assert.ok(reconciled.actualSavingsUSD > 0, 'Reconciled cost saved must be calculated post-inference');
    console.log('  ✓ Model profiles and post-inference zero-assumption cost reconciliation verified.');
    return true;
}
