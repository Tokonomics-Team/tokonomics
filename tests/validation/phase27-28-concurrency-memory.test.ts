import * as assert from 'assert';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';

export async function runPhase27And28ConcurrencyMemoryValidation(): Promise<boolean> {
    console.log('--- Phase 27 & 28: Concurrency Stress & Memory Leak Envelopes ---');

    const orchestrator = new PipelineOrchestrator();
    const concurrentCount = 20;

    const baseHeap = process.memoryUsage().heapUsed;

    const tasks = Array.from({ length: concurrentCount }).map((_, idx) =>
        orchestrator.compileContext({
            messages: [
                { role: 'user', content: `Task ${idx}: Refactor and optimize module number ${idx} with class Module${idx} { execute() { return ${idx}; } }` }
            ],
            maxTokenBudget: 500,
            userIntent: 'refactor'
        })
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, concurrentCount, 'All concurrent compilations must resolve');

    const postHeap = process.memoryUsage().heapUsed;
    const growthMB = (postHeap - baseHeap) / (1024 * 1024);

    assert.ok(growthMB < 64, `Heap growth after ${concurrentCount} concurrent tasks must stay within envelope (<64MB, measured ${growthMB.toFixed(2)}MB)`);

    console.log(`  ✓ Concurrency (${concurrentCount} tasks) and memory envelope (+${growthMB.toFixed(2)}MB) verified.`);
    return true;
}
