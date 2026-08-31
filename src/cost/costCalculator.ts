/**
 * Tokonomics Centralized Cost & Financial Reconciliation Engine
 * Single authoritative source for LLM inference pricing and prompt cache economics.
 */

import { ModelProfile, ModelProfileRegistry } from '../tokenizer/modelProfile';

export interface ProjectedCostResult {
    rawCostUSD: number;
    optimizedCostUSD: number;
    savingsUSD: number;
    savingsPercentage: number;
    formattedSavings: string;
    isEstimate: true;
}

export interface ReconciledCostResult {
    actualRawCostUSD: number;
    actualOptimizedCostUSD: number;
    actualSavingsUSD: number;
    savingsPercentage: number;
    cacheDiscountUSD: number;
    formattedSavings: string;
    isEstimate: false;
}

export class CostCalculator {
    /**
     * Calculates projected compile-time cost estimate based on token counts and model pricing
     */
    public static calculateProjectedCost(
        rawTokens: number,
        optimizedTokens: number,
        cacheableTokens: number = 0,
        modelIdOrProfile: string | ModelProfile = 'claude-3-7-sonnet'
    ): ProjectedCostResult {
        const profile = typeof modelIdOrProfile === 'string'
            ? ModelProfileRegistry.getProfile(modelIdOrProfile)
            : modelIdOrProfile;

        const inputRate = profile.pricing.inputCostPer1M;

        // Raw unoptimized cost
        const rawCost = (rawTokens / 1_000_000) * inputRate;

        // Optimized cost based directly on actual token reduction (zero speculative caching)
        const optimizedCost = (optimizedTokens / 1_000_000) * inputRate;

        const savings = Math.max(0, rawCost - optimizedCost);
        const savingsPct = rawCost > 0 ? (savings / rawCost) * 100 : 0;

        return {
            rawCostUSD: Math.round(rawCost * 100_000) / 100_000,
            optimizedCostUSD: Math.round(optimizedCost * 100_000) / 100_000,
            savingsUSD: Math.round(savings * 100_000) / 100_000,
            savingsPercentage: Math.round(savingsPct * 10) / 10,
            formattedSavings: `~$${savings.toFixed(4)} (Estimated)`,
            isEstimate: true
        };
    }

    /**
     * Calculates actual reconciled cost post-inference using provider usage metadata
     */
    public static calculateReconciledCost(
        actualInputTokens: number,
        actualCachedTokens: number = 0,
        outputTokens: number = 0,
        unoptimizedTokensBaseline: number,
        modelIdOrProfile: string | ModelProfile = 'claude-3-7-sonnet'
    ): ReconciledCostResult {
        const profile = typeof modelIdOrProfile === 'string'
            ? ModelProfileRegistry.getProfile(modelIdOrProfile)
            : modelIdOrProfile;

        const inputRate = profile.pricing.inputCostPer1M;
        const cachedRate = profile.pricing.cachedInputCostPer1M;
        const outputRate = profile.pricing.outputCostPer1M;

        // Base unoptimized hypothetical cost
        const hypotheticalRawCost = ((unoptimizedTokensBaseline / 1_000_000) * inputRate) +
                                    ((outputTokens / 1_000_000) * outputRate);

        // Actual optimized cost incurred with provider cache hits
        const uncachedInput = Math.max(0, actualInputTokens - actualCachedTokens);
        const actualOptimizedCost = ((uncachedInput / 1_000_000) * inputRate) +
                                    ((actualCachedTokens / 1_000_000) * cachedRate) +
                                    ((outputTokens / 1_000_000) * outputRate);

        const cacheDiscount = actualCachedTokens > 0
            ? ((actualCachedTokens / 1_000_000) * (inputRate - cachedRate))
            : 0;

        const actualSavings = Math.max(0, hypotheticalRawCost - actualOptimizedCost);
        const savingsPct = hypotheticalRawCost > 0 ? (actualSavings / hypotheticalRawCost) * 100 : 0;

        return {
            actualRawCostUSD: Math.round(hypotheticalRawCost * 100_000) / 100_000,
            actualOptimizedCostUSD: Math.round(actualOptimizedCost * 100_000) / 100_000,
            actualSavingsUSD: Math.round(actualSavings * 100_000) / 100_000,
            savingsPercentage: Math.round(savingsPct * 10) / 10,
            cacheDiscountUSD: Math.round(cacheDiscount * 100_000) / 100_000,
            formattedSavings: `$${actualSavings.toFixed(4)} (Reconciled)`,
            isEstimate: false
        };
    }
}
