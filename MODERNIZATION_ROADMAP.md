# Tokonomics Modernization Roadmap

## Purpose

This document is the implementation plan for turning Tokonomics into a privacy-safe,
measurable, provider-correct VS Code context compiler. The work is intentionally
incremental. Each phase is implemented, audited, covered by automated tests, and
committed independently. Work on a later phase starts only after the repository owner
reviews and explicitly approves the preceding phase.

## Delivery protocol

For every phase:

1. Re-audit the affected production paths and record the baseline.
2. Write or update the design contract before changing behavior.
3. Implement the smallest coherent migration behind safe defaults or feature flags.
4. Add unit, property, integration, adversarial, and artifact tests appropriate to the risk.
5. Run TypeScript compilation, the complete existing test suite, phase-specific tests,
   packaging checks, and relevant performance/security checks.
6. Inspect the diff for unrelated changes, generated artifacts, secrets, and stale claims.
7. Create one or more local commits with focused messages.
8. Publish the commit hashes, test evidence, limitations, and rollback instructions.
9. Stop. The next phase requires explicit owner approval.

No phase may silently weaken a safety invariant to make a test pass. A failed or
unmeasured gate is reported as such.

## Target architecture

```text
VS Code chat participant / language-model provider / commands
                              |
                     Request Boundary
       trust | consent | source policy | sanitization | cancellation
                              |
                     Context Compiler
       intent -> evidence policy -> retrieval -> typed Context IR
                              |
              global budget and context selector
                              |
                    safe prompt assembler
                              |
                      provider adapter

Workspace snapshots -> incremental index -> retrieval
Request lifecycle -> append-only ledger -> dashboard and diagnostics
```

## Architectural invariants

- No workspace content crosses the request boundary without trust, source-policy,
  and sanitization checks.
- Every VS Code entry point uses the same compiler.
- Roles, tool calls, tool results, data parts, images, and streaming semantics are
  preserved or explicitly rejected.
- One stable request ID owns one lifecycle and one set of metrics.
- Cancellation reaches every stage and prevents caching or successful completion.
- Token budgets cover the complete rendered provider payload.
- Every context block has provenance, freshness, token cost, utility, dependencies,
  sensitivity, and a render location.
- Retrieval observes one immutable workspace snapshot.
- Measured, estimated, projected, and provider-reconciled values are never conflated.
- Experimental features are disabled until production-reachable and independently
  benchmark-proven.

## Phase status

| Phase | Name | State | Approval required to start |
|---:|---|---|---|
| 0 | Measurement truth and release safety | Approved and complete | Granted |
| 1 | Privacy, security, trust, and packaging | Approved and complete | Granted |
| 2 | Canonical compiler and protocol-safe adapters | Approved and complete | Granted |
| 3 | Versioned incremental workspace intelligence | Approved and complete | Granted |
| 4 | Evidence-aware retrieval and preservation | Approved and complete | Granted |
| 5 | Global token budgeting and selection | Approved and complete | Granted |
| 6 | Correct caching and token economics | Implemented; pending owner review | Granted |
| 7 | Authoritative observability and dashboard | Blocked on approval | Yes |
| 8 | Performance, concurrency, and resilience | Blocked on approval | Yes |
| 9 | Integration certification and release hardening | Blocked on approval | Yes |
| 10 | Evaluated state-of-the-art experiments | Blocked on approval | Yes |

## Phase 0 - Measurement truth and release safety

### Objective

Prevent synthetic, predetermined, stale, or incomplete results from being presented as
release certification. Establish reproducible metadata and a registry for public claims.

### Work items

- Replace pre-populated certification decisions and fixed pass counts with outcomes
  derived from commands executed in the current run.
- Record current commit, dirty-tree state, package version, lockfile version, dataset
  hash, platform, Node version, artifact hash, duration, and exact gate commands.
- Classify every material public claim as verified, qualified, experimental,
  unverified, or retired, with evidence and review dates.
- Clearly label controlled synthetic benchmarks. Predetermined corpus patches may test
  the harness but may not establish model task success or production uplift.
- Mark legacy reports as historical and non-authoritative.
- Add automated integrity tests for metadata, claim evidence, version consistency,
  dynamic Git provenance, and absence of pre-certified outcomes.
- Establish artifact and Extension Host certification as required future gates rather
  than implying they already pass.

### Exit criteria

