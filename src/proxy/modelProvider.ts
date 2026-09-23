/**
 * VS Code Language Model Chat Provider
 * Exposes a selectable 'token-optimizer-proxy' model under vendor 'tokonomics' via vscode.lm.
 * Allows other VS Code extensions and multi-agent workflows to programmatically select
 * and route prompt context through Tokonomics optimization algorithms.
 * 
 * Note: To use Tokonomics directly in VS Code Chat, developers use the @tokonomics
 * Chat Participant, which compiles context and dispatches to upstream Copilot / LM models.
 */

import * as vscode from 'vscode';
import { TargetProvider, TokenOptimizationConfig } from '../types';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { CostCalculator } from '../cost/costCalculator';
import { costReconciliationLedger } from '../cost/reconciliationLedger';
import { CanonicalRequestCompiler } from '../protocol/canonicalCompiler';
import { ProtocolError, VsCodeProtocolAdapter } from '../protocol/canonicalProtocol';
import { CanonicalProviderGateway } from '../protocol/providerGateway';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { BoundedPriorityScheduler, WorkQueueFullError } from '../performance/boundedScheduler';
import { UserPreferenceRegistry } from '../config/userPreferences';
import { TokenCounter } from '../engine/tokenizer';
import { RequestContextEnvelope, resolveInitialAttachment } from '../engine/requestContextEnvelope';
import { resolveSubscriptionChoice, subscriptionChoices } from '../subscriptions/modelChoices';
import { subscriptionModel } from '../subscriptions/subscriptionModels';
import { SubscriptionActivityListener } from '../subscriptions/cliTransport';
import { asksForWorkspaceSource } from './chatContextReferences';

export class TokenOptimizerLanguageModelProvider {
    private readonly protocol = new VsCodeProtocolAdapter();

    constructor(
        private compiler: CanonicalRequestCompiler,
        private onOptimizationComplete: () => void,
        /**
         * Resolves the snapshot this request may retrieve from. Allowed to be asynchronous:
         * the index warms in the background after activation, and a caller that only reads
         * whatever is present races that warm - the first prompts after opening the editor
         * saw an empty snapshot, retrieval was never authorised, and the request went out
         * with no workspace source at all.
         */
        private captureWorkspaceSnapshot?: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>,
        private inferenceScheduler?: BoundedPriorityScheduler
    ) {}

    /** Monotonic, content-free counter giving each request envelope a distinct identity. */
    private envelopeSequence = 0;

    /**
     * Reports the calibrated compile-time token estimate. This uses the same estimator the
     * compiler uses for budgeting, so a caller's count agrees with Tokonomics' own accounting.
     * The value is an estimate, never a provider-measured count.
     */
    public async provideTokenCount(
        model: any,
        text: string | any,
        token: vscode.CancellationToken
    ): Promise<number> {
        if (typeof text === 'string') return TokenCounter.countTokens(text);
        const canonical = this.protocol.fromProviderMessages([text]);
        return canonical.reduce((sum, message) => sum + message.parts.reduce(
            (partSum, part) => partSum + (part.kind === 'text' ? TokenCounter.countTokens(part.text) : 8), 0), 0);
    }

