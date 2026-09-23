import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { WorkspaceSignalCoordinator } from '../src/workspace/signalCoordinator';
import { MockLanguageServerAdapter, LspPosition } from '../src/workspace/lspAdapter';
import { SnapshotSafeLspService } from '../src/workspace/snapshotSafeLsp';
import { ComponentRegistry } from '../src/engine/componentRegistry';

export async function runV7Phase7ProductionSignalTests(): Promise<boolean> {
    console.log('\n--- Running v7.0.1 Phase 7 production-signal tests ---');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-v7-p7-'));
    const file = path.join(root, 'service.ts');
    try {
        fs.writeFileSync(file, 'export function service() { return true; }\n');
        const index = new VersionedWorkspaceIndex([root]);
        await index.upsert(file, { text: 'export function service() { return true; }\n', version: 7 });
        const snapshot = index.captureSnapshot();
        const coordinator = new WorkspaceSignalCoordinator();
        const flags = { enableErrorIntelligence: true, enableTerminalOptimizer: true };

        const wrongGeneration = coordinator.coordinateSignals({ snapshot, flags, signals: {
            snapshotGeneration: snapshot.generation + 1, capturedAt: Date.now(),
            diagnostics: [{ filePath: file, line: 1, message: "Property 'missingMethod' does not exist on type 'Service'", severity: 'error',
                category: 'undefined_symbol', extractedSymbol: 'missingMethod', documentVersion: 7 }]
        } });
        assert.strictEqual(wrongGeneration.combinedSignals.length, 0);
        assert.strictEqual(wrongGeneration.discardedStaleCount, 1);

        const wrongDocument = coordinator.coordinateSignals({ snapshot, flags, signals: {
            snapshotGeneration: snapshot.generation, capturedAt: Date.now(),
            diagnostics: [{ filePath: file, line: 1, message: "Property 'missingMethod' does not exist on type 'Service'", severity: 'error',
                category: 'undefined_symbol', extractedSymbol: 'missingMethod', documentVersion: 6 }]
        } });
        assert.strictEqual(wrongDocument.errorSignals.length, 0, 'Document version must be checked independently of workspace generation');

        const currentDocument = coordinator.coordinateSignals({ snapshot, flags, signals: {
            snapshotGeneration: snapshot.generation, capturedAt: Date.now(),
            diagnostics: [{ filePath: file, line: 1, message: "Property 'missingMethod' does not exist on type 'Service'", severity: 'error',
                category: 'undefined_symbol', extractedSymbol: 'missingMethod', documentVersion: 7 }],
            terminalContext: { source: 'user_selection', rawText: 'Error: stale output', userConsented: true,
                capturedAt: Date.now() - 6 * 60 * 1000 }
        } });
        assert.ok(currentDocument.errorSignals.length > 0);
        assert.strictEqual(currentDocument.terminalSignals.length, 0, 'Expired terminal output must not become evidence');

        const adapter = new MockLanguageServerAdapter();
        let observedPosition: LspPosition | undefined;
        adapter.getDefinitions = async (_file, position) => { observedPosition = position; return []; };
        await new SnapshotSafeLspService({ adapter }).queryIntelligence({ snapshot, activeFilePath: file, cursorLine: 1, query: 'service' });
        assert.strictEqual(observedPosition?.line, 0, 'One-based index lines must normalize to zero-based LSP positions');

        for (const id of ['lsp_intelligence', 'delta_context', 'error_intelligence', 'test_graph', 'git_graph',
            'terminal_optimizer', 'source_provenance'] as const) {
            assert.strictEqual(ComponentRegistry.definition(id).integrationState, 'conditional');
        }
        index.dispose();
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log('Independent freshness, terminal expiry, LSP coordinates, and production capability states passed.');
    return true;
}
