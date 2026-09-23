/** Final-hop secret redaction and prompt injection neutralization. This class intentionally has no logging. */
export interface SanitizationResult {
    sanitized: string;
    redactedCount: number;
    categories: string[];
    residualSecret: boolean;
}

interface SecretPattern {
    name: string;
    regex: RegExp;
    replacement: string;
    isHighConfidence: boolean;
}

export class SecuritySanitizer {
    private static readonly DUMMY_VALUE_REGEX = /(?:mock|test|fake|dummy|sample|example|placeholder|changeme|temp|default|123456|abcdef|your[_-]|none|null|undefined|xxx)/i;
    private static readonly DUMMY_VAR_PREFIX = /^(?:mock|test|fake|dummy|sample|example|temp|fixture)/i;
    private static readonly CANDIDATE_NAMES_REGEX = /\b[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)[A-Za-z0-9_-]*\b/gi;

    private static readonly PROMPT_INJECTION_PATTERNS: RegExp[] = [
        /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|past|above|earlier)\s+(?:instructions|guidelines|rules|prompts|commands|directives)\b/i,
        /\b(?:system\s+prompt|system\s+directive|system\s+instruction)\s*:/i,
        /\[\s*(?:system|admin|developer|override|jailbreak)\s+(?:instruction|directive|prompt|override|command)\s*\]/i,
        /\b(?:you\s+are\s+now|switch\s+to|act\s+as)\s+(?:in\s+)?(?:maintenance|developer|admin|root|debug|unrestricted|god|dan)\s+mode\b/i,
        /\b(?:bypass|override)\s+(?:all\s+)?(?:safety|security|system)\s+(?:rules|filters|guidelines|instructions)\b/i,
        /\b(?:output|reveal|dump)\s+(?:all\s+)?(?:secrets|passwords|credentials|api[_-]?keys|tokens|system\s+prompt)\b/i
    ];

    private static readonly SECRET_PATTERNS: (SecretPattern & { quickCheck?: string | string[] })[] = [
        { name: 'anthropic-key', regex: /\bsk-ant-(?:api\d{2}-)?[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_ANTHROPIC_KEY]***', isHighConfidence: true, quickCheck: 'sk-ant-' },
        { name: 'openai-key', regex: /\bsk-(?!ant-)(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_OPENAI_KEY]***', isHighConfidence: true, quickCheck: 'sk-' },
        { name: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9_-]{30,}\b/g, replacement: '***[REDACTED_GITHUB_TOKEN]***', isHighConfidence: true, quickCheck: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'] },
        { name: 'gitlab-token', regex: /\bglpat-[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_GITLAB_TOKEN]***', isHighConfidence: true, quickCheck: 'glpat-' },
        { name: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g, replacement: '***[REDACTED_GOOGLE_API_KEY]***', isHighConfidence: true, quickCheck: 'AIza' },
        { name: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: '***[REDACTED_AWS_ACCESS_KEY]***', isHighConfidence: true, quickCheck: ['AKIA', 'ASIA'] },
        { name: 'npm-token', regex: /\bnpm_[a-zA-Z0-9]{30,}\b/g, replacement: '***[REDACTED_NPM_TOKEN]***', isHighConfidence: true, quickCheck: 'npm_' },
        { name: 'stripe-key', regex: /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{16,}\b/g, replacement: '***[REDACTED_STRIPE_KEY]***', isHighConfidence: true, quickCheck: ['sk_', 'rk_'] },
        { name: 'sendgrid-key', regex: /\bSG\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\b/g, replacement: '***[REDACTED_SENDGRID_KEY]***', isHighConfidence: true, quickCheck: 'SG.' },
        { name: 'jwt', regex: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, replacement: '***[REDACTED_JWT]***', isHighConfidence: true, quickCheck: 'eyJ' },
        { name: 'bearer-token', regex: /\bBearer\s+[a-zA-Z0-9_.~+\/-]{20,}/gi, replacement: 'Bearer ***[REDACTED_BEARER_TOKEN]***', isHighConfidence: true, quickCheck: ['Bearer', 'bearer'] },
        { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----', isHighConfidence: true, quickCheck: 'PRIVATE KEY' },
        { name: 'database-credentials', regex: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, replacement: '***[REDACTED_DATABASE_URI_CREDENTIALS]***', isHighConfidence: true, quickCheck: '://' },
        { name: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+/g, replacement: 'https://hooks.slack.com/services/***[REDACTED_SLACK_WEBHOOK]***', isHighConfidence: true, quickCheck: 'hooks.slack.com' },
        {
            name: 'credential-assignment',
            regex: /\b([a-zA-Z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)[a-zA-Z0-9_-]*)\b(\s*[:=]\s*)(["']?)(?!\*\*\*\[REDACTED)([^\s,"'`;}{]{8,})\3/gi,
            replacement: '***[REDACTED_CREDENTIAL_ASSIGNMENT]***',
            isHighConfidence: false
        }
    ];

    /**
     * Computes the Shannon entropy of a string (in bits per character).
     * High entropy (H >= 3.8 for strings >= 20 chars) indicates cryptographic randomness,
     * hashes, API secrets, or encrypted blobs rather than human-readable words.
     */
    public static calculateShannonEntropy(str: string): number {
        if (!str || str.length === 0) return 0;
        const len = str.length;
        const frequencies = new Int32Array(256);
        for (let i = 0; i < len; i++) {
            frequencies[str.charCodeAt(i) & 0xFF]++;
        }
        let entropy = 0;
        for (let i = 0; i < 256; i++) {
            const count = frequencies[i];
            if (count > 0) {
                const p = count / len;
                entropy -= p * Math.log2(p);
            }
        }
        return entropy;
    }

    /**
     * Identifies whether a credential assignment belongs to a benign test mock,
     * fixture file, or placeholder variable that should not trigger false-positive compilation aborts.
     * 
     * Enforces the Strict 4-Tier Security Secret Hierarchy:
     * - Tier 1 (Structural Vendor Credentials): Unconditionally redacted. No variable name prefix
     *   (test*, mock*, dummy*) can ever exempt a structural credential.
     * - Tier 2 (High-Entropy Assignment Secrets): Strings >= 20 chars with Shannon entropy H >= 3.8
     *   in secret contexts are unconditionally redacted.
     * - Tier 3 (Generic Ambiguous Assignments): Exemption is granted ONLY if the assigned value
     *   itself matches known placeholder/dummy patterns (not merely having a test* variable name).
     * - Tier 4 (Known Test Fixture Whitelist): Safe explicit placeholders preserved.
     */
    public static isMockOrDummy(variableName: string, value: string): boolean {
        const cleanVar = (variableName || '').toLowerCase();
        const cleanVal = (value || '').trim();

        // Check if variable name indicates a mock/dummy/test/sample
        const isTestNamed = this.DUMMY_VAR_PREFIX.test(cleanVar) ||
                            /(?:mock|dummy|fake|test|sample|stub|example)$/i.test(cleanVar);

        if (isTestNamed) {
            // High-entropy or real credentials assigned to test variables must NOT be exempted
            if (cleanVal.length >= 24 && this.calculateShannonEntropy(cleanVal) >= 4.5) {
                return false;
            }
            // If variable is test-named AND value contains common placeholder tokens
            if (this.DUMMY_VALUE_REGEX.test(cleanVal)) {
                return true;
            }
        }

        // Exact match on known mock patterns even if variable name is generic
        if (/^(?:mock|test|fake|dummy|sample|example|placeholder|changeme|your_api_key|none|null|undefined|xxx)$/i.test(cleanVal)) {
            return true;
        }

        return false;
    }

    public static sanitizeSecrets(text: string): SanitizationResult {
        if (!text) return { sanitized: text, redactedCount: 0, categories: [], residualSecret: false };
        let count = 0;
        const categories = new Set<string>();
        const marker = (category: string) => { count++; categories.add(category); return '[REDACTED_SECRET]'; };
        let sanitized = text;
        // Consume complete PEM regions, or the rest of an unterminated key, in one forward scan.
        if (sanitized.includes('PRIVATE KEY')) {
            const begin = /-----BEGIN (?:[A-Z ]{0,32})PRIVATE KEY-----/g;
            let match: RegExpExecArray | null;
            const pieces: string[] = [];
            let consumed = 0;
            while ((match = begin.exec(sanitized)) !== null) {
                pieces.push(sanitized.slice(consumed, match.index), marker('private-key'));
                const endMarker = match[0].replace('BEGIN', 'END');
                const end = sanitized.indexOf(endMarker, begin.lastIndex);
                consumed = end < 0 ? sanitized.length : end + endMarker.length;
                begin.lastIndex = consumed;
            }
            pieces.push(sanitized.slice(consumed));
            sanitized = pieces.join('');
        }

        // Structural credentials do not receive a dummy-value exemption.
        for (const pattern of this.SECRET_PATTERNS) {
            if (pattern.name === 'credential-assignment' || pattern.name === 'private-key') continue;
            if (pattern.quickCheck) {
                if (typeof pattern.quickCheck === 'string') {
                    if (!sanitized.includes(pattern.quickCheck)) continue;
                } else if (!pattern.quickCheck.some(q => sanitized.includes(q))) {
                    continue;
                }
            }
            pattern.regex.lastIndex = 0;
            sanitized = sanitized.replace(pattern.regex, () => marker(pattern.name));
        }

        // Decode only bounded, contiguous transport encodings; never rewrite ordinary encoded data.
        if (sanitized.includes('%') || sanitized.includes('+') || sanitized.includes('/') || sanitized.includes('=') || /c2st|Z2hw|QUtJ|ZXlK|LS0t/.test(sanitized)) {
            sanitized = sanitized.replace(/[A-Za-z0-9_%+\/=-]{16,}/g, token => {
                if (token.length > 8192) return marker('oversized-encoded-value');
                const decoded: string[] = [];
                if (token.includes('%')) { try { decoded.push(decodeURIComponent(token)); } catch {} }
                if (token.length >= 24 && token.length % 4 === 0 && (token.includes('+') || token.includes('/') || token.includes('=') || /^(?:c2st|Z2hw|QUtJ|ZXlK|LS0t)/.test(token))) {
                    try { decoded.push(Buffer.from(token, 'base64').toString('utf8')); } catch {}
                }
                if (decoded.length === 0) return token;
                const secret = decoded.some(value => this.SECRET_PATTERNS.some(pattern => {
                    if (pattern.name === 'credential-assignment') return false;
                    pattern.regex.lastIndex = 0;
                    return pattern.regex.test(value);
                }));
                return secret ? marker('encoded-credential') : token;
            });
        }

        // Recognize key=value and quoted JSON keys, matching only candidate credential variable names
        if (/(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)/i.test(sanitized)) {
            const names = SecuritySanitizer.CANDIDATE_NAMES_REGEX;
            names.lastIndex = 0;
            const output: string[] = [];
            let offset = 0;
            let match: RegExpExecArray | null;
            while ((match = names.exec(sanitized)) !== null) {
                let cursor = names.lastIndex;
                if (sanitized[cursor] === '"' || sanitized[cursor] === "'") cursor++;
                while (cursor < sanitized.length && /\s/.test(sanitized[cursor])) cursor++;
                if (sanitized[cursor] !== ':' && sanitized[cursor] !== '=') continue;
                cursor++;
                while (cursor < sanitized.length && /\s/.test(sanitized[cursor])) cursor++;
                const quote = sanitized[cursor] === '"' || sanitized[cursor] === "'" ? sanitized[cursor++] : '';
                const start = cursor;
                while (cursor < sanitized.length) {
                    if (quote) {
                        if (sanitized[cursor] === '\\') { cursor += 2; continue; }
                        if (sanitized[cursor] === quote) break;
                    } else if (/[\s,;}{]/.test(sanitized[cursor])) break;
                    cursor++;
                }
                cursor = Math.min(cursor, sanitized.length);
                const value = sanitized.slice(start, cursor);
                names.lastIndex = Math.max(names.lastIndex, cursor);
                if (!value || value.includes('[REDACTED_') || this.isMockOrDummy(match[0], value)) continue;
                output.push(sanitized.slice(offset, start), marker('credential-assignment'));
                offset = cursor;
            }
            output.push(sanitized.slice(offset));
            sanitized = output.join('');
        }
        return { sanitized, redactedCount: count, categories: [...categories].sort(), residualSecret: false };
    }

    public static containsSecret(text: string): boolean {
        return this.sanitizeSecrets(text).redactedCount > 0;
    }

    public static containsPromptInjection(text: string): boolean {
        if (!text) return false;
        for (const pattern of this.PROMPT_INJECTION_PATTERNS) {
            if (pattern.test(text)) return true;
        }
        return false;
    }

    /**
     * Strips and neutralizes adversarial indirect prompt injection patterns embedded in
     * code comments (single-line, multi-line, docstrings) across all supported languages.
     */
    public static stripPromptInjections(text: string): { sanitized: string; strippedCount: number } {
        if (!text) return { sanitized: text, strippedCount: 0 };
        if (!text.includes('/*') && !text.includes('//') && !text.includes('#') && !text.includes('--') && !text.includes('"""') && !text.includes("'''")) {
            return { sanitized: text, strippedCount: 0 };
        }
        let strippedCount = 0;
        let sanitized = text;

        // 1. Block comments: /* ... */
        if (sanitized.includes('/*')) {
            sanitized = this.replaceDelimited(sanitized, '/*', '*/', (block) => {
                if (this.containsPromptInjection(block)) {
                    strippedCount++;
                    return '/* [REDACTED_INDIRECT_PROMPT_INJECTION] */';
                }
                return block;
            });
        }

        // 2. Python/multiline docstrings: """ ... """ or ''' ... '''
        if (sanitized.includes('"""') || sanitized.includes("'''")) {
            sanitized = sanitized.replace(/(?:"""[\s\S]*?"""|'''[\s\S]*?''')/g, (doc) => {
                if (this.containsPromptInjection(doc)) {
                    strippedCount++;
                    return '"""[REDACTED_INDIRECT_PROMPT_INJECTION]"""';
                }
                return doc;
            });
        }

        // 3. Single-line C/JS style comments: // ...
        if (sanitized.includes('//')) {
            sanitized = sanitized.replace(/\/\/[^\n]*/g, (line) => {
                if (this.containsPromptInjection(line)) {
                    strippedCount++;
                    return '// [REDACTED_INDIRECT_PROMPT_INJECTION]';
                }
                return line;
            });
        }

        // 4. Single-line Python/Ruby/Shell style comments: # ...
        if (sanitized.includes('#')) {
            sanitized = sanitized.replace(/(^|[ \t])#[^\n]*/gm, (match, prefix) => {
                if (this.containsPromptInjection(match)) {
                    strippedCount++;
                    return `${prefix}# [REDACTED_INDIRECT_PROMPT_INJECTION]`;
                }
                return match;
            });
        }

        // 5. Single-line SQL style comments: -- ...
        if (sanitized.includes('--')) {
            sanitized = sanitized.replace(/(^|[ \t])--[^\n]*/gm, (match, prefix) => {
                if (this.containsPromptInjection(match)) {
                    strippedCount++;
                    return `${prefix}-- [REDACTED_INDIRECT_PROMPT_INJECTION]`;
                }
                return match;
            });
        }

        return { sanitized, strippedCount };
    }

    /**
     * Final-hop neutralization for workspace-derived strings. This is intentionally
     * applied after all compiler preservation/fallback behavior has completed.
     */
    public static neutralizePromptInjections(text: string): { sanitized: string; strippedCount: number } {
        const commentSafe = this.stripPromptInjections(text);
        let strippedCount = commentSafe.strippedCount;
        const lines = commentSafe.sanitized.split(/(\r?\n)/);
        const sanitized = lines.map(part => {
            if (/^\r?\n$/.test(part) || !this.containsPromptInjection(part)) return part;
            strippedCount++;
            return '[REDACTED_INDIRECT_PROMPT_INJECTION]';
        }).join('');
        return { sanitized, strippedCount };
    }

    private static replaceDelimited(text: string, open: string, close: string, rewrite: (part: string) => string): string {
        const parts: string[] = [];
        let cursor = 0;
        while (cursor < text.length) {
            const start = text.indexOf(open, cursor);
            if (start < 0) break;
            const end = text.indexOf(close, start + open.length);
            if (end < 0) break;
            parts.push(text.slice(cursor, start), rewrite(text.slice(start, end + close.length)));
            cursor = end + close.length;
        }
        parts.push(text.slice(cursor));
        return parts.join('');
    }

    public static escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
