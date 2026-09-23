/**
 * Context epochs: append-only conversation history with a quantised anchor.
 *
 * The defect this replaces is a sliding window. `boundedHistory` kept the last N turns with
 * `slice(-limit)`, so once a conversation passed N turns every single request dropped the oldest
 * turn and shifted everything after it. A provider's prefix cache matches on an exact byte prefix,
 * so a prefix that moves every turn is a prefix that is never reused: the longest conversations -
 * the ones where caching is worth the most - got the least benefit from it.
 *
 * The fix is to move the anchor rarely and by a lot, rather than constantly and by a little. The
 * retained window starts at a fixed index for the whole of an epoch, so every request in that epoch
 * renders a byte-identical prefix and the cache hits. When accumulated history crosses the next
 * multiple of the threshold, the anchor jumps once to a new epoch and the cache is rebuilt once.
 * The total work is the same; its distribution is what changes, and one large invalidation is worth
 * far more than a continuous small one.
 *
 * This is the same trade-off as the boundary quantisation in observation masking, and the same one
 * Anthropic's `clear_at_least` option exists to express: cache-friendly eviction happens in strides.
 *
 * The anchor is derived from the history itself rather than remembered, so it needs no persistent
 * state and two requests over the same conversation always agree on where the prefix starts.
 *
 * Pure module: deterministic in its arguments, no I/O, no VS Code, no configuration.
 */

/** Minimum shape needed to measure a turn. */
export interface EpochTurn {
    readonly content: string;
}

export interface ContextEpochOptions {
    /**
     * Accumulated history tokens that define one epoch. The anchor advances when total history
     * crosses a multiple of this, not when any individual turn arrives.
     */
    readonly epochTokens: number;
    /** Turns always retained regardless of the anchor, so recent context is never dropped. */
    readonly minRetainedTurns: number;
    /** Hard ceiling on retained turns, bounding cost on very long conversations. */
    readonly maxRetainedTurns: number;
}

export const DEFAULT_CONTEXT_EPOCH: ContextEpochOptions = Object.freeze({
    epochTokens: 24_000,
    minRetainedTurns: 4,
    maxRetainedTurns: 80
});

export interface ContextEpochDecision {
    /** Index into history where the retained window begins. Fixed for the whole epoch. */
    readonly startIndex: number;
    /** Increments only when the anchor moves, so it identifies a stable prefix. */
    readonly epoch: number;
    /** True on the request where the anchor advanced; the one turn that rebuilds the cache. */
    readonly checkpointCreated: boolean;
    readonly retainedTurns: number;
    readonly droppedTurns: number;
    readonly historyTokens: number;
    readonly retainedTokens: number;
    readonly reason: string;
}

/** Cheap, deterministic token estimate. Deliberately the same shape the budget uses. */
function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Chooses the retained history window.
 *
 * Returns the whole history until it is large enough to matter; after that the window starts at a
 * quantised anchor that only advances on epoch boundaries.
 */
export function resolveContextEpoch(
    history: readonly EpochTurn[],
    options: ContextEpochOptions = DEFAULT_CONTEXT_EPOCH
): ContextEpochDecision {
    const turns = Array.isArray(history) ? history : [];
    const epochTokens = Math.max(1_000, options.epochTokens);
    const minRetained = Math.max(0, Math.min(options.minRetainedTurns, turns.length));
    const maxRetained = Math.max(minRetained, options.maxRetainedTurns);

    // Cumulative tokens up to and including each turn.
    const cumulative: number[] = new Array(turns.length);
    let running = 0;
    for (let index = 0; index < turns.length; index++) {
        running += estimateTokens(turns[index]?.content ?? '');
        cumulative[index] = running;
    }
    const historyTokens = running;

    const epoch = Math.floor(historyTokens / epochTokens);
    if (epoch === 0) {
        // Still inside the first epoch: the whole history is the prefix and it only grows, which is
        // exactly what a prefix cache wants.
        const bounded = Math.min(turns.length, maxRetained);
        const startIndex = turns.length - bounded;
        return Object.freeze({
            startIndex, epoch: 0, checkpointCreated: false,
            retainedTurns: bounded, droppedTurns: startIndex,
            historyTokens, retainedTokens: historyTokens - (startIndex > 0 ? cumulative[startIndex - 1] : 0),
            reason: 'History is within the first epoch and is retained append-only; the prefix only grows.'
        });
    }

    // The anchor sits one epoch *behind* the current boundary, so the retained window always holds
    // between one and two epochs of history. Anchoring at the current boundary would leave almost
    // nothing retained on the turn it was crossed.
    //
    // Critically, the anchor is a function of the epoch alone. An earlier version clamped it against
    // `turns.length - minRetainedTurns` to protect recent turns, which reintroduced exactly the bug
    // being fixed: that expression grows by one every turn, so the anchor tracked it and the prefix
    // shifted on every request. Anything that depends on the current length cannot be part of the
    // anchor. Retaining a whole epoch protects recent turns by construction instead.
    const boundary = Math.max(0, epoch - 1) * epochTokens;
    let anchor = 0;
    while (anchor < turns.length && cumulative[anchor] < boundary) anchor++;

    let startIndex = Math.max(0, Math.min(anchor, Math.max(0, turns.length - minRetained)));

    // The turn ceiling is a safety valve for pathological conversations of very small turns. It is
    // applied in strides for the same reason: a ceiling enforced exactly would advance every turn.
    if (turns.length - startIndex > maxRetained) {
        const stride = Math.max(1, Math.floor(maxRetained / 4));
        const forced = turns.length - maxRetained;
        startIndex = Math.max(startIndex, Math.floor(forced / stride) * stride);
    }

    // A checkpoint is created on the request where the boundary was newly crossed: the previous
    // turn's totals belonged to the earlier epoch.
    const previousTotal = turns.length > 0 ? cumulative[turns.length - 1] - estimateTokens(turns[turns.length - 1]?.content ?? '') : 0;
    const checkpointCreated = Math.floor(previousTotal / epochTokens) < epoch;

    return Object.freeze({
        startIndex,
        epoch,
        checkpointCreated,
        retainedTurns: turns.length - startIndex,
        droppedTurns: startIndex,
        historyTokens,
        retainedTokens: historyTokens - (startIndex > 0 ? cumulative[startIndex - 1] : 0),
        reason: checkpointCreated
            ? `History crossed epoch ${epoch}; the anchor advanced once and the prefix is rebuilt on this turn.`
            : `History is inside epoch ${epoch}; the anchor is fixed so the rendered prefix is byte-identical to the previous turn.`
    });
}

