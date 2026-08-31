import * as assert from 'assert';
import { LocalSlmBrain, HardwareCapabilityDetector } from '../../src/engine/localSlmBrain';

export async function runPhase25And26SlmFallbackValidation(): Promise<boolean> {
    console.log('--- Phase 25 & 26: Local SLM Inference & Deterministic Fallback Cascade ---');

    const tier = HardwareCapabilityDetector.detectTier();
    assert.ok(['webgpu', 'wasm_simd', 'cpu_fallback'].includes(tier), 'Hardware detector must return a valid acceleration tier');

    const slm = new LocalSlmBrain(false);
    // Exercise deterministic fallback cascade with zero network requests
    const intentRes = await slm.refineQuery('Fix null pointer exception in AuthService validateSession');
    assert.strictEqual(intentRes.taskType, 'debug', 'Local SLM must infer task intent as debug');
    assert.ok(intentRes.targetSymbols.includes('AuthService'), 'Local SLM must extract AuthService symbol');

    console.log('  ✓ Local SLM offline auxiliary reasoning & fallback cascades verified.');
    return true;
}
