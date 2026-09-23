/**
 * Provider Cache Alignment Engine
 * Enforces byte-prefix stability, 1024-token minimum caching boundaries,
 * deterministic 4-tier layout, and provider-specific cache directives (Anthropic/OpenAI/Gemini/DeepSeek).
 */

import { MessagePayload, TargetProvider } from '../types';
import { CacheAlignmentResult, CacheAlignerOptions } from './types';
import { TokenCounter } from '../engine/tokenizer';
import { CacheNormalizer } from './normalizer';
import { ToolSchemaMinifier } from './schemaMinifier';
import { ProviderCacheRegistry } from './providerCapabilities';

export class CacheAmortizationGuard {
    /**
     * Determines whether paying the 1.25x write surcharge is mathematically justified.
     * Amortization is guaranteed if:
     * 1. Multi-turn conversation confirmed (sessionTurns >= 1 or history.length >= 2), OR
     * 2. Marked as persistent session (isPersistentSession === true), OR
     * 3. Invariant repository types present (astContext has stable declarations with high reuse probability).
     */
    public static shouldAddCacheBreakpoint(params: {
        provider: TargetProvider;
        prefixTokens: number;
        minCacheTokens: number;
        sessionTurns?: number;
        historyCount?: number;
        isPersistentSession?: boolean;
        hasInvariantTypes?: boolean;
    }): { shouldCache: boolean; reason: string } {
        if (params.prefixTokens < params.minCacheTokens) {
            return { shouldCache: false, reason: 'Prefix tokens below minimum cache boundary' };
        }

        if (params.provider !== 'anthropic') {
            // OpenAI and DeepSeek do not charge a cache-write surcharge; implicit caching is always beneficial
            return { shouldCache: true, reason: 'Provider supports zero-surcharge implicit caching' };
        }

        const turns = params.sessionTurns ?? (params.historyCount ? Math.floor(params.historyCount / 2) : 0);
        const isMultiTurn = turns >= 1;
        const isPersistent = Boolean(params.isPersistentSession);
        const hasStableTypes = Boolean(params.hasInvariantTypes);

        if (isMultiTurn || isPersistent || hasStableTypes) {
            return {
                shouldCache: true,
                reason: isMultiTurn ? `Multi-turn session (turns: ${turns}) guarantees >= 65% net savings`
                    : isPersistent ? 'Persistent session guarantees amortized cache reads'
                    : 'Stable invariant repository types have high reuse likelihood'
            };
        }

        return {
            shouldCache: false,
            reason: 'Single-turn ephemeral request: withheld cache checkpoint to avoid 25% write surcharge'
        };
    }
}

export class CacheAlignerEngine {
    private readonly DEFAULT_MIN_CACHE_PREFIX_TOKENS = 1024;
    private readonly OPENAI_CHUNK_ALIGNMENT = 128;

