/**
 * Tokonomics Deterministic Context Governor — Types and Interfaces
 * Purely deterministic, zero-LLM/zero-SLM intelligence layer data models.
 */

export type TaskType =
    | 'debug'
    | 'feature'
    | 'refactor'
    | 'explain'
    | 'test'
    | 'review'
    | 'architecture'
    | 'search'
    | 'completion';

export type RiskLevel =
    | 'low'
    | 'medium'
    | 'high'
    | 'critical';

export type RetrievalMode =
    | 'minimal'
    | 'local'
    | 'dependency'
    | 'error-driven'
    | 'test-driven'
    | 'broad';

export type OptimizationAggressiveness =
    | 'aggressive'
    | 'balanced'
    | 'conservative'
    | 'none';

export type EvidenceCategory =
    | 'targetImplementation'
    | 'apiContract'
    | 'callers'
    | 'callees'
    | 'tests'
    | 'fixtures'
    | 'mocks'
    | 'configuration'
    | 'gitHistory'
    | 'errorStackTrace'
    | 'generatedSourceSpec'
    | 'architecture';

export type EvidencePriority = 'critical' | 'high' | 'medium' | 'low';

export interface EvidenceRequirement {
    category: EvidenceCategory;
    priority: EvidencePriority;
    reason: string;
}

export interface ContextGovernorInput {
    userPrompt: string;
    activeFilePath?: string;
    cursorLine?: number;
    selectionText?: string;
    activeTabPaths?: string[];
    gitDiffSummary?: string;
    diagnosticsCount?: number;
    terminalErrorSnippet?: string;
    hasFailingTests?: boolean;
    unresolvedSymbolsCount?: number;
    isPublicApiModified?: boolean;
    hasDynamicConstructs?: boolean;
    sliceConfidenceEstimate?: number;
}

export interface ContextGovernorDecision {
    taskType: TaskType;
    confidence: number;
    riskLevel: RiskLevel;
    riskReasons: string[];
    retrievalMode: RetrievalMode;
    requiredEvidence: EvidenceRequirement[];
    optimizationAggressiveness: OptimizationAggressiveness;
    maxRecommendedReductionPct: number;
    enforcePreservationGate: boolean;
    timestamp: number;
}

export interface EvidenceSafetyResult {
    passed: boolean;
    required: EvidenceRequirement[];
    provided: EvidenceCategory[];
    missing: EvidenceRequirement[];
    confidence: number;
    actionTaken: 'proceed' | 'downgrade_to_conservative' | 'fail_closed_fallback';
}
