/**
 * Tokonomics Chat Surface — WebviewViewProvider.
 *
 * Owns the view lifecycle and the trust boundary between the untrusted webview document and the
 * extension host. Every inbound message is validated by `chatProtocol` before the controller sees
 * it. The provider performs no model discovery, no compilation and no provider dispatch of its
 * own; it delegates to `ChatSessionController`, which routes through the existing proxy.
 *
 * Nothing happens until the user opens the view: registration is cheap, and model discovery runs
 * on first resolve rather than on activation, so starting VS Code triggers no consent prompt,
 * no model query and no request.
 */

import * as vscode from 'vscode';
import { randomUUID, randomBytes } from 'crypto';
import { OutboundChatMessage, validateInboundMessage } from './chatProtocol';
import { ChatSessionController } from './chatSessionController';
import { renderChatViewHtml } from './chatViewHtml';
import { resolveSubscriptionChoice } from '../subscriptions/modelChoices';
import { subscriptionDiagnostics } from '../subscriptions/subscriptionModels';
import { SubscriptionActivityListener } from '../subscriptions/cliTransport';
import { CHAT_STORAGE_KEY, MAX_SAVED_CHATS, SavedChatSession, restoreChatArchive } from './chatPersistence';

export const TOKONOMICS_CHAT_VIEW_ID = 'tokenOptimizer.chatView';
export const TOKONOMICS_CHAT_EDITOR_ID = 'tokonomics.chatEditor';
export const TOKONOMICS_CHAT_CAPABILITY_CONTEXT = 'tokonomics.chatSurfaceEnabled';
/** Enabled with the shared compiler route and subscription model selection. */
export const TOKONOMICS_CHAT_SURFACE_PROMOTED = true;

