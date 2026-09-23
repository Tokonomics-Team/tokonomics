/**
 * Tokonomics Chat Surface — extension-host/webview message contract.
 *
 * The webview is treated as untrusted. It can be reloaded, restored from a serialized state, or
 * driven by injected script if a content-security-policy defect ever existed, so every inbound
 * message is validated here before the controller sees it: unknown types, unexpected properties,
 * oversized strings, forged or stale session identifiers, and non-string payloads are all rejected.
 *
 * Nothing in this module performs I/O, touches VS Code, or reads configuration. It is pure so the
 * validation rules can be fuzzed directly.
 */

/** Maximum accepted prompt length in characters. The canonical compiler owns the real budget. */
export const MAX_PROMPT_CHARS = 32_000;
/** Maximum accepted length for any other inbound string field (ids, model ids). */
export const MAX_FIELD_CHARS = 256;
/** Maximum number of turns retained for a session, counting user and assistant messages. */
export const MAX_SESSION_MESSAGES = 40;
/** Maximum total characters retained across a session's model-visible history. */
export const MAX_SESSION_CHARS = 120_000;
/** Maximum characters emitted to the view in a single stream delta. */
export const MAX_STREAM_DELTA_CHARS = 4_000;
/** Maximum characters accumulated into one rendered assistant message. */
export const MAX_RENDERED_RESPONSE_CHARS = 200_000;

/** Model metadata safe to show in the view. Mirrors the fields VS Code actually exposes. */
export interface ChatModelDescriptor {
    readonly id: string;
    readonly name: string;
    readonly vendor: string;
    readonly family: string;
    readonly version: string;
    readonly maxInputTokens: number;
}

export type InboundChatMessage =
    | { readonly type: 'ready' }
    | { readonly type: 'selectModel'; readonly sessionId: string; readonly modelId: string }
    | { readonly type: 'submit'; readonly sessionId: string; readonly requestId: string; readonly prompt: string }
    | { readonly type: 'cancel'; readonly sessionId: string }
    | { readonly type: 'newSession'; readonly sessionId: string }
    | { readonly type: 'refreshModels'; readonly sessionId: string }
    | { readonly type: 'openDashboard' }
    | { readonly type: 'openTrace' };

/** Reason a request could not be served, rendered verbatim to the user. */
export type ChatErrorKind =
    | 'no_models' | 'model_unavailable' | 'consent_required' | 'quota'
    | 'cancelled' | 'busy' | 'provider_error' | 'unsupported_output' | 'internal';

export type OutboundChatMessage =
    | { readonly type: 'session'; readonly sessionId: string }
    | { readonly type: 'models'; readonly sessionId: string; readonly models: readonly ChatModelDescriptor[];
        readonly selectedModelId: string | null; readonly selectionLost: boolean }
    | { readonly type: 'busy'; readonly sessionId: string; readonly busy: boolean }
    | { readonly type: 'appendUser'; readonly sessionId: string; readonly requestId: string; readonly text: string }
    | { readonly type: 'streamStart'; readonly sessionId: string; readonly requestId: string }
    | { readonly type: 'streamDelta'; readonly sessionId: string; readonly requestId: string; readonly text: string }
    | { readonly type: 'streamEnd'; readonly sessionId: string; readonly requestId: string }
    | { readonly type: 'usage'; readonly sessionId: string; readonly requestId: string; readonly summary: string }
    | { readonly type: 'error'; readonly sessionId: string; readonly requestId: string | null;
        readonly kind: ChatErrorKind; readonly message: string }
    | { readonly type: 'cleared'; readonly sessionId: string };

const INBOUND_TYPES: ReadonlySet<string> = new Set([
    'ready', 'selectModel', 'submit', 'cancel', 'newSession', 'refreshModels', 'openDashboard', 'openTrace'
]);

/** Fields legitimately present on each inbound message type, used to reject unexpected properties. */
const INBOUND_SHAPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
    ready: ['type'],
    selectModel: ['type', 'sessionId', 'modelId'],
    submit: ['type', 'sessionId', 'requestId', 'prompt'],
    cancel: ['type', 'sessionId'],
    newSession: ['type', 'sessionId'],
    refreshModels: ['type', 'sessionId'],
    openDashboard: ['type'],
    openTrace: ['type']
});

