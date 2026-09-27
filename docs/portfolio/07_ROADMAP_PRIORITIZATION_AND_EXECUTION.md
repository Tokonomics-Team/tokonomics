# Roadmap, Prioritization, and Execution

## Roadmap philosophy

The project historically accumulated many technically interesting components. The current roadmap changes the prioritization unit from “implemented capability” to “validated customer outcome.”

## Prioritization framework

Use a modified RICE score:

`Priority = Reach × Customer Impact × Evidence Confidence × Strategic Fit / Effort`

Apply two hard multipliers:

- **Quality multiplier:** zero if the change exceeds its non-inferiority margin.
- **Trust multiplier:** zero if the change violates consent, privacy or security requirements.

This prevents a large token reduction from outranking task correctness.

## Current initiative scoring

Scores are directional planning inputs, not researched market facts.

| Initiative | Reach | Impact | Evidence | Effort | Decision / Status |
|---|---:|---:|---:|---:|---|
| Session State Handover (`/handoff`) | High | Very high | High: ~65% token drop in multi-turn | Medium | **Shipped (v8.1.0)** |
| Semantic Log Tombstoning | High | High | High: >80% log token reduction | Medium | **Shipped (v8.1.0)** |
| Standalone MCP Wrapper (`tokonomics-mcp`) | High | Very high | High: external CLI agent reach | Medium | **Shipped (v8.1.0)** |
| Native Chat & Dedicated Sidebar Panel | High | High | Verified: WP1–WP5 test suites | Medium | **Shipped (v8.1.0)** |
| Interactive Documentation Site | High | Medium | Verified: deployed GitHub Pages | Low | **Shipped (v8.1.0)** |
| Fix missing dependency closure | High | Very high | High: three real-model failures | Medium | P0 (Horizon 1) |
| Agentic observation-quality evaluation | Medium/high | High | Medium: 61.5% structural saving | Medium | P0 (Horizon 1) |
| Completed-task cost instrumentation | High | Very high | High need | Medium | P0 (Horizon 1) |
| Customer discovery and workflow validation | High | Very high | Low current evidence | Low/medium | P0 (Horizon 0) |
| Stable history epochs | Medium | High | Structural tests; outcome untested | Medium | P1 |
| Hashed structural retrieval | Medium | Medium/high | Positive ablation | Existing | Retain |
| MMR diversity | Medium | Medium | Positive ablation | Existing | Retain |
| Lexical interaction reranking | Medium | Unknown | No measured outcome effect | Existing cost | Shadow |
| Semantic deduplication | Medium | Low/unknown | Inert on corpus | Existing cost | Disable/re-evaluate |
| Learned compression/local SLM | Unknown | Unknown | No product evidence | High | Not now |
| Direct provider gateway | Segment-specific | Potentially high | Product boundary unvalidated | Very high | Separate product decision |

## Outcome roadmap

### Horizon 0 — Evidence reset and discovery (Completed)

**Objective:** Validate the customer and repair the known outcome failure.

Deliverables:

- customer interview and workflow study;
- exact reproduction of three pilot failures;
- dependency-closure requirements and regression cases;
- metric dictionary and completed-task ledger;
- semantic-dedup default decision;
- updated portfolio evidence register.

Exit gate:

- at least one validated target segment;
- all three failures resolved without material token regression;
- no unsupported savings claim.

### Horizon 1 — Native Chat & Quality-Preserving Beta (Completed in v8.1.0)

**Objective:** Certified dual native chat surface, subscription integration, and low-risk agentic insights.

Deliverables:

- Native VS Code Chat Participant (`@tokonomics`) and secondary sidebar panel;
- Subscription CLI integration (Codex CLI, Claude Code CLI);
- Session State Handover (`/handoff`);
- Diagnostic log semantic tombstoning;
- Standalone Model Context Protocol tool server (`tokonomics-mcp`);
- Interactive public documentation portal on GitHub Pages;
- Decoupled evergreen display title and supply-chain verification (SBOM, SLSA).

Exit gate:

- 100% automated test suite pass (WP1–WP5, Phase 19 unified integration);
- zero network egress primitives in shipped bundle;
- release approved for human signoff.

### Horizon 2 — Quality-Preserving Multi-Repo Validation

**Objective:** Prove non-inferior task outcomes on target multi-file workloads.

Deliverables:

- minimum 30 paired tasks per priority workload;
- multi-language/multi-repository corpus;
- exact dependency closure;
- fallback and recovery-rate measurement;
- agentic trajectory quality evaluation;
- installed VSIX beta with explicit cohort.

