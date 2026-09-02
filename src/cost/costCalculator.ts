/** Provider-specific projected and verified cost accounting. */

import { ModelProfile } from '../tokenizer/modelProfile';
import { PricingCatalogEntry, defaultPricingCatalog } from './pricingCatalog';

export interface ProjectedCostResult {
    rawCostUSD: number;
    optimizedCostUSD: number;
    savingsUSD: number;
    savingsPercentage: number;
    formattedSavings: string;
    cacheEligibilityTokens: number;
    cacheReadAssumed: false;
    pricingCatalogVersion: string;
    pricingSource: string;
    currency: string;
    pricingAvailable: boolean;
    isEstimate: true;
}

export interface VerifiedProviderUsage {
    requestId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
    cacheStorageTokenHours?: number;
    additionalModelCostUSD?: number;
    optimizationComputeCostUSD?: number;
    source: 'provider-reported';
}

export interface ReconciledCostResult {
    requestId?: string;
    actualRawCostUSD: number;
    actualOptimizedCostUSD: number;
    actualSavingsUSD: number;
    savingsPercentage: number;
    cacheDiscountUSD: number;
    cacheReadCostUSD: number;
    cacheWriteCostUSD: number;
    outputCostUSD: number;
    additionalCostUSD: number;
    pricingCatalogVersion: string;
    pricingSource: string;
    currency: string;
    formattedSavings: string;
    usageSource: 'provider-reported' | 'fixture';
    isEstimate: false;
}

export class CostCalculator {
    /**
     * Compile-time projection. Cache eligibility is recorded, but no cache-read
     * discount is claimed before provider usage confirms a hit.
     */
    public static calculateProjectedCost(
        rawTokens: number,
        optimizedTokens: number,
        cacheableTokens: number = 0,
        modelIdOrProfile: string | ModelProfile = 'claude-3-7-sonnet'
    ): ProjectedCostResult {
        this.assertTokenCount(rawTokens, 'rawTokens');
        this.assertTokenCount(optimizedTokens, 'optimizedTokens');
        this.assertTokenCount(cacheableTokens, 'cacheableTokens');
        const pricing = this.resolveProjectedPricing(modelIdOrProfile);
        if (!pricing) return {
            rawCostUSD: 0,
            optimizedCostUSD: 0,
            savingsUSD: 0,
            savingsPercentage: 0,
            formattedSavings: 'Unavailable (no versioned model price)',
            cacheEligibilityTokens: cacheableTokens,
            cacheReadAssumed: false,
            pricingCatalogVersion: 'unavailable',
            pricingSource: 'unavailable',
            currency: 'USD',
            pricingAvailable: false,
            isEstimate: true
        };
        const rawCost = this.tokenCost(rawTokens, pricing.rates.inputCostPer1M);
        const optimizedCost = this.tokenCost(optimizedTokens, pricing.rates.inputCostPer1M);
        const savings = rawCost - optimizedCost;
        const savingsPct = rawCost > 0 ? (savings / rawCost) * 100 : 0;
        return {
            rawCostUSD: roundMoney(rawCost),
            optimizedCostUSD: roundMoney(optimizedCost),
            savingsUSD: roundMoney(savings),
            savingsPercentage: roundPercent(savingsPct),
            formattedSavings: `~$${savings.toFixed(4)} (Estimated; cache hit not assumed)`,
            cacheEligibilityTokens: cacheableTokens,
            cacheReadAssumed: false,
            pricingCatalogVersion: pricing.catalogVersion,
            pricingSource: pricing.sourceUrl,
            currency: pricing.currency,
            pricingAvailable: true,
            isEstimate: true
        };
    }

    /** Fixture-compatible helper. Production paths must use verified reconciliation. */
    public static calculateReconciledCost(
        actualInputTokens: number,
        actualCachedTokens: number = 0,
        outputTokens: number = 0,
        unoptimizedTokensBaseline: number,
        modelIdOrProfile: string | ModelProfile = 'claude-3-7-sonnet'
    ): ReconciledCostResult {
        return this.calculateReconciled({
            inputTokens: actualInputTokens,
            outputTokens,
            cacheReadInputTokens: actualCachedTokens,
            cacheWriteInputTokens: 0,
            additionalModelCostUSD: 0,
            optimizationComputeCostUSD: 0
        }, unoptimizedTokensBaseline, this.resolvePricing(modelIdOrProfile), 'fixture');
    }

    public static calculateVerifiedReconciledCost(
        usage: VerifiedProviderUsage,
        unoptimizedTokensBaseline: number
    ): ReconciledCostResult {
        if (usage.source !== 'provider-reported') throw new Error('Reconciled cost requires provider-reported usage.');
        const result = this.calculateReconciled(usage, unoptimizedTokensBaseline,
            defaultPricingCatalog.resolveStrict(usage.model, usage.provider), 'provider-reported');
        return { ...result, requestId: usage.requestId };
    }

    public static parseVerifiedProviderUsage(
        rawUsage: any,
        requestId: string,
        provider: string,
        model: string
    ): VerifiedProviderUsage | undefined {
        if (!rawUsage || typeof rawUsage !== 'object') return undefined;
        const inputTokens = numeric(rawUsage.inputTokens, rawUsage.input_tokens, rawUsage.prompt_tokens);
        const outputTokens = numeric(rawUsage.outputTokens, rawUsage.output_tokens, rawUsage.completion_tokens);
        if (inputTokens === undefined || outputTokens === undefined) return undefined;
        const cacheReadInputTokens = numeric(
            rawUsage.cachedTokens,
            rawUsage.cache_read_input_tokens,
            rawUsage.prompt_tokens_details?.cached_tokens
        ) ?? 0;
        const cacheWriteInputTokens = numeric(rawUsage.cacheWriteTokens, rawUsage.cache_creation_input_tokens) ?? 0;
        return {
            requestId,
            provider,
            model,
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheWriteInputTokens,
            cacheStorageTokenHours: numeric(rawUsage.cacheStorageTokenHours),
            additionalModelCostUSD: numeric(rawUsage.additionalModelCostUSD) ?? 0,
            optimizationComputeCostUSD: numeric(rawUsage.optimizationComputeCostUSD) ?? 0,
            source: 'provider-reported'
        };
    }

