import * as assert from 'assert';
import { DashboardWebviewPanel } from '../src/ui/dashboardWebview';
import { MetricsTracker } from '../src/metrics/tracker';
import { AstPrunerEngine } from '../src/ast/pruner';
import { OptimizationEventBus, PromptOptimizationEvent } from '../src/events/optimizationEvent';

export async function runDashboardLiveUpdateTests(): Promise<boolean> {
    console.log('\n--- Running Dashboard Live Update & Visual Contract Tests ---');

    const messages: any[] = [];
    const messageListeners: Function[] = [];
    let html = '';
    const mockPanel: any = {
        webview: {
            get html() { return html; },
            set html(value: string) { html = value; },
            postMessage: async (message: any) => { messages.push(message); return true; },
            onDidReceiveMessage: (listener: Function) => {
                messageListeners.push(listener);
                return { dispose: () => undefined };
            }
        },
        visible: true,
        reveal: () => undefined,
        dispose: () => undefined,
        onDidDispose: () => ({ dispose: () => undefined })
    };

    const panel = new (DashboardWebviewPanel as any)(mockPanel, new MetricsTracker(), new AstPrunerEngine());
    assert.match(html, /DASHBOARD_READY/, 'The webview must handshake after installing its message listener');
    assert.match(html, /id="stageWaterfall"/, 'The stage waterfall must have a live update target');
    assert.match(html, /id="requestCostEvidence"/, 'Cost evidence must have a live update target');
    assert.match(html, /--vscode-editor-background/, 'Dashboard colors must follow the active VS Code theme');
    assert.match(html, /@media \(max-width: 860px\)/, 'Dashboard layout must adapt to narrow editor columns');
    assert.match(html, /pairs\.length === 1/, 'The first prompt must render a visible chart mark');
    assert.match(html, /aria-live="polite"/, 'Live metrics must be announced without interrupting the user');
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, 'The dashboard must contain its nonce-protected client script');
    assert.doesNotThrow(() => new Function(script!), 'The generated dashboard client script must be valid JavaScript');

    messages.length = 0;
    for (const listener of messageListeners) listener({ action: 'DASHBOARD_READY' });
    assert.ok(messages.some(message => message.type === 'INIT_STATE'),
        'A ready dashboard must receive an authoritative initial state');

    for (const listener of messageListeners) listener({ action: 'CHANGE_TIME_WINDOW', window: 'today' });
    panel.updateContent();
    assert.match(html, /class="window-btn active" data-window="today" aria-pressed="true"/,
        'A document refresh must preserve the selected metrics time window');

    const emitted: PromptOptimizationEvent = {
        id: `dashboard-live-${Date.now()}`,
        timestamp: Date.now(),
        sessionId: 'dashboard-live-session',
        state: 'OPTIMIZATION_COMPLETED',
        taskType: 'debug',
        taskConfidence: 0.94,
        provider: 'test-provider',
        model: 'test-model',
        rawInputTokens: 1200,
        optimizedInputTokens: 480,
        savedTokens: 720,
        reductionPercentage: 60,
        cacheableTokens: 0,
        projectedRawCostUSD: 0.012,
        projectedOptimizedCostUSD: 0.0048,
        projectedSavingsUSD: 0.0072,
        isCostReconciled: false,
        costStatus: 'projected',
        predictedCQ: 93,
        evidenceCoverage: 0.95,
        sliceConfidence: 0.97,
        cqRating: 'EXCELLENT',
        totalOptimizationLatencyMs: 8,
        stageMetrics: [{ stageName: 'Context preparation', tokensBefore: 1200, tokensAfter: 480, tokensSaved: 720, latencyMs: 8 }],
        contextItemCount: 3,
        traceId: 'dashboard-live-trace'
    };

    messages.length = 0;
    const htmlBeforePrompt = html;
    OptimizationEventBus.getInstance().emit(emitted);
    await new Promise<void>(resolve => setImmediate(resolve));

    assert.ok(messages.some(message => message.type === 'EVENT' && message.payload.id === emitted.id),
        'Each prompt event must be pushed to the open dashboard');
    assert.ok(messages.some(message => message.type === 'SUMMARY_UPDATE' && message.payload.totalPrompts >= 1),
        'Each prompt event must refresh the aggregate summary');
    assert.strictEqual(html, htmlBeforePrompt,
        'A live prompt update must not replace the document and reset focus, scroll, or time-window state');

    panel.dispose();
    console.log('Dashboard handshake, per-prompt refresh, live sections, theme, and accessibility contracts passed.');
    return true;
}
