# Tokonomics Release Notes

All notable user-facing changes and improvements to **Tokonomics** are documented here.

---

## [4.1.0] - 2026-08-30
### 🚀 New Features & Enhancements
- **⚡ In-Memory RAM Accelerator Engine**:
  - Automatically pre-warms workspace context on startup in idle micro-batches for instantaneous 0ms first-prompt latency.
  - Added high-speed in-memory symbol search index to surgically retrieve referenced signatures without loading full files.
  - Added multi-turn conversational deduplication to slash 500–2,000 tokens on follow-up chat turns.
  - Added customizable RAM budget (`tokenOptimizer.ramBudgetMB`, default 64MB) with automatic LRU memory management.
  - New chat telemetry command: **`@tokonomics /ram`** to inspect memory budget, active cache hit rate, and indexed symbols.
- **🛡️ 100% Anonymized Diagnostic Logger & Crash Reporter**:
  - Automatically scrubs usernames, local directory paths, IP addresses, and API keys.
  - New command: **`Tokonomics: Export Anonymized Diagnostic Logs`** to generate safe, PII-free diagnostic reports for GitHub issues.
  - New chat command: **`@tokonomics /logs`**.
- **📸 High-Efficiency Image Rightsizer**:
  - Automatically scales and optimizes screenshot attachments to save up to 96% on multimodal token costs.
- **🎯 Smart Model Router & Governance**:
  - Suggests the most cost-effective model tier (Flash vs. Standard vs. Reasoning) based on prompt complexity.
  - Added enterprise `modelAllowList` configuration for strict cost control.
- **🏷️ Official Rebranding**: Full Tokonomics branding, refreshed status bar pill (`⚡ Tokonomics: Active`), and updated command names.

---

## [4.0.0] - 2026-08-29
### ⚡ Major Performance & Savings Update
- **Deep Context Optimization**: Increased average token savings to **65%–88%** on multi-file code queries.
- **Instant Response Acceleration**: Instantaneous 0ms responses for repeated queries and common technical lookups.
- **Intelligent Diff Output Generator**: Directs AI models to return compact diff patches rather than repeating whole files, saving 40%–70% on output tokens.
- **Agentic Loop Guardrails**: Added token velocity alerts and stagnation circuit breakers to prevent runaway agent loops.
- **Context Slicing**: Support for surgical line-range context packing (`file.ts:L10-L50`).

---

## [3.0.0] - 2026-08-29
### 🌟 UI & FinOps Analytics
- **Visual Analytics Dashboard**: Interactive webview dashboard showing lifetime token savings, dollar ROI projections, and optimization breakdown.
- **Cloud Cache Alignment**: Prefix stabilization for Anthropic, OpenAI, and Gemini prompt cache discounts (saving an extra 50%–90%).
- **Interactive Status Bar Pill**: Real-time token reduction percentage and financial savings counter in the bottom status bar.

---

## [2.0.0] - 2026-08-29
### 🗺️ Structural Context Mapping
- **Smart Workspace Repository Mapping (`@tokonomics /map`)**: Builds compact 1,024-token structural codebase maps.
- **Multi-File Context Packer (`@tokonomics /pack`)**: Bundle and right-size multiple project files into a single compacted payload.

---

## [1.0.0] - 2026-08-29
### 🎉 Initial Launch
- Initial release of the Tokonomics intelligent context optimizer for VS Code.
