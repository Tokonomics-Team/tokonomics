/**
 * Intelligent Model Router v3.0 (Suggestion-Only)
 * 
 * Analyzes prompt complexity to classify tasks into tiers and suggest
 * the most cost-effective model. Displays a suggestion in the status bar
 * without programmatically switching models (VS Code API limitation).
 * 
 * Industry reports show 60-80% cost reduction from proper model routing.
 */

import { TokenCounter } from './tokenizer';

export type TaskComplexity = 'low' | 'medium' | 'high';
export type ModelTier = 'flash' | 'standard' | 'reasoning';

export interface RoutingSuggestion {
    complexity: TaskComplexity;
    suggestedTier: ModelTier;
    tierLabel: string;
    confidencePercent: number;
    estimatedCostSavingsPercent: number;
    reasoning: string;
    complexitySignals: ComplexitySignal[];
}

export interface ComplexitySignal {
    signal: string;
    weight: number;
    detected: boolean;
}

/** Pricing tiers (relative cost multipliers) */
const TIER_COST_MULTIPLIER: Record<ModelTier, number> = {
    flash: 0.05,      // Flash/Haiku: ~$0.25/MTok
    standard: 0.30,   // Sonnet/GPT-4o: ~$3/MTok
    reasoning: 1.00   // Opus/o3: ~$15/MTok
};

const TIER_LABELS: Record<ModelTier, string> = {
    flash: '⚡ Flash/Haiku Tier (cheapest)',
    standard: '🔷 Standard/Sonnet Tier',
    reasoning: '🧠 Reasoning/Opus Tier (most capable)'
};

// --- Signal Detection Patterns ---

/** Low-complexity signals (route to Flash/Haiku) */
const LOW_COMPLEXITY_SIGNALS: Array<{ pattern: RegExp | string; signal: string }> = [
    { pattern: /\b(format|lint|indent|align|spacing)\b/i, signal: 'Formatting/style task' },
    { pattern: /\b(import|require|include|use)\b/i, signal: 'Import statement task' },
    { pattern: /\b(rename|typo|spelling|capitalize)\b/i, signal: 'Trivial rename/typo fix' },
    { pattern: /\b(comment|doc(string)?|jsdoc|tsdoc)\b/i, signal: 'Documentation/comment task' },
    { pattern: /\b(boilerplate|scaffold|template|stub)\b/i, signal: 'Boilerplate generation' },
    { pattern: /\b(type\s*annotation|add\s*types?)\b/i, signal: 'Type annotation task' },
];

/** High-complexity signals (route to Reasoning/Opus) */
const HIGH_COMPLEXITY_SIGNALS: Array<{ pattern: RegExp | string; signal: string }> = [
    { pattern: /\b(architect(ure)?|design\s*(pattern|system)?|system\s*design)\b/i, signal: 'Architecture/design task' },
    { pattern: /\b(debug|investigate|diagnose|root\s*cause)\b/i, signal: 'Debugging/investigation' },
    { pattern: /\b(security|vulnerabilit|exploit|injection|xss|csrf)\b/i, signal: 'Security analysis' },
    { pattern: /\b(performance|optimize|bottleneck|profil(e|ing))\b/i, signal: 'Performance optimization' },
    { pattern: /\b(concurren(cy|t)|race\s*condition|deadlock|mutex)\b/i, signal: 'Concurrency task' },
    { pattern: /\b(migrat(e|ion)|upgrade|backwards?\s*compat)\b/i, signal: 'Migration/upgrade task' },
    { pattern: /\b(explain\s*(why|how)|reason(ing)?|analyz(e|is))\b/i, signal: 'Deep reasoning/analysis' },
    { pattern: /\b(refactor\s*(entire|whole|all|major))\b/i, signal: 'Major refactoring' },
    { pattern: /\b(across\s*(multiple|many)\s*files|multi.?file)\b/i, signal: 'Multi-file operation' },
];

export class ModelRouter {

    /**
     * Analyze prompt complexity and suggest the most cost-effective model tier.
     */
    public static analyzeComplexity(
        userQuery: string,
        referencedFileCount: number = 0,
        conversationTurnCount: number = 0
    ): RoutingSuggestion {
        const queryTokens = TokenCounter.countTokens(userQuery);
        const signals: ComplexitySignal[] = [];
        let lowScore = 0;
        let highScore = 0;

        // 1. Check low-complexity signals
        for (const { pattern, signal } of LOW_COMPLEXITY_SIGNALS) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
            const detected = regex.test(userQuery);
            signals.push({ signal, weight: detected ? 1 : 0, detected });
            if (detected) lowScore += 1;
        }

        // 2. Check high-complexity signals
        for (const { pattern, signal } of HIGH_COMPLEXITY_SIGNALS) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
            const detected = regex.test(userQuery);
            signals.push({ signal, weight: detected ? 1 : 0, detected });
            if (detected) highScore += 1;
        }

        // 3. Contextual complexity boosters
        if (queryTokens > 200) {
            highScore += 1;
            signals.push({ signal: 'Long prompt (>200 tokens)', weight: 1, detected: true });
        }
        if (referencedFileCount > 3) {
            highScore += 1;
            signals.push({ signal: `Multiple files referenced (${referencedFileCount})`, weight: 1, detected: true });
        }
        if (conversationTurnCount > 10) {
            highScore += 0.5;
            signals.push({ signal: `Deep conversation (${conversationTurnCount} turns)`, weight: 0.5, detected: true });
        }

        // 4. Classify
        let complexity: TaskComplexity;
        let suggestedTier: ModelTier;
        let reasoning: string;
        let confidence: number;

        if (highScore >= 2 && highScore > lowScore) {
            complexity = 'high';
            suggestedTier = 'reasoning';
            confidence = Math.min(95, 60 + highScore * 10);
            reasoning = `Detected ${highScore} high-complexity signals. This task benefits from a reasoning-capable model.`;
        } else if (lowScore >= 2 && lowScore > highScore) {
            complexity = 'low';
            suggestedTier = 'flash';
            confidence = Math.min(95, 60 + lowScore * 10);
            reasoning = `Detected ${lowScore} low-complexity signals. A lightweight Flash/Haiku model can handle this at ~95% lower cost.`;
        } else {
            complexity = 'medium';
            suggestedTier = 'standard';
            confidence = 65;
            reasoning = 'Mixed or neutral complexity signals. A standard-tier model provides the best cost-quality balance.';
        }

        // Calculate estimated savings vs always using reasoning tier
        const savingsVsReasoning = Math.round(
            (1 - TIER_COST_MULTIPLIER[suggestedTier] / TIER_COST_MULTIPLIER['reasoning']) * 100
        );

        return {
            complexity,
            suggestedTier,
            tierLabel: TIER_LABELS[suggestedTier],
            confidencePercent: confidence,
            estimatedCostSavingsPercent: savingsVsReasoning,
            reasoning,
            complexitySignals: signals.filter(s => s.detected)
        };
    }

    /**
     * Generate a user-friendly status bar suggestion string.
     */
    public static formatSuggestion(suggestion: RoutingSuggestion): string {
        if (suggestion.suggestedTier === 'flash') {
            return `💡 This task could use Flash tier — save ~${suggestion.estimatedCostSavingsPercent}% cost`;
        } else if (suggestion.suggestedTier === 'reasoning') {
            return `🧠 Complex task detected — Reasoning tier recommended for best results`;
        }
        return `🔷 Standard tier — good cost-quality balance`;
    }
}
