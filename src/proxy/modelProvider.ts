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
import { ContextAnalyzer } from './contextAnalyzer';
import { MessagePayload, TargetProvider, TokenOptimizationConfig } from '../types';

export class TokenOptimizerLanguageModelProvider {
    constructor(
        private contextAnalyzer: ContextAnalyzer,
        private onOptimizationComplete: () => void
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

        // 1. Dynamic Automatic Model Discovery & Upstream Model Detection
        const { targetModel, detectedProvider, detectedFamily } = await this.resolveUpstreamModelAndProvider(config);

        // Effective provider (uses detected provider if config is 'auto')
        const effectiveProvider: TargetProvider = config.targetProvider === 'auto' 
            ? detectedProvider 
            : config.targetProvider;

        const effectiveConfig: TokenOptimizationConfig = {
            ...config,
            targetProvider: effectiveProvider
        };

        // Convert VS Code messages into internal payload representation
        const rawMessages: MessagePayload[] = [];
        for (const msg of messages) {
            const roleStr: 'system' | 'user' | 'assistant' = msg.role === vscode.LanguageModelChatMessageRole.User 
                ? 'user' 
                : msg.role === vscode.LanguageModelChatMessageRole.Assistant 
                    ? 'assistant' 
                    : 'system';

            const textContent = Array.isArray(msg.content)
                ? msg.content
                    .map((part: any) => {
                        if (part instanceof vscode.LanguageModelTextPart) {
                            return part.value;
                        }
                        return typeof part === 'string' ? part : '';
                    })
                    .join('')
                : String(msg.content || '');

            rawMessages.push({ role: roleStr, content: textContent });
        }

        // Run full optimization pipeline with dynamically tailored provider rules
        const { alignedMessages, stats } = this.contextAnalyzer.processMessages(
            rawMessages, 
            effectiveConfig,
            detectedFamily
        );
        this.onOptimizationComplete();

        if (!targetModel) {
            // If no underlying Copilot/LM is active, emit a helpful diagnostic message
            const summary = `⚡ [Tokonomics]: Prompt optimized from ${stats.originalTokens} to ${stats.optimizedTokens} tokens (${stats.reductionPercentage}% saved for [${effectiveProvider.toUpperCase()}]). No downstream language model detected in current environment.`;
            progress.report({ index: 0, part: new vscode.LanguageModelTextPart(summary) });
            return;
        }

        // Format aligned messages for the upstream model
        const upstreamMessages: vscode.LanguageModelChatMessage[] = alignedMessages.map(m => {
            if (m.role === 'assistant') {
                return vscode.LanguageModelChatMessage.Assistant(m.content);
            }
            if (m.role === 'system') {
                return vscode.LanguageModelChatMessage.User(`[SYSTEM DIRECTIVE]:\n${m.content}`);
            }
            return vscode.LanguageModelChatMessage.User(m.content);
        });

        // Send request to target model and stream back response
        const response = await targetModel.sendRequest(upstreamMessages, {}, token);

        for await (const fragment of response.text) {
            if (token.isCancellationRequested) {
                break;
            }
            progress.report({ index: 0, part: new vscode.LanguageModelTextPart(fragment) });
        }
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
     * and delegates downstream execution to available upstream models.
     */
    private async resolveUpstreamModelAndProvider(config: TokenOptimizationConfig): Promise<{
        targetModel: vscode.LanguageModelChat | null;
        detectedProvider: TargetProvider;
        detectedFamily: string;
    }> {
        try {
            // 1. If a specific family is configured (not 'auto'), try that first
            if (config.targetUpstreamModelFamily && config.targetUpstreamModelFamily !== 'auto') {
                const specificModels = await vscode.lm.selectChatModels({ family: config.targetUpstreamModelFamily });
                if (specificModels && specificModels.length > 0) {
                    const model = specificModels[0];
                    return {
                        targetModel: model,
                        detectedProvider: this.inferProviderFromModel(model),
                        detectedFamily: model.family || config.targetUpstreamModelFamily
                    };
                }
            }

            // 2. Query available upstream models in the active window
            const allModels = await vscode.lm.selectChatModels();
            if (allModels && allModels.length > 0) {
                // Filter out self-proxy to prevent recursive infinite loops
                const upstreamModels = allModels.filter(m => m.id !== 'token-optimizer-proxy');
                if (upstreamModels.length > 0) {
                    const primaryModel = upstreamModels[0];
                    const provider = this.inferProviderFromModel(primaryModel);
                    return {
                        targetModel: primaryModel,
                        detectedProvider: provider,
                        detectedFamily: primaryModel.family || primaryModel.name || 'auto'
                    };
                }
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