export interface InboundValidationSuccess { readonly ok: true; readonly message: InboundChatMessage; }
export interface InboundValidationFailure { readonly ok: false; readonly reason: string; }
export type InboundValidationResult = InboundValidationSuccess | InboundValidationFailure;

/**
 * Validates one raw message received from the webview.
 *
 * `expectedSessionId` is the id the host currently owns. Any message carrying a different id is a
 * stale or forged send - for example a webview restored after a New Session - and is refused so a
 * previous session can never write into the current one.
 */
export function validateInboundMessage(raw: unknown, expectedSessionId: string): InboundValidationResult {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { ok: false, reason: 'message_not_object' };
    }
    const record = raw as Record<string, unknown>;
    const type = record.type;
    if (typeof type !== 'string' || !INBOUND_TYPES.has(type)) {
        return { ok: false, reason: 'unknown_type' };
    }

    const allowed = INBOUND_SHAPE[type];
    for (const key of Object.keys(record)) {
        if (!allowed.includes(key)) return { ok: false, reason: `unexpected_property:${key}` };
    }
    for (const key of allowed) {
        if (!(key in record)) return { ok: false, reason: `missing_property:${key}` };
    }

    if (allowed.includes('sessionId')) {
        const sessionId = record.sessionId;
        if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > MAX_FIELD_CHARS) {
            return { ok: false, reason: 'invalid_session_id' };
        }
        if (sessionId !== expectedSessionId) return { ok: false, reason: 'stale_session' };
    }

    switch (type) {
        case 'selectModel': {
            const modelId = record.modelId;
            if (typeof modelId !== 'string' || modelId.length === 0 || modelId.length > MAX_FIELD_CHARS) {
                return { ok: false, reason: 'invalid_model_id' };
            }
            return { ok: true, message: { type, sessionId: record.sessionId as string, modelId } };
        }
        case 'submit': {
            const requestId = record.requestId;
            const prompt = record.prompt;
            if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > MAX_FIELD_CHARS) {
                return { ok: false, reason: 'invalid_request_id' };
            }
            if (typeof prompt !== 'string') return { ok: false, reason: 'invalid_prompt' };
            if (prompt.trim().length === 0) return { ok: false, reason: 'empty_prompt' };
            if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, reason: 'prompt_too_large' };
            return { ok: true, message: { type, sessionId: record.sessionId as string, requestId, prompt } };
        }
        case 'cancel':
        case 'newSession':
        case 'refreshModels':
            return { ok: true, message: { type, sessionId: record.sessionId as string } as InboundChatMessage };
        default:
            return { ok: true, message: { type } as InboundChatMessage };
    }
}

/**
 * Reduces a VS Code chat model to the content-free descriptor the view is allowed to see.
 * Values are clamped so a hostile or malformed host entry cannot inflate the payload.
 */
export function toModelDescriptor(model: {
    id?: unknown; name?: unknown; vendor?: unknown; family?: unknown; version?: unknown; maxInputTokens?: unknown;
}): ChatModelDescriptor | undefined {
    const id = clampField(model.id);
    if (!id) return undefined;
    return Object.freeze({
        id,
        name: clampField(model.name) || id,
        vendor: clampField(model.vendor) || 'unknown',
        family: clampField(model.family) || '',
        version: clampField(model.version) || '',
        maxInputTokens: typeof model.maxInputTokens === 'number' && Number.isFinite(model.maxInputTokens)
            && model.maxInputTokens > 0 ? Math.floor(model.maxInputTokens) : 0
    });
}

function clampField(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, MAX_FIELD_CHARS) : '';
}

/** Splits streamed text into bounded deltas so one huge fragment cannot stall the view. */
export function chunkStreamText(text: string): string[] {
    if (text.length <= MAX_STREAM_DELTA_CHARS) return [text];
    const chunks: string[] = [];
    for (let offset = 0; offset < text.length; offset += MAX_STREAM_DELTA_CHARS) {
        chunks.push(text.slice(offset, offset + MAX_STREAM_DELTA_CHARS));
    }
    return chunks;
}
