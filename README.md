# Tokonomics 11.0.0 — AI Token Optimizer, Autonomous Execution Harness & Local DORA Engine

Tokonomics is a local multi-language context compiler, autonomous execution harness, AST program slicer, prefix cache pinner, and air-gapped developer velocity/DORA engine for VS Code, Claude Code, and Cursor with zero cloud data leaks. Interactive guide & simulator: [tokonomics-team.github.io/tokonomics](https://tokonomics-team.github.io/tokonomics/).

Removes avoidable repetition while keeping required context. Results vary by workspace, model, and provider.

Subscription chat: in VS Code Chat (Ask), use `@tokonomics /codex your question` or `@tokonomics /claude your question` with an official provider CLI login. Tokonomics prepares context and returns answers without edits. Autonomous execution can be invoked via `@tokonomics /harness your task`. Use **Tokonomics: Configure subscription CLI** if needed. Direct Google Gemini API support is also available via **Tokonomics: Configure Gemini API Key**. Provider tokens appear on the dashboard; charges and quota are unavailable.

## What you get

- Universal Multi-Provider Cache Quantizer (v11.0.0): Hardware-level chunk boundary quantization for Anthropic (1,024), DeepSeek-V3/R1 (64), OpenAI (128), and Gemini (32k) with exact chunk alignment padding and 0% boundary overshoot.
- Merkle Prefix Invariance Engine (v11.0.0): Git-blob SHA-1 topological prefix sorter ensuring 100% byte invariance and zero cache-busting drift across multi-file permutations.
- Predictive Tool-RAG & Compact TypeScript Schemas (v11.0.0): Inverted index router dynamically selecting the top 3 to 5 relevant tools ($\le 450$ tokens, -84% overhead), compact function signatures (-77% tokens), and local parameter validation with 1-line remediation prompts.
- Inter-Procedural Program Dependency Slicing (v11.0.0): Backward semantic slicing over def-use chains and control dominators with 100% causal type closure across TypeScript, Python, and Go (-57.9% to -75.6% tokens).
- Agentless Hierarchical Execution & Symbolic Test Slicing (v11.0.0): Deterministic 3-phase execution (Localization -> Patch -> Sliced Verify) converging in 3 turns, paired with targeted test slicing reducing test latency by 96.6% (35s -> 1.2s), and FSM type-state capability masking eliminating unauthorized side-effects in planning.
- Zero-Bloat Frontier Cockpit (v11.0.0): Streamlined 4-tile status strip surfacing hardware chunk quantization, Merkle invariance, Tool-RAG reduction, and test acceleration.
- AI Harness Engineering Runtime (v10.0.0): Autonomous, closed-loop execution runtime with stateful FSM (Planning -> Guardrail -> Acting -> Observing -> Convergence/Rollback), 5-iteration retry limits, and cyclic oscillation detection.
- Outbound MCP Client Hub & Prefix Governance (v10.0.0): Workspace `.tokonomics/mcp.json` discovery, dynamic schema minification (-35% tokens), and 4-tier context caching with Anthropic `cache_control` breakpoints capturing 90% read discounts ($0.30/M vs $3.00/M).
- Two-Tier Rollback Engine (v10.0.0): Fast in-memory `vscode.TextDocument` undo buffer restoration via `WorkspaceEdit` paired with dangling git tree snapshots (`git stash create`), preventing uncommitted code loss on abort.
- Active Context Surgery & Dynamic Tier Demotion (v10.0.0): Tail-end log surgery replacing resolved compiler traces with compact digests (-82.6% tokens) without busting prompt caches, plus dynamic demotion of previous edit targets via Progressive Disclosure skeletons.
- Structural Diff & Bash AST Guardrails (v10.0.0): Syntactic integrity validation, contract preservation (blocking accidental public export/method deletion), workspace path confinement, and destructive command blacklisting.
- AI Harness Cockpit (v10.0.0): Interactive Dashboard panel featuring live multi-turn telemetry, Tier 0/1/2 cache hit gauges, surgery counters, real-time guardrail ledger, and one-click Emergency Rollback.
- Developer Productivity & Activity Telemetry (v9.0.0): 2-minute activity heartbeats tracking active coding time, keystroke cadence, and multi-language attribution with 120s idle pausing.
- Code Origin Attribution Engine (v9.0.0): Real-time classifier distinguishing human typing from streaming AI completions, measuring human vs. AI authored lines.
- Flow State & AI Friction Correlation (v9.0.0): Identifies 20m+ deep coding sessions, computes Flow Efficiency Score, and flags post-prompt debugging detours.
- Air-Gapped Local DORA Metrics (v9.0.0): Inner-loop Lead Time for Changes (AI vs. manual delta), pre-commit CFR, and test pass rates from local Git history with 0 bytes network egress.
- Unified Developer Cockpit: Interactive Velocity & Flow, Local DORA, and AI Harness Cockpit dashboard tabs with line gauges, friction indicators, and cryptographic audit export.
- Semantic Graph Slicing & Prefix Cache Pinning: Cross-file dependency slicing extracting exact call trees paired with deterministic prompt envelopes and 1,024-token boundary padding for guaranteed cache hits.
- Universal Agent Layer & 8 Canonical MCP Tools: Standalone MCP server providing progressive AST disclosure, program slicing, and output distillation for Claude Code, Cursor, and Copilot.
- Response Bloat Distiller: Distills test runners (Jest, Pytest, Go, Cargo) and JSON with up to 94.9% token reduction while preserving failure stacks and diagnostics.
- MCP Tool Firewall & Schema Pruner: Dynamic tool classification saving up to 90.0% tool context overhead across community servers.
- Multi-Language AST Pruning: Native context compilation across C, C++, Python, TypeScript, JavaScript, Go, Rust, Java, C#, Ruby, Swift, Kotlin, PHP, and SQL.
- Sticky KPI Cockpit: Real-time token rates, advisory budget caps, branch drift tracking, model frontier scatter plots, and spatial market treemaps.
- Task-oriented dashboard organized into Overview, Context, Activity, Velocity & Flow, and Local DORA views.
- Local diagnostics, conservative fallbacks, and optional encrypted project memory.

## Get started

1. Install Tokonomics from the Visual Studio Marketplace.
2. Run **Tokonomics: Run First Context Check** for a local, no-send introduction.
3. Open VS Code Chat and ask `@tokonomics` a coding question.
4. Run **Tokonomics: Show Savings Dashboard** to view activity.

Example:

```text
@tokonomics explain the authentication flow in this workspace
```

## How to set up and run the AI Execution Harness

Tokonomics v10.0.0 provides an autonomous closed-loop execution harness with AST guardrails, 4-tier prompt caching, and two-tier instant rollback.

### Step 1: Install and open your workspace
Install Tokonomics from the Visual Studio Marketplace. Open your project in VS Code. The harness automatically activates in Trusted Workspaces.

### Step 2: (Optional) Connect workspace MCP tools
To give the harness access to project-specific tools, place a `.tokonomics/mcp.json` file in your workspace root:

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["scripts/tools.js"]
    }
  }
}
```

The Outbound MCP Hub automatically discovers tools, minifies schemas by 35%, and pins them into Tier 0 cache.

### Step 3: Run an autonomous task
You can run tasks through Chat or the Command Palette:

- **Via VS Code Chat**: Open Chat (`Ctrl+Alt+I`) and enter:
  ```text
  @tokonomics /harness refactor payment processor to validate idempotency and verify with tests
  ```
- **Via Command Palette**: Press `Ctrl+Shift+P` -> run **Tokonomics: Run Autonomous AI Harness Task** -> enter your goal.

### Step 4: Monitor and safety controls
- **AI Harness Cockpit**: Run **Tokonomics: Show Savings Dashboard** to view live FSM state, prefix cache hit rate, log surgery token savings, and recent guardrail validations.
- **Instant Rollback**: If you want to abort or revert at any time, click **Emergency Rollback** in the dashboard or run **Tokonomics: Emergency Harness Rollback**. In-memory editor buffers and stash snapshots are restored with zero loss of uncommitted work.

## Simple settings

Tokonomics exposes four settings:

- Optimization mode: Off, Balanced, or Maximum Savings.
- Workspace context: None, Selection, or Automatic.
- Include unsaved changes: on or off.
- Response reuse: on or off.

Balanced mode and Selection workspace context are the recommended defaults.

## Useful commands

- `Tokonomics: Open Chat`
- `Tokonomics: Show Savings Dashboard`
- `Tokonomics: Run Autonomous AI Harness Task`
- `Tokonomics: Emergency Harness Rollback`
- `Tokonomics: Run Harness Security & Invariant Audit`
- `Tokonomics: Copy Agent MCP Configuration`
- `Tokonomics: Start Tokonomics MCP Server`
- `Tokonomics: Show Live Session Savings`
- `Tokonomics: Inspect Compiler Decision Trace`
- `Tokonomics: Manage Project Memory`
- `Tokonomics: Optimize & Copy Selection as Context`
- `Tokonomics: Export Anonymized Diagnostic Logs`
- `Tokonomics: Toggle Usage Analytics`

The `@tokonomics` participant also provides short commands for harness (`/harness`), dashboard, live statistics, explanations, workspace maps, context packs, analysis, compaction, logs, and memory status.

## Local context insights

Open the Command Palette (`Ctrl+Shift+P`/`Cmd+Shift+P`) and run:

| Feature | How to use it | What it produces |
| --- | --- | --- |
| **First Context Check** | Open or select text, run **Tokonomics: Run First Context Check**, and follow the dashboard steps. | A local estimate and guided path to chat; Context X-Ray is optional. |
| **Context X-Ray** | Run **Tokonomics: Run Context X-Ray** and approve its one-time workspace snapshot. | A bounded ranking of indexed files with quick filters to sort by potential savings, raw tokens, or savings percentage. |
| **Context Meter** | Run **Tokonomics: Start Context Meter**. Click its status item or run **Tokonomics: Stop Context Meter** to stop. | A local estimate for the active selection or text buffer, up to 300 KiB. |
| **Session Health** | Run **Tokonomics: Analyze Session Log Health** and select a supported `.json` or `.jsonl` log. | Content-free Claude Code health aggregates on the dashboard. |
| **Chat Handoff** | Open a Tokonomics chat and run **Tokonomics: Create Chat Handoff**. | A bounded, redacted checkpoint in a new unsaved Markdown document. |
| **Tool-Schema Audit** | Select JSON or choose a `.json` file with **Tokonomics: Audit Tool-Schema Overhead**. | An unsaved report for supported OpenAI, MCP, and Claude shapes. |

Insights are explicit, bounded, and local. File analysis requires a trusted workspace and confirmation. Inputs are not changed or sent to a model, and estimates are not counted as actual savings.

## Chat conversations and native panel

Open **Tokonomics: Open Chat** from the Command Palette (or click the Tokonomics icon in the Secondary Side Bar) to use the dedicated chat interface, or run **Tokonomics: Open Chat in Editor** for a split editor tab.

Both surfaces share conversation state and model selection. They provide streamed Markdown, syntax highlighting, activity status, contextual model tier guidance for cost-effective selection, native multi-language AST context slicing across C, C++, Python, TypeScript, JavaScript, Go, Rust, Java, C#, Ruby, Swift, Kotlin, PHP, and SQL, local indexing, up to 10 saved conversations, and subscription routing through the official Codex and Claude CLIs.

The panel saves up to 10 recent chats locally for this workspace with secret redaction. Unfinished requests are marked interrupted and are not resent automatically.

## Economic value and ROI disclaimers

Tokonomics can reduce context payloads, but it does not guarantee a reduction, a billing saving, more subscription quota, or a better model response. Dashboard dollar values are estimates, not invoices; actual outcomes depend on the request, workspace, model, provider, pricing, and billing arrangement.

## Dashboard values and navigation

The activity dashboard organizes token metrics into three tabs:
- **Overview**: Active task status, core token/cost metrics, latest request, and advisory budget alerts.
- **Context**: Active editor diagnostics, context skeleton copying, diff preview, workspace scan, Context X-Ray, and local tool shortcuts.
- **Activity**: Request ledger with decision trace dialogs, model tables, daily trend charts, export, and confirmed metric reset.

Distinguishes measured counts from local estimates. The Task spend & efficiency panel separates observed usage costs and estimated avoided costs. History retains up to 10,000 requests for 90 days and daily aggregates for one year. Claude Code JSONL logs can be imported or watched directly.

## Privacy

Context preparation is local and adds no Tokonomics telemetry. Explicit requests still send prompts and selected context to the chosen provider or authenticated CLI; this traffic is not air-gapped.

Automatic workspace context is unavailable in Restricted Mode. Project memory is off by default, requires explicit consent, is encrypted locally, and can be inspected, disabled, or deleted from the Command Palette.

Review sensitive context before sending.

## Compatibility

Tokonomics requires VS Code 1.106.0 or later. Controlled tests validate extension behavior, but they do not guarantee a particular saving, billing result, or model response.

## Support

- [Interactive feature guide & docs](https://tokonomics-team.github.io/tokonomics/)
- [Release notes & updates](https://github.com/Tokonomics-Team/tokonomics/releases)
- [Report a bug](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Request a feature](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Community discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)

When sharing a diagnostic export, review it first.

## License

Tokonomics is proprietary software. See [LICENSE.txt](LICENSE.txt).
