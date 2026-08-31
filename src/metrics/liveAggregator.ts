/**
 * Tokonomics Live Metrics Aggregator & In-Memory Ring Buffer
 * Real-time incremental O(1) multi-window metrics accumulator.
 */

import { PromptOptimizationEvent, OptimizationEventBus } from '../events/optimizationEvent';

export type MetricTimeWindow = 'session' | 'today' | '7_days' | 'lifetime';

export interface AggregateMetricsSummary {
    timeWindow: MetricTimeWindow;
    totalPrompts: number;
    rawTokens: number;
    optimizedTokens: number;
    savedTokens: number;
    averageReductionPercentage: number;
    rawCostUSD: number;
    optimizedCostUSD: number;
    savedCostUSD: number;
    cacheHitRatio: number;
    averagePredictedCQ: number;
    averageEvidenceCoverage: number;
    averageOptimizationLatencyMs: number;
}

interface WindowBucket {
    prompts: number;
    rawTokens: number;
    optimizedTokens: number;
    savedTokens: number;
    rawCostUSD: number;
    optimizedCostUSD: number;
    savedCostUSD: number;
    totalCachedTokens: number;
    totalCQScore: number;
    totalEvidenceCoverage: number;
    totalLatencyMs: number;
}

export class LiveMetricsAggregator {
    private static instance: LiveMetricsAggregator;
    private sessionBucket: WindowBucket;
    private todayBucket: WindowBucket;
    private sevenDaysBucket: WindowBucket;
    private lifetimeBucket: WindowBucket;

    private sessionStartTime = Date.now();
    private todayStartTime = new Date().setHours(0, 0, 0, 0);
    private ringBuffer: PromptOptimizationEvent[] = [];
    private readonly maxRingBufferSize = 100;
    private unsubscribeFromBus?: () => void;

    constructor() {
        this.sessionBucket = this.createEmptyBucket();
        this.todayBucket = this.createEmptyBucket();
        this.sevenDaysBucket = this.createEmptyBucket();
        this.lifetimeBucket = this.createEmptyBucket();

        this.subscribeToEventBus();
    }

    public static getInstance(): LiveMetricsAggregator {
        if (!LiveMetricsAggregator.instance) {
            LiveMetricsAggregator.instance = new LiveMetricsAggregator();
        }
        return LiveMetricsAggregator.instance;
    }

    private createEmptyBucket(): WindowBucket {
        return {
            prompts: 0,
            rawTokens: 0,
            optimizedTokens: 0,
            savedTokens: 0,
            rawCostUSD: 0,
            optimizedCostUSD: 0,
            savedCostUSD: 0,
            totalCachedTokens: 0,
            totalCQScore: 0,
            totalEvidenceCoverage: 0,
            totalLatencyMs: 0
        };
    }

    private subscribeToEventBus(): void {
        const bus = OptimizationEventBus.getInstance();
        this.unsubscribeFromBus = bus.subscribe((event: PromptOptimizationEvent) => {
            // Only aggregate completed / reconciled events
            if (event.state === 'OPTIMIZATION_COMPLETED' || event.state === 'COST_RECONCILED') {
                this.recordEvent(event);
            }
        });
    }

    public recordEvent(event: PromptOptimizationEvent): void {
        // Add to ring buffer
        this.ringBuffer.push(event);
        if (this.ringBuffer.length > this.maxRingBufferSize) {
            this.ringBuffer.shift();
        }

        const now = Date.now();
        const costRaw = event.isCostReconciled ? (event.actualRawCostUSD || 0) : event.projectedRawCostUSD;
        const costOpt = event.isCostReconciled ? (event.actualOptimizedCostUSD || 0) : event.projectedOptimizedCostUSD;
        const costSaved = event.isCostReconciled ? (event.actualSavingsUSD || 0) : event.projectedSavingsUSD;

        const updateBucket = (b: WindowBucket) => {
            b.prompts++;
            b.rawTokens += event.rawInputTokens;
            b.optimizedTokens += event.optimizedInputTokens;
            b.savedTokens += event.savedTokens;
            b.rawCostUSD += costRaw;
            b.optimizedCostUSD += costOpt;
            b.savedCostUSD += costSaved;
            b.totalCachedTokens += (event.cachedTokens || 0);
            b.totalCQScore += event.predictedCQ;
            b.totalEvidenceCoverage += event.evidenceCoverage;
            b.totalLatencyMs += event.totalOptimizationLatencyMs;
        };

        // 1. Session bucket
        updateBucket(this.sessionBucket);

        // 2. Today bucket (check rollover)
        if (now - this.todayStartTime > 24 * 60 * 60 * 1000) {
            this.todayBucket = this.createEmptyBucket();
            this.todayStartTime = new Date().setHours(0, 0, 0, 0);
        }
        updateBucket(this.todayBucket);

        // 3. 7-days bucket
        updateBucket(this.sevenDaysBucket);

        // 4. Lifetime bucket
        updateBucket(this.lifetimeBucket);
    }

    public getAggregateSummary(window: MetricTimeWindow = 'session'): AggregateMetricsSummary {
        let b: WindowBucket;
        switch (window) {
            case 'session': b = this.sessionBucket; break;
            case 'today': b = this.todayBucket; break;
            case '7_days': b = this.sevenDaysBucket; break;
            case 'lifetime': b = this.lifetimeBucket; break;
        }

        const avgRedPct = b.rawTokens > 0 ? ((b.rawTokens - b.optimizedTokens) / b.rawTokens) * 100 : 0;
        const cacheHitRatio = b.optimizedTokens > 0 ? (b.totalCachedTokens / b.optimizedTokens) : 0;
        const avgCQ = b.prompts > 0 ? b.totalCQScore / b.prompts : 95.0;
        const avgCoverage = b.prompts > 0 ? b.totalEvidenceCoverage / b.prompts : 0.95;
        const avgLatency = b.prompts > 0 ? b.totalLatencyMs / b.prompts : 0.25;

        return {
            timeWindow: window,
            totalPrompts: b.prompts,
            rawTokens: b.rawTokens,
            optimizedTokens: b.optimizedTokens,
            savedTokens: b.savedTokens,
            averageReductionPercentage: Math.round(avgRedPct * 10) / 10,
            rawCostUSD: Math.round(b.rawCostUSD * 1000) / 1000,
            optimizedCostUSD: Math.round(b.optimizedCostUSD * 1000) / 1000,
            savedCostUSD: Math.round(b.savedCostUSD * 1000) / 1000,
            cacheHitRatio: Math.round(cacheHitRatio * 1000) / 1000,
            averagePredictedCQ: Math.round(avgCQ * 10) / 10,
            averageEvidenceCoverage: Math.round(avgCoverage * 1000) / 1000,
            averageOptimizationLatencyMs: Math.round(avgLatency * 100) / 100
        };
    }

    public getRecentEvents(limit: number = 50): PromptOptimizationEvent[] {
        return this.ringBuffer.slice(-limit);
    }

    public dispose(): void {
        if (this.unsubscribeFromBus) {
            this.unsubscribeFromBus();
        }
    }
}
