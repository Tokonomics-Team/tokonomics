/**
 * Tokonomics Inline Evidence Classifier
 *
 * Determines which evidence categories are demonstrably present in the canonical messages the
 * caller already sent. This exists because the evidence safety gate previously had only two
 * inputs: retrieval output, or a small hard-coded assumption list. When workspace retrieval is
 * not permitted (the shipped default is `workspaceContext: selection`), higher-risk task classes
 * such as debug, test and review could never satisfy their required categories and every such
 * request fell through verbatim - even when the user had attached the exact stack trace or test
 * file the gate was asking for.
 *
 * Design rules that keep this safe:
 *
 * 1. It reads ONLY content already present in the request. It performs no retrieval, opens no
 *    file, and touches no workspace API, so it cannot widen the user's consent boundary or move
 *    any new data across the egress boundary.
 * 2. It claims a category only on positive, specific evidence. Absence of a signal always means
 *    "not provided", so the gate keeps failing closed. Over-claiming here would defeat the gate,
 *    so every matcher is written to under-claim rather than guess.
 * 3. It is deterministic, allocation-bounded and has no dependency on task type, so the same
 *    request always produces the same category set.
 *
 * Categories that cannot be established from inline text alone (callers, callees, architecture)
 * are deliberately never claimed here; only real retrieval can establish those.
 */

import { EvidenceCategory } from './governorTypes';

/** Hard bound on how much text is scanned per request, protecting against adversarial inputs. */
const MAX_SCAN_CHARS = 512_000;
/** Hard bound on fenced blocks inspected per request. */
const MAX_BLOCKS = 64;

export interface InlineEvidenceResult {
    /** Categories positively demonstrated by the supplied content. */
    readonly categories: readonly EvidenceCategory[];
    /** Per-category one-line justification, safe to place in a trace (no raw content). */
    readonly rationale: Readonly<Record<string, string>>;
    /** True when scanning stopped early because the input exceeded the bound. */
    readonly truncated: boolean;
}

interface Matcher {
    readonly category: EvidenceCategory;
    readonly reason: string;
    test(text: string, fencedBlocks: readonly FencedBlock[]): boolean;
}

interface FencedBlock {
    readonly lang: string;
    readonly body: string;
}

