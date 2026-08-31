/**
 * Tokonomics Cache Alignment Planner
 * Partitions context into Static Cacheable Prefixes vs Dynamic Turn Payloads,
 * calculating prefix fingerprints (SHA-256) and provider cache discounts.
 */

import { ModelProfile } from '../tokenizer/modelProfile';
import { TokenCounter } from '../engine/tokenizer';

export interface CacheBand {
    type: 'static_system' | 'stable_tools' | 'dynamic_query';
    content: string;
    tokens: number;
    fingerprint: string;
    isCacheEligible: boolean;
}

export interface CachePlanResult {
    bands: CacheBand[];
    totalTokens: number;
    staticPrefixTokens: number;
    isCacheEligible: boolean;
    providerCacheHeader?: any;
    effectiveCostUSD: number;
    unoptimizedCostUSD: number;
    effectiveCostSavingsUSD: number;
    savingsPercentage: number;
}

export class CachePlanner {
    private hashContent(str: string): string {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    /**
     * Plans context alignment according to provider cache policies
     */
    public planContext(params: {
        systemPrompt: string;
        projectMemory?: string;
        toolSchemas?: string;
        userQuery: string;
        profile: ModelProfile;
    }): CachePlanResult {
        const { systemPrompt, projectMemory, toolSchemas, userQuery, profile } = params;

        // 1. Construct Static System Prefix (System instructions + Project Memory)
        const staticText = [systemPrompt, projectMemory].filter(Boolean).join('\n\n');
        const staticTokens = TokenCounter.countTokens(staticText);
        const staticBand: CacheBand = {
            type: 'static_system',
            content: staticText,
            tokens: staticTokens,
            fingerprint: this.hashContent(staticText),
            isCacheEligible: true
        };

        // 2. Construct Stable Tool Schema Band
        const toolText = toolSchemas || '';
        const toolTokens = TokenCounter.countTokens(toolText);
        const toolBand: CacheBand = {
            type: 'stable_tools',
            content: toolText,
            tokens: toolTokens,
            fingerprint: this.hashContent(toolText),
            isCacheEligible: toolTokens > 0
        };

        // 3. Construct Dynamic User Query Band (Ephemeral)
        const queryTokens = TokenCounter.countTokens(userQuery);
        const queryBand: CacheBand = {
            type: 'dynamic_query',
            content: userQuery,
            tokens: queryTokens,
            fingerprint: this.hashContent(userQuery),
            isCacheEligible: false
        };

        const totalPrefixTokens = staticTokens + toolTokens;
        const totalTokens = totalPrefixTokens + queryTokens;

        const isCacheEligible = profile.cachePolicy.supported && totalPrefixTokens >= profile.cachePolicy.minPrefixTokens;

        // 4. Calculate Effective Cost with Prompt Caching Discounts
        const rawInputRate = profile.pricing.inputCostPer1M;
        const cachedInputRate = profile.pricing.cachedInputCostPer1M;

        let effectiveCostUSD = 0;
        let unoptimizedCostUSD = (totalTokens / 1_000_000) * rawInputRate;

        if (isCacheEligible) {
            // Static prefix gets 90% discount on cache hits
            const prefixCost = (totalPrefixTokens / 1_000_000) * cachedInputRate;
            const queryCost = (queryTokens / 1_000_000) * rawInputRate;
            effectiveCostUSD = prefixCost + queryCost;
        } else {
            effectiveCostUSD = unoptimizedCostUSD;
        }

        const effectiveCostSavingsUSD = Math.max(0, unoptimizedCostUSD - effectiveCostUSD);
        const savingsPercentage = unoptimizedCostUSD > 0 ? Math.round((effectiveCostSavingsUSD / unoptimizedCostUSD) * 100) : 0;

        let providerCacheHeader: any = undefined;
        if (isCacheEligible && profile.provider === 'anthropic') {
            providerCacheHeader = { cache_control: { type: 'ephemeral' } };
        }

        return {
            bands: [staticBand, toolBand, queryBand],
            totalTokens,
            staticPrefixTokens: totalPrefixTokens,
            isCacheEligible,
            providerCacheHeader,
            effectiveCostUSD: Math.round(effectiveCostUSD * 100000) / 100000,
            unoptimizedCostUSD: Math.round(unoptimizedCostUSD * 100000) / 100000,
            effectiveCostSavingsUSD: Math.round(effectiveCostSavingsUSD * 100000) / 100000,
            savingsPercentage
        };
    }
}
