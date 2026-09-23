/**
 * Stage ablation for the retrieval pipeline.
 *
 * Maximum Savings turns on four extra retrieval stages - hashed structural retrieval, lexical
 * interaction reranking, MMR diversity and semantic deduplication - each costing latency, memory and
 * code. Nothing measured whether any of them changed the evidence that reached the model. A stage
 * that is enabled, budgeted, receipted and inert is indistinguishable from one that works, right up
 * until someone asks what it bought.
 *
 * This runs the retrieval corpus with each stage individually disabled against the full Maximum
 * configuration, and reports what changed. The comparison is deliberately one-at-a-time: turning
 * several off together would confound their effects, and the question being asked is per-stage.
 *
 * What counts as value, in priority order:
 *
 * 1. **Mandatory evidence recall.** Did the request get the categories its task contract requires?
 *    A stage that improves this is earning its place regardless of what it costs.
 * 2. **Focal recall.** Did the file the request is about appear in the selected evidence? Retrieval
 *    that omits the file being asked about has failed whatever its token count says.
 * 3. **Token cost.** Only meaningful once the two above are equal. Fewer tokens for the same
 *    evidence is a win; fewer tokens for less evidence is not, which is why cost is ranked last.
 *
 * A stage that changes none of the three on this corpus has not been proven useless in general -
 * this corpus is one repository and five prompts - but it has been shown to earn nothing here, which
 * is the evidence the plan requires before a stage stays on by default.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../../src/engine/featureFlags';
import { OPTIMIZATION_PROFILES } from '../../src/config/userPreferences';
import { VersionedWorkspaceIndex } from '../../src/workspace/workspaceIndex';
import { RETRIEVAL_PROMPTS, RETRIEVAL_FOCAL_FILE, TaskCase } from './savingsMeasurement';

/**
 * Prompts that name no symbol from the file they are about.
 *
 * The main retrieval corpus is unusable for judging retrieval *stages*, and finding that out was
 * the point of running an ablation. Every one of its prompts names its target exactly - "computeVector",
 * "the embedding provider" - so lexical matching succeeds trivially and any stage whose job is to
 * find code the lexical index would miss has nothing left to contribute. Measuring such a stage
 * there and concluding it is worthless would be measuring the corpus, not the stage.
 *
 * These prompts describe the same code in the vocabulary a developer would actually use when they
 * cannot remember what it is called. They are the cases where structural or semantic similarity has
 * something to add, and where its absence should show up as a missed focal file.
 */
export const DISCRIMINATING_PROMPTS: readonly TaskCase[] = Object.freeze([
    { task: 'search', weight: 0.25, prompt: 'Where do we turn source text into numbers for similarity comparison?' },
    { task: 'explain', weight: 0.25, prompt: 'How does the ranking decide which snippets are closest to a query?' },
    { task: 'debug', weight: 0.25, prompt: 'Scores come back nearly identical for very different files. Why?' },
    { task: 'refactor', weight: 0.25, prompt: 'Make the part that builds similarity vectors easier to follow.' }
]);

/** The stages Maximum Savings adds on top of Balanced, each ablated independently. */
export const ABLATED_STAGES = Object.freeze([
    'enableDenseEmbeddings',
    'enableCrossEncoder',
    'enableMmrDiversity',
    'enableSemanticDedup'
] as const);

export type AblatedStage = typeof ABLATED_STAGES[number];

export interface AblationOutcome {
    /** Mandatory evidence categories satisfied, summed across the corpus. */
    readonly mandatorySatisfied: number;
    /** Cases whose selected evidence included the focal file. */
    readonly focalRecalled: number;
    readonly retrievedTokens: number;
    readonly candidates: number;
    /**
     * Candidates rendered as byte-exact implementation source. A stage that reshapes the selection
     * so a code-changing task stops receiving implementation evidence has done real harm that
     * mandatory-category counting cannot see, because the category is still nominally covered.
     */
    readonly exactImplementation: number;
    /** Ordered ids of selected evidence, so an inert stage is visible as an identical ranking. */
    readonly selectionSignature: string;
}

export interface StageAblationResult {
    readonly stage: AblatedStage;
    readonly withStage: AblationOutcome;
    readonly withoutStage: AblationOutcome;
    readonly mandatoryDelta: number;
    readonly focalDelta: number;
    readonly tokenDelta: number;
    readonly exactImplementationDelta: number;
    /** True when disabling the stage changed nothing observable in the final evidence. */
    readonly inert: boolean;
    readonly verdict: 'earns-its-place' | 'costs-more-than-it-returns' | 'no-measured-effect' | 'inert';
    readonly reason: string;
}

