/**
 * Snapshot-bound exact semantic chunks.
 *
 * The defect this closes: the workspace index stores a pruned `skeleton` per file, and the evidence
 * retriever rendered that skeleton as the focal implementation. A payload could therefore contain
 * something that looked like code while omitting the very statements needed to review, debug,
 * refactor or test it. Compression that removes the answer is not compression.
 *
 * The rule here is that a skeleton or a vector may *nominate* a candidate but may never *be* the
 * rendered implementation evidence. Ranking still runs over cheap representations; exact source is
 * rehydrated only for the handful of candidates that survive selection, and only when it can be
 * proven to come from the same snapshot the ranking was computed against.
 *
 * Freshness is the whole game. A range captured against one version of a file and rendered against
 * another is worse than no evidence: it is confident, specific and wrong. Every rehydration
 * therefore re-verifies the file's content hash and fails closed - a declared shortfall, never an
 * approximation - when the file has changed, moved, grown past its bound, or cannot be decoded.
 *
 * Ranges are stored, text is not. The index keeps offsets and hashes so memory stays proportional
 * to the number of symbols rather than to the size of the repository.
 *
 * Pure module: deterministic in its arguments, no VS Code, no configuration. The one I/O dependency
 * is injected as an ExactSourceProvider so the policy stays testable.
 */

import { createHash } from 'crypto';

/** Upper bound on a single rehydrated chunk. Larger evidence is not evidence, it is an attachment. */
export const MAX_CHUNK_BYTES = 64 * 1024;

/** Upper bound on the number of chunks rehydrated for one request. */
export const MAX_REHYDRATIONS_PER_REQUEST = 12;

/**
 * How a chunk's end boundary was determined.
 *
 * Both kinds yield byte-exact source text; they differ in confidence about where the symbol stops.
 * `line_window` is the conservative fallback used when the language's structure could not be
 * followed, and it is recorded rather than hidden so a caller can tell the difference.
 */
export type ChunkBoundaryKind = 'exact_symbol' | 'line_window';

export interface SemanticChunkRange {
    /** Stable identity: file key, symbol and start line. */
    readonly chunkId: string;
    readonly fileKey: string;
    readonly relativePath: string;
    readonly language: string;
    readonly symbolName: string;
    readonly symbolKind: string;
    readonly boundary: ChunkBoundaryKind;
    /** 1-based inclusive line range. */
    readonly startLine: number;
    readonly endLine: number;
    /** Character offsets into the file content captured at index time. */
    readonly startOffset: number;
    readonly endOffset: number;
    /** SHA-256 of the exact chunk text at capture. */
    readonly chunkHash: string;
    /** SHA-256 of the whole file at capture; rehydration fails closed unless this still matches. */
    readonly fileContentHash: string;
    readonly sourceVersion: string;
    readonly snapshotGeneration: number;
    readonly estimatedTokens: number;
}

export type RehydrationStatus =
    | 'exact'
    | 'stale_file'
    | 'range_invalid'
    | 'oversized'
    | 'unavailable';

export interface RehydrationResult {
    readonly status: RehydrationStatus;
    /** Exact source text. Present only when status is 'exact'. */
    readonly text?: string;
    /** Auditable explanation, suitable for a declared shortfall. */
    readonly reason: string;
}

/** Injected reader. Returns the file's current exact text, or undefined when it cannot be read. */
export interface ExactSourceProvider {
    read(absolutePath: string): string | undefined;
}

const BRACE_LANGUAGES = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'go', 'rs', 'java', 'cs', 'cpp', 'cc', 'c', 'h', 'hpp', 'swift', 'kt', 'scala', 'php'
]);

const INDENT_LANGUAGES = new Set(['py', 'pyi', 'rb']);

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * Strips string and comment content from a line so brace counting is not fooled by braces inside
 * literals. Deliberately simple: it does not need to parse the language, only to avoid counting a
 * brace that is not structural. Anything it gets wrong degrades to a line window, never to wrong text.
 */
