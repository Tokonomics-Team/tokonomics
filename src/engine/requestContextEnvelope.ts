/**
 * Request context envelope and the attachment policy that governs it.
 *
 * One envelope is built per user request and describes everything the host knows about where the
 * request came from: the prompt, any explicit selection, the active document and its version, and
 * what the user has consented to. The compiler stays host-agnostic; this module is pure policy so
 * the decision can be tested without VS Code.
 *
 * The policy this encodes is the correction to a real defect. Automatic mode previously attached the
 * entire active document *and* ran workspace retrieval, so a request carried a whole file plus a
 * retrieval pack covering much of the same ground. The measured retrieval saving describes retrieval
 * used *instead of* attachment, which is not what production did - the benchmark and the product
 * were measuring different things.
 *
 * The ordering rule is therefore: an exact explicit selection is mandatory evidence and is never
 * pruned; otherwise retrieval goes first; and the whole document is attached only as a declared
 * conservative fallback, when retrieval has already been tried and could not put evidence in front
 * of the model. A fallback that fires is recorded with its reason and token cost rather than being
 * silently indistinguishable from a retrieval-first request.
 *
 * Pure module: deterministic in its arguments, no I/O, no VS Code, no configuration.
 */

/** Workspace context modes, mirroring the single public workspaceContext setting. */
export type EnvelopeContextMode = 'off' | 'selection' | 'automatic';

/**
 * A selection shorter than this is treated as a cursor artifact rather than deliberate evidence.
 * Matches the threshold the participant already applied before attaching a selection.
 */
export const MINIMUM_DELIBERATE_SELECTION_CHARS = 30;

export interface RequestContextEnvelope {
    /** Content-free identity, for correlating receipts across the two compile passes. */
    readonly envelopeId: string;
    readonly contextMode: EnvelopeContextMode;
    readonly promptChars: number;
    readonly activeFilePath?: string;
    readonly documentVersion?: number;
    readonly cursorLine?: number;
    /** Exact text the user selected. Mandatory evidence when deliberate; never pruned or summarised. */
    readonly selectionText?: string;
    readonly documentIsDirty: boolean;
    /** Whether the user permitted unsaved buffer content to leave the machine. */
    readonly unsavedBuffersPermitted: boolean;
    readonly workspaceTrusted: boolean;
    /** Whether a usable workspace index snapshot exists to retrieve from. */
    readonly retrievalAvailable: boolean;
}

export type AttachmentKind =
    | 'none'
    | 'exact_selection'
    | 'retrieval_first'
    | 'full_document_fallback';

export interface AttachmentDecision {
    readonly kind: AttachmentKind;
    readonly allowRetrieval: boolean;
    readonly attachFullDocument: boolean;
    /** Exact selection to attach verbatim, when the mode and consent permit one. */
    readonly attachSelection: boolean;
    /** Auditable explanation; recorded on the request and surfaced in diagnostics. */
    readonly reason: string;
}

/** Outcome of a retrieval pass, reduced to what the fallback decision depends on. */
export interface RetrievalOutcome {
    readonly attempted: boolean;
    readonly selectedCount: number;
    readonly sufficient: boolean;
    readonly conservativeFallback: boolean;
    readonly missingRequired: readonly string[];
    /**
     * Three-way sufficiency from the retriever. `unusable` is the only state that justifies
     * attaching a whole file; `incomplete_declared` still has evidence and declares its gap.
     */
    readonly sufficiency?: 'complete' | 'incomplete_declared' | 'unusable';
}

/** True when a selection is long enough to read as deliberate rather than an accidental drag. */
export function isDeliberateSelection(selectionText: string | undefined): boolean {
    return typeof selectionText === 'string'
        && selectionText.trim().length > MINIMUM_DELIBERATE_SELECTION_CHARS;
}

/**
 * Whether the document's text may be read at all.
 *
 * A dirty buffer holds content the user has not saved; sending it is a separate consent from
 * reading the workspace, so an unsaved document stays unreadable unless that consent is given.
 */
export function mayReadDocument(envelope: RequestContextEnvelope): boolean {
    if (!envelope.workspaceTrusted || envelope.contextMode === 'off') return false;
    return envelope.unsavedBuffersPermitted || !envelope.documentIsDirty;
}

/**
 * The first pass. Never attaches the whole document: in automatic mode retrieval is given the
 * chance to satisfy the contract with a fraction of the tokens.
 */
