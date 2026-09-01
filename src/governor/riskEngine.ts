/**
 * Tokonomics Deterministic Risk Engine
 * Computes task risk level and enforces the critical safety invariant:
 * "High-risk task: correctness > token reduction (Risk overrides token-saving goals)"
 */

import { ContextGovernorInput, RiskLevel, OptimizationAggressiveness, TaskType } from './governorTypes';

export interface RiskEvaluationResult {
    riskLevel: RiskLevel;
    riskReasons: string[];
    adjustedAggressiveness: OptimizationAggressiveness;
    adjustedMaxReductionPct: number;
}

export class ContextRiskEngine {
    /**
     * Evaluates risk and adjusts optimization aggressiveness
     */
    public static evaluateRisk(
        input: ContextGovernorInput,
        taskType: TaskType,
        baseAggressiveness: OptimizationAggressiveness,
        baseMaxReductionPct: number
    ): RiskEvaluationResult {
        const reasons: string[] = [];
        let riskScore = 0; // 0 (low) to 10 (critical)

        // 1. Task Type Base Risk
        if (taskType === 'debug' || taskType === 'review') {
            riskScore += 2;
            reasons.push(`Task type '${taskType}' requires strict verification`);
        } else if (taskType === 'refactor') {
            riskScore += 1;
        }

        // 2. Public API Alterations
        if (input.isPublicApiModified) {
            riskScore += 3;
            reasons.push('Public API contracts or exported interfaces are modified');
        }

        // 3. Dynamic Constructs (dynamic dispatch, reflection, metaprogramming)
        if (input.hasDynamicConstructs) {
            riskScore += 2;
            reasons.push('Dynamic dispatch, reflection, or higher-order callbacks detected');
        }

        // 4. Low Slicing Confidence
        if (input.sliceConfidenceEstimate !== undefined && input.sliceConfidenceEstimate < 0.80) {
            riskScore += 3;
            reasons.push(`Low AST slice confidence (${Math.round(input.sliceConfidenceEstimate * 100)}% < 80%)`);
        }

        // 5. Unresolved Symbols
        if (input.unresolvedSymbolsCount && input.unresolvedSymbolsCount > 0) {
            riskScore += 2;
            reasons.push(`${input.unresolvedSymbolsCount} unresolved symbol references in workspace scope`);
        }

        // 6. Active Compiler Diagnostics or Failing Tests
        if (input.diagnosticsCount && input.diagnosticsCount > 2) {
            riskScore += 2;
            reasons.push(`${input.diagnosticsCount} active compilation errors/diagnostics`);
        }
        if (input.hasFailingTests) {
            riskScore += 2;
            reasons.push('Active failing unit test suite detected');
        }

        // Map score to RiskLevel
        let riskLevel: RiskLevel = 'low';
        if (riskScore >= 8) {
            riskLevel = 'critical';
        } else if (riskScore >= 4) {
            riskLevel = 'high';
        } else if (riskScore >= 2) {
            riskLevel = 'medium';
        }

        // CRITICAL INVARIANT: High risk forces conservative/none aggressiveness
        let adjustedAggressiveness = baseAggressiveness;
        let adjustedMaxReductionPct = baseMaxReductionPct;

        if (riskLevel === 'critical') {
            adjustedAggressiveness = 'none';
            adjustedMaxReductionPct = 0; // Preserve full context
            reasons.push('OVERRIDE: Critical risk forced full context preservation (0% reduction)');
        } else if (riskLevel === 'high') {
            adjustedAggressiveness = 'conservative';
            adjustedMaxReductionPct = Math.min(baseMaxReductionPct, 50);
            reasons.push('OVERRIDE: High risk constrained optimization to conservative mode (<=50% reduction)');
        } else if (riskLevel === 'medium' && baseAggressiveness === 'aggressive') {
            adjustedAggressiveness = 'balanced';
            adjustedMaxReductionPct = Math.min(baseMaxReductionPct, 70);
        }

        return {
            riskLevel,
            riskReasons: reasons,
            adjustedAggressiveness,
            adjustedMaxReductionPct
        };
    }
}
