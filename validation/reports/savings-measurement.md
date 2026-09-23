# Tokonomics Savings Measurement

> Generated: `2026-09-07T15:43:50.587Z`
> Classification: `controlled-real-code-measurement-not-production-evidence`

Measured by running the production compiler over this repository's own TypeScript.
A case is **lossless** when every exported name and every public method survives and at
least 95% of control-flow constructs remain in what the model receives.

## Profile: balanced

| Metric | Value |
|---|---:|
| Cases | 40 |
| Overall input reduction | 0.2% |
| Task-weighted reduction | 0.2% |
| Lossless cases | 40 / 40 |
| **Reduction on lossless cases** | **0.2%** |
| Degraded cases | 0 / 40 |
| Reduction on degraded cases | 0.0% |
| Degraded yet no gate fired | 0 |
| Lowest control-flow retention | 100% |
| Instruction intact | 40 / 40 |

| File | Task | Before | After | Reduction | Exported kept | Public kept | Control flow | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `modelHistory.ts` | explain | 616 | 616 | 0% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | refactor | 612 | 612 | 0% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | feature | 617 | 617 | 0% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | review | 613 | 613 | 0% | 2/2 | n/a | 100% | lossless |
| `providerGateway.ts` | explain | 775 | 775 | 0% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | refactor | 771 | 771 | 0% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | feature | 776 | 776 | 0% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | review | 772 | 772 | 0% | 2/2 | 2/2 | 100% | lossless |
| `chatProtocol.ts` | explain | 4129 | 4129 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | refactor | 4125 | 4125 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | feature | 4130 | 4130 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | review | 4126 | 4126 | 0% | 16/16 | n/a | 100% | lossless |
| `inlineEvidenceClassifier.ts` | explain | 4600 | 4602 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | refactor | 4596 | 4598 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | feature | 4601 | 4603 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | review | 4597 | 4599 | 0% | 2/2 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | explain | 3643 | 3643 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | refactor | 3639 | 3639 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | feature | 3644 | 3644 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | review | 3640 | 3640 | 0% | 3/3 | 1/1 | 100% | lossless |
| `embeddingProvider.ts` | explain | 3508 | 3432 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | refactor | 3508 | 3432 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | feature | 3508 | 3432 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | review | 3507 | 3431 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `modelProvider.ts` | explain | 5305 | 5304 | 0% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | refactor | 5305 | 5304 | 0% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | feature | 5305 | 5304 | 0% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | review | 5305 | 5303 | 0% | 4/4 | 3/3 | 100% | lossless |
| `prefixContinuity.ts` | explain | 1677 | 1679 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | refactor | 1673 | 1675 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | feature | 1678 | 1680 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | review | 1674 | 1676 | 0% | 4/4 | n/a | 100% | lossless |
| `safePathPolicy.ts` | explain | 2964 | 2966 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | refactor | 2960 | 2962 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | feature | 2965 | 2967 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | review | 2961 | 2963 | 0% | 10/10 | n/a | 100% | lossless |
| `aligner.ts` | explain | 2687 | 2687 | 0% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | refactor | 2687 | 2687 | 0% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | feature | 2687 | 2687 | 0% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | review | 2687 | 2686 | 0% | 2/2 | 3/3 | 100% | lossless |

## Profile: maximum

| Metric | Value |
|---|---:|
| Cases | 40 |
| Overall input reduction | 0.3% |
| Task-weighted reduction | 0.2% |
| Lossless cases | 40 / 40 |
| **Reduction on lossless cases** | **0.3%** |
| Degraded cases | 0 / 40 |
| Reduction on degraded cases | 0.0% |
| Degraded yet no gate fired | 0 |
| Lowest control-flow retention | 100% |
| Instruction intact | 40 / 40 |