    private static calculateReconciled(
        usage: Pick<VerifiedProviderUsage, 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheWriteInputTokens' | 'cacheStorageTokenHours' | 'additionalModelCostUSD' | 'optimizationComputeCostUSD'>,
        baselineInputTokens: number,
        pricing: PricingCatalogEntry,
        usageSource: 'provider-reported' | 'fixture'
    ): ReconciledCostResult {
        for (const [name, count] of Object.entries({
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheWriteInputTokens: usage.cacheWriteInputTokens,
            baselineInputTokens
        })) this.assertTokenCount(count, name);
        if (usage.cacheReadInputTokens + usage.cacheWriteInputTokens > usage.inputTokens) {
            throw new Error('Cache read and write tokens cannot exceed total input tokens.');
        }

        const rates = pricing.rates;
        const uncachedTokens = usage.inputTokens - usage.cacheReadInputTokens - usage.cacheWriteInputTokens;
        const uncachedCost = this.tokenCost(uncachedTokens, rates.inputCostPer1M);
        const cacheReadCost = this.tokenCost(usage.cacheReadInputTokens, rates.cachedInputCostPer1M);
        const cacheWriteCost = this.tokenCost(usage.cacheWriteInputTokens, rates.cacheWriteCostPer1M ?? rates.inputCostPer1M);
        const outputCost = this.tokenCost(usage.outputTokens, rates.outputCostPer1M);
        const storageCost = this.tokenCost(usage.cacheStorageTokenHours ?? 0, rates.cacheStorageCostPerHourPer1M ?? 0);
        const additionalCost = (usage.additionalModelCostUSD ?? 0) + (usage.optimizationComputeCostUSD ?? 0) + storageCost;
        const actualOptimizedCost = uncachedCost + cacheReadCost + cacheWriteCost + outputCost + additionalCost;
        const hypotheticalRawCost = this.tokenCost(baselineInputTokens, rates.inputCostPer1M) + outputCost;
        const savings = hypotheticalRawCost - actualOptimizedCost;
        const savingsPct = hypotheticalRawCost > 0 ? (savings / hypotheticalRawCost) * 100 : 0;
        const cacheDiscount = this.tokenCost(usage.cacheReadInputTokens, rates.inputCostPer1M) - cacheReadCost;
        return {
            actualRawCostUSD: roundMoney(hypotheticalRawCost),
            actualOptimizedCostUSD: roundMoney(actualOptimizedCost),
            actualSavingsUSD: roundMoney(savings),
            savingsPercentage: roundPercent(savingsPct),
            cacheDiscountUSD: roundMoney(cacheDiscount),
            cacheReadCostUSD: roundMoney(cacheReadCost),
            cacheWriteCostUSD: roundMoney(cacheWriteCost),
            outputCostUSD: roundMoney(outputCost),
            additionalCostUSD: roundMoney(additionalCost),
            pricingCatalogVersion: pricing.catalogVersion,
            pricingSource: pricing.sourceUrl,
            currency: pricing.currency,
            formattedSavings: `$${savings.toFixed(4)} (Reconciled)`,
            usageSource,
            isEstimate: false
        };
    }

    private static resolvePricing(modelIdOrProfile: string | ModelProfile): PricingCatalogEntry {
        if (typeof modelIdOrProfile === 'string') return modelIdOrProfile === 'generic' || modelIdOrProfile === 'generic-llm'
            ? defaultPricingCatalog.resolve('generic-llm')
            : defaultPricingCatalog.resolveStrict(modelIdOrProfile);
        return {
            id: `profile:${modelIdOrProfile.provider}:${modelIdOrProfile.modelId}`,
            provider: modelIdOrProfile.provider,
            modelId: modelIdOrProfile.modelId,
            aliases: [],
            currency: 'USD',
            effectiveFrom: 'profile-supplied',
            catalogVersion: 'runtime-profile',
            sourceUrl: 'runtime:model-profile',
            rates: modelIdOrProfile.pricing
        };
    }

    private static resolveProjectedPricing(modelIdOrProfile: string | ModelProfile): PricingCatalogEntry | undefined {
        if (typeof modelIdOrProfile !== 'string') return this.resolvePricing(modelIdOrProfile);
        if (modelIdOrProfile === 'generic' || modelIdOrProfile === 'generic-llm') return defaultPricingCatalog.resolve('generic-llm');
        return defaultPricingCatalog.find(modelIdOrProfile);
    }

    private static tokenCost(tokens: number, perMillion: number): number { return (tokens / 1_000_000) * perMillion; }
    private static assertTokenCount(value: number, name: string): void {
        if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new Error(`${name} must be a non-negative integer.`);
    }
}

function numeric(...values: unknown[]): number | undefined {
    const value = values.find(candidate => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0);
    return typeof value === 'number' ? Math.floor(value) : undefined;
}

function roundMoney(value: number): number { return Math.round(value * 100_000) / 100_000; }
function roundPercent(value: number): number { return Math.round(value * 10) / 10; }
