/**
 * Tokonomics Tiered Local History Persistence Store
 * Persists sanitised prompt metadata without raw source code or secrets.
 */

import { PromptOptimizationEvent, OptimizationEventBus } from '../events/optimizationEvent';

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
    savedCostUSD: number;
    isCostReconciled: boolean;
    predictedCQ: number;
    evidenceCoverage: number;
    totalLatencyMs: number;
    stageSummary: { name: string; tokensSaved: number }[];
    traceId: string;
}

export class LocalHistoryStore {
    private static instance: LocalHistoryStore;
    private records: PromptMetadataRecord[] = [];
    private readonly maxRecords = 1000;
    private memento?: { get: <T>(k: string, def?: T) => T; update: (k: string, v: any) => Thenable<void> };
    private storageKey = 'tokonomics_local_history_metadata_v1';
    private unsubscribeFromBus?: () => void;

    constructor(memento?: { get: <T>(k: string, def?: T) => T; update: (k: string, v: any) => Thenable<void> }) {
        this.memento = memento;
        if (this.memento) {
            const saved = this.memento.get<PromptMetadataRecord[]>(this.storageKey, []);
            if (Array.isArray(saved)) {
                this.records = saved;
            }
        }
        this.subscribeToEventBus();
    }

    public static getInstance(memento?: any): LocalHistoryStore {
        if (!LocalHistoryStore.instance) {
            LocalHistoryStore.instance = new LocalHistoryStore(memento);
        }
        return LocalHistoryStore.instance;
    }

    private subscribeToEventBus(): void {
        const bus = OptimizationEventBus.getInstance();
        this.unsubscribeFromBus = bus.subscribe((event: PromptOptimizationEvent) => {
            if (event.state === 'OPTIMIZATION_COMPLETED' || event.state === 'COST_RECONCILED') {
                this.saveEvent(event);
            }
        });
    }

    public saveEvent(event: PromptOptimizationEvent): void {
        const record: PromptMetadataRecord = {
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
            savedCostUSD: event.isCostReconciled ? (event.actualSavingsUSD || 0) : event.projectedSavingsUSD,
            isCostReconciled: event.isCostReconciled,
            predictedCQ: event.predictedCQ,
            evidenceCoverage: event.evidenceCoverage,
            totalLatencyMs: event.totalOptimizationLatencyMs,
            stageSummary: (event.stageMetrics || []).map(s => ({ name: s.stageName, tokensSaved: s.tokensSaved })),
            traceId: event.traceId
        };

        // If updating an existing record during cost reconciliation
        const existingIdx = this.records.findIndex(r => r.id === record.id);
        if (existingIdx >= 0) {
            this.records[existingIdx] = record;
        } else {
            this.records.push(record);
            if (this.records.length > this.maxRecords) {
                this.records.shift();
            }
        }

        this.persist();
    }

    private persist(): void {
        if (this.memento) {
            try {
                this.memento.update(this.storageKey, this.records);
            } catch (err) {
                console.warn('[LocalHistoryStore] Could not persist history to memento:', err);
            }
        }
    }

    public getRecords(limit: number = 50): PromptMetadataRecord[] {
        return this.records.slice(-limit);
    }

    public clear(): void {
        this.records = [];
        this.persist();
    }

    public dispose(): void {
        if (this.unsubscribeFromBus) {
            this.unsubscribeFromBus();
        }
    }
}
