// ===================================================================
// Tokonomics Documentation & Interactive Walkthrough Logic
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCopyButtons();
  initStudio();
  initMcpSimulator();
  initAgentLayerSimulator();
  initCommandPalette();
  initCockpitSimulator();
  initBenchmarkTabs();
  initSlicingSimulator();
});

// -------------------------------------------------------------------
// 1. Tab Switching Logic for Step-by-Step Guide
// -------------------------------------------------------------------


// -------------------------------------------------------------------
// 0. Tab Switching for Empirical Benchmark Showcase
// -------------------------------------------------------------------
function initBenchmarkTabs() {
  const tabButtons = document.querySelectorAll('.benchmark-tab-btn');
  const panels = document.querySelectorAll('.benchmark-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = 'bench-panel-' + btn.getAttribute('data-bench-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      panels.forEach(p => {
        if (p.id === targetId) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    });
  });
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.guide-tab-btn');
  const panels = document.querySelectorAll('.guide-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = 'panel-' + btn.getAttribute('data-tab');

      // Update button active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel visibility
      panels.forEach(p => {
        if (p.id === targetId) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    });
  });
}

// -------------------------------------------------------------------
// 2. Clipboard Copy with Toast Feedback
// -------------------------------------------------------------------
function initCopyButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    const textToCopy = btn.getAttribute('data-copy');
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.backgroundColor = '#10b981';
      btn.style.color = '#000';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  });
}

