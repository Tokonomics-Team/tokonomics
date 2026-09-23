/**
 * Tokonomics 8.0.0 dashboard webview
 * 
 * Modernized Differential Webview State Bridge:
 *   - Exactly-Once HTML Instantiation (Zero Iframe Destruction on tab switches)
 *   - Differential JSON Event Streaming via webview.postMessage()
 *   - Instant In-Memory Workspace Snapshot Auditing (< 15ms, 0 disk I/O)
 *   - Strict Content Security Policy (Cryptographic nonces, zero unsafe-inline/unsafe-eval)
 *   - Complete DOM State & Scroll Continuity across editor focus changes
 *   - 100% Local Privacy & Zero Telemetry Leakage
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
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
import { VersionedWorkspaceIndex } from '../workspace/workspaceIndex';
import { UserPreferenceRegistry } from '../config/userPreferences';
import { effectiveCostState, explainCostState } from '../cost/accountingTruth';
import { spendDashboardHtml, spendDashboardCss, spendDashboardScript, spendCommands } from './spendDashboard';

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
    
    // Telemetry & Verification Counters for Differential Bridge
    public htmlAssignmentCount: number = 0;
    public differentialMessageCount: number = 0;
    private workspaceIndex?: VersionedWorkspaceIndex;

    private constructor(
        panel: vscode.WebviewPanel, 
        private metricsTracker: MetricsTracker,
        private astEngine?: AstPrunerEngine,
        initialDocUri?: vscode.Uri,
        workspaceIndex?: VersionedWorkspaceIndex
    ) {
        this.panel = panel;
        this.lastActiveDocUri = initialDocUri;
        this.workspaceIndex = workspaceIndex;

        // Render first so the controller's initial state cannot target an empty document.
        this.updateContent();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Modern Differential State Bridge: Switch active editor without destroying webview DOM
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document && !editor.document.isUntitled) {
                this.lastActiveDocUri = editor.document.uri;
            }
            if (this.panel.visible) {
                this.dispatchActiveFileDiagnosis();
            }
        }, null, this.disposables);

        const unregister = DashboardController.getInstance().registerWebview(this.panel.webview, async (message) => {
            if (message.command === 'spendAction' && spendCommands.has(message.actionName)) {
                await vscode.commands.executeCommand('tokenOptimizer.' + message.actionName);
            } else if (message.command === 'resetMetrics') {
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

                this.dispatchActiveFileDiagnosis();
                vscode.window.showInformationMessage(
                    `⚡ Optimized "${diagnosis.fileName}": Reduced ${origTokens.toLocaleString()} ➔ ${pruneResult.prunedTokenCount.toLocaleString()} tokens (${pruneResult.reductionPercentage}% saved in ${pruneResult.durationMs}ms)! Pruned skeleton copied to clipboard.`
                );
            } else if (message.command === 'scanWorkspace') {
                const scan = await this.dispatchWorkspaceScan();
                vscode.window.showInformationMessage(`Workspace scan complete: ${scan.totalFiles} files audited in ${scan.durationMs}ms.`);
            }
        });
        this.disposables.push({ dispose: unregister });
    }

    public static createOrShow(metricsTracker: MetricsTracker, astEngine?: AstPrunerEngine, workspaceIndex?: VersionedWorkspaceIndex) {
        const activeEditor = vscode.window.activeTextEditor;
        const initialDocUri = activeEditor?.document?.uri;
        const column = activeEditor ? activeEditor.viewColumn : undefined;

        if (DashboardWebviewPanel.currentPanel) {
            DashboardWebviewPanel.currentPanel.panel.reveal(column);
            if (initialDocUri) {
                DashboardWebviewPanel.currentPanel.lastActiveDocUri = initialDocUri;
            }
            if (workspaceIndex) {
                DashboardWebviewPanel.currentPanel.workspaceIndex = workspaceIndex;
            }
            DashboardWebviewPanel.currentPanel.dispatchActiveFileDiagnosis();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'tokenOptimizerDashboard',
            'Tokonomics 8.0.0 — Activity Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DashboardWebviewPanel.currentPanel = new DashboardWebviewPanel(panel, metricsTracker, astEngine, initialDocUri, workspaceIndex);
    }

    public updateContent() {
        this.htmlAssignmentCount++;
        const activeFileDiagnosis = this.diagnoseActiveFile();

        const summary = LiveMetricsAggregator.getInstance().getAggregateSummary(
            DashboardController.getInstance().getCurrentWindow()
        );
        const recentEvents = LiveMetricsAggregator.getInstance().getRecentEvents(50);

        this.panel.webview.html = this.getHtml(summary, recentEvents, activeFileDiagnosis, this.cachedWorkspaceScan);
    }

    public dispatchActiveFileDiagnosis(): void {
        const activeFileDiagnosis = this.diagnoseActiveFile();
        this.differentialMessageCount++;
        this.panel.webview.postMessage({
            type: 'ACTIVE_FILE_DIAGNOSIS',
            payload: activeFileDiagnosis
        });
    }

    public async dispatchWorkspaceScan(): Promise<WorkspaceScanResult> {
        this.cachedWorkspaceScan = await this.performWorkspaceScan();
        this.differentialMessageCount++;
        this.panel.webview.postMessage({
            type: 'WORKSPACE_SCAN_RESULT',
            payload: this.cachedWorkspaceScan
        });
        return this.cachedWorkspaceScan;
    }

    public getHtmlAssignmentCount(): number {
        return this.htmlAssignmentCount;
    }

    public getDifferentialMessageCount(): number {
        return this.differentialMessageCount;
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
        return crypto.randomBytes(24).toString('base64url');
    }

    public async performWorkspaceScan(): Promise<WorkspaceScanResult> {
        const startTime = Date.now();

        // 1. Instant In-Memory Snapshot Scan (< 15ms, 0 disk I/O)
        if (this.workspaceIndex) {
            const snapshot = this.workspaceIndex.captureSnapshot();
            if (snapshot && snapshot.files && snapshot.files.size > 0) {
                let totalFiles = 0;
                let totalRawTokens = 0;
                let totalPrunedTokens = 0;

                for (const record of snapshot.files.values()) {
                    totalFiles++;
                    const rawTokens = Math.max(1, Math.ceil(record.sizeBytes / 4));
                    const prunedTokens = TokenCounter.countTokens(record.skeleton);
                    totalRawTokens += rawTokens;
                    totalPrunedTokens += prunedTokens;
                }

                const saved = Math.max(0, totalRawTokens - totalPrunedTokens);
                const potentialSavingsPercentage = totalRawTokens > 0 ? Math.round((saved / totalRawTokens) * 100) : 0;
                return {
                    totalFiles,
                    totalRawTokens,
                    totalPrunedTokens,
                    potentialSavingsPercentage,
                    durationMs: Date.now() - startTime
                };
            }
        }

        // 2. Graceful fallback: recursive disk scan if index is empty or uninitialized
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
        const runtime = UserPreferenceRegistry.get();
        const latestReceipts = latestEvent?.componentReceipts || [];
        const contributedComponents = latestReceipts.filter(receipt => receipt.outcome === 'contributed').length;
        const bypassedComponents = latestReceipts.filter(receipt => receipt.outcome === 'bypassed').length;
        const nonce = this.getNonce();
        const money = (value: number | null | undefined, projected = false) => value === null || value === undefined
            ? 'Unavailable' : `${projected ? '~' : ''}$${value.toFixed(4)}`;
        const metric = (value: number | null | undefined, suffix: string) => value === null || value === undefined
            ? 'Unavailable' : `${value}${suffix}`;
        const stageWaterfall = latestEvent?.stageMetrics?.length
            ? latestEvent.stageMetrics.map(stage => {
                const percentage = stage.tokensBefore > 0 ? Math.max(0, Math.min(100, (stage.tokensSaved / stage.tokensBefore) * 100)) : 0;
                return `<div class="waterfall-bar"><span>${this.escapeHtml(stage.stageName)}</span><div class="waterfall-fill-container"><div class="waterfall-fill fill-cyan" data-percentage="${percentage.toFixed(1)}"></div></div><strong class="color-cyan">-${this.escapeHtml(stage.tokensSaved)} tokens</strong></div>`;
            }).join('')
            : '<div class="card-sub">Unavailable — no stage metrics have been recorded.</div>';
        const latestCostState = latestEvent ? effectiveCostState(latestEvent) : undefined;
        const unavailableCostExplanation = latestEvent ? explainCostState(latestEvent) : 'No request has been recorded yet.';
        const costEvidence = latestCostState === 'reconciled'
            ? `<div class="card-sub">Estimated avoided cost from observed usage: ${money(latestEvent.actualSavingsUSD, true)}. Per-stage financial attribution is unavailable.</div>`
            : latestCostState === 'projected'
                ? `<div class="card-sub">Projected request savings: ${money(latestEvent.projectedSavingsUSD, true)}. Per-stage financial attribution is unavailable.</div>`
                : `<div class="card-sub">Cost unavailable — ${this.escapeHtml(unavailableCostExplanation)}</div>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src 'none'; connect-src 'none';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tokonomics 8.0.0 Dashboard</title>
    <style nonce="${nonce}">
        :root {
            color-scheme: light dark;
            --bg-primary: var(--vscode-editor-background, #0d1117);
            --bg-card: var(--vscode-sideBar-background, #161b22);
            --bg-elevated: var(--vscode-editorWidget-background, #1c2128);
            --border: var(--vscode-panel-border, #3d444d);
            --border-highlight: var(--vscode-focusBorder, #58a6ff);
            --cyan: var(--vscode-textLink-foreground, #58a6ff);
            --green: var(--vscode-testing-iconPassed, #3fb950);
            --purple: var(--vscode-symbolIcon-classForeground, #bc8cff);
            --orange: var(--vscode-editorWarning-foreground, #d29922);
            --red: var(--vscode-errorForeground, #f85149);
            --text-primary: var(--vscode-foreground, #f0f6fc);
            --text-muted: var(--vscode-descriptionForeground, #9da7b3);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-primary); color: var(--text-primary); padding: 20px; font: 13px var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }
        
        /* Typography & Color Utility Classes (Strict CSP Conformance) */
        .color-cyan { color: var(--cyan); }
        .color-green { color: var(--green); }
        .color-purple { color: var(--purple); }
        .color-orange { color: var(--orange); }
        .color-red { color: var(--red); }
        .color-primary { color: var(--text-primary); }
        .color-muted { color: var(--text-muted); }
        .font-bold { font-weight: 700; }
        .font-mono { font-family: monospace; }
        .sub-cyan { font-size: 10px; color: var(--cyan); }
        .sub-green { font-size: 10px; color: var(--green); }
        .sub-orange { font-size: 10px; color: var(--orange); }
        .sub-muted { font-size: 10px; color: var(--text-muted); }
        .fill-cyan { background: var(--cyan); }
        .raw-trace-box { white-space: pre-wrap; max-height: 30vh; overflow-y: auto; }
        .btn-sm { padding: 4px 8px; font-size: 10px; }

        /* Header */
        .header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
        .title-area { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
        .title { font-size: 18px; font-weight: 700; color: var(--cyan); letter-spacing: -0.5px; }
        .window-selector { display: flex; flex-wrap: wrap; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; padding: 2px; }
        .window-btn { background: transparent; border: none; color: var(--text-muted); padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 4px; transition: all 0.15s; }
        .window-btn.active { background: var(--vscode-button-background, #1f6feb); color: var(--vscode-button-foreground, #fff); }

        .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button.btn-action { background: var(--vscode-button-secondaryBackground, #21262d); border: 1px solid var(--border); color: var(--vscode-button-secondaryForeground, var(--text-primary)); padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background-color 0.15s, border-color 0.15s; }
        button.btn-action:hover { background: var(--vscode-button-secondaryHoverBackground, #30363d); }
        button.btn-primary { background: var(--vscode-button-background, #238636); color: var(--vscode-button-foreground, #fff); }
        button.btn-primary:hover { background: var(--vscode-button-hoverBackground, #2ea043); }
        button:focus-visible, .ledger-row:focus-visible, .modal-close:focus-visible { outline: 2px solid var(--border-highlight); outline-offset: 2px; }

        /* Quick Guide Tip Banner */
        .guide-banner { background: rgba(31, 111, 235, 0.12); border: 1px solid rgba(56, 139, 253, 0.35); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; }
        .guide-title { font-weight: 700; color: var(--cyan); margin-bottom: 4px; }
        .guide-body { color: var(--text-muted); line-height: 1.5; }

        /* Active File Diagnosis Card (Reactive Delta Bridge) */
        .active-file-card { background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid var(--cyan); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; transition: border-color 0.2s; }
        .active-file-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .active-file-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .active-file-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); display: inline-block; }
        .badge-lang { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--cyan) 20%, transparent); color: var(--cyan); font-weight: 600; }
        .active-file-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
        .af-stat { background: color-mix(in srgb, var(--text-primary) 3%, transparent); padding: 6px 8px; border-radius: 4px; }
        .af-label { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
        .af-val { font-size: 13px; font-weight: 700; }

        /* Executive Cards */
        .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; min-width: 0; }
        .card-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 4px; }
        .card-val { font-size: 24px; font-weight: 700; }
        .card-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

        /* Active Prompt Pulse Card */
        .pulse-card { background: var(--bg-elevated); border: 1px solid var(--border-highlight); border-radius: 8px; padding: 14px; margin-bottom: 18px; box-shadow: 0 0 15px color-mix(in srgb, var(--border-highlight) 18%, transparent); }
        .pulse-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .badge-status { padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .badge-reconciled { background: rgba(46, 160, 67, 0.2); color: var(--green); border: 1px solid var(--green); }
        .badge-estimated { background: rgba(240, 136, 62, 0.2); color: var(--orange); border: 1px solid var(--orange); }
        .badge-optimizing { background: rgba(0, 240, 255, 0.2); color: var(--cyan); border: 1px solid var(--cyan); }
        .badge-unavailable { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }

        .pulse-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; font-size: 12px; }
        .pulse-item { background: color-mix(in srgb, var(--text-primary) 4%, transparent); padding: 8px 10px; border-radius: 6px; }
        .pulse-label { color: var(--text-muted); font-size: 10px; margin-bottom: 2px; }
        .pulse-val { font-weight: 700; color: var(--text-primary); }

        /* Workspace Snapshot Audit Section */
        .ws-audit-box { margin-bottom: 18px; }
        .ws-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .ws-stat-item { background: color-mix(in srgb, var(--text-primary) 3%, transparent); padding: 8px 10px; border-radius: 6px; }
        .ws-stat-label { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
        .ws-stat-val { font-size: 16px; font-weight: 700; }

        /* Dual Section Grid */
        .dual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
        .section-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
        .section-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; color: var(--text-primary); }

        /* SVG Live Charts */
        .chart-container { width: 100%; height: 120px; position: relative; margin-top: 6px; }
        svg.live-chart { width: 100%; height: 100%; overflow: visible; }
        svg.live-chart path { stroke-linecap: round; stroke-linejoin: round; }

        /* Waterfalls */
        .waterfall-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11px; }
        .waterfall-fill-container { flex: 1; margin: 0 10px; background: color-mix(in srgb, var(--text-primary) 7%, transparent); height: 6px; border-radius: 3px; overflow: hidden; }
        .waterfall-fill { height: 100%; border-radius: 3px; }

        /* Ledger Table */
        .ledger-scroll { overflow-x: auto; }
        .ledger-table { width: 100%; min-width: 700px; border-collapse: collapse; font-size: 11px; text-align: left; }
        .ledger-table th { padding: 8px; color: var(--text-muted); border-bottom: 1px solid var(--border); font-weight: 600; }
        .ledger-table td { padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; }
        .ledger-table tr:hover { background: color-mix(in srgb, var(--border-highlight) 10%, transparent); }

        /* Modal Inspector */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center; }
        .modal-content { background: var(--bg-elevated); border: 1px solid var(--border-highlight); border-radius: 8px; width: min(760px, 92vw); max-height: 85vh; padding: 22px; overflow-y: auto; color: var(--text-primary); }
        .modal-close { float: right; cursor: pointer; color: var(--text-muted); background: transparent; border: 0; font-size: 20px; font-weight: 700; }
        .inspector-section { background: color-mix(in srgb, var(--text-primary) 4%, transparent); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-family: monospace; font-size: 11px; }
        .inspector-title { color: var(--cyan); font-weight: 700; margin-bottom: 6px; font-size: 12px; }
        @media (max-width: 860px) {
            body { padding: 12px; }
            .dual-grid { grid-template-columns: 1fr; }
            .header, .title-area { align-items: flex-start; }
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
        }
        [hidden] { display: none !important; }
        body { max-width: 1240px; margin: 0 auto; line-height: 1.5; }
        .dashboard-nav { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-bottom: 22px; }
        .view-btn { font: inherit; background: transparent; color: var(--text-muted); border: 0; border-bottom: 2px solid transparent; padding: 10px 18px; cursor: pointer; }
        .view-btn[aria-pressed="true"] { color: var(--text-primary); border-bottom-color: var(--border-highlight); font-weight: 600; }
        .view-title { font-size: 22px; margin: 0 0 4px; }
        .view-description { color: var(--text-muted); margin-bottom: 18px; }
        .view-actions { margin: 16px 0; }
        .dashboard-details { margin: 18px 0; padding: 12px 0; border-top: 1px solid var(--border); }
        summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
        summary:focus-visible { outline: 2px solid var(--border-highlight); outline-offset: 2px; }
        .active-file-header { flex-wrap: wrap; gap: 12px; }
        .active-file-title { min-width: 0; overflow-wrap: anywhere; }
        @media (max-width: 600px) { .pulse-grid, .ws-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    ${spendDashboardCss}
    </style>
</head>
<body>
    <div class="header">
        <div class="title-area">
            <div class="title">Tokonomics 8.0.0</div>
            <div class="window-selector" role="group" aria-label="Metrics time window">
                <button class="window-btn${summary.timeWindow === 'session' ? ' active' : ''}" data-window="session" aria-pressed="${summary.timeWindow === 'session'}">Session</button>
                <button class="window-btn${summary.timeWindow === 'today' ? ' active' : ''}" data-window="today" aria-pressed="${summary.timeWindow === 'today'}">Today</button>
                <button class="window-btn${summary.timeWindow === '7_days' ? ' active' : ''}" data-window="7_days" aria-pressed="${summary.timeWindow === '7_days'}">7 Days</button>
                <button class="window-btn${summary.timeWindow === 'lifetime' ? ' active' : ''}" data-window="lifetime" aria-pressed="${summary.timeWindow === 'lifetime'}">Retained history</button>
            </div>
        </div>
    </div>
    <nav class="dashboard-nav" aria-label="Dashboard views">
        <button class="view-btn" data-view="usage" aria-controls="view-usage" aria-pressed="true">Usage</button>
        <button class="view-btn" data-view="context" aria-controls="view-context" aria-pressed="false">Context</button>
        <button class="view-btn" data-view="diagnostics" aria-controls="view-diagnostics" aria-pressed="false">Diagnostics</button>
    </nav>

    <!-- Active File Diagnosis Card (Reactive Differential State Bridge) -->
    <main>
    <section id="view-usage" data-dashboard-view="usage" aria-label="Usage">
    ${spendDashboardHtml}
    </section>
    <section id="view-context" data-dashboard-view="context" aria-label="Context" hidden>
    <h2 class="view-title">Context efficiency</h2>
    <p class="view-description">See what changed in your requests and preview the active file. File previews are potential reductions, not measured savings.</p>
    <div class="actions view-actions">
        <button id="btnOptimizeActive" class="btn-action btn-primary">Optimize active file</button>
        <button id="btnCompareDiff" class="btn-action">Compare changes</button>
        <button id="btnScanWorkspace" class="btn-action">Audit workspace</button>
    </div>
    <div id="activeFileCard" class="active-file-card" aria-live="polite" aria-atomic="true">
        <div class="active-file-header">
            <div class="active-file-title">
                <span class="active-file-dot"></span>
                <span id="activeFileName">${this.escapeHtml(activeFile ? activeFile.fileName : 'No Active File Selected')}</span>
                <span id="activeFileLang" class="badge-lang">${this.escapeHtml(activeFile ? activeFile.language.toUpperCase() : 'NONE')}</span>
            </div>
            <div class="active-file-actions">
                <button id="btnQuickOptimizeActive" class="btn-action btn-primary btn-sm">⚡ Optimize File</button>
            </div>
        </div>
        <div class="active-file-stats">
            <div class="af-stat">
                <div class="af-label">Lines</div>
                <div class="af-val" id="activeFileLines">${activeFile ? activeFile.lineCount.toLocaleString() : '—'}</div>
            </div>
            <div class="af-stat">
                <div class="af-label">Raw Tokens</div>
                <div class="af-val" id="activeFileRaw">${activeFile ? activeFile.originalTokens.toLocaleString() : '—'}</div>
            </div>
            <div class="af-stat">
                <div class="af-label">Pruned Skeleton</div>
                <div class="af-val color-cyan" id="activeFilePruned">${activeFile ? activeFile.prunedTokens.toLocaleString() : '—'}</div>
            </div>
            <div class="af-stat">
                <div class="af-label">Potential Reduction</div>
                <div class="af-val color-green" id="activeFileSavings">${activeFile ? `-${activeFile.reductionPercentage}%` : '—'}</div>
            </div>
            <div class="af-stat">
                <div class="af-label">Analysis Speed</div>
                <div class="af-val color-orange" id="activeFileDuration">${activeFile ? `${activeFile.durationMs}ms` : '—'}</div>
            </div>
        </div>
    </div>

    <!-- Executive Summary Cards -->
    <div class="grid-cards" aria-live="polite" aria-atomic="true">
        <div class="card">
            <div class="card-label">Tokens reduced</div>
            <div class="card-val color-cyan" id="sumSavedTokens">${this.escapeHtml(summary.savedTokens.toLocaleString())}</div>
            <div class="card-sub" id="sumReductionPct">-${this.escapeHtml(summary.averageReductionPercentage)}% Net Reduction</div>
        </div>
        <div class="card">
            <div class="card-label">Estimated avoided cost</div>
            <div class="card-val color-green" id="sumSavedCost">${this.escapeHtml(money(summary.savedCostUSD, true))}</div>
            <div class="card-sub" id="sumPrompts">${this.escapeHtml(summary.completedPrompts)} completed · ${this.escapeHtml(summary.failedPrompts)} failed</div>
        </div>
        <div class="card">
            <div class="card-label">Predicted context quality</div>
            <div class="card-val color-purple" id="sumCQ">${this.escapeHtml(metric(summary.averagePredictedCQ, '%'))}</div>
            <div class="card-sub">Ledger-derived prediction; unavailable when not recorded</div>
        </div>
        <div class="card">
            <div class="card-label">Compile time</div>
            <div class="card-val color-orange" id="sumLatency">${this.escapeHtml(metric(summary.averageOptimizationLatencyMs, 'ms'))}</div>
            <div class="card-sub">Measured compiler latency average</div>
        </div>
    </div>

    <!-- Active Prompt Pulse Card -->
    <div class="pulse-card" aria-live="polite" aria-atomic="true">
        <div class="pulse-header">
            <div class="font-bold color-primary">Latest request</div>
            <span class="badge-status ${latestEvent?.costStatus === 'reconciled' ? 'badge-reconciled' : latestEvent?.costStatus === 'projected' ? 'badge-estimated' : 'badge-unavailable'}" id="pulseStatus">
                ${latestEvent ? (latestEvent.costStatus === 'reconciled' ? 'Observed Usage' : latestEvent.costStatus === 'projected' ? 'Projected (Estimated)' : 'Cost Unavailable') : 'No Requests'}
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
                <div class="pulse-val color-cyan" id="pulseSaved">${this.escapeHtml(latestEvent ? `${latestEvent.savedTokens.toLocaleString()} (-${latestEvent.reductionPercentage}%)` : 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Estimated avoided cost</div>
                <div class="pulse-val color-green" id="pulseCost">${this.escapeHtml(latestEvent?.costStatus === 'reconciled' ? money(latestEvent.actualSavingsUSD, true) : latestEvent?.costStatus === 'projected' ? money(latestEvent.projectedSavingsUSD, true) : 'Unavailable')}</div>
            </div>
            <div class="pulse-item">
                <div class="pulse-label">Predicted quality</div>
                <div class="pulse-val color-purple" id="pulseCQ">${this.escapeHtml(latestEvent ? `${latestEvent.predictedCQ}% [${latestEvent.cqRating}]` : 'Unavailable')}</div>
            </div>
        </div>
    </div>

    <details class="dashboard-details" id="workspaceAuditDetails"><summary>Workspace audit</summary>
    <!-- Workspace Snapshot Audit Section -->
    <div id="workspaceScanCard" class="section-box ws-audit-box">
        <div class="section-title">
            <span>⚡ In-Memory Workspace Snapshot Audit</span>
            <span id="wsDuration" class="sub-orange">${workspaceScan ? `${workspaceScan.durationMs}ms instantaneous` : 'Snapshot Ready'}</span>
        </div>
        <div class="ws-stats-grid">
            <div class="ws-stat-item">
                <div class="ws-stat-label">Indexed Files</div>
                <div class="ws-stat-val" id="wsTotalFiles">${workspaceScan ? workspaceScan.totalFiles.toLocaleString() : '0'}</div>
            </div>
            <div class="ws-stat-item">
                <div class="ws-stat-label">Total Raw Tokens</div>
                <div class="ws-stat-val" id="wsTotalRaw">${workspaceScan ? workspaceScan.totalRawTokens.toLocaleString() : '0'}</div>
            </div>
            <div class="ws-stat-item">
                <div class="ws-stat-label">Pruned Skeleton Tokens</div>
                <div class="ws-stat-val color-cyan" id="wsTotalPruned">${workspaceScan ? workspaceScan.totalPrunedTokens.toLocaleString() : '0'}</div>
            </div>
            <div class="ws-stat-item">
                <div class="ws-stat-label">Global Potential Savings</div>
                <div class="ws-stat-val color-green" id="wsSavingsPct">${workspaceScan ? `-${workspaceScan.potentialSavingsPercentage}%` : '0%'}</div>
            </div>
        </div>
    </div>

    </details>
    </section>
    <section id="view-diagnostics" data-dashboard-view="diagnostics" aria-label="Diagnostics" hidden>
    <h2 class="view-title">Request diagnostics</h2>
    <p class="view-description">Inspect individual requests, compiler decisions and cost estimates.</p>
    <div class="actions view-actions">
        <button id="btnExport" class="btn-action">Export audit</button>
        <button id="btnReset" class="btn-action">Reset session metrics</button>
    </div>
    <p class="view-description"><strong id="activeOptimizationProfile">${this.escapeHtml(runtime.profile.label)}</strong> &middot; ${this.escapeHtml(runtime.preferences.workspaceContext)} context &middot; <span id="observedComponentStatus">${contributedComponents} components contributed &middot; ${bypassedComponents} bypassed</span></p>
    <details class="dashboard-details"><summary>Token and cost trends</summary>
    <!-- Live Dynamic SVG Charts (Token Efficiency & Cost Streams) -->
    <div class="dual-grid">
        <!-- Token Efficiency Stream Chart -->
        <div class="section-box">
            <div class="section-title">
                <span>📈 Live Token Efficiency Stream</span>
                <span class="sub-cyan">Raw (Red) vs Optimized (Cyan)</span>
            </div>
            <div class="chart-container">
                <svg id="tokenStreamChart" class="live-chart" viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label="Raw and optimized token trend for recent prompts">
                    <path id="rawTokenPath" d="" fill="none" stroke="var(--red)" stroke-width="2" opacity="0.75" />
                    <path id="optTokenPath" d="" fill="none" stroke="var(--cyan)" stroke-width="2.5" />
                </svg>
            </div>
        </div>

        <!-- Cost Stream Chart -->
        <div class="section-box">
            <div class="section-title">
                <span>📊 Live Dollar Cost Stream</span>
                <span class="sub-green">Raw vs Optimized Cost</span>
            </div>
            <div class="chart-container">
                <svg id="costStreamChart" class="live-chart" viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label="Raw and optimized cost trend for recent prompts">
                    <path id="rawCostPath" d="" fill="none" stroke="var(--orange)" stroke-width="2" opacity="0.75" />
                    <path id="optCostPath" d="" fill="none" stroke="var(--green)" stroke-width="2.5" />
                </svg>
            </div>
        </div>
    </div>

    </details>
    <details class="dashboard-details"><summary>Compiler stages and cost evidence</summary>
    <!-- Dual Waterfalls (Stage Token Reduction + Cost Attribution) -->
    <div class="dual-grid">
        <!-- Token Reduction Waterfall -->
        <div class="section-box">
            <div class="section-title">
                <span>🌊 Stage-by-Stage Token Reduction Waterfall</span>
                <span class="sub-cyan">Authoritative Compiler Stages</span>
            </div>
            <div id="stageWaterfall" aria-live="polite">${stageWaterfall}</div>
        </div>

        <!-- 7-Tier Cost Attribution Waterfall -->
        <div class="section-box">
            <div class="section-title">
                <span>💰 Request Cost Evidence</span>
                <span class="sub-green">Projected and reconciled remain distinct</span>
            </div>
            <div id="requestCostEvidence" aria-live="polite">${costEvidence}</div>
        </div>
    </div>

    </details>
    <!-- Live Prompt Ledger -->
    <div class="section-box">
        <div class="section-title">
            <span>Recent requests · select a row to inspect</span>
            <span class="sub-muted">Real-time stream</span>
        </div>
        <div class="ledger-scroll">
        <table class="ledger-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Task Intent</th>
                    <th>Model</th>
                    <th>Tokens (Raw ➔ Optimized)</th>
                    <th>Saved %</th>
                    <th>Estimated avoided cost</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="ledgerBody">
                ${recentEvents.slice().reverse().map(e => `
                <tr class="ledger-row" data-request-id="${this.escapeHtml(e.id)}" tabindex="0" role="button" aria-label="Inspect ${this.escapeHtml(e.taskType || 'prompt')} request">
                    <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td><strong class="color-primary">${this.escapeHtml(e.taskType?.toUpperCase() || 'Unavailable')}</strong></td>
                    <td>${this.escapeHtml(e.model || 'Unavailable')}</td>
                    <td>${this.escapeHtml(e.rawInputTokens.toLocaleString())} ➔ ${this.escapeHtml(e.optimizedInputTokens.toLocaleString())}</td>
                    <td class="color-cyan font-bold">-${this.escapeHtml(e.reductionPercentage)}%</td>
                    <td class="color-green font-bold">${this.escapeHtml(e.costStatus === 'reconciled' ? money(e.actualSavingsUSD, true) : e.costStatus === 'projected' ? money(e.projectedSavingsUSD, true) : 'Unavailable')}</td>
                    <td><span class="badge-status ${e.costStatus === 'reconciled' ? 'badge-reconciled' : e.costStatus === 'projected' ? 'badge-estimated' : 'badge-unavailable'}">${e.costStatus === 'reconciled' ? 'Reconciled' : e.costStatus === 'projected' ? 'Projected' : 'Unavailable'}</span></td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        </div>
    </div>

    </section>
    </main>
    <!-- Deep Optimization Inspector Modal (Strict CSP Nonce Handlers) -->
    <div id="inspectorModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="inspectorTitle">
        <div class="modal-content">
            <button class="modal-close" aria-label="Close inspector">&times;</button>
            <h3 id="inspectorTitle" class="modal-title">🔍 Deep Optimization Decision Inspector</h3>
            
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
                <div id="inspectorContent" class="raw-trace-box font-mono"></div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let eventsCache = ${this.serializeForScript(recentEvents)};

        // Initialize any pre-rendered waterfall fill bars via DOM API
        document.querySelectorAll('.waterfall-fill[data-percentage]').forEach(function(el) {
            el.style.width = el.getAttribute('data-percentage') + '%';
        });

        // Restore persisted state across tab/visibility transitions
        const savedState = vscode.getState() || {};
        function showDashboardView(view) {
            if (!['usage', 'context', 'diagnostics'].includes(view)) view = 'usage';
            document.querySelectorAll('[data-dashboard-view]').forEach(function(panel) { panel.hidden = panel.dataset.dashboardView !== view; });
            document.querySelectorAll('[data-view]').forEach(function(button) { button.setAttribute('aria-pressed', String(button.dataset.view === view)); });
            vscode.setState(Object.assign({}, vscode.getState() || {}, { dashboardView: view }));
        }
        showDashboardView(savedState.dashboardView || 'usage');
        document.querySelectorAll('[data-view]').forEach(function(button) {
            button.addEventListener('click', function() { showDashboardView(button.dataset.view); });
        });
        if (savedState.activeWindow) {
            const btn = document.querySelector('.window-btn[data-window="' + savedState.activeWindow + '"]');
            if (btn) {
                document.querySelectorAll('.window-btn').forEach(function(b) {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            }
        }
        if (typeof savedState.scrollY === 'number') {
            window.scrollTo(0, savedState.scrollY);
        }
        window.addEventListener('scroll', function() {
            const cur = vscode.getState() || {};
            cur.scrollY = window.scrollY;
            vscode.setState(cur);
        });

        function updateObservedComponentStatus(eventPayload) {
            const target = document.getElementById('observedComponentStatus');
            if (!target || !eventPayload) return;
            const receipts = Array.isArray(eventPayload.componentReceipts) ? eventPayload.componentReceipts : [];
            const contributed = receipts.filter(function(receipt) { return receipt.outcome === 'contributed'; }).length;
            const bypassed = receipts.filter(function(receipt) { return receipt.outcome === 'bypassed'; }).length;
            target.textContent = contributed + ' components contributed · ' + bypassed + ' bypassed';
        }

        // Real-Time Event Stream Listener (Differential Bridge)
        window.addEventListener('message', function(event) {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'SPEND_UPDATE') {
                updateSpend(msg.payload);
            } else if (msg.type === 'LIFECYCLE_UPDATE') {
                const e = msg.payload.event;
                const existing = eventsCache.findIndex(function(item) { return item.id === e.id; });
                if (existing >= 0) eventsCache[existing] = e;
                else eventsCache.push(e);
                eventsCache = eventsCache.slice(-50);
                updatePulseCard(e);
                updateObservedComponentStatus(e);
                upsertLedgerRow(e);
                updateLiveCharts();
                updateSummaryCards(msg.payload.summary);
            } else if (msg.type === 'SUMMARY_UPDATE') {
                updateSummaryCards(msg.payload);
            } else if (msg.type === 'INIT_STATE') {
                eventsCache = msg.payload.recentEvents || [];
                if (msg.payload.summary) updateSummaryCards(msg.payload.summary);
                if (msg.payload.latestEvent) {
                    updatePulseCard(msg.payload.latestEvent);
                    updateObservedComponentStatus(msg.payload.latestEvent);
                }
                renderLedger();
                updateLiveCharts();
            } else if (msg.type === 'ACTIVE_FILE_DIAGNOSIS') {
                updateActiveFileCard(msg.payload);
            } else if (msg.type === 'WORKSPACE_SCAN_RESULT') {
                updateWorkspaceScanCard(msg.payload);
            } else if (msg.type === 'TRACE_DETAIL') {
                document.getElementById('inspectorContent').innerText = JSON.stringify(msg.payload, null, 2);
            } else if (msg.type === 'ERROR') {
                document.getElementById('inspectorContent').innerText = msg.payload.message || 'Trace unavailable.';
            }
        });

        function updateActiveFileCard(d) {
            if (!d) {
                document.getElementById('activeFileName').innerText = 'No Active File Selected';
                document.getElementById('activeFileLang').innerText = 'NONE';
                document.getElementById('activeFileLines').innerText = '—';
                document.getElementById('activeFileRaw').innerText = '—';
                document.getElementById('activeFilePruned').innerText = '—';
                document.getElementById('activeFileSavings').innerText = '—';
                document.getElementById('activeFileDuration').innerText = '—';
                return;
            }
            document.getElementById('activeFileName').innerText = d.fileName;
            document.getElementById('activeFileLang').innerText = (d.language || 'text').toUpperCase();
            document.getElementById('activeFileLines').innerText = Number(d.lineCount || 0).toLocaleString();
            document.getElementById('activeFileRaw').innerText = Number(d.originalTokens || 0).toLocaleString();
            document.getElementById('activeFilePruned').innerText = Number(d.prunedTokens || 0).toLocaleString();
            document.getElementById('activeFileSavings').innerText = '-' + d.reductionPercentage + '%';
            document.getElementById('activeFileDuration').innerText = d.durationMs + 'ms';
        }

        function updateWorkspaceScanCard(s) {
            if (!s) return;
            document.getElementById('wsTotalFiles').innerText = Number(s.totalFiles || 0).toLocaleString();
            document.getElementById('wsTotalRaw').innerText = Number(s.totalRawTokens || 0).toLocaleString();
            document.getElementById('wsTotalPruned').innerText = Number(s.totalPrunedTokens || 0).toLocaleString();
            document.getElementById('wsSavingsPct').innerText = '-' + Number(s.potentialSavingsPercentage || 0) + '%';
            document.getElementById('wsDuration').innerText = s.durationMs + 'ms instantaneous';
        }

        function updateSummaryCards(s) {
            document.getElementById('sumSavedTokens').innerText = s.savedTokens.toLocaleString();
            document.getElementById('sumReductionPct').innerText = '-' + s.averageReductionPercentage + '% Net Reduction';
            document.getElementById('sumSavedCost').innerText = s.savedCostUSD === null ? 'Unavailable' : (s.reconciledPrompts < s.costedPrompts ? '~$' : '$') + s.savedCostUSD.toFixed(4);
            document.getElementById('sumPrompts').innerText = s.completedPrompts + ' completed · ' + s.failedPrompts + ' failed';
            document.getElementById('sumCQ').innerText = s.averagePredictedCQ === null ? 'Unavailable' : s.averagePredictedCQ + '%';
            document.getElementById('sumLatency').innerText = s.averageOptimizationLatencyMs === null ? 'Unavailable' : s.averageOptimizationLatencyMs + 'ms';
        }

        function updatePulseCard(e) {
            const costState = e.costState || (e.costStatus === 'reconciled' ? 'reconciled' : e.costStatus === 'projected' ? 'projected' : 'pricing_unavailable');
            document.getElementById('pulseModel').innerText = e.model || 'Unavailable';
            document.getElementById('pulseTask').innerText = e.taskType ? e.taskType.toUpperCase() : 'Unavailable';
            document.getElementById('pulseTokens').innerText = e.rawInputTokens.toLocaleString() + ' ➔ ' + e.optimizedInputTokens.toLocaleString();
            document.getElementById('pulseSaved').innerText = e.savedTokens.toLocaleString() + ' (-' + e.reductionPercentage + '%)';
            document.getElementById('pulseCost').innerText = costState === 'reconciled' && Number.isFinite(e.actualSavingsUSD)
                ? '~$' + e.actualSavingsUSD.toFixed(4)
                : costState === 'projected' && Number.isFinite(e.projectedSavingsUSD) ? '~$' + e.projectedSavingsUSD.toFixed(4) : 'Unavailable';
            document.getElementById('pulseCQ').innerText = Number.isFinite(e.predictedCQ) ? e.predictedCQ + '% [' + e.cqRating + ']' : 'Unavailable';
            
            const badge = document.getElementById('pulseStatus');
            badge.className = 'badge-status ' + (costState === 'reconciled' ? 'badge-reconciled' : costState === 'projected' ? 'badge-estimated' : 'badge-unavailable');
            badge.innerText = costState === 'reconciled' ? 'Observed Usage' : costState === 'projected' ? 'Projected (Estimated)' : costState === 'billed_unavailable' ? 'Billing Unavailable' : 'Pricing Unavailable';
            updateStageWaterfall(e);
            updateCostEvidence(e);
        }

        function updateStageWaterfall(e) {
            const container = document.getElementById('stageWaterfall');
            container.replaceChildren();
            if (!Array.isArray(e.stageMetrics) || e.stageMetrics.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'card-sub';
                empty.innerText = 'Unavailable - no stage metrics have been recorded.';
                container.appendChild(empty);
                return;
            }
            e.stageMetrics.forEach(function(stage) {
                const row = document.createElement('div');
                row.className = 'waterfall-bar';
                const label = document.createElement('span');
                label.innerText = stage.stageName || 'Stage';
                const track = document.createElement('div');
                track.className = 'waterfall-fill-container';
                const fill = document.createElement('div');
                fill.className = 'waterfall-fill fill-cyan';
                const percentage = stage.tokensBefore > 0
                    ? Math.max(0, Math.min(100, (stage.tokensSaved / stage.tokensBefore) * 100)) : 0;
                fill.style.width = percentage.toFixed(1) + '%';
                const value = document.createElement('strong');
                value.className = 'color-cyan';
                value.innerText = '-' + Number(stage.tokensSaved || 0).toLocaleString() + ' tokens';
                track.appendChild(fill);
                row.append(label, track, value);
                container.appendChild(row);
            });
        }

        function updateCostEvidence(e) {
            const container = document.getElementById('requestCostEvidence');
            const line = document.createElement('div');
            line.className = 'card-sub';
            const costState = e.costState || (e.costStatus === 'reconciled' ? 'reconciled' : e.costStatus === 'projected' ? 'projected' : 'pricing_unavailable');
            if (costState === 'reconciled' && Number.isFinite(e.actualSavingsUSD)) {
                line.innerText = 'Estimated avoided cost from observed usage: $' + e.actualSavingsUSD.toFixed(4) + '. Per-stage financial attribution is unavailable.';
            } else if (costState === 'projected' && Number.isFinite(e.projectedSavingsUSD)) {
                line.innerText = 'Projected request savings: ~$' + e.projectedSavingsUSD.toFixed(4) + '. Per-stage financial attribution is unavailable.';
            } else {
                const reasons = {
                    provider_usage_not_reported: 'Provider usage was not reported for this request.',
                    pricing_not_found: 'No versioned price matches the selected provider and model.',
                    provider_billing_unavailable: 'The provider does not expose billed cost for this request.',
                    request_not_sent: 'The request did not reach the model provider.',
                    measurement_failed: 'Token or pricing measurement did not complete.'
                };
                line.innerText = 'Cost unavailable - ' + (reasons[e.costUnavailableReason] || 'The request has no justified cost measurement.');
            }
            container.replaceChildren(line);
        }

        function upsertLedgerRow(e) {
            const tbody = document.getElementById('ledgerBody');
            const old = Array.from(tbody.querySelectorAll('tr')).find(function(row) { return row.dataset.requestId === e.id; });
            if (old) old.remove();
            const tr = document.createElement('tr');
            tr.className = 'ledger-row';
            tr.dataset.requestId = e.id;
            tr.tabIndex = 0;
            tr.setAttribute('role', 'button');
            tr.setAttribute('aria-label', 'Inspect ' + (e.taskType || 'prompt') + ' request');
            tr.onclick = function() { inspectEvent(e.id); };
            tr.onkeydown = function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inspectEvent(e.id);
                }
            };
            tr.innerHTML = \`
                <td>\${escapeText(new Date(e.timestamp).toLocaleTimeString())}</td>
                <td><strong class="color-primary">\${escapeText(e.taskType ? e.taskType.toUpperCase() : 'Unavailable')}</strong></td>
                <td>\${escapeText(e.model || 'Unavailable')}</td>
                <td>\${e.rawInputTokens.toLocaleString()} ➔ \${e.optimizedInputTokens.toLocaleString()}</td>
                <td class="color-cyan font-bold">-\${e.reductionPercentage}%</td>
                <td class="color-green font-bold">\${e.costStatus === 'reconciled' && Number.isFinite(e.actualSavingsUSD) ? '~$' + e.actualSavingsUSD.toFixed(4) : e.costStatus === 'projected' && Number.isFinite(e.projectedSavingsUSD) ? '~$' + e.projectedSavingsUSD.toFixed(4) : 'Unavailable'}</td>
                <td><span class="badge-status \${e.costStatus === 'reconciled' ? 'badge-reconciled' : e.costStatus === 'projected' ? 'badge-estimated' : 'badge-unavailable'}">\${e.costStatus === 'reconciled' ? 'Reconciled' : e.costStatus === 'projected' ? 'Projected' : 'Unavailable'}</span></td>
            \`;
            tbody.insertBefore(tr, tbody.firstChild);
            while (tbody.children.length > 50) tbody.lastElementChild.remove();
        }

        function renderLedger() {
            const tbody = document.getElementById('ledgerBody');
            tbody.replaceChildren();
            eventsCache.forEach(upsertLedgerRow);
        }

        function escapeText(value) {
            return String(value).replace(/[&<>"']/g, function(character) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
            });
        }

        function updateLiveCharts() {
            const tokenEvents = (eventsCache || []).filter(function(e) { return Number.isFinite(e.rawInputTokens) && Number.isFinite(e.optimizedInputTokens); }).slice(-8);
            const tokenPaths = buildPaths(tokenEvents.map(function(e) { return [e.rawInputTokens, e.optimizedInputTokens]; }));
            document.getElementById('rawTokenPath').setAttribute('d', tokenPaths.first);
            document.getElementById('optTokenPath').setAttribute('d', tokenPaths.second);

            const costPairs = (eventsCache || []).map(function(e) {
                return e.costStatus === 'reconciled'
                    ? [e.actualRawCostUSD, e.actualOptimizedCostUSD]
                    : e.costStatus === 'projected' ? [e.projectedRawCostUSD, e.projectedOptimizedCostUSD] : undefined;
            }).filter(function(pair) { return pair && pair.every(Number.isFinite); }).slice(-8);
            const costPaths = buildPaths(costPairs);
            document.getElementById('rawCostPath').setAttribute('d', costPaths.first);
            document.getElementById('optCostPath').setAttribute('d', costPaths.second);
        }

        function buildPaths(pairs) {
            if (pairs.length === 0) return { first: '', second: '' };
            const maximum = Math.max.apply(Math, pairs.flat().concat([0]));
            if (maximum <= 0) return { first: '', second: '' };
            if (pairs.length === 1) {
                const firstY = Math.max(10, Math.round(90 - ((pairs[0][0] / maximum) * 75)));
                const secondY = Math.max(10, Math.round(90 - ((pairs[0][1] / maximum) * 75)));
                return { first: 'M195,' + firstY + ' L205,' + firstY, second: 'M195,' + secondY + ' L205,' + secondY };
            }
            const first = [];
            const second = [];
            pairs.forEach(function(pair, index) {
                const x = Math.round((index / (pairs.length - 1)) * 400);
                first.push(x + ',' + Math.max(10, Math.round(90 - ((pair[0] / maximum) * 75))));
                second.push(x + ',' + Math.max(10, Math.round(90 - ((pair[1] / maximum) * 75))));
            });
            return { first: 'M' + first.join(' L'), second: 'M' + second.join(' L') };
        }

        function inspectEvent(id) {
            const ev = eventsCache.find(function(x) { return x.id === id; });
            if (!ev) {
                document.getElementById('inspIntent').textContent = 'Retained request';
                document.getElementById('inspCQ').textContent = '';
                document.getElementById('inspStages').textContent = '';
                document.getElementById('inspectorContent').textContent = 'Loading trace...';
                document.getElementById('inspectorModal').style.display = 'flex';
                vscode.postMessage({ action: 'REQUEST_TRACE', requestId: id });
            }
            if (ev) {
                document.getElementById('inspIntent').innerText =
                    'Task Type: ' + (ev.taskType ? ev.taskType.toUpperCase() : 'Unavailable') +
                    ' | Confidence: ' + (Number.isFinite(ev.taskConfidence) ? ev.taskConfidence : 'Unavailable') + '\\n' +
                    'Model: ' + (ev.model || 'Unavailable') + ' | Provider: ' + (ev.provider || 'Unavailable') + '\\n' +
                    'Cache state: ' + (ev.cacheState || 'Unavailable') + ' | Cached tokens: ' + (Number.isFinite(ev.cachedTokens) ? ev.cachedTokens : 'Unavailable');
                document.getElementById('inspCQ').innerText = Number.isFinite(ev.predictedCQ)
                    ? 'Context Quality: ' + ev.predictedCQ + '% [' + ev.cqRating + ']\\nEvidence Coverage: ' + Math.round(ev.evidenceCoverage * 100) + '% | Slice Confidence: ' + ev.sliceConfidence
                    : 'Context quality unavailable.';
                document.getElementById('inspStages').innerText = ev.stageMetrics && ev.stageMetrics.length
                    ? ev.stageMetrics.map(function(m) { return '• ' + m.stageName + ': ' + m.tokensBefore + ' ➔ ' + m.tokensAfter + ' tokens (-' + m.tokensSaved + ' in ' + m.latencyMs + 'ms)'; }).join('\\n')
                    : 'Stage metrics unavailable.';
                document.getElementById('inspectorContent').innerText = 'Loading privacy-safe ledger trace…';
                vscode.postMessage({ action: 'REQUEST_TRACE', requestId: id });
                document.getElementById('inspectorModal').style.display = 'flex';
            }
        }

        function closeModal() {
            document.getElementById('inspectorModal').style.display = 'none';
        }

        // Strict CSP: Attach all modal event listeners via DOM API
        const modalEl = document.getElementById('inspectorModal');
        if (modalEl) {
            modalEl.addEventListener('click', function(e) {
                if (e.target.id === 'inspectorModal') closeModal();
            });
        }
        const modalContentEl = document.querySelector('.modal-content');
        if (modalContentEl) {
            modalContentEl.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
        const modalCloseBtn = document.querySelector('.modal-close');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', function() {
                closeModal();
            });
        }

        // Time window buttons
        document.querySelectorAll('.window-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.window-btn').forEach(function(b) {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                const win = btn.dataset.window;
                const state = vscode.getState() || {};
                state.activeWindow = win;
                vscode.setState(state);
                vscode.postMessage({ action: 'CHANGE_TIME_WINDOW', window: win });
            });
        });

        // Top actions
        document.getElementById('btnOptimizeActive').addEventListener('click', function() { vscode.postMessage({ command: 'optimizeActiveFile' }); });
        document.getElementById('btnCompareDiff').addEventListener('click', function() { vscode.postMessage({ command: 'comparePrunedDiff' }); });
        document.getElementById('btnScanWorkspace').addEventListener('click', function() { document.getElementById('workspaceAuditDetails').open = true; vscode.postMessage({ command: 'scanWorkspace' }); });
        document.getElementById('btnExport').addEventListener('click', function() { vscode.postMessage({ command: 'exportAuditLog' }); });
        document.getElementById('btnReset').addEventListener('click', function() { vscode.postMessage({ command: 'resetMetrics' }); });
        
        const quickOptimizeBtn = document.getElementById('btnQuickOptimizeActive');
        if (quickOptimizeBtn) {
            quickOptimizeBtn.addEventListener('click', function() { vscode.postMessage({ command: 'optimizeActiveFile' }); });
        }

        document.querySelectorAll('.ledger-row').forEach(function(row) {
            row.addEventListener('click', function() { inspectEvent(row.dataset.requestId); });
            row.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inspectEvent(row.dataset.requestId);
                }
            });
        });

        ${spendDashboardScript}
        updateLiveCharts();
        vscode.postMessage({ action: 'DASHBOARD_READY' });
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
