/**
 * Dynamic Time-Windowed Metrics, Analytics, and Financial ROI Tracker
 * Calculates real-time dynamic statistics for Today (24h), Session, and All-Time Since Installation.
 */

import { CumulativeMetrics, TargetProvider, TimeWindowMetrics, TokenStats } from '../types';
import { CostCalculator } from '../cost/costCalculator';

export class MetricsTracker {
    private statsHistory: TokenStats[] = [];
    private sessionStartTime = Date.now();
    private storageKey = 'token_optimizer_cumulative_metrics_v2';
    private historyStorageKey = 'token_optimizer_stats_history_v2';

    private installedAt: number = Date.now();

    constructor(private memento?: { get: <T>(key: string, defaultValue?: T) => T; update: (key: string, value: any) => Thenable<void> }) {
        if (this.memento) {
            const savedInstalledAt = this.memento.get<number>('token_optimizer_installed_at');
            if (savedInstalledAt) {
                this.installedAt = savedInstalledAt;
            } else {
                this.installedAt = Date.now();
                this.memento.update('token_optimizer_installed_at', this.installedAt);
            }

            const savedHistory = this.memento.get<TokenStats[]>(this.historyStorageKey);
            if (savedHistory && Array.isArray(savedHistory)) {
                this.statsHistory = savedHistory;
            }
        }
    }

    public recordOptimization(
        originalTokens: number,
        optimizedTokens: number,
        breakdown: {
            astSaved: number;
            textCompressionSaved: number;
            historyCompacted: number;
            cacheAligned: number;
            imageSaved?: number;
        },
        provider: TargetProvider = 'anthropic',
        detectedModelFamily?: string,
        language?: string
    ): TokenStats {
        const savedTokens = Math.max(0, originalTokens - optimizedTokens);
        const reductionPercentage = originalTokens > 0 
            ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 1000) / 10 
            : 0;

        // Compatibility views use the canonical versioned catalog and count only
        // removed input tokens. Cache eligibility and image estimates must not be
        // added again because they overlap the same request-token dimensions.
        const pricingModel = detectedModelFamily || provider;
        const projection = CostCalculator.calculateProjectedCost(originalTokens, optimizedTokens, 0, pricingModel);
        const estimatedCostSavedUsd = projection.pricingAvailable ? projection.savingsUSD : 0;

        // Estimated prefill latency reduction (~ 0.18ms per token pruned)
        const latencySavedMs = Math.round(savedTokens * 0.18);

        const stat: TokenStats = {
            originalTokens,
            optimizedTokens,
            savedTokens,
            reductionPercentage,
            astSavedTokens: breakdown.astSaved,
            textCompressionSavedTokens: breakdown.textCompressionSaved,
            historyCompactedTokens: breakdown.historyCompacted,
            cacheAlignedTokens: breakdown.cacheAligned,
            estimatedCostSavedUsd,
            latencySavedMs,
            timestamp: Date.now(),
            detectedProvider: provider,
            detectedModelFamily,
            language: language || 'generic'
        };

        this.statsHistory.push(stat);
        // Keep up to 500 entries in persistent storage
        if (this.statsHistory.length > 500) {
            this.statsHistory.shift();
        }

        this.persist();
        return stat;
    }

    /**
     * Dynamically calculates metrics within a given time threshold (ms).
     */
    public getTimeWindowMetrics(sinceTimestamp: number): TimeWindowMetrics {
        const relevant = this.statsHistory.filter(s => s.timestamp >= sinceTimestamp);
        return this.aggregateStats(relevant);
    }

    /**
     * Dynamic metrics for Today (start of current calendar day).
     */
    public getTodayMetrics(): TimeWindowMetrics {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return this.getTimeWindowMetrics(startOfDay.getTime());
    }

    /**
     * Dynamic metrics for current editor session.
     */
    public getSessionMetrics(): TimeWindowMetrics {
        return this.getTimeWindowMetrics(this.sessionStartTime);
    }

    /**
     * Dynamic metrics for all time since installation.
     */
    public getAllTimeMetrics(): TimeWindowMetrics {
        return this.aggregateStats(this.statsHistory);
    }

    public getInstallationDate(): Date {
        return new Date(this.installedAt);
    }

    public getCumulativeMetrics(): CumulativeMetrics {
        const allTime = this.getAllTimeMetrics();
        return {
            installedAt: this.installedAt,
            totalRequests: allTime.requests,
            totalOriginalTokens: allTime.originalTokens,
            totalOptimizedTokens: allTime.optimizedTokens,
            totalSavedTokens: allTime.savedTokens,
            overallReductionPercentage: allTime.reductionPercentage,
            totalCostSavedUsd: allTime.costSavedUsd,
            cacheHitRatioEstimated: allTime.cacheHitPercentage / 100,
            ...allTime
        };
    }

    public getRecentStats(count: number = 10): TokenStats[] {
        return this.statsHistory.slice(-count);
    }

    public reset(): void {
        this.statsHistory = [];
        this.sessionStartTime = Date.now();
        this.persist();
    }

    private aggregateStats(stats: TokenStats[]): TimeWindowMetrics {
        let requests = stats.length;
        let originalTokens = 0;
        let optimizedTokens = 0;
        let savedTokens = 0;
        let costSavedUsd = 0;
        let cacheEligibleCount = 0;

        for (const s of stats) {
            originalTokens += s.originalTokens;
            optimizedTokens += s.optimizedTokens;
            savedTokens += s.savedTokens;
            costSavedUsd += s.estimatedCostSavedUsd;
            if (s.cacheAlignedTokens >= 1024) {
                cacheEligibleCount++;
            }
        }

        const reductionPercentage = originalTokens > 0 
            ? Math.round(((savedTokens) / originalTokens) * 1000) / 10 
            : 0;

        const cacheHitPercentage = requests > 0 
            ? Math.round((cacheEligibleCount / requests) * 1000) / 10 
            : 0;

        return {
            requests,
            originalTokens,
            optimizedTokens,
            savedTokens,
            reductionPercentage,
            costSavedUsd: Math.round(costSavedUsd * 10000) / 10000,
            cacheEligibleRequests: cacheEligibleCount,
            cacheHitPercentage
        };
    }

    private persist(): void {
        if (this.memento) {
            this.memento.update(this.historyStorageKey, this.statsHistory);
        }
    }
}