    public async provideLanguageModelChatResponse(
        model: any,
        messages: readonly any[],
        options: any,
        progress: vscode.Progress<any>,
        token: vscode.CancellationToken,
        /**
         * Optional running account of what the provider is doing, for callers that have somewhere to
         * show it. VS Code never passes this; the sidebar panel does, because the gap between "sent"
         * and the first token is seconds long and a surface that says nothing during it is
         * indistinguishable from one that has hung.
         */
        onActivity?: SubscriptionActivityListener
    ): Promise<void> {
        const config = this.getOptimizationConfig();

        const requestedFamilyOrId = model && model.family !== 'auto' ? model.family : undefined;
        // A caller may name one exact upstream model through a namespaced option. Only a
        // well-formed string is accepted, and resolution below still requires that the id matches a
        // model this host currently exposes, so a stale or forged value cannot redirect the request.
        const internalRouting = readInternalChatRouting(options?.modelOptions);
        const explicitUpstreamModelId = internalRouting.upstreamModelId;
        let subscription = explicitUpstreamModelId ? await resolveSubscriptionChoice(explicitUpstreamModelId) : undefined;
        const upstreamModelOptions = stripInternalChatOptions(options?.modelOptions);
        let { targetModel, detectedProvider, detectedFamily } = subscription
            ? { targetModel: subscriptionModel(subscription.provider, { model: subscription.model, onActivity }),
                detectedProvider: (subscription.provider === 'codex' ? 'openai' : 'anthropic') as TargetProvider,
                detectedFamily: subscription.model || subscription.provider }
            : await this.resolveUpstreamModelAndProvider(config, requestedFamilyOrId, explicitUpstreamModelId);

        // In environments without registered vscode.lm models (such as Antigravity IDE without Copilot),
        // check whether an authenticated subscription CLI model is available (e.g. Codex or Claude).
        if (!targetModel && !explicitUpstreamModelId) {
            try {
                const choices = await subscriptionChoices();
                for (const choice of choices) {
                    try {
                        const candidate = subscriptionModel(choice.provider, { model: choice.model, onActivity });
                        targetModel = candidate;
                        detectedProvider = (choice.provider === 'codex' ? 'openai' : 'anthropic') as TargetProvider;
                        detectedFamily = choice.model || choice.provider;
                        subscription = choice;
                        break;
                    } catch {
                        // Check next candidate
                    }
                }
            } catch {}
        }

        // An explicit model choice is a strict contract. If it disappeared after discovery, fail
        // before compilation so no successful optimization or savings entry can be recorded.
        if (explicitUpstreamModelId && !targetModel) {
            throw new Error('The selected upstream model is not available.');
        }

        // Effective provider (uses detected provider if config is 'auto')
        const effectiveProvider: TargetProvider = config.targetProvider === 'auto' 
            ? detectedProvider 
            : config.targetProvider;

        const canonicalMessages = this.protocol.fromProviderMessages(messages);
        const workspaceSnapshot = await this.captureWorkspaceSnapshot?.();

        // Same envelope and the same policy as the chat participant, so both entry points answer
        // the workspace-context question identically. This path has no active editor of its own -
        // the caller supplies the messages - so there is no document to attach and the only decision
        // the envelope makes here is whether retrieval is authorised. Previously it was never
        // authorised on this path at all, which is why the sidebar could not reach parity.
        const providerRuntime = UserPreferenceRegistry.get();
        const providerEnvelope: RequestContextEnvelope = Object.freeze({
            envelopeId: `env_lm_${(this.envelopeSequence += 1)}`,
            contextMode: providerRuntime.workspace.contextMode,
            promptChars: canonicalMessages.reduce((sum, message) => sum + message.parts.reduce(
                (partSum, part) => partSum + (part.kind === 'text' ? part.text.length : 0), 0), 0),
            documentIsDirty: false,
            unsavedBuffersPermitted: providerRuntime.workspace.includeUnsavedBuffers === true,
            workspaceTrusted: Boolean(workspaceSnapshot),
            retrievalAvailable: Boolean(workspaceSnapshot && workspaceSnapshot.files.size > 0)
        });
        const providerAttachment = resolveInitialAttachment(providerEnvelope);

        onActivity?.({ kind: 'status', id: 'context', text: 'Compiling context', status: 'running' });
        const compiled = await this.compiler.compile({
            messages: canonicalMessages,
            requestId: internalRouting.requestId,
            sessionId: internalRouting.sessionId || 'session_lm_proxy',
            targetProvider: effectiveProvider,
            targetModel: targetModel?.id || detectedFamily,
            maxTokenBudget: typeof (targetModel as any)?.maxInputTokens === 'number' ? (targetModel as any).maxInputTokens : undefined,
            maxOutputTokens: typeof upstreamModelOptions?.maxOutputTokens === 'number'
                ? upstreamModelOptions.maxOutputTokens
                : typeof upstreamModelOptions?.max_tokens === 'number'
                    ? upstreamModelOptions.max_tokens
                    : typeof (targetModel as any)?.maxOutputTokens === 'number' ? (targetModel as any).maxOutputTokens : undefined,
            cancellation: token,
            envelopeId: providerEnvelope.envelopeId,
            allowWorkspaceRetrieval: providerAttachment.allowRetrieval,
            callerSuppliedSource: Boolean(providerAttachment.attachFullDocument || providerAttachment.attachSelection),
            workspaceSnapshot
            ,requestOptions: { modelOptions: upstreamModelOptions, tools: options?.tools, toolMode: options?.toolMode }
        });
        const stats = compiled.compilation;
        onActivity?.({ kind: 'status', id: 'context', text: `Context compiled: ${stats.originalTokens} to ${stats.optimizedTokens} input tokens`, status: 'completed' });
        if (subscription) stats.event = { ...stats.event, subscriptionTransport: subscription.provider,
            costStatus: 'unavailable', costState: 'billed_unavailable', isCostReconciled: false,
            projectedRawCostUSD: 0, projectedOptimizedCostUSD: 0, projectedSavingsUSD: 0 };

        try {

        const finalPrompt = canonicalMessages.filter(m => m.role === 'user').at(-1)?.parts
            .filter(p => p.kind === 'text').map(p => (p as any).text).join('\n') || '';
        if (subscription && asksForWorkspaceSource(finalPrompt) && !finalPrompt.includes('```')
            && !JSON.stringify(compiled.messages).includes('<tokonomics-evidence')) {
            // Name the condition that actually blocked it. "Set it to Automatic" is unhelpful advice
            // to someone who already has, and the two causes need different actions.
            const indexed = workspaceSnapshot?.files.size ?? 0;
            throw new Error(providerRuntime.workspace.contextMode !== 'automatic'
                ? 'No project source was prepared. Set Token Optimizer: Workspace Context to Automatic in a trusted workspace, or paste the relevant code.'
                : indexed === 0
                    ? 'No project source was prepared: no workspace files are indexed yet. Open a folder in a trusted window, or paste the relevant code.'
                    : `No project source was prepared: retrieval admitted nothing from ${indexed} indexed file(s) for this request. Attach the files you mean, or paste the relevant code.`);
        }

        if (!targetModel) {
            this.compiler.commit(compiled);
            this.onOptimizationComplete();
            // If no underlying Copilot/LM or subscription CLI is active, emit an actionable message
            const summary = `⚡ [Tokonomics]: Prompt optimized (${stats.originalTokens} → ${stats.optimizedTokens} tokens). No active language model detected.\n\nTo chat, please select **Codex** or **Claude** from the model dropdown, or sign in to your subscription CLI.`;
            progress.report(new vscode.LanguageModelTextPart(summary));
            return;
        }

        const forwardOptions = {
            modelOptions: upstreamModelOptions,
            tools: options?.tools ? [...options.tools] : undefined,
            toolMode: options?.toolMode
        };
        const runtime = UserPreferenceRegistry.get();
        const containsWorkspaceData = Boolean(compiled.compilation.evidenceRetrieval?.selected.length);
        const prepared = CanonicalProviderGateway.prepare(this.protocol, compiled.messages, forwardOptions, {
            workspaceRoots: (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath),
            workspaceTrusted: vscode.workspace.isTrusted !== false,
            containsWorkspaceData,
            workspaceConsent: runtime.preferences.workspaceContext !== 'none',
            sourcePolicySatisfied: !containsWorkspaceData || Boolean(workspaceSnapshot),
            isCancellationRequested: token.isCancellationRequested
        });
        const performInference = async (checkpoint: () => void) => {
            checkpoint();
            const response = await CanonicalProviderGateway.send(targetModel, prepared, token);
            const responseStream: AsyncIterable<unknown> = (response as any).stream || this.textFallback(response.text);
            for await (const fragment of responseStream) {
                checkpoint();
                if (fragment instanceof vscode.LanguageModelTextPart) {
                    progress.report(fragment);
                } else if (fragment instanceof vscode.LanguageModelToolCallPart || fragment instanceof vscode.LanguageModelToolResultPart || fragment instanceof vscode.LanguageModelDataPart) {
                    progress.report(fragment);
                } else {
                    throw new ProtocolError('UNSUPPORTED_OUTPUT_PART', 'The upstream model returned an unknown response part; it was not silently dropped.');
                }
            }
            checkpoint();
            return response;
        };
        const checkpoint = () => { if (token.isCancellationRequested) throw new Error('CANCELLED'); };
        const response = this.inferenceScheduler
            ? await this.inferenceScheduler.schedule({ key: `provider:${compiled.requestId}`, priority: 'foreground', cancellation: token }, context => performInference(context.checkpoint))
            : await performInference(checkpoint);

        this.compiler.commit(compiled);
        this.onOptimizationComplete();

        // Reconcile only when the provider reports complete input/output usage.
        const responseUsage = (response as any)?.usage || (response as any)?.result?.usage;
        const modelId = targetModel.id || targetModel.name || detectedFamily || 'claude-3-7-sonnet';
        const providerId = targetModel.vendor || effectiveProvider;
        const verifiedUsage = CostCalculator.parseVerifiedProviderUsage(responseUsage, compiled.requestId, providerId, modelId);
        if (subscription) {
            // The request identity has to travel with the event. Consumers match usage back to the
            // turn that produced it by id, so an event carrying the compiler's own id instead of the
            // caller's was silently dropped and the panel never showed a usage line at all.
            OptimizationEventBus.getInstance().emit({ ...stats.event, id: compiled.requestId,
                timestamp: Date.now(), state: 'PROMPT_COMPLETED',
                model: (response as any).subscriptionModel || subscription.model || modelId,
                observedInputTokens: verifiedUsage?.inputTokens, outputTokens: verifiedUsage?.outputTokens,
                cachedTokens: verifiedUsage?.cacheReadInputTokens, cacheWriteTokens: verifiedUsage?.cacheWriteInputTokens,
                traceId: `${compiled.requestId}:subscription-usage` });
        } else if (verifiedUsage) {
            costReconciliationLedger.begin({
                requestId: compiled.requestId,
                provider: providerId,
                model: modelId,
                unoptimizedInputTokens: stats.originalTokens
            });
            try {
                const costReconciled = costReconciliationLedger.reconcile(compiled.requestId, verifiedUsage);
                const reconciledEvent: PromptOptimizationEvent = {
                    ...stats.event,
                    id: compiled.requestId,
                    timestamp: Date.now(),
                    state: 'COST_RECONCILED',
                    provider: providerId as any,
                    model: modelId,
                    cachedTokens: verifiedUsage.cacheReadInputTokens,
                    cacheWriteTokens: verifiedUsage.cacheWriteInputTokens,
                    observedInputTokens: verifiedUsage.inputTokens,
                    outputTokens: verifiedUsage.outputTokens,
                    actualRawCostUSD: costReconciled.actualRawCostUSD,
                    actualOptimizedCostUSD: costReconciled.actualOptimizedCostUSD,
                    actualSavingsUSD: costReconciled.actualSavingsUSD,
                    isCostReconciled: true,
                    costStatus: 'reconciled',
                    pricingCatalogVersion: costReconciled.pricingCatalogVersion,
                    pricingSource: costReconciled.pricingSource,
                    pricingCurrency: costReconciled.currency,
                    cacheState: verifiedUsage.cacheReadInputTokens > 0 ? 'provider_read'
                        : verifiedUsage.cacheWriteInputTokens > 0 ? 'provider_write' : stats.event.cacheState,
                    traceId: `${compiled.requestId}:reconciled`
                };
                OptimizationEventBus.getInstance().emit(reconciledEvent);
            } catch {
                costReconciliationLedger.abandon(compiled.requestId);
                this.emitFinalCostStatusWithoutUsage(stats.event, compiled.requestId, providerId, modelId);
            }
        } else {
            this.emitFinalCostStatusWithoutUsage(stats.event, compiled.requestId, providerId, modelId);
        }
        } catch (error) {
            this.compiler.fail(compiled, token.isCancellationRequested ? 'CANCELLED' : error instanceof ProtocolError ? error.code
                : error instanceof WorkQueueFullError ? 'PROVIDER_QUEUE_FULL' : 'UPSTREAM_PROVIDER_ERROR');
            if (token.isCancellationRequested) return;
            throw error;
        }
    }

