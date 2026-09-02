/**
 * Tokonomics Canonical Optimization Event & Lifecycle Specification
 * Single source of truth emitted by the Context Compiler and consumed by
 * the Dashboard, Status Bar, History, and Diagnostics.
 */

export type OptimizationLifecycleState =
    | 'PROMPT_RECEIVED'
    | 'OPTIMIZATION_STARTED'
    | 'OPTIMIZATION_STAGE_UPDATED'
    | 'OPTIMIZATION_COMPLETED'
    | 'REQUEST_SENT'
    | 'MODEL_USAGE_RECEIVED'
    | 'COST_RECONCILED'
    | 'PROMPT_COMPLETED'
    | 'OPTIMIZATION_FAILED';

export interface OptimizationStageMetric {
    stageName: string;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    latencyMs: number;
    description?: string;
}

export interface PromptOptimizationEvent {
    id: string;
    timestamp: number;
    sessionId: string;
    state: OptimizationLifecycleState;

    // Task and model metadata
    taskType: 'debug' | 'refactor' | 'explain' | 'test' | 'generate' | 'general';
    taskConfidence: number;
    provider: string;
    model: string;

    // Token metrics (authoritative)
    rawInputTokens: number;
    optimizedInputTokens: number;
    savedTokens: number;
    reductionPercentage: number;

    // Cache metrics
    cacheableTokens: number;
    cachedTokens?: number;
    cacheHitRatio?: number;
    outputTokens?: number;

    // Projected financial metrics (compile time estimate)
    projectedRawCostUSD: number;
    projectedOptimizedCostUSD: number;
    projectedSavingsUSD: number;

    // Actual reconciled financial metrics (populated post-inference)
    actualRawCostUSD?: number;
    actualOptimizedCostUSD?: number;
    actualSavingsUSD?: number;
    isCostReconciled: boolean;
    costStatus?: 'projected' | 'reconciled' | 'unavailable';
    pricingCatalogVersion?: string;
    pricingSource?: string;
    pricingCurrency?: string;

    // Quality and safety metrics
    predictedCQ: number;
    evidenceCoverage: number;
    sliceConfidence: number;
    cqRating: 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'RISKY' | 'DEFICIENT';

    // Latency & stage telemetry
    totalOptimizationLatencyMs: number;
    stageMetrics: OptimizationStageMetric[];
    contextItemCount: number;

    traceId: string;
}

export type EventLifecycleListener = (event: PromptOptimizationEvent) => void;

export class OptimizationEventBus {
    private static instance: OptimizationEventBus;
    private listeners: Map<string, Set<EventLifecycleListener>> = new Map();
    private globalListeners: Set<EventLifecycleListener> = new Set();
    private eventHistory: PromptOptimizationEvent[] = [];
    private maxHistory: number = 100;

    public static getInstance(): OptimizationEventBus {
        if (!OptimizationEventBus.instance) {
            OptimizationEventBus.instance = new OptimizationEventBus();
        }
        return OptimizationEventBus.instance;
    }

    public subscribe(listener: EventLifecycleListener): () => void {
        this.globalListeners.add(listener);
        return () => {
            this.globalListeners.delete(listener);
        };
    }

    public on(state: OptimizationLifecycleState, listener: EventLifecycleListener): () => void {
        if (!this.listeners.has(state)) {
            this.listeners.set(state, new Set());
        }
        this.listeners.get(state)!.add(listener);
        return () => {
            const set = this.listeners.get(state);
            if (set) set.delete(listener);
        };
    }

    public emit(event: PromptOptimizationEvent): void {
        // Maintain in-memory ring buffer
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistory) {
            this.eventHistory.shift();
        }

        // Asynchronous non-blocking dispatch
        const dispatch = () => {
            // Global listeners
            for (const listener of this.globalListeners) {
                try {
                    listener(event);
                } catch (err) {
                    console.warn('[OptimizationEventBus] Error in global listener:', err);
                }
            }

            // State-specific listeners
            const stateListeners = this.listeners.get(event.state);
            if (stateListeners) {
                for (const listener of stateListeners) {
                    try {
                        listener(event);
                    } catch (err) {
                        console.warn(`[OptimizationEventBus] Error in ${event.state} listener:`, err);
                    }
                }
            }
        };

        if (typeof setImmediate === 'function') {
            setImmediate(dispatch);
        } else {
            setTimeout(dispatch, 0);
        }
    }

    public getRecentEvents(limit: number = 20): PromptOptimizationEvent[] {
        return this.eventHistory.slice(-limit);
    }

    public getLatestEvent(): PromptOptimizationEvent | undefined {
        return this.eventHistory[this.eventHistory.length - 1];
    }

    public clear(): void {
        this.eventHistory = [];
        this.listeners.clear();
        this.globalListeners.clear();
    }
}
