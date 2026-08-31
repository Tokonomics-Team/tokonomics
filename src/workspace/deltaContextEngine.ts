/**
 * Tokonomics Delta Context Engine
 * Computes developer attention priors using Cursor Gravity, Active Selection, and Git Diff Deltas.
 */

export interface FocalAttentionMetrics {
    cursorGravityScore: number;
    isSelected: boolean;
    isModifiedInGitDiff: boolean;
    compositeAttentionWeight: number;
}

export class DeltaContextEngine {
    private defaultSigma: number = 15.0; // Lines distance decay variance

    /**
     * Calculates Gaussian/exponential cursor gravity distance decay
     * w(s) = exp(-|L_s - L_cursor| / sigma)
     */
    public calculateCursorGravity(symbolLine: number, cursorLine: number, sigma: number = this.defaultSigma): number {
        const distance = Math.abs(symbolLine - cursorLine);
        const weight = Math.exp(-distance / sigma);
        return Math.round(weight * 1000) / 1000;
    }

    /**
     * Determines whether a symbol range falls inside the developer's active editor selection
     */
    public isEnclosedInSelection(
        symbolStartLine: number,
        symbolEndLine: number,
        selStartLine: number,
        selEndLine: number
    ): boolean {
        return (
            (selStartLine <= symbolStartLine && selEndLine >= symbolEndLine) ||
            (symbolStartLine <= selStartLine && symbolEndLine >= selEndLine) ||
            (selStartLine <= symbolEndLine && selEndLine >= symbolStartLine)
        );
    }

    /**
     * Parses standard unified git diff format to extract modified file paths and line numbers
     */
    public parseDiffHunks(diffText: string): Map<string, Set<number>> {
        const modifiedLinesByFile = new Map<string, Set<number>>();
        const lines = diffText.split('\n');
        let currentFile = '';

        for (const line of lines) {
            if (line.startsWith('+++ b/')) {
                currentFile = line.substring(6).trim();
                if (!modifiedLinesByFile.has(currentFile)) {
                    modifiedLinesByFile.set(currentFile, new Set());
                }
            } else if (line.startsWith('@@') && currentFile) {
                // @@ -start,count +start,count @@
                const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
                if (match) {
                    const startLine = parseInt(match[1], 10);
                    const count = match[2] ? parseInt(match[2], 10) : 1;
                    const fileSet = modifiedLinesByFile.get(currentFile)!;
                    for (let i = 0; i < count; i++) {
                        fileSet.add(startLine + i);
                    }
                }
            }
        }

        return modifiedLinesByFile;
    }

    /**
     * Computes the composite attention weight for a candidate symbol
     */
    public computeAttentionWeight(params: {
        symbolLine: number;
        symbolEndLine?: number;
        filePath: string;
        activeFilePath?: string;
        cursorLine?: number;
        selection?: { start: number; end: number };
        gitDiffModifiedLines?: Map<string, Set<number>>;
    }): FocalAttentionMetrics {
        const isSameFile = params.activeFilePath && params.filePath.endsWith(params.activeFilePath);
        
        let cursorGravity = 0.0;
        let isSelected = false;

        if (isSameFile && params.cursorLine !== undefined) {
            cursorGravity = this.calculateCursorGravity(params.symbolLine, params.cursorLine);
        }

        if (isSameFile && params.selection) {
            const endLine = params.symbolEndLine ?? params.symbolLine;
            isSelected = this.isEnclosedInSelection(params.symbolLine, endLine, params.selection.start, params.selection.end);
        }

        let isModified = false;
        if (params.gitDiffModifiedLines && params.gitDiffModifiedLines.has(params.filePath)) {
            const modifiedSet = params.gitDiffModifiedLines.get(params.filePath)!;
            const endLine = params.symbolEndLine ?? params.symbolLine;
            for (let l = params.symbolLine; l <= endLine; l++) {
                if (modifiedSet.has(l)) {
                    isModified = true;
                    break;
                }
            }
        }

        // Composite weight formula: base(0.2) + selection(0.8) + cursor(0.5) + gitDiff(0.5)
        let weight = 0.2;
        if (isSelected) weight += 0.8;
        weight += cursorGravity * 0.5;
        if (isModified) weight += 0.5;

        return {
            cursorGravityScore: cursorGravity,
            isSelected,
            isModifiedInGitDiff: isModified,
            compositeAttentionWeight: Math.min(2.0, Math.round(weight * 100) / 100)
        };
    }
}
