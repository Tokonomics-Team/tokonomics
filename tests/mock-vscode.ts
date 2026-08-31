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
    onDidCreateFiles: () => ({ dispose: () => {} }),
    onDidDeleteFiles: () => ({ dispose: () => {} }),
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
    User: (msg: string) => ({ role: 'user', content: msg }),
    Assistant: (msg: string) => ({ role: 'assistant', content: msg })
};

export const lm = {
    selectChatModels: async () => [
        {
            id: 'claude-3-7-sonnet',
            name: 'Claude 3.7 Sonnet',
            vendor: 'anthropic',
            family: 'claude-3',
            sendRequest: async () => ({
                text: ['Refactored function implementation with zero vulnerabilities.']
            })
        }
    ]
};
