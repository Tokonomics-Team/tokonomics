/**
 * Extension Entry Point: Enterprise AI Token Optimizer 3.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AstPrunerEngine } from './ast/pruner';
import { CacheAlignerEngine } from './cache/aligner';
import { MetricsTracker } from './metrics/tracker';
import { TokenOptimizerLanguageModelProvider } from './proxy/modelProvider';
import {
    TOKONOMICS_CHAT_CAPABILITY_CONTEXT, TOKONOMICS_CHAT_SURFACE_PROMOTED,
    TOKONOMICS_CHAT_VIEW_ID, TOKONOMICS_CHAT_EDITOR_ID, TokonomicsChatViewProvider
} from './ui/chatViewProvider';
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
import { RequestLedger } from './events/requestLedger';
import { BoundedPriorityScheduler } from './performance/boundedScheduler';
import { CpuWorkerBoundary } from './performance/cpuWorkerBoundary';
import { KillSwitchCapability, ReleaseControl, ReleaseControlSnapshot } from './release/releaseControl';
import { ExperimentRuntime } from './experiments/experimentRuntime';
import { migrateLegacyPreferences, RuntimeConfiguration, UserPreferenceRegistry } from './config/userPreferences';
import { ComponentRegistry } from './engine/componentRegistry';
import { RequestLifecycleController } from './performance/requestLifecycle';
import { ProjectMemoryEngine, MemoryItemType } from './memory/projectMemory';
import { FinOpsService } from './finops/finOpsService';
import { registerSubscriptionCommands } from './subscriptions/subscriptionModels';
import { panelModel } from './ui/panelModel';

let statusBarManager: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const logger = AnonymizedLogger.getInstance();
    const outputChannel = vscode.window.createOutputChannel('Tokonomics Diagnostics');
    context.subscriptions.push(outputChannel);
    logger.setOutputChannel(outputChannel);
    logger.info('Activation', 'Tokonomics AI Token Optimizer is activating...');

    // Global uncaught error listener to capture unhandled exceptions safely
    const uncaughtExceptionHandler = (err: any) => {
        logger.error('UnhandledException', err);
    };
    process.on('uncaughtException', uncaughtExceptionHandler);
    context.subscriptions.push({ dispose: () => process.off('uncaughtException', uncaughtExceptionHandler) });

    const workspaceIsTrusted = () => vscode.workspace.isTrusted !== false;
    const workspaceRoots = () => (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
    const optConf = vscode.workspace.getConfiguration('tokenOptimizer');
    const migratedRuntime = await migrateLegacyPreferences(optConf, context.globalState);
    UserPreferenceRegistry.apply(migratedRuntime);
    if (migratedRuntime.migration.source === 'v6-legacy') {
        logger.info('Configuration', 'Legacy preferences were migrated to the v7 settings profile.', {
            migratedKeyCount: migratedRuntime.migration.migratedLegacyKeys.length
        });
    }
    if (migratedRuntime.migration.malformedKeys.length > 0) {
        logger.warn('Configuration', 'Invalid preference values were replaced with conservative defaults.', {
            invalidKeyCount: migratedRuntime.migration.malformedKeys.length
        });
    }
    let runtimeConfiguration: RuntimeConfiguration = migratedRuntime;
    const evaluateReleaseControl = (): ReleaseControlSnapshot => ReleaseControl.evaluate(
        runtimeConfiguration.releaseControl,
        vscode.env.machineId || 'anonymous'
    );
    let releaseControl = evaluateReleaseControl();
    const capabilityEnabled = (capability: KillSwitchCapability) => !releaseControl.forcePassThrough
        && !releaseControl.disabledCapabilities.has(capability);
    let memoryConsentActive = false;
    const loadRuntimeFlags = (resolved?: RuntimeConfiguration) => {
        if (resolved) FeatureFlagRegistry.applyRuntimeConfiguration(resolved);
        else FeatureFlagRegistry.loadFromConfiguration(vscode.workspace.getConfiguration('tokenOptimizer'));
        runtimeConfiguration = UserPreferenceRegistry.get();
        releaseControl = evaluateReleaseControl();
        FeatureFlagRegistry.setReleasePassThrough(releaseControl.forcePassThrough);
        if (!capabilityEnabled('localInference')) FeatureFlagRegistry.setFlag('enableLocalSlm', false);
        if (memoryConsentActive) FeatureFlagRegistry.setFlag('enableProjectMemory', true);
        FeatureFlagRegistry.setCapabilityContext({
            workspaceTrusted: workspaceIsTrusted(),
            experimentalConsent: runtimeConfiguration.experiments.consent,
            disabledCapabilities: [...releaseControl.disabledCapabilities]
        });
        ExperimentRuntime.configure({
            consent: runtimeConfiguration.experiments.consent,
            enabled: runtimeConfiguration.experiments.enabled,
            disabled: runtimeConfiguration.experiments.disabled,
            trustedWorkspace: workspaceIsTrusted(),
            releaseEnabled: !releaseControl.forcePassThrough,
            maxLatencyMs: runtimeConfiguration.experiments.maxLatencyMs,
            maxMemoryMB: runtimeConfiguration.experiments.maxMemoryMB
        });
    };
    const automaticWorkspaceIndexing = () => capabilityEnabled('workspaceIndex')
        && runtimeConfiguration.workspace.contextMode === 'automatic';
    loadRuntimeFlags(migratedRuntime);

    // 1. Construct lightweight services. Parser/index I/O stays lazy and trust-gated.
    const workScheduler = new BoundedPriorityScheduler(2, 128, 8);
    const inferenceScheduler = new BoundedPriorityScheduler(4, 32, 8);
    const cpuWorkerBoundary = new CpuWorkerBoundary();
    const requestLifecycleController = new RequestLifecycleController(64, 64);
    context.subscriptions.push({ dispose: () => workScheduler.dispose() });
    context.subscriptions.push({ dispose: () => inferenceScheduler.dispose() });
    context.subscriptions.push({ dispose: () => cpuWorkerBoundary.dispose() });
    context.subscriptions.push({ dispose: () => requestLifecycleController.dispose() });
    const astEngine = new AstPrunerEngine();
    context.subscriptions.push(astEngine);
    let parserPreparation: Promise<void> | undefined;
    const ensureParserReady = (): Promise<void> => {
        if (!workspaceIsTrusted()) return Promise.resolve();
        if (!parserPreparation) parserPreparation = astEngine.initialize(context.extensionPath).catch(() => {
            logger.warn('Parser', 'AST parser unavailable; deterministic parser fallback remains active.');
        });
        return parserPreparation;
    };

    const cacheAligner = new CacheAlignerEngine();
    const requestLedger = RequestLedger.getInstance();
    requestLedger.configurePersistence(context.globalState);
    context.subscriptions.push({ dispose: () => requestLedger.dispose() });
    await FinOpsService.getInstance().initialize(context);
    registerSubscriptionCommands(context);
    const metricsTracker = new MetricsTracker(context.globalState);
    const localHistoryStore = LocalHistoryStore.getInstance(context.globalState);

    const workspaceIndex = new VersionedWorkspaceIndex(workspaceRoots(), astEngine, {
        budgetMB: runtimeConfiguration.workspace.ramBudgetMB,
        maxFileBytes: runtimeConfiguration.workspace.maxIndexFileSizeKB * 1024,
        trusted: workspaceIsTrusted(),
        scheduler: workScheduler,
        workerBoundary: cpuWorkerBoundary,
        prepareParser: ensureParserReady
    });
    context.subscriptions.push({ dispose: () => workspaceIndex.dispose() });

    const pipelineOrchestrator = new PipelineOrchestrator(astEngine, undefined, cacheAligner, metricsTracker, workspaceIndex);
    const memoryWorkspaceId = () => workspaceIndex.captureSnapshot().roots.map(root => root.id).sort().join('_') || 'default_workspace';
    const memoryConsentKey = () => `tokonomics.projectMemory.consent.${memoryWorkspaceId()}`;
    const memorySecretKey = 'tokonomics.projectMemory.masterKey.v1';
    const memoryStorageRoot = path.join(context.globalStorageUri?.fsPath || context.extensionPath, '.tokonomics-project-memory');
    let memoryKeyMaterial: Buffer | undefined;
    const configureMemoryEngine = (consent: boolean) => {
        const engine = new ProjectMemoryEngine({
            storageDir: memoryStorageRoot,
            encryptionKeyProvider: { getKey: () => memoryKeyMaterial },
            keyVersion: 1
        });
        const workspaceId = memoryWorkspaceId();
        engine.setWorkspaceTrust(workspaceId, workspaceIsTrusted());
        engine.setWorkspaceConsent(workspaceId, consent);
        pipelineOrchestrator.setProjectMemoryEngine(engine);
        memoryConsentActive = consent;
        FeatureFlagRegistry.setFlag('enableProjectMemory', consent);
        return engine;
    };
    const storedMemoryConsent = context.workspaceState.get<boolean>(memoryConsentKey(), false);
    if (storedMemoryConsent && workspaceIsTrusted()) {
        const encoded = await context.secrets.get(memorySecretKey);
        if (encoded) memoryKeyMaterial = Buffer.from(encoded, 'base64');
    }
    configureMemoryEngine(Boolean(storedMemoryConsent && memoryKeyMaterial));
    const requestCompiler = new CanonicalRequestCompiler(pipelineOrchestrator, workScheduler, ensureParserReady, requestLifecycleController);
    const cacheMaxSize = runtimeConfiguration.responseCache.maxSize;
    const responseCache = new ResponseCache(cacheMaxSize);
    const reviewPrompter = new ReviewPrompter(context.globalState);

    // 2. One versioned facade owns all production workspace intelligence.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
            const file = e.document.fileName;
            responseCache.invalidateForFile(file);
            const includeUnsaved = runtimeConfiguration.workspace.includeUnsavedBuffers;
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

    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    const reconcileDisk = (uri: vscode.Uri, deleted = false) => {
        if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
        responseCache.invalidateForFile(uri.fsPath);
        if (/[/\\](?:\.gitignore|\.tokenignore)$/.test(uri.fsPath)) {
            void workspaceIndex.rebuild().catch(error => logger.error('WorkspaceIndex', 'Rebuild failed.', error));
        } else if (deleted) workspaceIndex.delete(uri.fsPath);
        else workspaceIndex.scheduleUpsert(uri.fsPath);
    };
    context.subscriptions.push(fileWatcher,
        fileWatcher.onDidCreate(uri => reconcileDisk(uri)),
        fileWatcher.onDidChange(uri => reconcileDisk(uri)),
        fileWatcher.onDidDelete(uri => reconcileDisk(uri, true)),
        vscode.workspace.onDidCloseTextDocument(document => {
            if (workspaceIsTrusted() && automaticWorkspaceIndexing()) workspaceIndex.scheduleUpsert(document.fileName);
        }));

    // Dynamic configuration listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('tokenOptimizer')) loadRuntimeFlags();
            if (e.affectsConfiguration('tokenOptimizer')) DashboardWebviewPanel.currentPanel?.updateContent();
            if (e.affectsConfiguration('tokenOptimizer.optimizationMode')) {
                workspaceIndex.updateBudgetMB(runtimeConfiguration.workspace.ramBudgetMB);
            }
            if (e.affectsConfiguration('tokenOptimizer.workspaceContext') || e.affectsConfiguration('tokenOptimizer.optimizationMode')) {
                if (automaticWorkspaceIndexing()) void workspaceIndex.rebuild();
                else {
                    workspaceIndex.setTrusted(false);
                    workspaceIndex.setTrusted(workspaceIsTrusted());
                }
            }
        })
    );

    // Background snapshot construction; per-file sequences prevent stale publication.
    let warmTimer: ReturnType<typeof setTimeout> | undefined;
    context.subscriptions.push({ dispose: () => { if (warmTimer) clearTimeout(warmTimer); } });
    const warmTrustedWorkspace = () => {
        if (workspaceRoots().length === 0 || !automaticWorkspaceIndexing() || !runtimeConfiguration.workspace.backgroundWarming) return;
        if (warmTimer) clearTimeout(warmTimer);
        warmTimer = setTimeout(() => {
            warmTimer = undefined;
            ensureParserReady().then(() => workspaceIndex.initialize('warming')).then(async snapshot => {
                logger.info('WorkspaceIndex', 'A trusted workspace snapshot is ready.', {
                    generation: snapshot.generation, fileCount: snapshot.files.size, symbolCount: snapshot.symbols.length
                });
                const includeUnsaved = runtimeConfiguration.workspace.includeUnsavedBuffers;
                if (includeUnsaved) {
                    for (const document of vscode.workspace.textDocuments || []) {
                        if (document.isDirty && !document.isUntitled) {
                            await workspaceIndex.upsert(document.fileName, { text: document.getText(), version: document.version });
                        }
                    }
                }
            }).catch(() => {
                logger.warn('WorkspaceIndex', 'Workspace warming failed safely.');
            });
        }, 1000);
    };
    warmTrustedWorkspace();
    if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
        context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
            loadRuntimeFlags();
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
        // The dashboard receives prompt events through DashboardController.
        // Replacing the entire HTML document here would reset scroll, modal,
        // focus, and the user's selected time window after every prompt.
        BudgetGuardrail.checkBudget(metricsTracker);
        reviewPrompter.recordAction();
    };

    // The snapshot a proxied request may retrieve from. The index warms in the background, so a
    // caller that reads only what is present races that warm: the first prompts after opening the
    // editor saw nothing indexed and went out with no workspace source. The chat participant has
    // always waited for the index in Automatic mode; this makes the proxy behave the same way.
    const resolveRetrievalSnapshot = async () => {
        const snapshot = workspaceIndex.captureSnapshot();
        return snapshot.files.size === 0 && UserPreferenceRegistry.get().workspace.contextMode === 'automatic'
            ? workspaceIndex.ensureInitialized()
            : snapshot;
    };

    // 4. Register Language Model Provider Proxy
    let languageModelProviderRegistered = false;
    let proxyProvider: TokenOptimizerLanguageModelProvider | undefined;
    try {
        const provider = new TokenOptimizerLanguageModelProvider(
            requestCompiler,
            onComplete,
            resolveRetrievalSnapshot,
            inferenceScheduler
        );
        proxyProvider = provider;

        if (vscode.lm && typeof (vscode.lm as any).registerLanguageModelChatProvider === 'function') {
            const providerDisposable = (vscode.lm as any).registerLanguageModelChatProvider(
                'tokonomics',
                provider
            );
            context.subscriptions.push(providerDisposable);
            languageModelProviderRegistered = true;
            logger.info('Provider', 'The Tokonomics language-model provider was registered.');
        }
    } catch {
        logger.warn('Provider', 'Language-model provider registration was unavailable.');
    }

    // 4b. Register the optional Tokonomics chat view.
    // Registration is cheap and lazy: the provider does nothing until the user opens the view, so
    // this performs no model query, no consent prompt and no request at startup. The view is an
    // additive surface; the @tokonomics participant below remains the alternative and is unchanged.
    await vscode.commands.executeCommand('setContext', TOKONOMICS_CHAT_CAPABILITY_CONTEXT,
        TOKONOMICS_CHAT_SURFACE_PROMOTED);
    if (TOKONOMICS_CHAT_SURFACE_PROMOTED) {
        try {
            // The panel shares the registered proxy rather than constructing a second one: two
            // instances with separately wired snapshot resolvers is how the sidebar and the chat
            // participant came to answer the workspace-context question differently.
            const panelProxy = proxyProvider ?? new TokenOptimizerLanguageModelProvider(
                requestCompiler, onComplete, resolveRetrievalSnapshot, inferenceScheduler);
            const chatViewProvider = new TokonomicsChatViewProvider(context.extensionUri,
                onActivity => panelModel(panelProxy, onActivity), context.workspaceState);
            context.subscriptions.push(chatViewProvider);
            context.subscriptions.push(vscode.window.registerWebviewViewProvider(
                TOKONOMICS_CHAT_VIEW_ID,
                chatViewProvider,
                { webviewOptions: { retainContextWhenHidden: true } }
            ));
            context.subscriptions.push(vscode.commands.registerCommand('tokenOptimizer.openChat',
                () => chatViewProvider.openSidebar()));
            context.subscriptions.push(vscode.commands.registerCommand('tokenOptimizer.openChatInEditor',
                () => chatViewProvider.openEditor()));
            context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(TOKONOMICS_CHAT_EDITOR_ID, {
                deserializeWebviewPanel: async panel => { chatViewProvider.restoreEditor(panel); }
            }));
            logger.info('ChatView', 'The Tokonomics chat view was registered.');
        } catch {
            logger.warn('ChatView', 'Chat view registration was unavailable in this host.');
        }
    }

    // 5. Register VS Code Native Chat Participant (@tokonomics)
    let chatParticipantRegistered = false;
    try {
        chatParticipantRegistered = registerChatParticipant(
            context,
            metricsTracker,
            astEngine,
            responseCache,
            onComplete,
            pipelineOrchestrator,
            requestCompiler,
            workspaceIndex,
            cpuWorkerBoundary,
            inferenceScheduler,
            capabilityEnabled
        );
    } catch {
        logger.warn('ChatParticipant', 'Chat participant registration was unavailable.');
    }

    // 6. Register Commands (Strictly unique command IDs)
    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.showDashboard', () => {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine, workspaceIndex);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.showAnalyticsWebview', () => {
            DashboardWebviewPanel.createOrShow(metricsTracker, astEngine, workspaceIndex);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.toggleAstPruning', async () => {
            const config = vscode.workspace.getConfiguration('tokenOptimizer');
            const current = UserPreferenceRegistry.get().preferences.optimizationMode;
            const next = current === 'off' ? 'balanced' : 'off';
            await config.update('optimizationMode', next, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Tokonomics optimization is now ${next === 'off' ? 'Off' : 'Balanced'}.`);
            statusBarManager?.update();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.resetMetrics', () => {
            metricsTracker.reset();
            RequestLedger.getInstance().clear();
            LiveMetricsAggregator.getInstance().resetSession();
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
                DashboardWebviewPanel.currentPanel.dispatchActiveFileDiagnosis();
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
            const cost = summary.savedCostUSD === null ? 'cost unavailable'
                : `${summary.reconciledPrompts < summary.costedPrompts ? '~' : ''}$${summary.savedCostUSD.toFixed(3)}`;
            vscode.window.showInformationMessage(
                `⚡ Tokonomics Live Session: ${summary.totalPrompts} prompts | ${summary.savedTokens.toLocaleString()} tokens saved (-${summary.averageReductionPercentage}%) | ${cost} saved | CQ: ${summary.averagePredictedCQ === null ? 'unavailable' : `${summary.averagePredictedCQ}%`}`
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
                `- **Cost Savings:** ${s.savedCostUSD === null ? 'Unavailable' : `${s.reconciledPrompts < s.costedPrompts ? '~' : ''}$${s.savedCostUSD.toFixed(3)} USD`}`,
                `- **Average Context Quality:** ${s.averagePredictedCQ === null ? 'Unavailable' : `${s.averagePredictedCQ}%`}`,
                `- **Average Latency:** ${s.averageOptimizationLatencyMs === null ? 'Unavailable' : `${s.averageOptimizationLatencyMs}ms`}`,
                ``,
                `### 📅 Today`,
                `- **Prompts:** ${t.totalPrompts}`,
                `- **Tokens Saved:** ${t.savedTokens.toLocaleString()} (-${t.averageReductionPercentage}%)`,
                `- **Cost Savings:** ${t.savedCostUSD === null ? 'Unavailable' : `${t.reconciledPrompts < t.costedPrompts ? '~' : ''}$${t.savedCostUSD.toFixed(3)} USD`}`,
                ``,
                `### 🏛️ Lifetime`,
                `- **Prompts:** ${l.totalPrompts}`,
                `- **Tokens Saved:** ${l.savedTokens.toLocaleString()} (-${l.averageReductionPercentage}%)`,
                `- **Cost Savings:** ${l.savedCostUSD === null ? 'Unavailable' : `${l.reconciledPrompts < l.costedPrompts ? '~' : ''}$${l.savedCostUSD.toFixed(3)} USD`}`
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

    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.manageProjectMemory', async () => {
            if (!workspaceIsTrusted()) {
                vscode.window.showWarningMessage('Project memory is unavailable in Restricted Mode.');
                return;
            }
            const workspaceId = memoryWorkspaceId();
            const engine = pipelineOrchestrator.getProjectMemoryEngine();
            const enabled = engine.hasWorkspaceConsent(workspaceId);
            const action = await vscode.window.showQuickPick([
                ...(!enabled ? [{ label: 'Enable project memory', description: 'Review consent and enable encrypted local storage' }] : []),
                ...(enabled ? [
                    { label: 'Add memory item', description: 'Store one explicit decision or constraint' },
                    { label: 'Inspect memory', description: 'View every stored item' },
                    { label: 'Delete an item', description: 'Remove one stored item' },
                    { label: 'Export metadata', description: 'Export hashes and governance fields without content' },
                    { label: 'Rebuild memory', description: 'Reload and revalidate encrypted storage' },
                    { label: 'Disable memory', description: 'Stop use but retain the encrypted file' },
                    { label: 'Delete project memory', description: 'Permanently remove this project memory' }
                ] : [])
            ], { placeHolder: 'Manage local project memory' });
            if (!action) return;

            if (action.label === 'Enable project memory') {
                const choice = await vscode.window.showInformationMessage(
                    `Project memory stores up to 2 MB under ${memoryStorageRoot}. ` +
                    'It is retained until you delete it, encrypted with a key held by VS Code Secret Storage, and selected items may enter upstream model requests. No source files, prompts, terminal logs, secrets, or high-sensitivity items are accepted.',
                    { modal: true }, 'Enable');
                if (choice !== 'Enable') return;
                memoryKeyMaterial = randomBytes(32);
                await context.secrets.store(memorySecretKey, memoryKeyMaterial.toString('base64'));
                configureMemoryEngine(true);
                await context.workspaceState.update(memoryConsentKey(), true);
                vscode.window.showInformationMessage('Encrypted project memory is enabled for this workspace.');
                return;
            }
            if (!enabled) return;
            if (action.label === 'Add memory item') {
                const type = await vscode.window.showQuickPick(['decision', 'convention', 'constraint', 'terminology', 'task_note'] as MemoryItemType[], { placeHolder: 'Memory type' });
                const title = type && await vscode.window.showInputBox({ prompt: 'Short title', validateInput: value => value.trim() ? undefined : 'A title is required.' });
                const description = title && await vscode.window.showInputBox({ prompt: 'Concise fact, decision, or constraint', validateInput: value => value.trim() ? undefined : 'A description is required.' });
                const reason = description && await vscode.window.showInputBox({ prompt: 'Why should this be remembered?', validateInput: value => value.trim() ? undefined : 'A reason is required.' });
                if (!type || !title || !description || !reason) return;
                engine.addMemoryItem(workspaceId, { id: `manual_${Date.now()}`, type: type as MemoryItemType, title, description, reason, source: 'user_command' });
                vscode.window.showInformationMessage('Project memory item added.');
            } else if (action.label === 'Inspect memory') {
                const doc = await vscode.workspace.openTextDocument({ content: engine.exportMemory(workspaceId), language: 'json' });
                await vscode.window.showTextDocument(doc, { preview: false });
            } else if (action.label === 'Delete an item') {
                const item = await vscode.window.showQuickPick(engine.inspectMemory(workspaceId).map(entry => ({ label: entry.title, description: entry.type, id: entry.id })), { placeHolder: 'Choose an item to delete' });
                if (item && engine.deleteMemoryItem(workspaceId, item.id)) vscode.window.showInformationMessage('Project memory item deleted.');
            } else if (action.label === 'Export metadata') {
                const doc = await vscode.workspace.openTextDocument({ content: engine.exportMetadata(workspaceId), language: 'json' });
                await vscode.window.showTextDocument(doc, { preview: false });
            } else if (action.label === 'Rebuild memory') {
                const count = engine.rebuildMemory(workspaceId);
                vscode.window.showInformationMessage(`Project memory rebuilt and revalidated (${count} items).`);
            } else if (action.label === 'Disable memory') {
                engine.revokeWorkspaceConsent(workspaceId);
                memoryConsentActive = false;
                FeatureFlagRegistry.setFlag('enableProjectMemory', false);
                await context.workspaceState.update(memoryConsentKey(), false);
                vscode.window.showInformationMessage('Project memory is disabled. Encrypted data remains until explicitly deleted.');
            } else if (action.label === 'Delete project memory') {
                const confirmed = await vscode.window.showWarningMessage('Permanently delete all memory for this project?', { modal: true }, 'Delete');
                if (confirmed === 'Delete') {
                    engine.eraseWorkspaceMemory(workspaceId);
                    engine.revokeWorkspaceConsent(workspaceId);
                    memoryConsentActive = false;
                    FeatureFlagRegistry.setFlag('enableProjectMemory', false);
                    await context.workspaceState.update(memoryConsentKey(), false);
                    vscode.window.showInformationMessage('Project memory was permanently deleted.');
                }
            }
        })
    );

    logger.info('Lifecycle', 'Tokonomics extension activation complete.');
    return Object.freeze({
        schemaVersion: 1,
        getCertificationDiagnostics: () => Object.freeze({
            workspaceTrusted: workspaceIsTrusted(),
            workspaceRootCount: workspaceRoots().length,
            languageModelProviderRegistered,
            chatParticipantRegistered,
            releaseChannel: releaseControl.channel,
            releaseControlReason: releaseControl.reason,
            forcePassThrough: releaseControl.forcePassThrough,
            preferences: UserPreferenceRegistry.get().preferences,
            migration: UserPreferenceRegistry.get().migration,
            capabilities: ComponentRegistry.runtimeStatuses(
                FeatureFlagRegistry.captureRequestCapabilities(),
                RequestLedger.getInstance().getLatestEvent()?.componentReceipts
            ),
            experiments: ExperimentRuntime.diagnostics().gates
        })
    });
}

export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