// -------------------------------------------------------------------
// 3. Interactive Feature Studio: Diff, X-Ray, Chat & Handoff
// -------------------------------------------------------------------
const CODE_SAMPLES = {
  ts: {
    rawLines: [
      { t: "import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';", type: "neutral" },
      { t: "import { TokenOptimizerLedger, AccountingTruth } from '../finops/ledger';", type: "neutral" },
      { t: "import { SecuritySanitizer } from '../security/sanitizer';", type: "del" },
      { t: "", type: "neutral" },
      { t: "export interface RouteConfig {", type: "add" },
      { t: "  prefix: string;", type: "add" },
      { t: "  enableTelemetry: boolean;", type: "add" },
      { t: "  maxTurnLimit?: number;", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "export class AuthenticationGatewayController {", type: "neutral" },
      { t: "  private ledger: TokenOptimizerLedger;", type: "neutral" },
      { t: "  private config: RouteConfig;", type: "neutral" },
      { t: "  constructor(ledger: TokenOptimizerLedger, config: RouteConfig) {", type: "del" },
      { t: "    this.ledger = ledger; this.config = config;", type: "del" },
      { t: "  }", type: "del" },
      { t: "", type: "neutral" },
      { t: "  public async handleInboundTokenRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {", type: "add" },
      { t: "    const authHeader = req.headers['authorization'];", type: "add" },
      { t: "    if (!authHeader || !authHeader.startsWith('Bearer ')) {", type: "add" },
      { t: "      reply.status(401).send({ error: 'Unauthorized: Missing token' });", type: "add" },
      { t: "      return;", type: "add" },
      { t: "    }", type: "add" },
      { t: "    // Heavy cryptographic token verification & session accounting logic", type: "del" },
      { t: "    const rawToken = authHeader.split(' ')[1];", type: "del" },
      { t: "    const sanitized = SecuritySanitizer.sanitizeSecrets(rawToken);", type: "del" },
      { t: "    const claims = await this.verifyJwtWithIssuer(sanitized.sanitized);", type: "del" },
      { t: "    const turnCost = AccountingTruth.computeTurnEconomics(claims.tier, claims.quota);", type: "del" },
      { t: "    await this.ledger.commitSpend(claims.tenantId, turnCost);", type: "del" },
      { t: "    reply.status(200).send({ status: 'authenticated', tenant: claims.tenantId });", type: "del" },
      { t: "  }", type: "neutral" },
      { t: "  private async verifyJwtWithIssuer(token: string): Promise<any> { /* 50 lines omitted */ }", type: "del" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';", type: "neutral" },
      { t: "import { TokenOptimizerLedger, AccountingTruth } from '../finops/ledger';", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "export interface RouteConfig {", type: "add" },
      { t: "  prefix: string;", type: "add" },
      { t: "  enableTelemetry: boolean;", type: "add" },
      { t: "  maxTurnLimit?: number;", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "export class AuthenticationGatewayController {", type: "neutral" },
      { t: "  private ledger: TokenOptimizerLedger;", type: "neutral" },
      { t: "  private config: RouteConfig;", type: "neutral" },
      { t: "  constructor(ledger: TokenOptimizerLedger, config: RouteConfig);", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "  public async handleInboundTokenRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {", type: "add" },
      { t: "    if (!authHeader || !authHeader.startsWith('Bearer ')) { /* guard preserved */ }", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 28 lines of inner auth verification & reply omitted]", type: "omitted" },
      { t: "  }", type: "neutral" },
      { t: "  private async verifyJwtWithIssuer(token: string): Promise<any>;", type: "neutral" },
      { t: "}", type: "neutral" }
    ],
    rawTokens: 842,
    prunedTokens: 215
  },
  py: {
    rawLines: [
      { t: "from typing import Dict, Any, Optional, List", type: "neutral" },
      { t: "from pydantic import BaseModel, Field", type: "neutral" },
      { t: "import hashlib, time", type: "del" },
      { t: "", type: "neutral" },
      { t: "class ModelGenerationPayload(BaseModel):", type: "add" },
      { t: "    model_name: str", type: "add" },
      { t: "    messages: List[Dict[str, str]]", type: "add" },
      { t: "    temperature: float = Field(default=0.2, ge=0.0, le=2.0)", type: "add" },
      { t: "    max_tokens: Optional[int] = None", type: "add" },
      { t: "", type: "neutral" },
      { t: "class ContextCompilationEngine:", type: "neutral" },
      { t: "    def __init__(self, workspace_path: str, max_cache_mb: int = 512):", type: "neutral" },
      { t: "        self.workspace_path = workspace_path", type: "del" },
      { t: "        self.max_cache_mb = max_cache_mb", type: "del" },
      { t: "        self.cache = {}", type: "del" },
      { t: "", type: "neutral" },
      { t: "    def compile_workspace_context(self, files: List[str], target_budget: int) -> Dict[str, Any]:", type: "add" },
      { t: "        # 45 lines of parser grammar traversal and knapsack DP allocation", type: "del" },
      { t: "        start_time = time.perf_counter()", type: "del" },
      { t: "        selected = []", type: "del" },
      { t: "        for f in files:", type: "del" },
      { t: "            selected.append(self._scan_file_ast(f))", type: "del" },
      { t: "        return {'status': 'success', 'selected': selected}", type: "del" }
    ],
    prunedLines: [
      { t: "from typing import Dict, Any, Optional, List", type: "neutral" },
      { t: "from pydantic import BaseModel, Field", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "class ModelGenerationPayload(BaseModel):", type: "add" },
      { t: "    model_name: str", type: "add" },
      { t: "    messages: List[Dict[str, str]]", type: "add" },
      { t: "    temperature: float = Field(default=0.2, ge=0.0, le=2.0)", type: "add" },
      { t: "    max_tokens: Optional[int] = None", type: "add" },
      { t: "", type: "neutral" },
      { t: "class ContextCompilationEngine:", type: "neutral" },
      { t: "    def __init__(self, workspace_path: str, max_cache_mb: int = 512): ...", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "    def compile_workspace_context(self, files: List[str], target_budget: int) -> Dict[str, Any]:", type: "add" },
      { t: "        # [Tokonomics AST Sliced: 24 lines of inner compilation omitted]", type: "omitted" },
      { t: "        ...", type: "neutral" }
    ],
    rawTokens: 690,
    prunedTokens: 185
  },
  go: {
    rawLines: [
      { t: "package compiler", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "import (", type: "neutral" },
      { t: "    \"context\"", type: "neutral" },
      { t: "    \"crypto/sha256\"", type: "del" },
      { t: "    \"sync\"", type: "neutral" },
      { t: ")", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "type WorkspaceIndex struct {", type: "add" },
      { t: "    mu        sync.RWMutex", type: "add" },
      { t: "    roots     []string", type: "add" },
      { t: "    isTrusted bool", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "func (w *WorkspaceIndex) ExtractExactSymbols(ctx context.Context, path string) ([]string, error) {", type: "add" },
      { t: "    if !w.isTrusted { return nil, errors.New(\"restricted\") }", type: "add" },
      { t: "    // 35 lines of AST parsing and symbol hashing omitted", type: "del" },
      { t: "    hasher := sha256.New()", type: "del" },
      { t: "    return []string{\"sha256:4a8b9f\"}, nil", type: "del" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "package compiler", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "import (", type: "neutral" },
      { t: "    \"context\"", type: "neutral" },
      { t: "    \"sync\"", type: "neutral" },
      { t: ")", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "type WorkspaceIndex struct {", type: "add" },
      { t: "    mu        sync.RWMutex", type: "add" },
      { t: "    roots     []string", type: "add" },
      { t: "    isTrusted bool", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "func (w *WorkspaceIndex) ExtractExactSymbols(ctx context.Context, path string) ([]string, error) {", type: "add" },
      { t: "    if !w.isTrusted { return nil, errors.New(\"restricted\") }", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 22 lines of inner symbol extraction omitted]", type: "omitted" },
      { t: "}", type: "neutral" }
    ],
    rawTokens: 620,
    prunedTokens: 170
  },
  rust: {
    rawLines: [
      { t: "use std::collections::HashMap;", type: "neutral" },
      { t: "use std::sync::RwLock;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "pub struct WorkspaceIndex {", type: "add" },
      { t: "    file_map: RwLock<HashMap<String, Vec<u8>>>,", type: "add" },
      { t: "    is_trusted: bool,", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "impl WorkspaceIndex {", type: "neutral" },
      { t: "    pub fn extract_exact_symbols(&self, path: &str) -> Result<Vec<String>, &'static str> {", type: "add" },
      { t: "        if !self.is_trusted { return Err(\"restricted\"); }", type: "add" },
      { t: "        // 40 lines of tree-sitter AST traversal and hash computation", type: "del" },
      { t: "        Ok(vec![\"sha256:7f83b165\".to_string()])", type: "del" },
      { t: "    }", type: "neutral" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "use std::collections::HashMap;", type: "neutral" },
      { t: "use std::sync::RwLock;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "pub struct WorkspaceIndex {", type: "add" },
      { t: "    file_map: RwLock<HashMap<String, Vec<u8>>>,", type: "add" },
      { t: "    is_trusted: bool,", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "impl WorkspaceIndex {", type: "neutral" },
      { t: "    pub fn extract_exact_symbols(&self, path: &str) -> Result<Vec<String>, &'static str> {", type: "add" },
      { t: "        if !self.is_trusted { return Err(\"restricted\"); }", type: "add" },
      { t: "        // [Tokonomics AST Sliced: 26 lines omitted]", type: "omitted" },
      { t: "    }", type: "neutral" },
      { t: "}", type: "neutral" }
    ],
    rawTokens: 580,
    prunedTokens: 160
  },
  cpp: {
    rawLines: [
      { t: "#include <iostream>", type: "neutral" },
      { t: "#include <vector>", type: "neutral" },
      { t: "#include <memory>", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "namespace Tokonomics::Core {", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "struct PacketHeader {", type: "add" },
      { t: "    uint32_t magic;", type: "add" },
      { t: "    uint16_t length;", type: "add" },
      { t: "    uint8_t flags;", type: "add" },
      { t: "};", type: "add" },
      { t: "", type: "neutral" },
      { t: "class NetworkEngine {", type: "neutral" },
      { t: "private:", type: "neutral" },
      { t: "    std::string endpoint;", type: "add" },
      { t: "    int port;", type: "add" },
      { t: "public:", type: "neutral" },
      { t: "    NetworkEngine(const std::string& ep, int p) : endpoint(ep), port(p)", type: "add" },
      { t: "    {", type: "neutral" },
      { t: "        // 45 lines of socket pool pre-allocation and SSL handshake logic", type: "del" },
      { t: "        std::cout << \"Bootstrapping network engine: \" << ep << std::endl;", type: "del" },
      { t: "    }", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "    virtual bool sendPacket(const PacketHeader& header, const std::vector<uint8_t>& payload)", type: "add" },
      { t: "    {", type: "neutral" },
      { t: "        // 55 lines of serialization, deep CRC loop, and buffer flushing", type: "del" },
      { t: "        return true;", type: "del" },
      { t: "    }", type: "neutral" },
      { t: "};", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "} // namespace Tokonomics::Core", type: "neutral" }
    ],
    prunedLines: [
      { t: "#include <iostream>", type: "neutral" },
      { t: "#include <vector>", type: "neutral" },
      { t: "#include <memory>", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "namespace Tokonomics::Core {", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "struct PacketHeader {", type: "add" },
      { t: "    uint32_t magic;", type: "add" },
      { t: "    uint16_t length;", type: "add" },
      { t: "    uint8_t flags;", type: "add" },
      { t: "};", type: "add" },
      { t: "", type: "neutral" },
      { t: "class NetworkEngine {", type: "neutral" },
      { t: "private:", type: "neutral" },
      { t: "    std::string endpoint;", type: "add" },
      { t: "    int port;", type: "add" },
      { t: "public:", type: "neutral" },
      { t: "    NetworkEngine(const std::string& ep, int p);", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 45 lines of constructor body omitted]", type: "omitted" },
      { t: "", type: "neutral" },
      { t: "    virtual bool sendPacket(const PacketHeader& header, const std::vector<uint8_t>& payload);", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 55 lines of method serialization omitted]", type: "omitted" },
      { t: "};", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "} // namespace Tokonomics::Core", type: "neutral" }
    ],
    rawTokens: 780,
    prunedTokens: 180
  },
  c: {
    rawLines: [
      { t: "#include <stdio.h>", type: "neutral" },
      { t: "#include <stdlib.h>", type: "neutral" },
      { t: "#include <string.h>", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "#define MAX_PAYLOAD_SIZE 65536", type: "add" },
      { t: "#define PROTOCOL_VERSION 0x0860", type: "add" },
      { t: "", type: "neutral" },
      { t: "typedef struct {", type: "add" },
      { t: "    uint32_t session_id;", type: "add" },
      { t: "    char auth_digest[64];", type: "add" },
      { t: "    size_t payload_len;", type: "add" },
      { t: "} ClientSession;", type: "add" },
      { t: "", type: "neutral" },
      { t: "int verify_session_credentials(const ClientSession* session, const char* secret)", type: "add" },
      { t: "{", type: "neutral" },
      { t: "    // 38 lines of HMAC SHA-256 rounds, salt verification, and memory safety guards", type: "del" },
      { t: "    if (!session || !secret) return -1;", type: "del" },
      { t: "    return 0;", type: "del" },
      { t: "}", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "int dispatch_client_packet(const ClientSession* session, const uint8_t* data, size_t len)", type: "add" },
      { t: "{", type: "neutral" },
      { t: "    // 42 lines of socket writing, timeout polling, and retry loops", type: "del" },
      { t: "    return (int)len;", type: "del" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "#include <stdio.h>", type: "neutral" },
      { t: "#include <stdlib.h>", type: "neutral" },
      { t: "#include <string.h>", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "#define MAX_PAYLOAD_SIZE 65536", type: "add" },
      { t: "#define PROTOCOL_VERSION 0x0860", type: "add" },
      { t: "", type: "neutral" },
      { t: "typedef struct {", type: "add" },
      { t: "    uint32_t session_id;", type: "add" },
      { t: "    char auth_digest[64];", type: "add" },
      { t: "    size_t payload_len;", type: "add" },
      { t: "} ClientSession;", type: "add" },
      { t: "", type: "neutral" },
      { t: "int verify_session_credentials(const ClientSession* session, const char* secret);", type: "add" },
      { t: "// [Tokonomics AST Sliced: 38 lines of crypto verification omitted]", type: "omitted" },
      { t: "", type: "neutral" },
      { t: "int dispatch_client_packet(const ClientSession* session, const uint8_t* data, size_t len);", type: "add" },
      { t: "// [Tokonomics AST Sliced: 42 lines of socket dispatch omitted]", type: "omitted" }
    ],
    rawTokens: 690,
    prunedTokens: 165
  },
  java: {
    rawLines: [
      { t: "package com.tokonomics.core.service;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "import java.util.concurrent.ConcurrentHashMap;", type: "neutral" },
      { t: "import java.util.Optional;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public interface ContextCompilerService {", type: "add" },
      { t: "    CompilerResult compileWorkspaceContext(String workspaceUri, int targetBudget);", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "public class EnterpriseContextManager implements ContextCompilerService {", type: "neutral" },
      { t: "    private final ConcurrentHashMap<String, TokenLedger> ledgerMap = new ConcurrentHashMap<>();", type: "add" },
      { t: "", type: "neutral" },
      { t: "    @Override", type: "neutral" },
      { t: "    public CompilerResult compileWorkspaceContext(String workspaceUri, int targetBudget) {", type: "add" },
      { t: "        // 50 lines of dependency resolution, PageRank indexing, and token budget fitting", type: "del" },
      { t: "        return new CompilerResult(workspaceUri, targetBudget, true);", type: "del" },
      { t: "    }", type: "neutral" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "package com.tokonomics.core.service;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "import java.util.concurrent.ConcurrentHashMap;", type: "neutral" },
      { t: "import java.util.Optional;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public interface ContextCompilerService {", type: "add" },
      { t: "    CompilerResult compileWorkspaceContext(String workspaceUri, int targetBudget);", type: "add" },
      { t: "}", type: "add" },
      { t: "", type: "neutral" },
      { t: "public class EnterpriseContextManager implements ContextCompilerService {", type: "neutral" },
      { t: "    private final ConcurrentHashMap<String, TokenLedger> ledgerMap = new ConcurrentHashMap<>();", type: "add" },
      { t: "", type: "neutral" },
      { t: "    @Override", type: "neutral" },
      { t: "    public CompilerResult compileWorkspaceContext(String workspaceUri, int targetBudget);", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 50 lines of implementation omitted]", type: "omitted" },
      { t: "}", type: "neutral" }
    ],
    rawTokens: 640,
    prunedTokens: 160
  },
  cs: {
    rawLines: [
      { t: "namespace Tokonomics.Engine.FinOps;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "using System;", type: "neutral" },
      { t: "using System.Threading.Tasks;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public interface ITokenLedgerManager", type: "add" },
      { t: "{", type: "neutral" },
      { t: "    Task<SpendRecord> CommitSpendAsync(Guid sessionId, int inputTokens, int outputTokens);", type: "add" },
      { t: "}", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public class TokenLedgerManager : ITokenLedgerManager", type: "neutral" },
      { t: "{", type: "neutral" },
      { t: "    public async Task<SpendRecord> CommitSpendAsync(Guid sessionId, int inputTokens, int outputTokens)", type: "add" },
      { t: "    {", type: "neutral" },
      { t: "        // 40 lines of local SQLite transactional writes, cost recalculation, and advisory alerts", type: "del" },
      { t: "        return new SpendRecord(sessionId, inputTokens + outputTokens, DateTime.UtcNow);", type: "del" },
      { t: "    }", type: "neutral" },
      { t: "}", type: "neutral" }
    ],
    prunedLines: [
      { t: "namespace Tokonomics.Engine.FinOps;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "using System;", type: "neutral" },
      { t: "using System.Threading.Tasks;", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public interface ITokenLedgerManager", type: "add" },
      { t: "{", type: "neutral" },
      { t: "    Task<SpendRecord> CommitSpendAsync(Guid sessionId, int inputTokens, int outputTokens);", type: "add" },
      { t: "}", type: "neutral" },
      { t: "", type: "neutral" },
      { t: "public class TokenLedgerManager : ITokenLedgerManager", type: "neutral" },
      { t: "{", type: "neutral" },
      { t: "    public async Task<SpendRecord> CommitSpendAsync(Guid sessionId, int inputTokens, int outputTokens);", type: "add" },
      { t: "    // [Tokonomics AST Sliced: 40 lines of transactional commit omitted]", type: "omitted" },
      { t: "}", type: "neutral" }
    ],
    rawTokens: 610,
    prunedTokens: 155
  }
};

const XRAY_DATA = [
  { path: 'src/compiler/orchestrator.ts', raw: 4850, skeleton: 1240, savings: 3610, pct: 74.4 },
  { path: 'src/protocol/gateway.ts', raw: 3120, skeleton: 890, savings: 2230, pct: 71.5 },
  { path: 'src/finops/ledger.ts', raw: 2940, skeleton: 720, savings: 2220, pct: 75.5 },
  { path: 'src/types/schemas.ts', raw: 2600, skeleton: 1950, savings: 650, pct: 25.0 },
  { path: 'src/security/sanitizer.ts', raw: 1850, skeleton: 480, savings: 1370, pct: 74.1 },
  { path: 'src/cache/aligner.ts', raw: 1420, skeleton: 310, savings: 1110, pct: 78.2 },
  { path: 'src/ui/chatProtocol.ts', raw: 1150, skeleton: 410, savings: 740, pct: 64.3 }
];

const CHAT_SCENARIOS = {
  test: {
    user: "@tokonomics write unit tests for AuthenticationGatewayController",
    advice: "💡 Tip: This unit test task can run on Claude 3.5 Haiku at ~90% lower cost.",
    code: `describe('AuthenticationGatewayController', () => {
  it('rejects missing or malformed bearer token with 401', async () => {
    const res = await gateway.handleInboundTokenRequest({ headers: {} });
    expect(res.status).toBe(401);
  });

  it('records spend in ledger on successful authentication', async () => {
    const res = await gateway.handleInboundTokenRequest({ headers: { authorization: 'Bearer test' } });
    expect(res.status).toBe(200);
    expect(mockLedger.commitSpend).toHaveBeenCalled();
  });
});`,
    telemetry: "Context: 1,240 tokens (Saved 3,610 tokens, -74.4%) | Latency: 420ms | Response: 280 tokens"
  },
  auth: {
    user: "@tokonomics explain the inbound token verification flow",
    advice: null,
    code: `The AuthenticationGatewayController processes inbound tokens in 3 steps:
1. Guard Contract: Validates 'Bearer ' header format; immediately returns 401 if missing.
2. Sanitization: Scans token entropy and redacts sensitive credentials prior to verification.
3. Accounting: Verifies issuer claims and records token turn spend via TokenOptimizerLedger.`,
    telemetry: "Context: 890 tokens (Saved 2,230 tokens, -71.5%) | Latency: 310ms | Response: 190 tokens"
  },
  refactor: {
    user: "@tokonomics /claude refactor error handling across gateway controllers",
    advice: null,
    code: `[Tokonomics Subprocess Router: Dispatched to official Claude Code CLI]
Context Skeleton: 1,950 tokens prepared.
Streaming response from official CLI session...
Refactored error handling: Consolidated duplicate 401/403 responses into a centralized errorHandler middleware.`,
    telemetry: "CLI Route: claude (Subscription Active) | Zero Metered API Cost | Context: 1,950 tokens"
  }
};

function initStudio() {
  // 1. Studio tab switching
  const studioTabBtns = document.querySelectorAll('.studio-tab-btn');
  const studioPanels = document.querySelectorAll('.studio-panel');

  studioTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-studio');
      studioTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      studioPanels.forEach(p => {
        p.classList.toggle('active', p.id === 'studio-panel-' + target);
      });
    });
  });

  // 2. Diff Inspector setup
  const langSelect = document.getElementById('lang-select');
  const btnSplit = document.getElementById('btn-split-diff');
  const btnUnified = document.getElementById('btn-unified-diff');
  const diffContainer = document.getElementById('diff-container');
  const rawDiffContent = document.getElementById('raw-diff-content');
  const prunedDiffContent = document.getElementById('pruned-diff-content');
  const origTokensBadge = document.getElementById('original-tokens');
  const prunedTokensBadge = document.getElementById('pruned-tokens');
  const statSaved = document.getElementById('stat-saved');
  const statPct = document.getElementById('stat-pct');
  const statCost = document.getElementById('stat-cost');
  const btnCompile = document.getElementById('btn-run-simulation');

  let isUnified = false;

  function renderDiff() {
    const lang = langSelect ? langSelect.value : 'ts';
    const sample = CODE_SAMPLES[lang] || CODE_SAMPLES.ts;

    // Render Raw Lines
    if (rawDiffContent) {
      rawDiffContent.innerHTML = sample.rawLines.map((line, idx) => {
        const cls = line.type === 'del' ? 'del' : (line.type === 'add' ? 'add' : '');
        return `<div class="diff-row ${cls}"><span class="diff-ln">${idx + 1}</span><span class="diff-txt">${escapeHtml(line.t)}</span></div>`;
      }).join('');
    }

    // Render Pruned Lines
    if (prunedDiffContent) {
      if (isUnified) {
        // Unified Diff View
        prunedDiffContent.innerHTML = sample.rawLines.map((line, idx) => {
          if (line.type === 'del') {
            return `<div class="diff-row del"><span class="diff-ln">-</span><span class="diff-txt">${escapeHtml(line.t)}</span></div>`;
          } else if (line.type === 'add') {
            return `<div class="diff-row add"><span class="diff-ln">+</span><span class="diff-txt">${escapeHtml(line.t)}</span></div>`;
          } else {
            return `<div class="diff-row"><span class="diff-ln">${idx + 1}</span><span class="diff-txt">${escapeHtml(line.t)}</span></div>`;
          }
        }).join('');
      } else {
        // Split Diff View
        prunedDiffContent.innerHTML = sample.prunedLines.map((line, idx) => {
          const cls = line.type === 'omitted' ? 'omitted' : (line.type === 'add' ? 'add' : '');
          return `<div class="diff-row ${cls}"><span class="diff-ln">${idx + 1}</span><span class="diff-txt">${escapeHtml(line.t)}</span></div>`;
        }).join('');
      }
    }

    const saved = sample.rawTokens - sample.prunedTokens;
    const pct = ((saved / sample.rawTokens) * 100).toFixed(1);
    const avoidedCost = ((saved / 1000) * 0.003).toFixed(3); // ~$3 / 1M prompt tokens

    if (origTokensBadge) origTokensBadge.textContent = `${sample.rawTokens} tokens`;
    if (prunedTokensBadge) prunedTokensBadge.textContent = `${sample.prunedTokens} tokens (-${pct}%)`;
    if (statSaved) statSaved.textContent = saved;
    if (statPct) statPct.textContent = `${pct}%`;
    if (statCost) statCost.textContent = `~$${avoidedCost}`;
  }

  if (btnSplit && btnUnified && diffContainer) {
    btnSplit.addEventListener('click', () => {
      isUnified = false;
      btnSplit.classList.add('active');
      btnUnified.classList.remove('active');
      diffContainer.classList.remove('unified-mode');
      const winRaw = document.getElementById('window-raw');
      if (winRaw) winRaw.style.display = 'block';
      renderDiff();
    });

    btnUnified.addEventListener('click', () => {
      isUnified = true;
      btnUnified.classList.add('active');
      btnSplit.classList.remove('active');
      diffContainer.classList.add('unified-mode');
      const winRaw = document.getElementById('window-raw');
      if (winRaw) winRaw.style.display = 'none';
      renderDiff();
    });
  }

  if (langSelect) langSelect.addEventListener('change', renderDiff);
  if (btnCompile) {
    btnCompile.addEventListener('click', () => {
      btnCompile.textContent = 'Compiling AST...';
      btnCompile.style.opacity = '0.7';
      setTimeout(() => {
        btnCompile.textContent = 'AST Context Compiled!';
        btnCompile.style.opacity = '1';
        renderDiff();
        setTimeout(() => {
          btnCompile.textContent = 'Compile Context (Simulate AST Pruning)';
        }, 1500);
      }, 350);
    });
  }

  renderDiff();

  // 3. Context X-Ray Explorer setup
  initXrayExplorer();

  // 4. Native Chat Simulation setup
  initChatSimulator();

  // 5. Session Handoff Simulation setup
  const btnHandoff = document.getElementById('btn-generate-handoff');
  const handoffPreview = document.getElementById('handoff-preview-container');
  if (btnHandoff && handoffPreview) {
    btnHandoff.addEventListener('click', () => {
      btnHandoff.textContent = 'Synthesizing Checkpoint...';
      setTimeout(() => {
        btnHandoff.textContent = '✓ Checkpoint Generated (/handoff)';
        handoffPreview.style.display = 'block';
        handoffPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    });
  }
}

function initXrayExplorer() {
  const tableBody = document.getElementById('xray-table-body');
  const sortBtns = document.querySelectorAll('.xray-sort-btn');
  const filterInput = document.getElementById('xray-filter-input');
  const detailName = document.getElementById('xray-detail-name');
  const detailText = document.getElementById('xray-detail-text');
  const detailPill = document.getElementById('xray-detail-pill');

  let currentSort = 'savings';
  let filterText = '';

  function renderXrayTable() {
    if (!tableBody) return;

    let items = [...XRAY_DATA];
    if (filterText) {
      const q = filterText.toLowerCase();
      items = items.filter(i => i.path.toLowerCase().includes(q));
    }

    if (currentSort === 'savings') {
      items.sort((a, b) => b.savings - a.savings);
    } else if (currentSort === 'raw') {
      items.sort((a, b) => b.raw - a.raw);
    } else if (currentSort === 'pct') {
      items.sort((a, b) => b.pct - a.pct);
    }

    tableBody.innerHTML = items.map((item, idx) => {
      const isSelected = idx === 0 ? 'selected' : '';
      return `
        <tr class="${isSelected}" data-path="${item.path}" data-raw="${item.raw}" data-skel="${item.skeleton}" data-sav="${item.savings}" data-pct="${item.pct}">
          <td><code>${item.path}</code></td>
          <td>${item.raw.toLocaleString()}</td>
          <td>${item.skeleton.toLocaleString()}</td>
          <td class="savings-green">-${item.pct}%</td>
          <td>
            <div class="xray-density-bar-container">
              <div class="xray-density-bar">
                <div class="xray-density-fill" style="width: ${item.pct}%"></div>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-dim);">${item.savings} saved</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row click listeners
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(r => {
      r.addEventListener('click', () => {
        rows.forEach(row => row.classList.remove('selected'));
        r.classList.add('selected');

        const path = r.getAttribute('data-path');
        const raw = r.getAttribute('data-raw');
        const skel = r.getAttribute('data-skel');
        const sav = r.getAttribute('data-sav');
        const pct = r.getAttribute('data-pct');

        if (detailName) detailName.textContent = path;
        if (detailText) detailText.textContent = `Raw: ${raw} tokens → Skeleton: ${skel} tokens | Potential Savings: ${sav} tokens (-${pct}%)`;
        if (detailPill) {
          detailPill.textContent = parseFloat(pct) > 60 ? '✓ Prime Candidate for AST Skeletonization' : '✓ Standard Structural Reduction';
        }
      });
    });

    // Auto-select first row detail
    if (items.length > 0 && detailName && detailText) {
      detailName.textContent = items[0].path;
      detailText.textContent = `Raw: ${items[0].raw} tokens → Skeleton: ${items[0].skeleton} tokens | Potential Savings: ${items[0].savings} tokens (-${items[0].pct}%)`;
    }
  }

  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.getAttribute('data-xray-sort');
      renderXrayTable();
    });
  });

  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      filterText = e.target.value.trim();
      renderXrayTable();
    });
  }

  renderXrayTable();
}

function initChatSimulator() {
  const container = document.getElementById('chat-messages-container');
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  const activeModel = document.getElementById('chat-active-model');

  function renderScenario(scenarioKey) {
    if (!container) return;
    const s = CHAT_SCENARIOS[scenarioKey] || CHAT_SCENARIOS.test;

    let adviceHtml = '';
    if (s.advice) {
      adviceHtml = `
        <div class="chat-advice-pill">
          <span>${s.advice}</span>
          <button class="chat-advice-btn" id="btn-switch-model">Switch to Haiku</button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="chat-bubble-user">${escapeHtml(s.user)}</div>
      <div class="chat-bubble-assistant">
        ${adviceHtml}
        <pre class="code-preview" style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: 6px; font-family: var(--font-mono); font-size: 0.8rem;"><code>${escapeHtml(s.code)}</code></pre>
        <div class="chat-telemetry-strip">${s.telemetry}</div>
      </div>
    `;

    const switchBtn = document.getElementById('btn-switch-model');
    if (switchBtn && activeModel) {
      switchBtn.addEventListener('click', () => {
        activeModel.textContent = 'Model: Claude 3.5 Haiku (~90% lower cost)';
        switchBtn.textContent = '✓ Switched';
        switchBtn.style.background = '#10b981';
      });
    }
  }

  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sc = btn.getAttribute('data-scenario');
      renderScenario(sc);
    });
  });

  renderScenario('test');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------------
// 4. Command Palette Cheatsheet with Live Search
// -------------------------------------------------------------------
const COMMAND_DATABASE = [
  {
    cmd: 'Tokonomics: Slice Active Symbol Dependency Graph (Cross-File AST)',
    category: 'AST Slicing (v8.9.0)',
    desc: 'Computes backward program slice around active editor symbol across file boundaries in < 0.3ms, cutting orthogonal tokens by 70%-90%.'
  },
  {
    cmd: 'Tokonomics: Pin Prompt Prefix (1,024-Token Cache Alignment)',
    category: 'Cache Pinning (v8.9.0)',
    desc: 'Pins prompt prefix into deterministic 3-tier envelope with 1,024-token boundary padding, dynamic cache-buster sanitization, and Anthropic cache_control markers.'
  },
  {
    cmd: '@tokonomics /slice [symbol]',
    category: 'Chat Participant (v8.9.0)',
    desc: 'Cross-file semantic dependency graph slicing in Copilot Chat, distilling symbol dependencies and showing real-time token savings.'
  },
  {
    cmd: '@tokonomics /pin [prompt]',
    category: 'Chat Participant (v8.9.0)',
    desc: 'Pins system and static prompt context to 1,024-token boundaries in Copilot Chat for 100% prefix byte invariance and guaranteed cache hits.'
  },
  {
    cmd: 'Tokonomics: Copy Agent MCP Configuration',
    category: 'Agent Layer',
    desc: 'Generates and copies one-click MCP server configurations for Claude Code CLI, Cursor (.cursor/mcp.json), and Codex/Windsurf.'
  },
  {
    cmd: 'Tokonomics: Start Tokonomics MCP Server',
    category: 'Agent Layer',
    desc: 'Spawns the Tokonomics standalone MCP stdio server in a VS Code terminal for external autonomous agent connections.'
  },
  {
    cmd: 'Tokonomics: Toggle Usage Analytics',
    category: 'Privacy',
    desc: 'Toggles anonymous, privacy-preserving aggregate usage telemetry (Aptabase) with zero code or prompt collection.'
  },
  {
    cmd: 'Tokonomics: Export Anonymized Diagnostic Logs',
    category: 'Privacy',
    desc: 'Generates and exports locally sanitized diagnostic logs with automatic secret redaction and path neutralization.'
  },
  {
    cmd: 'Tokonomics: Run Pipeline Step Inspector',
    category: 'Compiler',
    desc: 'Opens the live multi-stage context pipeline stepper to inspect stage execution deltas and timings.'
  },
  {
    cmd: 'Tokonomics: View Branch Financial Drift',
    category: 'FinOps',
    desc: 'Analyzes active branch token consumption drift against main repository baselines with drift severity indicators.'
  },
  {
    cmd: 'Tokonomics: Inspect Model Efficiency Frontier',
    category: 'FinOps',
    desc: 'Visualizes 2D Pareto-optimal models in log-scale latency vs cost space to optimize model tier selection.'
  },
  {
    cmd: 'Tokonomics: Show Milestone Ledger & Carbon Savings',
    category: 'FinOps',
    desc: 'Displays the 4-tier milestone achievement ledger with verified CO2e carbon offset grams.'
  },
  {
    cmd: 'Tokonomics: Optimize Prompt via CodeLens',
    category: 'Compiler',
    desc: 'Contextual CodeLens action above prompt templates and context blocks to compile lean AST slices.'
  },
  {
    cmd: 'Tokonomics: Run First Context Check',
    category: 'Insights',
    desc: 'Starts the guided 5-step local onboarding check. Estimates active editor context without sending prompts.'
  },
  {
    cmd: 'Tokonomics: Run Context X-Ray',
    category: 'Insights',
    desc: 'Analyzes one immutable workspace-index snapshot to rank context-heavy files with quick filters for savings and raw tokens.'
  },
  {
    cmd: 'Tokonomics: Start Context Meter',
    category: 'Insights',
    desc: 'Toggles a real-time token counter in the VS Code status bar for the active selection or text buffer (300 KiB limit).'
  },
  {
    cmd: 'Tokonomics: Stop Context Meter',
    category: 'Insights',
    desc: 'Stops the status-bar context meter and disposes all editor listeners immediately.'
  },
  {
    cmd: 'Tokonomics: Create Chat Handoff',
    category: 'Insights',
    desc: 'Generates a bounded, redacted Markdown checkpoint (/handoff) of the active Tokonomics chat to reset context.'
  },
  {
    cmd: 'Tokonomics: Analyze Session Log Health',
    category: 'Insights',
    desc: 'Inspects a supported Claude Code .json/.jsonl log in read-only mode to detect repeated tool bloat and growth trends.'
  },
  {
    cmd: 'Tokonomics: Audit Tool-Schema Overhead',
    category: 'Insights',
    desc: 'Lints OpenAI functions, MCP inputSchema, or Claude schemas for flat parameter explosion (>6 args) and deep nesting.'
  },
  {
    cmd: 'Tokonomics: Open Chat',
    category: 'Chat Surface',
    desc: 'Opens the dedicated Tokonomics chat interface in the Secondary Side Bar.'
  },
  {
    cmd: 'Tokonomics: Open Chat in Editor',
    category: 'Chat Surface',
    desc: 'Opens Tokonomics chat in a dedicated split editor tab for wide-screen coding.'
  },
  {
    cmd: 'Tokonomics: Show Savings Dashboard',
    category: 'FinOps',
    desc: 'Opens the complete FinOps activity dashboard displaying token activity, tasks, and available cost estimates.'
  },
  {
    cmd: 'Tokonomics: Show Live Session Savings',
    category: 'FinOps',
    desc: 'Displays the live session savings and turn efficiency stream.'
  },
  {
    cmd: 'Tokonomics: Start Spend Task',
    category: 'FinOps',
    desc: 'Groups all subsequent turns under an explicit task identifier to measure cost per feature.'
  },
  {
    cmd: 'Tokonomics: End Spend Task',
    category: 'FinOps',
    desc: 'Ends the active spend task and records task token and duration aggregates.'
  },
  {
    cmd: 'Tokonomics: Set Spend Budget',
    category: 'FinOps',
    desc: 'Sets advisory budget limits (task, daily, monthly) with non-blocking alerts.'
  },
  {
    cmd: 'Tokonomics: Watch Claude Usage Log',
    category: 'FinOps',
    desc: 'Continuously monitors a selected Claude Code JSONL log to import real-time usage metadata.'
  },
  {
    cmd: 'Tokonomics: Manage Project Memory',
    category: 'Memory',
    desc: 'Opens the encrypted project memory management palette to inspect, export, or clear stored facts.'
  },
  {
    cmd: 'Tokonomics: Compare Original vs Pruned Skeleton',
    category: 'Compiler',
    desc: 'Opens a side-by-side visual diff showing exact code lines preserved vs AST sliced.'
  },
  {
    cmd: 'Tokonomics: Optimize & Copy Selection as Context',
    category: 'Compiler',
    desc: 'Compiles the active editor selection into an AST skeleton and copies it to your clipboard for external use.'
  }
];

function initCommandPalette() {
  const searchInput = document.getElementById('command-search');
  const commandGrid = document.getElementById('command-list');

  function renderCommands(query = '') {
    const q = query.toLowerCase().trim();
    const filtered = COMMAND_DATABASE.filter(item => 
      item.cmd.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );

    commandGrid.innerHTML = '';
    if (filtered.length === 0) {
      commandGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 2rem;">No commands matching "${query}".</div>`;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'cmd-card';
      card.innerHTML = `
        <div>
          <span class="cmd-badge">${item.category}</span>
          <div class="cmd-title">${item.cmd}</div>
          <div class="cmd-desc">${item.desc}</div>
        </div>
        <div class="code-box">
          <code>${item.cmd}</code>
          <button class="copy-btn" data-copy="${item.cmd}">Copy</button>
        </div>
      `;
      commandGrid.appendChild(card);
    });
  }

  searchInput.addEventListener('input', (e) => {
    renderCommands(e.target.value);
  });

  // Initial render
  renderCommands();
}


// -------------------------------------------------------------------
// 5. Interactive Cockpit & Frontier Simulator (v8.6.0)
// -------------------------------------------------------------------
let pollTimer = null;
let liveTokens = 1428950;
let liveCost = 42.86;

function initCockpitSimulator() {
  initPollingToggles();
  initPipelineStepper();
  initTreemapSelection();
  initBranchSelector();
  initBudgetSlider();
  initFrontierPlot();
}

function initPollingToggles() {
  const buttons = document.querySelectorAll('#sim-poll-rate .pill-toggle-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const rateSec = parseInt(btn.getAttribute('data-rate'), 10);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (rateSec > 0) {
        pollTimer = setInterval(() => {
          liveTokens += Math.floor(Math.random() * 45) + 10;
          liveCost += 0.0012;
          const kpiTok = document.getElementById('kpi-tokens');
          const kpiCst = document.getElementById('kpi-cost');
          if (kpiTok) kpiTok.textContent = liveTokens.toLocaleString();
          if (kpiCst) kpiCst.textContent = '$' + liveCost.toFixed(2);
        }, rateSec * 1000);
      }
    });
  });
}

function initPipelineStepper() {
  const steps = document.querySelectorAll('#sim-pipeline-stepper .pipeline-step');
  const stageName = document.getElementById('inspector-stage-name');
  const stageTime = document.getElementById('inspector-stage-time');
  const stageDesc = document.getElementById('inspector-stage-desc');
  const stageTok = document.getElementById('inspector-stage-tok');
  const stageSaved = document.getElementById('inspector-stage-saved');

  steps.forEach(step => {
    step.addEventListener('click', () => {
      steps.forEach(s => s.classList.remove('active'));
      step.classList.add('active');

      const name = step.getAttribute('data-name');
      const time = step.getAttribute('data-time');
      const desc = step.getAttribute('data-desc');
      const tok = parseInt(step.getAttribute('data-tok'), 10);
      const stepIdx = parseInt(step.getAttribute('data-step'), 10);

      const rawTok = 842;
      const savedPct = rawTok > 0 ? Math.round(((rawTok - tok) / rawTok) * 100) : 0;

      if (stageName) stageName.textContent = `Stage ${stepIdx + 1}: ${name}`;
      if (stageTime) stageTime.textContent = time;
      if (stageDesc) stageDesc.textContent = desc;
      if (stageTok) stageTok.textContent = tok.toLocaleString();
      if (stageSaved) stageSaved.textContent = `${savedPct}%`;
    });
  });
}

function initTreemapSelection() {
  const tiles = document.querySelectorAll('#sim-treemap .market-tile, #sim-treemap .treemap-tile');
  const nameEl = document.getElementById('tm-selected-name');
  const filesEl = document.getElementById('tm-selected-files');
  const tokEl = document.getElementById('tm-selected-tokens');
  const savEl = document.getElementById('tm-selected-sav');

  tiles.forEach(tile => {
    tile.addEventListener('click', () => {
      tiles.forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');

      const name = tile.getAttribute('data-name');
      const tok = tile.getAttribute('data-tok');
      const pct = tile.getAttribute('data-pct');
      const files = tile.getAttribute('data-files');

      if (nameEl) nameEl.textContent = name;
      if (filesEl) filesEl.textContent = files;
      if (tokEl) tokEl.textContent = tok;
      if (savEl) savEl.textContent = `${pct} Slicing Potential`;
    });
  });
}

function initBranchSelector() {
  const select = document.getElementById('sim-branch-select');
  const pill = document.getElementById('sim-drift-pill');
  const cost = document.getElementById('sim-drift-cost');
  const tokens = document.getElementById('sim-drift-tokens');

  if (!select) return;
  select.addEventListener('change', () => {
    const val = select.value;
    if (val === 'auth') {
      if (pill) { pill.className = 'drift-pill pill-amber'; pill.textContent = '⚠️ Minor Drift (+18.4%)'; }
      if (cost) cost.textContent = '+$4.12';
      if (tokens) tokens.textContent = '+138k';
    } else if (val === 'fix') {
      if (pill) { pill.className = 'drift-pill pill-green'; pill.textContent = '✓ On Track (+1.2%)'; }
      if (cost) cost.textContent = '+$0.24';
      if (tokens) tokens.textContent = '+12k';
    } else {
      if (pill) { pill.className = 'drift-pill pill-green'; pill.textContent = '✓ High Savings (-14.0%)'; }
      if (cost) cost.textContent = '-$2.80';
      if (tokens) tokens.textContent = '-95k';
    }
  });
}

function initBudgetSlider() {
  const slider = document.getElementById('sim-budget-slider');
  const display = document.getElementById('sim-budget-display');
  const velocityEl = document.getElementById('sim-burn-velocity');
  const projectedEl = document.getElementById('sim-projected-spend');
  const exhaustEl = document.getElementById('sim-exhaust-days');
  const badgeEl = document.getElementById('sim-exhaust-badge');

  if (!slider) return;
  slider.addEventListener('input', () => {
    const budget = parseInt(slider.value, 10);
    if (display) display.textContent = `$${budget} / mo`;

    const velocity = 3.42; // $/day
    const projected = Math.round(velocity * 30 * 10) / 10;
    const remainingDays = Math.round(budget / velocity);

    if (velocityEl) velocityEl.textContent = `$${velocity.toFixed(2)} / day`;
    if (projectedEl) projectedEl.textContent = `$${projected.toFixed(2)} / mo`;

    if (remainingDays >= 30) {
      if (exhaustEl) exhaustEl.textContent = `${remainingDays} Days (Safe)`;
      if (badgeEl) { badgeEl.className = 'exhaustion-badge badge-green'; badgeEl.textContent = 'Safe Velocity'; }
    } else if (remainingDays >= 20) {
      if (exhaustEl) exhaustEl.textContent = `${remainingDays} Days (Advisory)`;
      if (badgeEl) { badgeEl.className = 'exhaustion-badge pill-amber'; badgeEl.textContent = 'Moderate Velocity'; }
    } else {
      if (exhaustEl) exhaustEl.textContent = `${remainingDays} Days (Alert)`;
      if (badgeEl) { badgeEl.className = 'exhaustion-badge pill-danger'; badgeEl.textContent = 'Budget Exceeded'; }
    }
  });
}

function initFrontierPlot() {
  const dots = document.querySelectorAll('#sim-frontier-svg .frontier-dot');
  const nameEl = document.getElementById('fc-name');
  const costEl = document.getElementById('fc-cost');
  const latEl = document.getElementById('fc-lat');
  const recEl = document.getElementById('fc-rec');
  const paretoEl = document.getElementById('fc-pareto-badge');

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      dots.forEach(d => d.classList.remove('active-dot'));
      dot.classList.add('active-dot');

      const name = dot.getAttribute('data-name');
      const cost = dot.getAttribute('data-cost');
      const lat = dot.getAttribute('data-lat');
      const rec = dot.getAttribute('data-rec');
      const isPareto = dot.getAttribute('data-pareto') === 'true';

      if (nameEl) nameEl.textContent = name;
      if (costEl) costEl.textContent = cost;
      if (latEl) latEl.textContent = lat;
      if (recEl) recEl.textContent = rec;

      if (paretoEl) {
        if (isPareto) {
          paretoEl.textContent = '✓ 2D Pareto Optimal';
          paretoEl.style.display = 'inline-block';
        } else {
          paretoEl.style.display = 'none';
        }
      }
    });
  });
}


// -------------------------------------------------------------------
// 6. Interactive Model Context Protocol (MCP) Tool Firewall Simulator (v8.6.0)
// -------------------------------------------------------------------
const MCP_SCENARIOS = {
  github: {
    name: '🐙 GitHub CI & PRs',
    prompt: 'Review open pull requests, compare branch diffs, and inspect the latest commit on main',
    intent: 'git',
    matchedTools: ['git_status', 'git_diff', 'git_commit', 'create_or_update_pull_request'],
    rawTokens: 7796,
    prunedTokens: 779,
    rawDisplay: `{\n  "//": "55 MCP Tools Active across 7 Servers (github, postgres, filesystem, brave, puppeteer, slack, sentry)",\n  "tools": [\n    {\n      "name": "create_or_update_pull_request",\n      "description": "Creates a new pull request or updates an existing pull request in the targeted repository. Ensures base and head branches are valid, adds review comments and body markdown.",\n      "inputSchema": {\n        "type": "object",\n        "properties": {\n          "owner": { "type": "string", "description": "The GitHub repository owner account name" },\n          "repo": { "type": "string", "description": "The repository slug name" },\n          "title": { "type": "string", "description": "Title of the proposed pull request" },\n          "head": { "type": "string", "description": "Name of the branch containing new commits" },\n          "base": { "type": "string", "description": "Name of the branch you want to merge into" },\n          "body": { "type": "string", "description": "Extended markdown description of the changes" }\n        },\n        "required": ["owner", "repo", "title", "head", "base"]\n      }\n    },\n    {\n      "name": "git_diff",\n      "description": "Computes line-by-line differences between working tree and commit index or between branches with unified diff output format.",\n      "inputSchema": {\n        "type": "object",\n        "properties": {\n          "path": { "type": "string", "description": "Relative file path to inspect diff" },\n          "staged": { "type": "boolean", "description": "Include staged index changes only" }\n        }\n      }\n    },\n    {\n      "name": "sql_query",\n      "description": "Executes read-only SQL SELECT queries against the connected Postgres instance with execution limits.",\n      "inputSchema": { /* ... Postgres schema payload (856 tokens) ... */ }\n    },\n    {\n      "name": "puppeteer_navigate",\n      "description": "Directs the headless Chromium browser to navigate to a target HTTP URL.",\n      "inputSchema": { /* ... Puppeteer schema payload (661 tokens) ... */ }\n    },\n    {\n      "name": "sentry_list_events",\n      "description": "Queries Sentry Discover API for error events, stack traces, and unhandled exceptions.",\n      "inputSchema": { /* ... Sentry schema payload (585 tokens) ... */ }\n    }\n    /* ... 50 additional unpruned tool schemas omitted ... */\n  ]\n}`,
    prunedDisplay: `// ============================================================================\n// Tokonomics MCP Tool Firewall (v8.6.0)\n// Dynamic Intent: [git] (0.94 score) | Top 4 Candidates + Virtual Catalog\n// 55 Tools -> 4 Active Tools + Fallback | 7,796 -> 779 Tokens (-90.0%)\n// ============================================================================\n\ngit_status(): { branch: string; dirty: boolean; staged: string[] }\ngit_diff(path?: string, staged?: boolean): { diff: string }\ngit_commit(message: string): { hash: string; summary: string }\ncreate_or_update_pull_request(owner: string, repo: string, title: string, head: string, base: string, body?: string): { prUrl: string; number: number }\n\n// --- Virtual Catalog Paging Safety Invariant ---\n// If model requires an unlisted tool, invoking this virtual tool resolves it in 1.4ms:\ntokonomics_request_tool_catalog(intentHint?: string): { availableTools: string[]; schemaPagingUrl: string }`,
    tsDisplay: `// Tokonomics TypeScript Minification: Boilerplate JSON Schema Stripped (-31.1%)\ncreate_or_update_pull_request(owner: string, repo: string, title: string, head: string, base: string, body?: string): Promise<{ prUrl: string; number: number }>;\ngit_diff(path?: string, staged?: boolean): Promise<{ diff: string }>;\ngit_commit(message: string): Promise<{ hash: string; summary: string }>;\ngit_status(): Promise<{ branch: string; dirty: boolean; staged: string[] }>;\nsql_query(query: string, limit?: number): Promise<{ rows: any[]; rowCount: number }>;\npuppeteer_navigate(url: string, timeoutMs?: number): Promise<{ status: number }>;\nsentry_list_events(issueId: string): Promise<{ events: any[] }>;\n// ... all 55 tools formatted as lean TypeScript function signatures (5,871 tokens)`
  },
  postgres: {
    name: '🐘 Postgres SQL Query',
    prompt: 'Execute read-only SQL query on the transactions table and explain the execution plan',
    intent: 'database',
    matchedTools: ['sql_query', 'sql_execute', 'list_tables', 'describe_table'],
    rawTokens: 7796,
    prunedTokens: 622,
    rawDisplay: `{\n  "//": "55 MCP Tools Active across 7 Servers",\n  "tools": [\n    {\n      "name": "sql_query",\n      "description": "Executes read-only SQL queries against Postgres database and returns tabular rows with strict timeout bounds.",\n      "inputSchema": {\n        "type": "object",\n        "properties": {\n          "sql": { "type": "string", "description": "The parameterized SQL statement to execute" },\n          "params": { "type": "array", "description": "Positional parameter values for query" },\n          "limit": { "type": "number", "description": "Maximum rows to return" }\n        },\n        "required": ["sql"]\n      }\n    },\n    {\n      "name": "describe_table",\n      "description": "Fetches columns, foreign keys, indexes, and constraint metadata for a named database table.",\n      "inputSchema": {\n        "type": "object",\n        "properties": { "tableName": { "type": "string", "description": "Table name to inspect" } },\n        "required": ["tableName"]\n      }\n    }\n    /* ... 53 other tools across all 7 servers ... */\n  ]\n}`,
    prunedDisplay: `// ============================================================================\n// Tokonomics MCP Tool Firewall (v8.6.0)\n// Dynamic Intent: [database] (0.91 score) | 4 Active Tools + Virtual Catalog\n// 55 Tools -> 4 Active Tools | 7,796 -> 622 Tokens (-92.0%)\n// ============================================================================\n\nsql_query(sql: string, params?: any[], limit?: number): { rows: Record<string, any>[]; rowCount: number }\ndescribe_table(tableName: string): { columns: string[]; primaryKey: string; indexes: string[] }\nlist_tables(schema?: string): { tables: string[] }\nsql_execute(sql: string): { affectedRows: number }\n\n// --- Virtual Catalog Paging Safety Invariant ---\ntokonomics_request_tool_catalog(intentHint?: string): { availableTools: string[]; schemaPagingUrl: string }`,
    tsDisplay: `// Tokonomics TypeScript Minification: Postgres Schemas (-31.1%)\nsql_query(sql: string, params?: any[], limit?: number): Promise<{ rows: any[]; rowCount: number }>;\ndescribe_table(tableName: string): Promise<{ columns: string[]; indexes: string[] }>;\nlist_tables(schema?: string): Promise<{ tables: string[] }>;\nsql_execute(sql: string): Promise<{ affectedRows: number }>;`
  },
  web: {
    name: '🌐 Brave Search & Puppeteer',
    prompt: 'Search the web for the latest Next.js 15 migration notes and crawl the release docs with headless browser',
    intent: 'web/browser',
    matchedTools: ['brave_web_search', 'puppeteer_navigate', 'puppeteer_click', 'puppeteer_evaluate'],
    rawTokens: 7796,
    prunedTokens: 685,
    rawDisplay: `{\n  "//": "55 MCP Tools Active across 7 Servers",\n  "tools": [\n    {\n      "name": "brave_web_search",\n      "description": "Performs public web searches via Brave Search API with live ranking and summaries.",\n      "inputSchema": {\n        "type": "object",\n        "properties": { "query": { "type": "string", "description": "Keywords to query" } },\n        "required": ["query"]\n      }\n    },\n    {\n      "name": "puppeteer_navigate",\n      "description": "Navigates browser instance to given URL and waits for network idle lifecycle.",\n      "inputSchema": {\n        "type": "object",\n        "properties": { "url": { "type": "string" }, "timeout": { "type": "number" } },\n        "required": ["url"]\n      }\n    }\n  ]\n}`,
    prunedDisplay: `// ============================================================================\n// Tokonomics MCP Tool Firewall (v8.6.0)\n// Dynamic Intent: [web/browser] (0.88 score) | 4 Active Tools + Virtual Catalog\n// 55 Tools -> 4 Active Tools | 7,796 -> 685 Tokens (-91.2%)\n// ============================================================================\n\nbrave_web_search(query: string, count?: number): { results: { title: string; url: string; snippet: string }[] }\npuppeteer_navigate(url: string, timeoutMs?: number): { status: number; pageTitle: string }\npuppeteer_click(selector: string): { success: boolean }\npuppeteer_evaluate(script: string): { result: any }\n\n// --- Virtual Catalog Paging Safety Invariant ---\ntokonomics_request_tool_catalog(intentHint?: string): { availableTools: string[]; schemaPagingUrl: string }`,
    tsDisplay: `// Tokonomics TypeScript Minification: Web & Browser Tools (-31.1%)\nbrave_web_search(query: string, count?: number): Promise<any>;\npuppeteer_navigate(url: string, timeoutMs?: number): Promise<any>;\npuppeteer_click(selector: string): Promise<any>;\npuppeteer_evaluate(script: string): Promise<any>;`
  },
  incident: {
    name: '🚨 Sentry Triage & Slack',
    prompt: 'Inspect recent Sentry crash stack trace for Error 500 and post an alert to the #devops-incidents Slack channel',
    intent: 'monitoring/messaging',
    matchedTools: ['sentry_get_issue', 'sentry_list_events', 'slack_post_message', 'slack_add_reaction'],
    rawTokens: 7796,
    prunedTokens: 742,
    rawDisplay: `{\n  "//": "55 MCP Tools Active across 7 Servers",\n  "tools": [\n    {\n      "name": "sentry_get_issue",\n      "description": "Retrieves error details, breadcrumbs, stack traces, and environment context for a Sentry issue.",\n      "inputSchema": { "type": "object", "properties": { "issueId": { "type": "string" } }, "required": ["issueId"] }\n    },\n    {\n      "name": "slack_post_message",\n      "description": "Publishes a markdown message to an authorized Slack channel or direct message thread.",\n      "inputSchema": { "type": "object", "properties": { "channel": { "type": "string" }, "text": { "type": "string" } }, "required": ["channel", "text"] }\n    }\n  ]\n}`,
    prunedDisplay: `// ============================================================================\n// Tokonomics MCP Tool Firewall (v8.6.0)\n// Dynamic Intent: [monitoring/messaging] (0.93 score) | 4 Active Tools + Virtual Catalog\n// 55 Tools -> 4 Active Tools | 7,796 -> 742 Tokens (-90.5%)\n// ============================================================================\n\nsentry_get_issue(issueId: string): { id: string; title: string; count: number; lastSeen: string; stackTrace: string }\nsentry_list_events(issueId: string, limit?: number): { events: any[] }\nslack_post_message(channel: string, text: string, threadTs?: string): { ok: boolean; ts: string }\nslack_add_reaction(channel: string, timestamp: string, name: string): { ok: boolean }\n\n// --- Virtual Catalog Paging Safety Invariant ---\ntokonomics_request_tool_catalog(intentHint?: string): { availableTools: string[]; schemaPagingUrl: string }`,
    tsDisplay: `// Tokonomics TypeScript Minification: Sentry & Slack Tools (-31.1%)\nsentry_get_issue(issueId: string): Promise<any>;\nsentry_list_events(issueId: string, limit?: number): Promise<any>;\nslack_post_message(channel: string, text: string): Promise<any>;\nslack_add_reaction(channel: string, timestamp: string, name: string): Promise<any>;`
  },
  filesystem: {
    name: '📁 Filesystem Workspace',
    prompt: 'Search workspace for all auth middleware files and read security headers configuration',
    intent: 'filesystem',
    matchedTools: ['search_files', 'read_file', 'list_directory', 'get_file_info'],
    rawTokens: 7796,
    prunedTokens: 698,
    rawDisplay: `{\n  "//": "55 MCP Tools Active across 7 Servers",\n  "tools": [\n    {\n      "name": "search_files",\n      "description": "Recursively searches workspace directory for files matching glob pattern.",\n      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" }, "pattern": { "type": "string" } }, "required": ["path", "pattern"] }\n    },\n    {\n      "name": "read_file",\n      "description": "Reads complete UTF-8 contents of a workspace file within bounded file size limits.",\n      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] }\n    }\n  ]\n}`,
    prunedDisplay: `// ============================================================================\n// Tokonomics MCP Tool Firewall (v8.6.0)\n// Dynamic Intent: [filesystem] (0.89 score) | 4 Active Tools + Virtual Catalog\n// 55 Tools -> 4 Active Tools | 7,796 -> 698 Tokens (-91.0%)\n// ============================================================================\n\nsearch_files(path: string, pattern: string): { matches: string[] }\nread_file(path: string): { content: string; size: number }\nlist_directory(path: string): { files: string[]; directories: string[] }\nget_file_info(path: string): { size: number; modified: string; isDirectory: boolean }\n\n// --- Virtual Catalog Paging Safety Invariant ---\ntokonomics_request_tool_catalog(intentHint?: string): { availableTools: string[]; schemaPagingUrl: string }`,
    tsDisplay: `// Tokonomics TypeScript Minification: Filesystem Tools (-31.1%)\nsearch_files(path: string, pattern: string): Promise<{ matches: string[] }>;\nread_file(path: string): Promise<{ content: string }>;\nlist_directory(path: string): Promise<{ files: string[]; directories: string[] }>;\nget_file_info(path: string): Promise<any>;`
  }
};

function initMcpSimulator() {
  const scenarioBtns = document.querySelectorAll('.mcp-scenario-btn');
  const modeBtns = document.querySelectorAll('.mcp-mode-btn');
  const promptInput = document.getElementById('mcp-user-prompt');
  const runBtn = document.getElementById('btn-run-mcp-firewall');
  const rawContent = document.getElementById('mcp-raw-content');
  const prunedContent = document.getElementById('mcp-pruned-content');
  const rawTokensBadge = document.getElementById('mcp-raw-tokens');
  const prunedTokensBadge = document.getElementById('mcp-pruned-tokens');
  const statSaved = document.getElementById('mcp-stat-saved');
  const statPct = document.getElementById('mcp-stat-pct');
  const statLatency = document.getElementById('mcp-stat-latency');
  const statCost = document.getElementById('mcp-stat-cost');
  const prunedHeader = document.getElementById('mcp-pruned-header');
  const btnPaging = document.getElementById('btn-simulate-mcp-paging');
  const pagingToast = document.getElementById('mcp-paging-toast');

  if (!rawContent || !prunedContent) return;

  let activeScenarioKey = 'github';
  let activeMode = 'firewall';

  function render() {
    const sc = MCP_SCENARIOS[activeScenarioKey] || MCP_SCENARIOS.github;

    if (activeMode === 'firewall') {
      rawContent.textContent = sc.rawDisplay;
      prunedContent.textContent = sc.prunedDisplay;
      if (rawTokensBadge) rawTokensBadge.textContent = '7,796 tokens';
      if (prunedTokensBadge) {
        prunedTokensBadge.textContent = `${sc.prunedTokens} tokens (-90.0%)`;
        prunedTokensBadge.className = 'token-badge badge-green';
      }
      if (statSaved) statSaved.textContent = (7796 - sc.prunedTokens).toLocaleString();
      if (statPct) statPct.textContent = `-${((1 - sc.prunedTokens / 7796) * 100).toFixed(1)}%`;
      if (statLatency) statLatency.textContent = '2.31 ms';
      if (statCost) statCost.textContent = '+$60.61';
      if (prunedHeader) prunedHeader.textContent = 'Tokonomics MCP Tool Firewall (Top Candidates + Virtual Catalog)';
    } else if (activeMode === 'typescript') {
      rawContent.textContent = sc.rawDisplay;
      prunedContent.textContent = sc.tsDisplay;
      if (rawTokensBadge) rawTokensBadge.textContent = '7,796 tokens';
      if (prunedTokensBadge) {
        prunedTokensBadge.textContent = '5,871 tokens (-24.7%)';
        prunedTokensBadge.className = 'token-badge badge-green';
      }
      if (statSaved) statSaved.textContent = '1,925';
      if (statPct) statPct.textContent = '-24.7%';
      if (statLatency) statLatency.textContent = '1.85 ms';
      if (statCost) statCost.textContent = '+$18.20';
      if (prunedHeader) prunedHeader.textContent = 'TypeScript Pseudo-Signatures (Boilerplate Stripped)';
    } else {
      rawContent.textContent = sc.rawDisplay;
      prunedContent.textContent = sc.rawDisplay;
      if (rawTokensBadge) rawTokensBadge.textContent = '7,796 tokens';
      if (prunedTokensBadge) {
        prunedTokensBadge.textContent = '7,796 tokens (0.0%)';
        prunedTokensBadge.className = 'token-badge';
      }
      if (statSaved) statSaved.textContent = '0';
      if (statPct) statPct.textContent = '0.0%';
      if (statLatency) statLatency.textContent = '0.00 ms';
      if (statCost) statCost.textContent = '$0.00';
      if (prunedHeader) prunedHeader.textContent = 'Raw Unoptimized Monolithic JSON Schema (Bypass)';
    }
  }

  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeScenarioKey = btn.getAttribute('data-mcp-scenario');
      if (promptInput && MCP_SCENARIOS[activeScenarioKey]) {
        promptInput.value = MCP_SCENARIOS[activeScenarioKey].prompt;
      }
      render();
    });
  });

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.getAttribute('data-mcp-mode');
      render();
    });
  });

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const q = (promptInput?.value || '').toLowerCase();
      if (q.includes('sql') || q.includes('query') || q.includes('postgres') || q.includes('database')) {
        activeScenarioKey = 'postgres';
      } else if (q.includes('brave') || q.includes('search') || q.includes('crawl') || q.includes('puppeteer') || q.includes('web')) {
        activeScenarioKey = 'web';
      } else if (q.includes('sentry') || q.includes('slack') || q.includes('crash') || q.includes('incident') || q.includes('error')) {
        activeScenarioKey = 'incident';
      } else if (q.includes('file') || q.includes('dir') || q.includes('path') || q.includes('read') || q.includes('search_files')) {
        activeScenarioKey = 'filesystem';
      } else {
        activeScenarioKey = 'github';
      }

      scenarioBtns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mcp-scenario') === activeScenarioKey);
      });

      render();

      prunedContent.style.transition = 'background-color 0.4s';
      prunedContent.style.backgroundColor = 'rgba(0, 242, 254, 0.12)';
      setTimeout(() => {
        prunedContent.style.backgroundColor = '';
      }, 400);
    });
  }

  if (btnPaging && pagingToast) {
    btnPaging.addEventListener('click', () => {
      pagingToast.style.display = 'block';
      pagingToast.innerHTML = `⚡ <strong>Catalog Virtualization Event:</strong> Model invoked <code>tokonomics_request_tool_catalog("database")</code>.<br>Resolved full tool schema for <code>sql_query</code> in <strong>1.4ms</strong> with 100% parameter accuracy!`;
      setTimeout(() => {
        pagingToast.style.display = 'none';
      }, 4500);
    });
  }

  // Initial render
  render();
}

