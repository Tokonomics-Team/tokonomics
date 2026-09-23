/**
 * Tokonomics LSP (Language Server Protocol) Intelligence Layer
 * Queries live VS Code Language Servers for definitions, references, type definitions,
 * and call hierarchies, with deterministic fallback to SCIP and Tree-sitter.
 */

import { WorkspaceGraph } from './workspaceGraph';
import { ScipIndexer } from './scipIndexer';
import { ILanguageServerAdapter, VsCodeLanguageServerAdapter } from './lspAdapter';

export interface LspSymbol {
    name: string;
    kind: string;
    containerName?: string;
    filePath: string;
    line: number;
    character: number;
}

export interface LspLocation {
    filePath: string;
    line: number;
    character: number;
    symbolName?: string;
}

export interface LspCallHierarchy {
    incoming: LspLocation[];
    outgoing: LspLocation[];
}

export class LspContextLayer {
    private adapter: ILanguageServerAdapter;

    constructor(
        private workspaceGraph?: WorkspaceGraph,
        private scipIndexer?: ScipIndexer,
        adapter?: ILanguageServerAdapter
    ) {
        this.adapter = adapter ?? new VsCodeLanguageServerAdapter();
    }

    public get isVsCodeAvailable(): boolean {
        return this.adapter.isAvailable;
    }

    /**
     * Resolves definitions for a symbol at a given file and position
     */
    public async getDefinitions(filePath: string, line: number, character: number, symbolName?: string): Promise<LspLocation[]> {
        if (this.adapter.isAvailable) {
            try {
                const result = await Promise.race([
                    this.adapter.getDefinitions(filePath, { line, character }),
                    new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]);

                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map(loc => {
                        const targetPath = (typeof loc.uri === 'string' ? loc.uri : loc.uri?.fsPath) ||
                                           (typeof loc.targetUri === 'string' ? loc.targetUri : loc.targetUri?.fsPath) ||
                                           filePath;
                        return {
                            filePath: targetPath,
                            line: loc.range?.start?.line ?? loc.targetRange?.start?.line ?? 0,
                            character: loc.range?.start?.character ?? loc.targetRange?.start?.character ?? 0,
                            symbolName
                        };
                    });
                }
            } catch {
                // Fall through to deterministic SCIP / Tree-sitter fallback
            }
        }

        // --- Deterministic Fallback to SCIP / Workspace Graph ---
        if (symbolName && this.scipIndexer) {
            const scipDef = this.scipIndexer.findDefinition(symbolName);
            if (scipDef) {
                return [{
                    filePath: scipDef.filePath,
                    line: scipDef.line,
                    character: 0,
                    symbolName: scipDef.symbol
                }];
            }
        }

        return [];
    }

    /**
     * Resolves downstream references for a symbol across workspace files
     */
    public async getReferences(filePath: string, line: number, character: number, symbolName?: string): Promise<LspLocation[]> {
        if (this.adapter.isAvailable) {
            try {
                const result = await Promise.race([
                    this.adapter.getReferences(filePath, { line, character }),
                    new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]);

                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map(loc => {
                        const targetPath = (typeof loc.uri === 'string' ? loc.uri : loc.uri?.fsPath) || filePath;
                        return {
                            filePath: targetPath,
                            line: loc.range?.start?.line ?? 0,
                            character: loc.range?.start?.character ?? 0,
                            symbolName
                        };
                    });
                }
            } catch {
                // Fall through to deterministic SCIP fallback
            }
        }

        // --- Deterministic Fallback to SCIP ---
        if (symbolName && this.scipIndexer) {
            const scipRefs = this.scipIndexer.findReferences(symbolName);
            return scipRefs.map(r => ({
                filePath: r.filePath,
                line: r.line,
                character: r.character,
                symbolName: r.symbol
            }));
        }

        return [];
    }

    /**
     * Resolves incoming callers and outgoing callees via Call Hierarchy API
     */
    public async getCallHierarchy(filePath: string, line: number, character: number, symbolId?: string): Promise<LspCallHierarchy> {
        if (this.adapter.isAvailable) {
            try {
                const items = await Promise.race([
                    this.adapter.prepareCallHierarchy(filePath, { line, character }),
                    new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]);

                if (items && Array.isArray(items) && items.length > 0) {
                    const item = items[0];
                    const incomingCalls = await this.adapter.getIncomingCalls(item);
                    const outgoingCalls = await this.adapter.getOutgoingCalls(item);

                    const incoming: LspLocation[] = (incomingCalls || []).map(c => ({
                        filePath: (typeof c.from?.uri === 'string' ? c.from.uri : c.from?.uri?.fsPath) || filePath,
                        line: c.from?.range?.start?.line ?? 0,
                        character: c.from?.range?.start?.character ?? 0,
                        symbolName: c.from?.name
                    }));

                    const outgoing: LspLocation[] = (outgoingCalls || []).map(c => ({
                        filePath: (typeof c.to?.uri === 'string' ? c.to.uri : c.to?.uri?.fsPath) || filePath,
                        line: c.to?.range?.start?.line ?? 0,
                        character: c.to?.range?.start?.character ?? 0,
                        symbolName: c.to?.name
                    }));

                    return { incoming, outgoing };
                }
            } catch {
                // Fall through to deterministic Workspace Graph fallback
            }
        }

        // --- Deterministic Fallback to WorkspaceGraph ---
        if (symbolId && this.workspaceGraph) {
            const hierarchy = this.workspaceGraph.getCallHierarchy(symbolId);
            return {
                incoming: hierarchy.callers.map(c => ({
                    filePath: c.filePath,
                    line: c.line,
                    character: 0,
                    symbolName: c.symbolName
                })),
                outgoing: hierarchy.callees.map(c => ({
                    filePath: c.filePath,
                    line: c.line,
                    character: 0,
                    symbolName: c.symbolName
                }))
            };
        }

        return { incoming: [], outgoing: [] };
    }
}
