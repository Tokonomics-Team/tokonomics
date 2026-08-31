/**
 * Tokonomics Error & Diagnostic Intelligence Engine
 * Parses VS Code diagnostics and terminal/compiler stack traces to perform targeted root-cause retrieval.
 */

export type ErrorCategory = 
    | 'type_mismatch' 
    | 'undefined_symbol' 
    | 'syntax_error' 
    | 'runtime_exception' 
    | 'test_failure' 
    | 'build_failure';

export interface DiagnosticItem {
    filePath: string;
    line: number;
    message: string;
    severity: 'error' | 'warning';
    category: ErrorCategory;
    extractedSymbol?: string;
}

export interface RootCauseTarget {
    symbolName: string;
    filePath: string;
    line: number;
    category: ErrorCategory;
    retrievalPriority: 'highest' | 'high' | 'medium';
    requiredContext: ('declaration' | 'implementation' | 'callers' | 'diffs')[];
}

export class ErrorIntelligence {
    /**
     * Classifies an error diagnostic message and extracts key failing symbols
     */
    public classifyDiagnostic(message: string, filePath: string, line: number): DiagnosticItem {
        let category: ErrorCategory = 'runtime_exception';
        let extractedSymbol: string | undefined;

        // 1. TypeScript / Type checking errors
        if (/Property '([^']+)' does not exist on type/i.test(message)) {
            category = 'undefined_symbol';
            extractedSymbol = message.match(/Property '([^']+)' does not exist on type/i)?.[1];
        } else if (/Cannot find name '([^']+)'/i.test(message)) {
            category = 'undefined_symbol';
            extractedSymbol = message.match(/Cannot find name '([^']+)'/i)?.[1];
        } else if (/Type '([^']+)' is not assignable to type '([^']+)'/i.test(message)) {
            category = 'type_mismatch';
            extractedSymbol = message.match(/Type '([^']+)' is not assignable/i)?.[1];
        } else if (/SyntaxError|Unexpected token/i.test(message)) {
            category = 'syntax_error';
        } else if (/AssertionError|Expected: .* Received:/i.test(message)) {
            category = 'test_failure';
        } else if (/failed to compile|build failed|cannot find module/i.test(message)) {
            category = 'build_failure';
        }

        return {
            filePath,
            line,
            message,
            severity: 'error',
            category,
            extractedSymbol
        };
    }

    /**
     * Parses runtime or compiler stack traces from terminal text
     */
    public parseStackTrace(terminalOutput: string): DiagnosticItem[] {
        const results: DiagnosticItem[] = [];
        const lines = terminalOutput.split('\n');

        // Regex for Node/TS: at Object.login (D:\project\src\auth.ts:25:12) or at src/auth.ts:25:12
        const nodeStackRegex = /at\s+(?:([a-zA-Z0-9_$.#]+)\s+\()?(?:[a-zA-Z]:)?[\\/]?([^:()]+):([0-9]+):([0-9]+)\)?/;
        
        // Regex for Python: File "auth.py", line 25, in login
        const pythonStackRegex = /File "([^"]+)", line ([0-9]+), in ([a-zA-Z0-9_]+)/;

        for (const line of lines) {
            const nodeMatch = line.match(nodeStackRegex);
            if (nodeMatch) {
                const funcName = nodeMatch[1];
                const file = nodeMatch[2];
                const lineNum = parseInt(nodeMatch[3], 10);
                results.push({
                    filePath: file,
                    line: lineNum,
                    message: line.trim(),
                    severity: 'error',
                    category: 'runtime_exception',
                    extractedSymbol: funcName
                });
                continue;
            }

            const pyMatch = line.match(pythonStackRegex);
            if (pyMatch) {
                const file = pyMatch[1];
                const lineNum = parseInt(pyMatch[2], 10);
                const funcName = pyMatch[3];
                results.push({
                    filePath: file,
                    line: lineNum,
                    message: line.trim(),
                    severity: 'error',
                    category: 'runtime_exception',
                    extractedSymbol: funcName
                });
            }
        }

        return results;
    }

    /**
     * Converts raw diagnostics into prioritized RootCauseTarget specifications
     */
    public resolveRootCauseTargets(diagnostics: DiagnosticItem[]): RootCauseTarget[] {
        const targets: RootCauseTarget[] = [];

        for (const diag of diagnostics) {
            if (diag.extractedSymbol) {
                targets.push({
                    symbolName: diag.extractedSymbol,
                    filePath: diag.filePath,
                    line: diag.line,
                    category: diag.category,
                    retrievalPriority: diag.category === 'undefined_symbol' || diag.category === 'type_mismatch' ? 'highest' : 'high',
                    requiredContext: ['declaration', 'implementation', 'callers', 'diffs']
                });
            }
        }

        return targets;
    }
}
