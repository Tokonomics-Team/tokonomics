/**
 * Phase 14 Unit Tests: Local SLM Brain & Deterministic Fallback Cascades
 */

import { LocalSlmBrain, HardwareCapabilityDetector } from '../src/engine/localSlmBrain';

export async function runLocalSlmBrainTests(): Promise<boolean> {
    console.log('\n--- Running Phase 14 Local SLM Brain & Auxiliary Inference Tests ---');

    // 1. Test Hardware Capability Detector
    const tier = HardwareCapabilityDetector.detectTier();
    if (!['webgpu', 'wasm_simd', 'cpu_fallback'].includes(tier)) {
        throw new Error(`Invalid hardware tier detected: ${tier}`);
    }
    console.log(`[Hardware Tier] Detected Local Acceleration: ${tier.toUpperCase()}`);
    console.log('✓ HardwareCapabilityDetector verified.');

    // 2. Test Deterministic Fallback Cascade (weights uninitialized)
    const fallbackBrain = new LocalSlmBrain(false);
    const fallbackRes = await fallbackBrain.refineQuery('Fix null pointer exception in AuthService validateSession');

    if (!fallbackRes.isFallback || fallbackRes.taskType !== 'debug' || !fallbackRes.targetSymbols.includes('AuthService')) {
        throw new Error(`Deterministic fallback refinement failed (Got: ${JSON.stringify(fallbackRes)})`);
    }
    console.log(`[Local SLM Fallback] Extracted Target: ${fallbackRes.targetSymbols.join(', ')} | Task: ${fallbackRes.taskType.toUpperCase()} (Latency: ${fallbackRes.inferenceLatencyMs}ms)`);
    console.log('✓ LocalSlmBrain deterministic fallback cascade verified.');

    // 3. Test Active Local SLM Mode
    const activeBrain = new LocalSlmBrain(true);
    const activeRes = await activeBrain.refineQuery('Refactor DatabasePool connection timeout and retry logic');

    if (activeRes.isFallback || activeRes.taskType !== 'refactor' || activeRes.subQueries.length === 0) {
        throw new Error(`Active Local SLM refinement failed (Got: ${JSON.stringify(activeRes)})`);
    }

    console.log(`[Active Local SLM] Sub-queries Generated:\n  • ${activeRes.subQueries.join('\n  • ')}`);
    console.log('✓ LocalSlmBrain sub-query generation verified.');

    return true;
}
