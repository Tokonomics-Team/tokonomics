import { CostCalculator, ReconciledCostResult, VerifiedProviderUsage } from './costCalculator';

interface PendingCostRequest {
    requestId: string;
    provider: string;
    model: string;
    unoptimizedInputTokens: number;
}

/** Binds provider usage to one originating request and rejects duplicate reconciliation. */
export class CostReconciliationLedger {
    private pending = new Map<string, PendingCostRequest>();
    private reconciled = new Set<string>();

    public begin(request: PendingCostRequest): void {
        if (!request.requestId) throw new Error('Cost reconciliation requires a canonical request ID.');
        this.pending.set(request.requestId, { ...request });
        this.reconciled.delete(request.requestId);
    }

    public reconcile(requestId: string, usage: VerifiedProviderUsage): ReconciledCostResult {
        const pending = this.pending.get(requestId);
        if (!pending) throw new Error(`No originating request registered for ${requestId}.`);
        if (this.reconciled.has(requestId)) throw new Error(`Request ${requestId} was already reconciled.`);
        if (usage.requestId !== requestId) throw new Error('Provider usage request ID does not match the originating request.');
        if (usage.provider.toLowerCase() !== pending.provider.toLowerCase()) throw new Error('Provider usage does not match the originating provider.');
        if (usage.model.toLowerCase() !== pending.model.toLowerCase()) throw new Error('Provider usage does not match the originating model.');
        const result = CostCalculator.calculateVerifiedReconciledCost(usage, pending.unoptimizedInputTokens);
        this.reconciled.add(requestId);
        this.pending.delete(requestId);
        return result;
    }

    public abandon(requestId: string): void { this.pending.delete(requestId); }
    public clear(): void { this.pending.clear(); this.reconciled.clear(); }
}

export const costReconciliationLedger = new CostReconciliationLedger();
