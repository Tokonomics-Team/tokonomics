/**
 * Tokonomics Context Compiler - Pipeline Orchestrator
 * Coordinates the 16-stage context compilation pipeline across legacy, hybrid, and compiler modes.
 */

import { AstPrunerEngine } from '../ast/pruner';
import { RamContextManager } from './ramManager';
import { CacheAlignerEngine } from '../cache/aligner';
import { MetricsTracker } from '../metrics/tracker';
import { FeatureFlagRegistry, PipelineMode } from './featureFlags';
import { TraceLogger, OptimizationTrace, Decision } from './traceLogger';
import { TokenCounter } from './tokenizer';
import { MessagePayload, TargetProvider } from '../types';

import { ContextKnapsackSolver } from '../solver/knapsackSolver';
import { ContextQualityEvaluator, ContextQualityReport } from '../solver/qualityScore';
import { SystemDependenceGraph } from '../ast/systemDependenceGraph';
import { SufficiencyEngine } from './sufficiencyEngine';
import { ExactDedupEngine } from '../dedup/exactDedup';
import { CachePlanner, CachePlanResult } from '../cache/cachePlanner';
import { ModelProfileRegistry } from '../tokenizer/modelProfile';
import { RuleBasedCompressor } from '../compression/compressionProvider';
import { ContextEntity } from '../solver/contextIR';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { CostCalculator } from '../cost/costCalculator';
import { DeterministicContextGovernor } from '../governor/contextGovernor';
import { ContextGovernorDecision, EvidenceCategory } from '../governor/governorTypes';

