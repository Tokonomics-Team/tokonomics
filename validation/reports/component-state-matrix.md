# Component state matrix

> Generated from `ComponentRegistry.definitions()`. Do not edit by hand.

| Component | Stage | Integration state | Feature flag | Lifecycle |
|---|---|---|---|---|
| `canonical_request_compiler` | request_boundary | production_reachable | — | active |
| `context_governor` | governance | production_reachable | — | active |
| `workspace_snapshot` | workspace_context | conditional | enableWorkspaceIndex | active |
| `evidence_aware_retrieval` | retrieval | conditional | enableWorkspaceIndex | active |
| `context_solver` | selection | production_reachable | enableContextSolver | active |
| `sdg_slicing` | representation | production_reachable | enableSdgSlicing | active |
| `sufficiency_engine` | retrieval | production_reachable | enableSufficiencyEngine | active |
| `rule_compression` | compression | production_reachable | enablePluggableCompression | active |
| `cache_planner` | cache_planning | dormant | enableCachePlanner | deprecated |
| `global_payload_budget` | budget | production_reachable | — | active |
| `protocol_guard` | preservation | production_reachable | — | active |
| `preservation_gate` | preservation | production_reachable | — | active |
| `evidence_safety_gate` | preservation | production_reachable | — | active |
| `cost_projection` | economics | production_reachable | — | active |
| `response_cache` | provider_boundary | conditional | enableResponseCache | active |
| `image_rightsizing` | request_boundary | conditional | enableImageRightsizing | active |
| `lsp_intelligence` | retrieval | conditional | enableLspIntelligence | active |
| `delta_context` | workspace_signals | conditional | enableDeltaContext | active |
| `error_intelligence` | workspace_signals | conditional | enableErrorIntelligence | active |
| `test_graph` | workspace_signals | conditional | enableTestGraph | active |
| `git_graph` | workspace_signals | conditional | enableGitGraph | active |
| `terminal_optimizer` | workspace_signals | conditional | enableTerminalOptimizer | active |
| `source_provenance` | source_policy | conditional | enableProvenance | active |
| `dense_retrieval` | retrieval | conditional | enableDenseEmbeddings | active |
| `cross_encoder` | reranking | conditional | enableCrossEncoder | active |
| `standalone_mmr` | reranking | conditional | enableMmrDiversity | active |
| `semantic_dedup` | deduplication | conditional | enableSemanticDedup | active |
| `project_memory` | memory | conditional | enableProjectMemory | active |
| `local_slm` | local_inference | shadow_only | enableLocalSlm | retired |
