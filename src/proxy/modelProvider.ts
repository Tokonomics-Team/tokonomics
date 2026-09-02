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
import { prepareCanonicalEgress } from '../protocol/canonicalEgress';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export class TokenOptimizerLanguageModelProvider {
    private readonly protocol = new VsCodeProtocolAdapter();

    constructor(
        private compiler: CanonicalRequestCompiler,
        private onOptimizationComplete: () => void,
        private captureWorkspaceSnapshot?: () => WorkspaceSnapshot
    ) {}

    public async provideTokenCount(
        model: any,
        text: string | any,
        token: vscode.CancellationToken
    ): Promise<number> {
        return typeof text === 'string' ? Math.ceil(text.length / 4) : 10;
    }

    public async provideLanguageModelChatResponse(
        model: any,
        messages: readonly any[],
        options: any,
        progress: vscode.Progress<any>,
        token: vscode.CancellationToken
    ): Promise<void> {
        const config = this.getOptimizationConfig();

        const requestedFamilyOrId = model && model.family !== 'auto' ? model.family : undefined;
        const { targetModel, detectedProvider, detectedFamily } = await this.resolveUpstreamModelAndProvider(config, requestedFamilyOrId);

        // Effective provider (uses detected provider if config is 'auto')
        const effectiveProvider: TargetProvider = config.targetProvider === 'auto' 
            ? detectedProvider 
            : config.targetProvider;

        const canonicalMessages = this.protocol.fromProviderMessages(messages);
        const compiled = await this.compiler.compile({
            messages: canonicalMessages,
            sessionId: 'session_lm_proxy',
            targetProvider: effectiveProvider,
            targetModel: targetModel?.id || detectedFamily,
            maxTokenBudget: typeof (targetModel as any)?.maxInputTokens === 'number' ? (targetModel as any).maxInputTokens : undefined,
            maxOutputTokens: typeof options?.modelOptions?.maxOutputTokens === 'number'
                ? options.modelOptions.maxOutputTokens
                : typeof options?.modelOptions?.max_tokens === 'number'
                    ? options.modelOptions.max_tokens
                    : typeof (targetModel as any)?.maxOutputTokens === 'number' ? (targetModel as any).maxOutputTokens : undefined,
            cancellation: token,
            workspaceSnapshot: this.captureWorkspaceSnapshot?.()
        });
        const stats = compiled.compilation;

        if (!targetModel) {
            this.compiler.commit(compiled);
            this.onOptimizationComplete();
            // If no underlying Copilot/LM is active, emit a helpful diagnostic message
            const summary = `⚡ [Tokonomics]: Prompt optimized from ${stats.originalTokens} to ${stats.optimizedTokens} tokens (${stats.reductionPercentage}% saved for [${effectiveProvider.toUpperCase()}]). No downstream language model detected in current environment.`;
            progress.report(new vscode.LanguageModelTextPart(summary));
            return;
        }

        const forwardOptions = {
            modelOptions: options?.modelOptions,
            tools: options?.tools ? [...options.tools] : undefined,
            toolMode: options?.toolMode
        };
        const prepared = prepareCanonicalEgress(compiled.messages, forwardOptions, {
            workspaceRoots: (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath),
            workspaceTrusted: vscode.workspace.isTrusted !== false,
            containsWorkspaceData: false,
            isCancellationRequested: token.isCancellationRequested
        });
        const upstreamMessages = this.protocol.toUpstreamMessages(prepared.messages);
        const response = await targetModel.sendRequest(upstreamMessages, prepared.options as any, token);

        const responseStream: AsyncIterable<unknown> = (response as any).stream || this.textFallback(response.text);
        for await (const fragment of responseStream) {
            if (token.isCancellationRequested) return;
            if (fragment instanceof vscode.LanguageModelTextPart) {
                progress.report(fragment);
            } else if (fragment instanceof vscode.LanguageModelToolCallPart || fragment instanceof vscode.LanguageModelToolResultPart || fragment instanceof vscode.LanguageModelDataPart) {
                progress.report(fragment);
            } else {
                throw new ProtocolError('UNSUPPORTED_OUTPUT_PART', 'The upstream model returned an unknown response part; it was not silently dropped.');
            }
        }
        if (token.isCancellationRequested) return;

        this.compiler.commit(compiled);
        this.onOptimizationComplete();

        // Reconcile only when the provider reports complete input/output usage.
        const responseUsage = (response as any)?.usage || (response as any)?.result?.usage;
        const modelId = targetModel.id || targetModel.name || detectedFamily || 'claude-3-7-sonnet';
        const providerId = targetModel.vendor || effectiveProvider;
        const verifiedUsage = CostCalculator.parseVerifiedProviderUsage(responseUsage, compiled.requestId, providerId, modelId);
        if (verifiedUsage) {
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
                    outputTokens: verifiedUsage.outputTokens,
                    actualRawCostUSD: costReconciled.actualRawCostUSD,
                    actualOptimizedCostUSD: costReconciled.actualOptimizedCostUSD,
                    actualSavingsUSD: costReconciled.actualSavingsUSD,
                    isCostReconciled: true,
                    costStatus: 'reconciled',
                    pricingCatalogVersion: costReconciled.pricingCatalogVersion,
                    pricingSource: costReconciled.pricingSource,
                    pricingCurrency: costReconciled.currency,
                    traceId: `${compiled.requestId}:reconciled`
                };
                OptimizationEventBus.getInstance().emit(reconciledEvent);
            } catch {
                costReconciliationLedger.abandon(compiled.requestId);
                this.emitCostUnavailable(stats.event, compiled.requestId, providerId, modelId);
            }
        } else {
            this.emitCostUnavailable(stats.event, compiled.requestId, providerId, modelId);
        }
    }

    private async *textFallback(text: AsyncIterable<string>): AsyncIterable<vscode.LanguageModelTextPart> {
        for await (const fragment of text) yield new vscode.LanguageModelTextPart(fragment);
    }

    private emitCostUnavailable(base: PromptOptimizationEvent, requestId: string, provider: string, model: string): void {
        OptimizationEventBus.getInstance().emit({
            ...base,
            id: requestId,
            timestamp: Date.now(),
            state: 'PROMPT_COMPLETED',
            provider,
            model,
            isCostReconciled: false,
            costStatus: 'unavailable',
            traceId: `${requestId}:cost-unavailable`
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
        requestedFamilyOrId?: string
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
        } catch (e) {
            console.warn('[Tokonomics] LM provider resolution fallback:', e);
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
        const conf = vscode.workspace.getConfiguration('tokenOptimizer');
        return {
            enableAstPruning: conf.get<boolean>('enableAstPruning', true),
            enableCacheAlignment: conf.get<boolean>('enableCacheAlignment', true),
            enableTextCompression: conf.get<boolean>('enableTextCompression', true),
            compressionRatio: conf.get<number>('compressionRatio', 0.4),
            targetProvider: conf.get<TargetProvider>('targetProvider', 'auto'),
            maxHistoryTurns: conf.get<number>('maxHistoryTurns', 8),
            stripDiffsAndLogs: conf.get<boolean>('stripDiffsAndLogs', true),
            targetUpstreamModelFamily: conf.get<string>('targetUpstreamModelFamily', 'auto')
        };
    }
}
