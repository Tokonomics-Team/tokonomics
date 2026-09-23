# AI Technical Product Specification

## Purpose

Translate customer outcomes into technical and AI-system contracts without disclosing proprietary implementation details. This document describes product behavior, evidence flow and boundaries rather than source-level architecture.

## System outcome

For each eligible request, produce a provider-compatible context package that:

1. preserves the user's intent and protocol;
2. contains sufficient exact evidence for the task;
3. omits avoidable context when safe;
4. fits the selected model's budget;
5. exposes an auditable outcome without retaining sensitive content.

## Conceptual capability layers

| Layer | Product responsibility | Failure behavior |
|---|---|---|
| Interaction | Receive prompt, selection, model choice and context preference | Preserve explicit user choice |
| Context authority | Determine what workspace data may be considered | No unauthorized read or attachment |
| Task/evidence policy | Identify required evidence categories | Use conservative unknown-task policy |
| Evidence acquisition | Locate current, relevant exact source and signals | Declare shortfall or safe fallback |
| Selection/budgeting | Prioritize required evidence, then optional value per token | Never displace mandatory context |
| Preservation/safety | Validate protocol, instructions, source integrity and outbound safety | Fail closed |
| Provider handoff | Send exactly once to the selected model | No double-send on retry/cancellation |
| Measurement | Record content-free outcomes and evidence class | Missing usage remains unavailable |

## Request contract

The request context must include only the fields required to enforce product behavior:

- request/session identity;
- user prompt and structured message parts;
- selected model identity and budget when exposed;
- explicit selection and document version;
- active file/cursor focus when permitted;
- workspace trust and context mode;
- immutable workspace snapshot identity;
- bounded, consented diagnostic/test/Git/terminal signals;
- cancellation/deadline state.

The contract must not use prompt text, file paths or source code as telemetry dimensions.

## Task policy

| Task class | Mandatory evidence policy | Optimization posture |
|---|---|---|
| Review | Exact focal implementation, contracts, relevant diagnostics/tests | Conservative |
| Debug | Exact focal implementation, failure evidence, dependency path | Conservative |
| Refactor | Exact edit target, public contract, affected callers/tests | Conservative |
| Feature | Exact insertion/change target, interfaces, dependency closure, tests/config | Conservative |
| Test | Exact unit under test, existing tests/fixtures/mocks and failures | Conservative |
| Explain | Exact body or signatures depending question granularity | Moderate |
| Search | Ranked references/signatures; exact source on request | More aggressive |
| Unknown | Exact focal evidence or pass-through | Conservative |

## Retrieval contract

- Candidate discovery and renderable evidence are separate concepts.
- Approximate vectors, hashes and skeletons may rank source but do not become exact source.
- Exact evidence is revalidated against the request snapshot before rendering.
- Provenance identifies origin, version/hash, category and trust.
- Required dependency closure is established before optional diversity.
- Exact duplicates may be merged; semantic differences in logic, literals, paths, nullability, units or test outcome must survive.
- Retrieval reports complete, incomplete-with-shortfall or unusable.

## Context budgeting

Budgeting follows this order:

1. protocol and system constraints;
2. current user instruction;
3. exact user selection;
4. mandatory focal implementation;
5. mandatory errors/tests/contracts/dependencies;
6. recent conversation state;
7. optional supporting evidence;
8. recovery pointers and explanation metadata.

If mandatory evidence cannot fit, the system must not silently remove it. It should reduce optional content, select a larger available model only through explicit user choice, or return a clear constraint.

## Conversation and agentic context

- History remains append-only and byte-stable within an epoch.
- A checkpoint is created only at a token threshold.
- Checkpoints preserve decisions, constraints, referenced files, unresolved tasks and active failures.
- Older successful tool observations may be replaced with deterministic summaries or recovery references.
- Recent observations, errors, exit codes and tool-call identity remain exact.
- The system measures recovery turns because re-fetching omitted content can erase savings.

## Model interaction

- Respect the model selected in VS Code.
- Use model-specific token counting when the host exposes it.
- Do not interpret estimated counts as provider billing.
- Do not send a request more than once without a new, explicit model-turn decision.
- Preserve tools and structured message relationships.
- Treat unknown protocol parts as unsafe rather than dropping them.

## AI evaluation contract

### Unit and structural evaluation

- instruction and protocol preservation;
- exact source and protected-token fidelity;
- stale-snapshot rejection;
- retrieval recall and ranking;
- deterministic output;
- resource bounds.

### Model-task evaluation

- paired baseline/optimized tasks;
- same model, configuration and task;
- tools disabled for isolated context experiments or identically enabled for agentic experiments;
- objective task rubric;
- compile/test/patch outcome where applicable;
- missing-context and recovery behavior;
- input/output/tool tokens and total turns;
- per-workload non-inferiority margin.

### Production evaluation

- opt-in and privacy reviewed;
- completed-task proxy and user confirmation;
- provider usage only when legitimately available;
- cohort, timeframe, version and pricing recorded;
- rollback and kill switch.

## Data and privacy specification

| Data | Default handling | Persistence |
|---|---|---|
| Prompt/source/response | Process for active request and upstream send | Not retained in product analytics |
| Workspace index | Local, trust-bound, bounded | Derived local state; rebuildable |
| Explicit project memory | Off by default, consented, inspectable | Encrypted local storage |
| Optimization metrics | Numeric/content-free | Bounded extension storage |
| Diagnostic export | Sanitized and user initiated | User-selected destination |
| Provider billing usage | Use only if exposed/authorized | Aggregate according to declared policy |

## Reliability specification

- bounded queues and memory;
- cooperative cancellation;
- per-stage deadlines;
- deterministic fallback;
- snapshot/version checks;
- independent internal kill switches;
- clean extension disposal;
- no metrics committed for cancelled/failed sends as successful optimization.

## Technical decision records expected from PM

The PM owns or co-authors decision context, alternatives and customer consequences for:

- native VS Code model path versus direct provider path;
- exact retrieval versus lossy source compression;
- explicit participant versus dedicated sidebar;
- local index scope and retention;
- fixed-turn history versus stable epochs;
- model-counted versus billing-reconciled economics;
- promotion or retirement of learned/heuristic stages.

## Operational SLO hypotheses

To validate before launch:

- p95 added context-compilation latency below 250 ms for a warm typical workspace;
- p95 foreground request admission below 100 ms;
- zero double-send defects;
- zero context-free successful optimizations;
- less than 2% retrieval fallbacks caused by internal error;
- 99.9% of handled requests either send safely or return an actionable failure;
- zero sensitive-content telemetry events.

These are product targets, not current production SLO evidence.

