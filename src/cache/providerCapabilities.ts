/**
 * Tokonomics 7.0 Provider KV-Cache Capability Registry
 * 
 * Accurately models provider- and model-specific cache capabilities:
 * - Minimum cacheable prompt token thresholds (e.g. 512 for Sonnet 3.7 / Haiku 3.5 vs 1024 for legacy)
 * - Cache write surcharges vs read multipliers
 * - Time-to-live (TTL) and breakpoint semantics (explicit vs implicit)
 * - Model deprecation status (e.g. Claude Opus 4 retired June 15, 2026)
 */

import { ProviderCacheCapability } from './types';

export class ProviderCacheRegistry {
    private static readonly CAPABILITIES: readonly ProviderCacheCapability[] = Object.freeze([
        {
            provider: 'anthropic',
            modelId: 'claude-3-7-sonnet',
            minCacheableTokens: 512,
            cacheWriteMultiplier: 1.25,
            cacheReadMultiplier: 0.10,
            ttlSeconds: 300,
            cacheSemantics: 'explicit_breakpoint',
            supportsExplicitBreakpoint: true,
            effectiveFrom: '2025-02-19',
            isDeprecated: false
        },
        {
            provider: 'anthropic',
            modelId: 'claude-3-5-haiku',
            minCacheableTokens: 2048,
            cacheWriteMultiplier: 1.25,
            cacheReadMultiplier: 0.10,
            ttlSeconds: 300,
            cacheSemantics: 'explicit_breakpoint',
            supportsExplicitBreakpoint: true,
            effectiveFrom: '2024-10-22',
            isDeprecated: false
        },
        {
            provider: 'anthropic',
            modelId: 'claude-opus-4',
            minCacheableTokens: 1024,
            cacheWriteMultiplier: 1.25,
            cacheReadMultiplier: 0.10,
            ttlSeconds: 300,
            cacheSemantics: 'explicit_breakpoint',
            supportsExplicitBreakpoint: true,
            effectiveFrom: '2025-05-22',
            isDeprecated: true,
            deprecationNotice: 'Claude Opus 4 was retired on June 15, 2026. Migrate to Claude 3.7 Sonnet or newer.'
        },
        {
            provider: 'openai',
            modelId: 'gpt-4o',
            minCacheableTokens: 1024,
            cacheWriteMultiplier: 1.0,
            cacheReadMultiplier: 0.50,
            ttlSeconds: 3600,
            cacheSemantics: 'implicit_prefix',
            supportsExplicitBreakpoint: false,
            effectiveFrom: '2024-11-20',
            isDeprecated: false
        },
        {
            provider: 'deepseek',
            modelId: 'deepseek-chat',
            minCacheableTokens: 64,
            cacheWriteMultiplier: 1.0,
            cacheReadMultiplier: 0.10,
            ttlSeconds: 3600,
            cacheSemantics: 'implicit_prefix',
            supportsExplicitBreakpoint: false,
            effectiveFrom: '2024-12-26',
            isDeprecated: false
        },
        {
            provider: 'google',
            modelId: 'gemini-2.5-pro',
            minCacheableTokens: 32768,
            cacheWriteMultiplier: 1.0,
            cacheReadMultiplier: 0.25,
            ttlSeconds: 3600,
            cacheSemantics: 'explicit_breakpoint',
            supportsExplicitBreakpoint: true,
            effectiveFrom: '2025-03-25',
            isDeprecated: false
        },
        {
            provider: 'generic',
            modelId: 'generic-llm',
            minCacheableTokens: 1024,
            cacheWriteMultiplier: 1.0,
            cacheReadMultiplier: 0.50,
            ttlSeconds: 3600,
            cacheSemantics: 'implicit_prefix',
            supportsExplicitBreakpoint: false,
            effectiveFrom: '2026-09-02',
            isDeprecated: false
        }
    ]);

    public static resolve(modelIdOrAlias?: string, provider?: string): ProviderCacheCapability {
        const needle = (modelIdOrAlias || '').toLowerCase().trim();
        const providerNeedle = (provider || '').toLowerCase().trim();
        if (needle) {
            const matched = this.CAPABILITIES.find(capability => (!providerNeedle || capability.provider === providerNeedle)
                && (needle === capability.modelId || needle.startsWith(capability.modelId + '-')));
            if (matched) return { ...matched };
            // Unknown model thresholds are unavailable, not inherited from an unrelated model.
            return { ...this.CAPABILITIES.find(capability => capability.provider === 'generic')!,
                provider: providerNeedle || 'generic', modelId: needle,
                minCacheableTokens: Number.MAX_SAFE_INTEGER, supportsExplicitBreakpoint: false };
        }
        // If no specific model is requested, resolve the default capability for the provider
        if (providerNeedle) {
            const providerDefault = this.CAPABILITIES.find(capability => capability.provider === providerNeedle);
            if (providerDefault) return { ...providerDefault };
        }
        return { ...this.CAPABILITIES.find(capability => capability.provider === 'generic')! };
    }
}
