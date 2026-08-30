/**
 * Import-Aware Dependency Tree Shaker & Call-Graph Slicer
 * Analyzes imported symbols across context files and slices module ASTs to only include
 * referenced types and interfaces, pruning unreferenced secondary exports.
 */

import { TokenCounter } from '../engine/tokenizer';

export interface TreeShakeResult {
    shakenCode: string;
    originalTokens: number;
    shakenTokens: number;
    retainedSymbols: string[];
    prunedSymbols: string[];
    savedTokens: number;
}

export class DependencyTreeShaker {
    /**
     * Extracts all imported symbol names from a consumer code snippet.
     * Matches patterns:
     * - import { Foo, Bar as B } from '...'
     * - import Foo from '...'
     * - from foo import Bar, Baz
     */
    public static extractImportedSymbols(callerCode: string): Set<string> {
        const symbols = new Set<string>();

        // JS/TS named imports: import { A, B as C } from '...'
        const namedImportRegex = /import\s*\{([^}]+)\}\s*from/g;
        let match: RegExpExecArray | null;
        while ((match = namedImportRegex.exec(callerCode)) !== null) {
            const rawItems = match[1].split(',');
            for (const item of rawItems) {
                const cleaned = item.trim();
                if (cleaned.length === 0) continue;
                if (cleaned.includes(' as ')) {
                    symbols.add(cleaned.split(' as ')[0].trim());
                } else {
                    symbols.add(cleaned);
                }
            }
        }

        // JS/TS default imports: import Foo from '...'
        const defaultImportRegex = /import\s+([\w\d_]+)\s+from\s+['"][^'"]+['"]/g;
        while ((match = defaultImportRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        // Python imports: from x import A, B
        const pyImportRegex = /from\s+[\w\d_.]+\s+import\s+([^#\n]+)/g;
        while ((match = pyImportRegex.exec(callerCode)) !== null) {
            const rawItems = match[1].split(',');
            for (const item of rawItems) {
                const cleaned = item.trim();
                if (cleaned.includes(' as ')) {
                    symbols.add(cleaned.split(' as ')[0].trim());
                } else {
                    symbols.add(cleaned);
                }
            }
        }

        // Direct usage heuristic (symbol occurrences)
        const identifierRegex = /\b([A-Z][a-zA-Z0-9_]+)\b/g;
        while ((match = identifierRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        return symbols;
    }

    /**
     * Slices an AST-pruned or raw module context to retain only blocks that define or export
     * symbols present in `referencedSymbols`.
     */
    public static sliceModuleContext(
        moduleCode: string,
        referencedSymbols: Set<string> | string[]
    ): TreeShakeResult {
        const symbolSet = Array.isArray(referencedSymbols) ? new Set(referencedSymbols) : referencedSymbols;
        const originalTokens = TokenCounter.countTokens(moduleCode);

        // If no specific symbols are requested, return full module
        if (symbolSet.size === 0) {
            return {
                shakenCode: moduleCode,
                originalTokens,
                shakenTokens: originalTokens,
                retainedSymbols: [],
                prunedSymbols: [],
                savedTokens: 0
            };
        }

        const blocks = this.splitTopLevelBlocks(moduleCode);
        const retainedBlocks: string[] = [];
        const retainedSymbols: string[] = [];
        const prunedSymbols: string[] = [];

        for (const block of blocks) {
            const blockText = block.trim();
            if (blockText.length === 0) continue;

            // Always keep top-level imports in the sliced module
            if (
                blockText.startsWith('import ') ||
                blockText.startsWith('from ') ||
                blockText.startsWith('package ') ||
                blockText.startsWith('use ')
            ) {
                retainedBlocks.push(block);
                continue;
            }

            // Identify symbol declared in this block
            const declaredName = this.extractDeclaredSymbolName(blockText);

            if (declaredName && symbolSet.has(declaredName)) {
                retainedBlocks.push(block);
                retainedSymbols.push(declaredName);
            } else if (declaredName) {
                prunedSymbols.push(declaredName);
            } else {
                // Keep structural headers or comments
                if (blockText.startsWith('//') || blockText.startsWith('/*') || blockText.startsWith('#')) {
                    retainedBlocks.push(block);
                }
            }
        }

        const shakenCode = retainedBlocks.join('\n\n');
        const shakenTokens = TokenCounter.countTokens(shakenCode);
        const savedTokens = Math.max(0, originalTokens - shakenTokens);

        return {
            shakenCode: shakenCode.length > 20 ? shakenCode : moduleCode,
            originalTokens,
            shakenTokens,
            retainedSymbols,
            prunedSymbols,
            savedTokens
        };
    }

    private static splitTopLevelBlocks(code: string): string[] {
        const lines = code.split(/\r?\n/);
        const blocks: string[] = [];
        let currentBlock: string[] = [];
        let braceDepth = 0;

        for (const line of lines) {
            currentBlock.push(line);

            for (const ch of line) {
                if (ch === '{' || ch === '(') braceDepth++;
                if (ch === '}' || ch === ')') braceDepth--;
            }

            if (braceDepth <= 0 && line.trim().length === 0 && currentBlock.length > 0) {
                blocks.push(currentBlock.join('\n'));
                currentBlock = [];
                braceDepth = 0;
            }
        }

        if (currentBlock.length > 0) {
            blocks.push(currentBlock.join('\n'));
        }

        return blocks;
    }

    private static extractDeclaredSymbolName(block: string): string | null {
        const firstLine = block.split('\n')[0].trim();

        // Interface / type / class / function / enum / struct / trait
        const match = firstLine.match(/^(?:export\s+)?(?:abstract\s+|pub\s+|public\s+|static\s+|async\s+)*(?:class|interface|type|enum|struct|trait|func|def|fn|function)\s+([\w\d_]+)/i) ||
                      firstLine.match(/^(?:export\s+)?(?:const|let|var)\s+([\w\d_]+)/i) ||
                      firstLine.match(/^type\s+([\w\d_]+)\s+(?:struct|interface)/i);

        return match ? match[1] : null;
    }
}
