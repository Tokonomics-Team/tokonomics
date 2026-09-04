# Tokonomics Phases 11-19: Remaining Components Production-Wiring Plan

## Document status

- Scope: production integration of currently standalone or incompletely wired components.
- State: plan only; no component is promoted by this document.
- Delivery rule: implement, audit, test, and locally commit exactly one phase at a time.
- Approval rule: work on the following phase starts only after the repository owner verifies
  the implementation evidence and explicitly approves continuation.
- Distribution: internal engineering document; excluded from the VSIX package.

## 1. Current savings baseline

The current certified artifact is Tokonomics 6.0.0 built from source commit
`1fcc71872b4021d59fce80f9b0284119a399040d`.

The controlled eight-language fixtures report token reductions from 78.5% to 82.0%, with
an unweighted mean of approximately 80.3%. This is the most useful current engineering
baseline for regression comparisons, but it is not evidence of production savings.

A separate aggressive synthetic transformation sample reports 11,512 to 101 input tokens,
or 99.1% reduction. It must not be used as a general product estimate because it represents
a specially constructed transformation sample rather than live provider workloads.

The same synthetic report currently emits 104.1% effective cost reduction after modeled
cache discounts. A billed cost reduction above 100% is not a valid customer-facing savings
claim. Phase 11 must retire or correct that calculation and any layer status that says a
standalone component is enabled without production-reachability evidence.

For planning purposes:

- Current controlled-fixture token-reduction estimate: approximately 80.3%.
- Current same-model, input-token-only cost-reduction estimate: approximately 80.3% before
  output-token cost, cache writes/reads, provider discounts, and model-routing changes.
- Current live dollar estimate: request-specific and available only when the selected model
  has versioned pricing; it becomes reconciled only when verified provider usage is returned.
- No percentage in this document may be added to another phase's percentage. Layer effects
  overlap, and only end-to-end ablation can establish incremental value.

## 2. Non-negotiable architecture rules

Every phase must preserve these rules:

1. All model-bound data crosses the canonical request compiler, trust boundary, source
   policy, secret sanitizer, global budget, protocol guard, preservation gate, and evidence
   safety gate.
2. Retrieval and intelligence layers observe one immutable versioned workspace snapshot.
3. No component reads untrusted workspace, terminal, Git, diagnostics, tests, memory, or
   model files without an explicit capability and policy decision.
4. Every new evidence block carries source identity, snapshot/version, freshness, token cost,
   utility, sensitivity, dependencies, and render location.
5. Optional or learned components have deterministic fallbacks and independent kill switches.
6. Cancellation and deadlines propagate through every asynchronous stage.
7. Background work is bounded by queues, memory ceilings, index quotas, and disposal hooks.
8. A component cannot be called enabled until an installed-VSIX test proves production
   reachability through every supported entry point.
9. Estimated, projected, reconciled, synthetic, and provider-billed values remain distinct.
10. Workspace source, terminal text, prompts, embeddings, and memory content remain local
    unless the canonical provider request explicitly includes approved evidence.

## 3. Standard delivery protocol for each phase

Each phase follows the same sequence:

1. Record the clean baseline commit, runtime call graph, feature-flag state, metrics, and known
   failure modes.
2. Write the phase contract and threat model before changing runtime behavior.
3. Add a production-reachability test that fails until the intended component is invoked.
4. Implement behind an independent kill switch, conservative default, timeout, cancellation,
   and deterministic fallback.
5. Add structured, content-free telemetry for attempted, completed, timed-out, rejected,
   fallback, and contribution outcomes.
6. Add unit, property, differential, integration, adversarial, concurrency, memory, privacy,
   cancellation, and installed-VSIX tests appropriate to the component.
7. Run ablation against the unchanged baseline on frozen train, validation, and holdout sets.
8. Reject promotion if critical-evidence recall or protocol fidelity regresses, even when token
   reduction improves.
9. Run compilation, all repository tests, clean-room audit, package inspection, dependency
   audit, and supported Extension Host matrix.
10. Inspect the diff, generated evidence, public disclosure boundary, and artifact hashes.
11. Create focused local source and evidence commits; report hashes, limits, and rollback.
12. Stop and wait for explicit approval.

## 4. Cross-phase measurement contract

Every candidate is compared against the latest approved production baseline using identical
requests and snapshots. Reports must include:

