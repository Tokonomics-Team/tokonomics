# Changelog

All notable changes to the **Enterprise AI Token Optimizer** extension will be documented in this file.

## [4.0.0] - 2026-08-29
### Added (SOTA 4.0 Release)
- **Asymmetric Turn Compaction & Scratchpad Externalization**: Persists working memory and milestone progress to `.tokenopt/scratchpad.json` while retaining raw error traces and active tool syntax to prevent retry hallucination loops (+30% to 50% history savings).
- **Sliding-Window Message Budgets with Turn Anchoring**: Enforces strict Key-Value task anchors (`Task: ... | Status: ... | Code Decision: ...`) for historical turns ($t < N-2$).
- **Hybrid Semantic Approximate Response Cache**: Tier-1 Exact Hash ($O(1)$) + Tier-2 N-gram MinHash / AST Shingle Jaccard Similarity ($\ge 0.88$ threshold) for fuzzy matching rephrased questions with 0MB package bloat and <1ms latency.
- **Token Shorthand & Declarative Prompt Minifier**: Replaces verbose English system directives with dense, declarative YAML/JSON constraint tables (40%–60% system directive reduction).
- **Deferred Code-Mode Tool Discovery**: Suppresses raw tool schemas entirely, providing 3 foundational meta-tools (`list_tools`, `get_tool_schema`, `call_tool`) with on-demand parameter schema resolution (+80% to 90% schema savings).
- **Tool Call Batching & Head/Tail Regex Masking**: Batches sequential tool reads and regex-masks large test suite, compiler, and terminal outputs.
- **3-Tier Hierarchical AST Chunking**: Slices code into T0 (Global types/classes), T1 (Signatures + docstrings), and T2 (Full implementation bodies).
- **Token-Aware Line Range Slicing**: Slices exact line ranges (`file.ts:L10-L50` and `@tokenopt /pack file.ts:15-40`) avoiding whole-file dumps.
- **Hard Agentic Loop Circuit Breakers**: Token velocity governor ($>50\text{k tokens/min}$ alert) and action stagnation loop detector to prevent runaway agent costs.

## [3.0.0] - 2026-08-29
### Added (SOTA 3.0 Release)
- **Enhanced MCP Tool Schema Compressor**: 3-level schema compression (`low`/`medium`/`high`), enum truncation, nested description stripping, and `call_tool` meta-tool collapse for >15 tools.
- **Diff-Based Output Optimizer**: Detects edit/refactor intent and injects unified diff output instructions to save 40-70% on output generation tokens.
- **Intelligent Model Router**: Suggests optimal model tier (Flash vs Standard vs Reasoning) based on query complexity, multi-file scope, and reasoning keywords.
- **Semantic Response Cache**: Exact-hash O(1) in-memory cache for read-only questions with TTL, LRU eviction, and automatic file invalidation.
- **Tab/File Relevance Scorer**: Scores open editor tabs on a 0-100 scale using imports (40%), edit recency (25%), PageRank (20%), and path proximity (15%).
- **Incremental FileWatch Repo Map**: `FileWatchIndex` caches workspace symbols and recomputes PageRank lazily on file changes (<2ms per update).
- **Pre-Send Token Budget Inspector**: Real-time layer breakdown bar charts inside the Analytics Webview.

## [2.0.0] - 2026-08-29
### Added (Next-Gen SOTA Engine)
- **Workspace-Wide PageRank Repository Map (`@tokenopt /map`)**: Tree-sitter symbol tag/reference extractor + Personalized PageRank graph ranking seeded on open files.
- **Dynamic Proportional Token Budget Allocator**: Slices token budgets across System, Repo Map, Active Code, and History with multi-tier AST fallbacks.
- **Multi-File Context Pack Command (`@tokenopt /pack`)**: Bundles multiple files into AST-pruned composite payloads.
- **Progressive Recursive Multi-Turn Summarizer**: Condenses older turns into structured milestones while preserving recent code turns.

## [1.0.0] - 2026-08-29
### Initial Release
- Core AST pruning and OpenAI / Anthropic cache alignment.
