/** Final-hop secret redaction. This class intentionally has no logging. */
export interface SanitizationResult {
    sanitized: string;
    redactedCount: number;
    categories: string[];
    residualSecret: boolean;
}

interface SecretPattern { name: string; regex: RegExp; replacement: string; }

export class SecuritySanitizer {
    private static readonly SECRET_PATTERNS: SecretPattern[] = [
        { name: 'anthropic-key', regex: /\bsk-ant-(?:api\d{2}-)?[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_ANTHROPIC_KEY]***' },
        { name: 'openai-key', regex: /\bsk-(?!ant-)(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_OPENAI_KEY]***' },
        { name: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,}\b/g, replacement: '***[REDACTED_GITHUB_TOKEN]***' },
        { name: 'gitlab-token', regex: /\bglpat-[a-zA-Z0-9_-]{20,}\b/g, replacement: '***[REDACTED_GITLAB_TOKEN]***' },
        { name: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g, replacement: '***[REDACTED_GOOGLE_API_KEY]***' },
        { name: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: '***[REDACTED_AWS_ACCESS_KEY]***' },
        { name: 'npm-token', regex: /\bnpm_[a-zA-Z0-9]{30,}\b/g, replacement: '***[REDACTED_NPM_TOKEN]***' },
        { name: 'stripe-key', regex: /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{16,}\b/g, replacement: '***[REDACTED_STRIPE_KEY]***' },
        { name: 'sendgrid-key', regex: /\bSG\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\b/g, replacement: '***[REDACTED_SENDGRID_KEY]***' },
        { name: 'jwt', regex: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, replacement: '***[REDACTED_JWT]***' },
        { name: 'bearer-token', regex: /\bBearer\s+[a-zA-Z0-9_.~+\/-]{20,}/gi, replacement: 'Bearer ***[REDACTED_BEARER_TOKEN]***' },
        { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----' },
        { name: 'database-credentials', regex: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, replacement: '***[REDACTED_DATABASE_URI_CREDENTIALS]***' },
        { name: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+/g, replacement: 'https://hooks.slack.com/services/***[REDACTED_SLACK_WEBHOOK]***' },
        {
            name: 'credential-assignment',
            regex: /\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)\b(\s*[:=]\s*)(["']?)(?!\*\*\*\[REDACTED)[^\s,"'`;}{]{8,}\3/gi,
            replacement: '***[REDACTED_CREDENTIAL_ASSIGNMENT]***'
        }
    ];

    public static sanitizeSecrets(text: string): SanitizationResult {
        if (!text) return { sanitized: text, redactedCount: 0, categories: [], residualSecret: false };
        let sanitized = text;
        let redactedCount = 0;
        const categories = new Set<string>();
        for (const pattern of this.SECRET_PATTERNS) {
            pattern.regex.lastIndex = 0;
            sanitized = sanitized.replace(pattern.regex, () => {
                redactedCount++;
                categories.add(pattern.name);
                return pattern.replacement;
            });
        }
        return { sanitized, redactedCount, categories: [...categories].sort(), residualSecret: this.containsSecret(sanitized) };
    }

    public static containsSecret(text: string): boolean {
        for (const pattern of this.SECRET_PATTERNS) {
            pattern.regex.lastIndex = 0;
            if (pattern.regex.test(text)) return true;
        }
        return false;
    }

    public static escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
