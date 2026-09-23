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
     * - import type { Foo } from '...'
     * - import { type Foo } from '...'
     * - import Foo from '...'
     * - import type Foo from '...'
     * - import * as Foo from '...'
     * - from foo import Bar, Baz
     * - Direct function invocations: calculateTax(...)
     * - camelCase / snake_case / PascalCase symbol occurrences
     */
    public static extractImportedSymbols(callerCode: string): Set<string> {
        const symbols = new Set<string>();

        // 1. JS/TS named imports: import { A, B as C } or import type { A, B as C }
        const namedImportRegex = /import\s+(?:type\s+)?\{([^}]+)\}\s*from/g;
        let match: RegExpExecArray | null;
        while ((match = namedImportRegex.exec(callerCode)) !== null) {
            const rawItems = match[1].split(',');
            for (const item of rawItems) {
                let cleaned = item.trim();
                if (cleaned.length === 0) continue;
                // Handle inline type modifier: import { type Foo } from '...'
                if (cleaned.startsWith('type ')) {
                    cleaned = cleaned.substring(5).trim();
                }
                if (cleaned.includes(' as ')) {
                    symbols.add(cleaned.split(' as ')[0].trim());
                } else {
                    symbols.add(cleaned);
                }
            }
        }

        // 2. JS/TS default imports: import Foo from '...' or import type Foo from '...'
        const defaultImportRegex = /import\s+(?:type\s+)?([\w\d_]+)\s+from\s+['"][^'"]+['"]/g;
        while ((match = defaultImportRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        // 3. JS/TS namespace imports: import * as Foo from '...'
        const namespaceImportRegex = /import\s+(?:type\s+)?\*\s+as\s+([\w\d_]+)\s+from/g;
        while ((match = namespaceImportRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        // 4. Python imports: from x import A, B
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

        // 5. Reserved keywords to exclude from identifier extraction
        const RESERVED_WORDS = new Set([
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
            'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally',
            'new', 'delete', 'typeof', 'instanceof', 'void', 'yield', 'await',
            'function', 'class', 'const', 'let', 'var', 'import', 'export',
            'from', 'as', 'type', 'interface', 'enum', 'super', 'this',
            'def', 'elif', 'with', 'print', 'len', 'range', 'pass', 'lambda',
            'match', 'select', 'where', 'true', 'false', 'null', 'undefined',
            'in', 'of'
        ]);

        // 6. Direct function/method invocations: e.g. calculateTax(...) or calculate_tax(...)
        const callRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        while ((match = callRegex.exec(callerCode)) !== null) {
            const name = match[1];
            if (!RESERVED_WORDS.has(name) && name.length > 1) {
                symbols.add(name);
            }
        }

        // 7. PascalCase and CONSTANT_CASE symbols: e.g. UserDTO, AuthService, MAX_RETRIES
        const pascalCaseRegex = /\b([A-Z][a-zA-Z0-9_]+)\b/g;
        while ((match = pascalCaseRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        // 8. camelCase identifiers: e.g. calculateTax, userConfig, isValid
        const camelCaseRegex = /\b([a-z][a-z0-9]*[A-Z][a-zA-Z0-9_]*)\b/g;
        while ((match = camelCaseRegex.exec(callerCode)) !== null) {
            symbols.add(match[1]);
        }

        // 9. snake_case identifiers: e.g. calculate_tax, user_profile
        const snakeCaseRegex = /\b([a-z][a-z0-9]*_[a-z0-9_]+)\b/g;
        while ((match = snakeCaseRegex.exec(callerCode)) !== null) {
            if (!RESERVED_WORDS.has(match[1])) {
                symbols.add(match[1]);
            }
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
        const symbolSet = new Set(Array.isArray(referencedSymbols) ? referencedSymbols : referencedSymbols);
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
        const symbolToBlock = new Map<string, string>();
        const declaredSymbols: string[] = [];

        for (const block of blocks) {
            const blockText = block.trim();
            if (blockText.length === 0) continue;
            const declaredName = this.extractDeclaredSymbolName(blockText);
            if (declaredName) {
                symbolToBlock.set(declaredName, block);
                declaredSymbols.push(declaredName);
            }
        }

        // Transitive dependency resolution:
        // Keep adding symbols referenced by already-retained symbols
        let changed = true;
        while (changed) {
            changed = false;
            for (const sym of [...symbolSet]) {
                const block = symbolToBlock.get(sym);
                if (!block) continue;
                for (const candidate of declaredSymbols) {
                    if (!symbolSet.has(candidate)) {
                        const regex = new RegExp(`\\b${candidate}\\b`);
                        if (regex.test(block)) {
                            symbolSet.add(candidate);
                            changed = true;
                        }
                    }
                }
            }
        }

        const retainedBlocks: string[] = [];
        const retainedSymbols: string[] = [];
        const prunedSymbols: string[] = [];

        for (const block of blocks) {
            const blockText = block.trim();
            if (blockText.length === 0) continue;

            // Always keep top-level imports, packages, re-exports (export *), and dynamic imports
            if (
                blockText.startsWith('import ') ||
                blockText.startsWith('from ') ||
                blockText.startsWith('package ') ||
                blockText.startsWith('use ') ||
                blockText.startsWith('export *') ||
                /\bimport\s*\(/.test(blockText)
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

        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inTripleSingle = false;
        let inTripleDouble = false;
        let inTemplateLiteral = false;
        let inBlockComment = false;
        const interpolationStack: number[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            currentBlock.push(line);

            let i = 0;
            let isEscaped = false;

            while (i < line.length) {
                const ch = line[i];
                const nextCh = i + 1 < line.length ? line[i + 1] : '';

                // If escaped inside a string, skip
                if (isEscaped) {
                    isEscaped = false;
                    i++;
                    continue;
                }

                // 1. Inside Block Comment /* ... */
                if (inBlockComment) {
                    if (ch === '*' && nextCh === '/') {
                        inBlockComment = false;
                        i += 2;
                    } else {
                        i++;
                    }
                    continue;
                }

                // 2. Inside Python Triple Double Quotes """ ... """
                if (inTripleDouble) {
                    if (ch === '\\') {
                        isEscaped = true;
                        i++;
                    } else if (line.startsWith('"""', i)) {
                        inTripleDouble = false;
                        i += 3;
                    } else {
                        i++;
                    }
                    continue;
                }

                // 3. Inside Python Triple Single Quotes ''' ... '''
                if (inTripleSingle) {
                    if (ch === '\\') {
                        isEscaped = true;
                        i++;
                    } else if (line.startsWith("'''", i)) {
                        inTripleSingle = false;
                        i += 3;
                    } else {
                        i++;
                    }
                    continue;
                }

                // 4. Inside Single Quote String '...'
                if (inSingleQuote) {
                    if (ch === '\\') {
                        isEscaped = true;
                    } else if (ch === "'") {
                        inSingleQuote = false;
                    }
                    i++;
                    continue;
                }

                // 5. Inside Double Quote String "..."
                if (inDoubleQuote) {
                    if (ch === '\\') {
                        isEscaped = true;
                    } else if (ch === '"') {
                        inDoubleQuote = false;
                    }
                    i++;
                    continue;
                }

                // 6. Inside Template Literal `...` (outside ${...})
                if (inTemplateLiteral) {
                    if (ch === '\\') {
                        isEscaped = true;
                        i++;
                    } else if (ch === '$' && nextCh === '{') {
                        // Start of template interpolation: enter code mode
                        interpolationStack.push(braceDepth);
                        braceDepth++;
                        inTemplateLiteral = false;
                        i += 2;
                    } else if (ch === '`') {
                        inTemplateLiteral = false;
                        i++;
                    } else {
                        i++;
                    }
                    continue;
                }

                // --- CODE MODE (outside strings and comments) ---

                // Check for start of comments
                if (ch === '/' && nextCh === '/') {
                    // Single-line comment //: rest of line is comment
                    break;
                }
                if (ch === '/' && nextCh === '*') {
                    inBlockComment = true;
                    i += 2;
                    continue;
                }

                // Python / Shell # comments
                if (ch === '#') {
                    if (braceDepth === 0 || !/[a-zA-Z_$]/.test(nextCh)) {
                        break;
                    }
                }

                // Check for start of strings
                if (line.startsWith('"""', i)) {
                    inTripleDouble = true;
                    i += 3;
                    continue;
                }
                if (line.startsWith("'''", i)) {
                    inTripleSingle = true;
                    i += 3;
                    continue;
                }
                if (ch === "'") {
                    inSingleQuote = true;
                    i++;
                    continue;
                }
                if (ch === '"') {
                    inDoubleQuote = true;
                    i++;
                    continue;
                }
                if (ch === '`') {
                    inTemplateLiteral = true;
                    i++;
                    continue;
                }

                // Check for Regex literal: e.g. /pattern/
                if (ch === '/' && nextCh !== '/' && nextCh !== '*') {
                    const prevText = line.slice(0, i).trim();
                    const lastPrevChar = prevText.length > 0 ? prevText[prevText.length - 1] : '';
                    const isRegexStart = lastPrevChar === '' ||
                        /[=(:,[!&|?;{]/.test(lastPrevChar) ||
                        /\b(return|typeof|yield|await|case)\b$/.test(prevText);

                    if (isRegexStart) {
                        i++; // skip starting /
                        let inCharClass = false;
                        let regEscaped = false;
                        while (i < line.length) {
                            const rch = line[i];
                            if (regEscaped) {
                                regEscaped = false;
                            } else if (rch === '\\') {
                                regEscaped = true;
                            } else if (rch === '[' && !inCharClass) {
                                inCharClass = true;
                            } else if (rch === ']' && inCharClass) {
                                inCharClass = false;
                            } else if (rch === '/' && !inCharClass) {
                                i++; // consume closing /
                                break;
                            }
                            i++;
                        }
                        continue;
                    }
                }

                // Track Braces and Parentheses in Code Mode
                if (ch === '{' || ch === '(') {
                    braceDepth++;
                } else if (ch === '}' || ch === ')') {
                    braceDepth = Math.max(0, braceDepth - 1);
                    if (
                        ch === '}' &&
                        interpolationStack.length > 0 &&
                        braceDepth === interpolationStack[interpolationStack.length - 1]
                    ) {
                        interpolationStack.pop();
                        inTemplateLiteral = true;
                    }
                }

                i++;
            }

            // Clean up single-line quote states if no trailing backslash
            if (inSingleQuote && !isEscaped) inSingleQuote = false;
            if (inDoubleQuote && !isEscaped) inDoubleQuote = false;

            const isInsideLiteralOrComment = inBlockComment || inTemplateLiteral || inTripleDouble || inTripleSingle;

            if (braceDepth <= 0 && !isInsideLiteralOrComment && line.trim().length === 0 && currentBlock.length > 0) {
                const blockContent = currentBlock.join('\n');
                if (blockContent.trim().length > 0) {
                    blocks.push(blockContent);
                }
                currentBlock = [];
                braceDepth = 0;
            }
        }

        if (currentBlock.length > 0) {
            const blockContent = currentBlock.join('\n');
            if (blockContent.trim().length > 0) {
                blocks.push(blockContent);
            }
        }

        return blocks;
    }

    private static extractDeclaredSymbolName(block: string): string | null {
        const lines = block.split('\n');
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('#') || line.startsWith('@')) {
                continue;
            }

            // Interface / type / class / function / enum / struct / trait
            const match = line.match(/^(?:export\s+)?(?:default\s+|declare\s+|abstract\s+|pub\s+|public\s+|static\s+|async\s+)*(?:class|interface|type|(?:const\s+)?enum|struct|trait|func|def|fn|function)\s+([\w\d_]+)/i) ||
                          line.match(/^(?:export\s+)?(?:const|let|var)\s+([\w\d_]+)/i) ||
                          line.match(/^type\s+([\w\d_]+)\s+(?:struct|interface)/i);

            if (match) return match[1];
            break; // Stop at first non-comment/decorator line
        }

        return null;
    }
}