- Certification starts in an unknown state and derives every gate outcome from a run.
- A dirty tree or missing required gate cannot receive a release-ready decision.
- No fixed commit SHA, fixed suite count, or unconditional worldwide-production status
  remains in the active certification entry points.
- Public benchmark numbers are explicitly classified and linked to their limitations.
- Package and lockfile root metadata agree.
- Automated Phase 0 integrity tests and the full existing suite pass.

## Phase 1 - Privacy, security, trust, and packaging

### Objective

Create a fail-closed egress boundary and make the installed VSIX match its advertised
privacy and parser behavior.

### Work items

- Add a single request boundary for workspace trust, consent, source policy,
  sanitization, path anonymization, payload limits, and cancellation.
- Disable workspace reads, indexing, warming, memory, and automatic active-file
  attachment in untrusted workspaces.
- Sanitize the final assembled payload, including history, diagnostics, terminal text,
  tool parts, data metadata, filenames, and every fallback.
- Respect ignore rules, sensitive filenames, binary detection, size limits, workspace
  containment, and symlink boundaries.
- Package and load every advertised parser from the actual VSIX; fail packaging tests
  on silent AST fallback.
- Define local data retention, deletion, and diagnostic-log guarantees.
- Update vulnerable dependencies and regenerate consistent lock metadata.

### Exit criteria

- Secret canaries never reach a mock provider through any success or fallback path.
- Untrusted workspaces cause no workspace content reads or background warming.
- Absolute user paths do not enter provider payloads or diagnostics.
- Every advertised parser loads and parses a fixture from the packaged VSIX.

### Implementation record

- Added `ModelRequestBoundary` as the final hop for both cloud-model entry points. It
  fails closed on cancellation, untrusted workspace-derived data, cyclic/deep options,
  residual credential matches, and oversized payloads; it sanitizes nested string tool
  options and anonymizes workspace/home paths after context compilation.
- Added an explicit workspace context consent policy (`off`, `selection`, `referenced`,
  `automatic`) with the conservative `selection` default and unsaved buffers disabled.
- Declared limited Restricted Mode support and disabled file commands, workspace
  attachment, index watchers, RAM retrieval, and warming until workspace trust exists.
- Added canonical source checks for multi-root containment, realpath/symlink escape,
  `.gitignore`, `.tokenignore`, non-overridable sensitive names, binaries, and size.
- Replaced the optional/missing parser setup with pinned
  `@vscode/tree-sitter-wasm@0.3.1` assets and an actual parser initialization test.
- Added VSIX inspection to certification and closed all dependency-audit findings by
  updating VSCE and esbuild. The privacy/retention/deletion contract is recorded in
  `SECURITY_AND_PRIVACY.md`.
- Automated Phase 1 adversarial tests cover the request boundary, secrets, paths,
  trust, source policy, ignore precedence, payload limits, WASM validity, parser startup,
  and manifest defaults. The repository owner subsequently approved Phase 2.

## Phase 2 - Canonical compiler and protocol-safe adapters

### Objective

Remove divergent chat/provider behavior and use one request-scoped compiler.

### Work items

- Define canonical request, message-part, model, budget, evidence, decision, and result
  contracts.
- Refactor `PipelineOrchestrator` into the sole compiler; reduce `ContextAnalyzer` to a
  compatibility adapter.
- Route the chat participant, language-model provider, and applicable commands through
  the same compiler profiles.
- Preserve system/user/assistant roles, text, tool calls, tool results, data, images,
  streaming, usage, and unknown-part handling.
- Exclude Tokonomics itself from upstream model selection.
- Propagate a request-scoped cancellation signal through preprocessing, provider
  streaming, caching, history, and metrics.
- Use one request ID and lifecycle from ingress through cost reconciliation.

### Exit criteria

- Both model entry points produce equivalent compiled payloads.
- Protocol conformance tests prove that no supported part or role is dropped.
- Cancellation creates no completed metric, cache record, or partial success.
- Exactly one logical event exists per request.

### Implementation record

- Added a typed canonical protocol for roles, names, text, tool calls, tool results,
  and binary or textual data parts. Known VS Code parts round-trip without flattening;
  unknown input/output parts fail closed instead of being silently dropped.
- Added one `CanonicalRequestCompiler` over `PipelineOrchestrator` and injected that
  same compiler into the chat participant and language-model provider. Structured
  turns take a conservative byte-preserving pass-through path until later phases can
  optimize them without weakening tool/data semantics.
