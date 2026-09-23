# UX and Service Blueprint

## Experience objective

Make context efficiency feel safe and understandable without requiring developers to learn retrieval, tokenization or model-provider internals.

## Design principles

- Preserve the developer's existing model choice.
- Prefer four simple settings over expert configuration.
- Explain consequential fallbacks, not every internal stage.
- Show unavailable data honestly.
- Make pass-through feel like protection, not product failure.
- Keep technical traces available but progressive.
- Design for keyboard, screen reader, light, dark and high-contrast use.

## Primary journey — explicit participant

```text
Open VS Code Chat
      ↓
Ask @tokonomics a task
      ↓
Tokonomics applies trust/context policy
      ↓
Required evidence is protected
      ↓
Safe optimization or pass-through
      ↓
Selected model responds
      ↓
Dashboard records status and available evidence
```

### User-visible states

| State | User message | Required behavior |
|---|---|---|
| Optimized | Context was reduced safely for this request | Show counting method and evidence status |
| Pass-through | Full context was retained because reduction was not safe/useful | Do not imply failure |
| Fallback | Retrieval was insufficient; exact relevant context was retained | Explain concise reason |
| Restricted | Workspace context unavailable in Restricted Mode | Provide selection/prompt-only path |
| Cancelled | Request cancelled before completion | No successful savings entry |
| Provider unavailable | Selected model cannot be reached | Preserve user choice; do not silently switch |
| Cost unavailable | Pricing or usage evidence is missing | Say why; never show $0 |

## Secondary journey — selected code

1. User selects code.
2. User invokes the context command or `@tokonomics`.
3. Selection is marked mandatory and exact.
4. Unsaved selection is included only if the user setting permits it.
5. Supporting workspace evidence is added only in Automatic mode.
6. User receives the selected model's response.

Success: no ambiguity about what exact code was included.

## Proposed sidebar journey

The sidebar is a gated proposal until validated.

1. User opens Tokonomics Chat.
2. User chooses Auto or an available VS Code model.
3. User sees context mode in plain language.
4. Prompt goes through the same context policy and provider gateway as `@tokonomics`.
5. Streaming response and cancellation behave identically.
6. `@tokonomics` remains available for users who prefer native chat.

Promotion requires parity, usability evidence and no duplicate pipeline.

## First-run onboarding

### Screen 1 — What it does

“Tokonomics prepares context for the AI model you choose in VS Code. It may keep a request unchanged when that is safer.”

### Screen 2 — Data behavior

“Context preparation runs in the extension. The final prompt and permitted context are sent to the selected model provider.”

### Screen 3 — Recommended setup

- Optimization: Balanced
- Workspace Context: Selection
- Unsaved Changes: Off
- Response Reuse: On

### Screen 4 — First task

Prompt the user to select a small function and ask for an explanation. Do not promise a saving.

## Settings information architecture

| Setting | User question answered |
|---|---|
| Optimization Mode | How strongly should Tokonomics optimize? |
| Workspace Context | What workspace information may it consider? |
| Include Unsaved Changes | May an explicit unsaved selection be used? |
| Response Reuse | May an exact safe completed response be reused? |

No settings for reranking, embeddings, MMR, thresholds, cache headers, SLMs or internal budgets should be exposed.

## Dashboard information hierarchy

### Summary layer

- request completed/failed/cancelled;
- optimized/pass-through/fallback;
- before/after context count and method;
- cost state;
- one-line reason.

### Evidence layer

- measured, model-counted, controlled, projected, reconciled, unavailable or unverified;
- workload and version where applicable;
- no universal extrapolation.

### Technical layer

- optional trace of context decisions;
- no sensitive content;
- component contribution tied to final payload.

## Service blueprint

| Journey stage | User action | Frontstage | Backstage capability | Evidence/metric | Failure recovery |
|---|---|---|---|---|---|
| Configure | Select four preferences | Settings UI | Preference migration and policy | Configuration source | Safe defaults |
| Prompt | Invoke participant/sidebar | Input and model picker | Request envelope | Invocation/activation | Preserve prompt |
| Authorize | Use selection/automatic context | Trust explanation | Workspace/context policy | Consent mode | Prompt-only path |
| Compile | Wait briefly | Progress/cancel | Retrieval, budgeting, preservation | Latency, evidence completeness | Pass-through/fallback |
| Send | Model starts response | Streaming UI | One gateway/send | TTFT, send status | Actionable provider error |
| Complete | Review answer | Response and summary | Commit content-free event | Completion/task feedback | Retry as a new explicit turn |
| Inspect | Open dashboard/trace | Human-readable evidence | Aggregation | Comprehension | Explain unavailable state |
| Reset | Clear data | Confirmation | Cache/metrics deletion | Zero residue | Report deletion failure |

## Usability study tasks

1. Configure Selection mode and explain what Tokonomics may read.
2. Ask a selected-code question.
3. Interpret a pass-through result.
4. Interpret “cost unavailable.”
5. Cancel an in-flight request.
6. Find why a request used a fallback.
7. Reset session data.
8. Compare `@tokonomics` and sidebar preferences.

## UX success criteria

- 90% correctly explain that final context goes to the selected provider.
- 90% distinguish unavailable from zero.
- 85% complete a selected-code task without assistance.
- 80% correctly interpret pass-through as safety behavior.
- 100% of critical actions are keyboard accessible.
- No severe accessibility issue in supported themes.
- No more than four settings visible.

## Content style guide

- Say “context reduced” rather than “intelligence compressed.”
- Say “estimated” or “model-counted” explicitly.
- Say “cost unavailable because provider usage was not returned.”
- Avoid “guaranteed,” “lossless,” “best,” “state of the art” and universal savings.
- Prefer one-line user reasons; put technical details behind Explain.

