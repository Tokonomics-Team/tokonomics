# Phase 10 evaluated experiments contract

## Purpose

Phase 10 creates a safe path for testing advanced context techniques. It does not
declare any candidate state of the art and does not promote synthetic results into
production claims. Every experiment is disabled by default, requires explicit local
consent, runs in shadow mode, has a deterministic fallback, and can be killed
independently.

## Problems addressed

The original audit found advanced modules and optimistic benchmark claims without a
single evidence standard connecting implementation, production reachability, task
success, net cost, latency, privacy, and rollback. Several feature flags existed only
in source and were not public configuration contracts. Synthetic outcomes could also
look like production evidence even though no upstream model produced them.

## Architecture

1. `ExperimentCatalog` is the canonical registry for the eight Phase 10 candidates.
   It declares privacy class, trust requirement, estimated resource ceiling,
   conservative fallback, and intended production hook.
2. `ExperimentRuntime` is the process-local consent and containment boundary. Unknown
   IDs are discarded. Release disablement, per-candidate kill switches, missing
   consent, missing workspace trust, and insufficient resource budgets all fail closed.
3. Shadow execution returns a fallback on candidate exceptions, invalid output, or a
   latency overrun. Its bounded diagnostic ring stores only SHA-256 input identities,
   outcome codes, and timing; it never stores prompts or workspace content.
4. `ExperimentalCandidateAdapters` contains deterministic bounded prototypes. These
   adapters are evaluation subjects, not production output transformers.
5. `ExperimentPromotionEvaluator` consumes paired baseline/candidate outcomes. It
   measures paired task-success delta, a 95% interval, exact two-sided McNemar
   significance, net cost per successful task, and p95 latency.
6. `phase10Evaluation` emits a current-commit report. Absence of external independent
   evidence produces a `hold`; it can never be interpreted as a pass.

## Candidate mapping

| Candidate | Intended hook | Privacy class | Conservative fallback |
|---|---|---|---|
| Evidence-aware learned ranking | evidence retrieval ranking | workspace-derived | deterministic evidence fusion |
| Snapshot-safe delta context | versioned workspace snapshot | workspace-derived | complete snapshot |
| Provider-specific cache layout | cache planner | none | canonical message order |
| Confidence-progressive compilation | pipeline entry | none | complete compilation |
| Bounded local semantic retrieval | evidence retrieval | workspace-derived | lexical and graph retrieval |
| Inspectable project memory | project memory summary | local persistence | attach no memory |
| Readability-guarded vision | image planning | image-derived | original image payload |
| Adaptive utility budgeting | global budget finalization | none | fixed hard budget |

Only confidence-progressive compilation has a production-reachable shadow hook in this
phase. Its proposed tier is added to the privacy-safe decision trace, while the existing
pipeline remains authoritative. The other candidates remain bounded adapters until a
future explicitly approved integration change proves reachability without weakening
the current safety boundaries.

## Configuration and consent

- `tokenOptimizer.experimentalConsent` defaults to `false`.
- `tokenOptimizer.experimentalFeatures` defaults to an empty list.
- `tokenOptimizer.disabledExperiments` overrides consent and selection per candidate.
- `tokenOptimizer.experimentalMaxLatencyMs` is clamped to 1-250 ms.
- `tokenOptimizer.experimentalMaxMemoryMB` is clamped to 1-256 MB.
- Workspace-derived, persistent, and image-derived candidates require a trusted
  workspace as well as consent.
- Phase 9 release disablement disables all Phase 10 experiments.

Consent is local VS Code configuration. It is not inferred from release-channel
enrollment, workspace trust, pipeline mode, or use of another feature.

## Promotion algorithm

A candidate may be recommended for promotion only when all conditions are true:

1. At least 30 valid paired tasks were run by an external independent evaluator.
2. The dataset is frozen and SHA-256 identified.
3. The exact VSIX is SHA-256 identified.
4. The task oracle is independent from the candidate implementation.
5. The quality path requires task-success uplift of at least two percentage points,
   a lower paired 95% interval above zero, exact two-sided McNemar p-value at most
   0.05, and no regression in net cost per successful task.
6. The cost path requires success non-inferiority within two percentage points, at
   least five percent lower cost per successful task, and a deterministic bootstrap
   95% interval for that cost improvement entirely above zero.
7. Candidate p95 latency is no more than 110% of baseline p95.
8. Production reachability, fallback, independent disablement, consent, and resource
   guardrails are each verified.

Malformed, incomplete, self-generated, non-artifact-bound, or synthetic evidence is a
blocking condition. Invalid numeric observations are excluded rather than coerced.
No-success baselines produce infinite cost per success and cannot create a misleading
finite saving claim.

## Detailed implementation sequence

1. Publish one typed candidate ID list and use it for runtime and manifest parity.
2. Register privacy, trust, resource, fallback, and production-hook metadata.
3. Add explicit consent, selection, kill-switch, latency, and memory settings.
4. Configure the runtime during activation and configuration/trust changes.
5. Add a bounded hash-only diagnostic ring and deterministic fallback wrapper.
6. Implement pure bounded adapters for all eight candidate techniques.
7. Connect progressive compilation in shadow-only mode without changing outbound
   messages.
8. Implement paired success, significance, cost-per-success, and latency evaluation.
9. Generate JSON and Markdown decisions from current evidence.
10. Test consent, trust, release disablement, kill switches, budgets, exceptions,
    invalid output, privacy, bounds, statistics, and model-payload equivalence.
11. Package and inspect the VSIX to ensure experimental source and validation tooling
    are not shipped.
12. Commit implementation separately from generated evaluation evidence.

## Test and adversarial matrix

- unknown, duplicate, selected, unselected, and independently disabled IDs;
- consent absent and release disabled;
- trusted and Restricted Mode behavior;
- latency and declared-memory ceilings;
- candidate exception and invalid output fallback;
- diagnostic content leakage and bounded retention;
- NaN, infinity, negative cost/latency, empty, and undersized evidence;
- tied, regressive, and statistically significant paired outcomes;
- candidate ordering and deterministic tie breaking;
- snapshot additions, updates, and deletions;
- invalid or oversized embedding vectors;
- image readability loss;
- hard-budget non-exceedance;
- byte-equivalent model-bound messages with shadow mode off and on;
- manifest/default/ID parity and current-commit report provenance.

## Phase exit criteria

- Every candidate is default-off, consent-gated, bounded, and independently disabled.
- Shadow failures preserve the existing production behavior.
- Diagnostics contain hashes and outcome metadata only.
- Statistical decisions cannot promote synthetic or incomplete evidence.
- Automated tests, compilation, clean-room audit, artifact inspection, and supported
  Extension Host tests pass.
- The generated report names every candidate and records `hold`, `reject`, or `promote`
  with explicit reasons.
- Marketplace and README text make no new state-of-the-art, task-success, or savings
  claim.

## Current promotion status

No Phase 10 candidate is promoted. The repository has no external independent paired
task dataset bound to the current VSIX. This is the intended evidence-conservative
result, not an incomplete or failed implementation.