- task and language strata;
- input, optimized, cached-read, cached-write, and output tokens separately;
- projected and reconciled dollar cost separately;
- critical-evidence recall and unsupported-evidence rate;
- protocol byte/structure preservation;
- task success or independent deterministic oracle outcome;
- warm/cold p50, p95, and p99 latency;
- peak and retained memory;
- cancellation latency and queue depth;
- fallback and timeout rates;
- feature contribution: selected blocks, tokens admitted, tokens displaced, and downstream
  selection changes;
- confidence intervals and paired significance where statistical promotion is proposed.

Default promotion gates are zero protocol violations, zero secret-policy violations, zero
global-budget violations, no statistically meaningful task-success regression, and bounded
resource use. Phase contracts may tighten these gates but may not weaken them.

## 5. Phase sequence and dependencies

| Phase | Scope | Depends on | Initial runtime state |
|---:|---|---|---|
| 11 | Reachability truth, flags, and measurement repair | Phase 10 | Plan only |
| 12 | Standalone LSP intelligence | Phase 11 | Disabled until proven |
| 13 | Delta, error, test, and Git intelligence | Phase 12 | Disabled until proven |
| 14 | Terminal optimization and source provenance | Phase 13 | Disabled until proven |
| 15 | Dense and hybrid retrieval | Phase 14 | Shadow first |
| 16 | Cross-encoder/MMR reranking and semantic deduplication | Phase 15 | Shadow first |
| 17 | Project memory | Phase 16 | Explicit opt-in |
| 18 | Local SLM support | Phase 17 | Explicit opt-in, no auto-download |
| 19 | Unified production integration and release certification | Phases 11-18 | Blocked |

## Phase 11 - Production reachability truth and measurement repair

### Objective

Create one authoritative map of what is actually called in production, ensure flags describe
runtime reality, and repair validation outputs that overstate activation or savings.

### Implementation steps

1. Introduce a typed component registry with stable IDs, owner stage, prerequisites, trust and
   consent requirements, default state, fallback, and resource budget.
2. Replace direct reads of loosely related flags with a request-scoped capability snapshot.
3. Record a content-free stage receipt whenever a component is attempted, bypassed, invoked,
   contributes evidence, times out, fails, or falls back.
4. Make configuration defaults, manifest settings, runtime flags, release kill switches, and
   dashboard status derive from the same registry.
5. Add a production-reachability matrix generated from real compiler entry-point tests.
6. Change reports so `enabled`, `tested`, `shadow`, `available`, `replaced`, and `unwired` are
   separate states.
7. Replace the invalid over-100% cost-savings calculation with bounded accounting that keeps
   input, output, cache-read, cache-write, and routing effects explicit.
8. Add validation that rejects percentages outside valid domains and rejects an enabled claim
   without a matching production receipt.
9. Show component state and fallback reason in internal diagnostics without exposing prompts,
   paths, symbols, terminal text, or memory content.

### Automated tests and audit

- Registry/manifest/config parity tests.
- Every entry point: chat participant, language-model provider, and relevant commands.
- Property tests for valid percentage domains and monotonic dollar arithmetic.
- Negative tests proving unwired modules cannot be reported as enabled.
- Exactly-once stage receipt tests under retries and reconciliation.
- Kill-switch, cancellation, restricted-workspace, and malformed-config tests.
- Public-report disclosure and VSIX-exclusion tests.

### Exit criteria

- The generated reachability matrix matches observed production calls.
- No report contains impossible cost savings or unsupported activation claims.
- Existing prompt output is byte-identical with the new registry active.
- Source and evidence commits are complete; owner approval is required for Phase 12.

### Rollback

Disable receipt emission and capability-registry enforcement while retaining the corrected
validation arithmetic. Canonical compiler behavior remains unchanged.

## Phase 12 - Snapshot-safe LSP intelligence

### Objective

Use definitions, references, and call hierarchy as bounded evidence signals without allowing
editor timing, stale documents, or language-server failures to corrupt a request.

### Implementation steps

1. Add an adapter interface between the compiler and VS Code language commands; do not let
   core retrieval depend directly on global VS Code state.
2. Resolve focal symbols only from the request's immutable snapshot and active selection.
3. Normalize URIs, locations, symbol kinds, and call edges into typed evidence candidates.
4. Reject results outside permitted workspace roots or with a document version newer/older
   than the request policy permits.
5. Deduplicate and cap definitions, references, incoming calls, outgoing calls, files, and
   traversal depth before candidate materialization.
6. Apply per-command and aggregate deadlines with cancellation propagation.
7. Convert LSP results to references and scores; source text still comes only from the
   snapshot/source-policy reader.
