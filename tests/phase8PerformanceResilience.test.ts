import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BoundedPriorityScheduler, WorkCancelledError, WorkQueueFullError, WorkSupersededError } from '../src/performance/boundedScheduler';
import { CpuWorkerBoundary } from '../src/performance/cpuWorkerBoundary';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { AstPrunerEngine } from '../src/ast/pruner';
import { ToolSchemaMinifier } from '../src/cache/schemaMinifier';
import { GENERIC_DEFAULT_PROFILE, ModelProfileRegistry } from '../src/tokenizer/modelProfile';
import { CostReconciliationLedger } from '../src/cost/reconciliationLedger';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { ImageRightsizer } from '../src/engine/imageRightsizer';
import { ToolRegistry } from '../src/tools/toolIndex';
import { OnnxMemoryBoundedHost } from '../src/compression/onnxHost';
import { ProjectMemory } from '../src/memory/projectMemory';
import { ResponseCache, ResponseCacheRequest } from '../src/cache/responseCache';

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    return { promise: new Promise<void>(r => { resolve = r; }), resolve };
}

function writeFiles(root: string, from: number, to: number): void {
    for (let index = from; index < to; index++) {
        const directory = path.join(root, `group-${Math.floor(index / 250)}`);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, `file-${index}.ts`), `export function symbol${index}() { return ${index}; }\n`);
    }
}

