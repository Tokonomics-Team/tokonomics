/**
 * Tokonomics Exact Deduplication Engine
 * Identifies and eliminates verbatim identical code blocks across context turns and tools using fast hashing.
 */

export interface DedupItem {
    id: string;
    content: string;
    tokens: number;
}

export interface ExactDedupResult {
    unique: DedupItem[];
    duplicates: { duplicateId: string; canonicalId: string; tokensSaved: number }[];
    totalTokensSaved: number;
}

export class ExactDedupEngine {
    /**
     * Fast 32-bit FNV-1a hash function for strings
     */
    private hashContent(str: string): string {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    public deduplicate(items: DedupItem[]): ExactDedupResult {
        const seenHashes = new Map<string, string>(); // hash -> canonicalId
        const unique: DedupItem[] = [];
        const duplicates: { duplicateId: string; canonicalId: string; tokensSaved: number }[] = [];
        let totalTokensSaved = 0;

        for (const item of items) {
            const normalized = item.content.trim();
            if (normalized.length === 0) continue;

            const hash = this.hashContent(normalized);

            if (seenHashes.has(hash)) {
                const canonicalId = seenHashes.get(hash)!;
                duplicates.push({
                    duplicateId: item.id,
                    canonicalId,
                    tokensSaved: item.tokens
                });
                totalTokensSaved += item.tokens;
            } else {
                seenHashes.set(hash, item.id);
                unique.push(item);
            }
        }

        return { unique, duplicates, totalTokensSaved };
    }
}
