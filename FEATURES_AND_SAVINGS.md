# ⚡ Enterprise AI Token Optimizer 4.0: Intended Feature & Savings Architecture

> **Measurement notice:** This document describes intended and experimental behavior. Its
> percentages are controlled synthetic or illustrative figures, not certified production
> savings, provider billing outcomes, or model-quality improvements. Some components are not
> yet reachable from every production entry point. The authoritative status and limitations of
> material claims are recorded in
> [`validation/claims/claim-registry.json`](validation/claims/claim-registry.json).

**Enterprise AI Token Optimizer** (`context-compressor`) is an enterprise-grade Visual Studio Code & Antigravity IDE extension engineered to intercept, compress, align, route, and locally cache AI context and output payloads for coding assistants.

The intended design combines **Graph-based PageRank Repository Mapping**, **Multi-Language AST Structural Pruning**, **Asymmetric Scratchpad Compaction**, **Hybrid Semantic Response Caching**, **Diff-Based Output Optimization**, **Deferred Code-Mode MCP Tools**, **3-Tier Hierarchical AST Chunking**, and **4-Tier Provider Prompt Cache Alignment**. The previously published **65% to 88%** input and **40% to 70%** output figures are unverified outside the controlled synthetic harness.

---

## 🏛️ End-to-End Optimization Pipeline Architecture

```
+---------------------------------------------------------------------------------------------------+
|                            Enterprise AI Token Optimization Pipeline 4.0                          |
+---------------------------------------------------------------------------------------------------+
|  1. Incoming Request (VS Code Chat / @tokenopt / Inline Context / Agent Invocation)               |
|     │                                                                                             |
|     ├──► Layer 1: Hybrid Semantic Response Cache (Exact-Hash O(1) + N-Gram MinHash Approx >= 0.88)|
|     │    └── Instant 0-token, 0ms return for repeated & rephrased read-only questions             |
|     │                                                                                             |
|     ├──► Layer 2: Intelligent Task Complexity Model Router                                        |
|     │    └── Classifies complexity → recommends Flash ($0.25) vs Standard ($3) vs Reasoning ($15)  |
|     │                                                                                             |
|     ├──► Layer 3: Agentic Circuit Breaker & Velocity Governor                                     |
|     │    └── Flags runaway loops (>50k tokens/min) and action stagnation automatically            |
|     │                                                                                             |
|     ├──► Layer 4: Security Sanitizer & .tokenignore Shield                                        |
|     │    └── Masks API keys (AWS, OpenAI, GitHub) & excludes lockfiles, minified bundles, maps    |
|     │                                                                                             |
|     ├──► Layer 5: Incremental FileWatch PageRank Repo Map Engine                                  |
|     │    └── Generates 1,024-token structural codebase index (<2ms lazy update on file saves)     |
|     │                                                                                             |
|     ├──► Layer 6: Tab & File Context Relevance Scorer                                             |
|     │    └── Scores open tabs: Imports (40%) + Recency (25%) + PageRank (20%) + Proximity (15%)   |
|     │                                                                                             |
|     ├──► Layer 7: 3-Tier Hierarchical AST Chunking (T0 Types / T1 Signatures / T2 Full Bodies)    |
|     │    └── Slices code by structural depth across TS, JS, Python, Go, Rust, Java, C#            |
|     │                                                                                             |
|     ├──► Layer 8: Token-Aware Line Range Slicing (file.ts:L10-L50)                                |
|     │    └── Slices exact targeted line ranges without whole-file context dumps                   |
|     │                                                                                             |
|     ├──► Layer 9: Import-Aware Dependency Tree Shaker                                             |
|     │    └── Discards unimported exports from background reference files (30-50% saved)           |
|     │                                                                                             |
|     ├──► Layer 10: Cross-Turn Code Deduplicator (FNV-1a Hashing)                                  |
|     │    └── Replaces duplicate code blocks across multi-turn history with lightweight pointers   |
|     │                                                                                             |
|     ├──► Layer 11: Asymmetric Scratchpad Compactor & Turn Anchoring                               |
|     │    └── Offloads working memory to .tokenopt/scratchpad.json & retains raw error traces      |
|     │                                                                                             |
|     ├──► Layer 12: Agentic Tool Output Condenser & Head/Tail Regex Masking                        |
|     │    └── Batches sequential reads & masks middle of large build/test logs (80% saved)         |
|     │                                                                                             |
|     ├──► Layer 13: Deferred Code-Mode MCP Tool Discovery (list_tools, get_tool_schema, call_tool)|
|     │    └── Suppresses inactive tool schemas; loads parameters strictly on-demand (88% saved)   |
|     │                                                                                             |
|     ├──► Layer 14: Token Shorthand & Declarative Prompt Minifier                                  |
|     │    └── Converts verbose English system rules into declarative YAML constraint tables        |
|     │                                                                                             |
|     ├──► Layer 15: Dynamic Proportional Token Budget Allocator                                    |
|     │    └── Enforces strict budget slices: System (10%) | Map (15%) | Code (45%) | Hist (20%)   |
|     │                                                                                             |
|     ├──► Layer 16: 4-Tier Cloud Provider Prompt Cache Alignment                                   |
|     │    └── Enforces 1024-token prefix stabilization for 90% cloud KV-cache discounts            |
|     │                                                                                             |
|     ├──► Layer 17: Diff-Based Output Optimizer                                                    |
|     │    └── Injects unified diff instructions for code edits (40-70% output token savings)       |
|     │                                                                                             |
|     ▼                                                                                             |
|  2. Downstream Frontier LLM (Claude 3.7 Sonnet, GPT-4o, o3-mini, Gemini 2.0, DeepSeek)           |
|     │                                                                                             |
|     ▼                                                                                             |
|  3. Real-Time Telemetry & FinOps Tracking (Today vs Session vs All-Time Analytics)                |
+---------------------------------------------------------------------------------------------------+
```

