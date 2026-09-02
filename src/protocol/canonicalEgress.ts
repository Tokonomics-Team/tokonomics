import { ModelRequestBoundary, RequestBoundaryContext, RequestBoundaryError } from '../security/requestBoundary';
import { CanonicalMessage, CanonicalPart, CanonicalToolResultPart } from './canonicalProtocol';

interface SerializedData { kind: 'data'; mimeType: string; text?: string; binaryIndex?: number; }
type SerializedToolChild = { kind: 'text'; text: string } | SerializedData;
type SerializedPart =
    | { kind: 'text'; text: string }
    | { kind: 'tool_call'; callId: string; name: string; input: object }
    | { kind: 'tool_result'; callId: string; content: SerializedToolChild[] }
    | SerializedData;
interface SerializedMessage { role: string; name?: string; parts: SerializedPart[]; }

export interface CanonicalEgressResult {
    messages: CanonicalMessage[];
    options: unknown;
    redactedCount: number;
    categories: string[];
}

export function prepareCanonicalEgress(
    messages: readonly CanonicalMessage[],
    options: unknown,
    context: RequestBoundaryContext
): CanonicalEgressResult {
    const binaryParts: Uint8Array[] = [];
    let binaryBytes = 0;
    const serializeData = (mimeType: string, data: Uint8Array): SerializedData => {
        if (isTextualMime(mimeType)) {
            return { kind: 'data', mimeType, text: new TextDecoder().decode(data) };
        }
        const binaryIndex = binaryParts.length;
        const copy = data.slice();
        binaryParts.push(copy);
        binaryBytes += copy.byteLength;
        return { kind: 'data', mimeType, binaryIndex };
    };
    const serialized: SerializedMessage[] = messages.map(message => ({
        role: message.role,
        name: message.name,
        parts: message.parts.map(part => {
            switch (part.kind) {
                case 'text': return { kind: 'text', text: part.text };
                case 'tool_call': return { kind: 'tool_call', callId: part.callId, name: part.name, input: part.input };
                case 'tool_result': return {
                    kind: 'tool_result', callId: part.callId,
                    content: part.content.map(child => child.kind === 'text'
                        ? { kind: 'text' as const, text: child.text }
                        : serializeData(child.mimeType, child.data))
                };
                case 'data': return serializeData(part.mimeType, part.data);
            }
        })
    }));
    const maxPayloadBytes = context.maxPayloadBytes || 4 * 1024 * 1024;
    if (binaryBytes > maxPayloadBytes) throw new RequestBoundaryError('PAYLOAD_TOO_LARGE', 'Binary model parts exceed the outbound payload limit.');
    const prepared = ModelRequestBoundary.prepare([], { messages: serialized, forwardedOptions: options }, {
        ...context,
        maxPayloadBytes: maxPayloadBytes - binaryBytes
    });
    const value = prepared.options as { messages: SerializedMessage[]; forwardedOptions: unknown };
    const restoreData = (part: SerializedData): { kind: 'data'; mimeType: string; data: Uint8Array } => ({
        kind: 'data',
        mimeType: part.mimeType,
        data: part.text !== undefined ? new TextEncoder().encode(part.text) : binaryParts[part.binaryIndex!].slice()
    });
    const restoredMessages: CanonicalMessage[] = value.messages.map(message => ({
        role: message.role as CanonicalMessage['role'],
        name: message.name,
        parts: message.parts.map((part): CanonicalPart => {
            switch (part.kind) {
                case 'text': return part;
                case 'tool_call': return part;
                case 'tool_result': return {
                    kind: 'tool_result', callId: part.callId,
                    content: part.content.map((child): CanonicalToolResultPart => child.kind === 'text' ? child : restoreData(child))
                };
                case 'data': return restoreData(part);
            }
        })
    }));
    return {
        messages: restoredMessages,
        options: value.forwardedOptions,
        redactedCount: prepared.redactedCount,
        categories: prepared.categories
    };
}

function isTextualMime(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return normalized.startsWith('text/') || normalized.includes('json') || normalized.includes('xml') || normalized.includes('javascript');
}
