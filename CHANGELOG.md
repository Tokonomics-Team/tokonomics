# Tokonomics release notes

## 8.2.0

- Modernized the dashboard into Overview, Context, and Activity tabs with ARIA tablist semantics, keyboard focus traps, host-native modal reset confirmation, and responsive layouts.
- Centralized client/host webview messaging in a typed protocol with runtime length validation and allowlisted command dispatch.
- Added responsive stacked cell formatting and explicit cell labeling for narrow split-editor panes.
- Unified asynchronous operation feedback across active-file optimization, diff comparison, and workspace scans.

## 8.1.0

- Added a local First Context Check that sends nothing until the user explicitly submits a chat request.
- Added Context X-Ray for bounded estimates from one immutable workspace-index snapshot.
- Added an opt-in active selection/editor Context Meter with a 300 KiB safety limit.
- Added editor right-click context menu options and a dedicated Tokonomics submenu for instant token inspection, selection optimization, and diff comparisons.
- Added one-shot, read-only health analysis for an explicitly selected supported session log.
- Added bounded, redacted handoff drafts for the active Tokonomics-owned chat.
- Added read-only structural overhead audits for explicitly selected OpenAI, MCP, or Claude tool-schema JSON.
- Kept the canonical request, provider, retrieval, accounting, native-chat, FinOps, and four-setting contracts unchanged.
- Tightened packaged contents and release evidence for the exact Marketplace VSIX.

### Using the 8.1.0 insights

- Run **Tokonomics: Run First Context Check** with a text editor open for a guided, local introduction. It estimates the active selection or editor and does not send a request.
- Run **Tokonomics: Run Context X-Ray** in a trusted workspace, then approve the one-time index snapshot to rank context-heavy indexed files locally.
- Run **Tokonomics: Start Context Meter** for a status-bar estimate of the active selection or text buffer. The input limit is 300 KiB; click the meter or run **Tokonomics: Stop Context Meter** when finished.
- Run **Tokonomics: Analyze Session Log Health**, select a supported `.json` or `.jsonl` log, and review its content-free health summary on the dashboard.
- Open a Tokonomics conversation and run **Tokonomics: Create Chat Handoff** to generate a bounded, redacted, unsaved Markdown checkpoint.
- Select tool-schema JSON—or choose a `.json` file after running **Tokonomics: Audit Tool-Schema Overhead**—to open a read-only structural report for supported OpenAI, MCP, and Claude shapes.

These insights run only after an explicit action. File reads require a trusted workspace and confirmation; inputs are not modified or sent to a model, and estimates are not recorded as actual savings.

## 8.0.0

- Documented the verified economic ROI model: prompt capacity headroom and direct token invoice savings.
- Expanded structural context preparation across 14 languages, adding Ruby, Swift, Kotlin, and C/C++ support.
- Enhanced AST pruner with lexical quote/comment tracking and calibrated BPE tokenizer parity.
- Restored dockable native chat in Secondary Side Bar and dedicated Editor Tab with streaming Markdown and session history.
- Added live panel activity log for provider-reported command, file, tool and plan events.
- Added `/codex` and `/claude` subscription chat commands using official CLI logins.
- Provided task spend tracking, advisory budgets, and opt-in Claude usage log importing/watching.
- Streamlined conservative compression with bounded deduplication, observation masking, and prefix cache alignment.
- Preserved the four public settings and zero-leak local processing boundary with fail-closed safety fallbacks.

## 7.0.1

- Refreshed context preparation with simplified four-setting configuration.
- Improved dashboard updates, status explanations, and token/cost visibility.
- Improved workspace awareness, request preservation, and fallback behavior.
- Added encrypted project memory with inspect, disable, export, and delete controls.
- Strengthened privacy, Restricted Mode, packaging, and dependency checks.
- Enhanced language support across TypeScript, JavaScript, Python, Go, Rust, and Java.

Results depend on the request, workspace, model, and provider. Dollar values require recognized pricing and sufficient usage information. Optional local-model assistance is not enabled or advertised in this release.

## 6.0.0

- Added activity dashboard, request history, and workspace context preparation.
- Added local diagnostics, safety controls, and failure handling.

## Earlier releases

- Introduced the Tokonomics chat participant, code-context tools, and usage visibility.

Current behavior is defined by the installed release and its documented settings.
