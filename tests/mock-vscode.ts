/**
 * Complete Mock VS Code API Module for Host Lifecycle Simulation & Test Suites
 */

export const commandsRegistered = new Map<string, Function>();

export const commands = {
    registerCommand: (commandId: string, callback: Function) => {
        if (commandsRegistered.has(commandId)) {
            throw new Error(`CRITICAL RUNTIME COLLISION: Duplicate command registration for "${commandId}"!`);
        }
        commandsRegistered.set(commandId, callback);
        return {
            dispose: () => commandsRegistered.delete(commandId)
        };
    },
    executeCommand: async (commandId: string, ...args: any[]) => {
        const fn = commandsRegistered.get(commandId);
        if (fn) return fn(...args);
    }
};

export let activeChatParticipantId: string | null = null;
export let activeChatParticipantHandler: Function | null = null;

export const chat = {
    createChatParticipant: (id: string, handler: Function) => {
        activeChatParticipantId = id;
        activeChatParticipantHandler = handler;
        return {
            iconPath: null,
            dispose: () => {
                activeChatParticipantId = null;
                activeChatParticipantHandler = null;
            }
        };
    }
};

export const languages = {
    getDiagnostics: (_uri?: any) => [] as any[]
};

export const window = {
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    registerWebviewViewProvider: (viewId: string, provider: any, options?: any) => {
        registeredWebviewViewProviders.push({ viewId, provider, options });
        return { dispose: () => {} };
    },
    createStatusBarItem: (alignment?: any, priority?: number) => ({
        text: '',
        tooltip: '',
        command: '',
        show: () => {},
        hide: () => {},
        dispose: () => {}
    }),
    createOutputChannel: (name: string) => ({
        append: () => {},
        appendLine: () => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {}
    }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
    registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
    showInformationMessage: async (msg: string, ...items: any[]) => items[0],
    showWarningMessage: async (msg: string, ...items: any[]) => items[0],
    showErrorMessage: async (msg: string, ...items: any[]) => items[0],
    createWebviewPanel: (viewType: string, title: string, showOptions: any, options?: any) => {
        const listeners: Function[] = [];
        return {
            webview: {
                html: '',
                postMessage: (msg: any) => {},
                onDidReceiveMessage: (listener: Function) => {
                    listeners.push(listener);
                    return { dispose: () => {} };
                }
            },
            reveal: () => {},
            dispose: () => {},
            onDidDispose: () => ({ dispose: () => {} })
        };
    },
    activeTextEditor: undefined as any,
    visibleTextEditors: [] as any[],
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    showTextDocument: async (doc: any, options?: any) => ({})
};

export const workspace = {
    textDocuments: [] as any[],
    workspaceFolders: [
        { uri: { fsPath: process.cwd() } }
    ],
    getConfiguration: (section?: string) => ({
        get: (key: string, defaultValue?: any) => defaultValue,
        has: () => true,
        inspect: () => undefined,
        update: async () => {}
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidCreateFiles: () => ({ dispose: () => {} }),
    onDidDeleteFiles: () => ({ dispose: () => {} }),
    onDidRenameFiles: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    registerTextDocumentContentProvider: (scheme: string, provider: any) => ({ dispose: () => {} }),
    openTextDocument: async (options?: any) => ({
        getText: () => options?.content || '',
        fileName: 'document.md',
        languageId: options?.language || 'markdown'
    }),
    createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {}
    })
};

export const env = {
    clipboard: {
        writeText: async (text: string) => {},
        readText: async () => ''
    }
};

export const Uri = {
    file: (filePath: string) => ({
        fsPath: filePath,
        scheme: 'file',
        path: filePath,
        toString: () => `file://${filePath}`
    }),
    parse: (uriStr: string) => ({
        fsPath: uriStr.replace('file://', ''),
        scheme: 'file',
        path: uriStr,
        toString: () => uriStr
    })
};

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}

export enum LanguageModelChatMessageRole {
    User = 1,
    Assistant = 2
}

export class LanguageModelTextPart {
    constructor(public value: string) {}
}

export class LanguageModelToolCallPart {
    constructor(public callId: string, public name: string, public input: object) {}
}

export class LanguageModelToolResultPart {
    constructor(public callId: string, public content: any[]) {}
}

export class LanguageModelPromptTsxPart {
    constructor(public value: unknown) {}
}

export class LanguageModelDataPart {
    constructor(public data: Uint8Array, public mimeType: string) {}
    static image(data: Uint8Array, mimeType: string) { return new LanguageModelDataPart(data, mimeType); }
    static text(value: string, mimeType = 'text/plain') { return new LanguageModelDataPart(new TextEncoder().encode(value), mimeType); }
    static json(value: any, mimeType = 'application/json') { return LanguageModelDataPart.text(JSON.stringify(value), mimeType); }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2
}

