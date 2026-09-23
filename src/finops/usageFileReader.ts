import * as fs from 'fs';
import { createHash } from 'crypto';

export interface FileCursor { offset: number; identity: string; tailHash?: string; }
export interface ReadBatch { cursor: FileCursor; lines: string[]; skippedOversized: number; more: boolean; }
const MAX_LINE = 1024 * 1024;
/** Bounded byte reader. Commit only complete lines; UTF-8 tails survive polling and restart. */
export async function readUsageBatch(file: string, cursor: FileCursor = { offset: 0, identity: '' }, final = false): Promise<ReadBatch> {
    const handle = await fs.promises.open(file, 'r');
    try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error('Choose a regular JSONL file.');
        const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
        if (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error('Invalid file checkpoint.');
        let offset = identity !== cursor.identity || stat.size < cursor.offset ? 0 : cursor.offset;
        const hashAt = async (position: number) => {
            const tail = Buffer.alloc(Math.min(64, position));
            const read = await handle.read(tail, 0, tail.length, position - tail.length);
            return createHash('sha256').update(tail.subarray(0, read.bytesRead)).digest('hex');
        };
        // Detect copy-truncate followed by regrowth between polls, even on the same inode.
        if (offset && cursor.tailHash && await hashAt(offset) !== cursor.tailHash) offset = 0;
        const length = Math.min(MAX_LINE + 1, stat.size - offset);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const data = buffer.subarray(0, bytesRead);
        let end = data.lastIndexOf(10) + 1;
        if (final && offset + bytesRead >= stat.size) end = bytesRead;
        if (!end && bytesRead > MAX_LINE) throw new Error('A log line exceeds the 1 MiB limit. Watcher paused; export usage-only records or choose another log.');
        const lines = data.subarray(0, end).toString('utf8').split(/\r?\n/).filter(line => line.trim());
        return { cursor: { identity, offset: offset + end, tailHash: await hashAt(offset + end) }, lines, skippedOversized: 0, more: end > 0 && offset + end < stat.size };
    } finally { await handle.close(); }
}