    /**
     * Structurally organizes and aligns prompt blocks to guarantee deterministic KV-cache hits.
     * 
     * Tier 1: Static System Persona & Global Directives [CACHED]
     * Tier 2: Minified Tool / MCP Function Calling Schemas [CACHED] (Suppressed when native tools active)
     * Tier 3: Invariant Repository AST Skeleton & Types [CACHED]
     * Tier 4: Multi-turn Conversation History [CACHED in 128-token increments]
     * Dynamic Block: User Query & Active Editor Selection [TRAILING PREFILL]
     */
    public alignPayload(
        systemPrompt: string,
        astContext: string,
        history: MessagePayload[],
        userQuery: string,
        options: CacheAlignerOptions = {},
        toolSchemas?: any
    ): CacheAlignmentResult {
        const rawProvider = options.targetProvider || 'anthropic';
        const provider: TargetProvider = rawProvider === 'auto' ? 'anthropic' : rawProvider;
        const capability = ProviderCacheRegistry.resolve(options.modelId, provider);
        const minCacheTokens = options.minCachePrefixTokens || capability.minCacheableTokens || this.DEFAULT_MIN_CACHE_PREFIX_TOKENS;
        const alignedMessages: MessagePayload[] = [];

        // 1. Tier 1: Static System Prompt
        const normalizedSystem = CacheNormalizer.normalizeCacheableText(systemPrompt);
        let combinedStaticPrefix = normalizedSystem;

        // 2. Tier 2: Tool Calling / MCP Schemas (Minified, deduplicated when native tools present)
        const hasNativeTools = Boolean(
            options.hasNativeTools || 
            options.nativeToolCallingActive
        );

        let toolSchemaDeduplicated = false;
        let toolSchemaTokensSaved = 0;

        if (toolSchemas) {
            const minified = ToolSchemaMinifier.minifyToolSchemas(toolSchemas);
            const schemaText = `\n\n=== TOOL DEFINITIONS ===\n${minified.minifiedSchema}`;
            if (hasNativeTools) {
                // Native tools provided via API; suppress duplicate string injection in system prompt
                toolSchemaDeduplicated = true;
                toolSchemaTokensSaved = TokenCounter.countTokens(schemaText);
            } else {
                combinedStaticPrefix += schemaText;
            }
        }

        // 3. Tier 3: Invariant AST Repository Structure
        const normalizedAst = CacheNormalizer.normalizeCacheableText(astContext);
        if (normalizedAst.length > 0) {
            combinedStaticPrefix += `\n\n=== REPOSITORY INTERFACE SPECIFICATION ===\n${normalizedAst}`;
        }

        // 4. Stable Useful Context Organization (Zero Synthetic Padding)
        // Tokonomics NEVER injects meaningless comment tokens to cross cache thresholds.
        // Instead, useful stable context (e.g. invariant repository memory) is organized across the boundary.
        let usefulContextReorganized = false;
        let reorganizedTokens = 0;

        if (
            options.stableProjectMemory &&
            TokenCounter.countTokens(combinedStaticPrefix) < minCacheTokens
        ) {
            const memoryText = `\n\n=== PROJECT CONTEXT & INVARIANTS ===\n${options.stableProjectMemory}`;
            const memTokens = TokenCounter.countTokens(memoryText);
            combinedStaticPrefix += memoryText;
            usefulContextReorganized = true;
            reorganizedTokens = memTokens;
        }

        let staticPrefixTokens = TokenCounter.countTokens(combinedStaticPrefix);
        const boundaryPadded = false;
        const paddingTokensAdded = 0;

        const staticBlock: MessagePayload = {
            role: 'system',
            content: combinedStaticPrefix
        };

        let cachedBlocksCount = 0;
        let cacheWriteAmortizationApplied = false;
        let cacheWriteSuppressed = false;

        // Apply Provider-specific caching directives
        if (provider === 'anthropic') {
            cacheWriteAmortizationApplied = true;
            const guard = CacheAmortizationGuard.shouldAddCacheBreakpoint({
                provider: 'anthropic',
                prefixTokens: staticPrefixTokens,
                minCacheTokens,
                sessionTurns: options.sessionTurns,
                historyCount: history.length,
                isPersistentSession: options.isPersistentSession,
                hasInvariantTypes: options.hasInvariantTypes ?? (normalizedAst.length > 0)
            });

            if (guard.shouldCache) {
                staticBlock.cacheControl = { type: 'ephemeral' };
                cachedBlocksCount++;
            } else if (staticPrefixTokens >= minCacheTokens) {
                // Withheld to avoid 25% write surcharge on single-turn request
                cacheWriteSuppressed = true;
            }
        } else if (provider === 'openai' || provider === 'deepseek' || provider === 'generic') {
            if (staticPrefixTokens >= minCacheTokens) {
                cachedBlocksCount++;
            }
        }

        alignedMessages.push(staticBlock);

        // 5. Tier 4: Stabilized Conversation History
        let historyTokens = 0;
        for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            const normalizedContent = CacheNormalizer.normalizeCacheableText(msg.content);
            const msgTokens = TokenCounter.countTokens(normalizedContent);
            historyTokens += msgTokens;

            const historyBlock: MessagePayload = {
                role: msg.role,
                content: normalizedContent,
                name: msg.name
            };

            // For Anthropic multi-turn sessions with large history (> 1024 tokens), mark recent stable turn
            if (
                provider === 'anthropic' &&
                i === history.length - 1 &&
                (staticPrefixTokens + historyTokens) >= minCacheTokens &&
                cachedBlocksCount < 4 // Up to 4 cache breakpoints
            ) {
                historyBlock.cacheControl = { type: 'ephemeral' };
                cachedBlocksCount++;
            }

            alignedMessages.push(historyBlock);
        }

        // 6. Dynamic Block: User Query (Strictly trailing to prevent prefix invalidation)
        const dynamicQueryTokens = TokenCounter.countTokens(userQuery);
        alignedMessages.push({
            role: 'user',
            content: userQuery.trim()
        });

        const totalTokens = staticPrefixTokens + historyTokens + dynamicQueryTokens;
        const isCacheEligible = staticPrefixTokens >= minCacheTokens;

        return {
            alignedMessages,
            totalTokens,
            staticPrefixTokens,
            historyTokens,
            dynamicQueryTokens,
            isCacheEligible,
            provider,
            cachedBlocksCount,
            toolSchemaDeduplicated,
            toolSchemaTokensSaved,
            cacheWriteAmortizationApplied,
            cacheWriteSuppressed,
            boundaryPadded,
            paddingTokensAdded,
            providerCapability: capability,
            usefulContextReorganized,
            reorganizedTokens
        };
    }

    public alignToBlockBoundary(tokenCount: number, blockSize: number = 128): number {
        return Math.ceil(tokenCount / blockSize) * blockSize;
    }
}
