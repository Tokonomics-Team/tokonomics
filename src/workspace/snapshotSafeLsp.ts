/**
 * Tokonomics Snapshot-Safe LSP Intelligence Engine
 * 
 * Bounded, snapshot-safe language server protocol integration providing definitions,
 * references, and call hierarchies as verified evidence signals without editor timing
 * races, out-of-root leaks, stale document divergence, or unconstrained allocations.
 */

import * as path from 'path';
import { WorkspaceSnapshot, WorkspaceFileRecord, WorkspaceIndexSymbol } from './workspaceIndex';
import { WorkspaceIdentity, CanonicalWorkspaceFile } from './workspaceIdentity';
import { WorkspaceGraph } from './workspaceGraph';
import { ScipIndexer } from './scipIndexer';
import { ILanguageServerAdapter, LspPosition, RawLspLocation, RawCallHierarchyItem, CancellationLike, VsCodeLanguageServerAdapter } from './lspAdapter';
import { EvidenceSignal } from '../retrieval/evidenceTypes';

export interface LspIntelligenceOptions {
    readonly adapter?: ILanguageServerAdapter;
    readonly workspaceGraph?: WorkspaceGraph;
    readonly scipIndexer?: ScipIndexer;
    readonly perCommandTimeoutMs?: number; // default 50ms
    readonly aggregateTimeoutMs?: number;  // default 150ms
    readonly maxDefinitions?: number;      // default 10
    readonly maxReferences?: number;       // default 20
    readonly maxCallers?: number;          // default 10
    readonly maxCallees?: number;          // default 10
    readonly maxFiles?: number;            // default 15
    readonly maxTraversalDepth?: number;   // default 2
}

export interface LspQueryContext {
    readonly snapshot: WorkspaceSnapshot;
    readonly activeFilePath?: string;
    readonly cursorLine?: number;
    readonly cursorCharacter?: number;
    readonly query?: string;
    readonly cancellation?: CancellationLike;
    readonly expectedDocumentVersion?: number;
}

export interface LspIntelligenceResult {
    readonly signals: readonly EvidenceSignal[];
    readonly definitionsCount: number;
    readonly referencesCount: number;
    readonly incomingCallsCount: number;
    readonly outgoingCallsCount: number;
    readonly fallbackUsed: boolean;
    readonly fallbackReason?: string;
    readonly durationMs: number;
    readonly timedOut: boolean;
    readonly cancelled: boolean;
}

export class SnapshotSafeLspService {
    private readonly adapter: ILanguageServerAdapter;
    private readonly workspaceGraph?: WorkspaceGraph;
    private readonly scipIndexer?: ScipIndexer;
    private readonly perCommandTimeoutMs: number;
    private readonly aggregateTimeoutMs: number;
    private readonly maxDefinitions: number;
    private readonly maxReferences: number;
    private readonly maxCallers: number;
    private readonly maxCallees: number;
    private readonly maxFiles: number;
    private readonly maxTraversalDepth: number;

    constructor(options: LspIntelligenceOptions = {}) {
        this.adapter = options.adapter ?? new VsCodeLanguageServerAdapter();
        this.workspaceGraph = options.workspaceGraph;
        this.scipIndexer = options.scipIndexer;
        this.perCommandTimeoutMs = options.perCommandTimeoutMs ?? 50;
        this.aggregateTimeoutMs = options.aggregateTimeoutMs ?? 150;
        this.maxDefinitions = options.maxDefinitions ?? 10;
        this.maxReferences = options.maxReferences ?? 20;
        this.maxCallers = options.maxCallers ?? 10;
        this.maxCallees = options.maxCallees ?? 10;
        this.maxFiles = options.maxFiles ?? 15;
        this.maxTraversalDepth = options.maxTraversalDepth ?? 2;
    }

