import * as fs from 'fs';
import * as path from 'path';
import { TokenIgnoreFilter } from '../ignore/tokenIgnore';

export type SourcePolicyErrorCode = 'UNTRUSTED_WORKSPACE' | 'OUTSIDE_WORKSPACE' | 'IGNORED' | 'SENSITIVE_NAME' | 'NOT_FILE' | 'TOO_LARGE' | 'BINARY';
export class SourcePolicyError extends Error {
    constructor(public readonly code: SourcePolicyErrorCode, message: string) { super(message); this.name = 'SourcePolicyError'; }
}

export class WorkspaceSourcePolicy {
    private static readonly SENSITIVE_NAME = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials?|secrets?|id_(?:rsa|dsa|ecdsa|ed25519))(?:\..*)?$/i;
    private readonly roots: string[];
    private readonly filters: Map<string, TokenIgnoreFilter>;

    constructor(workspaceRoots: string[], private readonly trusted: boolean, private readonly maxBytes = 2 * 1024 * 1024) {
        this.roots = workspaceRoots.map(root => path.resolve(root));
        this.filters = new Map(this.roots.map(root => [root, new TokenIgnoreFilter(root)]));
    }

    public assertReadable(filePath: string): { absolutePath: string; displayPath: string; root: string } {
        if (!this.trusted) throw new SourcePolicyError('UNTRUSTED_WORKSPACE', 'Workspace file access requires workspace trust.');
        const absolute = path.resolve(filePath);
        const root = this.roots.find(candidate => this.isWithin(candidate, absolute));
        if (!root) throw new SourcePolicyError('OUTSIDE_WORKSPACE', 'File is outside all active workspace folders.');
        const realRoot = fs.existsSync(root) ? fs.realpathSync.native(root) : root;
        const realFile = fs.existsSync(absolute) ? fs.realpathSync.native(absolute) : absolute;
        if (!this.isWithin(realRoot, realFile)) throw new SourcePolicyError('OUTSIDE_WORKSPACE', 'Resolved file target escapes the workspace.');
        if (WorkspaceSourcePolicy.SENSITIVE_NAME.test(path.basename(realFile))) {
            throw new SourcePolicyError('SENSITIVE_NAME', 'Sensitive credential files cannot be included in model context.');
        }
        const stats = fs.statSync(realFile);
        if (!stats.isFile()) throw new SourcePolicyError('NOT_FILE', 'Context source is not a regular file.');
        if (stats.size > this.maxBytes) throw new SourcePolicyError('TOO_LARGE', 'Context source exceeds the maximum file size.');
        if (this.filters.get(root)?.isIgnored(realFile)) throw new SourcePolicyError('IGNORED', 'Context source is excluded by the workspace context policy.');
        const sample = fs.readFileSync(realFile).subarray(0, Math.min(stats.size, 8192));
        if (sample.includes(0)) throw new SourcePolicyError('BINARY', 'Binary files cannot be included in model context.');
        return { absolutePath: realFile, displayPath: path.relative(root, realFile).replace(/\\/g, '/'), root };
    }

    public readText(filePath: string): { text: string; displayPath: string; absolutePath: string } {
        const allowed = this.assertReadable(filePath);
        let descriptor: number | undefined;
        try {
            descriptor = fs.openSync(allowed.absolutePath, 'r');
            const stats = fs.fstatSync(descriptor);
            if (!stats.isFile()) throw new SourcePolicyError('NOT_FILE', 'Context source is not a regular file.');
            if (stats.size > this.maxBytes) throw new SourcePolicyError('TOO_LARGE', 'Context source exceeds the maximum file size.');
            const recheckedRealPath = fs.realpathSync.native(allowed.absolutePath);
            if (path.resolve(recheckedRealPath) !== path.resolve(allowed.absolutePath)) {
                throw new SourcePolicyError('OUTSIDE_WORKSPACE', 'Context source changed while its policy was being checked.');
            }
            const bytes = fs.readFileSync(descriptor);
            if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) {
                throw new SourcePolicyError('BINARY', 'Binary files cannot be included in model context.');
            }
            return { ...allowed, text: bytes.toString('utf8') };
        } finally {
            if (descriptor !== undefined) fs.closeSync(descriptor);
        }
    }

    private isWithin(root: string, candidate: string): boolean {
        const relative = path.relative(root, candidate);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }
}