8. Fall back to snapshot symbols and syntactic graph data on absent providers, timeout,
   malformed responses, unsupported languages, or stale results.
9. Enable in shadow mode first, compare selected evidence, then promote only after ablation.

### Automated tests and audit

- Mock language-server unit tests for definition/reference/call hierarchy normalization.
- Stale-version, out-of-root URI, symlink, duplicate, malformed, and huge-result attacks.
- Server absence, rejection, timeout, cancellation, restart, and partial-result tests.
- Multi-root and untitled/virtual-document policy tests.
- Installed-VSIX reachability tests with supported and unsupported languages.
- Differential tests proving fallback matches the current syntactic route.
- Latency, queue, and retained-memory tests with slow language servers.

### Promotion gates

- Zero out-of-policy source admissions and zero protocol changes.
- Critical-evidence recall is non-inferior to the syntactic baseline.
- Warm p95 incremental latency target: at most 25 ms; hard request deadline: 150 ms unless
  the phase contract establishes a stricter language-specific budget.
- Timeout or provider failure always produces deterministic syntactic fallback.

### Rollback

Disable `enableLspIntelligence`; snapshot-symbol and graph retrieval remains authoritative.

## Phase 13 - Delta, diagnostic, test, and Git intelligence

### Objective

Add request-relevant change, failure, test, and history signals while preventing stale editor
or repository state from being mistaken for authoritative source evidence.

### Implementation steps

1. Define a request-scoped `WorkspaceSignalSnapshot` containing versioned cursor/selection,
   dirty-buffer delta, diagnostics, test outcomes, and bounded Git metadata.
2. Delta: calculate cursor gravity, selection enclosure, and diff-hunk proximity against the
   same document version used by the compiler.
3. Error intelligence: normalize trusted VS Code diagnostics and explicitly supplied terminal
   failures; parse root-cause targets without executing or following terminal content.
4. Test graph: ingest test discovery/outcome events, map tests/fixtures/mocks to symbols, and
   expire results when source or test versions change.
5. Git graph: use repository-local, read-only metadata; cap history depth and never include
   author email, remote URL, commit message secrets, or arbitrary historical file content.
6. Convert each signal into score features and required-evidence hints, not directly rendered
   text. All admitted text must still come from the immutable snapshot.
7. Establish deterministic precedence for conflicting signals: explicit request and current
   selection, current diagnostics, failing tests, current delta, then bounded history.
8. Add freshness timestamps/version hashes and discard stale signals rather than guessing.
9. Shadow and ablate each signal independently before enabling their combination.

### Automated tests and audit

- Dirty buffer versus disk, rename, deletion, branch change, rebase, and detached-head tests.
- Stale diagnostics and test outcomes; duplicate/flapping events; partial discovery.
- Malicious stack traces, ANSI/control sequences, path traversal, secret-bearing commit data.
- Property tests for deterministic scoring and freshness invalidation.
- Concurrency tests for edits arriving during compilation.
- Per-signal and combined ablation across debug, test, refactor, and explanation tasks.
- Installed-VSIX tests proving actual diagnostics/test/Git event wiring.

### Promotion gates

- No stale signal may admit stale source text.
- Each enabled signal must improve evidence ranking or task outcome on its target task stratum
  without harming unrelated strata.
- Combined warm p95 incremental latency target: at most 20 ms; all indexing remains bounded.

### Rollback

Each of delta, error, test, and Git intelligence has an independent kill switch. Falling back
removes its score features and leaves snapshot retrieval unchanged.

## Phase 14 - Terminal optimization and source provenance

### Objective

Safely condense explicitly authorized terminal failures and attach provenance/sensitivity
metadata to context candidates before selection and rendering.

### Implementation steps

1. Define permitted terminal sources: explicit user selection, extension-owned task output, or
   separately consented shell-integration capture. Do not scrape arbitrary terminal history.
2. Normalize ANSI/control sequences, line endings, repeated progress output, and oversized
   lines before parsing.
3. Cluster failures, preserve first/last causal frames and exact error codes, and retain a
   reversible pointer to the authorized source without storing raw output in telemetry.
4. Apply secret redaction before persistence, indexing, diagnostics, or prompt admission.
5. Extend provenance inspection into a typed policy result: generated, vendored, specification,
   migration, minified, external, unknown, and sensitivity/risk indicators.
6. Propagate provenance through slicing, deduplication, retrieval, budgeting, reconstruction,
   cache keys, ledger events, and dashboard diagnostics.
