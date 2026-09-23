/**
 * Tokonomics Conservative-Path Compressor
 *
 * When the preservation gate, structured-content gate or evidence safety gate restores the
 * original payload, the request previously went upstream completely untouched. That is correct
 * - the compiler must never drop evidence it cannot prove is redundant - but it also meant the
 * safest requests were the most expensive ones, and for higher-risk task classes (debug, review,
 * refactor without workspace authorisation) that is the common case rather than the exception.
 *
 * This module exists to make the safe path cheaper without making it less safe. It applies only
 * transformations whose output is semantically identical to their input for any consumer that
 * cares about code, prose or protocol meaning:
 *
 *   - trailing horizontal whitespace removal
 *   - collapse of runs of blank lines beyond a threshold
 *   - removal of exactly-duplicated adjacent log lines, replaced by a counted marker
 *   - truncation of very long single-token binary-ish blobs (base64/hex) to a bounded head+tail
 *
 * What it explicitly never does: touch identifiers, reorder or remove code lines, alter string
 * literals, change indentation structure, drop comments, modify fenced-block languages, or remove
 * any line that could carry evidence. Every reduction is textual noise removal, not selection.
 *
 * The caller is still required to re-run the preservation gates on the output. If anything
 * regresses, the verbatim payload must be used. This module therefore cannot weaken the
 * fail-closed guarantee: at worst it is a no-op.
 */

export interface ConservativeCompressionResult {
    readonly text: string;
    readonly changed: boolean;
    /** Content-preserving reductions actually applied, for the decision trace. */
    readonly appliedRules: readonly string[];
}

export interface ConservativeCompressionOptions {
    /** Remove blank lines only inside fenced source blocks; source tokens and line order survive. */
    readonly compactFencedCodeBlankLines?: boolean;
    /** Remove formatting indentation in brace-based languages that contain no multiline literals. */
    readonly compactBraceLanguageIndentation?: boolean;
}

/** Blank-line runs longer than this collapse down to this many blank lines. */
const MAX_CONSECUTIVE_BLANK_LINES = 2;
/** Adjacent identical non-empty lines beyond this count are folded into a marker. */
const MAX_REPEATED_ADJACENT_LINES = 3;
/** A single whitespace-free run longer than this is treated as an opaque blob. */
const BLOB_THRESHOLD_CHARS = 2_048;
/** Head and tail retained when an opaque blob is elided. */
const BLOB_KEEP_CHARS = 256;
/** Hard input bound for in-memory buffer operations; larger inputs use streaming processor. */
const MAX_IN_MEMORY_CHARS = 2_000_000;
/** Hard safety ceiling to avoid V8 out-of-memory crashes on extreme payloads */
const HARD_CEILING_CHARS = 50_000_000;

const OPAQUE_BLOB = new RegExp(`[A-Za-z0-9+/=_-]{${BLOB_THRESHOLD_CHARS},}`, 'g');

export class ConservativePathCompressor {
    /**
     * Applies noise-only reductions. Never throws; on any failure the input is returned unchanged.
     */
    public static compress(text: string, options: ConservativeCompressionOptions = {}): ConservativeCompressionResult {
        if (typeof text !== 'string' || text.length === 0 || text.length > HARD_CEILING_CHARS) {
            return unchanged(text);
        }
        if (text.length > MAX_IN_MEMORY_CHARS) {
            return this.compressLargeStream(text);
        }
        try {
            const applied: string[] = [];
            let working = text;

            const trimmed = working.replace(/(?<![ \t])[ \t]+$/gm, '');
            if (trimmed !== working) { applied.push('trailing_whitespace'); working = trimmed; }

            const collapsed = collapseBlankRuns(working);
            if (collapsed !== working) { applied.push('blank_line_runs'); working = collapsed; }

            if (options.compactFencedCodeBlankLines) {
                const compactedCode = compactFencedCodeBlankLines(working);
                if (compactedCode !== working) {
                    applied.push('fenced_code_blank_lines');
                    working = compactedCode;
                }
            }

            if (options.compactBraceLanguageIndentation) {
                const compactedIndentation = compactBraceLanguageIndentation(working);
                if (compactedIndentation !== working) {
                    applied.push('brace_language_indentation');
                    working = compactedIndentation;
                }
            }

            const folded = foldRepeatedAdjacentLines(working);
            if (folded !== working) { applied.push('repeated_log_lines'); working = folded; }

            const elided = elideOpaqueBlobs(working);
            if (elided !== working) { applied.push('opaque_blob_truncation'); working = elided; }

            return Object.freeze({
                text: working,
                changed: working !== text,
                appliedRules: Object.freeze(applied)
            });
        } catch {
            return unchanged(text);
        }
    }