function applyFlags(overrides: Partial<Record<AblatedStage, boolean>>): void {
    const profile = OPTIMIZATION_PROFILES.maximum;
    FeatureFlagRegistry.applyRuntimeConfiguration({
        schemaVersion: 1,
        preferences: {
            optimizationMode: 'maximum', workspaceContext: 'selection',
            includeUnsavedChanges: false, responseReuse: true
        },
        profile,
        featureFlags: { ...profile.featureFlags, ...overrides },
        tokenOptimization: profile.tokenOptimization,
        workspace: {
            contextMode: 'selection', includeUnsavedBuffers: false, ramBudgetMB: 64,
            maxIndexFileSizeKB: 256, backgroundWarming: false
        },
        responseCache: { enabled: true, maxSize: 100 },
        image: { enabled: true, maxDimension: 1568 }
    } as never);
}

async function runCorpus(
    rootDir: string,
    snapshot: unknown,
    overrides: Partial<Record<AblatedStage, boolean>>
): Promise<AblationOutcome> {
    applyFlags(overrides);
    const focalPath = path.join(rootDir, RETRIEVAL_FOCAL_FILE);
    const focalName = path.basename(RETRIEVAL_FOCAL_FILE);

    let mandatorySatisfied = 0;
    let focalRecalled = 0;
    let retrievedTokens = 0;
    let candidates = 0;
    let exactImplementation = 0;
    const signature: string[] = [];

    for (const testCase of [...RETRIEVAL_PROMPTS, ...DISCRIMINATING_PROMPTS]) {
        const compiled = await new PipelineOrchestrator().compileContext({
            messages: [{ role: 'user', content: testCase.prompt }],
            sessionId: 'retrieval-ablation', targetProvider: 'anthropic',
            targetModel: 'claude-3-5-sonnet', deferSideEffects: true,
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: focalPath
        } as never);

        const retrieval = compiled.evidenceRetrieval;
        const selected = retrieval?.selected ?? [];
        retrievedTokens += compiled.optimizedTokens;
        candidates += selected.length;
        exactImplementation += selected.filter(candidate => candidate.exactSource === true).length;
        mandatorySatisfied += (retrieval?.contract.required.length ?? 0)
            - (retrieval?.missingRequired.length ?? 0);
        if (selected.some(candidate => (candidate.filePath || candidate.fileKey || '').includes(focalName))) {
            focalRecalled++;
        }
        signature.push(`${testCase.task}:${selected.map(candidate => candidate.id).join(',')}`);
    }

    return Object.freeze({
        mandatorySatisfied, focalRecalled, retrievedTokens, candidates, exactImplementation,
        selectionSignature: signature.join('|')
    });
}

export interface AblationReport {
    readonly generatedAt: string;
    readonly corpusCases: number;
    readonly results: readonly StageAblationResult[];
    readonly inertStages: readonly AblatedStage[];
}