    /**
     * Executes snapshot-safe LSP queries for focal symbols with strict workspace containment,
     * deduplication, deadlines, and deterministic syntactic fallback.
     */
    public async queryIntelligence(context: LspQueryContext): Promise<LspIntelligenceResult> {
        const startTime = Date.now();
        const rootPaths = context.snapshot.roots.map(r => r.path);
        const identity = new WorkspaceIdentity(rootPaths);

        // 1. Resolve focal symbols strictly from immutable request snapshot
        const focalSymbols = this.resolveFocalSymbols(context);
        if (focalSymbols.length === 0) {
            return this.emptyResult(Date.now() - startTime);
        }

        const signals: EvidenceSignal[] = [];
        const seenLocations = new Set<string>();
        const candidateFiles = new Set<string>();

        let definitionsCount = 0;
        let referencesCount = 0;
        let incomingCallsCount = 0;
        let outgoingCallsCount = 0;
        let fallbackUsed = false;
        let fallbackReason: string | undefined;
        let timedOut = false;
        let cancelled = false;

        const isTimeExceeded = () => (Date.now() - startTime) >= this.aggregateTimeoutMs;
        const isCancelled = () => !!context.cancellation?.isCancellationRequested;

        for (const focal of focalSymbols) {
            if (isCancelled()) {
                cancelled = true;
                break;
            }
            if (isTimeExceeded()) {
                timedOut = true;
                break;
            }

            // Snapshot symbols use human-facing one-based lines; VS Code/LSP positions are zero-based.
            const position: LspPosition = { line: Math.max(0, focal.line - 1), character: 0 };
            let hasLspEvidenceForSymbol = false;

            // --- A. Query Language Server Provider if Available ---
            if (this.adapter.isAvailable) {
                try {
                    // 1. Definitions
                    if (definitionsCount < this.maxDefinitions && !isTimeExceeded() && !isCancelled()) {
                        const rawDefs = await this.executeWithTimeout(
                            () => this.adapter.getDefinitions(focal.absolutePath, position, context.cancellation),
                            this.perCommandTimeoutMs,
                            context.cancellation
                        );

                        if (Array.isArray(rawDefs)) {
                            // Enforce bounds before materializing
                            const boundedDefs = rawDefs.slice(0, this.maxDefinitions - definitionsCount);
                            for (const rawLoc of boundedDefs) {
                                const valid = this.validateAndNormalizeLocation(rawLoc, identity, context);
                                if (!valid) continue;

                                const locKey = `${valid.canonical.key}:${valid.line}:${valid.character}`;
                                if (seenLocations.has(locKey)) continue;
                                seenLocations.add(locKey);

                                candidateFiles.add(valid.canonical.relativePath);
                                if (candidateFiles.size > this.maxFiles) break;

                                const content = this.extractSnapshotSnippet(context.snapshot, valid.canonical.key, valid.line);
                                signals.push({
                                    source: 'lsp',
                                    content,
                                    filePath: valid.canonical.relativePath,
                                    lineStart: valid.line,
                                    lineEnd: valid.line,
                                    symbolName: focal.name,
                                    version: context.snapshot.generation
                                });
                                definitionsCount++;
                                hasLspEvidenceForSymbol = true;
                            }
                        }
                    }

                    // 2. References
                    if (referencesCount < this.maxReferences && !isTimeExceeded() && !isCancelled()) {
                        const rawRefs = await this.executeWithTimeout(
                            () => this.adapter.getReferences(focal.absolutePath, position, { includeDeclaration: false }, context.cancellation),
                            this.perCommandTimeoutMs,
                            context.cancellation
                        );

                        if (Array.isArray(rawRefs)) {
                            const boundedRefs = rawRefs.slice(0, this.maxReferences - referencesCount);
                            for (const rawLoc of boundedRefs) {
                                const valid = this.validateAndNormalizeLocation(rawLoc, identity, context);
                                if (!valid) continue;

                                const locKey = `${valid.canonical.key}:${valid.line}:${valid.character}`;
                                if (seenLocations.has(locKey)) continue;
                                seenLocations.add(locKey);

                                candidateFiles.add(valid.canonical.relativePath);
                                if (candidateFiles.size > this.maxFiles) break;

                                const content = this.extractSnapshotSnippet(context.snapshot, valid.canonical.key, valid.line);
                                signals.push({
                                    source: 'lsp',
                                    content,
                                    filePath: valid.canonical.relativePath,
                                    lineStart: valid.line,
                                    lineEnd: valid.line,
                                    symbolName: focal.name,
                                    version: context.snapshot.generation
                                });
                                referencesCount++;
                                hasLspEvidenceForSymbol = true;
                            }
                        }
                    }

                    // 3. Call Hierarchy
                    if ((incomingCallsCount < this.maxCallers || outgoingCallsCount < this.maxCallees) &&
                        !isTimeExceeded() && !isCancelled()) {
                        const hierarchyItems = await this.executeWithTimeout(
                            () => this.adapter.prepareCallHierarchy(focal.absolutePath, position, context.cancellation),
                            this.perCommandTimeoutMs,
                            context.cancellation
                        );

                        if (Array.isArray(hierarchyItems) && hierarchyItems.length > 0) {
                            const targetItem = hierarchyItems[0];

                            // Incoming Calls
                            if (incomingCallsCount < this.maxCallers && !isTimeExceeded() && !isCancelled()) {
                                const incoming = await this.executeWithTimeout(
                                    () => this.adapter.getIncomingCalls(targetItem, context.cancellation),
                                    this.perCommandTimeoutMs,
                                    context.cancellation
                                );
                                if (Array.isArray(incoming)) {
                                    const boundedIncoming = incoming.slice(0, this.maxCallers - incomingCallsCount);
                                    for (const call of boundedIncoming) {
                                        if (!call?.from) continue;
                                        const valid = this.validateAndNormalizeLocation(call.from, identity, context);
                                        if (!valid) continue;

                                        const locKey = `call:in:${valid.canonical.key}:${valid.line}`;
                                        if (seenLocations.has(locKey)) continue;
                                        seenLocations.add(locKey);

                                        candidateFiles.add(valid.canonical.relativePath);
                                        const content = this.extractSnapshotSnippet(context.snapshot, valid.canonical.key, valid.line);
                                        signals.push({
                                            source: 'lsp',
                                            content: `caller: ${call.from.name || focal.name}\n${content}`,
                                            filePath: valid.canonical.relativePath,
                                            lineStart: valid.line,
                                            lineEnd: valid.line,
                                            symbolName: call.from.name || focal.name,
                                            version: context.snapshot.generation
                                        });
                                        incomingCallsCount++;
                                        hasLspEvidenceForSymbol = true;
                                    }
                                }
                            }

                            // Outgoing Calls
                            if (outgoingCallsCount < this.maxCallees && !isTimeExceeded() && !isCancelled()) {
                                const outgoing = await this.executeWithTimeout(
                                    () => this.adapter.getOutgoingCalls(targetItem, context.cancellation),
                                    this.perCommandTimeoutMs,
                                    context.cancellation
                                );
                                if (Array.isArray(outgoing)) {
                                    const boundedOutgoing = outgoing.slice(0, this.maxCallees - outgoingCallsCount);
                                    for (const call of boundedOutgoing) {
                                        if (!call?.to) continue;
                                        const valid = this.validateAndNormalizeLocation(call.to, identity, context);
                                        if (!valid) continue;

                                        const locKey = `call:out:${valid.canonical.key}:${valid.line}`;
                                        if (seenLocations.has(locKey)) continue;
                                        seenLocations.add(locKey);

                                        candidateFiles.add(valid.canonical.relativePath);
                                        const content = this.extractSnapshotSnippet(context.snapshot, valid.canonical.key, valid.line);
                                        signals.push({
                                            source: 'lsp',
                                            content: `callee: ${call.to.name || focal.name}\n${content}`,
                                            filePath: valid.canonical.relativePath,
                                            lineStart: valid.line,
                                            lineEnd: valid.line,
                                            symbolName: call.to.name || focal.name,
                                            version: context.snapshot.generation
                                        });
                                        outgoingCallsCount++;
                                        hasLspEvidenceForSymbol = true;
                                    }
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    if (err?.message?.includes('timeout') || err?.message?.includes('timed out')) {
                        timedOut = true;
                        fallbackReason = 'lsp_provider_timeout';
                    } else if (err?.message?.includes('cancel')) {
                        cancelled = true;
                        fallbackReason = 'lsp_operation_cancelled';
                    } else {
                        fallbackReason = 'lsp_provider_error';
                    }
                }
            } else {
                fallbackReason = 'lsp_adapter_unavailable';
            }

            // --- B. Deterministic Syntactic Fallback (SCIP & WorkspaceGraph) ---
            if (!hasLspEvidenceForSymbol) {
                fallbackUsed = true;
                if (!fallbackReason) fallbackReason = 'lsp_zero_results';

                // SCIP Definition & References Fallback
                if (this.scipIndexer) {
                    const scipDef = this.scipIndexer.findDefinition(focal.name);
                    if (scipDef) {
                        const canonical = identity.identify(scipDef.filePath);
                        if (canonical) {
                            const locKey = `fallback:${canonical.key}:${scipDef.line}:0`;
                            if (!seenLocations.has(locKey)) {
                                seenLocations.add(locKey);
                                const content = this.extractSnapshotSnippet(context.snapshot, canonical.key, scipDef.line);
                                signals.push({
                                    source: 'lsp',
                                    content,
                                    filePath: canonical.relativePath,
                                    lineStart: scipDef.line,
                                    lineEnd: scipDef.line,
                                    symbolName: scipDef.symbol,
                                    version: context.snapshot.generation
                                });
                                definitionsCount++;
                            }
                        }
                    }

                    const scipRefs = this.scipIndexer.findReferences(focal.name);
                    for (const ref of scipRefs.slice(0, this.maxReferences - referencesCount)) {
                        const canonical = identity.identify(ref.filePath);
                        if (canonical) {
                            const locKey = `fallback:${canonical.key}:${ref.line}:${ref.character}`;
                            if (!seenLocations.has(locKey)) {
                                seenLocations.add(locKey);
                                const content = this.extractSnapshotSnippet(context.snapshot, canonical.key, ref.line);
                                signals.push({
                                    source: 'lsp',
                                    content,
                                    filePath: canonical.relativePath,
                                    lineStart: ref.line,
                                    lineEnd: ref.line,
                                    symbolName: ref.symbol,
                                    version: context.snapshot.generation
                                });
                                referencesCount++;
                            }
                        }
                    }
                }

                // WorkspaceGraph Call Hierarchy Fallback
                if (this.workspaceGraph) {
                    let hierarchy = this.workspaceGraph.getCallHierarchy(focal.name);
                    if (hierarchy.callers.length === 0 && hierarchy.callees.length === 0) {
                        for (const [nodeId, node] of (this.workspaceGraph as any).nodes?.entries?.() || []) {
                            if (node.symbolName === focal.name || nodeId.endsWith(`:${focal.name}`)) {
                                const matched = this.workspaceGraph.getCallHierarchy(nodeId);
                                if (matched.callers.length > 0 || matched.callees.length > 0) {
                                    hierarchy = matched;
                                    break;
                                }
                            }
                        }
                    }
                    for (const caller of hierarchy.callers.slice(0, this.maxCallers - incomingCallsCount)) {
                        const canonical = identity.identify(caller.filePath);
                        if (canonical) {
                            const locKey = `fallback:caller:${canonical.key}:${caller.line}`;
                            if (!seenLocations.has(locKey)) {
                                seenLocations.add(locKey);
                                const content = this.extractSnapshotSnippet(context.snapshot, canonical.key, caller.line);
                                signals.push({
                                    source: 'lsp',
                                    content: `caller: ${caller.symbolName}\n${content}`,
                                    filePath: canonical.relativePath,
                                    lineStart: caller.line,
                                    lineEnd: caller.line,
                                    symbolName: caller.symbolName,
                                    version: context.snapshot.generation
                                });
                                incomingCallsCount++;
                            }
                        }
                    }

                    for (const callee of hierarchy.callees.slice(0, this.maxCallees - outgoingCallsCount)) {
                        const canonical = identity.identify(callee.filePath);
                        if (canonical) {
                            const locKey = `fallback:callee:${canonical.key}:${callee.line}`;
                            if (!seenLocations.has(locKey)) {
                                seenLocations.add(locKey);
                                const content = this.extractSnapshotSnippet(context.snapshot, canonical.key, callee.line);
                                signals.push({
                                    source: 'lsp',
                                    content: `callee: ${callee.symbolName}\n${content}`,
                                    filePath: canonical.relativePath,
                                    lineStart: callee.line,
                                    lineEnd: callee.line,
                                    symbolName: callee.symbolName,
                                    version: context.snapshot.generation
                                });
                                outgoingCallsCount++;
                            }
                        }
                    }
                }
            }
        }

        const durationMs = Date.now() - startTime;
        return {
            signals: Object.freeze(signals),
            definitionsCount,
            referencesCount,
            incomingCallsCount,
            outgoingCallsCount,
            fallbackUsed,
            fallbackReason,
            durationMs,
            timedOut,
            cancelled
        };
    }

    /**
     * Resolves focal symbols strictly from the immutable snapshot and request position/query
     */
    private resolveFocalSymbols(context: LspQueryContext): Array<{ name: string; line: number; absolutePath: string }> {
        const results: Array<{ name: string; line: number; absolutePath: string }> = [];
        const seen = new Set<string>();

        // 1. From Active File and Cursor Position in Snapshot
        if (context.activeFilePath) {
            const normalizedActive = path.normalize(context.activeFilePath).replace(/\\/g, '/').toLowerCase();
            const record = [...context.snapshot.files.values()].find(
                f => path.normalize(f.absolutePath).replace(/\\/g, '/').toLowerCase() === normalizedActive ||
                     path.normalize(f.relativePath).replace(/\\/g, '/').toLowerCase() === normalizedActive
            );

            if (record) {
                if (typeof context.cursorLine === 'number') {
                    // Find symbol closest to or enclosing cursorLine
                    let closest: WorkspaceIndexSymbol | undefined;
                    let minDiff = Infinity;
                    for (const symbol of record.symbols) {
                        const diff = Math.abs(symbol.line - context.cursorLine);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = symbol;
                        }
                    }
                    if (closest && !seen.has(closest.name)) {
                        seen.add(closest.name);
                        results.push({ name: closest.name, line: closest.line, absolutePath: record.absolutePath });
                    }
                }

                // If cursor didn't match, take up to first 2 symbols from active record
                for (const symbol of record.symbols.slice(0, 2)) {
                    if (!seen.has(symbol.name)) {
                        seen.add(symbol.name);
                        results.push({ name: symbol.name, line: symbol.line, absolutePath: record.absolutePath });
                    }
                }
            }
        }

        // 2. From Query matching snapshot symbols
        if (context.query && results.length < 3) {
            const queryTerms = new Set(context.query.toLowerCase().match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) || []);
            for (const symbol of context.snapshot.symbols) {
                if (queryTerms.has(symbol.name.toLowerCase()) && !seen.has(symbol.name)) {
                    const record = [...context.snapshot.files.values()].find(f => f.relativePath === symbol.file);
                    if (record) {
                        seen.add(symbol.name);
                        results.push({ name: symbol.name, line: symbol.line, absolutePath: record.absolutePath });
                        if (results.length >= 3) break;
                    }
                }
            }
        }

        return results;
    }

    /**
     * Validates containment against workspace roots, rejects non-file schemes,
     * checks document version freshness, and normalizes coordinates.
     */
    private validateAndNormalizeLocation(
        raw: RawLspLocation | RawCallHierarchyItem,
        identity: WorkspaceIdentity,
        context: LspQueryContext
    ): { canonical: CanonicalWorkspaceFile; line: number; character: number } | undefined {
        if (!raw) return undefined;

        // Extract URI
        const rawUri = (raw as any).uri || (raw as any).targetUri;
        if (!rawUri) return undefined;

        let fsPath: string;
        let scheme = 'file';

        if (typeof rawUri === 'string') {
            if (rawUri.startsWith('file://')) {
                fsPath = rawUri.replace(/^file:\/\//, '');
                if (process.platform === 'win32' && fsPath.startsWith('/')) {
                    fsPath = fsPath.slice(1);
                }
            } else if (rawUri.includes('://')) {
                // Reject virtual/non-file schemes (untitled:, git:, vscode-userdata:, etc.)
                return undefined;
            } else {
                fsPath = rawUri;
            }
        } else {
            scheme = rawUri.scheme || 'file';
            fsPath = rawUri.fsPath || rawUri.path || '';
        }

        // Reject virtual schemes
        if (scheme !== 'file') {
            return undefined;
        }

        if (!fsPath || fsPath.includes('\0')) {
            return undefined;
        }

        // Path Traversal Guard: Resolve and normalize path
        const resolvedPath = path.resolve(path.normalize(fsPath));

        // Strict Workspace Root Containment Guard
        const canonical = identity.identify(resolvedPath);
        if (!canonical) {
            return undefined; // Out of root or traversal attempt!
        }

        // Document Version Freshness Guard: If document is open with version, check freshness
        const openDocVersion = this.adapter.getDocumentVersion?.(resolvedPath);
        if (typeof openDocVersion === 'number' && typeof context.expectedDocumentVersion === 'number') {
            if (openDocVersion !== context.expectedDocumentVersion) {
                return undefined; // Stale document version rejected!
            }
        }

        // Extract line and character
        const range = (raw as any).range || (raw as any).targetRange || (raw as any).selectionRange;
        const line = typeof range?.start?.line === 'number' ? Math.max(0, range.start.line) : 0;
        const character = typeof range?.start?.character === 'number' ? Math.max(0, range.start.character) : 0;

        return { canonical, line, character };
    }

    /**
     * Extracts snippet exclusively from immutable snapshot file records
     */
    private extractSnapshotSnippet(snapshot: WorkspaceSnapshot, fileKey: string, line: number): string {
        const record = snapshot.files.get(fileKey);
        if (!record) return `// Reference at line ${line}`;

        // Find symbol matching the line if possible
        const matchingSymbol = record.symbols.find(s => Math.abs(s.line - line) <= 1);
        if (matchingSymbol) {
            return matchingSymbol.signature;
        }

        // Otherwise extract snippet from record skeleton
        if (record.skeleton) {
            const lines = record.skeleton.split(/\r?\n/);
            const targetLine = Math.min(lines.length - 1, Math.max(0, line - 1));
            const start = Math.max(0, targetLine - 2);
            const end = Math.min(lines.length, targetLine + 3);
            return lines.slice(start, end).join('\n');
        }

        return `// Snippet for ${record.relativePath}:${line}`;
    }

    private async executeWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number,
        token?: CancellationLike
    ): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancellationDisposable: { dispose(): void } | undefined;
        const racers: Promise<T>[] = [fn(), new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`LSP command timed out after ${timeoutMs}ms`)), timeoutMs);
        })];
        if (token?.onCancellationRequested) {
            racers.push(new Promise<T>((_, reject) => {
                cancellationDisposable = token.onCancellationRequested!(() => reject(new Error('LSP command cancelled')));
            }));
        }
        return Promise.race([
            ...racers
        ]).finally(() => {
            if (timer) clearTimeout(timer);
            cancellationDisposable?.dispose();
        });
    }

    private emptyResult(durationMs: number): LspIntelligenceResult {
        return {
            signals: Object.freeze([]),
            definitionsCount: 0,
            referencesCount: 0,
            incomingCallsCount: 0,
            outgoingCallsCount: 0,
            fallbackUsed: false,
            durationMs,
            timedOut: false,
            cancelled: false
        };
    }
}
