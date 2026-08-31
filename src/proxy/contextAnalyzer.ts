/**
 * Context Payload Analyzer & Optimization Pipeline Orchestrator (v2.0)
 * Coordinates Progressive History Summarization, AST Pruning, Code Deduplication,
 * and 4-Tier Provider Cache Alignment.
 */

import { AstPrunerEngine } from '../ast/pruner';
import { CacheAlignerEngine } from '../cache/aligner';
import { MetricsTracker } from '../metrics/tracker';
import { TokenCounter } from '../engine/tokenizer';
import { TextCompressorEngine } from '../engine/compress';
import { ConversationalCompactor } from '../engine/compactor';
import { ProgressiveHistorySummarizer } from '../engine/progressiveSummarizer';
import { CrossTurnDeduplicator } from '../engine/deduplicator';
import { DiffOutputOptimizer } from '../engine/diffOutputOptimizer';
import { PromptMinifier } from '../engine/promptMinifier';
import { MessagePayload, TokenOptimizationConfig, TokenStats } from '../types';
import { PipelineOrchestrator } from '../engine/pipelineOrchestrator';

export class ContextAnalyzer {
    constructor(
        private astEngine: AstPrunerEngine,
        private cacheAligner: CacheAlignerEngine,
        private metricsTracker: MetricsTracker,
        private pipelineOrchestrator?: PipelineOrchestrator
    ) {}

    public processMessages(
        rawMessages: MessagePayload[],
        config: TokenOptimizationConfig,
        detectedModelFamily?: string
    ): {
        alignedMessages: MessagePayload[];
        stats: TokenStats;
    } {
        const originalTotalTokens = TokenCounter.countMessagesTokens(rawMessages);

        let systemDirectives = '';
        let extractedCodeContext = '';
        let userQuery = '';
        const history: MessagePayload[] = [];

        let astTokensBefore = 0;
        let astTokensAfter = 0;
        let textTokensBefore = 0;
        let textTokensAfter = 0;

        // 1. Separate System, Historical Turns, Extracted Code, and Query
        for (let i = 0; i < rawMessages.length; i++) {
            const msg = rawMessages[i];
            const isLastMessage = i === rawMessages.length - 1;

            if (msg.role === 'system') {
                systemDirectives += (systemDirectives ? '\n\n' : '') + msg.content;
            } else if (isLastMessage && msg.role === 'user') {
                const extracted = this.extractCodeAndQuery(msg.content);
                extractedCodeContext += extracted.code;
                userQuery = extracted.query;
            } else {
                history.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                });
            }
        }

        // 1b. Diff-Based Output Optimization (Inject diff output instructions for edit requests)
        if (config.enableDiffOutputOptimization !== false && userQuery.trim().length > 0) {
            const diffOpt = DiffOutputOptimizer.analyzeIntent(userQuery, extractedCodeContext.length > 0);
            if (diffOpt.shouldRequestDiff && diffOpt.systemSuffix) {
                systemDirectives += (systemDirectives ? '\n\n' : '') + diffOpt.systemSuffix;
            }
        }

        // 1c. Token Shorthand & System Prompt Minification
        if (systemDirectives.trim().length > 60) {
            const minifiedSystem = PromptMinifier.minifySystemPrompt(systemDirectives);
            systemDirectives = minifiedSystem.minifiedPrompt;
        }

        // 2. Step A: AST Structural Pruning on extracted repository code context
        let processedCodeContext = extractedCodeContext;
        if (config.enableAstPruning && extractedCodeContext.trim().length > 0) {
            astTokensBefore = TokenCounter.countTokens(extractedCodeContext);
            const pruneResult = this.astEngine.pruneCodeContext(extractedCodeContext);
            processedCodeContext = pruneResult.prunedCode;
            astTokensAfter = pruneResult.prunedTokenCount;
        }

        // 3. Step B: Progressive History Compaction & Cross-Turn Deduplication
        let compactedHistory = history;
        let historyBeforeTokens = TokenCounter.countMessagesTokens(history);
        let historyAfterTokens = historyBeforeTokens;

        if (history.length > 0) {
            // Deduplicate repeated code blocks across turns
            const deduplicated = CrossTurnDeduplicator.deduplicateMessages(history as MessagePayload[]);
            
            // Progressive recursive summarization for long sessions
            const progressive = ProgressiveHistorySummarizer.summarize(deduplicated.messages, 4);

            // Log/diff stripping
            const compaction = ConversationalCompactor.compactHistory(
                progressive.messages,
                config.maxHistoryTurns,
                config.stripDiffsAndLogs
            );
            compactedHistory = compaction.compactedHistory;
            historyAfterTokens = compaction.compactedTokens;
        }

        // 4. Step C: Semantic Text Compression on Query / Instructions
        let processedQuery = userQuery;
        if (config.enableTextCompression && userQuery.length > 150) {
            textTokensBefore = TokenCounter.countTokens(userQuery);
            const compressResult = TextCompressorEngine.compressText(userQuery, config.compressionRatio);
            processedQuery = compressResult.compressedText;
            textTokensAfter = compressResult.compressedTokens;
        }

        // 5. Step D: Provider Cache Alignment & 1024-Token Prefix Stabilization
        const alignmentResult = this.cacheAligner.alignPayload(
            systemDirectives,
            processedCodeContext,
            compactedHistory,
            processedQuery,
            {
                targetProvider: config.targetProvider
            }
        );

        const optimizedTotalTokens = alignmentResult.totalTokens;

        // 6. Record metrics & return
        const breakdown = {
            astSaved: Math.max(0, astTokensBefore - astTokensAfter),
            textCompressionSaved: Math.max(0, textTokensBefore - textTokensAfter),
            historyCompacted: Math.max(0, historyBeforeTokens - historyAfterTokens),
            cacheAligned: alignmentResult.isCacheEligible ? alignmentResult.staticPrefixTokens : 0
        };

        const stats = this.metricsTracker.recordOptimization(
            originalTotalTokens,
            optimizedTotalTokens,
            breakdown,
            config.targetProvider,
            detectedModelFamily
        );

        return {
            alignedMessages: alignmentResult.alignedMessages,
            stats
        };
    }

    private extractCodeAndQuery(text: string): { code: string; query: string } {
        const codeBlockRegex = /```(?:[\w\d_\-+.]+)?\r?\n([\s\S]*?)```/g;
        let codeParts: string[] = [];
        let queryParts: string[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            const beforeCode = text.substring(lastIndex, match.index).trim();
            if (beforeCode) queryParts.push(beforeCode);
            codeParts.push(match[1]);
            lastIndex = match.index + match[0].length;
        }

        const remainingQuery = text.substring(lastIndex).trim();
        if (remainingQuery) queryParts.push(remainingQuery);

        return {
            code: codeParts.join('\n\n'),
            query: queryParts.join('\n\n')
        };
    }
}
