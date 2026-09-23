# Discovery and Customer Research

## Discovery objective

Determine whether context inefficiency is a painful, frequent and monetizable problem—and for which developer segments—before scaling the solution.

## Evidence status

Repository and benchmark evidence exists. Primary customer discovery has not been documented and must not be implied. The personas and market needs below are hypotheses to test.

## Problem hypotheses

| ID | Hypothesis | Evidence today | Validation method |
|---|---|---|---|
| H1 | Developers send more context than tasks require | Controlled five-file versus retrieval benchmark | Observe real sessions and context composition |
| H2 | Repeated tool output and history constrain long sessions | 61.5% observation-masking benchmark and capacity simulation | Agentic replay plus user diary study |
| H3 | Developers will change workflow for measurable savings | No direct evidence | Prototype test and activation funnel |
| H4 | Teams care about auditable context decisions | Security/evidence design exists, demand unvalidated | Interview AI platform, security and FinOps leads |
| H5 | Metered customers experience enough spend to pay | Anthropic publishes broad monthly ranges; Tokonomics has no customer billing data | Anonymous spend survey and billing-backed pilot |
| H6 | Fixed-seat users value additional capacity or latency | Session-capacity simulation only | Measure quota exhaustion and willingness to adopt |
| H7 | Users trust a product that sometimes chooses 0% optimization | No direct evidence | Concept and messaging test |

## Hypothesis personas

### Persona A — AI-heavy individual contributor

- Works in a medium or large repository.
- Uses an AI coding assistant daily.
- Encounters context limits or long sessions.
- Wants low setup cost and no reduction in answer quality.
- Success: finishes more tasks without managing context manually.

### Persona B — Engineering manager

- Owns developer effectiveness and tool spend.
- Needs evidence of adoption and outcomes rather than raw tokens.
- Worries about another extension increasing support burden.
- Success: measurable successful-task efficiency with low operational overhead.

### Persona C — AI platform/FinOps lead

- Manages multiple models, quotas or API-funded usage.
- Needs cost attribution and policy enforcement.
- Requires precise evidence classifications and data boundaries.
- Success: reconciled cost reduction without lower task completion.

### Persona D — Security/privacy reviewer

- Reviews source-code handling, egress and persistence.
- Needs Restricted Mode, consent, redaction and deletion guarantees.
- Success: understandable data flow and verifiable controls.

## Interview plan

### Sample

- 8–10 AI-heavy developers across repository sizes.
- 4–6 engineering managers or developer-productivity leads.
- 3–5 platform/FinOps owners with metered usage.
- 2–3 security/privacy reviewers.

Recruit participants using screening questions about AI coding frequency, repository size, pricing model, context problems and authority over tool adoption.

### Interview questions

1. Walk me through the last AI coding task that required several files or many tool calls.
2. How did you decide what context to include?
3. Where did the assistant ask for more information or repeat work?
4. What happened when the context window or usage allowance became constrained?
5. How do you know whether an AI coding session was expensive?
6. Does your plan charge per token, per request, per seat or through a quota?
7. What would make you trust an automatic context optimizer?
8. What failure would make you uninstall it immediately?
9. Would you use a dedicated chat surface, an explicit participant, or neither? Why?
10. What evidence would justify organizational rollout?

Avoid asking whether participants “like” the product idea. Ask for recent behavior, artifacts, constraints and consequences.

## Contextual inquiry plan

For consenting participants, observe one real task and record only metadata unless source sharing is approved:

- task type and completion criterion;
- files/context explicitly supplied;
- number of turns and tool calls;
- missing-context recovery events;
- elapsed time;
- user confidence and manual context-management actions;
- billing/quota evidence when available;
- final task outcome.

Do not collect source code, prompts, secrets or file paths in the research repository.

## Survey instrument

Use a short survey after interviews to quantify:

- AI coding frequency;
- percent of tasks involving multiple files;
- frequency of context-limit or quota friction;
- pricing model;
- monthly spend band for metered users;
- failed/repeated AI work attributable to missing context;
- willingness to install a dedicated extension;
- preferred interaction surface;
- minimum acceptable quality and savings threshold.

## Prototype research

### Prototype 1 — Context decision preview

Show a simple summary of required and optional evidence before send. Test whether users understand the choice without reading technical internals.

### Prototype 2 — `@tokonomics`

Measure discoverability, repeat use and perceived workflow interruption.

### Prototype 3 — Dedicated sidebar

Test model selection, automatic routing, trust messaging and whether users prefer it to explicit invocation.

### Prototype 4 — Dashboard

Ask participants to distinguish:

- token estimate from provider usage;
- projected cost from reconciled cost;
- successful optimization from pass-through;
- unavailable from zero.

## Discovery metrics

- Problem frequency: affected tasks per developer per week.
- Problem severity: time, spend or quota lost per affected task.
- Existing workaround burden.
- Prototype task completion rate.
- Comprehension of evidence labels.
- Stated versus observed willingness to change workflow.
- Number of organizations able to supply reconciled usage data.

## Synthesis method

1. Code interviews by job, pain, trigger, workaround, desired outcome and adoption barrier.
2. Separate metered, fixed-seat and quota-limited economics.
3. Rank opportunities by frequency × severity × strategic fit × evidence confidence.
4. Maintain an assumption register and retire hypotheses contradicted by evidence.
5. Translate only validated needs into PRD requirements.

## Discovery exit criteria

Proceed to a customer beta only if:

- at least one segment reports the problem repeatedly and can quantify its consequence;
- the preferred Tokonomics interaction fits the segment's workflow;
- at least five participants accept a safe no-op as better than risky optimization;
- the segment can provide a measurable success signal;
- no critical privacy or procurement blocker lacks a feasible response.

If these criteria fail, reposition the product toward context governance or stop the initiative rather than adding optimization features.

