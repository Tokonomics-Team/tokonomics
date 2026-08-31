/**
 * Status Bar Item & Ephemeral Savings Flash Manager
 * Real-time event-driven status bar indicator with flash feedback and quick-pick dashboard.
 */

import * as vscode from 'vscode';
import { MetricsTracker } from '../metrics/tracker';
import { DashboardWebviewPanel } from './dashboardWebview';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private flashTimeout?: NodeJS.Timeout;
    private unsubscribeFromBus?: () => void;

    constructor(private metricsTracker: MetricsTracker) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'tokenOptimizer.showDashboard';
        this.update();
        this.statusBarItem.show();

        this.subscribeToEvents();
    }

    private subscribeToEvents(): void {
        const bus = OptimizationEventBus.getInstance();
        this.unsubscribeFromBus = bus.subscribe((event: PromptOptimizationEvent) => {
            if (event.state === 'OPTIMIZATION_COMPLETED' || event.state === 'COST_RECONCILED') {
                this.flashSavings(event.savedTokens, event.isCostReconciled ? (event.actualSavingsUSD || 0) : event.projectedSavingsUSD);
            }
        });
    }

    /**
     * Briefly flashes ephemeral savings feedback on prompt completion
     */
    public flashSavings(savedTokens: number, savedUSD: number): void {
        if (this.flashTimeout) {
            clearTimeout(this.flashTimeout);
        }

        const costStr = savedUSD >= 0.001 ? `$${savedUSD.toFixed(3)}` : `~$${savedUSD.toFixed(4)}`;
        this.statusBarItem.text = `$(zap) ${savedTokens.toLocaleString()} tokens saved | $(tag) ${costStr}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');

        this.flashTimeout = setTimeout(() => {
            this.statusBarItem.backgroundColor = undefined;
            this.update();
        }, 5000);
    }

    public update(): void {
        const metrics = this.metricsTracker.getCumulativeMetrics();
        if (metrics.totalRequests === 0) {
            this.statusBarItem.text = `$(zap) Tokonomics: Active`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics Context Compiler\n\n` +
                `Status: **Active & Pre-Warmed in RAM**\n\n` +
                `*Send a prompt in Chat (@tokonomics) or select code to see live token savings percentages here.*\n\n` +
                `*Click to open the Real-Time Local Dashboard.*`
            );
        } else {
            this.statusBarItem.text = `$(zap) ${metrics.overallReductionPercentage}% Saved ($${metrics.totalCostSavedUsd.toFixed(2)})`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics Real-Time Live Savings\n\n` +
                `- **Total Prompts Processed:** ${metrics.totalRequests}\n` +
                `- **Tokens Pruned:** ${metrics.totalSavedTokens.toLocaleString()} (${metrics.overallReductionPercentage}% reduction)\n` +
                `- **Estimated Dollar Savings:** $${metrics.totalCostSavedUsd.toFixed(3)} USD\n` +
                `- **Cache Hit Ratio:** ~${Math.round(metrics.cacheHitRatioEstimated * 100)}%\n\n` +
                `*Click to open Tokonomics Live Dashboard*`
            );
        }
    }

    public async showDashboard(): Promise<void> {
        DashboardWebviewPanel.createOrShow(this.metricsTracker);
    }

    public dispose(): void {
        if (this.flashTimeout) {
            clearTimeout(this.flashTimeout);
        }
        if (this.unsubscribeFromBus) {
            this.unsubscribeFromBus();
        }
        this.statusBarItem.dispose();
    }
}
