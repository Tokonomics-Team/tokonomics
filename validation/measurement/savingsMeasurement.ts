/**
 * Tokonomics savings measurement.
 *
 * Answers one question honestly: how much input does the compiler actually remove on real code,
 * and how much of that removal costs the model information it needs?
 *
 * Why this exists separately from the synthetic benchmark: the synthetic corpus reports ~99%
 * reduction, but its average optimized payload is around 100 tokens - a signature skeleton. That
 * number describes the fixtures, not a working developer's requests. This harness uses this
 * repository's own production TypeScript as the corpus: real files, real sizes, real statement
 * density, spanning 23 to ~1,600 lines.
 *
 * The corpus is pinned by content hash. When a corpus file changes the measurement is still
 * produced, but the run reports that the baseline needs review rather than letting the recorded
 * numbers drift silently as the repository evolves.
 *
 * Nothing here is a production module: it is validation tooling and is excluded from the VSIX.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../../src/engine/featureFlags';
import { OPTIMIZATION_PROFILES, OptimizationMode } from '../../src/config/userPreferences';
import { VersionedWorkspaceIndex } from '../../src/workspace/workspaceIndex';
import { maskObservations } from '../../src/compression/observationMasking';
import { requiresExactSource } from '../../src/workspace/semanticChunk';
import { measureSessionCapacity } from './sessionCapacity';

/**
 * Files forming the corpus. Chosen to span size and statement density, not to flatter the result.
 *
 * Read from pinned copies under validation/corpus/, not from live src/. The corpus previously read
 * the working tree, so editing any of these files moved the measurement: a comment added to
 * modelProvider.ts during the context-entry work changed the reported reduction from 0.5% to 0.2%
 * while the compiler's output stayed byte-identical. A regression gate whose inputs change whenever
 * the project edits itself cannot tell a regression from a rewrite, so the inputs are now fixed
 * artifacts and only the compiler's behaviour can move the number.
 */
export const CORPUS_FILES: readonly string[] = Object.freeze([
    'src/history/modelHistory.ts',
    'src/protocol/providerGateway.ts',
    'src/ui/chatProtocol.ts',
    'src/governor/inlineEvidenceClassifier.ts',
    'src/compression/conservativePathCompressor.ts',
    'src/search/embeddingProvider.ts',
    'src/proxy/modelProvider.ts',
    'src/engine/prefixContinuity.ts',
    'src/engine/safePathPolicy.ts',
    'src/cache/aligner.ts'
]);

/**
 * Files a developer would plausibly attach together when working on one subsystem. The
 * retrieval-first measurement compares forwarding this whole bundle against retrieving only the
 * symbols a request actually needs. This is the comparison the attachment corpus above cannot make,
 * because a single-file prompt has nothing to retrieve instead of.
 */
export const RETRIEVAL_BUNDLE: readonly string[] = Object.freeze([
    'src/search/embeddingProvider.ts',
    'src/search/hybridRetriever.ts',
    'src/search/vectorIndex.ts',
    'src/search/invertedIndex.ts',
    'src/search/reranker.ts'
]);

/** Focal file the retrieval prompts refer to; supplied as the active editor path. */
export const RETRIEVAL_FOCAL_FILE = 'src/search/embeddingProvider.ts';

/**
 * Retrieval-first prompts. Deliberately spans task classes whose evidence contract can be satisfied
 * (search, explain) and classes whose contract cannot without a stack trace or diff (debug,
 * refactor, feature). The latter previously collapsed to a bare instruction with no code at all, so
 * they are the cases this measurement exists to protect.
 */
export const RETRIEVAL_PROMPTS: readonly TaskCase[] = Object.freeze([
    { task: 'debug', weight: 0.2, prompt: 'Fix the rounding defect in computeVector in the embedding provider.' },
    { task: 'search', weight: 0.2, prompt: 'Where is computeVector defined?' },
    { task: 'explain', weight: 0.2, prompt: 'Explain what the embedding provider does.' },
    { task: 'refactor', weight: 0.2, prompt: 'Refactor computeVector for readability.' },
    { task: 'feature', weight: 0.2, prompt: 'Add a dimension option to the embedding provider.' }
]);

