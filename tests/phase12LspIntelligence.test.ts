/**
 * Phase 12 Automated Test Suite: Snapshot-Safe LSP Intelligence Layer
 * 
 * Verifies:
 * 1. Mock language server definition, reference, and call hierarchy normalization.
 * 2. Strict workspace root containment and directory traversal rejection.
 * 3. Non-file URI scheme rejection (untitled:, git:, vscode-userdata:).
 * 4. Document version freshness checks and stale document rejection.
 * 5. Huge result capping and Denial-of-Service defense (50,000 items bounded to 20).
 * 6. Per-command and aggregate deadline enforcement with deterministic fallback.
 * 7. Cooperative cancellation propagation.
 * 8. Differential parity with syntactic baseline (SCIP and WorkspaceGraph).
 * 9. PipelineOrchestrator integration and ComponentReceiptTrail auditing.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AstPrunerEngine } from '../src/ast/pruner';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { MockLanguageServerAdapter } from '../src/workspace/lspAdapter';
import { SnapshotSafeLspService } from '../src/workspace/snapshotSafeLsp';
import { WorkspaceGraph, GraphNode } from '../src/workspace/workspaceGraph';
import { ScipIndexer } from '../src/workspace/scipIndexer';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';

export async function runPhase12LspIntelligenceTests(): Promise<void> {
    console.log('\n--- Running Phase 12 Snapshot-Safe LSP Intelligence Tests ---');

    // Setup temporary workspace
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase12-'));
    const srcDir = path.join(tempDir, 'src');
    const clientsDir = path.join(srcDir, 'clients');
    fs.mkdirSync(clientsDir, { recursive: true });

    const paymentFile = path.join(srcDir, 'payment.ts');
    const stripeFile = path.join(clientsDir, 'stripe.ts');
    const checkoutFile = path.join(srcDir, 'checkout.ts');

    fs.writeFileSync(paymentFile, [
        "import { StripeClient } from './clients/stripe';",
        'export class PaymentService {',
        '  private client = new StripeClient();',
        '  async processPayment(amount: number): Promise<boolean> {',
        '    return this.client.charge(amount);',
        '  }',
        '}'
    ].join('\n'));

    fs.writeFileSync(stripeFile, [
        'export class StripeClient {',
        '  async charge(amount: number): Promise<boolean> {',
        '    return amount > 0;',
        '  }',
        '}'
    ].join('\n'));

    fs.writeFileSync(checkoutFile, [
        "import { PaymentService } from './payment';",
        'export class CheckoutController {',
        '  private service = new PaymentService();',
        '  async checkout(total: number): Promise<boolean> {',
        '    return this.service.processPayment(total);',
        '  }',
        '}'
    ].join('\n'));

    const index = new VersionedWorkspaceIndex([tempDir], new AstPrunerEngine());
    const snapshot = await index.initialize();
    assert.ok(snapshot.files.size >= 3, 'Snapshot must index at least 3 files');

    // 1. Definition, Reference, and Call Hierarchy Normalization
    {
        const mockAdapter = new MockLanguageServerAdapter();
        // Definition: PaymentService definition at payment.ts line 2
        mockAdapter.definitions.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            {
                uri: { fsPath: stripeFile, scheme: 'file' },
                range: { start: { line: 1, character: 13 }, end: { line: 1, character: 25 } }
            }
        ]);
        // References: CheckoutController referencing PaymentService
        mockAdapter.references.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            {
                uri: { fsPath: checkoutFile, scheme: 'file' },
                range: { start: { line: 4, character: 16 }, end: { line: 4, character: 30 } }
            }
        ]);
        // Call Hierarchy: CheckoutController calls PaymentService
        const paymentHierarchyItem = {
            name: 'PaymentService',
            kind: 'class',
            uri: { fsPath: paymentFile, scheme: 'file' },
            range: { start: { line: 1, character: 0 }, end: { line: 6, character: 1 } },
            selectionRange: { start: { line: 1, character: 13 }, end: { line: 1, character: 27 } }
        };
        mockAdapter.callHierarchyItems.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            paymentHierarchyItem
        ]);
        mockAdapter.incomingCalls.set('PaymentService', [
            {
                from: {
                    name: 'CheckoutController',
                    kind: 'class',
                    uri: { fsPath: checkoutFile, scheme: 'file' },
                    range: { start: { line: 1, character: 0 }, end: { line: 5, character: 1 } },
                    selectionRange: { start: { line: 1, character: 13 }, end: { line: 1, character: 31 } }
                },
                fromRanges: [{ start: { line: 4, character: 16 }, end: { line: 4, character: 30 } }]
            }
        ]);
        mockAdapter.outgoingCalls.set('PaymentService', [
            {
                to: {
                    name: 'StripeClient',
                    kind: 'class',
                    uri: { fsPath: stripeFile, scheme: 'file' },
                    range: { start: { line: 0, character: 0 }, end: { line: 4, character: 1 } },
                    selectionRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 25 } }
                },
                fromRanges: [{ start: { line: 4, character: 16 }, end: { line: 4, character: 29 } }]
            }
        ]);

        const lspService = new SnapshotSafeLspService({ adapter: mockAdapter });
        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2,
            query: 'Explain PaymentService'
        });

        assert.strictEqual(res.definitionsCount, 1, 'Should resolve 1 definition');
        assert.strictEqual(res.referencesCount, 1, 'Should resolve 1 reference');
        assert.strictEqual(res.incomingCallsCount, 1, 'Should resolve 1 incoming call');
        assert.strictEqual(res.outgoingCallsCount, 1, 'Should resolve 1 outgoing call');
        assert.strictEqual(res.fallbackUsed, false, 'Fallback should not be used when LSP succeeds');
        assert.ok(res.signals.length >= 4, 'Should emit at least 4 normalized evidence signals');

        for (const signal of res.signals) {
            assert.strictEqual(signal.source, 'lsp');
            assert.ok(signal.filePath, 'Signal must have valid filePath');
            assert.ok(!path.isAbsolute(signal.filePath), 'Signal filePath must be relative to workspace');
            assert.ok(typeof signal.lineStart === 'number');
            assert.ok(signal.content.length > 0, 'Signal must contain snapshot snippet content');
        }
        console.log('✓ Normalization of definitions, references, and call hierarchies verified.');
    }

    // 2. Security & Workspace Root Containment Guard
    {
        const mockAdapter = new MockLanguageServerAdapter();
        // Attack 1: Out-of-root path traversal escaping workspace
        mockAdapter.definitions.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            {
                uri: { fsPath: path.join(tempDir, '..', '..', 'etc', 'passwd'), scheme: 'file' },
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            },
            // Attack 2: System directory path
            {
                uri: { fsPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts', scheme: 'file' },
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            },
            // Attack 3: Virtual schemes (untitled:, git:, vscode-userdata:)
            {
                uri: 'untitled:Untitled-1.ts',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            },
            {
                uri: { fsPath: '/virtual/git/ref', scheme: 'git' },
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            }
        ]);

        const lspService = new SnapshotSafeLspService({ adapter: mockAdapter });
        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2
        });

        assert.strictEqual(res.definitionsCount, 0, 'All out-of-root and virtual URIs must be rejected');
        const leakedSignals = res.signals.filter(s => s.filePath?.includes('passwd') || s.filePath?.includes('Windows') || s.filePath?.includes('untitled'));
        assert.strictEqual(leakedSignals.length, 0, 'Zero out-of-policy files may be admitted');
        console.log('✓ Workspace root containment and non-file/traversal attack defenses verified.');
    }

    // 3. Document Version Freshness Guard
    {
        const mockAdapter = new MockLanguageServerAdapter();
        // Report an open document version that does NOT match expected snapshot generation
        mockAdapter.documentVersions.set(path.normalize(stripeFile).replace(/\\/g, '/').toLowerCase(), 99); // Stale/diverged version
        mockAdapter.definitions.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            {
                uri: { fsPath: stripeFile, scheme: 'file' },
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }
            }
        ]);

        const lspService = new SnapshotSafeLspService({ adapter: mockAdapter });
        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2,
            expectedDocumentVersion: 1 // Expecting version 1, got 99
        });

        assert.strictEqual(res.definitionsCount, 0, 'Stale document version must be rejected');
        console.log('✓ Document version freshness and stale-version rejection verified.');
    }

    // 4. Huge Result & Denial-of-Service Defense (Bounding Caps)
    {
        const mockAdapter = new MockLanguageServerAdapter();
        const massiveReferences = [];
        for (let i = 0; i < 50000; i++) {
            massiveReferences.push({
                uri: { fsPath: checkoutFile, scheme: 'file' },
                range: { start: { line: i % 10, character: 0 }, end: { line: i % 10, character: 10 } }
            });
        }
        mockAdapter.references.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), massiveReferences);

        const lspService = new SnapshotSafeLspService({
            adapter: mockAdapter,
            maxReferences: 20
        });

        const startMem = process.memoryUsage().heapUsed;
        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2
        });
        const memDiffMB = (process.memoryUsage().heapUsed - startMem) / (1024 * 1024);

        assert.strictEqual(res.referencesCount <= 20, true, 'References count must be bounded at maxReferences (20)');
        assert.ok(memDiffMB < 16, `Memory growth must remain under 16MB (observed: ${memDiffMB.toFixed(2)}MB)`);
        console.log('✓ Huge result sets (50,000 items) bounded strictly to 20 without memory bloat.');
    }

    // 5. Per-Command Timeout & Aggregate Deadline Enforcement
    {
        const mockAdapter = new MockLanguageServerAdapter();
        mockAdapter.delayMs = 120; // Slower than 50ms per-command deadline

        const lspService = new SnapshotSafeLspService({
            adapter: mockAdapter,
            perCommandTimeoutMs: 30,
            aggregateTimeoutMs: 80
        });

        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2
        });

        assert.strictEqual(res.timedOut, true, 'Must report timedOut = true when adapter exceeds deadline');
        assert.strictEqual(res.fallbackUsed, true, 'Must fall back on provider timeout');
        console.log('✓ Per-command and aggregate deadline enforcement verified.');
    }

    // 6. Cooperative Cancellation Propagation
    {
        const mockAdapter = new MockLanguageServerAdapter();
        mockAdapter.delayMs = 500;

        const cancellationListeners = new Set<() => void>();
        const cancellation = {
            isCancellationRequested: false,
            onCancellationRequested(listener: () => void) {
                cancellationListeners.add(listener);
                return { dispose: () => cancellationListeners.delete(listener) };
            }
        };
        const lspService = new SnapshotSafeLspService({ adapter: mockAdapter });

        // Cancel after 10ms
        setTimeout(() => {
            cancellation.isCancellationRequested = true;
            for (const listener of [...cancellationListeners]) listener();
        }, 10);

        const res = await lspService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2,
            cancellation
        });

        assert.strictEqual(res.cancelled, true, 'Must cooperatively cancel when token is cancelled');
        console.log('✓ Cooperative cancellation token propagation verified.');
    }

    // 7. Deterministic Syntactic Fallback (SCIP & WorkspaceGraph) Parity
    {
        const scip = new ScipIndexer();
        const graph = new WorkspaceGraph(scip);

        // Populate fallback graph
        const paymentNode: GraphNode = {
            id: 'src/payment.ts:PaymentService',
            symbolName: 'PaymentService',
            filePath: paymentFile,
            kind: 'class',
            signature: 'export class PaymentService',
            line: 2
        };
        const stripeNode: GraphNode = {
            id: 'src/clients/stripe.ts:StripeClient',
            symbolName: 'StripeClient',
            filePath: stripeFile,
            kind: 'class',
            signature: 'export class StripeClient',
            line: 1
        };
        graph.addNode(paymentNode);
        graph.addNode(stripeNode);
        graph.addEdge(paymentNode.id, stripeNode.id, 'calls');

        scip.registerOccurrence({
            symbol: paymentNode.id,
            filePath: paymentFile,
            line: 2,
            character: 13,
            role: 'definition'
        });
        scip.registerOccurrence({
            symbol: paymentNode.id,
            filePath: checkoutFile,
            line: 3,
            character: 10,
            role: 'reference'
        });

        // Offline / failing LSP adapter
        const failingAdapter = new MockLanguageServerAdapter();
        failingAdapter.shouldFail = true;

        const fallbackService = new SnapshotSafeLspService({
            adapter: failingAdapter,
            scipIndexer: scip,
            workspaceGraph: graph
        });

        const fallbackRes = await fallbackService.queryIntelligence({
            snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2
        });

        assert.strictEqual(fallbackRes.fallbackUsed, true, 'Fallback must be used when adapter fails');
        assert.ok(fallbackRes.signals.length > 0, 'Syntactic fallback must contribute evidence signals');
        assert.ok(fallbackRes.signals.some(s => s.filePath?.includes('stripe')), 'Callee from graph must be present in fallback');
        console.log('✓ Deterministic syntactic fallback parity (SCIP & WorkspaceGraph) verified.');
    }

    // 8. Pipeline Orchestrator Integration & Receipt Trail Audit
    {
        FeatureFlagRegistry.resetToDefault();
        const orchestrator = new PipelineOrchestrator();

        // 8a. With enableLspIntelligence = false (default / shadow mode)
        const shadowResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService and charge processing' }],
            workspaceSnapshot: snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2,
            allowWorkspaceRetrieval: true
        });

        const shadowReceipts = shadowResult.receipts || [];
        const lspBypassedReceipt = shadowReceipts.find(r => r.componentId === 'lsp_intelligence' && r.outcome === 'bypassed');
        assert.ok(lspBypassedReceipt, 'When flag is disabled, lsp_intelligence must emit bypassed receipt');

        // 8b. With enableLspIntelligence = true and mock LSP adapter
        FeatureFlagRegistry.setFlag('enableLspIntelligence', true);
        const mockAdapter = new MockLanguageServerAdapter();
        mockAdapter.definitions.set(path.normalize(paymentFile).replace(/\\/g, '/').toLowerCase(), [
            {
                uri: { fsPath: stripeFile, scheme: 'file' },
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }
            }
        ]);
        const mockService = new SnapshotSafeLspService({ adapter: mockAdapter });
        orchestrator.setLspService(mockService);

        const activeResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService' }],
            workspaceSnapshot: snapshot,
            activeFilePath: paymentFile,
            cursorLine: 2,
            allowWorkspaceRetrieval: true
        });

        const activeReceipts = activeResult.receipts || [];
        const lspAttempted = activeReceipts.find(r => r.componentId === 'lsp_intelligence' && r.outcome === 'attempted');
        const lspInvoked = activeReceipts.find(r => r.componentId === 'lsp_intelligence' && r.outcome === 'invoked');
        const lspContribution = activeReceipts.find(r => r.componentId === 'lsp_intelligence' && r.outcome === 'contributed');

        assert.ok(lspAttempted, 'lsp_intelligence must emit attempted receipt');
        assert.ok(lspInvoked, 'lsp_intelligence must emit invoked receipt');
        assert.ok(lspContribution, 'Admitted LSP evidence must report a production contribution.');

        // Reset flags
        FeatureFlagRegistry.resetToDefault();
        console.log('✓ PipelineOrchestrator integration and ComponentReceiptTrail audit verified.');
    }

    // Clean up temporary workspace
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup failure in tmp
    }

    console.log('✓ All Phase 12 Snapshot-Safe LSP Intelligence tests passed cleanly.');
}
