# Interview and Presentation Pack

## 30-second introduction

“I built Tokonomics, a VS Code extension exploring how to reduce unnecessary AI coding context without reducing task quality. I took it from product framing through a working 8.1.0 implementation, privacy and release controls, multi-turn agentic state handover (`/handoff`), and an evaluation system. The key decision came when a benchmark showed 83.9% context reduction but a real-model pilot dropped success from 14 out of 14 to 11 out of 14. I rejected the savings claim, reframed the north star around successful tasks per constrained resource, and prioritized dependency closure and agentic state management rather than adding more compression.”

## Two-minute case-study narrative

### Situation

AI coding tools can repeatedly process large files, tool output and conversation history. I saw a potential opportunity to reduce cost and context pressure through a VS Code extension.

### Task

Define and build a trustworthy product that produced measurable resource savings with minimal quality loss, while remaining compatible with selected VS Code models and respecting workspace privacy.

### Actions

- Defined target users, JTBD, product principles and four-setting UX.
- Translated context quality into exact-evidence and preservation requirements.
- Built a staged measurement ladder from deterministic checks to paired real-model tasks.
- Used ablation to distinguish useful retrieval stages from inert complexity.
- Added explicit evidence labels for estimated, controlled, reconciled, unavailable and unverified results.
- Rejected a seemingly positive 16.85% pilot reduction because task success fell 21.43 points.
- Reprioritized the roadmap around dependency closure, agentic outcome evaluation and customer discovery.

### Result

The result is a working, extensively tested technical product and a more credible strategy. It is not yet commercially validated, and I can state exactly why. The project demonstrates product judgment, AI evaluation rigor and willingness to stop a misleading metric.

## Ten-minute presentation outline

### Slide 1 — The customer problem

AI coding context is costly, opaque and quality-sensitive.

### Slide 2 — Segments and economics

Metered spend versus fixed seats versus quota/context constraints.

### Slide 3 — Product hypothesis

Smaller sufficient context can improve completed-task efficiency.

### Slide 4 — Experience

Explicit participant, four settings, selected model, transparent dashboard.

### Slide 5 — AI product contract

Exact evidence, retrieval first, safe fallback, one send path.

### Slide 6 — Measurement strategy

Structural fidelity → model tasks → agentic tasks → beta outcomes → business impact.

### Slide 7 — The uncomfortable result

83.9% static reduction versus 16.85% real-model context reduction and a 21.43-point success regression.

### Slide 8 — Decision and roadmap

Reject claim; fix dependency closure; target safe multi-file and agentic workloads.

### Slide 9 — Trust and launch

Workspace consent, no raw telemetry, evidence labels, staged rollout and rollback.

### Slide 10 — Leadership lesson

Optimize the customer outcome, not the attractive local metric.

## STAR stories

### Customer obsession / product judgment

**Situation:** An 83.9% retrieval-context reduction appeared highly marketable.  
**Task:** Decide whether it represented customer value.  
**Action:** Added paired real-model evaluation and complete-task quality guardrails.  
**Result:** Discovered a 21.43-point quality regression, rejected the claim and prevented a harmful launch narrative.

### Dive deep / technical fluency

**Situation:** Component tests were green, but savings still lacked credibility.  
**Task:** Find the gap between pipeline correctness and model outcome.  
**Action:** Separated exact source, retrieval sufficiency, provider usage and task success into distinct evidence classes; ran stage ablation.  
**Result:** Identified dependency closure as the causal product gap and semantic deduplication as inert on the corpus.

### Simplify

**Situation:** The extension accumulated many capabilities and configuration possibilities.  
**Task:** Keep it understandable for developers.  
**Action:** Reduced the public surface to four settings and kept internal optimization policies behind evidence-based modes.  
**Result:** A clearer onboarding and lower configuration burden while preserving technical flexibility.

### Ownership / deliver results

**Situation:** The project required product, engineering, evaluation, privacy and release work.  
**Task:** Move from idea to a reviewable release candidate.  
**Action:** Created phase gates, automated validation, packaging controls, risk registers and an evidence ledger.  
**Result:** Produced a working 8.1.0 artifact and a truthful hold decision rather than an unsupported launch.

### Learn and be curious

**Situation:** The original compression hypothesis did not survive deeper evaluation.  
**Task:** Decide whether to continue, pivot or stop.  
**Action:** Researched caching, retrieval and agentic efficiency; compared them with actual implementation; reframed the value around complete-task economics.  
**Result:** Narrowed the strategy and established explicit stop/pivot criteria.

## Google Product Manager Interview Alignment

### 1. Product Design & 10x Product Sense
- **First-Principles Problem Framing:** Context bloat is not simply a financial nuisance; it creates "needle in a haystack" attention degradation in LLMs. Squeezing prompts with lossy regexes destroys code syntax.
- **10x Solution:** Instead of building another client-side minifier, built an active context compiler that combines AST-aware focal retrieval, multi-turn state synthesis (`/handoff`), and semantic log tombstoning.
- **Progressive Disclosure:** Exposes exactly 4 core settings to end developers, hiding complex compiler mechanics behind evidence-backed defaults.