- Removed implicit system-to-user rewriting. The canonical contract can represent a
  system role, but the current VS Code language-model request API cannot; attempting
  to emit one therefore returns an explicit protocol error.
- Added a canonical final-egress adapter. It sanitizes text, textual data, tool inputs,
  and forwarded model/tool options, while preserving opaque binary data exactly and
  charging it against the outbound byte limit.
- Made request IDs stable from compilation through cost reconciliation and deferred
  traces, metrics, and event publication until upstream streaming completes. A
  cancellation or unsupported response part cannot commit successful side effects.
- Excluded Tokonomics-provided models from upstream selection to prevent recursion and
  raised the supported VS Code/API floor to 1.106, the first pinned API used here that
  includes `LanguageModelDataPart`.
- Added automated Phase 2 round-trip, fail-closed, structured pass-through, secret
  egress, binary-integrity, entry-point equivalence, streaming, lifecycle-ID, and
  early/late cancellation tests. The normative behavior and compatibility boundaries
  are recorded in `PROTOCOL_CONTRACT.md`.

The repository owner subsequently reviewed Phase 2 and explicitly approved Phase 3.

## Phase 3 - Versioned incremental workspace intelligence

### Objective

Make retrieval current, coherent, bounded, and scalable.

### Work items

- Introduce immutable workspace snapshots with file hashes, open-buffer versions, index
  generations, root identities, and ignore-policy versions.
- Use one canonical URI identity across absolute paths, relative paths, casing,
  separators, multi-root workspaces, unsaved buffers, renames, and deletes.
- Replace dirty markers with debounced, version-checked atomic index updates.
- Consolidate RAM, file-watch, repo-map, symbol, graph, LSP, and optional SCIP ownership
  behind one index facade.
- Replace traversal-order caps with priority-based lazy indexing.
- Account for strings, symbols, maps, sets, graph edges, parsers, temporary buffers, and
  retrieval caches in the RAM budget.

### Exit criteria

- Change/create/delete/rename events update search results without full rebuilds.
- Late work cannot overwrite newer document versions.
- Every request observes one snapshot generation.
- Memory stays within the configured envelope plus documented allocator tolerance.

### Implementation record

- Added one production `VersionedWorkspaceIndex` for file records, AST skeletons,
  symbols, reference edges, lexical search, and repository-map PageRank. Legacy RAM,
  file-watch, graph, SCIP, and LSP classes remain compatibility surfaces but no longer
  own the production model-entry retrieval state.
- Added canonical multi-root identities based on normalized real paths and stable root
  hashes. Relative-path collisions across roots remain distinct; nested roots prefer
  the most specific owner; symlink escapes and outside-root paths cannot be indexed.
- Added immutable request snapshots containing generation, root identities,
  ignore-policy version, source versions, content hashes, skeletons, symbols,
  references, and fully accounted estimated bytes. Runtime map/set views do not expose
  mutation methods, and compiler results record their captured generation.
- Replaced production dirty flags with per-file debounced create/change/save/delete and
  atomic rename updates. Per-key sequences and a rebuild epoch prevent late disk reads
  or obsolete background scans from overwriting newer buffers, deletes, root changes,
  trust changes, or ignore-policy rebuilds.
- Added deterministic priority admission and budget enforcement covering strings,
  keys, hashes, records, skeletons, symbol objects, signatures, term sets, reference
  edges, arrays, maps, sets, and root metadata. Repository maps and retrieval operate
  directly on a caller-pinned snapshot.
- Kept Phase 1 consent intact: snapshot capture does not authorize retrieval; automatic
  indexing/retrieval requires `workspaceContextMode=automatic`, while `/map` performs
  an explicit current rebuild when invoked under a conservative mode. Unsaved buffers
  enter the index only when the existing opt-in setting allows them.
- Added automated multi-root identity, runtime immutability, buffer version, incremental
  create/update/delete/rename, atomic rename, stale-read suppression, ignore rebuild,
  consent separation, request-generation coherence, PageRank budget, and memory-envelope
  tests. The normative design is recorded in `WORKSPACE_SNAPSHOT_CONTRACT.md`.

The repository owner subsequently reviewed Phase 3 and explicitly approved Phase 4.

## Phase 4 - Evidence-aware retrieval and preservation

### Objective

