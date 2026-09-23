/**
 * High-Performance Statistical Token Estimation & Token Counter
 * Uses character-density and regex heuristics calibrated against cl100k/o200k ratios
 * for sub-millisecond (< 0.05ms) compile-time context sizing without binary WASM dependencies.
 */

export class TokenCounter {
    // Fast path LRU cache for short recurring strings
    private static cache = new Map<string, number>();
    private static readonly MAX_CACHE_SIZE = 2000;
    private static readonly TOKEN_REGEX = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+|\s+/gu;

    /**
     * Estimates the token count of a given text.
     */
    public static countTokens(text: string): number {
        if (!text || text.length === 0) {
            return 0;
        }

        // Fast path for short strings (< 256 chars) with caching
        if (text.length < 256) {
            const cached = this.cache.get(text);
            if (cached !== undefined) {
                return cached;
            }
            const count = this.computeTokens(text);
            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                // Evict oldest 400 entries
                const keys = this.cache.keys();
                for (let i = 0; i < 400; i++) {
                    const key = keys.next().value;
                    if (key) this.cache.delete(key);
                }
            }
            this.cache.set(text, count);
            return count;
        }

        return this.computeTokens(text);
    }

    private static computeTokens(text: string): number {
        const len = text.length;

        // High-performance heuristic for large code/prose blocks (> 10,000 chars)
        // Calibrated against cl100k_base / o200k_base: ~3.7 characters per token for code/text mix
        if (len > 10000) {
            // Count whitespace and punctuation density for precise scaling
            let punctuationCount = 0;
            let whitespaceCount = 0;
            const sampleSize = Math.min(len, 2000);

            for (let i = 0; i < sampleSize; i++) {
                const code = text.charCodeAt(i);
                if (code <= 32) whitespaceCount++;
                else if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) {
                    punctuationCount++;
                }
            }

            const puncRatio = punctuationCount / sampleSize;
            // High punctuation (code/JSON): ~3.6 chars/token. Standard prose: ~4.2 chars/token.
            const divisor = puncRatio > 0.15 ? 3.6 : 4.2;
            return Math.max(1, Math.round(len / divisor));
        }

        // Linear scanner for medium texts (< 10,000 chars) using static regex
        const regex = this.TOKEN_REGEX;
        regex.lastIndex = 0;
        let tokens = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            const chunk = match[0];
            const cLen = chunk.length;
            const c0 = chunk.charCodeAt(0);

            if (c0 <= 32) {
                // Whitespace: BPE merges multiple whitespace/indentation characters efficiently
                tokens += Math.max(1, Math.floor(cLen / 6));
            } else if (c0 >= 48 && c0 <= 57) {
                // Digits
                tokens += Math.ceil(cLen / 3.0);
            } else if ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95 || c0 === 36) {
                // ASCII identifiers/words: common programming keywords and variable names up to 6 chars are 1 token
                if (cLen <= 6) tokens += 1;
                else if (cLen <= 11) tokens += 2;
                else if (cLen <= 18) tokens += 3;
                else tokens += Math.ceil(cLen / 4.2);
            } else {
                // Symbols / Unicode / punctuation: paired or common operator sequences merge in BPE
                tokens += Math.ceil(cLen / 2.8);
            }
        }

        return Math.max(1, tokens);
    }

    /**
     * Estimates token count for an array of messages
     */
    public static countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
        let total = 0;
        for (const msg of messages) {
            total += 4; // overhead per message (<|im_start|>role\n ... <|im_end|>)
            total += this.countTokens(msg.content);
        }
        total += 2; // priming tokens
        return total;
    }
}
