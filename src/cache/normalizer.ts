/**
 * Byte-Level & Whitespace Normalizer for KV-Cache Alignment
 * Guarantees cross-platform byte-identical prefix strings (LF line endings, normalized paths,
 * volatile string isolation) to maximize cloud provider KV-cache hit rates.
 */

export class CacheNormalizer {
    /**
     * Normalizes text for byte-exact prefix caching.
     */
    public static normalizeCacheableText(text: string): string {
        if (!text) return '';

        let result = text;

        // 1. Normalize line endings to LF (\n)
        result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 2. Normalize Windows file paths in context to standard forward slashes (e.g. src\utils -> src/utils)
        result = result.replace(/([a-zA-Z0-9_.-]+)\\([a-zA-Z0-9_.-]+)/g, '$1/$2');

        // 3. Trim trailing line whitespace while preserving intentional indentation
        result = result.split('\n').map(line => line.trimEnd()).join('\n');

        // 4. Remove volatile timestamps or current date strings from cached prefix blocks
        result = result.replace(/(?:Current Time|Current Date|Session Started at|Timestamp):\s*[^\n]+/gi, '');

        return result.trim();
    }
}
