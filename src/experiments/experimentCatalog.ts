import { ExperimentDefinition, ExperimentId } from './experimentTypes';

const DEFINITIONS: readonly ExperimentDefinition[] = Object.freeze([
    { id: 'evidence-aware-learned-ranking', title: 'Evidence-aware local learned ranking', privacyClass: 'workspace-derived', requiresTrustedWorkspace: true, estimatedMaxLatencyMs: 12, estimatedMaxMemoryMB: 16, fallback: 'deterministic evidence fusion', productionHook: 'EvidenceAwareRetriever.rank' },
    { id: 'snapshot-safe-delta-context', title: 'Cross-turn snapshot-safe delta context', privacyClass: 'workspace-derived', requiresTrustedWorkspace: true, estimatedMaxLatencyMs: 8, estimatedMaxMemoryMB: 8, fallback: 'complete versioned snapshot', productionHook: 'PipelineOrchestrator.workspaceSnapshot' },
    { id: 'provider-specific-cache-layout', title: 'Provider-specific cache layout', privacyClass: 'none', requiresTrustedWorkspace: false, estimatedMaxLatencyMs: 3, estimatedMaxMemoryMB: 2, fallback: 'canonical message order', productionHook: 'CachePlanner.planContext' },
    { id: 'confidence-progressive-compilation', title: 'Confidence-driven progressive compilation', privacyClass: 'none', requiresTrustedWorkspace: false, estimatedMaxLatencyMs: 4, estimatedMaxMemoryMB: 2, fallback: 'conservative complete compilation', productionHook: 'PipelineOrchestrator.compile' },
    { id: 'bounded-local-semantic-retrieval', title: 'Optional bounded local semantic retrieval', privacyClass: 'workspace-derived', requiresTrustedWorkspace: true, estimatedMaxLatencyMs: 20, estimatedMaxMemoryMB: 32, fallback: 'lexical and graph retrieval', productionHook: 'EvidenceAwareRetriever.retrieve' },
    { id: 'inspectable-project-memory', title: 'Inspectable opt-in project memory', privacyClass: 'local-persistence', requiresTrustedWorkspace: true, estimatedMaxLatencyMs: 5, estimatedMaxMemoryMB: 8, fallback: 'no project-memory attachment', productionHook: 'ProjectMemory.formatCompactSummary' },
    { id: 'readability-guarded-vision', title: 'Readability-guarded task-aware vision', privacyClass: 'image-derived', requiresTrustedWorkspace: true, estimatedMaxLatencyMs: 20, estimatedMaxMemoryMB: 32, fallback: 'original image payload', productionHook: 'TaskAwareVisionOptimizer.planImageOptimization' },
    { id: 'adaptive-utility-budgeting', title: 'Adaptive utility and total-cost budgeting', privacyClass: 'none', requiresTrustedWorkspace: false, estimatedMaxLatencyMs: 5, estimatedMaxMemoryMB: 4, fallback: 'fixed global token budget', productionHook: 'GlobalTokenBudgeter.finalize' }
]);

export class ExperimentCatalog {
    public static all(): readonly ExperimentDefinition[] { return DEFINITIONS; }
    public static get(id: ExperimentId): ExperimentDefinition {
        const definition = DEFINITIONS.find(item => item.id === id);
        if (!definition) throw new Error(`Unknown experiment: ${id}`);
        return definition;
    }
}