// -------------------------------------------------------------------
// 7. Interactive Agent Layer & Execution Optimizer Simulator (v8.8.0)
// -------------------------------------------------------------------
function initAgentLayerSimulator() {
  const fileBtns = document.querySelectorAll('.agent-file-btn');
  const stepSkeleton = document.getElementById('btn-agent-step-skeleton');
  const stepHydrate = document.getElementById('btn-agent-step-hydrate');
  const stepBudget = document.getElementById('btn-agent-step-budget');
  const stepDistill = document.getElementById('btn-agent-step-distill');
  const activeCallLbl = document.getElementById('agent-active-call');
  const btnTrigger = document.getElementById('btn-trigger-agent-action');
  const rpcTrace = document.getElementById('agent-rpc-trace');
  const contextHeader = document.getElementById('agent-context-header');
  const contextTokens = document.getElementById('agent-context-tokens');
  const contextView = document.getElementById('agent-context-view');
  const statSaved = document.getElementById('agent-stat-saved');
  const statReduction = document.getElementById('agent-stat-reduction');
  const statFidelity = document.getElementById('agent-stat-fidelity');
  const statParity = document.getElementById('agent-stat-parity');
  const latencyBadge = document.getElementById('agent-rpc-latency');
  const configTabs = document.querySelectorAll('.agent-config-tab');
  const configCode = document.getElementById('agent-config-code');
  const btnCopyConfig = document.getElementById('btn-copy-agent-config');

  if (!rpcTrace || !contextView) return;

  let currentFile = 'auth';
  let currentStep = 'skeleton';
  let requestId = 1;

  const SCENARIOS = {
    auth: {
      path: 'src/auth/AuthService.ts',
      symbol: 'AuthService.validateToken',
      framework: 'auto',
      rawTok: 1450,
      skeletonTok: 261,
      hydratedTok: 412,
      distilledTok: 380,
      savedTok: 1038,
      reduction: '71.6%',
      distillReduction: '73.8%',
      skeleton: `export class AuthService {
    private readonly jwtSecret: string;
    private readonly tokenCache: Map<string, Session>;

    constructor(config: AuthConfig) {
        this.jwtSecret = config.jwtSecret;
        this.tokenCache = new Map();
    }

    // [Tokonomics: Body hidden (24 lines, ~185 tokens). Expand with tokonomics_expand_symbol("src/auth/AuthService.ts", "AuthService.validateToken")]
    async validateToken(bearer: string): Promise<UserClaims> { ... }

    // [Tokonomics: Body hidden (38 lines, ~320 tokens). Expand with tokonomics_expand_symbol("src/auth/AuthService.ts", "AuthService.rotateKeys")]
    async rotateKeys(keyId: string): Promise<KeyRotationResult> { ... }

    // [Tokonomics: Body hidden (19 lines, ~140 tokens). Expand with tokonomics_expand_symbol("src/auth/AuthService.ts", "AuthService.hashPassword")]
    private hashPassword(secret: string, salt: string): string { ... }
}`,
      hydrated: `// ============================================================================
// Tokonomics Hydrated Symbol: AuthService.validateToken (Lines 42-65)
// Exact Byte Boundary Retrieval (0.19ms) | 100% Parameter Fidelity
// ============================================================================

async validateToken(bearer: string): Promise<UserClaims> {
    if (!bearer || !bearer.startsWith('Bearer ')) {
        throw new UnauthorizedException('Malformed authorization header');
    }
    const rawToken = bearer.slice(7).trim();
    const cached = this.tokenCache.get(rawToken);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.claims;
    }
    const claims = await verifyJwtSignature(rawToken, this.jwtSecret, {
        algorithms: ['HS256', 'RS256'],
        clockToleranceSeconds: 5
    });
    this.tokenCache.set(rawToken, { claims, expiresAt: Date.now() + 60000 });
    return claims;
}`,
      distilled: `[Tokonomics Execution Optimizer: Diff & Output Distilled]
[File: src/auth/AuthService.ts]
@@ -42,6 +42,9 @@ async validateToken(bearer: string): Promise<UserClaims>
+    if (!bearer || !bearer.startsWith('Bearer ')) {
+        throw new UnauthorizedException('Malformed authorization header');
+    }
Unchanged context (18 lines) collapsed. Secret tokens and session bearer headers sanitized.`
    },
    gateway: {
      path: 'src/models/ModelGateway.py',
      symbol: 'ModelGateway.calculate_backoff',
      framework: 'pytest',
      rawTok: 1820,
      skeletonTok: 310,
      hydratedTok: 485,
      distilledTok: 544,
      savedTok: 1335,
      reduction: '73.4%',
      distillReduction: '70.1%',
      skeleton: `class ModelGateway:
    def __init__(self, config: GatewayConfig):
        self.config = config
        self.circuit_breaker = CircuitBreaker(threshold=5)

    # [Tokonomics: Body hidden (26 lines, ~210 tokens). Expand with tokonomics_expand_symbol("src/models/ModelGateway.py", "ModelGateway.dispatch_prompt")]
    async def dispatch_prompt(self, payload: RequestPayload) -> Response: ...

    # [Tokonomics: Body hidden (18 lines, ~145 tokens). Expand with tokonomics_expand_symbol("src/models/ModelGateway.py", "ModelGateway.calculate_backoff")]
    def calculate_backoff(self, attempt: int, base_delay: float) -> float: ...

    # [Tokonomics: Body hidden (35 lines, ~280 tokens). Expand with tokonomics_expand_symbol("src/models/ModelGateway.py", "ModelGateway.stream_response")]
    async def stream_response(self, stream: AsyncIterator) -> AsyncIterator[Chunk]: ...`,
      hydrated: `# ============================================================================
# Tokonomics Hydrated Symbol: ModelGateway.calculate_backoff (Lines 52-69)
# Exact Byte Boundary Retrieval (0.22ms) | 100% Parameter Fidelity
# ============================================================================

def calculate_backoff(self, attempt: int, base_delay: float) -> float:
    if attempt <= 0:
        return 0.0
    factor = 2.0 ** min(attempt, 6)
    jitter = random.uniform(0.85, 1.15)
    delay = min(base_delay * factor * jitter, self.config.max_backoff_seconds)
    logger.debug(f"Computed exponential backoff: attempt={attempt}, delay={delay:.2f}s")
    return delay`,
      distilled: `[Tokonomics Execution Optimizer: Pytest Distillation (tiangolo/fastapi)]
============================= FAILURES =============================
_________________________ test_circuit_breaker _________________________
def test_circuit_breaker():
>   response = gateway.dispatch_prompt(payload)
E   CircuitBreakerError: Circuit open: 5 consecutive downstream timeouts
tests/test_gateway.py:42: CircuitBreakerError
=================== 1 failed, 24 passed in 0.42s ===================
100% traceback and assertion diagnostic preserved (-70.1% token bloat).`
    },
    compiler: {
      path: 'src/query/QueryCompiler.go',
      symbol: 'QueryCompiler.CompileQuery',
      framework: 'go',
      rawTok: 1640,
      skeletonTok: 285,
      hydratedTok: 460,
      distilledTok: 294,
      savedTok: 1180,
      reduction: '72.0%',
      distillReduction: '82.1%',
      skeleton: `type QueryCompiler struct {
    Catalog    *Catalog
    OptLevel   OptimizationTier
    MemoTable  map[uint64]*PlanNode
}

func NewQueryCompiler(cat *Catalog) *QueryCompiler { ... }

// [Tokonomics: Body hidden (31 lines, ~240 tokens). Expand with tokonomics_expand_symbol("src/query/QueryCompiler.go", "QueryCompiler.CompileQuery")]
func (qc *QueryCompiler) CompileQuery(sql string) (*ExecutionPlan, error) { ... }

// [Tokonomics: Body hidden (42 lines, ~310 tokens). Expand with tokonomics_expand_symbol("src/query/QueryCompiler.go", "QueryCompiler.OptimizeAST")]
func (qc *QueryCompiler) OptimizeAST(root *ASTNode) (*ASTNode, error) { ... }`,
      hydrated: `// ============================================================================
// Tokonomics Hydrated Symbol: QueryCompiler.CompileQuery (Lines 38-68)
// Exact Byte Boundary Retrieval (0.18ms) | 100% Parameter Fidelity
// ============================================================================

func (qc *QueryCompiler) CompileQuery(sql string) (*ExecutionPlan, error) {
    parsedAST, err := qc.Catalog.Parse(sql)
    if err != nil {
        return nil, fmt.Errorf("syntax validation failed: %w", err)
    }
    optimizedAST, err := qc.OptimizeAST(parsedAST)
    if err != nil {
        return nil, fmt.Errorf("logical rule optimization failed: %w", err)
    }
    hash := hashAST(optimizedAST)
    if cachedPlan, ok := qc.MemoTable[hash]; ok {
        return cachedPlan.ToExecutionPlan(), nil
    }
    plan := qc.generatePhysicalPlan(optimizedAST)
    qc.MemoTable[hash] = plan
    return plan.ToExecutionPlan(), nil
}`,
      distilled: `[Tokonomics Execution Optimizer: Go Test Distillation (kubernetes/kubernetes)]
--- FAIL: TestReconcileController (0.12s)
    controller_test.go:88: failed reconcile: expected pod phase 'Running', got 'Pending'
FAIL
FAIL    k8s.io/kubernetes/pkg/controller/node    0.412s
100% failure stack preserved. 18 passing benchmark subtests omitted (-82.1% tokens).`
    },
    jest: {
      path: 'facebook/jest (test-run.log)',
      symbol: 'PaymentGateway > should charge credit card',
      framework: 'jest',
      rawTok: 937,
      skeletonTok: 290,
      hydratedTok: 465,
      distilledTok: 465,
      savedTok: 472,
      reduction: '50.4%',
      distillReduction: '50.4%',
      skeleton: `// [Tokonomics: Test Runner Output Summary]
// Total Test Suites: 3 | Tests: 37 total (36 passed, 1 failed)
// Expand execution failure with tokonomics_distill_output("facebook/jest")`,
      hydrated: `FAIL src/__tests__/payment.test.ts (3.4s)
  ● PaymentGateway > should charge credit card with idempotency
    expect(received).toEqual(expected)
    - Expected: "CHARGED_SUCCESS"
    + Received: "IDEMPOTENCY_KEY_EXPIRED"
      at Object.<anonymous> (src/__tests__/payment.test.ts:88:21)`,
      distilled: `[Tokonomics Execution Optimizer: Jest Distillation (facebook/jest)]
FAIL src/__tests__/payment.test.ts (3.4s)
  ● PaymentGateway > should charge credit card with idempotency
    expect(received).toEqual(expected)
    - Expected: "CHARGED_SUCCESS"
    + Received: "IDEMPOTENCY_KEY_EXPIRED"
      at Object.<anonymous> (src/__tests__/payment.test.ts:88:21)

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 36 passed, 37 total
[Tokonomics: 36 passing tests & ANSI escape codes stripped | 100% assertion diff preserved (-50.4% tokens)]`
    },
    postgres: {
      path: 'supabase/postgrest (500_rows.json)',
      symbol: 'QueryResults[0..500]',
      framework: 'json',
      rawTok: 14336,
      skeletonTok: 350,
      hydratedTok: 735,
      distilledTok: 735,
      savedTok: 13601,
      reduction: '94.9%',
      distillReduction: '94.9%',
      skeleton: `// [Tokonomics: JSON Array (500 rows, 14,336 tokens)]
// Bound array with tokonomics_distill_output("supabase/postgrest")`,
      hydrated: `[
  { "id": 1, "user_id": "usr_9918", "status": "active", "balance": 4820.50 },
  { "id": 2, "user_id": "usr_9919", "status": "pending", "balance": 120.00 },
  ... [498 more records] ...
]`,
      distilled: `[Tokonomics Execution Optimizer: JSON Array Bounding (supabase/postgrest)]
[
  { "id": 1, "user_id": "usr_9918", "status": "active", "balance": 4820.50, "created_at": "2026-10-11T12:00:00Z" },
  { "id": 2, "user_id": "usr_9919", "status": "pending", "balance": 120.00, "created_at": "2026-10-11T12:05:00Z" },
  { "id": 3, "user_id": "usr_9920", "status": "active", "balance": 890.10, "created_at": "2026-10-11T12:08:00Z" },
  // ... [Tokonomics: 494 intermediate array elements omitted to preserve agent context. Head (3) & Tail (3) bounds retained] ...
  { "id": 498, "user_id": "usr_9988", "status": "active", "balance": 310.00, "created_at": "2026-10-11T15:40:00Z" },
  { "id": 499, "user_id": "usr_9989", "status": "failed", "balance": 0.00, "created_at": "2026-10-11T15:45:00Z" },
  { "id": 500, "user_id": "usr_9990", "status": "active", "balance": 1450.75, "created_at": "2026-10-11T15:50:00Z" }
]`
    }
  };

  const CONFIGS = {
    claude: 'claude mcp add tokonomics -- node ~/.vscode/extensions/tokonomics-ai/dist/mcp-server.js',
    cursor: `{\n  "mcpServers": {\n    "tokonomics": {\n      "command": "node",\n      "args": ["\${env:HOME}/.vscode/extensions/tokonomics-ai/dist/mcp-server.js"]\n    }\n  }\n}`,
    generic: `{\n  "mcpServers": {\n    "tokonomics": {\n      "command": "node",\n      "args": ["\${env:HOME}/.vscode/extensions/tokonomics-ai/dist/mcp-server.js"],\n      "env": {}\n    }\n  }\n}`
  };

  function updateActiveStep(step) {
    currentStep = step;
    if (stepSkeleton) stepSkeleton.classList.toggle('active', step === 'skeleton');
    if (stepHydrate) stepHydrate.classList.toggle('active', step === 'hydrate');
    if (stepBudget) stepBudget.classList.toggle('active', step === 'budget');
    if (stepDistill) stepDistill.classList.toggle('active', step === 'distill');

    const sc = SCENARIOS[currentFile];
    if (step === 'skeleton') {
      activeCallLbl.textContent = `tokonomics_read_skeleton(filePath: "${sc.path}")`;
    } else if (step === 'hydrate') {
      activeCallLbl.textContent = `tokonomics_expand_symbol(filePath: "${sc.path}", symbol: "${sc.symbol}")`;
    } else if (step === 'budget') {
      activeCallLbl.textContent = `tokonomics_budget_status()`;
    } else if (step === 'distill') {
      activeCallLbl.textContent = `tokonomics_distill_output(rawOutput: "${sc.path}", framework: "${sc.framework || 'auto'}")`;
    }
    renderAgentState();
  }

  function renderAgentState() {
    const sc = SCENARIOS[currentFile];
    requestId++;

    if (currentStep === 'skeleton') {
      latencyBadge.textContent = '0.38 ms';
      rpcTrace.innerHTML = `
<span style="color:#64748b;">// --- External Agent stdio Handshake ---</span>
<span style="color:#38bdf8;">--&gt; {"jsonrpc":"2.0","id":${requestId},"method":"tools/call","params":{"name":"tokonomics_read_skeleton","arguments":{"filePath":"${sc.path}"}}}</span>

<span style="color:#64748b;">// &lt;-- Tokonomics MCP JSON-RPC Response (0.38ms)</span>
<span style="color:#a7f3d0;">&lt;-- {"jsonrpc":"2.0","id":${requestId},"result":{"content":[{"type":"text","text":"[AST Skeleton Pruned: ${sc.rawTok} -&gt; ${sc.skeletonTok} tokens]"}]}}</span>
<span style="color:#c084fc;">✓ Progressive Disclosure Skeletons served with symbol hydration markers.</span>
`;
      contextHeader.textContent = `Agent Ingest Buffer: AST Skeleton (${sc.path})`;
      contextTokens.textContent = `${sc.skeletonTok} tokens (-${Math.round((1 - sc.skeletonTok / sc.rawTok) * 100)}%)`;
      contextView.textContent = sc.skeleton;
      statSaved.textContent = (sc.rawTok - sc.skeletonTok).toLocaleString();
      statReduction.textContent = `-${Math.round((1 - sc.skeletonTok / sc.rawTok) * 100)}%`;
      statFidelity.textContent = '100%';
      statParity.textContent = '100%';
    } else if (currentStep === 'hydrate') {
      latencyBadge.textContent = '0.19 ms';
      rpcTrace.innerHTML = `
<span style="color:#64748b;">// --- Agent Routine Inspection on Demand ---</span>
<span style="color:#38bdf8;">--&gt; {"jsonrpc":"2.0","id":${requestId},"method":"tools/call","params":{"name":"tokonomics_expand_symbol","arguments":{"filePath":"${sc.path}","symbol":"${sc.symbol}"}}}</span>

<span style="color:#64748b;">// &lt;-- Tokonomics Byte-Accurate Expansion (0.19ms)</span>
<span style="color:#a7f3d0;">&lt;-- {"jsonrpc":"2.0","id":${requestId},"result":{"content":[{"type":"text","text":"${sc.symbol} hydrated with 100% boundary fidelity"}]}}</span>
<span style="color:#10b981;">✓ Verbatim logic attached to working memory. Zero information lost.</span>
`;
      contextHeader.textContent = `Agent Working Memory: Hydrated ${sc.symbol}`;
      contextTokens.textContent = `${sc.hydratedTok} tokens (-${sc.reduction})`;
      contextView.textContent = sc.hydrated;
      statSaved.textContent = sc.savedTok.toLocaleString();
      statReduction.textContent = `-${sc.reduction}`;
      statFidelity.textContent = '100% Verbatim';
      statParity.textContent = '100%';
    } else if (currentStep === 'budget') {
      latencyBadge.textContent = '0.12 ms';
      rpcTrace.innerHTML = `
<span style="color:#64748b;">// --- Agent Autonomous Budget Query ---</span>
<span style="color:#38bdf8;">--&gt; {"jsonrpc":"2.0","id":${requestId},"method":"tools/call","params":{"name":"tokonomics_budget_status","arguments":{}}}</span>

<span style="color:#64748b;">// &lt;-- Live FinOps Telemetry Response (0.12ms)</span>
<span style="color:#a7f3d0;">&lt;-- {"jsonrpc":"2.0","id":${requestId},"result":{"content":[{"type":"text","text":"{\\"sessionTokensSaved\\":14200,\\"circuitBreakerTripped\\":false}"}]}}</span>
<span style="color:#38bdf8;">✓ Loop-breaker healthy: Turn burn velocity well under advisory threshold.</span>
`;
      contextHeader.textContent = `Agent Session FinOps & Cache Telemetry`;
      contextTokens.textContent = `Budget: OK (0.84 cache rate)`;
      contextView.textContent = `// ============================================================================
// Tokonomics Session Budget & Loop-Breaker Telemetry
// ============================================================================

{
  "activeTask": "tokonomics-v8.8-execution-optimizer",
  "sessionTokensSpent": 4820,
  "sessionTokensSaved": 14200,
  "tokensSavedPercentage": "74.6%",
  "estimatedAvoidedCostUSD": "$0.426",
  "monthlyBudgetLimitUSD": 50.00,
  "currentMonthlySpendUSD": 3.82,
  "circuitBreakerTripped": false,
  "promptCacheHitRate": 0.88,
  "promptPrefixAligned": true
}`;
      statSaved.textContent = '14,200';
      statReduction.textContent = '-74.6%';
      statFidelity.textContent = 'Verified';
      statParity.textContent = '100%';
    } else if (currentStep === 'distill') {
      latencyBadge.textContent = '0.21 ms';
      rpcTrace.innerHTML = `
<span style="color:#64748b;">// --- Execution Output Distillation Protocol ---</span>
<span style="color:#38bdf8;">--&gt; {"jsonrpc":"2.0","id":${requestId},"method":"tools/call","params":{"name":"tokonomics_distill_output","arguments":{"rawOutput":"${sc.path}","framework":"${sc.framework}"}}}</span>

<span style="color:#64748b;">// &lt;-- Tokonomics Distiller Response (0.21ms)</span>
<span style="color:#a7f3d0;">&lt;-- {"jsonrpc":"2.0","id":${requestId},"result":{"content":[{"type":"text","text":"[Distilled: ${sc.rawTok} -&gt; ${sc.distilledTok} tokens | -${sc.distillReduction || sc.reduction}]"}]}}</span>
<span style="color:#10b981;">✓ 100% failure diagnostics &amp; assertions preserved. Repetitive noise &amp; secrets redacted.</span>
`;
      contextHeader.textContent = `Agent Working Memory: Distilled Execution Output`;
      contextTokens.textContent = `${sc.distilledTok} tokens (-${sc.distillReduction || sc.reduction})`;
      contextView.textContent = sc.distilled;
      statSaved.textContent = (sc.rawTok - sc.distilledTok).toLocaleString();
      statReduction.textContent = `-${sc.distillReduction || sc.reduction}`;
      statFidelity.textContent = '100% Diagnostic';
      statParity.textContent = '100%';
    }
  }

  fileBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      fileBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFile = btn.getAttribute('data-file');
      if (currentFile === 'jest' || currentFile === 'postgres') {
        updateActiveStep('distill');
      } else {
        updateActiveStep(currentStep);
      }
    });
  });

  if (stepSkeleton) stepSkeleton.addEventListener('click', () => updateActiveStep('skeleton'));
  if (stepHydrate) stepHydrate.addEventListener('click', () => updateActiveStep('hydrate'));
  if (stepBudget) stepBudget.addEventListener('click', () => updateActiveStep('budget'));
  if (stepDistill) stepDistill.addEventListener('click', () => updateActiveStep('distill'));

  if (btnTrigger) {
    btnTrigger.addEventListener('click', () => {
      contextView.style.transition = 'background-color 0.3s';
      contextView.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
      setTimeout(() => { contextView.style.backgroundColor = ''; }, 300);
      renderAgentState();
    });
  }

  configTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      configTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-config');
      const val = CONFIGS[target] || CONFIGS.claude;
      if (configCode) configCode.textContent = val;
      if (btnCopyConfig) btnCopyConfig.setAttribute('data-copy', val);
    });
  });

  // Initial render
  updateActiveStep('skeleton');
}

