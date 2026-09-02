import type { PromptOptimizationEvent, OptimizationLifecycleState } from './optimizationEvent';

export interface RequestLedgerEntry {
    readonly sequence: number;
    readonly requestId: string;
    readonly recordedAt: number;
    readonly event: Readonly<PromptOptimizationEvent>;
}

export interface PrivacySafeDecisionTrace {
    requestId: string;
    sessionId: string;
    states: readonly { sequence: number; state: OptimizationLifecycleState; timestamp: number; traceId: string }[];
    snapshotGeneration?: number;
    stages: readonly { name: string; tokensBefore: number; tokensAfter: number; tokensSaved: number; latencyMs: number }[];
    selections: readonly { selectionHash: string; resolution: string; tokenCount: number; contentHash: string }[];
    cacheState?: string;
    costStatus?: string;
    fallbackReasons: readonly string[];
    redactionCount?: number;
    budget?: { inputLimit: number; outputReserve: number; finalInputTokens: number; projectedTotalTokens: number };
    errorCode?: string;
}

type LedgerMemento = {
    get: <T>(key: string, defaultValue?: T) => T;
    update: (key: string, value: unknown) => Thenable<void>;
};

const STATE_RANK: Record<OptimizationLifecycleState, number> = {
    PROMPT_RECEIVED: 0,
    OPTIMIZATION_STARTED: 1,
    OPTIMIZATION_STAGE_UPDATED: 2,
    OPTIMIZATION_COMPLETED: 3,
    REQUEST_SENT: 4,
    MODEL_USAGE_RECEIVED: 5,
    COST_RECONCILED: 6,
    PROMPT_COMPLETED: 7,
    OPTIMIZATION_FAILED: 8
};

/** Append-only, privacy-safe lifecycle ledger keyed by canonical request ID. */
export class RequestLedger {
    private static instance: RequestLedger;
    private entries: RequestLedgerEntry[] = [];
    private byRequest = new Map<string, RequestLedgerEntry[]>();
    private deduplicationKeys = new Set<string>();
    private nextSequence = 1;
    private memento?: LedgerMemento;
    private readonly storageKey = 'tokonomics_request_ledger_v1';

    public static getInstance(): RequestLedger {
        if (!RequestLedger.instance) RequestLedger.instance = new RequestLedger();
        return RequestLedger.instance;
    }

    public configurePersistence(memento: LedgerMemento): void {
        this.memento = memento;
        const saved = memento.get<RequestLedgerEntry[]>(this.storageKey, []);
        if (!Array.isArray(saved) || this.entries.length > 0) return;
        for (const entry of saved) this.restore(entry);
    }

    public append(event: PromptOptimizationEvent): RequestLedgerEntry | undefined {
        this.validateEvent(event);
        const key = eventKey(event);
        if (this.deduplicationKeys.has(key)) return undefined;

        const history = this.byRequest.get(event.id) || [];
        const previous = history[history.length - 1];
        if (previous && event.timestamp < previous.event.timestamp) return undefined;
        if (previous && event.state !== 'OPTIMIZATION_FAILED' && STATE_RANK[event.state] < STATE_RANK[previous.event.state]) {
            return undefined;
        }

        const immutableEvent = deepFreeze(cloneEvent(event));
        const entry = Object.freeze({
            sequence: this.nextSequence++,
            requestId: event.id,
            recordedAt: Date.now(),
            event: immutableEvent
        });
        this.entries.push(entry);
        history.push(entry);
        this.byRequest.set(event.id, history);
        this.deduplicationKeys.add(key);
        this.persist();
        return entry;
    }

    public getEntries(): readonly RequestLedgerEntry[] { return Object.freeze([...this.entries]); }
    public getRequestEntries(requestId: string): readonly RequestLedgerEntry[] {
        return Object.freeze([...(this.byRequest.get(requestId) || [])]);
    }

