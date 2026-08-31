# Tokonomics Release Notes

All notable user updates, feature additions, and performance improvements to **Tokonomics** are documented here.

---

## [5.0.1] - 2026-08-31
### 🛠️ Architecture Hardening, Security & VS Code Chat Fixes
- **Chat Participant Handle**: Fixed participant registration name to `@tokonomics` (`"name": "tokonomics"` in `package.json`), matching official VS Code Chat conventions.
- **Activation Crash Fix**: Removed duplicate command registration for `tokenOptimizer.showDashboard` that caused runtime errors on extension activation.
- **Modern Language Model Metadata**: Replaced deprecated `languageModelProviders` with `contributes.languageModelChatProviders` and matching vendor configuration.
- **16-Stage Compiler Wiring**: Wired `PipelineOrchestrator.compileContext()` directly into standard chat execution turns with post-inference cost reconciliation.
- **Dashboard Webview Security**: Hardened dashboard webview with a strict Content Security Policy and dynamic per-render cryptographic nonces.
- **Path Traversal Guard**: Added workspace directory containment enforcement on `@tokonomics /pack` to strictly prevent traversal outside active workspace roots.
- **Bounded Workspace Scan**: Added 50-file and 500KB per-file guards to the dashboard workspace scanner to guarantee smooth UI thread responsiveness.
- **Complete Command Contribution**: Contributed all 10 slash commands (`/dashboard`, `/live`, `/explain`, `/stats`, `/map`, `/pack`, `/analyze`, `/compact`, `/logs`, `/ram`) in the extension manifest.

---

## [5.0.0] - 2026-08-31
### 🏛️ Major Milestone: Tokonomics 5.0 — The Local Context Compiler
- **16-Stage Local Context Compiler**: Full multi-layer context compilation with dynamic program slicing, knapsack token budget optimization, and sub-millisecond execution.
- **Real-Time Visualizer Dashboard**: Event-driven local analytics dashboard with live token/cost streams, stage-by-stage savings waterfalls, and active file optimization.
- **Expanded Multi-Language Support**: Dedicated structural pruning and signature extraction for **14 languages** (C, C++, Rust, Go, TypeScript, JavaScript, Python, Java, C#, PHP, and SQL).
- **Refreshed 2026 Model Profiles**: Updated pricing profiles and cache economics for Claude 3.7 / 3.5 Sonnet, GPT-4o series, Gemini 2.5 / 3.x, and DeepSeek-V3 / R1.
- **Live Status Bar Feedback**: Ephemeral savings flash on prompt completion (`⚡ Tokens Saved | Cost Saved`).
- **New Slash Commands**: Added `@tokonomics /dashboard`, `@tokonomics /live`, `@tokonomics /stats`, and `@tokonomics /explain`.

---

## [4.1.1] - 2026-08-30
### 🛡️ Documentation & Marketplace Release
- Updated official marketplace metadata, license terms, and community support links.

---

## [4.1.0] - 2026-08-30
### 🚀 Features & Enhancements
- **In-Memory RAM Accelerator**: 0ms instant local memory acceleration for faster prompt processing and lower token consumption.
- **Anonymized Diagnostic Logger**: 100% private, PII-free diagnostic logger (`@tokonomics /logs` and `Tokonomics: Export Anonymized Diagnostic Logs`).
- **Image & Screenshot Rightsizer**: Automatically optimizes screenshot attachments to save up to 96% on image token costs.
- **Smart Model Routing**: Automatically suggests the most cost-effective AI model tier based on task complexity.
- **Official Rebranding**: Complete Tokonomics visual identity and updated slash commands.

---

## [4.0.0] - 2026-08-29
### ⚡ Performance & Token Savings
- **Advanced Context Optimization**: Increased average token savings to **65%–88%** on multi-file coding workflows.
- **Instant Response Cache**: Instantaneous responses for repeated queries with zero token usage.
- **Output Patch Optimization**: Directs models to generate concise code patches, saving 40%–70% on output tokens.
- **Agent Cost Guardrails**: Real-time spending alerts and loop prevention.

---

## [3.0.0] - 2026-08-29
### 🌟 Analytics & Dashboards
- **Visual Analytics Dashboard**: Interactive FinOps dashboard tracking token savings and dollar ROI.
- **Provider Cache Alignment**: Prefix optimization for Anthropic, OpenAI, and Gemini prompt cache discounts.
- **Live Status Bar Telemetry**: Real-time token reduction percentage and financial savings counter.

---

## [2.0.0] - 2026-08-29
### 🗺️ Workspace Mapping
- **Structural Workspace Map (`@tokonomics /map`)**: High-efficiency codebase structure mapping.
- **Context Packing (`@tokonomics /pack`)**: Bundle and right-size multiple project files into compact payloads.

---

## [1.0.0] - 2026-08-29
### 🎉 Initial Launch
- Initial release of Tokonomics AI Token Optimizer for VS Code.
