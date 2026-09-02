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

export const window = {
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

export const LanguageModelChatMessage = {
    User: (content: any, name?: string) => ({ role: 'user', content: typeof content === 'string' ? [new LanguageModelTextPart(content)] : content, name }),
    Assistant: (content: any, name?: string) => ({ role: 'assistant', content: typeof content === 'string' ? [new LanguageModelTextPart(content)] : content, name })
};

export const registeredLmProviders: Array<{ vendor: string; provider: any }> = [];
export let lastModelRequest: { messages: any[]; options: any } | undefined;
export function clearLastModelRequest() { lastModelRequest = undefined; }
export let nextModelResponseParts: any[] | undefined;
export function setNextModelResponseParts(parts?: any[]) { nextModelResponseParts = parts; }

export const lm = {
    registerLanguageModelChatProvider: (vendor: string, provider: any) => {
        registeredLmProviders.push({ vendor, provider });
        return { dispose: () => {} };
    },
    selectChatModels: async () => [
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
                        text: []
                    };
                }
                return ({
                text: ['Refactored function implementation with zero vulnerabilities.']
                });
            }
        }
    ]
};
