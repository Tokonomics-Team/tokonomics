/** Remove extension-authored presentation text before prior turns become model input. */
export function sanitizeModelHistoryText(value: string): string {
    const blocks = value.split(/\r?\n/);
    const kept: string[] = [];
    let skippingExtensionBlock = false;
    for (const line of blocks) {
        const trimmed = line.trim();
        const beginsExtensionBlock = /^>\s*(?:⚡|💡|🧠|🔷|🚫)?\s*(?:\*\*)?(?:Tokonomics|This task could use|Complex task detected|Standard tier|Model Policy|Verified Exact Response Cache Hit)/iu.test(trimmed)
            || /^###\s+(?:⚡\s+)?Tokonomics\b/iu.test(trimmed)
            || /^\*\(No downstream .*model available/iu.test(trimmed);
        if (beginsExtensionBlock) { skippingExtensionBlock = true; continue; }
        if (skippingExtensionBlock && (trimmed === '' || trimmed.startsWith('>'))) continue;
        skippingExtensionBlock = false;
        kept.push(line);
    }
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function boundedHistory<T>(items: readonly T[], maxTurns: number): readonly T[] {
    const limit = Math.max(0, Math.min(40, Math.floor(maxTurns))) * 2;
    return limit === 0 ? Object.freeze([]) : Object.freeze(items.slice(-limit));
}
