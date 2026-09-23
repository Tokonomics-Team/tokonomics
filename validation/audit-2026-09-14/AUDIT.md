# AITokenOptimizer / Tokonomics static audit

Audited snapshot: **21d2e081c15051cde1d9059110d75fd1ea5e7472**, package **8.0.0**, 14 September 2026.

**Overall code quality: 58/100. Confirmed findings: 26 — 5 Critical, 14 High, 6 Medium, 1 Low.** This is an engineering assessment, not a computed security-certification score.

## Invariant adherence

| Invariant | Rating | Evidence |
|---|---|---|
| Local parsing/indexing/compaction | Conditional pass, 9/10 | No first-party unauthorized HTTP/WebSocket path found; selected VS Code models and explicitly selected subscription CLIs are egress boundaries. No live network interception was performed. Secret-redaction gaps separately break the zero-leak objective. |
| Required evidence overrides reduction | **Fail, 2/10** | Gate accepts omissions; final payload coverage is not established; structured observations can be masked after gates; incomplete functions can be labelled exact. |
| Production VSIX isolation | **Pass for inspected artifact, 10/10** | 17 actual entries; no validation/tests/scripts/src/out/maps. Metafile contains no validation imports. |
| Clean production TypeScript output | **Fail, 5/10** | Ten nonproduction evaluation modules emitted into out/evaluation in addition to the production preservation gate. |
| Deterministic, append-only prefix | **Fail, 4/10** | Time-bearing decisions, key-order-dependent schemas, semantic text rewriting, and observation boundary rewrites. |

## Scope and evidence limits

The traversal inventory covers **510 tracked first-party text/config files**, including **172 production-source files and 38,278 source lines**. TypeScript AST traversal collected imports, regular expressions and lifecycle/I/O operations across the codebase. Detailed manual contract review and adversarial execution focused on the subsystems requested. This is not a claim that every one of those lines received a separate manual proof, or that every possible bug has been found. Dependencies were checked through package metadata and bundle reachability, not audited line-by-line.

