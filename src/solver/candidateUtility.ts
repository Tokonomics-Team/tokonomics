export interface CandidateUtilityInput {
    readonly mandatory: boolean;
    readonly relevance: number;
    readonly freshness: number;
    readonly uniqueness: number;
    readonly dependencyClosure: number;
    readonly confidence: number;
    readonly sensitivityRisk: number;
    readonly tokenCost: number;
}

/** One bounded utility model shared by optional evidence selection. */
export function candidateUtility(input: CandidateUtilityInput): number {
    const relevance = unit(input.relevance);
    const safety = 1 - unit(input.sensitivityRisk);
    const benefit = relevance * 0.38 + unit(input.freshness) * 0.12 + unit(input.uniqueness) * 0.16
        + unit(input.dependencyClosure) * 0.14 + unit(input.confidence) * 0.10 + safety * 0.10;
    const tokenPenalty = Math.min(0.5, Math.max(0, input.tokenCost) / 16_000);
    return Math.max(0, (input.mandatory ? 2 : 1) * benefit - tokenPenalty);
}

function unit(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
