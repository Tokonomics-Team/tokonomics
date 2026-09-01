/**
 * Tokonomics Deterministic Context Governor (Production Safe)
 * Ultra-fast (<0.05ms) deterministic intelligence layer for task intent inference,
 * evidence planning, risk assessment, and safety gating without any LLM/SLM dependency.
 */

import {
    ContextGovernorInput,
    ContextGovernorDecision,
    EvidenceSafetyResult,
    EvidenceCategory
} from './governorTypes';
import { IntentExtractor } from './intentExtractor';
import { EvidencePolicyMatrix } from './evidencePolicy';
import { ContextRiskEngine } from './riskEngine';
import { EvidenceSafetyGate } from './evidenceSafetyGate';

export class DeterministicContextGovernor {
    private static instance: DeterministicContextGovernor;

    public static getInstance(): DeterministicContextGovernor {
        if (!this.instance) {
            this.instance = new DeterministicContextGovernor();
        }
        return this.instance;
    }

    /**
     * Evaluates task context and produces a deterministic ContextGovernorDecision
     */
    public evaluateContext(input: ContextGovernorInput): ContextGovernorDecision {
        // 1. Deterministic Intent Extraction
        const intent = IntentExtractor.extractIntent(input);

        // 2. Data-Driven Evidence Policy Matrix
        const policy = EvidencePolicyMatrix.getPolicy(intent.taskType);

        // 3. Deterministic Risk Evaluation & Safety Overrides
        const risk = ContextRiskEngine.evaluateRisk(
            input,
            intent.taskType,
            policy.defaultAggressiveness,
            policy.maxReductionPct
        );

        return {
            taskType: intent.taskType,
            confidence: intent.confidence,
            riskLevel: risk.riskLevel,
            riskReasons: risk.riskReasons,
            retrievalMode: policy.retrievalMode,
            requiredEvidence: policy.requiredEvidence,
            optimizationAggressiveness: risk.adjustedAggressiveness,
            maxRecommendedReductionPct: risk.adjustedMaxReductionPct,
            enforcePreservationGate: true,
            timestamp: Date.now()
        };
    }

    /**
     * Validates whether the compiled context satisfies required evidence
     */
    public validateEvidenceSafety(
        decision: ContextGovernorDecision,
        providedEvidence: EvidenceCategory[]
    ): EvidenceSafetyResult {
        return EvidenceSafetyGate.auditEvidence(decision.requiredEvidence, providedEvidence);
    }
}
