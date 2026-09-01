/**
 * Core type definitions for Enterprise AI Token Optimizer
 */

export type TargetProvider = 'auto' | 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'generic';

export interface CacheControlDirective {
    type: 'ephemeral';
}

export interface MessagePayload {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
    cacheControl?: CacheControlDirective;
}

export interface TokenOptimizationConfig {
    enableAstPruning: boolean;
    enableCacheAlignment: boolean;
    enableTextCompression: boolean;
    compressionRatio: number;
    targetProvider: TargetProvider;
    maxHistoryTurns: number;
    stripDiffsAndLogs: boolean;
    targetUpstreamModelFamily: string;
    enableDiffOutputOptimization?: boolean;
    enableModelRouting?: boolean;
    enableResponseCache?: boolean;
    tabRelevanceThreshold?: number;
    ramBudgetMB?: number;
    enableBackgroundRamWarming?: boolean;
    enableRamSemanticIndex?: boolean;
    workspaceContextMode?: 'off' | 'selection' | 'referenced' | 'automatic';
    includeUnsavedBuffers?: boolean;
}

export interface TokenStats {
    originalTokens: number;
    optimizedTokens: number;
    savedTokens: number;
    reductionPercentage: number;
    astSavedTokens: number;
    textCompressionSavedTokens: number;
    historyCompactedTokens: number;
    cacheAlignedTokens: number;
    estimatedCostSavedUsd: number;
    latencySavedMs: number;
    timestamp: number;
    detectedProvider?: string;
    detectedModelFamily?: string;
    language?: string;
}

export interface TimeWindowMetrics {
    requests: number;
    originalTokens: number;
    optimizedTokens: number;
    savedTokens: number;
    reductionPercentage: number;
    costSavedUsd: number;
    cacheEligibleRequests: number;
    cacheHitPercentage: number;
}

export interface CumulativeMetrics extends TimeWindowMetrics {
    installedAt: number;
    totalRequests: number;
    totalOriginalTokens: number;
    totalOptimizedTokens: number;
    totalSavedTokens: number;
    overallReductionPercentage: number;
    totalCostSavedUsd: number;
    cacheHitRatioEstimated: number;
}
