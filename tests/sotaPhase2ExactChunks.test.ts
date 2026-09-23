/**
 * SOTA Alignment — Phase 2: snapshot-bound exact semantic chunks.
 *
 * The defect these tests close: the index stored a pruned skeleton per file and the retriever
 * rendered that skeleton as the focal implementation, so a payload could contain something that read
 * as code while omitting the statements needed to act on it.
 *
 * The governing invariant is byte equality. A chunk is either the exact bytes of the source it
 * claims to be, or it is a declared shortfall - there is no third state in which approximate text is
 * presented as an implementation.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import {
    extractChunkRanges, rehydrateExact, requiresExactSource, ExactSourceProvider,
    MAX_CHUNK_BYTES, FALLBACK_WINDOW_LINES
} from '../src/workspace/semanticChunk';
import { WorkspaceExactSourceReader } from '../src/workspace/exactSourceReader';

/** In-memory reader, so extraction and freshness can be tested without touching a disk. */
class MemoryReader implements ExactSourceProvider {
    constructor(private readonly files: Map<string, string>) {}
    public read(absolutePath: string): string | undefined {
        return this.files.get(absolutePath);
    }
}

const LF = String.fromCharCode(10);

interface GoldenCase {
    readonly language: string;
    readonly file: string;
    readonly source: string;
    readonly symbol: { name: string; kind: string; line: number };
    /** The exact text the chunk must reproduce, byte for byte. */
    readonly expected: string;
}

function goldenCases(): GoldenCase[] {
    const cases: GoldenCase[] = [];

    const ts = [
        'import { Budget } from "./budget";',
        '',
        'export function resolveCeiling(request: Budget): number {',
        '    if (request.ceiling <= 0) {',
        '        throw new Error("ceiling must be > 0");',
        '    }',
        '    return Math.min(request.ceiling, 4096);',
        '}',
        '',
        'export const UNUSED = 1;'
    ].join(LF);
    cases.push({
        language: 'ts', file: '/repo/src/budget.ts', source: ts,
        symbol: { name: 'resolveCeiling', kind: 'function', line: 3 },
        expected: ts.split(LF).slice(2, 8).join(LF)
    });

    const py = [
        'import math',
        '',
        'def compute_ratio(numerator, denominator):',
        '    if denominator == 0:',
        '        raise ValueError("denominator must be non-zero")',
        '    return numerator / denominator',
        '',
        'CONSTANT = 3'
    ].join(LF);
    cases.push({
        language: 'py', file: '/repo/src/ratio.py', source: py,
        symbol: { name: 'compute_ratio', kind: 'function', line: 3 },
        expected: py.split(LF).slice(2, 6).join(LF)
    });

    const go = [
        'package budget',
        '',
        'func Resolve(ceiling int) int {',
        '\tif ceiling <= 0 {',
        '\t\treturn 0',
        '\t}',
        '\treturn ceiling',
        '}',
        ''
    ].join(LF);
    cases.push({
        language: 'go', file: '/repo/src/budget.go', source: go,
        symbol: { name: 'Resolve', kind: 'function', line: 3 },
        expected: go.split(LF).slice(2, 8).join(LF)
    });

    const rs = [
        'pub struct Budget {',
        '    pub ceiling: u32,',
        '}',
        '',
        'pub fn resolve(budget: &Budget) -> u32 {',
        '    if budget.ceiling == 0 { return 0; }',
        '    budget.ceiling',
        '}'
    ].join(LF);
    cases.push({
        language: 'rs', file: '/repo/src/budget.rs', source: rs,
        symbol: { name: 'resolve', kind: 'function', line: 5 },
        expected: rs.split(LF).slice(4, 8).join(LF)
    });

    const java = [
        'package budget;',
        '',
        'public class Budget {',
        '    public int resolve(int ceiling) {',
        '        if (ceiling <= 0) { throw new IllegalArgumentException("bad"); }',
        '        return ceiling;',
        '    }',
        '}'
    ].join(LF);
    cases.push({
        language: 'java', file: '/repo/src/Budget.java', source: java,
        symbol: { name: 'Budget', kind: 'class', line: 3 },
        expected: java.split(LF).slice(2, 8).join(LF)
    });

    return cases;
}

