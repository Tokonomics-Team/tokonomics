# Exact Cache and Token-Economics Contract

## Scope

This contract governs response reuse, prompt-cache accounting, pricing, and
post-provider reconciliation. It distinguishes local response caching from provider
prompt caching; the two mechanisms are not interchangeable.

## Exact response reuse

An answer may be replayed only when a SHA-256 fingerprint matches across:

- request text and ordered conversation;
- workspace roots, snapshot generation, ignore policy, file identities, source
  versions, and content hashes;
- selected evidence identities and content hashes;
- provider and exact model identity;
- tools and schemas;
- compiler configuration and governing policies; and
- extension version.

File order, evidence order, and object-key order are canonicalized before hashing.
Every indexed workspace file is included, which intentionally invalidates more broadly
than the minimum dependency set and prevents stale reuse after any observed change.

Approximate query similarity may return an opaque fingerprint as a retrieval hint. It
never returns cached answer text and can never count as a response-cache hit.

Responses are ineligible when the intent mutates state, tools are available, a stream
is partial, the request is cancelled or failed, workspace state is unresolved, or the
question is time-sensitive. Only a non-empty, successfully completed response can be
stored. The cache is in-memory, TTL-bounded, size-bounded, and dependency-invalidatable.

## Provider prompt caching

`isCacheEligible` means only that a stable prefix meets a provider policy threshold.
It is not a cache write and not a cache read. Compile-time projected cost assumes no
cache hit. A separately labelled read-hit scenario may be displayed, but contributes
zero booked savings.

Cache-read and cache-write tokens affect reconciled cost only when included in complete
provider-reported usage. Locally estimated input or output counts are never relabelled
as actual usage.

## Pricing catalog

Pricing entries include provider, exact model, aliases, currency, effective date,
catalog version, source, input rate, output rate, cache-read rate, cache-write rate,
and optional cache-storage rate. Bundled entries are pinned reference inputs rather
than assertions about live vendor pricing. They must be reviewed before release or
billing use. Auditable enterprise contract overrides are supported.

Verified reconciliation fails closed when no provider/model-specific catalog entry
exists. A generic price may support an explicitly generic projection, but is never
substituted for unknown provider-reported usage.

## Economic formulas

Projected cost uses standard input prices and does not assume provider caching:

`projected = optimized_input × input_rate`

Verified optimized cost is:

`uncached_input × input_rate`

`+ cache_read_input × cache_read_rate`

`+ cache_write_input × cache_write_rate`

`+ output × output_rate`

`+ cache_storage + additional_model_calls + optimization_compute`

Net savings equal the comparable unoptimized baseline cost minus verified optimized
cost. Negative savings are retained as economic loss and are never clamped to zero.

## Request binding

Provider usage must carry complete input and output counts and is bound to the original
canonical request ID, provider, and exact model. Unknown requests, mismatches, missing
usage, and duplicate reconciliation cannot produce a reconciled result.

## Evidence status

Automated fixtures verify formulas, safety exclusions, mismatch handling, and the
zero-false-hit adversarial matrix. They are controlled local evidence, not live
provider billing certification.
