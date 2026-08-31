/**
 * Phase 3 Unit Tests: LSP Intelligence Layer & Deterministic Fallback Cascades
 */

import { LspContextLayer } from '../src/workspace/lspContextLayer';
import { WorkspaceGraph, GraphNode } from '../src/workspace/workspaceGraph';
import { ScipIndexer } from '../src/workspace/scipIndexer';

export async function runLspContextTests(): Promise<boolean> {
    console.log('\n--- Running Phase 3 LSP Intelligence & Fallback Tests ---');

    const scip = new ScipIndexer();
    const graph = new WorkspaceGraph(scip);

    // Populate fallback SCIP & Graph nodes
    const paymentServiceNode: GraphNode = {
        id: 'src/services/payment.ts:PaymentService',
        symbolName: 'PaymentService',
        filePath: 'src/services/payment.ts',
        kind: 'class',
        signature: 'export class PaymentService',
        line: 15
    };

    const stripeClientNode: GraphNode = {
        id: 'src/clients/stripe.ts:StripeClient',
        symbolName: 'StripeClient',
        filePath: 'src/clients/stripe.ts',
        kind: 'class',
        signature: 'export class StripeClient',
        line: 8
    };

    graph.addNode(paymentServiceNode);
    graph.addNode(stripeClientNode);
    graph.addEdge(paymentServiceNode.id, stripeClientNode.id, 'calls');

    scip.registerOccurrence({
        symbol: paymentServiceNode.id,
        filePath: 'src/controllers/checkout.ts',
        line: 42,
        character: 10,
        role: 'reference'
    });

    const lspLayer = new LspContextLayer(graph, scip);

    // 1. Test Definition Fallback
    const defs = await lspLayer.getDefinitions('src/controllers/checkout.ts', 42, 10, 'PaymentService');
    if (defs.length !== 1 || defs[0].filePath !== 'src/services/payment.ts') {
        throw new Error(`LSP Definition query failed (Got: ${JSON.stringify(defs)})`);
    }
    console.log(`[LSP Layer] Resolved definition for PaymentService ➔ ${defs[0].filePath}:${defs[0].line}`);

    // 2. Test Reference Fallback
    const refs = await lspLayer.getReferences('src/services/payment.ts', 15, 0, paymentServiceNode.id);
    if (refs.length !== 1 || refs[0].filePath !== 'src/controllers/checkout.ts') {
        throw new Error(`LSP Reference query failed (Got: ${JSON.stringify(refs)})`);
    }
    console.log(`[LSP Layer] Resolved reference to PaymentService ➔ ${refs[0].filePath}:${refs[0].line}`);

    // 3. Test Call Hierarchy Fallback
    const hierarchy = await lspLayer.getCallHierarchy('src/services/payment.ts', 15, 0, paymentServiceNode.id);
    if (hierarchy.outgoing.length !== 1 || hierarchy.outgoing[0].symbolName !== 'StripeClient') {
        throw new Error(`LSP Call Hierarchy query failed (Got: ${JSON.stringify(hierarchy)})`);
    }
    console.log(`[LSP Layer] Call Hierarchy: PaymentService ➔ calls ➔ ${hierarchy.outgoing[0].symbolName}`);

    // 4. Test Failure Containment (Unknown symbol must return empty array without crashing)
    const unknown = await lspLayer.getDefinitions('unknown.ts', 0, 0, 'NonExistentSymbol');
    if (unknown.length !== 0) {
        throw new Error('Unknown symbol query should return empty array');
    }
    console.log('✓ LSP Failure containment & graceful fallback cascades verified.');

    return true;
}
