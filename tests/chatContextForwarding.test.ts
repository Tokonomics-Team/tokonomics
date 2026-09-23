import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mock from './mock-vscode';
import { asksForWorkspaceSource, resolveChatReferences } from '../src/proxy/chatContextReferences';
import { registerChatParticipant } from '../src/proxy/chatParticipant';
import { AstPrunerEngine } from '../src/ast/pruner';
import { MetricsTracker } from '../src/metrics/tracker';
import { UserPreferenceRegistry } from '../src/config/userPreferences';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { canonicalTextMessage } from '../src/protocol/canonicalProtocol';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';

export async function runChatContextForwardingTests(): Promise<void> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-forwarding-'));
    const file = path.join(root, 'fixture.ts');
    const source = 'export function forwardedValue() { return 317; }';
    fs.writeFileSync(file, source); fs.writeFileSync(path.join(root, '.env'), 'TEST_SECRET=example');
    const originalOpen = mock.workspace.openTextDocument, originalFolders = mock.workspace.workspaceFolders;
    const originalEditor = mock.window.activeTextEditor, originalTrust = (mock.workspace as any).isTrusted;
    const originalRuntime = UserPreferenceRegistry.get();
    const context: any = { subscriptions: [], asAbsolutePath: (p: string) => path.resolve(p) };
    let dirty = false;
    (mock.workspace as any).isTrusted = true;
    mock.workspace.workspaceFolders = [{ uri: mock.Uri.file(root) }]; mock.window.activeTextEditor = undefined;
    mock.workspace.openTextDocument = async (uri: any) => ({ fileName: uri.fsPath, uri, isDirty: dirty, version: 1, languageId: 'typescript',
        getText: (range?: any) => range ? source.slice(range.start.character, range.end.character) : fs.readFileSync(uri.fsPath, 'utf8') }) as any;
    const token = new mock.CancellationTokenSource().token;
    const ref: any = { id: 'file', value: mock.Uri.file(file) };
    const options = { roots: [root], trusted: true, enabled: true, includeUnsaved: false, token };
    try {
        const full = await resolveChatReferences([ref, ref], options);
        assert.strictEqual(full.count, 1); assert.ok(full.text.includes('return 317'));
        const selected = await resolveChatReferences([{ id: 'selection', value: { uri: ref.value,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } } }] as any, options);
        assert.ok(selected.text.includes('"text":"export"'), 'Short explicit selections are retained');
        assert.strictEqual((await resolveChatReferences([ref], { ...options, trusted: false })).count, 0);
        assert.strictEqual((await resolveChatReferences([ref], { ...options, enabled: false })).count, 0);
        dirty = true; assert.strictEqual((await resolveChatReferences([ref], options)).count, 0); dirty = false;
        for (const blocked of [path.join(root, '.env'), path.join(root, '..', 'outside.ts'), root]) {
            const result = await resolveChatReferences([{ id: 'file', value: mock.Uri.file(blocked) }] as any, options);
            assert.strictEqual(result.count, 0); assert.ok(result.notices.length);
        }
        assert.strictEqual((await resolveChatReferences([{id: 'text', value: 'x'.repeat(200001)}] as any, options)).count, 0);

        UserPreferenceRegistry.reset();
        registerChatParticipant(context, new MetricsTracker(), new AstPrunerEngine());
        mock.setSelectChatModelsError(new Error('Selected request model must not depend on global discovery'));
        let sent: any[] = [], calls = 0;
        const model: any = { id: 'selected-request-model', vendor: 'example', name: 'Selected', maxInputTokens: 20000,
            sendRequest: async (messages: any[]) => { sent = messages; calls++; return { text: (async function* () { yield 'The forwarded function returns 317.'; })() }; } };
        const output: string[] = [], buttons: any[] = [];
        const stream = { markdown: (v: string) => output.push(v), button: (v: any) => buttons.push(v) };
        await mock.activeChatParticipantHandler!({ prompt: 'Analyze this extension source', references: [ref], model }, { history: [] }, stream, token);
        assert.strictEqual(calls, 1, output.join('\n'));
        assert.ok(JSON.stringify(sent).includes('return 317'), 'Attached source must survive compilation and reach the selected model');
        assert.ok(output.join('\n').includes('Context prepared: 1 file attachment(s), 0 text reference(s)'));

        const prior = new mock.ChatRequestTurn('Analyze the attached file') as any;
        prior.references = [ref];
        await mock.activeChatParticipantHandler!({ prompt: 'Explain this file again', references: [], model }, { history: [prior] }, stream, token);
        assert.strictEqual(calls, 2); assert.ok(JSON.stringify(sent).includes('return 317'), 'Follow-up retains explicitly attached source');
        await mock.activeChatParticipantHandler!({ prompt: 'Analyze this extension source', references: [], model }, { history: [] }, stream, token);
        assert.strictEqual(calls, 2, 'Source-dependent questions without source must not be sent blindly');
        assert.strictEqual(buttons[0].command, 'workbench.action.openSettings');
        const actualPrompt = 'can you analyze the current project and tell me the actual cost savings for an individual developer';
        assert.ok(asksForWorkspaceSource(actualPrompt));
        const skills: any = { id: 'skills', value: '# Available VS Code skills\n```text\nUse the editor skill\n```' };
        const resolvedSkills = await resolveChatReferences([skills], options);
        assert.strictEqual(resolvedSkills.textCount, 1); assert.strictEqual(resolvedSkills.files.length, 0);
        const outputStart = output.length;
        await mock.activeChatParticipantHandler!({ prompt: actualPrompt, references: [skills], model }, { history: [] }, stream, token);
        assert.strictEqual(calls, 2, 'A skills list must not satisfy project-source requirements, even when it contains code fences');
        assert.ok(output.slice(outputStart).join('\n').includes('No project files were prepared'));

        const engine = new AstPrunerEngine();
        const index = new VersionedWorkspaceIndex([root], engine, { trusted: true });
        const oldIndexFlag = FeatureFlagRegistry.getFlags().enableWorkspaceIndex;
        const oldLspFlag = FeatureFlagRegistry.getFlags().enableLspIntelligence;
        try {
            FeatureFlagRegistry.setFlag('enableWorkspaceIndex', true);
            const snapshot = await index.ensureInitialized();
            const pipeline = new PipelineOrchestrator(engine);
            const retriever = (pipeline as any).evidenceRetriever;
            const originalRetrieve = retriever.retrieve.bind(retriever);
            let retrievalCalls = 0;
            retriever.retrieve = (...args: any[]) => { retrievalCalls++; return originalRetrieve(...args); };
            const compiler = new CanonicalRequestCompiler(pipeline);
            const compiled = await compiler.compile({ messages: [canonicalTextMessage('user', 'Explain forwardedValue in the current project. Attached text: available skills')],
                preserveText: true, allowWorkspaceRetrieval: true, workspaceSnapshot: snapshot, activeFilePath: file,
                targetModel: 'example', cancellation: token });
            assert.strictEqual(retrievalCalls, 1, 'Preserving an attachment must not disable authorized automatic retrieval');
            assert.ok(JSON.stringify(compiled.messages).includes('317'), 'Preserved attachment requests must still carry retrieved source');
            compiler.abandon(compiled);
            FeatureFlagRegistry.setFlag('enableLspIntelligence', true);
            for (const outcome of ['timed_out', 'fallback', 'failed'] as const) {
                (pipeline as any).lspService.queryIntelligence = async () => {
                    if (outcome === 'failed') throw new Error('Simulated language service failure');
                    return { signals: [], timedOut: outcome === 'timed_out', fallbackUsed: outcome === 'fallback' };
                };
                const degraded = await compiler.compile({
                    messages: [canonicalTextMessage('user', 'Explain forwardedValue in the current project.\nAttached skills: '
                        + JSON.stringify({ text: '# Skills\n```text\nEditor instructions\n```' }))],
                    preserveText: true, callerSuppliedSource: false, allowWorkspaceRetrieval: true,
                    workspaceSnapshot: snapshot, activeFilePath: file, targetModel: 'example', cancellation: token
                });
                assert.ok(JSON.stringify(degraded.messages).includes('317'), `${outcome}: source survives a skills attachment and degraded LSP`);
                const terminal = degraded.receipts!.filter(r => r.componentId === 'lsp_intelligence'
                    && ['contributed', 'fallback', 'timed_out', 'failed', 'bypassed'].includes(r.outcome));
                assert.deepStrictEqual(terminal.map(r => r.outcome), [outcome], 'The first terminal outcome must survive');
                compiler.abandon(degraded);
            }
        } finally {
            FeatureFlagRegistry.setFlag('enableWorkspaceIndex', oldIndexFlag);
            FeatureFlagRegistry.setFlag('enableLspIntelligence', oldLspFlag);
            index.dispose();
        }
        console.log('Chat context forwarding: real file, short selection, policy blocks, selected-model routing, follow-up and empty-context regression passed.');
    } finally {
        context.subscriptions.forEach((d: any) => d.dispose());
        mock.setSelectChatModelsError(undefined); UserPreferenceRegistry.apply(originalRuntime);
        mock.workspace.openTextDocument = originalOpen; mock.workspace.workspaceFolders = originalFolders;
        mock.window.activeTextEditor = originalEditor; (mock.workspace as any).isTrusted = originalTrust;
        fs.unlinkSync(file); fs.unlinkSync(path.join(root, '.env')); fs.rmdirSync(root);
    }
}
