/** Finite percentage helpers shared by runtime and validation accounting. */
export class BoundedEconomics {
    public static percentage(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
    }

    public static reductionPercentage(baseline: number, optimized: number): number {
        if (!Number.isFinite(baseline) || !Number.isFinite(optimized) || baseline <= 0) return 0;
        return this.percentage(((baseline - Math.max(0, optimized)) / baseline) * 100);
    }
    public static savingsUSD(rawCostUSD: number, optimizedCostUSD: number): number {
        if (!Number.isFinite(rawCostUSD) || !Number.isFinite(optimizedCostUSD)) return 0;
        const savings = Math.max(0, rawCostUSD - Math.max(0, optimizedCostUSD));
        return Math.round(savings * 100000) / 100000;
    }

    public static isValidPercentage(value: unknown): value is number {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
    }
}