export interface RetrievalCaseResult {
    readonly task: string;
    readonly attachedTokens: number;
    readonly retrievedTokens: number;
    readonly savingPct: number;
    readonly candidatesAdmitted: number;
    readonly contractComplete: boolean;
    readonly evidenceRendered: boolean;
    readonly shortfallDeclared: boolean;
    /** The invariant: a retrieval-first payload must never be the bare instruction. */
    readonly carriesContext: boolean;
    /** Selected implementation evidence that was rehydrated to byte-exact source. */
    readonly exactEvidence: number;
    /** Selected implementation evidence that could not be, with a declared shortfall. */
    readonly inexactEvidence: number;
    /** Distinct reasons exact source could not be rendered, for diagnosis. */
    readonly exactShortfalls: readonly string[];
    /** Selected evidence sharing byte-identical content. The exact-dedup invariant: must be 0. */
    readonly duplicateSelected: number;
    readonly selectedCount: number;
}

export interface RetrievalSummary {
    readonly profile: string;
    readonly cases: number;
    readonly attachedTokensTotal: number;
    readonly retrievedTokensTotal: number;
    readonly savingPct: number;
    readonly contextFreePayloads: number;
    readonly evidenceRenderedCases: number;
    /**
     * Cases whose task requires exact implementation source (explain and search legitimately do not,
     * so counting them as failures would misreport correct behaviour).
     */
    readonly casesRequiringExact: number;
    /** Of those, the cases that received exact source with no inexact implementation evidence. */
    readonly casesExactSatisfied: number;
    /** Implementation evidence rendered without exact source anywhere in the corpus. Must be 0. */
    readonly inexactEvidenceTotal: number;
    readonly results: readonly RetrievalCaseResult[];
}

export interface TaskCase {
    readonly task: string;
    /** Share of a developer's AI coding requests. Assumption, stated so it can be recomputed. */
    readonly weight: number;
    readonly prompt: string;
}

export const TASK_CASES: readonly TaskCase[] = Object.freeze([
    { task: 'explain', weight: 0.22, prompt: 'Explain what this module does and how the main flow works.' },
    { task: 'refactor', weight: 0.26, prompt: 'Refactor this for readability without changing behaviour.' },
    { task: 'feature', weight: 0.26, prompt: 'Add an optional timeout parameter to the main entry point.' },
    { task: 'review', weight: 0.26, prompt: 'Review this code for correctness and edge-case problems.' }
]);

/**
 * Retention floor for control-flow constructs. Below this the model can no longer see what the
 * code does, only what it is called, so any answer about behaviour is unsupported.
 */
export const CONTROL_FLOW_FLOOR = 0.95;

export interface CaseResult {
    readonly file: string;
    readonly task: string;
    readonly lines: number;
    readonly beforeTokens: number;
    readonly afterTokens: number;
    readonly reductionPct: number;
    readonly exportedTotal: number;
    readonly exportedKept: number;
    readonly publicTotal: number;
    readonly publicKept: number;
    readonly controlFlowTotal: number;
    readonly controlFlowKept: number;
    readonly controlFlowRetention: number;
    readonly instructionIntact: boolean;
    readonly payloadRestored: boolean;
    /** True when nothing a correct answer would need was removed. */
    readonly lossless: boolean;
    /**
     * True when the payload was compressed past the control-flow floor yet no preservation gate
     * fired. This is the calibration signal: the gate considered the result preserved.
     */
    readonly degradedButGatePassed: boolean;
}

export interface ProfileSummary {
    readonly profile: string;
    readonly cases: number;
    readonly overallBeforeTokens: number;
    readonly overallAfterTokens: number;
    readonly overallReductionPct: number;
    readonly weightedReductionPct: number;
    readonly losslessCases: number;
    readonly losslessReductionPct: number;
    readonly degradedCases: number;
    readonly degradedReductionPct: number;
    readonly degradedButGatePassedCases: number;
    readonly minControlFlowRetention: number;
    readonly instructionIntactCases: number;
    readonly results: readonly CaseResult[];
}

export interface AgenticSummary {
    readonly toolCalls: number;
    readonly observationChars: number;
    readonly payloadCharsBefore: number;
    readonly payloadCharsAfter: number;
    readonly reductionPct: number;
    readonly maskedObservations: number;
    /** Protocol invariants that must hold for every masked trajectory. */
    readonly messageCountPreserved: boolean;
    readonly callIdsPreserved: boolean;
    readonly recentObservationsIntact: boolean;
    /** Turns the masking boundary stays put; a boundary that moves every turn breaks prefix reuse. */
    readonly boundaryStableAcrossTurns: boolean;
}

