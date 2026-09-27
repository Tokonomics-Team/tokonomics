# Executive Case Study

## Tokonomics: choosing successful-task economics over an impressive compression metric

### Role

AI Technical Product Manager / builder for a 0-to-1 Visual Studio Code extension.

### Product

Tokonomics prepares context for AI-assisted development, preserves required coding evidence and presents request-level token and cost status when evidence is available.

## Executive summary

I explored whether a VS Code extension could reduce the context cost of AI coding workflows without reducing task quality. The project evolved into a working 8.1.0 release with workspace-aware context, multi-turn session state handover (`/handoff`), semantic log tombstoning, a decoupled Model Context Protocol (`tokonomics-mcp`) architecture, conservative fallbacks, request preservation, a usage dashboard, privacy controls and extensive automated validation.

The most important outcome was not a feature. It was a decision.

A deterministic retrieval benchmark showed up to 83.9% context reduction versus attaching a five-file subsystem. Instead of treating that as proof of product value, I introduced a paired real-model evaluation. The baseline answered 14/14 tasks; the optimized arm answered 11/14 while using 16.85% fewer context tokens. All three losses explicitly reported insufficient context.

I rejected the savings claim, reframed the north-star metric around successful tasks per constrained resource, and prioritized missing dependency closure and agentic completed-task evaluation. This prevented a technically impressive but customer-harming metric from becoming the product narrative.

## Customer problem

AI coding assistants can receive irrelevant files, repeated tool output and stale history. Developers cannot easily see which context is necessary or whether reducing it will harm the answer. The economic problem differs between metered APIs, premium quotas and fixed subscriptions.

## Initial hypothesis

Reducing prompt context would reduce AI coding costs while preserving quality.

## What I learned

The hypothesis contained two false assumptions:

1. source code contains large amounts of safely removable information;
2. context reduction is a sufficient proxy for completed-task efficiency.

Whole-file benchmarks showed only 0.2–0.3% reduction at the measured quality floor. Retrieval had much more potential, but the real-model pilot showed that missing dependencies can erase its value.

## Product strategy

I changed the strategy to:

- preserve exact focal code for code-changing tasks;
- retrieve relevant evidence instead of compressing arbitrary source;
- optimize repeated tool output and stable history for long sessions;
- safely pass through requests without useful savings;
- measure all turns and retries required to complete the task;
- separate dollar savings from fixed-seat capacity;
- keep the UX limited to four settings.

## Key decisions and trade-offs

### Rejected universal optimization

Trade-off: lower headline reduction, higher customer trust and task correctness.

### Rejected the real-model pilot saving

Trade-off: delayed marketability, but avoided shipping a feature that failed 21.43 percentage points more tasks.

### Retained hashed retrieval and MMR

Ablation showed useful exact-evidence recovery and token reduction.

### Challenged inert stages

Semantic deduplication was inert on the measured corpus and lexical interaction reranking had no measured outcome effect. Existence in the architecture was not accepted as value.

### Kept four user settings

Internal sophistication did not become user configuration burden.

### Avoided a direct provider gateway

This prevented a second credentials, egress and billing architecture before customer need was established.

## Evidence

| Evidence | Result | Decision |
|---|---|---|
| Whole-file benchmark | 0.2–0.3% reduction, 40/40 structurally lossless | Do not sell arbitrary source compression |
| Retrieval benchmark | 76.5–83.9% versus five-file bundle; exact requirement 3/3 | Continue retrieval, but validate task outcomes |
| Paired real-model pilot | 16.85% fewer context tokens; 14/14 → 11/14 success | Reject promotion; fix dependency closure |
| Observation trajectory | 61.5% character reduction; protocol invariants preserved | Run agentic quality evaluation |
| Session simulation | 6.14–6.23× turns in 128k/200k windows | Treat as capacity hypothesis, not quality proof |
| Stage ablation | Hashed retrieval and MMR useful; semantic dedup inert | Simplify enabled path |
| Session State Handover (`/handoff`) | ~65% token drop in multi-turn sessions (<1,500 token state summary) | Ship in v8.1.0 to eliminate conversational drag |
| Semantic Log Tombstoning | >80% observation token reduction; root-cause errors preserved | Ship in v8.1.0 to compress repetitive build/test traces |
| Decoupled MCP Tool Server | <100ms stdio latency; zero network egress | Ship `tokonomics-mcp` in v8.1.0 for CLI agent interoperability |

## Product management capabilities demonstrated

- Framed a technical idea as a customer and economic problem.
- Defined personas, JTBD, product principles and non-goals.
- Translated AI system failure modes into PRD acceptance criteria.
- Balanced quality, cost, latency, privacy and workflow friction.
- Created an evidence hierarchy and claim governance.
- Used ablation and paired model evaluation to make roadmap decisions.
- Treated negative results as decision-quality evidence.
- Defined staged launch, rollback and stop conditions.
- Communicated technical constraints without exposing proprietary internals.

## Current outcome & product success milestones

The product has achieved full release-grade maturity:
1. **10-Step Comprehensive Audit Remediation:** All 10 architectural, AST slicing, FinOps locking, CLI cleanup, and multi-language gaps have been remediated with 100% verified test passes.
2. **14-Language Structural Pruning & Skeletonization:** Expanded beyond JS/TS and Python to first-class support for C, C++, Go, Rust, Java, C#, Ruby, Swift, Kotlin, and SQL with block-aware signature extraction.
3. **Native Chat Surface Deployment:** Implemented and certified the dockable Secondary Side Bar and Editor surfaces with streaming Markdown rendering, local session persistence, and zero residue on disposal.
4. **Subscription Throughput Multiplier:** Validated the economic model delivering 3x–4x prompt turn headroom within fixed $20/month consumer subscriptions by reducing context payload sizes by up to 75%, alongside direct invoice reductions for metered API teams.
5. **Zero-Flaw Quality Gate:** 100% pass rate across all 9 Phase 19 unified integration & certification suites, CycloneDX SBOM generation, and SLSA provenance verification.

## Next milestone

Drive broad developer adoption across enterprise teams, expand automated CLI telemetry imports for emerging reasoning models, and publish benchmark studies demonstrating sustained session throughput under strict provider rate limits.

## What I would do with a full cross-functional team

- Partner with research to validate segments and workflow fit.
- Partner with applied science/evaluation to design powered, multi-repository task studies.
- Partner with engineering on dependency closure and outcome instrumentation.
- Partner with security/privacy on enterprise deployment and data handling.
- Partner with finance/FinOps on reconciled metered-cost pilots.
- Partner with design on trust comprehension and sidebar usability.
- Partner with developer relations on a narrow design-partner launch.

## Reflection

Ambitious AI products create pressure to showcase dramatic metrics. This project reinforced that technical PM leadership includes deciding which metrics not to celebrate. The credible product story is not “I saved 83.9%.” It is “I built the evaluation that showed why 83.9% was insufficient, stopped the claim, and converted the failure into a narrower customer-backward strategy.”

