// ===================================================================
// Tokonomics Documentation & Interactive Walkthrough Logic
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCopyButtons();
  initSimulator();
  initCommandPalette();
});

// -------------------------------------------------------------------
// 1. Tab Switching Logic for Step-by-Step Guide
// -------------------------------------------------------------------
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
// 3. Interactive Context Compiler & AST Simulator
// -------------------------------------------------------------------
const CODE_SAMPLES = {
  ts: {
    original: `import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TokenOptimizerLedger, AccountingTruth } from '../finops/ledger';
import { SecuritySanitizer } from '../security/sanitizer';

export interface RouteConfig {
  prefix: string;
  enableTelemetry: boolean;
  maxTurnLimit?: number;
}

export class AuthenticationGatewayController {
  private ledger: TokenOptimizerLedger;
  private config: RouteConfig;

  constructor(ledger: TokenOptimizerLedger, config: RouteConfig) {
    this.ledger = ledger;
    this.config = config;
  }

  /** Validate inbound bearer token, audit rate limits, and record turn */
  public async handleInboundTokenRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Unauthorized: Missing or malformed bearer token' });
      return;
    }

    const rawToken = authHeader.split(' ')[1];
    const sanitized = SecuritySanitizer.sanitizeSecrets(rawToken);
    
    // Expensive authorization verification logic
    const claims = await this.verifyJwtWithIssuer(sanitized.sanitized);
    if (!claims.isValid) {
      this.ledger.recordRejection('INVALID_TOKEN', claims.reason);
      reply.status(403).send({ error: 'Forbidden: Token expired or invalid issuer' });
      return;
    }

    // Heavy session accounting calculations
    const turnCost = AccountingTruth.computeTurnEconomics(claims.tier, claims.quota);
    await this.ledger.commitSpend(claims.tenantId, turnCost);

    reply.status(200).send({ status: 'authenticated', tenant: claims.tenantId, quotaRemaining: turnCost.remaining });
  }

  private async verifyJwtWithIssuer(token: string): Promise<{ isValid: boolean; tenantId: string; tier: string; quota: number; reason?: string }> {
    // 60 lines of cryptographic verification and keystore lookups
    return { isValid: true, tenantId: 'tenant_enterprise_402', tier: 'PRO_ENTERPRISE', quota: 50000 };
  }
}`,
    pruned: `import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TokenOptimizerLedger, AccountingTruth } from '../finops/ledger';

export interface RouteConfig {
  prefix: string;
  enableTelemetry: boolean;
  maxTurnLimit?: number;
}

export class AuthenticationGatewayController {
  private ledger: TokenOptimizerLedger;
  private config: RouteConfig;
  constructor(ledger: TokenOptimizerLedger, config: RouteConfig);

  /** Validate inbound bearer token, audit rate limits, and record turn */
  public async handleInboundTokenRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Guard block preserved
    if (!authHeader || !authHeader.startsWith('Bearer ')) { /* ... */ }
    // [Tokonomics AST Sliced: 28 lines of inner token verification & reply dispatch omitted]
  }

  private async verifyJwtWithIssuer(token: string): Promise<{ isValid: boolean; tenantId: string; tier: string; quota: number; reason?: string }>;
}`
  },
  py: {
    original: `from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import hashlib
import time

class ModelGenerationPayload(BaseModel):
    model_name: str
    messages: List[Dict[str, str]]
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: Optional[int] = None

class ContextCompilationEngine:
    """Manages high-throughput prompt compression and AST pruning."""
    def __init__(self, workspace_path: str, max_cache_mb: int = 512):
        self.workspace_path = workspace_path
        self.max_cache_mb = max_cache_mb
        self.cache = {}

    def compute_sha256_digest(self, payload: str) -> str:
        """Calculate fast SHA-256 fingerprint for KV cache continuity."""
        hasher = hashlib.sha256()
        hasher.update(payload.encode('utf-8'))
        return hasher.hexdigest()

    def compile_workspace_context(self, files: List[str], target_budget: int) -> Dict[str, Any]:
        """Perform knapsack dynamic programming over symbol dependencies."""
        start_time = time.perf_counter()
        selected_evidence = []
        accumulated_tokens = 0
        
        for file_path in files:
            # 50 lines of AST tree traversal, token counting, and symbol extraction
            pass

        return {
            "status": "success",
            "evidence": selected_evidence,
            "latency_ms": (time.perf_counter() - start_time) * 1000
        }`,
    pruned: `from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

class ModelGenerationPayload(BaseModel):
    model_name: str
    messages: List[Dict[str, str]]
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: Optional[int] = None

class ContextCompilationEngine:
    """Manages high-throughput prompt compression and AST pruning."""
    def __init__(self, workspace_path: str, max_cache_mb: int = 512): ...

    def compute_sha256_digest(self, payload: str) -> str: ...

    def compile_workspace_context(self, files: List[str], target_budget: int) -> Dict[str, Any]:
        # [Tokonomics AST Sliced: 22 lines of knapsack symbol extraction omitted]
        ...`
  },
  go: {
    original: `package compiler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
)

type WorkspaceIndex struct {
	mu        sync.RWMutex
	roots     []string
	fileMap   map[string][]byte
	isTrusted bool
}

func NewWorkspaceIndex(roots []string, trusted bool) *WorkspaceIndex {
	return &WorkspaceIndex{
		roots:     roots,
		fileMap:   make(map[string][]byte),
		isTrusted: trusted,
	}
}

// ExtractExactSymbols scans the syntax tree and identifies candidate symbols
func (w *WorkspaceIndex) ExtractExactSymbols(ctx context.Context, filePath string) ([]string, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if !w.isTrusted {
		return nil, errors.New("restricted workspace: indexing disabled")
	}

	// 40 lines of parser grammar traversal, symbol mapping and type resolution
	data, ok := w.fileMap[filePath]
	if !ok {
		return nil, errors.New("file not found in active snapshot")
	}

	hasher := sha256.New()
	hasher.Write(data)
	fingerprint := hex.EncodeToString(hasher.Sum(nil))

	return []string{fingerprint}, nil
}`,
    pruned: `package compiler

import (
	"context"
	"sync"
)

type WorkspaceIndex struct {
	mu        sync.RWMutex
	roots     []string
	fileMap   map[string][]byte
	isTrusted bool
}

func NewWorkspaceIndex(roots []string, trusted bool) *WorkspaceIndex;

// ExtractExactSymbols scans the syntax tree and identifies candidate symbols
func (w *WorkspaceIndex) ExtractExactSymbols(ctx context.Context, filePath string) ([]string, error) {
	if !w.isTrusted {
		return nil, errors.New("restricted workspace: indexing disabled")
	}
	// [Tokonomics AST Sliced: 24 lines of inner parsing & hashing omitted]
}`
  }
};