export interface MeasurementReport {
    readonly schemaVersion: 2;
    readonly generatedAt: string;
    readonly classification: 'controlled-real-code-measurement-not-production-evidence';
    readonly corpus: {
        readonly files: readonly { path: string; lines: number; sha256: string }[];
        readonly taskCases: readonly TaskCase[];
        readonly controlFlowFloor: number;
    };
    readonly profiles: readonly ProfileSummary[];
    readonly retrieval: readonly RetrievalSummary[];
    readonly agentic: AgenticSummary;
    /**
     * Agentic turns completed before the context window is exhausted, with and without masking.
     *
     * The metric that matters for a flat subscription. A seat rations requests and window, not
     * tokens, so token reduction cannot save money there - but it can buy back window, which is what
     * decides whether a long agentic session finishes or dies halfway.
     */
    readonly capacity: readonly SessionCapacitySummary[];
    readonly limitations: readonly string[];
}

function exportedNames(source: string): string[] {
    const found = new Set<string>();
    const patterns = [
        /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
        /export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
        /export\s+interface\s+([A-Za-z_$][\w$]*)/g,
        /export\s+const\s+([A-Za-z_$][\w$]*)/g,
        /export\s+type\s+([A-Za-z_$][\w$]*)/g,
        /export\s+enum\s+([A-Za-z_$][\w$]*)/g
    ];
    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) found.add(match[1]);
    }
    return [...found];
}

function publicMethods(source: string): string[] {
    const found = new Set<string>();
    const pattern = /\bpublic\s+(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) found.add(match[1]);
    return [...found];
}

function controlFlowCount(source: string): number {
    return (source.match(/\b(?:if|else|for|while|switch|case|catch|finally|return|throw)\b/g) || []).length;
}

function applyProfile(mode: OptimizationMode): void {
    const profile = OPTIMIZATION_PROFILES[mode];
    FeatureFlagRegistry.applyRuntimeConfiguration({
        schemaVersion: 1,
        preferences: { optimizationMode: mode, workspaceContext: 'selection', includeUnsavedChanges: false, responseReuse: true },
        profile,
        featureFlags: profile.featureFlags,
        tokenOptimization: profile.tokenOptimization,
        workspace: { contextMode: 'selection', includeUnsavedBuffers: false, ramBudgetMB: 64, maxIndexFileSizeKB: 256, backgroundWarming: false },
        responseCache: { enabled: true, maxSize: 100 },
        image: { enabled: true, maxDimension: 1568 },
        modelAllowList: [],
        releaseControl: { channel: 'stable', stagedRolloutPercent: 100, emergencyDisable: false, disabledCapabilities: [] },
        experiments: { consent: false, enabled: [], disabled: [], maxLatencyMs: 25, maxMemoryMB: 16 },
        migration: { source: 'v7-public', migratedLegacyKeys: [], malformedKeys: [] }
    } as never);
}

/**
 * Resolves a corpus entry to its pinned copy. The flattened name keeps the fixtures in one
 * directory while the logical path stays readable in the report.
 */
export function pinnedCorpusPath(rootDir: string, relative: string): string {
    return path.join(rootDir, 'validation', 'corpus', relative.replace(/[\/]/g, '__'));
}