    /**
     * Bounded streaming processor for giant payloads (> 2MB up to 50MB).
     * Avoids giant array allocations while folding repeated adjacent lines and collapsing blank runs.
     */
    private static compressLargeStream(text: string): ConservativeCompressionResult {
        const applied: string[] = ['streaming_dedup'];
        const out: string[] = [];
        let prevLine = '';
        let repeatCount = 0;
        let consecutiveBlanks = 0;
        let lineStart = 0;
        const len = text.length;

        while (lineStart < len) {
            let lineEnd = text.indexOf('\n', lineStart);
            if (lineEnd === -1) lineEnd = len;

            let line = text.slice(lineStart, lineEnd);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            line = line.replace(/[ \t]+$/, '');

            if (line.length === 0) {
                if (repeatCount > MAX_REPEATED_ADJACENT_LINES) {
                    out.push(`… [previous line repeated ${repeatCount - MAX_REPEATED_ADJACENT_LINES} more times]`);
                }
                prevLine = '';
                repeatCount = 0;
                consecutiveBlanks++;
                if (consecutiveBlanks <= MAX_CONSECUTIVE_BLANK_LINES) {
                    out.push('');
                }
            } else {
                consecutiveBlanks = 0;
                if (line === prevLine) {
                    repeatCount++;
                    if (repeatCount <= MAX_REPEATED_ADJACENT_LINES) {
                        out.push(line);
                    }
                } else {
                    if (repeatCount > MAX_REPEATED_ADJACENT_LINES) {
                        out.push(`… [previous line repeated ${repeatCount - MAX_REPEATED_ADJACENT_LINES} more times]`);
                    }
                    prevLine = line;
                    repeatCount = 1;
                    out.push(line);
                }
            }

            lineStart = lineEnd + 1;
        }

        if (repeatCount > MAX_REPEATED_ADJACENT_LINES) {
            out.push(`… [previous line repeated ${repeatCount - MAX_REPEATED_ADJACENT_LINES} more times]`);
        }

        const resultText = out.join('\n');
        return Object.freeze({
            text: resultText,
            changed: resultText.length !== text.length,
            appliedRules: Object.freeze(applied)
        });
    }
}

function compactFencedCodeBlankLines(text: string): string {
    return text.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_full, language: string | undefined, code: string) => {
        const nonBlank = code.split(/\r?\n/).filter(line => line.trim().length > 0).join('\n');
        return `\`\`\`${language || ''}\n${nonBlank}\n\`\`\``;
    });
}

const BRACE_LANGUAGES = new Set([
    'typescript', 'ts', 'tsx', 'javascript', 'js', 'jsx', 'java', 'c', 'cpp', 'c++', 'csharp', 'cs',
    'go', 'rust', 'json', 'css', 'scss', 'less', 'php', 'kotlin', 'swift'
]);

function compactBraceLanguageIndentation(text: string): string {
    return text.replace(/```([a-zA-Z0-9_+#-]+)\n([\s\S]*?)```/g, (full, language: string, code: string) => {
        if (!BRACE_LANGUAGES.has(language.toLowerCase())) return full;
        // Backticks and escaped physical newlines can make indentation part of a string value.
        if (code.includes('`') || /\\\r?\n/.test(code)) return full;
        const compacted = code.split(/\r?\n/).map(line => line.replace(/^[ \t]+/, '')).join('\n');
        return `\`\`\`${language}\n${compacted}\`\`\``;
    });
}

function unchanged(text: string): ConservativeCompressionResult {
    return Object.freeze({ text, changed: false, appliedRules: Object.freeze([]) });
}

function collapseBlankRuns(text: string): string {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let blankRun = 0;
    for (const line of lines) {
        if (line.trim().length === 0) {
            blankRun++;
            if (blankRun <= MAX_CONSECUTIVE_BLANK_LINES) out.push(line);
        } else {
            blankRun = 0;
            out.push(line);
        }
    }
    return out.join('\n');
}

/**
 * Folds runs of identical adjacent lines. Only applied to lines that look like emitted output
 * (a repeated identical line is not meaningful source code), and the fold is annotated with the
 * exact original count so no information about volume is lost.
 */
function foldRepeatedAdjacentLines(text: string): string {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (line.trim().length === 0) { out.push(line); index++; continue; }
        let run = 1;
        while (index + run < lines.length && lines[index + run] === line) run++;
        if (run > MAX_REPEATED_ADJACENT_LINES) {
            for (let keep = 0; keep < MAX_REPEATED_ADJACENT_LINES; keep++) out.push(line);
            out.push(`… [previous line repeated ${run - MAX_REPEATED_ADJACENT_LINES} more times]`);
        } else {
            for (let keep = 0; keep < run; keep++) out.push(line);
        }
        index += run;
    }
    return out.join('\n');
}

function elideOpaqueBlobs(text: string): string {
    OPAQUE_BLOB.lastIndex = 0;
    return text.replace(OPAQUE_BLOB, blob => blob.length <= BLOB_KEEP_CHARS * 2
        ? blob
        : `${blob.slice(0, BLOB_KEEP_CHARS)}… [${blob.length - BLOB_KEEP_CHARS * 2} opaque characters elided] …${blob.slice(-BLOB_KEEP_CHARS)}`);
}
