/**
 * Tokonomics Syntactic Workspace Graph Engine
 * Directed multi-graph linking symbols across files with typed relationships (calls, extends, implements, imports).
 */

import { ScipIndexer, ScipSymbolInformation } from './scipIndexer';

export type GraphEdgeType = 'calls' | 'extends' | 'implements' | 'imports' | 'references';

export interface GraphNode {
    id: string; // e.g. "src/auth.ts:AuthService#login()"
    symbolName: string;
    filePath: string;
    kind: 'class' | 'interface' | 'function' | 'method' | 'type' | 'enum' | 'struct';
    signature: string;
    line: number;
    docstring?: string;
}

export interface GraphEdge {
    fromId: string;
    toId: string;
    type: GraphEdgeType;
    weight: number;
}

export class WorkspaceGraph {
    private nodes: Map<string, GraphNode> = new Map();
    private outgoingEdges: Map<string, GraphEdge[]> = new Map();
    private incomingEdges: Map<string, GraphEdge[]> = new Map();
    private scipIndexer: ScipIndexer;

    constructor(scipIndexer?: ScipIndexer) {
        this.scipIndexer = scipIndexer || new ScipIndexer();
    }

    public getScipIndexer(): ScipIndexer {
        return this.scipIndexer;
    }

    public addNode(node: GraphNode): void {
        this.nodes.set(node.id, node);
        if (!this.outgoingEdges.has(node.id)) this.outgoingEdges.set(node.id, []);
        if (!this.incomingEdges.has(node.id)) this.incomingEdges.set(node.id, []);

        // Also register in SCIP indexer
        this.scipIndexer.registerSymbol({
            symbol: node.id,
            kind: node.kind,
            filePath: node.filePath,
            line: node.line,
            signature: node.signature,
            docstring: node.docstring,
            relationships: []
        });
    }

    public addEdge(fromId: string, toId: string, type: GraphEdgeType, weight: number = 1.0): void {
        if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
            return;
        }

        const edge: GraphEdge = { fromId, toId, type, weight };

        if (!this.outgoingEdges.has(fromId)) this.outgoingEdges.set(fromId, []);
        this.outgoingEdges.get(fromId)!.push(edge);

        if (!this.incomingEdges.has(toId)) this.incomingEdges.set(toId, []);
        this.incomingEdges.get(toId)!.push(edge);
    }

    public getNode(id: string): GraphNode | undefined {
        return this.nodes.get(id);
    }

    /**
     * Traverses the graph to return the connected neighborhood of a focal symbol
     */
    public getConnectedNeighborhood(symbolId: string, maxDepth: number = 2): GraphNode[] {
        const visited = new Set<string>();
        const queue: { id: string; depth: number }[] = [{ id: symbolId, depth: 0 }];
        const results: GraphNode[] = [];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current.id) || current.depth > maxDepth) {
                continue;
            }
            visited.add(current.id);

            const node = this.nodes.get(current.id);
            if (node) {
                results.push(node);
            }

            // Expand outgoing and incoming edges
            const outgoing = this.outgoingEdges.get(current.id) || [];
            for (const edge of outgoing) {
                if (!visited.has(edge.toId)) {
                    queue.push({ id: edge.toId, depth: current.depth + 1 });
                }
            }

            const incoming = this.incomingEdges.get(current.id) || [];
            for (const edge of incoming) {
                if (!visited.has(edge.fromId)) {
                    queue.push({ id: edge.fromId, depth: current.depth + 1 });
                }
            }
        }

        return results;
    }

    /**
     * Returns upstream callers and downstream callees for a symbol
     */
    public getCallHierarchy(symbolId: string): { callers: GraphNode[]; callees: GraphNode[] } {
        const callers: GraphNode[] = [];
        const callees: GraphNode[] = [];

        // Callers (incoming 'calls' edges)
        const incoming = this.incomingEdges.get(symbolId) || [];
        for (const edge of incoming) {
            if (edge.type === 'calls' || edge.type === 'references') {
                const node = this.nodes.get(edge.fromId);
                if (node) callers.push(node);
            }
        }

        // Callees (outgoing 'calls' edges)
        const outgoing = this.outgoingEdges.get(symbolId) || [];
        for (const edge of outgoing) {
            if (edge.type === 'calls' || edge.type === 'references') {
                const node = this.nodes.get(edge.toId);
                if (node) callees.push(node);
            }
        }

        return { callers, callees };
    }

    public getNodeCount(): number {
        return this.nodes.size;
    }

    public clear(): void {
        this.nodes.clear();
        this.outgoingEdges.clear();
        this.incomingEdges.clear();
        this.scipIndexer.clear();
    }
}