export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3
}

export class MarkdownString {
    constructor(public value: string = '') {}
    appendMarkdown(val: string) { this.value += val; return this; }
    appendText(val: string) { this.value += val; return this; }
}

export class ThemeColor {
    constructor(public id: string) {}
}

export class EventEmitter<T> {
    private listeners: Function[] = [];
    public event = (listener: Function) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
    };
    public fire(data?: T) {
        for (const l of this.listeners) {
            try { l(data); } catch {}
        }
    }
    public dispose() {
        this.listeners = [];
    }
}

export class ChatRequestTurn {
    constructor(public prompt: string) {}
}

export class ChatResponseTurn {
    constructor(public response: any[]) {}
}

export class ChatResponseMarkdownPart {
    constructor(public value: { value: string }) {}
}

// Roles are the numeric enum the real API uses. A string here silently diverged from
// LanguageModelChatMessageRole, so code that branches on the role passed every test and failed
// against the real host.
export const LanguageModelChatMessage = {
    User: (content: any, name?: string) => ({ role: LanguageModelChatMessageRole.User, content: typeof content === 'string' ? [new LanguageModelTextPart(content)] : content, name }),
    Assistant: (content: any, name?: string) => ({ role: LanguageModelChatMessageRole.Assistant, content: typeof content === 'string' ? [new LanguageModelTextPart(content)] : content, name })
};

export const registeredLmProviders: Array<{ vendor: string; provider: any }> = [];
export let lastModelRequest: { messages: any[]; options: any } | undefined;
export function clearLastModelRequest() { lastModelRequest = undefined; }
export let nextModelResponseParts: any[] | undefined;
export function setNextModelResponseParts(parts?: any[]) { nextModelResponseParts = parts; }

/**
 * Chat-surface test hooks. When `chatModelOverride` is set, `lm.selectChatModels` returns it
 * instead of the default fixture list, so model discovery cases (empty, duplicate, disappearing)
 * can be driven without touching the existing provider fixtures.
 */
let chatModelOverride: any[] | undefined;
let selectChatModelsThrows: Error | undefined;
export function setChatModelOverride(models: any[] | undefined): void { chatModelOverride = models; }
export function setSelectChatModelsError(error: Error | undefined): void { selectChatModelsThrows = error; }

const chatModelChangeListeners: Array<() => void> = [];
export function fireChatModelsChanged(): void { for (const listener of [...chatModelChangeListeners]) listener(); }
export function chatModelListenerCount(): number { return chatModelChangeListeners.length; }

export const registeredWebviewViewProviders: Array<{ viewId: string; provider: any; options?: any }> = [];

export class CancellationTokenSource {
    private listeners: Array<() => void> = [];
    public token = {
        isCancellationRequested: false,
        onCancellationRequested: (listener: () => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter(item => item !== listener); } };
        }
    };
    public cancel(): void {
        if (this.token.isCancellationRequested) return;
        this.token.isCancellationRequested = true;
        for (const listener of [...this.listeners]) listener();
    }
    public dispose(): void { this.listeners = []; }
}

export const lm = {
    onDidChangeChatModels: (listener: () => void) => {
        chatModelChangeListeners.push(listener);
        return { dispose: () => {
            const index = chatModelChangeListeners.indexOf(listener);
            if (index >= 0) chatModelChangeListeners.splice(index, 1);
        } };
    },
    registerLanguageModelChatProvider: (vendor: string, provider: any) => {
        registeredLmProviders.push({ vendor, provider });
        return { dispose: () => {} };
    },
    selectChatModels: async (selector?: { vendor?: string }) => {
        if (selectChatModelsThrows) throw selectChatModelsThrows;
        if (chatModelOverride) {
            return selector?.vendor
                ? chatModelOverride.filter(model => model.vendor === selector.vendor)
                : chatModelOverride;
        }
        return DEFAULT_CHAT_MODELS.filter(model => !selector?.vendor || model.vendor === selector.vendor);
    }
};

const DEFAULT_CHAT_MODELS: any[] = [
        {
            id: 'claude-3-7-sonnet',
            name: 'Claude 3.7 Sonnet',
            vendor: 'anthropic',
            family: 'claude-3',
            sendRequest: async (messages: any[], options: any) => {
                lastModelRequest = { messages, options };
                if (nextModelResponseParts) {
                    const parts = nextModelResponseParts;
                    nextModelResponseParts = undefined;
                    return {
                        stream: (async function* () { for (const part of parts) yield part; })(),
                        text: [],
                        usage: { inputTokens: 500, outputTokens: 20, cachedTokens: 0 }
                    };
                }
                return ({
                text: ['Refactored function implementation with zero vulnerabilities.'],
                usage: { inputTokens: 500, outputTokens: 20, cachedTokens: 0 }
                });
            }
        }
    ]
