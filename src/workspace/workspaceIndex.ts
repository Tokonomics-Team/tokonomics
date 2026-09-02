import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { AstPrunerEngine } from '../ast/pruner';
import { TokenCounter } from '../engine/tokenizer';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';
import { RepoMapResult } from '../repo/repoMap';
import { CanonicalWorkspaceFile, WorkspaceIdentity, WorkspaceRootIdentity } from './workspaceIdentity';

export interface WorkspaceIndexSymbol {
    readonly name: string;
    readonly kind: 'class' | 'interface' | 'function' | 'type' | 'enum' | 'struct' | 'method';
    readonly file: string;
    readonly line: number;
    readonly signature: string;
    readonly terms: ReadonlySet<string>;
}

export interface WorkspaceFileRecord extends CanonicalWorkspaceFile {
    readonly sourceVersion: string;
    readonly contentHash: string;
    readonly language: string;
    readonly skeleton: string;
    readonly symbols: readonly WorkspaceIndexSymbol[];
    readonly references: readonly string[];
    readonly sizeBytes: number;
    readonly memoryBytes: number;
    readonly updateSequence: number;
}

export interface WorkspaceSnapshot {
    readonly generation: number;
    readonly createdAt: number;
    readonly roots: readonly WorkspaceRootIdentity[];
    readonly ignorePolicyVersion: string;
    readonly files: ReadonlyMap<string, WorkspaceFileRecord>;
    readonly symbols: readonly WorkspaceIndexSymbol[];
    readonly memoryBytes: number;
}

export interface WorkspaceIndexStats {
    generation: number;
    filesIndexed: number;
    symbolsIndexed: number;
    memoryBytes: number;
    budgetBytes: number;
    ignorePolicyVersion: string;
}

export interface WorkspaceIndexOptions {
    budgetMB?: number;
    maxFileBytes?: number;
    debounceMs?: number;
    trusted?: boolean;
}

class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
    constructor(private readonly source: Map<K, V>) {}
    public get size(): number { return this.source.size; }
    public get(key: K): V | undefined { return this.source.get(key); }
    public has(key: K): boolean { return this.source.has(key); }
    public entries(): MapIterator<[K, V]> { return this.source.entries(); }
    public keys(): MapIterator<K> { return this.source.keys(); }
    public values(): MapIterator<V> { return this.source.values(); }
    public forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
        this.source.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
    }
    public [Symbol.iterator](): MapIterator<[K, V]> { return this.source[Symbol.iterator](); }
    public readonly [Symbol.toStringTag] = 'ReadonlyMap';
}

class ReadonlySetView<T> implements ReadonlySet<T> {
    constructor(private readonly source: Set<T>) {}
    public get size(): number { return this.source.size; }
    public has(value: T): boolean { return this.source.has(value); }
    public entries(): SetIterator<[T, T]> { return this.source.entries(); }
    public keys(): SetIterator<T> { return this.source.keys(); }
    public values(): SetIterator<T> { return this.source.values(); }
    public forEach(callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown): void {
        this.source.forEach(value => callbackfn.call(thisArg, value, value, this));
    }
    public [Symbol.iterator](): SetIterator<T> { return this.source[Symbol.iterator](); }
    public readonly [Symbol.toStringTag] = 'ReadonlySet';
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.h', '.php', '.sql']);

export class VersionedWorkspaceIndex {
    private identity: WorkspaceIdentity;
    private rootPaths: string[];
    private filters = new Map<string, TokenIgnoreFilter>();
    private snapshot: WorkspaceSnapshot;
    private sequences = new Map<string, number>();
    private pending = new Map<string, ReturnType<typeof setTimeout>>();
    private epoch = 0;
    private budgetBytes: number;
    private readonly maxFileBytes: number;
    private readonly debounceMs: number;
    private trusted: boolean;

