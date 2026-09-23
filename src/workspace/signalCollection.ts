/**
 * Builds the request-scoped workspace signal snapshot.
 *
 * The orchestrator has always accepted a `WorkspaceSignalSnapshot` and uses it for two things: to
 * reject evidence captured against a stale document version, and to feed the delta, error, test, Git
 * and terminal signal engines. No production caller ever supplied one, so in the shipped extension
 * those engines received nothing and the staleness check had no version to compare against. The
 * field existed, the plumbing existed, and the snapshot did not.
 *
 * This module closes that. It collects only what the host can offer honestly under the consent the
 * user has already given, and it is explicit about what it does not collect:
 *
 * - **Cursor and document version** come from the active editor. The version is the important part:
 *   it is what lets the orchestrator discard evidence captured against a file that has since changed.
 * - **Diagnostics** come from the language services already running in the editor. They describe the
 *   user's own code, they are already visible in the Problems panel, and they are bounded and
 *   redacted here before travelling any further.
 * - **Test outcomes, Git history and terminal output are deliberately not collected.** Each is a
 *   separate consent decision about a new category of data leaving the machine - terminal output in
 *   particular routinely contains credentials and unrelated work - and the four-setting surface has
 *   no way to ask. Collecting them silently because the type has a field for them would be the wrong
 *   reason to do it.
 *
 * Everything here is bounded: a snapshot that grows with the size of the problem is a snapshot that
 * can dominate the payload it was meant to inform.
 *
 * The `vscode` dependency is injected, so the policy stays testable outside an Extension Host.
 */

import { WorkspaceSignalSnapshot, VersionedCursorSelection, NormalizedDiagnostic } from './signalTypes';
import { ErrorCategory } from './errorIntelligence';

/** Diagnostics beyond this are dropped; a request with hundreds of errors is not made clearer by all of them. */
export const MAX_COLLECTED_DIAGNOSTICS = 24;

/** A single diagnostic message longer than this is truncated. */
export const MAX_DIAGNOSTIC_MESSAGE_CHARS = 400;

/** Host-shaped inputs, mirroring the VS Code objects without importing them. */
export interface RawDiagnostic {
    readonly message: string;
    readonly severity: number;
    readonly source?: string;
    readonly startLine: number;
    readonly startCharacter?: number;
}

export interface SignalCollectionInput {
    readonly snapshotGeneration: number;
    readonly capturedAt: number;
    /** Whether the user's workspace-context choice authorises reading editor state at all. */
    readonly workspaceContextAuthorised: boolean;
    readonly workspaceTrusted: boolean;
    readonly activeFilePath?: string;
    readonly documentUri?: string;
    readonly documentVersion?: number;
    readonly cursorLine?: number;
    readonly cursorCharacter?: number;
    readonly selection?: VersionedCursorSelection['selection'];
    readonly diagnostics?: readonly RawDiagnostic[];
}

/** VS Code DiagnosticSeverity: 0 Error, 1 Warning, 2 Information, 3 Hint. */
function severityOf(value: number): NormalizedDiagnostic['severity'] | undefined {
    if (value === 0) return 'error';
    if (value === 1) return 'warning';
    if (value === 2) return 'info';
    // Hints are editor suggestions, not problems. They are noise in an evidence contract.
    return undefined;
}

/**
 * Classifies a diagnostic message into the categories the error-intelligence engine reasons about.
 *
 * Deliberately conservative: an unrecognised message becomes `build_failure`, the least specific
 * category, rather than being guessed into a specific one. A wrong category sends retrieval looking
 * for the wrong evidence, which is worse than a vague one sending it looking broadly.
 */
export function classifyDiagnosticMessage(message: string): ErrorCategory {
    const text = message.toLowerCase();
    if (/is not assignable|type '.*' is not|expected .* but got|incompatible type/.test(text)) return 'type_mismatch';
    if (/cannot find name|is not defined|undefined symbol|has no exported member|does not exist on type/.test(text)) return 'undefined_symbol';
    if (/unexpected token|syntax error|expression expected|unterminated/.test(text)) return 'syntax_error';
    if (/uncaught|threw|exception|stack trace/.test(text)) return 'runtime_exception';
    if (/test failed|assertion|expect\(/.test(text)) return 'test_failure';
    return 'build_failure';
}

/** Extracts the identifier a diagnostic is about, when it names one in quotes. */
export function extractDiagnosticSymbol(message: string): string | undefined {
    const quoted = message.match(/'([A-Za-z_$][A-Za-z0-9_$]*)'/);
    return quoted?.[1];
}

/**
 * Builds the snapshot, or returns undefined when nothing may be collected.
 *
 * Returning undefined rather than an empty snapshot is deliberate: an empty snapshot asserts "we
 * looked and there was nothing", while undefined says "we did not look", and the orchestrator's
 * staleness check should not treat an absent version as a matching one.
 */
export function collectSignalSnapshot(input: SignalCollectionInput): WorkspaceSignalSnapshot | undefined {
    if (!input.workspaceTrusted || !input.workspaceContextAuthorised) return undefined;
    if (!input.documentUri && !(input.diagnostics || []).length) return undefined;

    const cursorSelection: VersionedCursorSelection | undefined = input.documentUri
        ? Object.freeze({
            documentUri: input.documentUri,
            documentVersion: input.documentVersion,
            cursorLine: Math.max(0, input.cursorLine ?? 0),
            cursorCharacter: input.cursorCharacter,
            selection: input.selection
        })
        : undefined;

    const diagnostics: NormalizedDiagnostic[] = [];
    for (const raw of input.diagnostics || []) {
        const severity = severityOf(raw.severity);
        if (!severity) continue;
        const message = String(raw.message || '').slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS);
        if (!message.trim()) continue;
        diagnostics.push(Object.freeze({
            filePath: input.activeFilePath || '',
            line: Math.max(1, raw.startLine + 1),
            column: raw.startCharacter,
            message,
            severity,
            category: classifyDiagnosticMessage(message),
            source: raw.source,
            extractedSymbol: extractDiagnosticSymbol(message),
            // The version travels with the diagnostic so evidence derived from it can be discarded
            // when the document moves on, which is the whole point of capturing a version at all.
            documentVersion: input.documentVersion
        }));
        if (diagnostics.length >= MAX_COLLECTED_DIAGNOSTICS) break;
    }

    // Errors first: a request with both errors and warnings is almost always about the errors.
    diagnostics.sort((left, right) => {
        const rank = (value: NormalizedDiagnostic['severity']) =>
            value === 'error' ? 0 : value === 'warning' ? 1 : 2;
        return rank(left.severity) - rank(right.severity) || left.line - right.line;
    });

    return Object.freeze({
        snapshotGeneration: input.snapshotGeneration,
        capturedAt: input.capturedAt,
        cursorSelection,
        diagnostics: diagnostics.length > 0 ? Object.freeze(diagnostics) : undefined
        // testOutcomes, gitHistory and terminalContext are intentionally absent. See the module
        // comment: each needs its own consent, and the settings surface has no way to ask for it.
    });
}
