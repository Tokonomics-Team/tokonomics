# Tokonomics release notes

## 8.6.0

- Model Context Protocol (MCP) Tool Firewall: Dynamic tool intent classification, catalog virtualization (`tokonomics_request_tool_catalog`), and compact minification pruning up to 90.0% of tool context overhead in 2.3ms.
- Community MCP Server Validation: Automated benchmark suite across 7 canonical community servers (55 tools: GitHub, Postgres, Filesystem, Brave Search, Puppeteer, Slack, Sentry) with 100% parameter accuracy and zero tool call misfires.
- Open-Source Benchmark Arena: Evaluated against canonical production repositories (Redux, Express, Axios, Fastify, React, Flask) achieving 66.2% average context reduction in Balanced mode.
- Direct Google Gemini API Provider: Native integration for Gemini models (`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`) via `Tokonomics: Configure Gemini API Key` alongside official Claude and Codex CLI transports.
- Context Savings Measurement Framework: Reproducible CLI validation runner and public evidence governance reports.

## 8.5.3

- Privacy Telemetry Reliability: Aligned event payloads and session identification with Aptabase's numeric epoch protocol for accurate session lifecycle and duration tracking.
- Periodic Session Pulse: Added background 30-minute heartbeat pings to maintain real-time active user and session metrics while the editor remains open.
- Environment-Aware Debug Routing: Automatically detects development mode to route development traffic to Aptabase's debug environment, keeping production release analytics clean.
- Comprehensive Feature Interaction Telemetry: Wired anonymous interaction tracking across chat participant commands and core dashboard actions.

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

- Fail-closed secret boundary with high-entropy token scanning and syntax-preserving redaction.
- Restricted Mode containment, blocking workspace reads, and bounded 300 KiB editor streaming.
- Subprocess isolation for /claude and /codex with minimal environment allowlists.
- Authenticated project memory with per-workspace keys and atomic replacement.
- Truthful 14-language syntax matrix with native parsers for TypeScript, JavaScript, and Python.
- Dedicated background worker boundaries for syntax pruning and streaming session log framing.
- Dockable native chat panel in Secondary Side Bar and Editor Tab with 10-session history and /handoff.
- Deterministic packaging, CycloneDX 1.5 SBOM, and signed release attestation verification in CI.
- Updated public documentation.

## 8.2.0

- Modernized the dashboard into Overview, Context, and Activity tabs with responsive layouts.
- Centralized client/host webview messaging in a typed protocol with runtime length validation.
- Added responsive stacked cell formatting and explicit cell labeling for narrow split-editor panes.
- Unified asynchronous operation feedback across active-file optimization, diff comparison, and workspace scans.

## Earlier releases

- 8.1.0: Added First Context Check, Context X-Ray estimates, opt-in Context Meter, chat handoffs, and tool-schema audits.
- 8.0.0: Documented verified economic ROI model, expanded 14-language context preparation, restored dockable native chat, and added task spend tracking.
- 7.0.1: Refreshed context preparation with simplified configuration, dashboard updates, and encrypted project memory.
- Initial releases: Introduced the Tokonomics chat participant, code-context tools, and usage visibility.
