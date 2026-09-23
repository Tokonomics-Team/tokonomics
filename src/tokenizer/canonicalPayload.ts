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

    public static countRequestOptions(value: unknown): number {
        let nodes = 0;
        const visit = (item: unknown, depth: number, seen: Set<object>): number => {
            if (++nodes > 2_000 || depth > 8 || item === null || item === undefined) return 0;
            if (typeof item === 'string') return TokenCounter.countTokens(item) + 1;
            if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'bigint') return 2;
            if (typeof item !== 'object') return 0;
            if (item instanceof Uint8Array) return Math.ceil(item.byteLength / 3) + 4;
            if (seen.has(item)) return 4;
            seen.add(item);
            let tokens = 2;
            if (Array.isArray(item)) for (const child of item.slice(0, 512)) tokens += visit(child, depth + 1, seen);
            else for (const [key, child] of Object.entries(item).slice(0, 512)) {
                tokens += TokenCounter.countTokens(key) + visit(child, depth + 1, seen);
            }
            seen.delete(item);
            return tokens;
        };
        return visit(value, 0, new Set());
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
