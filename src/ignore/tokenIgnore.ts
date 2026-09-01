import * as fs from 'fs';
import * as path from 'path';

interface IgnoreRule { negative: boolean; regex: RegExp; }

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

    private globToRegex(pattern: string): RegExp {
        const anchored = pattern.startsWith('/');
        let source = pattern.replace(/^\//, '').replace(/\\/g, '/').replace(/\/$/, '/**');
        source = source.replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '\u0000')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
            .replace(/\u0000/g, '.*');
        return new RegExp(`${anchored ? '^' : '(^|.*/)'}${source}(?:/.*)?$`, 'i');
    }
}
