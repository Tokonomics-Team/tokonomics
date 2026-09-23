/**
 * SOTA Alignment — Phase 1: production-parity context entry.
 *
 * The defect these tests close: automatic mode attached the whole active document *and* ran
 * workspace retrieval, so production sent both while the benchmark measured retrieval used instead
 * of attachment. The two were not measuring the same thing.
 *
 * The attachment policy is a pure module precisely so this can be asserted without an Extension
 * Host. The wiring that consumes it is covered by the participant's own suites.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    RequestContextEnvelope, AttachmentDecision, resolveInitialAttachment, resolveFallbackAttachment,
    buildAttachmentReceipt, isDeliberateSelection, mayReadDocument, MINIMUM_DELIBERATE_SELECTION_CHARS
} from '../src/engine/requestContextEnvelope';
import {
    collectSignalSnapshot, classifyDiagnosticMessage,
    MAX_COLLECTED_DIAGNOSTICS, MAX_DIAGNOSTIC_MESSAGE_CHARS
} from '../src/workspace/signalCollection';

const BODY = 'export function compute(a: number, b: number): number { return a * b + 1; }';

function envelope(overrides: Partial<RequestContextEnvelope> = {}): RequestContextEnvelope {
    return Object.freeze({
        envelopeId: 'env_test_1',
        contextMode: 'automatic',
        promptChars: 40,
        activeFilePath: 'src/engine/tokenizer.ts',
        documentVersion: 7,
        cursorLine: 12,
        selectionText: '',
        documentIsDirty: false,
        unsavedBuffersPermitted: false,
        workspaceTrusted: true,
        retrievalAvailable: true,
        ...overrides
    }) as RequestContextEnvelope;
}

export async function runSotaPhase1ContextEntryTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 1 Context Entry Tests ---');

    // ---------------------------------------------------------------------
    // 1. The core invariant: never a full file AND a retrieval pack.
    // ---------------------------------------------------------------------
    // Asserted across every reachable combination rather than on one example, because the defect was
    // not a special case - it was the default path.
    for (const contextMode of ['off', 'selection', 'automatic'] as const) {
        for (const retrievalAvailable of [true, false]) {
            for (const selectionText of ['', BODY]) {
                for (const documentIsDirty of [true, false]) {
                    for (const unsavedBuffersPermitted of [true, false]) {
                        const decision = resolveInitialAttachment(envelope({
                            contextMode, retrievalAvailable, selectionText,
                            documentIsDirty, unsavedBuffersPermitted
                        }));
                        assert.ok(!(decision.attachFullDocument && decision.allowRetrieval),
                            `mode=${contextMode} retrieval=${retrievalAvailable} selection=${selectionText.length} `
                            + 'must never attach the full document and authorise retrieval at once');
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // 2. Automatic mode retrieves first instead of attaching.
    // ---------------------------------------------------------------------
    const automatic = resolveInitialAttachment(envelope());
    assert.strictEqual(automatic.kind, 'retrieval_first');
    assert.strictEqual(automatic.attachFullDocument, false,
        'Automatic mode must not attach the whole active document on the first pass');
    assert.strictEqual(automatic.allowRetrieval, true);

    // ---------------------------------------------------------------------
    // 3. An explicit selection is mandatory exact evidence.
    // ---------------------------------------------------------------------
    const selected = resolveInitialAttachment(envelope({ selectionText: BODY }));
    assert.strictEqual(selected.kind, 'exact_selection');
    assert.strictEqual(selected.attachSelection, true);
    assert.strictEqual(selected.attachFullDocument, false,
        'A selection must not escalate into sending the whole file');

    // A trivial selection is a cursor artifact, not evidence.
    const trivial = 'x'.repeat(MINIMUM_DELIBERATE_SELECTION_CHARS);
    assert.strictEqual(isDeliberateSelection(trivial), false);
    assert.strictEqual(isDeliberateSelection(trivial + 'yy'), true);

    // ---------------------------------------------------------------------
    // 4. Selection and off modes read nothing they were not authorised to read.
    // ---------------------------------------------------------------------
    const off = resolveInitialAttachment(envelope({ contextMode: 'off' }));
    assert.deepStrictEqual(
        { retrieval: off.allowRetrieval, full: off.attachFullDocument, selection: off.attachSelection },
        { retrieval: false, full: false, selection: false },
        'Off mode must read nothing at all');

    const selectionMode = resolveInitialAttachment(envelope({ contextMode: 'selection', selectionText: BODY }));
    assert.strictEqual(selectionMode.allowRetrieval, false,
        'Selection mode must never authorise workspace retrieval');
    assert.strictEqual(selectionMode.attachFullDocument, false);
    assert.strictEqual(selectionMode.attachSelection, true);

    // ---------------------------------------------------------------------
    // 5. Unsaved buffers require their own consent.
    // ---------------------------------------------------------------------
    const dirtyWithoutConsent = envelope({ documentIsDirty: true, unsavedBuffersPermitted: false, selectionText: BODY });
    assert.strictEqual(mayReadDocument(dirtyWithoutConsent), false,
        'A dirty buffer must be unreadable without Include Unsaved Changes');
    const dirtyDecision = resolveInitialAttachment(dirtyWithoutConsent);
    assert.strictEqual(dirtyDecision.attachSelection, false,
        'An unsaved selection must not be attached without consent');
    assert.strictEqual(dirtyDecision.attachFullDocument, false);

    const dirtyWithConsent = resolveInitialAttachment(
        envelope({ documentIsDirty: true, unsavedBuffersPermitted: true, selectionText: BODY }));
    assert.strictEqual(dirtyWithConsent.attachSelection, true,
        'With consent, the unsaved selection is exact evidence like any other');

    // An untrusted workspace is unreadable regardless of consent.
    assert.strictEqual(mayReadDocument(envelope({ workspaceTrusted: false, unsavedBuffersPermitted: true })), false);

    // ---------------------------------------------------------------------
    // 6. The fallback fires only after retrieval has actually been tried.
    // ---------------------------------------------------------------------
    const base = envelope();
    const initial = resolveInitialAttachment(base);

    // Retrieval produced evidence: no fallback. This is the case the saving comes from.
    assert.strictEqual(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 4, sufficient: true, conservativeFallback: false, missingRequired: []
    }), undefined, 'Successful retrieval must not trigger a full-file fallback');

    // An incomplete contract with rendered evidence is declared as a shortfall, not escalated: the
    // model is told what is missing, which costs far less than resending the file.
    assert.strictEqual(resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 3, sufficient: false, conservativeFallback: true,
        missingRequired: ['errorStackTrace']
    }), undefined, 'An incomplete contract with evidence must not escalate to the whole file');

    // Retrieval admitted nothing: the fallback is warranted and declared.
    const fellBack = resolveFallbackAttachment(base, initial, {
        attempted: true, selectedCount: 0, sufficient: false, conservativeFallback: true,
        missingRequired: ['targetImplementation']
    });
    assert.ok(fellBack, 'Zero admitted evidence must fall back rather than send a prompt with no code');
    assert.strictEqual(fellBack.kind, 'full_document_fallback');
    assert.strictEqual(fellBack.attachFullDocument, true);
    assert.ok(fellBack.reason.includes('targetImplementation'),
        'The fallback must record which required evidence was missing');

    // A fallback cannot be reached from a mode that never retrieved.
    for (const mode of ['off', 'selection'] as const) {
        const modeEnvelope = envelope({ contextMode: mode });
        const modeInitial = resolveInitialAttachment(modeEnvelope);
        assert.strictEqual(resolveFallbackAttachment(modeEnvelope, modeInitial, {
            attempted: false, selectedCount: 0, sufficient: false, conservativeFallback: true, missingRequired: []
        }), undefined, `${mode} mode must never reach the full-document fallback`);
    }

    // ---------------------------------------------------------------------
    // 7. No index at all is an immediately declared fallback, not silence.
    // ---------------------------------------------------------------------
    const noIndex = resolveInitialAttachment(envelope({ retrievalAvailable: false }));
    assert.strictEqual(noIndex.kind, 'full_document_fallback');
    assert.strictEqual(noIndex.allowRetrieval, false);
    assert.strictEqual(noIndex.attachFullDocument, true,
        'With nothing to retrieve from, the document is the only evidence available');

    // ---------------------------------------------------------------------
    // 8. The receipt makes a fallback visible and priced.
    // ---------------------------------------------------------------------
    const receipt = buildAttachmentReceipt(base, fellBack, 4820);
    assert.strictEqual(receipt.fellBack, true);
    assert.strictEqual(receipt.fallbackTokens, 4820,
        'The fallback must record what it cost, so it is never absorbed into a savings figure');
    assert.strictEqual(receipt.envelopeId, base.envelopeId);

    const cheapReceipt = buildAttachmentReceipt(base, automatic, 0);
    assert.strictEqual(cheapReceipt.fellBack, false);
    assert.strictEqual(cheapReceipt.fallbackTokens, 0);

    // ---------------------------------------------------------------------
    // 9. Both entry points consume the same policy module.
    // ---------------------------------------------------------------------
    // Parity asserted structurally: if either path stops importing the shared policy, it has
    // acquired a second context strategy, which is the condition this phase exists to remove.
    const rootDir = path.join(__dirname, '..');
    for (const entryPoint of ['src/proxy/chatParticipant.ts', 'src/proxy/modelProvider.ts']) {
        const source = fs.readFileSync(path.join(rootDir, entryPoint), 'utf8');
        assert.ok(source.includes("from '../engine/requestContextEnvelope'"),
            `${entryPoint} must build its context through the shared envelope policy`);
        assert.ok(source.includes('resolveInitialAttachment'),
            `${entryPoint} must resolve attachment through the shared policy`);
    }

    // The participant must no longer be able to authorise retrieval from the mode alone; that
    // expression is exactly what paired a full file with a retrieval pack.
    const participant = fs.readFileSync(path.join(rootDir, 'src/proxy/chatParticipant.ts'), 'utf8');
    assert.ok(!participant.includes("allowWorkspaceRetrieval: contextMode === 'automatic'"),
        'Retrieval must be authorised by the attachment decision, not by the context mode alone');

    // ---------------------------------------------------------------------
    // 10. The signal snapshot is actually built and supplied.
    // ---------------------------------------------------------------------
    // The orchestrator has always accepted a WorkspaceSignalSnapshot and uses it to reject evidence
    // captured against a stale document version and to feed the signal engines. No production caller
    // supplied one, so those engines received nothing in the shipped extension. The field existed and
    // the snapshot did not, which is worse than the field not existing at all.
    const participantSource = fs.readFileSync(path.join(rootDir, 'src/proxy/chatParticipant.ts'), 'utf8');
    assert.ok(participantSource.includes('collectSignalSnapshot('),
        'The participant must build a signal snapshot');
    assert.ok(/signalSnapshot,/.test(participantSource),
        'The signal snapshot must be passed to the compiler, not merely built');

    const signalBase = {
        snapshotGeneration: 4,
        capturedAt: 1_700_000_000_000,
        workspaceContextAuthorised: true,
        workspaceTrusted: true,
        activeFilePath: 'src/engine/budget.ts',
        documentUri: 'file:///repo/src/engine/budget.ts',
        documentVersion: 12,
        cursorLine: 40
    };

    // Consent gates collection entirely: an untrusted workspace or a disabled context mode yields
    // no snapshot at all, not an empty one.
    assert.strictEqual(collectSignalSnapshot({ ...signalBase, workspaceTrusted: false }), undefined,
        'An untrusted workspace must produce no snapshot');
    assert.strictEqual(collectSignalSnapshot({ ...signalBase, workspaceContextAuthorised: false }), undefined,
        'Workspace context off must produce no snapshot');

    const snapshot = collectSignalSnapshot({
        ...signalBase,
        diagnostics: [
            { message: "Cannot find name 'resolveCeiling'.", severity: 0, source: 'ts', startLine: 41 },
            { message: "Type 'string' is not assignable to type 'number'.", severity: 0, source: 'ts', startLine: 12 },
            { message: 'Prefer const over let.', severity: 1, source: 'eslint', startLine: 3 },
            { message: 'Consider extracting this method.', severity: 3, source: 'hint', startLine: 8 }
        ]
    });
    assert.ok(snapshot, 'A trusted, authorised request with an active document must produce a snapshot');

    // The document version travels with the snapshot: it is what lets the orchestrator discard
    // evidence captured against a file that has since changed.
    assert.strictEqual(snapshot.cursorSelection?.documentVersion, 12,
        'The document version must be captured, or staleness cannot be detected at all');
    assert.strictEqual(snapshot.snapshotGeneration, 4);

    // Hints are editor suggestions rather than problems, and are noise in an evidence contract.
    assert.strictEqual(snapshot.diagnostics?.length, 3,
        'Hints must not be collected as diagnostics');
    assert.ok(snapshot.diagnostics?.every(item => item.documentVersion === 12),
        'Each diagnostic must carry the version it was observed against');

    // Errors sort ahead of warnings: a request with both is almost always about the errors.
    assert.strictEqual(snapshot.diagnostics?.[0].severity, 'error');
    assert.strictEqual(snapshot.diagnostics?.[2].severity, 'warning');

    // Classification is specific where it can be and conservative where it cannot.
    assert.strictEqual(classifyDiagnosticMessage("Cannot find name 'x'."), 'undefined_symbol');
    assert.strictEqual(classifyDiagnosticMessage("Type 'string' is not assignable to type 'number'."), 'type_mismatch');
    assert.strictEqual(classifyDiagnosticMessage('Unexpected token }'), 'syntax_error');
    assert.strictEqual(classifyDiagnosticMessage('Something nobody has a pattern for'), 'build_failure',
        'An unrecognised message must fall back to the least specific category, not be guessed');

    // Bounded: a snapshot that grows with the size of the problem can dominate the payload it exists
    // to inform.
    const flooded = collectSignalSnapshot({
        ...signalBase,
        diagnostics: Array.from({ length: 500 }, (_, index) => ({
            message: `Error number ${index} with a very long tail `.repeat(40),
            severity: 0, source: 'ts', startLine: index
        }))
    });
    assert.ok((flooded?.diagnostics?.length ?? 0) <= MAX_COLLECTED_DIAGNOSTICS,
        'Diagnostic collection must be bounded');
    assert.ok(flooded?.diagnostics?.every(item => item.message.length <= MAX_DIAGNOSTIC_MESSAGE_CHARS),
        'Individual diagnostic messages must be truncated');

    // Test outcomes, Git history and terminal output are deliberately not collected: each is a
    // separate consent decision about a new category of data leaving the machine, and terminal
    // output in particular routinely contains credentials and unrelated work.
    assert.strictEqual(snapshot.testOutcomes, undefined,
        'Test outcomes must not be collected without their own consent');
    assert.strictEqual(snapshot.gitHistory, undefined,
        'Git history must not be collected without its own consent');
    assert.strictEqual(snapshot.terminalContext, undefined,
        'Terminal output must not be collected without its own consent');

    console.log('  ✓ Automatic mode never carries both a full file and a retrieval pack.');
    console.log('  ✓ Retrieval runs first; an explicit selection stays exact and mandatory.');
    console.log('  ✓ Off and selection modes authorise no retrieval and no file reads.');
    console.log('  ✓ Unsaved buffers require their own consent.');
    console.log('  ✓ The full-file fallback fires only after retrieval admitted nothing, and is priced.');
    console.log('  ✓ Both entry points compile context through the same envelope policy.');
    console.log('  ✓ The signal snapshot is built, consented, bounded and actually supplied.');
    console.log('\n--- ALL SOTA PHASE 1 CONTEXT ENTRY TESTS PASSED ---\n');
}
