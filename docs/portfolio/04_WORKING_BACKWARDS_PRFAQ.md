# Working-Backwards PR/FAQ

> Portfolio artifact. This is a proposed future announcement, not a claim that Tokonomics has achieved the outcomes below.

## Press release

### Tokonomics helps VS Code developers complete more AI-assisted work with less unnecessary context

**Bengaluru, India — `[Future launch date]`** — Today, Tokonomics announced a context-efficiency extension for Visual Studio Code designed to reduce unnecessary AI coding context without sacrificing the exact source evidence required to complete a task.

AI coding sessions can accumulate unrelated files, repeated tool output and stale history. Simple compression can lower token counts while making the assistant less capable. Tokonomics takes a different approach: it protects required instructions and exact code, retrieves only relevant workspace evidence in trusted workspaces, and safely passes context through when an optimization cannot be justified.

Developers can use Tokonomics through an explicit VS Code chat participant and review request-level token and status information in a dashboard. Four straightforward settings control optimization strength, workspace context, unsaved changes and safe response reuse.

“The goal is not the shortest prompt. The goal is the lowest-cost successful task,” said the Product Lead for Tokonomics. “Our evaluation process rejects a token-saving change if it causes the model to miss necessary context or repeat work.”

For metered customers, Tokonomics will report dollar benefits only when provider usage and pricing can be reconciled. For fixed-seat customers, it will focus on measurable session capacity, latency and work completed within available limits.

Tokonomics 8.1.0 is currently a controlled beta featuring multi-turn Session State Handover (`/handoff`), semantic log tombstoning, and a dedicated dual native chat surface. Broader availability depends on workload-specific quality and efficiency gates.

## Customer FAQ

### What problem does Tokonomics solve?

It reduces avoidable context in AI-assisted development, especially multi-file and long agentic work, while protecting the evidence needed to answer correctly.

### Does it make every prompt smaller?

No. Small or quality-sensitive requests may pass through unchanged. A 0% reduction is preferable to a failed coding task.

### Does it guarantee lower monthly bills?

No. Fixed subscriptions generally do not become cheaper when fewer tokens are used. Metered savings require provider usage evidence and depend on workload, model, cache behavior and output.

### What does the extension send?

The extension sends the optimized prompt and permitted context to the upstream model selected in VS Code. Local context preparation does not mean the final request remains on the device.

### Does it scan my workspace automatically?

Only when the workspace is trusted and Workspace Context is set to Automatic. Selection mode uses only deliberate selections; None disables workspace-derived context.

### What happens if Tokonomics cannot find sufficient context?

It declares a shortfall and uses a conservative fallback, which may include the complete relevant file when permitted. It should not send an empty or approximate implementation merely to claim savings.

### How is quality measured?

Through deterministic preservation checks and paired model-task evaluation. Production claims require enough samples and complete task scoring, including retries.

### Why use it if native assistants already optimize context?

The hypothesis is that users and teams benefit from an independent, inspectable, cross-model layer with explicit trust controls. This must be validated against native tools during beta.

### How many settings are there?

Four: Optimization Mode, Workspace Context, Include Unsaved Changes and Response Reuse.

### Is project memory enabled automatically?

No. Any project-memory capability requires explicit consent and local controls.

## Internal FAQ

### Who is the first customer?

AI-heavy developers and platform teams working in large repositories or long agentic sessions with metered or quota-constrained usage.

### What is the customer promise?

Reduce unnecessary context while preserving the exact evidence required to complete the task.

### What is not promised?

- universal token savings;
- guaranteed monthly dollar reduction;
- interception of other extensions;
- self-hosted inference;
- improved model intelligence;
- quality preservation without evaluation.

### What is the launch blocker?

The current paired real-model pilot found a quality regression. The missing-context failures must be fixed and a larger, workload-specific evaluation must pass.

### What is the minimum commercial result?

For target metered workloads:

- statistically non-inferior task success;
- at least 10% net completed-task input-cost reduction;
- low missing-context recovery rate;
- no critical privacy/security issues.

For fixed-seat workloads:

- statistically non-inferior task success;
- measurable additional successful-task/session capacity or latency improvement;
- no misleading dollar claim.

### Why not add a direct provider gateway?

It would create a separate credential, egress, billing and threat model. That is a different product decision and is not required to validate the core context-assurance hypothesis.

### How will we know the product should be stopped?

Stop or pivot if target customers do not experience the problem frequently, refuse the workflow, or if completed-task efficiency cannot improve without exceeding the quality margin.

