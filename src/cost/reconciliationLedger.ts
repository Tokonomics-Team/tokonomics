import { CostCalculator, ReconciledCostResult, VerifiedProviderUsage } from './costCalculator';

interface PendingCostRequest {
    requestId: string;
    provider: string;
    model: string;
    unoptimizedInputTokens: number;
    startedAt?: number;
}

/** Binds provider usage to one originating request and rejects duplicate reconciliation. */
export class CostReconciliationLedger {
    private pending = new Map<string, PendingCostRequest>();
    private reconciled = new Map<string, number>();

    constructor(private readonly maxEntries = 1024, private readonly ttlMs = 30 * 60 * 1000, private readonly clock = () => Date.now()) {}

    public begin(request: PendingCostRequest): void {
        if (!request.requestId) throw new Error('Cost reconciliation requires a canonical request ID.');
        this.prune();
        this.pending.set(request.requestId, { ...request, startedAt: this.clock() });
        this.reconciled.delete(request.requestId);
        this.enforceCapacity(this.pending);
    }

    public reconcile(requestId: string, usage: VerifiedProviderUsage): ReconciledCostResult {
        this.prune();
        const pending = this.pending.get(requestId);
        if (!pending) throw new Error(`No originating request registered for ${requestId}.`);
        if (this.reconciled.has(requestId)) throw new Error(`Request ${requestId} was already reconciled.`);
        if (usage.requestId !== requestId) throw new Error('Provider usage request ID does not match the originating request.');
        if (usage.provider.toLowerCase() !== pending.provider.toLowerCase()) throw new Error('Provider usage does not match the originating provider.');
        if (usage.model.toLowerCase() !== pending.model.toLowerCase()) throw new Error('Provider usage does not match the originating model.');
        const result = CostCalculator.calculateVerifiedReconciledCost(usage, pending.unoptimizedInputTokens);
        this.reconciled.set(requestId, this.clock());
        this.pending.delete(requestId);
        this.enforceCapacity(this.reconciled);
        return result;
    }

    public abandon(requestId: string): void { this.pending.delete(requestId); }
    public clear(): void { this.pending.clear(); this.reconciled.clear(); }
    public getStats(): { pending: number; reconciled: number; maxEntries: number } {
        this.prune();
        return { pending: this.pending.size, reconciled: this.reconciled.size, maxEntries: this.maxEntries };
    }

    private prune(): void {
        const cutoff = this.clock() - this.ttlMs;
        for (const [id, request] of this.pending) if ((request.startedAt || 0) < cutoff) this.pending.delete(id);
        for (const [id, reconciledAt] of this.reconciled) if (reconciledAt < cutoff) this.reconciled.delete(id);
    }

    private enforceCapacity<T>(map: Map<string, T>): void {
        while (map.size > this.maxEntries) {
            const oldest = map.keys().next().value;
            if (oldest === undefined) break;
            map.delete(oldest);
        }
    }
}

export const costReconciliationLedger = new CostReconciliationLedger();
