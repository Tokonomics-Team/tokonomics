/**
 * Daily FinOps Budget Guardrail (Optional, Disabled by Default)
 * Monitors daily AI token spend and warns developers if their consumption approaches their configured daily ceiling.
 */

import * as vscode from 'vscode';
import { MetricsTracker } from './tracker';

export class BudgetGuardrail {
    private static lastAlertDate: string = '';

    public static checkBudget(metricsTracker: MetricsTracker): void {
        const config = vscode.workspace.getConfiguration('tokenOptimizer');
        const isEnabled = config.get<boolean>('enableDailyBudgetGuardrail', false);
        if (!isEnabled) {
            return;
        }

        const dailyBudgetUsd = config.get<number>('dailyBudgetUsd', 5.00);
        if (dailyBudgetUsd <= 0) {
            return;
        }

        const todayMetrics = metricsTracker.getTodayMetrics();
        // Estimated standard cloud cost based on original input tokens processed today ($3.00/M tokens)
        const estimatedDailySpendUsd = (todayMetrics.originalTokens / 1_000_000) * 3.00;

        const currentDate = new Date().toDateString();
        const spendRatio = estimatedDailySpendUsd / dailyBudgetUsd;

        if (spendRatio >= 0.80 && BudgetGuardrail.lastAlertDate !== currentDate) {
            BudgetGuardrail.lastAlertDate = currentDate;
            const pct = Math.round(spendRatio * 100);
            vscode.window.showWarningMessage(
                `⚠️ Token Optimizer Budget Alert: You have reached ${pct}% of your daily AI token budget ($${estimatedDailySpendUsd.toFixed(2)} / $${dailyBudgetUsd.toFixed(2)} USD).`,
                'Open Dashboard',
                'Adjust Budget'
            ).then(action => {
                if (action === 'Open Dashboard') {
                    vscode.commands.executeCommand('tokenOptimizer.showAnalyticsWebview');
                } else if (action === 'Adjust Budget') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'tokenOptimizer.dailyBudgetUsd');
                }
            });
        }
    }
}