const STACK_FRAME = /^\s*at\s+[\w$.<>\s]+\(?[^\s)]+:\d+(?::\d+)?\)?\s*$/m;
const PY_TRACEBACK = /Traceback \(most recent call last\):/;
const GO_PANIC = /^panic:\s+.+$/m;
const JAVA_TRACE = /^\s*at\s+[\w.$]+\([\w.]+\.java:\d+\)\s*$/m;
const TS_DIAGNOSTIC = /\b(?:TS|CS)\d{4,5}\b\s*[:.]/;
const RUST_PANIC = /thread '[^']+' panicked at/;
const ERROR_WITH_LOCATION = /\b\w*(?:Error|Exception)\b:[^\n]{0,200}\n[\s\S]{0,400}?(?:^\s*at\s|File ")/m;

const TEST_DECLARATION = /(?:^|\s)(?:describe|it|test)\s*\(\s*['"`]/m;
const TEST_ASSERTION = /\b(?:expect\s*\(|assert(?:Equal|True|That|\.\w+)?\s*\(|should\.\w+|\.toBe\w*\s*\()/;
const GO_TEST = /^func\s+Test[A-Z]\w*\s*\(\s*\w+\s+\*testing\.T\s*\)/m;
const RUST_TEST = /#\[(?:test|tokio::test)\]/;
const JAVA_TEST = /@(?:Test|ParameterizedTest)\b/;
const PY_TEST = /^\s*def\s+test_\w+\s*\(/m;

const FUNCTION_DEFINITION = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+\s*\(|(?:public|private|protected)\s+\w+\s*\(|def\s+\w+\s*\(|func\s+\w+\s*\(|fn\s+\w+\s*[(<])/;
const CLASS_DEFINITION = /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?(?:class|struct|impl|enum)\s+\w+/;

const CONTRACT_DECLARATION = /(?:^|\n)\s*(?:export\s+)?(?:interface\s+\w+|type\s+\w+\s*=|declare\s+(?:module|namespace|function)|trait\s+\w+|protocol\s+\w+)/;
// An explicit return-type annotation, including lowercase primitives (number, string, void)
// and generics. The earlier form required an uppercase initial and so missed most TypeScript.
const SIGNATURE_ONLY = /\)\s*:\s*(?:Promise\s*<)?\s*[A-Za-z_$][\w$]*(?:\s*[<\[])?/;

const DIFF_HEADER = /^diff --git |^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@|^(?:\+\+\+|---) [ab]?\//m;
const COMMIT_MARKER = /^commit [0-9a-f]{7,40}$/m;

const CONFIG_LANGS = new Set(['json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'properties', 'env', 'dotenv']);
const CONFIG_FILENAMES = /\b(?:package\.json|tsconfig(?:\.\w+)?\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle|\.eslintrc|webpack\.config|vite\.config|docker-compose\.ya?ml|Dockerfile)\b/;

const MOCK_MARKER = /\b(?:jest\.mock\s*\(|sinon\.(?:stub|spy|mock)\s*\(|unittest\.mock|@patch\b|Mockito\.\w+|gomock\.|mockery\.|createMock\w*\s*\()/;
const FIXTURE_MARKER = /\b(?:@pytest\.fixture|beforeEach\s*\(|setUp\s*\(\s*\)|fixture\s*\(|testdata\/|__fixtures__)/;

const MATCHERS: readonly Matcher[] = Object.freeze([
    {
        category: 'errorStackTrace',
        reason: 'a stack trace, panic, traceback or compiler diagnostic is present in the request',
        test: text => STACK_FRAME.test(text) || PY_TRACEBACK.test(text) || GO_PANIC.test(text)
            || JAVA_TRACE.test(text) || TS_DIAGNOSTIC.test(text) || RUST_PANIC.test(text)
            || ERROR_WITH_LOCATION.test(text)
    },
    {
        category: 'tests',
        reason: 'test declarations or assertions are present in the request',
        test: text => (TEST_DECLARATION.test(text) && TEST_ASSERTION.test(text))
            || GO_TEST.test(text) || RUST_TEST.test(text) || JAVA_TEST.test(text)
            || (PY_TEST.test(text) && TEST_ASSERTION.test(text))
    },
    {
        category: 'targetImplementation',
        reason: 'a function or type definition body is present in the request',
        test: (_text, blocks) => blocks.some(block => FUNCTION_DEFINITION.test(block.body) || CLASS_DEFINITION.test(block.body))
    },
    {
        category: 'apiContract',
        reason: 'an interface, type alias or explicit signature declaration is present in the request',
        test: (_text, blocks) => blocks.some(block => CONTRACT_DECLARATION.test(block.body)
            || (FUNCTION_DEFINITION.test(block.body) && SIGNATURE_ONLY.test(block.body)))
    },
    {
        category: 'configuration',
        reason: 'a configuration document or recognised configuration filename is present in the request',
        test: (text, blocks) => blocks.some(block => CONFIG_LANGS.has(block.lang)) || CONFIG_FILENAMES.test(text)
    },
    {
        category: 'gitHistory',
        reason: 'a unified diff, patch hunk or commit header is present in the request',
        test: text => DIFF_HEADER.test(text) || COMMIT_MARKER.test(text)
    },
    {
        category: 'mocks',
        reason: 'mocking or stubbing calls are present in the request',
        test: text => MOCK_MARKER.test(text)
    },
    {
        category: 'fixtures',
        reason: 'test fixture or setup constructs are present in the request',
        test: text => FIXTURE_MARKER.test(text)
    }
]);

export class InlineEvidenceClassifier {
    /**
     * Classifies evidence already present in the supplied message contents.
     * Never throws: any failure yields an empty category set, which keeps the gate failing closed.
     */
    public static classify(contents: readonly string[]): InlineEvidenceResult {
        try {
            let budget = MAX_SCAN_CHARS;
            const parts: string[] = [];
            let truncated = false;
            for (const content of contents) {
                if (budget <= 0) { truncated = true; break; }
                if (typeof content !== 'string' || content.length === 0) continue;
                if (content.length > budget) { parts.push(content.slice(0, budget)); budget = 0; truncated = true; }
                else { parts.push(content); budget -= content.length; }
            }
            const text = parts.join('\n');
            if (text.length === 0) return frozenResult([], {}, truncated);

            const blocks = extractFencedBlocks(text);
            const categories: EvidenceCategory[] = [];
            const rationale: Record<string, string> = {};
            for (const matcher of MATCHERS) {
                if (categories.includes(matcher.category)) continue;
                if (matcher.test(text, blocks)) {
                    categories.push(matcher.category);
                    rationale[matcher.category] = matcher.reason;
                }
            }
            return frozenResult(categories, rationale, truncated);
        } catch {
            // Classification is an optimisation of the gate's inputs, never a requirement.
            // On any failure the caller sees no categories and the existing conservative path runs.
            return frozenResult([], {}, false);
        }
    }
}

function frozenResult(categories: EvidenceCategory[], rationale: Record<string, string>, truncated: boolean): InlineEvidenceResult {
    return Object.freeze({
        categories: Object.freeze([...categories]),
        rationale: Object.freeze({ ...rationale }),
        truncated
    });
}

function extractFencedBlocks(text: string): FencedBlock[] {
    const blocks: FencedBlock[] = [];
    const regex = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null && blocks.length < MAX_BLOCKS) {
        blocks.push({ lang: (match[1] || '').toLowerCase(), body: match[2] });
    }
    // A request may contain code without fences (a pasted file, an attached editor selection).
    // Treat the whole text as one untagged block so structural matchers still see it.
    if (blocks.length === 0) blocks.push({ lang: '', body: text });
    return blocks;
}