async function measureProfile(rootDir: string, mode: OptimizationMode): Promise<ProfileSummary> {
    applyProfile(mode);
    const results: CaseResult[] = [];

    for (const relative of CORPUS_FILES) {
        const absolute = pinnedCorpusPath(rootDir, relative);
        if (!fs.existsSync(absolute)) continue;
        const source = fs.readFileSync(absolute, 'utf8');
        const lines = source.split(/\r?\n/).length;
        const exported = exportedNames(source);
        const publics = publicMethods(source);
        const controlTotal = controlFlowCount(source);

        for (const testCase of TASK_CASES) {
            const orchestrator = new PipelineOrchestrator();
            const compiled = await orchestrator.compileContext({
                messages: [{ role: 'user', content: `${testCase.prompt}\n\n\`\`\`typescript\n${source}\n\`\`\`` }],
                sessionId: 'savings-measurement',
                targetProvider: 'anthropic',
                targetModel: 'claude-3-5-sonnet',
                deferSideEffects: true
            } as never);

            const emitted = compiled.optimizedMessages.map(message => message.content).join('\n');
            const exportedKept = exported.filter(name => emitted.includes(name)).length;
            const publicKept = publics.filter(name => emitted.includes(name)).length;
            const controlKept = controlFlowCount(emitted);
            const retention = controlTotal > 0 ? Math.min(1, controlKept / controlTotal) : 1;
            const lossless = exportedKept === exported.length
                && publicKept === publics.length
                && retention >= CONTROL_FLOW_FLOOR;
            const restored = compiled.event.fallbackReasons.includes('preservation_gate_restored_original_content');

            results.push({
                file: relative, task: testCase.task, lines,
                beforeTokens: compiled.originalTokens,
                afterTokens: compiled.optimizedTokens,
                reductionPct: compiled.reductionPercentage,
                exportedTotal: exported.length, exportedKept,
                publicTotal: publics.length, publicKept,
                controlFlowTotal: controlTotal, controlFlowKept: controlKept,
                controlFlowRetention: Math.round(retention * 1000) / 1000,
                instructionIntact: emitted.includes(testCase.prompt),
                payloadRestored: restored,
                lossless,
                degradedButGatePassed: !lossless && !restored
            });
        }
    }

    const sum = (set: readonly CaseResult[], pick: (row: CaseResult) => number) => set.reduce((total, row) => total + pick(row), 0);
    const reduction = (set: readonly CaseResult[]) => {
        const before = sum(set, row => row.beforeTokens);
        const after = sum(set, row => row.afterTokens);
        return before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0;
    };

    const lossless = results.filter(row => row.lossless);
    const degraded = results.filter(row => !row.lossless);

    let weighted = 0;
    for (const testCase of TASK_CASES) {
        const subset = results.filter(row => row.task === testCase.task);
        if (subset.length > 0) weighted += reduction(subset) * testCase.weight;
    }

    return {
        profile: mode,
        cases: results.length,
        overallBeforeTokens: sum(results, row => row.beforeTokens),
        overallAfterTokens: sum(results, row => row.afterTokens),
        overallReductionPct: reduction(results),
        weightedReductionPct: Math.round(weighted * 10) / 10,
        losslessCases: lossless.length,
        losslessReductionPct: reduction(lossless),
        degradedCases: degraded.length,
        degradedReductionPct: reduction(degraded),
        degradedButGatePassedCases: results.filter(row => row.degradedButGatePassed).length,
        minControlFlowRetention: results.length > 0 ? Math.min(...results.map(row => row.controlFlowRetention)) : 1,
        instructionIntactCases: results.filter(row => row.instructionIntact).length,
        results
    };
}

/**
 * Retrieval-first measurement.
 *
 * Compares forwarding a whole subsystem bundle against sending a bare instruction and letting the
 * compiler retrieve only the symbols the request needs. Requires a real workspace index, so this is
 * the only part of the harness that builds one.
 *
 * The metric that matters most here is not the saving. It is `contextFreePayloads`: a retrieval-first
 * request whose payload is just the instruction has no code in it at all, and a token counter scores
 * that as a near-total saving while the request is in fact broken. That count must stay at zero.
 */
