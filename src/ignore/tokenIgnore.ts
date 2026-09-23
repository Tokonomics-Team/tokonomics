import * as fs from 'fs';
import * as path from 'path';

interface IgnoreRule { negative: boolean; regex: { test(value: string): boolean }; }

export class TokenIgnoreFilter {
    private readonly workspaceRoot?: string;
    private rules: IgnoreRule[] = [];
    private static readonly SENSITIVE_NAMES = [
        /^\.env(?:\..+)?$/i, /^\.npmrc$/i, /^\.pypirc$/i, /^\.netrc$/i,
        /^credentials(?:\..+)?$/i, /^secrets?(?:\..+)?$/i, /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i
    ];
    private static readonly SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore']);
    private static readonly BINARY_EXTENSIONS = new Set([
        '.wasm', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.map', '.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz'
    ]);

    constructor(workspaceRoot?: string) {
        this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
        if (this.workspaceRoot) this.loadIgnoreFiles(this.workspaceRoot);
    }

    public loadTokenIgnore(workspaceRoot: string): void { this.loadIgnoreFiles(workspaceRoot); }

    public isIgnored(filePath: string): boolean {
        const normalizedAbsolute = path.resolve(filePath).replace(/\\/g, '/');
        const relative = this.workspaceRoot
            ? path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/')
            : normalizedAbsolute;
        const fileName = path.basename(relative);
        const lower = fileName.toLowerCase();
        if (TokenIgnoreFilter.SENSITIVE_NAMES.some(pattern => pattern.test(fileName))) return true;
        if (/(^|\/)\.kube\/config$/i.test(relative)) return true;
        if (TokenIgnoreFilter.SENSITIVE_EXTENSIONS.has(path.extname(lower))) return true;
        if (lower === 'package-lock.json' || lower === 'yarn.lock' || lower === 'pnpm-lock.yaml' || lower.endsWith('.lock')) return true;
        if (TokenIgnoreFilter.BINARY_EXTENSIONS.has(path.extname(lower)) || lower.endsWith('.min.js') || lower.endsWith('.min.css')) return true;
        if (/(^|\/)(node_modules|dist|build|out|coverage|\.git|\.next)(\/|$)/i.test(relative)) return true;

        let ignored = false;
        for (const rule of this.rules) {
            if (rule.regex.test(relative)) ignored = !rule.negative;
        }
        return ignored;
    }

    private loadIgnoreFiles(workspaceRoot: string): void {
        this.rules = [];
        for (const name of ['.gitignore', '.tokenignore']) {
            try {
                const ignorePath = path.join(workspaceRoot, name);
                if (!fs.existsSync(ignorePath)) continue;
                for (const raw of fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/)) {
                    const line = raw.trim();
                    if (!line || line.startsWith('#')) continue;
                    const negative = line.startsWith('!');
                    const pattern = negative ? line.slice(1) : line;
                    if (pattern) this.rules.push({ negative, regex: this.globToRegex(pattern) });
                }
            } catch {
                // Ignore file read errors fail safely to the non-overridable defaults above.
            }
        }
    }

    private globToRegex(pattern: string): { test(value: string): boolean } {
        const anchored = pattern.startsWith('/');
        const source = pattern.replace(/^\//, '').replace(/\\/g, '/').replace(/\/$/, '/**');
        type Token = { type: 'star' | 'deep' | 'any' | 'literal'; text?: string };
        const tokens: Token[] = [];
        for (let i = 0; i < source.length; i++) {
            if (source[i] === '*') {
                const deep = source[i + 1] === '*';
                if (deep) i++;
                tokens.push({ type: deep ? 'deep' : 'star' });
            } else tokens.push(source[i] === '?' ? { type: 'any' } : { type: 'literal', text: source[i].toLowerCase() });
        }
        return { test(value: string): boolean {
            // Oversized rules/paths conservatively exclude, rather than widening the source boundary.
            if (tokens.length > 1024 || value.length > 32768) return true;
            let states = new Set<number>([0]);
            const closure = () => {
                for (const position of states) {
                    if (tokens[position]?.type === 'star' || tokens[position]?.type === 'deep') states.add(position + 1);
                }
            };
            for (const character of value.toLowerCase()) {
                closure();
                if (states.has(tokens.length) && character === '/') return true;
                const next = new Set<number>();
                for (const position of states) {
                    const token = tokens[position];
                    if (!token) continue;
                    if (token.type === 'deep' || token.type === 'star' && character !== '/') next.add(position);
                    else if (token.type === 'any' && character !== '/' || token.type === 'literal' && token.text === character) next.add(position + 1);
                }
                if (!anchored && character === '/') next.add(0);
                states = next;
            }
            closure();
            return states.has(tokens.length);
        } };
    }
}
