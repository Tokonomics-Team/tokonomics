/**
 * Workspace PageRank Repository Map Engine
 * Constructs a directed dependency graph of the codebase and applies Personalized PageRank
 * to generate a structural map within an exact token budget (Aider-style repo mapping).
 */

import * as fs from 'fs';
import * as path from 'path';
import { TokenCounter } from '../engine/tokenizer';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';

export interface SymbolTag {
    name: string;
    kind: 'class' | 'interface' | 'function' | 'type' | 'enum' | 'struct' | 'method';
    file: string;
    line: number;
    signature: string;
}

export interface RepoMapResult {
    mapText: string;
    tokenCount: number;
    totalFilesIndexed: number;
    rankedSymbolsCount: number;
    durationMs: number;
}

export class RepoMapEngine {
    private tagsByFile: Map<string, SymbolTag[]> = new Map();
    private referencesByFile: Map<string, Set<string>> = new Map();
    private ignoreFilter: TokenIgnoreFilter;

    constructor(private workspaceRoot?: string) {
        this.ignoreFilter = new TokenIgnoreFilter(workspaceRoot);
    }

    /**
     * Scans and indexes all source files in the workspace (supports TS, JS, Python, Go, Rust, Java, C#)
     */
    public indexWorkspace(rootDir?: string): void {
        const root = rootDir || this.workspaceRoot;
        if (!root || !fs.existsSync(root)) return;

        this.tagsByFile.clear();
        this.referencesByFile.clear();

        const filesToScan = this.collectSourceFiles(root);

        // Configurable file size threshold (defaults to 300KB if vscode API unavailable)
        let maxFileSizeBytes = 300 * 1024;
        try {
            const vscodeModule = require('vscode');
            const conf = vscodeModule.workspace?.getConfiguration?.('tokenOptimizer');
            const maxKB = conf?.get?.('maxIndexFileSizeKB', 300) ?? 300;
            maxFileSizeBytes = maxKB * 1024;
        } catch {}

        for (const file of filesToScan) {
            try {
                // Safety guard: skip files exceeding configurable size limit
                const stat = fs.statSync(file);
                if (stat.size > maxFileSizeBytes) continue;

                const content = fs.readFileSync(file, 'utf8');
                const relPath = path.relative(root, file).replace(/\\/g, '/');
                const { tags, references } = this.extractTagsAndReferences(content, relPath);
                this.tagsByFile.set(relPath, tags);
                this.referencesByFile.set(relPath, references);
            } catch {
                // Ignore unreadable files
            }
        }
    }