Requested-path mapping: `src/ast/contextPacker.ts`, `src/repo/FileWatchIndex.ts`, `src/schema/minifier.ts`, `src/compactor/` and `src/engine/circuitBreaker.ts` do not exist. Their current counterparts are semanticChunk/evidenceRetriever/globalBudget, workspaceIndex plus extension-owned events, cache/schemaMinifier, engine/*Compactor plus compression/observationMasking, and metrics/circuitBreaker.

## Validation and patch status

- Baseline: `npm.cmd run compile` and `npm.cmd test` passed.
- Fresh production build and VSIX packaging succeeded. SHA-256: `023d91139731fcd916900678050c531d803d38936b1e1e9d248f727f28de104a`.
- **25 focused defect probes reproduce on the original and no longer reproduce on the overlay.** These include an isolated regex timeout, parser diagnostics and an orchestrator dispatch case. The watcher probe simulates its callback; it does not test real VS Code filesystem notifications.
- The proposed TypeScript overlay compiles.
- **The full existing suite does not pass on the overlay.** It stops at `tests/subscriptions.test.ts:245`, whose “Explain forwardedValue” fixture expects dispatch despite unmet evidence requirements. Strict gate enforcement now refuses it. Further suite failures have not been ruled out.
- **No production files were changed.** The audit and candidate patches live under this excluded validation directory. Patches that disable unsafe pruning/masking intentionally sacrifice savings. They need integration/product-policy reconciliation before release; they are not certified drop-in fixes.

Reproduce with `node validation/audit-2026-09-14/reproduce.cjs`. Generate the overlay with `node validation/audit-2026-09-14/build-remediation.cjs`, then run the reproducer with `--patched`. Complete before/after code is in [REMEDIATION.md](REMEDIATION.md); the unified patch is [remediation.patch](remediation.patch).

## CRITICAL

### BUG-GOV-02: Evidence safety succeeds without required evidence and permits dispatch after failure

- **File & location:** src/governor/evidenceSafetyGate.ts:13-54; src/governor/contextGovernor.ts:80-94; src/engine/pipelineOrchestrator.ts:847-847; src/engine/pipelineOrchestrator.ts:849-849; src/engine/pipelineOrchestrator.ts:935-935.
- **Root cause:** The gate only fails for critical omissions or more than one high omission. Workspace authorization can demote critical requirements. The pipeline classifies original messages and uses retrieval.covered before final packing, does not enact downgrade_to_conservative, retains retrieval-only output after critical failure, and performs more reductions afterward without another evidence audit. These are control-flow/contract defects, not an unawaited promise.
- **Trigger:**

~~~text
auditEvidence([{category:"tests",priority:"high",reason:"regression"}],[]) returns passed:true and confidence:0. compileContext({messages:[{role:"user",content:"Debug this failure"}]}) returns a payload despite absent implementation and trace.
~~~

- **Impact:** A request can be marked evidence-safe even when RequiredEvidence is not a subset of emitted evidence. Categories describe a candidate pool rather than the final payload.
- **Exact remediation:** Make missing requirements fail the gate, preserve requirement priority, count only emitted candidates, and re-audit after all transformations. The strict proposed patch stops dispatch when requirements remain unmet. This is a deliberate behavior change and currently fails a subscription integration expectation; see compatibility notes. [Complete before/after code](REMEDIATION.md#bug-gov-02).
- **Verification:** Unit and pipeline reproduction; both resolved by overlay.

### BUG-SEC-01: Credential exemptions and encoding gaps survive the final-hop sanitizer

- **File & location:** src/security/sanitizer.ts:88-116; src/security/sanitizer.ts:118-144; src/security/sanitizer.ts:146-163.
- **Root cause:** Dummy matching accepts substrings such as default rather than an exact placeholder. Assignment matching misses quoted JSON keys and short/space-containing values. Vendor expressions see only decoded cleartext. PEM matching omits ENCRYPTED PRIVATE KEY. The residual scan repeats the same blind spots.
- **Trigger:**

~~~text
password=defaultProd2026!, {"password":"short"}, a fully percent-encoded synthetic sk-proj credential, its Base64 representation, and an encrypted PEM block all survive unchanged with residualSecret:false.
~~~

- **Impact:** Source or prompt credentials can be sent to the selected upstream provider or appear in exported logs despite a successful sanitation result. The probes use synthetic tokens only.
- **Exact remediation:** Replace assignment backtracking with a forward scanner, narrow placeholder exemptions, consume complete/unterminated PEM regions, and inspect bounded transport encodings. The patch covers the reproduced encodings, not arbitrary encryption or secret steganography. [Complete before/after code](REMEDIATION.md#bug-sec-01).
- **Verification:** Six representative payloads; resolved by overlay.

### BUG-COMP-02: Observation masking runs after safety checks and rewrites prior prompt bytes

- **File & location:** src/compression/observationMasking.ts:95-177.
- **Root cause:** Structured tool results bypass the text evidence plane. A later protocol-layer pass masks their text based only on age/size. It has no required-evidence or risk input. Quantizing the boundary postpones prefix rewriting; it does not make the prefix append-only.
- **Trigger:**

~~~text
Six tool results of about 4,950 characters are retained; append a seventh and the first four become placeholders, including a panic in result zero.
~~~

- **Impact:** The only causal error or implementation evidence can disappear after the gates have completed. Existing cached-prefix bytes change at every stride.
- **Exact remediation:** Disable this transform at its implementation boundary until per-observation evidence obligations and a persisted cache epoch exist. The patch preserves every observation; token reduction is intentionally lower. [Complete before/after code](REMEDIATION.md#bug-comp-02).
- **Verification:** Six-to-seven-result boundary reproduction resolved.

### BUG-AST-05: Byte-exact chunk hashes certify incomplete function evidence

- **File & location:** src/workspace/semanticChunk.ts:185-247.
- **Root cause:** structuralOnly resets quote/comment state each line and does not track block comments. A closing brace in a multiline comment ends findBraceEnd early. Rehydration proves the chosen substring matches its hash, then the retriever labels it exactSource:true; that does not prove the function body is complete. Unproven line windows can also be admitted as exact source.
- **Trigger:**

~~~text
export function save() {
 /* multiline comment
 }
 */
 criticalWrite();
}
 is chunked before criticalWrite(), yet rehydrateExact returns status:"exact".
~~~

