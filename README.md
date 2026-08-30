# Tokonomics ⚡
### Cut Your AI Coding Token Costs by 65% – 88% (Claude, GPT-4o, Copilot, Gemini & DeepSeek)

[![Website](https://img.shields.io/badge/Website-tokonomics--team.github.io-00f0ff.svg)](https://tokonomics-team.github.io/tokonomics)
[![Version](https://img.shields.io/badge/version-4.1.0-blue.svg)](https://marketplace.visualstudio.com)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-purple.svg)](https://code.visualstudio.com)
[![Token Savings](https://img.shields.io/badge/Token%20Savings-65%25%20--%2088%25-brightgreen.svg)]()
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-success.svg)]()
[![Issues](https://img.shields.io/badge/Issues-Report%20Bug-red.svg)](https://github.com/Tokonomics-Team/tokonomics/issues)
[![Discussions](https://img.shields.io/badge/Community-Discussions-yellowgreen.svg)](https://github.com/Tokonomics-Team/tokonomics/discussions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🔒 **100% LOCAL & PRIVATE — ZERO CLOUD SERVERS**  
> Every AST parse, RAM cache lookup, image downscale, and context compression runs **100% locally on your machine** inside your VS Code extension host. **No external servers, no third-party APIs, and zero telemetry.** Your source code and prompts **never** leave your device.

---

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 💡 HOW TOKONOMICS WORKS IN REAL TIME                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ❌ WITHOUT TOKONOMICS (Unoptimized Context Dump):                                       │
│     Your entire 1,000-line file + unused imports + debug logs + full function bodies     │
│     ➡️ Transmitted to AI: 8,500 tokens ($0.0255 per prompt | 15s latency)               │
│                                                                                          │
│  ✅ WITH TOKONOMICS (Intelligent Context Optimization):                                  │
│     • Prunes private implementation bodies (keeps signatures & types)                    │
│     • Tree-shakes unreferenced imports & deduplicates multi-turn chat history            │
│     • Pulls surgical symbol signatures from local RAM in <1ms                            │
│     • Rightsizes attached screenshots from 2MB to 80KB                                   │
│     • Stabilizes 1,024-token prefix for provider prompt-cache discounts                  │
│     ➡️ Transmitted to AI: 2,100 tokens ($0.0063 per prompt | 3s latency)                │
│                                                                                          │
│  🎉 RESULT: 75.3% TOKENS SAVED | $0.0192 SAVED PER PROMPT | 5× FASTER RESPONSE           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 How Tokonomics Saves You Money (The 6 Pillars)

### 1. ✂️ AST Structural Code Pruning (Saves 65% – 88%)
When you ask an AI model a question about your code, it doesn't need hundreds of lines of private helper loops. Tokonomics parses your code using Tree-sitter and replaces bulky function bodies with clean structural skeletons:

```typescript
// ❌ BEFORE (850 tokens sent to AI):
class PaymentProcessor {
    private secretKey: string = "sk_live_9482710482910482";
    public async processRefund(userId: string, amount: number): Promise<Receipt> {
        // 50 lines of database queries, logging, retries, error handling...
    }
}

// ✅ AFTER (85 tokens sent to AI — 90% saved):
class PaymentProcessor {
    public async processRefund(userId: string, amount: number): Promise<Receipt>;
}
```

---

### 2. 🧠 In-Memory RAM Accelerator (Configurable Budget & 0ms Latency)
Tokonomics maintains an ultra-fast, local in-memory workspace cache within your configured RAM budget (`16MB – 1024MB`, default `64MB`):
- **⚡ Background Pre-Warming**: Crawls your workspace on startup in idle micro-batches so the entire codebase graph is hot in RAM before your first prompt.
- **🔍 In-Memory BM25 Symbol Search**: When you ask about any function or type, it retrieves only the relevant **50-token signature** from RAM without dumping whole files.
- **⚡ AST Skeleton Memoization**: Stores pre-pruned skeletons in RAM. Unchanged files require **0 Tree-sitter parses** (instant `0.001ms` lookup).
- **🔄 Multi-Turn Turn Deduplication**: Replaces repeated conversational code blocks with lightweight 4-token memory pointers (`[Ref: Block_1]`), saving **500–2,000 tokens on follow-up chat turns**.

---

### 3. ⚡ Instant Semantic Response Cache (Saves 100% | 0ms Latency)
Repeated questions (e.g. *"how does this function work?"* or rephrased queries) are resolved instantly from a local two-tier cache (Exact Hash + MinHash similarity $\ge 0.88$). Returns answers in **0ms with 0 tokens used**.

---

### 4. 📸 Image & Screenshot Rightsizing (Saves 96%)
Coding agents frequently attach full-resolution desktop screenshots (2–4 MB = ~1,500+ tokens). Tokonomics downscales images to 512px and compresses them to ~80KB before transmission, saving **96% of image token costs**.

---

### 5. 🗺️ PageRank Codebase Repository Mapping (Saves 99%)
Instead of dumping dozens of files into context, `@tokonomics /map` builds a structural map of your entire workspace using the PageRank algorithm, ranking key architectural symbols into an exact **1,024-token budget**.

---

### 6. 🎯 Intelligent Model Routing & Policy Governance
- **Smart Model Routing**: Analyzes task complexity and recommends the cheapest model tier (e.g., Flash/Haiku @ $0.25/M vs Reasoning/Opus @ $15.00/M), saving **60%–95% on cloud bills**.
- **Model Allow-List (`modelAllowList`)**: Enterprise admins can restrict developers to approved cost-effective models.

---

## ⚡ Real-World Benchmarks

| Feature | Baseline | With Tokonomics | Savings |
|:---|:---:|:---:|:---:|
| **Code Context Payload** | 8,500 tokens | 2,100 tokens | **75.3% saved** |
| **Repeated Questions** | 4,200 tokens | 0 tokens (0ms) | **100% saved** |
| **Screenshot Attachments** | 2.4 MB (~1.6k tok) | 80 KB (~50 tok) | **96.8% saved** |
| **Full Repo Structural Index** | 120,000 tokens | 1,024 tokens | **99.1% saved** |
| **Cross-Turn Code History** | 6,200 tokens | 1,450 tokens | **76.6% saved** |
| **MCP Tool Definitions** | 3,980 tokens | 824 tokens | **79.3% saved** |
| **AI Output Code Generation** | 3,500 tokens | 850 tokens (diff patch) | **75.7% saved** |

---

## 🚀 How to Use Tokonomics

### 1. Chat with `@tokonomics` (or `@tokenopt`)
Open your VS Code Chat panel (`Ctrl + Shift + I` or `Cmd + Shift + I`) and ask your question:
```text
@tokonomics explain how authentication works in this service
```
> ⚡ **Tokonomics:** `7,240` → `2,810` tokens (**61.2% saved** | $0.0208 USD)  
> 🧠 **Model Router Suggestion:** ⚡ *Flash/Haiku Tier* recommended for syntax analysis.

### 2. Quick Slash Commands
| Command | What It Does |
|:---|:---|
| `@tokonomics /ram` | Displays live in-memory RAM cache usage, BM25 symbol count, and budget status |
| `@tokonomics /logs` | View diagnostic health and export 100% anonymized logs for bug reporting |
| `@tokonomics /map` | Generates a 1,024-token structural PageRank map of your workspace |
| `@tokonomics /pack <path>` | Packs multiple files/folders into an AST-pruned context skeleton |
| `@tokonomics /analyze` | Analyzes the active editor file for token redundancy |
| `@tokonomics /compact <text>` | Compresses arbitrary logs, diffs, or terminal outputs |
| `@tokonomics /stats` | Shows today's, session, and all-time financial ROI metrics |

### 3. Visual Analytics Dashboard
Click the **`⚡ Tokonomics: Active`** (or **`⚡ XX% Saved`**) pill in your bottom-right status bar or run:
- `Ctrl + Shift + P` $\rightarrow$ **`Tokonomics: Show Savings Dashboard`**

*(Note: The status bar displays `⚡ Tokonomics: Active` on startup, and automatically switches to show your live savings percentage, e.g. `⚡ 64.2% Saved ($0.03)`, once prompts or code selections are processed).*

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

  // Core AST & Compression
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
- 🐛 **Report a Bug**: [GitHub Issues](https://github.com/Tokonomics-Team/tokonomics/issues/new?template=bug_report.md) *(Please run `Tokonomics: Export Anonymized Diagnostic Logs` to attach safe, PII-free diagnostics)*
- 💡 **Request a Feature**: [Feature Request Form](https://github.com/Tokonomics-Team/tokonomics/issues/new?template=feature_request.md)
- 💬 **Community Discussions**: [GitHub Discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)
- ⭐ **GitHub Repository**: [github.com/Tokonomics-Team/tokonomics](https://github.com/Tokonomics-Team/tokonomics)

---

## 🌐 Compatibility with VS Code, Cursor, VSCodium & Gitpod

Tokonomics is built on standard VS Code APIs and runs across all major environments:

- 🟢 **Microsoft VS Code**: 100% Native (Chat Participant `@tokonomics` + Language Model Proxy).
- 🟢 **Cursor**: 100% Compatible (AST Pruner, Repo Map, Diff Viewer, Dashboard, Context Packing).
- 🟢 **VSCodium / Eclipse Theia**: 100% Compatible via Open VSX Registry.
- 🟢 **Gitpod / GitHub Codespaces**: 100% Compatible in browser & desktop containers.

---

## 🔒 100% Privacy & Local Security Guarantees

1. **Local-Only Execution**: All AST parsing, token counting, image rightsizing, and memory caches execute strictly within your local machine process.
2. **Zero Network Calls to Extension Backend**: Tokonomics has **no backend servers**, collects **no analytics**, and makes **zero external HTTP requests**.
3. **Automatic Secret Redaction**: ReDoS-safe scanner automatically redacts API keys (AWS, OpenAI, Anthropic, GitHub) and private keys before prompts are sent to your chosen AI model.
4. **WASM Memory Safe**: Tree-sitter WebAssembly parser memory is deterministically freed with strict `finally` disposal blocks to prevent memory leaks.

---

## 📄 License

MIT © [Tokonomics Team](https://github.com/Tokonomics-Team/tokonomics)
