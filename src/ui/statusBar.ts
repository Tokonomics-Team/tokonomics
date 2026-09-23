/**
 * Status Bar Item & Ephemeral Savings Flash Manager
 * Real-time event-driven status bar indicator with flash feedback and quick-pick dashboard.
 */

import * as vscode from 'vscode';
import { MetricsTracker } from '../metrics/tracker';
import { DashboardWebviewPanel } from './dashboardWebview';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { LiveMetricsAggregator } from '../metrics/liveAggregator';
import { FinOpsService } from '../finops/finOpsService';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private flashTimeout?: NodeJS.Timeout;
    private unsubscribeFromBus?: () => void;
    private unsubscribeSpend?: () => void;
    private spendTimer?: ReturnType<typeof setTimeout>;

    constructor(private metricsTracker: MetricsTracker) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'tokenOptimizer.showDashboard';
        this.update();
        this.statusBarItem.show();

        this.subscribeToEvents();
        this.unsubscribeSpend = FinOpsService.getInstance().subscribe(() => {
            if (this.spendTimer) return;
            this.spendTimer = setTimeout(() => { this.spendTimer = undefined; this.update(); }, 500);
        });
    }

    private subscribeToEvents(): void {
        const bus = OptimizationEventBus.getInstance();
        this.unsubscribeFromBus = bus.subscribe((event: PromptOptimizationEvent) => {
            if (event.state === 'OPTIMIZATION_COMPLETED' || event.state === 'COST_RECONCILED') {
                const saved = event.costStatus === 'reconciled' ? event.actualSavingsUSD
                    : event.costStatus === 'projected' ? event.projectedSavingsUSD : undefined;
                this.flashSavings(event.savedTokens, saved, true);
            }
        });
    }

    /**
     * Briefly flashes ephemeral savings feedback on prompt completion
     */
    public flashSavings(savedTokens: number, savedUSD?: number, projected: boolean = false): void {
        if (this.flashTimeout) {
            clearTimeout(this.flashTimeout);
        }

        const costStr = savedUSD === undefined ? 'cost unavailable'
            : `${projected ? '~' : ''}$${savedUSD.toFixed(savedUSD >= 0.001 ? 3 : 4)}`;
        this.statusBarItem.text = `$(zap) ${savedTokens.toLocaleString()} tokens saved | $(tag) ${costStr}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');

        this.flashTimeout = setTimeout(() => {
            this.statusBarItem.backgroundColor = undefined;
            this.update();
        }, 5000);
    }

    public update(): void {
        const spend = FinOpsService.getInstance().snapshot('today');
        if (spend.totals.requests > 0) {
            const total = spend.activeTaskTotals ?? spend.totals;
            const scope = spend.activeTask ? 'Task' : 'Today';
            const money = total.pricedRequests ? '~$' + (total.observedUSD + total.projectedUSD).toFixed(3) : 'cost unavailable';
            this.statusBarItem.text = `$(graph) ${scope}: ${money} | ${total.requests} requests`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `${scope} estimated spend. ${total.observedRequests}/${total.requests} requests have observed usage; ${total.pricedRequests}/${total.requests} have prices.\n\n` +
                'Input projections omit unknown output costs. Estimates are not bills. Click for task budgets and usage details.');
            return;
        }
        const metrics = LiveMetricsAggregator.getInstance().getAggregateSummary('lifetime');
        if (metrics.totalPrompts === 0) {
            this.statusBarItem.text = `$(zap) Tokonomics: Active`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics Context Compiler\n\n` +
                `Status: **Active & Pre-Warmed in RAM**\n\n` +
                `*Send a prompt in Chat (@tokonomics) or select code to see live token savings percentages here.*\n\n` +
                `*Click to open the Real-Time Local Dashboard.*`
            );
        } else {
            const cost = metrics.savedCostUSD === null ? 'cost unavailable'
                : `${metrics.reconciledPrompts < metrics.costedPrompts ? '~' : ''}$${metrics.savedCostUSD.toFixed(2)}`;
            this.statusBarItem.text = `$(zap) ${metrics.averageReductionPercentage}% Saved (${cost})`;
            this.statusBarItem.tooltip = new vscode.MarkdownString(
                `### ⚡ Tokonomics Real-Time Live Savings\n\n` +
                `- **Total Prompts Processed:** ${metrics.totalPrompts}\n` +
                `- **Tokens Pruned:** ${metrics.savedTokens.toLocaleString()} (${metrics.averageReductionPercentage}% reduction)\n` +
                `- **Estimated Avoided Cost:** ${cost}\n` +
                `- **Verified Cache Read Ratio:** ${metrics.cacheHitRatio === null ? 'Unavailable' : `${Math.round(metrics.cacheHitRatio * 100)}%`}\n\n` +
                `*Click to open Tokonomics Live Dashboard*`
            );
        }
    }

    public async showDashboard(): Promise<void> {
        DashboardWebviewPanel.createOrShow(this.metricsTracker);
    }

    public dispose(): void {
        this.unsubscribeSpend?.();
        if (this.spendTimer) clearTimeout(this.spendTimer);
        if (this.flashTimeout) {
            clearTimeout(this.flashTimeout);
        }
        if (this.unsubscribeFromBus) {
            this.unsubscribeFromBus();
        }
        this.statusBarItem.dispose();
    }
}