export async function runRetrievalAblation(rootDir: string): Promise<AblationReport> {
    const index = new VersionedWorkspaceIndex(
        [path.join(rootDir, 'src')], undefined, { trusted: true, budgetMB: 64 });
    const snapshot = await index.ensureInitialized();

    const withAll = await runCorpus(rootDir, snapshot, {});
    const results: StageAblationResult[] = [];

    for (const stage of ABLATED_STAGES) {
        const without = await runCorpus(rootDir, snapshot, { [stage]: false });

        const mandatoryDelta = withAll.mandatorySatisfied - without.mandatorySatisfied;
        const focalDelta = withAll.focalRecalled - without.focalRecalled;
        const tokenDelta = withAll.retrievedTokens - without.retrievedTokens;
        const exactImplementationDelta = withAll.exactImplementation - without.exactImplementation;
        // Inert means the stage changed nothing that reaches the model: same evidence, same order,
        // same size. Identical rankings are the strongest form of this - the stage ran and its
        // output was indistinguishable from its input.
        const inert = withAll.selectionSignature === without.selectionSignature
            && mandatoryDelta === 0 && focalDelta === 0 && tokenDelta === 0
            && exactImplementationDelta === 0;

        let verdict: StageAblationResult['verdict'];
        let reason: string;
        if (inert) {
            verdict = 'inert';
            reason = 'Disabling the stage produced an identical selection, order and token count. '
                + 'On this corpus it changes nothing that reaches the model.';
        } else if (exactImplementationDelta < 0) {
            // The strongest negative signal available here: enabling the stage costs a code-changing
            // task the exact implementation source it needs. Category coverage stays green while the
            // evidence gets worse, which is why this is checked before the coverage deltas.
            verdict = 'costs-more-than-it-returns';
            reason = `Enabling the stage loses ${-exactImplementationDelta} exact implementation `
                + 'candidate(s) that the pipeline renders without it.';
        } else if (mandatoryDelta > 0 || focalDelta > 0 || exactImplementationDelta > 0) {
            verdict = 'earns-its-place';
            reason = `Enabling the stage recovers ${mandatoryDelta} mandatory categor(ies), `
                + `${focalDelta} focal file(s) and ${exactImplementationDelta} exact implementation `
                + 'candidate(s) that are otherwise missed.';
        } else if (mandatoryDelta < 0 || focalDelta < 0) {
            verdict = 'costs-more-than-it-returns';
            reason = 'Enabling the stage loses evidence the pipeline finds without it.';
        } else if (tokenDelta < 0) {
            verdict = 'earns-its-place';
            reason = `Evidence quality is unchanged and the stage removes ${-tokenDelta} tokens.`;
        } else if (tokenDelta > 0) {
            verdict = 'costs-more-than-it-returns';
            reason = `Evidence quality is unchanged and the stage adds ${tokenDelta} tokens.`;
        } else {
            // The stage altered the ranking but nothing measured moved. Calling that a cost would
            // overstate it: reordering equally good evidence is neither a gain nor a loss here, it
            // is simply not something this corpus can distinguish.
            verdict = 'no-measured-effect';
            reason = 'The stage changed the selection or its order, but mandatory recall, focal '
                + 'recall and token count are all identical. This corpus cannot tell whether that '
                + 'reordering helps.';
        }

        results.push(Object.freeze({
            stage, withStage: withAll, withoutStage: without,
            mandatoryDelta, focalDelta, tokenDelta, exactImplementationDelta, inert, verdict, reason
        }));
    }

    // Restore the unmodified Maximum profile: an ablation run must not leave the process configured
    // differently from how it found it.
    applyFlags({});

    return Object.freeze({
        generatedAt: new Date().toISOString(),
        corpusCases: RETRIEVAL_PROMPTS.length + DISCRIMINATING_PROMPTS.length,
        results: Object.freeze(results),
        inertStages: Object.freeze(results.filter(row => row.inert).map(row => row.stage))
    });
}

/** Markdown rendering, written beside the savings report so both are reviewed together. */
export function renderAblationReport(report: AblationReport): string {
    const nl = String.fromCharCode(10);
    const lines: string[] = [
        '# Retrieval Stage Ablation',
        '',
        `> Generated: \`${report.generatedAt}\``,
        `> Corpus: ${report.corpusCases} retrieval prompts over this repository's own source, including`,
        `> ${DISCRIMINATING_PROMPTS.length} that deliberately name no symbol from the file they are about.`,
        '',
        'Each stage is disabled individually against the full Maximum Savings configuration.',
        'A stage earns its place by recovering mandatory or focal evidence, or by reducing tokens',
        'without losing either. Token cost is ranked last on purpose: fewer tokens for less evidence',
        'is not a saving.',
        '',
        `Baseline with every stage enabled: ${report.results[0]?.withStage.mandatorySatisfied ?? 0} mandatory `
            + `categories satisfied, focal file recalled in ${report.results[0]?.withStage.focalRecalled ?? 0}`
            + `/${report.corpusCases} cases, ${report.results[0]?.withStage.retrievedTokens ?? 0} tokens.`,
        '',
        '| Stage | Mandatory Δ | Focal Δ | Exact impl Δ | Token Δ | Verdict |',
        '|---|---:|---:|---:|---:|---|'
    ];
    for (const row of report.results) {
        lines.push(`| \`${row.stage}\` | ${row.mandatoryDelta} | ${row.focalDelta} `
            + `| ${row.exactImplementationDelta} | ${row.tokenDelta} | ${row.verdict} |`);
    }
    lines.push('');
    for (const row of report.results) {
        lines.push(`### \`${row.stage}\``, '', row.reason, '');
    }
    if (report.inertStages.length > 0) {
        lines.push('## Inert stages', '',
            'These changed nothing observable on this corpus. That is evidence they earn nothing here,',
            'not proof they are useless in general - one repository and five prompts is a narrow test.',
            'They should not be enabled by default on the strength of existing in the codebase.', '');
        for (const stage of report.inertStages) lines.push(`- \`${stage}\``);
        lines.push('');
    }
    return lines.join(nl);
}

/** Writes the report; returns its path. */
export function writeAblationReport(rootDir: string, report: AblationReport): string {
    const target = path.join(rootDir, 'validation', 'reports', 'retrieval-ablation.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, renderAblationReport(report), 'utf8');
    return target;
}
