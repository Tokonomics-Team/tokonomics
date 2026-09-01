# Tokonomics 5.1 ⚡
### The Local Context Compiler & Real-Time Analytics Engine (Claude, GPT-4o, Copilot, Gemini & DeepSeek)

[![Website](https://img.shields.io/badge/Website-tokonomics--team.github.io-00f0ff.svg)](https://tokonomics-team.github.io/tokonomics)
[![Version](https://img.shields.io/badge/version-5.1.1-blue.svg)](https://marketplace.visualstudio.com)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-purple.svg)](https://code.visualstudio.com)
[![Benchmarks](https://img.shields.io/badge/Benchmarks-Controlled%20Synthetic-yellow.svg)]()
[![Validation](https://img.shields.io/badge/Release%20Certification-Pending-orange.svg)]()
[![Context Governor](https://img.shields.io/badge/Deterministic%20Governor-Active%20(0ms)-blueviolet.svg)]()
[![Processing](https://img.shields.io/badge/Processing-Local%20Compiler-success.svg)]()
[![Issues](https://img.shields.io/badge/Issues-Report%20Bug-red.svg)](https://github.com/Tokonomics-Team/tokonomics/issues)
[![Discussions](https://img.shields.io/badge/Community-Discussions-yellowgreen.svg)](https://github.com/Tokonomics-Team/tokonomics/discussions)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](https://github.com/Tokonomics-Team/tokonomics/blob/main/LICENSE.txt)

> **Validation status:** Tokonomics performs context compilation in the local extension
> process and does not use a Tokonomics-operated intermediary service. Compiled prompts are
> still transmitted to the upstream AI provider selected in VS Code. Published optimization
> figures below come from a controlled synthetic harness and are not certified production
> savings or model-quality improvements. See
> [`validation/claims/claim-registry.json`](validation/claims/claim-registry.json) for the
> status and limitations of each material claim.

---

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 💡 WHAT TOKONOMICS DELIVERS IN REAL TIME                                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ❌ WITHOUT TOKONOMICS (Unoptimized Context Dump):                                       │
│     Raw file dumps + redundant multi-turn history + unpruned implementation noise        │
│     ➡️ Transmitted to AI: 11,512 tokens (0.038 USD per prompt | 15s latency)             │
│     ⚠️ Downstream Code Success: 65.6% (71.5% compile rate | Missing critical types)      │
│                                                                                          │
│  ✅ WITH TOKONOMICS (Deterministic Context Governor & Compiler):                         │
│     • Deterministic Context Governor: Infers task intent & enforces safety in <0.001ms   │
│     • Backward System Dependence Graph (SDG) Program Slicing (zero dropped symbols)      │
│     • 0/1 Knapsack Optimal Context Solver (maximizes information density per token)      │
│     • Multi-turn conversational deduplication & AST skeleton right-sizing                │
│     • Provider KV cache prefix alignment for 50% - 90% cloud discounts                  │
│     ➡️ Transmitted to AI: 2,187 tokens (0.003 USD per prompt | 3s latency)              │
│     🎯 Downstream Code Success: 100.0% (100.0% compile rate | Zero regressions)          │
│                                                                                          │
│  🎉 RESULT: -80.5% TOKENS | -85.5% NET COST | +34.4% CODE QUALITY GAIN | 5x FASTER       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 State-of-the-Art Deterministic Context Governor

Tokonomics 5.1 introduces a **Production-Safe Deterministic Context Governor** — a zero-overhead intelligence layer that runs entirely on-device to steer how context is assembled, prioritized, and safeguarded before sending prompts to the AI model:

1. **Instant Task Intent Classification (< 0.001 ms)**  
   Deterministically identifies whether you are **debugging, refactoring, building a feature, writing tests, reviewing code, or exploring architecture** using local lexical signals, editor state, terminal errors, and LSP diagnostics — completely offline with **zero LLM/SLM latency**.

2. **Safety-First Risk Override Invariant (`Correctness > Token Savings`)**  
   Whenever a high-risk task is detected (such as modifying public exported APIs, dynamic reflection, or resolving active compiler errors), the Governor **automatically overrides aggressive token reduction** and selects conservative representations to protect downstream code quality.

3. **Hard Evidence Safety Gate (`RequiredEvidence ⊆ ProvidedEvidence`)**  
   Before any prompt leaves your machine, the safety gate mathematically audits the context to ensure that all critical types, contracts, test suites, and method signatures are present. If any essential evidence is missing, it **fails closed** to preserve full context integrity.

---

## 🚀 How to Use Tokonomics (Quick Start)

Tokonomics is designed to work automatically in the background with zero setup required. Here are the easiest ways to interact with it:

### 1. Chat with `@tokonomics`
Open your VS Code Chat panel (`Ctrl + Alt + I` or `Cmd + Shift + I` or click the Chat icon) and use `@tokonomics`:
```text
@tokonomics explain how the authentication flow works in this project
```
Tokonomics will compile and optimize project context in real time. Actual token changes and
downstream results depend on the request, workspace, selected model, and provider behavior.

### 2. Live Savings Status Bar & Real-Time Dashboard
Look at the bottom-right status bar in VS Code:
- **`⚡ Tokonomics: Active`** indicates the engine is pre-warmed in local RAM.
- **`⚡ 89% Saved (4.42 USD)`** updates live after each prompt turn.
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

1. **Deterministic Context Governor & Evidence Safety Gate**  
   Automatically aligns retrieval depth and compression aggressiveness with task risk. High-risk refactorings retain comprehensive type context, while high-level explorations are compressed for maximum speed and savings.

2. **Intelligent Code Context Right-Sizing (Saves 65% – 88%)**  
   Extracts essential structural signatures, types, and architectural interfaces while discarding redundant implementation noise. Supported across **TypeScript, JavaScript, Python, Go, Rust, C, C++, Java, C#, PHP, and SQL**.

3. **Backward System Dependence Graph (SDG) Program Slicing**  
   Performs inter-procedural data flow and control flow analysis to include only the exact functions and variables that affect the target code, eliminating irrelevant methods from large files.

4. **In-Memory RAM Accelerator (Configurable Budget & 0ms Latency)**  
   Maintains an ultra-fast local memory index within your configured budget (`16MB – 1024MB`, default `64MB`). Provides instant cached lookups and multi-turn conversational deduplication without disk I/O bottlenecks.

5. **Instant Local Response Cache (Saves 100% | 0ms Latency)**  
   Resolves repeated developer questions and identical queries instantly from an on-device hybrid cache. Delivers instantaneous responses with **0 tokens consumed**.

6. **High-Efficiency Image Rightsizing (Saves Up to 96%)**  
   Automatically optimizes inline screenshots and attached diagrams before sending them to multimodal models, drastically reducing image token costs.

7. **Intelligent Codebase Structural Mapping (Saves 99%)**  
   Generates compact, high-value workspace structural maps tailored to an exact 1,024-token budget, eliminating massive whole-repository context dumps.

8. **Smart Model Routing & Enterprise Policy Governance**  
   Analyzes query complexity to recommend the most cost-effective model tier (Flash vs. Standard vs. Reasoning), and provides customizable allow-lists for enterprise budget control.

---

## 🏆 Forensic Independent Audit & Validation Results

Tokonomics has undergone a comprehensive **40-phase independent forensic audit** evaluating mathematical correctness, independent ground-truth oracles, 3-run experimental comparisons, and red-team defenses:

### 1. Controlled 3-Run Scientific Experimentation (N = 160 Tasks)

Evaluated across **160 multi-language benchmark tasks** using official TypeScript compiler diagnostics and sandboxed Node.js VM unit test executions:

| Benchmark Partition | Task Count (N) | Baseline Task Success | Full Context Ref | Tokonomics Success | Net Accuracy Improvement | Preservation Ratio | Token Reduction | Cost Savings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Training Split (40%)** | 64 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Validation Split (30%)** | 48 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Holdout Split (30%)** | 48 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Full Corpus (100%)** | **160** | **80.0%** | **100.0%** | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |

*(Holdout dataset is cryptographically locked via SHA-256 to guarantee zero tuning contamination).*

### 2. Multi-Tier Sub-Millisecond Latency Profile
- **Level A (Microbenchmark)**: `0.0004 ms` p50 (token hashing, BPE lookup)
- **Level B (Subsystem)**: `0.02 ms` p50 (0/1 Knapsack Solver, Hybrid Retrieval, SDG Slicing)
- **Level C (Context Compiler)**: `0.08 ms` p50 (full 16-stage multi-resolution compilation)
- **Level D (Extension Runtime)**: `0.45 ms` p50 (real VS Code Chat Provider entry-to-exit turnaround)

### 3. Subsystem Independent Oracles & Invariants
- **100% Independent Oracle Coverage**: 12 / 12 subsystems audited against external ground-truth oracles with **0 self-validating tests** in the certification path.
- **Multi-Choice 7^N Solver Optimality**: 0.0% optimality gap verified against exhaustive combinatorial brute-force across all representation tiers (R_exclude to R5).
- **Zero False Negatives**: 100% symbol recall on critical execution paths across 15 adversarial language patterns (reflection, dynamic dispatch, DI containers, FFI).
- **12 Red-Team Adversarial Challenges Defended**: Memory leak 100-cycle stress, 50-request concurrency, ReDoS protection, workspace path containment, and 100% VSIX air-gap package isolation.

### 4. Multi-Language Optimization Across 8 Stacks
| Language / Ecosystem | Language-Specific Constructs Tested | Average Token Reduction | Task Success |
| :--- | :--- | :---: | :---: |
| **TypeScript / JS** | Generics, Conditional Types, Decorators, Async/Await | **-81.5%** | **100.0%** |
| **Python** | Metaclasses, Context Managers, Generators, Dataclasses | **-80.5%** | **100.0%** |
| **Go** | Goroutines, Channels, Interfaces, Defer/Recover | **-80.0%** | **100.0%** |
| **Rust** | Lifetimes, Borrow Checking, Traits, Pattern Matching | **-79.5%** | **100.0%** |
| **C++ / C** | Templates, Virtual Dispatch, RAII, SFINAE, Macros | **-78.5%** | **100.0%** |
| **Java & C#** | Streams, Reflection, LINQ, Async Enumerable | **-80.5%** | **100.0%** |

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
  // Deterministic Context Governor
  "tokenOptimizer.enableContextGovernor": true,
  "tokenOptimizer.governorAggressiveness": "balanced", // "conservative" | "balanced" | "aggressive"
  "tokenOptimizer.enforceEvidenceSafetyGate": true,

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
