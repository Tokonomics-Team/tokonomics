import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { AstPrunerEngine } from '../src/ast/pruner';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { BoundedPriorityScheduler } from '../src/performance/boundedScheduler';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { canonicalTextMessage } from '../src/protocol/canonicalProtocol';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';

function percentile(values: number[], quantile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function rounded(value: number): number {
    return Math.round(value * 1000) / 1000;
}

async function main(): Promise<void> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-v7-phase0-'));
    const scheduler = new BoundedPriorityScheduler(2, 32);
    const memoryStart = process.memoryUsage();
    let maxEventLoopDelay = 0;
    let expectedTick = performance.now() + 2;
    const monitor = setInterval(() => {
        const now = performance.now();
        maxEventLoopDelay = Math.max(maxEventLoopDelay, Math.max(0, now - expectedTick));
        expectedTick = now + 2;
    }, 2);
    const index = new VersionedWorkspaceIndex([root], new AstPrunerEngine(), {
        budgetMB: 8,
        maxFileBytes: 64 * 1024,
        maxCandidateFiles: 1_000,
        debounceMs: 5,
        scheduler
    });

    try {
        for (let file = 0; file < 250; file++) {
            const marker = file === 137 ? ' CriticalPaymentRecoveryTarget' : '';
            fs.writeFileSync(path.join(root, `module-${file}.ts`),
                `export function service${file}(value: number): number { return value + ${file}; } //${marker}\n`);
        }

        let started = performance.now();
        const snapshot = await index.initialize();
        const indexBuildLatencyMs = performance.now() - started;
        started = performance.now();
        await index.rebuild();
        const indexRebuildLatencyMs = performance.now() - started;

        const retrievalLatencies: number[] = [];
        let targetFound = false;
        for (let run = 0; run < 15; run++) {
            started = performance.now();
            const matches = index.searchRelevantSlices('CriticalPaymentRecoveryTarget service137', 10, snapshot);
            retrievalLatencies.push(performance.now() - started);
            targetFound = targetFound || matches.some(match => match.name === 'service137');
        }

        FeatureFlagRegistry.resetToDefault();
        FeatureFlagRegistry.setPipelineMode('compiler');
        const compiler = new CanonicalRequestCompiler(new PipelineOrchestrator(undefined, undefined, undefined, undefined, index));
        const request = {
            messages: [canonicalTextMessage('user', 'Explain CriticalPaymentRecoveryTarget and preserve REQUIRED_MARKER.')],
            workspaceSnapshot: snapshot,
            allowWorkspaceRetrieval: true
        };
        started = performance.now();
        const cold = await compiler.compile(request);
        const coldCompileLatencyMs = performance.now() - started;
        const warmLatencies: number[] = [];
        let warm = cold;
        for (let run = 0; run < 7; run++) {
            started = performance.now();
            warm = await compiler.compile(request);
            warmLatencies.push(performance.now() - started);
        }
        const rendered = JSON.stringify(warm.messages);
        const memoryPeak = process.memoryUsage();
        clearInterval(monitor);
        index.dispose();
        scheduler.dispose();
        if (typeof global.gc === 'function') global.gc();
        const memoryRetained = process.memoryUsage();
        const operational = index.getOperationalStats();

        const result = {
            fixtureKind: 'controlled-local-synthetic',
            filesIndexed: snapshot.files.size,
            symbolsIndexed: snapshot.symbols.length,
            indexBuildLatencyMs: rounded(indexBuildLatencyMs),
            indexRebuildLatencyMs: rounded(indexRebuildLatencyMs),
            coldCompileLatencyMs: rounded(coldCompileLatencyMs),
            warmCompileLatencyMs: rounded(percentile(warmLatencies, 0.5)),
            warmCompileP95LatencyMs: rounded(percentile(warmLatencies, 0.95)),
            retrievalLatencyMs: rounded(percentile(retrievalLatencies, 0.5)),
            retrievalP95LatencyMs: rounded(percentile(retrievalLatencies, 0.95)),
            criticalEvidenceRecall: targetFound ? 1 : 0,
            preservationRate: rendered.includes('REQUIRED_MARKER') ? 1 : 0,
            peakQueueDepth: scheduler.getStats().peakQueued,
            eventLoopDelayMs: rounded(maxEventLoopDelay),
            heapDeltaBytes: memoryRetained.heapUsed - memoryStart.heapUsed,
            rssDeltaBytes: memoryRetained.rss - memoryStart.rss,
            peakHeapBytes: memoryPeak.heapUsed,
            peakRssBytes: memoryPeak.rss,
            originalTokens: warm.compilation.originalTokens,
            optimizedTokens: warm.compilation.optimizedTokens,
            projectedCostSavedUsd: warm.compilation.effectiveCostSavedUSD,
            snapshotGeneration: snapshot.generation,
            pendingQueueDepthAfterDispose: operational.pendingUpdates
        };
        process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
        clearInterval(monitor);
        FeatureFlagRegistry.resetToDefault();
        index.dispose();
        scheduler.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
});
