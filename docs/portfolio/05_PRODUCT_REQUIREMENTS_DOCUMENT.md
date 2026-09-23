# Product Requirements Document

## Document control

| Field | Value |
|---|---|
| Product | Tokonomics |
| Version represented | 8.0.0 |
| Owner | Tokonomics Product Lead, Principal AI Technical Product Manager |
| Status | Release PRD, production capabilities, and promotion gates |
| Decision type | 0-to-1 developer product |

## Problem statement

AI coding assistants can receive more context than necessary, but aggressively reducing context can remove implementation details and increase failures. Developers lack a simple, trustworthy way to optimize context, understand the decision and distinguish real savings from estimates.

## Goals

1. Reduce unnecessary context for eligible multi-file and agentic coding tasks.
2. Preserve exact mandatory evidence and user instructions.
3. Make optimization outcomes and evidence status understandable.
4. Respect user model choice, workspace trust and data boundaries.
5. Establish completed-task evaluation before commercial savings claims.

## Non-goals

- Make every prompt smaller.
- Replace the selected upstream model.
- Intercept another extension's private traffic.
- Store source code or prompts for analytics.
- Operate a provider gateway or inference server.
- Add learned compression or local models without a separate evidence gate.
- Guarantee savings across all developers or pricing models.

## Users and use cases

### UC1 — Explicit selected-code question

The developer selects code, invokes Tokonomics and asks a question. The selection must remain exact and mandatory.

### UC2 — Automatic multi-file context

In a trusted workspace, the developer asks about a feature or defect. Tokonomics identifies exact focal implementation and required supporting evidence without automatically attaching an entire subsystem.

### UC3 — Long agentic session

Tool results and history accumulate. Tokonomics removes redundant older observations while preserving recent output, failures, identifiers and recovery references.

### UC4 — Usage review

The developer opens the dashboard to see request status, context tokens, evidence classification and cost only when available.

### UC5 — Restricted workspace

The developer uses Tokonomics without automatic workspace reads or indexing.

## Functional requirements

### Context entry

- FR-1: All product entry points must use one context policy and one upstream send path.
- FR-2: None mode must not read or attach workspace-derived content.
- FR-3: Selection mode must use only deliberate selections and explicit prompt content.
- FR-4: Automatic mode requires a trusted workspace.
- FR-5: An explicit selection must remain byte-exact unless a final security transform is required and disclosed.
- FR-6: Automatic mode must not attach both an undeclared full active file and a retrieval pack.

### Evidence retrieval

- FR-7: Code-changing and correctness tasks require exact focal implementation evidence.
- FR-8: Every retrieved source candidate must be bound to workspace identity, version/hash and provenance.
- FR-9: Approximate representations may rank candidates but must not masquerade as exact implementation evidence.
- FR-10: Mandatory evidence must be budgeted before optional context.
- FR-11: An unusable evidence result must trigger a conservative fallback or explicit inability—not an empty payload.
- FR-12: Missing dependencies that cause task failure must become regression cases.

### Agentic context

- FR-13: Observation masking must preserve message/part structure, tool-call IDs, recent results and errors.
- FR-14: Text history must remain stable within an epoch and compact only at a declared threshold.
- FR-15: Recovery references must allow omitted detail to be reacquired without ambiguity.

### Token and cost evidence

- FR-16: Use the selected model's token counter when available for final pre-send validation.
- FR-17: Distinguish estimated tokens, model-counted tokens and provider usage.
- FR-18: Distinguish projected, reconciled, unavailable and unverified cost.
- FR-19: Never display missing cost as zero.
- FR-20: Count retries and extra model/tool turns in completed-task economics.

### User experience

- FR-21: Expose no more than the four current settings.
- FR-22: Respect the model selected in VS Code.
- FR-23: Provide clear safe fallback and unavailable explanations.
- FR-24: Preserve `@tokonomics` as an explicit alternative if a sidebar is promoted.
- FR-25: The sidebar must remain gated until it has feature and quality parity.

### Security and privacy

- FR-26: Enforce workspace-root containment, ignore policy, trust and unsaved-buffer consent.
- FR-27: Apply outbound secret/path safety at the final rendered boundary.
- FR-28: Store only bounded, content-free optimization metadata by default.
- FR-29: Reject unknown protocol parts rather than silently dropping them.
- FR-30: Support deletion/reset of extension-held session and project data.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Reliability | Fail closed to safe pass-through/fallback; exactly one upstream send |
| Performance | Declare p50/p95 compilation and retrieval budgets; no unbounded indexing or queues |
| Memory | Enforce index/cache budgets and deterministic eviction |
| Privacy | No prompt, source, response, secret or raw path in analytics records |
| Security | No critical/high unresolved finding at release |
| Accessibility | Dashboard/sidebar usable in light, dark, high-contrast and keyboard/screen-reader flows |
| Compatibility | Supported VS Code version and remote topology declared |
| Explainability | Every applied stage has a final-payload contribution receipt or no contribution claim |
| Reproducibility | Benchmarks bind corpus, product version, model/configuration and date |

## Experience requirements

### First-run experience

1. Explain that Tokonomics sends the final request to the selected provider.
2. Recommend Balanced and Selection.
3. Avoid advanced configuration.
4. Demonstrate one explicit selection task.
5. Show where evidence status appears.

### Dashboard hierarchy

1. Request status.
2. Context before/after and counting method.
3. Quality/fallback status.
4. Cost evidence state.
5. Technical trace only on demand.

## Success metrics

### North star

Successful optimized tasks per constrained resource unit.

### Quality guardrails

- task success and patch/test success;
- missing-context recovery rate;
- unsupported-edit rate;
- user-reported trust;
- fallback correctness.

### Efficiency outcomes

- completed-task input/output tokens;
- model and tool turns;
- context-window/session capacity;
- TTFT and end-to-end latency;
- reconciled cost where available.

### Product funnel

- install → first invocation;
- first successful optimized task;
- second task within seven days;
- four-week retained use;
- uninstall and disable reasons.

## Acceptance criteria for marketability

- Primary customer segment validated through research.
- At least 30 paired samples per launch workload.
- Workload-specific non-inferiority thresholds passed.
- At least 10% net completed-task input-cost reduction in target metered workloads or a validated fixed-seat capacity outcome.
- Missing-context recovery attributable to Tokonomics below 2%.
- Zero critical/high security or privacy blocker.
- Installed VSIX and rollback tested.
- Claims reviewed against the evidence register.

## Dependencies

- VS Code Language Model and Chat APIs.
- Selected model availability and consent.
- Workspace trust and host topology.
- Language parsers/LSP availability with deterministic fallback.
- Provider usage evidence for reconciled financial claims.

## Open questions

- Which segment has the strongest willingness to adopt?
- Is a dedicated sidebar necessary or harmful to workflow fit?
- What percentage of real work is multi-file or long-agentic enough to benefit?
- Can enterprises provide provider usage without expanding Tokonomics' data boundary?
- Which retrieval dependencies caused the three pilot failures, and can they be fixed without erasing savings?
- Does observation masking preserve agentic task success?

