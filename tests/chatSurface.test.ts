/**
 * Native Chat Surface — focused suite for Work Packages 1-4.
 *
 * Covers the view shell and message boundary, model discovery and selection, canonical routing,
 * and bounded conversation behaviour. Every assertion names the plan requirement it proves.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    MAX_FIELD_CHARS, MAX_PROMPT_CHARS, MAX_SESSION_MESSAGES, MAX_STREAM_DELTA_CHARS,
    chunkStreamText, toModelDescriptor, validateInboundMessage
} from '../src/ui/chatProtocol';
import { renderChatMarkdown, ChatMarkdownNode } from '../src/ui/chatMarkdown';
import { renderChatViewHtml } from '../src/ui/chatViewHtml';
import { AUTO_MODEL_ID, ChatSessionController } from '../src/ui/chatSessionController';
import { TOKONOMICS_CHAT_SURFACE_PROMOTED, TokonomicsChatViewProvider } from '../src/ui/chatViewProvider';
import {
    CHAT_REQUEST_ID_OPTION, CHAT_SESSION_ID_OPTION, UPSTREAM_TARGET_MODEL_OPTION
} from '../src/proxy/modelProvider';
import { setChatModelOverride, setSelectChatModelsError, window as mockWindow, workspace as mockWorkspace } from './mock-vscode';
import { CHAT_STORAGE_KEY, normalizeChatSession, restoreChatArchive, MAX_SAVED_CHATS } from '../src/ui/chatPersistence';

const SESSION = 'chat_session_under_test';

function collector() {
    const messages: any[] = [];
    return { messages, post: (message: any) => { messages.push(message); } };
}

function model(id: string, extra: Record<string, unknown> = {}) {
    let recorded: { messages: any[]; options: any } | undefined;
    const entry: any = {
        id, name: `Name ${id}`, vendor: 'anthropic', family: 'fam', version: '1', maxInputTokens: 1000,
        sendRequest: async (messages: any[], options: any) => {
            recorded = { messages, options };
            entry.calls = (entry.calls || 0) + 1;
            return { text: (async function* () { yield 'hello '; yield 'world'; })() };
        },
        get recorded() { return recorded; },
        calls: 0,
        ...extra
    };
    return entry;
}

/** The Tokonomics proxy as the host exposes it. */
function proxyModel(extra: Record<string, unknown> = {}) {
    return model('token-optimizer-proxy', { vendor: 'tokonomics', ...extra });
}

