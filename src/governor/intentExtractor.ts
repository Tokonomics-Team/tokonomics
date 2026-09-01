/**
 * Tokonomics Deterministic Intent Extractor
 * Purely deterministic feature extraction and task classification using local lexical and editor signals.
 */

import { ContextGovernorInput, TaskType } from './governorTypes';

export interface ExtractedIntent {
    taskType: TaskType;
    confidence: number;
    matchedKeywords: string[];
    signalsUsed: string[];
}

export class IntentExtractor {
    private static readonly DEBUG_PATTERNS = [
        /\b(debug|fix|fixes|bug|bugs|error|errors|exception|exceptions|crash|crashes|fails?|failing|broken|nullpointer|undefined|traceback|panic|segfault)\b/i,
        /\b(uncaught|typeerror|referenceerror|syntaxerror|cannot read property|stack trace)\b/i
    ];

    private static readonly REFACTOR_PATTERNS = [
        /\b(refactor|refactoring|clean\s*up|restructure|restructuring|rename|extract|modularize|simplify|reorganize|decouple|optimize code)\b/i
    ];

    private static readonly TEST_PATTERNS = [
        /\b(tests?|unit\s*tests?|integration\s*tests?|specs?|coverage|assertions?|asserts?|mocks?|fixtures?|e2e|jest|pytest|junit|vitest)\b/i
    ];

    private static readonly EXPLAIN_PATTERNS = [
        /\b(explain|explains|explanation|how\s+does|walk\s*through|document|documentation|overview|what\s+is|understand|clarify|describe)\b/i
    ];

    private static readonly REVIEW_PATTERNS = [
        /\b(review|reviews|pr|pull\s*requests?|diff|audit|security\s*check|code\s*smell|lint)\b/i
    ];

    private static readonly ARCHITECTURE_PATTERNS = [
        /\b(architecture|architectural|design|pattern|system\s*design|schema|data\s*model|pipeline|topology|scaffold)\b/i
    ];

    private static readonly SEARCH_PATTERNS = [
        /\b(find|search|where\s+is|locate|list\s+all|usages?\s+of|references?\s+to)\b/i
    ];

    private static readonly FEATURE_PATTERNS = [
        /\b(add|create|implement|build|support|new\s+feature|endpoint|generate|integrate)\b/i
    ];

    /**
     * Deterministically infers task intent from lexical prompt, editor state, and environment signals
     */
    public static extractIntent(input: ContextGovernorInput): ExtractedIntent {
        const prompt = input.userPrompt || '';
        const matchedKeywords: string[] = [];
        const signalsUsed: string[] = [];

        // 1. Strong environmental signals (Terminal error / Diagnostics / Failing tests)
        if (input.terminalErrorSnippet || (input.diagnosticsCount && input.diagnosticsCount > 0) || input.hasFailingTests) {
            signalsUsed.push('active_diagnostic_or_terminal_error');
            return {
                taskType: 'debug',
                confidence: 0.95,
                matchedKeywords: ['terminal_diagnostic_error'],
                signalsUsed
            };
        }

        // 2. Strong editor file type signal (e.g., active file is a test file)
        if (input.activeFilePath && (input.activeFilePath.includes('.test.') || input.activeFilePath.includes('.spec.') || input.activeFilePath.includes('_test.'))) {
            signalsUsed.push('test_file_context');
            if (this.matchesAny(prompt, this.TEST_PATTERNS)) {
                return {
                    taskType: 'test',
                    confidence: 0.95,
                    matchedKeywords: ['test_file_and_prompt'],
                    signalsUsed
                };
            }
        }

        // 3. Lexical pattern matching against user prompt
        if (this.matchesAny(prompt, this.DEBUG_PATTERNS, matchedKeywords)) {
            signalsUsed.push('debug_lexical_patterns');
            return { taskType: 'debug', confidence: 0.92, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.TEST_PATTERNS, matchedKeywords)) {
            signalsUsed.push('test_lexical_patterns');
            return { taskType: 'test', confidence: 0.90, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.REFACTOR_PATTERNS, matchedKeywords)) {
            signalsUsed.push('refactor_lexical_patterns');
            return { taskType: 'refactor', confidence: 0.88, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.REVIEW_PATTERNS, matchedKeywords)) {
            signalsUsed.push('review_lexical_patterns');
            return { taskType: 'review', confidence: 0.85, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.EXPLAIN_PATTERNS, matchedKeywords)) {
            signalsUsed.push('explain_lexical_patterns');
            return { taskType: 'explain', confidence: 0.89, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.ARCHITECTURE_PATTERNS, matchedKeywords)) {
            signalsUsed.push('architecture_lexical_patterns');
            return { taskType: 'architecture', confidence: 0.85, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.SEARCH_PATTERNS, matchedKeywords)) {
            signalsUsed.push('search_lexical_patterns');
            return { taskType: 'search', confidence: 0.86, matchedKeywords, signalsUsed };
        }

        if (this.matchesAny(prompt, this.FEATURE_PATTERNS, matchedKeywords)) {
            signalsUsed.push('feature_lexical_patterns');
            return { taskType: 'feature', confidence: 0.82, matchedKeywords, signalsUsed };
        }

        // 4. Default fallback: Code completion or feature
        signalsUsed.push('default_completion_heuristic');
        return {
            taskType: 'completion',
            confidence: 0.70,
            matchedKeywords: [],
            signalsUsed
        };
    }

    private static matchesAny(text: string, patterns: RegExp[], matchedKeywordsCollector?: string[]): boolean {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                if (matchedKeywordsCollector && match[0]) {
                    matchedKeywordsCollector.push(match[0].toLowerCase());
                }
                return true;
            }
        }
        return false;
    }
}