async function measureRetrieval(rootDir: string, mode: OptimizationMode): Promise<RetrievalSummary> {
    applyProfile(mode);
    const results: RetrievalCaseResult[] = [];

    const index = new VersionedWorkspaceIndex([path.join(rootDir, 'src')], undefined, { trusted: true, budgetMB: 64 });
    const snapshot = await index.ensureInitialized();

    const bundlePaths = RETRIEVAL_BUNDLE.filter(file => fs.existsSync(path.join(rootDir, file)));
    const newline = String.fromCharCode(10);
    const bundle = bundlePaths
        .map(file => `// ${file}${newline}${fs.readFileSync(path.join(rootDir, file), 'utf8')}`)
        .join(newline + newline);
    const focalPath = path.join(rootDir, RETRIEVAL_FOCAL_FILE);

    for (const testCase of RETRIEVAL_PROMPTS) {
        const attachedCompile = await new PipelineOrchestrator().compileContext({
            messages: [{ role: 'user', content: `${testCase.prompt}${newline}${newline}\`\`\`typescript${newline}${bundle}${newline}\`\`\`` }],
            sessionId: 'retrieval-measurement', targetProvider: 'anthropic',
            targetModel: 'claude-3-5-sonnet', deferSideEffects: true
        } as never);

        const retrievedCompile = await new PipelineOrchestrator().compileContext({
            messages: [{ role: 'user', content: testCase.prompt }],
            sessionId: 'retrieval-measurement', targetProvider: 'anthropic',
            targetModel: 'claude-3-5-sonnet', deferSideEffects: true,
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: focalPath
        } as never);

        const emitted = retrievedCompile.optimizedMessages.map(message => message.content).join(newline);
        const attachedTokens = attachedCompile.optimizedTokens;
        const retrievedTokens = retrievedCompile.optimizedTokens;
        results.push({
            task: testCase.task,
            attachedTokens,
            retrievedTokens,
            savingPct: attachedTokens > 0 ? Math.round((1 - retrievedTokens / attachedTokens) * 1000) / 10 : 0,
            candidatesAdmitted: retrievedCompile.evidenceRetrieval?.selected.length ?? 0,
            contractComplete: retrievedCompile.evidenceRetrieval?.conservativeFallback === false,
            evidenceRendered: emitted.includes('tokonomics-evidence'),
            shortfallDeclared: /incomplete="/.test(emitted),
            carriesContext: emitted.length > testCase.prompt.length + 200,
            exactEvidence: (retrievedCompile.evidenceRetrieval?.selected || [])
                .filter(candidate => candidate.exactSource === true).length,
            inexactEvidence: (retrievedCompile.evidenceRetrieval?.selected || [])
                .filter(candidate => candidate.exactSource === false).length,
            duplicateSelected: (() => {
                const sel = retrievedCompile.evidenceRetrieval?.selected || [];
                const seen = new Set<string>(); let dup = 0;
                for (const c of sel) { const k = `${c.category}:${c.contentHash}`; if (seen.has(k)) dup++; seen.add(k); }
                return dup;
            })(),
            selectedCount: (retrievedCompile.evidenceRetrieval?.selected || []).length,
            exactShortfalls: [...new Set((retrievedCompile.evidenceRetrieval?.selected || [])
                .filter(candidate => candidate.exactSource === false)
                .map(candidate => String(candidate.exactSourceShortfall)))]
        });
    }

    const attachedTotal = results.reduce((total, row) => total + row.attachedTokens, 0);
    const retrievedTotal = results.reduce((total, row) => total + row.retrievedTokens, 0);
    return {
        profile: mode,
        cases: results.length,
        attachedTokensTotal: attachedTotal,
        retrievedTokensTotal: retrievedTotal,
        savingPct: attachedTotal > 0 ? Math.round((1 - retrievedTotal / attachedTotal) * 1000) / 10 : 0,
        contextFreePayloads: results.filter(row => !row.carriesContext).length,
        evidenceRenderedCases: results.filter(row => row.evidenceRendered).length,
        casesRequiringExact: results.filter(row => requiresExactSource(row.task)).length,
        casesExactSatisfied: results.filter(row => requiresExactSource(row.task)
            && row.exactEvidence > 0 && row.inexactEvidence === 0).length,
        inexactEvidenceTotal: results.reduce((sum, row) => sum + row.inexactEvidence, 0),
        results
    };
}

/**
 * Agentic measurement: how much of a tool-heavy trajectory observation masking removes.
 *
 * Synthetic by necessity - the harness cannot drive a real agent loop - but the shape is taken from
 * measured workloads: long autonomous loops, large tool observations, short model outputs. What it
 * verifies beyond the reduction is that the protocol survives and that the masking boundary does not
 * move on every turn, since a boundary that shifted continuously would invalidate the provider's
 * prefix cache and give back more than the masking saves.
 */
