/**
 * Tokonomics Language Server Protocol Adapter Interface & Implementations
 * Decouples compiler retrieval logic from global VS Code state.
 */

import * as path from 'path';

export interface CancellationLike {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested?: (listener: () => void) => { dispose(): void };
}

export interface LspPosition {
    readonly line: number;
    readonly character: number;
}

export interface LspRange {
    readonly start: LspPosition;
    readonly end: LspPosition;
}

export interface RawLspLocation {
    readonly uri?: { fsPath?: string; scheme?: string; path?: string; toString?(): string } | string;
    readonly targetUri?: { fsPath?: string; scheme?: string; path?: string; toString?(): string } | string;
    readonly range?: LspRange;
    readonly targetRange?: LspRange;
    readonly targetSelectionRange?: LspRange;
}

export interface RawCallHierarchyItem {
    readonly name: string;
    readonly kind: number | string;
    readonly detail?: string;
    readonly uri: { fsPath?: string; scheme?: string; path?: string; toString?(): string } | string;
    readonly range: LspRange;
    readonly selectionRange: LspRange;
    readonly _raw?: any;
}

export interface RawIncomingCall {
    readonly from: RawCallHierarchyItem;
    readonly fromRanges: readonly LspRange[];
}

export interface RawOutgoingCall {
    readonly to: RawCallHierarchyItem;
    readonly fromRanges: readonly LspRange[];
}

