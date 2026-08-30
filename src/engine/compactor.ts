/**
 * Conversational State Compactor
 * Compresses multi-turn chat history, strips verbose diffs/terminal logs with linear-time safety.
 */

import { MessagePayload } from '../types';
import { TokenCounter } from './tokenizer';
import { AgenticToolCompactor } from './agenticCompactor';
import { CrossTurnDeduplicator } from './deduplicator';
import { SecuritySanitizer } from '../security/sanitizer';

export interface CompactionResult {
    compactedHistory: MessagePayload[];
    originalTokens: number;
    compactedTokens: number;
    savedTokens: number;
    wasCompacted: boolean;
    agenticToolPrunedCount?: number;
    duplicatesPrunedCount?: number;
}

export class ConversationalCompactor {
    public static compactHistory(
        history: MessagePayload[],
        maxTurns: number = 8,
        stripDiffsAndLogs: boolean = true
    ): CompactionResult {
        const originalTokens = TokenCounter.countMessagesTokens(history);
        if (history.length === 0) {
            return {
                compactedHistory: [],
                originalTokens: 0,
                compactedTokens: 0,
                savedTokens: 0,
                wasCompacted: false
            };
        }

        let workingHistory = [...history];

        // 1. Sanitize secrets from historical messages
        workingHistory = workingHistory.map(msg => ({
            role: msg.role,
            content: SecuritySanitizer.sanitizeSecrets(msg.content).sanitized,
            name: msg.name,
            cacheControl: msg.cacheControl
        }));

        // 2. Condense intermediate tool executions
        const agenticResult = AgenticToolCompactor.compactToolHistory(workingHistory, 2);
        workingHistory = agenticResult.compactedMessages;

        // 3. Cross-turn code deduplication
        const dedupResult = CrossTurnDeduplicator.deduplicateMessages(workingHistory);
        workingHistory = dedupResult.messages;

        // 4. Strip repetitive terminal dumps, stack traces, and large git diffs
        if (stripDiffsAndLogs) {
            workingHistory = workingHistory.map(msg => ({
                role: msg.role,
                content: this.stripVerboseArtifacts(msg.content),
                name: msg.name,
                cacheControl: msg.cacheControl
            }));
        }

        // 5. Sliding window: retain recent turns, summarize older turns
        if (workingHistory.length > maxTurns) {
            const olderTurns = workingHistory.slice(0, workingHistory.length - maxTurns);
            const recentTurns = workingHistory.slice(workingHistory.length - maxTurns);

            const summaryContent = this.summarizeOlderTurns(olderTurns);
            const summaryBlock: MessagePayload = {
                role: 'system',
                content: `[PRIOR CONVERSATION SUMMARY]: ${summaryContent}`
            };

            workingHistory = [summaryBlock, ...recentTurns];
        }

        const compactedTokens = TokenCounter.countMessagesTokens(workingHistory);
        const savedTokens = Math.max(0, originalTokens - compactedTokens);

        return {
            compactedHistory: workingHistory,
            originalTokens,
            compactedTokens,
            savedTokens,
            wasCompacted: savedTokens > 10,
            agenticToolPrunedCount: agenticResult.toolOutputsCompactedCount,
            duplicatesPrunedCount: dedupResult.duplicatesReplacedCount
        };
    }

    /**
     * Linear-time stripping of massive git diffs, stack traces, and build logs.
     */
    public static stripVerboseArtifacts(text: string): string {
        if (!text || text.length < 100) return text;

        const lines = text.split('\n');
        const outputLines: string[] = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // 1. Detect git diff block
            if (line.startsWith('diff --git ')) {
                const diffHeader = [line];
                let j = i + 1;
                while (j < lines.length && !lines[j].startsWith('diff --git ') && !lines[j].startsWith('```') && lines[j].trim().length > 0) {
                    diffHeader.push(lines[j]);
                    j++;
                }
                if (diffHeader.length > 10) {
                    const topHeader = diffHeader.slice(0, 4).join('\n');
                    outputLines.push(`${topHeader}\n... [${diffHeader.length - 4} diff lines pruned by Token Optimizer] ...`);
                    i = j;
                    continue;
                }
            }

            // 2. Detect repetitive stack traces (' at ...')
            if (/^\s+at\s+[\w\d_.$<>]+\s+\(/i.test(line)) {
                const stackFrames = [line];
                let j = i + 1;
                while (j < lines.length && /^\s+at\s+/i.test(lines[j])) {
                    stackFrames.push(lines[j]);
                    j++;
                }
                if (stackFrames.length >= 4) {
                    outputLines.push(`    at ${stackFrames[0].trim()}\n    ... [${stackFrames.length - 2} stack frames omitted] ...\n    at ${stackFrames[stackFrames.length - 1].trim()}`);
                    i = j;
                    continue;
                }
            }

            outputLines.push(line);
            i++;
        }

        return outputLines.join('\n');
    }

    private static summarizeOlderTurns(olderTurns: MessagePayload[]): string {
        const keyPoints: string[] = [];

        for (const turn of olderTurns) {
            const lines = turn.content.split('\n').filter(l => l.trim().length > 0);
            const firstLine = lines[0] || '';
            const preview = firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;

            if (turn.role === 'user') {
                keyPoints.push(`User asked: "${preview}"`);
            } else if (turn.role === 'assistant') {
                keyPoints.push(`Assistant replied: "${preview}"`);
            }
        }

        return keyPoints.slice(0, 6).join('; ');
    }
}
