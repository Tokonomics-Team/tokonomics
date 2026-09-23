# Product Vision and Strategy

## One-line product concept

Tokonomics helps developers send AI coding assistants the smallest context that is still sufficient to complete the task, while making context and cost evidence understandable.

## Origin story

AI coding assistants can repeatedly receive large files, workspace snippets, tool outputs and conversation history. Developers often cannot see what context is necessary, how much is repeated, or whether shortening it will damage the answer. The original Tokonomics concept was to compress this context before it reached the selected model.

The first product hypothesis was too broad: “less context produces lower cost without reducing quality.” Implementation and evaluation showed a more nuanced reality. Whole-file source code has little safely removable content, while retrieval can avoid sending unrelated files. A real-model pilot also demonstrated that aggressive evidence selection can reduce tokens and still increase completed-task cost by causing failures.

That evidence produced a sharper strategy.

## Product vision

Developers should be able to use capable AI coding tools without paying for, waiting on, or reasoning over context that does not help complete the task.

## Mission

Make AI development context efficient, sufficient, inspectable and trustworthy.

## Customer problem

Developers experience four related problems:

1. **Context waste:** irrelevant files, repeated tool output and stale history consume model context.
2. **Context uncertainty:** users do not know what the model received or what was omitted.
3. **Quality risk:** naive compression can remove exactly the evidence required for debugging, review or code changes.
4. **Economic opacity:** token counts, cache behavior and provider costs are inconsistent or unavailable across tools.

## Target customer

### Primary initial segment

Professional developers and AI platform teams using long, multi-file or agentic coding workflows where context is metered, quota-limited, latency-sensitive, or governed.

### Secondary segment

Developers on fixed-price AI seats who value more useful work per context window, longer sessions, lower latency and clearer context visibility rather than direct bill reduction.

### Explicitly not the initial target

- occasional users working on small files;
- developers expecting invisible interception of other extensions;
- teams requiring a direct provider gateway or self-hosted inference server;
- users whose only success criterion is the largest possible compression percentage.

## Jobs to be done

### Functional job

When I ask an AI assistant to work on a repository, help it receive enough exact evidence to complete the task without sending unrelated or repeated context.

### Emotional job

Help me trust that context optimization will not silently make the assistant worse.

### Social/organizational job

Help me explain and govern AI context usage without exposing source code or inventing savings.

## Value proposition

Tokonomics does not promise to compress every prompt. It promises to:

- preserve required instructions and exact code evidence;
- avoid unnecessary multi-file and repeated agentic context;
- fail safely when sufficiency cannot be established;
- show what is measured, estimated, unavailable or unverified;
- respect workspace trust and user context choices.

## Strategic pillars

### 1. Sufficiency before savings

Required evidence is selected and protected before optional context is optimized. An incomplete task is more expensive than a larger successful prompt.

### 2. Retrieval before transformation

Avoid attaching irrelevant content. Do not aggressively rewrite fragile source code simply to improve a token metric.

### 3. Optimize the complete task

The denominator is successful work: all prompts, tool calls, retries, output tokens, latency and local compute required to finish.

### 4. Trustworthy evidence

Every product claim has a classification and artifact. Missing provider usage remains unavailable rather than becoming zero.

### 5. Simple control surface

The product retains four understandable settings and hides experimental complexity behind evidence-based defaults.

## Product principles

- Exact source beats a clever summary when code must change.
- A safe no-op is a successful outcome.
- Large token reduction with lower task success is a failed experiment.
- The active developer choice and selected model are respected.
- Context is evidence, not instruction; retrieved content must not override the user.
- Local processing does not mean prompts stay local; outbound behavior must be explicit.
- Provider billing data and model-token estimates are different evidence classes.
- Features that do not improve outcomes should not remain enabled for architectural prestige.

## North-star outcome

**Successful AI-assisted development tasks per constrained resource unit.**

The constrained resource may be billed dollars, premium request allowance, context-window capacity or developer time. The product must declare which one it measures.

## Strategic success targets

These are targets, not current results:

- At least 95% of optimized tasks meet a workload-specific non-inferiority threshold.
- At least 10% net completed-task input-cost reduction for validated multi-file and agentic workloads.
- Less than 2% context-recovery escalation attributable to missing Tokonomics evidence.
- Zero critical trust, privacy or outbound-context defects.
- At least 80% of activated beta users complete a second optimized task within seven days.
- At least 70% of beta users can correctly explain whether a dashboard cost is measured, projected or unavailable.

## Business model hypotheses

No revenue model has been validated. Candidate hypotheses are:

- free individual extension with paid team governance and evidence exports;
- paid enterprise policy, administration and usage analytics;
- developer-seat pricing tied to validated capacity or metered-cost benefits;
- open/free core experience with commercial compliance and fleet management.

The product should not charge for savings until those savings are measurable for the target billing model.

## Strategic risks

| Risk | Why it matters | Strategic response |
|---|---|---|
| Native assistants optimize context themselves | Tokonomics can become redundant | Focus on cross-model transparency, governance and validated workload gaps |
| Fixed-price seats do not yield cash savings | Dollar positioning becomes misleading | Position capacity/latency separately from metered cost |
| Retrieval omits dependencies | Failed tasks erase savings | Exact-evidence contracts and recovery-rate gates |
| Users must change workflow | Adoption friction | Keep `@tokonomics`, validate sidebar, minimize settings |
| Provider APIs hide billing/cache data | ROI cannot be reconciled | Honest evidence labels and optional enterprise usage integration only if supported |
| Complex architecture delays learning | Development effort outruns customer evidence | Require outcome evidence before promoting a component |

## Strategy statement

For professional developers and AI platform teams running large-context coding workflows, Tokonomics is a trust-aware context-efficiency layer that reduces unnecessary context while preserving exact task evidence. Unlike generic prompt compressors, it evaluates completed-task quality, fails safely, and distinguishes measured evidence from estimates.

