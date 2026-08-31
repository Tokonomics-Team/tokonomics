/**
 * Tokonomics Terminal Output Optimizer
 * Converts noisy build and test outputs (npm, pytest, cargo, go test, gcc, docker)
 * into compact, structured failure clusters.
 */

export interface TerminalFailureCluster {
    tool: 'npm' | 'pytest' | 'cargo' | 'go_test' | 'gcc' | 'docker' | 'generic';
    totalErrors: number;
    failedTestNames: string[];
    extractedStackFrames: string[];
    compactDiagnosticContext: string;
}

export class TerminalOutputOptimizer {
    /**
     * Parses raw terminal output and extracts structured failure clusters
     */
    public parseTerminalOutput(rawOutput: string): TerminalFailureCluster {
        const lines = rawOutput.split('\n');
        let tool: 'npm' | 'pytest' | 'cargo' | 'go_test' | 'gcc' | 'docker' | 'generic' = 'generic';

        const failedTestNames: string[] = [];
        const extractedStackFrames: string[] = [];
        let errorCount = 0;

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
        }

        for (const line of lines) {
            const trimmed = line.trim();

            // NPM / Jest failure lines (individual test cases)
            if (trimmed.startsWith('✕ ') || (trimmed.startsWith('FAIL ') && !trimmed.endsWith('.ts') && !trimmed.endsWith('.js'))) {
                failedTestNames.push(trimmed.replace(/^✕ |^FAIL /, ''));
                errorCount++;
            } else if (trimmed.startsWith('FAIL ')) {
                // File-level test failure
                errorCount++;
            }

            // Pytest failure lines
            if (trimmed.startsWith('FAILED ') && trimmed.includes('::')) {
                failedTestNames.push(trimmed.replace(/^FAILED /, ''));
                errorCount++;
            }

            // Go test failure lines
            if (trimmed.startsWith('--- FAIL:')) {
                failedTestNames.push(trimmed.replace('--- FAIL: ', ''));
                errorCount++;
            }

            // Stack trace frames
            if (/^\s*at\s+[a-zA-Z0-9_$.#]+/.test(line) || /^\s*File\s+"[^"]+",\s+line/.test(line)) {
                if (extractedStackFrames.length < 5) {
                    extractedStackFrames.push(trimmed);
                }
            }

            // Generic compiler error
            if (trimmed.includes(': error:') || trimmed.includes('error[E')) {
                errorCount++;
            }
        }

        // Build compact diagnostic context
        let md = `**Terminal Failure Summary (${tool.toUpperCase()}):**\n`;
        md += `- **Detected Failures:** ${Math.max(errorCount, failedTestNames.length)}\n`;

        if (failedTestNames.length > 0) {
            md += `- **Failing Targets:**\n`;
            for (const t of failedTestNames.slice(0, 5)) {
                md += `  • \`${t}\`\n`;
            }
        }

        if (extractedStackFrames.length > 0) {
            md += `- **Primary Stack Trace:**\n`;
            for (const f of extractedStackFrames) {
                md += `  \`${f}\`\n`;
            }
        }

        return {
            tool,
            totalErrors: Math.max(errorCount, failedTestNames.length),
            failedTestNames,
            extractedStackFrames,
            compactDiagnosticContext: md
        };
    }
}