---

## 🔍 In-Depth Layer-by-Layer Feature Breakdown

### 1. Hybrid Semantic Response Cache (Exact-Hash + MinHash Shingle Matching)
- **Source File**: `src/cache/responseCache.ts`
- **How It Saves Tokens**:
  - Employs a 2-tier resolution architecture:
    - **Tier 1 (Exact Match)**: 32-bit FNV-1a hash of $(\text{Normalized Query} + \text{Active File Path})$ with $O(1)$ instant retrieval.
    - **Tier 2 (Semantic Approximate Match)**: Computes word 2-gram and 3-gram token shingles and evaluates Jaccard/Dice set similarity ($\ge 0.88$ threshold). Matches rephrased queries (e.g., *"How do I configure auth?"* vs *"How do I configure auth please?"*) with **0MB external binary bloat and <1ms latency**.
  - **Safety**: Strictly restricts caching to read-only queries (`question`, `explain`), rejecting mutations (`edit`, `generate`).
  - **Automatic Invalidation**: Clears cache entries when associated files are modified.
- **Token Impact**: **100% token elimination (0 tokens consumed, 0ms return)** on exact and rephrased repeat queries (**20% to 35% of daily developer prompts**).

---

### 2. Asymmetric Turn Compaction & Scratchpad Externalization
- **Source File**: `src/engine/scratchpadManager.ts`
- **How It Saves Tokens**:
  - Prevents runaway history growth by persisting working memory and milestone progress to `.tokenopt/scratchpad.json`.
  - Injects a dense executive state digest (`[SCRATCHPAD STATE] Goal: ... | Done: ... | Pending: ... | Blockers: ...`) into prompt context.
  - **Asymmetric Precision**: Keeps raw error stack traces and active tool syntax uncompressed in recent turns to prevent retry hallucination loops.
- **Token Impact**: **30% to 50% history savings** on long multi-turn agentic workflows.

---

