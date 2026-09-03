/**
 * Tokonomics 6.0 dashboard webview
 * 
 * Complete implementation of the Tokonomics Real-Time Dashboard Specification:
 *   - 100% Event-Driven Live Streaming (No polling)
 *   - Multi-Window Executive Summary (Session, Today, 7 Days, Lifetime)
 *   - Live Active Prompt Pulse Card (OPTIMIZING -> OPTIMIZED -> ACTUAL RECONCILED)
 *   - Live Dynamic SVG Token & Cost Efficiency Stream Charts
 *   - Evidence-backed stage token waterfall and request-level cost status
 *   - Live Prompt Ledger Table with instant event row insertion
 *   - Deep Optimization Inspector Modal (Intent, Retrieved/Excluded Evidence, CQ breakdown, Stage Deltas)
 *   - Side-by-Side Diff Trigger & Active File Audit
 *   - Strict Zero-Telemetry Local Execution
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MetricsTracker } from '../metrics/tracker';
import { AstPrunerEngine } from '../ast/pruner';
import { TokenCounter } from '../engine/tokenizer';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';
import { DashboardController } from './dashboardController';
import { LiveMetricsAggregator, MetricTimeWindow } from '../metrics/liveAggregator';
import { RequestLedger } from '../events/requestLedger';
import { AggregateMetricsSummary } from '../metrics/liveAggregator';
import { PromptOptimizationEvent } from '../events/optimizationEvent';

export interface WorkspaceScanResult {
    totalFiles: number;
    totalRawTokens: number;
    totalPrunedTokens: number;
    potentialSavingsPercentage: number;
    durationMs: number;
}

export interface ActiveFileDiagnosis {
    fileName: string;
    relPath: string;
    fullPath?: string;
    language: string;
    lineCount: number;
    originalTokens: number;
    prunedTokens: number;
    reductionPercentage: number;
    durationMs: number;
}

export class DashboardWebviewPanel {
    public static currentPanel: DashboardWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private cachedWorkspaceScan: WorkspaceScanResult | null = null;
    private lastActiveDocUri: vscode.Uri | undefined;
    private cachedDiagnosis?: { key: string; value: ActiveFileDiagnosis };

    private constructor(
        panel: vscode.WebviewPanel, 
        private metricsTracker: MetricsTracker,
        private astEngine?: AstPrunerEngine,
        initialDocUri?: vscode.Uri
    ) {
        this.panel = panel;
        this.lastActiveDocUri = initialDocUri;

        const unregister = DashboardController.getInstance().registerWebview(this.panel.webview);
        this.disposables.push({ dispose: unregister });

        this.updateContent();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document && !editor.document.isUntitled) {
                this.lastActiveDocUri = editor.document.uri;
            }
            if (this.panel.visible) {
                this.updateContent();
            }
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'resetMetrics') {
                this.metricsTracker.reset();
                RequestLedger.getInstance().clear();
                LiveMetricsAggregator.getInstance().resetSession();
                this.cachedWorkspaceScan = null;
                this.updateContent();
                vscode.window.showInformationMessage('Tokonomics metrics have been reset.');
            } else if (message.command === 'exportAuditLog') {
                const ledger = RequestLedger.getInstance();
                const data = JSON.stringify({
                    schema: 'tokonomics.dashboard-export.v1',
                    exportedAt: Date.now(),
                    summary: LiveMetricsAggregator.getInstance().getAggregateSummary('lifetime'),
                    requests: ledger.getLatestRequestEvents().map(event => ledger.getDecisionTrace(event.id))
                }, null, 2);
                const doc = await vscode.workspace.openTextDocument({ content: data, language: 'json' });
                await vscode.window.showTextDocument(doc);
            } else if (message.command === 'comparePrunedDiff') {
                vscode.commands.executeCommand('tokenOptimizer.comparePrunedDiff');
            } else if (message.command === 'optimizeActiveFile') {
                const diagnosis = this.diagnoseActiveFile();
                if (!diagnosis) {
                    vscode.window.showWarningMessage('No source file found in workspace to optimize.');
                    return;
                }

                let codeText = '';
                let lang = diagnosis.language;

                if (diagnosis.fullPath && fs.existsSync(diagnosis.fullPath)) {
                    try {
                        codeText = fs.readFileSync(diagnosis.fullPath, 'utf8');
                    } catch {}
                }

                if (!codeText) {
                    const activeDoc = vscode.window.activeTextEditor?.document;
                    if (activeDoc) {
                        codeText = activeDoc.getText();
                        lang = activeDoc.languageId;
                    }
                }

                if (!codeText || codeText.trim().length === 0) {
                    vscode.window.showWarningMessage('Unable to read source code for optimization.');
                    return;
                }

                const origTokens = TokenCounter.countTokens(codeText);
                const engine = this.astEngine || new AstPrunerEngine();
                const pruneResult = engine.pruneCodeContext(codeText, lang);

                await vscode.env.clipboard.writeText(pruneResult.prunedCode);

                this.metricsTracker.recordOptimization(
                    origTokens,
                    pruneResult.prunedTokenCount,
                    {
                        astSaved: origTokens - pruneResult.prunedTokenCount,
                        textCompressionSaved: 0,
                        historyCompacted: 0,
                        cacheAligned: pruneResult.prunedTokenCount >= 1024 ? pruneResult.prunedTokenCount : 0
                    },
                    'auto',
                    undefined,
                    lang
                );

                this.updateContent();
                vscode.window.showInformationMessage(
                    `⚡ Optimized "${diagnosis.fileName}": Reduced ${origTokens.toLocaleString()} ➔ ${pruneResult.prunedTokenCount.toLocaleString()} tokens (${pruneResult.reductionPercentage}% saved in ${pruneResult.durationMs}ms)! Pruned skeleton copied to clipboard.`
                );
            } else if (message.command === 'scanWorkspace') {
                this.cachedWorkspaceScan = await this.performWorkspaceScan();
                this.updateContent();
                vscode.window.showInformationMessage(`Workspace scan complete: ${this.cachedWorkspaceScan.totalFiles} files audited.`);
            }
        }, null, this.disposables);
    }

    public static createOrShow(metricsTracker: MetricsTracker, astEngine?: AstPrunerEngine) {
        const activeEditor = vscode.window.activeTextEditor;
        const initialDocUri = activeEditor?.document?.uri;
        const column = activeEditor ? activeEditor.viewColumn : undefined;

        if (DashboardWebviewPanel.currentPanel) {
            DashboardWebviewPanel.currentPanel.panel.reveal(column);
            if (initialDocUri) {
                DashboardWebviewPanel.currentPanel.lastActiveDocUri = initialDocUri;
            }
            DashboardWebviewPanel.currentPanel.updateContent();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'tokenOptimizerDashboard',
            'Tokonomics 6.0 — Activity Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DashboardWebviewPanel.currentPanel = new DashboardWebviewPanel(panel, metricsTracker, astEngine, initialDocUri);
    }

    public updateContent() {
        const activeFileDiagnosis = this.diagnoseActiveFile();

        const summary = LiveMetricsAggregator.getInstance().getAggregateSummary('session');
        const recentEvents = LiveMetricsAggregator.getInstance().getRecentEvents(50);

        this.panel.webview.html = this.getHtml(summary, recentEvents, activeFileDiagnosis, this.cachedWorkspaceScan);
    }

    private diagnoseActiveFile(): ActiveFileDiagnosis | null {
        let doc = vscode.window.activeTextEditor?.document;
        if (!doc) {
            const visible = vscode.window.visibleTextEditors.find(e => e.document && !e.document.isUntitled && !e.document.uri.scheme.includes('output'));
            if (visible) doc = visible.document;
        }

        let text = doc?.getText();
        let lang = doc?.languageId || 'typescript';
        let lineCount = doc?.lineCount || 0;
        let filePath = doc?.fileName || '';
        const documentKey = doc ? `${doc.uri.toString()}:${doc.version}` : undefined;
        if (documentKey && this.cachedDiagnosis?.key === documentKey) return this.cachedDiagnosis.value;

        if ((!text || text.trim().length === 0) && this.lastActiveDocUri && fs.existsSync(this.lastActiveDocUri.fsPath)) {
            try {
                filePath = this.lastActiveDocUri.fsPath;
                text = fs.readFileSync(filePath, 'utf8');
                lineCount = text.split('\n').length;
                const ext = path.extname(filePath).replace('.', '');
                lang = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : ext === 'py' ? 'python' : ext;
            } catch {}
        }

        if (!text || text.trim().length === 0) return null;

        const origTokens = TokenCounter.countTokens(text);
        const engine = this.astEngine || new AstPrunerEngine();
        const pruneResult = engine.pruneCodeContext(text, lang);

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const relPath = workspaceRoot && filePath ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/') : path.basename(filePath || 'source.ts');

        const diagnosis = {
            fileName: path.basename(filePath || 'source.ts'),
            relPath,
            fullPath: filePath,
            language: lang,
            lineCount,
            originalTokens: origTokens,
            prunedTokens: pruneResult.prunedTokenCount,
            reductionPercentage: pruneResult.reductionPercentage,
            durationMs: pruneResult.durationMs
        };
        if (documentKey) this.cachedDiagnosis = { key: documentKey, value: diagnosis };
        return diagnosis;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private async performWorkspaceScan(): Promise<WorkspaceScanResult> {
        const startTime = Date.now();
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || !fs.existsSync(root)) {
            return { totalFiles: 0, totalRawTokens: 0, totalPrunedTokens: 0, potentialSavingsPercentage: 0, durationMs: 0 };
        }

        const ignoreFilter = new TokenIgnoreFilter(root);
        const engine = this.astEngine || new AstPrunerEngine();
        const allowedExts = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.php', '.sql'];

        let totalFiles = 0;
        let totalRawTokens = 0;
        let totalPrunedTokens = 0;

        const directories = [root];
        while (directories.length > 0 && totalFiles < 50) {
            const dir = directories.pop()!;
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (totalFiles >= 50) break;
                    const full = path.join(dir, entry.name);
                    const rel = path.relative(root, full).replace(/\\/g, '/');
                    if (entry.isDirectory()) {
                        if (!ignoreFilter.isIgnored(rel + '/')) {
                            directories.push(full);
                        }
                    } else if (entry.isFile()) {
                        if (!ignoreFilter.isIgnored(rel)) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (allowedExts.includes(ext)) {
                                try {
                                    const stat = await fs.promises.stat(full);
                                    if (stat.size > 500 * 1024) continue; // Skip files > 500KB for UI responsiveness
                                    const content = await fs.promises.readFile(full, 'utf8');
                                    const count = TokenCounter.countTokens(content);
                                    totalRawTokens += count;
                                    const pruned = engine.pruneCodeContext(content, ext.replace('.', ''));
                                    totalPrunedTokens += pruned.prunedTokenCount;
                                    totalFiles++;
                                } catch {}
                            }
                        }
                    }
                }
            } catch {}
            await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        const saved = totalRawTokens - totalPrunedTokens;
        const pct = totalRawTokens > 0 ? Math.round((saved / totalRawTokens) * 100) : 0;
        return {
            totalFiles,
            totalRawTokens,
            totalPrunedTokens,
            potentialSavingsPercentage: pct,
            durationMs: Date.now() - startTime
        };
    }

    private escapeHtml(str: any): string {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private serializeForScript(value: unknown): string {
        return JSON.stringify(value)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    private getHtml(
        summary: AggregateMetricsSummary,
        recentEvents: PromptOptimizationEvent[],
        activeFile: ActiveFileDiagnosis | null,
        workspaceScan: WorkspaceScanResult | null
    ): string {
        const latestEvent = recentEvents[recentEvents.length - 1];
        const nonce = this.getNonce();
        const money = (value: number | null | undefined, projected = false) => value === null || value === undefined
            ? 'Unavailable' : `${projected ? '~' : ''}$${value.toFixed(4)}`;
        const metric = (value: number | null | undefined, suffix: string) => value === null || value === undefined
            ? 'Unavailable' : `${value}${suffix}`;
        const stageWaterfall = latestEvent?.stageMetrics?.length
            ? latestEvent.stageMetrics.map(stage => {
                const percentage = stage.tokensBefore > 0 ? Math.max(0, Math.min(100, (stage.tokensSaved / stage.tokensBefore) * 100)) : 0;
                return `<div class="waterfall-bar"><span>${this.escapeHtml(stage.stageName)}</span><div class="waterfall-fill-container"><div class="waterfall-fill" style="width: ${percentage.toFixed(1)}%; background: var(--cyan);"></div></div><strong style="color: var(--cyan);">-${this.escapeHtml(stage.tokensSaved)} tokens</strong></div>`;
            }).join('')
            : '<div class="card-sub">Unavailable — no stage metrics have been recorded.</div>';
        const costEvidence = latestEvent?.costStatus === 'reconciled'
            ? `<div class="card-sub">Provider-reconciled request savings: ${money(latestEvent.actualSavingsUSD)}. Per-stage financial attribution is unavailable.</div>`
            : latestEvent?.costStatus === 'projected'
                ? `<div class="card-sub">Projected request savings: ${money(latestEvent.projectedSavingsUSD, true)}. Per-stage financial attribution is unavailable.</div>`
                : '<div class="card-sub">Cost unavailable — no verified usage or versioned price is attached to this request.</div>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: https:; font-src https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tokonomics 6.0 Dashboard</title>
    <style>
        :root {
            --bg-primary: #0a0e14;
            --bg-card: rgba(22, 27, 34, 0.85);
            --border: #30363d;
            --border-highlight: #388bfd;
            --cyan: #00f0ff;
            --green: #2ea043;
            --purple: #a371f7;
            --orange: #f0883e;
            --red: #f85149;
            --text-primary: #f0f6fc;
            --text-muted: #8b949e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body { background: var(--bg-primary); color: var(--text-primary); padding: 20px; font-size: 13px; }
        
        /* Header */
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
        .title-area { display: flex; align-items: center; gap: 14px; }
        .title { font-size: 18px; font-weight: 700; color: var(--cyan); letter-spacing: -0.5px; }
        .window-selector { display: flex; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 6px; padding: 2px; }
        .window-btn { background: transparent; border: none; color: var(--text-muted); padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 4px; transition: all 0.15s; }
        .window-btn.active { background: #1f6feb; color: #fff; }

        .actions { display: flex; gap: 8px; }
        button.btn-action { background: #21262d; border: 1px solid var(--border); color: var(--text-primary); padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        button.btn-action:hover { background: #30363d; }
        button.btn-primary { background: #238636; border-color: rgba(240,246,252,0.1); color: #fff; }
        button.btn-primary:hover { background: #2ea043; }

        /* Quick Guide Tip Banner */
        .guide-banner { background: rgba(31, 111, 235, 0.12); border: 1px solid rgba(56, 139, 253, 0.35); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; }
        .guide-title { font-weight: 700; color: var(--cyan); margin-bottom: 4px; }

        /* Executive Cards */
        .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
        .card-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 4px; }
        .card-val { font-size: 24px; font-weight: 700; }
        .card-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

        /* Active Prompt Pulse Card */
        .pulse-card { background: rgba(13, 17, 23, 0.9); border: 1px solid var(--border-highlight); border-radius: 8px; padding: 14px; margin-bottom: 18px; box-shadow: 0 0 15px rgba(56, 139, 253, 0.15); }
        .pulse-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .badge-status { padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .badge-reconciled { background: rgba(46, 160, 67, 0.2); color: var(--green); border: 1px solid var(--green); }
        .badge-estimated { background: rgba(240, 136, 62, 0.2); color: var(--orange); border: 1px solid var(--orange); }
        .badge-optimizing { background: rgba(0, 240, 255, 0.2); color: var(--cyan); border: 1px solid var(--cyan); }

        .pulse-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; font-size: 12px; }
        .pulse-item { background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 6px; }
        .pulse-label { color: var(--text-muted); font-size: 10px; margin-bottom: 2px; }
        .pulse-val { font-weight: 700; color: #fff; }

        /* Dual Section Grid */
        .dual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
        .section-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
        .section-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; color: var(--text-primary); }

        /* SVG Live Charts */
        .chart-container { width: 100%; height: 120px; position: relative; margin-top: 6px; }
        svg.live-chart { width: 100%; height: 100%; overflow: visible; }

        /* Waterfalls */
        .waterfall-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; }
        .waterfall-fill-container { flex: 1; margin: 0 10px; background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden; }
        .waterfall-fill { height: 100%; border-radius: 3px; }

        /* Ledger Table */
        .ledger-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
        .ledger-table th { padding: 8px; color: var(--text-muted); border-bottom: 1px solid var(--border); font-weight: 600; }
        .ledger-table td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; }
        .ledger-table tr:hover { background: rgba(56, 139, 253, 0.08); }

        /* Modal Inspector */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center; }
        .modal-content { background: #161b22; border: 1px solid var(--border-highlight); border-radius: 8px; width: 75%; max-height: 85vh; padding: 22px; overflow-y: auto; color: #fff; }
        .modal-close { float: right; cursor: pointer; color: var(--text-muted); font-size: 20px; font-weight: 700; }
        .inspector-section { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-family: monospace; font-size: 11px; }
        .inspector-title { color: var(--cyan); font-weight: 700; margin-bottom: 6px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title-area">
            <div class="title">TOKONOMICS 6.0: ACTIVITY DASHBOARD</div>
            <div class="window-selector">
                <button class="window-btn active" data-window="session">Session</button>
                <button class="window-btn" data-window="today">Today</button>
                <button class="window-btn" data-window="7_days">7 Days</button>
                <button class="window-btn" data-window="lifetime">Lifetime</button>
            </div>
        </div>
        <div class="actions">
            <button id="btnOptimizeActive" class="btn-action btn-primary">⚡ Optimize Active File</button>
            <button id="btnCompareDiff" class="btn-action">🔍 Side-by-Side Diff</button>
            <button id="btnScanWorkspace" class="btn-action">🔄 Audit Workspace</button>
            <button id="btnExport" class="btn-action">Export Audit</button>
            <button id="btnReset" class="btn-action">Reset</button>
        </div>
    </div>

    <!-- Quick Guide Tip Banner -->
    <div class="guide-banner">
        <div class="guide-title">How to Use Tokonomics 6.0</div>
        <div style="color: var(--text-muted); line-height: 1.5;">
            • <strong>Chat with @tokonomics:</strong> Type <code>@tokonomics explain &lt;query&gt;</code> in VS Code Chat to compile context live.<br/>
            • <strong>Slash Commands:</strong> Use <code>@tokonomics /live</code> (session banner), <code>@tokonomics /stats</code> (multi-window stats), <code>@tokonomics /explain</code> (decision trace).<br/>
            • <strong>Live Ledger:</strong> Click any prompt row in the table below to inspect AST pruning decisions, $CQ$ confidence, and evidence paths.
        </div>
    </div>

    <!-- Executive Summary Cards -->
    <div class="grid-cards">
        <div class="card">
            <div class="card-label">⚡ Tokens Saved</div>
            <div class="card-val" id="sumSavedTokens" style="color: var(--cyan);">${this.escapeHtml(summary.savedTokens.toLocaleString())}</div>
            <div class="card-sub" id="sumReductionPct">-${this.escapeHtml(summary.averageReductionPercentage)}% Net Reduction</div>
        </div>
        <div class="card">
            <div class="card-label">💰 Net Cloud Savings</div>
            <div class="card-val" id="sumSavedCost" style="color: var(--green);">${this.escapeHtml(money(summary.savedCostUSD, summary.reconciledPrompts < summary.costedPrompts))}</div>
            <div class="card-sub" id="sumPrompts">${this.escapeHtml(summary.completedPrompts)} completed · ${this.escapeHtml(summary.failedPrompts)} failed</div>
        </div>
        <div class="card">
            <div class="card-label">🎯 Context Quality (CQ)</div>
            <div class="card-val" id="sumCQ" style="color: var(--purple);">${this.escapeHtml(metric(summary.averagePredictedCQ, '%'))}</div>
            <div class="card-sub">Ledger-derived prediction; unavailable when not recorded</div>
        </div>
        <div class="card">
            <div class="card-label">⚡ Compilation Latency</div>
            <div class="card-val" id="sumLatency" style="color: var(--orange);">${this.escapeHtml(metric(summary.averageOptimizationLatencyMs, 'ms'))}</div>
            <div class="card-sub">Measured compiler latency average</div>
        </div>
    </div>

    <!-- Active Prompt Pulse Card -->
    <div class="pulse-card">
        <div class="pulse-header">
            <div style="font-weight: 700; color: #fff;">🟢 Most Recent Optimization Turn</div>
            <span class="badge-status ${latestEvent?.isCostReconciled ? 'badge-reconciled' : 'badge-estimated'}" id="pulseStatus">
                ${latestEvent ? (latestEvent.costStatus === 'reconciled' ? 'Actual Reconciled' : latestEvent.costStatus === 'projected' ? 'Projected (Estimated)' : 'Cost Unavailable') : 'No Requests'}
            </span>
        </div>
        <div class="pulse-grid">
            <div class="pulse-item">
                <div class="pulse-label">Target Model</div>
                <div class="pulse-val" id="pulseModel">${this.escapeHtml(latestEvent?.model || 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Task Intent</div>
                <div class="pulse-val" id="pulseTask">${this.escapeHtml(latestEvent?.taskType?.toUpperCase() || 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Token Delta</div>
                <div class="pulse-val" id="pulseTokens">${this.escapeHtml(latestEvent ? `${latestEvent.rawInputTokens.toLocaleString()} ➔ ${latestEvent.optimizedInputTokens.toLocaleString()}` : 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Tokens Saved</div>
                <div class="pulse-val" id="pulseSaved" style="color: var(--cyan);">${this.escapeHtml(latestEvent ? `${latestEvent.savedTokens.toLocaleString()} (-${latestEvent.reductionPercentage}%)` : 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Cost Saved</div>
                <div class="pulse-val" id="pulseCost" style="color: var(--green);">${this.escapeHtml(latestEvent?.costStatus === 'reconciled' ? money(latestEvent.actualSavingsUSD) : latestEvent?.costStatus === 'projected' ? money(latestEvent.projectedSavingsUSD, true) : 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Quality Score</div>
                <div class="pulse-val" id="pulseCQ" style="color: var(--purple);">${this.escapeHtml(latestEvent ? `${latestEvent.predictedCQ}% [${latestEvent.cqRating}]` : 'Unavailable')}</div>
            </div>
        </div>
    </div>

    <!-- Live Dynamic SVG Charts (Token Efficiency & Cost Streams) -->
    <div class="dual-grid">
        <!-- Token Efficiency Stream Chart -->
        <div class="section-box">
            <div class="section-title">
                <span>📈 Live Token Efficiency Stream</span>
                <span style="font-size: 10px; color: var(--cyan);">Raw (Red) vs Optimized (Cyan)</span>
            </div>
            <div class="chart-container">
                <svg id="tokenStreamChart" class="live-chart" viewBox="0 0 400 100" preserveAspectRatio="none">
                    <path id="rawTokenPath" d="" fill="none" stroke="var(--red)" stroke-width="2" opacity="0.75" />
                    <path id="optTokenPath" d="" fill="none" stroke="var(--cyan)" stroke-width="2.5" />
                </svg>
            </div>
        </div>

        <!-- Cost Stream Chart -->
        <div class="section-box">
            <div class="section-title">
                <span>📊 Live Dollar Cost Stream</span>
                <span style="font-size: 10px; color: var(--green);">Projected vs Actual Savings</span>
            </div>
            <div class="chart-container">
                <svg id="costStreamChart" class="live-chart" viewBox="0 0 400 100" preserveAspectRatio="none">
                    <path id="rawCostPath" d="" fill="none" stroke="var(--orange)" stroke-width="2" opacity="0.75" />
                    <path id="optCostPath" d="" fill="none" stroke="var(--green)" stroke-width="2.5" />
                </svg>
            </div>
        </div>
    </div>

    <!-- Dual Waterfalls (Stage Token Reduction + Cost Attribution) -->
    <div class="dual-grid">
        <!-- Token Reduction Waterfall -->
        <div class="section-box">
            <div class="section-title">
                <span>🌊 Stage-by-Stage Token Reduction Waterfall</span>
                <span style="font-size: 10px; color: var(--cyan);">Authoritative Compiler Stages</span>
            </div>
            ${stageWaterfall}
        </div>

        <!-- 7-Tier Cost Attribution Waterfall -->
        <div class="section-box">
            <div class="section-title">
                <span>💰 Request Cost Evidence</span>
                <span style="font-size: 10px; color: var(--green);">Projected and reconciled remain distinct</span>
            </div>
            ${costEvidence}
        </div>
    </div>

    <!-- Live Prompt Ledger -->
    <div class="section-box">
        <div class="section-title">
            <span>📋 Live Prompt Optimization Ledger (Click row to inspect)</span>
            <span style="font-size: 10px; color: var(--text-muted);">Real-time stream</span>
        </div>
        <table class="ledger-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Task Intent</th>
                    <th>Model</th>
                    <th>Tokens (Raw ➔ Optimized)</th>
                    <th>Saved %</th>
                    <th>Cost Saved</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="ledgerBody">
                ${recentEvents.slice().reverse().map(e => `
                <tr class="ledger-row" data-request-id="${this.escapeHtml(e.id)}">
                    <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td><strong style="color: #fff;">${this.escapeHtml(e.taskType?.toUpperCase() || 'Unavailable')}</strong></td>
                    <td>${this.escapeHtml(e.model || 'Unavailable')}</td>
                    <td>${this.escapeHtml(e.rawInputTokens.toLocaleString())} ➔ ${this.escapeHtml(e.optimizedInputTokens.toLocaleString())}</td>
                    <td style="color: var(--cyan); font-weight: 700;">-${this.escapeHtml(e.reductionPercentage)}%</td>
                    <td style="color: var(--green); font-weight: 700;">${this.escapeHtml(e.costStatus === 'reconciled' ? money(e.actualSavingsUSD) : e.costStatus === 'projected' ? money(e.projectedSavingsUSD, true) : 'Unavailable')}</td>
                    <td><span class="badge-status ${e.costStatus === 'reconciled' ? 'badge-reconciled' : 'badge-estimated'}">${e.costStatus === 'reconciled' ? 'Reconciled' : e.costStatus === 'projected' ? 'Projected' : 'Unavailable'}</span></td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <!-- Deep Optimization Inspector Modal -->
    <div id="inspectorModal" class="modal" onclick="closeInspector(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
            <span class="modal-close" onclick="closeModal()">&times;</span>
            <h3 style="color: var(--cyan); margin-bottom: 14px;">🔍 Deep Optimization Decision Inspector</h3>
            
            <div class="inspector-section">
                <div class="inspector-title">🎯 Task Intent & Model Target</div>
                <div id="inspIntent">Loading...</div>
            </div>

            <div class="inspector-section">
                <div class="inspector-title">📊 Context Quality (CQ) Calibration Breakdown</div>
                <div id="inspCQ">Loading...</div>
            </div>

            <div class="inspector-section">
                <div class="inspector-title">⚡ Stage-by-Stage Token Deltas & Latency</div>
                <div id="inspStages">Loading...</div>
            </div>

            <div class="inspector-section">
                <div class="inspector-title">📄 Raw Trace Payload</div>
                <div id="inspectorContent" style="white-space: pre-wrap; max-height: 30vh; overflow-y: auto;"></div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let eventsCache = ${this.serializeForScript(recentEvents)};

        // Real-Time Event Stream Listener
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'EVENT') {
                const e = msg.payload;
                const existing = eventsCache.findIndex(item => item.id === e.id);
                if (existing >= 0) eventsCache[existing] = e;
                else eventsCache.push(e);
                updatePulseCard(e);
                upsertLedgerRow(e);
                updateLiveCharts();
            } else if (msg.type === 'SUMMARY_UPDATE') {
                updateSummaryCards(msg.payload);
            } else if (msg.type === 'INIT_STATE') {
                eventsCache = msg.payload.recentEvents || [];
                if (msg.payload.summary) updateSummaryCards(msg.payload.summary);
                if (msg.payload.latestEvent) updatePulseCard(msg.payload.latestEvent);
                updateLiveCharts();
            } else if (msg.type === 'TRACE_DETAIL') {
                document.getElementById('inspectorContent').innerText = JSON.stringify(msg.payload, null, 2);
            } else if (msg.type === 'ERROR') {
                document.getElementById('inspectorContent').innerText = msg.payload.message || 'Trace unavailable.';
            }
        });

        function updateSummaryCards(s) {
            document.getElementById('sumSavedTokens').innerText = s.savedTokens.toLocaleString();
            document.getElementById('sumReductionPct').innerText = '-' + s.averageReductionPercentage + '% Net Reduction';
            document.getElementById('sumSavedCost').innerText = s.savedCostUSD === null ? 'Unavailable' : (s.reconciledPrompts < s.costedPrompts ? '~$' : '$') + s.savedCostUSD.toFixed(4);
            document.getElementById('sumPrompts').innerText = s.completedPrompts + ' completed · ' + s.failedPrompts + ' failed';
            document.getElementById('sumCQ').innerText = s.averagePredictedCQ === null ? 'Unavailable' : s.averagePredictedCQ + '%';
            document.getElementById('sumLatency').innerText = s.averageOptimizationLatencyMs === null ? 'Unavailable' : s.averageOptimizationLatencyMs + 'ms';
        }

        function updatePulseCard(e) {
            document.getElementById('pulseModel').innerText = e.model || 'Unavailable';
            document.getElementById('pulseTask').innerText = e.taskType ? e.taskType.toUpperCase() : 'Unavailable';
            document.getElementById('pulseTokens').innerText = e.rawInputTokens.toLocaleString() + ' ➔ ' + e.optimizedInputTokens.toLocaleString();
            document.getElementById('pulseSaved').innerText = e.savedTokens.toLocaleString() + ' (-' + e.reductionPercentage + '%)';
            document.getElementById('pulseCost').innerText = e.costStatus === 'reconciled' && Number.isFinite(e.actualSavingsUSD)
                ? '$' + e.actualSavingsUSD.toFixed(4)
                : e.costStatus === 'projected' && Number.isFinite(e.projectedSavingsUSD) ? '~$' + e.projectedSavingsUSD.toFixed(4) : 'Unavailable';
            document.getElementById('pulseCQ').innerText = Number.isFinite(e.predictedCQ) ? e.predictedCQ + '% [' + e.cqRating + ']' : 'Unavailable';
            
            const badge = document.getElementById('pulseStatus');
            badge.className = 'badge-status ' + (e.costStatus === 'reconciled' ? 'badge-reconciled' : 'badge-estimated');
            badge.innerText = e.costStatus === 'reconciled' ? 'Actual Reconciled' : e.costStatus === 'projected' ? 'Projected (Estimated)' : 'Cost Unavailable';
        }

        function upsertLedgerRow(e) {
            const tbody = document.getElementById('ledgerBody');
            const old = Array.from(tbody.querySelectorAll('tr')).find(row => row.dataset.requestId === e.id);
            if (old) old.remove();
            const tr = document.createElement('tr');
            tr.dataset.requestId = e.id;
            tr.onclick = () => inspectEvent(e.id);
            tr.innerHTML = \`
                <td>\${escapeText(new Date(e.timestamp).toLocaleTimeString())}</td>
                <td><strong style="color: #fff;">\${escapeText(e.taskType ? e.taskType.toUpperCase() : 'Unavailable')}</strong></td>
                <td>\${escapeText(e.model || 'Unavailable')}</td>
                <td>\${e.rawInputTokens.toLocaleString()} ➔ \${e.optimizedInputTokens.toLocaleString()}</td>
                <td style="color: var(--cyan); font-weight: 700;">-\${e.reductionPercentage}%</td>
                <td style="color: var(--green); font-weight: 700;">\${e.costStatus === 'reconciled' && Number.isFinite(e.actualSavingsUSD) ? '$' + e.actualSavingsUSD.toFixed(4) : e.costStatus === 'projected' && Number.isFinite(e.projectedSavingsUSD) ? '~$' + e.projectedSavingsUSD.toFixed(4) : 'Unavailable'}</td>
                <td><span class="badge-status \${e.costStatus === 'reconciled' ? 'badge-reconciled' : 'badge-estimated'}">\${e.costStatus === 'reconciled' ? 'Reconciled' : e.costStatus === 'projected' ? 'Projected' : 'Unavailable'}</span></td>
            \`;
            tbody.insertBefore(tr, tbody.firstChild);
        }

        function escapeText(value) {
            return String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[character]);
        }

        function updateLiveCharts() {
            const tokenEvents = (eventsCache || []).filter(e => Number.isFinite(e.rawInputTokens) && Number.isFinite(e.optimizedInputTokens)).slice(-8);
            const tokenPaths = buildPaths(tokenEvents.map(e => [e.rawInputTokens, e.optimizedInputTokens]));
            document.getElementById('rawTokenPath').setAttribute('d', tokenPaths.first);
            document.getElementById('optTokenPath').setAttribute('d', tokenPaths.second);

            const costPairs = (eventsCache || []).map(e => e.costStatus === 'reconciled'
                ? [e.actualRawCostUSD, e.actualOptimizedCostUSD]
                : e.costStatus === 'projected' ? [e.projectedRawCostUSD, e.projectedOptimizedCostUSD] : undefined)
                .filter(pair => pair && pair.every(Number.isFinite)).slice(-8);
            const costPaths = buildPaths(costPairs);
            document.getElementById('rawCostPath').setAttribute('d', costPaths.first);
            document.getElementById('optCostPath').setAttribute('d', costPaths.second);
        }

        function buildPaths(pairs) {
            if (pairs.length < 2) return { first: '', second: '' };
            const maximum = Math.max(...pairs.flat(), 0);
            if (maximum <= 0) return { first: '', second: '' };
            const first = [];
            const second = [];
            pairs.forEach((pair, index) => {
                const x = Math.round((index / (pairs.length - 1)) * 400);
                first.push(x + ',' + Math.max(10, Math.round(90 - ((pair[0] / maximum) * 75))));
                second.push(x + ',' + Math.max(10, Math.round(90 - ((pair[1] / maximum) * 75))));
            });
            return { first: 'M' + first.join(' L'), second: 'M' + second.join(' L') };
        }

        function inspectEvent(id) {
            const ev = eventsCache.find(x => x.id === id);
            if (ev) {
                document.getElementById('inspIntent').innerText =
                    'Task Type: ' + (ev.taskType ? ev.taskType.toUpperCase() : 'Unavailable') +
                    ' | Confidence: ' + (Number.isFinite(ev.taskConfidence) ? ev.taskConfidence : 'Unavailable') + '\n' +
                    'Model: ' + (ev.model || 'Unavailable') + ' | Provider: ' + (ev.provider || 'Unavailable') + '\n' +
                    'Cache state: ' + (ev.cacheState || 'Unavailable') + ' | Cached tokens: ' + (Number.isFinite(ev.cachedTokens) ? ev.cachedTokens : 'Unavailable');
                document.getElementById('inspCQ').innerText = Number.isFinite(ev.predictedCQ)
                    ? 'Context Quality: ' + ev.predictedCQ + '% [' + ev.cqRating + ']\nEvidence Coverage: ' + Math.round(ev.evidenceCoverage * 100) + '% | Slice Confidence: ' + ev.sliceConfidence
                    : 'Context quality unavailable.';
                document.getElementById('inspStages').innerText = ev.stageMetrics && ev.stageMetrics.length
                    ? ev.stageMetrics.map(m => '• ' + m.stageName + ': ' + m.tokensBefore + ' ➔ ' + m.tokensAfter + ' tokens (-' + m.tokensSaved + ' in ' + m.latencyMs + 'ms)').join('\n')
                    : 'Stage metrics unavailable.';
                document.getElementById('inspectorContent').innerText = 'Loading privacy-safe ledger trace…';
                vscode.postMessage({ action: 'REQUEST_TRACE', requestId: id });
                document.getElementById('inspectorModal').style.display = 'flex';
            }
        }

        function closeModal() {
            document.getElementById('inspectorModal').style.display = 'none';
        }

        function closeInspector(e) {
            if (e.target.id === 'inspectorModal') closeModal();
        }

        // Time window buttons
        document.querySelectorAll('.window-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.window-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                vscode.postMessage({ action: 'CHANGE_TIME_WINDOW', window: btn.dataset.window });
            });
        });

        // Top actions
        document.getElementById('btnOptimizeActive').addEventListener('click', () => vscode.postMessage({ command: 'optimizeActiveFile' }));
        document.getElementById('btnCompareDiff').addEventListener('click', () => vscode.postMessage({ command: 'comparePrunedDiff' }));
        document.getElementById('btnScanWorkspace').addEventListener('click', () => vscode.postMessage({ command: 'scanWorkspace' }));
        document.getElementById('btnExport').addEventListener('click', () => vscode.postMessage({ command: 'exportAuditLog' }));
        document.getElementById('btnReset').addEventListener('click', () => vscode.postMessage({ command: 'resetMetrics' }));
        document.querySelectorAll('.ledger-row').forEach(row => {
            row.addEventListener('click', () => inspectEvent(row.dataset.requestId));
        });
        
        updateLiveCharts();
    </script>
</body>
</html>`;
    }

    public dispose() {
        DashboardWebviewPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) x.dispose();
        }
    }
}
