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
import { subscriptionDiagnostics, subscriptionModel } from '../subscriptions/subscriptionModels';
import { SubscriptionActivity } from '../subscriptions/cliTransport';
import { SubscriptionError } from '../subscriptions/cliTransport';
import { asksForWorkspaceSource, resolveChatReferences } from './chatContextReferences';
import { MetricsTracker } from '../metrics/tracker';
import { AstPrunerEngine } from '../ast/pruner';
import { TokenCounter } from '../engine/tokenizer';
import { MessagePayload, TokenOptimizationConfig } from '../types';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';
import { BudgetGuardrail } from '../metrics/budgetGuard';
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
import { CanonicalProviderGateway } from '../protocol/providerGateway';
import { FeatureFlagRegistry } from '../engine/featureFlags';
import { VersionedWorkspaceIndex } from '../workspace/workspaceIndex';
import { EvidenceSignal } from '../retrieval/evidenceTypes';
import { CpuWorkerBoundary } from '../performance/cpuWorkerBoundary';
import { BoundedPriorityScheduler } from '../performance/boundedScheduler';
import { KillSwitchCapability } from '../release/releaseControl';
import { UserPreferenceRegistry } from '../config/userPreferences';
import { boundedHistory, sanitizeModelHistoryText } from '../history/modelHistory';
import {
    resolveContextEpoch, applyContextEpoch, recordPrefixStability, DEFAULT_CONTEXT_EPOCH,
    buildConversationCheckpoint, renderCheckpoint
} from '../history/contextEpoch';
import { countAuthoritative, requiresRepack, planRepack } from '../engine/authoritativeCount';
import { collectSignalSnapshot } from '../workspace/signalCollection';
import {
    RequestContextEnvelope, AttachmentDecision, resolveInitialAttachment,
    resolveFallbackAttachment, buildAttachmentReceipt
} from '../engine/requestContextEnvelope';

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
    // Monotonic, content-free counter giving each request envelope a distinct identity.
    let compileSequence = 0;
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document && !editor.document.isUntitled) {
                lastActiveDocUri = editor.document.uri;
            }
        })
    );

    const participant = vscode.chat.createChatParticipant('token-optimizer-participant', async (request, chatContext, response, token) => {
        const command = request.command;
        const subscription = command === 'codex' || command === 'claude' ? command : undefined;
        if (subscription && !request.prompt.trim()) {
            // No question means nothing to ask the provider, so the turn is spent on the two things
            // that actually break this feature: whether the CLI was found, and whether its login is
            // one this transport accepts. Both used to be invisible until a request had failed.
            try {
                response.markdown(await subscriptionDiagnostics(subscription, token));
            } catch (error) {
                response.markdown(`Subscription check failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            return;
        }
        let requestSnapshot = workspaceIndex.captureSnapshot();

        if ((!workspaceTrusted() || !capabilityEnabled('workspaceIndex')) && (command === 'map' || command === 'pack' || command === 'analyze')) {
            response.markdown('Workspace context is disabled by workspace trust or the local release safety controls.');
            return;
        }

        // 1. /dashboard Command: Open Interactive Real-Time Dashboard Webview
        if (command === 'dashboard') {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine, workspaceIndex);
            response.markdown(`### Tokonomics 8.0.0 Dashboard\n\nOpening the activity dashboard.\n\n*You can also run \`@tokonomics /live\` for a session summary or \`@tokonomics /explain\` to review the latest context decision.*`);
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
                `- **Estimated Avoided Cost:** **${financialSavings}**\n` +
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

            const mapMode = UserPreferenceRegistry.get().workspace.contextMode;
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
        let failureStage = 'context preparation';
        try {
            if (token.isCancellationRequested) return;
            const runtime = UserPreferenceRegistry.get();
            const configuredContextMode = runtime.workspace.contextMode;
            const contextMode = capabilityEnabled('workspaceIndex') ? configuredContextMode : 'off';
            if (contextMode === 'automatic' && requestSnapshot.files.size === 0) {
                requestSnapshot = await workspaceIndex.ensureInitialized();
            }
            const mayReadWorkspace = workspaceTrusted() && contextMode !== 'off';
            const mayResolveReferencedFile = mayReadWorkspace && contextMode === 'automatic';
            // Resolving which document is in focus is separate from sending all of it. Automatic mode
            // still needs the focal file - retrieval is focused by it - but knowing the file no longer
            // implies attaching it. The envelope below decides attachment.
            const mayResolveDocument = mayReadWorkspace && contextMode === 'automatic';
            // Resolve target active document with 4-tier fallback:
            let doc: vscode.TextDocument | undefined = mayReadWorkspace && !vscode.window.activeTextEditor?.document.isUntitled
                ? vscode.window.activeTextEditor?.document
                : undefined;
            if (!doc && mayResolveDocument) {
                const visible = vscode.window.visibleTextEditors.find(e => e.document && !e.document.isUntitled && !e.document.uri.scheme.includes('output') && !e.document.uri.scheme.includes('debug'));
                if (visible) doc = visible.document;
            }
            if (!doc && mayResolveDocument && lastActiveDocUri) {
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

            const focusEditor = vscode.window.activeTextEditor;
            const envelopeSelection = doc && focusEditor?.document.fileName === doc.fileName && focusEditor.selection
                ? doc.getText(focusEditor.selection)
                : '';
            const envelope: RequestContextEnvelope = Object.freeze({
                envelopeId: `env_${requestSnapshot.generation}_${(compileSequence += 1)}`,
                contextMode,
                promptChars: request.prompt.length,
                activeFilePath: doc?.fileName,
                documentVersion: doc?.version,
                cursorLine: focusEditor?.selection?.active?.line,
                selectionText: envelopeSelection,
                documentIsDirty: Boolean(doc?.isDirty),
                unsavedBuffersPermitted: runtime.workspace.includeUnsavedBuffers === true,
                workspaceTrusted: workspaceTrusted(),
                retrievalAvailable: contextMode === 'automatic' && requestSnapshot.files.size > 0
            });
            let attachment: AttachmentDecision = resolveInitialAttachment(envelope);

            if (doc && mayReadWorkspace && !ignoreFilter.isIgnored(doc.fileName)) {
                activeFileName = doc.fileName;
                const selectedText = envelopeSelection;
                const codeToAttach = attachment.attachSelection
                    ? selectedText
                    : (attachment.attachFullDocument ? doc.getText() : '');

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

            // The request-scoped signal snapshot. The orchestrator has always accepted one - it uses
            // the document version to discard evidence captured against a file that has since
            // changed, and feeds the signal engines from it - but no production caller supplied one,
            // so in the shipped extension those engines received nothing at all.
            const signalSnapshot = collectSignalSnapshot({
                snapshotGeneration: requestSnapshot.generation,
                capturedAt: Date.now(),
                workspaceContextAuthorised: contextMode !== 'off',
                workspaceTrusted: workspaceTrusted(),
                activeFilePath: doc?.fileName,
                documentUri: doc?.uri?.toString(),
                documentVersion: doc?.version,
                cursorLine: focusEditor?.selection?.active?.line,
                cursorCharacter: focusEditor?.selection?.active?.character,
                selection: focusEditor?.selection && doc && focusEditor.document.fileName === doc.fileName
                    ? {
                        startLine: focusEditor.selection.start.line,
                        startCharacter: focusEditor.selection.start.character,
                        endLine: focusEditor.selection.end.line,
                        endCharacter: focusEditor.selection.end.character
                    }
                    : undefined,
                diagnostics: doc && contextMode === 'automatic'
                    && typeof vscode.languages?.getDiagnostics === 'function'
                    ? vscode.languages.getDiagnostics(doc.uri).map(diagnostic => ({
                        message: diagnostic.message,
                        severity: Number(diagnostic.severity),
                        source: diagnostic.source,
                        startLine: diagnostic.range.start.line,
                        startCharacter: diagnostic.range.start.character
                    }))
                    : undefined
            });

            const config: TokenOptimizationConfig = { ...runtime.tokenOptimization };

            const diffAnalysis = DiffOutputOptimizer.analyzeIntent(request.prompt, !!activeFileContext);

            // Price/capability comparisons are user-initiated from the spend dashboard.
            // Keyword complexity alone cannot justify a percentage savings claim.

            // The compiler owns workspace evidence rendering; do not append a second RAM slice bundle.
            const previousReferences = chatContext.history.filter(turn => turn instanceof vscode.ChatRequestTurn)
                .slice(-10).reverse().flatMap(turn => (turn as vscode.ChatRequestTurn).references ?? []);
            const references = await resolveChatReferences([...(request.references ?? []), ...previousReferences], {
                roots: workspaceRoots(), trusted: workspaceTrusted(), enabled: contextMode !== 'off',
                includeUnsaved: runtime.workspace.includeUnsavedBuffers, token
            });
            for (const notice of references.notices) response.markdown(`> Context: ${notice}\n\n`);
            const fullPrompt = `${request.prompt}${activeFileContext}${references.text}`;

            // Phase 8: Image Rightsizing (inspired by TokenShift)
            // Gated by the release capability, the user image preference AND the declared compiler
            // flag, so the capability snapshot for 'image_rightsizing' matches what actually runs.
            const imageOptimizationEnabled = capabilityEnabled('imageRightsizing')
                && runtime.image.enabled
                && FeatureFlagRegistry.getFlags().enableImageRightsizing;
            const imageRightsizer = imageOptimizationEnabled ? new ImageRightsizer({
                enabled: true,
                maxDimension: runtime.image.maxDimension,
                quality: 70
            }) : undefined;
            const unchangedImageText = (text: string) => ({
                text,
                stats: { originalBytes: 0, compressedBytes: 0, reductionPercentage: 0, estimatedTokensSaved: 0, wasProcessed: false }
            });

            // Build multi-turn raw messages with turn deduplication
            const rawMessages: MessagePayload[] = [];
            let totalImageTokensSaved = 0;
            // History is retained append-only inside a context epoch, rather than by a sliding window.
            // A window dropped the oldest turn on every request once the conversation passed its
            // limit, which shifted the rendered prefix every turn and meant the longest conversations
            // - where caching is worth the most - never reused a cached prefix at all. The anchor now
            // moves once per epoch instead, so the prefix stays byte-identical between moves.
            const epochHistory = chatContext.history.map(turn => ({
                content: turn instanceof vscode.ChatRequestTurn
                    ? turn.prompt
                    : String((turn as { response?: unknown }).response ?? '')
            }));
            const epochDecision = resolveContextEpoch(epochHistory, {
                ...DEFAULT_CONTEXT_EPOCH,
                maxRetainedTurns: Math.max(2, Math.min(80, config.maxHistoryTurns * 2))
            });
            const retainedHistory = applyContextEpoch(chatContext.history, epochDecision);
            // Turns before the anchor stop being sent. Most of what they held is spent, but decisions,
            // constraints, referenced files, outstanding work and unresolved errors stay load-bearing,
            // and losing them silently is how a long session contradicts itself. The checkpoint lifts
            // those spans verbatim - it is deterministic extraction, not a generated summary, so it
            // can be asserted against rather than trusted.
            if (epochDecision.droppedTurns > 0) {
                const checkpoint = buildConversationCheckpoint(
                    epochHistory.slice(0, epochDecision.startIndex), epochDecision.epoch, 0);
                const rendered = renderCheckpoint(checkpoint);
                const carriesFacts = checkpoint.decisions.length + checkpoint.constraints.length
                    + checkpoint.referencedFiles.length + checkpoint.unresolvedTasks.length
                    + checkpoint.openErrors.length > 0;
                if (carriesFacts) rawMessages.push({ role: 'user', content: rendered });
            }
            const prefixStability = recordPrefixStability(
                applyContextEpoch(epochHistory, epochDecision), epochDecision);
            for (const h of retainedHistory) {
                if (h instanceof vscode.ChatRequestTurn) {
                    const { text: rsText, stats: rsStats } = imageRightsizer
                        ? cpuWorkerBoundary
                            ? await imageRightsizer.rightsizeInlineImagesAsync(h.prompt, cpuWorkerBoundary, token)
                            : imageRightsizer.rightsizeInlineImages(h.prompt)
                        : unchangedImageText(h.prompt);
                    totalImageTokensSaved += rsStats.estimatedTokensSaved;
                    const dedup = turnCache.deduplicateTurnCode(rsText, activeFileName || 'workspace');
                    rawMessages.push({ role: 'user', content: dedup.text });
                } else if (h instanceof vscode.ChatResponseTurn) {
                    const participantName = (h as any).participant || (h as any).name || 'tokonomics';
                    const resText = sanitizeModelHistoryText(h.response.map((part: any) => {
                        if (part instanceof vscode.ChatResponseMarkdownPart) {
                            return part.value.value;
                        }
                        if (typeof part?.value === 'string') return part.value;
                        if (typeof part?.value?.value === 'string') return part.value.value;
                        return '';
                    }).join(''));
                    if (resText.trim().length > 0) {
                        rawMessages.push({ role: 'assistant', content: resText, name: participantName });
                    }
                }
            }
            // Rightsize images in the current prompt too
            const { text: rsFullPrompt, stats: rsPromptStats } = imageRightsizer
                ? cpuWorkerBoundary
                    ? await imageRightsizer.rightsizeAsync(fullPrompt, cpuWorkerBoundary, mayReadWorkspace ? workspaceRoot : undefined, token)
                    : imageRightsizer.rightsize(fullPrompt, mayReadWorkspace ? workspaceRoot : undefined)
                : unchangedImageText(fullPrompt);
            totalImageTokensSaved += rsPromptStats.estimatedTokensSaved;
            rawMessages.push({ role: 'user', content: rsFullPrompt });

            // Resolve the concrete upstream model before compilation so context limits,
            // cache identity, and projected pricing refer to the request actually sent.
            const selectedModel = request.model;
            const selectedIsUpstream = selectedModel && selectedModel.id !== 'token-optimizer-proxy' && selectedModel.vendor !== 'tokonomics';
            // What the provider is doing, while it does it. The CLIs report the model they picked
            // and their reasoning on the same stream as the answer, and all of it used to be parsed
            // only after the process exited - so a long turn showed nothing until it was over.
            let reportedModel: string | undefined;
            let reasoningChars = 0;
            const showActivity = (activity: SubscriptionActivity) => {
                if (typeof (response as any).progress !== 'function') return;
                if (activity.kind === 'model' && activity.model && activity.model !== reportedModel) {
                    reportedModel = activity.model;
                    (response as any).progress(`${subscription} CLI answering with ${activity.model}`);
                } else if (activity.kind === 'reasoning' && activity.text) {
                    // The reasoning text itself is the provider's working, not the answer: its volume
                    // is reported so the turn is visibly alive, and its content is not rendered,
                    // cached, or carried into the next turn.
                    reasoningChars += activity.text.length;
                    (response as any).progress(`Reasoning (${reasoningChars.toLocaleString()} characters so far)`);
                }
            };
            failureStage = 'provider setup';
            const allModels = subscription ? [subscriptionModel(subscription, { onActivity: showActivity })] : selectedIsUpstream ? [selectedModel] : await vscode.lm.selectChatModels();
            let models = allModels ? allModels.filter(m => m.id !== 'token-optimizer-proxy' && (m as any).vendor !== 'tokonomics') : [];
            const allowList = [...runtime.modelAllowList];
            // The allow list governs which discovered upstream models may be selected. A subscription
            // command is not a selection: the user named a CLI they are already signed into, billed
            // under their own seat, and its synthetic model id ("claude-subscription") matches no
            // administrator's list - so applying the list here rejected the one transport the user
            // explicitly asked for.
            if (!subscription && allowList && allowList.length > 0) {
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
            const targetModel = subscription ? models[0] : models.find(m => m.id === request.model?.id) ?? models[0];
            if (subscription) response.markdown(`> Using your **${subscription} CLI login** with compiled context. Answers and suggested changes only. Reported tokens include provider overhead; subscription charges and remaining quota are not inferred.\n\n`);
            const detectedProvider = targetModel?.vendor === 'google' ? 'gemini' : targetModel?.vendor;
            const compileProvider = config.targetProvider === 'auto'
                ? (detectedProvider || 'generic')
                : config.targetProvider;

            // Whether this request already carries workspace source of its own. The compiler cannot
            // tell from message shape - the editor attaches a skills list on every turn that is long
            // and full of fenced code, and reading that as attached source made the compiler discard
            // everything retrieval had found and answer from the skills list alone. The participant
            // resolved the attachments, so it is the one that knows.
            const callerSuppliedSource = references.containsWorkspaceData || activeFileContext.length > 0
                || [request.prompt, ...retainedHistory.filter(turn => turn instanceof vscode.ChatRequestTurn)
                    .map(turn => (turn as vscode.ChatRequestTurn).prompt)].some(text => /```[\s\S]+```/.test(text));
            failureStage = 'context compilation';
            const compileWith = (messages: MessagePayload[], decision: AttachmentDecision) => compiler.compile({
                callerSuppliedSource,
                messages: messages.map(message => canonicalTextMessage(message.role, message.content, message.name)),
                preserveText: references.count > 0,
                sessionId: 'session_chat_participant',
                envelopeId: envelope.envelopeId,
                targetProvider: compileProvider as any,
                targetModel: targetModel?.id || targetModel?.family,
                maxTokenBudget: typeof (targetModel as any)?.maxInputTokens === 'number' ? (targetModel as any).maxInputTokens : undefined,
                maxOutputTokens: typeof (targetModel as any)?.maxOutputTokens === 'number' ? (targetModel as any).maxOutputTokens : undefined,
                activeFilePath: doc?.fileName,
                cursorLine: envelope.cursorLine,
                userIntent: diffAnalysis.intent,
                cancellation: token,
                workspaceSnapshot: requestSnapshot,
                signalSnapshot,
                allowWorkspaceRetrieval: decision.allowRetrieval,
                evidenceSignals
            });

            let compiled = await compileWith(rawMessages, attachment);

            // Second pass. Attaching the focal document costs the whole file, so it happens only
            // here - after retrieval has actually been tried and admitted nothing - rather than
            // pre-emptively alongside retrieval, which is what previously made a request carry both.
            let fallbackTokens = 0;
            const retrievalResult = compiled.compilation.evidenceRetrieval;
            const fallbackDecision = resolveFallbackAttachment(envelope, attachment, {
                attempted: attachment.allowRetrieval,
                selectedCount: retrievalResult?.selected.length ?? 0,
                sufficient: retrievalResult?.sufficient === true,
                conservativeFallback: retrievalResult?.conservativeFallback === true,
                missingRequired: (retrievalResult?.missingRequired ?? []).map(category => String(category)),
                sufficiency: retrievalResult?.sufficiency
            });
            if (fallbackDecision && doc && !token.isCancellationRequested
                && !ignoreFilter.isIgnored(doc.fileName)) {
                const fallbackLang = doc.languageId || 'typescript';
                const fallbackPolicy = new WorkspaceSourcePolicy(workspaceRoots(), true);
                const fallbackPath = fallbackPolicy.assertReadable(doc.fileName).displayPath;
                const fallbackCode = doc.getText().split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
                activeFileContext = String.fromCharCode(10, 10) + '```' + fallbackLang + String.fromCharCode(10)
                    + `// Context File: <workspace>/${fallbackPath}` + String.fromCharCode(10)
                    + fallbackCode + String.fromCharCode(10) + '```';
                fileInfo = ` (with context from ${path.basename(doc.fileName)})`;
                fallbackTokens = TokenCounter.countTokens(activeFileContext);
                const fallbackMessages = rawMessages.map((message, index) => index === rawMessages.length - 1
                    ? { ...message, content: `${message.content}${activeFileContext}` }
                    : message);
                compiler.abandon(compiled);
                compiled = await compileWith(fallbackMessages, fallbackDecision);
                attachment = fallbackDecision;
            }
            const attachmentReceipt = buildAttachmentReceipt(envelope, attachment, fallbackTokens);
            activeCompilation = compiled;
            const compileResult = compiled.compilation;
            const containsWorkspaceData = references.containsWorkspaceData || activeFileContext.length > 0
                || Boolean(compileResult.evidenceRetrieval?.selected.length);
            const hasInlineSource = callerSuppliedSource;
            if (!containsWorkspaceData && !hasInlineSource
                && (asksForWorkspaceSource(request.prompt) || (references.count === 0 && (request.references?.length ?? 0) > 0))) {
                compiler.abandon(compiled); activeCompilation = undefined;
                response.markdown(`No project files were prepared for this request${references.textCount ? `; ${references.textCount} text reference(s) were supplied, but text such as a skills list is not a workspace file` : ''}. Workspace Context is **${contextMode === 'off' ? 'None' : contextMode}**. For project analysis, choose **Automatic** workspace context, or attach the relevant source files with **Add Context**, then resend your question.\n\n`);
                response.button({ command: 'workbench.action.openSettings', title: 'Open workspace context setting', arguments: ['tokenOptimizer.workspaceContext'] });
                return;
            }
            response.markdown(`> Context prepared: ${references.files.length} file attachment(s), ${references.textCount} text reference(s)`
                + `${activeFileContext ? ', active editor context' : ''}${compileResult.evidenceRetrieval?.selected.length ? ', retrieved workspace evidence' : ''}.\n\n`);
            const prepared = CanonicalProviderGateway.prepare(protocol, compiled.messages, {}, {
                workspaceRoots: workspaceRoots(),
                workspaceTrusted: workspaceTrusted(),
                containsWorkspaceData,
                workspaceConsent: contextMode !== 'off',
                sourcePolicySatisfied: !containsWorkspaceData || workspaceTrusted(),
                isCancellationRequested: token.isCancellationRequested
            });
            // Final pre-send count with the model's own tokenizer, when it offers one. Packing uses
            // the fast estimator because it evaluates many candidate payloads; this runs once, on the
            // payload actually being sent, so a request the estimator thought fit cannot silently
            // exceed the real input budget. It is a count, never billed usage - see ADR-001.
            const preparedText = prepared.messages
                .map(message => message.parts
                    .filter(part => part.kind === 'text')
                    .map(part => (part as { text: string }).text).join(''))
                .join(String.fromCharCode(10));
            const authoritativeCount = await countAuthoritative(
                targetModel as never, preparedText, compileResult.optimizedTokens,
                typeof (targetModel as any)?.maxInputTokens === 'number'
                    ? (targetModel as any).maxInputTokens : undefined,
                token);
            const inputBudget = typeof (targetModel as any)?.maxInputTokens === 'number'
                ? (targetModel as any).maxInputTokens as number
                : undefined;
            if (inputBudget && requiresRepack(authoritativeCount, compileResult.optimizedTokens, inputBudget)) {
                // The model's own tokenizer says this does not fit, and the estimator thought it did.
                // Drop optional evidence lowest-value first and recount once. Mandatory evidence is
                // never dropped: a request missing the evidence it declared it needed produces a
                // confident answer to a question it could not see.
                const evidenceItems = (compileResult.evidenceRetrieval?.selected || []).map(candidate => ({
                    id: candidate.id,
                    tokens: TokenCounter.countTokens(candidate.content),
                    mandatory: candidate.mandatory === true,
                    value: candidate.fusedScore
                }));
                const overflow = authoritativeCount.tokens - inputBudget;
                const plan = planRepack(evidenceItems,
                    Math.max(0, authoritativeCount.tokens
                        - evidenceItems.reduce((sum, item) => sum + item.tokens, 0)),
                    inputBudget);
                if (plan.fits && plan.droppedIds.length > 0) {
                    response.markdown(`> ⚠️ **Context repacked**: the model counted `
                        + `${authoritativeCount.tokens.toLocaleString()} tokens against a limit of `
                        + `${inputBudget.toLocaleString()}, so ${plan.droppedIds.length} optional evidence `
                        + `item(s) were dropped. Required evidence was kept.

`);
                } else {
                    // Fails closed. Truncating mandatory evidence to fit would be the one outcome
                    // worse than declining: an answer that looks informed and is not.
                    compiler.fail(compiled, 'CONTEXT_EXCEEDS_MODEL_BUDGET');
                    activeCompilation = undefined;
                    if (onOptimizationComplete) onOptimizationComplete();
                    response.markdown(`> ⛔ **Context exceeds this model's limit by `
                        + `${overflow.toLocaleString()} tokens** and cannot be reduced without dropping `
                        + `evidence this request needs. Narrow the selection, or choose a model with a `
                        + `larger context window.

`);
                    return;
                }
            }

            const originalTokens = compileResult.originalTokens;
            const optimizedTokens = compileResult.optimizedTokens;
            const savedTokens = compileResult.tokensSaved;
            const reductionPercentage = compileResult.reductionPercentage;
            const costSavedUSD = compileResult.effectiveCostSavedUSD;

            // Circuit Breaker Evaluation
            const cbStatus = circuitBreaker.evaluateTurn(optimizedTokens, request.prompt);
            if (cbStatus.tripped) {
                response.markdown(`> ${cbStatus.message}\n\n`);
                compiler.fail(compiled, 'CIRCUIT_BREAKER_TRIPPED');
                activeCompilation = undefined;
                return;
            }

            // A conservative fallback is declared, not absorbed. The user is told the whole file was
            // sent and why, so a costly request is never indistinguishable from a retrieval-first one.
            if (attachmentReceipt.fellBack && attachmentReceipt.fallbackTokens > 0) {
                response.markdown(`> ⚠️ **Full file attached** (${attachmentReceipt.fallbackTokens.toLocaleString()} tokens): `
                    + `workspace retrieval found no usable evidence for this request, so the active file was sent in full.

`);
            }

            // Build savings banner with image rightsizing info
            const imageNote = totalImageTokensSaved > 0 ? ` | 📸 ${totalImageTokensSaved.toLocaleString()} image tokens rightsized` : '';
            if (subscription) {
                response.markdown(`> Compiled context: ${originalTokens.toLocaleString()} → ${optimizedTokens.toLocaleString()} locally counted tokens. Provider overhead is additional.\n\n`);
            } else if (savedTokens > 0 || totalImageTokensSaved > 0) {
                response.markdown(`> ⚡ **Tokonomics${fileInfo}:** ${originalTokens.toLocaleString()} → ${optimizedTokens.toLocaleString()} tokens (**${reductionPercentage}% saved** | ~$${costSavedUSD.toFixed(4)} USD${imageNote})\n\n`);
            } else if (optimizedTokens > originalTokens) {
                // Retrieval adds context that was not in the prompt, so the payload is larger than
                // what the user typed. Reporting that as a "standalone prompt" of the original size
                // described the request that was never sent and hid the work that was done.
                const evidenceCount = compileResult.evidenceRetrieval?.selected.length ?? 0;
                response.markdown(`> ⚡ **Tokonomics${fileInfo}:** ${originalTokens.toLocaleString()} → ${optimizedTokens.toLocaleString()} tokens`
                    + `${evidenceCount ? ` - ${evidenceCount} workspace evidence item(s) retrieved and attached` : ''}${imageNote}.\n\n`);
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
            if (!subscription && capabilityEnabled('responseCache') && config.enableResponseCache !== false) {
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
                failureStage = 'provider response';
                const llmResponse = await CanonicalProviderGateway.send(targetModel, prepared, token);
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
            const modelId = (llmResponse as any).subscriptionModel || targetModel.id || targetModel.name || 'claude-3-7-sonnet';
            const providerId = targetModel.vendor || 'anthropic';
            const verifiedUsage = CostCalculator.parseVerifiedProviderUsage(responseUsage, compiled.requestId, providerId, modelId);
            const fallbackCostStatus = CostCalculator.statusWhenProviderUsageUnavailable(compileResult.event);
            const emitFinalCostStatusWithoutUsage = () => OptimizationEventBus.getInstance().emit({
                ...compileResult.event,
                id: compiled.requestId,
                timestamp: Date.now(),
                state: 'PROMPT_COMPLETED',
                provider: providerId as any,
                model: modelId,
                isCostReconciled: false,
                costStatus: fallbackCostStatus,
                ...(subscription ? { costStatus: 'unavailable' as const, costState: 'billed_unavailable' as const, observedInputTokens: verifiedUsage?.inputTokens,
                    projectedRawCostUSD: 0, projectedOptimizedCostUSD: 0, projectedSavingsUSD: 0,
                    outputTokens: verifiedUsage?.outputTokens, cachedTokens: verifiedUsage?.cacheReadInputTokens,
                    cacheWriteTokens: verifiedUsage?.cacheWriteInputTokens, subscriptionTransport: subscription } : {}),
                traceId: `${compiled.requestId}:cost-${fallbackCostStatus}`
            });
            if (verifiedUsage && !subscription) {
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
                        cacheWriteTokens: verifiedUsage.cacheWriteInputTokens,
                        observedInputTokens: verifiedUsage.inputTokens,
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
                    emitFinalCostStatusWithoutUsage();
                }
            } else emitFinalCostStatusWithoutUsage();

            if (!subscription && capabilityEnabled('responseCache') && config.enableResponseCache !== false && completeResponseText.length > 20) {
                cache.store(exactCacheRequest, completeResponseText, 'completed');
            }
            // The CLI picks its own model per request, so which one answered is a fact about this
            // turn that only the provider knows. Reported after the answer rather than guessed before.
            if (subscription) {
                const answeredBy = (llmResponse as any).subscriptionModel || reportedModel;
                const observed = verifiedUsage
                    ? ` - ${verifiedUsage.inputTokens.toLocaleString()} in / ${verifiedUsage.outputTokens.toLocaleString()} out, as reported by the provider`
                    : '';
                if (answeredBy) response.markdown(`\n\n> Answered by **${answeredBy}** through your ${subscription} CLI${observed}.`);
            }
        } catch (err: any) {
            AnonymizedLogger.getInstance().error('ChatParticipant', `Request failed during ${failureStage}.`, err);
            if (activeCompilation) {
                compiler.fail(activeCompilation, token.isCancellationRequested ? 'CANCELLED' : 'GENERATION_ERROR');
                activeCompilation = undefined;
            }
            const safeCode = typeof err?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(err.code)
                ? err.code : token.isCancellationRequested ? 'CANCELLED' : 'GENERATION_ERROR';
            if (err instanceof SubscriptionError) response.markdown(`Subscription chat stopped: ${err.message}`);
            else response.markdown(`The request stopped during ${failureStage} (${safeCode}). Export diagnostics for the failure details.`);
            response.button({ command: 'tokenOptimizer.exportLogs', title: 'Export diagnostics' });
        }
    });

    participant.iconPath = vscode.Uri.file(context.asAbsolutePath('assets/icon.png'));
    context.subscriptions.push(participant);
    return true;
}
