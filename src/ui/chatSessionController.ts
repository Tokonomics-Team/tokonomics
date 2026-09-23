import { renderChatMarkdown } from './chatMarkdown';
/**
 * Tokonomics Chat Surface — extension-host session controller.
 *
 * This is the only place chat-view work happens. It owns model discovery, selection, bounded
 * session history, cancellation and the single send path. It deliberately does NOT compile
 * context, prepare egress, call a provider directly, compute cost, or emit lifecycle events: it
 * routes every send through the already-certified Tokonomics language-model proxy, which owns all
 * of that. The controller's job is to hand the proxy a well-formed request exactly once and
 * stream the answer back.
 *
 * Routing shape:
 *   controller -> vscode.lm proxy model (vendor 'tokonomics')
 *              -> CanonicalRequestCompiler -> CanonicalProviderGateway -> selected upstream model
 *              -> ledger + dashboard, unchanged
 */

import * as vscode from 'vscode';
import {
    ChatErrorKind, ChatModelDescriptor, MAX_RENDERED_RESPONSE_CHARS, MAX_SESSION_CHARS,
    MAX_SESSION_MESSAGES, OutboundChatMessage, chunkStreamText, toModelDescriptor
} from './chatProtocol';
import { boundedHistory, sanitizeModelHistoryText } from '../history/modelHistory';
import {
    CHAT_REQUEST_ID_OPTION, CHAT_SESSION_ID_OPTION, UPSTREAM_TARGET_MODEL_OPTION
} from '../proxy/modelProvider';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { effectiveCostState, explainCostState } from '../cost/accountingTruth';
import { subscriptionChoices } from '../subscriptions/modelChoices';
import { SubscriptionActivity, SubscriptionActivityListener, SubscriptionError } from '../subscriptions/cliTransport';
import { SecuritySanitizer } from '../security/sanitizer';
import { AnonymizedLogger } from '../security/anonymizedLogger';
import { SavedChatSession, ChatTranscriptRow, normalizeChatSession } from './chatPersistence';

/** Smallest gap between status updates. Reasoning arrives per token; the status line is not a log. */
const ACTIVITY_MIN_INTERVAL_MS = 400;

/** Vendor and id of the Tokonomics proxy model. Selecting it by exact identity avoids recursion. */
const PROXY_VENDOR = 'tokonomics';
const PROXY_MODEL_ID = 'token-optimizer-proxy';

/**
 * Namespaced option carrying the user's explicit upstream choice to the proxy. Imported from the
 * provider so the two sides of the contract cannot drift apart; the proxy validates the value and
 * nothing else in the request may influence model selection.
 */
export { UPSTREAM_TARGET_MODEL_OPTION as UPSTREAM_TARGET_OPTION } from '../proxy/modelProvider';

/** Sentinel meaning "let the existing provider Auto behaviour choose". */
export const AUTO_MODEL_ID = 'auto';

type Turn = { readonly role: 'user' | 'assistant'; readonly text: string };

export interface ChatHostBridge {
    /** Delivers one outbound message to the view. */
    post(message: OutboundChatMessage): void;
}

export interface ChatUsageEventSource {
    subscribe(listener: (event: PromptOptimizationEvent) => void): () => void;
}

export class ChatSessionController {
    private readonly activityEntries = new Map<string, { text: string; category: string; status?: 'running' | 'completed' | 'failed' }>();
    private transcript: ChatTranscriptRow[] = [];
    private lastMarkdownAt = 0;
    private sessionId: string;
    private history: Turn[] = [];
    private models: ChatModelDescriptor[] = [];
    private selectedModelId: string = AUTO_MODEL_ID;
    private inFlight: vscode.CancellationTokenSource | undefined;
    private activeRequestId: string | undefined;
    private completedRequestIds = new Set<string>();
    private activityModel: string | undefined;
    private activityReasoningChars = 0;
    private lastActivityText: string | undefined;
    private lastActivityAt = 0;
    private pendingUsage = new Map<string, string>();
    private disposed = false;
    private readonly unsubscribeFromEvents: () => void;