7. Prevent low-trust generated or vendored artifacts from displacing authoritative project
   source unless the task explicitly targets them.
8. Preserve source attribution when terminal frames lead to workspace evidence.
9. Keep raw terminal text and source paths out of persistent metrics and project memory.

### Automated tests and audit

- ANSI, carriage-return progress, Unicode, huge-line, binary-like, ReDoS, and malformed traces.
- Secret, credential, home-path, IP, and remote-URL leakage tests.
- Multi-language stack traces and compiler/test-runner fixtures.
- Provenance propagation through every representation and fallback.
- Restricted-workspace, no-consent, and revoked-consent tests.
- Differential preservation tests for exact error codes and causal frames.
- Installed-VSIX tests using an extension-owned pseudoterminal/task fixture.

### Promotion gates

- Zero raw terminal persistence and zero secret leakage.
- Required error facts and causal frames have 100% recall in the adversarial fixture suite.
- Terminal parsing is linear/bounded; warm p95 target at most 10 ms for capped input.

### Rollback

Disable terminal capture/optimization independently. Provenance may fall back to `unknown`,
which must trigger conservative selection rather than exclusion.

## Phase 15 - Local dense and hybrid retrieval

### Objective

Combine the authoritative lexical/symbol retriever with bounded local semantic retrieval when
it provides measurable value, without network calls or mandatory model downloads.

### Implementation steps

1. Define an embedding-provider interface with deterministic identity, dimension, version,
   normalization, hardware requirements, and privacy declaration.
2. Ship no undisclosed network dependency. Any embedding model artifact must be packaged and
   hashed, or installed by an explicit user action with origin/hash/license verification.
3. Build content-addressed vectors only from source-policy-approved snapshot chunks.
4. Store vectors in a bounded workspace-local index keyed by workspace identity, content hash,
   parser version, and embedding version; invalidate exactly on mismatch.
5. Add incremental indexing, backpressure, cancellation, memory/disk quotas, and disposal.
6. Generate lexical and dense candidate lists independently, normalize scores, and fuse them
   using a deterministic rank-fusion contract.
7. Retain source provenance and snapshot references; vectors never become renderable evidence.
8. Use lexical retrieval as the complete fallback for missing models, unsupported hardware,
   timeout, corrupt index, resource pressure, or feature disablement.
9. Run dense retrieval in shadow mode and record only rank/contribution metadata before any
   candidate selection changes.

### Automated tests and audit

- Vector math, normalization, dimension mismatch, NaN/Infinity, and deterministic fusion.
- Exact invalidation under edit, delete, rename, parser upgrade, and embedding upgrade.
- Corrupt/truncated index, quota exhaustion, cancellation, concurrent update, and crash recovery.
- Network-isolation and model-artifact integrity/license tests.
- Retrieval recall, MRR/nDCG, critical-evidence recall, and end-to-end task ablation.
- Very large repository memory/disk/latency benchmarks.
- Installed-VSIX offline tests on supported hosts.

### Promotion gates

- Statistically meaningful retrieval or task-quality improvement on semantic-query strata.
- No regression on exact symbol/path/error queries.
- Zero network calls and deterministic lexical fallback.
- Provisional warm p95 query target: 50 ms; index quotas are enforced under stress.

### Rollback

Disable `enableDenseEmbeddings`; delete only version-owned derived vector indexes through a
validated workspace-scoped cleanup path. Lexical/symbol retrieval remains active.

## Phase 16 - Cross-encoder/MMR reranking and semantic deduplication

### Objective

Improve candidate ordering and diversity, then remove semantic redundancy without deleting
distinct constraints, protocol content, or required evidence.

### Implementation steps

1. Establish one candidate schema shared by retriever, reranker, diversity selector, dedup,
   solver, and evidence gate.
2. Apply bounded reranking only to a capped top-K candidate set; lexical/symbol scores remain
   available for fallback and audit.
3. Implement the cross-encoder behind a provider interface with versioned local artifacts,
   cancellation, timeout, batching, and deterministic baseline fallback.
4. Apply MMR after relevance reranking and before global budget selection; define stable tie
   breaking and minimum representation across files/evidence classes.
5. Run exact and structural dedup first, lexical near-dedup second, and semantic dedup last.
6. Protect system messages, roles, tool calls/results, data parts, user constraints, errors,
   tests, declarations, and required-evidence items from semantic removal.
7. When duplicates merge, retain all source/provenance/dependency references and choose the
   freshest authoritative representative deterministically.
