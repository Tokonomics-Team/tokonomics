import * as os from 'os';
import * as path from 'path';
import { MessagePayload } from '../types';
import { SecuritySanitizer } from './sanitizer';

export type RequestBoundaryErrorCode =
    | 'CANCELLED'
    | 'UNTRUSTED_WORKSPACE'
    | 'WORKSPACE_CONSENT_REQUIRED'
    | 'SOURCE_POLICY_REQUIRED'
    | 'PAYLOAD_TOO_LARGE'
    | 'SANITIZATION_FAILED'
    | 'UNSUPPORTED_VALUE';

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
    workspaceConsent?: boolean;
    sourcePolicySatisfied?: boolean;
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
        if (context.containsWorkspaceData && context.workspaceConsent !== true) {
            throw new RequestBoundaryError('WORKSPACE_CONSENT_REQUIRED', 'Workspace-derived context requires an explicit context preference.');
        }
        if (context.containsWorkspaceData && context.sourcePolicySatisfied !== true) {
            throw new RequestBoundaryError('SOURCE_POLICY_REQUIRED', 'Workspace-derived context did not pass the source policy.');
        }

        let redactedCount = 0;
        const categories = new Set<string>();
        const sanitize = (value: string): string => {
            const anonymized = this.anonymizePaths(value, context.workspaceRoots || []);
            const injectionSafe = context.containsWorkspaceData
                ? SecuritySanitizer.neutralizePromptInjections(anonymized)
                : { sanitized: anonymized, strippedCount: 0 };
            if (injectionSafe.strippedCount > 0) categories.add('prompt-injection');
            const result = SecuritySanitizer.sanitizeSecrets(injectionSafe.sanitized);
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
        if (value === undefined || value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new RequestBoundaryError('UNSUPPORTED_VALUE', 'Non-finite model option values cannot be forwarded.');
            return value;
        }
        if (typeof value !== 'object') throw new RequestBoundaryError('UNSUPPORTED_VALUE', 'Unsupported model option value type.');
        if (depth > 12) throw new RequestBoundaryError('SANITIZATION_FAILED', 'Model options exceed the sanitization depth limit.');
        if (seen.has(value)) throw new RequestBoundaryError('SANITIZATION_FAILED', 'Cyclic model options cannot be safely forwarded.');
        const prototype = Object.getPrototypeOf(value);
        if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
            throw new RequestBoundaryError('UNSUPPORTED_VALUE', 'Only plain model option objects and arrays can be forwarded.');
        }
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