// -------------------------------------------------------------------
// 9. Semantic Graph Slicing & Prefix Cache Pinning Simulator (v8.9.0)
// -------------------------------------------------------------------
function initSlicingSimulator() {
  const repoBtns = document.querySelectorAll('.slice-repo-btn');
  const providerBtns = document.querySelectorAll('.slice-provider-btn');
  const depthBtns = document.querySelectorAll('.slice-depth-btn');
  const padBoundaryCheck = document.getElementById('slice-pad-boundary');
  const sanitizeBustersCheck = document.getElementById('slice-sanitize-busters');

  const rawTitle = document.getElementById('slice-raw-title');
  const rawTokens = document.getElementById('slice-raw-tokens');
  const rawContent = document.getElementById('slice-raw-content');
  const optTitle = document.getElementById('slice-opt-title');
  const optTokens = document.getElementById('slice-opt-tokens');
  const optContent = document.getElementById('slice-opt-content');

  const hitBadge = document.getElementById('slice-hit-badge');
  const latencyBadge = document.getElementById('slice-latency-badge');
  const statSaved = document.getElementById('slice-stat-saved');
  const statPct = document.getElementById('slice-stat-pct');
  const statSha = document.getElementById('slice-stat-sha');
  const statInvariance = document.getElementById('slice-stat-invariance');

  if (!rawContent || !optContent) return;

  const REPO_DATA = {
    redux: {
      name: 'reduxjs/redux (TypeScript)',
      seed: 'createStore',
      rawTok: 1610,
      depths: {
        1: { tok: 340, pct: '78.9%', saved: 1270 },
        2: { tok: 282, pct: '82.5%', saved: 1328 },
        3: { tok: 410, pct: '74.5%', saved: 1200 }
      },
      latency: '0.34 ms',
      sha: '761cf67824190ba3d03822a1f49618b14e0bc983',
      rawCode: `// packages/redux/src/index.ts (Monolithic Bundle: 1,610 tokens)
import { createStore } from './createStore';
import { combineReducers } from './combineReducers';
import { bindActionCreators } from './bindActionCreators';
import { applyMiddleware } from './applyMiddleware';
import { compose } from './compose';
import { Action, Reducer, Store, Dispatch } from './types';
import { ActionTypes } from './actionTypes';

// [Unrelated: compose utility - 85 tokens]
export function compose(...funcs: Function[]) { /* ... */ }

// [Unrelated: applyMiddleware routine - 120 tokens]
export function applyMiddleware(...middlewares: any[]) { /* ... */ }

// [Unrelated: bindActionCreators helper - 110 tokens]
export function bindActionCreators(actionCreators: any, dispatch: Dispatch) { /* ... */ }

// [Unrelated: combineReducers mapper - 240 tokens]
export function combineReducers(reducers: any) { /* ... */ }

// [Target: createStore implementation - 282 tokens]
export function createStore<S, A extends Action>(reducer: Reducer<S, A>): Store<S, A> {
    let currentReducer = reducer;
    let currentState: S | undefined;
    let currentListeners: (() => void)[] = [];
    return {
        dispatch(action: A) { currentState = currentReducer(currentState, action); return action; },
        getState() { return currentState as S; },
        subscribe(listener: () => void) { currentListeners.push(listener); return () => {}; },
        replaceReducer(nextReducer: Reducer<S, A>) { currentReducer = nextReducer; return this; }
    };
}`,
      slicedCode: `// [Tokonomics Sliced Graph: createStore | 4 symbols | depth: 2]
// --- [INTERFACE] Action (packages/redux/src/types.ts:L2-L5, depth: 1) ---
export interface Action { type: string; payload?: any; }

// --- [TYPE] Reducer (packages/redux/src/types.ts:L7-L7, depth: 1) ---
export type Reducer<S = any, A extends Action = Action> = (state: S | undefined, action: A) => S;

// --- [INTERFACE] Store (packages/redux/src/types.ts:L11-L16, depth: 1) ---
export interface Store<S = any, A extends Action = Action> {
    dispatch: (action: A) => A;
    getState(): S;
    subscribe(listener: () => void): () => void;
    replaceReducer(nextReducer: Reducer<S, A>): Store<S, A>;
}

// --- [FUNCTION] createStore (packages/redux/src/createStore.ts:L30-L75, depth: 0) ---
export function createStore<S, A extends Action = Action>(reducer: Reducer<S, A>): Store<S, A> {
    let currentReducer = reducer;
    let currentState: S | undefined;
    let currentListeners: (() => void)[] = [];
    return {
        dispatch(action: A) { currentState = currentReducer(currentState, action); return action; },
        getState() { return currentState as S; },
        subscribe(listener: () => void) { currentListeners.push(listener); return () => {}; },
        replaceReducer(nextReducer: Reducer<S, A>) { currentReducer = nextReducer; return this; }
    };
}`
    },
    express: {
      name: 'expressjs/express (JavaScript)',
      seed: 'Layer.handle_request',
      rawTok: 1613,
      depths: {
        1: { tok: 520, pct: '67.8%', saved: 1093 },
        2: { tok: 468, pct: '71.0%', saved: 1145 },
        3: { tok: 590, pct: '63.4%', saved: 1023 }
      },
      latency: '0.24 ms',
      sha: '8a2e1d09bc417ea18b2c4e924a18d193ef14a821',
      rawCode: `// lib/express.js (Monolithic Bundle: 1,613 tokens)
const Router = require('./router/index');
const Route = require('./router/route');
const Layer = require('./router/layer');
const req = require('./request');
const res = require('./response');
const Application = require('./application');

// [Unrelated: Response prototype helpers - 350 tokens]
res.status = function status(code) { this.statusCode = code; return this; };
res.send = function send(body) { this.end(body); return this; };
res.json = function json(obj) { return this.send(JSON.stringify(obj)); };

// [Unrelated: Application factory & listen - 220 tokens]
function Application() { this._router = new Router(); }
Application.prototype.listen = function(...args) { /* ... */ };

// [Target: Layer dispatch pipeline - 468 tokens]
function Layer(path, options, fn) { this.handle = fn; this.name = fn.name; }
Layer.prototype.handle_request = function(req, res, next) {
    try { this.handle(req, res, next); }
    catch (err) { this.handle_error(err, req, res, next); }
};
Layer.prototype.handle_error = function(error, req, res, next) {
    if (this.handle.length !== 4) return next(error);
    this.handle(error, req, res, next);
};`,
      slicedCode: `// [Tokonomics Sliced Graph: handle_request | 3 symbols | depth: 2]
// --- [CONSTRUCTOR] Layer (lib/router/layer.js:L5-L15, depth: 1) ---
function Layer(path, options, fn) {
    if (!(this instanceof Layer)) return new Layer(path, options, fn);
    this.handle = fn;
    this.name = fn.name || '<anonymous>';
}

// --- [METHOD] Layer.prototype.handle_error (lib/router/layer.js:L28-L38, depth: 1) ---
Layer.prototype.handle_error = function handle_error(error, req, res, next) {
    const fn = this.handle;
    if (fn.length !== 4) return next(error);
    try { fn(error, req, res, next); } catch (err) { next(err); }
};

// --- [METHOD] Layer.prototype.handle_request (lib/router/layer.js:L16-L27, depth: 0) ---
Layer.prototype.handle_request = function handle_request(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try { fn(req, res, next); } catch (err) { this.handle_error(err, req, res, next); }
};`
    },
    fastapi: {
      name: 'tiangolo/fastapi (Python)',
      seed: 'solve_dependencies',
      rawTok: 1943,
      depths: {
        1: { tok: 610, pct: '68.6%', saved: 1333 },
        2: { tok: 515, pct: '73.5%', saved: 1428 },
        3: { tok: 670, pct: '65.5%', saved: 1273 }
      },
      latency: '0.40 ms',
      sha: '3c47e812fa9021e54db90ca118b6284f1a28cb01',
      rawCode: `# fastapi/main.py (Monolithic Bundle: 1,943 tokens)
from fastapi.routing import APIRouter
from fastapi.applications import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.dependencies.utils import solve_dependencies
from fastapi.dependencies.models import Dependant

# [Unrelated: JSON serialization encoder - 280 tokens]
def jsonable_encoder(obj, include=None, exclude=None):
    if isinstance(obj, dict): return {k: jsonable_encoder(v) for k, v in obj.items()}
    return str(obj)

# [Unrelated: Application ASGI runner - 310 tokens]
class FastAPI:
    def __init__(self, title="FastAPI"): self.router = APIRouter()
    async def __call__(self, scope, receive, send): await self.router(scope, receive, send)

# [Target: solve_dependencies resolver - 515 tokens]
async def solve_dependencies(dependant: Dependant, dependency_cache: dict, async_exit_stack: any):
    values, errors = {}, []
    for sub in dependant.dependencies:
        sub_values, sub_errors = await solve_dependencies(sub, dependency_cache, async_exit_stack)
        if sub_errors: errors.extend(sub_errors); continue
        values.update(sub_values)
    return values, errors`,
      slicedCode: `# [Tokonomics Sliced Graph: solve_dependencies | 3 symbols | depth: 2]
# --- [CLASS] Dependant (fastapi/dependencies/models.py:L5-L12, depth: 1) ---
class Dependant:
    def __init__(self, call=None, name: str = None):
        self.call = call
        self.name = name
        self.dependencies = []

# --- [FUNCTION] get_param_sub_dependant (fastapi/dependencies/utils.py:L7-L9, depth: 1) ---
def get_param_sub_dependant(param_name: str, depends: any) -> Dependant:
    return Dependant(call=depends.dependency, name=param_name)

# --- [FUNCTION] solve_dependencies (fastapi/dependencies/utils.py:L11-L32, depth: 0) ---
async def solve_dependencies(dependant: Dependant, dependency_cache: dict, async_exit_stack: any) -> tuple:
    values, errors = {}, []
    for sub in dependant.dependencies:
        sub_dep = get_param_sub_dependant(sub.name, sub)
        sub_values, sub_errors = await solve_dependencies(sub_dep, dependency_cache, async_exit_stack)
        if sub_errors: errors.extend(sub_errors); continue
        values.update(sub_values)
    return values, errors`
    },
    ripgrep: {
      name: 'BurntSushi/ripgrep (Rust / Go Pattern)',
      seed: 'SearchWorker',
      rawTok: 2662,
      depths: {
        1: { tok: 890, pct: '66.6%', saved: 1772 },
        2: { tok: 760, pct: '71.5%', saved: 1902 },
        3: { tok: 920, pct: '65.4%', saved: 1742 }
      },
      latency: '0.36 ms',
      sha: '992f02cb841265ea9b02a818c39fa41097e88210',
      rawCode: `// crates/core/search.rs (Monolithic Bundle: 2,662 tokens)
import { RegexMatcher, MatchResult } from '../matcher/regex';
import { SummaryPrinter } from '../printer/summary';
import { GlobFilter } from '../ignore/glob';
import { parseCliFlags } from './flags';
import { ApplicationRunner } from './app';

// [Unrelated: Glob filter engine - 340 tokens]
export class GlobFilter { /* ... */ }

// [Unrelated: CLI flags parser - 280 tokens]
export function parseCliFlags(args: string[]) { /* ... */ }

// [Unrelated: CLI App runner & Walker - 410 tokens]
export class ApplicationRunner { /* ... */ }

// [Target: SearchWorker regex coordinator - 760 tokens]
export class SearchWorker {
    private matcher: RegexMatcher;
    private printer: SummaryPrinter;
    constructor(matcher: RegexMatcher, printer: SummaryPrinter) {
        this.matcher = matcher;
        this.printer = printer;
    }
    public searchLine(path: string, line: string, lineNum: number): MatchResult | null {
        const match = this.matcher.findAt(line, 0);
        if (match) { this.printer.recordMatch(path, lineNum, line); return match; }
        return null;
    }
}`,
      slicedCode: `// [Tokonomics Sliced Graph: SearchWorker | 4 symbols | depth: 2]
// --- [INTERFACE] MatchResult (crates/matcher/regex.rs:L3-L7, depth: 1) ---
export interface MatchResult { start: number; end: number; matched: string; }

// --- [CLASS] RegexMatcher (crates/matcher/regex.rs:L9-L22, depth: 1) ---
export class RegexMatcher {
    private pattern: RegExp;
    constructor(pattern: string) { this.pattern = new RegExp(pattern); }
    public findAt(haystack: string, offset: number): MatchResult | null {
        const match = this.pattern.exec(haystack.slice(offset));
        if (!match) return null;
        return { start: offset + match.index, end: offset + match.index + match[0].length, matched: match[0] };
    }
}

// --- [CLASS] SummaryPrinter (crates/printer/summary.rs:L5-L16, depth: 1) ---
export class SummaryPrinter {
    public recordMatch(path: string, line: number, text: string): void {
        console.log(\`\${path}:\${line}:\${text}\`);
    }
}

// --- [CLASS] SearchWorker (crates/core/search.rs:L10-L38, depth: 0) ---
export class SearchWorker {
    private matcher: RegexMatcher;
    private printer: SummaryPrinter;
    constructor(matcher: RegexMatcher, printer: SummaryPrinter) {
        this.matcher = matcher;
        this.printer = printer;
    }
    public searchLine(path: string, line: string, lineNum: number): MatchResult | null {
        const match = this.matcher.findAt(line, 0);
        if (match) { this.printer.recordMatch(path, lineNum, line); return match; }
        return null;
    }
}`
    },
    react: {
      name: 'facebook/react (TypeScript / JS)',
      seed: 'createFiber',
      rawTok: 785,
      depths: {
        1: { tok: 110, pct: '86.0%', saved: 675 },
        2: { tok: 75, pct: '90.4%', saved: 710 },
        3: { tok: 140, pct: '82.2%', saved: 645 }
      },
      latency: '0.12 ms',
      sha: '54d89a77ef31201948ba28c31e9a440182618e47',
      rawCode: `// packages/react-reconciler/src/ReactFiber.ts (Monolithic Bundle: 785 tokens)
import { FiberNode, WorkTag, FiberFlags } from './types';
import { scheduleUpdateOnFiber } from './ReactFiberWorkLoop';
import { commitMutationEffects } from './ReactFiberCommitWork';

// [Unrelated: commit phase effects scheduler - 210 tokens]
export function commitMutationEffects(root: any) { /* ... */ }

// [Unrelated: fiber work loop update scheduler - 280 tokens]
export function scheduleUpdateOnFiber(fiber: any) { /* ... */ }

// [Target: createFiber reconciler factory - 75 tokens]
export function createFiber(tag: WorkTag, pendingProps: any, key: null | string): FiberNode {
    return { tag, key, pendingProps, memoizedProps: null, memoizedState: null, flags: 0 };
}`,
      slicedCode: `// [Tokonomics Sliced Graph: createFiber | 2 symbols | depth: 2]
// --- [TYPE] WorkTag (packages/react-reconciler/src/types.ts:L3-L3, depth: 1) ---
export type WorkTag = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// --- [FUNCTION] createFiber (packages/react-reconciler/src/ReactFiber.ts:L15-L25, depth: 0) ---
export function createFiber(tag: WorkTag, pendingProps: any, key: null | string): FiberNode {
    return { tag, key, pendingProps, memoizedProps: null, memoizedState: null, flags: 0 };
}`
    }
  };

  let activeRepo = 'redux';
  let activeProvider = 'anthropic';
  let activeDepth = 2;

  function renderSlicingView() {
    const data = REPO_DATA[activeRepo] || REPO_DATA.redux;
    const depthInfo = data.depths[activeDepth] || data.depths[2];

    rawTitle.textContent = `Raw Bundle: ${data.name}`;
    rawTokens.textContent = `${data.rawTok.toLocaleString()} tokens`;
    rawContent.textContent = data.rawCode;

    optTitle.textContent = `Tokonomics Sliced Graph & Pinned Prefix (Depth ${activeDepth})`;
    optTokens.textContent = `${depthInfo.tok} tokens (-${depthInfo.pct})`;

    let envelopeHeader = '';
    if (activeProvider === 'anthropic') {
      envelopeHeader = `// ============================================================================
// Anthropic Prompt Envelope [cache_control: { type: "ephemeral" }]
// ============================================================================
// Tier 1: Static System Anchor (100% Invariant)
// Tier 2: Canonically Sorted Tools (8 active tools sorted A-Z)
// Tier 3: Bounded AST Code Slices (${data.seed})
`;
    } else if (activeProvider === 'gemini') {
      envelopeHeader = `// ============================================================================
// Google Gemini Context Caching Envelope (Deterministic Prefix Block)
// ============================================================================
// Cached Prefix Token Blocks: 1,024 Aligned
`;
    } else {
      envelopeHeader = `// ============================================================================
// OpenAI Prompt Cache Pinned Prefix (Exact Deterministic Tokens)
// ============================================================================
`;
    }

    let fillerNote = '';
    if (padBoundaryCheck && padBoundaryCheck.checked) {
      fillerNote = `\n// [Tokonomics 1024-Boundary Padding: Aligned to exact multiple of 1,024 tokens]\n`;
    }

    optContent.textContent = envelopeHeader + data.slicedCode + fillerNote;

    statSaved.textContent = depthInfo.saved.toLocaleString();
    statPct.textContent = `-${depthInfo.pct}`;
    statSha.textContent = data.sha.slice(0, 12) + '...';
    latencyBadge.textContent = `${data.latency} mean`;

    if (hitBadge) {
      hitBadge.textContent = '⚡ Cache Hit: GUARANTEED';
      hitBadge.className = 'savings-pill green';
    }
    if (statInvariance) {
      statInvariance.textContent = '100% Invariant';
    }
  }

  repoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      repoBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRepo = btn.getAttribute('data-repo') || 'redux';
      renderSlicingView();
    });
  });

  providerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      providerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeProvider = btn.getAttribute('data-provider') || 'anthropic';
      renderSlicingView();
    });
  });

  depthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      depthBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDepth = parseInt(btn.getAttribute('data-depth') || '2', 10);
      renderSlicingView();
    });
  });

  if (padBoundaryCheck) padBoundaryCheck.addEventListener('change', renderSlicingView);
  if (sanitizeBustersCheck) sanitizeBustersCheck.addEventListener('change', renderSlicingView);

  // Initial render
  renderSlicingView();
}

