/** Ledger-derived, exactly-once multi-window metrics projections. */

import { PromptOptimizationEvent } from '../events/optimizationEvent';
import { RequestLedger } from '../events/requestLedger';

export type MetricTimeWindow = 'session' | 'today' | '7_days' | 'lifetime';

export interface AggregateMetricsSummary {
    timeWindow: MetricTimeWindow;
    totalPrompts: number;
    completedPrompts: number;
    failedPrompts: number;
    rawTokens: number;
    optimizedTokens: number;
    savedTokens: number;
    averageReductionPercentage: number;
    rawCostUSD: number | null;
    optimizedCostUSD: number | null;
    savedCostUSD: number | null;
    costedPrompts: number;
    reconciledPrompts: number;
    cacheHitRatio: number | null;
    averagePredictedCQ: number | null;
    averageEvidenceCoverage: number | null;
    averageOptimizationLatencyMs: number | null;
    generatedAt: number;
}

export class LiveMetricsAggregator {
    private static instance: LiveMetricsAggregator;
    private sessionStartTime: number;

    constructor(
        private readonly ledger: RequestLedger = RequestLedger.getInstance(),
        private readonly clock: () => number = () => Date.now(),
        sessionStartTime?: number
    ) {
        this.sessionStartTime = sessionStartTime ?? this.clock();
    }

    public static getInstance(): LiveMetricsAggregator {
        if (!LiveMetricsAggregator.instance) LiveMetricsAggregator.instance = new LiveMetricsAggregator();
        return LiveMetricsAggregator.instance;
    }

    /** Compatibility ingestion for tests and non-bus producers; ledger dedupes repeats. */
    public recordEvent(event: PromptOptimizationEvent): void { this.ledger.append(event); }

    public getAggregateSummary(window: MetricTimeWindow = 'session'): AggregateMetricsSummary {
        const now = this.clock();
        const since = this.windowStart(window, now);
        const events = this.ledger.getLatestRequestEvents().filter(event => event.timestamp >= since && event.timestamp <= now);
        let completedPrompts = 0;
        let failedPrompts = 0;
        let rawTokens = 0;
        let optimizedTokens = 0;
        let savedTokens = 0;
        let rawCostUSD = 0;
        let optimizedCostUSD = 0;
        let savedCostUSD = 0;
        let costedPrompts = 0;
        let reconciledPrompts = 0;
        let cachedTokens = 0;
        let cacheInputTokens = 0;
        const cq: number[] = [];
        const coverage: number[] = [];
        const latencies: number[] = [];

        for (const event of events) {
            if (event.state === 'OPTIMIZATION_FAILED') failedPrompts++;
            else completedPrompts++;
            if (Number.isFinite(event.rawInputTokens) && Number.isFinite(event.optimizedInputTokens)) {
                rawTokens += event.rawInputTokens;
                optimizedTokens += event.optimizedInputTokens;
                savedTokens += event.savedTokens;
            }
            const cost = costTuple(event);
            if (cost) {
                rawCostUSD += cost.raw;
                optimizedCostUSD += cost.optimized;
                savedCostUSD += cost.saved;
                costedPrompts++;
                if (event.costStatus === 'reconciled') reconciledPrompts++;
            }
            if (event.costStatus === 'reconciled' && Number.isFinite(event.cachedTokens) && Number.isFinite(event.optimizedInputTokens)) {
                cachedTokens += event.cachedTokens || 0;
                cacheInputTokens += event.optimizedInputTokens;
            }
            if (Number.isFinite(event.predictedCQ)) cq.push(event.predictedCQ);
            if (Number.isFinite(event.evidenceCoverage)) coverage.push(event.evidenceCoverage);
            if (Number.isFinite(event.totalOptimizationLatencyMs)) latencies.push(event.totalOptimizationLatencyMs);
        }

        return Object.freeze({
            timeWindow: window,
            totalPrompts: events.length,
            completedPrompts,
            failedPrompts,
            rawTokens,
            optimizedTokens,
            savedTokens,
            averageReductionPercentage: round(rawTokens > 0 ? (savedTokens / rawTokens) * 100 : 0, 1),
            rawCostUSD: costedPrompts ? round(rawCostUSD, 5) : null,
            optimizedCostUSD: costedPrompts ? round(optimizedCostUSD, 5) : null,
            savedCostUSD: costedPrompts ? round(savedCostUSD, 5) : null,
            costedPrompts,
            reconciledPrompts,
            cacheHitRatio: cacheInputTokens > 0 ? round(cachedTokens / cacheInputTokens, 4) : null,
            averagePredictedCQ: average(cq, 1),
            averageEvidenceCoverage: average(coverage, 3),
            averageOptimizationLatencyMs: average(latencies, 3),
            generatedAt: now
        });
    }

    public getRecentEvents(limit: number = 50): PromptOptimizationEvent[] {
        return this.ledger.getRecentRequestEvents(limit).map(event => event as PromptOptimizationEvent);
    }

    public resetSession(): void { this.sessionStartTime = this.clock(); }
    public dispose(): void { /* Ledger ownership is external. */ }

    public static localDayStart(timestamp: number): number {
        const value = new Date(timestamp);
        value.setHours(0, 0, 0, 0);
        return value.getTime();
    }

    private windowStart(window: MetricTimeWindow, now: number): number {
        if (window === 'session') return this.sessionStartTime;
        if (window === 'today') return LiveMetricsAggregator.localDayStart(now);
        if (window === '7_days') return now - 7 * 24 * 60 * 60 * 1000;
        return Number.NEGATIVE_INFINITY;
    }
}

function costTuple(event: Readonly<PromptOptimizationEvent>): { raw: number; optimized: number; saved: number } | undefined {
    if (event.costStatus === 'reconciled' &&
        Number.isFinite(event.actualRawCostUSD) && Number.isFinite(event.actualOptimizedCostUSD) && Number.isFinite(event.actualSavingsUSD)) {
        return { raw: event.actualRawCostUSD!, optimized: event.actualOptimizedCostUSD!, saved: event.actualSavingsUSD! };
    }
    if (event.costStatus === 'projected' &&
        Number.isFinite(event.projectedRawCostUSD) && Number.isFinite(event.projectedOptimizedCostUSD) && Number.isFinite(event.projectedSavingsUSD)) {
        return { raw: event.projectedRawCostUSD, optimized: event.projectedOptimizedCostUSD, saved: event.projectedSavingsUSD };
    }
    return undefined;
}

function average(values: readonly number[], decimals: number): number | null {
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, decimals) : null;
}

function round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
