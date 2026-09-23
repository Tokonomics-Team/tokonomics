/**
 * Bounded filesystem reader used to rehydrate exact evidence.
 *
 * The only I/O dependency of the exact-chunk path, kept behind the ExactSourceProvider interface so
 * the policy in semanticChunk.ts stays pure and testable.
 *
 * Safety here is deliberately shallow, because the depth is elsewhere: rehydrateExact re-verifies
 * both the file hash and the chunk hash against what the snapshot captured, so a file this reader
 * returns for the wrong path, or a file that changed after capture, is rejected by the caller rather
 * than rendered. What this class is responsible for is refusing to read what it was never entitled
 * to read at all, and refusing to spend unbounded time or memory doing it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExactSourceProvider, MAX_CHUNK_BYTES } from './semanticChunk';

/** A file larger than this is never read whole; no single evidence chunk can need it. */
export const MAX_READABLE_FILE_BYTES = 2 * 1024 * 1024;

export class WorkspaceExactSourceReader implements ExactSourceProvider {
    /** Per-request memo, so several chunks from one file cost one read. */
    private readonly cache = new Map<string, string | undefined>();
    private readonly normalizedRoots: readonly string[];

    constructor(roots: readonly string[], private readonly maxFiles: number = 24) {
        this.normalizedRoots = Object.freeze(roots
            .filter(root => typeof root === 'string' && root.length > 0)
            .map(root => path.resolve(root)));
    }

    public read(absolutePath: string): string | undefined {
        if (this.cache.has(absolutePath)) return this.cache.get(absolutePath);
        if (this.cache.size >= this.maxFiles) return undefined;

        const value = this.readOnce(absolutePath);
        this.cache.set(absolutePath, value);
        return value;
    }

    private readOnce(absolutePath: string): string | undefined {
        try {
            if (typeof absolutePath !== 'string' || absolutePath.length === 0) return undefined;
            // Resolve symlinks before the containment check: a link inside the workspace pointing
            // outside it must be rejected on where it lands, not on where it sits.
            const resolved = fs.realpathSync.native
                ? fs.realpathSync.native(absolutePath)
                : fs.realpathSync(absolutePath);
            if (!this.withinRoots(resolved)) return undefined;

            const stat = fs.statSync(resolved);
            if (!stat.isFile() || stat.size > MAX_READABLE_FILE_BYTES) return undefined;

            const content = fs.readFileSync(resolved, 'utf8');
            if (content.includes('\0')) return undefined;
            return content;
        } catch {
            return undefined;
        }
    }

    private withinRoots(candidate: string): boolean {
        if (this.normalizedRoots.length === 0) return false;
        const normalized = path.resolve(candidate);
        return this.normalizedRoots.some(root => {
            const relative = path.relative(root, normalized);
            return relative.length > 0
                && !relative.startsWith('..')
                && !path.isAbsolute(relative);
        });
    }

    /** Upper bound a caller can assert against; exposed so budgets and tests agree. */
    public static get maxChunkBytes(): number {
        return MAX_CHUNK_BYTES;
    }
}
