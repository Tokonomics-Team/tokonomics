/**
 * Phase 2 Unit Tests: Syntactic Workspace Graph & SCIP Indexer
 */

import { ScipIndexer } from '../src/workspace/scipIndexer';
import { WorkspaceGraph, GraphNode } from '../src/workspace/workspaceGraph';

export function runWorkspaceGraphTests(): boolean {
    console.log('\n--- Running Phase 2 Syntactic Workspace Graph & SCIP Tests ---');

    // 1. Test SCIP Indexer
    const scip = new ScipIndexer();

    scip.registerSymbol({
        symbol: 'npm @tokonomics/core 1.0.0 src/auth/AuthService#login().',
        kind: 'method',
        filePath: 'src/auth/AuthService.ts',
        line: 25,
        signature: 'public async login(user: string, pass: string): Promise<Session>;',
        docstring: '/** Authenticates user with credentials */',
        relationships: []
    });

    scip.registerOccurrence({
        symbol: 'npm @tokonomics/core 1.0.0 src/auth/AuthService#login().',
        filePath: 'src/controllers/loginController.ts',
        line: 14,
        character: 18,
        role: 'reference'
    });

    const def = scip.findDefinition('AuthService#login()');
    const refs = scip.findReferences('AuthService#login()');

    if (!def || def.filePath !== 'src/auth/AuthService.ts') {
        throw new Error(`SCIP failed to find definition (Got: ${JSON.stringify(def)})`);
    }

    if (refs.length !== 1 || refs[0].filePath !== 'src/controllers/loginController.ts') {
        throw new Error(`SCIP failed to resolve cross-file reference (Got: ${JSON.stringify(refs)})`);
    }

    console.log(`[SCIP Indexer] Indexed ${scip.getSymbolCount()} symbols, resolved cross-file ref in ${refs[0].filePath}`);
    console.log('✓ SCIP Indexer definition-reference linkage verified.');

    // 2. Test Syntactic Workspace Graph
    const graph = new WorkspaceGraph(scip);

    const authNode: GraphNode = {
        id: 'src/auth.ts:AuthService',
        symbolName: 'AuthService',
        filePath: 'src/auth.ts',
        kind: 'class',
        signature: 'export class AuthService',
        line: 10
    };

    const dbNode: GraphNode = {
        id: 'src/db.ts:DatabasePool',
        symbolName: 'DatabasePool',
        filePath: 'src/db.ts',
        kind: 'class',
        signature: 'export class DatabasePool',
        line: 5
    };

    const controllerNode: GraphNode = {
        id: 'src/controller.ts:AuthController',
        symbolName: 'AuthController',
        filePath: 'src/controller.ts',
        kind: 'class',
        signature: 'export class AuthController',
        line: 12
    };

    graph.addNode(authNode);
    graph.addNode(dbNode);
    graph.addNode(controllerNode);

    // Controller calls Auth, Auth calls DB
    graph.addEdge(controllerNode.id, authNode.id, 'calls');
    graph.addEdge(authNode.id, dbNode.id, 'calls');

    const startTime = performance.now();
    const neighborhood = graph.getConnectedNeighborhood(authNode.id, 2);
    const hierarchy = graph.getCallHierarchy(authNode.id);
    const durationMs = performance.now() - startTime;

    if (neighborhood.length !== 3) {
        throw new Error(`Neighborhood traversal failed (Expected 3 nodes, got ${neighborhood.length})`);
    }

    if (hierarchy.callers.length !== 1 || hierarchy.callers[0].id !== controllerNode.id) {
        throw new Error(`Call hierarchy callers incorrect (Got: ${JSON.stringify(hierarchy.callers)})`);
    }

    if (hierarchy.callees.length !== 1 || hierarchy.callees[0].id !== dbNode.id) {
        throw new Error(`Call hierarchy callees incorrect (Got: ${JSON.stringify(hierarchy.callees)})`);
    }

    console.log(`[Workspace Graph] Connected neighborhood traversed in ${durationMs.toFixed(3)}ms (Nodes: ${graph.getNodeCount()})`);
    console.log(`[Workspace Graph] Call Hierarchy: ${hierarchy.callers[0].symbolName} ➔ ${authNode.symbolName} ➔ ${hierarchy.callees[0].symbolName}`);
    console.log('✓ Syntactic Workspace Graph verified.');

    return true;
}
