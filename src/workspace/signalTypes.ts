/**
 * Tokonomics Request-Scoped Workspace Signals Data Model
 * Captures versioned cursor/selection, dirty-buffer deltas, diagnostics, test outcomes,
 * and sanitized Git metadata into an immutable, verifiable request-level snapshot.
 */

import { ErrorCategory } from './errorIntelligence';
import { EvidenceSignal } from '../retrieval/evidenceTypes';

export interface VersionedCursorSelection {
    readonly documentUri: string;
    readonly documentVersion?: number;
    readonly cursorLine: number;
    readonly cursorCharacter?: number;
    readonly selection?: {
        readonly startLine: number;
        readonly startCharacter: number;
        readonly endLine: number;
        readonly endCharacter: number;
    };
}

export interface DirtyBufferDelta {
    readonly documentUri: string;
    readonly baseVersion: number;
    readonly currentVersion: number;
    readonly diffText?: string;
    readonly modifiedLines: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface NormalizedDiagnostic {
    readonly filePath: string;
    readonly line: number;
    readonly column?: number;
    readonly message: string;
    readonly severity: 'error' | 'warning' | 'info';
    readonly category: ErrorCategory;
    readonly source?: string;
    readonly extractedSymbol?: string;
    readonly documentVersion?: number;
}

export interface TestOutcomeSignal {
    readonly testId: string;
    readonly testFilePath: string;
    readonly testName: string;
    readonly targetSymbols: readonly string[];
    readonly fixtures: readonly string[];
    readonly mocks: readonly string[];
    readonly isFailing: boolean;
    readonly failureMessage?: string;
    readonly sourceVersion?: string;
    readonly timestamp: number;
}

export interface SanitizedGitCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly authorName: string; // Email stripped
    readonly message: string;    // Secrets sanitized
    readonly timestamp: number;
    readonly modifiedFiles: readonly string[];
    readonly modifiedSymbols: readonly {
        readonly symbolName: string;
        readonly filePath: string;
        readonly changeType: 'added' | 'modified' | 'deleted';
    }[];
}

export type TerminalSourceKind = 'user_selection' | 'extension_task' | 'consented_shell' | 'unauthorized';

export interface AuthorizedTerminalContext {
    readonly source: TerminalSourceKind;
    readonly rawText: string;
    readonly command?: string;
    readonly exitCode?: number;
    readonly cwd?: string;
    readonly userConsented: boolean;
    readonly capturedAt: number;
}

export interface WorkspaceSignalSnapshot {
    readonly snapshotGeneration: number;
    readonly capturedAt: number;
    readonly cursorSelection?: VersionedCursorSelection;
    readonly delta?: DirtyBufferDelta;
    readonly diagnostics?: readonly NormalizedDiagnostic[];
    readonly testOutcomes?: readonly TestOutcomeSignal[];
    readonly gitHistory?: readonly SanitizedGitCommit[];
    readonly terminalContext?: AuthorizedTerminalContext;
}

export interface SignalIntelligenceResult {
    readonly deltaSignals: readonly EvidenceSignal[];
    readonly errorSignals: readonly EvidenceSignal[];
    readonly testSignals: readonly EvidenceSignal[];
    readonly gitSignals: readonly EvidenceSignal[];
    readonly terminalSignals: readonly EvidenceSignal[];
    readonly combinedSignals: readonly EvidenceSignal[];
    readonly discardedStaleCount: number;
    readonly durationMs: number;
}