### 2. Analytical Rigor & Google Metrics (HEART & GSM)
- **Framework Application:** Structured product health through Google's HEART (Happiness, Engagement, Adoption, Retention, Task Success) and GSM (Goals, Signals, Metrics).
- **Metric Discipline:** Rejected the vanity metric of "99% prompt compression" in favor of `Successful tasks per constrained resource unit`.
- **Counter-Metric Rigor:** Enforced non-inferiority margins where any token reduction that degrades task completion by >0 pp is rejected as a Pareto-inferior regression.

### 3. Technical PM Depth (AI/ML TPM)
- **Local vs Remote Architecture:** Kept compilation strictly local using Tree-sitter WebAssembly parsers, guaranteeing zero code egress and zero latency overhead from intermediate cloud proxies.
- **Prompt Cache Alignment:** Designed deterministic byte-stable prefixes to leverage Anthropic and Gemini KV prompt caching, turning static context into 90% cheaper cache reads.
- **Decoupled Interoperability:** Architected `tokonomics-mcp` so external CLI agents (Codex CLI, Claude Code CLI) can consume the optimizer via the standard Model Context Protocol.

### 4. Strategic Execution & Leadership
- **Integrity over Optics:** Courage to kill a marketable 83.9% compression headline after discovering a 21.43 pp task-success regression in paired model evals.
- **Supply-Chain Release Readiness:** Verified 100% clean-room build with CycloneDX SBOM, SLSA provenance, and zero external runtime dependencies.

## Likely interview questions

### Why is this a product rather than an engineering project?

Because the hard decisions concern customer segment, pricing model, workflow adoption, trust, evidence and quality-cost trade-offs. The technical system is necessary, but the product succeeds only if it improves completed work for a defined customer.

### What would you do differently?

Run customer discovery and a small model-task experiment before implementing a broad component set. I would start with a narrow large-repository/agentic workflow and require outcome evidence before expanding.

### What was your biggest mistake?

Initially treating token reduction as a sufficient proxy for value. It encouraged architecture expansion before proving task outcomes. The correction was to make quality and recovery part of the economic metric.

### What is the moat?

There is no proven moat yet. Potential defensibility could come from trusted cross-model workflow integration, high-quality task/evidence evaluation, enterprise policy and accumulated privacy-safe outcome data. Native assistants remain a major competitive threat.

### How would you monetize it?

I would not monetize universal “savings.” I would validate paid enterprise governance and metered-efficiency use cases with design partners, then price only after reconciled customer value is demonstrated.

### How would you prioritize next?

First customer validation, then the three known dependency-closure failures, then powered task evaluation, then agentic capacity quality. Sidebar and advanced algorithms wait.

### How do you handle model nondeterminism?

Use paired designs, frozen tasks, objective compile/test rubrics, repeated samples, confidence intervals, transport-failure separation and per-workload margins. Structural tests remain necessary but not sufficient.

### How would this operate at Google/Meta/Amazon scale?

I would separate the portable product contract from infrastructure: define customer outcomes, data boundaries and evals centrally; use platform-native model, telemetry and deployment systems; run staged cohorts; and require workload-level quality and cost evidence before global rollout.

## Resume bullets

Customize scope and avoid implying a team or production launch that did not occur.

- Built and product-led Tokonomics 8.1.0, a VS Code AI context-efficiency extension with a four-setting UX, trust-aware workspace context, agentic state handover (`/handoff`), and automated release validation.
- Designed an AI evaluation ladder spanning exact-source preservation, retrieval ablation and paired real-model tasks; rejected a 16.85% token reduction after detecting a 21.43-point task-success regression.
- Reframed the product north star from prompt compression to successful development tasks per constrained resource, applying Google HEART and GSM frameworks to balance quality, cost, latency, and privacy trade-offs.
- Established evidence and claim governance that separates controlled benchmarks, model-counted usage, projected economics and provider-reconciled outcomes.
- Defined customer discovery, PRD, technical product contracts, staged GTM, trust controls and rollback criteria for a 0-to-1 developer AI product.

## Portfolio demo script

1. Show the four settings and explain the recommended defaults.
2. Run a selected-code prompt and show that the exact selection is protected.
3. Run a request that safely passes through and explain why 0% can be correct.
4. Show dashboard evidence labels and an unavailable cost state.
5. Demonstrate `/handoff` summarizing a 15-turn debugging session into a clean state handover.
6. Show the benchmark summary and the rejected pilot result.
7. End with the next decision: dependency closure and powered beta evaluation.

Do not use a demo that only animates a large token-saving percentage.