Optimize task success per token by selecting structured evidence.

### Work items

- Convert intent into required, optional, and forbidden evidence contracts.
- Produce candidates from lexical, symbol, AST, import/call graph, LSP,
  diagnostics, stack traces, tests, open editors, recent diffs, and repository rank.
- Fuse rankings deterministically and apply diversity control.
- Treat SDG slices as candidates gated by parser availability, confidence,
  dependency closure, and preservation checks.
- Replace keyword-only preservation with symbol/range/dependency/tool-pair evidence.
- Add progressive expansion and conservative fallback when sufficiency is uncertain.

### Exit criteria

- Critical-evidence recall reaches the agreed benchmark target.
- Task success is statistically non-inferior to unoptimized context.
- Inclusion and exclusion decisions are explainable and reproducible.

### Implementation record

- Added a deterministic evidence contract builder that maps the governor's task policy
  into applicable required, optional, and forbidden categories. Error evidence is
  required only when the request actually carries an error signal, and narrow tasks
  explicitly exclude broad history or generated-spec evidence.
- Added snapshot-bound candidate production for symbols, AST skeletons, reference
  edges, dependency definitions, tests, diagnostics, stack traces, opted-in editor
  buffers, request diffs, configuration files, and repository rank. Every candidate
  records its content hash, snapshot generation, source, file/range identity,
  dependencies, scores, mandatory state, and provenance.
- Added deterministic reciprocal-rank fusion, required-category-first selection,
  maximal-marginal-relevance diversity, staged direct/dependency/broad expansion, and
  explicit inclusion/exclusion reasons. Forbidden evidence cannot enter selection and
  repository-rank hints alone cannot satisfy a required-evidence obligation.
- Integrated retrieval into the canonical compiler boundary. Workspace reads still
  require explicit automatic-context consent, one request consumes only its pinned
  Phase 3 snapshot, and the selected bundle is rendered once with snapshot and content
  provenance. The previous chat-side RAM-slice append path has been removed.
- Connected the existing slice-confidence evaluator to production SDG slicing. Parser
  failure, reflection, dynamic dispatch/imports, FFI, dependency injection, callbacks,
  global mutation, or failed structured obligations retain the original lexical scope
  or full code rather than emitting an unsafe slice.
- Added a structured fail-closed preservation gate for message role/name/order,
  explicitly requested symbols and declarations, cited file ranges, diagnostics,
  dependencies, and textual tool-call pairs. Missing critical retrieval evidence or
  failed obligations restores the original request.
- Added automated tests covering evidence-policy applicability, critical-fact recall,
  deterministic decisions, multi-file diversity, forbidden evidence, conservative
  fallback, structured corruption, consent separation, rendered provenance, pinned
  snapshots, and adversarial dynamic slicing. The normative behavior is recorded in
  `EVIDENCE_RETRIEVAL_CONTRACT.md`.

The repository owner subsequently reviewed Phase 4 and explicitly approved Phase 5.

## Phase 5 - Global token budgeting and selection

### Objective

Make the selected Context IR exactly control the rendered prompt and total budget.

### Work items

- Give every IR block provenance, render location, token cost, utility, mandatory state,
  dependencies, conflicts, freshness, sensitivity, and transformation history.
- Budget system/user/history/tool/image/wrapper/evidence tokens plus output reserve and
  tokenizer safety margin.
- Select mandatory evidence first, close dependencies, then optimize optional utility
  under global constraints.
- Make the solver output authoritative; remove SDG or RAM bypasses.
- Add exact or error-bounded model tokenization.
- Count image, schema, cache-layout, and diff-output changes only when they alter the
  actual outgoing payload.

### Exit criteria

- Rendered payloads remain within budget tolerance.
- Solver assignments match rendered content exactly.
- Brute-force fixtures validate small-instance optimality.
- Mandatory evidence cannot be evicted.

### Implementation record

- Extended every generated Context IR resolution with normalized provenance, render
  location, mandatory state, minimum safe resolution, dependencies, conflicts,
  freshness, sensitivity, and transformation history. Token cost remains attached to
  the exact resolution text.
- Added a complete-payload budget plan covering message text and wrappers, structured
  tool calls/results, textual and opaque data parts, evidence wrappers, output reserve,
  a two-percent safety margin, and an explicit eight-percent tokenizer-estimation error
  allowance. Caller limits are capped by the selected model context window and are
  never silently raised.