function structuralOnly(line: string): string {
    let result = '';
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const previous = i > 0 ? line[i - 1] : '';
        if (!inSingle && !inDouble && !inTemplate && char === '/' && line[i + 1] === '/') break;
        if (!inSingle && !inDouble && !inTemplate && char === '#') break;
        if (previous !== '\\') {
            if (char === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
            if (char === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
            if (char === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
        }
        if (inSingle || inDouble || inTemplate) continue;
        result += char;
    }
    return result;
}

/** Finds the last line of a brace-delimited body starting at declarationIndex (0-based). */
function findBraceEnd(lines: readonly string[], declarationIndex: number, maxScan: number): number | undefined {
    let depth = 0;
    let opened = false;
    let inBlockComment = false;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    const limit = Math.min(lines.length, declarationIndex + maxScan);
    for (let index = declarationIndex; index < limit; index++) {
        const line = lines[index];
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = i + 1 < line.length ? line[i + 1] : '';
            const prev = i > 0 ? line[i - 1] : '';

            if (inBlockComment) {
                if (char === '*' && next === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }

            if (inSingle) {
                if (char === "'" && prev !== '\\') inSingle = false;
                continue;
            }
            if (inDouble) {
                if (char === '"' && prev !== '\\') inDouble = false;
                continue;
            }
            if (inTemplate) {
                if (char === '`' && prev !== '\\') inTemplate = false;
                continue;
            }

            if (char === '/' && next === '/') {
                break;
            }
            if (char === '/' && next === '*') {
                inBlockComment = true;
                i++;
                continue;
            }

            if (char === "'" && prev !== '\\') { inSingle = true; continue; }
            if (char === '"' && prev !== '\\') { inDouble = true; continue; }
            if (char === '`' && prev !== '\\') { inTemplate = true; continue; }

            if (char === '{') {
                depth++;
                opened = true;
            } else if (char === '}') {
                depth--;
                if (opened && depth === 0) return index;
            }
        }
        // A declaration that terminates without ever opening a body (an interface member, a type
        // alias, an abstract signature) ends on its own line.
        if (!opened && !inBlockComment && /;\s*$/.test(line.trim())) return index;
    }
    return undefined;
}

/** Finds the last line of an indentation-delimited body (Python, Ruby). */
function findIndentEnd(lines: readonly string[], declarationIndex: number, maxScan: number): number | undefined {
    const declaration = lines[declarationIndex];
    const baseIndent = declaration.length - declaration.trimStart().length;
    const limit = Math.min(lines.length, declarationIndex + maxScan);
    let lastContent = declarationIndex;
    for (let index = declarationIndex + 1; index < limit; index++) {
        const line = lines[index];
        if (line.trim().length === 0) continue;
        const indent = line.length - line.trimStart().length;
        if (indent <= baseIndent) return lastContent;
        lastContent = index;
    }
    return lastContent > declarationIndex ? lastContent : undefined;
}

export interface ChunkSourceSymbol {
    readonly name: string;
    readonly kind: string;
    /** 1-based declaration line. */
    readonly line: number;
}

export interface ChunkExtractionContext {
    readonly fileKey: string;
    readonly relativePath: string;
    readonly language: string;
    readonly sourceVersion: string;
    readonly snapshotGeneration: number;
}

/** Conservative window used when the language's structure could not be followed. */
export const FALLBACK_WINDOW_LINES = 40;

/** Maximum lines scanned looking for a symbol's end, bounding cost on pathological files. */
export const MAX_BODY_SCAN_LINES = 2_000;

/**
 * Computes exact ranges for a file's symbols. Stores offsets and hashes only; the text itself is
 * not retained, so index memory stays proportional to symbol count rather than repository size.
 */
export function extractChunkRanges(
    content: string,
    symbols: readonly ChunkSourceSymbol[],
    context: ChunkExtractionContext
): SemanticChunkRange[] {
    if (typeof content !== 'string' || content.length === 0 || symbols.length === 0) return [];

    const lines = content.split(String.fromCharCode(10));
    // Offset of the first character of each line, so a line range converts to exact character offsets.
    const lineOffsets: number[] = new Array(lines.length);
    let running = 0;
    for (let index = 0; index < lines.length; index++) {
        lineOffsets[index] = running;
        running += lines[index].length + 1;
    }

    const fileContentHash = sha256(content);
    const ranges: SemanticChunkRange[] = [];

    for (const symbol of symbols) {
        const declarationIndex = symbol.line - 1;
        if (declarationIndex < 0 || declarationIndex >= lines.length) continue;

        let endIndex: number | undefined;
        let boundary: ChunkBoundaryKind = 'exact_symbol';
        if (BRACE_LANGUAGES.has(context.language)) {
            endIndex = findBraceEnd(lines, declarationIndex, MAX_BODY_SCAN_LINES);
        } else if (INDENT_LANGUAGES.has(context.language)) {
            endIndex = findIndentEnd(lines, declarationIndex, MAX_BODY_SCAN_LINES);
        }
        if (endIndex === undefined) {
            endIndex = Math.min(lines.length - 1, declarationIndex + FALLBACK_WINDOW_LINES);
            boundary = 'line_window';
        }

        const startOffset = lineOffsets[declarationIndex];
        const endOffset = lineOffsets[endIndex] + lines[endIndex].length;
        if (endOffset <= startOffset) continue;
        const text = content.slice(startOffset, endOffset);
        if (Buffer.byteLength(text) > MAX_CHUNK_BYTES) continue;

        ranges.push(Object.freeze({
            chunkId: `${context.fileKey}#${symbol.name}@${symbol.line}`,
            fileKey: context.fileKey,
            relativePath: context.relativePath,
            language: context.language,
            symbolName: symbol.name,
            symbolKind: symbol.kind,
            boundary,
            startLine: declarationIndex + 1,
            endLine: endIndex + 1,
            startOffset,
            endOffset,
            chunkHash: sha256(text),
            fileContentHash,
            sourceVersion: context.sourceVersion,
            snapshotGeneration: context.snapshotGeneration,
            // Deliberately the same cheap heuristic the budget uses, so packing and retrieval agree.
            estimatedTokens: Math.ceil(text.length / 4)
        }));
    }
    return ranges;
}

/**
 * Rehydrates one chunk's exact text, or explains why it could not.
 *
 * Fails closed on any doubt. A stale file is rejected outright rather than re-extracted at the same
 * offsets, because offsets from a previous version of a file point at arbitrary text in the new one.
 */
export function rehydrateExact(
    range: SemanticChunkRange,
    absolutePath: string,
    provider: ExactSourceProvider
): RehydrationResult {
    let content: string | undefined;
    try {
        content = provider.read(absolutePath);
    } catch {
        return { status: 'unavailable', reason: 'The source file could not be read.' };
    }
    if (typeof content !== 'string' || content.length === 0) {
        return { status: 'unavailable', reason: 'The source file is missing, empty or undecodable.' };
    }
    if (content.includes('\0')) {
        return { status: 'unavailable', reason: 'The source file is binary.' };
    }
    if (sha256(content) !== range.fileContentHash) {
        return {
            status: 'stale_file',
            reason: `The file changed after the snapshot was captured (${range.relativePath}); `
                + 'its recorded ranges no longer identify the same code.'
        };
    }
    if (range.startOffset < 0 || range.endOffset > content.length || range.endOffset <= range.startOffset) {
        return { status: 'range_invalid', reason: 'The recorded range lies outside the file.' };
    }
    const text = content.slice(range.startOffset, range.endOffset);
    if (Buffer.byteLength(text) > MAX_CHUNK_BYTES) {
        return { status: 'oversized', reason: 'The chunk exceeds the maximum evidence size.' };
    }
    if (sha256(text) !== range.chunkHash) {
        return {
            status: 'stale_file',
            reason: 'The chunk text no longer matches the hash recorded for it.'
        };
    }
    return { status: 'exact', text, reason: 'Exact source rehydrated from the captured snapshot.' };
}

/** Task classes whose evidence must be exact source rather than a signature or skeleton. */
export const EXACT_SOURCE_TASKS: ReadonlySet<string> = Object.freeze(new Set([
    'debug', 'refactor', 'feature', 'test', 'review', 'implement', 'fix'
]));

/**
 * Whether a task needs exact implementation text.
 *
 * `explain` and `search` can legitimately be answered at signature level, so forcing exact bodies on
 * them would spend tokens for no gain. Everything else - and anything unrecognised, conservatively -
 * changes code, and changing code requires seeing it.
 */
export function requiresExactSource(taskType: string | undefined): boolean {
    if (!taskType) return true;
    const normalized = taskType.toLowerCase();
    if (normalized === 'explain' || normalized === 'search') return false;
    return true;
}
