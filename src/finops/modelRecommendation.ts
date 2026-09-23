import { ModelPricingCurve } from '../tokenizer/modelProfile';
import { ratesForInput } from '../cost/costCalculator';

export interface ModelCandidate {
    id: string; name: string; maxInputTokens: number; maxOutputTokens: number;
    tools: boolean; vision: boolean; rates?: ModelPricingCurve;
}
export interface ModelRecommendation { modelId: string; message: string; savingsUSD: number; savingsPercent: number; }
/** Only compare discovered models against the current one. No assumed tier percentages. */
export function recommendModels(current: ModelCandidate, candidates: readonly ModelCandidate[],
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; requiresTools: boolean; requiresVision: boolean;
        requiresStructuredOutput?: boolean; qualitySensitive?: boolean }): ModelRecommendation[] {
    if (!current.rates || usage.requiresStructuredOutput || usage.qualitySensitive || (usage.cacheWriteTokens ?? 0) > 0) return [];
    if (![usage.inputTokens, usage.outputTokens, usage.cacheReadTokens ?? 0].every(n => Number.isSafeInteger(n) && n >= 0) ||
        (usage.cacheReadTokens ?? 0) > usage.inputTokens) return [];
    const cost = (m: ModelCandidate) => {
        const rates = ratesForInput(m.rates!, usage.inputTokens);
        // A cross-model cache hit is not assumed: compare uncached projected input.
        return (usage.inputTokens * rates.inputCostPer1M + usage.outputTokens * rates.outputCostPer1M) / 1000000;
    };
    const currentRates = ratesForInput(current.rates, usage.inputTokens);
    const cached = usage.cacheReadTokens ?? 0;
    const base = ((usage.inputTokens - cached) * currentRates.inputCostPer1M + cached * currentRates.cachedInputCostPer1M
        + usage.outputTokens * currentRates.outputCostPer1M) / 1000000;
    if (!(base > 0)) return [];
    return candidates.filter(m => m.id !== current.id && m.rates && m.maxInputTokens >= usage.inputTokens &&
        m.maxOutputTokens >= usage.outputTokens && (!usage.requiresTools || m.tools) && (!usage.requiresVision || m.vision))
        .map(m => ({ modelId: m.id, savingsUSD: base - cost(m), savingsPercent: (base - cost(m)) / base * 100,
            message: `${m.name}: lower projected cost with cold input, compared with the current model's observed cache mix; check task quality. Tokenization, output length and retries may differ.` }))
        .filter(r => r.savingsUSD > .10 && r.savingsPercent > 15).sort((a, b) => b.savingsUSD - a.savingsUSD).slice(0, 3);
}
