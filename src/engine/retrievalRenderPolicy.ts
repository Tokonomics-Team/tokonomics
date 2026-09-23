/**
 * Tokonomics Retrieval Render Policy
 *
 * Decides whether retrieved evidence should be rendered into the outgoing payload, and what to say
 * when the evidence contract could not be fully satisfied.
 *
 * Why this exists. The budget stage previously skipped rendering whenever the evidence contract
 * reported a conservative fallback. That is correct when the caller attached source: the attached
 * code is still in the payload, so rendering nothing leaves an answerable request. It is wrong when
 * retrieval is the ONLY context source. Measured on a five-file workload, debug, refactor and
 * feature requests emitted 19-33 tokens - the bare instruction, no code - while retrieval had in
 * fact admitted ten candidates covering the target implementation and its callers. The model would
 * have answered from nothing, confidently and without evidence. That is a worse failure than
 * declining to optimise.
 *
 * The rule this module encodes: never emit a context-free payload when context was requested and
 * admissible evidence exists. Render what was admitted, and declare what is missing so the model can
 * ask for it rather than assume the evidence was complete. Nothing required is displaced - content
 * is added where there was none.
 *
 * Pure module: no I/O, no VS Code, no configuration, deterministic in its arguments.
 */

import type { MessagePayload } from '../types';

/**
 * A message shorter than this and free of fenced code is treated as a bare instruction rather than
 * caller-supplied context. This is what separates a retrieval-first request from one that already
 * carries its own source.
 */
export const RETRIEVAL_ONLY_PROMPT_CHARS = 600;

export interface RetrievalRenderInput {
    readonly messages: readonly MessagePayload[];
    readonly allowWorkspaceRetrieval: boolean;
    /**
     * Whether the caller actually attached workspace source, when the caller knows.
     *
     * The shape of a message is a poor proxy for this and the editor supplies a counter-example on
     * every turn: the VS Code skills list arrives as an attachment, is long, and contains fenced
     * code, so the heuristic below reads it as caller-supplied source. The request is then treated
     * as one that already carries its own code, retrieved workspace evidence is discarded by the
     * conservative restore, and the model is left answering a question about a repository it was
     * never shown. Callers that can tell the difference say so here; the heuristic remains the
     * fallback for callers that cannot.
     */
    readonly callerSuppliedSource?: boolean;
    readonly hasRetrieval: boolean;
    readonly conservativeFallback: boolean;
    readonly selectedCount: number;
    readonly missingRequired: readonly string[];
}

export interface RetrievalRenderDecision {
    /** True when the caller's own messages already carry usable context. */
    readonly callerSuppliedContext: boolean;
    /** True when retrieval is the only thing that can put code in front of the model. */
    readonly retrievalIsSoleContext: boolean;
    /** True when admitted evidence should be rendered into the payload. */
    readonly shouldRender: boolean;
    /** Categories to declare as missing inside the evidence wrapper; empty when the contract held. */
    readonly shortfallCategories: readonly string[];
    /** True when retrieval was asked for, produced nothing, and no context was attached. */
    readonly emptyContextWarning: boolean;
}

export function resolveRetrievalRenderDecision(input: RetrievalRenderInput): RetrievalRenderDecision {
    const callerSuppliedContext = typeof input.callerSuppliedSource === 'boolean'
        ? input.callerSuppliedSource
        : input.messages.some(message => message.content.includes('```'));
    const renderable = input.hasRetrieval && input.selectedCount > 0;
    const retrievalIsSoleContext = !callerSuppliedContext && renderable;

    // Render when the contract held, or when retrieval is the only context available. The second
    // case is the correction: an incomplete contract must not collapse the payload to nothing.
    const shouldRender = renderable && (!input.conservativeFallback || retrievalIsSoleContext);

    const shortfallCategories = input.conservativeFallback && retrievalIsSoleContext
        ? [...input.missingRequired]
        : [];

    return Object.freeze({
        callerSuppliedContext,
        retrievalIsSoleContext,
        shouldRender,
        shortfallCategories: Object.freeze(shortfallCategories),
        emptyContextWarning: !callerSuppliedContext && input.allowWorkspaceRetrieval && !renderable
    });
}

/** Attribute appended to the evidence wrapper when the contract could not be fully satisfied. */
export function shortfallAttribute(categories: readonly string[]): string {
    return categories.length > 0 ? ` incomplete="${categories.join(',')}"` : '';
}

export interface RetrievalRenderDecisionRecord {
    readonly itemId: string;
    readonly action: 'include' | 'preserve';
    readonly reason: string;
    readonly confidence: number;
    readonly evidence: string[];
}

/**
 * Auditable decisions describing why evidence was, or was not, rendered. Kept beside the rule so the
 * wording and the conditions can be asserted together in tests.
 */
export function buildRetrievalRenderDecisions(
    decision: RetrievalRenderDecision,
    criticalRecall: number
): RetrievalRenderDecisionRecord[] {
    if (decision.emptyContextWarning) {
        return [{
            itemId: 'retrieval_yielded_no_context', action: 'preserve',
            reason: 'Workspace retrieval was requested but produced no admissible evidence, and the request carried '
                + 'no attached context. The prompt is forwarded unchanged; it contains no code.',
            confidence: 1, evidence: ['EvidenceAwareRetriever', 'no_admissible_candidates']
        }];
    }
    if (decision.shortfallCategories.length > 0) {
        return [{
            itemId: 'retrieval_rendered_under_incomplete_contract', action: 'include',
            reason: `Evidence contract incomplete (missing [${decision.shortfallCategories.join(', ')}]) but retrieval `
                + 'was the only context source; admitted evidence is rendered and the shortfall declared to the model.',
            confidence: criticalRecall,
            evidence: ['EvidenceAwareRetriever', 'retrieval_only_request',
                ...decision.shortfallCategories.map(category => `missing:${category}`)]
        }];
    }
    return [];
}
