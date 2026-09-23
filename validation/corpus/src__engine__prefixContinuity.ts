/**
 * Tokonomics Prefix Continuity Policy
 *
 * Providers reuse a cached prompt prefix only while the emitted bytes of that prefix are
 * unchanged. Anthropic prices a cache read at 0.1x the base input rate, so a stable prefix is
 * worth real money on any multi-turn session - but only if the prefix is actually byte-stable.
 *
 * The compiler previously sliced EVERY message against the latest turn's focal keywords. An
 * unchanged history message therefore rendered differently on each turn (because the keywords
 * changed), the emitted prefix drifted, and the provider's prefix cache was invalidated on every
 * request. That is the failure mode TokenPilot (arXiv:2606.17016) identifies: unconstrained
 * sequence mutation defeating prompt-cache continuity.
 *
 * The fix is to make the transformation of historical turns a pure function of the message
 * itself. Given identical history, identical bytes are emitted turn after turn, so the prefix
 * remains cacheable. The latest user turn keeps the full focal keyword set: it is what the
 * request is about, and it sits at the volatile tail where prefix reuse does not apply anyway.
 *
 * This is a pure policy module: no I/O, no state beyond a per-request memo, no configuration.
 */

import type { MessagePayload } from '../types';

/** Words carrying no retrieval signal; shared so every keyword derivation behaves identically. */
export const STOPWORD_KEYWORDS: ReadonlySet<string> = new Set([
    'const', 'let', 'var', 'the', 'and', 'with', 'for', 'function', 'class', 'from', 'import',
    'export', 'this', 'that', 'please', 'make', 'code', 'file', 'method'
]);

/** Upper bound on keywords derived from a single historical message. */
const MAX_STABLE_KEYWORDS = 24;

/** Extracts identifier-like keywords from prose, ignoring fenced code and stopwords. */
export function deriveKeywords(text: string, limit: number = MAX_STABLE_KEYWORDS): string[] {
    const prose = text.replace(/```[\s\S]*?```/g, ' ');
    return Array.from(new Set((prose.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [])
        .filter(word => word.length > 2 && !STOPWORD_KEYWORDS.has(word.toLowerCase()))))
        .slice(0, limit);
}

export interface PrefixStableKeywordResolver {
    /** Keywords to slice message `index` against. */
    forMessage(index: number): string[];
    /** Index of the latest user turn; messages before it are treated as stable prefix. */
    readonly latestUserIndex: number;
}

/**
 * Builds a resolver that keeps historical slicing independent of the current query.
 *
 * `focalKeywords` is used for the latest user turn and anything after it. Earlier turns get
 * keywords derived from their own content, memoised per request so each message is scanned once.
 */
export function createPrefixStableKeywordResolver(
    messages: readonly MessagePayload[],
    focalKeywords: readonly string[]
): PrefixStableKeywordResolver {
    let latestUserIndex = messages.length - 1;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].role === 'user') { latestUserIndex = index; break; }
    }
    const memo = new Map<number, string[]>();
    return {
        latestUserIndex,
        forMessage(index: number): string[] {
            if (index >= latestUserIndex) return [...focalKeywords];
            const cached = memo.get(index);
            if (cached) return cached;
            const derived = deriveKeywords(messages[index]?.content ?? '');
            memo.set(index, derived);
            return derived;
        }
    };
}
