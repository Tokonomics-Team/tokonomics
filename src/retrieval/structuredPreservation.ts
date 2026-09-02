import { MessagePayload } from '../types';

export interface StructuredPreservationResult {
    passed: boolean;
    obligations: readonly string[];
    missing: readonly string[];
}

export class StructuredPreservationGate {
    public static evaluate(original: readonly MessagePayload[], optimized: readonly MessagePayload[], userIntent = ''): StructuredPreservationResult {
        const obligations: string[] = [];
        const missing: string[] = [];
        if (original.length !== optimized.length) missing.push('message-cardinality');
        original.forEach((message, index) => {
            obligations.push(`message:${index}:${message.role}:${message.name || ''}`);
            const target = optimized[index];
            if (!target || target.role !== message.role || target.name !== message.name) missing.push(`message:${index}:role-or-name`);
        });
        const originalText = original.map(message => message.content).join('\n');
        const optimizedText = optimized.map(message => message.content).join('\n');
        const requested = new Set((userIntent.match(/\b[A-Z][A-Za-z0-9_$]{2,}\b/g) || []).filter(symbol => originalText.includes(symbol)));
        for (const symbol of requested) this.require(`symbol:${symbol}`, symbol, optimizedText, obligations, missing);
        const declarations = [...originalText.matchAll(/\b(?:class|interface|type|enum|function|def|struct)\s+([A-Za-z_$][\w$]*)/g)]
            .map(match => match[1]).filter(symbol => userIntent.includes(symbol));
        for (const symbol of declarations) this.require(`declaration:${symbol}`, symbol, optimizedText, obligations, missing);
        for (const citation of originalText.match(/(?:[^\s:]+):L?\d+(?:-L?\d+)?/g) || []) {
            if (userIntent.includes(citation)) this.require(`range:${citation}`, citation, optimizedText, obligations, missing);
        }
        for (const line of originalText.split(/\r?\n/).filter(line => /\b(?:Error|Exception|Traceback|TS\d{3,5})\b/.test(line))) {
            const stable = line.trim().slice(0, 160);
            if (stable) this.require(`diagnostic:${stable}`, stable, optimizedText, obligations, missing);
        }
        for (const imported of [...originalText.matchAll(/\bimport\s+(?:type\s+)?(?:\{\s*)?([A-Za-z_$][\w$]*)/g)].map(match => match[1])) {
            if (userIntent.includes(imported)) this.require(`dependency:${imported}`, imported, optimizedText, obligations, missing);
        }
        const toolCalls = new Set([...originalText.matchAll(/(?:callId|tool_call_id)["']?\s*[:=]\s*["']([^"']+)/g)].map(match => match[1]));
        for (const callId of toolCalls) this.require(`tool-pair:${callId}`, callId, optimizedText, obligations, missing);
        return { passed: missing.length === 0, obligations: Object.freeze(obligations), missing: Object.freeze(missing) };
    }

    private static require(label: string, value: string, optimized: string, obligations: string[], missing: string[]): void {
        obligations.push(label);
        if (!optimized.includes(value)) missing.push(label);
    }
}
