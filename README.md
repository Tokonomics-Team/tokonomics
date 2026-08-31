# Tokonomics 5.0 ⚡
### The Local Context Compiler & Real-Time Analytics Engine (Claude, GPT-4o, Copilot, Gemini & DeepSeek)

[![Website](https://img.shields.io/badge/Website-tokonomics--team.github.io-00f0ff.svg)](https://tokonomics-team.github.io/tokonomics)
[![Version](https://img.shields.io/badge/version-5.1.0-blue.svg)](https://marketplace.visualstudio.com)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-purple.svg)](https://code.visualstudio.com)
[![Token Savings](https://img.shields.io/badge/Token%20Savings-65%25%20--%2088%25-brightgreen.svg)]()
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-success.svg)]()
[![Issues](https://img.shields.io/badge/Issues-Report%20Bug-red.svg)](https://github.com/Tokonomics-Team/tokonomics/issues)
[![Discussions](https://img.shields.io/badge/Community-Discussions-yellowgreen.svg)](https://github.com/Tokonomics-Team/tokonomics/discussions)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](https://github.com/Tokonomics-Team/tokonomics/blob/main/LICENSE.txt)

> 🔒 **100% LOCAL COMPILATION — ZERO INTERMEDIARY SERVERS**  
> All context compilation algorithms, AST structural pruning, PageRank indexing, and cost calculations run **100% locally on your machine** inside your VS Code extension host. **No Tokonomics backend servers, no intermediate proxy relays, and zero telemetry.** Your optimized prompts and context are transmitted **only directly to your selected upstream AI provider** (Anthropic, OpenAI, GitHub Copilot, or local Ollama) according to your own AI configuration and credentials.

---

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 💡 WHAT TOKONOMICS DELIVERS IN REAL TIME                                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ❌ WITHOUT TOKONOMICS (Unoptimized Context Dump):                                       │
│     Raw file dumps + redundant multi-turn history + oversized screenshots                │
│     ➡️ Transmitted to AI: 8,500 tokens ($0.0255 per prompt | 15s latency)               │
│                                                                                          │
│  ✅ WITH TOKONOMICS (Intelligent Token Optimization):                                    │
│     • Surgical code context right-sizing (preserves 100% accuracy)                       │
│     • Fast in-memory symbol acceleration (<1ms latency)                                  │
│     • Multi-turn conversational deduplication                                            │
│     • High-efficiency screenshot rightsizing                                             │
│     • Provider cache prefix alignment for 50-90% cloud discounts                         │
│     ➡️ Transmitted to AI: 2,100 tokens ($0.0063 per prompt | 3s latency)                │
│                                                                                          │
│  🎉 RESULT: 75.3% TOKENS SAVED | $0.0192 SAVED PER PROMPT | 5× FASTER RESPONSE           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 How to Use Tokonomics (Quick Start)

Tokonomics is designed to work automatically in the background with zero setup required. Here are the easiest ways to interact with it:

### 1. Chat with `@tokonomics`
Open your VS Code Chat panel (`Ctrl + Alt + I` or `Cmd + Shift + I` or click the Chat icon) and use `@tokonomics`:
```text
@tokonomics explain how the authentication flow works in this project
```
Tokonomics will compile and optimize your project context in real time, saving up to 88% of tokens while preserving complete context accuracy.

### 2. Live Savings Status Bar & Real-Time Dashboard
Look at the bottom-right status bar in VS Code:
- **`⚡ Tokonomics: Active`** indicates the engine is pre-warmed in local RAM.
- **`⚡ 89% Saved ($4.42)`** updates live after each prompt turn.
- **Click the status bar item** or run `Ctrl + Shift + P` ➔ **`Tokonomics: Show Savings Dashboard`** to open the real-time visual analytics dashboard with token/cost streams, savings waterfalls, and active file optimization.

### 3. Quick Slash Commands in Chat
Type `@tokonomics` followed by a slash command:
| Command | Action |
| :--- | :--- |
| `@tokonomics /dashboard` | Open the interactive real-time visualizer dashboard with dual waterfalls |
| `@tokonomics /live` | View live active session token and cost efficiency stream |
| `@tokonomics /explain` | Inspect the 16-stage compiler decision trace for the most recent optimization |
| `@tokonomics /stats` | View aggregated multi-window metrics (`Session`, `Today`, `Lifetime`) |
| `@tokonomics /map` | Generate a high-signal, 1,024-token structural map of your workspace |
| `@tokonomics /pack <path>` | Pack and compact workspace files into an AST-pruned context skeleton |
| `@tokonomics /analyze` | Run a real-time token audit on your currently active editor file |
| `@tokonomics /compact` | Compact code or conversational prompt context |
| `@tokonomics /logs` | View and export 100% anonymized diagnostic logs and crash report |
| `@tokonomics /ram` | View in-memory RAM cache status, indexed symbols, and memory budget |

### 4. Right-Click Context Menu & Command Palette
- Select any code in your editor, right-click, and choose **`Tokonomics: Optimize Selected Code Context`** to copy a right-sized structural skeleton directly to your clipboard.
- Open Command Palette (`Ctrl + Shift + P` / `Cmd + Shift + P`) and type **`Tokonomics`** to access all optimization tools.

---

## ⚡ Core Capabilities

1. **Intelligent Code Context Right-Sizing (Saves 65% – 88%)**  
   Intelligently extracts essential structural signatures, types, and architectural interfaces while discarding redundant implementation noise. Supported across **C, C++, Rust, Go, TypeScript, JavaScript, Python, Java, C#, PHP, and SQL**.

2. **In-Memory RAM Accelerator (Configurable Budget & 0ms Latency)**  
   Maintains an ultra-fast local memory index within your configured budget (`16MB – 1024MB`, default `64MB`). Provides instant cached lookups and multi-turn conversational deduplication without disk I/O bottlenecks.

3. **Instant Local Response Cache (Saves 100% | 0ms Latency)**  
   Resolves repeated developer questions and identical queries instantly from an on-device hybrid cache. Delivers instantaneous responses with **0 tokens consumed**.

4. **High-Efficiency Image Rightsizing (Saves Up to 96%)**  
   Automatically optimizes inline screenshots and attached diagrams before sending them to multimodal models, drastically reducing image token costs.

5. **Intelligent Codebase Structural Mapping (Saves 99%)**  
   Generates compact, high-value workspace structural maps tailored to an exact 1,024-token budget, eliminating massive whole-repository context dumps.

6. **Smart Model Routing & Enterprise Policy Governance**  
   Analyzes query complexity to recommend the most cost-effective model tier (Flash vs. Standard vs. Reasoning), and provides customizable allow-lists for enterprise budget control.

---

## ⚡ Real-World Benchmarks

| Workload | Unoptimized | With Tokonomics | Net Savings |
|:---|:---:|:---:|:---:|
| **Code Context Payload** | 8,500 tokens | 2,100 tokens | **75.3% saved** |
| **Repeated Technical Queries** | 4,200 tokens | 0 tokens (0ms) | **100% saved** |
| **Screenshot Attachments** | 2.4 MB (~1.6k tok) | 80 KB (~50 tok) | **96.8% saved** |
| **Full Repo Structural Index** | 120,000 tokens | 1,024 tokens | **99.1% saved** |
| **Multi-Turn Chat History** | 6,200 tokens | 1,450 tokens | **76.6% saved** |
| **Tool & MCP Schemas** | 3,980 tokens | 824 tokens | **79.3% saved** |
| **Output Code Patching** | 3,500 tokens | 850 tokens (diff patch) | **75.7% saved** |

---

## 🎯 Target Use Cases & Supported AI Ecosystem

Tokonomics is engineered for individual developers, AI engineers, and enterprise development teams using AI coding assistants and API proxies:

- **Anthropic Claude (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude Opus)**: Automatically stabilizes the 1,024-token prompt prefix to unlock Anthropic's **90% prompt caching discount**.
- **OpenAI (GPT-4o, GPT-4o mini, o1, o3-mini)**: Compresses multi-turn conversation payloads and stabilizes static headers for OpenAI's **50% cached token discount**.
- **GitHub Copilot & Cursor**: Reduces conversational code bloat, rightsizes attached files, and prevents context window exhaustion during deep refactoring tasks.
- **DeepSeek & Gemini (DeepSeek-V3, DeepSeek-R1, Gemini 2.5 Pro/Flash)**: Minimizes token overhead for reasoning models that require large context allocations.
- **Enterprise AI FinOps & Rate Limit Prevention**: Mitigates 429 Rate Limit spikes and reduces monthly cloud API bills across engineering organizations by up to 88%.

---

## ⚙️ Configuration Options

Customize Tokonomics in your `settings.json`:

```json
{
  // RAM Acceleration & In-Memory Index
  // • Low-RAM devices / laptops: 16 - 32 MB
  // • Standard development: 64 MB (Default)
  // • Large enterprise monorepos (10k+ files): 128 - 256 MB
  "tokenOptimizer.ramBudgetMB": 64,
  "tokenOptimizer.enableBackgroundRamWarming": true,
  "tokenOptimizer.enableRamSemanticIndex": true,

  // Core Optimization Toggles
  "tokenOptimizer.enableAstPruning": true,
  "tokenOptimizer.enableCacheAlignment": true,
  "tokenOptimizer.enableTextCompression": true,

  // Image Rightsizing
  "tokenOptimizer.enableImageRightsizing": true,
  "tokenOptimizer.imageMaxDimension": 512,

  // Response Cache & Model Routing
  "tokenOptimizer.enableResponseCache": true,
  "tokenOptimizer.enableModelRouting": true,
  "tokenOptimizer.modelAllowList": []
}
```

---

## 🤝 Community, Support & Feedback

We welcome feedback, bug reports, and feature requests!

- 🌐 **Live Website & Documentation**: [tokonomics-team.github.io/tokonomics](https://tokonomics-team.github.io/tokonomics)
- 🐛 **Report a Bug**: [GitHub Issues](https://github.com/Tokonomics-Team/tokonomics/issues/new?template=bug_report.md) *(Attach safe diagnostics via `Tokonomics: Export Anonymized Diagnostic Logs`)*
- 💡 **Request a Feature**: [Feature Request Form](https://github.com/Tokonomics-Team/tokonomics/issues/new?template=feature_request.md)
- 💬 **Community Discussions**: [GitHub Discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)
- ⭐ **GitHub Repository**: [github.com/Tokonomics-Team/tokonomics](https://github.com/Tokonomics-Team/tokonomics)

---

## 🌐 Compatibility with VS Code, Cursor, VSCodium & Gitpod

Tokonomics is built on standard VS Code APIs and runs across all major environments:

- 🟢 **Microsoft VS Code**: 100% Native (Chat Participant `@tokonomics` + Language Model Proxy).
- 🟢 **Cursor**: 100% Compatible (Context Packing, Repo Map, Diff Viewer, Dashboard).
- 🟢 **VSCodium / Eclipse Theia**: 100% Compatible via Open VSX Registry.
- 🟢 **Gitpod / GitHub Codespaces**: 100% Compatible in browser & desktop containers.

---

## 🔒 100% Privacy & Local Security Guarantees

1. **Local-Only Execution**: All token optimization algorithms, memory caches, and image compression execute strictly within your local machine process.
2. **Zero Network Calls to Extension Backend**: Tokonomics has **no backend servers**, collects **no analytics**, and makes **zero external HTTP requests**.
3. **Automatic Secret Redaction**: ReDoS-safe scanner automatically redacts API keys (AWS, OpenAI, Anthropic, GitHub) and private keys before prompts are sent to your chosen AI model.
4. **WASM Memory Safe**: Deterministic memory management prevents extension host leaks.

---

## 📄 License & Intellectual Property

Copyright © 2026 **Tokonomics Team**. All Rights Reserved.

Tokonomics is proprietary software. Unauthorized copying, modification, decompilation, reverse engineering, or redistribution of this software or its underlying algorithms is strictly prohibited. See [LICENSE.txt](https://github.com/Tokonomics-Team/tokonomics/blob/main/LICENSE.txt) for full terms.
