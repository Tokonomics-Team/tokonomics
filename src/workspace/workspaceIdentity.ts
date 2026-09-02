import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface WorkspaceRootIdentity {
    id: string;
    path: string;
    comparisonPath: string;
}

export interface CanonicalWorkspaceFile {
    key: string;
    absolutePath: string;
    relativePath: string;
    rootId: string;
}

export class WorkspaceIdentity {
    public readonly roots: readonly WorkspaceRootIdentity[];

    constructor(rootPaths: readonly string[], private readonly resolveRealPaths = true) {
        const seen = new Set<string>();
        this.roots = Object.freeze(rootPaths.map(root => this.rootIdentity(root)).filter(root => {
            if (seen.has(root.comparisonPath)) return false;
            seen.add(root.comparisonPath);
            return true;
        }).sort((a, b) => b.comparisonPath.length - a.comparisonPath.length));
    }

    public identify(filePath: string): CanonicalWorkspaceFile | undefined {
        const absolute = this.realOrResolved(filePath);
        const comparison = this.comparison(absolute);
        const root = this.roots.find(candidate => this.isWithin(candidate.comparisonPath, comparison));
        if (!root) return undefined;
        const relativePath = path.relative(root.path, absolute).replace(/\\/g, '/');
        if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) return undefined;
        const identityRelative = process.platform === 'win32' ? relativePath.toLowerCase() : relativePath;
        return Object.freeze({
            key: `${root.id}:${identityRelative}`,
            absolutePath: absolute,
            relativePath,
            rootId: root.id
        });
    }

    private rootIdentity(rootPath: string): WorkspaceRootIdentity {
        const real = this.realOrResolved(rootPath);
        const comparisonPath = this.comparison(real);
        const id = createHash('sha256').update(comparisonPath).digest('hex').slice(0, 16);
        return Object.freeze({ id, path: real, comparisonPath });
    }

    private realOrResolved(value: string): string {
        const resolved = path.resolve(value);
        if (!this.resolveRealPaths) return resolved;
        try { return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved; }
        catch { return resolved; }
    }

    private comparison(value: string): string {
        const normalizedPath = path.normalize(value);
        const normalized = normalizedPath === path.parse(normalizedPath).root
            ? normalizedPath
            : normalizedPath.replace(/[\\/]+$/, '');
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    private isWithin(root: string, candidate: string): boolean {
        const relative = path.relative(root, candidate);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }
}
