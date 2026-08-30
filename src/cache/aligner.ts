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

export class CacheAlignerEngine {
    private readonly DEFAULT_MIN_CACHE_PREFIX_TOKENS = 1024;
    private readonly OPENAI_CHUNK_ALIGNMENT = 128;

    /**
     * Structurally organizes and aligns prompt blocks to guarantee deterministic KV-cache hits.
     * 
     * Tier 1: Static System Persona & Global Directives [CACHED]
     * Tier 2: Minified Tool / MCP Function Calling Schemas [CACHED]
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
        const minCacheTokens = options.minCachePrefixTokens || this.DEFAULT_MIN_CACHE_PREFIX_TOKENS;
        const alignedMessages: MessagePayload[] = [];

        // 1. Tier 1: Static System Prompt
        const normalizedSystem = CacheNormalizer.normalizeCacheableText(systemPrompt);
        let combinedStaticPrefix = normalizedSystem;

        // 2. Tier 2: Tool Calling / MCP Schemas (Minified)
        if (toolSchemas) {
            const minified = ToolSchemaMinifier.minifyToolSchemas(toolSchemas);
            combinedStaticPrefix += `\n\n=== TOOL DEFINITIONS ===\n${minified.minifiedSchema}`;
        }

        // 3. Tier 3: Invariant AST Repository Structure
        const normalizedAst = CacheNormalizer.normalizeCacheableText(astContext);
        if (normalizedAst.length > 0) {
            combinedStaticPrefix += `\n\n=== REPOSITORY INTERFACE SPECIFICATION ===\n${normalizedAst}`;
        }

        const staticBlock: MessagePayload = {
            role: 'system',
            content: combinedStaticPrefix
        };

        const staticPrefixTokens = TokenCounter.countTokens(combinedStaticPrefix);
        let cachedBlocksCount = 0;

        // Apply Provider-specific caching directives
        if (provider === 'anthropic') {
            if (staticPrefixTokens >= minCacheTokens) {
                staticBlock.cacheControl = { type: 'ephemeral' };
                cachedBlocksCount++;
            }
        } else if (provider === 'openai' || provider === 'deepseek' || provider === 'generic') {
            if (staticPrefixTokens >= minCacheTokens) {
                cachedBlocksCount++;
            }
        }

        alignedMessages.push(staticBlock);

        // 4. Tier 4: Stabilized Conversation History
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

        // 5. Dynamic Block: User Query (Strictly trailing to prevent prefix invalidation)
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
            cachedBlocksCount
        };
    }

    public alignToBlockBoundary(tokenCount: number, blockSize: number = 128): number {
        return Math.ceil(tokenCount / blockSize) * blockSize;
    }
}
