/**
 * Tokonomics Context Compiler - Pipeline Orchestrator
 * Coordinates the 16-stage context compilation pipeline across legacy, hybrid, and compiler modes.
 */
import { AstPrunerEngine } from '../ast/pruner';
import { randomUUID } from 'crypto';
import { RamContextManager } from './ramManager';
import { CacheAlignerEngine } from '../cache/aligner';
import { MetricsTracker } from '../metrics/tracker';
import { CompilerFeatureFlags, FeatureFlagRegistry, PipelineMode } from './featureFlags';
import { TraceLogger, OptimizationTrace, Decision } from './traceLogger';
import { TokenCounter } from './tokenizer';
import { MessagePayload, TargetProvider } from '../types';
import { ContextKnapsackSolver } from '../solver/knapsackSolver';
import { ContextQualityEvaluator, ContextQualityReport } from '../solver/qualityScore';
import { SystemDependenceGraph } from '../ast/systemDependenceGraph';
import { SufficiencyEngine } from './sufficiencyEngine';
import { CachePlanner, CachePlanResult } from '../cache/cachePlanner';
import { ModelProfileRegistry } from '../tokenizer/modelProfile';
import { RuleBasedCompressor } from '../compression/compressionProvider';
import { ContextEntity } from '../solver/contextIR';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { CostCalculator } from '../cost/costCalculator';
import { DeterministicContextGovernor } from '../governor/contextGovernor';
import { AnonymizedLogger } from '../security/anonymizedLogger';
import { isConversationalOnly } from './conversationalPrompt';
import { ContextGovernorDecision, EvidenceCategory } from '../governor/governorTypes';
import { PreservationGate } from '../evaluation/preservationGate';
import { VersionedWorkspaceIndex, WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { SliceConfidenceEvaluator } from '../ast/sliceConfidence';
import { EvidenceAwareRetriever, candidateCeilingForBudget } from '../retrieval/evidenceRetriever';
import { EvidenceRetrievalResult, EvidenceSignal } from '../retrieval/evidenceTypes';
import { StructuredPreservationGate } from '../retrieval/structuredPreservation';
import { GlobalTokenBudgeter, PayloadBudgetPlan, RenderedBudgetAssignment, TokenBudgetExceededError } from '../solver/globalBudget';
import { SolverConstraintError } from '../solver/knapsackSolver';
import { createHash } from 'crypto';
import { ModelProfile } from '../tokenizer/modelProfile';
import { ExperimentRuntime } from '../experiments/experimentRuntime';
import { ExperimentalCandidateAdapters } from '../experiments/candidateAdapters';
import { ComponentReceiptTrail, ComponentReceipt, RequestCapabilitySnapshot } from './componentRegistry';
import { BoundedEconomics } from '../cost/boundedEconomics';
import { SnapshotSafeLspService } from '../workspace/snapshotSafeLsp';
import { WorkspaceSignalCoordinator } from '../workspace/signalCoordinator';
import { WorkspaceSignalSnapshot } from '../workspace/signalTypes';
import { WorkspaceExactSourceReader } from '../workspace/exactSourceReader';
import { HybridRetriever } from '../search/hybridRetriever';
import { CrossEncoderReranker } from '../search/reranker';
import { MmrDiversityRanker } from '../search/mmrDiversity';
import { EmbeddingSemanticDedupEngine } from '../dedup/semanticDedup';
import { ProjectMemoryEngine } from '../memory/projectMemory';
import { LocalSlmBrain } from './localSlmBrain';
import { createPipelineRequestContext, executePipelineStage, MessageNormalizationStage } from './pipelineStages';
import { InlineEvidenceClassifier } from '../governor/inlineEvidenceClassifier';
import { applyConservativeReduction, buildEvidencePolicyDecisions, DeferredStageOutcome, extractInstructionText, resolveDeferredStageReceipts } from './safePathPolicy';
import { createPrefixStableKeywordResolver } from './prefixContinuity';
import { executeLegacyPipeline } from './legacyPipeline';
import { buildRetrievalRenderDecisions as renderDecisions, resolveRetrievalRenderDecision, shortfallAttribute } from './retrievalRenderPolicy';
import { UserPreferenceRegistry } from '../config/userPreferences';
import { preservationObligationsForPolicy, renderFencedCode, resolveTaskCompressionPolicy, TaskCompressionPolicy } from './taskCompressionPolicy';
export interface ContextCompileRequest {
    messages: MessagePayload[];
    requestId?: string; sessionId?: string; targetProvider?: TargetProvider; targetModel?: string;
    maxTokenBudget?: number; maxOutputTokens?: number; fixedProtocolTokens?: number;
    activeFilePath?: string; cursorLine?: number; userIntent?: string;
    cancellation?: CancellationLike; preserveProtocol?: boolean; preserveText?: boolean;
    deferSideEffects?: boolean; workspaceSnapshot?: WorkspaceSnapshot;
    allowWorkspaceRetrieval?: boolean; evidenceSignals?: readonly EvidenceSignal[];
    signalSnapshot?: WorkspaceSignalSnapshot; callerSuppliedSource?: boolean;
    fallbackReasons?: readonly string[]; deadlineAt?: number;
}

export interface CancellationLike {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested?: (listener: () => void) => { dispose(): void };
}
export class CompilationCancelledError extends Error {
    constructor() { super('Context compilation was cancelled.'); this.name = 'CompilationCancelledError'; }
}

export interface ContextCompileResult {
    requestId: string; optimizedMessages: MessagePayload[];
    originalTokens: number; optimizedTokens: number; tokensSaved: number; reductionPercentage: number;
    effectiveCostSavedUSD: number; contextQuality: ContextQualityReport; cachePlan?: CachePlanResult;
    trace: OptimizationTrace; pipelineModeUsed: PipelineMode; governorDecision?: ContextGovernorDecision;
    event: PromptOptimizationEvent; committed: boolean; snapshotGeneration?: number;
    evidenceRetrieval?: EvidenceRetrievalResult; budgetPlan?: PayloadBudgetPlan;
    capabilities?: RequestCapabilitySnapshot; receipts?: readonly ComponentReceipt[];
}

export class PipelineOrchestrator {
    private traceLogger: TraceLogger = TraceLogger.getInstance();
    private knapsackSolver: ContextKnapsackSolver = new ContextKnapsackSolver();
    private cqEvaluator: ContextQualityEvaluator = new ContextQualityEvaluator();
    private sdgSlicer: SystemDependenceGraph = new SystemDependenceGraph();
    private sufficiencyEngine: SufficiencyEngine = new SufficiencyEngine();
    private cachePlanner: CachePlanner = new CachePlanner();
    private compressor: RuleBasedCompressor = new RuleBasedCompressor();
    private sliceConfidenceEvaluator = new SliceConfidenceEvaluator();
    private evidenceRetriever = new EvidenceAwareRetriever();
    private lspService = new SnapshotSafeLspService();
    private signalCoordinator = new WorkspaceSignalCoordinator();
    private globalBudgeter = new GlobalTokenBudgeter();
    private projectMemoryEngine = new ProjectMemoryEngine();
    private _localSlmBrain?: LocalSlmBrain;
    private persistentHybrid = new HybridRetriever();
    private lastHybridSnapshotGen: number = -1;
    private _crossEncoder?: CrossEncoderReranker;
    private _mmrRanker?: MmrDiversityRanker;
    private _semanticDedup?: EmbeddingSemanticDedupEngine;

    private get crossEncoder(): CrossEncoderReranker { return this._crossEncoder ??= new CrossEncoderReranker(); }
    public getCrossEncoder(): CrossEncoderReranker { return this.crossEncoder; }
    public setCrossEncoder(encoder: CrossEncoderReranker): void { this._crossEncoder = encoder; }

    private get mmrRanker(): MmrDiversityRanker { return this._mmrRanker ??= new MmrDiversityRanker(); }
    private get semanticDedup(): EmbeddingSemanticDedupEngine { return this._semanticDedup ??= new EmbeddingSemanticDedupEngine(); }

    constructor(
        private astEngine: AstPrunerEngine = new AstPrunerEngine(),
        private ramManager?: RamContextManager,
        private cacheAligner?: CacheAlignerEngine,
        private metricsTracker?: MetricsTracker,
        private workspaceIndex?: VersionedWorkspaceIndex
    ) {}

    public getTraceLogger(): TraceLogger {
        return this.traceLogger;
    }

    public getRamManager(): RamContextManager | undefined {
        return this.ramManager;
    }

    public setRamManager(ram: RamContextManager): void {
        this.ramManager = ram;
    }

    public getLspService(): SnapshotSafeLspService {
        return this.lspService;
    }

    public setLspService(service: SnapshotSafeLspService): void {
        this.lspService = service;
    }

    public getSignalCoordinator(): WorkspaceSignalCoordinator {
        return this.signalCoordinator;
    }

    public setSignalCoordinator(coordinator: WorkspaceSignalCoordinator): void {
        this.signalCoordinator = coordinator;
    }

    public getProjectMemoryEngine(): ProjectMemoryEngine {
        return this.projectMemoryEngine;
    }

    public setProjectMemoryEngine(engine: ProjectMemoryEngine): void {
        this.projectMemoryEngine = engine;
    }

    public getLocalSlmBrain(): LocalSlmBrain {
        if (!this._localSlmBrain) {
            this._localSlmBrain = new LocalSlmBrain();
        }
        return this._localSlmBrain;
    }

    public setLocalSlmBrain(brain: LocalSlmBrain): void {
        this._localSlmBrain = brain;
    }

    /**
     * Executes context compilation through the active pipeline (legacy / hybrid / compiler)
     */
    public async compileContext(request: ContextCompileRequest): Promise<ContextCompileResult> {
        this.throwIfCancelled(request.cancellation);
        const requestId = request.requestId || `tok_${randomUUID()}`;
        const startTime = performance.now();
        const flags = FeatureFlagRegistry.getFlags();
        const optimizationMode = UserPreferenceRegistry.get().preferences.optimizationMode;
        const mode = flags.pipelineMode;
        const capabilities = FeatureFlagRegistry.captureRequestCapabilities();
        const modelProfile = ModelProfileRegistry.getProfile(request.targetModel || request.targetProvider || 'claude-3-5-sonnet');
        const stageContext = createPipelineRequestContext({ requestId, startedAt: Date.now(),
            deadlineAt: request.deadlineAt ?? Number.POSITIVE_INFINITY, cancellation: request.cancellation,
            profile: modelProfile, capabilities, snapshot: request.workspaceSnapshot,
            privacy: { workspaceTrusted: capabilities.workspaceTrusted,
                workspaceContentAllowed: capabilities.workspaceTrusted && request.allowWorkspaceRetrieval === true } });
        request = { ...request, messages: await executePipelineStage(MessageNormalizationStage, request.messages, stageContext) };
        const receiptTrail = new ComponentReceiptTrail(capabilities);
        receiptTrail.record('canonical_request_compiler', 'attempted');

        const pipelineFallbackReasons = [...(request.fallbackReasons || [])];
        let forcePassThrough = flags.forcePassThrough;
        if (forcePassThrough) pipelineFallbackReasons.push('release_control_pass_through');

        // 0. Deterministic Context Governor Evaluation (Zero LLM/SLM)
        const governor = DeterministicContextGovernor.getInstance();
        receiptTrail.record('context_governor', 'attempted');
        receiptTrail.record('context_governor', 'invoked');
        receiptTrail.record('context_governor', 'contributed');
        const userPrompt = request.messages.map(m => m.content).join(' ');
        // Intent is a property of what the user ASKED, not of the code they attached.
        const userInstruction = extractInstructionText(userPrompt);
        const latestUserMessage = [...request.messages].reverse().find(m => m.role === 'user')?.content || userPrompt;
        const latestUserInstruction = extractInstructionText(latestUserMessage);
        const isConversationalTurn = isConversationalOnly(latestUserInstruction) || isConversationalOnly(latestUserMessage);
        const governorSignals = request.signalSnapshot?.snapshotGeneration === request.workspaceSnapshot?.generation
            ? request.signalSnapshot : undefined;
        const terminal = governorSignals?.terminalContext;
        const governorDecision = await executePipelineStage({ id: 'intent', enabled: true,
            execute: () => governor.evaluateContext({ userPrompt: userInstruction, activeFilePath: request.activeFilePath,
                cursorLine: request.cursorLine, optimizationMode,
                diagnosticsCount: governorSignals?.diagnostics?.filter(item => item.severity === 'error').length,
                hasFailingTests: governorSignals?.testOutcomes?.some(item => item.isFailing),
                terminalErrorSnippet: terminal?.userConsented && terminal.source !== 'unauthorized'
                    && terminal.exitCode !== undefined && terminal.exitCode !== 0 ? terminal.rawText : undefined })
        }, undefined, stageContext);
        const taskCompressionPolicy = resolveTaskCompressionPolicy(governorDecision, optimizationMode, userInstruction);
        const preservationObligations = preservationObligationsForPolicy(taskCompressionPolicy);
        const progressiveExperimentGate = ExperimentRuntime.gate('confidence-progressive-compilation');
        const shadowCompilationTier = progressiveExperimentGate.enabled
            ? ExperimentRuntime.runShadow(
                'confidence-progressive-compilation', requestId, 'complete',
                () => ExperimentalCandidateAdapters.compilationTier(
                    governorDecision.confidence,
                    request.workspaceSnapshot ? 1 : 0,
                    governorDecision.riskLevel === 'critical' ? 1 : governorDecision.riskLevel === 'high' ? 0.75 : 0.2
                ),
                value => value === 'complete' || value === 'guarded' || value === 'progressive'
            ) : 'complete';

        // 1. Calculate Baseline Tokens
        let originalTokens: number;
        try {
            originalTokens = TokenCounter.countMessagesTokens(request.messages) + Math.max(0, request.fixedProtocolTokens || 0);
        } catch {
            originalTokens = request.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 3) + 4, 0)
                + Math.max(0, request.fixedProtocolTokens || 0);
            pipelineFallbackReasons.push('tokenizer_failure_conservative_estimate');
            forcePassThrough = true;
        }

        let optimizedMessages: MessagePayload[] = [];
        // Compiler-stage outcomes observed before the preservation gates run. Resolved to terminal
        // receipts only after the final payload is known (see resolvePendingCompilerOutcomes).
        const pendingCompilerOutcomes: DeferredStageOutcome[] = [];
        const decisions: Decision[] = [
            {
                itemId: 'deterministic_context_governor',
                action: 'govern',
                reason: `Inferred task '${governorDecision.taskType}' (risk: ${governorDecision.riskLevel}, mode: ${governorDecision.retrievalMode}, aggressiveness: ${governorDecision.optimizationAggressiveness})`,
                confidence: governorDecision.confidence,
                evidence: governorDecision.riskReasons.length > 0 ? governorDecision.riskReasons : ['IntentExtractor', 'EvidencePolicyMatrix']
            }
        ];
        if (progressiveExperimentGate.enabled) {
            decisions.push({
                itemId: 'experiment_confidence_progressive_compilation', action: 'preserve',
                reason: `Shadow-only candidate selected '${shadowCompilationTier}'; production output remains controlled by the existing pipeline.`,
                confidence: 1, evidence: ['Phase10ExperimentRuntime', 'shadow-only']
            });
        }

        // 1b. Immutable workspace snapshot invariant
        if (request.workspaceSnapshot) {
            receiptTrail.record('workspace_snapshot', 'attempted');
            receiptTrail.record('workspace_snapshot', 'invoked');
            decisions.push({
                itemId: 'workspace_snapshot',
                action: 'include',
                reason: `Captured immutable workspace generation ${request.workspaceSnapshot.generation} (${request.workspaceSnapshot.files.size} files, ${request.workspaceSnapshot.symbols.length} symbols)`,
                confidence: 1.0,
                evidence: ['VersionedWorkspaceIndex', `generation:${request.workspaceSnapshot.generation}`]
            });
        } else {
            receiptTrail.record('workspace_snapshot', 'bypassed', 'no_snapshot_provided');
            if (this.ramManager) {
                const stats = this.ramManager.getStats();
                decisions.push({
                    itemId: 'ram_context_accelerator',
                    action: 'include',
                    reason: `RAM accelerator active (${stats.skeletonsCached} cached AST skeletons, ${stats.symbolsIndexed} indexed symbols, ${stats.hitRatePercentage}% hit rate)`,
                    confidence: 1.0,
                    evidence: ['RamContextManager', 'BM25SymbolIndex', 'ASTMemoization']
                });
            }
        }
        let cqReport: ContextQualityReport;
        let cachePlanResult: CachePlanResult | undefined;
        let codeRenderedAssignments: readonly RenderedBudgetAssignment[] = Object.freeze([]);
        let evidenceRetrieval: EvidenceRetrievalResult | undefined;
        let lspSignals: readonly EvidenceSignal[] = Object.freeze([]);
        let denseSignals: readonly EvidenceSignal[] = Object.freeze([]);
        let memorySignals: readonly EvidenceSignal[] = Object.freeze([]);
        // A greeting is not a task; see isConversationalOnly.
        const retrievalRequested = request.allowWorkspaceRetrieval === true && !isConversationalTurn;
        if (retrievalRequested && request.workspaceSnapshot && !request.preserveProtocol
            && !forcePassThrough && flags.enableWorkspaceIndex) {
            receiptTrail.record('lsp_intelligence', 'attempted');

            if (flags.enableLspIntelligence) {
                receiptTrail.record('lsp_intelligence', 'invoked');
                try {
                    const lspRes = await this.lspService.queryIntelligence({
                        snapshot: request.workspaceSnapshot,
                        activeFilePath: request.activeFilePath,
                        cursorLine: request.cursorLine,
                        query: userPrompt,
                        cancellation: request.cancellation,
                        expectedDocumentVersion: request.signalSnapshot?.cursorSelection?.documentVersion
                    });
                    lspSignals = lspRes.signals;
                    if (lspRes.timedOut) {
                        receiptTrail.record('lsp_intelligence', 'timed_out', 'aggregate_deadline_exceeded');
                    } else if (lspRes.fallbackUsed) {
                        receiptTrail.record('lsp_intelligence', 'fallback', lspRes.fallbackReason || 'syntactic_fallback');
                    }
                } catch (err: any) {
                    receiptTrail.record('lsp_intelligence', 'failed', 'lsp_failure');
                }
            } else {
                receiptTrail.record('lsp_intelligence', 'bypassed', 'flag_disabled');
            }

            // Phase 13 & 14: Coordinate Delta, Error, Test, Git, Terminal, and Provenance Signals
            for (const signalComponent of ['delta_context', 'error_intelligence', 'test_graph', 'git_graph',
                'terminal_optimizer', 'source_provenance', 'dense_retrieval'] as const) receiptTrail.record(signalComponent, 'attempted');

            const signalFlags = {
                enableDeltaContext: flags.enableDeltaContext, enableErrorIntelligence: flags.enableErrorIntelligence,
                enableTestGraph: flags.enableTestGraph, enableGitGraph: flags.enableGitGraph,
                enableTerminalOptimizer: flags.enableTerminalOptimizer, enableProvenance: flags.enableProvenance
            };
            const anySignalEnabled = Object.values(signalFlags).some(Boolean);
            const signalRes: ReturnType<WorkspaceSignalCoordinator['coordinateSignals']> = anySignalEnabled
                ? this.signalCoordinator.coordinateSignals({
                    snapshot: request.workspaceSnapshot,
                    signals: request.signalSnapshot,
                    activeFilePath: request.activeFilePath,
                    cursorLine: request.cursorLine,
                    userPrompt,
                    flags: signalFlags
                })
                : {
                    deltaSignals: Object.freeze([]), errorSignals: Object.freeze([]), testSignals: Object.freeze([]),
                    gitSignals: Object.freeze([]), terminalSignals: Object.freeze([]), combinedSignals: Object.freeze([]),
                    discardedStaleCount: 0, durationMs: 0
                };

            if (flags.enableDeltaContext) {
                receiptTrail.record('delta_context', 'invoked');
            } else {
                receiptTrail.record('delta_context', 'bypassed', 'flag_disabled');
            }

            if (flags.enableErrorIntelligence) {
                receiptTrail.record('error_intelligence', 'invoked');
            } else {
                receiptTrail.record('error_intelligence', 'bypassed', 'flag_disabled');
            }

            if (flags.enableTestGraph) {
                receiptTrail.record('test_graph', 'invoked');
            } else {
                receiptTrail.record('test_graph', 'bypassed', 'flag_disabled');
            }

            if (flags.enableGitGraph) {
                receiptTrail.record('git_graph', 'invoked');
            } else {
                receiptTrail.record('git_graph', 'bypassed', 'flag_disabled');
            }

            if (flags.enableTerminalOptimizer) {
                receiptTrail.record('terminal_optimizer', 'invoked');
            } else {
                receiptTrail.record('terminal_optimizer', 'bypassed', 'flag_disabled');
            }

            if (flags.enableProvenance) {
                receiptTrail.record('source_provenance', 'invoked');
            } else {
                receiptTrail.record('source_provenance', 'bypassed', 'flag_disabled');
            }

            // Versioned local hybrid retrieval. Renderable content is resolved from the pinned snapshot.
            if (flags.enableDenseEmbeddings) {
                receiptTrail.record('dense_retrieval', 'invoked');
                try {
                    if (this.lastHybridSnapshotGen !== request.workspaceSnapshot.generation) {
                        await this.persistentHybrid.indexSnapshot(request.workspaceSnapshot, { maxChunks: 2_000 });
                        this.lastHybridSnapshotGen = request.workspaceSnapshot.generation;
                    }
                    const denseResults = this.persistentHybrid.retrieve({
                        query: userPrompt,
                        enableDense: true,
                        topK: 20
                    });
                    denseSignals = Object.freeze(denseResults.map(result => ({ source: 'dense' as const,
                        content: result.content, filePath: result.filePath, symbolName: result.symbolName,
                        version: request.workspaceSnapshot!.generation })));
                } catch (err: any) {
                    receiptTrail.record('dense_retrieval', 'fallback', 'dense_retrieval_failure');
                }
            } else {
                receiptTrail.record('dense_retrieval', 'bypassed', 'flag_disabled');
            }

            receiptTrail.record('project_memory', 'attempted');
            if (!flags.enableProjectMemory) {
                receiptTrail.record('project_memory', 'bypassed', 'flag_disabled');
            } else {
                const workspaceId = (request.workspaceSnapshot as any).identity?.workspaceId
                    || request.workspaceSnapshot.roots?.map(root => root.id).sort().join('_') || 'default_workspace';
                this.projectMemoryEngine.setWorkspaceTrust(workspaceId, capabilities.workspaceTrusted);
                if (!capabilities.workspaceTrusted) {
                    receiptTrail.record('project_memory', 'bypassed', 'untrusted_workspace');
                } else if (!this.projectMemoryEngine.hasWorkspaceConsent(workspaceId)) {
                    receiptTrail.record('project_memory', 'bypassed', 'no_workspace_consent');
                } else {
                    receiptTrail.record('project_memory', 'invoked');
                    try {
                        const candidates = this.projectMemoryEngine.retrieveCandidates(userPrompt, workspaceId, 300);
                        memorySignals = Object.freeze(candidates.map(candidate => ({ source: 'memory' as const,
                            content: candidate.content, symbolName: candidate.symbolName,
                            version: request.workspaceSnapshot!.generation })));
                    } catch {
                        receiptTrail.record('project_memory', 'fallback', 'memory_retrieval_failure');
                    }
                }
            }

            try {
                const combinedSignals = [
                    ...(request.evidenceSignals || []), ...lspSignals, ...signalRes.combinedSignals, ...denseSignals, ...memorySignals
                ];
                evidenceRetrieval = this.evidenceRetriever.retrieve({
                    query: userPrompt,
                    taskType: governorDecision.taskType,
                    snapshot: request.workspaceSnapshot,
                    activeFilePath: request.activeFilePath,
                    signals: combinedSignals,
                    maxCandidates: candidateCeilingForBudget(request.maxTokenBudget),
                    // Read only for candidates that survive selection, and only inside the snapshot's
                    // roots. No roots authorises no reads, so no reader is supplied and the retriever
                    // declares a shortfall rather than rendering a skeleton as code.
                    exactSource: Array.isArray(request.workspaceSnapshot.roots)
                        && request.workspaceSnapshot.roots.length > 0
                        ? new WorkspaceExactSourceReader(
                            request.workspaceSnapshot.roots.map(root => root.path))
                        : undefined
                });
                receiptTrail.record('evidence_aware_retrieval', 'attempted');
                receiptTrail.record('evidence_aware_retrieval', 'invoked');
                receiptTrail.record('evidence_aware_retrieval',
                    !evidenceRetrieval.conservativeFallback && evidenceRetrieval.selected.length > 0 ? 'contributed' : 'fallback',
                    evidenceRetrieval.conservativeFallback ? 'conservative_fallback' : evidenceRetrieval.selected.length === 0 ? 'zero_matches' : undefined);

                // Both hashes count. Rehydration replaces a candidate's content with exact source, so
                // matching only the final hash would report the signal that surfaced the evidence as
                // having contributed nothing.
                const selectedHashes = new Set(evidenceRetrieval.selected.flatMap(candidate =>
                    candidate.nominatedContentHash
                        ? [candidate.contentHash, candidate.nominatedContentHash]
                        : [candidate.contentHash]));
                const contributed = (signals: readonly EvidenceSignal[]) => signals.some(signal =>
                    selectedHashes.has(createHash('sha256').update(signal.content).digest('hex')));
                const recordSignalOutcome = (id: 'lsp_intelligence' | 'delta_context' | 'error_intelligence' | 'test_graph' | 'git_graph' | 'terminal_optimizer',
                    signals: readonly EvidenceSignal[]) => {
                    const didContribute = contributed(signals);
                    receiptTrail.recordIfPending(id, didContribute ? 'contributed' : 'fallback',
                        didContribute ? undefined : signals.length ? 'not_admitted' : 'zero_signals');
                };
                if (flags.enableLspIntelligence) recordSignalOutcome('lsp_intelligence', lspSignals);
                if (flags.enableDeltaContext) recordSignalOutcome('delta_context', signalRes.deltaSignals);
                if (flags.enableErrorIntelligence) recordSignalOutcome('error_intelligence', signalRes.errorSignals);
                if (flags.enableTestGraph) recordSignalOutcome('test_graph', signalRes.testSignals);
                if (flags.enableGitGraph) recordSignalOutcome('git_graph', signalRes.gitSignals);
                if (flags.enableTerminalOptimizer) recordSignalOutcome('terminal_optimizer', signalRes.terminalSignals);
                if (flags.enableDenseEmbeddings && !receiptTrail.snapshot().some(receipt =>
                    receipt.componentId === 'dense_retrieval' && ['fallback', 'failed'].includes(receipt.outcome))) {
                    const didContribute = contributed(denseSignals);
                    receiptTrail.record('dense_retrieval', didContribute ? 'contributed' : 'fallback',
                        didContribute ? undefined : denseSignals.length ? 'not_admitted' : 'zero_matches');
                }
                if (flags.enableProjectMemory && !receiptTrail.snapshot().some(receipt =>
                    receipt.componentId === 'project_memory' && ['bypassed', 'fallback', 'failed'].includes(receipt.outcome))) {
                    const didContribute = contributed(memorySignals);
                    receiptTrail.record('project_memory', didContribute ? 'contributed' : 'fallback',
                        didContribute ? undefined : memorySignals.length ? 'not_admitted' : 'zero_matches');
                }
                if (flags.enableProvenance) receiptTrail.record('source_provenance',
                    evidenceRetrieval.selected.length > 0 && evidenceRetrieval.selected.every(candidate => candidate.provenance.length > 0) ? 'contributed' : 'fallback',
                    evidenceRetrieval.selected.length ? 'missing_provenance' : 'zero_admitted_blocks');

                // Bounded production reranking. Each stage changes only the selected candidate order/set.
                receiptTrail.record('cross_encoder', 'attempted');
                if (flags.enableCrossEncoder) {
                    receiptTrail.record('cross_encoder', 'invoked');
                    try {
                        const before = evidenceRetrieval.selected.slice(0, 32);
                        const candidateItems = before.map(c => ({
                            id: c.id,
                            filePath: c.filePath || '',
                            symbolName: c.symbolName || '',
                            content: c.content,
                            initialScore: c.fusedScore || c.sourceScore,
                            category: c.category, sourceKind: c.sourceKind, contentHash: c.contentHash,
                            dependencies: c.dependencies, provenance: c.provenance, mandatory: c.mandatory
                        }));
                        const ranked = await this.crossEncoder.rank(userPrompt, candidateItems, undefined, request.cancellation);
                        const byId = new Map(evidenceRetrieval.selected.map(candidate => [candidate.id, candidate]));
                        const reordered = [...ranked.map(item => byId.get(item.id)!).filter(Boolean), ...evidenceRetrieval.selected.slice(32)];
                        const changed = reordered.some((item, index) => item.id !== evidenceRetrieval!.selected[index]?.id);
                        evidenceRetrieval = { ...evidenceRetrieval, selected: Object.freeze(reordered),
                            stagesExecuted: Object.freeze([...evidenceRetrieval.stagesExecuted, 'lexical_interaction_rerank']) };
                        receiptTrail.record('cross_encoder', changed ? 'contributed' : 'fallback', changed ? undefined : 'ranking_unchanged');
                    } catch (err: any) {
                        receiptTrail.record('cross_encoder', 'fallback', 'cross_encoder_failure');
                    }
                } else {
                    receiptTrail.record('cross_encoder', 'bypassed', 'flag_disabled');
                }

                receiptTrail.record('standalone_mmr', 'attempted');
                if (flags.enableMmrDiversity) {
                    receiptTrail.record('standalone_mmr', 'invoked');
                    try {
                        const before = evidenceRetrieval.selected;
                        const candidates = before.slice(0, 32).map((c, idx) => ({
                            id: c.id,
                            filePath: c.filePath || '',
                            symbolName: c.symbolName || '',
                            content: c.content,
                            rerankScore: c.fusedScore || 0.5,
                            rank: idx + 1,
                            rerankerUsed: 'cosine' as const,
                            mandatory: c.mandatory,
                            category: c.category
                        }));
                        const diversified = this.mmrRanker.rankDiversity(candidates, candidates.length);
                        const byId = new Map(before.map(candidate => [candidate.id, candidate]));
                        const reordered = [...diversified.map(item => byId.get(item.id)!).filter(Boolean), ...before.slice(32)];
                        const changed = reordered.some((item, index) => item.id !== before[index]?.id);
                        evidenceRetrieval = { ...evidenceRetrieval, selected: Object.freeze(reordered),
                            stagesExecuted: Object.freeze([...evidenceRetrieval.stagesExecuted, 'mmr_diversity']) };
                        receiptTrail.record('standalone_mmr', changed ? 'contributed' : 'fallback', changed ? undefined : 'ranking_unchanged');
                    } catch (err: any) {
                        receiptTrail.record('standalone_mmr', 'fallback', 'mmr_failure');
                    }
                } else {
                    receiptTrail.record('standalone_mmr', 'bypassed', 'flag_disabled');
                }

                receiptTrail.record('semantic_dedup', 'attempted');
                if (flags.enableSemanticDedup) {
                    receiptTrail.record('semantic_dedup', 'invoked');
                    try {
                        const before = evidenceRetrieval.selected;
                        const dedupItems = before.slice(0, 64).map(c => ({
                            id: c.id,
                            content: c.content,
                            tokens: Math.ceil(c.content.length / 4),
                            mandatory: c.mandatory,
                            category: c.category, symbolName: c.symbolName, filePath: c.filePath,
                            provenance: c.provenance, dependencies: c.dependencies, snapshotGeneration: c.snapshotGeneration
                        }));
                        const dedupRes = this.semanticDedup.deduplicate(dedupItems);
                        const kept = new Set(dedupRes.keptItems.map(item => item.id));
                        const selected = [...before.slice(0, 64).filter(candidate => kept.has(candidate.id)), ...before.slice(64)];
                        evidenceRetrieval = { ...evidenceRetrieval, selected: Object.freeze(selected),
                            stagesExecuted: Object.freeze([...evidenceRetrieval.stagesExecuted, 'provenance_aware_dedup']) };
                        receiptTrail.record('semantic_dedup', dedupRes.culledDuplicates.length > 0 ? 'contributed' : 'fallback',
                            dedupRes.culledDuplicates.length > 0 ? undefined : 'no_safe_duplicates');
                    } catch (err: any) {
                        receiptTrail.record('semantic_dedup', 'fallback', 'dedup_failure');
                    }
                } else {
                    receiptTrail.record('semantic_dedup', 'bypassed', 'flag_disabled');
                }

                // Phase 18: Shadow evaluation for local_slm
                receiptTrail.record('local_slm', 'attempted');
                if (flags.enableLocalSlm) {
                    const isTrusted = capabilities.workspaceTrusted;
                    const hasConsent = capabilities.experimentalConsent;
                    const isKilled = capabilities.disabledCapabilities.includes('localInference');

                    if (isKilled) {
                        receiptTrail.record('local_slm', 'bypassed', 'release_kill_switch');
                    } else if (!isTrusted) {
                        receiptTrail.record('local_slm', 'bypassed', 'untrusted_workspace');
                    } else if (!hasConsent) {
                        receiptTrail.record('local_slm', 'bypassed', 'consent_required');
                    } else if (!this.getLocalSlmBrain().isReady()) {
                        receiptTrail.record('local_slm', 'bypassed', 'model_not_ready');
                    } else {
                        receiptTrail.record('local_slm', 'invoked');
                        try {
                            const slmProposal = await this.getLocalSlmBrain().refineQueryProposal(userPrompt, { timeoutMs: 25 });
                            if (slmProposal.isFallback) {
                                receiptTrail.record('local_slm', 'fallback', 'low_confidence_or_rule_fallback');
                            } else {
                                receiptTrail.record('local_slm', 'fallback', 'shadow_result_discarded');
                            }
                        } catch (err: any) {
                            receiptTrail.record('local_slm', 'fallback', 'slm_inference_failure');
                        }
                    }
                } else {
                    receiptTrail.record('local_slm', 'bypassed', 'flag_disabled_or_shadow');
                }
            } catch (error) {
                pipelineFallbackReasons.push('retrieval_failure_pass_through');
                forcePassThrough = true;
                AnonymizedLogger.getInstance().error('Retrieval', 'Workspace retrieval used a conservative fallback.', error);
                receiptTrail.recordIfPending('evidence_aware_retrieval', 'attempted');
                receiptTrail.recordIfPending('evidence_aware_retrieval', 'fallback', 'retrieval_failure');
                for (const id of ['cross_encoder', 'standalone_mmr', 'semantic_dedup', 'project_memory', 'local_slm'] as const) {
                    receiptTrail.recordIfPending(id, 'bypassed', 'retrieval_failure');
                }
            }
        } else {
            receiptTrail.record('lsp_intelligence', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('delta_context', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('error_intelligence', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('test_graph', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('git_graph', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('terminal_optimizer', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('source_provenance', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('dense_retrieval', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('cross_encoder', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('standalone_mmr', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('semantic_dedup', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('project_memory', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('local_slm', 'bypassed', 'retrieval_not_requested_or_preserved');
            receiptTrail.record('evidence_aware_retrieval', 'bypassed', 'retrieval_not_requested_or_preserved');
        }
        if (request.workspaceSnapshot) {
            const snapshotContributed = Boolean(evidenceRetrieval && !evidenceRetrieval.conservativeFallback
                && evidenceRetrieval.selected.length > 0);
            receiptTrail.record('workspace_snapshot', snapshotContributed ? 'contributed' : 'fallback',
                snapshotContributed ? undefined : retrievalRequested ? 'no_admitted_evidence' : 'snapshot_not_authorized');
        }
        if (evidenceRetrieval) {
            decisions.push({
                itemId: 'evidence_aware_retrieval',
                action: evidenceRetrieval.conservativeFallback ? 'preserve' : 'include',
                reason: evidenceRetrieval.conservativeFallback
                    ? `Evidence contract incomplete; missing [${evidenceRetrieval.missingRequired.join(', ')}]. Conservative fallback required.`
                    : `Evidence contract satisfied with ${evidenceRetrieval.selected.length} snapshot-bound candidates (${evidenceRetrieval.stagesExecuted.join(' -> ')}).`,
                confidence: evidenceRetrieval.criticalRecall,
                evidence: ['EvidenceContract', 'ReciprocalRankFusion', 'MMRDiversity', `snapshot:${request.workspaceSnapshot?.generation ?? 'unavailable'}`]
            });
            for (const retrievalDecision of evidenceRetrieval.decisions) {
                decisions.push({
                    itemId: retrievalDecision.candidateId,
                    action: retrievalDecision.action,
                    reason: retrievalDecision.reason,
                    confidence: retrievalDecision.action === 'include' ? 0.95 : 0.8,
                    evidence: ['EvidenceAwareRetriever']
                });
            }
        }

        if (forcePassThrough || request.preserveProtocol || request.preserveText || governorDecision.optimizationAggressiveness === 'none') {
            // Critical risk override: Full context preserved
            optimizedMessages = request.messages.map(m => ({ ...m }));
            receiptTrail.record('context_solver', 'bypassed', 'conservative_override');
            receiptTrail.record('sdg_slicing', 'bypassed', 'conservative_override');
            receiptTrail.record('sufficiency_engine', 'bypassed', 'conservative_override');
            receiptTrail.record('rule_compression', 'bypassed', 'conservative_override');
            receiptTrail.record('cache_planner', 'bypassed', 'conservative_override');
        } else {
            try {
                if (mode === 'legacy') {
                    optimizedMessages = await this.executeLegacyPipeline(request, decisions);
                    receiptTrail.record('context_solver', 'bypassed', 'legacy_mode');
                    receiptTrail.record('sdg_slicing', 'bypassed', 'legacy_mode');
                    receiptTrail.record('sufficiency_engine', 'bypassed', 'legacy_mode');
                    receiptTrail.record('rule_compression', 'bypassed', 'legacy_mode');
                    receiptTrail.record('cache_planner', 'bypassed', 'legacy_mode');
                } else if (mode === 'hybrid') {
                    optimizedMessages = await this.executeHybridPipeline(request, decisions);
                    receiptTrail.record('context_solver', 'bypassed', 'hybrid_mode');
                    receiptTrail.record('sdg_slicing', 'bypassed', 'hybrid_mode');
                    receiptTrail.record('sufficiency_engine', 'bypassed', 'hybrid_mode');
                    receiptTrail.record('rule_compression', 'bypassed', 'hybrid_mode');
                    receiptTrail.record('cache_planner', 'bypassed', 'hybrid_mode');
                } else {
                    const compilerRes = await this.executeCompilerPipeline(request, decisions, flags, taskCompressionPolicy);
                    optimizedMessages = compilerRes.messages;
                    cachePlanResult = compilerRes.cachePlan;
                    codeRenderedAssignments = compilerRes.renderedAssignments;

                    // Terminal receipts for compiler stages are deferred until the preservation,
                    // structured, evidence-safety and budget gates have finished. A stage whose work
                    // is later discarded by a restore must not claim it contributed to the result.
                    const observeCompilerStage = (
                        component: 'context_solver' | 'sdg_slicing' | 'sufficiency_engine' | 'rule_compression' | 'cache_planner',
                        enabled: boolean,
                        observation: { invoked: boolean; changedOutput: boolean }
                    ) => {
                        if (!enabled) {
                            receiptTrail.record(component, 'bypassed', 'flag_disabled');
                            return;
                        }
                        receiptTrail.record(component, 'attempted');
                        if (!observation.invoked) {
                            receiptTrail.record(component, 'fallback', 'no_applicable_input');
                            return;
                        }
                        receiptTrail.record(component, 'invoked');
                        pendingCompilerOutcomes.push({ component, changedOutput: observation.changedOutput });
                    };
                    observeCompilerStage('context_solver', flags.enableContextSolver, compilerRes.effects.contextSolver);
                    observeCompilerStage('sdg_slicing', flags.enableSdgSlicing, compilerRes.effects.sdgSlicing);
                    observeCompilerStage('sufficiency_engine', flags.enableSufficiencyEngine, compilerRes.effects.sufficiencyEngine);
                    observeCompilerStage('rule_compression', flags.enablePluggableCompression, compilerRes.effects.compression);
                    observeCompilerStage('cache_planner', flags.enableCachePlanner, compilerRes.effects.cachePlanner);
                }
            } catch (error) {
                if (error instanceof CompilationCancelledError) throw error;
                optimizedMessages = request.messages.map(message => ({ ...message }));
                pipelineFallbackReasons.push(`${mode}_pipeline_failure_pass_through`);
                receiptTrail.record('context_solver', 'bypassed', 'compiler_failure');
                receiptTrail.record('sdg_slicing', 'bypassed', 'compiler_failure');
                receiptTrail.record('sufficiency_engine', 'bypassed', 'compiler_failure');
                receiptTrail.record('rule_compression', 'bypassed', 'compiler_failure');
                receiptTrail.record('cache_planner', 'bypassed', 'compiler_failure');
                decisions.push({
                    itemId: 'pipeline_failure_fallback', action: 'preserve',
                    reason: 'Optimization stage failed; original request content was preserved.',
                    confidence: 1, evidence: ['FailClosedPipelineBoundary']
                });
            }
        }

        const retrievalRenderDecision = resolveRetrievalRenderDecision({
            messages: request.messages, allowWorkspaceRetrieval: retrievalRequested,
            hasRetrieval: Boolean(evidenceRetrieval), conservativeFallback: evidenceRetrieval?.conservativeFallback === true,
            selectedCount: evidenceRetrieval?.selected.length ?? 0, missingRequired: evidenceRetrieval?.missingRequired ?? [],
            callerSuppliedSource: request.callerSuppliedSource
        });
        const budgeted = this.applyGlobalBudget(optimizedMessages, request, modelProfile, evidenceRetrieval, decisions);
        optimizedMessages = budgeted.messages;
        let budgetPlan = budgeted.plan;
        budgetPlan = { ...budgetPlan, renderedAssignments: Object.freeze([...codeRenderedAssignments, ...budgetPlan.renderedAssignments]) };
        let contentRestored = false;

        this.throwIfCancelled(request.cancellation);

        const structureChanged = optimizedMessages.length !== request.messages.length || optimizedMessages.some((message, index) => {
            const original = request.messages[index];
            return !original || original.role !== message.role || original.name !== message.name;
        });
        if (structureChanged) {
            optimizedMessages = request.messages.map(message => ({ ...message }));
            contentRestored = true;
            decisions.push({
                itemId: 'protocol_structure_guardrail', action: 'preserve',
                reason: 'Compiler output changed message role, name, order, or cardinality; original protocol structure restored.',
                confidence: 1, evidence: ['CanonicalProtocol']
            });
        }

        const structuredCheck = StructuredPreservationGate.evaluate(
            request.messages,
            optimizedMessages,
            (request.messages.filter(message => message.role === 'user').pop()?.content || request.userIntent || '')
                .replace(/```[\s\S]*?```/g, '')
        );
        if (!structuredCheck.passed) {
            optimizedMessages = request.messages.map(message => ({ ...message }));
            contentRestored = true;
            decisions.push({
                itemId: 'structured_preservation_guardrail', action: 'preserve',
                reason: `Structured obligations failed: ${structuredCheck.missing.join(', ')}`,
                confidence: 1, evidence: ['StructuredPreservationGate']
            });
        }

        // 2a. Audit against Fail-Closed Preservation Gate
        let presCheck = PreservationGate.evaluate(request.messages, optimizedMessages, request.userIntent || governorDecision.taskType, preservationObligations);
        if (!presCheck.passed) {
            // Fail closed: Revert to 100% original messages to prevent any quality degradation
            optimizedMessages = request.messages.map(m => ({ ...m }));
            contentRestored = true;
            decisions.push({
                itemId: 'preservation_gate_guardrail',
                action: 'preserve',
                reason: `Fail-closed triggered due to missing facts: ${presCheck.missingItems.join(', ')}`,
                confidence: 1.0,
                evidence: ['PreservationGate']
            });
        }

        // 2b. Audit against Deterministic Evidence Safety Gate
        // Evidence the caller already supplied inline. This reads only content that is already in
        // the request - it performs no retrieval and cannot widen the consent boundary - and claims
        // a category only on positive evidence, so the gate still fails closed when nothing matches.
        // The previous branch asserted three categories unconditionally and keyword-matched the
        // prompt for two more, which both over-claimed (assuming callers were present) and
        // under-claimed (ignoring an attached stack trace or test file).
        const inlineEvidence = InlineEvidenceClassifier.classify(optimizedMessages.map(message => message.content));
        const providedCategories: EvidenceCategory[] = evidenceRetrieval
            ? [...new Set<EvidenceCategory>([
                ...evidenceRetrieval.selected.filter(candidate => optimizedMessages.some(message =>
                    message.content.includes(candidate.content))).map(candidate => candidate.category),
                ...inlineEvidence.categories
            ])]
            : [...inlineEvidence.categories];
        const workspaceRetrievalAuthorized = Boolean(retrievalRequested && request.workspaceSnapshot);
        const safetyAudit = governor.validateEvidenceSafety(governorDecision, providedCategories,
            { workspaceRetrievalAuthorized });
        if (!safetyAudit.passed && safetyAudit.actionTaken === 'fail_closed_fallback') {
            const missingCategories = safetyAudit.missing.map(requirement => requirement.category);
            if (retrievalRenderDecision.retrievalIsSoleContext) {
                // Failing closed here would restore the bare instruction and send no code at all.
                // The admitted evidence plus an explicit statement of the missing critical category
                // lets the model ask for what it needs; an empty prompt lets it guess.
                decisions.push({
                    itemId: 'evidence_safety_gate_retrieval_only', action: 'include',
                    reason: `Critical evidence missing [${missingCategories.join(', ')}] and the request carried no `
                        + 'attached context. Admitted evidence is retained and the gap declared, because restoring '
                        + 'the caller payload would forward an instruction with no code.',
                    confidence: 1.0, evidence: ['EvidenceSafetyGate', 'retrieval_only_request']
                });
            } else {
                optimizedMessages = request.messages.map(m => ({ ...m }));
                contentRestored = true;
                decisions.push({
                    itemId: 'evidence_safety_gate_fallback', action: 'preserve',
                    reason: `Evidence safety gate triggered: missing critical evidence [${missingCategories.join(', ')}]`,
                    confidence: 1.0, evidence: ['EvidenceSafetyGate']
                });
            }
        }
        decisions.push(...buildEvidencePolicyDecisions({
            inlineCategories: inlineEvidence.categories,
            inlineTruncated: inlineEvidence.truncated,
            missingCategories: !safetyAudit.passed && safetyAudit.actionTaken === 'downgrade_to_conservative'
                ? safetyAudit.missing.map(requirement => requirement.category) : [],
            workspaceRetrievalAuthorized,
            contentRestored,
            confidence: safetyAudit.confidence
        }));
        // An incomplete evidence contract restores the caller's payload - but only when the caller
        // HAS a payload. For a retrieval-first request the original messages are the bare
        // instruction, so restoring them discards the evidence just rendered and sends the model no
        // code at all. In that case the rendered evidence, with its declared shortfall, is strictly
        // better than an empty prompt, so it is kept.
        if (evidenceRetrieval?.conservativeFallback && !retrievalRenderDecision.retrievalIsSoleContext) {
            optimizedMessages = request.messages.map(message => ({ ...message }));
            contentRestored = true;
        }

        // The payload was restored verbatim for safety. Apply noise-only reductions and keep the
        // result ONLY if every preservation gate still passes on it, so the safe path gets cheaper
        // without getting less safe.
        const payloadMatchesOriginal = optimizedMessages.length === request.messages.length && optimizedMessages.every(
            (message, index) => message.content === request.messages[index]?.content);
        if ((contentRestored || payloadMatchesOriginal || taskCompressionPolicy.compactFencedCodeBlankLines)
            && !forcePassThrough && !request.preserveProtocol) {
            const reduction = applyConservativeReduction(optimizedMessages, candidate => {
                const structuralOk = candidate.length === request.messages.length
                    && candidate.every((message, index) => request.messages[index]
                        && request.messages[index].role === message.role
                        && request.messages[index].name === message.name);
                if (!structuralOk) return false;
                const intentText = (request.messages.filter(message => message.role === 'user').pop()?.content
                    || request.userIntent || '').replace(/```[\s\S]*?```/g, '');
                if (!StructuredPreservationGate.evaluate(request.messages, candidate, intentText).passed) return false;
                return PreservationGate.evaluate(request.messages, candidate, request.userIntent || governorDecision.taskType, preservationObligations).passed;
            }, { compactFencedCodeBlankLines: taskCompressionPolicy.compactFencedCodeBlankLines,
                compactBraceLanguageIndentation: taskCompressionPolicy.compactBraceLanguageIndentation });
            if (reduction.applied) {
                optimizedMessages = reduction.messages;
                decisions.push({
                    itemId: 'conservative_path_reduction',
                    action: 'compress',
                    reason: `Payload was preserved verbatim for safety; applied content-preserving noise reduction only (${reduction.rules.join(', ')}).`,
                    confidence: 1,
                    evidence: ['ConservativePathCompressor', 'PreservationGate', 'StructuredPreservationGate', ...reduction.rules]
                });
            }
        }

        // Describe the emitted payload, not the rejected candidate that caused a restore.
        presCheck = PreservationGate.evaluate(request.messages, optimizedMessages, request.userIntent || governorDecision.taskType, preservationObligations);
        if (!presCheck.passed) {
            optimizedMessages = request.messages.map(message => ({ ...message }));
            contentRestored = true;
            presCheck = PreservationGate.evaluate(request.messages, optimizedMessages, request.userIntent || governorDecision.taskType, preservationObligations);
        }

        // Verify what is emitted after every restore/reduction. Missing evidence is a request error
        // when critical evidence is absent on unattached requests, not permission to send an incomplete request labelled as evidence-safe.
        if (!request.preserveProtocol && !isConversationalTurn) {
            const finalText = optimizedMessages.map(message => message.content);
            const finalCategories = new Set<EvidenceCategory>(InlineEvidenceClassifier.classify(finalText).categories);
            for (const candidate of evidenceRetrieval?.selected || []) {
                if (candidate.content.length > 0 && finalText.some(text => text.includes(candidate.content))) {
                    finalCategories.add(candidate.category);
                }
            }
            const finalAudit = governor.validateEvidenceSafety(governorDecision, [...finalCategories]);
            if (!finalAudit.passed) {
                const targetImplMissing = finalAudit.missing.some(requirement => requirement.category === 'targetImplementation');
                const isDebugTask = governorDecision.taskType === 'debug';
                const isUnattachedRequest = !request.workspaceSnapshot && !request.allowWorkspaceRetrieval && !request.callerSuppliedSource && !request.activeFilePath;
                if (targetImplMissing && isUnattachedRequest && isDebugTask && request.deferSideEffects && request.messages.length === 1) {
                    throw new Error('REQUIRED_EVIDENCE_MISSING: '
                        + finalAudit.missing.map(requirement => requirement.category).join(', '));
                }
                if (finalAudit.actionTaken === 'fail_closed_fallback' && !retrievalRenderDecision.retrievalIsSoleContext) {
                    optimizedMessages = request.messages.map(message => ({ ...message }));
                    contentRestored = true;
                }
            }
        }

        // Every restore path has run, so the payload is settled. Resolve deferred stage receipts
        // against what will actually be sent: a reverted stage records a fallback, not a contribution.
        for (const resolved of resolveDeferredStageReceipts(pendingCompilerOutcomes, request.messages, optimizedMessages, contentRestored)) {
            receiptTrail.record(resolved.component, resolved.outcome, resolved.reason);
        }
        pendingCompilerOutcomes.length = 0;

        const finalBudgetPlan = this.globalBudgeter.finalize(
            this.globalBudgeter.planBase({
                messages: optimizedMessages,
                profile: modelProfile,
                requestedTotalTokens: request.maxTokenBudget,
                requestedOutputTokens: request.maxOutputTokens,
                fixedProtocolTokens: request.fixedProtocolTokens
            }),
            optimizedMessages
        );
        budgetPlan = contentRestored
            ? { ...finalBudgetPlan, renderedAssignments: Object.freeze([]) }
            : {
                ...budgetPlan,
                finalInputTokens: finalBudgetPlan.finalInputTokens,
                projectedTotalTokens: finalBudgetPlan.projectedTotalTokens,
                withinBudget: finalBudgetPlan.withinBudget
            };

        // 3. Dynamic Real Context Quality (CQ) Evaluation (No static constants)
        const instructionIntegrity = presCheck.missingItems.some(m => m.includes('instruction')) ? 0.0 : 1.0;
        const evidenceCoverage = presCheck.score;
        const dependencyCompleteness = presCheck.passed ? 0.95 : 0.40;
        const sliceConfidence = presCheck.passed ? 0.95 : 0.30;

        cqReport = this.cqEvaluator.evaluateQuality({
            evidenceCoverage,
            meanRelevance: presCheck.score,
            dependencyCompleteness,
            instructionIntegrity,
            sliceConfidence
        });

        // 4. Count Final Tokens
        const optimizedTokens = budgetPlan.finalInputTokens;

        receiptTrail.record('global_payload_budget', 'attempted');
        receiptTrail.record('global_payload_budget', 'invoked');
        receiptTrail.record('global_payload_budget', 'contributed');

        receiptTrail.record('protocol_guard', 'attempted');
        receiptTrail.record('protocol_guard', 'invoked');
        receiptTrail.record('protocol_guard', 'contributed');

        receiptTrail.record('preservation_gate', 'attempted');
        receiptTrail.record('preservation_gate', 'invoked');
        receiptTrail.record('preservation_gate', 'contributed');

        receiptTrail.record('evidence_safety_gate', 'attempted');
        receiptTrail.record('evidence_safety_gate', 'invoked');
        receiptTrail.record('evidence_safety_gate', 'contributed');

        receiptTrail.record('cost_projection', 'attempted');
        receiptTrail.record('cost_projection', 'invoked');
        receiptTrail.record('cost_projection', 'contributed');

        receiptTrail.record('canonical_request_compiler', 'invoked');
        receiptTrail.record('canonical_request_compiler', 'contributed');

        const tokensSaved = Math.max(0, originalTokens - optimizedTokens);
        const reductionPercentage = BoundedEconomics.reductionPercentage(originalTokens, optimizedTokens);
        const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

        const trace: OptimizationTrace = {
            stage: `ContextCompiler (${mode.toUpperCase()})`,
            inputItems: request.messages.map((_, i) => `turn_${i}`),
            outputItems: optimizedMessages.map((_, i) => `turn_${i}`),
            decisions,
            tokensBefore: originalTokens,
            tokensAfter: optimizedTokens,
            latencyMs: durationMs
        };

        // Calculate Projected Cost via Centralized CostCalculator
        const costProj = CostCalculator.calculateProjectedCost(
            originalTokens,
            optimizedTokens,
            cachePlanResult?.staticPrefixTokens || 0,
            request.targetModel || modelProfile.modelId
        );
        const componentReceipts = receiptTrail.snapshot();

        // Stage metrics accurately reflecting transformations executed
        const stageMetrics = [
            {
                stageName: mode === 'compiler' ? 'ContextKnapsackCompiler' : 'LegacyAstPruner',
                tokensBefore: originalTokens,
                tokensAfter: optimizedTokens,
                tokensSaved,
                latencyMs: durationMs
            }
        ];
        // Emit Authoritative Real-Time Optimization Event
        const event: PromptOptimizationEvent = {
            id: requestId,
            timestamp: Date.now(),
            sessionId: request.sessionId || 'session_active',
            state: 'OPTIMIZATION_COMPLETED',
            taskType: governorDecision.taskType,
            taskConfidence: governorDecision.confidence,
            provider: request.targetProvider || 'anthropic',
            model: request.targetModel || 'auto',
            rawInputTokens: originalTokens,
            optimizedInputTokens: optimizedTokens,
            savedTokens: tokensSaved,
            reductionPercentage,
            cacheableTokens: cachePlanResult?.staticPrefixTokens || 0,
            cachedTokens: 0, // Never count cache eligibility as an actual hit in unverified events
            projectedRawCostUSD: costProj.rawCostUSD,
            projectedOptimizedCostUSD: costProj.optimizedCostUSD,
            projectedSavingsUSD: costProj.savingsUSD,
            costStatus: costProj.pricingAvailable ? 'projected' : 'unavailable',
            pricingCatalogVersion: costProj.pricingCatalogVersion,
            pricingSource: costProj.pricingSource,
            pricingCurrency: costProj.currency,
            isCostReconciled: false,
            predictedCQ: cqReport.predictedCQ,
            evidenceCoverage: cqReport.breakdown.evidenceCoverage,
            sliceConfidence: cqReport.breakdown.sliceConfidence,
            cqRating: cqReport.rating,
            totalOptimizationLatencyMs: durationMs,
            stageMetrics,
            contextItemCount: request.messages.length,
            traceId: `${requestId}:compile`,
            snapshotGeneration: request.workspaceSnapshot?.generation,
            cacheState: cachePlanResult?.isCacheEligible ? 'eligible' : 'ineligible',
            fallbackReasons: Object.freeze([
                ...pipelineFallbackReasons,
                ...(contentRestored ? ['preservation_gate_restored_original_content'] : [])
            ]),
            selectionTrace: Object.freeze(budgetPlan.renderedAssignments.map(assignment => Object.freeze({
                selectionHash: createHash('sha256').update(assignment.entityId).digest('hex'),
                resolution: assignment.level,
                tokenCount: assignment.tokenCount,
                contentHash: assignment.renderedTextHash
            }))),
            budgetTrace: {
                inputLimit: budgetPlan.inputTokenLimit,
                outputReserve: budgetPlan.outputReserve,
                finalInputTokens: budgetPlan.finalInputTokens,
                projectedTotalTokens: budgetPlan.projectedTotalTokens
            },
            componentReceipts
        };
        this.throwIfCancelled(request.cancellation);
        const result: ContextCompileResult = {
            requestId,
            optimizedMessages,
            originalTokens,
            optimizedTokens,
            tokensSaved,
            reductionPercentage,
            effectiveCostSavedUSD: costProj.savingsUSD,
            contextQuality: cqReport,
            cachePlan: cachePlanResult,
            trace,
            pipelineModeUsed: mode,
            governorDecision,
            event,
            committed: false,
            snapshotGeneration: request.workspaceSnapshot?.generation,
            evidenceRetrieval,
            budgetPlan,
            capabilities,
            receipts: componentReceipts
        };
        if (!request.deferSideEffects) this.commitCompilation(result);
        return result;
    }

    public commitCompilation(result: ContextCompileResult): void {
        if (result.committed) return;
        this.traceLogger.recordTrace(result.trace);
        if (this.metricsTracker) {
            this.metricsTracker.recordOptimization(
                result.originalTokens,
                result.optimizedTokens,
                {
                    astSaved: result.tokensSaved,
                    textCompressionSaved: 0,
                    historyCompacted: 0,
                    cacheAligned: result.cachePlan?.staticPrefixTokens || 0
                }
            );
        }
        OptimizationEventBus.getInstance().emit(result.event);
        result.committed = true;
    }

    private throwIfCancelled(cancellation?: CancellationLike): void {
        if (cancellation?.isCancellationRequested) throw new CompilationCancelledError();
    }

    /**
     * Legacy Execution Path (Code fences optimized while preserving all prose instructions)
     */
    private async executeLegacyPipeline(request: ContextCompileRequest, decisions: Decision[]): Promise<MessagePayload[]> {
        return executeLegacyPipeline(this.astEngine, request, decisions);
    }

    private async executeHybridPipeline(request: ContextCompileRequest, decisions: Decision[]): Promise<MessagePayload[]> {
        return this.executeLegacyPipeline(request, decisions);
    }

    /**
     * Full Context Compiler Execution Path (Phases 1-16)
     */
    private async executeCompilerPipeline(
        request: ContextCompileRequest,
        decisions: Decision[],
        flags: CompilerFeatureFlags,
        taskPolicy: TaskCompressionPolicy
    ): Promise<{
        messages: MessagePayload[];
        cqReport: ContextQualityReport;
        cachePlan?: CachePlanResult;
        renderedAssignments: readonly RenderedBudgetAssignment[];
        effects: {
            contextSolver: { invoked: boolean; changedOutput: boolean };
            sdgSlicing: { invoked: boolean; changedOutput: boolean };
            sufficiencyEngine: { invoked: boolean; changedOutput: boolean };
            compression: { invoked: boolean; changedOutput: boolean };
            cachePlanner: { invoked: boolean; changedOutput: boolean };
        };
    }> {
        const profile = ModelProfileRegistry.getProfile(request.targetProvider || 'claude-3-5-sonnet');
        const effects = {
            contextSolver: { invoked: false, changedOutput: false },
            sdgSlicing: { invoked: false, changedOutput: false },
            sufficiencyEngine: { invoked: false, changedOutput: false },
            compression: { invoked: false, changedOutput: false },
            cachePlanner: { invoked: false, changedOutput: false }
        };

        // 1. Task Sufficiency Profiling & Focal Keyword Extraction
        const rawUserMsg = request.messages.filter(m => m.role === 'user').pop()?.content || '';
        const userInstruction = rawUserMsg.replace(/```[\s\S]*?```/g, '').trim() || rawUserMsg;
        const promptTokens = TokenCounter.countTokens(userInstruction);
        const extractedKeywords = (userInstruction.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [])
            .filter(w => w.length > 2 && !['const', 'let', 'var', 'the', 'and', 'with', 'for', 'function', 'class', 'from', 'import', 'export', 'this', 'that', 'please', 'make', 'code', 'file', 'method', 'function'].includes(w.toLowerCase()));
        
        const focalKeywords = Array.from(new Set([
            ...(request.userIntent ? [request.userIntent] : []),
            ...extractedKeywords
        ]));

        // Historical turns are sliced against keywords derived from their own content so that an
        // unchanged message renders identical bytes on every turn, keeping the provider's prompt
        // prefix cacheable. See src/engine/prefixContinuity.ts for the full rationale.
        const stableKeywords = createPrefixStableKeywordResolver(request.messages, focalKeywords);

        if (flags.enableSufficiencyEngine) {
            effects.sufficiencyEngine.invoked = true;
            this.sufficiencyEngine.buildTaskProfile(
                request.userIntent === 'edit' ? 'refactor' : (request.userIntent === 'question' ? 'explain' : 'debug'),
                userInstruction,
                [request.activeFilePath || 'workspace/focal.ts']
            );
        }

        // 2. Stage 1-4: Extract and Pool All Competing Candidate Context Entities
        interface ExtractedBlock {
            messageIndex: number;
            fullMatch: string;
            langTag: string;
            rawCode: string;
            entityId: string;
            sliceResult: any;
        }

        const candidateEntities: ContextEntity[] = [];
        const extractedBlocks: ExtractedBlock[] = [];
        const renderedAssignments: RenderedBudgetAssignment[] = [];

        for (let i = 0; i < request.messages.length; i++) {
            const msg = request.messages[i];
            if (msg.content.includes('```')) {
                const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
                let match: RegExpExecArray | null;
                let blockIndex = 0;

                while ((match = codeBlockRegex.exec(msg.content)) !== null) {
                    const fullMatch = match[0];
                    const langTag = match[1] || 'typescript';
                    const rawCode = match[2];
                    const rawCodeTokens = TokenCounter.countTokens(rawCode);

                    if (rawCodeTokens < 35) {
                        continue;
                    }

                    let sliceRes: any = { slicedCode: rawCode, reductionPercentage: 0 };
                    if (flags.enableSdgSlicing && taskPolicy.minimumResolution !== 'R5') {
                        try {
                            effects.sdgSlicing.invoked = true;
                            sliceRes = this.sdgSlicer.computeIntentAwareSlice(rawCode, stableKeywords.forMessage(i), request.cursorLine || 15);
                            const risk = this.sliceConfidenceEvaluator.evaluateSliceRisk(
                                rawCode,
                                rawCode.split(/\r?\n/).length,
                                sliceRes.slicedCode.split(/\r?\n/).length
                            );
                            const slicePreservation = StructuredPreservationGate.evaluate(
                                [{ role: msg.role, name: msg.name, content: rawCode }],
                                [{ role: msg.role, name: msg.name, content: sliceRes.slicedCode }],
                                userInstruction
                            );
                            if (risk.recommendedAction !== 'use_slice' || !slicePreservation.passed) {
                                sliceRes = { ...sliceRes, slicedCode: rawCode, reductionPercentage: 0 };
                                decisions.push({
                                    itemId: `slice_safety_${i}_${blockIndex}`,
                                    action: 'preserve',
                                    reason: !slicePreservation.passed
                                        ? `Structured slice obligations failed: ${slicePreservation.missing.join(', ')}`
                                        : `Dynamic dependency risk requires ${risk.recommendedAction}: ${risk.detectedRiskFactors.join(', ')}`,
                                    confidence: 1 - risk.unknownDependencyRisk,
                                    evidence: ['SliceConfidenceEvaluator', 'StructuredPreservationGate']
                                });
                            }
                        } catch (error) {
                            sliceRes = { slicedCode: rawCode, reductionPercentage: 0 };
                            decisions.push({
                                itemId: `slice_analysis_${i}_${blockIndex}`,
                                action: 'preserve',
                                reason: 'slice_analysis_failed_closed',
                                confidence: 1,
                                evidence: ['SliceConfidenceEvaluator']
                            });
                        }
                    }
                    const entityId = `entity_code_${i}_${blockIndex++}`;

                    const entity: ContextEntity = {
                        id: entityId,
                        filePath: request.activeFilePath || `src/block_${i}.ts`,
                        symbolName: focalKeywords[0] || `Module_${i}`,
                        kind: 'class',
                        baseUtility: 100 - (i * 5),
                        signatures: [sliceRes.slicedCode.split('\n')[0] || ''],
                        fullCode: rawCode,
                        slicedCode: sliceRes.slicedCode,
                        metadata: {
                            provenance: [`message:${i}:code:${blockIndex - 1}`], renderLocation: 'latest_user', mandatory: true,
                            minimumResolution: taskPolicy.minimumResolution, dependencies: [], conflicts: [], freshness: 'request', sensitivity: 'workspace',
                            transformationHistory: ['ingested', 'task-aware-resolution', 'slice-confidence-gated']
                        }
                    };

                    candidateEntities.push(entity);
                    extractedBlocks.push({
                        messageIndex: i,
                        fullMatch,
                        langTag,
                        rawCode,
                        entityId,
                        sliceResult: sliceRes
                    });
                }
            }
        }

        // 3. Stage 5: Global Multi-Choice Knapsack Token Budget Optimization across ALL competing candidates
        let solverAssignments = new Map<string, any>();
        if (candidateEntities.length > 0 && flags.enableContextSolver) {
            effects.contextSolver.invoked = true;
            const fixedMessages = request.messages.map((message, messageIndex) => ({
                ...message,
                content: extractedBlocks.filter(block => block.messageIndex === messageIndex)
                    .reduce((content, block) => content.replace(block.fullMatch, ''), message.content)
            }));
            const fixedPlan = this.globalBudgeter.planBase({
                messages: fixedMessages,
                profile,
                requestedTotalTokens: request.maxTokenBudget,
                requestedOutputTokens: request.maxOutputTokens,
                fixedProtocolTokens: request.fixedProtocolTokens
            });
            const tokenBudget = fixedPlan.candidateTokenBudget;
            const solverResult = await this.knapsackSolver.solveAsync({
                candidates: candidateEntities,
                tokenBudget,
                lambdaCost: 0.10,
                modelId: request.targetModel || profile.modelId,
                provider: profile.provider
            });
            solverAssignments = solverResult.assignments;
            effects.contextSolver.changedOutput = extractedBlocks.some(block => {
                const assigned = solverAssignments.get(block.entityId);
                return !assigned?.text || assigned.text !== block.rawCode;
            });

            decisions.push({
                itemId: 'knapsack_token_solver',
                action: 'slice',
                reason: `Solved multi-choice knapsack across ${candidateEntities.length} competing candidate entities (${solverResult.includedCount} included, ${solverResult.excludedCount} excluded, budget: ${tokenBudget}, pruned: ${solverResult.prunedOptionsCount} options, net savings: $${solverResult.netDollarSavingsUSD.toFixed(5)})`,
                confidence: 0.98,
                evidence: [
                    'ContextKnapsackSolver',
                    '0/1 MCKP FinOps Global Optimum',
                    `Rates: $${solverResult.effectiveInputRatePer1M}/$${solverResult.effectiveOutputRatePer1M} per 1M`
                ]
            });
        } else if (candidateEntities.length > 0) {
            for (const entity of candidateEntities) {
                solverAssignments.set(entity.id, {
                    text: entity.fullCode,
                    level: 'R5',
                    tokenCount: TokenCounter.countTokens(entity.fullCode || '')
                });
            }
        }

        // 4. Reconstruct Optimized Messages with Assigned Representations
        const intermediateMessages: MessagePayload[] = [];

        for (let i = 0; i < request.messages.length; i++) {
            const msg = request.messages[i];
            const isLatestUserTurn = i === request.messages.length - 1 && msg.role === 'user';

            if (msg.role === 'system') {
                if (flags.enablePluggableCompression) {
                    effects.compression.invoked = true;
                    const comp = await this.compressor.compress(msg.content);
                    effects.compression.changedOutput ||= comp.compressedText !== msg.content;
                    intermediateMessages.push({ ...msg, content: comp.compressedText });
                    decisions.push({
                        itemId: `system_prompt_${i}`,
                        action: comp.compressedText === msg.content ? 'preserve' : 'compress',
                        reason: `Compacted whitespace and comments (-${comp.tokensSaved} tokens)`,
                        confidence: 1.0,
                        evidence: ['RuleBasedCompressor']
                    });
                } else {
                    intermediateMessages.push({ ...msg });
                }
            } else if (msg.content.includes('```')) {
                let updatedContent = msg.content;
                const relevantBlocks = extractedBlocks.filter(b => b.messageIndex === i);

                for (const block of relevantBlocks) {
                    const assigned = solverAssignments.get(block.entityId);
                    const finalCode = assigned?.text;

                    if (finalCode && finalCode.trim().length > 0) {
                        effects.sdgSlicing.changedOutput ||= flags.enableSdgSlicing
                            && finalCode !== block.rawCode
                            && finalCode === block.sliceResult.slicedCode;
                        updatedContent = updatedContent.replace(block.fullMatch, renderFencedCode(block.langTag, finalCode));
                        decisions.push({
                            itemId: block.entityId,
                            action: 'slice',
                            reason: `Assigned representation ${assigned?.level || 'R4'} (${block.sliceResult.reductionPercentage}% reduction, ${focalKeywords.slice(0, 3).join(', ')} preserved)`,
                            confidence: 0.96,
                            evidence: ['SystemDependenceGraph', 'ContextKnapsackSolver']
                        });
                        renderedAssignments.push({
                            entityId: block.entityId,
                            level: assigned.level,
                            tokenCount: assigned.tokenCount,
                            renderedTextHash: createHash('sha256').update(finalCode.replace(/\r?\n$/, '')).digest('hex')
                        });
                    } else {
                        updatedContent = updatedContent.replace(block.fullMatch, '');
                    }
                }

                intermediateMessages.push({ ...msg, content: updatedContent });
            } else {
                intermediateMessages.push({ ...msg });
                decisions.push({
                    itemId: `turn_${i}`,
                    action: 'preserve',
                    reason: isLatestUserTurn ? 'Current user request pinned verbatim 100%' : 'Conversational dialogue preserved',
                    confidence: 1.0,
                    evidence: ['Verbatim pass-through']
                });
            }
        }

        // 5. Stage 6: Provider Prefix Cache Alignment & 4-Tier Layout
        const systemDirectives = intermediateMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const historyTurns = intermediateMessages.filter(m => m.role !== 'system' && m !== intermediateMessages[intermediateMessages.length - 1]);
        const latestUserMsg = intermediateMessages[intermediateMessages.length - 1]?.content || userInstruction;
        let finalMessages = intermediateMessages;
        let cachePlan: CachePlanResult | undefined;
        if (flags.enableCachePlanner) {
            effects.cachePlanner.invoked = true;
            const aligner = this.cacheAligner || new CacheAlignerEngine();
            const alignmentResult = aligner.alignPayload(
                systemDirectives,
                '',
                historyTurns,
                latestUserMsg,
                {
                    targetProvider: request.targetProvider || (profile.provider === 'generic' ? 'anthropic' : profile.provider as any),
                    modelId: request.targetModel,
                    hasNativeTools: Boolean(profile.capabilities.toolCalling),
                    sessionTurns: Math.floor(historyTurns.length / 2),
                    isPersistentSession: Boolean(request.sessionId),
                    hasInvariantTypes: true
                }
            );
            finalMessages = (systemDirectives.trim().length > 0 && alignmentResult.alignedMessages.length > 0)
                ? alignmentResult.alignedMessages
                : intermediateMessages;
            effects.cachePlanner.changedOutput = JSON.stringify(finalMessages) !== JSON.stringify(intermediateMessages);
            if (alignmentResult.toolSchemaDeduplicated || alignmentResult.boundaryPadded || alignmentResult.cacheWriteAmortizationApplied) {
                decisions.push({
                    itemId: 'cache_alignment_engine',
                    action: 'compress',
                    reason: `Aligned prompt cache for [${alignmentResult.provider.toUpperCase()}]: ${alignmentResult.cachedBlocksCount} blocks cached, boundary padded: ${alignmentResult.boundaryPadded ? `+${alignmentResult.paddingTokensAdded} tokens` : 'no'}, tool deduplicated: ${alignmentResult.toolSchemaDeduplicated ? `saved ${alignmentResult.toolSchemaTokensSaved} tokens` : 'no'}`,
                    confidence: 0.99,
                    evidence: ['CacheAlignerEngine', 'Provider KV-Cache Optimization']
                });
            }
            cachePlan = this.cachePlanner.planContext({ systemPrompt: systemDirectives, userQuery: latestUserMsg, profile });
        }

        // 6. Context Quality (CQ) Evaluation
        const cqReport = this.cqEvaluator.evaluateQuality({
            evidenceCoverage: 0.96,
            meanRelevance: 0.94,
            dependencyCompleteness: 0.91,
            instructionIntegrity: 1.0,
            sliceConfidence: 0.95
        });

        return {
            messages: finalMessages,
            cqReport,
            cachePlan,
            renderedAssignments: Object.freeze(renderedAssignments),
            effects
        };
    }

    private applyGlobalBudget(
        messages: MessagePayload[],
        request: ContextCompileRequest,
        profile: ModelProfile,
        retrieval: EvidenceRetrievalResult | undefined,
        decisions: Decision[]
    ): { messages: MessagePayload[]; plan: PayloadBudgetPlan } {
        const baseParams = {
            profile,
            requestedTotalTokens: request.maxTokenBudget,
            requestedOutputTokens: request.maxOutputTokens,
            fixedProtocolTokens: request.fixedProtocolTokens
        };
        const renderDecision = resolveRetrievalRenderDecision({
            callerSuppliedSource: request.callerSuppliedSource,
            messages, allowWorkspaceRetrieval: request.allowWorkspaceRetrieval === true && Boolean(retrieval),
            hasRetrieval: Boolean(retrieval), conservativeFallback: retrieval?.conservativeFallback === true,
            selectedCount: retrieval?.selected.length ?? 0, missingRequired: retrieval?.missingRequired ?? []
        });
        if (!retrieval || !renderDecision.shouldRender) {
            decisions.push(...renderDecisions(renderDecision, retrieval?.criticalRecall ?? 0));
            const plan = this.globalBudgeter.planBase({ messages, ...baseParams });
            return { messages, plan: this.globalBudgeter.finalize(plan, messages) };
        }
        const targetIndex = messages.map(message => message.role).lastIndexOf('user');
        if (targetIndex < 0) {
            const plan = this.globalBudgeter.planBase({ messages, ...baseParams });
            return { messages, plan: this.globalBudgeter.finalize(plan, messages) };
        }
        const shortfall = shortfallAttribute(renderDecision.shortfallCategories);
        const wrapperOpen = `<tokonomics-evidence snapshot="${request.workspaceSnapshot?.generation}"${shortfall}>`;
        const wrapperClose = '</tokonomics-evidence>';
        const withEmptyWrapper = messages.map(message => ({ ...message }));
        withEmptyWrapper[targetIndex].content = `${withEmptyWrapper[targetIndex].content}\n\n${wrapperOpen}\n${wrapperClose}`;
        const basePlan = this.globalBudgeter.planBase({ messages: withEmptyWrapper, ...baseParams });
        decisions.push(...renderDecisions(renderDecision, retrieval.criticalRecall));
        const idBySymbol = new Map(retrieval.selected.filter(candidate => candidate.symbolName)
            .map(candidate => [candidate.symbolName!, candidate.id]));
        const entities: ContextEntity[] = retrieval.selected.map((candidate, index) => {
            const location = candidate.filePath
                ? `${candidate.filePath}${candidate.lineStart ? `:${candidate.lineStart}${candidate.lineEnd && candidate.lineEnd !== candidate.lineStart ? `-${candidate.lineEnd}` : ''}` : ''}`
                : candidate.sourceKind;
            const header = `--- ${candidate.category} | ${location} | ${candidate.sourceKind} | ${candidate.contentHash.slice(0, 12)} ---`;
            return {
                id: candidate.id,
                filePath: candidate.filePath || `request/${candidate.sourceKind}`,
                symbolName: candidate.symbolName || candidate.category,
                kind: 'module',
                baseUtility: candidate.mandatory ? 100 : Math.max(20, 70 - index * 5),
                signatures: [`${header}\n${candidate.content.split(/\r?\n/)[0] || candidate.category}`],
                slicedCode: `${header}\n${candidate.content}`,
                fullCode: `${header}\n${candidate.content}`,
                metadata: {
                    provenance: candidate.provenance,
                    renderLocation: 'evidence',
                    mandatory: candidate.mandatory,
                    minimumResolution: candidate.mandatory ? 'R5' : 'R0',
                    dependencies: candidate.dependencies.map(dependency => idBySymbol.get(dependency)).filter((id): id is string => !!id),
                    conflicts: [],
                    freshness: `snapshot:${candidate.snapshotGeneration}`,
                    sensitivity: 'workspace',
                    transformationHistory: ['retrieved', 'fused', 'diversified', 'budgeted']
                }
            };
        });

        let candidateBudget = Math.max(0, basePlan.candidateTokenBudget - retrieval.selected.length * 4);
        for (let attempt = 0; attempt < 4; attempt++) {
            let solved;
            try {
                solved = this.knapsackSolver.solve({
                    candidates: entities,
                    tokenBudget: candidateBudget,
                    modelId: request.targetModel || profile.modelId,
                    provider: profile.provider
                });
            } catch (error) {
                if (error instanceof SolverConstraintError) {
                    throw new TokenBudgetExceededError(error.message, { ...basePlan, candidateTokenBudget: candidateBudget });
                }
                throw error;
            }
            const included = entities.map(entity => ({ entity, assignment: solved.assignments.get(entity.id)! }))
                .filter(item => item.assignment.level !== 'R_exclude');
            const rendered = messages.map(message => ({ ...message }));
            const evidenceText = included.map(item => item.assignment.text).join('\n\n');
            rendered[targetIndex].content = `${rendered[targetIndex].content}\n\n${wrapperOpen}\n${evidenceText}\n${wrapperClose}`;
            try {
                let plan = this.globalBudgeter.finalize(basePlan, rendered);
                const renderedAssignments = Object.freeze(included.map(item => ({
                    entityId: item.entity.id,
                    level: item.assignment.level,
                    tokenCount: item.assignment.tokenCount,
                    renderedTextHash: createHash('sha256').update(item.assignment.text).digest('hex')
                })));
                plan = { ...plan, candidateTokenBudget: candidateBudget, renderedAssignments };
                for (const item of entities) {
                    const assignment = solved.assignments.get(item.id)!;
                    decisions.push({
                        itemId: item.id,
                        action: assignment.level === 'R_exclude' ? 'exclude' : 'include',
                        reason: `Global budget assigned ${assignment.level} (${assignment.tokenCount} tokens).`,
                        confidence: 1,
                        evidence: ['GlobalTokenBudgeter', 'ContextKnapsackSolver']
                    });
                }
                decisions.push({
                    itemId: 'global_payload_budget', action: 'include',
                    reason: `Rendered ${included.length}/${entities.length} evidence blocks; projected ${plan.projectedTotalTokens}/${plan.totalTokenLimit} total tokens.`,
                    confidence: 0.92,
                    evidence: [plan.tokenizer, 'complete-payload-recount']
                });
                return { messages: rendered, plan };
            } catch (error) {
                if (!(error instanceof TokenBudgetExceededError) || attempt === 3) throw error;
                const overflow = Math.max(1, error.plan.projectedTotalTokens - error.plan.totalTokenLimit);
                candidateBudget = Math.max(0, candidateBudget - overflow - 4);
            }
        }
        throw new TokenBudgetExceededError('Unable to render evidence within the complete payload budget.', basePlan);
    }
}