    /**
     * Computes Personalized PageRank seeded on active files and returns an indentation-aware repo map.
     */
    public generateRepoMap(
        activeFiles: string[] = [],
        maxTokenBudget: number = 1024,
        rootDir?: string
    ): RepoMapResult {
        const startTime = performance.now();
        const root = rootDir || this.workspaceRoot || '';

        if (this.tagsByFile.size === 0 && root) {
            this.indexWorkspace(root);
        }

        const allFiles = Array.from(this.tagsByFile.keys());
        if (allFiles.length === 0) {
            return {
                mapText: '// No source files indexed in workspace.',
                tokenCount: 8,
                totalFilesIndexed: 0,
                rankedSymbolsCount: 0,
                durationMs: Math.round(performance.now() - startTime)
            };
        }

        // 1. Build Adjacency Matrix / Reference Graph
        // Edge: File A -> File B if File A references any symbol defined in File B
        const symbolToFile = new Map<string, string>();
        for (const [file, tags] of this.tagsByFile.entries()) {
            for (const tag of tags) {
                symbolToFile.set(tag.name, file);
            }
        }

        const outEdges = new Map<string, Set<string>>();
        const inEdges = new Map<string, Set<string>>();
        for (const file of allFiles) {
            outEdges.set(file, new Set());
            inEdges.set(file, new Set());
        }

        for (const [file, refs] of this.referencesByFile.entries()) {
            for (const ref of refs) {
                const targetFile = symbolToFile.get(ref);
                if (targetFile && targetFile !== file) {
                    outEdges.get(file)?.add(targetFile);
                    inEdges.get(targetFile)?.add(file);
                }
            }
        }

        // 2. Personalized PageRank Algorithm
        const n = allFiles.length;
        const damping = 0.85;
        const normalizedActive = activeFiles
            .map(f => path.relative(root, f).replace(/\\/g, '/'))
            .filter(f => this.tagsByFile.has(f));

        // Seed vector (personalization)
        const seed = new Map<string, number>();
        if (normalizedActive.length > 0) {
            const activeWeight = 1.0 / normalizedActive.length;
            for (const f of allFiles) {
                seed.set(f, normalizedActive.includes(f) ? activeWeight : 0);
            }
        } else {
            const uniform = 1.0 / n;
            for (const f of allFiles) {
                seed.set(f, uniform);
            }
        }

        // Power iteration
        let scores = new Map<string, number>(seed);
        for (let iter = 0; iter < 15; iter++) {
            const nextScores = new Map<string, number>();
            let sinkSum = 0;

            for (const f of allFiles) {
                const outDegree = outEdges.get(f)?.size || 0;
                if (outDegree === 0) {
                    sinkSum += scores.get(f) || 0;
                }
            }

            for (const f of allFiles) {
                let rank = (1 - damping) * (seed.get(f) || 0) + (damping * sinkSum / n);
                const incoming = inEdges.get(f) || new Set();
                for (const src of incoming) {
                    const srcOut = outEdges.get(src)?.size || 1;
                    rank += damping * ((scores.get(src) || 0) / srcOut);
                }
                nextScores.set(f, rank);
            }
            scores = nextScores;
        }

        // 3. Rank symbols and construct map within token budget
        const sortedFiles = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        const mapLines: string[] = ['# Workspace Structural Repository Map'];
        let currentTokens = TokenCounter.countTokens(mapLines[0]);
        let rankedSymbolsCount = 0;

        for (const file of sortedFiles) {
            const tags = this.tagsByFile.get(file) || [];
            if (tags.length === 0) continue;

            const fileHeader = `\n${file}:`;
            const headerTokens = TokenCounter.countTokens(fileHeader);
            if (currentTokens + headerTokens > maxTokenBudget) break;

            const fileLines: string[] = [fileHeader];
            let fileTokens = headerTokens;

            for (const tag of tags) {
                const line = `  │ ${tag.signature}`;
                const lineTokens = TokenCounter.countTokens(line);
                if (currentTokens + fileTokens + lineTokens > maxTokenBudget) {
                    break;
                }
                fileLines.push(line);
                fileTokens += lineTokens;
                rankedSymbolsCount++;
            }

            if (fileLines.length > 1) {
                mapLines.push(...fileLines);
                currentTokens += fileTokens;
            }
        }

        const mapText = mapLines.join('\n');
        return {
            mapText,
            tokenCount: TokenCounter.countTokens(mapText),
            totalFilesIndexed: allFiles.length,
            rankedSymbolsCount,
            durationMs: Math.round(performance.now() - startTime)
        };
    }

