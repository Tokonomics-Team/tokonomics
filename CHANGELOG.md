# Tokonomics release notes

## Unreleased

- Documented the economic ROI model, detailing 3x-4x prompt capacity headroom for fixed subscriptions ($20/mo) and direct token invoice savings for API teams.
- Expanded structural context preparation to 14 languages, adding Ruby, Swift, Kotlin, and C/C++ support with safe non-brace block preservation.
- Documented native chat panel usage in the secondary sidebar and editor tab, including direct prompts, model selection, and local session history.
- Restored Open Chat to a dockable view in the Secondary Side Bar (right by default). The optional editor has an Open in sidebar button; conversation history and Markdown formatting are preserved.

- Open Chat now uses a separate editor tab that stays visible alongside sidebar chats. Added Markdown reply formatting for tables, code blocks, lists, emphasis and links.

- Fixed chat loss when switching sidebar views. Added locally saved workspace conversations, a History picker, model-selection restoration and recovery after restarting VS Code.

- Added a live panel activity log for provider-reported command, file, tool and plan events, with thinking status and completion/failure updates kept separate from answers.
- Simplified the dashboard into Usage, Context and Diagnostics views, with task controls and advanced details available on demand.
- Fixed another skills-attachment case that could omit retrieved source from project-analysis requests.
- Preserved usable context when language services time out, and added failure-stage diagnostics to chat errors.
- Added streaming subscription replies, CLI/login checks without a question, and clearer provider failure messages.

- Fixed project analysis with skills/text references: text-only context no longer passes the project-source check, and preserving attachments no longer disables automatic retrieval.

- Fixed chat source forwarding: file, selection and text attachments now reach the model, including previously attached files on follow-up turns.
- Preserved the request's selected model directly and added an actionable missing-context message for source-dependent questions.

- Added `/codex` and `/claude` subscription chat commands using official CLI logins, with context preparation and dashboard usage reporting.
- Added subscription CLI setup to the dashboard and respected the selected model in ordinary participant chat.

- Added task spend, source filters, daily trends, usage coverage and task outcomes to the dashboard.
- Added explicit task grouping, advisory task/day/month budgets and local usage export.
- Added opt-in Claude usage-file import and watching, with replay protection and local retention.
- Added versioned pricing imports and explicit comparisons of available models.
- Corrected cache-token accounting and labeled avoided costs as estimates against a hypothetical baseline.
- Preserved the four public settings and shared compiler/request boundary; subscription commands use an explicit CLI transport.

## 7.0.1

- Refreshed the extension for safer and more predictable context preparation.
- Simplified settings to four clear choices with conservative defaults.
- Improved dashboard updates, status explanations, and token/cost visibility.
- Improved workspace awareness, relevance, and handling of changing files.
- Added stronger request preservation, cancellation, and fallback behavior.
- Added optional encrypted project memory with inspect, disable, export, and delete controls.
- Strengthened privacy, Restricted Mode, packaging, and dependency checks.
- Improved support for TypeScript, JavaScript, Python, Go, Rust, Java, C, and C++ projects.

Results depend on the request, workspace, model, and provider. Dollar values require recognized pricing and sufficient usage information. Optional local-model assistance is not enabled or advertised in this release.

## 6.0.0

- Added the activity dashboard and request history.
- Added workspace-aware context preparation.
- Added local diagnostics and safety controls.
- Improved cancellation, failure handling, and packaging checks.

## Earlier releases

- Introduced the Tokonomics chat participant, code-context tools, and usage visibility.

Current behavior is defined by the installed release and its documented settings.
