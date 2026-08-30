/**
 * Agentic Tool Call Output Compactor & Batching Engine v4.0
 * 
 * Features:
 *   - Sequential File Read & Tool Call Batching
 *   - Regex Head/Tail Output Masking for build logs, test runner outputs, and terminal commands
 *   - Strips intermediate debugging noise while preserving error exit codes
 */

import { MessagePayload } from '../types';
import { TokenCounter } from './tokenizer';

export interface AgenticCompactionResult {
    compactedMessages: MessagePayload[];
    originalTokens: number;
    compactedTokens: number;
    savedTokens: number;
    toolOutputsCompactedCount: number;
    batchedToolCallsCount: number;
}

export class AgenticToolCompactor {
    /**
     * Compacts tool history and batches sequential tool responses.
     */
    public static compactToolHistory(
        messages: MessagePayload[],
        recentTurnPreserveCount: number = 2
    ): AgenticCompactionResult {
        const originalTokens = TokenCounter.countMessagesTokens(messages);
        let toolOutputsCompactedCount = 0;
        let batchedToolCallsCount = 0;

        if (messages.length <= recentTurnPreserveCount) {
            return {
                compactedMessages: messages,
                originalTokens,
                compactedTokens: originalTokens,
                savedTokens: 0,
                toolOutputsCompactedCount: 0,
                batchedToolCallsCount: 0
            };
        }

        const compacted: MessagePayload[] = [];
        const cutoffIndex = messages.length - recentTurnPreserveCount;

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (i >= cutoffIndex) {
                compacted.push(msg);
                continue;
            }

            // Check if sequential tool messages can be batched together
            const condensedContent = this.condenseToolMessageContent(msg.content);
            if (condensedContent !== msg.content) {
                toolOutputsCompactedCount++;
            }

            compacted.push({
                role: msg.role,
                content: condensedContent,
                name: msg.name,
                cacheControl: msg.cacheControl
            });
        }

        // Perform batching pass on consecutive historical tool messages
        const batchedMessages: MessagePayload[] = [];
        for (let i = 0; i < compacted.length; i++) {
            const current = compacted[i];
            const next = compacted[i + 1];

            if (i < cutoffIndex - 1 && current.role === 'assistant' && next && next.role === 'assistant' &&
                current.content.startsWith('[') && next.content.startsWith('[')) {
                batchedMessages.push({
                    role: 'assistant',
                    content: `${current.content}\n${next.content}`
                });
                batchedToolCallsCount++;
                i++; // skip next since it's merged
            } else {
                batchedMessages.push(current);
            }
        }

        const compactedTokens = TokenCounter.countMessagesTokens(batchedMessages);
        const savedTokens = Math.max(0, originalTokens - compactedTokens);

        return {
            compactedMessages: batchedMessages,
            originalTokens,
            compactedTokens,
            savedTokens,
            toolOutputsCompactedCount,
            batchedToolCallsCount
        };
    }

    /**
     * Applies Head/Tail truncation and regex filtering to large tool/terminal outputs.
     */
    public static maskHeadTail(content: string, headLines: number = 6, tailLines: number = 6): string {
        const lines = content.split('\n');
        if (lines.length <= headLines + tailLines + 2) {
            return content;
        }

        const head = lines.slice(0, headLines).join('\n');
        const tail = lines.slice(lines.length - tailLines).join('\n');
        const omittedCount = lines.length - (headLines + tailLines);

        return `${head}\n... [${omittedCount} lines of intermediate execution output masked] ...\n${tail}`;
    }

    private static condenseToolMessageContent(content: string): string {
        if (!content || content.length < 180) return content;

        const lines = content.split('\n');

        // 1. Detect file read line blocks (e.g. <1>: line1, <2>: line2)
        const lineNumCount = lines.filter(l => /^<\d+>:\s*/.test(l.trim())).length;
        if (lineNumCount > 15) {
            const header = lines.slice(0, 3).join('\n');
            return `${header}\n... [${lines.length - 3} lines of file content pruned from historical turn] ...\n`;
        }

        // 2. Detect test runner outputs (e.g. Jest / Mocha / Pytest / Cargo test)
        if (content.includes('PASS') || content.includes('FAIL') || content.includes('Tests:') || content.includes('pytest') || content.includes('running ') && content.includes('test')) {
            return this.maskHeadTail(content, 4, 4);
        }

        // 3. Detect grep search JSON result array
        if (content.includes('"LineNumber"') && content.includes('"LineContent"') && lines.length > 12) {
            return `[Grep search returned ${lines.length} matches across files (intermediate matches pruned)]`;
        }

        // 4. Detect verbose npm / yarn / esbuild / compiler logs
        if (lines.length > 20 && (content.includes('npm') || content.includes('yarn') || content.includes('audited') || content.includes('webpack') || content.includes('esbuild'))) {
            return `[Build/Package Command Output: ${lines.length} log lines condensed]`;
        }

        // 5. General large output head/tail truncation
        if (lines.length > 30) {
            return this.maskHeadTail(content, 5, 5);
        }

        return content;
    }
}
