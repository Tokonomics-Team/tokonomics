/**
 * Extension Entry Point: Enterprise AI Token Optimizer 3.0
 */

import * as vscode from 'vscode';
import { AstPrunerEngine } from './ast/pruner';
import { CacheAlignerEngine } from './cache/aligner';
import { MetricsTracker } from './metrics/tracker';
import { TokenOptimizerLanguageModelProvider } from './proxy/modelProvider';
import { StatusBarManager } from './ui/statusBar';
import { DashboardWebviewPanel } from './ui/dashboardWebview';
import { registerChatParticipant } from './proxy/chatParticipant';
import { TokenCounter } from './engine/tokenizer';
import { PrunedDiffContentProvider } from './diff/diffProvider';
import { BudgetGuardrail } from './metrics/budgetGuard';
import { ResponseCache } from './cache/responseCache';
import { ReviewPrompter } from './ui/reviewPrompter';
import { AnonymizedLogger } from './security/anonymizedLogger';
import { PipelineOrchestrator } from './engine/pipelineOrchestrator';
import { LiveMetricsAggregator } from './metrics/liveAggregator';
import { LocalHistoryStore } from './history/localHistoryStore';
import { FeatureFlagRegistry } from './engine/featureFlags';
import { CanonicalRequestCompiler } from './protocol/canonicalCompiler';
import { VersionedWorkspaceIndex } from './workspace/workspaceIndex';

