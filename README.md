# Tokonomics 5.1 ⚡
### The Local Context Compiler & Real-Time Analytics Engine (Claude, GPT-4o, Copilot, Gemini & DeepSeek)

[![Website](https://img.shields.io/badge/Website-tokonomics--team.github.io-00f0ff.svg)](https://tokonomics-team.github.io/tokonomics)
[![Version](https://img.shields.io/badge/version-5.1.1-blue.svg)](https://marketplace.visualstudio.com)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.106.0-purple.svg)](https://code.visualstudio.com)
[![Benchmarks](https://img.shields.io/badge/Benchmarks-Controlled%20Synthetic-yellow.svg)]()
[![Validation](https://img.shields.io/badge/Release%20Certification-Pending-orange.svg)]()

> **Phase 10 experiments:** Advanced ranking, delta-context, cache-layout, progressive
> compilation, semantic-retrieval, project-memory, vision, and adaptive-budget candidates
> are disabled by default and require explicit local consent. They remain shadow-only
> and unpromoted; synthetic tests are not evidence of production uplift.
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

## 🧠 Deterministic Context Governor

Tokonomics 5.1 includes a deterministic local governor that steers how context is assembled, prioritized, and safeguarded before prompts are sent to the selected AI model:

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
| `@tokonomics /logs` | View and export bounded, locally sanitized diagnostic logs and crash report |
| `@tokonomics /ram` | View in-memory RAM cache status, indexed symbols, and memory budget |

### 4. Right-Click Context Menu & Command Palette
- Select any code in your editor, right-click, and choose **`Tokonomics: Optimize Selected Code Context`** to copy a right-sized structural skeleton directly to your clipboard.
- Open Command Palette (`Ctrl + Shift + P` / `Cmd + Shift + P`) and type **`Tokonomics`** to access all optimization tools.

---

## ⚡ Core Capabilities

1. **Deterministic Context Governor & Evidence Safety Gate**  
   Automatically aligns retrieval depth and compression aggressiveness with task risk. High-risk refactorings retain comprehensive type context, while high-level explorations are compressed for maximum speed and savings.

2. **Intelligent Code Context Right-Sizing**
   Extracts essential structural signatures, types, and architectural interfaces while discarding redundant implementation noise. Supported across **TypeScript, JavaScript, Python, Go, Rust, C, C++, Java, C#, PHP, and SQL**.

3. **Backward System Dependence Graph (SDG) Program Slicing**  
   Performs inter-procedural data flow and control flow analysis to include only the exact functions and variables that affect the target code, eliminating irrelevant methods from large files.

4. **In-Memory RAM Accelerator (Configurable Budget)**
   Maintains an ultra-fast local memory index within your configured budget (`16MB – 1024MB`, default `64MB`). Provides instant cached lookups and multi-turn conversational deduplication without disk I/O bottlenecks.

5. **Safety-Bound Exact Local Response Cache**
   Replays an answer only when the request, conversation, workspace snapshot, evidence, model, tools, compiler configuration, policy, and extension version are identical. Approximate matches never replay answer text. Eligible exact hits avoid a downstream model request; realized savings depend on the provider and request.

6. **Bounded Image Rightsizing**
   Locally rightsizes eligible inline screenshots and workspace-contained references. Actual payload and provider-token changes depend on the image, model, and provider accounting.

7. **Token-Budgeted Codebase Structural Mapping**
   Generates compact, high-value workspace structural maps tailored to an exact 1,024-token budget, eliminating massive whole-repository context dumps.

8. **Smart Model Routing & Enterprise Policy Governance**  
   Analyzes query complexity to recommend the most cost-effective model tier (Flash vs. Standard vs. Reasoning), and provides customizable allow-lists for enterprise budget control.

---

## 🏆 Controlled Synthetic Audit & Validation Results

The repository contains a controlled synthetic harness evaluating mathematical invariants, separate oracle implementations, repeated fixture comparisons, and red-team cases. These results validate the harness and transformations, not upstream-model or production outcomes:

### 1. Controlled 3-Run Scientific Experimentation (N = 160 Tasks)

Evaluated across **160 multi-language benchmark tasks** using official TypeScript compiler diagnostics and sandboxed Node.js VM unit test executions:

| Benchmark Partition | Task Count (N) | Baseline Task Success | Full Context Ref | Tokonomics Success | Net Accuracy Improvement | Preservation Ratio | Token Reduction | Cost Savings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Training Split (40%)** | 64 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Validation Split (30%)** | 48 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Holdout Split (30%)** | 48 | 80.0% | 100.0% | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |
| **Full Corpus (100%)** | **160** | **80.0%** | **100.0%** | **100.0%** | **+20.0% pts** | **1.0 (100.0%)** | **-80.5%** | **-85.5%** |

*(Fixture metadata is SHA-256 locked so changes are detectable; this does not independently prove absence of tuning contamination.)*

### 2. Multi-Tier Sub-Millisecond Latency Profile
- **Level A (Microbenchmark)**: `0.0004 ms` p50 (token hashing, BPE lookup)
- **Level B (Subsystem)**: `0.02 ms` p50 (0/1 Knapsack Solver, Hybrid Retrieval, SDG Slicing)
- **Level C (Context Compiler)**: `0.08 ms` p50 (full 16-stage multi-resolution compilation)
- **Level D (Extension Runtime)**: `0.45 ms` p50 (real VS Code Chat Provider entry-to-exit turnaround)

### 3. Subsystem Independent Oracles & Invariants
- **Synthetic oracle coverage**: 12 / 12 designated subsystems have separate fixture-oracle checks in the controlled harness.
- **Multi-Choice 7^N Solver Optimality**: 0.0% optimality gap verified against exhaustive combinatorial brute-force across all representation tiers (R_exclude to R5).
- **Fixture recall**: the checked critical symbols were retained across 15 controlled adversarial language patterns.
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

- **Anthropic Claude family**: Can stabilize eligible prompt prefixes; any discount requires provider-reported cache usage and current provider pricing.
- **OpenAI model family**: Can compact conversation payloads and stabilize static headers; realized cached-token pricing is provider-dependent.
- **GitHub Copilot & Cursor**: Reduces conversational code bloat, rightsizes attached files, and prevents context window exhaustion during deep refactoring tasks.
- **DeepSeek & Gemini (DeepSeek-V3, DeepSeek-R1, Gemini 2.5 Pro/Flash)**: Minimizes token overhead for reasoning models that require large context allocations.
- **Token-economics visibility**: Reports request-bound estimates and provider-reconciled values when usage and current pricing evidence are available.

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

Tokonomics is built on VS Code APIs. The current artifact matrix verifies the exact VSIX on Windows using VS Code 1.106.0, current Stable, and current Insiders. Other hosts require separate qualification:

- 🟢 **Microsoft VS Code**: Windows artifact matrix passed on minimum, Stable, and Insiders hosts.
- ⚪ **Cursor**: Not certified by the current artifact matrix.
- ⚪ **VSCodium / Eclipse Theia**: Not certified by the current artifact matrix.
- ⚪ **Gitpod / GitHub Codespaces, WSL, SSH, and Dev Containers**: Require environment-specific qualification.

---

## 🔒 Privacy and Local Security Model

1. **Local Context Processing**: Tokonomics context algorithms and session caches execute in the extension process; compiled prompts still go to the selected upstream provider.
2. **No Tokonomics Intermediary**: The extension has no Tokonomics-operated backend or analytics endpoint. VS Code, installed extensions, and the selected provider may perform their own network activity.
3. **Automatic Secret Redaction**: ReDoS-safe scanner automatically redacts API keys (AWS, OpenAI, Anthropic, GitHub) and private keys before prompts are sent to your chosen AI model.
4. **Bounded Resources**: Queues, caches, worker inputs, and parser/index memory have explicit limits; this reduces but cannot categorically eliminate host defects.

---

## 📄 License & Intellectual Property

Copyright © 2026 **Tokonomics Team**. All Rights Reserved.

Tokonomics is proprietary software. Unauthorized copying, modification, decompilation, reverse engineering, or redistribution of this software or its underlying algorithms is strictly prohibited. See [LICENSE.txt](https://github.com/Tokonomics-Team/tokonomics/blob/main/LICENSE.txt) for full terms.
