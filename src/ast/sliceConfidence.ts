/**
 * Tokonomics Dynamic Slice Confidence & Unknown Dependency Risk Evaluator
 * Evaluates semantic risks of incomplete slicing caused by dynamic language features
 * (reflection, dynamic dispatch, eval, global state, dependency injection, callbacks, dynamic imports, FFI).
 */

export interface SliceRiskAssessment {
    sliceConfidence: number;        // 0.0 to 1.0 (Higher is safer)
    unknownDependencyRisk: number;  // 0.0 to 1.0 (Lower is safer)
    hasReflection: boolean;
    hasDynamicDispatch: boolean;
    hasGlobalStateMutation: boolean;
    hasDependencyInjection: boolean;
    hasDynamicImports: boolean;
    hasCallbacksOrEvents: boolean;
    hasFfiOrNativeBindings: boolean;
    detectedRiskFactors: string[];
    recommendedAction: 'use_slice' | 'retain_lexical_scope' | 'full_verbatim';
}

export class SliceConfidenceEvaluator {
    private static REFLECTION_PATTERNS = [
        /\beval\s*\(/,
        /\bFunction\s*\(/,
        /\bgetattr\s*\(/,
        /\bsetattr\s*\(/,
        /\bReflect\./,
        /\bProxy\b/
    ];

    private static DYNAMIC_DISPATCH_PATTERNS = [
        /\[[a-zA-Z0-9_]+\]\s*\(/, // obj[methodName](...)
        /\.apply\s*\(/,
        /\.call\s*\(/,
        /\b__getitem__\b/
    ];

    private static GLOBAL_MUTATION_PATTERNS = [
        /\bprocess\.env\b/,
        /\bglobalThis\./,
        /\bwindow\./,
        /\bdocument\./,
        /\bglobal\s+[a-zA-Z0-9_]+/
    ];

    private static DI_PATTERNS = [
        /@inject\b/i,
        /@autowired\b/i,
        /container\.resolve\b/i,
        /injector\.get\b/i,
        /useContext\b/
    ];

    private static DYNAMIC_IMPORT_PATTERNS = [
        /\bimport\s*\(/,
        /\brequire\s*\(\s*[^'"`]/, // dynamic require(variable)
        /\b__import__\b/
    ];

    private static CALLBACK_EVENT_PATTERNS = [
        /\.on\s*\(/,
        /\.addEventListener\s*\(/,
        /\.subscribe\s*\(/,
        /\.emit\s*\(/,
        /\bEventEmitter\b/
    ];

    private static FFI_PATTERNS = [
        /\bffi\./,
        /\bnapi_/,
        /\bctypes\./,
        /\bWebAssembly\.instantiate/
    ];

    /**
     * Evaluates the risk profile of slicing a code segment
     */
    public evaluateSliceRisk(code: string, originalLineCount: number, slicedLineCount: number): SliceRiskAssessment {
        const detectedRiskFactors: string[] = [];

        let hasReflection = false;
        for (const p of SliceConfidenceEvaluator.REFLECTION_PATTERNS) {
            if (p.test(code)) { hasReflection = true; detectedRiskFactors.push('reflection'); break; }
        }

        let hasDynamicDispatch = false;
        for (const p of SliceConfidenceEvaluator.DYNAMIC_DISPATCH_PATTERNS) {
            if (p.test(code)) { hasDynamicDispatch = true; detectedRiskFactors.push('dynamic_dispatch'); break; }
        }

        let hasGlobalStateMutation = false;
        for (const p of SliceConfidenceEvaluator.GLOBAL_MUTATION_PATTERNS) {
            if (p.test(code)) { hasGlobalStateMutation = true; detectedRiskFactors.push('global_mutation'); break; }
        }

        let hasDependencyInjection = false;
        for (const p of SliceConfidenceEvaluator.DI_PATTERNS) {
            if (p.test(code)) { hasDependencyInjection = true; detectedRiskFactors.push('dependency_injection'); break; }
        }

        let hasDynamicImports = false;
        for (const p of SliceConfidenceEvaluator.DYNAMIC_IMPORT_PATTERNS) {
            if (p.test(code)) { hasDynamicImports = true; detectedRiskFactors.push('dynamic_imports'); break; }
        }

        let hasCallbacksOrEvents = false;
        for (const p of SliceConfidenceEvaluator.CALLBACK_EVENT_PATTERNS) {
            if (p.test(code)) { hasCallbacksOrEvents = true; detectedRiskFactors.push('callbacks_events'); break; }
        }

        let hasFfiOrNativeBindings = false;
        for (const p of SliceConfidenceEvaluator.FFI_PATTERNS) {
            if (p.test(code)) { hasFfiOrNativeBindings = true; detectedRiskFactors.push('ffi_native'); break; }
        }

        // Base confidence starts high for static code
        let confidence = 0.98;
        let risk = 0.02;

        if (hasReflection) {
            confidence -= 0.40;
            risk += 0.40;
        }
        if (hasDynamicDispatch) {
            confidence -= 0.25;
            risk += 0.25;
        }
        if (hasDynamicImports) {
            confidence -= 0.30;
            risk += 0.30;
        }
        if (hasFfiOrNativeBindings) {
            confidence -= 0.35;
            risk += 0.35;
        }
        if (hasDependencyInjection) {
            confidence -= 0.20;
            risk += 0.20;
        }
        if (hasCallbacksOrEvents) {
            confidence -= 0.15;
            risk += 0.15;
        }
        if (hasGlobalStateMutation) {
            confidence -= 0.15;
            risk += 0.15;
        }

        confidence = Math.max(0.0, Math.min(1.0, Math.round(confidence * 100) / 100));
        risk = Math.max(0.0, Math.min(1.0, Math.round(risk * 100) / 100));

        let recommendedAction: 'use_slice' | 'retain_lexical_scope' | 'full_verbatim' = 'use_slice';

        // Deterministic safety invariant: If confidence < 0.85, prevent aggressive slicing
        if (confidence >= 0.85) {
            recommendedAction = 'use_slice';
        } else if (confidence >= 0.60) {
            recommendedAction = 'retain_lexical_scope';
        } else {
            recommendedAction = 'full_verbatim';
        }

        return {
            sliceConfidence: confidence,
            unknownDependencyRisk: risk,
            hasReflection,
            hasDynamicDispatch,
            hasGlobalStateMutation,
            hasDependencyInjection,
            hasDynamicImports,
            hasCallbacksOrEvents,
            hasFfiOrNativeBindings,
            detectedRiskFactors,
            recommendedAction
        };
    }
}
