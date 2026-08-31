/**
 * Enterprise Security Sanitizer & Secret Redactor
 * Masks sensitive API keys, bearer tokens, private keys, and environment secrets
 * before prompt caching and context transmission.
 */

export class SecuritySanitizer {
    private static readonly SECRET_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
        {
            name: 'Anthropic API Key',
            regex: /\bsk-ant-(?:api\d{2}-)?[a-zA-Z0-9_-]{20,}\b/g,
            replacement: '***[REDACTED_ANTHROPIC_KEY]***'
        },
        {
            name: 'OpenAI API Key',
            regex: /\bsk-(?!ant-)(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}\b/g,
            replacement: '***[REDACTED_OPENAI_KEY]***'
        },
        {
            name: 'GitHub Token',
            regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,}\b/g,
            replacement: '***[REDACTED_GH_TOKEN]***'
        },
        {
            name: 'AWS Access Key',
            regex: /\bAKIA[0-9A-Z]{16}\b/g,
            replacement: '***[REDACTED_AWS_KEY]***'
        },
        {
            name: 'Generic Bearer Token',
            regex: /Bearer\s+[a-zA-Z0-9_\-\.]{25,}/gi,
            replacement: 'Bearer ***[REDACTED_BEARER_TOKEN]***'
        },
        {
            name: 'Private Key Block',
            regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
            replacement: '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----'
        },
        {
            name: 'Database URI with Credentials',
            regex: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi,
            replacement: '***[REDACTED_DATABASE_URI_CREDENTIALS]***'
        },
        {
            name: 'Slack Webhook URL',
            regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
            replacement: 'https://hooks.slack.com/services/***[REDACTED_SLACK_WEBHOOK]***'
        }
    ];

    /**
     * Sanitizes code or prompt text to redact accidental secret leaks.
     */
    public static sanitizeSecrets(text: string): { sanitized: string; redactedCount: number } {
        if (!text || text.length === 0) {
            return { sanitized: text, redactedCount: 0 };
        }

        let result = text;
        let redactedCount = 0;

        for (const pattern of this.SECRET_PATTERNS) {
            result = result.replace(pattern.regex, (match) => {
                redactedCount++;
                return pattern.replacement;
            });
        }

        return { sanitized: result, redactedCount };
    }

    /**
     * Safely escapes string literals for use in dynamic RegExp to prevent ReDoS.
     */
    public static escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