| File | Task | Before | After | Reduction | Exported kept | Public kept | Control flow | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `modelHistory.ts` | explain | 616 | 606 | 1.6% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | refactor | 612 | 612 | 0% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | feature | 617 | 617 | 0% | 2/2 | n/a | 100% | lossless |
| `modelHistory.ts` | review | 613 | 613 | 0% | 2/2 | n/a | 100% | lossless |
| `providerGateway.ts` | explain | 775 | 750 | 3.2% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | refactor | 771 | 771 | 0% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | feature | 776 | 776 | 0% | 2/2 | 2/2 | 100% | lossless |
| `providerGateway.ts` | review | 772 | 772 | 0% | 2/2 | 2/2 | 100% | lossless |
| `chatProtocol.ts` | explain | 4129 | 4129 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | refactor | 4125 | 4125 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | feature | 4130 | 4130 | 0% | 16/16 | n/a | 100% | lossless |
| `chatProtocol.ts` | review | 4126 | 4126 | 0% | 16/16 | n/a | 100% | lossless |
| `inlineEvidenceClassifier.ts` | explain | 4600 | 4602 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | refactor | 4596 | 4598 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | feature | 4601 | 4603 | 0% | 2/2 | 1/1 | 100% | lossless |
| `inlineEvidenceClassifier.ts` | review | 4597 | 4599 | 0% | 2/2 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | explain | 3643 | 3643 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | refactor | 3639 | 3639 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | feature | 3644 | 3644 | 0% | 3/3 | 1/1 | 100% | lossless |
| `conservativePathCompressor.ts` | review | 3640 | 3640 | 0% | 3/3 | 1/1 | 100% | lossless |
| `embeddingProvider.ts` | explain | 3508 | 3423 | 2.4% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | refactor | 3508 | 3432 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | feature | 3508 | 3432 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `embeddingProvider.ts` | review | 3507 | 3431 | 2.2% | 4/4 | 4/4 | 100% | lossless |
| `modelProvider.ts` | explain | 5305 | 5295 | 0.2% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | refactor | 5305 | 5304 | 0% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | feature | 5305 | 5304 | 0% | 4/4 | 3/3 | 100% | lossless |
| `modelProvider.ts` | review | 5305 | 5303 | 0% | 4/4 | 3/3 | 100% | lossless |
| `prefixContinuity.ts` | explain | 1677 | 1679 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | refactor | 1673 | 1675 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | feature | 1678 | 1680 | 0% | 4/4 | n/a | 100% | lossless |
| `prefixContinuity.ts` | review | 1674 | 1676 | 0% | 4/4 | n/a | 100% | lossless |
| `safePathPolicy.ts` | explain | 2964 | 2966 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | refactor | 2960 | 2962 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | feature | 2965 | 2967 | 0% | 10/10 | n/a | 100% | lossless |
| `safePathPolicy.ts` | review | 2961 | 2963 | 0% | 10/10 | n/a | 100% | lossless |
| `aligner.ts` | explain | 2687 | 2679 | 0.3% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | refactor | 2687 | 2687 | 0% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | feature | 2687 | 2687 | 0% | 2/2 | 3/3 | 100% | lossless |
| `aligner.ts` | review | 2687 | 2686 | 0% | 2/2 | 3/3 | 100% | lossless |

## Retrieval-first: balanced

Bare instruction plus workspace retrieval, versus forwarding the whole subsystem bundle.

| Metric | Value |
|---|---:|
| Cases | 5 |
| Attached bundle | 81364 tokens |
| Retrieved | 19159 tokens |
| **Saving vs attaching** | **76.5%** |
| Evidence rendered | 5 / 5 |
| Context-free payloads | 0 (must be 0) |

| Task | Attached | Retrieved | Saving | Candidates | Contract | Rendered | Shortfall | Carries code |
|---|---:|---:|---:|---:|---|---|---|---|
| debug | 16278 | 4449 | 72.7% | 10 | incomplete | yes | declared | yes |
| search | 16269 | 3330 | 79.5% | 10 | complete | yes | — | yes |
| explain | 16272 | 2813 | 82.7% | 10 | complete | yes | — | yes |
| refactor | 16271 | 3989 | 75.5% | 10 | incomplete | yes | declared | yes |
| feature | 16274 | 4578 | 71.9% | 10 | incomplete | yes | declared | yes |