8. Feed changed candidates to the existing global solver; do not create a second budget path.
9. Shadow cross-encoder and semantic decisions separately before combined promotion.

### Automated tests and audit

- Stable ordering, ties, score extremes, empty vectors, duplicates, and conflicting evidence.
- Adversarial near-duplicates differing by negation, number, unit, path, version, error code,
  access modifier, nullability, or security constraint.
- Required-evidence and protocol non-removal property tests.
- Representative/provenance merge and freshness tests.
- Cross-encoder absence, corrupt model, timeout, cancellation, and resource-pressure fallback.
- Per-stage and combined ablation for quality, tokens, latency, and memory.
- Installed-VSIX production-receipt tests.

### Promotion gates

- 100% preservation of protected distinctions in adversarial tests.
- Non-inferior critical-evidence recall and task success.
- A measurable reduction in redundant admitted tokens or measurable quality uplift.
- Provisional combined warm p95 incremental latency target: 40 ms.

### Rollback

Independent switches disable cross-encoder, MMR, and semantic dedup. The deterministic
lexical/symbol order plus exact safe dedup remains available.

## Phase 17 - Inspectable project memory

### Objective

Provide explicit, local, bounded project memory for durable decisions and constraints without
silently retaining source, prompts, secrets, or stale conclusions.

### Implementation steps

1. Define allowed memory types and schemas: user-approved decision, convention, constraint,
   terminology, and task note. Raw prompts, source files, terminal output, secrets, generated
   answers, and inferred personal data are prohibited by default.
2. Require explicit per-workspace opt-in and trusted workspace. Provide add, inspect, edit,
   supersede, export, clear, and disable controls.
3. Store memory under a versioned schema with workspace binding, provenance, creator type,
   timestamps, expiry, supersession, sensitivity, and content hash.
4. Sanitize before write and encrypt at rest using platform-backed secret material where
   available; fail closed if the required storage guarantee cannot be met.
5. Retrieve memory through the same candidate, ranking, budget, preservation, and evidence
   contracts as workspace context.
6. Require query relevance and freshness; memory can suggest evidence but cannot override
   current source, diagnostics, tests, explicit user instructions, or security policy.
7. Cap item count, bytes, tokens per request, and retrieval frequency. Add deterministic
   eviction and expiry.
8. Make all memory effects visible in internal diagnostics and removable without residue.
9. Start with manually authored memory; automated memory proposals require a separate explicit
   confirmation and are not part of initial promotion.

### Automated tests and audit

- Consent lifecycle, workspace trust, revocation, clear/export, and workspace identity changes.
- Secret/PII rejection, schema migration, corruption, encryption failure, and path containment.
- Stale/conflicting/superseded memory precedence tests.
- Cross-workspace isolation and multi-root tests.
- Prompt-injection and memory-poisoning adversarial suites.
- Quota, eviction, concurrency, crash consistency, and retained-memory tests.
- Installed-VSIX UI and production-reachability tests.

### Promotion gates

- Zero cross-workspace leakage and zero prohibited-content persistence.
- User can inspect and delete all persisted state.
- Memory improves repeated-task evidence quality without reducing fresh-source correctness.
- Disabled/no-consent behavior is byte-identical to the approved Phase 16 baseline.

### Rollback

Disable `enableProjectMemory` and stop reads/writes immediately. Offer a validated, explicit
workspace-scoped erase operation; never automatically delete unrelated workspace data.

## Phase 18 - Optional local SLM support

### Objective

Use a bounded local model only for narrowly defined compiler assistance when it beats the
deterministic baseline and can never bypass policy, evidence, protocol, or budget controls.

### Initial permitted use cases

- Query refinement that returns typed search terms and symbol hints.
- Candidate scoring features in shadow mode.
- Optional compression proposals validated against preserved facts.

The local SLM must not answer the user, execute tools, modify files, decide trust/consent,
redact secrets, waive required evidence, or directly construct the provider-bound payload.

### Implementation steps

1. Replace readiness stubs with a provider lifecycle: unavailable, loading, ready, busy,
   degraded, failed, and disposed.
2. Detect hardware conservatively and expose declared memory, storage, latency, and power costs.
3. Require explicit opt-in. Never auto-download a model; verify origin, license, exact hash,
   size, format, and compatibility before installation or load.
4. Sandbox model loading/inference in a worker boundary with strict input/output schemas,
   deadlines, memory limits, cancellation, and crash isolation.
5. Sanitize inputs before inference and prohibit network access from inference code.
6. Validate every output structurally and semantically; invalid, late, low-confidence, or
   resource-exceeding output falls back to deterministic behavior.