    constructor(
        private readonly bridge: ChatHostBridge,
        sessionId: string,
        eventSource: ChatUsageEventSource = OptimizationEventBus.getInstance(),
        /**
         * Builds the in-process proxy for this session. A factory rather than a ready-made model so
         * the controller can bind its own activity listener: progress has to be attributed to the
         * session showing it, and a model shared across sessions cannot do that.
         */
        private readonly localProxyFactory?: (onActivity: SubscriptionActivityListener) => vscode.LanguageModelChat,
        private readonly onChanged?: () => void
    ) {
        this.sessionId = sessionId;
        this.unsubscribeFromEvents = eventSource.subscribe(event => this.onOptimizationEvent(event));
    }

    public get currentSessionId(): string { return this.sessionId; }

    /** True while a send is outstanding; used to reject concurrent or repeated sends. */
    public get isBusy(): boolean { return this.inFlight !== undefined; }

    public getSelectedModelId(): string { return this.selectedModelId; }

    public getHistoryLength(): number { return this.history.length; }

    public snapshot(): SavedChatSession {
        return normalizeChatSession({ id: this.sessionId, selectedModelId: this.selectedModelId,
            history: this.history, transcript: this.transcript, updatedAt: Date.now(), interrupted: this.isBusy })!;
    }

    public restore(saved: SavedChatSession): void {
        const state = normalizeChatSession(saved);
        if (this.isBusy || !state) return;
        this.sessionId = state.id;
        this.selectedModelId = state.selectedModelId;
        this.history = state.history;
        this.transcript = state.transcript;
        if (state.interrupted) this.transcript.push({ role: 'info', text: 'This request was interrupted when VS Code closed. Send a new message to continue.' });
        this.completedRequestIds.clear();
        this.pendingUsage.clear();
        this.activityEntries.clear();
    }

    /** Rehydrate from host-owned state. A recreated document must never replay a send. */
    public replay(): void {
        this.bridge.post({ type: 'session', sessionId: this.sessionId });
        this.bridge.post({ type: 'restore', sessionId: this.sessionId,
            transcript: this.transcript.map(row => row.role === 'assistant' ? { ...row, markdown: renderChatMarkdown(row.text) } : row), busy: this.isBusy, requestId: this.activeRequestId ?? null });
        for (const [entryId, entry] of this.activityEntries) {
            this.bridge.post({ type: 'activity', sessionId: this.sessionId, entryId, ...entry });
        }
        this.bridge.post({ type: 'models', sessionId: this.sessionId, models: this.models,
            selectedModelId: this.selectedModelId, selectionLost: false });
    }

    private emit(message: OutboundChatMessage): void {
        // Late events from a cancelled/replaced session must not mutate the current transcript.
        if (this.disposed || message.sessionId !== this.sessionId) return;
        const requestId = 'requestId' in message ? message.requestId : undefined;
        const last = () => [...this.transcript].reverse().find(row => row.requestId === requestId && row.role === 'assistant');
        switch (message.type) {
            case 'appendUser': this.transcript.push({ role: 'user', text: message.text, requestId: message.requestId }); break;
            case 'streamStart': this.transcript.push({ role: 'assistant', text: '', requestId: message.requestId }); break;
            case 'streamDelta': { const row = last(); if (row) row.text += message.text; break; }
            case 'usage': { const row = last(); if (row) row.usage = message.summary; break; }
            case 'error': this.transcript.push({ role: 'error', text: message.message, requestId: message.requestId ?? undefined }); break;
            case 'notice': this.transcript.push({ role: 'info', text: message.message }); break;
            case 'cleared': this.transcript = []; break;
        }
        // Keep display memory bounded as well as the persisted and model-visible copies.
        while (this.transcript.length > MAX_SESSION_MESSAGES
            || (this.transcript.length > 1 && this.transcript.reduce((n, row) => n + row.text.length, 0) > MAX_RENDERED_RESPONSE_CHARS)) {
            this.transcript.shift();
        }
        if (message.type === 'streamEnd' || message.type === 'error' || (message.type === 'streamDelta' && Date.now() - this.lastMarkdownAt >= 100)) {
            const row = last();
            if (row) { message = { ...message, markdown: renderChatMarkdown(row.text) }; this.lastMarkdownAt = Date.now(); }
        }
        this.bridge.post(message);
        if (!['activity', 'models', 'session'].includes(message.type)) this.onChanged?.();
    }

