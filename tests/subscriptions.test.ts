import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupSubscriptionTempDir, cliArguments, describeCliFailure, hasSubscriptionLogin, parseCliActivity, parseCliResult, runProcess,
    sanitizeProviderDetail, SubscriptionActivity } from '../src/subscriptions/cliTransport';
import { CostCalculator } from '../src/cost/costCalculator';
import { UsageStore } from '../src/finops/usageStore';
import { cliSearchPaths, registerSubscriptionCommands, resolveCli, subscriptionTranscript } from '../src/subscriptions/subscriptionModels';
import { VsCodeProtocolAdapter, canonicalTextMessage } from '../src/protocol/canonicalProtocol';
import { registerChatParticipant } from '../src/proxy/chatParticipant';
import { AstPrunerEngine } from '../src/ast/pruner';
import { MetricsTracker } from '../src/metrics/tracker';
import { UserPreferenceRegistry } from '../src/config/userPreferences';
import * as mock from './mock-vscode';
import * as vscode from 'vscode';
import { codexModelIds, resolveSubscriptionChoice } from '../src/subscriptions/modelChoices';
import { panelModel } from '../src/ui/panelModel';
import { ChatSessionController } from '../src/ui/chatSessionController';
import { TokenOptimizerLanguageModelProvider } from '../src/proxy/modelProvider';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalProviderGateway } from '../src/protocol/providerGateway';
import { OptimizationEventBus } from '../src/events/optimizationEvent';