- **Impact:** Required implementation evidence can omit the decisive operation while carrying valid provenance and exact-source claims.
- **Exact remediation:** Use whole-file evidence within the existing 64 KiB chunk bound until language-aware boundaries are proven. Larger files return no claimed exact range and trigger a declared shortfall. This conservative patch trades retrieval granularity for completeness. [Complete before/after code](REMEDIATION.md#bug-ast-05).
- **Verification:** Hash-valid incomplete-function reproduction resolved; LF/CRLF offsets are separately assessed below.

### BUG-REGEX-02: Repository ignore globs compile into exponential backtracking

- **File & location:** src/ignore/tokenIgnore.ts:4-4; src/ignore/tokenIgnore.ts:65-74.
- **Root cause:** Each * is translated into an independent [^/]*, allowing combinatorially many partitions of a nonmatching filename. The regex executes synchronously during workspace enumeration.
- **Trigger:**

~~~text
An ignore rule a*a*a*a*a*a*a*a*a*b applied to "a".repeat(100)+".ts" exceeds a 1,500 ms isolated-process deadline.
~~~

- **Impact:** A small checked-out ignore file can stall the extension host before indexing finishes; file-size budgets do not prevent it.
- **Exact remediation:** Replace regex generation with a bounded state-machine glob matcher. Matching cost is proportional to pattern states times path length, rather than exponential partitions. [Complete before/after code](REMEDIATION.md#bug-regex-02).
- **Verification:** Isolated-process timeout on baseline; patched matcher returns promptly.

## HIGH

### BUG-GOV-03: Captured diagnostics and failing-test signals never reach risk evaluation

- **File & location:** src/protocol/canonicalCompiler.ts:132-132; src/engine/pipelineOrchestrator.ts:256-256; src/engine/pipelineOrchestrator.ts:258-258.
- **Root cause:** CanonicalCompileRequest includes signalSnapshot but compileNow omits it when building the orchestrator request. Even direct orchestrator callers only pass prompt, file path, cursor and mode to the governor, leaving risk-engine diagnostics/tests/terminal inputs unused.
- **Trigger:**

~~~text
Compile a canonical request with a versioned diagnostic snapshot; the injected orchestrator receives signalSnapshot:undefined. Explain-oriented prompts with failing tests retain a low lexical risk.
~~~

- **Impact:** High-risk editor state cannot force the intended conservative override.
- **Exact remediation:** Forward the snapshot and pass matching-generation error, test and consented nonzero-exit signals into governor evaluation. Public-API/dynamic/unresolved-symbol signals still need trusted extraction before they can be used. [Complete before/after code](REMEDIATION.md#bug-gov-03).
- **Verification:** Snapshot-forwarding reproduction resolved; signal projection type-checks.

### BUG-SCHEMA-01: Schema compression changes enums, object constraints and property names

- **File & location:** src/cache/schemaMinifier.ts:144-182; src/cache/schemaMinifier.ts:184-226; src/cache/schemaMinifier.ts:103-103; src/cache/schemaMinifier.ts:108-108; src/cache/schemaMinifier.ts:114-115.
- **Root cause:** Medium/high/deferred remove additionalProperties and insert a synthetic value into truncated enums. Recursive traversal treats a properties map as a schema object, deleting legitimate properties called default or title. High/deferred advertise synthetic tools without an execution adapter. A {tools:[...]} wrapper is also discarded.
- **Trigger:**

~~~text
Compress a schema whose enum is ["a","b","c","d"], additionalProperties:false and required properties include default/title: d disappears, "...(1 more)" appears, constraints disappear, and required names no longer have definitions.
~~~

- **Impact:** The model receives a different accepted-argument language and may call nonexistent meta-tools.
- **Exact remediation:** Minify serialization only: preserve all schema values, keywords, named properties, wrappers and real tools. Defer richer compression until schema-aware transformations and a real adapter are implemented. [Complete before/after code](REMEDIATION.md#bug-schema-01).
- **Verification:** Schema equality probe resolved by overlay (ignoring object insertion order).

### BUG-CACHE-01: Equivalent schemas serialize into different static prefixes

- **File & location:** src/cache/schemaMinifier.ts:117-117.
- **Root cause:** Object.entries traversal and JSON.stringify preserve input insertion order; nested schema keys are never canonicalized.
- **Trigger:**

~~~text
Swap the insertion order of name/inputSchema and type/format. minifyToolSchemas emits different bytes for equivalent objects.
~~~

- **Impact:** An unchanged tool contract causes avoidable prefix-cache invalidation.
- **Exact remediation:** Recursively sort object keys during serialization while preserving all arrays and scalar values. Actual additions or changes to schemas still require a cache epoch; sorting cannot make changed content append-only. [Complete before/after code](REMEDIATION.md#bug-cache-01).
- **Verification:** Nested-key order reproduction resolved.

### BUG-CACHE-02: Cache normalization corrupts code escapes and semantic instructions

- **File & location:** src/cache/normalizer.ts:11-29.
- **Root cause:** A path regex is applied to arbitrary source and prompt text. It rewrites backslashes inside regex/string literals. A second regex removes any line beginning with a timestamp-like label regardless of its meaning.
- **Trigger:**

~~~text
const pattern = /foo\s+bar/ becomes /foo/s+bar/; "hello\nworld" becomes "hello/nworld"; Timestamp: retain this required event is removed.
~~~

- **Impact:** Broken syntax and changed instructions are introduced solely to improve cache stability.
- **Exact remediation:** Preserve arbitrary cacheable payload bytes. Normalize actual path fields and volatile metadata before assembly, where their types are known. [Complete before/after code](REMEDIATION.md#bug-cache-02).
- **Verification:** Literal and instruction preservation reproduction resolved.

### BUG-AST-01: T0 filtering and grammar fallbacks emit malformed source

- **File & location:** src/ast/pruner.ts:173-173; src/ast/pruner.ts:180-190; src/ast/pruner.ts:263-287; src/ast/pruner.ts:237-237; src/ast/pruner.ts:196-196; src/ast/pruner.ts:118-118.
- **Root cause:** T0 selects individual declaration-start lines and loses closing braces/members. Tree-sitter JavaScript class methods are replaced by bodyless semicolon declarations. The Go fallback chooses the first brace, including a generic constraint brace. No output parse check protects these paths. Empty-output fallback also reports token counts for the empty candidate, and cache keys do not distinguish initialized grammar mode.
- **Trigger:**

~~~text
T0 on a multiline interface/class yields "export interface User {
export class Account {". JavaScript Account methods become constructor(); deposit(amount);. Go func foo[T interface { Name() string }](x T) string is cut at the constraint brace.
~~~

- **Impact:** Malformed context can reach /pack, diff previews and downstream compiler consumers. Metrics can report savings for text that was actually restored.
- **Exact remediation:** Use complete T1 syntax for T0, retain complete class declarations, reject erroneous grammar roots, preserve source when no validated grammar is available, recount fallback text, and separate grammar/fallback cache keys. The patch deliberately reduces pruning for unsupported grammars. [Complete before/after code](REMEDIATION.md#bug-ast-01).
- **Verification:** BUG-AST-01/03/04 probes: TypeScript parse diagnostics, Go truncation and vm.Script JavaScript parsing all resolved.

### BUG-AST-02: Tree shaker removes reachable helpers, re-exports and dynamic initialization

- **File & location:** src/ast/treeShaker.ts:129-196.
- **Root cause:** The shaker splits on blank lines, extracts one declaration name per block, and tests only the caller-provided root set. There is no transitive dependency closure or side-effect analysis. Unknown non-comment blocks are dropped.
- **Trigger:**

~~~text
Keep target() calling helper(); a separately declared helper(), export * from "./contracts", and const sideEffect=import("./register") are all removed.
~~~

- **Impact:** The retained module references absent dependencies and loses registration side effects or API exports. Multiple declarations in one blank-line block and inheritance have the same underlying problem.
- **Exact remediation:** Return the complete module until an actual language-aware symbol graph establishes safe closure. This patch also ensures token counts describe the returned text. [Complete before/after code](REMEDIATION.md#bug-ast-02).
- **Verification:** Helper/re-export/dynamic-import reproduction resolved.

### BUG-MEM-01: AST cache admits over-budget entries and exposes mutable retained values

- **File & location:** src/cache/blobAstCache.ts:115-115; src/cache/blobAstCache.ts:140-141; src/cache/blobAstCache.ts:111-111.
- **Root cause:** Eviction stops when the cache is empty even if the incoming entry itself exceeds the byte limit. UTF-8 payload length underestimates UTF-16 string storage; stored/returned result objects can be mutated outside the cache.
- **Trigger:**

~~~text
A cache configured for 1,024 bytes accepts a 4,000-character skeleton and reports 4,256 used bytes.
~~~

- **Impact:** The advertised cache ceiling fails for a single entry; caller mutation can make accounting and cached content diverge.
- **Exact remediation:** Reject oversized entries before insertion, conservatively account strings and keys, and copy result objects on insert/read. The figure remains an estimate of retained data, not a hard V8 RSS guarantee. [Complete before/after code](REMEDIATION.md#bug-mem-01).
- **Verification:** Oversized-entry reproduction resolved.

### BUG-MEM-02: Inverted index leaks document slots on replacement

- **File & location:** src/search/invertedIndex.ts:28-28; src/search/invertedIndex.ts:89-90; src/search/invertedIndex.ts:158-158; src/search/invertedIndex.ts:316-316.
- **Root cause:** removeDocument blanks a slot but addDocument always appends a new slot. Typed-array capacity grows with lifetime update count rather than active document count.
- **Trigger:**

~~~text
Replace the same document 40,000 times: one live document retains 40,000 ID slots and a score buffer exceeding 512 KiB.
~~~

- **Impact:** Long editing sessions retain ever-growing arrays despite a stable repository size.
- **Exact remediation:** Maintain and reuse a free-slot list; clear old scores and reset free slots on clear(). [Complete before/after code](REMEDIATION.md#bug-mem-02).
- **Verification:** 40,000 replacements retain one slot in the overlay.

### BUG-MEM-03: Legacy RAM warming duplicates unaccounted symbol records

- **File & location:** src/engine/ramManager.ts:140-140; src/engine/ramManager.ts:174-174; src/engine/ramManager.ts:343-343; src/engine/ramManager.ts:427-427; src/engine/ramManager.ts:431-431; src/engine/ramManager.ts:425-425; src/engine/ramManager.ts:426-426.
- **Root cause:** Warming appends symbols every time without replacing the per-file records and without charging their strings/sets to usedBytes. Eviction ignores symbols. Clearing the turn registry under pressure does not subtract its bytes.
- **Trigger:**

~~~text
Warm one file twice: symbolsIndexed doubles from 2 to 4 while usedBytes stays at 390. Repeated warming can grow well beyond the stated budget.
~~~

- **Impact:** The component violates its memory ceiling and returns duplicate search results. Production uses the newer workspace index for warming; this older component remains reachable for turn-cache functions, so the warming leak is a component-level exposure.
- **Exact remediation:** Reset/re-account symbols for a warm pass, bound admissions, charge symbol strings/terms, evict symbols when necessary, and subtract turn-registry allocations when cleared. [Complete before/after code](REMEDIATION.md#bug-mem-03).
- **Verification:** Repeated-warm reproduction resolved.

### BUG-COMP-01: Head/tail masking drops failures in the middle of output

- **File & location:** src/engine/agenticCompactor.ts:105-116; src/engine/agenticCompactor.ts:118-151.
- **Root cause:** maskHeadTail retains only positional windows. Test-output detection uses that function, and build-output detection replaces the entire output without extracting failures.
- **Trigger:**

~~~text
Twenty ok lines, followed by panic: database corruption, an app stack frame and exit code: 1, then twenty more ok lines lose all three failure lines.
~~~

- **Impact:** An LLM can see apparent successful output and lose the actual error needed for diagnosis.
- **Exact remediation:** Preserve these observations in full until a provenance/evidence policy establishes which lines are optional. Selecting only regex-matched error lines cannot prove all causal context is kept. [Complete before/after code](REMEDIATION.md#bug-comp-01).
- **Verification:** Middle-of-output panic/exit reproduction resolved.

### BUG-IDX-01: External filesystem edits and closed buffers are not reconciled

- **File & location:** src/extension.ts:228-228.
- **Root cause:** Only editor/FileOperation events are registered. There is no createFileSystemWatcher or onDidCloseTextDocument reconciliation. ensureInitialized returns any nonempty snapshot without checking disk changes.
- **Trigger:**

~~~text
Index a.ts, modify it with fs.writeFileSync or git checkout, then ensureInitialized: generation stays unchanged. New files remain undiscovered; a closed discarded buffer can remain indexed.
~~~

- **Impact:** Search/maps become stale. Exact rehydration rejects stale hashes, which prevents one form of wrong-text emission but causes persistent retrieval gaps rather than rebuilding the index.
- **Exact remediation:** Register owned filesystem create/change/delete listeners and close-document reconciliation, invalidate response entries, and rebuild ignore policy when its files change. [Complete before/after code](REMEDIATION.md#bug-idx-01).
- **Verification:** Baseline disk-edit reproduction; overlay probe simulates the newly registered filesystem callback. Native VS Code event delivery was not exercised.

### BUG-IDX-02: An in-flight read publishes after disposal

- **File & location:** src/workspace/workspaceIndex.ts:533-533; src/workspace/workspaceIndex.ts:537-537; src/workspace/workspaceIndex.ts:357-357; src/workspace/workspaceIndex.ts:400-400.
- **Root cause:** dispose increments the epoch, but upsertIdentified checks only the per-file sequence after awaiting disk I/O. Its publication is not guarded by the captured epoch/trust.
- **Trigger:**

~~~text
Suspend fs.promises.readFile during upsert, dispose the index, then release the read: snapshot generation still advances.
~~~

- **Impact:** Disposed/root-replaced request work can publish retained state after its owner has ended.
- **Exact remediation:** Capture the operation epoch before reading and require the same epoch and current trust before publication. [Complete before/after code](REMEDIATION.md#bug-idx-02).
- **Verification:** Deterministically suspended I/O reproduction resolved.

### BUG-LIFE-01: Tree-sitter parser allocation has no owner disposal

- **File & location:** src/ast/pruner.ts:96-96; src/extension.ts:120-120.
- **Root cause:** Individual syntax trees are deleted in finally, but the persistent Parser instance is never deleted and the engine is not registered as a disposable. Failed initialization can also retain a parser.
- **Trigger:**

~~~text
Initialize an engine against packaged grammars and deactivate/recreate its owner: syntax-tree cleanup runs per parse, but no parser.delete exists in the original lifecycle.
~~~

- **Impact:** WASM parser allocations remain unmanaged during repeated owner lifecycles and initialization failures.
- **Exact remediation:** Add engine disposal, register it with context.subscriptions and also clean up any allocation that finishes initialization after disposal. [Complete before/after code](REMEDIATION.md#bug-life-01).
- **Verification:** Source-level lifecycle finding; proposed code type-checks. Repeated real extension-host heap profiling remains outstanding.

### BUG-REGEX-01: Multiple synchronous regex scans show quadratic retry behavior

- **File & location:** src/ast/systemDependenceGraph.ts:59-59; src/ast/systemDependenceGraph.ts:65-65; src/compression/conservativePathCompressor.ts:67-67; src/engine/imageRightsizer.ts:46-46; src/engine/localSlmBrain.ts:242-242; src/governor/inlineEvidenceClassifier.ts:54-54; src/governor/inlineEvidenceClassifier.ts:57-57; src/governor/inlineEvidenceClassifier.ts:67-67; src/governor/inlineEvidenceClassifier.ts:69-69; src/governor/inlineEvidenceClassifier.ts:70-70; src/governor/inlineEvidenceClassifier.ts:72-72; src/history/contextEpoch.ts:224-224; src/memory/projectMemory.ts:188-188; src/memory/projectMemory.ts:206-206; src/retrieval/structuredPreservation.ts:26-26; src/security/sanitizer.ts:183-183; src/security/sanitizer.ts:246-246.
- **Root cause:** Unanchored greedy path/identifier spans retry from each character; multiline ^/newline alternatives combined with \s* repeatedly consume remaining blank lines. This is polynomial ReDoS even without a textbook nested (a+)+.
- **Trigger:**

~~~text
Test each recorded pattern on the corresponding seed repeated to 4,096 and 16,384 characters plus !. The suspected sites exceed 30 ms at the larger size and grow by more than 8x for 4x input. For example the SDG suffix matcher grows from roughly 5.8 ms to 87.6 ms.
~~~

- **Impact:** These operations run synchronously, so large prompts, path-like text and whitespace can delay the extension host. Request payload validation occurs after several scans.
- **Exact remediation:** Use non-retrying token starts, horizontal whitespace for line-oriented recognizers, bounded ambiguous fields, and remove the unsafe normalizer. Exact replacement patterns are included. Time measurements are evidence for these payload families, not a formal all-regex proof. [Complete before/after code](REMEDIATION.md#bug-regex-01).
- **Verification:** Isolated worker sweep; all 950 regex sites inventoried, 933 literals exercised before deduplication.

## MEDIUM

### BUG-GOV-01: Governor decisions depend on time and share mutable policy arrays

- **File & location:** src/governor/contextGovernor.ts:62-62; src/governor/evidencePolicy.ts:122-124.
- **Root cause:** Date.now appears in a supposedly deterministic decision. requiredEvidence is the policy singleton array, so mutations of one decision affect later calls.
- **Trigger:**

~~~text
Evaluate identical input with clocks 100 and 200: decisions differ. Set first.requiredEvidence.length=0: the next decision has no requirements.
~~~

- **Impact:** Deep equality/replay/cache keys are unstable, and callers can contaminate subsequent policy state.
- **Exact remediation:** Keep telemetry time outside the decision (the compatibility field becomes constant zero) and return independently copied requirement records. [Complete before/after code](REMEDIATION.md#bug-gov-01).
- **Verification:** Clock and cross-call mutation probes resolved.

### BUG-LIMIT-01: Circuit-breaker trip is advisory and NaN poisons velocity history

- **File & location:** src/metrics/circuitBreaker.ts:45-45; src/proxy/chatParticipant.ts:894-896.
- **Root cause:** evaluateTurn is synchronous and records before testing, so no asynchronous counter race exists in this method. The defect is lack of numeric validation and a caller that displays a trip warning but continues dispatch.
- **Trigger:**

~~~text
evaluateTurn(NaN,"a"), then evaluateTurn(100000,"b") on a 50-token limiter returns tripped:false. A normal velocity trip also does not return from the chat handler.
~~~

- **Impact:** The claimed hard pause can be bypassed or never enacted.
- **Exact remediation:** Reject nonfinite/negative accounting and stop the handler with a failed compilation on any trip. This limits that chat participant; it is not a global limiter for every provider surface. [Complete before/after code](REMEDIATION.md#bug-limit-01).
- **Verification:** NaN reproduction resolved; caller return audited statically.

### BUG-LOG-01: Diagnostic exports retain POSIX paths and unsanitized component labels

- **File & location:** src/security/anonymizedLogger.ts:157-157; src/security/anonymizedLogger.ts:133-134; src/security/anonymizedLogger.ts:185-186; src/security/anonymizedLogger.ts:146-146; src/security/anonymizedLogger.ts:218-218; src/security/anonymizedLogger.ts:248-248.
- **Root cause:** Path redaction handles home paths and selected Windows roots but misses /srv and other POSIX roots. component is stored and rendered verbatim. Entry count is bounded but message size is not.
- **Trigger:**

~~~text
sanitize("at load (/srv/private-customer/service.ts:42:1)") returns the private path unchanged.
~~~

- **Impact:** Local exports can disclose project/customer identifiers despite the printed claim of no file paths; large messages also defeat the spirit of a bounded log.
- **Exact remediation:** Bound strings, sanitize component labels, and scrub POSIX/UNC paths. Absolute privacy guarantees should be removed; the supplied patch covers demonstrated paths but does not prove universal PII detection. [Complete before/after code](REMEDIATION.md#bug-log-01).
- **Verification:** POSIX-path reproduction resolved.

### BUG-SCRATCH-01: Valid JSON with an invalid scratchpad shape crashes compaction

- **File & location:** src/engine/scratchpadManager.ts:47-72.
- **Root cause:** JSON.parse output is returned as ScratchpadState without structural validation. Consumers dereference arrays and activeGoal. There is no input-size bound.
- **Trigger:**

~~~text
Write null to .tokenopt/scratchpad.json, then call generatePromptDigest(readState()). It throws a TypeError.
~~~

- **Impact:** The component fails instead of recovering from a damaged/user-edited state file. ScratchpadManager is not an active production-bundle import in this snapshot.
- **Exact remediation:** Bound the read and validate every field/list, returning a deterministic empty state on malformed data. Atomic writes, explicit durability/error reporting and parent-directory symlink policy are further hardening work, not covered by this patch. [Complete before/after code](REMEDIATION.md#bug-scratch-01).
- **Verification:** Malformed-shape reproduction resolved.

### BUG-CACHE-03: Cache eligibility uses wrong model thresholds and drops model identity

- **File & location:** src/cache/providerCapabilities.ts:29-30; src/cache/providerCapabilities.ts:17-18; src/cache/providerCapabilities.ts:102-115; src/engine/pipelineOrchestrator.ts:1436-1436.
- **Root cause:** Both Sonnet 3.7 and Haiku 3.5 are configured at 512 tokens. Unknown Anthropic models inherit Sonnet. The orchestrator constructs a model profile from the provider name and omits targetModel from aligner options.
- **Trigger:**

~~~text
resolve("claude-3-5-haiku","anthropic") returns minCacheableTokens:512; a 600-token prefix is treated as eligible even though the documented Haiku minimum is 2,048.
~~~

- **Impact:** Eligibility/economics diagnostics overstate cache usefulness. Local token estimates are not authoritative provider counts, and no rounding helper can guarantee a hit.
- **Exact remediation:** Correct the known thresholds, propagate model identity, and treat unknown thresholds as unavailable. Provider cache usage must remain the source of truth for hits. [Complete before/after code](REMEDIATION.md#bug-cache-03).
- **Verification:** Registry reproduction resolved; external source cited in cache section.

### BUG-BUILD-01: tsc emits nonproduction evaluator modules into out/

- **File & location:** tsconfig.json:1-23.
- **Root cause:** The include glob covers every src file, including nonproduction corpora, mutation/network auditors and profilers, even when they are unreachable from extension.ts.
- **Trigger:**

~~~text
npm run compile produces eleven out/evaluation/*.js files, ten of which are evaluation tooling rather than the production preservation gate.
~~~

- **Impact:** The stated clean out/ build isolation invariant fails. This is not a VSIX leak: out/ is excluded and only the preservation gate is reachable in the bundle.
- **Exact remediation:** Exclude evaluator root files from the production TS program; imported preservationGate remains included. Use a clean output directory when checking this change, because tsc does not delete old outputs. The patch does not relocate historical evaluation sources out of src/. [Complete before/after code](REMEDIATION.md#bug-build-01).
- **Verification:** Fresh out/ inventory and esbuild metafile corroborate the distinction.

## LOW / CODE SMELL

### BUG-EMBED-01: Structural embedding regexes contain backspace characters instead of word boundaries

- **File & location:** src/search/embeddingProvider.ts:246-246; src/search/embeddingProvider.ts:247-247; src/search/embeddingProvider.ts:248-248.
- **Root cause:** The three literals contain U+0008 characters around keyword groups. They therefore seek actual backspace bytes instead of JavaScript regex word boundaries.
- **Trigger:**

~~~text
Normal source containing if, function and async has zero matches for the corresponding keyword features.
~~~

- **Impact:** Structural vectors lose branching/declaration/asynchrony features and retrieval quality suffers.
- **Exact remediation:** Replace the literal control characters with the source escape \b in each regex. [Complete before/after code](REMEDIATION.md#bug-embed-01).
- **Verification:** Byte-level source inspection; patched expressions type-check.

## Governor determinism, intent and sequencing

The governor and evidence gate are synchronous; the orchestrator awaits the intent stage and does not return before the gate call. No missing-await race was found there. The failures are the gate's conditions, stale evidence inputs and post-gate transforms. The governor itself does no file I/O; its regex work grows with input length and has no explicit prompt-size bound.

Intent extraction is a priority classifier rather than a semantic parser. Empty input becomes completion at confidence 0.70. “fix test but don't modify code” becomes debug because debug wins; that conservatively preserves more code and is not, by itself, a proven dangerous misclassification. Negation and non-English intent are not modelled, and ASCII word boundaries are not multilingual tokenization. Confidence values are constants rather than calibrated probabilities. Environmental signals would override lexical intent, but BUG-GOV-03 disconnects them in production.

## AST and range review

Only TypeScript, JavaScript and Python WASM grammars are packaged; TSX shares the TypeScript grammar and other languages use the handwritten fallback. Failed initialization falls back without an independently verified syntax result. Nested closures/arrows, decorators, generic constraints and macros require grammar-aware boundaries; the Go and JavaScript failures demonstrate that lexical fallbacks are not equivalent.

semanticChunk uses 1-based inclusive line numbers and UTF-16 string offsets consistently: splitting only on LF leaves a CR inside each CRLF line and running offsets account for it. Multibyte UTF-8 characters do not alone cause an off-by-one because slicing also uses JS string offsets. The confirmed error is structural completeness (BUG-AST-05), not byte/character offset conversion.

## Event listeners, watchers, memory and event-loop work

Extension-level document/configuration/file-operation listeners and the process uncaught-exception hook are registered in subscriptions. There is no original FileSystemWatcher to leak; the defect is its absence and the missing close-document reconciliation. Workspace pending timers are cleared on disposal and worker/scheduler owners are registered. Syntax trees are deleted in finally, but their parser owner is not. Details and exact callsites for all observed operations are in [OPERATIONS.md](OPERATIONS.md).

The production index uses async stat/readFile and yields between groups, but parsing, hashing, tokenization and snapshot publication remain synchronous. ExactSourceReader performs up to 24 synchronous reads capped by a pre-read stat at 2 MiB each; this is bounded by intended data size but not by storage latency, and a stat/read growth race can exceed that bound. TokenIgnoreFilter and ignore-version hashing synchronously read ignore files; legacy RAM/repo-map traversal uses readdirSync/readFileSync. A count limit on matching files does not bound traversal of directories containing no eligible files. These are event-loop exposure paths, not measured proof of an actual VS Code crash in this audit.

BlobAstCache is insertion-order LRU and evicts oldest keys; its oversize admission is defective. RamContextManager sorts entries by timestamp (ties are possible), ignores symbol memory and misaccounts cleared turn entries. The newer workspace index estimates memory rather than enforcing total extension-host RSS; immutable snapshot ancestry, active snapshot pins, blob cache, vector/index buffers and string/object overhead are separate retained allocations. No claim of a hard aggregate RAM ceiling is supported.

The real inverted BM25 index guards empty queries/documents and uses avgLength || 1 and denominator || 1, so ordinary empty-token input does not divide by zero. Its confirmed issue is unreused slots. Arbitrary invalid numeric frequencies/lengths are not generally validated. Rename/delete/editor events have sequence checks; external changes lack notifications, and a post-dispose upsert can still publish. Hash verification rejects stale exact source; it does not discover new files or make stale ranking current.

## Cache and schema conclusions

Anthropic caching uses content-block breakpoints and model-specific minimum lengths, not a universal requirement to round every breakpoint to a 1,024-token multiple. The current official table lists Haiku 3.5 at 2,048 and several Opus models at 4,096; shorter requests can silently remain uncached. Local token estimates cannot guarantee provider eligibility. [Anthropic prompt-caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

`alignToBlockBoundary` is a simple ceil(count/blockSize) helper and does not place Anthropic markers; blockSize=0 would yield invalid arithmetic but no production caller was found. Schema compression preserves ordinary minimum/format scalar keys, but corrupts enums/additionalProperties and property-map semantics as reproduced. Scratchpad digest field ordering is explicit and excludes lastUpdated, so a disk timestamp alone is not a demonstrated prefix bug; its storage JSON is not canonicalized.

## Regex inventory and ReDoS conclusions

[REGEX-INVENTORY.md](REGEX-INVENTORY.md) and [regex-inventory.csv](regex-inventory.csv) list every 950 extracted first-party regex site, with source location, source spelling, assessment and remediation. `regex-probes.json` contains per-seed timings. Dynamic constructors are reviewed separately; source-generated regular expressions cannot all be proven safe by enumerating literals. “Safe within tested scope” means the bounded corpus found no superlinear behavior, not a mathematical safety proof. Unresolved dynamic cases are explicitly identified rather than falsely marked safe.

The promptMinifier phrase substitutions are fixed literals; the specified intent patterns have bounded/fixed-word structure and no confirmed catastrophic case in these probes. The sanitizer's PEM/assignment forms still deserve special care with repeated starts; the proposed replacement removes them from the scanning path. The confirmed exponential case is ignore glob compilation, and the confirmed polynomial family is catalogued under BUG-REGEX-01.

## Packaging and isolation conclusions

`.vscodeignore` excludes validation/**, tests/**, scripts/**, src/**, out/**, out_test/**, node_modules via --no-dependencies, and source maps. package.json points to dist/extension.js. esbuild starts at src/extension.ts, bundles runtime dependencies and externalizes vscode. The freshly inspected VSIX has **zero development-path entries** and the metafile has **zero validation/ imports**. The sole reachable src/evaluation file, preservationGate.ts, is a production correctness gate and is not itself a benchmark/evaluator contamination.

TSC's broad root glob nevertheless emits the nonproduction evaluation files into out/ (BUG-BUILD-01). The bundle build has no dedicated import-isolation plugin, so current cleanliness is verified evidence rather than an enforced future invariant. The shipped tokonomics.code-workspace is unnecessary development metadata, but it is not a validation runner. This audit does not claim a clean build-output tree merely because the VSIX is clean.