    public async showSubscriptionModels(): Promise<void> {
        if (!this.localProxyFactory) return;
        const models = [...this.models.filter(model => !model.id.startsWith('subscription:')), ...await subscriptionChoices()];
        if (this.disposed) return;
        this.models = models;
        this.emit({ type: 'models', sessionId: this.sessionId, models,
            selectedModelId: this.selectedModelId, selectionLost: false });
    }

    /**
     * Enumerates models the host exposes publicly. Never called on activation - only when the user
     * opens or interacts with the view - so opening VS Code triggers no consent prompt or query.
     */
    public async refreshModels(): Promise<void> {
        if (this.disposed) return;
        let discovered: ChatModelDescriptor[] = [];
        try {
            const raw = (await vscode.lm.selectChatModels()) || [];
            const seen = new Set<string>();
            for (const model of raw) {
                // Never offer ourselves as an upstream target: that would recurse through the proxy.
                if ((model as { vendor?: string }).vendor === PROXY_VENDOR) continue;
                if (model.id === PROXY_MODEL_ID) continue;
                const descriptor = toModelDescriptor(model);
                if (!descriptor || seen.has(descriptor.id)) continue;
                seen.add(descriptor.id);
                discovered.push(descriptor);
            }
        } catch {
            // Consent denial, quota, or a host without a language-model API all land here. An empty
            // list plus the truthful "no models" state is the correct outcome; never invent one.
            discovered = [];
        }
        if (this.disposed) return;
        if (this.localProxyFactory) discovered.push(...await subscriptionChoices());
        this.models = discovered;

        // A selection is preserved only while it still exists. It is never silently swapped.
        const selectionLost = this.selectedModelId !== AUTO_MODEL_ID
            && !discovered.some(model => model.id === this.selectedModelId);
        if (selectionLost) { this.selectedModelId = AUTO_MODEL_ID; this.onChanged?.(); }

        this.emit({
            type: 'models', sessionId: this.sessionId, models: discovered,
            selectedModelId: this.selectedModelId, selectionLost
        });
    }

    /** Accepts a model choice only if that exact id is currently available. */
    public selectModel(modelId: string): void {
        if (this.disposed || this.isBusy) return;
        if (modelId === AUTO_MODEL_ID) { this.selectedModelId = AUTO_MODEL_ID; this.onChanged?.(); return; }
        if (this.models.some(model => model.id === modelId)) { this.selectedModelId = modelId; this.onChanged?.(); return; }
        this.emit({
            type: 'error', sessionId: this.sessionId, requestId: null, kind: 'model_unavailable',
            message: 'That model is no longer available. Refresh the list and choose again.'
        });
        void this.refreshModels();
    }

