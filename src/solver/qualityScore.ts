/**
 * Tokonomics Multi-Factor Context Quality (CQ) Score Calculator
 * Evaluates semantic completeness of compiled context prior to LLM inference.
 * CQ = EvidenceCoverage * Relevance * DependencyCompleteness * InstructionIntegrity * Confidence
 */

export interface QualityMetricsInput {
    evidenceCoverage: number;       // 0.0 to 1.0 (from SufficiencyEngine)
    meanRelevance: number;          // 0.0 to 1.0 (from HybridRetriever & Reranker)
    dependencyCompleteness: number; // 0.0 to 1.0 (from WorkspaceGraph & SCIP)
    instructionIntegrity: number;   // 0.0 to 1.0 (system prompts and core instructions preserved)
    sliceConfidence: number;        // 0.0 to 1.0 (from SDG Program Slicer)
}

export interface ContextQualityReport {
    predictedCQ: number; // 0.0 to 100.0%
    rating: 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'RISKY' | 'DEFICIENT';
    breakdown: {
        evidenceCoverage: number;
        meanRelevance: number;
        dependencyCompleteness: number;
        instructionIntegrity: number;
        sliceConfidence: number;
    };
    recommendation: string;
}

export class ContextQualityEvaluator {
    /**
     * Calculates the composite Predicted Context Quality score
     */
    public evaluateQuality(input: QualityMetricsInput): ContextQualityReport {
        const ec = Math.max(0.0, Math.min(1.0, input.evidenceCoverage));
        const mr = Math.max(0.0, Math.min(1.0, input.meanRelevance));
        const dc = Math.max(0.0, Math.min(1.0, input.dependencyCompleteness));
        const ii = Math.max(0.0, Math.min(1.0, input.instructionIntegrity));
        const sc = Math.max(0.0, Math.min(1.0, input.sliceConfidence));

        // Geometric & weighted composite formulation:
        // Core factors (evidence, instruction) have multiplicative gating effect; other factors are weighted
        const coreGate = Math.sqrt(ec * ii);
        const weightedSupport = 0.4 * mr + 0.3 * dc + 0.3 * sc;
        const rawCQ = coreGate * (0.3 + 0.7 * weightedSupport);

        const predictedCQ = Math.round(rawCQ * 1000) / 10; // percentage e.g. 92.5%

        let rating: 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'RISKY' | 'DEFICIENT' = 'ADEQUATE';
        let recommendation = 'Context representation is balanced for inference.';

        if (predictedCQ >= 90.0) {
            rating = 'EXCELLENT';
            recommendation = 'Optimal semantic density with high evidence fidelity.';
        } else if (predictedCQ >= 75.0) {
            rating = 'GOOD';
            recommendation = 'Context contains sufficient evidence with minor secondary stubbing.';
        } else if (predictedCQ >= 60.0) {
            rating = 'ADEQUATE';
            recommendation = 'Core instructions intact, but some callee dependencies are abstracted.';
        } else if (predictedCQ >= 40.0) {
            rating = 'RISKY';
            recommendation = 'Risk of hallucination due to low dependency completeness or slice confidence.';
        } else {
            rating = 'DEFICIENT';
            recommendation = 'Critical evidence missing. Recommend expanding retrieval budget.';
        }

        return {
            predictedCQ,
            rating,
            breakdown: {
                evidenceCoverage: Math.round(ec * 100),
                meanRelevance: Math.round(mr * 100),
                dependencyCompleteness: Math.round(dc * 100),
                instructionIntegrity: Math.round(ii * 100),
                sliceConfidence: Math.round(sc * 100)
            },
            recommendation
        };
    }
}
