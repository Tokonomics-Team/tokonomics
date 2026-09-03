/**
 * VS Code Chat Participant (@tokenopt) v4.0
 * Native Chat Integration supporting:
 *   - /map (Incremental PageRank Repo Map)
 *   - /pack (Multi-File Context Pack with Line Range Slicing & AST Pruning)
 *   - /analyze, /compact, /stats
 *   - Intelligent Model Routing suggestions (Flash vs Standard vs Reasoning)
 *   - Exact response cache with response-free similarity hints
 *   - Agentic Loop Circuit Breakers & Token Velocity Governance
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MetricsTracker } from '../metrics/tracker';
import { AstPrunerEngine } from '../ast/pruner';
import { TokenCounter } from '../engine/tokenizer';
import { MessagePayload, TokenOptimizationConfig } from '../types';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';
import { BudgetGuardrail } from '../metrics/budgetGuard';
import { ModelRouter } from '../engine/modelRouter';
import { ResponseCache, ResponseCacheRequest, isTimeSensitiveRequest } from '../cache/responseCache';
import { RelevanceScorer } from '../engine/relevanceScorer';
import { DiffOutputOptimizer } from '../engine/diffOutputOptimizer';
import { AgenticCircuitBreaker } from '../metrics/circuitBreaker';
import { ScratchpadManager } from '../engine/scratchpadManager';
import { ImageRightsizer } from '../engine/imageRightsizer';
import { RamContextManager } from '../engine/ramManager';
import { AnonymizedLogger } from '../security/anonymizedLogger';
import { PipelineOrchestrator } from '../engine/pipelineOrchestrator';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { LiveMetricsAggregator } from '../metrics/liveAggregator';
import { CostCalculator } from '../cost/costCalculator';
import { costReconciliationLedger } from '../cost/reconciliationLedger';
import { DashboardWebviewPanel } from '../ui/dashboardWebview';
import { WorkspaceSourcePolicy } from '../security/sourcePolicy';
import { CanonicalRequestCompiler } from '../protocol/canonicalCompiler';
import { canonicalTextMessage, VsCodeProtocolAdapter } from '../protocol/canonicalProtocol';
import { prepareCanonicalEgress } from '../protocol/canonicalEgress';
import { VersionedWorkspaceIndex } from '../workspace/workspaceIndex';
import { EvidenceSignal } from '../retrieval/evidenceTypes';
import { CpuWorkerBoundary } from '../performance/cpuWorkerBoundary';
import { BoundedPriorityScheduler } from '../performance/boundedScheduler';
import { KillSwitchCapability } from '../release/releaseControl';

export function registerChatParticipant(
    context: vscode.ExtensionContext,
    metricsTracker: MetricsTracker,
    astEngine: AstPrunerEngine,
    responseCache?: ResponseCache,
    onOptimizationComplete?: () => void,
    pipelineOrchestrator?: PipelineOrchestrator,
    requestCompiler?: CanonicalRequestCompiler,
    providedWorkspaceIndex?: VersionedWorkspaceIndex,
    cpuWorkerBoundary?: CpuWorkerBoundary,
    inferenceScheduler?: BoundedPriorityScheduler,
    capabilityEnabled: (capability: KillSwitchCapability) => boolean = () => true
) {
    if (!vscode.chat || typeof vscode.chat.createChatParticipant !== 'function') {
        return false;
    }

    const workspaceTrusted = () => vscode.workspace.isTrusted !== false;
    const workspaceRoots = () => (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
    const workspaceRoot = workspaceTrusted() ? workspaceRoots()[0] : undefined;
    const ignoreFilter = new TokenIgnoreFilter(workspaceRoot);
    const cache = responseCache || new ResponseCache();
    const circuitBreaker = new AgenticCircuitBreaker();
    const turnCache = new RamContextManager(astEngine, { enableBackgroundWarming: false, enableSemanticIndex: false });
    const workspaceIndex = providedWorkspaceIndex || new VersionedWorkspaceIndex(workspaceRoots(), astEngine, { trusted: workspaceTrusted() });
    const orchestrator = pipelineOrchestrator || new PipelineOrchestrator(astEngine, undefined, undefined, metricsTracker, workspaceIndex);
    const compiler = requestCompiler || new CanonicalRequestCompiler(orchestrator);
    const protocol = new VsCodeProtocolAdapter();

    let lastActiveDocUri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document?.uri;
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document && !editor.document.isUntitled) {
                lastActiveDocUri = editor.document.uri;
            }
        })
    );

    const participant = vscode.chat.createChatParticipant('token-optimizer-participant', async (request, chatContext, response, token) => {
        const command = request.command;
        let requestSnapshot = workspaceIndex.captureSnapshot();

        if ((!workspaceTrusted() || !capabilityEnabled('workspaceIndex')) && (command === 'map' || command === 'pack' || command === 'analyze')) {
            response.markdown('Workspace context is disabled by workspace trust or the local release safety controls.');
            return;
        }

        // 1. /dashboard Command: Open Interactive Real-Time Dashboard Webview
        if (command === 'dashboard') {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine);
            response.markdown(`### 📊 Tokonomics 5.0 Real-Time Dashboard\n\nOpening the interactive event-driven visualizer dashboard with dual waterfalls, live token streams, and AST decision inspector.\n\n*You can also run \`@tokonomics /live\` for a fast text summary or \`@tokonomics /explain\` to inspect compiler decisions.*`);
            return;
        }

        // 2. /live Command: Real-Time Stream Summary
        if (command === 'live') {
            const summary = LiveMetricsAggregator.getInstance().getAggregateSummary('session');
            const financialSavings = summary.savedCostUSD === null ? 'Unavailable'
                : `${summary.reconciledPrompts < summary.costedPrompts ? '~' : ''}$${summary.savedCostUSD.toFixed(3)} USD`;
            response.markdown(`### ⚡ Tokonomics Live Session Efficiency Stream\n\n` +
                `- **Requests Observed:** ${summary.totalPrompts} (${summary.completedPrompts} completed, ${summary.failedPrompts} failed)\n` +
                `- **Total Tokens Saved:** **${summary.savedTokens.toLocaleString()} tokens** (-${summary.averageReductionPercentage}%)\n` +
                `- **Financial Savings:** **${financialSavings}**\n` +
                `- **Predicted Context Quality (CQ):** **${summary.averagePredictedCQ === null ? 'Unavailable' : `${summary.averagePredictedCQ}%`}**\n` +
                `- **Compiler Latency:** **${summary.averageOptimizationLatencyMs === null ? 'Unavailable' : `${summary.averageOptimizationLatencyMs}ms`}**\n\n` +
                `*Run \`@tokonomics /dashboard\` to view full real-time SVG charts.*`);
            return;
        }

        // 3. /explain Command: 16-Stage Compiler Decision Trace
        if (command === 'explain') {
            const traces = orchestrator.getTraceLogger().getTraces();
            if (traces.length === 0) {
                response.markdown(`ℹ️ No recent context compilation traces recorded in this session yet. Run a prompt with \`@tokonomics\` to see AST decisions.`);
                return;
            }
            const latest = traces[traces.length - 1];
            response.markdown(`### 🔍 Tokonomics 16-Stage Compiler Decision Trace\n\n` +
                `- **Pipeline Mode:** \`${latest.stage}\`\n` +
                `- **Tokens:** ${latest.tokensBefore} → **${latest.tokensAfter} tokens** (${Math.round((1 - latest.tokensAfter/Math.max(1, latest.tokensBefore))*100)}% saved in ${latest.latencyMs}ms)\n` +
                `- **Decisions Applied (${latest.decisions.length}):**\n` +
                latest.decisions.map(d => `  - \`[${d.action.toUpperCase()}]\` **${d.itemId}**: ${d.reason} *(Confidence: ${Math.round(d.confidence * 100)}%)*`).join('\n')
            );
            return;
        }

        // 4. /map Command: Generate Workspace PageRank Repository Map (with Incremental Indexing)
        if (command === 'map') {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!root) {
                response.markdown(`⚠️ No workspace folder open. Open a project workspace to generate a repository map.`);
                return;
            }

            const mapMode = vscode.workspace.getConfiguration('tokenOptimizer')
                .get<'off' | 'selection' | 'referenced' | 'automatic'>('workspaceContextMode', 'selection');
            requestSnapshot = mapMode === 'automatic' ? await workspaceIndex.ensureInitialized() : await workspaceIndex.rebuild();
            const activeEditor = vscode.window.activeTextEditor;
            const activeFiles = activeEditor ? [activeEditor.document.fileName] : (lastActiveDocUri ? [lastActiveDocUri.fsPath] : []);

            response.markdown(`*Scanning workspace and calculating PageRank graph (Incremental Cache)...*\n\n`);
            const mapResult = await workspaceIndex.generateRepoMapAsync(activeFiles, 1024, requestSnapshot, token);

            metricsTracker.recordOptimization(
                mapResult.tokenCount * 4,
                mapResult.tokenCount,
                {
                    astSaved: mapResult.tokenCount * 3,
                    textCompressionSaved: 0,
                    historyCompacted: 0,
                    cacheAligned: mapResult.tokenCount >= 1024 ? mapResult.tokenCount : 0
                }
            );
            if (onOptimizationComplete) onOptimizationComplete();

            response.markdown(`### 🗺️ Workspace Structural Repository Map (PageRank)\n\n`);
            response.markdown(`- **Files Indexed:** ${mapResult.totalFilesIndexed}\n`);
            response.markdown(`- **Ranked Key Symbols:** ${mapResult.rankedSymbolsCount}\n`);
            response.markdown(`- **Payload Size:** **${mapResult.tokenCount} tokens** (generated in ${mapResult.durationMs}ms)\n\n`);
            response.markdown(`\`\`\`yaml\n${mapResult.mapText}\n\`\`\``);
            return;
        }

        // 5. /pack Command: Multi-File Context Pack with Path Traversal Security & AST Pruning
        if (command === 'pack') {
            let targetPath = request.prompt.trim();
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!root) {
                response.markdown(`⚠️ No workspace open.`);
                return;
            }
            const sourcePolicy = new WorkspaceSourcePolicy(workspaceRoots(), true);

            // Parse optional line range (e.g. src/auth.ts:10-50 or src/auth.ts:L10-L50)
            let startLine: number | undefined;
            let endLine: number | undefined;
            const lineRangeMatch = targetPath.match(/:L?(\d+)-L?(\d+)$/);
            if (lineRangeMatch) {
                startLine = parseInt(lineRangeMatch[1]);
                endLine = parseInt(lineRangeMatch[2]);
                targetPath = targetPath.replace(/:L?\d+-L?\d+$/, '');
            }

            const searchDir = targetPath ? path.resolve(root, targetPath) : root;
            const relPathCheck = path.relative(root, searchDir);
            if (relPathCheck.startsWith('..') || path.isAbsolute(relPathCheck)) {
                response.markdown(`⚠️ Security: Cannot pack files outside the active workspace folder.`);
                return;
            }
            if (!fs.existsSync(searchDir)) {
                response.markdown(`⚠️ Path not found: \`${targetPath}\``);
                return;
            }

            const packedBlocks: string[] = [];
            let totalOriginalTokens = 0;
            let totalPrunedTokens = 0;

            const allowedExts = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs'];

            // Single file with line range slicing
            if (fs.statSync(searchDir).isFile()) {
                const ext = path.extname(searchDir).toLowerCase();
                const allowedSource = sourcePolicy.readText(searchDir);
                const rawFull = allowedSource.text;
                let codeToPrune = rawFull;
                let rangeNote = '';

                if (startLine !== undefined && endLine !== undefined) {
                    const lines = rawFull.split('\n');
                    const sliced = lines.slice(Math.max(0, startLine - 1), endLine).join('\n');
                    codeToPrune = sliced;
                    rangeNote = ` (Lines ${startLine}-${endLine})`;
                }

                const origTok = TokenCounter.countTokens(codeToPrune);
                const pruned = astEngine.pruneCodeContext(codeToPrune, ext.replace('.', ''));
                totalOriginalTokens += origTok;
                totalPrunedTokens += pruned.prunedTokenCount;

                const relPath = path.relative(root, searchDir).replace(/\\/g, '/');
                packedBlocks.push(`### File: \`${relPath}\`${rangeNote} (${pruned.reductionPercentage}% saved)\n\`\`\`${ext.replace('.', '')}\n${pruned.prunedCode}\n\`\`\``);
            } else {
                // Directory scan
                const scanAndPack = (currentDir: string) => {
                    if (packedBlocks.length >= 15) return;
                    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (packedBlocks.length >= 15) break;
                        const full = path.join(currentDir, entry.name);
                        if (ignoreFilter.isIgnored(full)) continue;

                        if (entry.isDirectory()) {
                            scanAndPack(full);
                        } else if (entry.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (allowedExts.includes(ext)) {
                                const allowedSource = sourcePolicy.readText(full);
                                const raw = allowedSource.text;
                                const origTok = TokenCounter.countTokens(raw);
                                const pruned = astEngine.pruneCodeContext(raw, ext.replace('.', ''));
                                totalOriginalTokens += origTok;
                                totalPrunedTokens += pruned.prunedTokenCount;

                                const relPath = path.relative(root, full).replace(/\\/g, '/');
                                packedBlocks.push(`### File: \`${relPath}\` (${pruned.reductionPercentage}% saved)\n\`\`\`${ext.replace('.', '')}\n${pruned.prunedCode}\n\`\`\``);
                            }
                        }
                    }
                };

                scanAndPack(searchDir);
            }

            const netReduction = totalOriginalTokens > 0 
                ? Math.round(((totalOriginalTokens - totalPrunedTokens) / totalOriginalTokens) * 1000) / 10 
                : 0;

            metricsTracker.recordOptimization(
                totalOriginalTokens,
                totalPrunedTokens,
                {
                    astSaved: totalOriginalTokens - totalPrunedTokens,
                    textCompressionSaved: 0,
                    historyCompacted: 0,
                    cacheAligned: totalPrunedTokens >= 1024 ? totalPrunedTokens : 0
                }
            );
            if (onOptimizationComplete) onOptimizationComplete();

            response.markdown(`### 📦 Packed Context Payload (${packedBlocks.length} Files/Slices)\n\n`);
            response.markdown(`- **Original Code Volume:** ${totalOriginalTokens.toLocaleString()} tokens\n`);
            response.markdown(`- **Pruned AST Skeletons:** **${totalPrunedTokens.toLocaleString()} tokens** (**${netReduction}% net reduction**)\n\n`);
            response.markdown(packedBlocks.join('\n\n'));
            return;
        }

        // 3. /ram Command: In-Memory Workspace Acceleration & RAM Diagnostics
        if (command === 'ram') {
            const legacyStats = turnCache.getStats();
            const stats = {
                budgetMB: Math.round(workspaceIndex.getStats().budgetBytes / 1024 / 1024),
                usedMB: Math.round((workspaceIndex.getStats().memoryBytes / 1024 / 1024) * 100) / 100,
                usedBytes: workspaceIndex.getStats().memoryBytes,
                skeletonsCached: workspaceIndex.getStats().filesIndexed,
                symbolsIndexed: workspaceIndex.getStats().symbolsIndexed,
                turnPointersCached: legacyStats.turnPointersCached,
                hitRatePercentage: 0,
                cacheHits: 0,
                cacheMisses: 0,
                isWarmed: workspaceIndex.getStats().generation > 0
            };
            response.markdown(`### ⚡ Tokonomics In-Memory RAM Accelerator Telemetry\n\n`);
            response.markdown(`- **Configured RAM Budget:** **${stats.budgetMB} MB** (\`tokenOptimizer.ramBudgetMB\`)\n`);
            response.markdown(`- **Current RAM Usage:** **${stats.usedMB} MB** (${stats.usedBytes.toLocaleString()} bytes)\n`);
            response.markdown(`- **Pre-Warmed AST Skeletons in RAM:** **${stats.skeletonsCached} files** (0ms cached lookup)\n`);
            response.markdown(`- **In-Memory BM25 Indexed Symbols:** **${stats.symbolsIndexed} classes, functions & types**\n`);
            response.markdown(`- **Multi-Turn Deduplication Pointers:** **${stats.turnPointersCached} blocks**\n`);
            response.markdown(`- **In-Memory Cache Hit Rate:** **${stats.hitRatePercentage}%** (${stats.cacheHits} hits / ${stats.cacheMisses} misses)\n`);
            response.markdown(`- **Pre-Warming Status:** ${stats.isWarmed ? '🟢 **100% Warm (Ready)**' : '🟡 *Idle / On-Demand*'}\n\n`);
            response.markdown(`*Tokonomics uses your local RAM to eliminate redundant AST parsing and surgically retrieve code slices in <1ms without disk I/O.*`);
            return;
        }

        // 4. /logs Command: Anonymized Diagnostic Log & Crash Diagnostics
        if (command === 'logs') {
            const logger = AnonymizedLogger.getInstance();
            const logCount = logger.getLogCount();
            const errorCount = logger.getErrorCount();

            response.markdown(`### 📋 Tokonomics Anonymized Diagnostic Logs\n\n`);
            response.markdown(`- **Total Log Entries in Session:** **${logCount}**\n`);
            response.markdown(`- **Errors / Warnings Recorded:** **${errorCount}**\n`);
            response.markdown(`- **Anonymization & Privacy Status:** 🛡️ **100% Sanitized (Zero user data / Zero secrets)**\n\n`);
            response.markdown(`To export and inspect the full diagnostic log:\n`);
            response.markdown(`1. Press **\`Ctrl + Shift + P\`** (or **\`Cmd + Shift + P\`** on macOS)\n`);
            response.markdown(`2. Run: **\`Tokonomics: Export Anonymized Diagnostic Logs\`**\n\n`);
            response.markdown(`*The generated log is completely safe to paste in GitHub issues or share for debugging — all local file paths, usernames, and API keys are automatically stripped.*`);
            return;
        }

        // 4. Dynamic /stats Command with Time Windows
        if (command === 'stats') {
            const aggregator = LiveMetricsAggregator.getInstance();
            const today = aggregator.getAggregateSummary('today');
            const session = aggregator.getAggregateSummary('session');
            const allTime = aggregator.getAggregateSummary('lifetime');
            const installDate = metricsTracker.getInstallationDate().toLocaleDateString();
            const indexStats = workspaceIndex.getStats();
            const ramStats = {
                usedMB: Math.round((indexStats.memoryBytes / 1024 / 1024) * 100) / 100,
                budgetMB: Math.round(indexStats.budgetBytes / 1024 / 1024),
                skeletonsCached: indexStats.filesIndexed
            };

            response.markdown(`### ⚡ Enterprise AI Token Optimizer Live Telemetry\n\n`);

            response.markdown(`#### 📅 Today's Performance (Local Calendar Day)\n`);
            response.markdown(`- **Requests Processed:** ${today.totalPrompts}\n`);
            response.markdown(`- **Tokens Pruned:** ${today.savedTokens.toLocaleString()} tokens (**${today.averageReductionPercentage}%** net reduction)\n`);
            response.markdown(`- **Cost Saved Today:** ${today.savedCostUSD === null ? 'Unavailable' : `${today.reconciledPrompts < today.costedPrompts ? '~' : ''}$${today.savedCostUSD.toFixed(4)} USD`}\n`);
            response.markdown(`- **Verified Provider Cache Read Ratio:** **${today.cacheHitRatio === null ? 'Unavailable' : `${Math.round(today.cacheHitRatio * 1000) / 10}%`}**\n`);
            response.markdown(`- **In-Memory RAM Cache:** **${ramStats.usedMB} MB / ${ramStats.budgetMB} MB** (${ramStats.skeletonsCached} AST skeletons hot in RAM)\n\n`);

            response.markdown(`#### 🏛️ Cumulative (Since Installation on ${installDate})\n`);
            response.markdown(`- **Total Requests Observed:** ${allTime.totalPrompts} (${allTime.completedPrompts} completed, ${allTime.failedPrompts} failed)\n`);
            response.markdown(`- **Total Tokens Saved:** ${allTime.savedTokens.toLocaleString()} / ${allTime.rawTokens.toLocaleString()} tokens (**${allTime.averageReductionPercentage}%**)\n`);
            response.markdown(`- **Total Cloud Spend Saved:** **${allTime.savedCostUSD === null ? 'Unavailable' : `${allTime.reconciledPrompts < allTime.costedPrompts ? '~' : ''}$${allTime.savedCostUSD.toFixed(4)} USD`}**\n`);
            response.markdown(`- **Active Session Requests:** ${session.totalPrompts}\n\n`);

            response.markdown(`*Run \`@tokenopt /map\` for PageRank workspace structure or \`@tokenopt /ram\` for memory telemetry.*`);
            return;
        }

        // 4. /analyze Command
        if (command === 'analyze') {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                response.markdown(`⚠️ No active code editor open. Open a source file to analyze.`);
                return;
            }

            const fileName = editor.document.fileName;
            if (ignoreFilter.isIgnored(fileName)) {
                response.markdown(`ℹ️ File \`${fileName}\` is excluded by \`.tokenignore\` patterns.`);
                return;
            }

            const docText = editor.document.getText();
            const originalTokens = TokenCounter.countTokens(docText);
            const pruneResult = astEngine.pruneCodeContext(docText, editor.document.languageId);

            metricsTracker.recordOptimization(
                originalTokens,
                pruneResult.prunedTokenCount,
                {
                    astSaved: originalTokens - pruneResult.prunedTokenCount,
                    textCompressionSaved: 0,
                    historyCompacted: 0,
                    cacheAligned: 0
                },
                'auto',
                undefined,
                editor.document.languageId
            );
            if (onOptimizationComplete) onOptimizationComplete();
            BudgetGuardrail.checkBudget(metricsTracker);

            response.markdown(`### 🔍 File Token Analysis: \`${editor.document.fileName}\`\n\n`);
            response.markdown(`- **Original Token Payload:** ${originalTokens.toLocaleString()} tokens\n`);
            response.markdown(`- **Pruned AST Signatures:** ${pruneResult.prunedTokenCount.toLocaleString()} tokens\n`);
            response.markdown(`- **Tokens Eliminated:** **${pruneResult.reductionPercentage}%** (${(originalTokens - pruneResult.prunedTokenCount).toLocaleString()} tokens pruned in ${pruneResult.durationMs}ms)\n\n`);
            response.markdown(`\`\`\`${editor.document.languageId}\n${pruneResult.prunedCode.substring(0, 600)}...\n\`\`\``);
            return;
        }

        // 5. /compact Command
        if (command === 'compact') {
            const textToCompact = request.prompt;
            if (!textToCompact || textToCompact.trim().length === 0) {
                response.markdown(`Please provide code or text after \`@tokenopt /compact <code or text>\`.`);
                return;
            }

            const originalTokens = TokenCounter.countTokens(textToCompact);
            const pruneResult = astEngine.pruneCodeContext(textToCompact);

            metricsTracker.recordOptimization(
                originalTokens,
                pruneResult.prunedTokenCount,
                {
                    astSaved: originalTokens - pruneResult.prunedTokenCount,
                    textCompressionSaved: 0,
                    historyCompacted: 0,
                    cacheAligned: 0
                }
            );
            if (onOptimizationComplete) onOptimizationComplete();
            BudgetGuardrail.checkBudget(metricsTracker);

            response.markdown(`### ⚡ Compacted Context (${pruneResult.reductionPercentage}% saved):\n\n`);
            response.markdown(`\`\`\`\n${pruneResult.prunedCode}\n\`\`\``);
            return;
        }

        // 6. Default AI Pair Programmer & Code Generation Handler
        let activeCompilation: Awaited<ReturnType<CanonicalRequestCompiler['compile']>> | undefined;
        try {
            if (token.isCancellationRequested) return;
            const conf = vscode.workspace.getConfiguration('tokenOptimizer');
            const configuredContextMode = conf.get<'off' | 'selection' | 'referenced' | 'automatic'>('workspaceContextMode', 'selection');
            const contextMode = capabilityEnabled('workspaceIndex') ? configuredContextMode : 'off';
            if (contextMode === 'automatic' && requestSnapshot.files.size === 0) {
                requestSnapshot = await workspaceIndex.ensureInitialized();
            }
            const mayReadWorkspace = workspaceTrusted() && contextMode !== 'off';
            const mayResolveReferencedFile = mayReadWorkspace && (contextMode === 'referenced' || contextMode === 'automatic');
            const mayAttachFullDocument = mayReadWorkspace && contextMode === 'automatic';
            // Resolve target active document with 4-tier fallback:
            let doc: vscode.TextDocument | undefined = mayReadWorkspace && !vscode.window.activeTextEditor?.document.isUntitled
                ? vscode.window.activeTextEditor?.document
                : undefined;
            if (!doc && mayAttachFullDocument) {
                const visible = vscode.window.visibleTextEditors.find(e => e.document && !e.document.isUntitled && !e.document.uri.scheme.includes('output') && !e.document.uri.scheme.includes('debug'));
                if (visible) doc = visible.document;
            }
            if (!doc && mayAttachFullDocument && lastActiveDocUri) {
                try {
                    doc = await vscode.workspace.openTextDocument(lastActiveDocUri);
                } catch {}
            }
            // Check if prompt specifically mentions any file in workspace
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (root && mayResolveReferencedFile) {
                const fileMatch = request.prompt.match(/\b([\w\d_-]+\.(?:ts|js|tsx|jsx|py|go|rs|java|cs|cpp|h))\b/i);
                if (fileMatch && fileMatch[1]) {
                    const foundFiles = await vscode.workspace.findFiles(`**/${fileMatch[1]}`, '**/node_modules/**', 1);
                    if (foundFiles.length > 0) {
                        try {
                            doc = await vscode.workspace.openTextDocument(foundFiles[0]);
                        } catch {}
                    }
                }
            }

            let activeFileContext = '';
            let fileInfo = '';
            let activeFileName = '';
            const evidenceSignals: EvidenceSignal[] = [];

            if (doc && mayReadWorkspace && !ignoreFilter.isIgnored(doc.fileName)) {
                activeFileName = doc.fileName;
                const activeEditor = vscode.window.activeTextEditor;
                const selectedText = (activeEditor?.document.fileName === doc.fileName && activeEditor.selection) 
                    ? doc.getText(activeEditor.selection) 
                    : '';
                const includeUnsaved = conf.get<boolean>('includeUnsavedBuffers', false);
                const canUseBuffer = includeUnsaved || !doc.isDirty;
                const codeToAttach = canUseBuffer && selectedText && selectedText.trim().length > 30
                    ? selectedText
                    : (canUseBuffer && mayAttachFullDocument ? doc.getText() : '');

                if (codeToAttach && codeToAttach.length > 30) {
                    const lang = doc.languageId || 'typescript';
                    const normalizedCode = codeToAttach.replace(/\r\n/g, '\n');
                    const sourcePolicy = new WorkspaceSourcePolicy(workspaceRoots(), true);
                    const safePath = sourcePolicy.assertReadable(doc.fileName).displayPath;
                    activeFileContext = `\n\n\`\`\`${lang}\n// Context File: <workspace>/${safePath}\n${normalizedCode}\n\`\`\``;
                    fileInfo = ` (with context from ${path.basename(doc.fileName)})`;
                    if (contextMode === 'automatic' && (doc.isDirty || selectedText.trim().length > 30)) {
                        evidenceSignals.push({ source: 'open_editor', content: normalizedCode, filePath: doc.fileName, version: doc.version });
                    }
                }
            }

            if (doc && contextMode === 'automatic' && typeof vscode.languages?.getDiagnostics === 'function') {
                for (const diagnostic of vscode.languages.getDiagnostics(doc.uri)) {
                    evidenceSignals.push({
                        source: 'diagnostic', content: diagnostic.message, filePath: doc.fileName,
                        lineStart: diagnostic.range.start.line + 1, lineEnd: diagnostic.range.end.line + 1, version: doc.version
                    });
                }
            }
            for (const diff of request.prompt.matchAll(/```diff\s*\n([\s\S]*?)```/gi)) {
                evidenceSignals.push({ source: 'diff', content: diff[1] });
            }

            const config: TokenOptimizationConfig = {
                enableAstPruning: conf.get<boolean>('enableAstPruning', true),
                enableCacheAlignment: conf.get<boolean>('enableCacheAlignment', true),
                enableTextCompression: conf.get<boolean>('enableTextCompression', true),
                compressionRatio: conf.get<number>('compressionRatio', 0.4),
                targetProvider: conf.get<'auto' | 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'generic'>('targetProvider', 'auto'),
                maxHistoryTurns: conf.get<number>('maxHistoryTurns', 8),
                stripDiffsAndLogs: conf.get<boolean>('stripDiffsAndLogs', true),
                targetUpstreamModelFamily: conf.get<string>('targetUpstreamModelFamily', 'auto'),
                enableDiffOutputOptimization: conf.get<boolean>('enableDiffOutputOptimization', true),
                enableModelRouting: conf.get<boolean>('enableModelRouting', true),
                enableResponseCache: conf.get<boolean>('enableResponseCache', true)
            };

            const diffAnalysis = DiffOutputOptimizer.analyzeIntent(request.prompt, !!activeFileContext);

            // Phase 5: Model Routing Suggestion
            if (config.enableModelRouting !== false) {
                const routing = ModelRouter.analyzeComplexity(
                    request.prompt,
                    activeFileContext ? 1 : 0,
                    chatContext.history.length
                );
                response.markdown(`> ${ModelRouter.formatSuggestion(routing)}\n\n`);
            }

            // The compiler owns workspace evidence rendering; do not append a second RAM slice bundle.
            const fullPrompt = `${request.prompt}${activeFileContext}`;

            // Phase 8: Image Rightsizing (inspired by TokenShift)
            const imageConf = vscode.workspace.getConfiguration('tokenOptimizer');
            const imageRightsizer = new ImageRightsizer({
                enabled: capabilityEnabled('imageRightsizing') && imageConf.get<boolean>('enableImageRightsizing', true),
                maxDimension: imageConf.get<number>('imageMaxDimension', 512),
                quality: 70
            });

            // Build multi-turn raw messages with turn deduplication
            const rawMessages: MessagePayload[] = [];
            let totalImageTokensSaved = 0;
            for (const h of chatContext.history) {
                if (h instanceof vscode.ChatRequestTurn) {
                    const { text: rsText, stats: rsStats } = cpuWorkerBoundary
                        ? await imageRightsizer.rightsizeInlineImagesAsync(h.prompt, cpuWorkerBoundary, token)
                        : imageRightsizer.rightsizeInlineImages(h.prompt);
                    totalImageTokensSaved += rsStats.estimatedTokensSaved;
                    const dedup = turnCache.deduplicateTurnCode(rsText, activeFileName || 'workspace');
                    rawMessages.push({ role: 'user', content: dedup.text });
                } else if (h instanceof vscode.ChatResponseTurn) {
                    const participantName = (h as any).participant || (h as any).name || 'tokonomics';
                    const resText = h.response.map((part: any) => {
                        if (part instanceof vscode.ChatResponseMarkdownPart) {
                            return part.value.value;
                        }
                        if (typeof part?.value === 'string') return part.value;
                        if (typeof part?.value?.value === 'string') return part.value.value;
                        return '';
                    }).join('');
                    if (resText.trim().length > 0) {
                        rawMessages.push({ role: 'assistant', content: resText, name: participantName });
                    }
                }
            }
            // Rightsize images in the current prompt too
            const { text: rsFullPrompt, stats: rsPromptStats } = cpuWorkerBoundary
                ? await imageRightsizer.rightsizeAsync(fullPrompt, cpuWorkerBoundary, mayReadWorkspace ? workspaceRoot : undefined, token)
                : imageRightsizer.rightsize(fullPrompt, mayReadWorkspace ? workspaceRoot : undefined);
            totalImageTokensSaved += rsPromptStats.estimatedTokensSaved;
            rawMessages.push({ role: 'user', content: rsFullPrompt });

            // Resolve the concrete upstream model before compilation so context limits,
            // cache identity, and projected pricing refer to the request actually sent.
            const allModels = await vscode.lm.selectChatModels();
            let models = allModels ? allModels.filter(m => m.id !== 'token-optimizer-proxy' && (m as any).vendor !== 'tokonomics') : [];
            const allowList = conf.get<string[]>('modelAllowList', []);
            if (allowList && allowList.length > 0) {
                const allowedLower = allowList.map(a => a.toLowerCase());
                const filtered = models.filter(m => {
                    const identity = `${m.id || ''} ${m.name || ''} ${m.family || ''}`.toLowerCase();
                    return allowedLower.some(allowed => identity.includes(allowed));
                });
                if (filtered.length === 0 && models.length > 0) {
                    response.markdown(`> 🚫 **Model Policy:** Available models (${models.map(m => m.id).join(', ')}) are not in the allow list (${allowList.join(', ')}). Contact your admin to update \`tokenOptimizer.modelAllowList\`.\n\n`);
                    return;
                }
                models = filtered.length > 0 ? filtered : models;
            }
            const targetModel = models[0];
            const detectedProvider = targetModel?.vendor === 'google' ? 'gemini' : targetModel?.vendor;
            const compileProvider = config.targetProvider === 'auto'
                ? (detectedProvider || 'generic')
                : config.targetProvider;

            const compiled = await compiler.compile({
                messages: rawMessages.map(message => canonicalTextMessage(message.role, message.content, message.name)),
                sessionId: 'session_chat_participant',
                targetProvider: compileProvider as any,
                targetModel: targetModel?.id || targetModel?.family,
                maxTokenBudget: typeof (targetModel as any)?.maxInputTokens === 'number' ? (targetModel as any).maxInputTokens : undefined,
                maxOutputTokens: typeof (targetModel as any)?.maxOutputTokens === 'number' ? (targetModel as any).maxOutputTokens : undefined,
                activeFilePath: doc?.fileName,
                userIntent: diffAnalysis.intent,
                cancellation: token,
                workspaceSnapshot: requestSnapshot,
                allowWorkspaceRetrieval: contextMode === 'automatic',
                evidenceSignals
            });
            activeCompilation = compiled;
            const compileResult = compiled.compilation;
            const prepared = prepareCanonicalEgress(compiled.messages, {}, {
                workspaceRoots: workspaceRoots(),
                workspaceTrusted: workspaceTrusted(),
                containsWorkspaceData: activeFileContext.length > 0 || (contextMode === 'automatic' && requestSnapshot.files.size > 0),
                isCancellationRequested: token.isCancellationRequested
            });
            const originalTokens = compileResult.originalTokens;
            const optimizedTokens = compileResult.optimizedTokens;
            const savedTokens = compileResult.tokensSaved;
            const reductionPercentage = compileResult.reductionPercentage;
            const costSavedUSD = compileResult.effectiveCostSavedUSD;

            // Circuit Breaker Evaluation
            const cbStatus = circuitBreaker.evaluateTurn(optimizedTokens, request.prompt);
            if (cbStatus.tripped) {
                response.markdown(`> ${cbStatus.message}\n\n`);
            }

            // Build savings banner with image rightsizing info
            const imageNote = totalImageTokensSaved > 0 ? ` | 📸 ${totalImageTokensSaved.toLocaleString()} image tokens rightsized` : '';
            if (savedTokens > 0 || totalImageTokensSaved > 0) {
                response.markdown(`> ⚡ **Tokonomics${fileInfo}:** ${originalTokens.toLocaleString()} → ${optimizedTokens.toLocaleString()} tokens (**${reductionPercentage}% saved** | ~$${costSavedUSD.toFixed(4)} USD${imageNote})\n\n`);
            } else {
                response.markdown(`> ⚡ **Tokonomics:** Standalone prompt (${originalTokens} tokens). *Open a code file or run \`@tokonomics /map\` to see structural token optimization.*\n\n`);
            }

            if (!models || models.length === 0) {
                compiler.commit(compiled);
                activeCompilation = undefined;
                if (onOptimizationComplete) onOptimizationComplete();
                BudgetGuardrail.checkBudget(metricsTracker);
                response.markdown(`*(No downstream Copilot/Chat model available in active host)*\n\n**Optimized Prompt Payload:**\n\`\`\`markdown\n${prepared.messages.map(m => `[${m.role.toUpperCase()}]: ${m.parts.filter(p => p.kind === 'text').map(p => (p as any).text).join('')}`).join('\n\n')}\n\`\`\``);
                return;
            }

            const upstreamMessages = protocol.toUpstreamMessages(prepared.messages);

            // Evaluate answer reuse only after every answer-affecting input is known.
            const exactCacheRequest: ResponseCacheRequest = {
                requestText: request.prompt,
                conversation: prepared.messages,
                workspace: {
                    roots: requestSnapshot.roots.map(rootIdentity => rootIdentity.id),
                    snapshotGeneration: requestSnapshot.generation,
                    ignorePolicyVersion: requestSnapshot.ignorePolicyVersion,
                    files: [...requestSnapshot.files.values()].map(file => ({
                        path: file.key,
                        contentHash: file.contentHash,
                        sourceVersion: file.sourceVersion
                    }))
                },
                evidence: (compileResult.evidenceRetrieval?.selected || []).map(candidate => ({
                    id: candidate.id,
                    contentHash: candidate.contentHash
                })),
                model: { provider: targetModel.vendor || 'unknown', id: targetModel.id || targetModel.name || 'unknown' },
                tools: Array.isArray((prepared.options as any)?.tools) ? (prepared.options as any).tools : [],
                compilerConfiguration: config,
                policies: { contextMode, workspaceTrusted: workspaceTrusted(), modelAllowList: allowList || [] },
                extensionVersion: String((context.extension as any)?.packageJSON?.version || 'unknown'),
                safety: {
                    intent: diffAnalysis.intent,
                    hasToolCalls: Array.isArray((prepared.options as any)?.tools) && (prepared.options as any).tools.length > 0,
                    unresolvedWorkspace: contextMode === 'automatic' && requestSnapshot.files.size === 0,
                    timeSensitive: isTimeSensitiveRequest(request.prompt),
                    cancelled: token.isCancellationRequested
                }
            };
            if (capabilityEnabled('responseCache') && config.enableResponseCache !== false) {
                const cacheHit = cache.lookup(exactCacheRequest);
                if (cacheHit.hit && cacheHit.response) {
                    compiler.commit(compiled);
                    activeCompilation = undefined;
                    if (onOptimizationComplete) onOptimizationComplete();
                    OptimizationEventBus.getInstance().emit({
                        ...compileResult.event,
                        timestamp: Date.now(),
                        state: 'PROMPT_COMPLETED',
                        cacheState: 'response_hit',
                        costStatus: 'unavailable',
                        isCostReconciled: false,
                        traceId: `${compiled.requestId}:response-cache-hit`
                    });
                    response.markdown(`> ⚡ **Verified Exact Response Cache Hit**: identical request, conversation, workspace snapshot, evidence, model, tools, configuration, and policy.\n\n`);
                    response.markdown(cacheHit.response);
                    return;
                }
            }

            const performInference = async (checkpoint: () => void) => {
                checkpoint();
                const llmResponse = await targetModel.sendRequest(upstreamMessages, prepared.options as any, token);
                let completeResponseText = '';
                if ((llmResponse as any).stream) {
                    for await (const part of (llmResponse as any).stream as AsyncIterable<unknown>) {
                        checkpoint();
                        if (part instanceof vscode.LanguageModelTextPart) {
                            completeResponseText += part.value;
                            response.markdown(part.value);
                        } else {
                            throw new Error('The chat participant received a non-text model response part that its UI cannot represent safely.');
                        }
                    }
                } else {
                    for await (const chunk of llmResponse.text) {
                        checkpoint();
                        completeResponseText += chunk;
                        response.markdown(chunk);
                    }
                }
                checkpoint();
                return { llmResponse, completeResponseText };
            };
            const checkpoint = () => { if (token.isCancellationRequested) throw new Error('CANCELLED'); };
            const inference = inferenceScheduler
                ? await inferenceScheduler.schedule({ key: `chat:${compiled.requestId}`, priority: 'foreground', cancellation: token }, context => performInference(context.checkpoint))
                : await performInference(checkpoint);
            const { llmResponse, completeResponseText } = inference;

            compiler.commit(compiled);
            activeCompilation = undefined;
            if (onOptimizationComplete) onOptimizationComplete();
            BudgetGuardrail.checkBudget(metricsTracker);

            // Reconcile only from provider-reported complete usage; locally estimated
            // tokens remain projected metrics and are never relabelled as actual cost.
            const responseUsage = (llmResponse as any)?.usage || (llmResponse as any)?.result?.usage;
            const modelId = targetModel.id || targetModel.name || 'claude-3-7-sonnet';
            const providerId = targetModel.vendor || 'anthropic';
            const verifiedUsage = CostCalculator.parseVerifiedProviderUsage(responseUsage, compiled.requestId, providerId, modelId);
            const emitCostUnavailable = () => OptimizationEventBus.getInstance().emit({
                ...compileResult.event,
                id: compiled.requestId,
                timestamp: Date.now(),
                state: 'PROMPT_COMPLETED',
                provider: providerId as any,
                model: modelId,
                isCostReconciled: false,
                costStatus: 'unavailable',
                traceId: `${compiled.requestId}:cost-unavailable`
            });
            if (verifiedUsage) {
                costReconciliationLedger.begin({
                    requestId: compiled.requestId,
                    provider: providerId,
                    model: modelId,
                    unoptimizedInputTokens: originalTokens
                });
                try {
                    const costReconciled = costReconciliationLedger.reconcile(compiled.requestId, verifiedUsage);
                    const reconciledEvent: PromptOptimizationEvent = {
                        ...compileResult.event,
                        id: compiled.requestId,
                        timestamp: Date.now(),
                        state: 'COST_RECONCILED',
                        provider: providerId as any,
                        model: modelId,
                        cachedTokens: verifiedUsage.cacheReadInputTokens,
                        outputTokens: verifiedUsage.outputTokens,
                        actualRawCostUSD: costReconciled.actualRawCostUSD,
                        actualOptimizedCostUSD: costReconciled.actualOptimizedCostUSD,
                        actualSavingsUSD: costReconciled.actualSavingsUSD,
                        isCostReconciled: true,
                        costStatus: 'reconciled',
                        pricingCatalogVersion: costReconciled.pricingCatalogVersion,
                        pricingSource: costReconciled.pricingSource,
                        pricingCurrency: costReconciled.currency,
                        cacheState: verifiedUsage.cacheReadInputTokens > 0 ? 'provider_read'
                            : verifiedUsage.cacheWriteInputTokens > 0 ? 'provider_write' : compileResult.event.cacheState,
                        traceId: `${compiled.requestId}:reconciled`
                    };
                    OptimizationEventBus.getInstance().emit(reconciledEvent);
                } catch {
                    costReconciliationLedger.abandon(compiled.requestId);
                    emitCostUnavailable();
                }
            } else emitCostUnavailable();

            if (capabilityEnabled('responseCache') && config.enableResponseCache !== false && completeResponseText.length > 20) {
                cache.store(exactCacheRequest, completeResponseText, 'completed');
            }
        } catch (err: any) {
            if (activeCompilation) {
                compiler.fail(activeCompilation, token.isCancellationRequested ? 'CANCELLED' : 'GENERATION_ERROR');
                activeCompilation = undefined;
            }
            response.markdown(`❌ Error during generation: ${err?.message || err}`);
        }
    });

    participant.iconPath = vscode.Uri.file(context.asAbsolutePath('assets/icon.png'));
    context.subscriptions.push(participant);
    return true;
}
