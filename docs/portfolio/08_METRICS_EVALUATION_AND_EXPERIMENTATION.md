# Metrics, AI Evaluation, and Experimentation

## Measurement philosophy

AI product quality and efficiency are coupled. A shorter prompt is not a product win if the model fails, asks for context again or produces an unusable patch.

## North-star metric

**Successful AI-assisted development tasks per constrained resource unit.**

The metric must always name:

- task definition;
- success rubric;
- constrained resource;
- model and product version;
- workload/cohort;
- timeframe.

## Metric tree

```text
Successful tasks per resource unit
├── Task outcome
│   ├── requested behavior satisfied
│   ├── patch applies and compiles
│   ├── relevant/hidden tests pass
│   └── no unsupported edits
├── Resource consumption
│   ├── input/output/cache tokens
│   ├── model and tool turns
│   ├── elapsed time / TTFT
│   └── local CPU and memory
├── Context quality
│   ├── mandatory evidence recall
│   ├── exact-source fidelity
│   ├── dependency closure
│   └── recovery/escalation rate
└── Product health
    ├── activation and retention
    ├── fallback/error rate
    ├── trust/comprehension
    └── privacy/security incidents
```

## Google HEART Metrics Framework

The Google HEART framework maps user-centered product dimensions into quantifiable technical signals and measurable outcomes:

| Dimension | Goal | Signal | Metric | Target |
|---|---|---|---|---|
| **Happiness** | Developers trust that optimization preserves complete context correctness | High subjective trust ratings, transparent fallback clarity, low disable rate | CSAT on context relevance (1–5 scale); <1% disabling due to "missing context" | CSAT ≥ 4.2 / 5.0 |
| **Engagement** | Developers routinely use Tokonomics across daily coding workflows | High session frequency, dashboard inspections, `/handoff` calls, command executions | Weekly active sessions; `/handoff` invocation rate per long task | ≥ 3 active sessions / developer-week |
| **Adoption** | Developers activate context efficiency immediately upon installation | Extension install-to-first-task completion; participant discovery | % installs executing ≥1 optimized task within 24h | ≥ 60% activation rate |
| **Retention** | Sustained long-term workflow integration across development cycles | Consistent weekly usage across sprints and repository switches | Week 1, Week 4, and Week 12 active cohort retention | W4 retention ≥ 45% |
| **Task Success** | Non-inferior completed-task outcomes with reduced cost & turns | Tests pass, patch applies cleanly, no unsupported edits, no context errors | Task completion rate vs unoptimized baseline; recovery rate <2% | Δ Success ≥ 0.0 pp (Pareto superiority) |

## Goals - Signals - Metrics (GSM) Mapping

| Goal | Signal | Metric | Guardrail / Counter-Metric |
|---|---|---|---|
| Maximize session turn capacity | Turn count before 128k/200k window exhaustion | Turns completed per session without context overflow | Task success rate must not regress |
| Eliminate repetitive diagnostic noise | Compacted observation character volume | Log compression ratio (tokens before / tokens after) | Zero loss of unique error codes or stack frames |
| Seamless multi-turn session transfer | State handover payload size & accuracy | `/handoff` token count (<1,500) & decision preservation | Zero loss of active file references or open blockers |
| Zero configuration friction | Minimal settings adjustments required | % users remaining on Balanced mode | p95 compiler overhead <150ms |
| Prevent data leakage | Zero unauthorized telemetry or outbound traffic | Static binary inspection; zero external network primitives | 0 egress violations |

## Metric dictionary

