/**
 * Phase 9 Unit Tests: System Dependence Graph (SDG) Slicing & Slice Confidence
 */

import { SystemDependenceGraph } from '../src/ast/systemDependenceGraph';
import { SliceConfidenceEvaluator } from '../src/ast/sliceConfidence';

export function runSdgSlicingTests(): boolean {
    console.log('\n--- Running Phase 9 SDG Program Slicing & Slice Confidence Tests ---');

    const sdg = new SystemDependenceGraph();
    const evaluator = new SliceConfidenceEvaluator();

    const sampleCode = `
export class OrderProcessor {
  public process(order: Order): double {
    const taxRate = 0.08;
    const basePrice = order.price;
    const isDiscounted = order.hasCoupon;
    
    // Unrelated logging statements (orthogonal)
    const logTraceId = "trace_999";
    console.log(logTraceId);
    for (let i = 0; i < 10; i++) {
        // internal loop
    }

    let finalPrice = basePrice * (1 + taxRate);
    if (isDiscounted) {
        finalPrice = finalPrice * 0.9;
    }

    return finalPrice;
  }
}
`;

    // 1. Test Backward Program Slicing from line 19 (return finalPrice)
    const sliceRes = sdg.computeBackwardSlice(sampleCode, 19, 'finalPrice');

    if (sliceRes.reductionPercentage <= 0 || sliceRes.slicedLinesCount >= sliceRes.originalLinesCount) {
        throw new Error(`Backward slicing failed to reduce code (Got: ${JSON.stringify(sliceRes)})`);
    }

    // Sliced code must contain taxRate, basePrice, isDiscounted, finalPrice and omit logTraceId
    if (!sliceRes.slicedCode.includes('taxRate') || !sliceRes.slicedCode.includes('finalPrice')) {
        throw new Error('Backward slice omitted critical data dependencies');
    }

    if (sliceRes.slicedCode.includes('logTraceId')) {
        throw new Error('Backward slice failed to prune orthogonal dead computation');
    }

    console.log(`[SDG Slicing] Sliced ${sliceRes.originalLinesCount} lines ➔ ${sliceRes.slicedLinesCount} lines (-${sliceRes.reductionPercentage}%)`);
    console.log('✓ SystemDependenceGraph dynamic backward slicing verified.');

    // 1.1 Test Intent-Aware Slicing on ConnectionPool
    const poolCode = `
export class ConnectionPool {
    private retryCount = 0;
    public async acquire(): Promise<Conn> {
        if (this.retryCount > 3) throw new Error("Pool exhausted");
        this.retryCount++;
        return this.connectWithBackoff(this.retryCount * 1000);
    }
    private connectWithBackoff(ms: number): Promise<Conn> { return Promise.resolve({} as Conn); }
}
`;
    const poolSlice = sdg.computeIntentAwareSlice(poolCode, ['debug', 'Fix', 'retry', 'delay', 'logic', 'ConnectionPool'], 15);
    if (!poolSlice.slicedCode.includes('acquire') || !poolSlice.slicedCode.includes('retryCount')) {
        throw new Error(`ConnectionPool slice missed acquire or retryCount: ${poolSlice.slicedCode}`);
    }

    // 2. Test Slice Confidence on Static Code (Safe -> use_slice)
    const staticRisk = evaluator.evaluateSliceRisk(sampleCode, sliceRes.originalLinesCount, sliceRes.slicedLinesCount);
    if (staticRisk.sliceConfidence < 0.85 || staticRisk.recommendedAction !== 'use_slice') {
        throw new Error(`Slice confidence evaluation failed for static code (Got: ${JSON.stringify(staticRisk)})`);
    }
    console.log(`[Slice Confidence] Static Code Confidence: ${staticRisk.sliceConfidence} (Action: ${staticRisk.recommendedAction})`);

    // 3. Test Dynamic Dispatch / Reflection Risk (Unsafe -> retain_lexical_scope / full_verbatim)
    const dynamicCode = `
export class DynamicHandler {
  public execute(actionName: string, data: any) {
    const handler = this[actionName];
    eval("console.log(data)");
    return handler.apply(this, [data]);
  }
}
`;
    const dynamicRisk = evaluator.evaluateSliceRisk(dynamicCode, 10, 5);
    if (dynamicRisk.sliceConfidence >= 0.85 || dynamicRisk.recommendedAction === 'use_slice') {
        throw new Error(`Dynamic features failed to trigger safe fallback (Got: ${JSON.stringify(dynamicRisk)})`);
    }

    console.log(`[Slice Confidence] Dynamic Code Confidence: ${dynamicRisk.sliceConfidence} (Risk: ${dynamicRisk.unknownDependencyRisk}, Action: ${dynamicRisk.recommendedAction})`);
    console.log('✓ SliceConfidenceEvaluator dynamic risk assessment verified.');

    return true;
}