7. Cache only safe derived results using content/config/model hashes; never persist raw prompts
   or hidden model state.
8. Begin shadow-only. Promote one use case at a time through the governed Phase 10 experiment
   framework rather than enabling a general SLM switch.
9. Provide independent kill switches for model loading and each promoted use case.

### Automated tests and audit

- Artifact tampering, wrong hash/license, malformed model, unsupported instruction, and partial
  download tests.
- Worker crash/hang/OOM, cancellation, timeout, concurrent requests, and disposal tests.
- Prompt injection, secret handling, schema violation, nondeterminism, and network isolation.
- Hardware-tier tests for WebGPU, WASM/SIMD, CPU fallback, and unavailable environments.
- Paired shadow ablation with exact-artifact evidence and confidence intervals.
- Installed-VSIX offline tests; package-size and startup-lazy-loading checks.

### Promotion gates

- No startup regression when disabled; no model load before explicit consent.
- Zero policy bypasses and deterministic fallback for every failure mode.
- Statistically meaningful task-quality or net-cost-per-success improvement after local compute
  cost and latency are included.
- Resource ceilings and per-use-case p95 latency are established from measured hardware tiers,
  not assumed globally.

### Rollback

Disable the affected use case and local-inference capability. Terminate workers, clear derived
runtime caches, and leave user-installed model removal as an explicit recoverable action.

## Phase 19 - Unified integration, migration, and artifact certification

### Objective

Prove that the approved components operate as one bounded production pipeline, clean up
replaced implementations, and certify the exact installable artifact without overstating
production savings.

### Implementation steps

1. Generate the final production call graph and component-state matrix from installed-VSIX
   executions across every entry point and supported host.
2. Verify a single order of operations: request boundary; snapshot/signals; retrieval; rerank;
   diversity/dedup; global solver; assembly; protocol/preservation/evidence gates; provider;
   reconciliation; observability.
3. Resolve duplicate engines. Mark each old module as authoritative, adapter, replaced,
   migration-only, or removed; do not maintain ambiguous parallel implementations.
4. Migrate configuration with conservative defaults and preserve the emergency verbatim
   pass-through plus independent component kill switches.
5. Run factorial/ablation analysis to quantify interaction and eliminate components that add
   latency or complexity without measurable end-to-end value.
6. Update internal architecture, operator diagnostics, support playbooks, rollback instructions,
   and public non-technical documentation.
7. Rebuild SBOM and provenance; inspect all VSIX entries; validate artifact/source hashes.
8. Run minimum, stable, and Insiders Extension Hosts in trusted and all testable restricted
   workspace modes.
9. Keep release decision at awaiting human approval after all automated gates pass.

### Final test matrix

- All unit/property/integration/adversarial suites from Phases 11-18.
- Full protocol modalities: roles, names, tools, tool results, data parts, images, cancellation,
  streaming, retries, caching, and usage reconciliation.
- Eight languages, multiple repository sizes, multi-root, dirty buffers, no-language-server,
  no-Git, no-tests, offline, restricted workspace, and low-resource hosts.
- Long-session soak, rapid edits, concurrent requests, index churn, extension reload, upgrade,
  downgrade, and rollback.
- Privacy audit for source, terminal, diagnostics, Git, embeddings, memory, logs, and telemetry.
- Independent clean-room audit and exact-artifact host matrix.

### Exit criteria

- Every enabled component has installed-artifact production receipts and independent evidence.
- No standalone module is described as enabled merely because its unit tests pass.
- End-to-end quality is non-inferior; resource and privacy budgets pass.
- Savings reports contain valid arithmetic and retain synthetic/production/billed distinctions.
- Artifact certification is green and explicitly awaiting repository-owner release approval.

### Rollback

The emergency pass-through restores canonical unoptimized payloads. Each optional component can
also be disabled independently. The previous certified VSIX and its provenance remain available
for a package-level rollback.

## 6. Planned commit structure

Each phase should normally produce two local commits:

1. `feat(<phase-scope>): ...` or `fix(<phase-scope>): ...` for contracts, runtime code, and tests.
2. `docs(validation): certify phase <n> ...` for regenerated reports and artifact evidence.

Additional commits are permitted only when they isolate a security-sensitive migration or a
large generated-model artifact. No commit for a later phase may be created before approval.

## 7. Next action

Phase 11 is the next eligible implementation phase. It begins only after the repository owner
reviews this plan and explicitly approves Phase 11.
