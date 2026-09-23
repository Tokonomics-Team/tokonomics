# Lifecycle and synchronous-operation inventory

Static call inventory; a callsite alone does not establish ownership or production reachability. Reachable means present among esbuild input modules.

| File:line | Operation | Bundle module reachable |
|---|---|---|
| src/ast/pruner.ts:56 | `fs.existsSync` | yes |
| src/ast/pruner.ts:61 | `fs.existsSync` | yes |
| src/ast/pruner.ts:85 | `fs.existsSync` | yes |
| src/diff/diffProvider.ts:38 | `this.onDidChangeEmitter.fire` | yes |
| src/engine/imageRightsizer.ts:150 | `fs.existsSync` | yes |
| src/engine/imageRightsizer.ts:152 | `fs.statSync` | yes |
| src/engine/localModelManager.ts:37 | `fs.existsSync` | no |
| src/engine/localModelManager.ts:38 | `fs.statfsSync` | no |
| src/engine/localModelManager.ts:38 | `fs.statfsSync` | no |
| src/engine/localModelManager.ts:41 | `fs.mkdirSync` | no |
| src/engine/localModelManager.ts:45 | `fs.writeFileSync` | no |
| src/engine/localModelManager.ts:48 | `fs.renameSync` | no |
| src/engine/localModelManager.ts:49 | `fs.writeFileSync` | no |
| src/engine/localModelManager.ts:51 | `fs.existsSync` | no |
| src/engine/localModelManager.ts:51 | `fs.unlinkSync` | no |
| src/engine/localModelManager.ts:52 | `fs.existsSync` | no |
| src/engine/localModelManager.ts:52 | `fs.unlinkSync` | no |
| src/engine/localModelManager.ts:59 | `fs.readFileSync` | no |
| src/engine/localModelManager.ts:68 | `fs.existsSync` | no |
| src/engine/localModelManager.ts:68 | `fs.unlinkSync` | no |
| src/engine/localModelManager.ts:110 | `fs.existsSync` | no |
| src/engine/localModelManager.ts:111 | `fs.readdirSync` | no |
| src/engine/localModelManager.ts:112 | `fs.statSync` | no |
| src/engine/localSlmBrain.ts:701 | `setTimeout` | yes |
| src/engine/localSlmBrain.ts:712 | `(async () => {
                try {
                    // Yield to event loop to allow cancellation/timeout preemption
                    await new Promise(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 1));
                    if (signal?.aborted) {
                        return { success: false, error: 'Inference aborted during execution.' };
                    }
                    const val = await task();
                    return { success: true, value: val };
                } catch (err: any) {
                    return { success: false, error: err?.message \|\| 'Worker inference crash.' };
                }
            })` | yes |
