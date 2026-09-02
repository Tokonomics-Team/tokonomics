# Tokonomics canonical protocol contract

This document defines Phase 2 behavior at both cloud-model entry points: the
`@tokonomics` chat participant and the Tokonomics language-model provider.

## Canonical request path

Both entry points convert VS Code input into `CanonicalMessage[]`, call the same
request-scoped `CanonicalRequestCompiler`, pass the rendered request through the same
final security boundary, and convert it back into VS Code model parts. There is no
second prompt compiler in a production model path.

One generated request ID identifies compilation, trace, metrics, completion, and cost
reconciliation. Compilation side effects remain deferred until the complete upstream
stream succeeds. Cancellation and protocol errors discard the uncommitted lifecycle.

## Supported message semantics

| Semantic value | Inbound behavior | Outbound behavior |
|---|---|---|
| User/assistant role | Preserved | Preserved |
| Message name | Preserved | Preserved |
| Text part | Compiled for text-only turns | Streamed/preserved |
| Tool call | Preserved, including call ID, name, and input | Streamed/preserved |
| Tool result | Preserved, including call ID and child order | Preserved |
| Textual data | Preserved and sanitized at final egress | Streamed/preserved |
| Opaque binary/image data | Copied byte-for-byte; included in the byte limit | Streamed/preserved |
| Unknown or future part | Explicit protocol error | Explicit protocol error |
| System role | Representable canonically | Explicit error at VS Code egress |

VS Code's language-model request API exposes user and assistant constructors, not a
system-message constructor. Tokonomics must never change a system role into a user
role merely to make a request appear valid.

## Conservative structured-turn rule

A request containing any tool call, tool result, or data part is structured. Phase 2
passes its canonical message sequence through unchanged instead of applying a
text-oriented optimization that could break ordering, pairing, names, MIME types, or
binary bytes. Text-only turns use the normal compiler. Optimization of structured
evidence requires a later, separately reviewed contract and preservation proof.

## Streaming and cancellation

Known response parts are forwarded individually and in upstream order. The provider
supports text, tool-call, tool-result, and data response parts. The chat UI accepts
text only because it cannot faithfully render an arbitrary model protocol stream;
non-text output on that path fails explicitly.

Cancellation is checked before compilation, after transformations, before request
dispatch, and during response streaming. A cancelled request does not publish a trace,
record optimization metrics, populate history/cache through these entry points, or
publish completed/reconciled lifecycle states.

## Compatibility floor

The extension engine and `@types/vscode` are pinned to VS Code 1.106 because this
protocol relies on `LanguageModelDataPart`. Tokonomics models are excluded from target
selection by both model ID and vendor so the proxy cannot recursively select itself.

## Phase boundary

This phase establishes protocol correctness and common compilation. Complete rendered
payload token accounting belongs to Phase 5, provider-usage economics to Phase 6, and
authoritative append-only observability to Phase 7. Those phases must not be inferred
as complete from this contract.
