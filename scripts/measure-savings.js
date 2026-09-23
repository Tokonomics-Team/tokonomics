'use strict';

/**
 * Savings measurement gate.
 *
 * Runs the real compiler over this repository's own production TypeScript and records how much
 * input it removes, and how much of that removal costs the model information it needs.
 *
 * This is a REGRESSION gate, not a target gate. It does not assert that savings exceed some
 * desirable number, because asserting an aspiration would only encode the aspiration. It locks in
 * the measured behaviour and fails when that behaviour gets worse, so a change that trades quality
 * for tokens - or that quietly loses the savings that do exist - shows up in CI rather than in a
 * marketing number.
 *
 *   npm run measure:savings                     measure and compare against the baseline
 *   npm run measure:savings -- --update-baseline rewrite the baseline (review the diff)
 *   npm run measure:savings -- --json            print the full report as JSON
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'validation', 'reports', 'savings-baseline.json');
const jsonReportPath = path.join(root, 'validation', 'reports', 'savings-measurement.json');
const mdReportPath = path.join(root, 'validation', 'reports', 'savings-measurement.md');

/**
 * Allowed movement before a difference counts as a regression. Percentage points, absolute.
 * Small drift is expected because the corpus is live repository code.
 */
const TOLERANCE = {
    reductionPct: 2.0,
    losslessCases: 0,
    degradedButGatePassedCases: 0
};

async function build() {
    const outDir = path.join(root, 'out_test');
    fs.mkdirSync(outDir, { recursive: true });
    const entry = path.join(outDir, 'savings_entry.ts');
    fs.writeFileSync(entry, [
        "import { runSavingsMeasurement } from '../validation/measurement/savingsMeasurement';",
        'export { runSavingsMeasurement };'
    ].join('\n'), 'utf8');
    const outfile = path.join(outDir, 'savings_runner.js');
    await esbuild.build({
        entryPoints: [entry],
        bundle: true, platform: 'node', target: 'node20', format: 'cjs',
        alias: { vscode: path.join(root, 'tests', 'mock-vscode.ts') },
        external: ['web-tree-sitter'],
        outfile, sourcemap: false, logLevel: 'error'
    });
    return require(outfile);
}

function pct(value) { return `${value.toFixed(1)}%`; }