    public getLatestRequestEvents(): readonly Readonly<PromptOptimizationEvent>[] {
        return Object.freeze([...this.byRequest.values()]
            .map(entries => entries[entries.length - 1].event)
            .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)));
    }

    public getRecentRequestEvents(limit: number = 50): readonly Readonly<PromptOptimizationEvent>[] {
        return Object.freeze(this.getLatestRequestEvents().slice(-Math.max(0, limit)));
    }

    public getLatestEvent(): Readonly<PromptOptimizationEvent> | undefined {
        return this.entries[this.entries.length - 1]?.event;
    }

    public getDecisionTrace(requestId: string): PrivacySafeDecisionTrace | undefined {
        const entries = this.byRequest.get(requestId);
        if (!entries?.length) return undefined;
        const latest = entries[entries.length - 1].event;
        return Object.freeze({
            requestId,
            sessionId: latest.sessionId,
            states: Object.freeze(entries.map(entry => Object.freeze({
                sequence: entry.sequence, state: entry.event.state, timestamp: entry.event.timestamp, traceId: entry.event.traceId
            }))),
            snapshotGeneration: latest.snapshotGeneration,
            stages: Object.freeze((latest.stageMetrics || []).map(stage => Object.freeze({
                name: stage.stageName, tokensBefore: stage.tokensBefore, tokensAfter: stage.tokensAfter,
                tokensSaved: stage.tokensSaved, latencyMs: stage.latencyMs
            }))),
            selections: Object.freeze((latest.selectionTrace || []).map(selection => Object.freeze({ ...selection }))),
            cacheState: latest.cacheState,
            costStatus: latest.costStatus,
            fallbackReasons: Object.freeze([...(latest.fallbackReasons || [])]),
            redactionCount: latest.redactionCount,
            budget: latest.budgetTrace ? { ...latest.budgetTrace } : undefined,
            errorCode: latest.errorCode
        });
    }

    public clear(): void {
        this.entries = [];
        this.byRequest.clear();
        this.deduplicationKeys.clear();
        this.nextSequence = 1;
        this.persist();
    }

    private restore(candidate: RequestLedgerEntry): void {
        if (!candidate?.event) return;
        try {
            this.validateEvent(candidate.event);
            const key = eventKey(candidate.event);
            if (this.deduplicationKeys.has(key)) return;
            const entry = Object.freeze({
                sequence: Number.isInteger(candidate.sequence) ? candidate.sequence : this.nextSequence,
                requestId: candidate.event.id,
                recordedAt: candidate.recordedAt || candidate.event.timestamp,
                event: deepFreeze(cloneEvent(candidate.event))
            });
            this.entries.push(entry);
            const history = this.byRequest.get(entry.requestId) || [];
            history.push(entry);
            this.byRequest.set(entry.requestId, history);
            this.deduplicationKeys.add(key);
            this.nextSequence = Math.max(this.nextSequence, entry.sequence + 1);
        } catch { /* Corrupt persisted entries are ignored. */ }
    }

    private validateEvent(event: PromptOptimizationEvent): void {
        if (!event?.id?.trim()) throw new Error('Lifecycle events require a canonical request ID.');
        if (!Number.isFinite(event.timestamp) || event.timestamp < 0) throw new Error('Lifecycle events require a valid timestamp.');
        if (!(event.state in STATE_RANK)) throw new Error(`Unknown lifecycle state: ${event.state}`);
        if (!event.traceId?.trim()) throw new Error('Lifecycle events require a trace ID.');
    }

    private persist(): void {
        if (!this.memento) return;
        try {
            Promise.resolve(this.memento.update(this.storageKey, this.entries)).catch(() => undefined);
        } catch { /* Observability persistence never blocks the request path. */ }
    }
}

function eventKey(event: PromptOptimizationEvent): string {
    // Full-event identity suppresses accidental re-emission without collapsing distinct
    // updates that legitimately share a lifecycle state and trace.
    return JSON.stringify(event);
}

function cloneEvent(event: PromptOptimizationEvent): PromptOptimizationEvent {
    return JSON.parse(JSON.stringify(event)) as PromptOptimizationEvent;
}

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    }
    return value;
}
