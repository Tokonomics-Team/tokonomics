import * as crypto from 'crypto';
import { SecuritySanitizer } from '../security/sanitizer';

export type TerminalCaptureSource = 'user_selection' | 'extension_task' | 'consented_shell' | 'unauthorized';

export interface CausalStackFrame {
    readonly rawFrame: string;
    readonly functionName?: string;
    readonly filePath?: string;
    readonly line?: number;
    readonly column?: number;
    readonly isUserCode: boolean;
}

export interface TerminalParseOptions {
    readonly source?: TerminalCaptureSource;
    readonly userConsented?: boolean;
    readonly maxLines?: number;
    readonly maxInputChars?: number;
}

export interface TerminalFailureCluster {
    tool: 'npm' | 'pytest' | 'cargo' | 'go_test' | 'gcc' | 'docker' | 'typescript_tsc' | 'python' | 'generic';
    totalErrors: number;
    failedTestNames: string[];
    extractedStackFrames: string[];
    compactDiagnosticContext: string;
    errorCodes?: string[];
    firstCausalFrame?: CausalStackFrame;
    lastCausalFrame?: CausalStackFrame;
    causalFrames?: CausalStackFrame[];
    sourcePointer?: string;
    isAuthorized?: boolean;
    rejectionReason?: string;
}

export class TerminalOutputOptimizer {
    /**
     * Normalizes terminal text by stripping ANSI sequences, control characters,
     * resolving carriage-return progress bar overwrites, and enforcing line bounds.
     */
    public normalizeTerminalText(raw: string, maxInputChars: number = 50000): string {
        if (!raw) return '';
        const bounded = raw.length > maxInputChars ? raw.slice(0, maxInputChars) : raw;

        // Strip ANSI escape codes
        const strippedAnsi = bounded.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');

        const rawLines = strippedAnsi.split(/\r?\n/);
        const processedLines: string[] = [];

        for (const line of rawLines) {
            let effectiveLine = line;
            if (line.includes('\r')) {
                const chunks = line.split('\r').filter(c => c.trim().length > 0);
                effectiveLine = chunks.length > 0 ? chunks[chunks.length - 1] : '';
            }

            // Drop pure spinner or progress lines
            if (/^\s*(?:\[[=\->\s]+\]|\d{1,3}%|[\/\\|\-]\s*)+\s*$/.test(effectiveLine)) {
                continue;
            }

            // Strip non-printable ASCII control characters except \t, \n, \r
            const cleanLine = effectiveLine.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

            // Enforce line-length ceiling (max 2,000 chars) to prevent ReDoS on catastrophic backtrack
            const cappedLine = cleanLine.length > 2000 ? cleanLine.slice(0, 2000) : cleanLine;
            if (cappedLine.trim().length > 0) {
                processedLines.push(cappedLine);
            }
        }

        return processedLines.join('\n');
    }