let statusBarManager: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const logger = AnonymizedLogger.getInstance();
    const outputChannel = vscode.window.createOutputChannel('Tokonomics Diagnostics');
    context.subscriptions.push(outputChannel);
    logger.setOutputChannel(outputChannel);
    logger.info('Activation', 'Tokonomics AI Token Optimizer is activating...');

    // Global uncaught error listener to capture unhandled exceptions safely
    process.on('uncaughtException', (err: any) => {
        logger.error('UnhandledException', err);
    });

    const workspaceIsTrusted = () => vscode.workspace.isTrusted !== false;
    const workspaceRoots = () => (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
    const automaticWorkspaceIndexing = () => vscode.workspace.getConfiguration('tokenOptimizer')
        .get<'off' | 'selection' | 'referenced' | 'automatic'>('workspaceContextMode', 'selection') === 'automatic';
    const optConf = vscode.workspace.getConfiguration('tokenOptimizer');

    // Initialize pipeline mode from user configuration (default: compiler)
    const initialPipelineMode = optConf.get<'compiler' | 'hybrid' | 'legacy'>('pipelineMode', 'compiler');
    FeatureFlagRegistry.setPipelineMode(initialPipelineMode);

    // 1. Initialize Engines, Caches & In-Memory RAM Manager
    const astEngine = new AstPrunerEngine();
    astEngine.initialize(context.extensionPath).catch(err => {
        console.warn('[Tokonomics] Background AST parser init warning:', err);
    });

    const cacheAligner = new CacheAlignerEngine();
    const metricsTracker = new MetricsTracker(context.globalState);
    const localHistoryStore = LocalHistoryStore.getInstance(context.globalState);

    const workspaceIndex = new VersionedWorkspaceIndex(workspaceRoots(), astEngine, {
        budgetMB: optConf.get<number>('ramBudgetMB', 64),
        maxFileBytes: optConf.get<number>('maxIndexFileSizeKB', 300) * 1024,
        trusted: workspaceIsTrusted()
    });
    context.subscriptions.push({ dispose: () => workspaceIndex.dispose() });

    const pipelineOrchestrator = new PipelineOrchestrator(astEngine, undefined, cacheAligner, metricsTracker, workspaceIndex);
    const requestCompiler = new CanonicalRequestCompiler(pipelineOrchestrator);
    const cacheMaxSize = optConf.get<number>('responseCacheMaxSize', 100);
    const responseCache = new ResponseCache(cacheMaxSize);
    const reviewPrompter = new ReviewPrompter(context.globalState);

    // 2. One versioned facade owns all production workspace intelligence.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
            const file = e.document.fileName;
            responseCache.invalidateForFile(file);
            const includeUnsaved = vscode.workspace.getConfiguration('tokenOptimizer').get<boolean>('includeUnsavedBuffers', false);
            if (includeUnsaved) workspaceIndex.scheduleUpsert(file, { text: e.document.getText(), version: e.document.version });
            if (/[/\\](?:\.gitignore|\.tokenignore)$/i.test(file)) void workspaceIndex.rebuild();
        })
    );
    if (typeof vscode.workspace.onDidSaveTextDocument === 'function') {
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
            if (workspaceIsTrusted() && automaticWorkspaceIndexing()) workspaceIndex.scheduleUpsert(document.fileName);
        }));
    }
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(e => {
            if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
            for (const f of e.files) {
                workspaceIndex.scheduleUpsert(f.fsPath);
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(e => {
            if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
            for (const f of e.files) {
                responseCache.invalidateForFile(f.fsPath);
                workspaceIndex.delete(f.fsPath);
            }
        })
    );
    if (typeof vscode.workspace.onDidRenameFiles === 'function') {
        context.subscriptions.push(vscode.workspace.onDidRenameFiles(e => {
            if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
            for (const file of e.files) {
                responseCache.invalidateForFile(file.oldUri.fsPath);
                void workspaceIndex.rename(file.oldUri.fsPath, file.newUri.fsPath);
            }
        }));
    }
    if (typeof vscode.workspace.onDidChangeWorkspaceFolders === 'function') {
        context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void workspaceIndex.replaceRoots(workspaceRoots(), automaticWorkspaceIndexing() && workspaceIsTrusted());
        }));
    }

    // Dynamic configuration listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('tokenOptimizer.ramBudgetMB')) {
                workspaceIndex.updateBudgetMB(vscode.workspace.getConfiguration('tokenOptimizer').get<number>('ramBudgetMB', 64));
            }
            if (e.affectsConfiguration('tokenOptimizer.workspaceContextMode')) {
                if (automaticWorkspaceIndexing()) void workspaceIndex.rebuild();
                else {
                    workspaceIndex.setTrusted(false);
                    workspaceIndex.setTrusted(workspaceIsTrusted());
                }
            }
            if (e.affectsConfiguration('tokenOptimizer.pipelineMode')) {
                const conf = vscode.workspace.getConfiguration('tokenOptimizer');
                const newMode = conf.get<'compiler' | 'hybrid' | 'legacy'>('pipelineMode', 'compiler');
                FeatureFlagRegistry.setPipelineMode(newMode);
                console.log(`[Tokonomics] Pipeline mode updated to: ${newMode}`);
            }
        })
    );

    // Background snapshot construction; per-file sequences prevent stale publication.
    const warmTrustedWorkspace = () => {
        if (workspaceRoots().length === 0 || !automaticWorkspaceIndexing() || !optConf.get<boolean>('enableBackgroundRamWarming', true)) return;
        setTimeout(() => {
            workspaceIndex.initialize().then(async snapshot => {
                console.log(`[Tokonomics] Workspace snapshot ${snapshot.generation} ready: ${snapshot.files.size} files, ${snapshot.symbols.length} symbols`);
                const includeUnsaved = vscode.workspace.getConfiguration('tokenOptimizer').get<boolean>('includeUnsavedBuffers', false);
                if (includeUnsaved) {
                    for (const document of vscode.workspace.textDocuments || []) {
                        if (document.isDirty && !document.isUntitled) {
                            await workspaceIndex.upsert(document.fileName, { text: document.getText(), version: document.version });
                        }
                    }
                }
            }).catch(err => {
                console.warn('[Tokonomics] Workspace index warning:', err);
            });
        }, 1000);
    };
    warmTrustedWorkspace();
    if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
        context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
            workspaceIndex.setTrusted(true);
            void workspaceIndex.replaceRoots(workspaceRoots(), false).then(warmTrustedWorkspace);
        }));
    }

    // 3. Setup UI & Visual Diff Provider
    statusBarManager = new StatusBarManager(metricsTracker);
    context.subscriptions.push(statusBarManager);
    PrunedDiffContentProvider.register(context, astEngine);

    const onComplete = () => {
        statusBarManager?.update();
        if (DashboardWebviewPanel.currentPanel) {
            DashboardWebviewPanel.currentPanel.updateContent();
        }
        BudgetGuardrail.checkBudget(metricsTracker);
        reviewPrompter.recordAction();
    };

    // 4. Register Language Model Provider Proxy
    try {
        const provider = new TokenOptimizerLanguageModelProvider(
            requestCompiler,
            onComplete,
            () => workspaceIndex.captureSnapshot()
        );

        if (vscode.lm && typeof (vscode.lm as any).registerLanguageModelChatProvider === 'function') {
            const providerDisposable = (vscode.lm as any).registerLanguageModelChatProvider(
                'tokonomics',
                provider
            );
            context.subscriptions.push(providerDisposable);
            console.log('[Tokonomics] Registered vscode.lm chat provider proxy with vendor: tokonomics');
        }
    } catch (err) {
        console.warn('[Tokonomics] Note on LM Provider registration:', err);
    }

    // 5. Register VS Code Native Chat Participant (@tokonomics)
    try {
        registerChatParticipant(
            context,
            metricsTracker,
            astEngine,
            responseCache,
            onComplete,
            pipelineOrchestrator,
            requestCompiler,
            workspaceIndex
        );
    } catch (err) {
        console.warn('[Tokonomics] Chat participant registration note:', err);
    }

    // 6. Register Commands (Strictly unique command IDs)
    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.showDashboard', () => {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.showAnalyticsWebview', () => {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.toggleAstPruning', async () => {
            const config = vscode.workspace.getConfiguration('tokenOptimizer');
            const current = config.get<boolean>('enableAstPruning', true);
            await config.update('enableAstPruning', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`AST Structural Pruning is now ${!current ? 'Enabled' : 'Disabled'}.`);
            statusBarManager?.update();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.resetMetrics', () => {
            metricsTracker.reset();
            localHistoryStore.clear();
            responseCache.clear();
            logger.clear();
            statusBarManager?.update();
            if (DashboardWebviewPanel.currentPanel) {
                DashboardWebviewPanel.currentPanel.updateContent();
            }
            vscode.window.showInformationMessage('Session token metrics and response cache have been reset.');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.optimizeSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open a code file and select text to optimize.');
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            if (!selectedText || selectedText.trim().length === 0) {
                vscode.window.showInformationMessage('Please select code in the editor to optimize.');
                return;
            }

            const langId = editor.document.languageId;
            const originalTokens = TokenCounter.countTokens(selectedText);
            const pruneResult = astEngine.pruneCodeContext(selectedText, langId);

            await vscode.env.clipboard.writeText(pruneResult.prunedCode);

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
                langId
            );
            statusBarManager?.update();
            if (DashboardWebviewPanel.currentPanel) {
                DashboardWebviewPanel.currentPanel.updateContent();
            }
            BudgetGuardrail.checkBudget(metricsTracker);

            vscode.window.showInformationMessage(
                `⚡ Optimized! Reduced ${originalTokens} → ${pruneResult.prunedTokenCount} tokens (${pruneResult.reductionPercentage}% saved in ${pruneResult.durationMs}ms). Pruned context copied to clipboard.`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.exportLogs', async () => {
            const report = logger.exportAnonymizedReport();
            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
            vscode.window.showInformationMessage('📋 Tokonomics Anonymized Diagnostic Log generated (100% sanitized, no private data).');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.liveStats', async () => {
            const summary = LiveMetricsAggregator.getInstance().getAggregateSummary('session');
            vscode.window.showInformationMessage(
                `⚡ Tokonomics Live Session: ${summary.totalPrompts} prompts | ${summary.savedTokens.toLocaleString()} tokens saved (-${summary.averageReductionPercentage}%) | ~$${summary.savedCostUSD.toFixed(3)} saved | CQ: ${summary.averagePredictedCQ}%`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.aggregateStats', async () => {
            const agg = LiveMetricsAggregator.getInstance();
            const s = agg.getAggregateSummary('session');
            const t = agg.getAggregateSummary('today');
            const l = agg.getAggregateSummary('lifetime');
            const report = [
                `# 📊 Tokonomics Real-Time Aggregated Metrics`,
                ``,
                `### ⚡ Active Session`,
                `- **Prompts:** ${s.totalPrompts}`,
                `- **Tokens Saved:** ${s.savedTokens.toLocaleString()} (-${s.averageReductionPercentage}%)`,
                `- **Estimated Savings:** ~$${s.savedCostUSD.toFixed(3)} USD`,
                `- **Average Context Quality:** ${s.averagePredictedCQ}%`,
                `- **Average Latency:** ${s.averageOptimizationLatencyMs}ms`,
                ``,
                `### 📅 Today`,
                `- **Prompts:** ${t.totalPrompts}`,
                `- **Tokens Saved:** ${t.savedTokens.toLocaleString()} (-${t.averageReductionPercentage}%)`,
                `- **Estimated Savings:** ~$${t.savedCostUSD.toFixed(3)} USD`,
                ``,
                `### 🏛️ Lifetime`,
                `- **Prompts:** ${l.totalPrompts}`,
                `- **Tokens Saved:** ${l.savedTokens.toLocaleString()} (-${l.averageReductionPercentage}%)`,
                `- **Estimated Savings:** ~$${l.savedCostUSD.toFixed(3)} USD`
            ].join('\n');

            const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
            await vscode.window.showTextDocument(doc, { preview: false });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.explainTrace', async () => {
            const traces = pipelineOrchestrator.getTraceLogger().getTraces();
            const traceText = traces.length > 0
                ? JSON.stringify(traces[traces.length - 1], null, 2)
                : 'No recent context compilation traces recorded in this session.';

            const doc = await vscode.workspace.openTextDocument({
                content: `# 🔍 Tokonomics Context Compiler Decision Trace\n\n\`\`\`json\n${traceText}\n\`\`\``,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        })
    );

    logger.info('Lifecycle', 'Tokonomics extension activation complete.');
}

export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
