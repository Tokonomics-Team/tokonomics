/**
 * Type definitions for Provider Prompt Cache Alignment
 */

import { MessagePayload, TargetProvider } from '../types';

export interface CacheAlignmentResult {
    alignedMessages: MessagePayload[];
    totalTokens: number;
    staticPrefixTokens: number;
    historyTokens: number;
    dynamicQueryTokens: number;
    isCacheEligible: boolean;
    provider: TargetProvider;
    cachedBlocksCount: number;
}

export interface CacheAlignerOptions {
    minCachePrefixTokens?: number;
    targetProvider?: TargetProvider;
    enforceBlockBoundaries?: boolean;
}