export function resolveInitialAttachment(envelope: RequestContextEnvelope): AttachmentDecision {
    if (envelope.contextMode === 'off') {
        return Object.freeze({
            kind: 'none' as const, allowRetrieval: false, attachFullDocument: false, attachSelection: false,
            reason: 'Workspace context is off; the prompt is forwarded with no file or index evidence.'
        });
    }

    const readable = mayReadDocument(envelope);
    const deliberateSelection = readable && isDeliberateSelection(envelope.selectionText);

    if (envelope.contextMode === 'selection') {
        return Object.freeze({
            kind: (deliberateSelection ? 'exact_selection' : 'none') as AttachmentKind,
            allowRetrieval: false,
            attachFullDocument: false,
            attachSelection: deliberateSelection,
            reason: deliberateSelection
                ? 'Selection mode: the explicit selection is attached exactly and nothing else is read.'
                : envelope.documentIsDirty && !envelope.unsavedBuffersPermitted
                    ? 'Selection mode: the document has unsaved changes and Include Unsaved Changes is off.'
                    : 'Selection mode: no deliberate selection, so no file evidence is attached.'
        });
    }

    // Automatic mode.
    if (deliberateSelection) {
        return Object.freeze({
            kind: 'exact_selection' as const,
            allowRetrieval: envelope.retrievalAvailable,
            attachFullDocument: false,
            attachSelection: true,
            reason: 'Automatic mode: an explicit selection is mandatory exact evidence, so it is attached '
                + 'verbatim and retrieval supplements it rather than the whole file being sent.'
        });
    }

    if (!envelope.retrievalAvailable) {
        // Nothing can be retrieved, so the document is the only evidence available. Declared on the
        // first pass precisely because retrieval is already known to be impossible.
        return Object.freeze({
            kind: 'full_document_fallback' as const,
            allowRetrieval: false,
            attachFullDocument: readable,
            attachSelection: false,
            reason: readable
                ? 'Automatic mode: no workspace index is available to retrieve from, so the active document '
                    + 'is attached as the declared conservative fallback.'
                : 'Automatic mode: no workspace index is available and the document cannot be read.'
        });
    }

    return Object.freeze({
        kind: 'retrieval_first' as const,
        allowRetrieval: true,
        attachFullDocument: false,
        attachSelection: false,
        reason: 'Automatic mode: workspace retrieval is given the first opportunity to satisfy the '
            + 'evidence contract, instead of attaching the whole active document.'
    });
}

/**
 * The second pass, evaluated only after retrieval has actually run.
 *
 * Returns undefined when the first pass stands. A fallback is warranted only when retrieval was the
 * strategy, was attempted, and put nothing in front of the model - never merely because the contract
 * was incomplete, since an incomplete contract with rendered evidence is already declared to the
 * model as a shortfall and is far cheaper than resending the whole file.
 */
export function resolveFallbackAttachment(
    envelope: RequestContextEnvelope,
    initial: AttachmentDecision,
    outcome: RetrievalOutcome
): AttachmentDecision | undefined {
    if (initial.kind !== 'retrieval_first') return undefined;
    if (!mayReadDocument(envelope) || !envelope.activeFilePath) return undefined;
    if (!outcome.attempted) return undefined;

    // Retrieval produced usable evidence: keep it. This is the case the saving comes from.
    // The retriever's own tri-state is authoritative when present; selectedCount is the fallback
    // reading for callers that predate it.
    if (outcome.sufficiency && outcome.sufficiency !== 'unusable') return undefined;
    if (outcome.selectedCount > 0) return undefined;

    const missing = outcome.missingRequired.length > 0
        ? ` (missing [${outcome.missingRequired.join(', ')}])`
        : '';
    return Object.freeze({
        kind: 'full_document_fallback' as const,
        allowRetrieval: true,
        attachFullDocument: true,
        attachSelection: false,
        reason: 'Automatic mode: retrieval admitted no evidence' + missing
            + ', so the active document is attached as the declared conservative fallback rather than '
            + 'sending the model a prompt with no code.'
    });
}

/** Content-free record of what the envelope decided, safe to log and to assert against. */
export interface AttachmentReceipt {
    readonly envelopeId: string;
    readonly contextMode: EnvelopeContextMode;
    readonly kind: AttachmentKind;
    readonly fellBack: boolean;
    readonly reason: string;
    /** Tokens the fallback added, so its cost is visible rather than absorbed. */
    readonly fallbackTokens: number;
}

export function buildAttachmentReceipt(
    envelope: RequestContextEnvelope,
    decision: AttachmentDecision,
    fallbackTokens: number = 0
): AttachmentReceipt {
    return Object.freeze({
        envelopeId: envelope.envelopeId,
        contextMode: envelope.contextMode,
        kind: decision.kind,
        fellBack: decision.kind === 'full_document_fallback',
        reason: decision.reason,
        fallbackTokens: Math.max(0, Math.trunc(fallbackTokens))
    });
}
