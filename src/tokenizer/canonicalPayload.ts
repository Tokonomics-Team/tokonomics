import { TokenCounter } from '../engine/tokenizer';
import { CanonicalMessage, CanonicalPart, CanonicalToolResultPart } from '../protocol/canonicalProtocol';

export class CanonicalPayloadTokenEstimator {
    public static countNonTextParts(messages: readonly CanonicalMessage[]): number {
        let tokens = 0;
        for (const message of messages) {
            for (const part of message.parts) tokens += this.countPart(part);
        }
        return tokens;
    }

    private static countPart(part: CanonicalPart): number {
        switch (part.kind) {
            case 'text': return 0;
            case 'tool_call': return TokenCounter.countTokens(JSON.stringify({ callId: part.callId, name: part.name, input: part.input })) + 6;
            case 'tool_result': return TokenCounter.countTokens(part.callId) + 4 + part.content.reduce((sum, child) => sum + this.countToolPart(child), 0);
            case 'data': return this.countData(part.mimeType, part.data);
        }
    }

    private static countToolPart(part: CanonicalToolResultPart): number {
        return part.kind === 'text' ? TokenCounter.countTokens(part.text) : this.countData(part.mimeType, part.data);
    }

    private static countData(mimeType: string, data: Uint8Array): number {
        const normalized = mimeType.toLowerCase();
        if (normalized.startsWith('text/') || normalized.includes('json') || normalized.includes('xml') || normalized.includes('javascript')) {
            return TokenCounter.countTokens(new TextDecoder().decode(data)) + 4;
        }
        // Dimensions are not part of the canonical VS Code data contract. Bytes/3 is a
        // deliberately conservative upper allocation until a provider tokenizer is available.
        return Math.max(85, Math.ceil(data.byteLength / 3)) + 4;
    }
}