export class TokonomicsChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private view: vscode.WebviewView | undefined;
    private controller: ChatSessionController | undefined;
    private editorPanel: vscode.WebviewPanel | undefined;
    private readonly editorDisposables: vscode.Disposable[] = [];
    private readonly disposables: vscode.Disposable[] = [];
    private disposed = false;
    private readonly viewDisposables: vscode.Disposable[] = [];
    private sessions: SavedChatSession[] = [];
    private saveTimer: ReturnType<typeof setTimeout> | undefined;
    private writes: Promise<void> = Promise.resolve();
    private storageWarningShown = false;

    private workspaceKey(): string {
        return JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()).sort());
    }

    constructor(private readonly extensionUri: vscode.Uri,
        private readonly localProxyFactory?: (onActivity: SubscriptionActivityListener) => vscode.LanguageModelChat,
        private readonly storage?: vscode.Memento) {
        this.sessions = restoreChatArchive(storage?.get(CHAT_STORAGE_KEY), this.workspaceKey());
        if (typeof vscode.lm?.onDidChangeChatModels === 'function') {
            this.disposables.push(vscode.lm.onDidChangeChatModels(() => {
                if (!this.disposed && (this.view?.visible || this.editorPanel?.visible)) void this.controller?.refreshModels();
            }));
        }
        if (typeof vscode.workspace?.onDidChangeWorkspaceFolders === 'function') {
            this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
                // Never carry a removed workspace's history into the new root set.
                this.sessions = [];
                this.controller?.newSession(`chat_${randomUUID()}`);
                this.save();
            }));
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        if (this.disposed) return;
        this.releaseView();
        this.view = webviewView;

        this.configureWebview(webviewView.webview, 'sidebar', this.viewDisposables);

        this.viewDisposables.push(webviewView.onDidDispose(() => {
            if (this.view === webviewView) this.releaseView();
        }));
    }

    /** Return to the dockable view, preserving its current user-selected sidebar location. */
    public async openSidebar(): Promise<void> {
        if (this.disposed) return;
        await TokonomicsChatViewProvider.focus();
        this.editorPanel?.dispose();
    }

    /** An editor tab is independent of sidebar chat containers and survives switching them. */
    public openEditor(): void {
        if (this.disposed) return;
        if (this.editorPanel) { this.editorPanel.reveal(this.editorPanel.viewColumn, false); return; }
        const panel = vscode.window.createWebviewPanel(TOKONOMICS_CHAT_EDITOR_ID, 'Tokonomics Chat',
            { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
        this.attachEditor(panel);
    }

    public restoreEditor(panel: vscode.WebviewPanel): void {
        if (this.disposed) { panel.dispose(); return; }
        if (this.editorPanel && this.editorPanel !== panel) { panel.dispose(); return; }
        this.attachEditor(panel);
    }

    private attachEditor(panel: vscode.WebviewPanel): void {
        this.editorPanel = panel;
        this.configureWebview(panel.webview, 'editor', this.editorDisposables);
        this.editorDisposables.push(panel.onDidDispose(() => {
            if (this.editorPanel !== panel) return;
            this.editorPanel = undefined;
            for (const disposable of this.editorDisposables.splice(0)) disposable.dispose();
        }));
    }

    private post(message: OutboundChatMessage): void {
        if (this.disposed) return;
        void this.view?.webview.postMessage(message);
        void this.editorPanel?.webview.postMessage(message);
    }

    private configureWebview(webview: vscode.Webview, surface: 'sidebar' | 'editor', disposables: vscode.Disposable[]): void {
        webview.options = { enableScripts: true, localResourceRoots: [] };
        if (!this.controller) {
            this.controller = new ChatSessionController({ post: message => this.post(message) },
                `chat_${randomUUID()}`, undefined, this.localProxyFactory, () => this.scheduleSave());
            if (this.sessions[0]) this.controller.restore(this.sessions[0]);
        }
        webview.html = renderChatViewHtml({ nonce: randomBytes(16).toString('base64'),
            cspSource: webview.cspSource, sessionId: this.controller.currentSessionId, surface });
        disposables.push(webview.onDidReceiveMessage(raw => { void this.handleInbound(raw); }));
    }

    private scheduleSave(): void {
        if (this.disposed) return;
        if (this.saveTimer) {
            if (this.controller?.isBusy) return;
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.save(); }, this.controller?.isBusy ? 1000 : 0);
    }

    private capture(): void {
        if (!this.controller) return;
        const current = this.controller.snapshot();
        this.sessions = [current, ...this.sessions.filter(session => session.id !== current.id && session.transcript.length)]
            .slice(0, MAX_SAVED_CHATS);
    }

    private save(): void {
        this.capture();
        if (!this.storage) return;
        const value = { workspace: this.workspaceKey(), sessions: this.sessions };
        this.writes = this.writes.then(() => this.storage!.update(CHAT_STORAGE_KEY, value)).catch(() => {
            if (!this.storageWarningShown && !this.disposed) {
                this.storageWarningShown = true;
                void vscode.window.showWarningMessage('Tokonomics could not save chat history. This conversation is still available until VS Code closes.');
            }
        });
    }

    private async showHistory(): Promise<void> {
        if (!this.controller || this.controller.isBusy) return;
        this.capture();
        const items = this.sessions.filter(session => session.transcript.length).map(session => ({
            label: (session.transcript.find(row => row.role === 'user')?.text || 'Conversation').replace(/\s+/g, ' ').slice(0, 90),
            description: session.id === this.controller?.currentSessionId ? 'Current' : new Date(session.updatedAt).toLocaleString(),
            sessionId: session.id
        }));
        const sessionAtOpen = this.controller.currentSessionId;
        const choice = await vscode.window.showQuickPick([...items, { label: '$(trash) Delete all saved chats', description: '', sessionId: '__delete__' }],
            { placeHolder: 'Reopen a conversation saved locally in this workspace' });
        if (!choice || this.disposed || this.controller.isBusy || this.controller.currentSessionId !== sessionAtOpen) return;
        if (choice.sessionId === '__delete__') {
            const answer = await vscode.window.showWarningMessage('Delete all Tokonomics chats saved in this workspace?', { modal: true }, 'Delete');
            if (answer !== 'Delete' || this.disposed || this.controller.isBusy || this.controller.currentSessionId !== sessionAtOpen) return;
            this.sessions = [];
            this.controller.newSession(`chat_${randomUUID()}`);
        } else {
            const saved = this.sessions.find(session => session.id === choice.sessionId);
            if (!saved || saved.id === this.controller.currentSessionId) return;
            this.controller.restore(saved);
            this.controller.replay();
            await this.controller.showSubscriptionModels();
        }
        this.save();
    }

    private async handleInbound(raw: unknown): Promise<void> {
        const controller = this.controller;
        if (this.disposed || !controller) return;

        const validated = validateInboundMessage(raw, controller.currentSessionId);
        if (!validated.ok) {
            // Malformed, oversized, forged or stale messages are dropped silently. Reporting the
            // reason back to the view would hand an attacker an oracle for probing the schema.
            return;
        }

        const message = validated.message;
        switch (message.type) {
            case 'ready':
                controller.replay();
                // Do not enumerate models merely because VS Code restored the view. Auto remains
                // available, and discovery occurs only after an explicit Refresh or Send action.
                await controller.showSubscriptionModels();
                return;
            case 'openSidebar':
                await this.openSidebar();
                return;
            case 'openEditor':
                this.openEditor();
                return;
            case 'configureSubscription':
                await vscode.commands.executeCommand('tokenOptimizer.configureSubscriptionCli');
                return;
            case 'checkSubscription': {
                const sessionId = controller.currentSessionId;
                const token = new vscode.CancellationTokenSource();
                this.disposables.push({ dispose: () => { token.cancel(); token.dispose(); } });
                let message: string;
                try {
                    const selected = await resolveSubscriptionChoice(controller.getSelectedModelId());
                    message = selected ? await subscriptionDiagnostics(selected.provider, token.token)
                        : 'Select a Codex or Claude subscription model first.';
                } catch { message = 'Subscription check failed. Configure the CLI and retry.'; }
                finally { token.dispose(); }
                if (!this.disposed && controller.currentSessionId === sessionId) {
                    this.post({ type: 'notice', sessionId, message });
                }
                return;
            }
            case 'refreshModels':
                await controller.refreshModels();
                return;
            case 'selectModel':
                controller.selectModel(message.modelId);
                return;
            case 'submit':
                await controller.submit(message.requestId, message.prompt);
                return;
            case 'cancel':
                controller.cancel();
                return;
            case 'showHistory':
                await this.showHistory();
                return;
            case 'newSession':
                if (controller.isBusy) return;
                this.capture();
                controller.newSession(`chat_${randomUUID()}`);
                this.save();
                return;
            case 'openDashboard':
                await vscode.commands.executeCommand('tokenOptimizer.showDashboard');
                return;
            case 'openTrace':
                await vscode.commands.executeCommand('tokenOptimizer.explainTrace');
                return;
            default:
                return;
        }
    }

    /** Reveals the view, creating it if the container has not been opened yet. */
    public static async focus(): Promise<void> {
        await vscode.commands.executeCommand(`${TOKONOMICS_CHAT_VIEW_ID}.focus`);
    }

    private releaseView(): void {
        for (const disposable of this.viewDisposables.splice(0)) {
            try { disposable.dispose(); } catch { /* disposal must never throw */ }
        }
        // View lifetime is shorter than a conversation's. Keep the controller and request alive.
        this.view = undefined;
    }

    public dispose(): void {
        if (this.disposed) return;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.save();
        this.disposed = true;
        this.releaseView();
        for (const disposable of this.editorDisposables.splice(0)) disposable.dispose();
        this.editorPanel?.dispose();
        this.editorPanel = undefined;
        for (const disposable of this.disposables.splice(0)) disposable.dispose();
        this.controller?.dispose();
        this.controller = undefined;
    }
}
