# Tokonomics release notes

## 8.0.0

- Documented the verified economic ROI model: 3x–4x prompt capacity headroom for fixed subscriptions ($20/mo) and direct token invoice savings for API teams.
- Expanded structural context preparation across 14 languages, adding Ruby, Swift, Kotlin, and C/C++ support with safe non-brace block preservation.
- Enhanced AST pruner with lexical quote/comment tracking, decorator preservation (@Injectable, @dataclass), and calibrated BPE tokenizer parity (cl100k_base / o200k_base).
- Restored and certified dockable native chat in the Secondary Side Bar and dedicated independent Editor Tab with streaming Markdown reply formatting and session history restoration.
- Added a live panel activity log for provider-reported command, file, tool and plan events with real-time status indicators.
- Added `/codex` and `/claude` subscription chat commands using official CLI logins, with context preparation and dashboard usage reporting.
- Simplified the dashboard into Usage, Context, and Diagnostics views with explicit task spend tracking, advisory budgets, and opt-in Claude usage log importing/watching.
- Streamlined conservative compression with bounded rolling deduplication on large inputs, strengthened observation masking, and prefix cache boundary alignment.
- Preserved the four public settings and zero-leak local processing boundary with fail-closed safety fallbacks.

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