export async function runSubscriptionTests(): Promise<void> {
    // Verify hardened temp directory cleanup with residual provider artifacts
    const testTempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tokonomics-test-sub-'));
    await fs.promises.mkdir(path.join(testTempDir, '.claude', 'cache'), { recursive: true });
    await fs.promises.writeFile(path.join(testTempDir, '.claude', 'cache', 'session.json'), '{"data":1}');
    await fs.promises.writeFile(path.join(testTempDir, 'mock-debug.log'), 'log output');
    assert.strictEqual(fs.existsSync(testTempDir), true);
    await cleanupSubscriptionTempDir(testTempDir);
    assert.strictEqual(fs.existsSync(testTempDir), false, 'Temp directory with residual files must be cleanly deleted');

    const commandStart = parseCliActivity('codex', { type: 'item.started', item: { type: 'command_execution', id: 'cmd1', command: 'npm test' } });
    assert.deepStrictEqual(commandStart, [{ kind: 'command', id: 'cmd1', text: 'npm test', status: 'running' }]);
    assert.strictEqual(parseCliActivity('codex', { type: 'item.completed', item: { type: 'command_execution', id: 'cmd1', command: 'npm test', exit_code: 1 } })[0].status, 'failed');
    assert.strictEqual(parseCliActivity('codex', { type: 'item.completed', item: { type: 'file_change', id: 'file1', changes: [{ kind: 'update', path: 'src/app.ts' }] } })[0].text, 'update: src/app.ts');
    assert.ok(parseCliActivity('codex', { type: 'item.updated', item: { type: 'todo_list', id: 'plan1', items: [{ text: 'Run tests', completed: false }] } })[0].text!.includes('Next: Run tests'));
    assert.strictEqual(parseCliActivity('claude', { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/app.ts', new_string: 'not forwarded' } }] } })[0].text, 'Edit: src/app.ts');
    assert.deepStrictEqual(parseCliActivity('claude', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'not forwarded' }] } }), [{ kind: 'tool', id: 't1', status: 'failed' }]);
    assert.deepStrictEqual(codexModelIds({ models: [{ slug: 'gpt-example', visibility: 'list' },
        { slug: 'hidden', visibility: 'hide' }, { slug: '--bad', visibility: 'list' },
        { slug: 'gpt-example', visibility: 'list' }] }), ['gpt-example']);
    await assert.rejects(resolveSubscriptionChoice('subscription:claude:--unsafe'), /no longer listed/);
    for (const provider of ['codex', 'claude'] as const) {
        const explicit = cliArguments(provider, 'example-model');
        assert.strictEqual(explicit[explicit.indexOf('--model') + 1], 'example-model');
        assert.ok(!cliArguments(provider).includes('--model'), 'Default leaves model selection to the CLI');
        assert.throws(() => cliArguments(provider, '--override'), /Invalid/);
    }
    assert.strictEqual(hasSubscriptionLogin('codex', 'Logged in using ChatGPT'), true);
    assert.strictEqual(hasSubscriptionLogin('codex', 'Logged in using an API key'), false);
    for (const authMethod of ['claude.ai', 'oauth', 'api_key', 'console']) {
        assert.strictEqual(hasSubscriptionLogin('claude', JSON.stringify({ loggedIn: true, authMethod })),
            ['claude.ai', 'oauth'].includes(authMethod));
    }
    assert.strictEqual(hasSubscriptionLogin('claude', '{"loggedIn":true}'), false);
    assert.strictEqual(hasSubscriptionLogin('claude', 'invalid'), false);
    assert.deepStrictEqual(parseCliActivity('codex', { type: 'thread.started' }), [],
        'A thread identifier does not establish which model answered');
    const conversation = [{ role: vscode.LanguageModelChatMessageRole.User, content: [new vscode.LanguageModelTextPart('question')] },
        { role: vscode.LanguageModelChatMessageRole.Assistant, content: [new vscode.LanguageModelTextPart('history')] }] as any;
    const serialized = subscriptionTranscript(conversation);
    assert.ok(serialized.includes('"role":"user","content":"question"'));
    assert.ok(serialized.includes('"role":"assistant","content":"history"'));
    assert.throws(() => subscriptionTranscript([{role: 999, content: []}] as any), /role/);
    assert.throws(() => subscriptionTranscript([{role: vscode.LanguageModelChatMessageRole.User, content: [{}]}] as any), /text context/);
    const codex = parseCliResult('codex', [
        { type: 'item.completed', item: { type: 'reasoning', text: 'private reasoning' } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'answer' } },
        { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 8 } }
    ].map(e => JSON.stringify(e)).join('\n'));
    assert.strictEqual(codex.text, 'answer\n');
    const usage = CostCalculator.parseVerifiedProviderUsage(codex.usage, 'test', 'openai', 'codex-subscription')!;
    assert.strictEqual(usage.inputTokens, 100); assert.strictEqual(usage.cacheReadInputTokens, 60);
    const claude = parseCliResult('claude', JSON.stringify({ type: 'system', subtype: 'init', model: 'example' }) + '\n' +
        JSON.stringify({ type: 'result', subtype: 'success', result: 'done', usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 20 } }));
    assert.strictEqual(claude.model, 'example');
    assert.strictEqual(CostCalculator.parseVerifiedProviderUsage(claude.usage, 'c', 'anthropic', 'example')!.inputTokens, 30);
    for (const output of ['invalid', '{}', '{"type":"turn.failed"}', '{"type":"result","is_error":true,"result":"private error"}']) {
        assert.throws(() => parseCliResult('codex', output));
        assert.throws(() => parseCliResult('claude', output));
    }
    const args = cliArguments('codex');
    assert.ok(args.includes('read-only') && args.includes('--ignore-user-config') && args.includes('shell_tool'));
    assert.ok(!args.some(a => a.includes('bypass')));
    const ca = cliArguments('claude'); assert.strictEqual(ca[ca.indexOf('--tools') + 1], '');
    assert.ok(ca.includes('--safe-mode') && ca.includes('--strict-mcp-config'));
    // Without this the CLI reports the answer as one block when the process exits, and the turn
    // shows nothing at all until then.
    assert.ok(ca.includes('--include-partial-messages'), 'Claude must be asked for incremental output');
    const store = new UsageStore();
    store.recordOptimization({ id: 'subscription-test', timestamp: Date.now(), state: 'PROMPT_COMPLETED',
        subscriptionTransport: 'codex', observedInputTokens: 100, outputTokens: 8, cachedTokens: 60,
        provider: 'openai', model: 'codex-subscription', optimizedInputTokens: 10, savedTokens: 2,
        costState: 'billed_unavailable', costStatus: 'unavailable', stageMetrics: [] } as any);
    assert.strictEqual(store.totals().observedRequests, 1);
    assert.strictEqual(store.totals().inputTokens, 100);
    assert.strictEqual(store.totals().pricedRequests, 0);
    assert.strictEqual(store.state.records[0].avoidedCostUSD, null);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-cli-test-'));
    const fixture = path.join(dir, 'fixture.cjs');
    fs.writeFileSync(fixture, `const mode=process.argv[2];
if(mode==='failjson'){process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:"You've hit your usage limit."}})+'\\n');process.exit(1);}
if(mode==='failplain'){process.stderr.write("error: unknown option '--nope'");process.exit(2);}
if(mode==='ignorestdin'){process.stdout.write('done');process.exit(0);}
process.stdin.setEncoding('utf8');let text='';process.stdin.on('data',v=>text+=v);process.stdin.on('end',()=>{if(mode==='wait')setTimeout(()=>{},10000);else if(mode==='large')process.stdout.write('x'.repeat(9*1024*1024));else {process.stderr.write('private stderr');process.stdout.write(text)}});`);
    let listener = () => {};
    const token = { isCancellationRequested: false, onCancellationRequested: (fn: () => void) => { listener = fn; return { dispose() {} }; } };
    try {
        const hostile = 'Unicode ✓ & $(not-a-command) `literal` "quotes"\nsecond line';
        assert.strictEqual(await runProcess(process.execPath, [fixture], hostile, dir, token), hostile);
        const lines: string[] = [];
        await runProcess(process.execPath, [fixture], 'first\nlast without newline', dir, token, 10000, false,
            line => lines.push(line));
        assert.deepStrictEqual(lines, ['first', 'last without newline'], 'The final stream event must not be dropped');
        await assert.rejects(runProcess(process.execPath, [fixture, 'wait'], '', dir, token, 40), /timed out/);
        const pending = runProcess(process.execPath, [fixture, 'wait'], '', dir, token); listener();
        await assert.rejects(pending, /cancelled/);
        await assert.rejects(runProcess(process.execPath, [fixture, 'large'], '', dir, token), /8 MiB/);
        await assert.rejects(runProcess(path.join(dir, 'missing.exe'), [], '', dir, token), /Cannot start/);
        // A CLI that exits non-zero must hand the user the reason it printed, not an exit code. This
        // is the case that was actually unreachable: codex exits 1 with a usage-limit message on
        // stdout, and every such failure surfaced as the same unactionable sentence.
        await assert.rejects(runProcess(process.execPath, [fixture, 'failjson'], '', dir, token), /hit your usage limit/);
        await assert.rejects(runProcess(process.execPath, [fixture, 'failplain'], '', dir, token), /unknown option/);
        // A CLI that exits before reading stdin breaks the pipe. That is the exit arriving on the
        // write side, not a failure of its own, and it must not mask the real exit status.
        assert.strictEqual(await runProcess(process.execPath, [fixture, 'ignorestdin'], 'x'.repeat(400000), dir, token), 'done');
    } finally { fs.unlinkSync(fixture); fs.rmdirSync(dir); }

    assert.strictEqual(sanitizeProviderDetail('  line one \n\n line two  '), 'line one line two');
    assert.strictEqual(sanitizeProviderDetail('   '), undefined);
    assert.strictEqual(sanitizeProviderDetail('x'.repeat(900))!.length, 400);
    assert.strictEqual(describeCliFailure(JSON.stringify({ type: 'turn.failed', error: { message: 'limit reached' } })), 'limit reached');
    assert.strictEqual(describeCliFailure(JSON.stringify({ type: 'result', is_error: true, result: 'login expired' })), 'login expired');
    assert.strictEqual(describeCliFailure('', 'error: unknown option'), 'error: unknown option');
    // A failed request must still name the provider's reason when the stream parses but reports one.
    assert.throws(() => parseCliResult('codex', JSON.stringify({ type: 'error', message: 'quota exhausted' })), /quota exhausted/);

    // The transcript is built from whatever the protocol adapter produced, so the two must agree on
    // roles and part types. They diverged silently before, because the test double for
    // LanguageModelChatMessage used string roles the real enum never uses.
    const upstream = new VsCodeProtocolAdapter().toUpstreamMessages([
        canonicalTextMessage('user', 'question'), canonicalTextMessage('assistant', 'history', 'tokonomics')]);
    const adapted = subscriptionTranscript(upstream);
    assert.ok(adapted.includes('"role":"user","content":"question"'));
    assert.ok(adapted.includes('"role":"assistant","content":"history"'));

    // Live activity: what the provider is doing, while it does it. All of this used to be parsed
    // only after the process exited, so a slow turn rendered nothing until it was over.
    const activityOf = (provider: 'claude' | 'codex', event: unknown): SubscriptionActivity[] =>
        parseCliActivity(provider, event);
    assert.deepStrictEqual(activityOf('claude', { type: 'system', subtype: 'init', model: 'claude-opus-5' }),
        [{ kind: 'model', model: 'claude-opus-5' }]);
    assert.deepStrictEqual(activityOf('claude', { type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'par' } } }),
        [{ kind: 'text', text: 'par' }]);
    assert.deepStrictEqual(activityOf('claude', { type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'weighing' } } }),
        [{ kind: 'reasoning', text: 'weighing' }]);
    // The assistant event repeats the deltas as one block; counting both would double the answer.
    assert.deepStrictEqual(activityOf('claude', { type: 'assistant', message: { content: [{ type: 'text', text: 'par' }] } }), []);
    assert.deepStrictEqual(activityOf('claude', { type: 'rate_limit_event', rate_limit_info: {} }), []);
    assert.deepStrictEqual(activityOf('codex', { type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }),
        [{ kind: 'text', text: 'answer\n' }]);
    // Reasoning is activity, never answer text: it is the provider's working, and it is not what the
    // user asked to be told, cached, or carried into the next turn.
    assert.deepStrictEqual(activityOf('codex', { type: 'item.completed', item: { type: 'reasoning', text: 'private' } }),
        [{ kind: 'reasoning', text: 'private' }]);
    for (const malformed of [undefined, null, 'text', 42, {}]) {
        assert.deepStrictEqual(activityOf('claude', malformed), []);
        assert.deepStrictEqual(activityOf('codex', malformed), []);
    }
    // Streamed text must be exactly the answer the after-the-fact parse would have produced, or
    // streaming would be a second, divergent source of truth for what the model said.
    const claudeStream = [
        { type: 'system', subtype: 'init', model: 'claude-opus-5' },
        { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'one ' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'two' } } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'one two' }] } },
        { type: 'result', subtype: 'success', result: 'one two', usage: { input_tokens: 5, output_tokens: 2 } }
    ];
    const streamedText = claudeStream.flatMap(event => parseCliActivity('claude', event))
        .filter(activity => activity.kind === 'text').map(activity => activity.text).join('');
    assert.strictEqual(streamedText, parseCliResult('claude', claudeStream.map(e => JSON.stringify(e)).join('\n')).text,
        'Streamed answer text must equal the validated final answer');

    await runSubscriptionChatCommandTests();
    console.log('Subscription transport: parsing, usage, no-bill accounting, literal stdin, timeout, cancellation, output bounds, provider-reported failures and chat-command routing passed.');
}