function renderMarkdown(report) {
    const lines = [];
    lines.push('# Tokonomics Savings Measurement');
    lines.push('');
    lines.push(`> Generated: \`${report.generatedAt}\``);
    lines.push(`> Classification: \`${report.classification}\``);
    lines.push('');
    lines.push('Measured by running the production compiler over this repository\'s own TypeScript.');
    lines.push('A case is **lossless** when every exported name and every public method survives and at');
    lines.push(`least ${(report.corpus.controlFlowFloor * 100).toFixed(0)}% of control-flow constructs remain in what the model receives.`);
    lines.push('');

    for (const profile of report.profiles) {
        lines.push(`## Profile: ${profile.profile}`);
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|---|---:|');
        lines.push(`| Cases | ${profile.cases} |`);
        lines.push(`| Overall input reduction | ${pct(profile.overallReductionPct)} |`);
        lines.push(`| Task-weighted reduction | ${pct(profile.weightedReductionPct)} |`);
        lines.push(`| Lossless cases | ${profile.losslessCases} / ${profile.cases} |`);
        lines.push(`| **Reduction on lossless cases** | **${pct(profile.losslessReductionPct)}** |`);
        lines.push(`| Degraded cases | ${profile.degradedCases} / ${profile.cases} |`);
        lines.push(`| Reduction on degraded cases | ${pct(profile.degradedReductionPct)} |`);
        lines.push(`| Degraded yet no gate fired | ${profile.degradedButGatePassedCases} |`);
        lines.push(`| Lowest control-flow retention | ${(profile.minControlFlowRetention * 100).toFixed(0)}% |`);
        lines.push(`| Instruction intact | ${profile.instructionIntactCases} / ${profile.cases} |`);
        lines.push('');
        lines.push('| File | Task | Before | After | Reduction | Exported kept | Public kept | Control flow | Verdict |');
        lines.push('|---|---|---:|---:|---:|---:|---:|---:|---|');
        for (const row of profile.results) {
            const exported = row.exportedTotal ? `${row.exportedKept}/${row.exportedTotal}` : 'n/a';
            const publics = row.publicTotal ? `${row.publicKept}/${row.publicTotal}` : 'n/a';
            lines.push(`| \`${path.basename(row.file)}\` | ${row.task} | ${row.beforeTokens} | ${row.afterTokens} | ${row.reductionPct}% | ${exported} | ${publics} | ${(row.controlFlowRetention * 100).toFixed(0)}% | ${row.lossless ? 'lossless' : 'DEGRADED'} |`);
        }
        lines.push('');
    }

    if (report.capacity) {
        console.log('' + String.fromCharCode(10) + 'session capacity   (agentic turns before the context window is exhausted)');
        for (const row of report.capacity) {
            console.log(`  ${String(row.windowTokens / 1000 + 'k').padEnd(8)} `
                + `${String(row.unmaskedTurnLimit).padStart(5)} -> ${String(row.maskedTurnLimit).padStart(5)} turns`
                + `   ${row.capacityMultiple}x more work per session`);
        }
        console.log('  This is capacity, not answer quality: a longer session is worthless if the');
        console.log('  answers degrade, and that remains untested.');
    }

    for (const summary of report.retrieval || []) {
        lines.push(`## Retrieval-first: ${summary.profile}`);
        lines.push('');
        lines.push('Bare instruction plus workspace retrieval, versus forwarding the whole subsystem bundle.');
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|---|---:|');
        lines.push(`| Cases | ${summary.cases} |`);
        lines.push(`| Attached bundle | ${summary.attachedTokensTotal} tokens |`);
        lines.push(`| Retrieved | ${summary.retrievedTokensTotal} tokens |`);
        lines.push(`| **Saving vs attaching** | **${pct(summary.savingPct)}** |`);
        lines.push(`| Evidence rendered | ${summary.evidenceRenderedCases} / ${summary.cases} |`);
        lines.push(`| Context-free payloads | ${summary.contextFreePayloads} (must be 0) |`);
        lines.push('');
        lines.push('| Task | Attached | Retrieved | Saving | Candidates | Contract | Rendered | Shortfall | Carries code |');
        lines.push('|---|---:|---:|---:|---:|---|---|---|---|');
        for (const row of summary.results) {
            lines.push(`| ${row.task} | ${row.attachedTokens} | ${row.retrievedTokens} | ${row.savingPct}% | `
                + `${row.candidatesAdmitted} | ${row.contractComplete ? 'complete' : 'incomplete'} | `
                + `${row.evidenceRendered ? 'yes' : 'no'} | ${row.shortfallDeclared ? 'declared' : '—'} | `
                + `${row.carriesContext ? 'yes' : '**NO**'} |`);
        }
        lines.push('');
    }

    if (report.agentic) {
        const a = report.agentic;
        lines.push('## Agentic trajectory (observation masking)');
        lines.push('');
        lines.push('Tool observations are the bulk of a long agentic turn and bypass the text compiler entirely,');
        lines.push('because a request carrying tool results is structured and forwarded unchanged.');
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|---|---:|');
        lines.push(`| Tool calls | ${a.toolCalls} |`);
        lines.push(`| Observation characters | ${a.observationChars} |`);
        lines.push(`| Payload | ${a.payloadCharsBefore} -> ${a.payloadCharsAfter} chars |`);
        lines.push(`| **Masking reduction** | **${pct(a.reductionPct)}** |`);
        lines.push(`| Observations masked | ${a.maskedObservations} / ${a.toolCalls} |`);
        lines.push(`| Message count preserved | ${a.messageCountPreserved} |`);
        lines.push(`| Tool-call identifiers preserved | ${a.callIdsPreserved} |`);
        lines.push(`| Recent observations intact | ${a.recentObservationsIntact} |`);
        lines.push(`| Boundary stable across turns | ${a.boundaryStableAcrossTurns} |`);
        lines.push('');
    }

    lines.push('## Corpus');
    lines.push('');
    lines.push('| File | Lines | SHA-256 |');
    lines.push('|---|---:|---|');
    for (const file of report.corpus.files) {
        lines.push(`| \`${file.path}\` | ${file.lines} | \`${file.sha256.slice(0, 16)}…\` |`);
    }
    lines.push('');
    lines.push('## Limitations');
    lines.push('');
    for (const limitation of report.limitations) lines.push(`- ${limitation}`);
    lines.push('');
    return lines.join('\n');
}