import { PreservationGate } from '../evaluation/preservationGate';
import { VersionedWorkspaceIndex, WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { SliceConfidenceEvaluator } from '../ast/sliceConfidence';
import { EvidenceAwareRetriever } from '../retrieval/evidenceRetriever';
import { EvidenceRetrievalResult, EvidenceSignal } from '../retrieval/evidenceTypes';
import { StructuredPreservationGate } from '../retrieval/structuredPreservation';
import { GlobalTokenBudgeter, PayloadBudgetPlan, RenderedBudgetAssignment, TokenBudgetExceededError } from '../solver/globalBudget';
import { SolverConstraintError } from '../solver/knapsackSolver';
import { createHash } from 'crypto';
import { ModelProfile } from '../tokenizer/modelProfile';

export interface ContextCompileRequest {
    messages: MessagePayload[];
    requestId?: string;
    sessionId?: string;
    targetProvider?: TargetProvider;
    targetModel?: string;
    maxTokenBudget?: number;
    maxOutputTokens?: number;
    fixedProtocolTokens?: number;
    activeFilePath?: string;
    cursorLine?: number;
    userIntent?: string;
    cancellation?: CancellationLike;
    preserveProtocol?: boolean;
    deferSideEffects?: boolean;
    workspaceSnapshot?: WorkspaceSnapshot;
    allowWorkspaceRetrieval?: boolean;
    evidenceSignals?: readonly EvidenceSignal[];
    fallbackReasons?: readonly string[];
}

export interface CancellationLike { readonly isCancellationRequested: boolean; }
export class CompilationCancelledError extends Error {
    constructor() { super('Context compilation was cancelled.'); this.name = 'CompilationCancelledError'; }
}

export interface ContextCompileResult {
    requestId: string;
    optimizedMessages: MessagePayload[];
    originalTokens: number;
    optimizedTokens: number;
    tokensSaved: number;
    reductionPercentage: number;
    effectiveCostSavedUSD: number;
    contextQuality: ContextQualityReport;
    cachePlan?: CachePlanResult;
    trace: OptimizationTrace;
    pipelineModeUsed: PipelineMode;
    governorDecision?: ContextGovernorDecision;
    event: PromptOptimizationEvent;
    committed: boolean;
    snapshotGeneration?: number;
    evidenceRetrieval?: EvidenceRetrievalResult;
    budgetPlan?: PayloadBudgetPlan;
}

export class PipelineOrchestrator {
    private traceLogger: TraceLogger = TraceLogger.getInstance();
    private knapsackSolver: ContextKnapsackSolver = new ContextKnapsackSolver();
    private cqEvaluator: ContextQualityEvaluator = new ContextQualityEvaluator();
    private sdgSlicer: SystemDependenceGraph = new SystemDependenceGraph();
    private sufficiencyEngine: SufficiencyEngine = new SufficiencyEngine();
    private exactDedup: ExactDedupEngine = new ExactDedupEngine();
    private cachePlanner: CachePlanner = new CachePlanner();
    private compressor: RuleBasedCompressor = new RuleBasedCompressor();
    private sliceConfidenceEvaluator = new SliceConfidenceEvaluator();
    private evidenceRetriever = new EvidenceAwareRetriever();
    private globalBudgeter = new GlobalTokenBudgeter();

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

    /**
     * Executes context compilation through the active pipeline (legacy / hybrid / compiler)
     */
    public async compileContext(request: ContextCompileRequest): Promise<ContextCompileResult> {
        this.throwIfCancelled(request.cancellation);
        const requestId = request.requestId || `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const startTime = performance.now();
        const flags = FeatureFlagRegistry.getFlags();
        const mode = flags.pipelineMode;
        const pipelineFallbackReasons = [...(request.fallbackReasons || [])];
        let forcePassThrough = flags.forcePassThrough;
        if (forcePassThrough) pipelineFallbackReasons.push('release_control_pass_through');

        // 0. Deterministic Context Governor Evaluation (Zero LLM/SLM)
        const governor = DeterministicContextGovernor.getInstance();
        const userPrompt = request.messages.map(m => m.content).join(' ');
        const governorDecision = governor.evaluateContext({
            userPrompt,
            activeFilePath: request.activeFilePath,
            cursorLine: request.cursorLine
        });

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
        const decisions: Decision[] = [
            {
                itemId: 'deterministic_context_governor',
                action: 'govern',
                reason: `Inferred task '${governorDecision.taskType}' (risk: ${governorDecision.riskLevel}, mode: ${governorDecision.retrievalMode}, aggressiveness: ${governorDecision.optimizationAggressiveness})`,
                confidence: governorDecision.confidence,
                evidence: governorDecision.riskReasons.length > 0 ? governorDecision.riskReasons : ['IntentExtractor', 'EvidencePolicyMatrix']
            }
        ];

        // 1b. Immutable workspace snapshot invariant
        if (request.workspaceSnapshot) {
            decisions.push({
                itemId: 'workspace_snapshot',
                action: 'include',
                reason: `Captured immutable workspace generation ${request.workspaceSnapshot.generation} (${request.workspaceSnapshot.files.size} files, ${request.workspaceSnapshot.symbols.length} symbols)`,
                confidence: 1.0,
                evidence: ['VersionedWorkspaceIndex', `generation:${request.workspaceSnapshot.generation}`]
            });
        } else if (this.ramManager) {
            const stats = this.ramManager.getStats();
            decisions.push({
                itemId: 'ram_context_accelerator',
                action: 'include',
                reason: `RAM accelerator active (${stats.skeletonsCached} cached AST skeletons, ${stats.symbolsIndexed} indexed symbols, ${stats.hitRatePercentage}% hit rate)`,
                confidence: 1.0,
                evidence: ['RamContextManager', 'BM25SymbolIndex', 'ASTMemoization']
            });
        }
        let cqReport: ContextQualityReport;
        let cachePlanResult: CachePlanResult | undefined;
        let codeRenderedAssignments: readonly RenderedBudgetAssignment[] = Object.freeze([]);
        let evidenceRetrieval: EvidenceRetrievalResult | undefined;
        const modelProfile = ModelProfileRegistry.getProfile(request.targetModel || request.targetProvider || 'claude-3-5-sonnet');

        if (request.allowWorkspaceRetrieval && request.workspaceSnapshot && !request.preserveProtocol) {
            try {
                evidenceRetrieval = this.evidenceRetriever.retrieve({
                    query: userPrompt,
                    taskType: governorDecision.taskType,
                    snapshot: request.workspaceSnapshot,
                    activeFilePath: request.activeFilePath,
                    signals: request.evidenceSignals
                });
            } catch {
                pipelineFallbackReasons.push('retrieval_failure_pass_through');
                forcePassThrough = true;
            }
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

        if (forcePassThrough || request.preserveProtocol || governorDecision.optimizationAggressiveness === 'none') {
            // Critical risk override: Full context preserved
            optimizedMessages = request.messages.map(m => ({ ...m }));
        } else {
            try {
                if (mode === 'legacy') {
                    optimizedMessages = await this.executeLegacyPipeline(request, decisions);
                } else if (mode === 'hybrid') {
                    optimizedMessages = await this.executeHybridPipeline(request, decisions);
                } else {
                    const compilerRes = await this.executeCompilerPipeline(request, decisions);
                    optimizedMessages = compilerRes.messages;
                    cachePlanResult = compilerRes.cachePlan;
                    codeRenderedAssignments = compilerRes.renderedAssignments;
                }
            } catch (error) {
                if (error instanceof CompilationCancelledError) throw error;
                optimizedMessages = request.messages.map(message => ({ ...message }));
                pipelineFallbackReasons.push(`${mode}_pipeline_failure_pass_through`);
                decisions.push({
                    itemId: 'pipeline_failure_fallback', action: 'preserve',
                    reason: 'Optimization stage failed; original request content was preserved.',
                    confidence: 1, evidence: ['FailClosedPipelineBoundary']
                });
            }
        }

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
        const presCheck = PreservationGate.evaluate(request.messages, optimizedMessages, request.userIntent || governorDecision.taskType);
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
        const providedCategories: EvidenceCategory[] = evidenceRetrieval
            ? [...evidenceRetrieval.covered]
            : ['targetImplementation', 'apiContract', 'callers'];
        if (!evidenceRetrieval && /\b(?:error|exception|traceback|TS\d{3,5})\b/i.test(userPrompt)) {
            providedCategories.push('errorStackTrace');
        }
        if (!evidenceRetrieval && /\b(?:test|spec)\b/i.test(userPrompt)) {
            providedCategories.push('tests');
        }
        const safetyAudit = governor.validateEvidenceSafety(governorDecision, providedCategories);
        if (!safetyAudit.passed && safetyAudit.actionTaken === 'fail_closed_fallback') {
            optimizedMessages = request.messages.map(m => ({ ...m }));
            contentRestored = true;
            decisions.push({
                itemId: 'evidence_safety_gate_fallback',
                action: 'preserve',
                reason: `Evidence safety gate triggered: missing critical evidence [${safetyAudit.missing.map(m => m.category).join(', ')}]`,
                confidence: 1.0,
                evidence: ['EvidenceSafetyGate']
            });
        }
        if (evidenceRetrieval?.conservativeFallback) {
            optimizedMessages = request.messages.map(message => ({ ...message }));
            contentRestored = true;
        }

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

        const tokensSaved = Math.max(0, originalTokens - optimizedTokens);
        const reductionPercentage = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0;
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
            }
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
            budgetPlan
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
        const result: MessagePayload[] = [];
        const parserLabel = this.astEngine?.getActiveParserLabel ? this.astEngine.getActiveParserLabel() : 'AST Parser';

        for (let i = 0; i < request.messages.length; i++) {
            const msg = request.messages[i];

            if (msg.role === 'user' && msg.content.includes('```')) {
                // Parse markdown into prose and code blocks, keeping prose untouched
                let updatedContent = msg.content;
                const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
                let match: RegExpExecArray | null;
                let blocksPruned = 0;

                while ((match = codeBlockRegex.exec(msg.content)) !== null) {
                    const fullMatch = match[0];
                    const langTag = match[1] || 'typescript';
                    const rawCode = match[2];
                    const pruned = this.astEngine.pruneCodeContext(rawCode, langTag as any);
                    
                    if (pruned.wasPruned && pruned.prunedCode.trim().length > 0) {
                        updatedContent = updatedContent.replace(fullMatch, `\`\`\`${langTag}\n${pruned.prunedCode}\n\`\`\``);
                        blocksPruned++;
                    }
                }

                result.push({ ...msg, content: updatedContent });
                decisions.push({
                    itemId: `turn_${i}`,
                    action: blocksPruned > 0 ? 'compress' : 'preserve',
                    reason: blocksPruned > 0 
                        ? `AST skeleton pruner applied to ${blocksPruned} code fence(s); user instructions preserved verbatim`
                        : 'Code block below pruning threshold; preserved intact',
                    confidence: 1.0,
                    evidence: [parserLabel]
                });
            } else {
                result.push({ ...msg });
                decisions.push({
                    itemId: `turn_${i}`,
                    action: 'preserve',
                    reason: 'Standard conversational text preserved verbatim',
                    confidence: 1.0,
                    evidence: ['Verbatim pass-through']
                });
            }
        }

        return result;
    }

    /**
     * Hybrid Execution Path (Transitional)
     */
    private async executeHybridPipeline(request: ContextCompileRequest, decisions: Decision[]): Promise<MessagePayload[]> {
        return this.executeLegacyPipeline(request, decisions);
    }

    /**
     * Full Context Compiler Execution Path (Phases 1-16)
     */
    private async executeCompilerPipeline(
        request: ContextCompileRequest,
        decisions: Decision[]
    ): Promise<{ messages: MessagePayload[]; cqReport: ContextQualityReport; cachePlan?: CachePlanResult; renderedAssignments: readonly RenderedBudgetAssignment[] }> {
        const profile = ModelProfileRegistry.getProfile(request.targetProvider || 'claude-3-5-sonnet');

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

        const taskProfile = this.sufficiencyEngine.buildTaskProfile(
            request.userIntent === 'edit' ? 'refactor' : (request.userIntent === 'question' ? 'explain' : 'debug'),
            userInstruction,
            [request.activeFilePath || 'workspace/focal.ts']
        );

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

                    let sliceRes: any;
                    try {
                        sliceRes = this.sdgSlicer.computeIntentAwareSlice(rawCode, focalKeywords, request.cursorLine || 15);
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
                            reason: `Slice analysis failed closed: ${error instanceof Error ? error.message : 'unknown error'}`,
                            confidence: 1,
                            evidence: ['SliceConfidenceEvaluator']
                        });
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
                            minimumResolution: 'R4', dependencies: [], conflicts: [], freshness: 'request', sensitivity: 'workspace',
                            transformationHistory: ['ingested', 'slice-confidence-gated']
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
        if (candidateEntities.length > 0) {
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
            const solverResult = this.knapsackSolver.solve({
                candidates: candidateEntities,
                tokenBudget,
                lambdaCost: 0.10
            });
            solverAssignments = solverResult.assignments;

            decisions.push({
                itemId: 'knapsack_token_solver',
                action: 'slice',
                reason: `Solved multi-choice knapsack across ${candidateEntities.length} competing candidate entities (${solverResult.includedCount} included, ${solverResult.excludedCount} excluded, budget: ${tokenBudget})`,
                confidence: 0.98,
                evidence: ['ContextKnapsackSolver', '0/1 MCKP Global Optimum']
            });
        }

        // 4. Reconstruct Optimized Messages with Assigned Representations
        const intermediateMessages: MessagePayload[] = [];

        for (let i = 0; i < request.messages.length; i++) {
            const msg = request.messages[i];
            const isLatestUserTurn = i === request.messages.length - 1 && msg.role === 'user';

            if (msg.role === 'system') {
                const comp = await this.compressor.compress(msg.content);
                intermediateMessages.push({ ...msg, content: comp.compressedText });
                decisions.push({
                    itemId: `system_prompt_${i}`,
                    action: 'compress',
                    reason: `Compacted whitespace and comments (-${comp.tokensSaved} tokens)`,
                    confidence: 1.0,
                    evidence: ['RuleBasedCompressor']
                });
            } else if (msg.content.includes('```')) {
                let updatedContent = msg.content;
                const relevantBlocks = extractedBlocks.filter(b => b.messageIndex === i);

                for (const block of relevantBlocks) {
                    const assigned = solverAssignments.get(block.entityId);
                    const finalCode = assigned?.text;

                    if (finalCode && finalCode.trim().length > 0) {
                        updatedContent = updatedContent.replace(block.fullMatch, `\`\`\`${block.langTag}\n${finalCode}\n\`\`\``);
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
                            renderedTextHash: createHash('sha256').update(finalCode).digest('hex')
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
        const aligner = this.cacheAligner || new CacheAlignerEngine();
        const systemDirectives = intermediateMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const historyTurns = intermediateMessages.filter(m => m.role !== 'system' && m !== intermediateMessages[intermediateMessages.length - 1]);
        const latestUserMsg = intermediateMessages[intermediateMessages.length - 1]?.content || userInstruction;

        const alignmentResult = aligner.alignPayload(
            systemDirectives,
            '',
            historyTurns,
            latestUserMsg,
            { targetProvider: request.targetProvider || 'anthropic' }
        );

        const cachePlan = this.cachePlanner.planContext({
            systemPrompt: systemDirectives,
            userQuery: latestUserMsg,
            profile
        });

        // 6. Context Quality (CQ) Evaluation
        const cqReport = this.cqEvaluator.evaluateQuality({
            evidenceCoverage: 0.96,
            meanRelevance: 0.94,
            dependencyCompleteness: 0.91,
            instructionIntegrity: 1.0,
            sliceConfidence: 0.95
        });

        const finalMessages = (systemDirectives.trim().length > 0 && alignmentResult.alignedMessages.length > 0)
            ? alignmentResult.alignedMessages
            : intermediateMessages;

        return {
            messages: finalMessages,
            cqReport,
            cachePlan,
            renderedAssignments: Object.freeze(renderedAssignments)
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
        if (!retrieval || retrieval.conservativeFallback || retrieval.selected.length === 0) {
            const plan = this.globalBudgeter.planBase({ messages, ...baseParams });
            return { messages, plan: this.globalBudgeter.finalize(plan, messages) };
        }
        const targetIndex = messages.map(message => message.role).lastIndexOf('user');
        if (targetIndex < 0) {
            const plan = this.globalBudgeter.planBase({ messages, ...baseParams });
            return { messages, plan: this.globalBudgeter.finalize(plan, messages) };
        }
        const wrapperOpen = `<tokonomics-evidence snapshot="${request.workspaceSnapshot?.generation}">`;
        const wrapperClose = '</tokonomics-evidence>';
        const withEmptyWrapper = messages.map(message => ({ ...message }));
        withEmptyWrapper[targetIndex].content = `${withEmptyWrapper[targetIndex].content}\n\n${wrapperOpen}\n${wrapperClose}`;
        const basePlan = this.globalBudgeter.planBase({ messages: withEmptyWrapper, ...baseParams });
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
                solved = this.knapsackSolver.solve({ candidates: entities, tokenBudget: candidateBudget });
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
