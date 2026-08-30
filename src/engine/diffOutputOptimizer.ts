/**
 * Diff-Based Output Optimizer v3.0
 * 
 * Optimizes OUTPUT tokens by detecting edit-intent prompts and injecting
 * system prompt instructions that direct the model to emit unified diffs
 * instead of regenerating entire files.
 * 
 * Estimated savings: 40-70% reduction in output tokens for edit operations.
 */

import { TokenCounter } from './tokenizer';

export type QueryIntent = 'edit' | 'question' | 'generate' | 'explain';

export interface DiffOutputOptimization {
    intent: QueryIntent;
    shouldRequestDiff: boolean;
    systemSuffix: string;
    systemSuffixTokens: number;
    estimatedOutputSavingsPercent: number;
}

/** Keywords strongly signaling an edit/refactor intent */
const EDIT_KEYWORDS = [
    'fix', 'refactor', 'change', 'update', 'modify', 'rename',
    'replace', 'move', 'delete', 'remove', 'add', 'insert',
    'rewrite', 'convert', 'migrate', 'upgrade', 'patch',
    'optimize', 'improve', 'correct', 'swap', 'extract',
    'inline', 'merge', 'split', 'wrap', 'unwrap'
];

/** Keywords signaling a question/explanation (NOT an edit) */
const QUESTION_KEYWORDS = [
    'explain', 'why', 'how does', 'what is', 'what are',
    'describe', 'tell me', 'can you explain', 'help me understand',
    'walk me through', 'summarize', 'analyze', 'review', 'compare'
];

/** Keywords signaling greenfield code generation */
const GENERATE_KEYWORDS = [
    'create', 'write', 'implement', 'build', 'generate',
    'scaffold', 'make a', 'set up', 'initialize', 'new file'
];

/** The system prompt suffix injected for edit-intent requests */
const DIFF_INSTRUCTION_SUFFIX = `

IMPORTANT OUTPUT FORMAT: When modifying existing code, output ONLY a unified diff showing the specific changes. Use this format:
\`\`\`diff
--- a/{filename}
+++ b/{filename}
@@ -{start_line},{count} +{start_line},{count} @@
 context line (unchanged)
-removed line
+added line
 context line (unchanged)
\`\`\`
Include 2-3 lines of surrounding context for each change hunk. Do NOT output the entire file — only the changed sections as diffs. If multiple files are changed, output separate diff blocks for each file.`;

export class DiffOutputOptimizer {

    /**
     * Analyzes the user's query to classify intent and determine if diff output
     * instructions should be injected into the system prompt.
     */
    public static analyzeIntent(
        userQuery: string,
        hasActiveFile: boolean = false
    ): DiffOutputOptimization {
        const lowerQuery = userQuery.toLowerCase().trim();

        // 1. Check for question/explanation intent (highest priority — never diff)
        const isQuestion = QUESTION_KEYWORDS.some(kw => lowerQuery.includes(kw))
            || lowerQuery.endsWith('?');
        if (isQuestion && !this.hasStrongEditSignal(lowerQuery)) {
            return {
                intent: 'question',
                shouldRequestDiff: false,
                systemSuffix: '',
                systemSuffixTokens: 0,
                estimatedOutputSavingsPercent: 0
            };
        }

        // 2. Check for greenfield generation (no existing file to diff against)
        const isGenerate = GENERATE_KEYWORDS.some(kw => lowerQuery.includes(kw));
        if (isGenerate && !hasActiveFile) {
            return {
                intent: 'generate',
                shouldRequestDiff: false,
                systemSuffix: '',
                systemSuffixTokens: 0,
                estimatedOutputSavingsPercent: 0
            };
        }

        // 3. Check for edit intent
        const isEdit = EDIT_KEYWORDS.some(kw => lowerQuery.includes(kw));
        if (isEdit || (hasActiveFile && !isQuestion)) {
            const suffixTokens = TokenCounter.countTokens(DIFF_INSTRUCTION_SUFFIX);
            return {
                intent: 'edit',
                shouldRequestDiff: true,
                systemSuffix: DIFF_INSTRUCTION_SUFFIX,
                systemSuffixTokens: suffixTokens,
                estimatedOutputSavingsPercent: 55 // Conservative median estimate
            };
        }

        // 4. Fallback: explain
        return {
            intent: 'explain',
            shouldRequestDiff: false,
            systemSuffix: '',
            systemSuffixTokens: 0,
            estimatedOutputSavingsPercent: 0
        };
    }

    /**
     * Parses unified diff output from model response and returns structured patches.
     */
    public static parseDiffBlocks(modelOutput: string): DiffPatch[] {
        const patches: DiffPatch[] = [];
        const diffBlockRegex = /```diff\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;

        while ((match = diffBlockRegex.exec(modelOutput)) !== null) {
            const diffContent = match[1].trim();
            const patch = this.parseSingleDiff(diffContent);
            if (patch) {
                patches.push(patch);
            }
        }

        return patches;
    }

    /**
     * Parse a single unified diff block into structured hunks.
     */
    private static parseSingleDiff(diffText: string): DiffPatch | null {
        const lines = diffText.split('\n');
        let filename = '';
        const hunks: DiffHunk[] = [];

        let currentHunk: DiffHunk | null = null;

        for (const line of lines) {
            // Parse file headers
            if (line.startsWith('--- a/') || line.startsWith('--- ')) {
                continue; // Skip old file header
            }
            if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
                filename = line.replace(/^\+\+\+ [ab]\//, '').replace(/^\+\+\+ /, '').trim();
                continue;
            }

            // Parse hunk headers
            const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
            if (hunkMatch) {
                if (currentHunk) hunks.push(currentHunk);
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1]),
                    oldCount: parseInt(hunkMatch[2] || '1'),
                    newStart: parseInt(hunkMatch[3]),
                    newCount: parseInt(hunkMatch[4] || '1'),
                    additions: [],
                    deletions: [],
                    contextLines: []
                };
                continue;
            }

            // Parse diff lines
            if (currentHunk) {
                if (line.startsWith('+')) {
                    currentHunk.additions.push(line.substring(1));
                } else if (line.startsWith('-')) {
                    currentHunk.deletions.push(line.substring(1));
                } else if (line.startsWith(' ')) {
                    currentHunk.contextLines.push(line.substring(1));
                }
            }
        }

        if (currentHunk) hunks.push(currentHunk);

        if (!filename && hunks.length === 0) return null;

        return { filename, hunks };
    }

    /**
     * Check if query has strong edit signals even with question words present.
     * e.g., "can you fix the bug in auth.ts?" has both question and edit signals.
     */
    private static hasStrongEditSignal(lowerQuery: string): boolean {
        const strongSignals = ['fix', 'refactor', 'change', 'update', 'replace', 'remove', 'delete', 'rename'];
        return strongSignals.some(s => lowerQuery.includes(s));
    }
}

export interface DiffPatch {
    filename: string;
    hunks: DiffHunk[];
}

export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    additions: string[];
    deletions: string[];
    contextLines: string[];
}
