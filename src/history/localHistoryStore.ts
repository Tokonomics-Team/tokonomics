/**
 * Tokonomics Tiered Local History Persistence Store
 * Persists sanitised prompt metadata without raw source code or secrets.
 */

import { PromptOptimizationEvent } from '../events/optimizationEvent';
import { RequestLedger } from '../events/requestLedger';

export interface PromptMetadataRecord {
    id: string;
    timestamp: number;
    sessionId: string;
    taskType: string;
    model: string;
    provider: string;
    rawInputTokens: number;
    optimizedInputTokens: number;
    savedTokens: number;
    reductionPercentage: number;
    savedCostUSD: number | null;
    isCostReconciled: boolean;
    costStatus?: 'projected' | 'reconciled' | 'unavailable';
    predictedCQ: number;
    evidenceCoverage: number;
    totalLatencyMs: number;
    stageSummary: { name: string; tokensSaved: number }[];
    traceId: string;
}

export class LocalHistoryStore {
    private static instance: LocalHistoryStore;
    private readonly ledger = RequestLedger.getInstance();

    constructor(_memento?: { get: <T>(k: string, def?: T) => T; update: (k: string, v: any) => Thenable<void> }) {}

    public static getInstance(memento?: any): LocalHistoryStore {
        if (!LocalHistoryStore.instance) {
            LocalHistoryStore.instance = new LocalHistoryStore(memento);
        }
        return LocalHistoryStore.instance;
    }

    public saveEvent(event: PromptOptimizationEvent): void {
        this.ledger.append(event);
    }

    private toRecord(event: Readonly<PromptOptimizationEvent>): PromptMetadataRecord {
        return {
            id: event.id,
            timestamp: event.timestamp,
            sessionId: event.sessionId,
            taskType: event.taskType,
            model: event.model,
            provider: event.provider,
            rawInputTokens: event.rawInputTokens,
            optimizedInputTokens: event.optimizedInputTokens,
            savedTokens: event.savedTokens,
            reductionPercentage: event.reductionPercentage,
            savedCostUSD: event.costStatus === 'reconciled' && Number.isFinite(event.actualSavingsUSD)
                ? event.actualSavingsUSD!
                : event.costStatus === 'projected' && Number.isFinite(event.projectedSavingsUSD)
                    ? event.projectedSavingsUSD : null,
            isCostReconciled: event.isCostReconciled,
            costStatus: event.costStatus,
            predictedCQ: event.predictedCQ,
            evidenceCoverage: event.evidenceCoverage,
            totalLatencyMs: event.totalOptimizationLatencyMs,
            stageSummary: (event.stageMetrics || []).map(s => ({ name: s.stageName, tokensSaved: s.tokensSaved })),
            traceId: event.traceId
        };
    }

    public getRecords(limit: number = 50): PromptMetadataRecord[] {
        return this.ledger.getRecentRequestEvents(limit).map(event => this.toRecord(event));
    }

    public clear(): void {
        this.ledger.clear();
    }

    public dispose(): void { /* RequestLedger owns persistence and event lifecycle. */ }
}
