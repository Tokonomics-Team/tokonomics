import { EvidenceCategory, TaskType } from '../governor/governorTypes';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export type EvidenceSourceKind = 'lexical' | 'symbol' | 'ast' | 'graph' | 'lsp' | 'diagnostic' |
    'stack' | 'test' | 'open_editor' | 'diff' | 'configuration' | 'repository_rank';

export interface EvidenceContract {
    taskType: TaskType;
    focalSymbols: readonly string[];
    required: readonly EvidenceCategory[];
    optional: readonly EvidenceCategory[];
    forbidden: readonly EvidenceCategory[];
    reasons: ReadonlyMap<EvidenceCategory, string>;
}

export interface EvidenceSignal {
    source: 'diagnostic' | 'stack' | 'open_editor' | 'diff' | 'lsp';
    content: string;
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    symbolName?: string;
    version?: number;
}

export interface EvidenceCandidate {
    id: string;
    snapshotGeneration: number;
    category: EvidenceCategory;
    sourceKind: EvidenceSourceKind;
    fileKey?: string;
    filePath?: string;
    symbolName?: string;
    lineStart?: number;
    lineEnd?: number;
    content: string;
    contentHash: string;
    dependencies: readonly string[];
    provenance: readonly string[];
    mandatory: boolean;
    sourceScore: number;
    fusedScore: number;
    diversityScore: number;
}

export interface EvidenceDecision {
    candidateId: string;
    action: 'include' | 'exclude';
    reason: string;
    rank?: number;
}

export interface EvidenceRetrievalRequest {
    query: string;
    taskType: TaskType;
    snapshot: WorkspaceSnapshot;
    activeFilePath?: string;
    signals?: readonly EvidenceSignal[];
    maxCandidates?: number;
}

export interface EvidenceRetrievalResult {
    contract: EvidenceContract;
    selected: readonly EvidenceCandidate[];
    allCandidates: readonly EvidenceCandidate[];
    decisions: readonly EvidenceDecision[];
    covered: readonly EvidenceCategory[];
    missingRequired: readonly EvidenceCategory[];
    criticalRecall: number;
    stagesExecuted: readonly string[];
    sufficient: boolean;
    conservativeFallback: boolean;
}
