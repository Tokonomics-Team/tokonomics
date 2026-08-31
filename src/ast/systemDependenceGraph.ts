/**
 * Tokonomics System Dependence Graph (SDG) & Dynamic Program Slicer
 * Combines Control Dependence Graphs (CDG) and Data Dependence Graphs (DDG)
 * to perform interprocedural backward program slicing along dependency chains.
 */

export interface StatementNode {
    id: string;
    line: number;
    text: string;
    definedVars: string[];
    usedVars: string[];
    controlParentLine?: number;
}

export interface SliceResult {
    slicedCode: string;
    includedLines: number[];
    originalLinesCount: number;
    slicedLinesCount: number;
    reductionPercentage: number;
}

export class SystemDependenceGraph {
    private nodes: Map<number, StatementNode> = new Map(); // line -> node
    private dataEdges: Map<number, Set<number>> = new Map(); // fromLine -> toLines (data dependencies)
    private controlEdges: Map<number, Set<number>> = new Map(); // fromLine -> toLines (control dependencies)

    /**
     * Builds the System Dependence Graph (CDG + DDG) from a code snippet
     */
    public buildGraph(code: string): void {
        this.nodes.clear();
        this.dataEdges.clear();
        this.controlEdges.clear();

        const rawLines = code.split('\n');
        const controlStack: number[] = []; // tracks open if/loop condition lines

        // Track last definition line for each variable
        const varLastDef = new Map<string, number>();

        for (let i = 0; i < rawLines.length; i++) {
            const lineNum = i + 1;
            const lineText = rawLines[i].trim();
            if (!lineText || lineText.startsWith('//') || lineText.startsWith('/*')) {
                continue;
            }

            // Extract defined and used variables
            const definedVars: string[] = [];
            const usedVars: string[] = [];

            // Simple parser: let/const/var x = ...
            const defMatch = lineText.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=/);
            if (defMatch) {
                definedVars.push(defMatch[1]);
            }

            // Match words that are used
            const words = lineText.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
            for (const w of words) {
                if (['const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'function', 'class', 'import', 'export'].includes(w)) {
                    continue;
                }
                if (!definedVars.includes(w)) {
                    usedVars.push(w);
                }
            }

            // Check control condition lines
            const isControlHeader = /^(if|for|while|switch)\b/.test(lineText);
            const parentControlLine = controlStack.length > 0 ? controlStack[controlStack.length - 1] : undefined;

            const node: StatementNode = {
                id: `stmt_${lineNum}`,
                line: lineNum,
                text: rawLines[i], // preserve indentation
                definedVars,
                usedVars,
                controlParentLine: parentControlLine
            };
            this.nodes.set(lineNum, node);

            // Establish Control Dependencies
            if (parentControlLine) {
                if (!this.controlEdges.has(lineNum)) this.controlEdges.set(lineNum, new Set());
                this.controlEdges.get(lineNum)!.add(parentControlLine);
            }

            if (isControlHeader) {
                controlStack.push(lineNum);
            }
            if (lineText.includes('}') && controlStack.length > 0) {
                controlStack.pop();
            }

            // Establish Data Dependencies (backward from used var -> previous def line)
            for (const u of usedVars) {
                if (varLastDef.has(u)) {
                    const defLine = varLastDef.get(u)!;
                    if (!this.dataEdges.has(lineNum)) this.dataEdges.set(lineNum, new Set());
                    this.dataEdges.get(lineNum)!.add(defLine);
                }
            }

            // Update definitions
            for (const d of definedVars) {
                varLastDef.set(d, lineNum);
            }
        }
    }

    /**
     * Computes a dynamic backward program slice from a target line and variable
     */
    public computeBackwardSlice(code: string, targetLine: number, targetVar?: string): SliceResult {
        this.buildGraph(code);

        const rawLines = code.split('\n');
        let effectiveTargetLine = targetLine;

        // If targetLine is out of range or not in nodes, search for line matching targetVar or return
        if (!this.nodes.has(effectiveTargetLine)) {
            for (const [line, node] of this.nodes.entries()) {
                if (targetVar && (node.definedVars.includes(targetVar) || node.usedVars.includes(targetVar))) {
                    effectiveTargetLine = line;
                }
            }
        }

        const visitedLines = new Set<number>();
        const queue: number[] = [effectiveTargetLine];

        // Traverse backward along data and control edges
        while (queue.length > 0) {
            const currentLine = queue.shift()!;
            if (visitedLines.has(currentLine)) continue;
            visitedLines.add(currentLine);

            // Traverse Data Dependencies
            const dataDeps = this.dataEdges.get(currentLine) || [];
            for (const d of dataDeps) {
                if (!visitedLines.has(d)) queue.push(d);
            }

            // Traverse Control Dependencies
            const ctrlDeps = this.controlEdges.get(currentLine) || [];
            for (const c of ctrlDeps) {
                if (!visitedLines.has(c)) queue.push(c);
            }
        }

        // Always include class/function signatures and closing brackets for syntactic validity
        const includedLines = Array.from(visitedLines).sort((a, b) => a - b);
        const slicedStatements: string[] = [];

        for (let i = 0; i < rawLines.length; i++) {
            const lineNum = i + 1;
            const text = rawLines[i];
            const isHeader = /^(export\s+)?(class|function|interface|type)\b/.test(text.trim());
            const isClosing = text.trim() === '}' || text.trim() === '};';

            if (visitedLines.has(lineNum) || isHeader || isClosing) {
                slicedStatements.push(text);
            }
        }

        const slicedCode = slicedStatements.join('\n');
        const reductionPercentage = rawLines.length > 0 
            ? Math.round((1 - slicedStatements.length / rawLines.length) * 100) 
            : 0;

        return {
            slicedCode,
            includedLines,
            originalLinesCount: rawLines.length,
            slicedLinesCount: slicedStatements.length,
            reductionPercentage
        };
    }
}