/**
 * Applies the decision, returning the retained window.
 *
 * Generic over any turn shape: the decision is computed from measurable text, but applying it is
 * only a slice, so the host can keep its own richer turn objects rather than converting them.
 */
export function applyContextEpoch<T>(
    history: readonly T[],
    decision: ContextEpochDecision
): readonly T[] {
    return Object.freeze(history.slice(decision.startIndex));
}

/**
 * Content-free record of prefix stability, safe to log.
 *
 * Deliberately carries no prompt text: the hash is over content but only the digest is retained, so
 * two turns can be compared for prefix identity without any conversation being stored.
 */
export interface PrefixStabilityRecord {
    readonly epoch: number;
    readonly retainedTurns: number;
    readonly retainedTokens: number;
    readonly prefixDigest: string;
    readonly checkpointCreated: boolean;
}

/**
 * What a checkpoint must carry across an epoch boundary.
 *
 * When the anchor advances, turns before it stop being sent. Most of what they contained is
 * genuinely spent - restated context, superseded attempts, output the model already acted on. But a
 * few kinds of fact remain load-bearing for the rest of the conversation, and losing them silently
 * is how a long session starts contradicting decisions it made an hour earlier.
 *
 * Extraction is deterministic and lossy on purpose. This is not a summary: no model is called, no
 * prose is generated, and nothing is paraphrased. It lifts the specific spans that match known
 * shapes - a stated decision, a named constraint, a referenced file, an unresolved task, a reported
 * error - and carries them verbatim. A deterministic checkpoint can be diffed and asserted against;
 * a generated one can only be trusted.
 */
export interface ConversationCheckpoint {
    readonly epoch: number;
    /** Turn range the checkpoint summarises, so it can be traced back. */
    readonly coversTurns: { readonly from: number; readonly to: number };
    /** Decisions the conversation settled, verbatim. */
    readonly decisions: readonly string[];
    /** Constraints and requirements stated by the user. */
    readonly constraints: readonly string[];
    /** Files referenced by path, so later turns can re-request them by name. */
    readonly referencedFiles: readonly string[];
    /** Work stated as outstanding and not yet reported done. */
    readonly unresolvedTasks: readonly string[];
    /** Errors and failures reported but not subsequently reported fixed. */
    readonly openErrors: readonly string[];
    /** Digest of the dropped turns, so a checkpoint can be tied to what produced it. */
    readonly sourceDigest: string;
}

/** Caps per category. A checkpoint that grows with the conversation defeats its own purpose. */
export const MAX_CHECKPOINT_ITEMS_PER_CATEGORY = 8;
const MAX_CHECKPOINT_ITEM_CHARS = 240;