    /**
     * Routes one prompt through the Tokonomics proxy.
     *
     * Exactly one canonical compilation happens per accepted send, inside the proxy. Duplicate
     * request ids, concurrent sends and sends after disposal are refused before any work starts.
     */
    public async submit(requestId: string, prompt: string): Promise<void> {
        if (this.disposed) return;
        if (this.completedRequestIds.has(requestId) || requestId === this.activeRequestId) {
            return; // Replayed acknowledgement, double click, or webview reload. Never send twice.
        }
        if (this.isBusy) {
            this.emit({
                type: 'error', sessionId: this.sessionId, requestId, kind: 'busy',
                message: 'A request is already running. Cancel it before sending another.'
            });
            return;
        }

        this.activeRequestId = requestId;
        this.lastMarkdownAt = 0;
        this.activityEntries.clear();
        this.activityModel = undefined;
        this.activityReasoningChars = 0;
        this.lastActivityText = undefined;
        this.lastActivityAt = 0;
        const source = new vscode.CancellationTokenSource();
        this.inFlight = source;
        const sessionAtStart = this.sessionId;

        this.emit({ type: 'appendUser', sessionId: sessionAtStart, requestId, text: prompt });
        this.emit({ type: 'busy', sessionId: sessionAtStart, busy: true });
        this.appendTurn({ role: 'user', text: prompt });

        try {
            const proxy = this.localProxyFactory
                ? this.localProxyFactory(activity => this.reportActivity(activity, requestId, sessionAtStart))
                : await this.resolveProxyModel();
            if (!proxy) throw new Error('The Tokonomics model is not available in this editor.');
            if (this.disposed || this.sessionId !== sessionAtStart || source.token.isCancellationRequested) return;
            const messages = this.buildRequestMessages();
            const options: vscode.LanguageModelChatRequestOptions = {
                justification: 'Tokonomics chat view prompt',
                modelOptions: {
                    ...(this.selectedModelId === AUTO_MODEL_ID
                        ? {}
                        : { [UPSTREAM_TARGET_MODEL_OPTION]: this.selectedModelId }),
                    [CHAT_REQUEST_ID_OPTION]: requestId,
                    [CHAT_SESSION_ID_OPTION]: sessionAtStart
                }
            };
            const response = await proxy.sendRequest(messages, options, source.token);

            this.emit({ type: 'streamStart', sessionId: sessionAtStart, requestId });
            let assembled = '';
            for await (const fragment of response.text) {
                if (source.token.isCancellationRequested) break;
                if (this.disposed || this.sessionId !== sessionAtStart) break;
                if (assembled.length + fragment.length > MAX_RENDERED_RESPONSE_CHARS) {
                    source.cancel();
                    throw new Error('Response exceeded the display limit; request cancelled.');
                }
                const remaining = MAX_RENDERED_RESPONSE_CHARS - assembled.length;
                const text = fragment.length > remaining ? fragment.slice(0, remaining) : fragment;
                assembled += text;
                for (const chunk of chunkStreamText(text)) {
                    this.emit({ type: 'streamDelta', sessionId: sessionAtStart, requestId, text: chunk });
                }
            }

            if (source.token.isCancellationRequested) {
                this.finishRequest(requestId);
                this.emit({
                    type: 'error', sessionId: sessionAtStart, requestId, kind: 'cancelled',
                    message: 'Request cancelled.'
                });
                return;
            }
            if (this.disposed || this.sessionId !== sessionAtStart) { this.finishRequest(requestId); return; }

            if (assembled.length > 0) this.appendTurn({ role: 'assistant', text: assembled });
            this.finishRequest(requestId);
            this.emit({ type: 'streamEnd', sessionId: sessionAtStart, requestId });
            this.flushUsage(requestId, sessionAtStart);
        } catch (error) {
            this.pendingUsage.delete(requestId);
            this.finishRequest(requestId);
            if (this.disposed || this.sessionId !== sessionAtStart) return;
            const { kind, message } = classifyError(error, source.token.isCancellationRequested);
            AnonymizedLogger.getInstance().error('ChatSessionController', 'Turn failed', error as any);
            this.emit({ type: 'error', sessionId: sessionAtStart, requestId, kind, message });
        } finally {
            if (this.activeRequestId === requestId) this.finishRequest(requestId);
            source.dispose();
        }
    }

    public cancel(): void {
        this.inFlight?.cancel();
    }

    /** Clears both the model-visible history and the view transcript, and drops the old session id. */
    public newSession(nextSessionId: string): void {
        this.cancel();
        this.activityEntries.clear();
        this.history = [];
        this.completedRequestIds.clear();
        this.pendingUsage.clear();
        this.activeRequestId = undefined;
        this.inFlight = undefined;
        this.sessionId = nextSessionId;
        this.emit({ type: 'session', sessionId: nextSessionId });
        this.emit({ type: 'cleared', sessionId: nextSessionId });
        this.emit({
            type: 'models', sessionId: nextSessionId, models: this.models,
            selectedModelId: this.selectedModelId, selectionLost: false
        });
    }

    /** Releases every in-flight operation and erases session content from memory. */
    public dispose(): void {
        this.disposed = true;
        this.activityEntries.clear();
        this.inFlight?.cancel();
        this.inFlight?.dispose();
        this.inFlight = undefined;
        this.history = [];
        this.transcript = [];
        this.models = [];
        this.completedRequestIds.clear();
        this.pendingUsage.clear();
        this.activeRequestId = undefined;
        this.unsubscribeFromEvents();
    }

