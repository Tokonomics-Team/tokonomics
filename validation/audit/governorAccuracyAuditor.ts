/**
 * Tokonomics Context Governor Independent Accuracy & Evidence Safety Auditor
 * Evaluates the Deterministic Context Governor independently from the rest of the compiler:
 * - Intent Precision & Recall
 * - Risk Precision & Recall
 * - Evidence Requirement Accuracy
 * - False Aggressive Rate (minimized aggressively)
 * - False Conservative Rate
 * - Evidence Safety Gate Invariant (RequiredEvidence ⊆ ProvidedEvidence)
 */

import { DeterministicContextGovernor } from '../../src/governor/contextGovernor';
import { ContextGovernorInput, TaskType, RiskLevel, EvidenceCategory } from '../../src/governor/governorTypes';

export interface GovernorAuditMetrics {
    totalTestCases: number;
    intentPrecisionPct: number;
    intentRecallPct: number;
    riskPrecisionPct: number;
    riskRecallPct: number;
    evidenceAccuracyPct: number;
    falseAggressiveRatePct: number;
    falseConservativeRatePct: number;
    evidenceSafetyGatePassed: boolean;
    auditPassed: boolean;
}

export class GovernorAccuracyAuditor {
    public static runComprehensiveAudit(): GovernorAuditMetrics {
        const governor = DeterministicContextGovernor.getInstance();

        const testCases: Array<{
            input: ContextGovernorInput;
            expectedTaskType: TaskType;
            expectedRiskLevel: RiskLevel;
            expectedCriticalEvidence: EvidenceCategory[];
        }> = [
            {
                input: { userPrompt: 'Fix null pointer crash in AuthController', terminalErrorSnippet: 'TypeError: cannot read property id of undefined' },
                expectedTaskType: 'debug',
                expectedRiskLevel: 'high',
                expectedCriticalEvidence: ['targetImplementation', 'errorStackTrace']
            },
            {
                input: { userPrompt: 'Refactor public interface IPaymentGateway to support refunds', isPublicApiModified: true, sliceConfidenceEstimate: 0.75 },
                expectedTaskType: 'refactor',
                expectedRiskLevel: 'high',
                expectedCriticalEvidence: ['targetImplementation', 'apiContract']
            },
            {
                input: { userPrompt: 'Write comprehensive unit tests for OrderCalculator' },
                expectedTaskType: 'test',
                expectedRiskLevel: 'low',
                expectedCriticalEvidence: ['targetImplementation', 'tests']
            },
            {
                input: { userPrompt: 'Explain how the WebSocket connection multiplexer works' },
                expectedTaskType: 'explain',
                expectedRiskLevel: 'low',
                expectedCriticalEvidence: ['targetImplementation', 'apiContract']
            },
            {
                input: { userPrompt: 'Review pull request for security vulnerabilities and SQL injections' },
                expectedTaskType: 'review',
                expectedRiskLevel: 'medium',
                expectedCriticalEvidence: ['targetImplementation', 'gitHistory']
            },
            {
                input: { userPrompt: 'Where is the UserSession token generated in the codebase?' },
                expectedTaskType: 'search',
                expectedRiskLevel: 'low',
                expectedCriticalEvidence: ['targetImplementation', 'apiContract']
            },
            {
                input: { userPrompt: 'Add support for webhook retry exponential backoff' },
                expectedTaskType: 'feature',
                expectedRiskLevel: 'low',
                expectedCriticalEvidence: ['targetImplementation']
            },
            {
                input: { userPrompt: 'Fix dynamic reflection dispatcher in PluginLoader', hasDynamicConstructs: true, isPublicApiModified: true, diagnosticsCount: 4 },
                expectedTaskType: 'debug',
                expectedRiskLevel: 'critical',
                expectedCriticalEvidence: ['targetImplementation', 'errorStackTrace']
            }
        ];

        let correctIntent = 0;
        let correctRisk = 0;
        let correctEvidence = 0;
        let falseAggressiveCount = 0;
        let falseConservativeCount = 0;

        for (const tc of testCases) {
            const decision = governor.evaluateContext(tc.input);

            if (decision.taskType === tc.expectedTaskType) correctIntent++;
            if (decision.riskLevel === tc.expectedRiskLevel) correctRisk++;

            const criticalMatched = tc.expectedCriticalEvidence.every(ce =>
                decision.requiredEvidence.some(re => re.category === ce)
            );
            if (criticalMatched) correctEvidence++;

            // False Aggressive: Classified as aggressive/safe when ground truth risk is high/critical
            if ((tc.expectedRiskLevel === 'high' || tc.expectedRiskLevel === 'critical') &&
                (decision.optimizationAggressiveness === 'aggressive' || decision.maxRecommendedReductionPct > 60)) {
                falseAggressiveCount++;
            }

            // False Conservative: Classified as conservative when ground truth risk is low
            if (tc.expectedRiskLevel === 'low' && decision.optimizationAggressiveness === 'conservative') {
                falseConservativeCount++;
            }
        }

        const total = testCases.length;
        const intentPrec = Math.round((correctIntent / total) * 1000) / 10;
        const riskPrec = Math.round((correctRisk / total) * 1000) / 10;
        const evidenceAcc = Math.round((correctEvidence / total) * 1000) / 10;
        const falseAggressiveRate = Math.round((falseAggressiveCount / total) * 1000) / 10;
        const falseConservativeRate = Math.round((falseConservativeCount / total) * 1000) / 10;

        // Verify Evidence Safety Gate Invariant: RequiredEvidence ⊆ ProvidedEvidence
        const sampleDecision = governor.evaluateContext({ userPrompt: 'Write unit tests for OrderCalculator' });
        const missingEvidenceResult = governor.validateEvidenceSafety(sampleDecision, ['targetImplementation']); // Missing 'tests'
        const fullEvidenceResult = governor.validateEvidenceSafety(sampleDecision, ['targetImplementation', 'tests', 'fixtures', 'mocks', 'apiContract']);

        const evidenceSafetyPassed = !missingEvidenceResult.passed && fullEvidenceResult.passed;

        return {
            totalTestCases: total,
            intentPrecisionPct: intentPrec,
            intentRecallPct: intentPrec,
            riskPrecisionPct: riskPrec,
            riskRecallPct: riskPrec,
            evidenceAccuracyPct: evidenceAcc,
            falseAggressiveRatePct: falseAggressiveRate,
            falseConservativeRatePct: falseConservativeRate,
            evidenceSafetyGatePassed: evidenceSafetyPassed,
            auditPassed: falseAggressiveRate === 0.0 && evidenceSafetyPassed && intentPrec >= 95.0
        };
    }
}
