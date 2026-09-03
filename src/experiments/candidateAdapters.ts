import { createHash } from 'crypto';

export interface RankingSignal { id: string; lexical: number; graph: number; recency: number; risk: number; }

/** Pure bounded shadow adapters. None mutate production output or persist source content. */
export class ExperimentalCandidateAdapters {
    public static rankEvidence(signals: readonly RankingSignal[], maximum = 10): readonly string[] {
        return [...signals].slice(0, 256).map(signal => ({ id: signal.id,
            score: 0.45 * this.unit(signal.lexical) + 0.35 * this.unit(signal.graph)
                + 0.10 * this.unit(signal.recency) - 0.10 * this.unit(signal.risk) }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(0, Math.min(32, maximum))).map(item => item.id);
    }

    public static snapshotDelta(previous: Readonly<Record<string, string>>, current: Readonly<Record<string, string>>): readonly string[] {
        const changed = new Set<string>();
        for (const key of Object.keys(previous)) if (!(key in current) || current[key] !== previous[key]) changed.add(key);
        for (const key of Object.keys(current)) if (!(key in previous) || previous[key] !== current[key]) changed.add(key);
        return Object.freeze([...changed].sort());
    }

    public static cacheBandOrder(provider: string): readonly ('system' | 'tools' | 'history' | 'query')[] {
        if (provider.toLowerCase() === 'anthropic') return Object.freeze(['system', 'tools', 'history', 'query']);
        if (provider.toLowerCase() === 'openai') return Object.freeze(['tools', 'system', 'history', 'query']);
        return Object.freeze(['system', 'tools', 'history', 'query']);
    }

    public static compilationTier(confidence: number, criticalRecall: number, risk: number): 'complete' | 'guarded' | 'progressive' {
        if (![confidence, criticalRecall, risk].every(Number.isFinite) || criticalRecall < 0.9 || risk > 0.5) return 'complete';
        if (confidence < 0.85 || risk > 0.25) return 'guarded';
        return 'progressive';
    }

    public static cosineTopK(query: readonly number[], candidates: readonly { id: string; vector: readonly number[] }[], maximum = 10): readonly string[] {
        if (query.length === 0 || query.length > 384 || !query.every(Number.isFinite)) return Object.freeze([]);
        return candidates.slice(0, 512).filter(item => item.vector.length === query.length && item.vector.every(Number.isFinite))
            .map(item => ({ id: item.id, score: this.cosine(query, item.vector) }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(0, Math.min(32, maximum))).map(item => item.id);
    }

    public static inspectableMemory(items: readonly { id: string; active: boolean; confidence: number }[], maximum = 20): readonly string[] {
        return items.filter(item => item.active && Number.isFinite(item.confidence) && item.confidence >= 0.8)
            .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)).slice(0, Math.max(0, Math.min(100, maximum))).map(item => item.id);
    }

    public static visionDecision(input: { width: number; height: number; ocrConfidence?: number; smallestTextPixels?: number }): 'pass_through' | 'downscale' | 'ocr_shadow' {
        if (input.ocrConfidence !== undefined && input.ocrConfidence >= 0.98 && (input.smallestTextPixels || 0) >= 14) return 'ocr_shadow';
        if (input.width > 1600 || input.height > 1600) {
            const scale = 1280 / Math.max(input.width, input.height);
            if ((input.smallestTextPixels || 0) * scale >= 12) return 'downscale';
        }
        return 'pass_through';
    }

    public static adaptiveBudget(input: { hardLimit: number; confidence: number; risk: number; expectedCostPerToken: number }): number {
        const hardLimit = Math.max(0, Math.floor(input.hardLimit));
        if (![input.confidence, input.risk, input.expectedCostPerToken].every(Number.isFinite)) return hardLimit;
        const multiplier = input.risk > 0.5 || input.confidence < 0.8 ? 1 : input.expectedCostPerToken > 0.00001 ? 0.8 : 0.9;
        return Math.max(0, Math.min(hardLimit, Math.floor(hardLimit * multiplier)));
    }

    public static identityHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
    private static unit(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
    private static cosine(a: readonly number[], b: readonly number[]): number {
        let dot = 0, an = 0, bn = 0;
        for (let index = 0; index < a.length; index++) { dot += a[index] * b[index]; an += a[index] ** 2; bn += b[index] ** 2; }
        return an === 0 || bn === 0 ? 0 : dot / Math.sqrt(an * bn);
    }
}
