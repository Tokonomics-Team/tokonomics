/**
 * Tokonomics Workspace Signal Coordinator
 * 
 * Coordinates Delta, Diagnostic, Test, and Git intelligence engines into a unified,
 * freshness-validated, privacy-sanitized evidence pipeline adhering to strict deterministic precedence:
 * Request/Selection > Diagnostics > Failing Tests > Delta Gravity > Bounded Git History.
 */

import * as path from 'path';
import { WorkspaceSnapshot, WorkspaceFileRecord } from './workspaceIndex';
import { DeltaContextEngine } from './deltaContextEngine';
import { ErrorIntelligence, DiagnosticItem } from './errorIntelligence';
import { TestGraph, TestNode } from './testGraph';
import { GitGraph, GitCommitNode } from './gitGraph';
import { TerminalOutputOptimizer } from './terminalOptimizer';
import { SourceProvenanceEngine } from './provenance';
import { WorkspaceSignalSnapshot, SignalIntelligenceResult } from './signalTypes';
import { EvidenceSignal } from '../retrieval/evidenceTypes';

export interface SignalCoordinatorOptions {
    readonly deltaEngine?: DeltaContextEngine;
    readonly errorIntelligence?: ErrorIntelligence;
    readonly testGraph?: TestGraph;
    readonly gitGraph?: GitGraph;
    readonly terminalOptimizer?: TerminalOutputOptimizer;
    readonly sourceProvenance?: SourceProvenanceEngine;
}

export class WorkspaceSignalCoordinator {
    private readonly deltaEngine: DeltaContextEngine;
    private readonly errorIntelligence: ErrorIntelligence;
    private readonly testGraph: TestGraph;
    private readonly gitGraph: GitGraph;
    private readonly terminalOptimizer: TerminalOutputOptimizer;
    private readonly sourceProvenance: SourceProvenanceEngine;

    constructor(options: SignalCoordinatorOptions = {}) {
        this.deltaEngine = options.deltaEngine ?? new DeltaContextEngine();
        this.errorIntelligence = options.errorIntelligence ?? new ErrorIntelligence();
        this.testGraph = options.testGraph ?? new TestGraph();
        this.gitGraph = options.gitGraph ?? new GitGraph();
        this.terminalOptimizer = options.terminalOptimizer ?? new TerminalOutputOptimizer();
        this.sourceProvenance = options.sourceProvenance ?? new SourceProvenanceEngine();
    }

    public getDeltaEngine(): DeltaContextEngine { return this.deltaEngine; }
    public getErrorIntelligence(): ErrorIntelligence { return this.errorIntelligence; }
    public getTestGraph(): TestGraph { return this.testGraph; }
    public getGitGraph(): GitGraph { return this.gitGraph; }
    public getTerminalOptimizer(): TerminalOutputOptimizer { return this.terminalOptimizer; }
    public getSourceProvenance(): SourceProvenanceEngine { return this.sourceProvenance; }