    /**
     * Reports provider progress to the status line and bounded activity list.
     *
     * Reasoning updates are throttled; operation status transitions are always delivered.
     * Reasoning text itself is never forwarded - only that it is happening, and how much - because
     * it is the provider's working, not the answer, and must not be mistaken for one.
     */
    private reportActivity(activity: SubscriptionActivity, requestId: string, sessionId: string): void {
        if (this.disposed || this.sessionId !== sessionId || this.activeRequestId !== requestId) return;
        let text: string | undefined;
        const entryId = (typeof activity.id === 'string' ? activity.id : activity.kind).slice(0, 160);
        const previous = this.activityEntries.get(entryId);
        let category: string = previous?.category || activity.kind;
        if (activity.kind === 'model' && activity.model && activity.model !== this.activityModel) {
            this.activityModel = activity.model;
            text = `Answering with ${activity.model}`;
        } else if (activity.kind === 'reasoning' && activity.text) {
            this.activityReasoningChars += activity.text.length;
            text = `Reasoning (${this.activityReasoningChars.toLocaleString()} characters)`;
        } else if (['command', 'file', 'tool', 'plan', 'status'].includes(activity.kind)) {
            text = activity.text || previous?.text || 'Tool activity';
            if (activity.text) category = activity.kind;
        }
        if (!text) return;
        const now = Date.now();
        const firstReasoning = activity.kind === 'reasoning' && this.activityReasoningChars === activity.text?.length;
        if (activity.kind === 'reasoning' && !firstReasoning && (text === this.lastActivityText || now - this.lastActivityAt < ACTIVITY_MIN_INTERVAL_MS)) return;
        text = SecuritySanitizer.sanitizeSecrets(text.slice(0, 4000)).sanitized.slice(0, 1200);
        if (!this.activityEntries.has(entryId) && this.activityEntries.size >= 100) {
            this.activityEntries.delete(this.activityEntries.keys().next().value!);
        }
        this.activityEntries.set(entryId, { text, category, status: activity.status });
        this.lastActivityText = text;
        this.lastActivityAt = now;
        this.emit({ type: 'activity', sessionId, text, entryId, category, status: activity.status });
    }

    private finishRequest(requestId: string): void {
        if (this.activeRequestId !== requestId) return;
        this.completedRequestIds.add(requestId);
        if (this.completedRequestIds.size > MAX_SESSION_MESSAGES * 2) {
            const oldest = this.completedRequestIds.values().next().value;
            if (oldest !== undefined) this.completedRequestIds.delete(oldest);
        }
        this.activeRequestId = undefined;
        this.inFlight = undefined;
        if (!this.disposed) this.emit({ type: 'busy', sessionId: this.sessionId, busy: false });
    }

    private onOptimizationEvent(event: PromptOptimizationEvent): void {
        if (this.disposed || event.sessionId !== this.sessionId) return;
        if (event.id !== this.activeRequestId && !this.completedRequestIds.has(event.id)) return;
        if (event.state !== 'COST_RECONCILED' && event.state !== 'PROMPT_COMPLETED') return;
        const summary = formatUsageSummary(event);
        if (this.completedRequestIds.has(event.id)) {
            this.emit({ type: 'usage', sessionId: this.sessionId, requestId: event.id, summary });
        } else {
            this.pendingUsage.set(event.id, summary);
        }
    }

    private flushUsage(requestId: string, sessionId: string): void {
        const summary = this.pendingUsage.get(requestId);
        if (!summary) return;
        this.pendingUsage.delete(requestId);
        this.emit({ type: 'usage', sessionId, requestId, summary });
    }

    /**
     * Builds the model-visible payload. History is sanitized with the existing helper so
     * extension-authored presentation text can never re-enter a prompt, then bounded by turn count
     * and by total characters. The canonical compiler still owns the authoritative token budget.
     */
    private buildRequestMessages(): vscode.LanguageModelChatMessage[] {
        const sanitized = this.history
            .map(turn => ({ role: turn.role, text: sanitizeModelHistoryText(turn.text) }))
            .filter(turn => turn.text.length > 0);
        const bounded = boundedHistory(sanitized, Math.floor(MAX_SESSION_MESSAGES / 2));

        // Trim from the oldest end until the character budget is satisfied, always keeping the
        // most recent turn so the current request is never dropped.
        const kept: typeof bounded[number][] = [];
        let total = 0;
        for (let index = bounded.length - 1; index >= 0; index--) {
            const turn = bounded[index];
            if (kept.length > 0 && total + turn.text.length > MAX_SESSION_CHARS) break;
            kept.unshift(turn);
            total += turn.text.length;
        }
        return kept.map(turn => turn.role === 'assistant'
            ? vscode.LanguageModelChatMessage.Assistant(turn.text)
            : vscode.LanguageModelChatMessage.User(turn.text));
    }

