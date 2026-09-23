/**
 * Authoritative pre-send token counting.
 *
 * Tokonomics budgets with a fast character-density estimator, because packing evaluates many
 * candidate payloads and an exact count per candidate would cost more than it saves. The estimator
 * is calibrated but it is still an estimate, and a payload that the estimator says fits can still
 * exceed the model's real input budget - which fails the request outright, after the user has
 * already waited.
 *
 * The VS Code Language Model API exposes `countTokens` on a selected model. That is the model's own
 * tokenizer, so it is authoritative in a way nothing computed locally can be. It is used once, on
 * the final canonical payload, rather than during packing.
 *
 * What this deliberately is not: `countTokens` is a counting API, not usage reporting. It says how
 * many tokens a payload will occupy; it says nothing about what was billed, what was cached, or
 * what the provider actually charged. Recording it as anything other than a count would restate the
 * gap ADR-001 documents, so the counting method travels with the number.
 *
 * Pure module apart from the injected counter, so the policy is testable without a model.
 */

/** The subset of a VS Code LanguageModelChat this needs. */
export interface TokenCountingModel {
    countTokens(text: string, token?: unknown): Thenable<number>;
}

export type CountingMethod = 'provider_counted' | 'estimated' | 'estimate_after_failure';

export interface AuthoritativeCountResult {
    readonly tokens: number;
    readonly method: CountingMethod;
    /**
     * Signed difference between the estimate and the authoritative count, as a fraction of the
     * authoritative count. Positive means the estimator was high. Recorded so the estimator's
     * calibration can be checked against reality instead of assumed.
     */
    readonly estimatorDrift: number;
    readonly withinBudget: boolean;
    readonly reason: string;
}

/** Margin applied to the estimate when no authoritative count is available. */
export const CONSERVATIVE_ESTIMATE_MARGIN = 0.05;

/**
 * Counts the final payload with the model's own tokenizer when it offers one.
 *
 * Never throws and never blocks the send: a counting failure degrades to the estimate with a
 * conservative margin, because refusing to send a request because it could not be measured would
 * trade a possible failure for a certain one.
 */
export async function countAuthoritative(
    model: TokenCountingModel | undefined,
    payloadText: string,
    estimatedTokens: number,
    budget: number | undefined,
    cancellation?: unknown
): Promise<AuthoritativeCountResult> {
    const withinBudgetOf = (tokens: number) =>
        typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || tokens <= budget;

    if (!model || typeof model.countTokens !== 'function') {
        // No authoritative counter: treat the estimate as optimistic and add a margin before
        // deciding whether it fits, so an unmeasured payload is not assumed to be safe.
        const guarded = Math.ceil(estimatedTokens * (1 + CONSERVATIVE_ESTIMATE_MARGIN));
        return Object.freeze({
            tokens: estimatedTokens,
            method: 'estimated' as const,
            estimatorDrift: 0,
            withinBudget: withinBudgetOf(guarded),
            reason: 'The selected model exposes no token counter; the estimate is used with a conservative margin.'
        });
    }

    try {
        const counted = await model.countTokens(payloadText, cancellation);
        if (!Number.isFinite(counted) || counted <= 0) {
            throw new Error('non-numeric count');
        }
        return Object.freeze({
            tokens: counted,
            method: 'provider_counted' as const,
            estimatorDrift: Number(((estimatedTokens - counted) / counted).toFixed(4)),
            withinBudget: withinBudgetOf(counted),
            reason: 'Counted with the selected model\'s own tokenizer. This is a token count, not billed usage.'
        });
    } catch {
        const guarded = Math.ceil(estimatedTokens * (1 + CONSERVATIVE_ESTIMATE_MARGIN));
        return Object.freeze({
            tokens: estimatedTokens,
            method: 'estimate_after_failure' as const,
            estimatorDrift: 0,
            withinBudget: withinBudgetOf(guarded),
            reason: 'The model token counter failed; the estimate is used with a conservative margin '
                + 'rather than blocking a request that would otherwise have succeeded.'
        });
    }
}

/**
 * Deterministic repack plan for a payload the model counted as over budget.
 *
 * Repacking drops optional evidence, never mandatory evidence and never the user's own instruction.
 * If the payload still does not fit once every optional item is gone, the request fails closed
 * rather than silently truncating: a request missing the evidence it declared mandatory produces a
 * confident answer to a question it could not see, which is worse than an error the user can act on.
 *
 * Optional items are dropped lowest-value first, so what survives is what the packer already judged
 * most useful. The plan is a pure function of its inputs, so the same overflow always produces the
 * same payload - a repack that varied between runs would make the cache miss it causes permanent.
 */
export interface RepackItem {
    readonly id: string;
    readonly tokens: number;
    readonly mandatory: boolean;
    /** Packer utility; lower is dropped first. */
    readonly value: number;
}

export interface RepackPlan {
    readonly droppedIds: readonly string[];
    readonly retainedTokens: number;
    readonly fits: boolean;
    readonly reason: string;
}

export function planRepack(
    items: readonly RepackItem[],
    fixedTokens: number,
    budget: number
): RepackPlan {
    const total = (kept: readonly RepackItem[]) =>
        fixedTokens + kept.reduce((sum, item) => sum + Math.max(0, item.tokens), 0);

    const mandatory = items.filter(item => item.mandatory);
    // Ascending by value, then by id so ties break deterministically rather than by array order.
    const optional = items.filter(item => !item.mandatory)
        .sort((left, right) => left.value - right.value || left.id.localeCompare(right.id));

    const dropped: string[] = [];
    let kept = [...mandatory, ...optional];
    for (const candidate of optional) {
        if (total(kept) <= budget) break;
        kept = kept.filter(item => item.id !== candidate.id);
        dropped.push(candidate.id);
    }

    const retainedTokens = total(kept);
    const fits = retainedTokens <= budget;
    return Object.freeze({
        droppedIds: Object.freeze(dropped),
        retainedTokens,
        fits,
        reason: fits
            ? dropped.length === 0
                ? 'The payload already fits; nothing was dropped.'
                : `Dropped ${dropped.length} optional evidence item(s), lowest value first, to fit the budget.`
            : 'Mandatory evidence alone exceeds the budget. The request fails closed rather than '
                + 'sending a payload missing the evidence it declared it needed.'
    });
}

/**
 * Whether an authoritative count means the payload must be repacked.
 *
 * Repacking is warranted only when the authoritative count is over budget *and* the estimate said
 * otherwise. A payload the estimator already knew was too large was never packed in the first place.
 */
export function requiresRepack(
    result: AuthoritativeCountResult,
    estimatedTokens: number,
    budget: number | undefined
): boolean {
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) return false;
    if (result.method !== 'provider_counted') return false;
    return result.tokens > budget && estimatedTokens <= budget;
}