### 3. Sliding-Window Message Budgets with Turn Anchoring
- **Source File**: `src/engine/progressiveSummarizer.ts`
- **How It Saves Tokens**:
  - Retains the most recent active turns ($t \ge N-2$) in full fidelity.
  - For historical turns ($t < N-2$), replaces narrative conversational fluff with structured key-value anchors:
    `• Task: "Refactor auth layer" | Status: Completed | Code Decision: Implemented JWT token validation.`
- **Token Impact**: **50% to 75% reduction** in historical conversation tokens.

---

### 4. Token Shorthand & Declarative Prompt Minification
- **Source File**: `src/engine/promptMinifier.ts`
- **How It Saves Tokens**:
  - Transforms verbose English system prompt rules into declarative YAML/JSON constraint tables.
  - Replaces verbose boilerplate ("You must always ensure that you do not use console.log") with dense declarative directives (`NO: console.log`, `FORMAT: diff`).
- **Token Impact**: **40% to 60% reduction** in system directive token overhead.

---

### 5. Deferred Code-Mode MCP Tool Discovery ("Code Mode")
- **Source File**: `src/cache/schemaMinifier.ts`
- **How It Saves Tokens**:
  - Suppresses massive raw tool parameter JSON schemas entirely by default.
  - Provides the model with 3 foundational meta-tools (`list_tools`, `get_tool_schema`, `call_tool`).
  - Detailed parameter schemas are loaded on-demand only when the agent decides to invoke that specific tool.
- **Token Impact**: Reduces 20+ tool schemas from **4,000+ tokens to <400 tokens** (**80% to 90% schema reduction**).

---

### 6. Tool Call Batching & Head/Tail Regex Masking
- **Source File**: `src/engine/agenticCompactor.ts`
- **How It Saves Tokens**:
  - Combines sequential read operations into a single batch query.
  - Preserves the first 4–6 lines and last 4–6 lines of large test suite results, build logs, and compiler errors, while masking intermediate lines with `[... N lines of intermediate execution output masked ...]`.
- **Token Impact**: **70% to 85% reduction** in historical tool/terminal output tokens.

---

### 7. 3-Tier Hierarchical AST Chunking
- **Source File**: `src/ast/pruner.ts`
- **Supported Languages**: TypeScript, JavaScript, Python, Go, Rust, Java, C#.
- **How It Saves Tokens**:
  - Slices code into 3 discrete structural tiers:
    - **Tier 0**: Global symbol hierarchy and type contracts only (classes, interfaces, type aliases, exports).
    - **Tier 1**: Function signatures, method declarations, and docstrings (implementation bodies omitted).
    - **Tier 2**: Full raw implementation bodies (loaded on-demand only when targeted for editing).
- **Token Impact**: **50% to 75% reduction** depending on the active budget tier.

---

### 8. Token-Aware Line Range Slicing
- **Source File**: `src/proxy/chatParticipant.ts`
- **How It Saves Tokens**:
  - Parses explicit line range targets in `@tokenopt /pack file.ts:10-50` or active editor selections (`file.ts:L20-L80`).
  - Prunes and packages strictly the requested line interval rather than dumping entire files.
- **Token Impact**: **60% to 90% savings** on snippet-targeted queries.

---

### 9. Hard Agentic Loop Circuit Breakers & Token Velocity Governance
- **Source File**: `src/metrics/circuitBreaker.ts`
- **How It Protects Budgets**:
  - Tracks token consumption in a 1-minute sliding window.
  - Triggers a **Velocity Alert** if consumption exceeds $50\text{k tokens/min}$.
  - Triggers a **Stagnation Loop Breaker** if the agent executes 3 identical actions consecutively without forward progress.
  - Recommends context resets when stuck in 4+ consecutive error iterations.
- **Financial Impact**: Eliminates runaway cloud bills and infinite agentic loops.

---