    private async *textFallback(text: AsyncIterable<string>): AsyncIterable<vscode.LanguageModelTextPart> {
        for await (const fragment of text) yield new vscode.LanguageModelTextPart(fragment);
    }

    private emitFinalCostStatusWithoutUsage(base: PromptOptimizationEvent, requestId: string, provider: string, model: string): void {
        const fallbackCostStatus = CostCalculator.statusWhenProviderUsageUnavailable(base);
        OptimizationEventBus.getInstance().emit({
            ...base,
            id: requestId,
            timestamp: Date.now(),
            state: 'PROMPT_COMPLETED',
            provider,
            model,
            isCostReconciled: false,
            costStatus: fallbackCostStatus,
            traceId: `${requestId}:cost-${fallbackCostStatus}`
        });
    }

    public async provideLanguageModelChatInformation(
        options: { silent: boolean },
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelChatInformation[]> {
        return [
            {
                id: 'token-optimizer-proxy',
                name: 'Token-Optimized Enterprise Proxy (Auto-Detecting)',
                family: 'auto',
                version: '1.1.0',
                maxInputTokens: 200000,
                maxOutputTokens: 8192,
                capabilities: {
                    imageInput: false,
                    toolCalling: true
                }
            }
        ];
    }

    /**
     * Inspects active language models in the editor environment
     * and delegates downstream execution to the best matching upstream model.
     */
    private async resolveUpstreamModelAndProvider(
        config: TokenOptimizationConfig,
        requestedFamilyOrId?: string,
        explicitUpstreamModelId?: string
    ): Promise<{
        targetModel: vscode.LanguageModelChat | null;
        detectedProvider: TargetProvider;
        detectedFamily: string;
    }> {
        try {
            // 1. Query available upstream models in the active window (excluding self to avoid recursion)
            const allModels = await vscode.lm.selectChatModels();
            const upstreamModels = (allModels || []).filter(m => 
                m.id !== 'token-optimizer-proxy' && 
                (m as any).vendor !== 'tokonomics'
            );

            if (upstreamModels.length > 0) {
                // 1b. An explicit upstream id wins, but only by EXACT match against a model this
                // host exposes right now. If that id has disappeared the request is not silently
                // rerouted to a different model: resolution falls through and the caller is told.
                if (explicitUpstreamModelId) {
                    const exact = upstreamModels.find(candidate => candidate.id === explicitUpstreamModelId);
                    if (exact) {
                        return {
                            targetModel: exact,
                            detectedProvider: this.inferProviderFromModel(exact),
                            detectedFamily: exact.family || exact.name || explicitUpstreamModelId
                        };
                    }
                    return { targetModel: null, detectedProvider: 'anthropic', detectedFamily: explicitUpstreamModelId };
                }

                // 2. If caller or config requested a specific family/model, prioritize that
                const targetPreference = (requestedFamilyOrId || config.targetUpstreamModelFamily || '').toLowerCase();
                if (targetPreference && targetPreference !== 'auto') {
                    const matchedModel = upstreamModels.find(m => {
                        const mId = (m.id || '').toLowerCase();
                        const mName = (m.name || '').toLowerCase();
                        const mFamily = (m.family || '').toLowerCase();
                        return mId.includes(targetPreference) || mName.includes(targetPreference) || mFamily.includes(targetPreference);
                    });
                    if (matchedModel) {
                        return {
                            targetModel: matchedModel,
                            detectedProvider: this.inferProviderFromModel(matchedModel),
                            detectedFamily: matchedModel.family || matchedModel.name || targetPreference
                        };
                    }
                }

                // 3. Fallback: Select the primary flagship model available
                const primaryModel = upstreamModels[0];
                const provider = this.inferProviderFromModel(primaryModel);
                return {
                    targetModel: primaryModel,
                    detectedProvider: provider,
                    detectedFamily: primaryModel.family || primaryModel.name || 'auto'
                };
            }
        } catch {
            console.warn('[Tokonomics] LM provider resolution used the safe fallback.');
        }

        return {
            targetModel: null,
            detectedProvider: 'anthropic',
            detectedFamily: 'claude-3.5-sonnet'
        };
    }

    /**
     * Infers the cloud LLM provider from model metadata
     */
    private inferProviderFromModel(model: vscode.LanguageModelChat): TargetProvider {
        const id = (model.id || '').toLowerCase();
        const name = (model.name || '').toLowerCase();
        const family = (model.family || '').toLowerCase();
        const vendor = ((model as any).vendor || '').toLowerCase();

        const combined = `${id} ${name} ${family} ${vendor}`;

        if (combined.includes('claude') || combined.includes('anthropic') || combined.includes('sonnet') || combined.includes('opus')) {
            return 'anthropic';
        }
        if (combined.includes('gpt') || combined.includes('openai') || combined.includes('o1') || combined.includes('o3')) {
            return 'openai';
        }
        if (combined.includes('gemini') || combined.includes('google')) {
            return 'gemini';
        }
        if (combined.includes('deepseek')) {
            return 'deepseek';
        }

        return 'anthropic';
    }

    private getOptimizationConfig(): TokenOptimizationConfig {
        return { ...UserPreferenceRegistry.get().tokenOptimization };
    }
}

/** Namespaced option through which a caller may name one exact upstream model. */
export const UPSTREAM_TARGET_MODEL_OPTION = 'tokonomics.upstreamModelId';
export const CHAT_REQUEST_ID_OPTION = 'tokonomics.chatRequestId';
export const CHAT_SESSION_ID_OPTION = 'tokonomics.chatSessionId';

interface InternalChatRouting {
    readonly upstreamModelId?: string;
    readonly requestId?: string;
    readonly sessionId?: string;
}

function readInternalChatRouting(modelOptions: unknown): InternalChatRouting {
    if (typeof modelOptions !== 'object' || modelOptions === null || Array.isArray(modelOptions)) return {};
    const record = modelOptions as Record<string, unknown>;
    return {
        upstreamModelId: readExplicitUpstreamModelId(record),
        requestId: readBoundedCorrelationId(record[CHAT_REQUEST_ID_OPTION], 'req_'),
        sessionId: readBoundedCorrelationId(record[CHAT_SESSION_ID_OPTION], 'chat_')
    };
}

/** Removes extension-private routing metadata before token budgeting and provider egress. */
function stripInternalChatOptions(modelOptions: unknown): Record<string, unknown> | undefined {
    if (typeof modelOptions !== 'object' || modelOptions === null || Array.isArray(modelOptions)) return undefined;
    const sanitized = { ...(modelOptions as Record<string, unknown>) };
    delete sanitized[UPSTREAM_TARGET_MODEL_OPTION];
    delete sanitized[CHAT_REQUEST_ID_OPTION];
    delete sanitized[CHAT_SESSION_ID_OPTION];
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function readBoundedCorrelationId(value: unknown, prefix: string): string | undefined {
    if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > 256) return undefined;
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
}

/**
 * Extracts the explicit upstream model id from caller-supplied model options.
 * Anything that is not a plain, reasonably sized, non-empty string is ignored rather than trusted.
 */
function readExplicitUpstreamModelId(modelOptions: unknown): string | undefined {
    if (typeof modelOptions !== 'object' || modelOptions === null) return undefined;
    const value = (modelOptions as Record<string, unknown>)[UPSTREAM_TARGET_MODEL_OPTION];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 256) return undefined;
    if (trimmed === 'auto') return undefined;
    return trimmed;
}
