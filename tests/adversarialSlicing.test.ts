/**
 * Adversarial Dynamic Language Slicing & Confidence Fallback Tests
 * Verifies that dynamic features (reflection, dynamic dispatch, DI, dynamic imports,
 * event listeners, FFI, global state) properly lower slice confidence and trigger safe retention.
 */

import { SliceConfidenceEvaluator } from '../src/ast/sliceConfidence';

export async function runAdversarialSlicingTests(): Promise<boolean> {
    console.log('\n--- Running Adversarial Dynamic Language Slicing & Safety Tests ---');

    const evaluator = new SliceConfidenceEvaluator();

    // 1. Pure static code (Expected: High confidence >= 0.85 -> use_slice)
    const staticCode = `
        function calculateTotal(items: number[]): number {
            let sum = 0;
            for (const item of items) {
                sum += item;
            }
            return sum;
        }
    `;
    const staticEval = evaluator.evaluateSliceRisk(staticCode, 8, 4);
    if (staticEval.recommendedAction !== 'use_slice' || staticEval.sliceConfidence < 0.85) {
        throw new Error(`Static code failed confidence threshold (Got: ${JSON.stringify(staticEval)})`);
    }
    console.log(`[Static Code] Confidence: ${staticEval.sliceConfidence} ➔ Action: ${staticEval.recommendedAction}`);

    // 2. Reflection (eval / Reflect / Proxy) (Expected: Low confidence < 0.60 -> full_verbatim)
    const reflectionCode = `
        function executeDynamic(script: string, context: any) {
            const runner = eval(script);
            return Reflect.get(context, 'result');
        }
    `;
    const reflectEval = evaluator.evaluateSliceRisk(reflectionCode, 5, 2);
    if (reflectEval.recommendedAction !== 'full_verbatim' || !reflectEval.hasReflection) {
        throw new Error(`Reflection code failed to trigger full_verbatim fallback (Got: ${JSON.stringify(reflectEval)})`);
    }
    console.log(`[Reflection Code] Confidence: ${reflectEval.sliceConfidence} (Risk Factors: ${reflectEval.detectedRiskFactors.join(', ')}) ➔ Action: ${reflectEval.recommendedAction}`);

    // 3. Dynamic Dispatch (obj[method] / .apply / .call) (Expected: retain_lexical_scope or full_verbatim)
    const dynamicDispatchCode = `
        function dispatchHandler(target: any, methodName: string, args: any[]) {
            return target[methodName].apply(target, args);
        }
    `;
    const dispatchEval = evaluator.evaluateSliceRisk(dynamicDispatchCode, 4, 2);
    if (dispatchEval.recommendedAction === 'use_slice' || !dispatchEval.hasDynamicDispatch) {
        throw new Error(`Dynamic dispatch code failed to downscale slicing (Got: ${JSON.stringify(dispatchEval)})`);
    }
    console.log(`[Dynamic Dispatch] Confidence: ${dispatchEval.sliceConfidence} ➔ Action: ${dispatchEval.recommendedAction}`);

    // 4. Dependency Injection (@inject / container.resolve)
    const diCode = `
        @injectable()
        class PaymentService {
            constructor(@inject('Stripe') private client: StripeClient) {}
            public async process() {
                const helper = container.resolve('AuditLogger');
                return this.client.charge();
            }
        }
    `;
    const diEval = evaluator.evaluateSliceRisk(diCode, 9, 4);
    if (diEval.recommendedAction === 'use_slice' || !diEval.hasDependencyInjection) {
        throw new Error(`Dependency Injection code failed to downscale slicing (Got: ${JSON.stringify(diEval)})`);
    }
    console.log(`[Dependency Injection] Confidence: ${diEval.sliceConfidence} ➔ Action: ${diEval.recommendedAction}`);

    // 5. Dynamic Imports & Native FFI
    const ffiCode = `
        async function loadNativeAddon() {
            const mod = await import('native_crypto_' + process.platform);
            return ffi.Library(mod.path, { encrypt: ['string', ['string']] });
        }
    `;
    const ffiEval = evaluator.evaluateSliceRisk(ffiCode, 5, 2);
    if (ffiEval.recommendedAction !== 'full_verbatim' || !ffiEval.hasDynamicImports || !ffiEval.hasFfiOrNativeBindings) {
        throw new Error(`FFI & dynamic imports failed to trigger full_verbatim (Got: ${JSON.stringify(ffiEval)})`);
    }
    console.log(`[Dynamic Import & FFI] Confidence: ${ffiEval.sliceConfidence} ➔ Action: ${ffiEval.recommendedAction}`);

    // 6. Callbacks & Event Listeners
    const eventCode = `
        function setupWorker(emitter: EventEmitter) {
            emitter.on('task_done', (data) => processData(data));
            window.addEventListener('message', (e) => handleWindow(e));
        }
    `;
    const eventEval = evaluator.evaluateSliceRisk(eventCode, 5, 3);
    if (eventEval.recommendedAction === 'use_slice' || !eventEval.hasCallbacksOrEvents) {
        throw new Error(`Event listeners failed to trigger safe retention (Got: ${JSON.stringify(eventEval)})`);
    }
    console.log(`[Callbacks & Events] Confidence: ${eventEval.sliceConfidence} ➔ Action: ${eventEval.recommendedAction}`);

    console.log('✓ Adversarial Dynamic Language Slicing & Confidence Fallbacks verified.');
    return true;
}
