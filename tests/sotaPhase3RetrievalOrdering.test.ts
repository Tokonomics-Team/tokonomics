/**
 * SOTA Alignment — Phase 3: retrieval ordering and task sufficiency.
 *
 * Two changes are asserted here. Exact duplicates are collapsed before anything expensive runs, so
 * reranking and diversity are not spent separating things that are not different. And sufficiency
 * became three-valued, because "not complete" covered two situations calling for opposite responses:
 * evidence with a declared gap should be sent as it is, while no evidence at all is the only state
 * that justifies falling back to attaching a whole file.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFallbackAttachment, resolveInitialAttachment, RequestContextEnvelope } from '../src/engine/requestContextEnvelope';

function envelope(): RequestContextEnvelope {
    return Object.freeze({
        envelopeId: 'env_phase3',
        contextMode: 'automatic',
        promptChars: 40,
        activeFilePath: 'src/engine/tokenizer.ts',
        documentVersion: 3,
        selectionText: '',
        documentIsDirty: false,
        unsavedBuffersPermitted: false,
        workspaceTrusted: true,
        retrievalAvailable: true
    }) as RequestContextEnvelope;
}

export async function runSotaPhase3RetrievalOrderingTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 3 Retrieval Ordering Tests ---');

    const rootDir = path.join(__dirname, '..');
    const retriever = fs.readFileSync(path.join(rootDir, 'src/retrieval/evidenceRetriever.ts'), 'utf8');

    // ---------------------------------------------------------------------
    // 1. Exact duplicates collapse before scoring, not after.
    // ---------------------------------------------------------------------
    // Ordering is the whole point: collapsing after ranking means the reranking cost has already
    // been paid and the top-K already skewed by redundant entries.
    const collapseAt = retriever.indexOf('collapseExactDuplicates(this.produceSeeds');
    const fuseAt = retriever.indexOf('this.fuse(seeds');
    assert.ok(collapseAt > 0, 'Seeds must pass through exact-duplicate collapsing');
    assert.ok(fuseAt > collapseAt,
        'Exact duplicates must be collapsed before fusion and reranking, not after');

    // Collapsing keys on category as well as content: the same bytes serving as the target
    // implementation and as a caller answer two different questions, and merging across that
    // would silently drop a required category.
    assert.ok(retriever.includes('${seed.candidate.category}:${seed.candidate.contentHash}'),
        'Duplicate collapsing must key on category and content together');

    // Provenance is inherited rather than discarded, so collapsing never loses where evidence was seen.
    assert.ok(retriever.includes('for (const tag of seed.candidate.provenance)'),
        'A collapsed duplicate must contribute its provenance to the survivor');

    // Near-duplicate merging stays after ranking, where the protected-distinction gates can see it.
    const semanticDedup = fs.readFileSync(path.join(rootDir, 'src/dedup/semanticDedup.ts'), 'utf8');
    assert.ok(/negation/i.test(semanticDedup) && /modifier/i.test(semanticDedup),
        'Near-duplicate merging must protect negations and modifiers from being merged away');

    // ---------------------------------------------------------------------
    // 2. Sufficiency is three-valued.
    // ---------------------------------------------------------------------
    const evidenceTypes = fs.readFileSync(path.join(rootDir, 'src/retrieval/evidenceTypes.ts'), 'utf8');
    assert.ok(evidenceTypes.includes("'complete' | 'incomplete_declared' | 'unusable'"),
        'Sufficiency must distinguish complete, incomplete-with-shortfall, and unusable');
    assert.ok(retriever.includes("exact.length === 0 ? 'unusable'"),
        'Unusable must mean nothing was rendered, not merely that the contract was incomplete');

    // ---------------------------------------------------------------------
    // 3. Only 'unusable' escalates to attaching a whole file.
    // ---------------------------------------------------------------------
    const base = envelope();
    const initial = resolveInitialAttachment(base);

    assert.strictEqual(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 5, sufficient: true, conservativeFallback: false,
        missingRequired: [], sufficiency: 'complete'
    }), undefined, 'Complete retrieval must not escalate');

    assert.strictEqual(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 2, sufficient: false, conservativeFallback: true,
        missingRequired: ['errorStackTrace'], sufficiency: 'incomplete_declared'
    }), undefined,
    'Evidence with a declared gap must be sent as it is; the gap is cheaper to declare than to fill '
    + 'by resending the whole file');

    const escalated = resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 0, sufficient: false, conservativeFallback: true,
        missingRequired: ['targetImplementation'], sufficiency: 'unusable'
    });
    assert.ok(escalated, 'Unusable retrieval must escalate to the declared fallback');
    assert.strictEqual(escalated.kind, 'full_document_fallback');

    // The tri-state is authoritative over the count when both are present: a caller reporting
    // 'incomplete_declared' alongside a zero count is trusted on the state, not the number.
    assert.strictEqual(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 0, sufficient: false, conservativeFallback: true,
        missingRequired: [], sufficiency: 'incomplete_declared'
    }), undefined, 'The retriever tri-state must take precedence over the raw candidate count');

    // Callers that predate the tri-state still work: absent sufficiency falls back to the count.
    assert.ok(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 0, sufficient: false, conservativeFallback: true,
        missingRequired: []
    }), 'Without a tri-state, a zero candidate count must still escalate');

    // ---------------------------------------------------------------------
    // 4. The measurement corpus is pinned, so the gate measures the compiler.
    // ---------------------------------------------------------------------
    // A gate whose inputs move whenever the project edits itself cannot tell a regression from a
    // rewrite. This is the defect that made a comment added to one corpus file look like the
    // compression rate halving.
    const measurement = fs.readFileSync(
        path.join(rootDir, 'validation/measurement/savingsMeasurement.ts'), 'utf8');
    assert.ok(measurement.includes('pinnedCorpusPath'),
        'The compression corpus must be read from pinned fixtures, not the working tree');

    const corpusDir = path.join(rootDir, 'validation', 'corpus');
    assert.ok(fs.existsSync(corpusDir), 'The pinned corpus directory must exist');
    const pinned = fs.readdirSync(corpusDir).filter(name => name.endsWith('.ts'));
    assert.strictEqual(pinned.length, 10,
        `The pinned corpus must contain all ten files, found ${pinned.length}`);

    // A pinned fixture must not be a copy that tracks the live file, or pinning achieved nothing.
    const pinnedModelProvider = fs.readFileSync(
        path.join(corpusDir, 'src__proxy__modelProvider.ts'), 'utf8');
    const liveModelProvider = fs.readFileSync(
        path.join(rootDir, 'src', 'proxy', 'modelProvider.ts'), 'utf8');
    assert.notStrictEqual(pinnedModelProvider, liveModelProvider,
        'The pinned corpus must be independent of the live source it was copied from');

    // ---------------------------------------------------------------------
    // 5. Lowering a tracked number requires a recorded reason.
    // ---------------------------------------------------------------------
    const gate = fs.readFileSync(path.join(rootDir, 'scripts/measure-savings.js'), 'utf8');
    assert.ok(gate.includes('describeLoweredMetrics') && gate.includes('--reason='),
        'Re-baselining a lowered metric must require an explicit recorded reason');

    const baseline = JSON.parse(fs.readFileSync(
        path.join(rootDir, 'validation/reports/savings-baseline.json'), 'utf8'));
    if (Array.isArray(baseline.acceptedRegressions) && baseline.acceptedRegressions.length > 0) {
        assert.ok(typeof baseline.reason === 'string' && baseline.reason.length > 0,
            'A baseline recording accepted regressions must also record why they were accepted');
    }

    // ---------------------------------------------------------------------
    // 6. No source file may look binary to the workspace index.
    // ---------------------------------------------------------------------
    // This guard exists because of a real defect that hid for a long time. The embedding provider
    // contained a raw NUL byte, written directly into a template literal as a bigram separator
    // instead of as an escape. VersionedWorkspaceIndex correctly treats any file containing NUL as
    // binary and skips it, so the file silently vanished from the index - and it happened to be the
    // exact file the retrieval corpus targets.
    //
    // Nothing failed. Retrieval still returned ten candidates, the evidence gate still read 5/5
    // rendered, context-free payloads stayed at zero, and the headline saving looked healthy. It was
    // simply retrieving other files. Every metric was green while the answer was wrong, which is the
    // most expensive kind of defect this project can have.
    //
    // A file dropping out of the index produces no error by design, so the guard has to be here.
    const sourceRoot = path.join(rootDir, 'src');
    const stack: string[] = [sourceRoot];
    const binaryLooking: string[] = [];
    let scanned = 0;
    while (stack.length > 0) {
        const current = stack.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) { stack.push(full); continue; }
            if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
            scanned++;
            if (fs.readFileSync(full).includes(0)) {
                binaryLooking.push(path.relative(rootDir, full));
            }
        }
    }
    assert.ok(scanned > 50, `Expected to scan the source tree, only saw ${scanned} files`);
    assert.deepStrictEqual(binaryLooking, [],
        'These source files contain a raw NUL byte and are silently excluded from the workspace '
        + 'index as binary, so nothing in them can ever be retrieved: ' + binaryLooking.join(', '));

    // ---------------------------------------------------------------------
    // 7. Retrieval-derived signals must tie back to their record.
    // ---------------------------------------------------------------------
    // The hybrid index stores relative paths while editor signals carry absolute ones. Matching only
    // on absolute path meant every dense signal failed to find its record, so those candidates
    // carried index-derived content that was never rehydrated into exact source and never declared
    // as a shortfall - it simply rendered as though it were the real thing.
    const retrieverSource = fs.readFileSync(path.join(rootDir, 'src/retrieval/evidenceRetriever.ts'), 'utf8');
    assert.ok(retrieverSource.includes('record.relativePath.replace'),
        'Signal-to-record matching must accept relative paths, not only absolute ones');
    assert.ok(retrieverSource.includes("sourceKind === 'dense'"),
        'Index-derived signals must be marked for rehydration; host-observed signals must not be');

    // ---------------------------------------------------------------------
    // 8. Stage ablation evidence exists and is generated, not asserted.
    // ---------------------------------------------------------------------
    const ablationReport = path.join(rootDir, 'validation', 'reports', 'retrieval-ablation.md');
    assert.ok(fs.existsSync(ablationReport),
        'Stage ablation evidence must exist: a stage that is enabled, budgeted and receipted but '
        + 'inert is indistinguishable from one that works until someone measures it');
    const ablationText = fs.readFileSync(ablationReport, 'utf8');
    for (const stage of ['enableDenseEmbeddings', 'enableCrossEncoder', 'enableMmrDiversity', 'enableSemanticDedup']) {
        assert.ok(ablationText.includes(stage), `Ablation must cover ${stage}`);
    }
    // The corpus must include prompts that name no symbol from the file they are about, or the
    // ablation measures the corpus rather than the stages.
    const ablationSource = fs.readFileSync(
        path.join(rootDir, 'validation/measurement/retrievalAblation.ts'), 'utf8');
    assert.ok(ablationSource.includes('DISCRIMINATING_PROMPTS'),
        'The ablation corpus must include prompts lexical matching cannot trivially win');
    // Focal recall is the metric that exposed the missing file; it must stay in the report.
    assert.ok(/focal file recalled in \d+\/\d+ cases/.test(ablationText),
        'The ablation must report absolute focal recall, not only deltas: a zero delta means nothing '
        + 'without knowing whether both arms succeeded or both failed');

    console.log('  ✓ Exact duplicates collapse before fusion and reranking.');
    console.log('  ✓ Collapsing keys on category and inherits provenance.');
    console.log('  ✓ Sufficiency distinguishes complete, declared-incomplete and unusable.');
    console.log('  ✓ Only unusable retrieval escalates to attaching a whole file.');
    console.log('  ✓ The compression corpus is pinned, so the gate measures the compiler.');
    console.log('  ✓ Lowering a tracked number requires a recorded reason.');
    console.log('  ✓ No source file is silently excluded from the index as binary.');
    console.log('  ✓ Retrieval-derived signals tie back to their snapshot record.');
    console.log('  ✓ Stage ablation evidence is generated, with absolute focal recall.');
    console.log('\n--- ALL SOTA PHASE 3 RETRIEVAL ORDERING TESTS PASSED ---\n');
}