| Metric | Definition | Decision use |
|---|---|---|
| Task success rate | Tasks meeting predeclared objective rubric / attempted tasks | Primary quality gate |
| Net completed-task tokens | All input, output, cache and tool-context tokens until success/abandonment | Efficiency numerator |
| Successful tasks per 1M tokens | Successful tasks divided by total tokens × 1M | Metered capacity outcome |
| Successful tasks per allowance | Successful tasks within a fixed request/quota period | Fixed-seat outcome |
| Missing-context recovery rate | Tasks requiring extra retrieval/full-context retry because required evidence was omitted | Leading quality indicator |
| Mandatory evidence recall | Required evidence categories present in final payload | Deterministic guardrail |
| Exact implementation fidelity | Applicable final payloads containing current exact focal body | Safety guardrail |
| TTFT | Send commitment to first streamed model token | Experience outcome |
| E2E task time | Task start to accepted completion | Customer outcome |
| Optimization latency | Context processing time before send | Product overhead |
| Reconciled savings | Provider-billed baseline minus provider-billed optimized cost | Financial outcome |
| Projected savings | Scenario estimate using declared prices/assumptions | Planning only |
| Activation | Installers completing first successful Tokonomics task | Funnel |
| W1/W4 retention | Activated users completing another task in week 1/week 4 | Product-market signal |

## Guardrails

- No material task-success regression.
- No increase in unsupported edits.
- No critical/high security or privacy issue.
- No double send.
- No context-free successful optimization.
- No missing data displayed as zero.
- No p95 overhead beyond the approved performance budget.

## Current benchmark readout

### Deterministic structural benchmark

- Whole-file reduction: 0.2% Balanced, 0.3% Maximum.
- Lossless structural cases: 40/40 per profile.
- Lowest measured control-flow retention: 100%.
- Retrieval reduction versus five-file bundle: 76.5% Balanced, 83.9% Maximum.
- Exact implementation requirement: 3/3 applicable cases per profile.
- Context-free payloads: zero.

Decision: retrieval is the promising lever; arbitrary whole-file compression is not.

### Controlled model-task pilot

- 14 paired tasks, one model, tools disabled.
- Baseline: 14/14 success.
- Maximum optimized: 11/14 success.
- Context reduction: 16.85%.
- Quality delta: −21.43 percentage points.
- All three failed tasks declared insufficient context.

Decision: reject promotion. Diagnose dependency closure rather than tune for more reduction.

### Agentic/session benchmark

- 12 tool calls and 48,000 observation characters.
- 61.5% character reduction with structural protocol invariants preserved.
- Simulated capacity: 105 to 645 turns in a 128k window; 164 to 1,021 in a 200k window.

Decision: promising capacity evidence, but agentic answer quality has not been tested.

## Evaluation ladder

### Level 0 — Static correctness

Unit tests, security properties, protocol invariants and deterministic fallbacks.

### Level 1 — Context fidelity

Exact source, protected tokens, dependency categories, stale-snapshot rejection and retrieval metrics.

### Level 2 — Controlled model-task outcome

Paired model answers or patches with identical task conditions.

### Level 3 — Agentic completion

Tool-enabled multi-turn tasks scored through completion, including recovery behavior.

### Level 4 — Beta customer outcome

Real user workflows, adoption, satisfaction, time, quota and cost where available.

### Level 5 — Production business outcome

Retained usage and reconciled benefit across a declared population/timeframe.

No claim may skip directly from Level 1 token reduction to Level 5 savings.

## Experiment portfolio

### Experiment E1 — Dependency-closure fix

**Hypothesis:** Providing exact one-hop dependencies and task-specific constants resolves the three insufficient-context failures while retaining at least half of the pilot's context reduction.

Design:

- replay the three failures plus matched controls;
- same model/configuration;
- baseline, current optimized and corrected optimized arms;
- score answer and context tokens.

Pass:

- corrected arm succeeds on all three;
- no regression in matched controls;
- positive net reduction remains.

### Experiment E2 — Workload-specific optimization

**Hypothesis:** Pass-through for small/high-risk tasks plus retrieval for large multi-file tasks improves average completed-task efficiency.

Design:

- stratify by task and context size;
- compare universal versus policy-routed optimization;
- include retries.

Pass:

- per-workload non-inferiority;
- at least 10% net reduction in targeted workloads;
- no overall task-success regression.

### Experiment E3 — Agentic observation masking

