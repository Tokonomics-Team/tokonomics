# Tokonomics release notes

## 8.7.0

- Universal Agent Layer MCP Server: Native Model Context Protocol (MCP) server running over JSON-RPC 2.0 stdio (`tokonomics-mcp-server`), seamlessly plugging Tokonomics into autonomous external agent workflows: Claude Code CLI, Cursor Agent (`.cursor/mcp.json`), Codex CLI, and Copilot Agent mode.
- Two-Stage Progressive Disclosure Engine: Eliminates the quality-vs-tokens dilemma. Delivers high-level AST skeletons on initial file reads (`tokonomics_read_skeleton`), paired with on-demand byte-accurate function/class symbol hydration (`tokonomics_expand_symbol`). Achieves 100% eval task accuracy parity while keeping context compact.
- Agent Budget & Memory Cache Tools: Provides external agents with live session token/cost budget status (`tokonomics_budget_status`) and read-only cache checking (`tokonomics_check_cache`) to prevent redundant LLM generations across multi-step agent loops.
- Agent Configuration Helper & Dashboard Integration: Added one-click clipboard configuration exporters for Claude Code CLI and Cursor directly from the Command Palette and Dashboard Activity view (`Tokonomics: Copy Agent MCP Configuration`).
- Hardened Path & Security Validations: Strict path containment, symlink traversal prevention, and sensitive token redaction across all MCP file inspections.
- Standalone CLI Executable: Self-contained MCP server bundle (`dist/mcp-server.js`) packaged within the extension VSIX for zero-dependency execution via `node dist/mcp-server.js`.

## 8.6.1

- Multi-Language AST Pruning Engine: Native context compilation and slicing for C (`.c`, `.h`), C++ (`.cpp`, `.hpp`, `.cc`, `.cxx`), and top compiled languages. Full support for Allman and K&R brace conventions, multi-line function headers, `typedef struct` aliases, templates, and preprocessor directives with 55%–57% verified token reduction.
- Header File Support: Extended language detection and file mapping to recognize C/C++ header files (`.h`, `.hpp`, `.hh`, `.hxx`, `.inl`, `.cu`) and Python interface files (`.pyi`).
- Interactive Studio Playground: Added live C, C++, Java, and C# simulation playgrounds to the web documentation suite.

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

## Earlier releases

- 8.5.0: Sticky KPI cockpit, context pipeline stepper, spatial treemap, git branch drift, model frontier, and budget forecaster.
- 8.4.0: Context X-Ray multi-criteria sorting, native chat model tier guidance, and large-file memory optimization.
- 8.3.0: Secret scanning, Restricted Mode containment, authenticated project memory, and dockable native chat panel.
- 8.2.0: Modernized dashboard into Overview, Context, and Activity tabs with responsive layouts.
- 8.1.0: First Context Check, Context X-Ray estimates, opt-in Context Meter, chat handoffs, and tool-schema audits.
- 8.0.0: Verified economic ROI model, expanded language context preparation, and task spend tracking.
- 7.0.1: Refreshed context preparation with simplified configuration and encrypted project memory.
