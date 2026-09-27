# Tokonomics 8.1.0

Tokonomics is a Visual Studio Code extension that prepares leaner context for AI-assisted development and shows clear request-level usage information. Interactive guide & simulator: [tokonomics-team.github.io/tokonomics](https://tokonomics-team.github.io/tokonomics/).

Removes avoidable repetition while keeping required context. Results vary by workspace, model, and provider.

Subscription chat: in VS Code Chat (Ask), use `@tokonomics /codex your question` or `@tokonomics /claude your question` after signing in to the official provider CLI. Tokonomics prepares context and returns an answer using that login without applying edits. Use **Tokonomics: Configure subscription CLI** if discovery fails. Provider-reported tokens appear on the dashboard; charges and quota are unavailable.

## What you get

- Context preparation for everyday coding requests.
- Workspace-aware assistance in trusted workspaces.
- A live dashboard for token activity, request status, and available cost estimates.
- Clear explanations when pricing or provider usage is unavailable.
- Conservative fallbacks when a feature cannot run safely.
- Local diagnostics with privacy safeguards.
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
| **Context X-Ray** | Run **Tokonomics: Run Context X-Ray** and approve its one-time workspace snapshot. | A bounded ranking of indexed files likely to consume the most context. |
| **Context Meter** | Run **Tokonomics: Start Context Meter**. Click its status item or run **Tokonomics: Stop Context Meter** to stop. | A local estimate for the active selection or text buffer, up to 300 KiB. |
| **Session Health** | Run **Tokonomics: Analyze Session Log Health** and select a supported `.json` or `.jsonl` log. | Content-free Claude Code health aggregates on the dashboard. |
| **Chat Handoff** | Open a Tokonomics chat and run **Tokonomics: Create Chat Handoff**. | A bounded, redacted checkpoint in a new unsaved Markdown document. |
| **Tool-Schema Audit** | Select JSON or choose a `.json` file with **Tokonomics: Audit Tool-Schema Overhead**. | An unsaved report for supported OpenAI, MCP, and Claude shapes. |

Insights are explicit, bounded, and local. File analysis requires a trusted workspace and confirmation. Inputs are not changed or sent to a model, and estimates are not counted as actual savings.

## Chat conversations and native panel

Open **Tokonomics: Open Chat** from the Command Palette (or click the Tokonomics icon in the Secondary Side Bar) to use the dedicated chat interface, or run **Tokonomics: Open Chat in Editor** for a split editor tab.

Both surfaces share conversation state and model selection. They provide streamed Markdown, syntax highlighting, activity status, context preparation across 14 languages, local candidate indexing, up to 10 saved conversations, and subscription routing through the official Codex and Claude CLIs.

The panel saves up to 10 recent chats locally for this workspace with secret redaction. Unfinished requests are marked interrupted and are not resent automatically.

## Economic value and ROI disclaimers

Tokonomics can reduce context payloads, but it does not guarantee a reduction, a billing saving, more subscription quota, or a better model response. Fixed-seat subscriptions are not refunded when fewer tokens are used. Dashboard dollar values are estimates, not invoices; actual outcomes depend on the request, workspace, model, provider, pricing, and billing arrangement.

## Dashboard values

The dashboard updates after handled requests. Token figures may be measured or estimated. Dollar values appear only when Tokonomics has a recognized provider/model price and enough request usage information. When it does not, the dashboard shows an unavailable reason instead of inventing a value.

The **Task spend & efficiency** panel separates observed usage costs, input-only projections, and estimated avoided cost. Use **Start task** to group subsequent requests in this window, **Set budget** for advisory task/day/month limits, and **Rate outcome** to track self-reported task success. Alerts do not stop an agent. Model comparisons are explicit and never switch your selected model.

Use **Import Claude usage** for a Claude Code assistant JSONL log, or **Watch a log** to follow one selected file. Only usage metadata is retained; source prompts and code are not stored. Watching is opt-in, resumes for that workspace, and can be stopped from the panel. In WSL, SSH or containers, select a file on the extension host. Imports and watching require a trusted workspace. No telemetry receiver or background pricing download is enabled.

History retains up to 10,000 requests for 90 days and daily aggregates for one year. **Export usage** opens a local JSON document you can save. **Data & pricing** provides reviewed price-snapshot import and history deletion. Prices are estimates rather than invoices; hypothetical savings do not establish what an unsent request would have cost or whether it would have succeeded.

## Privacy

Context preparation runs inside the extension. Prompts and selected context are still sent to the AI provider chosen in VS Code.

Automatic workspace context is unavailable in Restricted Mode. Project memory is off by default, requires explicit consent, is encrypted locally, and can be inspected, disabled, or deleted from the Command Palette.

Review sensitive context before sending it. VS Code, other extensions, and AI providers have their own privacy and network behavior.

## Compatibility

Tokonomics requires VS Code 1.106.0 or later. Controlled tests validate extension behavior, but they do not guarantee a particular saving, billing result, or model response.

## Support

- [Interactive feature guide & docs](https://tokonomics-team.github.io/tokonomics/)
- [Report a bug](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Request a feature](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Community discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)

When sharing a diagnostic export, review it first.

## License

Tokonomics is proprietary software. See [LICENSE.txt](LICENSE.txt).