    /**
     * Sanitizes secrets, home directory paths, IP addresses, and remote URLs
     */
    public sanitizeContext(text: string): string {
        if (!text) return '';
        // 1. Secret sanitizer
        let sanitized = SecuritySanitizer.sanitizeSecrets(text).sanitized;

        // 2. Home path scrubbing
        sanitized = sanitized.replace(/(?:\/home\/[a-zA-Z0-9._-]+|\/Users\/[a-zA-Z0-9._-]+|[A-Za-z]:\\Users\\[a-zA-Z0-9._-]+)/g, '<HOME_DIR>');

        // 3. Remote URL credentials or URLs
        sanitized = sanitized.replace(/https?:\/\/[^\s"'>]+/g, '<REDACTED_URL>');

        // 4. IP address scrubbing
        sanitized = sanitized.replace(/\b(?:10\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3})\.\d{1,3}\b/g, '<PRIVATE_IP>');

        return sanitized;
    }

    /**
     * Extracts exact compiler, runtime, or test runner error codes
     */
    public extractErrorCodes(text: string): string[] {
        const codes = new Set<string>();

        // TypeScript TSxxxx / TSxxxxx
        const tsMatches = text.match(/\bTS\d{4,5}\b/g);
        if (tsMatches) for (const c of tsMatches) codes.add(c);

        // Rust error[Exxxx] or Exxxx
        const rustMatches = text.match(/\berror\[(E\d{4})\]/g);
        if (rustMatches) {
            for (const m of rustMatches) {
                const sub = m.match(/E\d{4}/);
                if (sub) codes.add(sub[0]);
            }
        }

        // Node ELIFECYCLE or ERR_*
        const nodeMatches = text.match(/\b(?:ERR_[A-Z_]+|ELIFECYCLE)\b/g);
        if (nodeMatches) for (const c of nodeMatches) codes.add(c);

        // Standard exception names
        const excMatches = text.match(/\b(?:AssertionError|NullPointerException|IndexOutOfBoundsException|FileNotFoundException|TypeError|ValueError|KeyError|ZeroDivisionError)\b/g);
        if (excMatches) for (const c of excMatches) codes.add(c);

        return [...codes].sort();
    }

    /**
     * Parses raw terminal output and extracts structured failure clusters
     */
    public parseTerminalOutput(rawOutput: string, options?: TerminalParseOptions): TerminalFailureCluster {
        const source = options?.source ?? 'user_selection';
        const userConsented = options?.userConsented !== false;

        // Fail-closed authorization gate
        if (source === 'unauthorized' || !userConsented) {
            return {
                tool: 'generic',
                totalErrors: 0,
                failedTestNames: [],
                extractedStackFrames: [],
                compactDiagnosticContext: '',
                errorCodes: [],
                isAuthorized: false,
                rejectionReason: 'unauthorized_or_no_consent'
            };
        }

        const normalizedOutput = this.normalizeTerminalText(rawOutput, options?.maxInputChars);
        const lines = normalizedOutput.split('\n');
        let tool: 'npm' | 'pytest' | 'cargo' | 'go_test' | 'gcc' | 'docker' | 'typescript_tsc' | 'python' | 'generic' = 'generic';

        const failedTestNames: string[] = [];
        const failureDetails: string[] = [];
        const extractedStackFrames: string[] = [];
        const causalFrames: CausalStackFrame[] = [];
        let errorCount = 0;
        let inFailureContext = false;

        // Detect Tool Ecosystem
        if (rawOutput.includes('FAIL ') || rawOutput.includes('npm ERR!') || rawOutput.includes('jest')) {
            tool = 'npm';
        } else if (rawOutput.includes('FAILED ') || rawOutput.includes('=== FAILURES ===') || rawOutput.includes('pytest')) {
            tool = 'pytest';
        } else if (rawOutput.includes('error[E') || rawOutput.includes('cargo test')) {
            tool = 'cargo';
        } else if (rawOutput.includes('--- FAIL:') || rawOutput.includes('go test')) {
            tool = 'go_test';
        } else if (rawOutput.includes(': error:') || rawOutput.includes('fatal error:')) {
            tool = 'gcc';
        } else if (/\bTS\d{4,5}:/.test(rawOutput)) {
            tool = 'typescript_tsc';
        } else if (rawOutput.includes('Traceback (most recent call last):')) {
            tool = 'python';
        }

        const nodeStackRegex = /at\s+(?:([a-zA-Z0-9_$.#]+)\s+\()?\s*([a-zA-Z]:[\\/][^:()]+|[^:()]+):([0-9]+):([0-9]+)\)?/;
        const pyStackRegex = /File "([^"]+)", line ([0-9]+), in ([a-zA-Z0-9_]+)/;

        for (const line of lines) {
            const trimmed = line.trim();

            // NPM / Jest failure lines (individual test cases)
            if (trimmed.startsWith('✕ ') || (trimmed.startsWith('FAIL ') && !trimmed.endsWith('.ts') && !trimmed.endsWith('.js'))) {
                failedTestNames.push(trimmed.replace(/^✕ |^FAIL /, ''));
                errorCount++;
                inFailureContext = true;
                continue;
            } else if (trimmed.startsWith('FAIL ')) {
                // File-level test failure
                errorCount++;
                inFailureContext = false;
                continue;
            }

            // Pytest failure lines
            if (trimmed.startsWith('FAILED ') && trimmed.includes('::')) {
                failedTestNames.push(trimmed.replace(/^FAILED /, ''));
                errorCount++;
                inFailureContext = true;
                continue;
            }

            // Go test failure lines
            if (trimmed.startsWith('--- FAIL:')) {
                failedTestNames.push(trimmed.replace('--- FAIL: ', ''));
                errorCount++;
                inFailureContext = true;
                continue;
            }

            // Stack trace frames
            const nodeMatch = line.match(nodeStackRegex);
            if (nodeMatch) {
                inFailureContext = false;
                const funcName = nodeMatch[1];
                const file = nodeMatch[2].replace(/\\/g, '/');
                const lineNum = parseInt(nodeMatch[3], 10);
                const colNum = parseInt(nodeMatch[4], 10);
                const isUser = !file.includes('node_modules') && !file.includes('site-packages') && !file.includes('internal/');
                
                if (extractedStackFrames.length < 5) {
                    extractedStackFrames.push(trimmed);
                }
                causalFrames.push({
                    rawFrame: trimmed,
                    functionName: funcName,
                    filePath: file,
                    line: lineNum,
                    column: colNum,
                    isUserCode: isUser
                });
                continue;
            } else {
                const pyMatch = line.match(pyStackRegex);
                if (pyMatch) {
                    inFailureContext = false;
                    const file = pyMatch[1].replace(/\\/g, '/');
                    const lineNum = parseInt(pyMatch[2], 10);
                    const funcName = pyMatch[3];
                    const isUser = !file.includes('site-packages') && !file.includes('lib/python');

                    if (extractedStackFrames.length < 5) {
                        extractedStackFrames.push(trimmed);
                    }
                    causalFrames.push({
                        rawFrame: trimmed,
                        functionName: funcName,
                        filePath: file,
                        line: lineNum,
                        isUserCode: isUser
                    });
                    continue;
                }
            }

            // Capture failure context lines indented under failed test
            if (inFailureContext && trimmed.length > 0) {
                if (failureDetails.length < 4) {
                    failureDetails.push(trimmed);
                }
                continue;
            }

            // Generic compiler error
            if (trimmed.includes(': error:') || trimmed.includes('error[E') || /\bTS\d{4,5}:/.test(trimmed)) {
                errorCount++;
            }
        }

        const errorCodes = this.extractErrorCodes(normalizedOutput);
        const userCausalFrames = causalFrames.filter(f => f.isUserCode);
        const firstCausalFrame = userCausalFrames.length > 0 ? userCausalFrames[0] : causalFrames[0];
        const lastCausalFrame = userCausalFrames.length > 0 ? userCausalFrames[userCausalFrames.length - 1] : causalFrames[causalFrames.length - 1];

        // Build compact diagnostic context
        let md = `**Terminal Failure Summary (${tool.toUpperCase()}):**\n`;
        md += `- **Detected Failures:** ${Math.max(errorCount, failedTestNames.length)}\n`;

        if (errorCodes.length > 0) {
            md += `- **Error Codes:** ${errorCodes.map(c => `\`${c}\``).join(', ')}\n`;
        }

        if (failedTestNames.length > 0) {
            md += `- **Failing Targets:**\n`;
            for (const t of failedTestNames.slice(0, 5)) {
                md += `  • \`${t}\`\n`;
            }
        }

        if (failureDetails.length > 0) {
            md += `- **Failure Details:**\n`;
            for (const d of failureDetails) {
                md += `  • \`${d}\`\n`;
            }
        }

        if (firstCausalFrame) {
            md += `- **Root Causal Frame:** \`${firstCausalFrame.functionName || 'unknown'}\` at \`${firstCausalFrame.filePath || 'unknown'}:${firstCausalFrame.line || 0}\`\n`;
        }

        if (extractedStackFrames.length > 0) {
            md += `- **Primary Stack Trace:**\n`;
            for (const f of extractedStackFrames) {
                md += `  \`${f}\`\n`;
            }
        }

        // Apply secret & PII sanitization
        const sanitizedContext = this.sanitizeContext(md);
        const sourcePointer = 'term:sha256:' + crypto.createHash('sha256').update(rawOutput).digest('hex').slice(0, 16);

        return {
            tool,
            totalErrors: Math.max(errorCount, failedTestNames.length),
            failedTestNames,
            extractedStackFrames,
            compactDiagnosticContext: sanitizedContext,
            errorCodes,
            firstCausalFrame,
            lastCausalFrame,
            causalFrames,
            sourcePointer,
            isAuthorized: true
        };
    }
}
