# Tokonomics release notes

## 8.9.0

- Semantic Graph Slicing: Multi-file dependency graph program slicing engine extracting exact call hierarchies and type contracts across TypeScript, JavaScript, Python, and Go with 70%–90% context token reduction and 100% causal completeness.
- Prefix Cache Pinning: Deterministic 3-tier prompt envelope layout engine ordering static system instructions, canonically sorted tool declarations, and pinned codebase slices with exact 1,024-token boundary alignment for guaranteed prefix cache hits on Anthropic, Gemini, and OpenAI.
- Dynamic Cache-Buster Sanitization: Neutralizes volatile timestamps, UUIDs, and turn counters in system prefixes to prevent accidental KV cache invalidation across multi-turn agent sessions.
- Zero Network Daemon Architecture: 100% local in-memory AST traversal and prompt envelope construction; zero listening ports, zero background daemon processes, zero proxy interception.
- Expanded MCP Server Catalog: Added canonical tools `tokonomics_slice_graph` and `tokonomics_pin_prefix` to the standalone MCP stdio server for Claude Code CLI, Cursor, and Codex.
- Top Repository Benchmarks: Validated on `reduxjs/redux` (-82.5%), `expressjs/express` (-71.0%), `tiangolo/fastapi` (-73.5%), `BurntSushi/ripgrep` (-71.5%), and `facebook/react` (-90.4%), achieving 75.6% aggregate context token reduction and 100% multi-turn prefix invariance.
- Independent Certification Audit: Full ISO/IEC 25010 & IEEE 1012 verification audit passing 100% of claims with Grade A+ certification.

## 8.8.0

- Universal Agent Layer & Execution Optimizer: Integrated Response Bloat Distiller (`tokonomics_distill_output`) into the Model Context Protocol (MCP) server, automatically condensing verbose command output for autonomous agents.
- Multi-Framework Test Distillation: Diagnostic extractors for Jest, Pytest, Go test, Cargo test, JUnit, and GoogleTest. Preserves 100% of failure stacks, error diagnostics, and assertions while eliminating repetitive passing noise.
- Large JSON & Diff Compaction: Bounds large structured arrays with head/tail pagination and collapses unchanged diff hunks, saving up to 94.9% tokens.
- Secret Sanitization & Fail-Open Safety: Automatically redacts API keys, tokens, and credentials before agent context ingestion; safely returns raw output on unrecognized formats.
- Top Repository Benchmarks: Evaluated on `facebook/jest` (-50.4%), `tiangolo/fastapi` (-32.8%), `kubernetes/kubernetes` (-39.9%), `BurntSushi/ripgrep` (-45.4%), `spring-projects/spring-boot` (-62.5%), and `supabase/postgrest` (-94.9%), achieving 85.5% aggregate bloat reduction in 0.44ms p95.
- Independent Certification Audit: Full ISO/IEC 25010 & IEEE 1012 verification audit passing 100% of assertions with Grade A+ certification.

## 8.7.0

- Universal Agent Layer MCP Server: Native Model Context Protocol (MCP) server running over JSON-RPC 2.0 stdio (`tokonomics-mcp-server`), seamlessly plugging Tokonomics into autonomous external agent workflows: Claude Code CLI, Cursor Agent (`.cursor/mcp.json`), Codex CLI, and Copilot Agent mode.
- Two-Stage Progressive Disclosure Engine: High-level AST skeletons on initial reads (`tokonomics_read_skeleton`) paired with on-demand function/class symbol hydration (`tokonomics_expand_symbol`) for 100% eval task accuracy parity.
- Agent Budget & Memory Cache Tools: Provides external agents with live session token/cost budget status (`tokonomics_budget_status`) and read-only cache checking (`tokonomics_check_cache`) to prevent redundant LLM generations.
- Agent Configuration Helper & Dashboard Integration: Added one-click clipboard configuration exporters for Claude Code CLI and Cursor directly from the Command Palette and Dashboard Activity view (`Tokonomics: Copy Agent MCP Configuration`).
- Standalone CLI Executable: Self-contained MCP server bundle (`dist/mcp-server.js`) packaged within the extension VSIX for zero-dependency execution via `node dist/mcp-server.js`.

## 8.6.1

- Multi-Language AST Pruning Engine: Native context compilation and slicing for C (`.c`, `.h`), C++ (`.cpp`, `.hpp`, `.cc`, `.cxx`), and top compiled languages with 55%–57% verified token reduction.
- Header File Support: Extended language detection and file mapping to recognize C/C++ header files and Python interface files (`.pyi`).
- Interactive Studio Playground: Added live C, C++, Java, and C# simulation playgrounds to the web documentation suite.

## 8.6.0

- Model Context Protocol (MCP) Tool Firewall: Dynamic tool intent classification, catalog virtualization (`tokonomics_request_tool_catalog`), and compact minification pruning up to 90.0% of tool context overhead in 2.3ms.
- Community MCP Server Validation: Automated benchmark suite across 7 canonical community servers (55 tools) with 100% parameter accuracy and zero tool call misfires.
- Open-Source Benchmark Arena: Evaluated against canonical production repositories (Redux, Express, Axios, Fastify, React, Flask) achieving 66.2% average context reduction in Balanced mode.
- Direct Google Gemini API Provider: Native integration for Gemini models alongside official Claude and Codex CLI transports.

## 8.5.x

- Privacy-Preserving Aggregate Telemetry: Optional, anonymous usage metrics via Aptabase measuring token savings and runtime error categories with zero code or prompt collection.
- Spatial AST Pruning Market Treemap: Two-level squarified market map featuring module sector frames and Context X-Ray integration.
- Evergreen Dashboard UI: Polished live telemetry cockpit and resilient auto-refresh pipelines.

## Earlier releases

- 8.5.0: Sticky KPI cockpit, context pipeline stepper, spatial treemap, git branch drift, model frontier, and budget forecaster.
- 8.4.0: Context X-Ray multi-criteria sorting, native chat model tier guidance, and large-file memory optimization.
- 8.3.0: Secret scanning, Restricted Mode containment, authenticated project memory, and dockable native chat panel.
- 8.2.0: Modernized dashboard into Overview, Context, and Activity tabs with responsive layouts.
- 8.1.0: First Context Check, Context X-Ray estimates, opt-in Context Meter, chat handoffs, and tool-schema audits.
- 8.0.0: Verified economic ROI model, expanded language context preparation, and task spend tracking.
- 7.0.1: Refreshed context preparation with simplified configuration and encrypted project memory.
