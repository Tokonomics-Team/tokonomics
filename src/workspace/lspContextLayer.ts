/**
 * Tokonomics LSP (Language Server Protocol) Intelligence Layer
 * Queries live VS Code Language Servers for definitions, references, type definitions,
 * and call hierarchies, with deterministic fallback to SCIP and Tree-sitter.
 */

import { WorkspaceGraph } from './workspaceGraph';
import { ScipIndexer } from './scipIndexer';

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
    private isVsCodeAvailable: boolean = false;

    constructor(
        private workspaceGraph?: WorkspaceGraph,
        private scipIndexer?: ScipIndexer
    ) {
        try {
            const vscodeModule = require('vscode');
            this.isVsCodeAvailable = !!(vscodeModule && vscodeModule.commands && vscodeModule.commands.executeCommand);
        } catch {
            this.isVsCodeAvailable = false;
        }
    }

    /**
     * Resolves definitions for a symbol at a given file and position
     */
    public async getDefinitions(filePath: string, line: number, character: number, symbolName?: string): Promise<LspLocation[]> {
        if (this.isVsCodeAvailable) {
            try {
                const vscode = require('vscode');
                const uri = vscode.Uri.file(filePath);
                const pos = new vscode.Position(line, character);

                const result = await Promise.race([
                    vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, pos),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]) as any[];

                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map(loc => ({
                        filePath: loc.uri?.fsPath || loc.targetUri?.fsPath || filePath,
                        line: loc.range?.start?.line ?? loc.targetRange?.start?.line ?? 0,
                        character: loc.range?.start?.character ?? loc.targetRange?.start?.character ?? 0,
                        symbolName
                    }));
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
        if (this.isVsCodeAvailable) {
            try {
                const vscode = require('vscode');
                const uri = vscode.Uri.file(filePath);
                const pos = new vscode.Position(line, character);

                const result = await Promise.race([
                    vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, pos),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]) as any[];

                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map(loc => ({
                        filePath: loc.uri?.fsPath || filePath,
                        line: loc.range?.start?.line ?? 0,
                        character: loc.range?.start?.character ?? 0,
                        symbolName
                    }));
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
        if (this.isVsCodeAvailable) {
            try {
                const vscode = require('vscode');
                const uri = vscode.Uri.file(filePath);
                const pos = new vscode.Position(line, character);

                const items = await Promise.race([
                    vscode.commands.executeCommand('vscode.prepareCallHierarchy', uri, pos),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('LSP timeout')), 400))
                ]) as any[];

                if (items && Array.isArray(items) && items.length > 0) {
                    const item = items[0];
                    const incomingCalls = await vscode.commands.executeCommand('vscode.provideIncomingCalls', item) as any[] || [];
                    const outgoingCalls = await vscode.commands.executeCommand('vscode.provideOutgoingCalls', item) as any[] || [];

                    const incoming: LspLocation[] = incomingCalls.map(c => ({
                        filePath: c.from?.uri?.fsPath || filePath,
                        line: c.from?.range?.start?.line ?? 0,
                        character: c.from?.range?.start?.character ?? 0,
                        symbolName: c.from?.name
                    }));

                    const outgoing: LspLocation[] = outgoingCalls.map(c => ({
                        filePath: c.to?.uri?.fsPath || filePath,
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