| src/engine/localSlmBrain.ts:715 | `setTimeout` | yes |
| src/engine/ramManager.ts:136 | `fs.existsSync` | yes |
| src/engine/ramManager.ts:157 | `fs.statSync` | yes |
| src/engine/ramManager.ts:160 | `fs.readFileSync` | yes |
| src/engine/ramManager.ts:184 | `setTimeout` | yes |
| src/engine/ramManager.ts:510 | `fs.readdirSync` | yes |
| src/engine/relevanceScorer.ts:122 | `fs.readFileSync` | no |
| src/engine/relevanceScorer.ts:181 | `fs.statSync` | no |
| src/engine/scratchpadManager.ts:48 | `fs.existsSync` | no |
| src/engine/scratchpadManager.ts:60 | `fs.readFileSync` | no |
| src/engine/scratchpadManager.ts:82 | `fs.existsSync` | no |
| src/engine/scratchpadManager.ts:83 | `fs.mkdirSync` | no |
| src/engine/scratchpadManager.ts:86 | `fs.writeFileSync` | no |
| src/evaluation/networkAuditEngine.ts:77 | `fs.existsSync` | no |
| src/evaluation/networkAuditEngine.ts:80 | `fs.readFileSync` | no |
| src/evaluation/networkAuditEngine.ts:116 | `fs.existsSync` | no |
| src/evaluation/networkAuditEngine.ts:117 | `fs.readdirSync` | no |
| src/evaluation/networkAuditEngine.ts:130 | `fs.readFileSync` | no |
| src/events/requestLedger.ts:211 | `setTimeout` | yes |
| src/extension.ts:57 | `process.on` | yes |
| src/extension.ts:182 | `vscode.workspace.onDidChangeTextDocument` | yes |
| src/extension.ts:192 | `vscode.workspace.onDidSaveTextDocument` | yes |
| src/extension.ts:197 | `vscode.workspace.onDidCreateFiles` | yes |
| src/extension.ts:205 | `vscode.workspace.onDidDeleteFiles` | yes |
| src/extension.ts:214 | `vscode.workspace.onDidRenameFiles` | yes |
| src/extension.ts:223 | `vscode.workspace.onDidChangeWorkspaceFolders` | yes |
| src/extension.ts:230 | `vscode.workspace.onDidChangeConfiguration` | yes |
| src/extension.ts:252 | `setTimeout` | yes |
| src/extension.ts:273 | `vscode.workspace.onDidGrantWorkspaceTrust` | yes |
| src/finops/finOpsService.ts:88 | `setTimeout` | yes |
| src/finops/finOpsService.ts:253 | `setTimeout` | yes |
| src/finops/finOpsService.ts:330 | `setTimeout` | yes |
| src/finops/finOpsService.ts:359 | `setTimeout` | yes |
| src/ignore/tokenIgnore.ts:51 | `fs.existsSync` | yes |
| src/ignore/tokenIgnore.ts:52 | `fs.readFileSync` | yes |
| src/memory/projectMemory.ts:439 | `fs.existsSync` | yes |
| src/memory/projectMemory.ts:439 | `fs.statSync` | yes |
| src/memory/projectMemory.ts:479 | `fs.existsSync` | yes |
| src/memory/projectMemory.ts:482 | `fs.statSync` | yes |
| src/memory/projectMemory.ts:484 | `fs.writeFileSync` | yes |
| src/memory/projectMemory.ts:486 | `fs.unlinkSync` | yes |
| src/memory/projectMemory.ts:689 | `fs.existsSync` | yes |
| src/memory/projectMemory.ts:690 | `fs.mkdirSync` | yes |
| src/memory/projectMemory.ts:709 | `fs.writeFileSync` | yes |
| src/memory/projectMemory.ts:717 | `fs.existsSync` | yes |
| src/memory/projectMemory.ts:723 | `fs.readFileSync` | yes |
| src/performance/boundedScheduler.ts:156 | `setTimeout` | yes |
| src/performance/boundedScheduler.ts:178 | `setTimeout` | yes |
| src/performance/requestLifecycle.ts:49 | `setTimeout` | yes |
| src/performance/workerPool.ts:946 | `this.spawnWorker` | yes |
| src/performance/workerPool.ts:970 | `worker.on` | yes |
| src/performance/workerPool.ts:974 | `worker.on` | yes |
| src/performance/workerPool.ts:978 | `worker.on` | yes |
| src/performance/workerPool.ts:1037 | `this.spawnWorker` | yes |
| src/performance/workerPool.ts:1126 | `setTimeout` | yes |
| src/performance/workerPool.ts:1190 | `setTimeout` | yes |
| src/performance/workerPool.ts:1207 | `this.spawnWorker` | yes |
| src/performance/workerPool.ts:1215 | `setTimeout` | yes |
| src/protocol/providerGateway.ts:40 | `targetModel.sendRequest` | yes |
| src/proxy/chatParticipant.ts:95 | `vscode.window.onDidChangeActiveTextEditor` | yes |
| src/proxy/chatParticipant.ts:224 | `fs.existsSync` | yes |
| src/proxy/chatParticipant.ts:236 | `fs.statSync` | yes |
| src/proxy/chatParticipant.ts:261 | `fs.readdirSync` | yes |
| src/repo/repoMap.ts:43 | `fs.existsSync` | no |
| src/repo/repoMap.ts:55 | `fs.statSync` | no |
| src/repo/repoMap.ts:58 | `fs.readFileSync` | no |
| src/repo/repoMap.ts:222 | `fs.readdirSync` | no |
| src/security/sourcePolicy.ts:25 | `fs.existsSync` | yes |
| src/security/sourcePolicy.ts:26 | `fs.existsSync` | yes |
| src/security/sourcePolicy.ts:31 | `fs.statSync` | yes |
| src/security/sourcePolicy.ts:35 | `fs.readFileSync` | yes |
| src/security/sourcePolicy.ts:44 | `fs.openSync` | yes |
| src/security/sourcePolicy.ts:45 | `fs.fstatSync` | yes |
| src/security/sourcePolicy.ts:52 | `fs.readFileSync` | yes |
| src/security/sourcePolicy.ts:58 | `fs.closeSync` | yes |
| src/subscriptions/cliTransport.ts:162 | `spawn` | yes |
| src/subscriptions/cliTransport.ts:176 | `setTimeout` | yes |
| src/subscriptions/cliTransport.ts:182 | `child.stdout.on` | yes |
| src/subscriptions/cliTransport.ts:195 | `child.stderr.on` | yes |
| src/subscriptions/cliTransport.ts:203 | `child.stdin.on` | yes |
| src/subscriptions/cliTransport.ts:204 | `child.on` | yes |
| src/subscriptions/cliTransport.ts:209 | `child.on` | yes |
| src/subscriptions/cliTransport.ts:292 | `fs.rmSync` | yes |
| src/subscriptions/cliTransport.ts:302 | `fs.rmSync` | yes |
| src/subscriptions/subscriptionModels.ts:46 | `fs.statSync` | yes |
| src/subscriptions/subscriptionModels.ts:66 | `fs.readdirSync` | yes |
| src/ui/chatSessionController.ts:274 | `proxy.sendRequest` | yes |
| src/ui/chatViewProvider.ts:52 | `vscode.lm.onDidChangeChatModels` | yes |
| src/ui/chatViewProvider.ts:57 | `vscode.workspace.onDidChangeWorkspaceFolders` | yes |
| src/ui/chatViewProvider.ts:73 | `webviewView.onDidDispose` | yes |
| src/ui/chatViewProvider.ts:104 | `panel.onDidDispose` | yes |
| src/ui/chatViewProvider.ts:126 | `webview.onDidReceiveMessage` | yes |
| src/ui/chatViewProvider.ts:135 | `setTimeout` | yes |
| src/ui/dashboardController.ts:43 | `setTimeout` | yes |
| src/ui/dashboardController.ts:69 | `(webview as any).onDidReceiveMessage` | yes |
| src/ui/dashboardWebview.ts:77 | `this.panel.onDidDispose` | yes |
| src/ui/dashboardWebview.ts:80 | `vscode.window.onDidChangeActiveTextEditor` | yes |
| src/ui/dashboardWebview.ts:121 | `fs.existsSync` | yes |
| src/ui/dashboardWebview.ts:123 | `fs.readFileSync` | yes |
| src/ui/dashboardWebview.ts:255 | `fs.existsSync` | yes |
| src/ui/dashboardWebview.ts:258 | `fs.readFileSync` | yes |
| src/ui/dashboardWebview.ts:326 | `fs.existsSync` | yes |
| src/ui/dashboardWebview.ts:370 | `setTimeout` | yes |
| src/ui/statusBar.ts:32 | `setTimeout` | yes |
| src/ui/statusBar.ts:60 | `setTimeout` | yes |
| src/workspace/exactSourceReader.ts:48 | `fs.realpathSync` | yes |
| src/workspace/exactSourceReader.ts:51 | `fs.statSync` | yes |
| src/workspace/exactSourceReader.ts:54 | `fs.readFileSync` | yes |
| src/workspace/lspAdapter.ts:215 | `setTimeout` | yes |
| src/workspace/lspContextLayer.ts:55 | `setTimeout` | no |
| src/workspace/lspContextLayer.ts:100 | `setTimeout` | no |
| src/workspace/lspContextLayer.ts:141 | `setTimeout` | no |
| src/workspace/provenance.ts:233 | `fs.existsSync` | yes |
| src/workspace/provenance.ts:240 | `fs.readdirSync` | yes |
| src/workspace/provenance.ts:255 | `fs.readFileSync` | yes |
| src/workspace/snapshotSafeLsp.ts:591 | `setTimeout` | yes |
| src/workspace/workspaceIdentity.ts:56 | `fs.existsSync` | yes |
| src/workspace/workspaceIndex.ts:303 | `setTimeout` | yes |
| src/workspace/workspaceIndex.ts:642 | `fs.readFileSync` | yes |
| src/workspace/workspaceIndex.ts:663 | `setTimeout` | yes |
| src/workspace/workspaceIndex.ts:673 | `setTimeout` | yes |
| src/workspace/workspaceIndex.ts:692 | `setTimeout` | yes |