- Added mandatory-first solver constraints and transitive dependency closure. Mandatory
  items cannot select `R_exclude` or a resolution below their declared minimum;
  missing dependencies, conflicting mandatory blocks, and infeasible minimums fail
  explicitly.
- Removed the remaining RAM/evidence bypass from the compiler solver. Safe code slices
  and evidence now render only from solver assignments, and every rendered assignment
  records its resolution, token count, and SHA-256 text hash for conformance auditing.
- Centralized evidence selection after text-pipeline transformation so compiler,
  hybrid, and legacy text paths share one global budget. Evidence wrappers and
  separators are charged before selection, with a final complete-payload recount and
  bounded retry if estimator composition creates an overflow.
- Added conservative accounting for canonical tool schemas, tool results, textual data,
  and binary/image parts. Structured protocol requests remain byte-preserving and are
  rejected when mandatory payload plus reserves cannot fit.
- Added automated exact-boundary, caller-limit, mandatory overflow, dependency closure,
  conflict, metadata completeness, structured-part accounting, deterministic rendering,
  assignment-hash conformance, mandatory-evidence, and DP-versus-brute-force optimality
  tests. The normative rules are recorded in `GLOBAL_BUDGET_CONTRACT.md`.

Phase 5 was approved when the repository owner explicitly requested the next phase.

## Phase 6 - Correct caching and token economics

### Objective

Prevent unsafe response reuse and report defensible provider-specific economics.

### Work items

- Fingerprint request, conversation, workspace, snapshot, evidence, model, tools,
  compiler configuration, policies, and extension version for exact caching.
- Disable approximate answer replay; optionally use prior entries only as retrieval hints.
- Exclude mutations, tools, partial streams, cancellation, failure, unresolved workspace
  state, and time-sensitive requests from caching.
- Maintain a versioned pricing catalog for input, output, cache writes, cache reads,
  currencies, dates, sources, aliases, and enterprise overrides.
- Separate cache eligibility, cache writes, and verified provider cache reads.
- Calculate net cost and reconcile actual provider usage into the original request.

### Exit criteria

- Adversarial tests produce zero false answer hits.
- Workspace changes invalidate every dependent exact response.
- Estimated and reconciled costs are visibly distinct and fixture-verified.

### Implementation record

- Replaced the FNV query/file key with a canonical SHA-256 fingerprint over the request,
  ordered conversation, complete versioned workspace snapshot, selected evidence,
  exact provider/model, tools, compiler configuration, policies, and extension version.
- Moved production response lookup after compilation and model selection, where all
  fingerprint inputs are known. Any indexed workspace generation or content change
  produces a miss, and explicit file invalidation removes every dependent entry.
- Removed approximate answer replay. Similar queries can expose response-free opaque
  hints only; they never expose answer text or increment cache-hit metrics.
- Added fail-closed exclusions for mutation, tool, partial-stream, cancellation,
  failure, unresolved-workspace, and time-sensitive cases. Only completed non-empty
  responses are stored.
- Added a pinned, versioned, source-attributed pricing catalog with provider/model
  aliases, currencies, effective dates, cache read/write/storage rates, and auditable
  enterprise overrides. Unknown live provider/model prices fail closed.
- Stopped counting prompt-cache eligibility as savings. Cache-read scenarios remain
  labelled projections, while only complete provider-reported usage can populate
  actual cost and verified cached-token fields.
- Added request-bound reconciliation that rejects unknown IDs, provider/model mismatch,
  incomplete usage, invalid cache counts, and duplicate reconciliation. The net-cost
  formula includes cache creation/read/storage, output, additional model calls, and
  optimization compute; economic losses remain negative rather than being hidden.
- Added adversarial fingerprint, unsafe-terminal-state, workspace invalidation,
  non-answer hint, catalog provenance/override, formula, usage parsing, mismatch,
  duplicate, unknown-price, and negative-savings tests. Normative rules are recorded
  in `CACHE_AND_COST_CONTRACT.md`.

Phase 7 remains blocked until the repository owner reviews this implementation and
explicitly approves the next phase.

## Phase 7 - Authoritative observability and dashboard

### Objective

Make every displayed value traceable to one real request lifecycle.

### Work items

- Use an append-only request ledger keyed by the canonical request ID.
- Record actual stage timing, token transitions, selections, cache state, fallback,
  cancellation, errors, and snapshot generation.
