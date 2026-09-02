# Tokonomics global token-budget contract

Phase 5 establishes one authoritative budget for the complete outgoing request. A
request limit covers rendered message text and wrappers, structured tool/data parts,
selected evidence, output reserve, a provider-independent safety margin, and a declared
token-estimator error allowance. The effective limit never exceeds the selected model's
context window.

## Context IR

Every generated resolution carries normalized metadata for provenance, render location,
mandatory state, minimum safe resolution, dependencies, conflicts, freshness,
sensitivity, and transformation history. Its token cost is calculated from the exact
text that the renderer will emit.

## Selection order

Mandatory entities and their dependency closure are admitted first at or above their
minimum safe resolution. Conflicting mandatory entities are an error. Optional utility
is then optimized with the multi-choice solver under the remaining candidate budget.
No mandatory entity has an exclusion representation. If mandatory protocol, prose,
code, evidence, or dependencies cannot fit, compilation fails explicitly instead of
silently dropping content or forwarding an oversized request.

## Rendering authority

Solver assignments are the only evidence and code representations eligible for
rendering. An `R_exclude` assignment renders no block. Evidence wrappers and separators
are charged before selection, and the final fully rendered messages are recounted.
Cache eligibility and projected economics do not reduce physical prompt tokens.

## Tokenizer boundary

Text uses the deterministic Tokonomics estimator. Until provider-exact tokenizers are
available, allocation reserves eight percent of safe input capacity as an explicit
estimator error margin, plus a two-percent general safety margin. Structured textual
parts are counted from their serialized content; opaque binary/image parts use a
conservative byte-based allocation when dimensions are unavailable. Reports label this
method as estimated rather than provider-reconciled usage.

## Phase boundary

Phase 5 guarantees local rendered-budget conformance and deterministic selection. Phase
6 will address cache identity and provider-specific economic reconciliation; Phase 7
will make all budget fields authoritative in user-facing observability.