    constructor(
        roots: readonly string[],
        private readonly astEngine: AstPrunerEngine = new AstPrunerEngine(),
        options: WorkspaceIndexOptions = {}
    ) {
        this.rootPaths = [...roots];
        this.trusted = options.trusted !== false;
        this.identity = new WorkspaceIdentity(roots, this.trusted);
        this.budgetBytes = Math.max(1, options.budgetMB ?? 64) * 1024 * 1024;
        this.maxFileBytes = options.maxFileBytes ?? 300 * 1024;
        this.debounceMs = options.debounceMs ?? 75;
        if (this.trusted) this.reloadFilters();
        this.snapshot = this.emptySnapshot(0);
    }

    public captureSnapshot(): WorkspaceSnapshot { return this.snapshot; }

    public ensureInitialized(): Promise<WorkspaceSnapshot> {
        return this.snapshot.files.size > 0 ? Promise.resolve(this.snapshot) : this.initialize();
    }

    public setTrusted(trusted: boolean): void {
        this.trusted = trusted;
        this.identity = new WorkspaceIdentity(this.rootPaths, trusted);
        if (trusted) this.reloadFilters();
        if (!trusted) {
            this.epoch++;
            for (const timer of this.pending.values()) clearTimeout(timer);
            this.pending.clear();
            this.sequences.clear();
            this.snapshot = this.emptySnapshot(this.snapshot.generation + 1);
        }
    }

    public async rebuild(): Promise<WorkspaceSnapshot> {
        this.epoch++;
        if (this.trusted) this.reloadFilters();
        this.snapshot = this.emptySnapshot(this.snapshot.generation + 1);
        return this.initialize();
    }

    public async replaceRoots(roots: readonly string[], build = true): Promise<WorkspaceSnapshot> {
        this.epoch++;
        for (const timer of this.pending.values()) clearTimeout(timer);
        this.pending.clear();
        this.rootPaths = [...roots];
        this.identity = new WorkspaceIdentity(roots, this.trusted);
        this.sequences.clear();
        if (this.trusted) this.reloadFilters(); else this.filters.clear();
        this.snapshot = this.emptySnapshot(this.snapshot.generation + 1);
        return build ? this.initialize() : this.snapshot;
    }

    public updateBudgetMB(budgetMB: number): void {
        this.budgetBytes = Math.max(1, budgetMB) * 1024 * 1024;
        this.publish(new Map(this.snapshot.files));
    }

    public getStats(): WorkspaceIndexStats {
        const current = this.snapshot;
        return {
            generation: current.generation,
            filesIndexed: current.files.size,
            symbolsIndexed: current.symbols.length,
            memoryBytes: current.memoryBytes,
            budgetBytes: this.budgetBytes,
            ignorePolicyVersion: current.ignorePolicyVersion
        };
    }

