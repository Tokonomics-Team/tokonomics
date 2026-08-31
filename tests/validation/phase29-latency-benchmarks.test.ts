import * as assert from 'assert';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';

export async function runPhase29LatencyBenchmarksValidation(): Promise<boolean> {
    console.log('--- Phase 29: Latency Percentile Benchmarking (p50, p90, p95, p99) ---');

    const orchestrator = new PipelineOrchestrator();
    const latencies: number[] = [];
    const iterations = 30;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await orchestrator.compileContext({
            messages: [
                { role: 'user', content: `Benchmark run ${i}: optimize class SampleService { run() { return true; } }` }
            ],
            maxTokenBudget: 500,
            userIntent: 'explain'
        });
        latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(iterations * 0.50)];
    const p90 = latencies[Math.floor(iterations * 0.90)];
    const p95 = latencies[Math.floor(iterations * 0.95)];
    const p99 = latencies[Math.floor(iterations * 0.99)];

    assert.ok(p50 < 50, `p50 latency must be <50ms (measured ${p50.toFixed(2)}ms)`);
    assert.ok(p99 < 200, `p99 latency must be <200ms (measured ${p99.toFixed(2)}ms)`);

    console.log(`  ✓ Percentile Latencies: p50=${p50.toFixed(2)}ms, p90=${p90.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms.`);
    return true;
}
