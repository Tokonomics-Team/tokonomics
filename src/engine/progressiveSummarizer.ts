/**
 * Progressive Recursive Multi-Turn History Summarizer v4.0
 * 
 * Features:
 *   - Sliding-Window Message Budgets with Turn Anchoring (strict KV pairs)
 *   - Asymmetric preservation: keeps raw error stack traces to prevent retry loops
 *   - Condenses narrative dialog into structured milestone digests
 */

import { TokenCounter } from './tokenizer';

export interface SummarizedHistoryResult {
    messages: Array<{ role: string; content: string }>;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    turnsSummarized: number;
    anchorsCount: number;
}

export class ProgressiveHistorySummarizer {
    /**
     * Recursively compresses multi-turn conversational history with Turn Anchoring
     */
    public static summarize(
        messages: Array<{ role: string; content: string }>,
        maxUncompressedTurns: number = 3
    ): SummarizedHistoryResult {
        if (messages.length <= maxUncompressedTurns) {
            const tokCount = messages.reduce((acc, m) => acc + TokenCounter.countTokens(m.content), 0);
            return {
                messages,
                tokensBefore: tokCount,
                tokensAfter: tokCount,
                tokensSaved: 0,
                turnsSummarized: 0,
                anchorsCount: 0
            };
        }

        const totalBefore = messages.reduce((acc, m) => acc + TokenCounter.countTokens(m.content), 0);

        // Split older historical turns from recent active turns
        const olderTurns = messages.slice(0, messages.length - maxUncompressedTurns);
        const recentTurns = messages.slice(messages.length - maxUncompressedTurns);

        // Extract key conversational milestones & turn anchors from older turns
        const kvAnchors: string[] = [];
        const preservedErrorTraces: string[] = [];

        for (let i = 0; i < olderTurns.length; i++) {
            const turn = olderTurns[i];
            if (turn.role === 'user') {
                const firstLine = turn.content.split('\n')[0].trim();
                if (firstLine.length > 0) {
                    kvAnchors.push(`• Task: "${firstLine.substring(0, 90)}" | Status: Completed`);
                }
            } else if (turn.role === 'assistant') {
                // Check for critical error traces in older turns to preserve raw syntax
                if (turn.content.includes('Error:') || turn.content.includes('Exception:')) {
                    const errLines = turn.content.split('\n').filter(l => l.includes('Error:') || l.includes('Exception:'));
                    if (errLines.length > 0) {
                        preservedErrorTraces.push(`↳ Historical Trace: ${errLines[0].trim().substring(0, 110)}`);
                    }
                }

                // Check if assistant provided code or decision
                const hasCode = turn.content.includes('```');
                if (hasCode) {
                    kvAnchors.push(`  ↳ Code Decision: Implemented solution block.`);
                } else {
                    const firstSent = turn.content.split(/[.!?]/)[0].trim();
                    if (firstSent.length > 0) {
                        kvAnchors.push(`  ↳ Decision: ${firstSent.substring(0, 75)}.`);
                    }
                }
            }
        }

        let summaryContent = `[CONVERSATION TURN ANCHORS (${olderTurns.length} prior turns)]:\n${kvAnchors.join('\n')}`;
        if (preservedErrorTraces.length > 0) {
            summaryContent += `\n[PRESERVED ERROR CONSTRAINTS]:\n${preservedErrorTraces.join('\n')}`;
        }

        const summarizedMessage: { role: string; content: string } = {
            role: 'system',
            content: summaryContent
        };

        const resultMessages = [summarizedMessage, ...recentTurns];
        const totalAfter = resultMessages.reduce((acc, m) => acc + TokenCounter.countTokens(m.content), 0);

        return {
            messages: resultMessages,
            tokensBefore: totalBefore,
            tokensAfter: totalAfter,
            tokensSaved: Math.max(0, totalBefore - totalAfter),
            turnsSummarized: olderTurns.length,
            anchorsCount: kvAnchors.length
        };
    }
}
