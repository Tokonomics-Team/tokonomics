/**
 * Type definitions for Provider Prompt Cache Alignment
 */

import { MessagePayload, TargetProvider } from '../types';

export interface ProviderCacheCapability {
    provider: string;
    modelId: string;
    minCacheableTokens: number;
    cacheWriteMultiplier: number;
    cacheReadMultiplier: number;
    ttlSeconds: number;
    cacheSemantics: 'explicit_breakpoint' | 'implicit_prefix';
    supportsExplicitBreakpoint: boolean;
    effectiveFrom: string;
    isDeprecated?: boolean;
    deprecationNotice?: string;
}

export interface CacheAlignmentResult {
    alignedMessages: MessagePayload[];
    totalTokens: number;
    staticPrefixTokens: number;
    historyTokens: number;
    dynamicQueryTokens: number;
    isCacheEligible: boolean;
    provider: TargetProvider;
    cachedBlocksCount: number;
    // Phase 4 FinOps fields
    toolSchemaDeduplicated: boolean;
    toolSchemaTokensSaved: number;
    cacheWriteAmortizationApplied: boolean;
    cacheWriteSuppressed: boolean;
    boundaryPadded: boolean;
    paddingTokensAdded: number;
    // Zero-padding context reorganization fields
    providerCapability?: ProviderCacheCapability;
    usefulContextReorganized?: boolean;
    reorganizedTokens?: number;
}

export interface CacheAlignerOptions {
    modelId?: string;
    minCachePrefixTokens?: number;
    targetProvider?: TargetProvider;
    enforceBlockBoundaries?: boolean;
    // Phase 4 enhancements
    hasNativeTools?: boolean;
    nativeToolCallingActive?: boolean;
    sessionTurns?: number;
    isPersistentSession?: boolean;
    hasInvariantTypes?: boolean;
    enableBoundaryPadding?: boolean;
    paddingTargetBoundary?: number;
    stableProjectMemory?: string;
}
