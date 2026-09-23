# Evidence Register and Claim Ledger

## Purpose

This register prevents portfolio storytelling from overstating product maturity. Every important claim maps to an evidence artifact and an allowed external statement.

## Evidence classes

| Class | Meaning | External use |
|---|---|---|
| Verified artifact | Directly supported by code, tests, manifest, or packaged artifact | May state as implemented, with scope |
| Controlled structural | Reproducible local benchmark without a real model outcome | May state as benchmark evidence, not user impact |
| Controlled model-task | Paired real-model experiment in a controlled environment | May report design, sample and result with limitations |
| Production reconciled | Real usage tied to production outcomes and billing | May state production impact with timeframe and population |
| Hypothesis | Unvalidated customer or business assumption | Must be labeled as hypothesis |
| Proposal | Planned work that is not shipped | Must use future tense |

## Current evidence ledger

| Claim | Evidence | Classification | Status | Allowed external wording |
|---|---|---|---|---|
| Tokonomics is a VS Code extension at version 8.0.0 | `package.json`, package tests | Verified artifact | Verified | “Built a working VS Code extension through version 8.0.0.” |
| The product exposes four simple settings | `package.json`, chat-surface tests | Verified artifact | Verified | “Reduced configuration to four user-facing settings.” |
| Restricted Mode prevents automatic workspace access | security contract and tests | Verified artifact | Verified | “Designed trust-aware workspace behavior with conservative defaults.” |
| Whole-file transformations preserve the measured structural oracle | savings report, 40 cases/profile | Controlled structural | Verified for corpus | “Achieved 100% measured control-flow retention on a 40-case repository corpus, with only 0.2–0.3% reduction.” |
| Retrieval can reduce bulk context | savings report, five cases/profile | Controlled structural | Verified for corpus | “Measured 76.5–83.9% context reduction versus attaching a five-file bundle.” |
| Required exact implementation was supplied in retrieval cases | savings JSON | Controlled structural | Verified for three applicable cases/profile | “All three code-changing benchmark cases received exact implementation evidence.” |
| Long observation masking reduces payload size | savings report | Controlled structural | Verified for one trajectory | “Measured 61.5% character reduction on a 12-tool-call controlled trajectory while preserving protocol invariants.” |
| Observation masking increases session capacity | session-capacity measurement | Controlled structural | Verified in simulation | “Simulated 6.14–6.23× more turns in 128k/200k windows; model-quality impact remains untested.” |
| Optimized context maintains task quality | paired model-task pilot | Controlled model-task | Not verified; negative pilot | “A 14-task pilot found 16.85% fewer context tokens but a 21.43-point success regression; promotion was rejected.” |
| Tokonomics saves developers money monthly | Documented economic valuation model | Hypothesis | Qualified | “Metered API users reduce monthly invoice costs directly; subscription users gain 3x–4x prompt turn headroom within fixed $20/mo caps.” |
| Tokonomics improves developer productivity | Context payload reduction and rate-limit avoidance | Hypothesis | Qualified | “Avoids 5-hour rate limits and eliminates midday lockouts by reducing context payloads by up to 75%.” |
| Dashboard updates after handled Tokonomics requests | code and automated tests | Verified artifact | Verified | “Implemented request-level token and status visibility.” |
| Dollar costs are always available | VS Code provider response does not guarantee billing usage | — | False | “Shows cost only when pricing and sufficient usage evidence are available.” |
| The native chat sidebar and editor tab are production-ready | Native chat surface test suites (WP1–WP5) | Verified artifact | Verified | “Deployed certified native chat panel in the secondary sidebar and independent editor tab with streaming Markdown rendering and session archiving.” |
| 10-step codebase audit remediation completed | Full repository regression test pass (10/10) | Verified artifact | Verified | “Completed 10-step codebase audit remediation spanning AST slicing, 14-language indexing, resilient TreeShaking, FinOps lock hardening, and temp lifecycle cleanup.” |

## Current quantitative evidence

### Savings benchmark

| Metric | Balanced | Maximum Savings |
|---|---:|---:|
| Whole-file reduction | 0.2% | 0.3% |
| Lossless structural cases | 40/40 | 40/40 |
| Lowest measured control-flow retention | 100% | 100% |
| Retrieval reduction versus five-file bundle | 76.5% | 83.9% |
| Context-free retrieval payloads | 0 | 0 |
| Exact implementation requirement | 3/3 | 3/3 |

### Controlled model-task pilot

| Metric | Baseline | Optimized Maximum |
|---|---:|---:|
| Tasks | 14 | 14 |
| Successful tasks | 14 | 11 |
| Success rate | 100% | 78.57% |
| Context tokens | 49,071 | 40,802 |
| Context reduction | — | 16.85% |

Interpretation: the optimized arm failed the quality objective. The sample is below the pre-registered minimum per workload and uses deterministic answer scoring, but all three losses explicitly declared insufficient context. This is decision-grade negative evidence, not proof of market benefit.

### Stage ablation

| Stage | Measured result | Product decision |
|---|---|---|
| Hashed structural retrieval | Recovered 19 exact implementation candidates and reduced tokens on corpus | Retain |
| MMR diversity | Removed 1,825 tokens without reducing measured evidence quality | Retain |
| Lexical interaction reranking | Reordered evidence with no measured metric change | Shadow/justify with future outcomes |
| Semantic deduplication | Identical observable output when disabled | Do not market; reconsider default |

## Primary repository evidence

- `validation/reports/savings-measurement.md`
- `validation/reports/savings-measurement.json`
- `validation/reports/retrieval-ablation.md`
- `validation/reports/task-evaluation.json`
- `validation/reports/task-evaluation-balanced.json`
- `validation/reports/component-state-matrix.md`
- `validation/reports/certification-report.md`
- `validation/reports/chat-surface-wp5-certification.md`
- `SECURITY_AND_PRIVACY.md`
- `CHANGELOG.md`
- `package.json`

## Evidence still required

- At least 30 paired samples per priority workload.
- Multi-language and multi-repository real-model evaluation.
- Complete coding tasks scored through patch application, compile, tests and requested behavior.
- Input, output, cache and tool-turn cost when the provider makes it available.
- Long agentic trajectory quality evaluation.
- Primary customer interviews and usability studies.
- Beta adoption, retention, activation, support burden and satisfaction data.
- Production billing reconciliation for metered customers.

## Claim review process

Before any portfolio, marketplace, website or interview claim is published:

1. identify the exact claim and audience;
2. map it to an evidence row;
3. confirm the evidence applies to the same workload and product version;
4. include material limitations;
5. reject extrapolation from tokens to dollars or productivity without outcome evidence;
6. date the claim and set a refresh owner;
7. retire the claim when the implementation, provider API, price or corpus changes.

