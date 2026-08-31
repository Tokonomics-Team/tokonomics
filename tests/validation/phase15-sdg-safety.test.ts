import * as assert from 'assert';
import { SystemDependenceGraph } from '../../src/ast/systemDependenceGraph';

export function runPhase15SdgSafetyValidation(): boolean {
    console.log('--- Phase 15: SDG Program Slicing Safety & False Negative Analysis ---');

    const sdg = new SystemDependenceGraph();
    const sourceCode = `
export class PaymentService {
  private apiKey = "secret_key";
  public async processPayment(orderId: string, amount: number): Promise<boolean> {
    const isIdempotent = this.checkIdempotency(orderId);
    if (!isIdempotent) return false;

    // Unrelated metrics trace
    const traceId = "metric_123";
    console.log(traceId);

    const result = await this.chargeCustomer(amount);
    return result;
  }
  private checkIdempotency(id: string): boolean { return true; }
  private async chargeCustomer(amt: number): Promise<boolean> { return true; }
}
`;

    const slice = sdg.computeIntentAwareSlice(sourceCode, ['processPayment', 'idempotent', 'chargeCustomer'], 15);

    // Assert zero false negatives on critical path
    assert.ok(slice.slicedCode.includes('checkIdempotency') || slice.slicedCode.includes('isIdempotent'), 'Idempotency check must NOT be dropped');
    assert.ok(slice.slicedCode.includes('chargeCustomer'), 'Charge customer call must NOT be dropped');
    assert.ok(!slice.slicedCode.includes('traceId'), 'Dead metric trace must be sliced');

    console.log('  ✓ SDG slicing zero false-negative safety on critical paths verified.');
    return true;
}