## Retrieval-first: maximum

Bare instruction plus workspace retrieval, versus forwarding the whole subsystem bundle.

| Metric | Value |
|---|---:|
| Cases | 5 |
| Attached bundle | 81243 tokens |
| Retrieved | 13116 tokens |
| **Saving vs attaching** | **83.9%** |
| Evidence rendered | 5 / 5 |
| Context-free payloads | 0 (must be 0) |

| Task | Attached | Retrieved | Saving | Candidates | Contract | Rendered | Shortfall | Carries code |
|---|---:|---:|---:|---:|---|---|---|---|
| debug | 16278 | 2729 | 83.2% | 10 | incomplete | yes | declared | yes |
| search | 16209 | 2654 | 83.6% | 10 | complete | yes | — | yes |
| explain | 16211 | 3912 | 75.9% | 10 | complete | yes | — | yes |
| refactor | 16271 | 2388 | 85.3% | 10 | incomplete | yes | declared | yes |
| feature | 16274 | 1433 | 91.2% | 10 | incomplete | yes | declared | yes |

## Agentic trajectory (observation masking)

Tool observations are the bulk of a long agentic turn and bypass the text compiler entirely,
because a request carrying tool results is structured and forwarded unchanged.

| Metric | Value |
|---|---:|
| Tool calls | 12 |
| Observation characters | 48000 |
| Payload | 50442 -> 19410 chars |
| **Masking reduction** | **61.5%** |
| Observations masked | 8 / 12 |
| Message count preserved | true |
| Tool-call identifiers preserved | true |
| Recent observations intact | true |
| Boundary stable across turns | true |

## Corpus

| File | Lines | SHA-256 |
|---|---:|---|
| `src/history/modelHistory.ts` | 23 | `e81d417dcbace32b…` |
| `src/protocol/providerGateway.ts` | 43 | `3537280d13fbd9a6…` |
| `src/ui/chatProtocol.ts` | 179 | `1c65ef27cf9ce1ed…` |
| `src/governor/inlineEvidenceClassifier.ts` | 192 | `22a85711b5d1335c…` |
| `src/compression/conservativePathCompressor.ts` | 179 | `41f4f33b71aa94b5…` |
| `src/search/embeddingProvider.ts` | 290 | `0ecaeb9d460fed74…` |
| `src/proxy/modelProvider.ts` | 397 | `c5e994f1be884ee8…` |
| `src/engine/prefixContinuity.ts` | 75 | `e12c3871f3f0db1a…` |
| `src/engine/safePathPolicy.ts` | 158 | `a788465b6ad4476c…` |
| `src/cache/aligner.ts` | 240 | `30f215fc0ccba7ea…` |

## Limitations

- Session capacity measures how many agentic turns fit before the window is exhausted. It says nothing about whether the answers stay correct as observations are masked; that requires a model-task evaluation on agentic trajectories, which has not been run.
- Measures information retention, not downstream answer quality. Proving no degradation requires running the same tasks through a real model with and without optimization and scoring task success.
- The corpus is this repository's own TypeScript. It is real production code but one language and one codebase; other languages and repository shapes may compress differently.
- The attachment corpus carries a single attached file and no workspace snapshot, so retrieval, LSP and dense-retrieval stages do not participate there; the retrieval-first section below exercises them against a real index.
- Token counts come from the local estimator, not a provider tokenizer, so absolute values carry that estimator's error. Ratios are affected far less than absolute counts.
- Cost conversion is not performed here. Spend depends on the caller's model, cache behaviour and output volume.
- The retrieval-first figures compare against forwarding a five-file bundle. A developer attaching one small file has far less to save, so this is an upper bound for that workload shape, not a universal rate.
- contextFreePayloads is the load-bearing check in the retrieval section: a payload with no code scores as a near-total saving on any token counter, so the saving figure alone cannot be trusted without it.