/**
 * Drives `@tokonomics /claude` and `/codex` through the participant itself.
 *
 * The transport and the participant were each covered and the seam between them was not, which is
 * how the whole path could be broken while every test passed. A stub standing in for the provider
 * CLI is not possible here - both CLIs are invoked with their own argument lists, which no script
 * interpreter will accept - so the executable under test is a real one that rejects those arguments,
 * and the assertion is that its rejection reaches the user instead of being replaced by a generic
 * sentence. That is the plumbing that was missing; the happy path above covers the parsing.
 */
async function runSubscriptionChatCommandTests(): Promise<void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-subscription-chat-'));
    const originalFolders = mock.workspace.workspaceFolders, originalTrust = (mock.workspace as any).isTrusted;
    const originalEditor = mock.window.activeTextEditor, originalRuntime = UserPreferenceRegistry.get();
    const context: any = { subscriptions: [], asAbsolutePath: (target: string) => path.resolve(target) };
    // The configure command is registered globally; its disposable is held so the later host
    // simulation does not see a command this test left behind.
    const commandContext: any = { subscriptions: [] };
    try {
        (mock.workspace as any).isTrusted = true;
        mock.workspace.workspaceFolders = [{ uri: mock.Uri.file(dir) }] as any;
        mock.window.activeTextEditor = undefined as any;
        UserPreferenceRegistry.reset();

        const stored = new Map<string, string>([['subscriptionCli.claude', process.execPath], ['subscriptionCli.codex', process.execPath]]);
        registerSubscriptionCommands({ subscriptions: commandContext.subscriptions,
            globalState: { get: (key: string) => stored.get(key), update: async () => {} } } as any);
        assert.strictEqual(resolveCli('claude'), process.execPath, 'A configured CLI that exists is used as-is');
        stored.set('subscriptionCli.claude', path.join(dir, 'gone.exe'));
        assert.throws(() => resolveCli('claude'), /no longer at/, 'A configured path that has moved says so, instead of failing at spawn');
        stored.set('subscriptionCli.claude', process.execPath);
        for (const provider of ['claude', 'codex'] as const) {
            const searched = cliSearchPaths(provider);
            assert.ok(searched.length > 0 && searched.every(entry => path.isAbsolute(entry)), `${provider} search paths must all be absolute`);
            assert.ok(!searched.some(entry => /\.(cmd|bat|ps1|js)$/i.test(entry)), 'Shims are never searched');
            assert.ok(searched.some(entry => path.basename(entry).startsWith(provider)), `${provider} search paths must name its binary`);
        }

        registerChatParticipant(context, new MetricsTracker(), new AstPrunerEngine());
        const token = new mock.CancellationTokenSource().token;
        for (const provider of ['claude', 'codex'] as const) {
            const output: string[] = [];
            const stream = { markdown: (value: string) => output.push(value), button: () => {} };
            await mock.activeChatParticipantHandler!(
                { prompt: 'Explain forwardedValue', command: provider, references: [], model: undefined },
                { history: [] }, stream, token);
            const rendered = output.join('');
            assert.ok(rendered.includes(`Using your **${provider} CLI login**`),
                `${provider}: the subscription transport must be selected by the command alone. Got: ${rendered}`);
            assert.ok(rendered.includes('Compiled context:'), `${provider}: context is compiled before dispatch. Got: ${rendered}`);
            assert.ok(rendered.includes('Subscription chat stopped:'),
                `${provider}: a transport failure is reported as one. Got: ${rendered}`);
            assert.ok(/provider reported/i.test(rendered),
                `${provider}: the provider's own words must reach the chat turn. Got: ${rendered}`);
            assert.ok(!rendered.includes('Model Policy'), `${provider}: an explicit CLI choice is not an allow-list selection`);
        }

        // An empty question spends the turn on the two things that break this feature in the field.
        const checked: string[] = [];
        await mock.activeChatParticipantHandler!(
            { prompt: '   ', command: 'claude', references: [], model: undefined },
            { history: [] }, { markdown: (value: string) => checked.push(value), button: () => {} }, token);
        const report = checked.join('');
        assert.ok(report.includes('subscription check'), `The empty command must report a diagnostic. Got: ${report}`);
        assert.ok(report.includes('**CLI:**') && report.includes('**Login:**'), `The diagnostic must name the CLI and its login. Got: ${report}`);

        // Drive the panel without any registered VS Code models. The same compiler and gateway
        // must handle both subscriptions, with exactly one compile and no dollar reconciliation.
        mock.setChatModelOverride([]);
        const compiler = new CanonicalRequestCompiler(new PipelineOrchestrator(new AstPrunerEngine()));
        const compile = compiler.compile.bind(compiler);
        let compilations = 0;
        compiler.compile = async request => { compilations++; return compile(request); };
        const sink: any[] = [], targets: string[] = [], events: any[] = [];
        const originalSend = CanonicalProviderGateway.send;
        const unsubscribe = OptimizationEventBus.getInstance().subscribe(event => events.push(event));
        const controller = new ChatSessionController({ post: value => sink.push(value) }, 'chat_subscription_test', undefined,
            onActivity => panelModel(new TokenOptimizerLanguageModelProvider(compiler, () => {}), onActivity));
        try {
            CanonicalProviderGateway.send = async (target, request) => {
                targets.push(target.id);
                assert.ok(JSON.stringify(request.messages).includes('hello'), 'Checked context reaches the gateway');
                return { text: (async function* () { yield 'answer'; })(), usage: { inputTokens: 100, outputTokens: 5 } } as any;
            };
            await controller.showSubscriptionModels();
            assert.ok(sink.some(m => m.type === 'models' && m.models.some((x: any) => x.id === 'subscription:claude:sonnet')));
            for (const [index, id] of ['subscription:codex:default', 'subscription:claude:sonnet'].entries()) {
                controller.selectModel(id);
                // req_-prefixed, because that is what the webview sends and the provider's
                // correlation-id boundary accepts nothing else. An unrealistic id here let the
                // request lose its identity silently: usage could never be matched back to the turn,
                // and the panel rendered no usage line at all.
                await controller.submit('req_panel_' + index, 'Say hello');
            }
            assert.deepStrictEqual(targets, ['codex-subscription', 'claude-subscription:sonnet']);
            assert.strictEqual(compilations, 2);
            assert.strictEqual(sink.filter(m => m.type === 'streamEnd').length, 2);
            const usage = sink.filter(m => m.type === 'usage');
            assert.strictEqual(usage.length, 2, 'Each completed turn reports usage to the panel');
            assert.deepStrictEqual(usage.map(m => m.requestId), ['req_panel_0', 'req_panel_1'],
                'Usage must be attributed to the turn that produced it');
            assert.ok(usage.every(m => m.summary.includes('Subscription charges and remaining quota are not inferred')),
                'A subscription turn must not imply a dollar figure');
            const finals = events.filter(e => e.sessionId === 'chat_subscription_test' && e.state === 'PROMPT_COMPLETED');
            assert.ok(finals.some(e => e.subscriptionTransport === 'codex' && e.observedInputTokens === 100));
            assert.ok(finals.every(e => e.costStatus === 'unavailable' && e.projectedSavingsUSD === 0));
            assert.ok(!events.some(e => e.sessionId === 'chat_subscription_test' && e.state === 'COST_RECONCILED'));
        } finally {
            controller.dispose(); unsubscribe(); CanonicalProviderGateway.send = originalSend;
            mock.setChatModelOverride(undefined);
        }
    } finally {
        for (const entry of [...context.subscriptions, ...commandContext.subscriptions]) entry?.dispose?.();
        UserPreferenceRegistry.apply(originalRuntime);
        mock.workspace.workspaceFolders = originalFolders; (mock.workspace as any).isTrusted = originalTrust;
        mock.window.activeTextEditor = originalEditor;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
