# Tokonomics release notes

## 8.5.2

- Spatial AST Pruning Market Treemap: Upgraded the Context X-Ray spatial density heatmap into a two-level squarified market map featuring module sector frames, circular language badges, bold uppercase tickers, and an efficiency color-scale legend bar.
- Privacy-Preserving Aggregate Telemetry: Integrated optional, anonymous usage metrics via Aptabase (Option B) measuring token savings, compression percentages, and runtime error categories with zero source code, prompt, or personal data collection.
- Host Telemetry Compliance: Automatically respects VS Code's global telemetry setting (`telemetry.telemetryLevel`), completely muting dispatches when disabled.
- Developer Opt-Out Toggle: Added `Tokonomics: Toggle Usage Analytics` command to provide users with direct opt-in and opt-out control.
- Test Suite Streamlining: Curated repository test execution to focus strictly on active architectural test suites.

## 8.5.1

- Dashboard & Activity UI Evergreen Versioning: Removed hardcoded version strings from the dashboard header, webview panel title, and diff context headers, ensuring UI surfaces stay evergreen across releases.
- Diagnostic Logger Dynamic Binding: Updated diagnostic report exporter to resolve the active extension version dynamically.
- Release Maintenance: Bumped extension package and verification suites to v8.5.1.

## 8.5.0

- Sticky KPI Cockpit & Controls: Unified 4-column bar for tokens, avoided cost, compression efficiency, and density ratio with polling and budget controls.
- Context Pipeline Stepper: Visual execution stepper with stage inspection tooltips from ingest to context compilation.
- Spatial Context Treemap: Interactive token density heatmap with weighted indicators and click-to-filter drilldowns in Context X-Ray.
- Git Branch Drift Tracker: Branch-level telemetry comparing branch context against repository baselines with drift severity badges.
- Model Efficiency Frontier: Interactive latency vs. cost scatter plot highlighting optimal model choices.
- Budget Burn-Rate Forecaster: Dynamic burn velocity tracking with projected exhaustion horizon forecasting.
- Developer Feedback Suite: Real-time optimization confirmations, milestone achievement ledger with CO2e offsets, and prompt CodeLens hints.
- Real-Time Auto-Refresh: Event-driven UI updates across dashboard views upon context compilation.

## 8.4.0

- Context X-Ray Multi-Criteria Sorting: Added quick-filter sorting controls to the Context X-Ray dashboard view, enabling developers to sort workspace files by potential token savings, raw token count, or savings percentage.
- Native Chat Model Tier Guidance: Non-intrusive model routing advice is now surfaced directly in chat responses, suggesting when cost-effective model tiers can accomplish the task with minimal token spend.
- Large-File Responsiveness & Memory Optimization: Improved responsiveness and transient memory management for large-file index queries and active chat sessions.

## 8.3.0

- Authoritative fail-closed secret boundary with high-entropy token scanning and syntax-preserving redaction.
- Strict Restricted Mode fail-closed containment, blocking workspace reads, and bounded 300 KiB editor streaming.
- Subprocess isolation for /claude and /codex with minimal environment allowlists and executable verification.
- Authenticated project memory with per-workspace keys, authenticated encryption, and verified atomic replacement.
- Truthful 14-language syntax capability matrix with native parsers for TypeScript, JavaScript, and Python.
- Dedicated background worker boundaries for syntax pruning and streaming session log framing.
- Dockable native chat panel in Secondary Side Bar and Editor Tab with 10-session history and /handoff command.
- Deterministic packaging, CycloneDX 1.5 SBOM, and signed release attestation verification in CI.
- Updated documentation (tokonomics-team.github.io/tokonomics).

## 8.2.0

- Modernized the dashboard into Overview, Context, and Activity tabs with responsive layouts.
- Centralized client/host webview messaging in a typed protocol with runtime length validation.
- Added responsive stacked cell formatting and explicit cell labeling for narrow split-editor panes.
- Unified asynchronous operation feedback across active-file optimization, diff comparison, and workspace scans.

## 8.1.0

- Added a local First Context Check that sends nothing until the user explicitly submits a chat request.
- Added Context X-Ray for bounded estimates from one immutable workspace-index snapshot.
- Added an opt-in active selection/editor Context Meter with a 300 KiB safety limit.
- Added editor right-click context menu options and a dedicated Tokonomics submenu.
- Added one-shot, read-only health analysis for an explicitly selected supported session log.
- Added bounded, redacted handoff drafts for the active Tokonomics-owned chat.
- Added read-only structural overhead audits for explicitly selected tool-schema JSON.
- Tightened packaged contents and release evidence for the exact Marketplace VSIX.

## 8.0.0

- Documented the verified economic ROI model: prompt capacity headroom and direct token savings.
- Expanded structural context preparation across 14 languages, adding Ruby, Swift, Kotlin, and C/C++ support.
- Restored dockable native chat in Secondary Side Bar and dedicated Editor Tab with session history.
- Added live panel activity log for provider-reported command, file, tool and plan events.
- Added /codex and /claude subscription chat commands using official CLI logins.
- Provided task spend tracking, advisory budgets, and opt-in Claude usage log importing/watching.

## 7.0.1

- Refreshed context preparation with simplified four-setting configuration.
- Improved dashboard updates, status explanations, and token/cost visibility.
- Improved workspace awareness, request preservation, and fallback behavior.
- Added encrypted project memory with inspect, disable, export, and delete controls.

Optional local-model assistance is not enabled or advertised in this release.

## Earlier releases

- Introduced the Tokonomics chat participant, code-context tools, and usage visibility.
