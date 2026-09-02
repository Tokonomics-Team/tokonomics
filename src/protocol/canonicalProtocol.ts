import * as vscode from 'vscode';

export type CanonicalRole = 'system' | 'user' | 'assistant';

export type CanonicalPart =
    | { kind: 'text'; text: string }
    | { kind: 'tool_call'; callId: string; name: string; input: object }
    | { kind: 'tool_result'; callId: string; content: CanonicalToolResultPart[] }
    | { kind: 'data'; mimeType: string; data: Uint8Array };

export type CanonicalToolResultPart =
    | { kind: 'text'; text: string }
    | { kind: 'data'; mimeType: string; data: Uint8Array };

export interface CanonicalMessage {
    role: CanonicalRole;
    name?: string;
    parts: CanonicalPart[];
}

export type ProtocolErrorCode = 'UNSUPPORTED_INPUT_PART' | 'UNSUPPORTED_OUTPUT_PART' | 'UNSUPPORTED_SYSTEM_ROLE' | 'INVALID_MESSAGE_ROLE';

export class ProtocolError extends Error {
    constructor(public readonly code: ProtocolErrorCode, message: string) {
        super(message);
        this.name = 'ProtocolError';
    }
}

export class VsCodeProtocolAdapter {
    public fromProviderMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): CanonicalMessage[] {
        return messages.map((message, messageIndex) => ({
            role: this.fromVsCodeRole(message.role),
            name: message.name,
            parts: [...message.content].map((part, partIndex) => this.fromVsCodePart(part, messageIndex, partIndex))
        }));
    }

    public toUpstreamMessages(messages: readonly CanonicalMessage[]): vscode.LanguageModelChatMessage[] {
        return messages.map((message, messageIndex) => {
            if (message.role === 'system') {
                throw new ProtocolError('UNSUPPORTED_SYSTEM_ROLE', `VS Code's language-model request API has no system role (message ${messageIndex}).`);
            }
            const parts = message.parts.map(part => this.toVsCodePart(part));
            return message.role === 'assistant'
                ? vscode.LanguageModelChatMessage.Assistant(parts as any, message.name)
                : vscode.LanguageModelChatMessage.User(parts as any, message.name);
        });
    }

    public isStructured(messages: readonly CanonicalMessage[]): boolean {
        return messages.some(message => message.parts.some(part => part.kind !== 'text'));
    }

    private fromVsCodeRole(role: vscode.LanguageModelChatMessageRole): CanonicalRole {
        if (role === vscode.LanguageModelChatMessageRole.User) return 'user';
        if (role === vscode.LanguageModelChatMessageRole.Assistant) return 'assistant';
        throw new ProtocolError('INVALID_MESSAGE_ROLE', `Unsupported VS Code language-model role: ${String(role)}`);
    }

    private fromVsCodePart(part: unknown, messageIndex: number, partIndex: number): CanonicalPart {
        if (part instanceof vscode.LanguageModelTextPart) return { kind: 'text', text: part.value };
        if (part instanceof vscode.LanguageModelToolCallPart) {
            return { kind: 'tool_call', callId: part.callId, name: part.name, input: part.input };
        }
        if (part instanceof vscode.LanguageModelToolResultPart) {
            return {
                kind: 'tool_result',
                callId: part.callId,
                content: part.content.map((child, childIndex) => {
                    if (child instanceof vscode.LanguageModelTextPart) return { kind: 'text' as const, text: child.value };
                    if (child instanceof vscode.LanguageModelDataPart) return { kind: 'data' as const, mimeType: child.mimeType, data: child.data.slice() };
                    throw new ProtocolError('UNSUPPORTED_INPUT_PART', `Unsupported tool-result part at ${messageIndex}:${partIndex}:${childIndex}.`);
                })
            };
        }
        if (part instanceof vscode.LanguageModelDataPart) {
            return { kind: 'data', mimeType: part.mimeType, data: part.data.slice() };
        }
        throw new ProtocolError('UNSUPPORTED_INPUT_PART', `Unknown language-model input part at ${messageIndex}:${partIndex}; request was not forwarded.`);
    }

    private toVsCodePart(part: CanonicalPart): vscode.LanguageModelInputPart {
        switch (part.kind) {
            case 'text': return new vscode.LanguageModelTextPart(part.text);
            case 'tool_call': return new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input);
            case 'tool_result': return new vscode.LanguageModelToolResultPart(part.callId, part.content.map(child => child.kind === 'text'
                ? new vscode.LanguageModelTextPart(child.text)
                : new vscode.LanguageModelDataPart(child.data, child.mimeType)));
            case 'data': return new vscode.LanguageModelDataPart(part.data, part.mimeType);
        }
    }
}

export function canonicalTextMessage(role: CanonicalRole, text: string, name?: string): CanonicalMessage {
    return { role, name, parts: [{ kind: 'text', text }] };
}