**Hypothesis:** Deterministic masking increases successful work per context window without increasing recovery tool calls.

Design:

- long tool-enabled tasks;
- masking on/off;
- measure completion, turns, repeated commands, token use and elapsed time.

Pass:

- non-inferior completion;
- no material increase in repeated tool calls;
- at least 15% net input reduction.

### Experiment E4 — Sidebar workflow

**Hypothesis:** A dedicated Tokonomics panel improves repeat usage without confusing model selection or trust.

Design:

- prototype usability study followed by small cohort;
- compare participant versus sidebar onboarding;
- measure completion, comprehension and repeat use.

Pass:

- no task-success difference;
- higher activation or repeat use;
- at least 80% model-routing comprehension.

### Experiment E5 — Dashboard evidence comprehension

**Hypothesis:** Explicit evidence labels prevent users from interpreting unavailable/projected cost as realized savings.

Pass:

- at least 90% correct interpretation in moderated testing;
- no severe misleading state.

### Experiment E6 — Session State Handover (`/handoff`) (v8.1.0)

**Hypothesis:** Synthesizing multi-turn state (decisions, hypotheses, active file paths, open blockers) into a bounded `/handoff` payload reduces context token drag by ≥60% across sessions without degrading next-step task completion.

Design:

- 20 long multi-file refactoring and debugging sessions (>15 turns);
- compare raw history carry-over vs `/handoff` continuation;
- measure next-prompt context tokens, model comprehension of prior state, and task completion.

Pass:

- ≥60% reduction in context carried into the next session;
- zero lost files, open error signatures, or critical architectural decisions;
- non-inferior task completion on subsequent prompt.

### Experiment E7 — Diagnostic Log Semantic Tombstoning (v8.1.0)

**Hypothesis:** Replacing repeating terminal/compiler log lines with structured semantic tombstones preserves diagnostic accuracy while reducing observation token footprint by ≥75%.

Design:

- 30 terminal and build logs containing repetitive compiler, linter, or test failures (>200 lines);
- benchmark model root-cause diagnosis accuracy with full logs vs tombstoned logs.

Pass:

- 100% root-cause identification parity;
- ≥75% observation token reduction;
- zero loss of unique exception codes or stack frames.

### Experiment E8 — Decoupled MCP Tool Server Overhead (v8.1.0)

**Hypothesis:** Exposing Tokonomics' context compiler via a local Model Context Protocol (`tokonomics-mcp`) stdio server allows external CLI agents (Codex, Claude Code) to achieve context compilation with <100ms IPC overhead and zero network egress.

Design:

- 50 synthetic and real-world tool requests from CLI agents;
- measure JSON-RPC roundtrip latency, memory footprint, and security boundary adherence.

Pass:

- p95 roundtrip latency <100ms;
- memory ceiling <80MB;
- 100% audit pass for zero network primitives and workspace root confinement.

## Statistical plan

- Pre-register workload, model, success rubric and non-inferiority margin.
- Use at least 30 paired samples per promoted workload as an initial floor; power analysis should set the final sample.
- Report absolute success difference and confidence interval.
- Report token/cost distributions, not just means.
- Separate transport failure from task failure.
- Correct for repeated comparisons or identify exploratory analyses.
- Freeze and hash the corpus before running.
- Do not tune on the final holdout.

## Cost methodology

For metered usage:

`Net saving = baseline completed-task cost − optimized completed-task cost`

Include:

- uncached input;
- cache writes and reads;
- output/thinking tokens;
- tool definitions and results;
- retries and recovery turns;
- provider/model/region pricing;
- pricing effective date.

For fixed subscriptions, report capacity or latency rather than a cash saving unless the user can downgrade a plan or avoid overage.

## Experiment decision template

- Hypothesis:
- Customer/workload:
- Baseline:
- Treatment:
- Primary metric:
- Quality/trust guardrails:
- Sample and power:
- Result:
- Limitations:
- Decision: promote / hold / reject / retire.
- Follow-up owner/date:

