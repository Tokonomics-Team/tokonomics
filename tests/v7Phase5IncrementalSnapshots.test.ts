import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';

export async function runV7Phase5IncrementalSnapshotTests(): Promise<boolean> {
    console.log('\n--- Running v7.0.1 Phase 5 incremental snapshot tests ---');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-v7-p5-'));
    try {
        for (let i = 0; i < 180; i++) {
            const file = path.join(root, `file-${String(i).padStart(3, '0')}.ts`);
            fs.writeFileSync(file, `export function item${i}() { return ${i}; }\n`);
        }
        const index = new VersionedWorkspaceIndex([root], undefined, {
            debounceMs: 5, maxPendingUpdates: 16, maxCandidateFiles: 500, budgetMB: 16
        });
        const initial = await index.initialize();
        assert.strictEqual(initial.files.size, 180);
        assert.strictEqual(initial.coverage.reason, 'complete');
        assert.strictEqual(initial.coverage.rootsScanned, 1);
        assert.strictEqual(initial.coverage.candidatesExamined, 180);

        const beforeOps = index.getOperationalStats();
        const oldSnapshot = index.captureSnapshot();
        const target = path.join(root, 'file-090.ts');
        fs.writeFileSync(target, 'export function item90() { return 9000; }\n');
        assert.strictEqual(await index.upsert(target), true);
        const updated = index.captureSnapshot();
        const afterOps = index.getOperationalStats();
        assert.strictEqual(afterOps.fullPublications, beforeOps.fullPublications,
            'An ordinary file update must not clone/sort the complete map');
        assert.strictEqual(afterOps.incrementalPublications, beforeOps.incrementalPublications + 1);
        assert.ok(afterOps.structuralSharingDepth > 0);
        assert.ok(updated.generation > oldSnapshot.generation);
        assert.notStrictEqual(updated.files.get([...updated.files.keys()].find(k => k.endsWith('file-090.ts'))!)?.contentHash,
            oldSnapshot.files.get([...oldSnapshot.files.keys()].find(k => k.endsWith('file-090.ts'))!)?.contentHash);
        assert.strictEqual(oldSnapshot.files.size, 180, 'A published snapshot must remain immutable');
        assert.strictEqual(updated.coverage.reason, 'incremental_update');

        for (let i = 0; i < 40; i++) {
            index.scheduleUpsert(path.join(root, `storm-${i}.ts`), { text: `export const storm${i} = ${i};`, version: i });
        }
        assert.ok(index.getOperationalStats().pendingUpdates <= index.getOperationalStats().maxPendingUpdates);
        assert.strictEqual(index.getOperationalStats().rebuildAfterStorm, true);
        await new Promise(resolve => setTimeout(resolve, 80));
        assert.strictEqual(index.getOperationalStats().fullPublications, afterOps.fullPublications,
            'Event storms must use bounded catch-up instead of a full rebuild');
        assert.strictEqual(index.captureSnapshot().coverage.reason, 'event_storm');
        assert.strictEqual(index.captureSnapshot().coverage.truncated, true);

        const pinned = index.captureSnapshot();
        await index.upsert(path.join(root, 'file-091.ts'), { text: 'export const newer = true;', version: 2 });
        assert.strictEqual(pinned.generation, updated.generation + 16,
            'The pinned request snapshot must not change when a later generation publishes');
        assert.notStrictEqual(index.captureSnapshot().generation, pinned.generation);
        index.dispose();
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log('Structural sharing, immutable generations, bounded event storms, and coverage reporting passed.');
    return true;
}
