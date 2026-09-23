import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { BoundedPriorityScheduler, WorkCancelledError, WorkQueueFullError } from '../src/performance/boundedScheduler';
import { RequestLifecycleCapacityError, RequestLifecycleController } from '../src/performance/requestLifecycle';
import { RequestLedger } from '../src/events/requestLedger';
import { PromptOptimizationEvent } from '../src/events/optimizationEvent';
import { TaskWorkerPool } from '../src/performance/workerPool';
import { LocalHistoryStore } from '../src/history/localHistoryStore';

class CancellationFixture {
    public isCancellationRequested = false;
    private listeners = new Set<() => void>();
    public onCancellationRequested(listener: () => void) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
    public cancel(): void {
        this.isCancellationRequested = true;
        for (const listener of [...this.listeners]) listener();
    }
}

function lifecycleEvent(id: string, timestamp: number): PromptOptimizationEvent {
    return {
        id, timestamp, sessionId: 'v7-phase3', state: 'PROMPT_COMPLETED', taskType: 'general', taskConfidence: 1,
        provider: 'unknown', model: 'unknown', rawInputTokens: 10, optimizedInputTokens: 8, savedTokens: 2,
        reductionPercentage: 20, cacheableTokens: 0, projectedRawCostUSD: 0, projectedOptimizedCostUSD: 0,
        projectedSavingsUSD: 0, isCostReconciled: false, costStatus: 'unavailable', predictedCQ: 100,
        evidenceCoverage: 1, sliceConfidence: 1, cqRating: 'EXCELLENT', totalOptimizationLatencyMs: 1,
        stageMetrics: [], contextItemCount: 0, traceId: `${id}:complete`
    };
}

export async function runV7Phase3LifecycleResourceTests(): Promise<void> {
    console.log('\n--- Running v7.0.1 Phase 3 Lifecycle, Backpressure & Disposal Tests ---');

    const controller = new RequestLifecycleController(2, 2);
    const first = controller.begin('first', undefined, 1_000);
    assert.throws(() => controller.begin('first'), /REQUEST_ID_NOT_UNIQUE/);
    const second = controller.begin('second', undefined, 1_000);
    assert.throws(() => controller.begin('third'), RequestLifecycleCapacityError);
    assert.strictEqual(first.complete(), true);
    assert.strictEqual(first.complete(), false, 'Completion must be exactly once');
    assert.strictEqual(first.completionCount, 1);
    assert.strictEqual(controller.getActiveCount(), 1);
    second.fail();

    for (let index = 0; index < 10_000; index++) {
        const scope = controller.begin(`stress-${index}`, undefined, 1_000);
        scope.complete();
    }
    assert.strictEqual(controller.getActiveCount(), 0, '10,000 completed requests must retain no active lifecycle state');

    const timed = controller.begin('timed', undefined, 15);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(timed.outcome, 'timed_out');
    assert.strictEqual(timed.completionCount, 1);

    const cancellation = new CancellationFixture();
    const cancelled = controller.begin('cancelled', cancellation, 1_000);
    const cancellationStarted = performance.now();
    const child = cancelled.runChild('hung-provider', async () => new Promise<string>(() => undefined));
    cancellation.cancel();
    await assert.rejects(child, WorkCancelledError);
    assert.ok(performance.now() - cancellationStarted < 100, 'Cancellation must settle promptly without polling');
    assert.strictEqual(cancelled.outcome, 'cancelled');

    const deadlineScheduler = new BoundedPriorityScheduler(1, 2, 4, 32, 1);
    await assert.rejects(
        deadlineScheduler.schedule({ priority: 'foreground', deadlineMs: Date.now() + 15, estimatedBytes: 4 },
            async () => new Promise(() => undefined)),
        WorkCancelledError
    );
    assert.strictEqual(deadlineScheduler.getStats().running, 0);
    deadlineScheduler.dispose();

    const admission = new BoundedPriorityScheduler(1, 2, 4, 10, 1);
    const blocker = admission.schedule({ priority: 'foreground', estimatedBytes: 1 }, async () => new Promise<string>(() => undefined));
    void blocker.catch(() => undefined);
    const background = admission.schedule({ priority: 'index', estimatedBytes: 6 }, async () => 'background');
    await assert.rejects(admission.schedule({ priority: 'warming', estimatedBytes: 6 }, async () => 'overflow'), WorkQueueFullError);
    const foreground = admission.schedule({ priority: 'foreground', estimatedBytes: 6 }, async () => 'foreground');
    await assert.rejects(background, /displaced|superseded/i);
    admission.dispose();
    await assert.rejects(foreground, WorkCancelledError);

    let persistenceWrites = 0;
    let persisted: unknown;
    const ledger = new RequestLedger({ maxEntries: 200, maxRequests: 50, maxBytes: 100_000, persistenceDebounceMs: 20 });
    ledger.configurePersistence({
        get: <T>(_key: string, fallback?: T) => fallback as T,
        update: async (_key: string, value: unknown) => { persistenceWrites++; persisted = value; }
    });
    for (let index = 0; index < 10_000; index++) ledger.append(lifecycleEvent(`ledger-${index}`, index + 1));
    const storage = ledger.getStorageStats();
    assert.ok(storage.entries <= 200 && storage.requests <= 50 && storage.bytes <= 100_000);
    assert.strictEqual(persistenceWrites, 0, 'Rapid appends must be batched before persistence');
    await ledger.flushPersistence();
    assert.strictEqual(persistenceWrites, 1, 'One checkpoint must persist the bounded ledger');
    assert.ok(Array.isArray(persisted) && persisted.length <= 200);
    ledger.dispose();

    const authoritative = RequestLedger.getInstance();
    authoritative.clear();
    const history = new LocalHistoryStore();
    history.saveEvent(lifecycleEvent('history-projection', Date.now()));
    assert.strictEqual(history.getRecords(10).at(-1)?.id, 'history-projection');
    assert.ok(!fs.readFileSync(path.join(process.cwd(), 'src/history/localHistoryStore.ts'), 'utf8').includes('records: PromptMetadataRecord[]'),
        'History must be a ledger projection, not a second mutable store');

    const pool = new TaskWorkerPool({ minWorkers: 0, maxWorkers: 1, idleShrinkMs: 20, maxQueuedTasks: 1, maxQueuedBytes: 1024 });
    assert.strictEqual(pool.getStats().totalWorkers, 0);
    assert.strictEqual(await pool.execute<string>('ping', {}), 'pong');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(pool.getStats().totalWorkers, 0, 'Idle workers above the minimum must shrink');
    pool.dispose();
    const workerSource = fs.readFileSync(path.join(process.cwd(), 'src/performance/workerPool.ts'), 'utf8');
    assert.ok(!workerSource.includes('setInterval('), 'Worker cancellation must not use polling intervals');

    controller.dispose();
    console.log('✓ Exactly-once lifecycle, prompt cancellation, deadlines, byte/item backpressure, lazy workers, bounded ledger, and disposal passed.');
}