export interface ILanguageServerAdapter {
    readonly isAvailable: boolean;
    getDefinitions(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawLspLocation[]>;
    getReferences(filePath: string, position: LspPosition, context?: { includeDeclaration: boolean }, token?: CancellationLike): Promise<RawLspLocation[]>;
    prepareCallHierarchy(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawCallHierarchyItem[]>;
    getIncomingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawIncomingCall[]>;
    getOutgoingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawOutgoingCall[]>;
    getDocumentVersion(filePath: string): number | undefined;
}

/**
 * Production implementation binding safely to VS Code APIs
 */
export class VsCodeLanguageServerAdapter implements ILanguageServerAdapter {
    private vscode: any = null;

    constructor() {
        try {
            this.vscode = require('vscode');
        } catch {
            this.vscode = null;
        }
    }

    public get isAvailable(): boolean {
        return !!(this.vscode && this.vscode.commands && this.vscode.commands.executeCommand);
    }

    public async getDefinitions(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawLspLocation[]> {
        if (!this.isAvailable) return [];
        if (token?.isCancellationRequested) return [];
        const uri = this.vscode.Uri.file(filePath);
        const pos = new this.vscode.Position(position.line, position.character);
        const result = await this.vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, pos);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    public async getReferences(
        filePath: string,
        position: LspPosition,
        _context: { includeDeclaration: boolean } = { includeDeclaration: true },
        token?: CancellationLike
    ): Promise<RawLspLocation[]> {
        if (!this.isAvailable) return [];
        if (token?.isCancellationRequested) return [];
        const uri = this.vscode.Uri.file(filePath);
        const pos = new this.vscode.Position(position.line, position.character);
        const result = await this.vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, pos);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    public async prepareCallHierarchy(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawCallHierarchyItem[]> {
        if (!this.isAvailable) return [];
        if (token?.isCancellationRequested) return [];
        const uri = this.vscode.Uri.file(filePath);
        const pos = new this.vscode.Position(position.line, position.character);
        const result = await this.vscode.commands.executeCommand('vscode.prepareCallHierarchy', uri, pos);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    public async getIncomingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawIncomingCall[]> {
        if (!this.isAvailable) return [];
        if (token?.isCancellationRequested) return [];
        const target = item._raw || item;
        const result = await this.vscode.commands.executeCommand('vscode.provideIncomingCalls', target);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    public async getOutgoingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawOutgoingCall[]> {
        if (!this.isAvailable) return [];
        if (token?.isCancellationRequested) return [];
        const target = item._raw || item;
        const result = await this.vscode.commands.executeCommand('vscode.provideOutgoingCalls', target);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    public getDocumentVersion(filePath: string): number | undefined {
        if (!this.vscode?.workspace?.textDocuments) return undefined;
        try {
            const normalized = path.normalize(filePath).toLowerCase();
            const doc = this.vscode.workspace.textDocuments.find(
                (d: any) => d.uri?.fsPath && path.normalize(d.uri.fsPath).toLowerCase() === normalized
            );
            return doc?.version;
        } catch {
            return undefined;
        }
    }
}

/**
 * Mock adapter for deterministic automated tests and failure simulation
 */
export class MockLanguageServerAdapter implements ILanguageServerAdapter {
    public isAvailable: boolean = true;
    public delayMs: number = 0;
    public shouldFail: boolean = false;
    public shouldReturnMalformed: boolean = false;
    public definitions = new Map<string, RawLspLocation[]>();
    public references = new Map<string, RawLspLocation[]>();
    public callHierarchyItems = new Map<string, RawCallHierarchyItem[]>();
    public incomingCalls = new Map<string, RawIncomingCall[]>();
    public outgoingCalls = new Map<string, RawOutgoingCall[]>();
    public documentVersions = new Map<string, number>();

    public async getDefinitions(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawLspLocation[]> {
        await this.simulateDelay(token);
        if (this.shouldFail) throw new Error('Mock LSP definition failure');
        if (this.shouldReturnMalformed) return { invalid: true } as any;
        const key = `${this.norm(filePath)}:${position.line}:${position.character}`;
        return this.definitions.get(key) || this.definitions.get(this.norm(filePath)) || [];
    }

    public async getReferences(
        filePath: string,
        position: LspPosition,
        _context?: { includeDeclaration: boolean },
        token?: CancellationLike
    ): Promise<RawLspLocation[]> {
        await this.simulateDelay(token);
        if (this.shouldFail) throw new Error('Mock LSP reference failure');
        if (this.shouldReturnMalformed) return 'invalid_string' as any;
        const key = `${this.norm(filePath)}:${position.line}:${position.character}`;
        return this.references.get(key) || this.references.get(this.norm(filePath)) || [];
    }

    public async prepareCallHierarchy(filePath: string, position: LspPosition, token?: CancellationLike): Promise<RawCallHierarchyItem[]> {
        await this.simulateDelay(token);
        if (this.shouldFail) throw new Error('Mock LSP call hierarchy failure');
        if (this.shouldReturnMalformed) return null as any;
        const key = `${this.norm(filePath)}:${position.line}:${position.character}`;
        return this.callHierarchyItems.get(key) || this.callHierarchyItems.get(this.norm(filePath)) || [];
    }

    public async getIncomingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawIncomingCall[]> {
        await this.simulateDelay(token);
        if (this.shouldFail) throw new Error('Mock LSP incoming calls failure');
        return this.incomingCalls.get(item.name) || [];
    }

    public async getOutgoingCalls(item: RawCallHierarchyItem, token?: CancellationLike): Promise<RawOutgoingCall[]> {
        await this.simulateDelay(token);
        if (this.shouldFail) throw new Error('Mock LSP outgoing calls failure');
        return this.outgoingCalls.get(item.name) || [];
    }

    public getDocumentVersion(filePath: string): number | undefined {
        return this.documentVersions.get(this.norm(filePath));
    }

    private async simulateDelay(token?: CancellationLike): Promise<void> {
        if (this.delayMs > 0) {
            await new Promise<void>((resolve, reject) => {
                let cancellationDisposable: { dispose(): void } | undefined;
                const finish = (action: () => void) => {
                    clearTimeout(timer);
                    cancellationDisposable?.dispose();
                    action();
                };
                const timer = setTimeout(() => finish(resolve), this.delayMs);
                cancellationDisposable = token?.onCancellationRequested?.(() => finish(() => reject(new Error('Operation cancelled'))));
            });
        }
        if (token?.isCancellationRequested) {
            throw new Error('Operation cancelled');
        }
    }

    private norm(p: string): string {
        return path.normalize(p).replace(/\\/g, '/').toLowerCase();
    }
}