function toBaseline(report) {
    return {
        schemaVersion: 2,
        recordedAt: report.generatedAt,
        corpusHashes: Object.fromEntries(report.corpus.files.map(file => [file.path, file.sha256])),
        agentic: report.agentic ? {
            reductionPct: report.agentic.reductionPct,
            maskedObservations: report.agentic.maskedObservations
        } : undefined,
        retrieval: Object.fromEntries((report.retrieval || []).map(summary => [summary.profile, {
            savingPct: summary.savingPct,
            contextFreePayloads: summary.contextFreePayloads,
            evidenceRenderedCases: summary.evidenceRenderedCases,
            cases: summary.cases
        }])),
        profiles: Object.fromEntries(report.profiles.map(profile => [profile.profile, {
            overallReductionPct: profile.overallReductionPct,
            weightedReductionPct: profile.weightedReductionPct,
            losslessCases: profile.losslessCases,
            losslessReductionPct: profile.losslessReductionPct,
            degradedCases: profile.degradedCases,
            degradedReductionPct: profile.degradedReductionPct,
            degradedButGatePassedCases: profile.degradedButGatePassedCases,
            cases: profile.cases
        }]))
    };
}

function compare(report, baseline) {
    const problems = [];
    const notes = [];

    for (const [file, hash] of Object.entries(baseline.corpusHashes || {})) {
        const current = report.corpus.files.find(entry => entry.path === file);
        if (!current) { notes.push(`corpus file removed since baseline: ${file}`); continue; }
        if (current.sha256 !== hash) notes.push(`corpus file changed since baseline: ${file}`);
    }
    for (const file of report.corpus.files) {
        if (!(file.path in (baseline.corpusHashes || {}))) notes.push(`corpus file added since baseline: ${file.path}`);
    }

    for (const profile of report.profiles) {
        const previous = (baseline.profiles || {})[profile.profile];
        if (!previous) { notes.push(`no baseline for profile ${profile.profile}`); continue; }

        // Losing savings is a regression.
        if (profile.overallReductionPct < previous.overallReductionPct - TOLERANCE.reductionPct) {
            problems.push(`${profile.profile}: overall reduction fell ${previous.overallReductionPct}% -> ${profile.overallReductionPct}%`);
        }
        // Losing safety is a worse regression: fewer cases that keep everything the model needs.
        if (profile.losslessCases < previous.losslessCases - TOLERANCE.losslessCases) {
            problems.push(`${profile.profile}: lossless cases fell ${previous.losslessCases} -> ${profile.losslessCases}`);
        }
        // Buying tokens with quality is the failure mode this gate exists to catch.
        if (profile.degradedButGatePassedCases > previous.degradedButGatePassedCases + TOLERANCE.degradedButGatePassedCases) {
            problems.push(`${profile.profile}: cases degraded without any preservation gate firing rose ${previous.degradedButGatePassedCases} -> ${profile.degradedButGatePassedCases}`);
        }
        if (profile.overallReductionPct > previous.overallReductionPct + TOLERANCE.reductionPct
            && profile.losslessCases <= previous.losslessCases) {
            problems.push(`${profile.profile}: reduction rose to ${profile.overallReductionPct}% without any gain in lossless cases; verify the extra savings did not come from removing needed content`);
        }
    }
    for (const summary of report.retrieval || []) {
        const previous = (baseline.retrieval || {})[summary.profile];

        // The hard invariant, independent of any baseline. A retrieval-first payload that carries no
        // code is a broken request, and a token counter scores it as a near-total saving - which is
        // exactly how it went unnoticed. This must never regress, so it fails on its own terms.
        if (summary.contextFreePayloads > 0) {
            problems.push(`${summary.profile}: ${summary.contextFreePayloads} retrieval-first request(s) produced a payload `
                + 'with no code. A token counter reads this as a large saving; it is a broken request.');
        }

        // Exact implementation source is the Phase 2 invariant. Evidence that reads as code but is a
        // pruned skeleton is worse than absent evidence: it looks sufficient and is not, and a token
        // counter rewards it. Explain and search legitimately answer at signature level, so only
        // tasks that actually change code are held to this.
        // Exact duplicates must be collapsed before ranking; two nominations of the same bytes are
        // one piece of evidence, and paying for both is paying twice for nothing.
        const duplicates = summary.results.reduce((sum, row) => sum + row.duplicateSelected, 0);
        if (duplicates > 0) {
            problems.push(`${summary.profile}: ${duplicates} selected candidate(s) carried byte-identical `
                + 'content. Exact duplicates must be collapsed before ranking.');
        }
        if (summary.inexactEvidenceTotal > 0) {
            problems.push(`${summary.profile}: ${summary.inexactEvidenceTotal} implementation candidate(s) were `
                + 'rendered without exact source. A skeleton may nominate evidence; it may never be the evidence.');
        }
        if (summary.casesExactSatisfied < summary.casesRequiringExact) {
            problems.push(`${summary.profile}: only ${summary.casesExactSatisfied}/${summary.casesRequiringExact} `
                + 'code-changing task(s) received exact implementation source.');
        }

        if (!previous) { notes.push(`no retrieval baseline for profile ${summary.profile}`); continue; }
        if (summary.savingPct < previous.savingPct - TOLERANCE.reductionPct) {
            problems.push(`${summary.profile}: retrieval-first saving fell ${previous.savingPct}% -> ${summary.savingPct}%`);
        }
        if (summary.evidenceRenderedCases < previous.evidenceRenderedCases) {
            problems.push(`${summary.profile}: retrieval rendered evidence in fewer cases `
                + `(${previous.evidenceRenderedCases} -> ${summary.evidenceRenderedCases})`);
        }
    }

    const agentic = report.agentic;
    if (agentic) {
        // These are correctness invariants, not baselines. Masking that drops a message, loses a
        // tool-call identifier, or eats the most recent observation is broken regardless of how much
        // it saved - and it would still look like a large saving on a token counter.
        if (!agentic.messageCountPreserved) problems.push('agentic: observation masking changed the message count');
        if (!agentic.callIdsPreserved) problems.push('agentic: observation masking altered tool-call identifiers');
        if (!agentic.recentObservationsIntact) problems.push('agentic: the most recent tool observations were masked');
        if (!agentic.boundaryStableAcrossTurns) {
            problems.push('agentic: the masking boundary moves every turn, which rewrites the prompt prefix on every '
                + 'request and invalidates the provider cache');
        }
        const previousAgentic = baseline.agentic;
        if (previousAgentic && agentic.reductionPct < previousAgentic.reductionPct - TOLERANCE.reductionPct) {
            problems.push(`agentic: masking reduction fell ${previousAgentic.reductionPct}% -> ${agentic.reductionPct}%`);
        }
    }

    return { problems, notes };
}