export async function runSotaPhase2ExactChunkTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 2 Exact Chunk Tests ---');

    // ---------------------------------------------------------------------
    // 1. Byte-exact focal bodies across languages.
    // ---------------------------------------------------------------------
    for (const testCase of goldenCases()) {
        const ranges = extractChunkRanges(testCase.source, [testCase.symbol], {
            fileKey: testCase.file, relativePath: testCase.file, language: testCase.language,
            sourceVersion: 'v1', snapshotGeneration: 1
        });
        const range = ranges.find(item => item.symbolName === testCase.symbol.name);
        assert.ok(range, `${testCase.language}: a range must be captured for ${testCase.symbol.name}`);

        const reader = new MemoryReader(new Map([[testCase.file, testCase.source]]));
        const result = rehydrateExact(range, testCase.file, reader);
        assert.strictEqual(result.status, 'exact', `${testCase.language}: ${result.reason}`);
        assert.strictEqual(result.text, testCase.expected,
            `${testCase.language}: rehydrated text must be byte-identical to the source body`);

        // The whole point: this is not the skeleton. Control flow and literals survive.
        assert.ok(result.text.includes('return') || result.text.includes('ceiling'),
            `${testCase.language}: an exact body must retain its statements`);
    }

    // ---------------------------------------------------------------------
    // 2. Protected tokens survive verbatim.
    // ---------------------------------------------------------------------
    // Byte equality already implies this, but it is asserted directly because these are the tokens
    // whose loss is silent and expensive: a changed operator or literal produces confident wrong work.
    const protectedSource = [
        'export function guard(value: number, path: string): boolean {',
        '    if (value !== -1 && value <= 0.5 && !path.startsWith("/etc/")) {',
        '        return false;',
        '    }',
        '    return value >= 0x1F && path !== "";',
        '}'
    ].join(LF);
    const protectedRanges = extractChunkRanges(protectedSource,
        [{ name: 'guard', kind: 'function', line: 1 }],
        { fileKey: '/repo/g.ts', relativePath: 'g.ts', language: 'ts', sourceVersion: 'v1', snapshotGeneration: 1 });
    const protectedText = rehydrateExact(protectedRanges[0], '/repo/g.ts',
        new MemoryReader(new Map([['/repo/g.ts', protectedSource]]))).text;
    for (const token of ['!==', '<=', '>=', '&&', '!path', '-1', '0.5', '0x1F', '"/etc/"']) {
        assert.ok(protectedText && protectedText.includes(token),
            `Protected token ${token} must survive exact rehydration`);
    }

    // ---------------------------------------------------------------------
    // 3. A changed file fails closed rather than rendering the wrong lines.
    // ---------------------------------------------------------------------
    // This is the case that matters most: the same offsets against a different version of a file
    // point at arbitrary text, which is worse than no evidence because it is specific and wrong.
    const original = goldenCases()[0];
    const originalRanges = extractChunkRanges(original.source, [original.symbol], {
        fileKey: original.file, relativePath: original.file, language: 'ts',
        sourceVersion: 'v1', snapshotGeneration: 1
    });
    const mutated = original.source.replace('Math.min', 'Math.max');
    const staleResult = rehydrateExact(originalRanges[0], original.file,
        new MemoryReader(new Map([[original.file, mutated]])));
    assert.strictEqual(staleResult.status, 'stale_file',
        'A file that changed after capture must be rejected, not re-sliced at the old offsets');
    assert.strictEqual(staleResult.text, undefined, 'A stale rehydration must return no text at all');

    // Missing, empty and binary files are all unavailable rather than throwing.
    assert.strictEqual(rehydrateExact(originalRanges[0], original.file,
        new MemoryReader(new Map())).status, 'unavailable');
    assert.strictEqual(rehydrateExact(originalRanges[0], original.file,
        new MemoryReader(new Map([[original.file, 'binary\0content']]))).status, 'unavailable');

    // A reader that throws is contained.
    const throwingReader: ExactSourceProvider = { read() { throw new Error('io failure'); } };
    assert.strictEqual(rehydrateExact(originalRanges[0], original.file, throwingReader).status, 'unavailable',
        'A failing reader must degrade to unavailable, never propagate');

    // ---------------------------------------------------------------------
    // 4. Ranges are metadata: no source text is retained in the index.
    // ---------------------------------------------------------------------
    const serialized = JSON.stringify(originalRanges[0]);
    assert.ok(!serialized.includes('Math.min'),
        'A stored range must not contain source text; it holds offsets and hashes only');
    assert.ok(!serialized.includes('throw new Error'),
        'A stored range must not contain source text');
    assert.strictEqual(originalRanges[0].fileContentHash,
        createHash('sha256').update(original.source).digest('hex'),
        'The range must bind to the exact file content it was captured from');

    // ---------------------------------------------------------------------
    // 5. Unfollowable structure degrades to a bounded window, still exact.
    // ---------------------------------------------------------------------
    const unknownLanguage = ['fn mystery()', 'body line one', 'body line two'].join(LF);
    const windowRanges = extractChunkRanges(unknownLanguage,
        [{ name: 'mystery', kind: 'function', line: 1 }],
        { fileKey: '/repo/m.zig', relativePath: 'm.zig', language: 'zig', sourceVersion: 'v1', snapshotGeneration: 1 });
    assert.strictEqual(windowRanges[0].boundary, 'line_window',
        'An unfollowable language must record that its boundary is a window, not a symbol');
    const windowText = rehydrateExact(windowRanges[0], '/repo/m.zig',
        new MemoryReader(new Map([['/repo/m.zig', unknownLanguage]])));
    assert.strictEqual(windowText.status, 'exact');
    assert.strictEqual(windowText.text, unknownLanguage,
        'A windowed boundary must still yield exact bytes, only a less precise extent');
    assert.ok(windowRanges[0].endLine - windowRanges[0].startLine <= FALLBACK_WINDOW_LINES,
        'The conservative window must stay bounded');

    // ---------------------------------------------------------------------
    // 6. Oversized chunks are refused.
    // ---------------------------------------------------------------------
    const huge = ['export function huge() {', 'x'.repeat(MAX_CHUNK_BYTES + 1024), '}'].join(LF);
    const hugeRanges = extractChunkRanges(huge, [{ name: 'huge', kind: 'function', line: 1 }],
        { fileKey: '/repo/h.ts', relativePath: 'h.ts', language: 'ts', sourceVersion: 'v1', snapshotGeneration: 1 });
    assert.strictEqual(hugeRanges.length, 0,
        'A chunk larger than the evidence bound must never be captured');

    // ---------------------------------------------------------------------
    // 7. The reader refuses to read outside the workspace roots.
    // ---------------------------------------------------------------------
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase2-'));
    try {
        const insideDir = path.join(tempRoot, 'workspace');
        fs.mkdirSync(insideDir, { recursive: true });
        const insidePath = path.join(insideDir, 'inside.ts');
        fs.writeFileSync(insidePath, 'export const inside = 1;', 'utf8');
        const outsidePath = path.join(tempRoot, 'outside.ts');
        fs.writeFileSync(outsidePath, 'export const secret = 2;', 'utf8');

        const reader = new WorkspaceExactSourceReader([insideDir]);
        assert.strictEqual(reader.read(insidePath), 'export const inside = 1;',
            'A file inside the workspace root must be readable');
        assert.strictEqual(reader.read(outsidePath), undefined,
            'A file outside the workspace roots must never be read');
        assert.strictEqual(reader.read(path.join(insideDir, '..', 'outside.ts')), undefined,
            'Traversal out of the root must be refused after resolution, not before');
        assert.strictEqual(reader.read(path.join(insideDir, 'missing.ts')), undefined,
            'A missing file must be undefined rather than an exception');

        // A reader with no roots authorises nothing.
        assert.strictEqual(new WorkspaceExactSourceReader([]).read(insidePath), undefined,
            'With no roots, no read is authorised');

        // The per-request file bound holds.
        const boundedReader = new WorkspaceExactSourceReader([insideDir], 1);
        assert.ok(boundedReader.read(insidePath) !== undefined);
        const second = path.join(insideDir, 'second.ts');
        fs.writeFileSync(second, 'export const second = 3;', 'utf8');
        assert.strictEqual(boundedReader.read(second), undefined,
            'The per-request file budget must bound how much source one request can read');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    // ---------------------------------------------------------------------
    // 8. Task policy: exact source where code changes, signatures where they suffice.
    // ---------------------------------------------------------------------
    for (const task of ['debug', 'refactor', 'feature', 'test', 'review']) {
        assert.strictEqual(requiresExactSource(task), true,
            `${task} changes or verifies code and must receive exact source`);
    }
    for (const task of ['explain', 'search']) {
        assert.strictEqual(requiresExactSource(task), false,
            `${task} can be answered at signature level; forcing exact bodies would spend tokens for nothing`);
    }
    assert.strictEqual(requiresExactSource(undefined), true,
        'An unknown task must be treated conservatively');

    // ---------------------------------------------------------------------
    // 9. A skeleton may nominate, but may never be rendered as implementation.
    // ---------------------------------------------------------------------
    const retrieverSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'retrieval', 'evidenceRetriever.ts'), 'utf8');
    assert.ok(retrieverSource.includes('rehydrateSelected'),
        'Selected evidence must pass through the rehydration stage');
    assert.ok(retrieverSource.includes('exactSourceShortfall'),
        'Evidence that could not be rehydrated must carry a declared shortfall');

    console.log('  ✓ Focal bodies are byte-exact across TypeScript, Python, Go, Rust and Java.');
    console.log('  ✓ Operators, literals, paths and negations survive verbatim.');
    console.log('  ✓ A file changed after capture fails closed instead of rendering wrong lines.');
    console.log('  ✓ The index stores offsets and hashes, never source text.');
    console.log('  ✓ Unfollowable structure degrades to a bounded window that is still exact.');
    console.log('  ✓ Reads are confined to workspace roots, bounded per request.');
    console.log('  ✓ Exact source is required where code changes, not where signatures suffice.');
    console.log('\n--- ALL SOTA PHASE 2 EXACT CHUNK TESTS PASSED ---\n');
}