### 10. Workspace-Wide PageRank Repository Map (Incremental)
- **Source File**: `src/repo/repoMap.ts`
- **How It Saves Tokens**:
  - Builds a directed dependency graph of all workspace symbols and computes Personalized PageRank seeded on open files.
  - Formats top symbols into an indentation-aware structural map fitting strictly within a **1,024-token budget**.
  - `FileWatchIndex` caches symbol graphs in-memory for **<2ms incremental updates** on file saves.
- **Token Impact**: **95%+ token reduction** vs whole-codebase dumps.

---

### 11. Diff-Based Output Optimization (GNU Unified Diff Patching)
- **Source File**: `src/engine/diffOutputOptimizer.ts`
- **How It Saves Tokens**:
  - Detects edit/refactor intent and requires the LLM to emit unified diff patches (`--- a/` and `+++ b/`) with 2–3 context lines rather than full files.
- **Token Impact**: **40% to 70% reduction in output generation tokens**.

---

### 12. 4-Tier Cloud Provider Prompt Cache Alignment
- **Source File**: `src/cache/aligner.ts`
- **Supported Providers**: Anthropic Claude, OpenAI, Google Gemini, DeepSeek.
- **How It Saves Dollars**:
  - Enforces deterministic 1,024-token prefix stabilization across System, Tools, and Repo Map layers.
  - Inserts Anthropic ephemeral cache breakpoints (`cache_control: { type: "ephemeral" }`) at 4 key boundaries.
- **Financial Impact**: **90% discount on cached input tokens** ($3.00/MTok $\rightarrow$ $0.30/MTok for Claude 3.7 Sonnet).

---

## 📊 Quantitative Token Savings Matrix

| Optimization Layer | Before Optimization | After Optimization | Net Token Savings | Mechanism |
|:---|:---:|:---:|:---:|:---|
| **3-Tier Hierarchical AST Chunking (T0/T1)** | 1,200 tokens | 380 tokens | **68.3%** | Structural skeletonization |
| **Workspace PageRank Repo Map** | 35,000 tokens | 1,024 tokens | **97.1%** | Graph ranking of key declarations |
| **Deferred Code-Mode MCP Tools** | 4,200 tokens | 380 tokens | **91.0%** | 3 meta-tools & on-demand resolution |
| **Token Shorthand Declarative Rules** | 450 tokens | 180 tokens | **60.0%** | Declarative YAML rule tables |
| **Cross-Turn Code Deduplication** | 1,800 tokens | 600 tokens | **66.7%** | FNV-1a hash pointer replacement |
| **Asymmetric Scratchpad Compaction** | 4,500 tokens | 950 tokens | **78.9%** | Milestone digest & error retention |
| **Tool Output Head/Tail Masking** | 2,500 tokens | 350 tokens | **86.0%** | Regex head/tail log masking |
| **Token-Aware Line Range Slicing** | 1,500 tokens | 220 tokens | **85.3%** | Line range interval extraction |
| **Diff-Based Output Optimization** | 800 tokens (out) | 220 tokens (out) | **72.5%** | GNU unified diff patches |
| **Hybrid Semantic Response Cache** | 1,500 tokens | 0 tokens | **100.0%** | Exact-hash & MinHash shingle match |
| **4-Tier Cloud Cache Alignment** | $3.00 / MTok | $0.30 / MTok | **90.0% ($)** | 1,024-token prefix stabilization |

---

## 💼 Enterprise Team Economics (50 Developers)

For an engineering team of **50 developers** averaging **40 prompts per day**:

$$\text{Daily Tokens Saved} = 50 \times 40 \times 16,500 \text{ tokens} = \mathbf{33,000,000 \text{ tokens/day}}$$

$$\text{Monthly Financial Savings} = \frac{33\text{M}}{1\text{M}} \times \$2.50 \times 22 \text{ days} \times 1.45 (\text{cache multiplier}) = \mathbf{\$26,317 \text{ USD / month}}$$

$$\text{Annual Engineering ROI} = \$26,317 \times 12 = \mathbf{\$315,800 \text{ USD / year}}$$

---

## 📜 License
MIT License. Created for Enterprise AI Token Optimization.
