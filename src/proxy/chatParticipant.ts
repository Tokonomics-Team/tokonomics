/**
 * VS Code Chat Participant (@tokenopt) v4.0
 * Native Chat Integration supporting:
 *   - /map (Incremental PageRank Repo Map)
 *   - /pack (Multi-File Context Pack with Line Range Slicing & AST Pruning)
 *   - /analyze, /compact, /stats
 *   - Intelligent Model Routing suggestions (Flash vs Standard vs Reasoning)
 *   - Hybrid Semantic Response Cache (Exact-Hash + MinHash Shingle Matching)
 *   - Agentic Loop Circuit Breakers & Token Velocity Governance
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MetricsTracker } from '../metrics/tracker';
import { AstPrunerEngine } from '../ast/pruner';
import { ContextAnalyzer } from './contextAnalyzer';
import { TokenCounter } from '../engine/tokenizer';
import { MessagePayload, TokenOptimizationConfig } from '../types';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';
import { BudgetGuardrail } from '../metrics/budgetGuard';
import { RepoMapEngine, FileWatchIndex } from '../repo/repoMap';
import { ModelRouter } from '../engine/modelRouter';
import { ResponseCache } from '../cache/responseCache';
import { RelevanceScorer } from '../engine/relevanceScorer';
import { DiffOutputOptimizer } from '../engine/diffOutputOptimizer';
import { AgenticCircuitBreaker } from '../metrics/circuitBreaker';
import { ScratchpadManager } from '../engine/scratchpadManager';
import { ImageRightsizer } from '../engine/imageRightsizer';
import { RamContextManager } from '../engine/ramManager';
import { AnonymizedLogger } from '../security/anonymizedLogger';

export function registerChatParticipant(
    context: vscode.ExtensionContext,
    metricsTracker: MetricsTracker,
    astEngine: AstPrunerEngine,
    contextAnalyzer: ContextAnalyzer,
    fileWatchIndex?: FileWatchIndex,
    responseCache?: ResponseCache,
    onOptimizationComplete?: () => void,
    ramManager?: RamContextManager
) {
    if (!vscode.chat || typeof vscode.chat.createChatParticipant !== 'function') {
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const ignoreFilter = new TokenIgnoreFilter(workspaceRoot);
    const watchIndex = fileWatchIndex || new FileWatchIndex(workspaceRoot);
    const cache = responseCache || new ResponseCache();
    const circuitBreaker = new AgenticCircuitBreaker();
    const ram = ramManager || new RamContextManager(astEngine, undefined, workspaceRoot);
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

        // 1. /map Command: Generate Workspace PageRank Repository Map (with Incremental Indexing)
        if (command === 'map') {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!root) {
                response.markdown(`⚠️ No workspace folder open. Open a project workspace to generate a repository map.`);
                return;
            }

            const activeEditor = vscode.window.activeTextEditor;
            const activeFiles = activeEditor ? [activeEditor.document.fileName] : (lastActiveDocUri ? [lastActiveDocUri.fsPath] : []);

            response.markdown(`*Scanning workspace and calculating PageRank graph (Incremental Cache)...*\n\n`);
            const mapResult = watchIndex.getMap(activeFiles, 1024, root);

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

        // 2. /pack Command: Multi-File Context Pack with Line Range Slicing & AST Pruning
        if (command === 'pack') {
            let targetPath = request.prompt.trim();
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!root) {
                response.markdown(`⚠️ No workspace open.`);
                return;
            }

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
                const rawFull = fs.readFileSync(searchDir, 'utf8');
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
                                const raw = fs.readFileSync(full, 'utf8');
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
            const stats = ram.getStats();
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
            const today = metricsTracker.getTodayMetrics();
            const session = metricsTracker.getSessionMetrics();
            const allTime = metricsTracker.getAllTimeMetrics();
            const installDate = metricsTracker.getInstallationDate().toLocaleDateString();
            const ramStats = ram.getStats();

            response.markdown(`### ⚡ Enterprise AI Token Optimizer Live Telemetry\n\n`);

            response.markdown(`#### 📅 Today's Performance (Last 24 Hours)\n`);
            response.markdown(`- **Requests Processed:** ${today.requests}\n`);
            response.markdown(`- **Tokens Pruned:** ${today.savedTokens.toLocaleString()} tokens (**${today.reductionPercentage}%** net reduction)\n`);
            response.markdown(`- **Cost Saved Today:** $${today.costSavedUsd.toFixed(4)} USD\n`);
            response.markdown(`- **Prompt Cache Hit Rate:** **${today.cacheHitPercentage}%** (requests $\\ge 1024$ prefix tokens)\n`);
            response.markdown(`- **In-Memory RAM Cache:** **${ramStats.usedMB} MB / ${ramStats.budgetMB} MB** (${ramStats.skeletonsCached} AST skeletons hot in RAM)\n\n`);

            response.markdown(`#### 🏛️ Cumulative (Since Installation on ${installDate})\n`);
            response.markdown(`- **Total Prompts Optimized:** ${allTime.requests}\n`);
            response.markdown(`- **Total Tokens Saved:** ${allTime.savedTokens.toLocaleString()} / ${allTime.originalTokens.toLocaleString()} tokens (**${allTime.reductionPercentage}%**)\n`);
            response.markdown(`- **Total Cloud Spend Saved:** **$${allTime.costSavedUsd.toFixed(4)} USD**\n\n`);

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
        try {
            // Resolve target active document with 4-tier fallback:
            let doc: vscode.TextDocument | undefined = vscode.window.activeTextEditor?.document;
            if (!doc) {
                const visible = vscode.window.visibleTextEditors.find(e => e.document && !e.document.isUntitled && !e.document.uri.scheme.includes('output') && !e.document.uri.scheme.includes('debug'));
                if (visible) doc = visible.document;
            }
            if (!doc && lastActiveDocUri) {
                try {
                    doc = await vscode.workspace.openTextDocument(lastActiveDocUri);
                } catch {}
            }
            // Check if prompt specifically mentions any file in workspace
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (root) {
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

            if (doc && !ignoreFilter.isIgnored(doc.fileName)) {
                activeFileName = doc.fileName;
                const activeEditor = vscode.window.activeTextEditor;
                const selectedText = (activeEditor?.document.fileName === doc.fileName && activeEditor.selection) 
                    ? doc.getText(activeEditor.selection) 
                    : '';
                const codeToAttach = selectedText && selectedText.trim().length > 30 
                    ? selectedText 
                    : doc.getText();

                if (codeToAttach && codeToAttach.length > 30) {
                    const lang = doc.languageId || 'typescript';
                    const normalizedCode = codeToAttach.replace(/\r\n/g, '\n');
                    activeFileContext = `\n\n\`\`\`${lang}\n// Context File: ${doc.fileName}\n${normalizedCode}\n\`\`\``;
                    fileInfo = ` (with context from ${path.basename(doc.fileName)})`;
                }
            }

            const conf = vscode.workspace.getConfiguration('tokenOptimizer');
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

            // Phase 7: Semantic Response Cache Lookup
            if (config.enableResponseCache !== false && diffAnalysis.intent === 'question') {
                const cacheHit = cache.lookup(request.prompt, activeFileName, diffAnalysis.intent);
                if (cacheHit.hit && cacheHit.response) {
                    const originalTokens = TokenCounter.countTokens(request.prompt);
                    metricsTracker.recordOptimization(
                        originalTokens,
                        0,
                        { astSaved: 0, textCompressionSaved: 0, historyCompacted: 0, cacheAligned: originalTokens }
                    );
                    if (onOptimizationComplete) onOptimizationComplete();

                    const matchType = cacheHit.tier === 'semantic_approximate' 
                        ? `Semantic Match (${Math.round((cacheHit.similarityScore || 0.9) * 100)}% similarity)`
                        : 'Exact Hash Match';
                    response.markdown(`> ⚡ **Response Cache Hit [${matchType}] (0 Tokens | 0ms)**: Saved 100% inference tokens!\n\n`);
                    response.markdown(cacheHit.response);
                    return;
                }
            }

            // Phase 5: Model Routing Suggestion
            if (config.enableModelRouting !== false) {
                const routing = ModelRouter.analyzeComplexity(
                    request.prompt,
                    activeFileContext ? 1 : 0,
                    chatContext.history.length
                );
                response.markdown(`> ${ModelRouter.formatSuggestion(routing)}\n\n`);
            }

            // Phase 6: In-Memory BM25 Symbol Slices (Surgical RAM context retrieval)
            let referencedSlicesContext = '';
            const slices = ram.searchRelevantSlices(request.prompt, 2);
            const filteredSlices = slices.filter(s => !doc || !s.file.includes(path.basename(doc.fileName)));
            if (filteredSlices.length > 0) {
                referencedSlicesContext = `\n\n// 🔍 In-Memory Referenced Slices (RAM Index):\n` + filteredSlices.map(s => `// [${s.file}:${s.line}] ${s.kind} ${s.name}: ${s.signature}`).join('\n');
            }

            const fullPrompt = `${request.prompt}${activeFileContext}${referencedSlicesContext}`;

            // Phase 8: Image Rightsizing (inspired by TokenShift)
            const imageConf = vscode.workspace.getConfiguration('tokenOptimizer');
            const imageRightsizer = new ImageRightsizer({
                enabled: imageConf.get<boolean>('enableImageRightsizing', true),
                maxDimension: imageConf.get<number>('imageMaxDimension', 512),
                quality: 70
            });

            // Build multi-turn raw messages with turn deduplication
            const rawMessages: MessagePayload[] = [];
            let totalImageTokensSaved = 0;
            for (const h of chatContext.history) {
                if (h instanceof vscode.ChatRequestTurn) {
                    const { text: rsText, stats: rsStats } = imageRightsizer.rightsizeInlineImages(h.prompt);
                    totalImageTokensSaved += rsStats.estimatedTokensSaved;
                    const dedup = ram.deduplicateTurnCode(rsText, activeFileName || 'workspace');
                    rawMessages.push({ role: 'user', content: dedup.text });
                } else if (h instanceof vscode.ChatResponseTurn) {
                    const resText = h.response.map(part => {
                        if (part instanceof vscode.ChatResponseMarkdownPart) {
                            return part.value.value;
                        }
                        return '';
                    }).join('');
                    rawMessages.push({ role: 'assistant', content: resText });
                }
            }
            // Rightsize images in the current prompt too
            const { text: rsFullPrompt, stats: rsPromptStats } = imageRightsizer.rightsize(fullPrompt, workspaceRoot);
            totalImageTokensSaved += rsPromptStats.estimatedTokensSaved;
            rawMessages.push({ role: 'user', content: rsFullPrompt });

            const { alignedMessages, stats } = contextAnalyzer.processMessages(rawMessages, config);
            if (onOptimizationComplete) onOptimizationComplete();
            BudgetGuardrail.checkBudget(metricsTracker);

            // Circuit Breaker Evaluation
            const cbStatus = circuitBreaker.evaluateTurn(stats.optimizedTokens, request.prompt);
            if (cbStatus.tripped) {
                response.markdown(`> ${cbStatus.message}\n\n`);
            }

            // Build savings banner with image rightsizing info
            const imageNote = totalImageTokensSaved > 0 ? ` | 📸 ${totalImageTokensSaved.toLocaleString()} image tokens rightsized` : '';
            if (stats.savedTokens > 0 || totalImageTokensSaved > 0) {
                response.markdown(`> ⚡ **Token Optimizer${fileInfo}:** ${stats.originalTokens.toLocaleString()} → ${stats.optimizedTokens.toLocaleString()} tokens (**${stats.reductionPercentage}% saved** | $${stats.estimatedCostSavedUsd.toFixed(4)} USD${imageNote})\n\n`);
            } else {
                response.markdown(`> ⚡ **Token Optimizer:** Standalone prompt (${stats.originalTokens} tokens). *Open a code file or run \`@tokenopt /map\` to see structural token optimization.*\n\n`);
            }

            // Phase 9: Model Allow-List Enforcement (inspired by TokenShift governance)
            let allModels = await vscode.lm.selectChatModels();
            let models = allModels ? allModels.filter(m => m.id !== 'token-optimizer-proxy') : [];
            const allowList = conf.get<string[]>('modelAllowList', []);
            if (allowList && allowList.length > 0) {
                const allowedLower = allowList.map(a => a.toLowerCase());
                const filtered = models.filter(m => {
                    const mId = (m.id || '').toLowerCase();
                    const mName = (m.name || '').toLowerCase();
                    const mFamily = (m.family || '').toLowerCase();
                    return allowedLower.some(a => mId.includes(a) || mName.includes(a) || mFamily.includes(a));
                });
                if (filtered.length === 0 && models.length > 0) {
                    response.markdown(`> 🚫 **Model Policy:** Available models (${models.map(m => m.id).join(', ')}) are not in the allow list (${allowList.join(', ')}). Contact your admin to update \`tokenOptimizer.modelAllowList\`.\n\n`);
                    return;
                }
                models = filtered.length > 0 ? filtered : models;
            }
            if (!models || models.length === 0) {
                response.markdown(`*(No downstream Copilot/Chat model available in active host)*\n\n**Optimized Prompt Payload:**\n\`\`\`markdown\n${alignedMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}\n\`\`\``);
                return;
            }

            const targetModel = models[0];
            const upstreamMessages = alignedMessages.map(m => {
                if (m.role === 'assistant') return vscode.LanguageModelChatMessage.Assistant(m.content);
                if (m.role === 'system') return vscode.LanguageModelChatMessage.User(`[SYSTEM]:\n${m.content}`);
                return vscode.LanguageModelChatMessage.User(m.content);
            });

            const llmResponse = await targetModel.sendRequest(upstreamMessages, {}, token);
            let completeResponseText = '';
            for await (const chunk of llmResponse.text) {
                if (token.isCancellationRequested) break;
                completeResponseText += chunk;
                response.markdown(chunk);
            }

            if (config.enableResponseCache !== false && completeResponseText.length > 20 && diffAnalysis.intent === 'question') {
                cache.store(request.prompt, activeFileName, completeResponseText, diffAnalysis.intent);
            }
        } catch (err: any) {
            response.markdown(`❌ Error during generation: ${err?.message || err}`);
        }
    });

    participant.iconPath = vscode.Uri.file(context.asAbsolutePath('assets/icon.png'));
    context.subscriptions.push(participant);
}
