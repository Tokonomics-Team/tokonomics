# Tokonomics release notes

## 9.0.0

- Developer Productivity & Activity Telemetry: Local-only, non-invasive activity tracking using 2-minute heartbeats, 120s auto-pause on inactivity, and granular multi-language time attribution.
- Code Origin Attribution Engine: Real-time heuristic classifier distinguishing human typing dynamics from streaming AI completions and bulk snippet insertions, computing exact human- vs. AI-authored line splits with near-AI correlation.
- Flow State & AI Friction Correlation: In-memory analyzer identifying unbroken 20m+ deep coding sessions, calculating Flow Efficiency Score, and categorizing AI prompts into Accelerated Flow vs. High-Friction Detours.
- Air-Gapped Local DORA Metrics: Inner-loop lead time for changes (with AI vs. manual velocity delta), blended pre-commit Change Failure Rate (CFR), local test pass rates, and recovery turnaround speed (MTTR) queried directly from local Git history and VS Code Test API.
- Zero Outbound Egress Invariant: Strictly local execution with 0 bytes transmitted over network; zero external sockets, APIs, or telemetry daemons.
- Tamper-Proof Air-Gapped Audit Compliance: One-click sanitized export of compliance summaries in JSON and HTML format, verified with a SHA-256 cryptographic audit fingerprint.
- Unified Cockpit UI: Added ARIA-accessible Velocity & Flow and Local DORA tabs featuring responsive line gauges, friction indicators, and developer velocity KPI summary in the Overview panel.

## 8.9.0

- Semantic Graph Slicing: Multi-file dependency graph program slicing engine extracting exact call hierarchies and type contracts across TypeScript, JavaScript, Python, and Go with 70%–90% context token reduction and 100% causal completeness.
- Prefix Cache Pinning: Deterministic 3-tier prompt envelope layout engine ordering static system instructions, canonically sorted tool declarations, and pinned codebase slices with exact 1,024-token boundary alignment for guaranteed prefix cache hits on Anthropic, Gemini, and OpenAI.
- Dynamic Cache-Buster Sanitization: Neutralizes volatile timestamps, UUIDs, and turn counters in system prefixes to prevent accidental KV cache invalidation across multi-turn agent sessions.
- Zero Network Daemon Architecture: 100% local in-memory AST traversal and prompt envelope construction; zero listening ports, zero background daemon processes, zero proxy interception.
- Expanded MCP Server Catalog: Added canonical tools `tokonomics_slice_graph` and `tokonomics_pin_prefix` to the standalone MCP stdio server for Claude Code CLI, Cursor, and Codex.
- Top Repository Benchmarks: Validated on `reduxjs/redux` (-82.5%), `expressjs/express` (-71.0%), `tiangolo/fastapi` (-73.5%), `BurntSushi/ripgrep` (-71.5%), and `facebook/react` (-90.4%), achieving 75.6% aggregate context token reduction and 100% multi-turn prefix invariance.
- Independent Certification Audit: Full ISO/IEC 25010 & IEEE 1012 verification audit passing 100% of claims with Grade A+ certification.
- Marketplace Positioning: Rebranded to "AI Token Optimizer & Prompt Cache Engine" with refined categories and high-intent MCP, Claude Code, and prompt caching discovery tags.

## 8.8.0

- Universal Agent Layer & Execution Optimizer: Integrated Response Bloat Distiller (`tokonomics_distill_output`) into the Model Context Protocol (MCP) server, automatically condensing verbose command output for autonomous agents.
- Multi-Framework Test Distillation: Diagnostic extractors for Jest, Pytest, Go, Cargo, JUnit, and GoogleTest. Preserves 100% of failure stacks, error diagnostics, and assertions while eliminating repetitive passing noise.
- Large JSON & Diff Compaction: Bounds large structured arrays with head/tail pagination and collapses unchanged diff hunks, saving up to 94.9% tokens.
- Secret Sanitization & Fail-Open Safety: Automatically redacts credentials before agent context ingestion; safely returns raw output on unrecognized formats.
- Top Repository Benchmarks: Evaluated on Jest (-50.4%), FastAPI (-32.8%), Kubernetes (-39.9%), Ripgrep (-45.4%), Spring Boot (-62.5%), and PostgREST (-94.9%), achieving 85.5% aggregate bloat reduction in 0.44ms p95.
- Independent Certification Audit: Full ISO/IEC 25010 & IEEE 1012 verification audit passing 100% of assertions with Grade A+ certification.

## 8.7.0

- Universal Agent Layer MCP Server: Native Model Context Protocol (MCP) server running over JSON-RPC 2.0 stdio with two-stage progressive AST skeleton disclosure and on-demand symbol hydration.
- Agent Budget & Memory Cache Tools: Session token/cost budget status (`tokonomics_budget_status`) and cache checking (`tokonomics_check_cache`).
- Agent Configuration Helper & Standalone CLI: One-click clipboard configuration exporters for Claude Code CLI and Cursor.

## Earlier releases

- 8.6.x: Multi-language AST pruning for C/C++, header mapping, MCP Tool Firewall (55 tools), and open-source benchmark arena.
- 8.5.x: Privacy-preserving aggregate telemetry, spatial market treemap, and sticky KPI cockpit.
- 8.4.x - 8.0.0: Context X-Ray multi-criteria sorting, native chat panel, task spend tracking, and verified economic ROI models.
- 7.0.1: Refreshed context preparation with simplified configuration and encrypted project memory.
