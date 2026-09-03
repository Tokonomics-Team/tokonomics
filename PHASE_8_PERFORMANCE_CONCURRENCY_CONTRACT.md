# Phase 8 Performance, Concurrency, and Resilience Contract

## Scope and invariants

Phase 8 protects the VS Code extension host from startup I/O, unbounded concurrency,
workspace event storms, large serializable CPU tasks, stale publications, and common
dependency failures. Phase 9 installation and multi-version Extension Host
certification remain out of scope.

The production invariants are:

- activation constructs services and registers contributions, but performs no parser
  binary initialization or workspace scan;
- workspace reads begin only after trust and an explicit request or delayed warming;
- all production queues have fixed capacity, concurrency, cancellation, and disposal;
- a request uses one immutable workspace snapshot and stale index work cannot publish;
- CPU-worker inputs, heap, runtime, and cancellation are bounded;
- optimization failure preserves the canonical input instead of emitting partial output;
- cache and registry cardinality is explicit; and
- missing optional acceleration degrades to a deterministic local fallback.

## Scheduling architecture

Two schedulers isolate workload classes:

| Plane | Concurrency | Queue capacity | Purpose |
| --- | ---: | ---: | --- |
| Compiler/workspace | 2 | 128 | foreground compilation, index updates, warming, experiments |
| Provider inference | 4 | 32 | upstream requests and complete response streams |

Priority is `foreground > index > warming > experiment`. FIFO applies within a
priority. After eight foreground admissions, queued background work receives a turn.
Keyed queued jobs coalesce to the newest version. Higher-priority work may displace a
lower-priority queued job, while equal-priority overflow is rejected. Cancellation is
checked before admission, before execution, and at cooperative yield points. Disposal
cancels queued work and causes running cooperative work to fail at its next checkpoint.

When the compilation queue is saturated, compilation uses an explicit canonical raw
pass-through and records `foreground_queue_full_pass_through`. Provider saturation is
a terminal `PROVIDER_QUEUE_FULL` failure; it never creates an unbounded waiter list.

## Workspace convergence and scaling

- Parser/WASM initialization is promise-coalesced, lazy, and trust-gated.
- Directory discovery uses asynchronous reads and yields every 256 entries.
- File parsing yields every 32 files and remains inside the cancellable index boundary.
- Concurrent full scans coalesce per index instance and epoch.
- A scan captures file sequences before discovery. Editor-buffer updates, deletes, and
  renames with newer sequences therefore win even if a scan completes later.
- File events use one debounce timer and a latest-value map capped at 128 distinct
  paths. Overflow requests a full recovery rebuild rather than allocating more timers.
- Candidate discovery is capped at 50,000 source files by default, individual indexed
  files at the configured byte ceiling, and published snapshots at the RAM budget.
- Repository PageRank executes in a resource-limited worker. A worker failure returns a
  bounded deterministic symbol-order map; cancellation remains cancellation.

## CPU worker boundary

Serializable repository ranking and large inline-image decoding run in Node worker
threads with these defaults:

- 15-second deadline;
- 32 MiB serialized input ceiling;
- 64 MiB old-generation and 16 MiB young-generation worker heap ceilings; and
- active cancellation polling, timeout termination, and extension-disposal cleanup.

Stateful Tree-sitter/WASM parsing stays in the coalesced cooperative index/compiler
boundary because parser instances are not transferable. Its per-file byte ceiling and
frequent event-loop yields bound main-thread occupancy. Image file metadata uses async
filesystem calls, inspects at most 32 references per prompt, and rejects paths outside
the trusted workspace root.

## Bounded state

| State | Ceiling / expiry |
| --- | --- |
| Response cache | configured LRU cardinality, 2 MiB/entry, 32 MiB total |
| Token-count cache | 1,000 short strings |
| Deferred tool schemas | 256 tools, 256 KiB/tool |
| Semantic tool registry | 256 tools, 256 KiB/tool |
| Custom model profiles | 64 profiles |
| Virtual diff documents | 16 documents, 4 MiB/document |
| Local ONNX sessions | 4 sessions plus configured byte budget |
| Project memory | 1,000 items with bounded identifiers, text, and dependencies |
| Cost reconciliation | 1,024 pending and 1,024 recently reconciled; 30-minute TTL |
| Workspace file-event buffer | 128 distinct latest paths |

Workspace indexes and the Phase 7 append-only audit ledger are authoritative datasets,
not caches. Workspace index memory is budgeted; ledger retention is deliberately kept
lossless for lifetime audit semantics and must be addressed through an explicit
retention/archive policy rather than silent cache eviction.

## Failure matrix

| Failure | Safe behavior |
| --- | --- |
| Parser or compiler stage | Preserve original canonical messages; record coded fallback |
| Retrieval | Skip workspace attachment and preserve original messages |
| Tokenizer | Conservative character estimate and raw pass-through |
| Worker timeout/crash/input limit | Preserve image data or use deterministic repo-map fallback |
| Index file read | Skip unreadable/stale record; retain last valid snapshot |
| Index event storm | Bound latest updates and schedule recovery rebuild |
| Provider error | Terminal cost-unavailable failure record |
| Provider queue full | Reject with terminal `PROVIDER_QUEUE_FULL` record |
| Cancellation | Stop at checkpoint; never commit a successful lifecycle |
| Observability storage | Continue request processing; storage failure is non-blocking |

Fallback traces contain codes, not source text or raw dependency error messages.

## Measured local baseline

Measured on 2026-09-03 using Node 24.19.0 on an AMD Ryzen 7 9800X3D
(8 cores / 16 logical processors) with 31 GiB RAM. The filesystem corpus contains one
small TypeScript symbol per file. These are controlled engineering measurements, not
production or marketplace claims.

| Checkpoint | Observed wall time |
| --- | ---: |
| Registration-only mocked activation | 1.74 ms |
| Initial 100-file index | 45 ms |
| Rebuild at 1,000 files | 412 ms |
| Rebuild at 10,000 files | 3,839 ms |

The 10,000-file snapshot stayed within a 16 MiB configured component budget and
recorded 4,273 event-loop timer ticks during the three scans. Measurements vary with
hardware, filesystem cache, antivirus, file size, language, and symbol density.

## Hardware-tier acceptance targets

These are regression ceilings, not claimed typical performance:

| Tier | Reference resources | Activation | 10,000 small files | Component index memory |
| --- | --- | ---: | ---: | ---: |
| A | 4 cores, 8 GiB | <100 ms | <60 s | configured budget |
| B | 8 cores, 16 GiB | <75 ms | <30 s | configured budget |
| C | 8+ modern cores, 32 GiB | <50 ms | <15 s | configured budget |

Every tier must also keep queue peaks at or below capacity, allow event-loop progress,
converge rapid edits to the newest sequence, and prevent successful commits after
cancellation.

## Automated verification

`tests/phase8PerformanceResilience.test.ts` covers priority/FIFO behavior, starvation
limits, coalescing, displacement, queue overflow, running cancellation, raw
pass-through, coded failure privacy, cache ceilings, CPU image workers, worker failure,
real 100/1,000/10,000-file scans, memory budget, event-loop progress, worker PageRank,
and a 500-file event storm. The comprehensive host test independently verifies lazy
parser activation and its 100 ms ceiling. Existing Phase 2 and Phase 3 tests verify
provider cancellation/protocol failure and scan-versus-editor convergence.
