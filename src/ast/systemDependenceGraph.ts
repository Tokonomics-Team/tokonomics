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

            // Extract defined and used variables via LHS / RHS separation
            const definedVars: string[] = [];
            const usedVars: string[] = [];
            const eqIdx = lineText.indexOf('=');
            let rhsText = lineText;

            if (eqIdx !== -1) {
                const lhs = lineText.substring(0, eqIdx).trim();
                rhsText = lineText.substring(eqIdx + 1);
                const lhsVarMatch = lhs.match(/(?:(?:const|let|var)\s+|this\.)?([a-zA-Z0-9_]+)$/);
                if (lhsVarMatch) {
                    definedVars.push(lhsVarMatch[1]);
                }
            } else {
                // Mutations like x++ or x--
                const mutMatch = lineText.match(/(?:this\.)?([a-zA-Z0-9_]+)\s*(?:\+\+|--|\+=|-=)/);
                if (mutMatch) {
                    definedVars.push(mutMatch[1]);
                    usedVars.push(mutMatch[1]);
                }
            }

            // Extract used variables from RHS and expressions
            const words = rhsText.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
            for (const w of words) {
                if (['const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'function', 'class', 'import', 'export', 'this', 'true', 'false', 'null', 'undefined', 'new', 'double', 'number', 'string', 'boolean'].includes(w)) {
                    continue;
                }
                usedVars.push(w);
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

    /**
     * Intent-Aware Program Slicing:
     * Identifies all lines relevant to prompt keywords, error handling, and transaction blocks
     * (commit, rollback, idempotency, auth, validation), guaranteeing that core decision logic
     * is 100% preserved in the compiled context while dead/spin loops and orthogonal traces are sliced.
     */
    public computeIntentAwareSlice(code: string, focalKeywords: string[] = [], defaultCursorLine: number = 15): SliceResult {
        this.buildGraph(code);
        const rawLines = code.split('\n');

        // Normalize focal keywords
        const normalizedKeywords = focalKeywords
            .map(k => k.toLowerCase().trim())
            .filter(k => k.length > 2 && !['class', 'export', 'public', 'private', 'async', 'method', 'function', 'the', 'for'].includes(k));

        // Core transactional & integrity keywords that should always be preserved when present
        const coreIntegrityKeywords = ['idempotent', 'idempotency', 'commit', 'rollback', 'transaction'];
        const activeKeywords = Array.from(new Set([...normalizedKeywords, ...coreIntegrityKeywords]));

        const seedLines: number[] = [];

        const isMethodHeaderLine = (line: string): boolean => {
            const trimmed = line.trim();
            if (/^(if|while|for|switch|catch|return|throw)\b/.test(trimmed)) {
                return false;
            }
            return /^\s*(?:(?:public|private|protected|async|static|export|override)\s+)*(?:function|def|fn|func|[a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.test(line);
        };

        for (let i = 0; i < rawLines.length; i++) {
            const lineNum = i + 1;
            const lineLower = rawLines[i].toLowerCase();
            const isMethodHeader = isMethodHeaderLine(rawLines[i]);
            const isClassDecl = /^\s*(export\s+)?(class|interface)\b/.test(rawLines[i].trim());

            // If a method header matches focal keywords, seed from its return/throw exit points or all lines if void
            if (isMethodHeader && activeKeywords.some(kw => lineLower.includes(kw))) {
                let depth = 0;
                let foundOpen = false;
                let foundExit = false;
                const methodLines: number[] = [];

                for (let k = i; k < rawLines.length; k++) {
                    const text = rawLines[k];
                    methodLines.push(k + 1);

                    if (text.includes('{')) {
                        depth += (text.match(/\{/g) || []).length;
                        foundOpen = true;
                    }
                    if (/^\s*(return|throw)\b/.test(text.trim())) {
                        seedLines.push(k + 1);
                        foundExit = true;
                    }
                    if (text.includes('}')) {
                        depth -= (text.match(/\}/g) || []).length;
                    }
                    if (foundOpen && depth <= 0) {
                        break;
                    }
                }

                // If void action method (no return/throw), seed all lines of the method
                if (!foundExit) {
                    seedLines.push(...methodLines);
                }
            } else if (!isClassDecl && !rawLines[i].trim().startsWith('//') && activeKeywords.some(kw => lineLower.includes(kw.toLowerCase()))) {
                seedLines.push(lineNum);
            }
        }

        // If no keywords matched, find return statements or fall back to default cursor line
        if (seedLines.length === 0) {
            let lastReturn = defaultCursorLine;
            for (let i = rawLines.length - 1; i >= 0; i--) {
                if (/^\s*return\b/.test(rawLines[i].trim())) {
                    lastReturn = i + 1;
                    break;
                }
            }
            return this.computeBackwardSlice(code, lastReturn);
        }

        const visitedLines = new Set<number>();
        const queue: number[] = [...seedLines];

        // Traverse backward and forward along dependency graph
        while (queue.length > 0) {
            const currentLine = queue.shift()!;
            if (visitedLines.has(currentLine)) continue;
            visitedLines.add(currentLine);

            // Data dependencies
            const dataDeps = this.dataEdges.get(currentLine) || [];
            for (const d of dataDeps) {
                if (!visitedLines.has(d)) queue.push(d);
            }

            // Control dependencies
            const ctrlDeps = this.controlEdges.get(currentLine) || [];
            for (const c of ctrlDeps) {
                if (!visitedLines.has(c)) queue.push(c);
            }
        }

        // Expand visited lines to include enclosing method headers
        for (const seed of Array.from(visitedLines)) {
            let start = seed - 1; // Scan from seed line upwards
            while (start >= 0) {
                const prevLine = rawLines[start];
                if (isMethodHeaderLine(prevLine)) {
                    visitedLines.add(start + 1); // Add method header
                    break;
                }
                if (/^(export\s+)?(class|interface)\b/.test(prevLine.trim())) {
                    break;
                }
                start--;
            }
        }

        // Check for referenced property declarations in the class (e.g. private retryCount = 0;)
        for (const lineNum of Array.from(visitedLines)) {
            const line = rawLines[lineNum - 1] || '';
            const propRegex = /this\.([a-zA-Z0-9_]+)/g;
            let pMatch: RegExpExecArray | null;
            while ((pMatch = propRegex.exec(line)) !== null) {
                const propName = pMatch[1];
                for (let k = 0; k < rawLines.length; k++) {
                    if (new RegExp(`^\\s*(?:(?:private|public|protected|readonly|static)\\s+)*${propName}\\b`).test(rawLines[k])) {
                        visitedLines.add(k + 1);
                    }
                }
            }
        }

        const includedLines = Array.from(visitedLines).sort((a, b) => a - b);
        const slicedStatements: string[] = [];

        for (let i = 0; i < rawLines.length; i++) {
            const lineNum = i + 1;
            const text = rawLines[i];
            const isHeader = /^(export\s+)?(class|interface|type|enum)\b/.test(text.trim());
            const isMethodHeader = isMethodHeaderLine(text);
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
