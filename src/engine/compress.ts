/**
 * Semantic Text & Natural Language Compression Engine
 * Implements coarse-to-fine token pruning with ReDoS-safe phrase matching.
 */

import { TokenCounter } from './tokenizer';
import { SecuritySanitizer } from '../security/sanitizer';

export interface TextCompressionResult {
    compressedText: string;
    originalTokens: number;
    compressedTokens: number;
    reductionPercentage: number;
    wasCompressed: boolean;
    durationMs: number;
}

export class TextCompressorEngine {
    // Pre-compiled safe regex patterns for low-information filler phrases
    private static readonly FILLER_REGEXES = [
        /\b(?:it is (?:worth noting|definitely worth noting|important to note) that)\b[,]?\s*/gi,
        /\b(?:as (?:mentioned earlier|previously stated|a matter of fact))\b[,]?\s*/gi,
        /\b(?:in order to)\b/gi,
        /\b(?:with respect to|in terms of)\b/gi,
        /\b(?:basically|actually|literally|essentially|furthermore|moreover|nevertheless|consequently|incidentally|please|kindly|sincerely|definitely|certainly|obviously|clearly|undoubtedly|presumably)\b[,]?\s*/gi
    ];

    private static readonly ADJECTIVE_REGEX = /\b(?:very|extremely|highly|quite|really|simply|just)\b\s*/gi;

    /**
     * Compresses natural language text or documentation using coarse-to-fine token pruning.
     */
    public static compressText(
        text: string,
        targetRetentionRatio: number = 0.5
    ): TextCompressionResult {
        const startTime = Date.now();
        const originalTokens = TokenCounter.countTokens(text);

        if (originalTokens < 50 || targetRetentionRatio >= 0.9) {
            return {
                compressedText: text,
                originalTokens,
                compressedTokens: originalTokens,
                reductionPercentage: 0,
                wasCompressed: false,
                durationMs: Date.now() - startTime
            };
        }

        const segments = this.segmentText(text);
        const processedSegments: string[] = [];

        for (const segment of segments) {
            if (segment.isCode) {
                processedSegments.push(segment.content);
            } else {
                const compressedProse = this.compressProseSegment(segment.content, targetRetentionRatio);
                processedSegments.push(compressedProse);
            }
        }

        const compressedText = processedSegments.join('');
        const compressedTokens = TokenCounter.countTokens(compressedText);
        const reduction = originalTokens > 0 ? ((originalTokens - compressedTokens) / originalTokens) * 100 : 0;

        return {
            compressedText,
            originalTokens,
            compressedTokens,
            reductionPercentage: Math.round(reduction * 10) / 10,
            wasCompressed: reduction > 5,
            durationMs: Math.max(1, Date.now() - startTime)
        };
    }

    private static segmentText(text: string): Array<{ content: string; isCode: boolean }> {
        const segments: Array<{ content: string; isCode: boolean }> = [];
        const codeBlockRegex = /```[\s\S]*?```|`[^`\n]+`/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                segments.push({
                    content: text.substring(lastIndex, match.index),
                    isCode: false
                });
            }
            segments.push({
                content: match[0],
                isCode: true
            });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            segments.push({
                content: text.substring(lastIndex),
                isCode: false
            });
        }

        return segments;
    }

    private static compressProseSegment(prose: string, retentionRatio: number): string {
        const lines = prose.split('\n');
        const compressedLines: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (
                trimmed.startsWith('#') ||
                trimmed.startsWith('|') ||
                trimmed.startsWith('---') ||
                trimmed.length === 0
            ) {
                compressedLines.push(line);
                continue;
            }

            let compressedLine = line;

            // Apply pre-compiled safe patterns
            for (const rx of this.FILLER_REGEXES) {
                compressedLine = compressedLine.replace(rx, '');
            }

            compressedLine = compressedLine.replace(/[ \t]{2,}/g, ' ');

            if (retentionRatio < 0.45) {
                compressedLine = compressedLine.replace(this.ADJECTIVE_REGEX, '');
            }

            compressedLines.push(compressedLine);
        }

        return compressedLines.join('\n');
    }
}
