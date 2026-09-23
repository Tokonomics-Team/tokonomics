import { ExactSourceProvider } from '../workspace/semanticChunk';
import { EvidenceCategory, TaskType } from '../governor/governorTypes';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export type EvidenceSourceKind = 'lexical' | 'symbol' | 'ast' | 'graph' | 'lsp' | 'diagnostic' |
    'stack' | 'test' | 'terminal' | 'open_editor' | 'diff' | 'configuration' | 'repository_rank' | 'dense' | 'memory';

export interface EvidenceContract {
    taskType: TaskType;
    focalSymbols: readonly string[];
    required: readonly EvidenceCategory[];
    optional: readonly EvidenceCategory[];
    forbidden: readonly EvidenceCategory[];
    reasons: ReadonlyMap<EvidenceCategory, string>;
}

export interface EvidenceSignal {
    source: 'diagnostic' | 'stack' | 'open_editor' | 'diff' | 'lsp' | 'test' | 'terminal' | 'dense' | 'memory';
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
    /**
     * True when this candidate was nominated by a file's pruned skeleton. Only these need to be
     * rehydrated: a candidate carrying signal text (an open buffer, a diagnostic, a stack frame, a
     * diff hunk) is already the real thing and re-reading it from disk would gain nothing.
     */
    nominatedFromSkeleton?: boolean;
    /** True when `content` is byte-exact source rehydrated from the captured snapshot. */
    exactSource?: boolean;
    /**
     * Hash of the content that nominated this candidate, retained when rehydration replaced it.
     * Attribution is about which signal surfaced the evidence, which does not change because the
     * rendering was upgraded from a skeleton to exact source.
     */
    nominatedContentHash?: string;
    /** Why exact source could not be rendered, when it could not. */
    exactSourceShortfall?: string;
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
    /**
     * Reader used to rehydrate exact source for selected evidence. Absent means exact rehydration is
     * unavailable, and implementation evidence is then declared as a shortfall rather than rendered
     * from a skeleton.
     */
    exactSource?: ExactSourceProvider;
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
    /**
     * Three-way sufficiency, because 'not complete' covers two situations that call for opposite
     * responses. `incomplete_declared` still has evidence to render and tells the model what is
     * missing; `unusable` has nothing to render at all, and is the only state that justifies falling
     * back to attaching a whole file.
     */
    sufficiency: 'complete' | 'incomplete_declared' | 'unusable';
}