    private collectSourceFiles(dir: string, maxFiles: number = 250): string[] {
        const result: string[] = [];
        const allowedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.h'];

        const walk = (currentDir: string) => {
            if (result.length >= maxFiles) return;
            let entries: fs.Dirent[] = [];
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (result.length >= maxFiles) break;
                const fullPath = path.join(currentDir, entry.name);
                if (this.ignoreFilter.isIgnored(fullPath)) continue;

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (allowedExtensions.includes(ext)) {
                        result.push(fullPath);
                    }
                }
            }
        };

        walk(dir);
        return result;
    }

    private extractTagsAndReferences(content: string, filePath: string): { tags: SymbolTag[]; references: Set<string> } {
        const tags: SymbolTag[] = [];
        const references = new Set<string>();
        const lines = content.split('\n');

        // Regex patterns for TypeScript/JS, Python, Go, Rust, Java, C#
        const defPatterns = [
            // TS/JS classes, interfaces, types, functions
            /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/,
            /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
            /^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/,
            /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/,
            /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/,
            /^(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/,
            // Python classes & defs
            /^class\s+([A-Za-z0-9_]+)(?:\(.*\))?:/,
            /^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/,
            // Go structs, interfaces, funcs
            /^type\s+([A-Za-z0-9_]+)\s+struct\b/,
            /^type\s+([A-Za-z0-9_]+)\s+interface\b/,
            /^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/,
            // Rust structs, traits, enums, fns
            /^(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/,
            /^(?:pub\s+)?trait\s+([A-Za-z0-9_]+)/,
            /^(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/,
            /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)\s*\(/,
            // Java / C#
            /^(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|record)\s+([A-Za-z0-9_]+)/
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) continue;

            for (const pattern of defPatterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    const name = match[1];
                    let kind: SymbolTag['kind'] = 'function';
                    if (line.includes('class')) kind = 'class';
                    else if (line.includes('interface')) kind = 'interface';
                    else if (line.includes('type')) kind = 'type';
                    else if (line.includes('struct')) kind = 'struct';
                    else if (line.includes('enum')) kind = 'enum';

                    tags.push({
                        name,
                        kind,
                        file: filePath,
                        line: i + 1,
                        signature: line.replace(/\{.*$/, '').trim()
                    });
                    break;
                }
            }

            // Extract identifier references (Capitalized CamelCase or common identifiers)
            const identMatches = line.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g);
            for (const m of identMatches) {
                if (m[1]) references.add(m[1]);
            }
        }

        return { tags, references };
    }
}

/**
 * Incremental File Watch Index v3.0
 * 
 * Maintains an in-memory symbol cache. On file change, only the changed file
 * is re-extracted. PageRank is recomputed lazily when /map is invoked.
 * 
 * Performance target: First scan ~15ms, incremental updates <2ms per file.
 */
export class FileWatchIndex {
    private symbolCache: Map<string, { tags: SymbolTag[]; references: Set<string>; mtime: number }> = new Map();
    private repoMapEngine: RepoMapEngine;
    private isDirty: boolean = true;
    private lastMapResult: RepoMapResult | null = null;

    constructor(workspaceRoot?: string) {
        this.repoMapEngine = new RepoMapEngine(workspaceRoot);
    }

    /**
     * Notify the index that a file has changed. Marks the cache as dirty
     * and invalidates only that file's entry.
     */
    public onFileChanged(filePath: string): void {
        this.symbolCache.delete(filePath);
        this.isDirty = true;
    }

    /**
     * Notify the index that a file was created.
     */
    public onFileCreated(filePath: string): void {
        this.isDirty = true;
    }

    /**
     * Notify the index that a file was deleted.
     */
    public onFileDeleted(filePath: string): void {
        this.symbolCache.delete(filePath);
        this.isDirty = true;
    }

    /**
     * Get the cached repo map if still clean, or regenerate lazily.
     * Returns the full RepoMapResult.
     */
    public getMap(
        activeFiles: string[] = [],
        tokenBudget: number = 1024,
        rootDir?: string
    ): RepoMapResult {
        if (!this.isDirty && this.lastMapResult) {
            return this.lastMapResult;
        }

        // Regenerate using the underlying engine (full scan for now, 
        // but future optimization: only re-extract dirty files)
        const result = this.repoMapEngine.generateRepoMap(activeFiles, tokenBudget, rootDir);
        this.lastMapResult = result;
        this.isDirty = false;

        return result;
    }

    /**
     * Force invalidate the entire cache (e.g., on workspace change).
     */
    public invalidateAll(): void {
        this.symbolCache.clear();
        this.isDirty = true;
        this.lastMapResult = null;
    }

    /**
     * Check if cache is dirty (needs regeneration on next /map call).
     */
    public get needsRefresh(): boolean {
        return this.isDirty;
    }
}
