/**
 * Phase 15 Unit Tests: Ablation Matrix & CQ Calibration
 */

import { AblationMatrixRunner } from './benchmarks/ablationMatrix';

export function runAblationTests(): boolean {
    console.log('\n--- Running Phase 15 Ablation Matrix & Calibration Tests ---');

    const runner = new AblationMatrixRunner();
    const meta = runner.getMetadata();
    const results = runner.runMatrix();

    if (results.length < 5) {
        throw new Error(`Ablation matrix produced insufficient variants (${results.length})`);
    }

    const fullVariant = results.find(r => r.variantId === 'full_compiler')!;
    const noMlVariant = results.find(r => r.variantId === 'no_ml_core')!;

    // Assert Full Compiler achieves >= 90% CQ
    if (fullVariant.predictedCQ < 90.0) {
        throw new Error(`Full compiler failed CQ target: ${fullVariant.predictedCQ}%`);
    }

    // Assert No-ML Core achieves >= 80% CQ with < 0.3MB component heap
    if (noMlVariant.predictedCQ < 80.0 || noMlVariant.measuredComponentHeapMB > 0.3) {
        throw new Error(`No-ML Core failed metric thresholds: CQ=${noMlVariant.predictedCQ}%, Heap=${noMlVariant.measuredComponentHeapMB}MB`);
    }

    console.log('\n============================= ABLATION MATRIX BENCHMARK =============================');
    console.log(`• Benchmark Corpus: ${meta.benchmarkCorpus} | Date: ${meta.measurementDate}`);
    console.log(`• Target Model:     ${meta.targetModel} (${meta.targetProvider}) | Median Context: ${meta.medianContextTokens.toLocaleString()} tokens`);
    console.log('-------------------------------------------------------------------------------------');
    for (const r of results) {
        console.log(`• [${r.variantName}]`);
        console.log(`  Tokens: ${r.inputTokens} (-${r.reductionPercentage}%) | CQ: ${r.predictedCQ}% | Cost Savings: ${r.costSavingsPercentage}%`);
        console.log(`  Latency: p50=${r.latency.p50Ms}ms, p90=${r.latency.p90Ms}ms, p95=${r.latency.p95Ms}ms, p99=${r.latency.p99Ms}ms (mean: ${r.latency.meanMs}ms)`);
        console.log(`  Memory:  Component Heap=${r.measuredComponentHeapMB} MB | Process RSS Base=~${r.processRssBaselineMB} MB`);
    }
    console.log('=====================================================================================\n');

    console.log('✓ Ablation Matrix & Percentile Benchmark verified.');

    return true;
}
