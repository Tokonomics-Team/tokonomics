/**
 * Status Bar Item & Interactive QuickPick Dashboard
 */

import * as vscode from 'vscode';
import { MetricsTracker } from '../metrics/tracker';
import { DashboardWebviewPanel } from './dashboardWebview';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor(private metricsTracker: MetricsTracker) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'tokenOptimizer.showDashboard';
        this.update();
        this.statusBarItem.show();
    }

    public update(): void {
        const metrics = this.metricsTracker.getCumulativeMetrics();
        if (metrics.totalRequests === 0) {
            this.statusBarItem.text = `$(zap) Tokonomics: Active`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics AI Token Optimizer\n\n` +
                `Status: **Active & Pre-Warmed in RAM**\n\n` +
                `*Send a prompt in Chat (@tokonomics) or select code to see live token savings percentages here.*\n\n` +
                `*Click to open the Interactive Dashboard & FinOps Controls.*`
            );
        } else {
            this.statusBarItem.text = `$(zap) ${metrics.overallReductionPercentage}% Saved ($${metrics.totalCostSavedUsd.toFixed(2)})`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics Live Savings\n\n` +
                `- **Total Requests Processed:** ${metrics.totalRequests}\n` +
                `- **Tokens Pruned:** ${metrics.totalSavedTokens.toLocaleString()} (${metrics.overallReductionPercentage}% reduction)\n` +
                `- **Estimated Dollar Savings:** $${metrics.totalCostSavedUsd.toFixed(3)} USD\n` +
                `- **Cloud Cache Hit Ratio:** ~${Math.round(metrics.cacheHitRatioEstimated * 100)}%\n\n` +
                `*Click to open Tokonomics Dashboard & Settings*`
            );
        }
    }

    public async showDashboard(): Promise<void> {
        const metrics = this.metricsTracker.getCumulativeMetrics();
        const config = vscode.workspace.getConfiguration('tokenOptimizer');

        const items: vscode.QuickPickItem[] = [
            {
                label: `$(browser) Open Full Visual Analytics Dashboard`,
                description: 'View FinOps projections, interactive charts, and team ROI calculator'
            },
            {
                label: `$(graph) Lifetime Savings: ${metrics.overallReductionPercentage}% (${metrics.totalSavedTokens.toLocaleString()} Tokens Saved)`,
                description: `$${metrics.totalCostSavedUsd.toFixed(3)} USD Net Cloud Savings`,
                detail: `Total requests: ${metrics.totalRequests} | Original: ${metrics.totalOriginalTokens.toLocaleString()} → Optimized: ${metrics.totalOptimizedTokens.toLocaleString()}`
            },
            {
                label: `$(circuit-board) AST Structural Pruning: ${config.get<boolean>('enableAstPruning') ? '$(check) Enabled' : '$(x) Disabled'}`,
                description: 'Strips implementation bodies, retains exported types & signatures across TS, JS, Python, Go, Rust, Java, C#',
                detail: 'Click to toggle'
            },
            {
                label: `$(server-process) Cloud Prompt Cache Alignment: ${config.get<boolean>('enableCacheAlignment') ? '$(check) Enabled' : '$(x) Disabled'}`,
                description: `Active Provider: ${config.get<string>('targetProvider', 'anthropic').toUpperCase()}`,
                detail: 'Click to change cloud provider or toggle 4-tier prefix stabilization'
            },
            {
                label: `$(symbol-text) Natural Language Compression: ${config.get<boolean>('enableTextCompression') ? '$(check) Enabled' : '$(x) Disabled'}`,
                description: `Target Retention Ratio: ${config.get<number>('compressionRatio', 0.4) * 100}%`,
                detail: 'Click to configure compression budget'
            },
            {
                label: `$(trash) Reset Session Savings Metrics`,
                description: 'Clear recorded token statistics and start fresh'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Enterprise AI Token Optimizer Dashboard & Controls'
        });

        if (!selection) return;

        if (selection.label.includes('Open Full Visual Analytics Dashboard')) {
            DashboardWebviewPanel.createOrShow(this.metricsTracker);
        } else if (selection.label.includes('AST Structural Pruning')) {
            const current = config.get<boolean>('enableAstPruning', true);
            await config.update('enableAstPruning', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`AST Structural Pruning is now ${!current ? 'Enabled' : 'Disabled'}.`);
            this.update();
        } else if (selection.label.includes('Cloud Prompt Cache Alignment')) {
            const provider = await vscode.window.showQuickPick(['anthropic', 'openai', 'gemini', 'generic'], {
                placeHolder: 'Select target cloud provider for prompt cache alignment'
            });
            if (provider) {
                await config.update('targetProvider', provider, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Target Cache Provider set to: ${provider.toUpperCase()}`);
                this.update();
            }
        } else if (selection.label.includes('Natural Language Compression')) {
            const ratioStr = await vscode.window.showInputBox({
                prompt: 'Enter target token retention ratio (0.1 to 0.9)',
                value: String(config.get<number>('compressionRatio', 0.4))
            });
            if (ratioStr) {
                const ratio = parseFloat(ratioStr);
                if (!isNaN(ratio) && ratio >= 0.1 && ratio <= 0.9) {
                    await config.update('compressionRatio', ratio, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`Compression retention ratio set to ${ratio * 100}%.`);
                }
            }
        } else if (selection.label.includes('Reset Session Savings Metrics')) {
            this.metricsTracker.reset();
            this.update();
            vscode.window.showInformationMessage('Session token metrics have been reset.');
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