function estimateTokens(text) {
  // Approximate BPE tokenizer calculation (~3.8 chars per token for code)
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

function initSimulator() {
  const langSelect = document.getElementById('lang-select');
  const inputCode = document.getElementById('input-code');
  const outputCode = document.getElementById('output-code').querySelector('code');
  const originalTokensBadge = document.getElementById('original-tokens');
  const prunedTokensBadge = document.getElementById('pruned-tokens');
  const btnRun = document.getElementById('btn-run-simulation');
  const statSaved = document.getElementById('stat-saved');
  const statPct = document.getElementById('stat-pct');

  function updateLanguage() {
    const lang = langSelect.value;
    const sample = CODE_SAMPLES[lang];
    if (sample) {
      inputCode.value = sample.original;
      outputCode.textContent = sample.pruned;
      recompute();
    }
  }

  function recompute() {
    const origText = inputCode.value;
    const prunedText = outputCode.textContent;

    const origTokens = estimateTokens(origText);
    const prunedTokens = estimateTokens(prunedText);
    const saved = Math.max(0, origTokens - prunedTokens);
    const pct = origTokens > 0 ? ((saved / origTokens) * 100).toFixed(1) : 0;

    originalTokensBadge.textContent = `${origTokens} tokens`;
    prunedTokensBadge.textContent = `${prunedTokens} tokens (-${pct}%)`;

    statSaved.textContent = saved;
    statPct.textContent = `${pct}%`;
  }

  langSelect.addEventListener('change', updateLanguage);
  inputCode.addEventListener('input', recompute);
  btnRun.addEventListener('click', () => {
    btnRun.textContent = 'Compiling...';
    btnRun.style.opacity = '0.7';
    setTimeout(() => {
      btnRun.textContent = 'Context Compiled!';
      btnRun.style.opacity = '1';
      setTimeout(() => {
        btnRun.textContent = 'Compile Context (Simulate AST Pruning)';
      }, 1500);
    }, 300);
  });

  // Initial load
  updateLanguage();
}

// -------------------------------------------------------------------
// 4. Command Palette Cheatsheet with Live Search
// -------------------------------------------------------------------
const COMMAND_DATABASE = [
  {
    cmd: 'Tokonomics: Run First Context Check',
    category: 'Insights',
    desc: 'Starts the guided 5-step local onboarding check. Estimates active editor context without sending prompts.'
  },
  {
    cmd: 'Tokonomics: Run Context X-Ray',
    category: 'Insights',
    desc: 'Analyzes one immutable workspace-index snapshot to rank context-heavy files and potential reductions.'
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
