import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceIdentity } from '../src/workspace/workspaceIdentity';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { AstPrunerEngine } from '../src/ast/pruner';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { canonicalTextMessage } from '../src/protocol/canonicalProtocol';

export async function runPhase3WorkspaceSnapshotTests(): Promise<void> {
    console.log('Running Phase 3 versioned workspace snapshot tests...');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase3-'));
    const rootA = path.join(temp, 'root-a');
    const rootB = path.join(temp, 'root-b');
    fs.mkdirSync(path.join(rootA, 'src'), { recursive: true });
    fs.mkdirSync(path.join(rootB, 'src'), { recursive: true });
    const aFile = path.join(rootA, 'src', 'service.ts');
    const bFile = path.join(rootB, 'src', 'service.ts');
    fs.writeFileSync(aFile, 'export class AlphaService { run(): void {} }\n');
    fs.writeFileSync(bFile, 'export function BetaService(): number { return 2; }\n');

    try {
        const identity = new WorkspaceIdentity([rootA, rootB]);
        const identityA = identity.identify(aFile)!;
        const identityB = identity.identify(bFile)!;
        assert.notStrictEqual(identityA.key, identityB.key);
        assert.strictEqual(identity.identify(path.join(temp, 'outside.ts')), undefined);
        const restricted = new VersionedWorkspaceIndex([rootA], new AstPrunerEngine(), { trusted: false });
        assert.strictEqual((await restricted.initialize()).files.size, 0);
        assert.strictEqual(restricted.getStats().ignorePolicyVersion, 'untrusted');
        restricted.dispose();
        const nestedIdentity = new WorkspaceIdentity([rootA, path.join(rootA, 'src')]);
        assert.strictEqual(nestedIdentity.identify(aFile)!.rootId, nestedIdentity.roots[0].id,
            'nested file did not select its most specific workspace root');
        const outsideDir = path.join(temp, 'outside');
        const outsideFile = path.join(outsideDir, 'escape.ts');
        fs.mkdirSync(outsideDir);
        fs.writeFileSync(outsideFile, 'export class EscapedSecret {}\n');
        try {
            const link = path.join(rootA, 'linked-outside');
            fs.symlinkSync(outsideDir, link, process.platform === 'win32' ? 'junction' : 'dir');
            assert.strictEqual(identity.identify(path.join(link, 'escape.ts')), undefined, 'symlink escape acquired a workspace identity');
        } catch {
            // Some Windows policies disallow link creation; source-policy tests cover the same invariant.
        }

        const index = new VersionedWorkspaceIndex([rootA, rootB], new AstPrunerEngine(), {
            budgetMB: 1, maxFileBytes: 900 * 1024, debounceMs: 1
        });
        const initial = await index.initialize();
        assert.strictEqual(initial.files.size, 2);
        assert.ok(index.searchRelevantSlices('AlphaService', 5, initial).some(slice => slice.name === 'AlphaService'));
        assert.ok(index.searchRelevantSlices('BetaService', 5, initial).some(slice => slice.name === 'BetaService'));
        assert.strictEqual(typeof (initial.files as any).set, 'undefined', 'snapshot map exposes mutation methods');
        assert.strictEqual(typeof (initial.symbols[0].terms as any).add, 'undefined', 'snapshot symbol terms expose mutation methods');

        const oldHash = initial.files.get(identityA.key)!.contentHash;
        await index.upsert(aFile, { text: 'export class GammaService { execute(): void {} }\n', version: 7 });
        const changed = index.captureSnapshot();
        assert.ok(changed.generation > initial.generation);
        assert.strictEqual(initial.files.get(identityA.key)!.contentHash, oldHash, 'captured snapshot was mutated');
        assert.strictEqual(changed.files.get(identityA.key)!.sourceVersion, 'buffer:7');
        assert.ok(index.searchRelevantSlices('GammaService', 5, changed).some(slice => slice.name === 'GammaService'));
        assert.ok(!index.searchRelevantSlices('GammaService', 5, initial).some(slice => slice.name === 'GammaService'));

        const created = path.join(rootA, 'src', 'created.ts');
        fs.writeFileSync(created, 'export interface CreatedContract { id: string }\n');
        assert.strictEqual(await index.upsert(created), true);
        assert.ok(index.searchRelevantSlices('CreatedContract').length > 0);

        const renamed = path.join(rootA, 'src', 'renamed.ts');
        fs.renameSync(created, renamed);
        const beforeRenameGeneration = index.captureSnapshot().generation;
        assert.strictEqual(await index.rename(created, renamed), true);
        const renameSnapshot = index.captureSnapshot();
        assert.strictEqual(renameSnapshot.generation, beforeRenameGeneration + 1, 'rename was not one atomic publication');
        assert.ok(![...renameSnapshot.files.values()].some(file => file.relativePath.endsWith('created.ts')));
        assert.ok([...renameSnapshot.files.values()].some(file => file.relativePath.endsWith('renamed.ts')));

        const staleRead = index.upsert(renamed);
        index.delete(renamed);
        assert.strictEqual(await staleRead, false, 'late read overwrote a newer delete');
        assert.ok(!index.searchRelevantSlices('CreatedContract').length);

        const ignored = path.join(rootA, 'src', 'ignored.ts');
        fs.writeFileSync(ignored, 'export class MustStayIgnored {}\n');
        await index.upsert(ignored);
        assert.ok(index.searchRelevantSlices('MustStayIgnored').some(slice => slice.name === 'MustStayIgnored'));
        fs.writeFileSync(path.join(rootA, '.tokenignore'), 'src/ignored.ts\n');
        await index.rebuild();
        assert.ok(!index.searchRelevantSlices('MustStayIgnored').some(slice => slice.name === 'MustStayIgnored'));
        const generatedDir = path.join(rootA, 'tests', 'generated');
        fs.mkdirSync(generatedDir, { recursive: true });
        for (let fileIndex = 0; fileIndex < 24; fileIndex++) {
            const references = Array.from({ length: 1_000 }, (_, itemIndex) => `MemoryReference${fileIndex}_${itemIndex}`).join(' ');
            fs.writeFileSync(path.join(generatedDir, `memory-${fileIndex}.ts`), `export class MemoryFixture${fileIndex} {}\n// ${references}\n`);
        }
        await index.rebuild();
        assert.ok(index.getStats().memoryBytes <= index.getStats().budgetBytes);
        assert.ok(index.getStats().filesIndexed < 26, 'priority admission did not evict records at the memory ceiling');

        const pinned = index.captureSnapshot();
        const compiler = new CanonicalRequestCompiler(new PipelineOrchestrator(undefined, undefined, undefined, undefined, index));
        let retrievals = 0;
        const originalSearch = index.searchRelevantSlices.bind(index);
        (index as any).searchRelevantSlices = (...args: any[]) => { retrievals++; return originalSearch(...args as [string, number]); };
        await compiler.compile({ messages: [canonicalTextMessage('user', 'Explain AlphaService')], workspaceSnapshot: pinned });
        assert.strictEqual(retrievals, 0, 'snapshot presence silently authorized workspace retrieval');
        const compilationPromise = compiler.compile({
            messages: [canonicalTextMessage('user', 'Explain AlphaService')], workspaceSnapshot: pinned, allowWorkspaceRetrieval: true
        });
        await index.upsert(bFile, { text: 'export function NewerVersion() {}\n', version: 99 });
        const compiled = await compilationPromise;
        assert.strictEqual(compiled.compilation.snapshotGeneration, pinned.generation,
            'one request observed more than one workspace generation');
        assert.strictEqual(retrievals, 0, 'Phase 4 retrieval must consume only the request-pinned snapshot');
        assert.strictEqual(compiled.compilation.evidenceRetrieval?.contract.taskType, 'explain');

        const map = index.generateRepoMap([aFile], 256, pinned);
        assert.strictEqual(map.totalFilesIndexed, pinned.files.size);
        assert.ok(map.tokenCount <= 256);
        index.updateBudgetMB(1);
        assert.ok(index.getStats().memoryBytes <= index.getStats().budgetBytes);
        index.setTrusted(false);
        assert.strictEqual(index.captureSnapshot().files.size, 0, 'revoking trust retained workspace records');
        index.dispose();

        const raceIndex = new VersionedWorkspaceIndex([rootB], new AstPrunerEngine(), { debounceMs: 1 });
        const backgroundScan = raceIndex.initialize();
        await raceIndex.upsert(bFile, { text: 'export function UnsavedWins() {}\n', version: 101 });
        await backgroundScan;
        assert.strictEqual([...raceIndex.captureSnapshot().files.values()][0].sourceVersion, 'buffer:101',
            'background scan superseded a newer editor-buffer version');
        raceIndex.dispose();
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
    console.log('Phase 3 versioned workspace snapshot tests passed.');
}
