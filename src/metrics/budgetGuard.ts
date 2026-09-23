/**
 * Compatibility shim for the retired v6 daily-budget surface.
 * Active task/day/month spend alerts are owned by FinOpsService and configured in the dashboard.
 * Provider-verified usage and savings remain available through the dashboard ledger.
 */

import { MetricsTracker } from './tracker';

export class BudgetGuardrail {
    public static checkBudget(_metricsTracker: MetricsTracker): void {
        // The v6 budget guard settings are retired from the four-setting public surface.
        // Verified provider usage and savings remain available in the dashboard.
        return;
    }
}
