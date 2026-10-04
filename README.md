# Tokonomics 8.5.1

Tokonomics is a Visual Studio Code extension that prepares leaner context for AI-assisted development and shows clear request-level usage information. Interactive guide & simulator: [tokonomics-team.github.io/tokonomics](https://tokonomics-team.github.io/tokonomics/).

Removes avoidable repetition while keeping required context. Results vary by workspace, model, and provider.

Subscription chat: in VS Code Chat (Ask), use `@tokonomics /codex your question` or `@tokonomics /claude your question` with an official provider CLI login. Tokonomics prepares context and returns answers without edits. Use **Tokonomics: Configure subscription CLI** if needed. Provider tokens appear on the dashboard; charges and quota are unavailable.

## What you get

- Next-Gen Sticky KPI Cockpit with live polling, advisory budget caps, and smart model auto-routing.
- Multi-phase context compilation stepper with stage-by-stage inspection tooltips.
- Spatial directory token heatmap with squarified treemap layout and Context X-Ray integration.
- Git branch financial drift tracking with main baseline comparisons and severity indicators.
- Model efficiency frontier analysis (log-scale latency vs cost scatter plot with Pareto detection).
- Dynamic budget burn-rate velocity gauge and monthly exhaustion horizon forecaster.
- Developer engagement suite: ambient status bar sparkle feedback, 4-tier milestone ledger with CO2e carbon offset equivalency, and contextual prompt optimization CodeLens.
- Real-time event-driven auto-refresh engine syncing telemetry smoothly upon context compilation.
- Context preparation for everyday coding requests.
- Workspace-aware assistance in trusted workspaces.
- Task-oriented dashboard organized into Overview, Context, and Activity views.
- Clear explanations when pricing or provider usage is unavailable.
- Conservative fallbacks when a feature cannot run safely.
- Local diagnostics with privacy safeguards and modal confirmation on reset.
- Read-only Context X-Ray, active-buffer estimates, session-log health, chat handoffs, and tool-schema audits.
- Optional encrypted project memory that you control.

## Get started

1. Install Tokonomics from the Visual Studio Marketplace.
2. Run **Tokonomics: Run First Context Check** for a local, no-send introduction.
3. Open VS Code Chat and ask `@tokonomics` a coding question.
4. Run **Tokonomics: Show Savings Dashboard** to view activity.

Example:

```text
@tokonomics explain the authentication flow in this workspace
```

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
- `Tokonomics: Show Live Session Savings`
- `Tokonomics: Inspect Compiler Decision Trace`
- `Tokonomics: Manage Project Memory`
- `Tokonomics: Optimize & Copy Selection as Context`
- `Tokonomics: Export Anonymized Diagnostic Logs`

The `@tokonomics` participant also provides short commands for dashboard, live statistics, explanations, workspace maps, context packs, analysis, compaction, logs, and memory status.

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

Both surfaces share conversation state and model selection. They provide streamed Markdown, syntax highlighting, activity status, contextual model tier guidance for cost-effective selection, packaged TypeScript, JavaScript, and Python parsing with bounded heuristic fallbacks elsewhere, local indexing, up to 10 saved conversations, and subscription routing through the official Codex and Claude CLIs.

The panel saves up to 10 recent chats locally for this workspace with secret redaction. Unfinished requests are marked interrupted and are not resent automatically.

## Economic value and ROI disclaimers

Tokonomics can reduce context payloads, but it does not guarantee a reduction, a billing saving, more subscription quota, or a better model response. Dashboard dollar values are estimates, not invoices; actual outcomes depend on the request, workspace, model, provider, pricing, and billing arrangement.

## Dashboard values and navigation

The activity dashboard organizes token metrics into three tabs:
- **Overview**: Active task status, core token/cost metrics, latest request, and advisory budget alerts.
- **Context**: Active editor diagnostics, context skeleton copying, diff preview, workspace scan, Context X-Ray, and local tool shortcuts.
- **Activity**: Request ledger with accessible decision trace dialogs, model tables, daily trend charts with accessible labels, export, and confirmed metric reset.

The dashboard updates after handled requests without reloading the view. Token figures distinguish measured counts from local estimates. Dollar values appear only when Tokonomics has a recognized provider/model price and enough request usage information; otherwise, an unavailable reason is shown.

The **Task spend & efficiency** panel separates observed usage costs, input-only projections, and estimated avoided cost. Use **Start task** to group requests in this window, **Set budget** for advisory limits, and **Rate outcome** for self-reported success. Resetting session metrics requires modal confirmation to prevent accidental loss.

Use **Import Claude usage** for Claude Code assistant JSONL logs, or **Watch a log** to follow one selected file. Only usage metadata is retained; source prompts and code are never stored. History retains up to 10,000 requests for 90 days and daily aggregates for one year.

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