export async function runPhase8PerformanceResilienceTests(): Promise<boolean> {
    console.log('\n--- Running Phase 8 Performance, Concurrency & Resilience Tests ---');

    // Priority, keyed coalescing, and capacity stay deterministic under pressure.
    const scheduler = new BoundedPriorityScheduler(1, 2, 2);
    const gate = deferred();
    const order: string[] = [];
    const running = scheduler.schedule({ priority: 'foreground' }, async () => { order.push('running'); await gate.promise; });
    const superseded = scheduler.schedule({ key: 'workspace:file', priority: 'warming' }, () => { order.push('old'); });
    const supersededAssertion = assert.rejects(superseded, error => error instanceof WorkSupersededError);
    const newest = scheduler.schedule({ key: 'workspace:file', priority: 'warming' }, () => { order.push('new'); });
    const foreground = scheduler.schedule({ priority: 'foreground' }, () => { order.push('foreground'); });
    assert.ok(scheduler.getStats().queued <= scheduler.getStats().capacity);
    gate.resolve();
    await Promise.all([running, newest, foreground, supersededAssertion]);
    assert.deepStrictEqual(order, ['running', 'foreground', 'new']);

    const capacityScheduler = new BoundedPriorityScheduler(1, 1);
    const capacityGate = deferred();
    const capacityRunning = capacityScheduler.schedule({ priority: 'foreground' }, () => capacityGate.promise);
    const displaced = capacityScheduler.schedule({ priority: 'warming' }, () => undefined);
    const displacedAssertion = assert.rejects(displaced, error => error instanceof WorkSupersededError);
    const admittedForeground = capacityScheduler.schedule({ priority: 'foreground' }, () => undefined);
    await assert.rejects(capacityScheduler.schedule({ priority: 'foreground' }, () => undefined), error => error instanceof WorkQueueFullError);
    capacityGate.resolve();
    await Promise.all([capacityRunning, admittedForeground, displacedAssertion]);
    assert.ok(capacityScheduler.getStats().peakQueued <= 1);

    const fairScheduler = new BoundedPriorityScheduler(1, 4, 2);
    const fairGate = deferred();
    const fairOrder: string[] = [];
    const fairRunning = fairScheduler.schedule({ priority: 'foreground' }, async () => { fairOrder.push('running'); await fairGate.promise; });
    const fairForegroundA = fairScheduler.schedule({ priority: 'foreground' }, () => { fairOrder.push('foreground-a'); });
    const fairForegroundB = fairScheduler.schedule({ priority: 'foreground' }, () => { fairOrder.push('foreground-b'); });
    const fairBackground = fairScheduler.schedule({ priority: 'warming' }, () => { fairOrder.push('warming'); });
    fairGate.resolve();
    await Promise.all([fairRunning, fairForegroundA, fairForegroundB, fairBackground]);
    assert.deepStrictEqual(fairOrder, ['running', 'foreground-a', 'warming', 'foreground-b']);

    // Cancellation is observed inside running cooperative work, not only while queued.
    const cancellation = { isCancellationRequested: false };
    const entered = deferred();
    const cancellable = scheduler.schedule({ priority: 'foreground', cancellation }, async context => {
        entered.resolve();
        for (let index = 0; index < 100; index++) await context.yield();
    });
    await entered.promise;
    cancellation.isCancellationRequested = true;
    await assert.rejects(cancellable, error => error instanceof WorkCancelledError);

    // A saturated foreground queue fails open to an explicit raw pass-through,
    // while still retaining a machine-readable fallback reason.
    const fallbackScheduler = new BoundedPriorityScheduler(1, 1);
    const fallbackGate = deferred();
    const occupied = fallbackScheduler.schedule({ priority: 'foreground' }, () => fallbackGate.promise);
    const queued = fallbackScheduler.schedule({ priority: 'foreground' }, () => undefined);
    const compiler = new CanonicalRequestCompiler(new PipelineOrchestrator(), fallbackScheduler);
    const fallbackCompilation = await compiler.compile({ messages: [{ role: 'user', parts: [{ kind: 'text', text: 'Preserve this request exactly.' }] }] });
    assert.ok(fallbackCompilation.compilation.event.fallbackReasons?.includes('foreground_queue_full_pass_through'));
    assert.strictEqual(fallbackCompilation.messages[0].parts[0].kind, 'text');
    fallbackGate.resolve();
    await Promise.all([occupied, queued]);

    // Parser/sanitizer/pipeline failures preserve the source payload and expose a
    // code rather than provider or source error text.
    FeatureFlagRegistry.setPipelineMode('compiler');
    const failingPipeline = new PipelineOrchestrator();
    (failingPipeline as any).compressor = { compress: async () => { throw new Error('sensitive implementation detail'); } };
    const failedStage = await failingPipeline.compileContext({
        requestId: 'phase8-fallback',
        messages: [
            { role: 'system', content: 'Keep this system instruction.' },
            { role: 'user', content: 'Keep this instruction.\n```ts\nexport const value = 1;\n```' }
        ]
    });
    assert.deepStrictEqual(failedStage.optimizedMessages.map(message => message.content), [
        'Keep this system instruction.', 'Keep this instruction.\n```ts\nexport const value = 1;\n```'
    ]);
    assert.ok(failedStage.event.fallbackReasons?.includes('compiler_pipeline_failure_pass_through'));
    assert.ok(!JSON.stringify(failedStage.trace).includes('sensitive implementation detail'));

    // Registries and reconciliation state have hard memory ceilings.
    ToolSchemaMinifier.clearRegistry();
    ToolSchemaMinifier.registerTools(Array.from({ length: 400 }, (_, index) => ({ name: `tool-${index}`, parameters: {} })));
    assert.strictEqual(ToolSchemaMinifier.getRegistrySize(), 256);
    ModelProfileRegistry.clearCustomProfiles();
    for (let index = 0; index < 100; index++) ModelProfileRegistry.registerProfile({ ...GENERIC_DEFAULT_PROFILE, modelId: `custom-${index}` });
    assert.ok(ModelProfileRegistry.getAllProfiles().length <= 64 + 10);
    const economics = new CostReconciliationLedger(32);
    for (let index = 0; index < 100; index++) economics.begin({ requestId: `request-${index}`, provider: 'test', model: 'test', unoptimizedInputTokens: 100 });
    assert.strictEqual(economics.getStats().pending, 32);
    const toolRegistry = new ToolRegistry();
    for (let index = 0; index < 400; index++) toolRegistry.registerTool({ name: `registered-${index}`, description: '', parameters: {}, isMutating: false, category: 'generic' });
    assert.strictEqual(toolRegistry.getAllTools().length, 256);
    const onnx = new OnnxMemoryBoundedHost({ maxSessions: 2, maxMemoryMB: 10 });
    assert.strictEqual(onnx.registerSession('one', 1024), true);
    assert.strictEqual(onnx.registerSession('two', 1024), true);
    assert.strictEqual(onnx.registerSession('three', 0), false, 'zero-byte sessions must not bypass the session ceiling');
    assert.strictEqual(onnx.registerSession('one', 2048), true);
    assert.strictEqual(onnx.getMemoryStats().activeModels, 2);
    const projectMemory = new ProjectMemory();
    for (let index = 0; index < 1_100; index++) projectMemory.addItem({ id: `memory-${index}`, type: 'decision', title: 'bounded', description: 'bounded', status: 'active', confidence: 1 });
    assert.strictEqual(projectMemory.getActiveItems().length, 1_000);
    const responseCache = new ResponseCache(100, 60_000, 0.88, 64, 512);
    const cacheRequest: ResponseCacheRequest = {
        requestText: 'bounded response', conversation: [],
        workspace: { roots: ['root'], snapshotGeneration: 1, ignorePolicyVersion: 'v1', files: [] },
        evidence: [], model: { provider: 'test', id: 'test' }, tools: [], compilerConfiguration: {}, policies: {},
        extensionVersion: 'test', safety: { intent: 'question' }
    };
    assert.strictEqual(responseCache.store(cacheRequest, 'x'.repeat(65), 'completed'), false);
    for (let index = 0; index < 20; index++) responseCache.store({ ...cacheRequest, requestText: `bounded-${index}` }, 'y'.repeat(50), 'completed');
    assert.ok(responseCache.estimateMemoryBytes() <= 512);

    const imageOptimizer = new ImageRightsizer({ preserveVisualData: false, maxDimension: 64 });
    const inlineImage = `data:image/png;base64,${Buffer.alloc(250 * 1024, 7).toString('base64')}`;
    const imageResult = await imageOptimizer.rightsizeInlineImagesAsync(inlineImage, new CpuWorkerBoundary(10_000));
    assert.strictEqual(imageResult.stats.wasProcessed, true);
    assert.ok(imageResult.text.startsWith('[Optimized Image Context:'));
    const preservedOnWorkerLimit = await imageOptimizer.rightsizeInlineImagesAsync(inlineImage, new CpuWorkerBoundary(10_000, 16));
    assert.strictEqual(preservedOnWorkerLimit.text, inlineImage, 'worker failure must preserve, not decode again on the extension host');

    // Real filesystem scale checkpoints exercise 100, 1,000, and 10,000 files.
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase8-'));
    const scaleScheduler = new BoundedPriorityScheduler(2, 64);
    const worker = new CpuWorkerBoundary(30_000);
    let parserPreparations = 0;
    const index = new VersionedWorkspaceIndex([workspaceRoot], new AstPrunerEngine(), {
        budgetMB: 16, maxFileBytes: 8 * 1024, debounceMs: 10, scheduler: scaleScheduler,
        workerBoundary: worker, prepareParser: async () => { parserPreparations++; }, maxCandidateFiles: 10_000
    });
    assert.strictEqual(parserPreparations, 0, 'constructing services during activation must not initialize parsers');
    const scaleDurations: Record<string, number> = {};
    let eventLoopTicks = 0;
    const tick = setInterval(() => { eventLoopTicks++; }, 0);
    try {
        writeFiles(workspaceRoot, 0, 100);
        let started = Date.now();
        let snapshot = await index.initialize();
        scaleDurations['100'] = Date.now() - started;
        assert.strictEqual(snapshot.files.size, 100);

        writeFiles(workspaceRoot, 100, 1_000);
        started = Date.now();
        snapshot = await index.rebuild();
        scaleDurations['1000'] = Date.now() - started;
        assert.strictEqual(snapshot.files.size, 1_000);

        writeFiles(workspaceRoot, 1_000, 10_000);
        started = Date.now();
        snapshot = await index.rebuild();
        scaleDurations['10000'] = Date.now() - started;
        assert.strictEqual(snapshot.files.size, 10_000);
        assert.ok(snapshot.memoryBytes <= 16 * 1024 * 1024);
        assert.ok(eventLoopTicks > 10, 'workspace indexing must yield to the extension event loop');
        assert.ok(scaleDurations['10000'] < 60_000, '10,000-file bounded fixture exceeded the documented test ceiling');

        const map = await index.generateRepoMapAsync([], 256, snapshot);
        assert.ok(map.rankedSymbolsCount > 0);
        assert.ok(map.tokenCount <= 256);

        const stormIndex = new VersionedWorkspaceIndex([workspaceRoot], new AstPrunerEngine(), { debounceMs: 1_000, maxPendingUpdates: 32 });
        for (let edit = 0; edit < 500; edit++) stormIndex.scheduleUpsert(path.join(workspaceRoot, `storm-${edit}.ts`), { text: `export const v = ${edit};`, version: edit });
        const storm = stormIndex.getOperationalStats();
        assert.ok(storm.pendingUpdates <= storm.maxPendingUpdates);
        assert.strictEqual(storm.rebuildAfterStorm, true);
        stormIndex.dispose();
    } finally {
        clearInterval(tick);
        index.dispose();
        worker.dispose();
        scaleScheduler.dispose();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
    scheduler.dispose();
    capacityScheduler.dispose();
    fairScheduler.dispose();
    fallbackScheduler.dispose();

    console.log(`[Phase 8 Scale] 100=${scaleDurations['100']}ms | 1,000=${scaleDurations['1000']}ms | 10,000=${scaleDurations['10000']}ms | event-loop ticks=${eventLoopTicks}`);
    console.log('Phase 8 bounded scheduling, lazy activation, worker isolation, scale, cancellation, cache, and fallback contracts passed.');
    return true;
}
