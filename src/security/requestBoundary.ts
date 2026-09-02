import * as os from 'os';
import * as path from 'path';
import { MessagePayload } from '../types';
import { SecuritySanitizer } from './sanitizer';

export type RequestBoundaryErrorCode = 'CANCELLED' | 'UNTRUSTED_WORKSPACE' | 'PAYLOAD_TOO_LARGE' | 'SANITIZATION_FAILED';

export class RequestBoundaryError extends Error {
    constructor(public readonly code: RequestBoundaryErrorCode, message: string) {
        super(message);
        this.name = 'RequestBoundaryError';
    }
}

export interface RequestBoundaryContext {
    workspaceRoots?: string[];
    workspaceTrusted: boolean;
    containsWorkspaceData?: boolean;
    isCancellationRequested?: boolean;
    maxPayloadBytes?: number;
}

export interface PreparedRequest {
    messages: MessagePayload[];
    options: unknown;
    redactedCount: number;
    categories: string[];
}

/** The sole final hop before any cloud model request. */
export class ModelRequestBoundary {
    public static prepare(messages: readonly MessagePayload[], options: unknown, context: RequestBoundaryContext): PreparedRequest {
        if (context.isCancellationRequested) throw new RequestBoundaryError('CANCELLED', 'Request cancelled before model egress.');
        if (context.containsWorkspaceData && !context.workspaceTrusted) {
            throw new RequestBoundaryError('UNTRUSTED_WORKSPACE', 'Workspace-derived context is blocked until the workspace is trusted.');
        }

        let redactedCount = 0;
        const categories = new Set<string>();
        const sanitize = (value: string): string => {
            const anonymized = this.anonymizePaths(value, context.workspaceRoots || []);
            const result = SecuritySanitizer.sanitizeSecrets(anonymized);
            if (result.residualSecret) throw new RequestBoundaryError('SANITIZATION_FAILED', 'A credential-like value remained after sanitization.');
            redactedCount += result.redactedCount;
            result.categories.forEach(category => categories.add(category));
            return result.sanitized;
        };

        const preparedMessages = messages.map(message => ({ ...message, content: sanitize(message.content), name: message.name ? sanitize(message.name) : undefined }));
        const preparedOptions = this.sanitizeValue(options, sanitize, new WeakSet<object>(), 0);
        const payloadSize = Buffer.byteLength(JSON.stringify({ messages: preparedMessages, options: preparedOptions }), 'utf8');
        if (payloadSize > (context.maxPayloadBytes || 4 * 1024 * 1024)) {
            throw new RequestBoundaryError('PAYLOAD_TOO_LARGE', 'Sanitized model request exceeds the outbound payload limit.');
        }
        return { messages: preparedMessages, options: preparedOptions, redactedCount, categories: [...categories].sort() };
    }

    public static anonymizePaths(text: string, workspaceRoots: string[]): string {
        let result = text;
        const roots = [...workspaceRoots].filter(Boolean).sort((a, b) => b.length - a.length);
        for (const root of roots) {
            const normalized = path.resolve(root).replace(/\\/g, '/').replace(/\/$/, '');
            const pathPattern = SecuritySanitizer.escapeRegExp(normalized).replace(/\//g, '[\\\\/]');
            result = result.replace(new RegExp(`${pathPattern}(?:[\\\\/]([^\\s\`'"<>|]+))?`, 'gi'), (_match, relative) => `<workspace>${relative ? `/${String(relative).replace(/\\/g, '/')}` : ''}`);
        }
        const home = os.homedir().replace(/\\/g, '/').replace(/\/$/, '');
        if (home) {
            const homePattern = SecuritySanitizer.escapeRegExp(home).replace(/\//g, '[\\\\/]');
            result = result.replace(new RegExp(`${homePattern}(?:[\\\\/]([^\\s\`'"<>|]+))?`, 'gi'), (_match, relative) => `<user_home>${relative ? `/${String(relative).replace(/\\/g, '/')}` : ''}`);
        }
        return result;
    }

    private static sanitizeValue(value: unknown, sanitize: (value: string) => string, seen: WeakSet<object>, depth: number): unknown {
        if (typeof value === 'string') return sanitize(value);
        if (value === null || typeof value !== 'object') return value;
        if (depth > 12) throw new RequestBoundaryError('SANITIZATION_FAILED', 'Model options exceed the sanitization depth limit.');
        if (seen.has(value)) throw new RequestBoundaryError('SANITIZATION_FAILED', 'Cyclic model options cannot be safely forwarded.');
        const prototype = Object.getPrototypeOf(value);
        if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
        seen.add(value);
        const output: any = Array.isArray(value) ? [] : {};
        for (const [key, child] of Object.entries(value)) {
            if (typeof child === 'string' && /^(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)$/i.test(key)) {
                output[key] = '***[REDACTED_CREDENTIAL_VALUE]***';
            } else {
                output[key] = this.sanitizeValue(child, sanitize, seen, depth + 1);
            }
        }
        seen.delete(value);
        return output;
    }
}