Exit gate:

- non-inferiority passed for promoted workloads;
- less than 2% Tokonomics-attributable missing-context recovery;
- no critical/high trust issue;
- target users complete repeat tasks.

### Horizon 2 — Efficiency proof

**Objective:** Demonstrate marketable resource benefit.

Deliverables:

- completed-task token and turn accounting;
- metered-customer billing pilot where available;
- fixed-seat capacity and latency study;
- workload-specific default policy;
- dashboard outcome rather than vanity metrics.

Exit gate:

- at least 10% net completed-task input-cost reduction in target metered workloads, or a validated fixed-seat capacity outcome;
- no quality or recovery regression;
- claim review completed.

### Horizon 3 — Launch and scale

**Objective:** Ship a narrow proven promise and create an operating loop.

Deliverables:

- positioning and launch assets;
- onboarding and support runbook;
- privacy/security review;
- staged rollout and rollback;
- adoption, retention and outcome dashboards;
- quarterly evidence refresh.

Exit gate:

- launch readiness review approved;
- installed artifact passes certification;
- support and incident owners assigned;
- public claims trace to accepted evidence.

## Milestone plan

| Milestone | Customer question answered | Primary artifact |
|---|---|---|
| M0 Problem validation | Is this painful and frequent? | Research synthesis |
| M1 Failure closure | Can required evidence be selected reliably? | Regression/eval report |
| M2 Quality beta | Is optimized task success non-inferior? | Paired task evaluation |
| M3 Economic beta | Does the complete task use fewer constrained resources? | Cost/capacity study |
| M4 Launch candidate | Is the installed product safe and supportable? | Launch review |
| M5 General availability | Do retained users realize the promised outcome? | Production outcome review |

## Execution model

### Weekly mechanism

- customer evidence review;
- metric and evaluation review;
- engineering risk/blocker review;
- decision log updates;
- scope and launch-gate review.

### Phase review packet

Every milestone review includes:

- customer problem and affected cohort;
- changes shipped or tested;
- before/after task outcomes;
- quality and trust guardrails;
- evidence limitations;
- decision requested;
- rollback/kill-switch state.

### Cross-functional roles

| Function | Accountability |
|---|---|
| Product | Customer, strategy, scope, success metrics, claims, launch decision |
| Engineering | Design, implementation, reliability, performance, testability |
| Applied AI/evaluation | Corpus, rubrics, model-task experiments, statistical interpretation |
| Design/research | Workflow, comprehension, accessibility, adoption research |
| Security/privacy | Threat model, data boundary, release risks |
| Developer relations/marketing | Onboarding, positioning, feedback loop |
| Finance/FinOps | Billing evidence and ROI methodology where applicable |

For a solo portfolio project, these roles represent stakeholder lenses rather than fictitious team members. The case study should say which work was personally completed and which review would be required in a company environment.

## Decision log excerpts

| Decision | Evidence | Outcome |
|---|---|---|
| Limit settings to four | UX complexity concern | Simplified control surface |
| Preserve `@tokonomics` | Different workflow preferences | Retained explicit path |
| Do not claim unavailable cost | Provider usage gap | Dashboard shows explicit unavailable states |
| Reject aggressive source compression | Control-flow loss in earlier audit | Task-aware preservation and safe fallback |
| Reject the 16.85% pilot saving | 14/14 baseline versus 11/14 optimized | Quality gate blocked promotion |
| Prioritize dependency closure | All three losses reported insufficient context | Next P0 outcome |
| Avoid direct provider path | Credential, egress and duplicate-pipeline cost | Native VS Code route retained |

## One-way and two-way doors

### One-way or expensive-to-reverse

- collecting or transmitting new customer data;
- adding provider credentials/network egress;
- public dollar/quality claims;
- marketplace release to a large population;
- persistent index or memory format that stores source.

These require written review and staged rollout.

### Two-way doors

- internal ranking weights;
- shadow evaluation of a retrieval stage;
- dashboard copy;
- cohort-limited defaults;
- disabling an inert feature.

These should be tested quickly with clear rollback.

## Development-hell prevention rules

- No new optimization layer without an observed failure or customer need.
- No promotion without final-payload and completed-task evidence.
- No new roadmap because one benchmark fails; diagnose the smallest causal gap.
- Retire or disable inert components.
- Time-box research spikes and keep them outside production reachability.
- Treat the roadmap as complete until evidence triggers a listed reopening condition.

