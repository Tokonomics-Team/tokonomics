export const EXPERIMENT_IDS = [
    'evidence-aware-learned-ranking',
    'snapshot-safe-delta-context',
    'provider-specific-cache-layout',
    'confidence-progressive-compilation',
    'bounded-local-semantic-retrieval',
    'inspectable-project-memory',
    'readability-guarded-vision',
    'adaptive-utility-budgeting'
] as const;

export type ExperimentId = typeof EXPERIMENT_IDS[number];
export type ExperimentPrivacyClass = 'none' | 'workspace-derived' | 'local-persistence' | 'image-derived';
export type ExperimentGateReason = 'enabled' | 'not_selected' | 'kill_switch' | 'consent_required'
    | 'workspace_trust_required' | 'release_disabled' | 'resource_budget_exceeded';

export interface ExperimentDefinition {
    readonly id: ExperimentId;
    readonly title: string;
    readonly privacyClass: ExperimentPrivacyClass;
    readonly requiresTrustedWorkspace: boolean;
    readonly estimatedMaxLatencyMs: number;
    readonly estimatedMaxMemoryMB: number;
    readonly fallback: string;
    readonly productionHook: string;
}

export interface ExperimentRuntimeConfiguration {
    readonly consent: boolean;
    readonly enabled: readonly string[];
    readonly disabled: readonly string[];
    readonly trustedWorkspace: boolean;
    readonly releaseEnabled: boolean;
    readonly maxLatencyMs: number;
    readonly maxMemoryMB: number;
}

export interface ExperimentGateSnapshot {
    readonly id: ExperimentId;
    readonly enabled: boolean;
    readonly reason: ExperimentGateReason;
}

export interface ExperimentExecutionRecord {
    readonly id: ExperimentId;
    readonly timestamp: number;
    readonly inputHash: string;
    readonly status: 'shadow_completed' | 'fallback';
    readonly reason: ExperimentGateReason | 'candidate_error' | 'invalid_output' | 'latency_budget_exceeded';
    readonly latencyMs: number;
}

export interface ExperimentOutcome {
    readonly taskId: string;
    readonly baselineSuccess: boolean;
    readonly candidateSuccess: boolean;
    readonly baselineCostUSD: number;
    readonly candidateCostUSD: number;
    readonly baselineLatencyMs: number;
    readonly candidateLatencyMs: number;
}

export interface ExperimentEvidence {
    readonly source: 'external-independent' | 'internal-controlled' | 'synthetic';
    readonly oracleIndependent: boolean;
    readonly artifactBound: boolean;
    readonly datasetFrozen: boolean;
    readonly artifactSha256?: string;
    readonly datasetSha256?: string;
    readonly outcomes: readonly ExperimentOutcome[];
}

export interface ExperimentPromotionDecision {
    readonly decision: 'promote' | 'hold' | 'reject';
    readonly promotionPath: 'quality' | 'cost' | null;
    readonly reasons: readonly string[];
    readonly sampleSize: number;
    readonly baselineSuccessRate: number | null;
    readonly candidateSuccessRate: number | null;
    readonly successDelta: number | null;
    readonly successDelta95CI: readonly [number, number] | null;
    readonly mcnemarExactPValue: number | null;
    readonly netCostPerSuccessDelta: number | null;
    readonly netCostPerSuccessDelta95CI: readonly [number, number] | null;
    readonly relativeCostPerSuccessImprovement: number | null;
    readonly candidateLatencyP95Ms: number | null;
}
