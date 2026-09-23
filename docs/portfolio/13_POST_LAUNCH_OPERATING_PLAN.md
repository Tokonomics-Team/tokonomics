# Post-Launch Operating Plan

## Purpose

Define how Tokonomics would be monitored, supported and improved after a gated release.

## Operating principles

- Quality and trust metrics page before savings metrics.
- Segment results by workload, model, extension version and billing type.
- Do not collect source, prompts or responses for routine analytics.
- Treat provider/API changes as evidence invalidation events.
- Prefer rollback or pass-through over prolonged customer harm.

## Daily health review

- request completion/failure/cancellation;
- fallback and missing-context recovery;
- double-send invariant;
- p50/p95 compilation and retrieval latency;
- queue/memory pressure;
- dashboard unavailable-state anomalies;
- security/privacy alerts;
- new high-severity support reports.

## Weekly product review

- activation and repeat use;
- successful-task rate by promoted workload;
- completed-task token/turn distributions;
- pass-through rate and reasons;
- recovery/retry rate;
- user trust and complaint themes;
- model/provider/version shifts;
- experiment and kill-switch status.

## Monthly business review

- active and retained developers;
- target-segment penetration;
- verified metered savings where available;
- fixed-seat capacity/latency outcomes;
- support cost and operational burden;
- privacy/security posture;
- roadmap decision and evidence gaps;
- claim refresh/retirement.

## Health dashboard

| Category | Green | Watch | Stop/rollback |
|---|---|---|---|
| Task quality | Within workload margin | CI approaches margin | Margin breached |
| Missing-context recovery | <2% | 2–5% | >5% or severe incident |
| Reliability | ≥99.9% safe outcome target | Repeated non-critical failures | Double-send/data corruption |
| Performance | Within approved p95 | Sustained degradation | Editor instability/resource harm |
| Security/privacy | No high/critical | Medium issue under mitigation | High/critical or data boundary breach |
| Evidence integrity | Claims current | Refresh due | Material claim unsupported |

Thresholds are launch hypotheses and should be calibrated during alpha.

## Feedback taxonomy

- Missing context.
- Irrelevant context.
- Incorrect pass-through/fallback.
- Slower response.
- Model routing/selection issue.
- Cost/token misunderstanding.
- Workspace trust/privacy concern.
- Installation/compatibility.
- Dashboard/usability.
- Feature request.

Feedback records should contain metadata and user-supplied sanitized reproductions only.

## Incident severity

### Severity 0

Confirmed source/secret exposure, unauthorized workspace access or corrupted user work. Disable affected capability immediately and follow security response.

### Severity 1

Systematic quality regression, double sends, severe provider-routing error or widespread editor instability. Pause rollout and activate rollback.

### Severity 2

Material but bounded failure with workaround. Stop cohort expansion and prioritize correction.

### Severity 3

Minor UX, reporting or compatibility issue. Schedule through normal prioritization.

## Model/provider change management

A new model tokenizer, context window, API contract or price can invalidate evidence. On detection:

1. mark affected cost/quality claims stale;
2. run compatibility and token-count checks;
3. rerun relevant controlled evaluations;
4. update pricing effective date;
5. restore claims only after review.

## Experiment operations

- Maintain mutually exclusive cohorts.
- Record version, model and policy assignment.
- Monitor quality guardrails continuously.
- Stop automatically on severe guardrail breach where feasible.
- Analyze by intent/workload, not only aggregate.
- Document decision, not just result.

## Evidence refresh calendar

| Evidence | Refresh trigger |
|---|---|
| Savings benchmark | Compiler/retrieval/policy change |
| Model-task evaluation | Model, corpus or evidence-policy change |
| Pricing | Provider pricing/model change or quarterly |
| Security threat model | New data source, API, storage or network path |
| VSIX certification | Every release candidate |
| Market/competitive analysis | Quarterly or major native-assistant release |
| Customer research | Each roadmap horizon |

## Deprecation criteria

Deprecate a feature when:

- it is inert across relevant evaluation;
- native platform behavior makes it redundant;
- it creates material latency/support cost without outcome value;
- it cannot meet privacy/security requirements;
- customers do not use or understand it;
- maintaining it blocks higher-value work.

## Product stop/pivot criteria

Stop the context-saving proposition or pivot to governance if, after a properly powered beta:

- task non-inferiority cannot be achieved with meaningful resource reduction;
- target users refuse to change workflow;
- native assistants close the measurable gap;
- billing models prevent customer value;
- support/security burden exceeds the benefit.

Stopping under these conditions is a successful product decision, not an execution failure.

