// ===================================================================
// Tokonomics Documentation & Interactive Walkthrough Logic
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCopyButtons();
  initStudio();
  initCommandPalette();
  initCockpitSimulator();
  initBenchmarkTabs();
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
