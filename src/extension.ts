/**
 * Extension Entry Point: Enterprise AI Token Optimizer 3.0
 */

import * as vscode from 'vscode';
import { AstPrunerEngine } from './ast/pruner';
import { CacheAlignerEngine } from './cache/aligner';
import { MetricsTracker } from './metrics/tracker';
import { ContextAnalyzer } from './proxy/contextAnalyzer';
import { TokenOptimizerLanguageModelProvider } from './proxy/modelProvider';
import { StatusBarManager } from './ui/statusBar';
import { DashboardWebviewPanel } from './ui/dashboardWebview';
import { registerChatParticipant } from './proxy/chatParticipant';
import { TokenCounter } from './engine/tokenizer';
import { PrunedDiffContentProvider } from './diff/diffProvider';
import { BudgetGuardrail } from './metrics/budgetGuard';
import { FileWatchIndex } from './repo/repoMap';
import { ResponseCache } from './cache/responseCache';
import { ReviewPrompter } from './ui/reviewPrompter';
import { RamContextManager } from './engine/ramManager';
import { AnonymizedLogger } from './security/anonymizedLogger';

let statusBarManager: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const logger = AnonymizedLogger.getInstance();
    const outputChannel = vscode.window.createOutputChannel('Tokonomics Diagnostics');
    context.subscriptions.push(outputChannel);
    logger.setOutputChannel(outputChannel);
    logger.info('Activation', 'Tokonomics AI Token Optimizer is activating...');

    // Global uncaught error listener to capture unhandled exceptions safely
    process.on('unhandledRejection', (reason) => {
        logger.captureException('Process', reason, 'unhandledRejection');
    });

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const optConf = vscode.workspace.getConfiguration('tokenOptimizer');

    // 1. Initialize Engines, Caches & In-Memory RAM Manager
    const astEngine = new AstPrunerEngine();
    astEngine.initialize(context.extensionPath).catch(err => {
        console.warn('[Tokonomics] Background AST parser init warning:', err);
    });

    const cacheAligner = new CacheAlignerEngine();
    const metricsTracker = new MetricsTracker(context.globalState);
    const contextAnalyzer = new ContextAnalyzer(astEngine, cacheAligner, metricsTracker);
    const fileWatchIndex = new FileWatchIndex(workspaceRoot);
    const cacheMaxSize = optConf.get<number>('responseCacheMaxSize', 100);
    const responseCache = new ResponseCache(cacheMaxSize);
    const reviewPrompter = new ReviewPrompter(context.globalState);

    // Initialize RAM Context Manager with user-configured budget
    const ramManager = new RamContextManager(astEngine, {
        ramBudgetMB: optConf.get<number>('ramBudgetMB', 64),
        enableBackgroundWarming: optConf.get<boolean>('enableBackgroundRamWarming', true),
        enableSemanticIndex: optConf.get<boolean>('enableRamSemanticIndex', true)
    }, workspaceRoot);

    // 2. Setup Document Watchers for Incremental Indexing & RAM Cache Invalidation
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const file = e.document.fileName;
            fileWatchIndex.onFileChanged(file);
            responseCache.invalidateForFile(file);
            ramManager.onFileChanged(file);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(e => {
            for (const f of e.files) {
                fileWatchIndex.onFileCreated(f.fsPath);
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(e => {
            for (const f of e.files) {
                fileWatchIndex.onFileDeleted(f.fsPath);
                responseCache.invalidateForFile(f.fsPath);
                ramManager.onFileDeleted(f.fsPath);
            }
        })
    );

    // Dynamic RAM Budget configuration listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('tokenOptimizer.ramBudgetMB') ||
                e.affectsConfiguration('tokenOptimizer.enableBackgroundRamWarming') ||
                e.affectsConfiguration('tokenOptimizer.enableRamSemanticIndex')) {
                const conf = vscode.workspace.getConfiguration('tokenOptimizer');
                ramManager.updateConfig({
                    ramBudgetMB: conf.get<number>('ramBudgetMB', 64),
                    enableBackgroundWarming: conf.get<boolean>('enableBackgroundRamWarming', true),
                    enableSemanticIndex: conf.get<boolean>('enableRamSemanticIndex', true)
                });
            }
        })
    );

    // Background RAM Pre-Warming (Idle micro-task)
    if (workspaceRoot && optConf.get<boolean>('enableBackgroundRamWarming', true)) {
        setTimeout(() => {
            ramManager.warmWorkspace(workspaceRoot).then(res => {
                console.log(`[Tokonomics] RAM Pre-Warm complete: ${res.skeletonsCached} skeletons, ${res.symbolsIndexed} symbols in ${res.durationMs}ms`);
            }).catch(err => {
                console.warn('[Tokonomics] RAM Pre-Warm warning:', err);
            });
        }, 500);
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
            contextAnalyzer,
            onComplete
        );

        if (vscode.lm && typeof (vscode.lm as any).registerLanguageModelChatProvider === 'function') {
            const providerDisposable = (vscode.lm as any).registerLanguageModelChatProvider(
                'token-optimizer-proxy',
                provider
            );
            context.subscriptions.push(providerDisposable);
            console.log('[Tokonomics] Registered vscode.lm chat provider proxy: token-optimizer-proxy');
        }
    } catch (err) {
        console.warn('[Tokonomics] Note on LM Provider registration:', err);
    }

    // 5. Register VS Code Native Chat Participant (@tokonomics / @tokenopt)
    try {
        registerChatParticipant(
            context,
            metricsTracker,
            astEngine,
            contextAnalyzer,
            fileWatchIndex,
            responseCache,
            onComplete,
            ramManager
        );
    } catch (err) {
        console.warn('[Tokonomics] Chat participant registration note:', err);
    }

    // 6. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.showDashboard', async () => {
            await statusBarManager?.showDashboard();
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
            responseCache.clear();
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

    logger.info('Lifecycle', 'Tokonomics extension activation complete.');
}

export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
