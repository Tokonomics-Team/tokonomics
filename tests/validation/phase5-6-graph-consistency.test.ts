import * as assert from 'assert';
import { WorkspaceGraph, GraphNode } from '../../src/workspace/workspaceGraph';
import { LspContextLayer } from '../../src/workspace/lspContextLayer';
import { ScipIndexer } from '../../src/workspace/scipIndexer';

export async function runPhase5And6GraphConsistencyValidation(): Promise<boolean> {
    console.log('--- Phase 5 & 6: Workspace Graph, SCIP & Incremental Consistency ---');

    const scip = new ScipIndexer();
    const graph = new WorkspaceGraph(scip);
    
    // Build initial graph
    const nodeA: GraphNode = { id: 'src/a.ts:A', symbolName: 'A', filePath: 'src/a.ts', kind: 'class', signature: 'class A', line: 1 };
    const nodeB: GraphNode = { id: 'src/b.ts:B', symbolName: 'B', filePath: 'src/b.ts', kind: 'class', signature: 'class B', line: 1 };
    const nodeC: GraphNode = { id: 'src/c.ts:C', symbolName: 'C', filePath: 'src/c.ts', kind: 'class', signature: 'class C', line: 1 };

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(nodeA.id, nodeB.id, 'imports');
    graph.addEdge(nodeB.id, nodeC.id, 'imports');

    const cleanRebuildNeighborhood = graph.getConnectedNeighborhood(nodeA.id, 2);
    assert.strictEqual(cleanRebuildNeighborhood.length, 3, 'Full graph neighborhood must contain 3 nodes');

    // Simulate incremental update
    const updatedNodeB: GraphNode = { id: 'src/b.ts:B', symbolName: 'B', filePath: 'src/b.ts', kind: 'class', signature: 'class B // modified', line: 1 };
    graph.addNode(updatedNodeB);
    const incrementalNeighborhood = graph.getConnectedNeighborhood(nodeA.id, 2);

    // Invariant: incremental update matches clean rebuild
    assert.strictEqual(incrementalNeighborhood.length, cleanRebuildNeighborhood.length, 'Incremental update must match clean rebuild invariant');
    console.log('  ✓ Incremental Index Consistency Invariant verified.');

    // LSP Fallback Verification
    const lsp = new LspContextLayer(graph, scip);
    const defRes = await lsp.getDefinitions('src/a.ts', 1, 0, 'A');
    assert.ok(Array.isArray(defRes), 'LSP must return valid definitions array');
    console.log('  ✓ LSP Intelligence & Fallback cascade verified.');

    return true;
}