    public async initialize(): Promise<WorkspaceSnapshot> {
        if (!this.trusted) return this.snapshot;
        const epoch = this.epoch;
        this.reloadFilters();
        const candidates = this.collectCandidates().sort((a, b) => this.priority(a) - this.priority(b) || a.localeCompare(b));
        const records: WorkspaceFileRecord[] = [];
        let estimated = this.baseMemoryBytes();
        for (const file of candidates) {
            const identified = this.identity.identify(file);
            if (!identified) continue;
            // A scan observes the current sequence; it never supersedes an editor/file event.
            const sequence = this.sequences.get(identified.key) || 0;
            const record = await this.readRecord(identified, sequence);
            if (!record || (this.sequences.get(identified.key) || 0) !== sequence) continue;
            if (estimated + record.memoryBytes > this.budgetBytes) continue;
            estimated += record.memoryBytes;
            records.push(record);
            await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        if (epoch !== this.epoch || !this.trusted) return this.snapshot;
        const files = new Map(this.snapshot.files);
        for (const record of records) {
            if ((this.sequences.get(record.key) || 0) === record.updateSequence) files.set(record.key, record);
        }
        this.publish(files);
        return this.snapshot;
    }

    public scheduleUpsert(filePath: string, buffer?: { text: string; version: number }): void {
        if (!this.trusted) return;
        const identified = this.identity.identify(filePath);
        if (!identified) return;
        const sequence = this.nextSequence(identified.key);
        const existing = this.pending.get(identified.key);
        if (existing) clearTimeout(existing);
        this.pending.set(identified.key, setTimeout(() => {
            this.pending.delete(identified.key);
            void this.upsertIdentified(identified, sequence, buffer);
        }, this.debounceMs));
    }

    public async upsert(filePath: string, buffer?: { text: string; version: number }): Promise<boolean> {
        if (!this.trusted) return false;
        const identified = this.identity.identify(filePath);
        if (!identified) return false;
        const sequence = this.nextSequence(identified.key);
        return this.upsertIdentified(identified, sequence, buffer);
    }

    public delete(filePath: string): boolean {
        if (!this.trusted) return false;
        const identified = this.identity.identify(filePath);
        if (!identified) return false;
        this.nextSequence(identified.key);
        const timer = this.pending.get(identified.key);
        if (timer) clearTimeout(timer);
        this.pending.delete(identified.key);
        if (!this.snapshot.files.has(identified.key)) return false;
        const files = new Map(this.snapshot.files);
        files.delete(identified.key);
        this.publish(files);
        return true;
    }

    public async rename(oldPath: string, newPath: string): Promise<boolean> {
        if (!this.trusted) return false;
        const oldIdentity = this.identity.identify(oldPath);
        const newIdentity = this.identity.identify(newPath);
        if (!oldIdentity || !newIdentity) return false;
        const oldSequence = this.nextSequence(oldIdentity.key);
        const newSequence = this.nextSequence(newIdentity.key);
        const record = await this.readRecord(newIdentity, newSequence);
        if (this.sequences.get(oldIdentity.key) !== oldSequence || this.sequences.get(newIdentity.key) !== newSequence) return false;
        const files = new Map(this.snapshot.files);
        files.delete(oldIdentity.key);
        if (record) files.set(newIdentity.key, record);
        this.publish(files);
        return true;
    }

    public searchRelevantSlices(query: string, limit = 5, snapshot: WorkspaceSnapshot = this.snapshot) {
        const terms = this.tokenize(query);
        return snapshot.symbols.map(symbol => {
            let matches = 0;
            for (const term of terms) if (symbol.terms.has(term)) matches++;
            let score = matches / Math.sqrt(symbol.terms.size + 1) * 10;
            for (const term of terms) {
                const name = symbol.name.toLowerCase();
                if (name === term) score += 25;
                else if (name.includes(term)) score += 10;
            }
            return { ...symbol, score, estimatedTokens: TokenCounter.countTokens(symbol.signature) };
        }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, limit);
    }

    public generateRepoMap(activeFiles: readonly string[] = [], tokenBudget = 1024, snapshot: WorkspaceSnapshot = this.snapshot): RepoMapResult {
        const start = performance.now();
        const active = new Set(activeFiles.map(file => this.identity.identify(file)?.key).filter(Boolean));
        const recordsByRelativePath = new Map([...snapshot.files.values()].map(file => [file.relativePath, file]));
        const symbolOwners = new Map<string, Set<string>>();
        for (const record of snapshot.files.values()) {
            for (const symbol of record.symbols) {
                const owners = symbolOwners.get(symbol.name) || new Set<string>();
                owners.add(record.key);
                symbolOwners.set(symbol.name, owners);
            }
        }
        const outgoing = new Map<string, Set<string>>();
        for (const record of snapshot.files.values()) {
            const targets = new Set<string>();
            for (const reference of record.references) {
                for (const owner of symbolOwners.get(reference) || []) if (owner !== record.key) targets.add(owner);
            }
            outgoing.set(record.key, targets);
        }
        const keys = [...snapshot.files.keys()];
        let scores = new Map(keys.map(key => [key, active.has(key) ? 10 : 1]));
        for (let iteration = 0; iteration < 12; iteration++) {
            const next = new Map(keys.map(key => [key, active.has(key) ? 1 : 0.15]));
            for (const key of keys) {
                const targets = outgoing.get(key) || new Set();
                if (targets.size === 0) continue;
                const share = (scores.get(key) || 0) * 0.85 / targets.size;
                for (const target of targets) next.set(target, (next.get(target) || 0) + share);
            }
            scores = next;
        }
        const ranked = snapshot.symbols.map(symbol => {
            const record = recordsByRelativePath.get(symbol.file);
            return { symbol, score: record ? scores.get(record.key) || 0 : 0 };
        }).sort((a, b) => b.score - a.score || a.symbol.file.localeCompare(b.symbol.file) || a.symbol.line - b.symbol.line);
        const lines: string[] = [];
        let tokens = 0;
        for (const { symbol } of ranked) {
            const line = `${symbol.file}:${symbol.line} ${symbol.kind} ${symbol.signature}`;
            const next = TokenCounter.countTokens(line + '\n');
            if (tokens + next > tokenBudget) break;
            lines.push(line);
            tokens += next;
        }
        return {
            mapText: lines.join('\n') || '// No source files indexed in workspace.',
            tokenCount: tokens || 8,
            totalFilesIndexed: snapshot.files.size,
            rankedSymbolsCount: lines.length,
            durationMs: Math.round(performance.now() - start)
        };
    }

    public dispose(): void {
        for (const timer of this.pending.values()) clearTimeout(timer);
        this.pending.clear();
    }

    private async upsertIdentified(identified: CanonicalWorkspaceFile, sequence: number, buffer?: { text: string; version: number }): Promise<boolean> {
        const validBuffer = buffer && Buffer.byteLength(buffer.text) <= this.maxFileBytes && !buffer.text.includes('\0') ? buffer : undefined;
        const record = buffer && !validBuffer ? undefined : validBuffer
            ? this.buildRecord(identified, validBuffer.text, `buffer:${validBuffer.version}`, sequence)
            : await this.readRecord(identified, sequence);
        if (this.sequences.get(identified.key) !== sequence) return false;
        const files = new Map(this.snapshot.files);
        if (record) files.set(identified.key, record); else files.delete(identified.key);
        this.publish(files);
        return !!record;
    }

    private async readRecord(identity: CanonicalWorkspaceFile, sequence: number): Promise<WorkspaceFileRecord | undefined> {
        const filter = this.filters.get(identity.rootId);
        if (filter?.isIgnored(identity.absolutePath) || !SOURCE_EXTENSIONS.has(path.extname(identity.absolutePath).toLowerCase())) return undefined;
        try {
            const stat = await fs.promises.stat(identity.absolutePath);
            if (!stat.isFile() || stat.size > this.maxFileBytes) return undefined;
            const content = await fs.promises.readFile(identity.absolutePath, 'utf8');
            if (content.includes('\0')) return undefined;
            return this.buildRecord(identity, content, `disk:${stat.mtimeMs}:${stat.size}`, sequence);
        } catch { return undefined; }
    }

    private buildRecord(identity: CanonicalWorkspaceFile, content: string, sourceVersion: string, sequence: number): WorkspaceFileRecord {
        const extension = path.extname(identity.absolutePath).toLowerCase();
        const language = extension.slice(1) || 'text';
        const pruned = this.astEngine.pruneCodeContext(content, language);
        const symbols = Object.freeze(this.extractSymbols(content, identity.relativePath));
        const references = Object.freeze([...new Set([...content.matchAll(/\b([A-Z][A-Za-z0-9_$]{2,})\b/g)].map(match => match[1]))]);
        const contentHash = createHash('sha256').update(content).digest('hex');
        const memoryBytes = this.stringBytes(identity.key, identity.absolutePath, identity.relativePath, sourceVersion, contentHash, language, pruned.prunedCode)
            + 192 + symbols.reduce((sum, symbol) => sum + this.symbolBytes(symbol), 0) + this.stringBytes(...references) + references.length * 16;
        return Object.freeze({ ...identity, sourceVersion, contentHash, language, skeleton: pruned.prunedCode, symbols, references,
            sizeBytes: Buffer.byteLength(content), memoryBytes, updateSequence: sequence });
    }

    private publish(input: Map<string, WorkspaceFileRecord>): void {
        const prioritized = [...input.values()].sort((a, b) => this.priority(a.absolutePath) - this.priority(b.absolutePath) || a.key.localeCompare(b.key));
        const files = new Map<string, WorkspaceFileRecord>();
        let memoryBytes = this.baseMemoryBytes();
        for (const record of prioritized) {
            if (memoryBytes + record.memoryBytes > this.budgetBytes) continue;
            files.set(record.key, record);
            memoryBytes += record.memoryBytes;
        }
        const symbols = Object.freeze([...files.values()].flatMap(file => [...file.symbols]));
        this.snapshot = Object.freeze({ generation: this.snapshot.generation + 1, createdAt: Date.now(),
            roots: this.identity.roots, ignorePolicyVersion: this.ignoreVersion(), files: new ReadonlyMapView(files), symbols, memoryBytes });
    }

    private emptySnapshot(generation: number): WorkspaceSnapshot {
        return Object.freeze({ generation, createdAt: Date.now(), roots: this.identity.roots,
            ignorePolicyVersion: this.ignoreVersion(), files: new ReadonlyMapView(new Map()), symbols: Object.freeze([]), memoryBytes: this.baseMemoryBytes() });
    }

    private reloadFilters(): void {
        this.filters = new Map(this.identity.roots.map(root => [root.id, new TokenIgnoreFilter(root.path)]));
    }

    private ignoreVersion(): string {
        if (!this.trusted) return 'untrusted';
        const hash = createHash('sha256');
        for (const root of this.identity.roots) {
            hash.update(root.id);
            for (const name of ['.gitignore', '.tokenignore']) {
                try { hash.update(fs.readFileSync(path.join(root.path, name))); } catch { hash.update('<missing>'); }
            }
        }
        return hash.digest('hex').slice(0, 16);
    }

    private collectCandidates(): string[] {
        const results: string[] = [];
        const walk = (dir: string, filter: TokenIgnoreFilter) => {
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (filter.isIgnored(full)) continue;
                if (entry.isDirectory()) walk(full, filter);
                else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(full);
            }
        };
        for (const root of this.identity.roots) walk(root.path, this.filters.get(root.id)!);
        return results;
    }

