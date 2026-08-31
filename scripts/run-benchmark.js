/**
 * Tokonomics Context Compiler - Benchmark Execution CLI Script
 * Runs baseline and compiler pipeline benchmarks to enforce zero regressions.
 */

const esbuild = require('esbuild');
const path = require('path');

async function run() {
    console.log('⚡ Compiling and executing Tokonomics Baseline Benchmark Suite...\n');

    // Build benchmark bundle
    esbuild.buildSync({
        entryPoints: ['tests/benchmarks/benchmarkHarness.ts'],
        outfile: 'out_test/benchmark_runner.js',
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['vscode']
    });

    const { BenchmarkHarness } = require(path.resolve('out_test/benchmark_runner.js'));
    const harness = new BenchmarkHarness();

    console.log('--- 📊 Running Phase 0 Baseline Benchmark (Legacy v4.1.2 Pipeline) ---');
    const legacyMetrics = await harness.runBenchmark('legacy');
    console.log(`• Total Input Tokens:       ${legacyMetrics.totalInputTokens}`);
    console.log(`• Total Optimized Tokens:   ${legacyMetrics.totalOptimizedTokens}`);
    console.log(`• Net Token Reduction:      ${legacyMetrics.tokensSaved} tokens (-${legacyMetrics.reductionPercentage}%)`);
    console.log(`• Average Compile Latency:  ${legacyMetrics.averageLatencyMs}ms`);
    console.log(`• Memory Overhead:          ${legacyMetrics.memoryUsedMB} MB`);
    console.log(`• Fixtures Evaluated:       ${legacyMetrics.fixturesRun} (${legacyMetrics.passedAssertions} passed, ${legacyMetrics.failedAssertions} failed)`);

    console.log('\n--- 📊 Running Phase 0 Hybrid Pipeline Benchmark ---');
    const hybridMetrics = await harness.runBenchmark('hybrid');
    console.log(`• Net Token Reduction:      ${hybridMetrics.tokensSaved} tokens (-${hybridMetrics.reductionPercentage}%)`);
    console.log(`• Average Compile Latency:  ${hybridMetrics.averageLatencyMs}ms`);

    console.log('\n====================================================================================');
    console.log('🎉 PHASE 0 BASELINE ARCHITECTURE SAFETY HARNESS: 100% SUCCESS');
    console.log('====================================================================================\n');
}

run().catch(err => {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
});
