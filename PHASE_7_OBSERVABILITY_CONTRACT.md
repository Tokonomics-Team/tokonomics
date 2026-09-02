# Phase 7 Authoritative Observability Contract

## Scope

Phase 7 makes the canonical request lifecycle the only source for live dashboard,
status-bar, history, command, and audit-export values. It does not implement the
worker, queue, or large-workspace performance work reserved for Phase 8.

## Request ledger

- A request is identified only by its canonical request ID.
- Lifecycle records are append-only, immutable, timestamp ordered, and persisted in
  extension global state.
- An identical event is idempotent. Distinct stage updates are retained even when
  they share a lifecycle state and trace ID.
- State or timestamp regressions cannot replace the authoritative request tail.
- Aggregation reads the latest accepted lifecycle record for each request, so compile,
  completion, usage, and reconciliation updates never count as additional prompts.
- Cancellation and downstream/protocol failures end in `OPTIMIZATION_FAILED` with a
  bounded machine-safe error code; error messages and request content are not stored.

## Window definitions

- `session`: latest lifecycle timestamps at or after the current activation/reset time.
- `today`: latest lifecycle timestamps at or after local calendar midnight.
- `7_days`: latest lifecycle timestamps within the previous 168 hours.
- `lifetime`: every retained request tail.

All windows are calculated at read time. They therefore expire without relying on a
new request, timer, or mutable bucket rollover.

## Metric truth rules

- Token totals and quality/latency averages derive from canonical event fields.
- Reconciled costs use only provider-reported usage and catalog-backed pricing.
- Projected costs remain explicitly projected. A mix of projected and reconciled
  requests retains the projected marker.
- Unpriced or incomplete usage is `unavailable`; it is not converted to zero savings.
- Verified cache-read ratio is `sum(provider cache-read tokens) / sum(optimized input
  tokens for reconciled requests)`. Cache eligibility is never counted as a hit.
- Empty quality, coverage, latency, cache, and cost samples display `Unavailable`.
- Failed requests are reported separately from completed requests.

## Privacy-safe trace

The inspector and exported audit contain lifecycle states, stage token/timing data,
snapshot generation, budget values, cache/cost state, fallback codes, redaction count,
and SHA-256 selection/content hashes. They do not contain prompt text, selected source
text, file paths, provider error messages, or raw selection identifiers.

## Verification matrix

`tests/phase7ObservabilityLedger.test.ts` verifies:

- exactly-once aggregation across compile and reconciliation records;
- identical-event idempotence and distinct-stage retention;
- immutable records and lifecycle/timestamp regression rejection;
- activation-session, local-midnight, rolling-168-hour, and lifetime windows;
- actual-over-projected cost reconciliation and verified cache-read ratios;
- honest unavailable values and empty aggregates;
- privacy-safe hashed decision traces; and
- explicit failed/cancelled request accounting.

The repository-wide suite additionally exercises cancellation and unsupported provider
output as terminal failure records, dashboard isolation, canonical compilation, cache
economics, security boundaries, and host simulation.