const DECISION_PATTERNS = [
    /\b(?:we(?:'ll| will)?|let's|going to|decided to|agreed to|chose to)\s+[^.!?\n]{8,}/gi,
    /\b(?:use|using|switch to|keep|adopt)\s+[A-Za-z0-9_@.\/-]{2,}[^.!?\n]{0,80}/gi
];
const CONSTRAINT_PATTERNS = [
    /\b(?:must|must not|never|always|do not|don't|cannot|required to|should not)\s+[^.!?\n]{8,}/gi
];
const TASK_PATTERNS = [
    /\b(?:todo|to do|next|still need to|remaining|outstanding|not yet)\b[^.!?\n]{5,}/gi
];
const ERROR_PATTERNS = [
    /\b(?:error|exception|failed|failing|cannot find|is not assignable|undefined)\b[^.!?\n]{5,}/gi
];
const FILE_PATTERN = /(?<![\w./-])[\w.-]+\/[\w./-]{0,4096}\.[a-z]{1,4}\b|(?<![\w-])[\w-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|cs|cpp|h|json|md)\b/gi;

function collect(text: string, patterns: readonly RegExp[]): string[] {
    const found: string[] = [];
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            const value = match[0].trim().slice(0, MAX_CHECKPOINT_ITEM_CHARS);
            if (value.length >= 8) found.push(value);
        }
    }
    return found;
}

/** Deduplicates case-insensitively while keeping first-seen order and casing, then caps. */
function distinct(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(value);
        if (kept.length >= MAX_CHECKPOINT_ITEMS_PER_CATEGORY) break;
    }
    return kept;
}

/**
 * Builds the checkpoint for the turns an epoch boundary is about to drop.
 *
 * An error later reported as fixed is not carried: an "open error" that was resolved two turns after
 * it appeared would make the model chase a problem that no longer exists, which is a more expensive
 * failure than forgetting it.
 */
export function buildConversationCheckpoint(
    droppedTurns: readonly EpochTurn[],
    epoch: number,
    fromIndex: number
): ConversationCheckpoint {
    const joined = droppedTurns.map(item => item?.content ?? '').join(String.fromCharCode(10));
    const lower = joined.toLowerCase();

    const openErrors = collect(joined, ERROR_PATTERNS).filter(entry => {
        const symbol = entry.match(/'([^']{2,64})'/)?.[1];
        if (!symbol) return true;
        // Plain search rather than a constructed regex: the symbol comes from conversation text,
        // so building a pattern from it would need escaping that is easy to get subtly wrong, and a
        // malformed pattern here would silently drop every open error.
        const needle = symbol.toLowerCase();
        const resolvedNearby = ['fixed', 'resolved', 'passing', 'works now'].some(marker => {
            let from = 0;
            for (;;) {
                const at = lower.indexOf(marker, from);
                if (at < 0) return false;
                const window = lower.slice(at, at + marker.length + 80);
                if (window.includes(needle)) return true;
                from = at + marker.length;
            }
        });
        return !resolvedNearby;
    });

    return Object.freeze({
        epoch,
        coversTurns: Object.freeze({ from: fromIndex, to: fromIndex + Math.max(0, droppedTurns.length - 1) }),
        decisions: Object.freeze(distinct(collect(joined, DECISION_PATTERNS))),
        constraints: Object.freeze(distinct(collect(joined, CONSTRAINT_PATTERNS))),
        referencedFiles: Object.freeze(distinct(collect(joined, [FILE_PATTERN]))),
        unresolvedTasks: Object.freeze(distinct(collect(joined, TASK_PATTERNS))),
        openErrors: Object.freeze(distinct(openErrors)),
        sourceDigest: prefixDigest(droppedTurns)
    });
}

/** Renders a checkpoint as the single message that replaces the turns it covers. */
export function renderCheckpoint(checkpoint: ConversationCheckpoint): string {
    const lines: string[] = [`[conversation checkpoint - epoch ${checkpoint.epoch}, `
        + `turns ${checkpoint.coversTurns.from}-${checkpoint.coversTurns.to} elided]`];
    const section = (title: string, items: readonly string[]) => {
        if (items.length === 0) return;
        lines.push(`${title}:`);
        for (const item of items) lines.push(`- ${item}`);
    };
    section('Decisions', checkpoint.decisions);
    section('Constraints', checkpoint.constraints);
    section('Referenced files', checkpoint.referencedFiles);
    section('Unresolved', checkpoint.unresolvedTasks);
    section('Open errors', checkpoint.openErrors);
    return lines.join(String.fromCharCode(10));
}

/** Small, fast, non-cryptographic digest. Identity comparison only, never a security boundary. */
export function prefixDigest(turns: readonly EpochTurn[]): string {
    let hash = 0x811c9dc5;
    for (const turn of turns) {
        const text = turn?.content ?? '';
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        hash ^= 0x5f; hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export function recordPrefixStability(
    retained: readonly EpochTurn[],
    decision: ContextEpochDecision
): PrefixStabilityRecord {
    return Object.freeze({
        epoch: decision.epoch,
        retainedTurns: decision.retainedTurns,
        retainedTokens: decision.retainedTokens,
        // The digest covers everything except the newest turn, because that is the part a provider
        // cache can match on: the prefix that existed before this request added to it.
        prefixDigest: prefixDigest(retained.slice(0, Math.max(0, retained.length - 1))),
        checkpointCreated: decision.checkpointCreated
    });
}