function measureAgentic(): AgenticSummary {
    const toolCall = (callId: string, name: string) => ({ kind: 'tool_call' as const, callId, name, input: {} });
    const toolResult = (callId: string, chars: number) => ({
        kind: 'tool_result' as const, callId, content: [{ kind: 'text' as const, text: 'x'.repeat(chars) }]
    });
    const build = (calls: number) => {
        const trajectory: { role: string; parts: unknown[] }[] =
            [{ role: 'user', parts: [{ kind: 'text', text: 'Fix the failing test.' }] }];
        for (let i = 0; i < calls; i++) {
            trajectory.push({ role: 'assistant', parts: [toolCall(`c${i}`, i % 2 ? 'read_file' : 'run_tests')] });
            trajectory.push({ role: 'user', parts: [toolResult(`c${i}`, 4_000)] });
        }
        return trajectory;
    };

    const TOOL_CALLS = 12;
    const trajectory = build(TOOL_CALLS);
    const before = JSON.stringify(trajectory).length;
    const masked = maskObservations(trajectory as never);
    const after = JSON.stringify(masked.messages).length;

    const callIds = (set: readonly unknown[]) => JSON.stringify((set as { parts: { callId?: string }[] }[])
        .flatMap(message => message.parts.filter(part => part.callId).map(part => part.callId)));
    const tail = (masked.messages as unknown as { parts: { kind: string; content?: { text: string }[] }[] }[])
        .slice(-6).flatMap(message => message.parts.filter(part => part.kind === 'tool_result'));

    const positions = (set: unknown) => (set as { parts: { kind: string; content?: { text: string }[] }[] }[])
        .flatMap((message, index) => message.parts.map(part =>
            part.kind === 'tool_result' && part.content?.[0]?.text?.startsWith('[tokonomics:') ? index : -1))
        .filter(index => index >= 0).join(',');

    return {
        toolCalls: TOOL_CALLS,
        observationChars: masked.totalObservationChars,
        payloadCharsBefore: before,
        payloadCharsAfter: after,
        reductionPct: before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0,
        maskedObservations: masked.maskedCount,
        messageCountPreserved: masked.messages.length === trajectory.length,
        callIdsPreserved: callIds(masked.messages) === callIds(trajectory),
        recentObservationsIntact: tail.length > 0
            && tail.every(part => !part.content?.[0]?.text?.startsWith('[tokonomics:')),
        boundaryStableAcrossTurns:
            positions(maskObservations(build(TOOL_CALLS + 1) as never).messages)
            === positions(maskObservations(build(TOOL_CALLS + 2) as never).messages)
    };
}

export async function runSavingsMeasurement(rootDir: string = process.cwd()): Promise<MeasurementReport> {
    const corpusFiles = CORPUS_FILES
        .filter(relative => fs.existsSync(path.join(rootDir, relative)))
        .map(relative => {
            const bytes = fs.readFileSync(pinnedCorpusPath(rootDir, relative));
            return {
                path: relative,
                lines: bytes.toString('utf8').split(/\r?\n/).length,
                sha256: createHash('sha256').update(bytes).digest('hex')
            };
        });

    const profiles: ProfileSummary[] = [];
    for (const mode of ['balanced', 'maximum'] as OptimizationMode[]) {
        profiles.push(await measureProfile(rootDir, mode));
    }
    const retrieval: RetrievalSummary[] = [];
    for (const mode of ['balanced', 'maximum'] as OptimizationMode[]) {
        retrieval.push(await measureRetrieval(rootDir, mode));
    }

    return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        classification: 'controlled-real-code-measurement-not-production-evidence',
        corpus: { files: corpusFiles, taskCases: TASK_CASES, controlFlowFloor: CONTROL_FLOW_FLOOR },
        profiles,
        retrieval,
        agentic: measureAgentic(),
        capacity: [128_000, 200_000, 1_000_000].map(windowTokens => {
            const measured = measureSessionCapacity(windowTokens, 2_500);
            return Object.freeze({
                windowTokens,
                unmaskedTurnLimit: measured.unmaskedTurnLimit,
                maskedTurnLimit: measured.maskedTurnLimit,
                capacityMultiple: measured.capacityMultiple,
                // A limit equal to the search bound was never actually reached, so the multiple is a
                // floor rather than a measurement. Saying so keeps an understated number honest.
                maskedLimitCensored: measured.maskedTurnLimit >= 2_500
            });
        }),
        limitations: [
            'Session capacity measures how many agentic turns fit before the window is exhausted. It says nothing about whether the answers stay correct as observations are masked; that requires a model-task evaluation on agentic trajectories, which has not been run.',
            'Measures information retention, not downstream answer quality. Proving no degradation requires running the same tasks through a real model with and without optimization and scoring task success.',
            'The corpus is this repository\'s own TypeScript. It is real production code but one language and one codebase; other languages and repository shapes may compress differently.',
            'The attachment corpus carries a single attached file and no workspace snapshot, so retrieval, LSP and dense-retrieval stages do not participate there; the retrieval-first section below exercises them against a real index.',
            'Token counts come from the local estimator, not a provider tokenizer, so absolute values carry that estimator\'s error. Ratios are affected far less than absolute counts.',
            'Cost conversion is not performed here. Spend depends on the caller\'s model, cache behaviour and output volume.',
            'The retrieval-first figures compare against forwarding a five-file bundle. A developer attaching one small file has far less to save, so this is an upper bound for that workload shape, not a universal rate.',
            'contextFreePayloads is the load-bearing check in the retrieval section: a payload with no code scores as a near-total saving on any token counter, so the saving figure alone cannot be trusted without it.'
        ]
    };
}