    private extractSymbols(content: string, file: string): WorkspaceIndexSymbol[] {
        const patterns: Array<{ regex: RegExp; kind: WorkspaceIndexSymbol['kind'] }> = [
            { regex: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class' },
            { regex: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: 'interface' },
            { regex: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/, kind: 'type' },
            { regex: /^\s*(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/, kind: 'enum' },
            { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, kind: 'function' },
            { regex: /^\s*def\s+([A-Za-z0-9_]+)\s*\(/, kind: 'function' },
            { regex: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/, kind: 'function' },
            { regex: /^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/, kind: 'function' },
            { regex: /^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/, kind: 'struct' }
        ];
        const symbols: WorkspaceIndexSymbol[] = [];
        content.split(/\r?\n/).forEach((line, index) => {
            for (const pattern of patterns) {
                const match = line.match(pattern.regex);
                if (!match?.[1]) continue;
                const signature = line.trim().slice(0, 200);
                symbols.push(Object.freeze({ name: match[1], kind: pattern.kind, file, line: index + 1,
                    signature, terms: this.tokenize(`${match[1]} ${signature}`) }));
                break;
            }
        });
        return symbols;
    }

    private tokenize(value: string): ReadonlySet<string> {
        return new ReadonlySetView(new Set(value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9_]+/).filter(term => term.length > 1)));
    }

    private nextSequence(key: string): number {
        const next = (this.sequences.get(key) || 0) + 1;
        this.sequences.set(key, next);
        return next;
    }

    private priority(file: string): number {
        const relative = file.replace(/\\/g, '/');
        const depth = relative.split('/').length;
        const testPenalty = /(?:^|\/)(?:test|tests|fixtures|generated)(?:\/|$)/i.test(relative) ? 100 : 0;
        return testPenalty + depth;
    }

    private baseMemoryBytes(): number {
        return 256 + this.identity.roots.reduce((sum, root) => sum + this.stringBytes(root.id, root.path, root.comparisonPath) + 96, 0);
    }

    private symbolBytes(symbol: WorkspaceIndexSymbol): number {
        return 128 + this.stringBytes(symbol.name, symbol.kind, symbol.file, symbol.signature, ...symbol.terms) + symbol.terms.size * 24;
    }

    private stringBytes(...values: string[]): number {
        return values.reduce((sum, value) => sum + value.length * 2 + 16, 0);
    }
}
