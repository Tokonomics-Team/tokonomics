# Tokonomics 8.0.0

Tokonomics is a Visual Studio Code extension that prepares leaner context for AI-assisted development and shows clear request-level usage information.

It is designed to remove avoidable repetition while keeping required instructions and useful coding context. Results vary by request, workspace, model, and provider.

Subscription chat: in VS Code Chat (Ask), use `@tokonomics /codex your question` or `@tokonomics /claude your question` after signing in to the official provider CLI. Tokonomics prepares context and returns an answer using that login. This mode suggests changes without applying edits. Use **Tokonomics: Configure subscription CLI** if executable discovery fails. Provider-reported tokens appear on the dashboard; subscription charges and remaining quota are unavailable.

## What you get

- Context preparation for everyday coding requests.
- Workspace-aware assistance in trusted workspaces.
- A live dashboard for token activity, request status, and available cost estimates.
- Clear explanations when pricing or provider usage is unavailable.
- Conservative fallbacks when a feature cannot run safely.
- Local diagnostics with privacy safeguards.
- Optional encrypted project memory that you control.

## Get started

1. Install the extension from your approved source.
2. Open VS Code Chat.
3. Ask `@tokonomics` a coding question.
4. Run `Tokonomics: Show Savings Dashboard` from the Command Palette to view activity.

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

## Chat conversations and native panel

Open **Tokonomics: Open Chat** from the Command Palette (or select the Tokonomics chat icon in the Secondary Side Bar) to use the dedicated chat interface. You can also run **Tokonomics: Open Chat in Editor** to keep the conversation visible side-by-side with your code; click **Open in sidebar** to return to the sidebar at any time.

Both surfaces share your conversation state and model selection:
- **Direct prompts:** Ask coding questions or request refactorings directly in the prompt input.
- **Rich Markdown replies:** Answers stream with formatted tables, lists, and syntax-highlighted code blocks.
- **Session management:** Click **New Session** to start a clean turn, or click **History** to revisit and restore up to 10 saved workspace conversations.
- **Subscription CLI routing:** Use `@tokonomics /claude` or `@tokonomics /codex` to route prompts through your authenticated local CLI tools.

The panel saves up to 10 recent chats locally for this workspace, including prompts and replies, with up to 40 recent messages and bounded text per chat. Known secret patterns are redacted before saving. Saved chats return after restarting VS Code; unfinished requests are marked interrupted and are not resent automatically. Changing workspace folders clears these chats. This history is separate from usage records and other extensions' conversations.

## Economic value and ROI disclaimers

Tokonomics reduces context payload size by up to 70% to 75% on multi-file requests through code skeletonization and dependency pruning. Value depends on your billing structure:

- **Fixed-seat subscription developers (Claude Pro, ChatGPT Plus at $20/month):**
  - **Prompt capacity multiplier:** Smaller payloads provide approximately 3x to 4x more prompt turns before reaching provider 5-hour rate limits and lockouts.
  - **No cash refunds:** Fixed subscriptions remain billed at their regular rate ($20/month). Tokonomics does not provide cash refunds for subscriptions; it delivers equivalent enterprise API throughput within your consumer cap.
- **Metered API users and teams (Anthropic / OpenAI API):**
  - **Direct invoice savings:** Teams paying per input token see direct cash reductions on monthly API invoices (saving $1,500 to $4,500+ annually per active developer depending on volume).
- **Engineering productivity:**
  - Concise context reduces attention degradation and debugging cycles. Dashboard dollar figures are hypothetical baseline estimates rather than invoices. Actual results vary by workspace, prompt complexity, model choice, and rate limits.

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

- [Report a bug](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Request a feature](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Community discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)

When sharing a diagnostic export, review it first.

## License

Tokonomics is proprietary software. See [LICENSE.txt](LICENSE.txt).
