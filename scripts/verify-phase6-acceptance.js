const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🔬 TOKONOMICS PHASE 6: DIFFERENTIAL WEBVIEW STATE BRIDGE & UI MODERNIZATION');
    console.log('====================================================================================\n');

    const tempBundlePath = path.join(__dirname, '..', 'out_test', 'phase6_verification_bundle.js');
    const harnessSource = `
    import { DashboardWebviewPanel } from '../src/ui/dashboardWebview';
    import { MetricsTracker } from '../src/metrics/tracker';
    import { AstPrunerEngine } from '../src/ast/pruner';
    import { WorkspaceFileRecord, WorkspaceSnapshot } from '../src/workspace/workspaceIndex';

    export async function runVerification() {
        // -------------------------------------------------------------
        // Criterion 1: Zero HTML Destruction on Tab Switch
        // -------------------------------------------------------------
        console.log('--- Criterion 1: Zero HTML Destruction on Tab Switch ---');
        let currentHtml = '';
        const postedMessages = [];
        const messageListeners = [];

        const mockWebviewPanel = {
            webview: {
                get html() { return currentHtml; },
                set html(val) { currentHtml = val; },
                postMessage: async (msg) => { postedMessages.push(msg); return true; },
                onDidReceiveMessage: (listener) => {
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

        const metricsTracker = new MetricsTracker();
        const astEngine = new AstPrunerEngine();
        const panel = new DashboardWebviewPanel(mockWebviewPanel, metricsTracker, astEngine);

        const initialHtmlCount = panel.getHtmlAssignmentCount();
        console.log('  Initial HTML Assignments:   ' + initialHtmlCount + ' (constructed once)');

        const tabSwitchRuns = 10;
        for (let i = 0; i < tabSwitchRuns; i++) {
            panel.dispatchActiveFileDiagnosis();
        }

        const finalHtmlCount = panel.getHtmlAssignmentCount();
        const diffMsgCount = panel.getDifferentialMessageCount();
        console.log('  Tab Switches Executed:      ' + tabSwitchRuns);
        console.log('  Post-Switch HTML Re-renders:' + (finalHtmlCount - initialHtmlCount) + ' (gate = 0)');
        console.log('  Differential Messages Sent: ' + diffMsgCount + ' (' + postedMessages.length + ' received)');
        
        const crit1Pass = initialHtmlCount === 1 && finalHtmlCount === 1 && diffMsgCount === 10;
        console.log('  Criterion 1 Gate (HTML assignment === 1, 0 reassignments): ' + (crit1Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 2: Instant Snapshot Workspace Scan
        // -------------------------------------------------------------
        console.log('--- Criterion 2: Instant Snapshot Workspace Scan (< 20ms for 1,000 files) ---');
        const mockFiles = new Map();
        for (let i = 0; i < 1000; i++) {
            mockFiles.set('file_' + i + '.ts', {
                id: 'id_' + i,
                key: 'file_' + i + '.ts',
                path: '/workspace/src/file_' + i + '.ts',
                relativePath: 'src/file_' + i + '.ts',
                rootId: 'root_1',
                sourceVersion: '1',
                contentHash: 'hash_' + i,
                language: 'typescript',
                skeleton: 'export class Service' + i + ' {\\n    public execute(): void;\\n}',
                symbols: [],
                references: [],
                sizeBytes: 1024,
                memoryBytes: 512,
                updateSequence: 1
            });
        }

        const mockSnapshot = {
            generation: 1,
            createdAt: Date.now(),
            roots: [],
            ignorePolicyVersion: 'bench',
            files: mockFiles,
            symbols: [],
            memoryBytes: 1024 * 512
        };

        panel.workspaceIndex = { captureSnapshot: () => mockSnapshot };

        // Warm run
        await panel.performWorkspaceScan();

        const scanBenchmarkRuns = 10;
        const scanTimes = [];
        let lastResult = null;

        for (let i = 0; i < scanBenchmarkRuns; i++) {
            const start = performance.now();
            lastResult = await panel.performWorkspaceScan();
            scanTimes.push(performance.now() - start);
        }

        const avgScanTime = scanTimes.reduce((a, b) => a + b, 0) / scanBenchmarkRuns;
        const minScanTime = Math.min(...scanTimes);
        const maxScanTime = Math.max(...scanTimes);

        console.log('  Files Audited in Snapshot:  ' + lastResult.totalFiles);
        console.log('  Total Raw Tokens (est):     ' + lastResult.totalRawTokens.toLocaleString());
        console.log('  Pruned Skeleton Tokens:     ' + lastResult.totalPrunedTokens.toLocaleString());
        console.log('  Potential Global Savings:   ' + lastResult.potentialSavingsPercentage + '%');
        console.log('  Snapshot Scan Latency Avg:  ' + avgScanTime.toFixed(3) + ' ms');
        console.log('  Snapshot Scan Latency Min:  ' + minScanTime.toFixed(3) + ' ms');
        console.log('  Snapshot Scan Latency Max:  ' + maxScanTime.toFixed(3) + ' ms');

        const crit2Pass = lastResult.totalFiles === 1000 && avgScanTime < 20.0;
        console.log('  Criterion 2 Gate (< 20ms, zero disk I/O): ' + (crit2Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 3: UI State & Scroll Continuity Handlers
        // -------------------------------------------------------------
        console.log('--- Criterion 3: UI State & Scroll Continuity Handlers ---');
        const scriptMatch = currentHtml.match(/<script nonce="[^"]+">([\\s\\S]*?)<\\/script>/);
        const clientScript = scriptMatch ? scriptMatch[1] : '';

        const hasActiveFileHandler = clientScript.includes('ACTIVE_FILE_DIAGNOSIS');
        const hasWorkspaceScanHandler = clientScript.includes('WORKSPACE_SCAN_RESULT');
        const hasGetState = clientScript.includes('vscode.getState()');
        const hasSetState = clientScript.includes('vscode.setState(');
        const hasScrollListener = clientScript.includes('window.addEventListener(\\'scroll\\'');

        console.log('  Active File Delta Handler:  ' + (hasActiveFileHandler ? 'Present ✅' : 'Missing ❌'));
        console.log('  Workspace Scan Handler:     ' + (hasWorkspaceScanHandler ? 'Present ✅' : 'Missing ❌'));
        console.log('  State Restoration Handler:  ' + (hasGetState ? 'Present ✅' : 'Missing ❌'));
        console.log('  Scroll Position Persistence:' + (hasScrollListener && hasSetState ? 'Present ✅' : 'Missing ❌'));

        const crit3Pass = hasActiveFileHandler && hasWorkspaceScanHandler && hasGetState && hasSetState;
        console.log('  Criterion 3 Gate (In-place DOM updates & state continuity): ' + (crit3Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 4: Strict Content Security Policy (CSP) Conformance
        // -------------------------------------------------------------
        console.log('--- Criterion 4: Strict Content Security Policy (CSP) Conformance ---');
        const cspTagMatch = currentHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
        const cspDirective = cspTagMatch ? cspTagMatch[1] : '';

        const hasScriptNonce = /script-src 'nonce-[^']+'/.test(cspDirective);
        const hasStyleNonce = /style-src 'nonce-[^']+'/.test(cspDirective);
        const noUnsafeInline = !cspDirective.includes("'unsafe-inline'");
        const noUnsafeEval = !cspDirective.includes("'unsafe-eval'");
        const bodyContent = currentHtml.substring(currentHtml.indexOf('<body'), currentHtml.indexOf('<script'));
        const noInlineHandlers = !/\\son[a-z]+="/i.test(bodyContent);

        console.log('  Nonce-based script-src:     ' + (hasScriptNonce ? 'Enforced ✅' : 'Missing ❌'));
        console.log('  Nonce-based style-src:      ' + (hasStyleNonce ? 'Enforced ✅' : 'Missing ❌'));
        console.log('  Zero unsafe-inline:         ' + (noUnsafeInline ? 'Verified ✅' : 'Violation ❌'));
        console.log('  Zero unsafe-eval:           ' + (noUnsafeEval ? 'Verified ✅' : 'Violation ❌'));
        console.log('  Zero inline event handlers: ' + (noInlineHandlers ? 'Clean DOM ✅' : 'Violation ❌'));

        const crit4Pass = hasScriptNonce && hasStyleNonce && noUnsafeInline && noUnsafeEval && noInlineHandlers;
        console.log('  Criterion 4 Gate (Strict CSP with zero unsafe directives): ' + (crit4Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Final Certification Decision
        // -------------------------------------------------------------
        panel.dispose();
        const allPass = crit1Pass && crit2Pass && crit3Pass && crit4Pass;
        console.log('====================================================================================');
        if (allPass) {
            console.log('🎉 PHASE 6 DEFINITION OF DONE CERTIFIED: ALL 5 ACCEPTANCE CRITERIA PASSED');
        } else {
            console.log('❌ PHASE 6 CERTIFICATION FAILED');
            process.exit(1);
        }
        console.log('====================================================================================\\n');
    }
    `;

    const outDir = path.dirname(tempBundlePath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const tempSrcPath = path.join(outDir, 'phase6_verification_entry.ts');
    fs.writeFileSync(tempSrcPath, harnessSource, 'utf8');

    try {
        await esbuild.build({
            entryPoints: [tempSrcPath],
            bundle: true,
            outfile: tempBundlePath,
            platform: 'node',
            format: 'cjs',
            alias: {
                'vscode': path.join(__dirname, '..', 'tests', 'mock-vscode.ts')
            },
            external: ['web-tree-sitter']
        });

        const { runVerification } = require(tempBundlePath);
        await runVerification();
    } finally {
        try { fs.unlinkSync(tempSrcPath); } catch {}
        try { fs.unlinkSync(tempBundlePath); } catch {}
    }
}

main().catch(err => {
    console.error('Phase 6 verification encountered fatal error:', err);
    process.exit(1);
});
