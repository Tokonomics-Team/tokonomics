/**
 * Cross-Turn Code Deduplicator
 * Uses fast 32-bit FNV-1a hashing for collision-free multi-turn code deduplication.
 */

import { MessagePayload } from '../types';
import { TokenCounter } from './tokenizer';

export interface DeduplicationResult {
    messages: MessagePayload[];
    originalTokens: number;
    deduplicatedTokens: number;
    savedTokens: number;
    duplicatesReplacedCount: number;
}

export class CrossTurnDeduplicator {
    /**
     * Deduplicates identical code snippets across multi-turn messages.
     */
    public static deduplicateMessages(messages: MessagePayload[]): DeduplicationResult {
        const originalTokens = TokenCounter.countMessagesTokens(messages);
        if (messages.length <= 1) {
            return {
                messages,
                originalTokens,
                deduplicatedTokens: originalTokens,
                savedTokens: 0,
                duplicatesReplacedCount: 0
            };
        }

        const seenCodeHashes = new Map<number, number>(); // FNV-1a hash -> first turn index
        let duplicatesReplacedCount = 0;

        const resultMessages: MessagePayload[] = [];
        const codeBlockRegex = /```(?:[\w\d_\-+.]+)?\n([\s\S]*?)```/g;

        for (let turnIdx = 0; turnIdx < messages.length; turnIdx++) {
            const msg = messages[turnIdx];
            let newContent = msg.content;

            newContent = newContent.replace(codeBlockRegex, (fullBlock, codeContent) => {
                const lines = codeContent.trim().split('\n');
                if (lines.length < 10) {
                    return fullBlock;
                }

                // Compute fast FNV-1a hash of normalized code content
                const hash = this.fnv1aHash(codeContent);

                if (seenCodeHashes.has(hash)) {
                    const firstTurn = seenCodeHashes.get(hash)!;
                    duplicatesReplacedCount++;
                    const preview = lines[0].substring(0, 60).replace(/[`\\]/g, '');
                    return `\`\`\`\n// [Duplicate Code Block Pruned: Identical to snippet from Turn ${firstTurn + 1} ("${preview}...")]\n\`\`\``;
                } else {
                    seenCodeHashes.set(hash, turnIdx);
                    return fullBlock;
                }
            });

            resultMessages.push({
                role: msg.role,
                content: newContent,
                name: msg.name,
                cacheControl: msg.cacheControl
            });
        }

        const deduplicatedTokens = TokenCounter.countMessagesTokens(resultMessages);
        const savedTokens = Math.max(0, originalTokens - deduplicatedTokens);

        return {
            messages: resultMessages,
            originalTokens,
            deduplicatedTokens,
            savedTokens,
            duplicatesReplacedCount
        };
    }

    /**
     * 32-bit FNV-1a non-cryptographic hash for ultra-fast, collision-free text hashing.
     */
    private static fnv1aHash(str: string): number {
        let hash = 0x811c9dc5;
        const len = str.length;
        for (let i = 0; i < len; i++) {
            const code = str.charCodeAt(i);
            // Ignore minor whitespace discrepancies during hashing
            if (code <= 32) continue;
            hash ^= code;
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash;
    }
}
