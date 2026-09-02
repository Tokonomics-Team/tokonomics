# Tokonomics evidence-aware retrieval contract

Phase 4 turns a request intent into an explicit evidence plan over one Phase 3
workspace snapshot. Retrieval is local, deterministic, consent-gated, and explainable.

## Evidence policy

Each request records required, optional, and forbidden evidence categories. Critical
and applicable high-priority policy entries are required; lower-priority entries are
optional. Requirements that cannot apply to the observed request (for example an error
stack on a non-error prompt) do not become fictitious evidence. Narrow completion and
search tasks forbid broad history/architecture evidence unless the prompt requests it.

## Candidate contract

Every candidate has a stable ID, snapshot generation, category, source kind, canonical
file identity when applicable, symbol/range, content hash, provenance, dependencies,
scores, mandatory state, and an inclusion/exclusion explanation. Candidate sources are
lexical text, symbols/AST skeletons, reference graph edges, tests, open editors, LSP
overlays, diagnostics, stack traces, recent diffs, configuration, and repository rank.

## Retrieval and stopping

Retrieval expands in deterministic stages: direct evidence, dependency/test evidence,
then broad repository/diff/configuration evidence. Reciprocal-rank fusion combines
independent source ranks. Required categories are admitted first; maximal-marginal
relevance then limits redundant files and symbols. Expansion stops only when all
required categories are covered. If critical evidence remains missing, the compiler
uses conservative original context rather than claiming sufficient optimized context.

## Slice and preservation safety

SDG output is only eligible when parser/slice analysis succeeds, dynamic-language risk
permits slicing, focal symbols remain, and structured obligations pass. Reflection,
dynamic imports, FFI, dependency injection, callbacks, dynamic dispatch, and global
mutation trigger lexical-scope or full-verbatim fallback according to the Phase 4
slice-confidence policy.

Preservation checks cover message role/name/order, declarations explicitly requested,
file/range citations, error diagnostics, imports/dependencies, and textual tool-call /
tool-result pair identifiers. The legacy keyword check remains defense in depth, not
the sole authority.

## Phase boundary

Phase 4 chooses and explains evidence. Phase 5 will make the global solver and rendered
provider-token budget exactly authoritative. Fixture recall and non-inferiority results
are controlled repository tests, not claims of provider-level task success.