    private appendTurn(turn: Turn): void {
        this.history.push(turn);
        if (this.history.length > MAX_SESSION_MESSAGES) {
            this.history.splice(0, this.history.length - MAX_SESSION_MESSAGES);
        }
    }

    /** Finds the Tokonomics proxy by exact vendor and id. */
    private async resolveProxyModel(): Promise<vscode.LanguageModelChat | undefined> {
        try {
            const candidates = (await vscode.lm.selectChatModels({ vendor: PROXY_VENDOR })) || [];
            return candidates.find(model => model.id === PROXY_MODEL_ID);
        } catch {
            return undefined;
        }
    }
}

function formatUsageSummary(event: Readonly<PromptOptimizationEvent>): string {
    if (event.subscriptionTransport) return `${event.rawInputTokens} → ${event.optimizedInputTokens} locally counted input tokens. `
        + (event.observedInputTokens !== undefined ? `${event.observedInputTokens} input / ${event.outputTokens ?? 'unknown'} output tokens reported. ` : '')
        + 'Subscription charges and remaining quota are not inferred.';
    const tokenLabel = event.tokenState === 'provider_reported' ? 'provider reported'
        : event.tokenState === 'tokenizer_measured' ? 'tokenizer measured'
            : event.tokenState === 'unavailable' ? 'unavailable' : 'estimated';
    const tokenSummary = `${event.rawInputTokens} → ${event.optimizedInputTokens} input tokens; ${event.savedTokens} saved (${tokenLabel}).`;
    const costState = effectiveCostState(event);
    if (costState === 'reconciled') {
        return `${tokenSummary} Cost: ~$${(event.actualOptimizedCostUSD || 0).toFixed(4)} from observed usage; ~$${(event.actualSavingsUSD || 0).toFixed(4)} estimated avoided cost (hypothetical baseline).`;
    }
    if (costState === 'projected') {
        return `${tokenSummary} Cost: $${event.projectedOptimizedCostUSD.toFixed(4)} projected; $${event.projectedSavingsUSD.toFixed(4)} projected saved.`;
    }
    return `${tokenSummary} Cost unavailable: ${explainCostState(event)}`;
}

function classifyError(error: unknown, cancelled: boolean): { kind: ChatErrorKind; message: string } {
    if (cancelled) return { kind: 'cancelled', message: 'Request cancelled.' };
    const raw = error instanceof Error ? error.message : String(error ?? '');
    if (raw.startsWith('The Tokonomics model is not available')) return { kind: 'no_models', message: raw };
    if (error instanceof SubscriptionError || /^No project source was prepared[.:]/.test(raw)) {
        return { kind: 'provider_error', message: raw };
    }
    const text = raw.toLowerCase();
    if (text.includes('cancel')) return { kind: 'cancelled', message: 'Request cancelled.' };
    if (text.includes('consent') || text.includes('permission') || text.includes('denied')) {
        return { kind: 'consent_required', message: 'The editor did not grant permission to use that model.' };
    }
    if (text.includes('quota') || text.includes('rate limit') || text.includes('too many')) {
        return { kind: 'quota', message: 'The model reported a quota or rate limit. Try again later.' };
    }
    if (text.includes('queue')) {
        return { kind: 'busy', message: 'Tokonomics is at capacity right now. Try again in a moment.' };
    }
    if (text.includes('unsupported_output') || text.includes('unknown response part')) {
        return { kind: 'unsupported_output', message: 'The model returned a response part Tokonomics does not forward.' };
    }
    if (text.includes('not available') || text.includes('no downstream') || text.includes('model')) {
        return { kind: 'model_unavailable', message: 'The selected model is unavailable. Refresh the list and choose again.' };
    }
    return { kind: 'provider_error', message: 'The request failed before a reply was produced.' };
}
