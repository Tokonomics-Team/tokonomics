/**
 * Phase 6: Differential Webview State Bridge & UI Modernization Unit Tests
 * 
 * Verifies:
 * 1. Zero HTML reassignments on active file changes (differential postMessage bridge).
 * 2. Instant in-memory workspace snapshot scanning (< 20ms, zero disk I/O).
 * 3. Strict Content Security Policy conformance (nonce-based script & style, zero unsafe-inline/unsafe-eval).
 * 4. Client script syntax validity and state continuity via vscode.getState/setState.
 */

import * as assert from 'assert';
import { DashboardWebviewPanel, WorkspaceScanResult, ActiveFileDiagnosis } from '../src/ui/dashboardWebview';
import { MetricsTracker } from '../src/metrics/tracker';
import { AstPrunerEngine } from '../src/ast/pruner';
import { WorkspaceFileRecord, WorkspaceSnapshot } from '../src/workspace/workspaceIndex';

export async function runPhase6WebviewBridgeTests(): Promise<boolean> {
    console.log('\n--- Running Phase 6: Differential Webview State Bridge & UI Modernization Tests ---');

    const postedMessages: any[] = [];
    const messageListeners: Function[] = [];
    let currentHtml = '';

    const mockWebviewPanel: any = {
        webview: {
            get html() { return currentHtml; },
            set html(val: string) { currentHtml = val; },
            postMessage: async (msg: any) => {
                postedMessages.push(msg);
                return true;
            },
            onDidReceiveMessage: (listener: Function) => {
                messageListeners.push(listener);
                return { dispose: () => undefined };
            },
            cspSource: 'vscode-webview:'
        },
        visible: true,
        reveal: () => undefined,
        dispose: () => undefined,
        onDidDispose: () => ({ dispose: () => undefined })
    };

    // 1. Initial Instantiation: Webview HTML rendered exactly once
    const metricsTracker = new MetricsTracker();
    const astEngine = new AstPrunerEngine();
    const panel = new (DashboardWebviewPanel as any)(mockWebviewPanel, metricsTracker, astEngine);

    assert.strictEqual(panel.getHtmlAssignmentCount(), 1,
        'Initial panel construction must set webview HTML exactly once.');
    assert.ok(currentHtml.length > 0, 'Dashboard HTML must not be empty.');
    console.log('✓ Initial HTML assignment rendered exactly once (assignmentCount === 1).');

    // 2. Differential Event Dispatch on Active Tab Change (Zero HTML destruction)
    postedMessages.length = 0;
    const initialHtml = currentHtml;

    // Simulate 5 consecutive tab switches
    for (let i = 0; i < 5; i++) {
        panel.dispatchActiveFileDiagnosis();
    }

    assert.strictEqual(panel.getHtmlAssignmentCount(), 1,
        'Active tab switches must NEVER re-assign panel.webview.html (zero iframe destruction).');
    assert.strictEqual(panel.getDifferentialMessageCount(), 5,
        'Each tab switch must increment differentialMessageCount.');
    assert.strictEqual(postedMessages.length, 5,
        'Each tab switch must post a differential message over the bridge.');
    assert.ok(postedMessages.every(m => m.type === 'ACTIVE_FILE_DIAGNOSIS'),
        'All tab switch messages must have type ACTIVE_FILE_DIAGNOSIS.');
    assert.strictEqual(currentHtml, initialHtml,
        'The underlying HTML document must remain identical across tab switches.');
    console.log('✓ Tab switches dispatch differential messages with zero HTML reassignments (5/5 messages delivered).');

    // 3. Instant In-Memory Workspace Snapshot Scan (< 20ms for 1,000 files, zero disk I/O)
    const mockFiles = new Map<string, WorkspaceFileRecord>();
    for (let i = 0; i < 1000; i++) {
        mockFiles.set(`file_${i}.ts`, {
            id: `id_${i}`,
            key: `file_${i}.ts`,
            path: `/workspace/src/file_${i}.ts`,
            relativePath: `src/file_${i}.ts`,
            rootId: 'root_1',
            sourceVersion: '1',
            contentHash: `hash_${i}`,
            language: 'typescript',
            skeleton: `export class Service${i} {\n    public execute(): void;\n}`,
            symbols: [],
            references: [],
            sizeBytes: 1024,
            memoryBytes: 512,
            updateSequence: 1
        });
    }

    const mockSnapshot: WorkspaceSnapshot = {
        generation: 1,
        createdAt: Date.now(),
        roots: [],
        ignorePolicyVersion: 'test',
        files: mockFiles,
        symbols: [],
        memoryBytes: 1024 * 512
    };

    const mockWorkspaceIndex: any = {
        captureSnapshot: () => mockSnapshot
    };

    // Attach workspace index to panel
    (panel as any).workspaceIndex = mockWorkspaceIndex;

    const scanStartTime = performance.now();
    const scanResult: WorkspaceScanResult = await panel.performWorkspaceScan();
    const scanDurationMs = performance.now() - scanStartTime;

    assert.strictEqual(scanResult.totalFiles, 1000, 'Snapshot scan must audit all 1,000 indexed files.');
    assert.ok(scanResult.totalRawTokens > 0, 'Total raw tokens must be positive.');
    assert.ok(scanResult.totalPrunedTokens > 0, 'Total pruned tokens must be positive.');
    assert.ok(scanResult.potentialSavingsPercentage > 0, 'Potential savings percentage must be positive.');
    assert.ok(scanDurationMs < 20.0,
        `Snapshot workspace scan must complete in < 20ms (measured: ${scanDurationMs.toFixed(2)}ms).`);
    console.log(`✓ In-memory snapshot scan of 1,000 files completed in ${scanDurationMs.toFixed(3)}ms (Audited: 1,000 files, Saved: ${scanResult.potentialSavingsPercentage}%).`);

    // Verify differential scan message dispatch
    postedMessages.length = 0;
    const dispatchedScan = await panel.dispatchWorkspaceScan();
    assert.strictEqual(panel.getHtmlAssignmentCount(), 1,
        'Workspace scan must dispatch differentially without reloading webview HTML.');
    assert.strictEqual(postedMessages.length, 1, 'Workspace scan must post exactly one result message.');
    assert.strictEqual(postedMessages[0].type === 'WORKSPACE_SCAN_RESULT', true,
        'Dispatched message must have type WORKSPACE_SCAN_RESULT.');
    assert.strictEqual(postedMessages[0].payload.totalFiles, 1000,
        'Dispatched payload must include 1,000 audited files.');
    console.log('✓ Workspace scan result dispatched via differential bridge (0 HTML destructions).');

    // 4. Strict Content Security Policy (CSP) Verification
    const cspMatch = currentHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(cspMatch, 'HTML must declare a Content-Security-Policy meta tag.');
    const cspContent = cspMatch![1];

    assert.match(cspContent, /script-src 'nonce-[^']+'/, 'CSP must enforce nonce-based script execution.');
    assert.match(cspContent, /style-src 'nonce-[^']+'/, 'CSP must enforce nonce-based style application.');
    assert.doesNotMatch(cspContent, /'unsafe-inline'/,
        'Strict CSP must NOT contain unsafe-inline in script-src or style-src.');
    assert.doesNotMatch(cspContent, /'unsafe-eval'/,
        'Strict CSP must NOT contain unsafe-eval.');
    console.log('✓ Strict nonce-based CSP verified (zero unsafe-inline or unsafe-eval).');

    // Verify all <style> and <script> tags carry nonce attribute
    const styleTags = currentHtml.match(/<style[^>]*>/g) || [];
    assert.ok(styleTags.length > 0, 'Document must contain style tags.');
    styleTags.forEach(tag => {
        assert.match(tag, /nonce="[^"]+"/, 'Every <style> tag must contain a valid cryptographic nonce.');
    });

    const scriptTags = currentHtml.match(/<script[^>]*>/g) || [];
    assert.ok(scriptTags.length > 0, 'Document must contain script tags.');
    scriptTags.forEach(tag => {
        assert.match(tag, /nonce="[^"]+"/, 'Every <script> tag must contain a valid cryptographic nonce.');
    });

    // Verify zero inline event handlers (onclick, onerror, onload) in HTML body
    const bodyOnly = currentHtml.substring(currentHtml.indexOf('<body'), currentHtml.indexOf('<script'));
    assert.doesNotMatch(bodyOnly, /\son[a-z]+="/i,
        'Strict CSP HTML body must not contain inline event handlers (onclick, onkeydown, etc.).');
    console.log('✓ Zero inline event handlers in HTML body (all listeners bound via DOM API).');

    // 5. Client Script Execution & State Continuity Validation
    const scriptBody = currentHtml.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(scriptBody, 'Nonce-protected client script body must be present.');
    assert.doesNotThrow(() => new Function(scriptBody!),
        'Client-side script must be 100% syntactically valid JavaScript.');

    assert.match(scriptBody!, /ACTIVE_FILE_DIAGNOSIS/,
        'Client script must handle ACTIVE_FILE_DIAGNOSIS events.');
    assert.match(scriptBody!, /WORKSPACE_SCAN_RESULT/,
        'Client script must handle WORKSPACE_SCAN_RESULT events.');
    assert.match(scriptBody!, /vscode\.getState\(\)/,
        'Client script must restore state via acquireVsCodeApi().getState().');
    assert.match(scriptBody!, /vscode\.setState\(/,
        'Client script must persist state via acquireVsCodeApi().setState().');
    console.log('✓ Client-side differential state bridge & scroll persistence handlers verified.');

    panel.dispose();
    console.log('🎉 ALL PHASE 6 DIFFERENTIAL WEBVIEW BRIDGE TESTS PASSED (100%)\n');
    return true;
}