    /**
     * Evaluates workspace signals with strict freshness, sanitization, and deterministic precedence
     */
    public coordinateSignals(params: {
        snapshot: WorkspaceSnapshot;
        signals?: WorkspaceSignalSnapshot;
        activeFilePath?: string;
        cursorLine?: number;
        userPrompt?: string;
        flags: {
            enableDeltaContext?: boolean;
            enableErrorIntelligence?: boolean;
            enableTestGraph?: boolean;
            enableGitGraph?: boolean;
            enableTerminalOptimizer?: boolean;
            enableProvenance?: boolean;
        };
    }): SignalIntelligenceResult {
        const startTime = Date.now();
        const deltaSignals: EvidenceSignal[] = [];
        const errorSignals: EvidenceSignal[] = [];
        const testSignals: EvidenceSignal[] = [];
        const gitSignals: EvidenceSignal[] = [];
        const terminalSignals: EvidenceSignal[] = [];
        let discardedStaleCount = 0;

        const { snapshot, signals, activeFilePath, cursorLine, userPrompt, flags } = params;

        if (signals && signals.snapshotGeneration !== snapshot.generation) {
            return { deltaSignals: Object.freeze([]), errorSignals: Object.freeze([]), testSignals: Object.freeze([]),
                gitSignals: Object.freeze([]), terminalSignals: Object.freeze([]), combinedSignals: Object.freeze([]),
                discardedStaleCount: 1, durationMs: Date.now() - startTime };
        }

        // Build file lookup maps
        const fileByRelative = new Map<string, WorkspaceFileRecord>();
        const fileByNormalized = new Map<string, WorkspaceFileRecord>();
        for (const file of snapshot.files.values()) {
            fileByRelative.set(file.relativePath, file);
            fileByNormalized.set(this.norm(file.absolutePath), file);
            fileByNormalized.set(this.norm(file.relativePath), file);
        }

        // 1. Error Intelligence (Diagnostics & Stack Traces) - Priority 2
        if (flags.enableErrorIntelligence) {
            const rawDiagnostics: DiagnosticItem[] = [];

            // Ingest structured diagnostics if provided
            if (signals?.diagnostics) {
                for (const diag of signals.diagnostics) {
                    // Freshness check: if diagnostic has a documentVersion, check against snapshot
                    const diagnosticFile = fileByNormalized.get(this.norm(diag.filePath));
                    const expectedDocumentVersion = this.bufferVersion(diagnosticFile);
                    if (typeof diag.documentVersion === 'number' && typeof expectedDocumentVersion === 'number') {
                        if (diag.documentVersion !== expectedDocumentVersion) {
                            discardedStaleCount++;
                            continue; // Discard stale diagnostic
                        }
                    }
                    rawDiagnostics.push({
                        filePath: diag.filePath,
                        line: diag.line,
                        message: diag.message,
                        severity: diag.severity === 'info' ? 'warning' : diag.severity,
                        category: diag.category,
                        extractedSymbol: diag.extractedSymbol
                    });
                }
            }

            // Ingest terminal stack trace from prompt if it looks like an error/stack trace
            if (userPrompt && /\b(?:at\s+[a-zA-Z0-9_$.#]+|File\s+"[^"]+",\s+line\s+\d+|TS\d{4,5}|AssertionError)\b/.test(userPrompt)) {
                const parsedStack = this.errorIntelligence.parseStackTrace(userPrompt);
                rawDiagnostics.push(...parsedStack);
            }

            const targets = this.errorIntelligence.resolveRootCauseTargets(rawDiagnostics);
            for (const target of targets) {
                const matchedFile = fileByNormalized.get(this.norm(target.filePath));
                const content = matchedFile
                    ? this.extractSnippet(matchedFile, target.line)
                    : `// Root cause error at line ${target.line} in ${target.filePath}`;

                errorSignals.push({
                    source: 'diagnostic',
                    content,
                    filePath: matchedFile?.relativePath ?? target.filePath,
                    lineStart: target.line,
                    lineEnd: target.line,
                    symbolName: target.symbolName,
                    version: snapshot.generation
                });
            }
        }

        // 1b. Terminal Optimization (Authorized failure clustering & causal frames) - Priority 2b
        if (flags.enableTerminalOptimizer && signals?.terminalContext &&
            startTime - signals.terminalContext.capturedAt <= 5 * 60 * 1000 &&
            signals.terminalContext.capturedAt <= startTime + 5_000) {
            const cluster = this.terminalOptimizer.parseTerminalOutput(
                signals.terminalContext.rawText,
                {
                    source: signals.terminalContext.source,
                    userConsented: signals.terminalContext.userConsented
                }
            );

            if (cluster.isAuthorized && cluster.compactDiagnosticContext) {
                terminalSignals.push({
                    source: 'diagnostic',
                    content: cluster.compactDiagnosticContext,
                    filePath: signals.terminalContext.cwd || activeFilePath,
                    symbolName: cluster.firstCausalFrame?.functionName || cluster.tool,
                    version: snapshot.generation
                });

                // Causal frame source attribution linking to workspace snapshot files
                if (cluster.causalFrames) {
                    for (const frame of cluster.causalFrames) {
                        if (!frame.filePath) continue;
                        let matchedFile = fileByNormalized.get(this.norm(frame.filePath));
                        if (!matchedFile) {
                            const normFrame = this.norm(frame.filePath);
                            for (const file of snapshot.files.values()) {
                                if (normFrame.endsWith(this.norm(file.relativePath)) || this.norm(file.absolutePath).endsWith(normFrame)) {
                                    matchedFile = file;
                                    break;
                                }
                            }
                        }
                        if (matchedFile) {
                            const content = this.extractSnippet(matchedFile, frame.line || 1);
                            terminalSignals.push({
                                source: 'diagnostic',
                                content,
                                filePath: matchedFile.relativePath,
                                lineStart: frame.line,
                                lineEnd: frame.line,
                                symbolName: frame.functionName,
                                version: snapshot.generation
                            });
                        }
                    }
                }
            }
        }

        // 2. Test Graph Intelligence - Priority 3
        if (flags.enableTestGraph) {
            // Ingest any incoming test outcomes
            if (signals?.testOutcomes) {
                // Expire stale tests
                const fileVersions = new Map<string, string>();
                for (const f of snapshot.files.values()) {
                    fileVersions.set(f.relativePath, f.contentHash);
                    fileVersions.set(f.absolutePath, f.contentHash);
                }
                this.testGraph.expireStaleTests(fileVersions);

                for (const test of signals.testOutcomes) {
                    this.testGraph.registerTest({
                        id: test.testId,
                        testFilePath: test.testFilePath,
                        testName: test.testName,
                        targetSymbols: [...test.targetSymbols],
                        fixtures: [...test.fixtures],
                        mocks: [...test.mocks],
                        isFailing: test.isFailing,
                        sourceVersion: test.sourceVersion,
                        failureMessage: test.failureMessage
                    });
                }
            }

            // Find failing tests relevant to active file symbols or query terms
            const targetSymbols = new Set<string>();
            if (activeFilePath) {
                const activeFile = fileByNormalized.get(this.norm(activeFilePath));
                if (activeFile) {
                    for (const s of activeFile.symbols) targetSymbols.add(s.name);
                }
            }
            if (userPrompt) {
                for (const sym of snapshot.symbols) {
                    if (userPrompt.toLowerCase().includes(sym.name.toLowerCase())) {
                        targetSymbols.add(sym.name);
                    }
                }
            }

            for (const sym of targetSymbols) {
                const pkg = this.testGraph.getTestContextPackage(sym);
                // Prioritize failing tests first
                for (const failing of pkg.failingTests) {
                    const matchedFile = fileByNormalized.get(this.norm(failing.testFilePath));
                    const snippet = matchedFile
                        ? this.extractSnippet(matchedFile, 1)
                        : `// Failing test: ${failing.testName}`;

                    testSignals.push({
                        source: 'test',
                        content: `FAILING_TEST: ${failing.testName}\n${snippet}`,
                        filePath: matchedFile?.relativePath ?? failing.testFilePath,
                        lineStart: 1,
                        lineEnd: 1,
                        symbolName: sym,
                        version: snapshot.generation
                    });
                }
            }
        }

        // 3. Delta Context Intelligence (Cursor Gravity & Selection) - Priority 4
        if (flags.enableDeltaContext && activeFilePath) {
            const activeFile = fileByNormalized.get(this.norm(activeFilePath));
            if (activeFile) {
                const effCursorLine = signals?.cursorSelection?.cursorLine ?? cursorLine;
                const effSelection = signals?.cursorSelection?.selection
                    ? { start: signals.cursorSelection.selection.startLine, end: signals.cursorSelection.selection.endLine }
                    : undefined;

                const attention = this.deltaEngine.computeAttentionWeight({
                    symbolLine: effCursorLine ?? 1,
                    filePath: activeFile.absolutePath,
                    activeFilePath: activeFile.absolutePath,
                    cursorLine: effCursorLine,
                    selection: effSelection,
                    gitDiffModifiedLines: signals?.delta?.modifiedLines as Map<string, Set<number>> | undefined,
                    expectedDocumentVersion: this.bufferVersion(activeFile),
                    actualDocumentVersion: signals?.cursorSelection?.documentVersion
                });

                if (attention.staleDiscarded) {
                    discardedStaleCount++;
                } else if (attention.compositeAttentionWeight > 0.4) {
                    const snippet = this.extractSnippet(activeFile, effCursorLine ?? 1);
                    deltaSignals.push({
                        source: 'open_editor',
                        content: `// Active Delta Focus (weight: ${attention.compositeAttentionWeight})\n${snippet}`,
                        filePath: activeFile.relativePath,
                        lineStart: effCursorLine ?? 1,
                        lineEnd: effCursorLine ?? 1,
                        symbolName: activeFile.symbols[0]?.name,
                        version: snapshot.generation
                    });
                }
            }
        }

        // 4. Git Graph Intelligence - Priority 5
        if (flags.enableGitGraph) {
            if (signals?.gitHistory) {
                for (const c of signals.gitHistory) {
                    this.gitGraph.registerCommit({
                        hash: c.hash,
                        shortHash: c.shortHash,
                        author: c.authorName,
                        message: c.message,
                        timestamp: c.timestamp,
                        modifiedFiles: [...c.modifiedFiles],
                        modifiedSymbols: [...c.modifiedSymbols]
                    });
                }
            }

            // Retrieve recent commits for active symbols
            const activeSymbols: string[] = [];
            if (activeFilePath) {
                const activeFile = fileByNormalized.get(this.norm(activeFilePath));
                if (activeFile) {
                    for (const s of activeFile.symbols.slice(0, 3)) activeSymbols.push(s.name);
                }
            }

            for (const sym of activeSymbols) {
                const historySummary = this.gitGraph.formatSymbolHistorySummary(sym);
                if (historySummary) {
                    gitSignals.push({
                        source: 'diff',
                        content: historySummary,
                        filePath: activeFilePath ? fileByNormalized.get(this.norm(activeFilePath))?.relativePath : undefined,
                        symbolName: sym,
                        version: snapshot.generation
                    });
                }
            }
        }

        // Strict Precedence Assembly:
        // 1. Diagnostics (Errors)
        // 2. Terminal Failures & Causal Frames
        // 3. Failing Tests
        // 4. Delta Gravity / Selection
        // 5. Git History
        const combinedSignals: EvidenceSignal[] = [
            ...errorSignals,
            ...terminalSignals,
            ...testSignals,
            ...deltaSignals,
            ...gitSignals
        ];

        const durationMs = Date.now() - startTime;
        return {
            deltaSignals: Object.freeze(deltaSignals),
            errorSignals: Object.freeze(errorSignals),
            testSignals: Object.freeze(testSignals),
            gitSignals: Object.freeze(gitSignals),
            terminalSignals: Object.freeze(terminalSignals),
            combinedSignals: Object.freeze(combinedSignals),
            discardedStaleCount,
            durationMs
        };
    }

    private extractSnippet(record: WorkspaceFileRecord, targetLine: number): string {
        if (!record.skeleton) return `// Line ${targetLine} in ${record.relativePath}`;
        const lines = record.skeleton.split(/\r?\n/);
        const idx = Math.min(lines.length - 1, Math.max(0, targetLine - 1));
        const start = Math.max(0, idx - 2);
        const end = Math.min(lines.length, idx + 3);
        return lines.slice(start, end).join('\n');
    }

    private norm(p: string): string {
        return path.normalize(p).replace(/\\/g, '/').toLowerCase();
    }

    private bufferVersion(record?: WorkspaceFileRecord): number | undefined {
        const match = record?.sourceVersion.match(/^buffer:(\d+)$/);
        return match ? Number(match[1]) : undefined;
    }
}