- Implement real session, local-day, rolling-seven-day, and lifetime windows.
- Generate UI contracts from the event schema and remove divergent fields.
- Display unavailable or projected values honestly; never invent reductions or CQ.
- Provide a privacy-safe decision trace for evidence, budget, redactions, cache, and cost.

### Exit criteria

- Each prompt increments aggregates exactly once.
- Window expiration and timezone tests pass.
- Dashboard totals reconcile with ledger totals.
- No placeholder values remain in user-visible metrics.

### Implementation status (2026-09-02)

Implemented locally. The extension now uses an immutable, persistent request ledger;
latest-record exactly-once projections; real activation-session, local-calendar-day,
rolling-168-hour, and retained-lifetime windows; explicit projected, reconciled, and
unavailable economics; verified cache-read accounting; terminal cancellation/error
records; and hash-only decision traces. Dashboard, status-bar, `/live`, `/stats`, local
history, and audit export consume the same canonical event contract. Fabricated empty
CQ, coverage, latency, chart, model, waterfall, cache, and cost values were removed.

The normative definitions and verification matrix are documented in
`PHASE_7_OBSERVABILITY_CONTRACT.md`. Automated Phase 7 tests cover exactly-once
reconciliation, immutable append semantics, local-midnight and rolling-window expiry,
unavailable values, cache/cost truth, privacy, and failure accounting.

Phase 8 remains blocked until the repository owner reviews this implementation and
explicitly approves the next phase.

## Phase 8 - Performance, concurrency, and resilience

### Objective

Protect the extension host and maintain predictable behavior under load and failure.

### Work items

- Keep activation registration-only and lazily load parsers/indexes after trust.
- Move parsing, large graph work, expensive ranking, inference, and images behind
  cancellable worker boundaries.
- Use bounded priority queues for foreground compilation, index updates, warming, and
  experiments.
- Remove mutable cross-request state; share only snapshots and bounded caches.
- Implement explicit safe fallbacks for parser, index, retrieval, sanitizer, worker,
  provider, tokenizer, and storage failures.
- Benchmark 100-, 1,000-, and 10,000-file workspaces and cancellation races.

### Exit criteria

- No unbounded queue or cache remains.
- Rapid edits converge to the newest state.
- Activation, compilation, update, memory, event-loop, and cancellation targets pass on
  documented hardware tiers.

## Phase 9 - Integration certification and release hardening

### Objective

Certify the exact artifact installed by users rather than mocked source behavior.

### Work items

- Test minimum, stable, and pre-release VS Code Extension Hosts.
- Cover registration, commands, configuration, trust, multi-root, cancellation,
  streaming, providers, chat, and webviews.
- Add optimized-versus-raw differential task tests and independent oracles.
- Add adversarial prompt, secret, binary, path, Unicode, size, race, cache, and corrupted
  state cases.
- Install and inspect the exact VSIX, including parser loading and absence of private or
  development artifacts.
- Produce SBOM/provenance, compatibility evidence, staged rollout, feature kill switches,
  and rehearsed rollback.

### Exit criteria

- Clean-room VSIX tests pass for supported VS Code versions.
- Certification reports derive solely from the current artifact and independent evidence.
- Marketplace claims match generated evidence and confidence intervals.

## Phase 10 - Evaluated state-of-the-art experiments

### Objective

Promote advanced techniques only when they improve real task success or net cost.

### Candidate experiments

- Evidence-aware local learned ranking
- Cross-turn delta context with snapshot-safe hashes
- Provider-specific cache layout
- Confidence-driven progressive compilation
- Optional bounded local semantic retrieval
- Inspectable, opt-in project memory
- Task-aware vision transformation with readability evaluation
- Adaptive budget allocation by expected quality, total cost, latency, and confidence

### Promotion criteria

- Production reachability is proven.
- Privacy and resource use do not expand without explicit consent.
- Independent benchmarks show statistically meaningful uplift.
- Failure has a deterministic, conservative fallback.
- The feature can be disabled independently.

## Program definition of done

Tokonomics may make state-of-the-art production claims only after the installed VSIX is
proven to preserve protocol semantics, protect untrusted and sensitive workspace data,
meet global token budgets, retain critical evidence, avoid unsafe cache hits, report
reconciled economics honestly, remain within latency and memory envelopes, and pass
artifact-level integration tests with reproducible evidence from the current commit.