/** Tracked numbers that the new report lowers relative to the recorded baseline. */
function describeLoweredMetrics(previous, report) {
    if (!previous) return [];
    const lowered = [];
    // The baseline keys profiles and retrieval summaries by name, while the live report lists them.
    for (const profile of report.profiles || []) {
        const before = (previous.profiles || {})[profile.profile];
        if (before && profile.losslessReductionPct < before.losslessReductionPct) {
            lowered.push(`${profile.profile}: reduction without degradation `
                + `${before.losslessReductionPct}% -> ${profile.losslessReductionPct}%`);
        }
    }
    for (const summary of report.retrieval || []) {
        const before = (previous.retrieval || {})[summary.profile];
        if (before && summary.savingPct < before.savingPct) {
            lowered.push(`${summary.profile}: retrieval-first saving `
                + `${before.savingPct}% -> ${summary.savingPct}%`);
        }
    }
    if (report.agentic && previous.agentic
        && report.agentic.reductionPct < previous.agentic.reductionPct) {
        lowered.push(`agentic masking ${previous.agentic.reductionPct}% -> ${report.agentic.reductionPct}%`);
    }
    return lowered;
}

async function main() {
    const args = process.argv.slice(2);
    const updateBaseline = args.includes('--update-baseline');
    // A re-baseline that lowers a tracked number is an accepted regression, and an accepted
    // regression with no recorded reason is indistinguishable from an unnoticed one. The reason is
    // stored in the baseline itself so the next reader learns why the bar moved.
    const reasonArg = args.find(arg => arg.startsWith('--reason='));
    const baselineReason = reasonArg ? reasonArg.slice('--reason='.length).trim() : '';
    const asJson = args.includes('--json');

    const { runSavingsMeasurement } = await build();
    const report = await runSavingsMeasurement(root);

    fs.mkdirSync(path.dirname(jsonReportPath), { recursive: true });
    fs.writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(mdReportPath, renderMarkdown(report), 'utf8');

    if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }

    console.log('='.repeat(84));
    console.log('TOKONOMICS SAVINGS MEASUREMENT — real production code, not synthetic fixtures');
    console.log('='.repeat(84));
    for (const profile of report.profiles) {
        console.log(`\nprofile: ${profile.profile}   (${profile.cases} cases)`);
        console.log(`  overall input reduction        ${pct(profile.overallReductionPct)}   (${profile.overallBeforeTokens} -> ${profile.overallAfterTokens} tokens)`);
        console.log(`  task-weighted reduction        ${pct(profile.weightedReductionPct)}`);
        console.log(`  lossless cases                 ${profile.losslessCases}/${profile.cases}`);
        console.log(`  REDUCTION WITHOUT DEGRADATION  ${pct(profile.losslessReductionPct)}`);
        console.log(`  degraded cases                 ${profile.degradedCases}/${profile.cases}  (reduction ${pct(profile.degradedReductionPct)})`);
        console.log(`  degraded, no gate fired        ${profile.degradedButGatePassedCases}`);
        console.log(`  lowest control-flow retention  ${(profile.minControlFlowRetention * 100).toFixed(0)}%`);
    }

    for (const summary of report.retrieval || []) {
        console.log(`
retrieval-first: ${summary.profile}   (${summary.cases} cases)`);
        console.log(`  attach bundle -> retrieve      ${summary.attachedTokensTotal} -> ${summary.retrievedTokensTotal} tokens`);
        console.log(`  SAVING vs attaching            ${pct(summary.savingPct)}`);
        console.log(`  evidence rendered              ${summary.evidenceRenderedCases}/${summary.cases}`);
        console.log(`  context-free payloads          ${summary.contextFreePayloads}   (must be 0)`);
        console.log(`  exact implementation source    ${summary.casesExactSatisfied}/${summary.casesRequiringExact} cases that require it`);
        console.log(`  inexact implementation evidence ${summary.inexactEvidenceTotal}   (must be 0)`);
    }

    if (report.agentic) {
        const a = report.agentic;
        console.log(`
agentic trajectory   (${a.toolCalls} tool calls, ${a.observationChars} observation chars)`);
        console.log(`  payload                        ${a.payloadCharsBefore} -> ${a.payloadCharsAfter} chars`);
        console.log(`  MASKING REDUCTION              ${pct(a.reductionPct)}`);
        console.log(`  observations masked            ${a.maskedObservations}/${a.toolCalls}`);
        console.log(`  protocol preserved             messages=${a.messageCountPreserved} callIds=${a.callIdsPreserved} recent=${a.recentObservationsIntact}`);
        console.log(`  boundary stable across turns   ${a.boundaryStableAcrossTurns}   (false invalidates the prefix cache)`);
    }

    if (updateBaseline) {
        const previousBaseline = fs.existsSync(baselinePath)
            ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
            : undefined;
        const lowered = describeLoweredMetrics(previousBaseline, report);
        if (lowered.length > 0 && !baselineReason) {
            console.error(String.fromCharCode(10) + 'This baseline lowers a tracked number:');
            for (const item of lowered) console.error('  - ' + item);
            console.error(String.fromCharCode(10)
                + 'Re-run with --reason="why this is acceptable" so the decision is recorded.');
            process.exitCode = 1;
            return;
        }
        const next = toBaseline(report);
        if (baselineReason) next.reason = baselineReason;
        if (lowered.length > 0) next.acceptedRegressions = lowered;
        fs.writeFileSync(baselinePath, JSON.stringify(next, null, 2) + String.fromCharCode(10), 'utf8');
        console.log(`\nBaseline rewritten: ${path.relative(root, baselinePath)}`);
        console.log('Review the diff before committing; this file is what future runs are judged against.');
        return;
    }

    if (!fs.existsSync(baselinePath)) {
        console.error('\nNo baseline recorded. Run: npm run measure:savings -- --update-baseline');
        process.exitCode = 1;
        return;
    }

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const { problems, notes } = compare(report, baseline);

    for (const note of notes) console.log(`\n  note: ${note}`);
    if (notes.length > 0) {
        console.log('  Corpus drift does not fail the gate, but the recorded numbers describe different');
        console.log('  input than the baseline did. Re-record with --update-baseline once reviewed.');
    }

    if (problems.length > 0) {
        console.error('\nSAVINGS GATE FAILED');
        for (const problem of problems) console.error(`  - ${problem}`);
        console.error(`\nEvidence: ${path.relative(root, mdReportPath)}`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nSavings gate passed. Evidence: ${path.relative(root, mdReportPath)}`);
    console.log('This measures information retention, not downstream answer quality.');
}

main().catch(error => {
    console.error('\nSavings measurement failed:', error);
    process.exit(1);
});