export async function runChatSurfaceTests(): Promise<void> {
    console.log('\n--- Running Native Chat Surface Tests (WP1-WP4) ---');

    {
        const data = new Map<string, any>();
        const storage: any = { get: (key: string) => data.get(key), update: async (key: string, value: any) => {
            data.set(key, JSON.parse(JSON.stringify(value)));
        } };
        const fakeView = () => {
            const sink = collector(); let dispose: () => void = () => {};
            return { sink, close: () => dispose(), visible: true, webview: {
                options: {}, html: '', cspSource: 'test', postMessage: sink.post,
                onDidReceiveMessage: () => ({ dispose() {} })
            }, onDidDispose: (fn: () => void) => { dispose = fn; return { dispose() {} }; } };
        };
        const upstream = proxyModel(); setChatModelOverride([upstream]);
        const provider: any = new TokonomicsChatViewProvider({} as any, undefined, storage);
        const first = fakeView(); provider.resolveWebviewView(first);
        const sessionId = provider.controller.currentSessionId;
        await provider.handleInbound({ type: 'submit', sessionId, requestId: 'req_saved', prompt: 'Remember the blue project' });
        first.close();
        const returned = fakeView(); provider.resolveWebviewView(returned);
        await provider.handleInbound({ type: 'ready' });
        const restored = returned.sink.messages.find(m => m.type === 'restore');
        assert.strictEqual(provider.controller.currentSessionId, sessionId, 'Closing the view must not replace the conversation');
        assert.ok(restored.transcript.some((row: any) => row.text === 'hello world'), 'Returning restores the complete reply');
        assert.strictEqual(upstream.calls, 1, 'Ready must not resend the last prompt');
        await provider.handleInbound({ type: 'newSession', sessionId });
        assert.strictEqual(provider.controller.getHistoryLength(), 0);
        const nextSession = provider.controller.currentSessionId;
        const originalPicker = (mockWindow as any).showQuickPick;
        try {
            (mockWindow as any).showQuickPick = async (items: any[]) => items.find(item => item.sessionId === sessionId);
            await provider.handleInbound({ type: 'showHistory', sessionId: nextSession });
            assert.strictEqual(provider.controller.currentSessionId, sessionId, 'History reopens an archived session');
            await provider.handleInbound({ type: 'submit', sessionId, requestId: 'req_followup', prompt: 'What color?' });
            assert.ok(JSON.stringify(upstream.recorded.messages).includes('Remember the blue project'), 'Resumed model request includes the saved conversation');
            assert.ok(!JSON.stringify(upstream.recorded.messages).includes('Reply completed'), 'Display status is never model history');
        } finally { (mockWindow as any).showQuickPick = originalPicker; }
        provider.dispose(); await provider.writes;
        assert.ok(data.get(CHAT_STORAGE_KEY).sessions.length > 0, 'Conversation is saved in workspace storage');
        const restarted: any = new TokonomicsChatViewProvider({} as any, undefined, storage);
        const restartView = fakeView(); restarted.resolveWebviewView(restartView);
        await restarted.handleInbound({ type: 'ready' });
        assert.strictEqual(restarted.controller.currentSessionId, sessionId, 'Extension restart restores the last active session');
        assert.strictEqual(restarted.controller.getHistoryLength(), 4);
        const originalDeletePicker = (mockWindow as any).showQuickPick;
        const originalWarning = mockWindow.showWarningMessage;
        try {
            (mockWindow as any).showQuickPick = async (items: any[]) => items.find(item => item.sessionId === '__delete__');
            (mockWindow as any).showWarningMessage = async () => 'Delete';
            await restarted.handleInbound({ type: 'showHistory', sessionId });
            assert.strictEqual(restarted.controller.getHistoryLength(), 0, 'Delete removes active model history');
        } finally {
            (mockWindow as any).showQuickPick = originalDeletePicker;
            mockWindow.showWarningMessage = originalWarning;
        }
        restarted.dispose(); await restarted.writes;
        assert.ok(data.get(CHAT_STORAGE_KEY).sessions.every((saved: any) => !saved.transcript.length && !saved.history.length), 'Delete removes persisted conversations');
        assert.deepStrictEqual(restoreChatArchive(data.get(CHAT_STORAGE_KEY), 'different-root'), [], 'History cannot cross workspace root sets');
        assert.deepStrictEqual(restoreChatArchive({ workspace: 'x', sessions: [null, { id: '</script>' }] }, 'x'), [], 'Invalid saved data is ignored');
        const bounded = normalizeChatSession({ id: 'chat_bounded', selectedModelId: 'auto', updatedAt: 0,
            history: Array.from({ length: 60 }, () => ({ role: 'user', text: 'x'.repeat(10000) })),
            transcript: [{ role: 'user', text: 'api_key=sk-' + 'a'.repeat(48) }] })!;
        assert.ok(bounded.history.length <= MAX_SESSION_MESSAGES);
        assert.ok(bounded.history.reduce((n, row) => n + row.text.length, 0) <= 120000);
        assert.ok(!bounded.transcript[0].text.includes('sk-' + 'a'.repeat(48)), 'Known secrets are redacted before saving');
        const archive = restoreChatArchive({ workspace: 'x', sessions: Array.from({ length: 30 }, (_, i) => ({ ...bounded, id: 'chat_' + i })) }, 'x');
        assert.strictEqual(archive.length, MAX_SAVED_CHATS, 'Saved conversation count is bounded');
        console.log('  ? Panel lifecycle: view recreation, archive/resume, extension restart, workspace isolation and bounded storage.');
    }

    {
        let release!: () => void;
        let started!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const hasStarted = new Promise<void>(resolve => { started = resolve; });
        const upstream = proxyModel({ sendRequest: async () => ({ text: (async function* () {
            yield 'partial '; started(); await gate; yield 'finished';
        })() }) });
        setChatModelOverride([upstream]);
        const sink = collector();
        const controller = new ChatSessionController(sink, 'chat_stream_restore');
        const pending = controller.submit('req_live', 'Continue while hidden');
        await hasStarted;
        controller.replay();
        const replay = sink.messages.filter(m => m.type === 'restore').pop();
        assert.ok(replay.busy && replay.requestId === 'req_live');
        assert.strictEqual(replay.transcript[1].text, 'partial ');
        const interrupted = controller.snapshot();
        assert.strictEqual(interrupted.history.length, 1, 'Partial assistant output is display-only');
        const afterRestart = new ChatSessionController(collector(), 'chat_restart');
        afterRestart.restore(interrupted);
        assert.ok(!afterRestart.isBusy, 'A restart must not leave a phantom request running');
        assert.ok(afterRestart.snapshot().transcript.some(row => row.text.includes('interrupted')));
        release(); await pending;
        assert.strictEqual(controller.snapshot().transcript[1].text, 'partial finished');
        controller.dispose(); afterRestart.dispose();
        console.log('  ? Streaming restoration: partial reply, busy state, continuation and interrupted-restart notice.');
    }

    {
        // A cancelled old request can finish after a root transition and a new send has begun.
        let finishOld!: () => void, finishNew!: () => void, oldStarted!: () => void, newStarted!: () => void;
        const oldGate = new Promise<void>(resolve => { finishOld = resolve; });
        const newGate = new Promise<void>(resolve => { finishNew = resolve; });
        const oldReady = new Promise<void>(resolve => { oldStarted = resolve; });
        const newReady = new Promise<void>(resolve => { newStarted = resolve; });
        let calls = 0;
        setChatModelOverride([proxyModel({ sendRequest: async () => {
            const first = calls++ === 0;
            return { text: (async function* () { if (first) { oldStarted(); await oldGate; } else { newStarted(); await newGate; } yield first ? 'old root' : 'new root'; })() };
        } })]);
        const sink = collector(); const controller = new ChatSessionController(sink, 'chat_old_root');
        const oldRequest = controller.submit('req_old_root', 'Old workspace'); await oldReady;
        controller.newSession('chat_new_root');
        const newRequest = controller.submit('req_new_root', 'New workspace'); await newReady;
        finishOld(); await oldRequest;
        assert.ok(controller.isBusy, 'Old cancellation must not release a newer request');
        assert.ok(!controller.snapshot().transcript.some(row => row.text.includes('old root')), 'Old root output cannot contaminate the new transcript');
        finishNew(); await newRequest; controller.dispose();
        const previousListener = mockWorkspace.onDidChangeWorkspaceFolders;
        let changeRoots!: () => void;
        try {
            (mockWorkspace as any).onDidChangeWorkspaceFolders = (listener: () => void) => { changeRoots = listener; return { dispose() {} }; };
            const provider: any = new TokonomicsChatViewProvider({} as any);
            provider.sessions = [{ id: 'chat_previous_root', transcript: [{ role: 'user', text: 'old source' }] }];
            changeRoots();
            assert.strictEqual(provider.sessions.length, 0, 'Root change erases archived chats even before the view opens');
            provider.dispose();
        } finally { mockWorkspace.onDidChangeWorkspaceFolders = previousListener; }
        console.log('  ? Root transitions cancel old work without disturbing the new request or retaining old history.');
    }

    {
        const sample = fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/chat-formatting.md'), 'utf8');
        const flatten = (nodes: ChatMarkdownNode[]): ChatMarkdownNode[] => nodes.flatMap(node => [node, ...flatten(node.children || [])]);
        const nodes = flatten(renderChatMarkdown(sample));
        assert.strictEqual(nodes.filter(node => node.tag === 'table').length, 1, 'The reported table must become a table');
        assert.strictEqual(nodes.filter(node => node.tag === 'th').length, 2);
        assert.strictEqual(nodes.filter(node => node.tag === 'td').length, 12);
        assert.ok(nodes.some(node => node.tag === 'strong'), 'Bold becomes emphasis');
        assert.ok(nodes.some(node => node.tag === 'ul'), 'Bullets become a list');
        assert.ok(nodes.some(node => node.tag === 'code' && node.text === 'CliResult.usage'));
        assert.ok(nodes.some(node => node.tag === 'pre' && node.language === 'ts' && node.text?.includes('value != null')));
        assert.ok(!nodes.some(node => node.text?.includes('&#x20;')), 'Entities are decoded outside code blocks');
        const hostile = flatten(renderChatMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[x](command:workbench.action.closeWindow) [y](javascript:alert(1)) [safe](https://example.com) ![image](https://example.com/track.png)'));
        assert.ok(hostile.every(node => !['script', 'img', 'iframe'].includes(node.tag || '')));
        assert.deepStrictEqual(hostile.filter(node => node.href).map(node => node.href), ['https://example.com']);
        const sink = collector(); const controller = new ChatSessionController(sink, 'chat_markdown');
        setChatModelOverride([proxyModel({ sendRequest: async () => ({ text: (async function* () {
            yield sample.slice(0, 80); yield sample.slice(80);
        })() }) })]);
        await controller.submit('req_markdown', 'Format this');
        assert.ok(flatten(sink.messages.find(message => message.type === 'streamEnd').markdown).some(node => node.tag === 'table'), 'Final streamed reply is formatted even when chunks are throttled');
        controller.replay();
        assert.ok(sink.messages.filter(message => message.type === 'restore').pop().transcript[1].markdown);
        assert.ok(!JSON.stringify(controller.snapshot()).includes('"markdown"'), 'Rendering nodes are not persisted or sent to the model');
        controller.dispose();
        console.log('  ? Markdown: supplied table/code/emphasis sample, entity decoding, hostile markup, final stream and history replay.');
    }

    {
        const originalCreate = mockWindow.createWebviewPanel;
        let created = 0, closed!: () => void;
        const editor = collector();
        let reveals = 0;
        try {
            (mockWindow as any).createWebviewPanel = (viewType: string, _title: string, _column: any, options: any) => {
                assert.strictEqual(viewType, 'tokonomics.chatEditor');
                assert.strictEqual(options.retainContextWhenHidden, true);
                created++;
                return { viewColumn: 1, visible: true, reveal: () => { reveals++; }, dispose: () => closed?.(),
                    webview: { cspSource: 'test', html: '', options: {}, postMessage: editor.post, onDidReceiveMessage: () => ({ dispose() {} }) },
                    onDidDispose: (callback: () => void) => { closed = callback; return { dispose() {} }; } };
            };
            setChatModelOverride([proxyModel()]);
            const provider: any = new TokonomicsChatViewProvider({} as any);
            provider.openEditor(); const controller = provider.controller;
            provider.openEditor();
            assert.strictEqual(created, 1, 'Open Chat reuses the pinned editor');
            assert.strictEqual(reveals, 1);
            await provider.handleInbound({ type: 'submit', sessionId: controller.currentSessionId, requestId: 'req_editor', prompt: 'Editor conversation' });
            const sidebar = collector();
            provider.resolveWebviewView({ webview: { cspSource: 'test', html: '', options: {}, postMessage: sidebar.post,
                onDidReceiveMessage: () => ({ dispose() {} }) }, onDidDispose: () => ({ dispose() {} }) });
            await provider.handleInbound({ type: 'ready' });
            assert.ok(sidebar.messages.some(message => message.type === 'restore' && message.transcript.length === 2), 'Sidebar shares the same conversation');
            assert.strictEqual(provider.controller, controller);
            await provider.openSidebar();
            assert.strictEqual(provider.editorPanel, undefined, 'Open Chat returns to the dockable sidebar and closes the editor without losing history');
            assert.strictEqual(provider.controller, controller);
            provider.openEditor();
            provider.releaseView();
            assert.ok(provider.editorPanel, 'Sidebar disposal must not close the editor');
            closed(); provider.openEditor();
            assert.strictEqual(created, 3); assert.strictEqual(provider.controller, controller, 'Closing and reopening the editor retains history');
            provider.dispose();
        } finally { mockWindow.createWebviewPanel = originalCreate; }
        console.log('  ? Editor tab: open/reveal, shared sidebar history, independent disposal and reopening.');
    }

    // =====================================================================
    // WP1: manifest, shell, CSP and message boundary
    // =====================================================================
    {
        const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        const contributes = manifest.contributes;

        const properties = contributes.configuration.properties;
        assert.strictEqual(Object.keys(properties).length, 4,
            'The chat surface must not add a public setting; exactly four must remain');

        const views = contributes.views.tokonomicsChat;
        assert.strictEqual(views.length, 1, 'Exactly one chat view is contributed');
        assert.strictEqual(views[0].id, 'tokenOptimizer.chatView');
        assert.strictEqual(views[0].type, 'webview');
        assert.strictEqual(views[0].when, 'tokonomics.chatSurfaceEnabled',
            'The unpromoted surface must remain behind its internal capability context');
        assert.strictEqual(contributes.viewsContainers.secondarySidebar.length, 1,
            'Exactly one view container is contributed');
        assert.strictEqual(TOKONOMICS_CHAT_SURFACE_PROMOTED, true,
            'The validated subscription panel is enabled in this build');

        const commandIds = contributes.commands.map((command: any) => command.command);
        assert.ok(commandIds.includes('tokenOptimizer.openChat'), 'The focus command is contributed');
        assert.strictEqual(contributes.commands.find((command: any) => command.command === 'tokenOptimizer.openChat').enablement,
            'tokonomics.chatSurfaceEnabled', 'The focus command must use the same internal capability gate');
        assert.strictEqual(new Set(commandIds).size, commandIds.length, 'Command identifiers are unique');
        assert.ok(commandIds.includes('tokenOptimizer.showDashboard') && commandIds.includes('tokenOptimizer.explainTrace'),
            'The existing dashboard and trace commands remain, so the view links rather than rebuilds them');

        // The participant contribution must be untouched by this feature.
        assert.strictEqual(contributes.chatParticipants[0].name, 'tokonomics',
            '@tokonomics must remain registered and unchanged');

        console.log('  ✓ WP1 manifest: one view, one container, four settings, @tokonomics intact.');
    }

    {
        const html = renderChatViewHtml({ nonce: 'NONCE123', cspSource: 'vscode-resource://test', sessionId: SESSION });

        assert.ok(html.includes("default-src 'none'"), 'CSP must default to none');
        assert.ok(html.includes("connect-src 'none'"), 'The view must not be able to open a network connection');
        assert.ok(html.includes("object-src 'none'") && html.includes("frame-src 'none'"),
            'Objects and frames must be blocked');
        assert.ok(html.includes("script-src 'nonce-NONCE123'"), 'Scripts must be nonce-gated');
        assert.ok(html.includes("style-src 'nonce-NONCE123'"), 'Styles must be nonce-gated');
        assert.ok(!/unsafe-inline|unsafe-eval/.test(html), 'No unsafe CSP directive may appear');

        // XSS surface: the document must never assign untrusted text through innerHTML, and must
        // carry no inline event handler attributes.
        assert.ok(!/\.innerHTML/.test(html), 'The view must render text through textContent only');
        assert.ok(!/\son(?:click|error|load|input|change)\s*=/.test(html),
            'No inline event handler attributes may appear');
        assert.ok(html.includes('textContent'), 'Rendering uses textContent');

        // A hostile session id or nonce must not break out of the script context.
        const injected = renderChatViewHtml({
            nonce: 'N', cspSource: 'x', sessionId: '"; window.stolen=1; //'
        });
        assert.ok(injected.includes(JSON.stringify('"; window.stolen=1; //')),
            'The session id must be embedded as a JSON string literal, not interpolated raw');
        assert.ok(!injected.includes('let sessionId = "";'), 'Session id interpolation must not terminate early');
        assert.ok(html.includes("if (message.type === 'session')"),
            'The webview must rotate its session id before applying stale-message rejection');
        assert.ok(html.includes("post({ type: 'submit', sessionId: sessionId"),
            'Subsequent submissions must use the rotated session id');

        const providerSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/chatViewProvider.ts'), 'utf8');
        assert.ok(providerSource.includes('onDidChangeWorkspaceFolders'),
            'Workspace-folder changes must rotate the model-visible session');
        assert.ok(/case 'ready':[\s\S]*?return;[\s\S]*?case 'refreshModels':\s*await controller\.refreshModels\(\)/.test(providerSource),
            'Model enumeration must require explicit Refresh rather than a restored-view ready event');

        assert.ok(html.includes("Request in progress…"), 'Webview restoration state must use ellipsis rather than typo question mark');
        assert.ok(!html.includes("Request in progress?"), 'Webview must not contain accidental question mark typo');

        console.log('  ✓ WP1 webview: strict CSP, nonce-gated assets, no innerHTML, no inline handlers, valid UI text.');
    }

    {
        // Inbound message validation: unknown types, bad shapes, oversize, forgery, staleness.
        const reject = (raw: unknown, expected: string) => {
            const result = validateInboundMessage(raw, SESSION);
            assert.strictEqual(result.ok, false, `Expected rejection for ${JSON.stringify(raw).slice(0, 60)}`);
            if (!result.ok) assert.ok(result.reason.startsWith(expected), `reason ${result.reason} !~ ${expected}`);
        };

        reject(null, 'message_not_object');
        reject('submit', 'message_not_object');
        reject([{ type: 'submit' }], 'message_not_object');
        reject({ type: 'evil' }, 'unknown_type');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'r', prompt: 'hi', extra: 1 }, 'unexpected_property');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'r' }, 'missing_property');
        reject({ type: 'submit', sessionId: 'other', requestId: 'r', prompt: 'hi' }, 'stale_session');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'r', prompt: '   ' }, 'empty_prompt');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'r', prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }, 'prompt_too_large');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'x'.repeat(MAX_FIELD_CHARS + 1), prompt: 'hi' }, 'invalid_request_id');
        reject({ type: 'submit', sessionId: SESSION, requestId: 'r', prompt: 42 }, 'invalid_prompt');
        reject({ type: 'selectModel', sessionId: SESSION, modelId: '' }, 'invalid_model_id');
        reject({ type: 'cancel', sessionId: 123 }, 'invalid_session_id');

        const accepted = validateInboundMessage({ type: 'submit', sessionId: SESSION, requestId: 'r1', prompt: ' hi ' }, SESSION);
        assert.ok(accepted.ok && accepted.message.type === 'submit');
        assert.ok(validateInboundMessage({ type: 'ready' }, SESSION).ok, 'ready needs no session id');
        assert.ok(validateInboundMessage({ type: 'openDashboard' }, SESSION).ok);

        // Prototype-pollution shaped payload must be refused as an unexpected property.
        reject({ type: 'cancel', sessionId: SESSION, __proto__: { polluted: true }, polluted: true }, 'unexpected_property');

        console.log('  ✓ WP1 boundary: unknown, malformed, oversized, forged and stale messages rejected.');
    }

    // =====================================================================
    // WP2: model discovery and selection
    // =====================================================================
    {
        // Empty host.
        setChatModelOverride([]);
        let sink = collector();
        let controller = new ChatSessionController(sink, SESSION);
        await controller.refreshModels();
        let models = sink.messages.filter(m => m.type === 'models').pop();
        assert.deepStrictEqual(models.models, [], 'An empty host yields no models');
        assert.strictEqual(models.selectedModelId, AUTO_MODEL_ID);
        controller.dispose();

        // Self-recursion prevention plus duplicate and malformed entries.
        setChatModelOverride([
            proxyModel(),
            model('m1'),
            model('m1'),
            { id: '', name: 'no id' },
            model('m2', { name: 'Duplicate Display Name' }),
            model('m3', { name: 'Duplicate Display Name' })
        ]);
        sink = collector();
        controller = new ChatSessionController(sink, SESSION);
        await controller.refreshModels();
        models = sink.messages.filter(m => m.type === 'models').pop();
        const ids = models.models.map((m: any) => m.id);
        assert.ok(!ids.includes('token-optimizer-proxy'), 'The Tokonomics proxy must never be an upstream option');
        assert.deepStrictEqual(ids, ['m1', 'm2', 'm3'], 'Duplicate and id-less entries are dropped');
        assert.strictEqual(models.models.filter((m: any) => m.name === 'Duplicate Display Name').length, 2,
            'Duplicate display names are allowed; identity is the id');

        // Exact-id selection, and refusal of an unavailable id with no silent fallback.
        controller.selectModel('m2');
        assert.strictEqual(controller.getSelectedModelId(), 'm2');
        controller.selectModel('does-not-exist');
        assert.strictEqual(controller.getSelectedModelId(), 'm2',
            'An unavailable selection must not silently replace the current one');
        assert.ok(sink.messages.some(m => m.type === 'error' && m.kind === 'model_unavailable'),
            'The user is told the model is unavailable');

        // Disappearing model: selection is dropped to Auto and flagged, never swapped silently.
        setChatModelOverride([model('m1')]);
        await controller.refreshModels();
        models = sink.messages.filter(m => m.type === 'models').pop();
        assert.strictEqual(models.selectionLost, true, 'Losing the selected model must be surfaced');
        assert.strictEqual(controller.getSelectedModelId(), AUTO_MODEL_ID);
        controller.dispose();

        // A host that throws (consent denied, no LM API) degrades to the truthful empty state.
        setSelectChatModelsError(new Error('consent denied'));
        sink = collector();
        controller = new ChatSessionController(sink, SESSION);
        await controller.refreshModels();
        models = sink.messages.filter(m => m.type === 'models').pop();
        assert.deepStrictEqual(models.models, [], 'A throwing host yields no models rather than an invented one');
        setSelectChatModelsError(undefined);
        controller.dispose();

        // Tampered metadata is clamped, never trusted.
        const descriptor = toModelDescriptor({
            id: 'x'.repeat(MAX_FIELD_CHARS + 50), name: 42, vendor: null,
            maxInputTokens: Number.POSITIVE_INFINITY
        });
        assert.ok(descriptor && descriptor.id.length === MAX_FIELD_CHARS, 'Oversized ids are clamped');
        assert.strictEqual(descriptor!.vendor, 'unknown', 'Non-string vendor falls back');
        assert.strictEqual(descriptor!.maxInputTokens, 0, 'Non-finite limits are refused');
        assert.strictEqual(toModelDescriptor({ name: 'no id' }), undefined, 'An entry without an id is dropped');

        console.log('  ✓ WP2 discovery: recursion blocked, duplicates dropped, no silent fallback, metadata clamped.');
    }

    // =====================================================================
    // WP3: canonical routing
    // =====================================================================
    {
        // Explicit selection must reach the proxy as an exact id in the namespaced option.
        const proxy = proxyModel();
        const upstream = model('claude-x');
        setChatModelOverride([proxy, upstream]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        await controller.refreshModels();
        controller.selectModel('claude-x');
        await controller.submit('r1', 'first prompt');

        assert.strictEqual(proxy.calls, 1, 'Exactly one send per accepted prompt');
        assert.strictEqual(upstream.calls, 0, 'The controller must never call an upstream model directly');
        const options = proxy.recorded.options;
        assert.strictEqual(options.modelOptions[UPSTREAM_TARGET_MODEL_OPTION], 'claude-x',
            'The selected model reaches the provider by exact id through the namespaced option');
        assert.strictEqual(options.modelOptions[CHAT_REQUEST_ID_OPTION], 'r1');
        assert.strictEqual(options.modelOptions[CHAT_SESSION_ID_OPTION], SESSION);

        // Ordered, complete stream delivered to the view.
        const deltas = sink.messages.filter(m => m.type === 'streamDelta').map(m => m.text).join('');
        assert.strictEqual(deltas, 'hello world', 'The full response streams to the view in order');
        assert.ok(sink.messages.some(m => m.type === 'streamStart'), 'Stream start is announced');
        assert.ok(sink.messages.some(m => m.type === 'streamEnd'), 'Stream end is announced');
        assert.ok(!controller.isBusy, 'Busy state clears after completion');

        // Replayed request id must not send twice.
        await controller.submit('r1', 'first prompt');
        assert.strictEqual(proxy.calls, 1, 'A replayed request id must never send twice');

        // Auto selection sends no explicit target, preserving existing provider behaviour.
        controller.selectModel(AUTO_MODEL_ID);
        await controller.submit('r2', 'second prompt');
        assert.strictEqual(proxy.calls, 2);
        assert.strictEqual(proxy.recorded.options.modelOptions[UPSTREAM_TARGET_MODEL_OPTION], undefined,
            'Auto must not pin an upstream model');
        controller.dispose();

        console.log('  ✓ WP3 routing: one send per prompt, exact-id targeting, Auto preserved, no double-send.');
    }

    {
        // An arbitrary model from the Tokonomics vendor is not a safe substitute for the one
        // canonical proxy identity.
        const alternate = model('different-tokonomics-model', { vendor: 'tokonomics' });
        setChatModelOverride([alternate]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        await controller.submit('r-exact', 'prompt');
        assert.strictEqual(alternate.calls, 0);
        assert.strictEqual(sink.messages.find(m => m.type === 'error')?.kind, 'no_models');
        controller.dispose();
    }

    {
        // No proxy present: the prompt must not be sent anywhere.
        setChatModelOverride([model('m1')]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        await controller.submit('r1', 'prompt');
        const error = sink.messages.find(m => m.type === 'error');
        assert.ok(error && error.kind === 'no_models', 'Without the proxy the prompt is refused, not rerouted');
        assert.ok(!sink.messages.some(m => m.type === 'streamStart'), 'No stream begins');
        controller.dispose();
    }

    {
        // Provider failure is classified and reported once, and the controller returns to idle.
        const failing = proxyModel({
            sendRequest: async () => { throw new Error('Model quota exceeded'); }
        });
        setChatModelOverride([failing]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        await controller.submit('r1', 'prompt');
        const errors = sink.messages.filter(m => m.type === 'error');
        assert.strictEqual(errors.length, 1, 'Exactly one error is reported');
        assert.strictEqual(errors[0].kind, 'quota');
        assert.ok(!controller.isBusy, 'The controller returns to idle after failure');
        controller.dispose();
    }

    {
        // Cancellation mid-stream stops delivery and reports cancelled, not success.
        let controllerRef: ChatSessionController | undefined;
        const slow = proxyModel({
            sendRequest: async () => ({
                text: (async function* () {
                    yield 'part-one';
                    controllerRef?.cancel();
                    yield 'part-two';
                })()
            })
        });
        setChatModelOverride([slow]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        controllerRef = controller;
        await controller.submit('r1', 'prompt');
        const errors = sink.messages.filter(m => m.type === 'error');
        assert.strictEqual(errors[0]?.kind, 'cancelled', 'Cancellation is reported as cancelled');
        assert.ok(!sink.messages.some(m => m.type === 'streamEnd'), 'A cancelled request must not report completion');
        assert.ok(!controller.isBusy, 'Cancellation releases the busy state');
        controller.dispose();
    }

    // =====================================================================
    // WP4: bounded conversations
    // =====================================================================
    {
        const proxy = proxyModel();
        setChatModelOverride([proxy]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);

        for (let index = 0; index < MAX_SESSION_MESSAGES + 10; index++) {
            await controller.submit(`r${index}`, `prompt ${index}`);
        }
        assert.ok(controller.getHistoryLength() <= MAX_SESSION_MESSAGES,
            `History must stay bounded (was ${controller.getHistoryLength()})`);

        // The most recent prompt always survives the bound.
        const sent = proxy.recorded.messages;
        const flat = JSON.stringify(sent);
        assert.ok(flat.includes(`prompt ${MAX_SESSION_MESSAGES + 9}`), 'The current prompt is always included');

        // New Session erases history and issues a fresh session id.
        controller.newSession('chat_new_session');
        assert.strictEqual(controller.getHistoryLength(), 0, 'New Session clears model-visible history');
        assert.strictEqual(controller.currentSessionId, 'chat_new_session');
        assert.ok(sink.messages.some(m => m.type === 'cleared'), 'The view is told to clear');
        assert.deepStrictEqual(sink.messages.slice(-3).map(m => m.type), ['session', 'cleared', 'models'],
            'The session rotation must reach the view before messages addressed to the new session');

        // Messages addressed to the retired session must now be refused.
        assert.strictEqual(validateInboundMessage({ type: 'cancel', sessionId: SESSION }, controller.currentSessionId).ok,
            false, 'A retired session id must not drive the new session');

        controller.dispose();
        assert.strictEqual(controller.getHistoryLength(), 0, 'Disposal leaves no history residue');
        await controller.submit('after-dispose', 'should not send');
        assert.strictEqual(proxy.calls, MAX_SESSION_MESSAGES + 10, 'A disposed controller sends nothing further');

        console.log('  ✓ WP4 conversations: bounded, cleared on new session, no residue after disposal.');
    }

    {
        // Usage shown in the view must come from the canonical event, be correlated to this chat
        // request, and stop flowing after controller disposal.
        let listener: ((event: any) => void) | undefined;
        let unsubscribed = false;
        const eventSource = {
            subscribe: (candidate: (event: any) => void) => {
                listener = candidate;
                return () => { unsubscribed = true; listener = undefined; };
            }
        };
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION, eventSource);
        const proxy = proxyModel({
            sendRequest: async () => {
                listener?.({
                    id: 'usage-request', sessionId: SESSION, state: 'PROMPT_COMPLETED',
                    rawInputTokens: 100, optimizedInputTokens: 75, savedTokens: 25,
                    tokenState: 'tokenizer_measured', costState: 'pricing_unavailable',
                    costUnavailableReason: 'pricing_not_found'
                });
                return { text: (async function* () { yield 'done'; })() };
            }
        });
        setChatModelOverride([proxy]);
        await controller.submit('usage-request', 'measure this');
        const usage = sink.messages.find(message => message.type === 'usage');
        assert.ok(usage?.summary.includes('100 → 75 input tokens; 25 saved (tokenizer measured).'));
        assert.ok(usage?.summary.includes('Cost unavailable:'));
        controller.dispose();
        assert.strictEqual(unsubscribed, true, 'Disposal must release the canonical-event listener');
    }

    {
        // Extension-authored presentation text must never re-enter a prompt as history.
        const proxy = proxyModel();
        setChatModelOverride([proxy]);
        const sink = collector();
        const controller = new ChatSessionController(sink, SESSION);
        await controller.submit('r1', 'first');
        await controller.submit('r2', 'second');
        const payload = JSON.stringify(proxy.recorded.messages);
        assert.ok(!payload.includes('⚡ **Tokonomics'), 'Banner text must not enter model history');
        assert.ok(payload.includes('first') && payload.includes('second'), 'Real turns are retained');
        controller.dispose();
    }

    {
        // Stream chunking bounds each delta.
        const single = chunkStreamText('short');
        assert.deepStrictEqual(single, ['short']);
        const many = chunkStreamText('x'.repeat(MAX_STREAM_DELTA_CHARS * 2 + 5));
        assert.strictEqual(many.length, 3, 'Oversized text is split into bounded deltas');
        for (const chunk of many) assert.ok(chunk.length <= MAX_STREAM_DELTA_CHARS);
        console.log('  ✓ WP4 streaming: deltas are bounded.');
    }

    // =====================================================================
    // WP5: packaging must not ship internal documents
    // =====================================================================
    {
        // A candidate archive shipped TOKONOMICS_NATIVE_CHAT_SURFACE_IMPLEMENTATION_PLAN.md because
        // the exclusion rule was a denylist of remembered filenames. The rule is now an allowlist,
        // so any future internal document fails packaging instead of shipping silently.
        const ignore = fs.readFileSync(path.join(process.cwd(), '.vscodeignore'), 'utf8');
        for (const pattern of ['*_PLAN.md', '*_ROADMAP.md', 'TOKONOMICS_*.md', 'PHASE_*.md', '*_CONTRACT.md']) {
            assert.ok(ignore.includes(pattern), `.vscodeignore must exclude ${pattern}`);
        }

        const verifySource = fs.readFileSync(path.join(process.cwd(), 'scripts/verify-vsix.js'), 'utf8');
        assert.ok(verifySource.includes('ALLOWED_MARKDOWN'),
            'VSIX verification must allowlist markdown rather than denylist internal names');
        assert.ok(verifySource.includes('Forbidden internal document'),
            'VSIX verification must fail on an unapproved markdown entry');

        const inspectionPath = path.join(process.cwd(), 'validation/reports/vsix-inspection.json');
        if (fs.existsSync(inspectionPath)) {
            const inspection = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
            const markdown = inspection.entries
                .map((entry: any) => String(entry.name))
                .filter((name: string) => name.toLowerCase().endsWith('.md'));
            assert.deepStrictEqual(markdown.sort(), ['extension/changelog.md', 'extension/readme.md'],
                'The archive must contain only the two public markdown documents');
            assert.strictEqual(inspection.checks.internalDocumentsAbsent, true);
            assert.strictEqual(inspection.checks.developmentArtifactsAbsent, true);
        }
        console.log('  ✓ WP5 packaging: internal documents excluded by allowlist, not by remembered names.');
    }

    {
        const sink = collector();
        let relay: any;
        const sends: any[] = [];
        const controller = new ChatSessionController(sink, SESSION, undefined, onActivity => {
            relay = onActivity;
            return proxyModel({ sendRequest: async (messages: any[]) => {
                sends.push(messages);
                onActivity({ kind: 'model', model: 'fixture-model' });
                onActivity({ kind: 'reasoning', text: 'private provider working' });
                onActivity({ kind: 'command', id: 'cmd', text: 'npm test', status: 'running' });
                onActivity({ kind: 'command', id: 'cmd', text: 'npm test', status: 'completed' });
                onActivity({ kind: 'file', id: 'edit', text: 'Edit: src/app.ts', status: 'running' });
                onActivity({ kind: 'tool', id: 'edit', status: 'failed' });
                return { text: (async function* () { yield 'answer'; })() };
            } });
        });
        await controller.submit('activity-one', 'hello');
        const activity = sink.messages.filter(m => m.type === 'activity');
        assert.ok(activity.some(m => m.category === 'reasoning'), 'The first thinking event must not be throttled behind a model update');
        assert.ok(activity.some(m => m.category === 'command' && m.status === 'completed'), 'Fast terminal events must bypass reasoning throttling');
        assert.ok(activity.some(m => m.category === 'file' && m.text === 'Edit: src/app.ts' && m.status === 'failed'), 'Tool results retain the original operation and path');
        assert.ok(!JSON.stringify(activity).includes('private provider working'), 'Thinking status must not reveal raw reasoning');
        await controller.submit('activity-two', 'follow up');
        assert.ok(!JSON.stringify(sends[1]).includes('npm test'), 'Activity must not enter model history');
        const before = sink.messages.length;
        relay({ kind: 'command', text: 'late event', status: 'completed' });
        assert.strictEqual(sink.messages.length, before, 'Finished requests must ignore late activity');
        controller.dispose();
    }
    setChatModelOverride(undefined);
    console.log('\n--- ALL NATIVE CHAT SURFACE TESTS PASSED ---\n');
}
