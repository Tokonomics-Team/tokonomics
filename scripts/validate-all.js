/**
 * Tokonomics Master Validation & Verification Suite (validate:all)
 * Executes all 28 validation phases:
 * Architecture audit, static integrity, property testing, legacy differential,
 * unit & integration suites, deterministic governor, retrieval, solver, SDG,
 * compression, cache, layer ablation, code accuracy evaluation, and canonical reporting.
 */

const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🏛️  TOKONOMICS MASTER NON-PRODUCTION VALIDATION SUITE (VALIDATE:ALL)');
    console.log('====================================================================================\n');

    const outTestDir = path.resolve(__dirname, '..', 'out_test');
    if (!fs.existsSync(outTestDir)) {
        fs.mkdirSync(outTestDir, { recursive: true });
    }

    const runnerBundlePath = path.resolve(outTestDir, 'validate_all_runner.js');
    const entryPath = path.resolve(outTestDir, 'validate_all_entry.ts');

    const entryContent = `
import { runGovernorTests } from '../tests/governor.test';
import { ReportGenerator } from '../validation/reports/reportGenerator';
import { LatencyBreakdownProfiler } from '../src/evaluation/latencyProfiler';
import { MemoryProfiler } from '../src/evaluation/memoryProfiler';
import { AdversarialSdgEvaluator } from '../src/evaluation/adversarialSdgCorpus';
import { NetworkAuditEngine } from '../src/evaluation/networkAuditEngine';
import { MutationEngine } from '../src/evaluation/mutationEngine';
import { IndependentOracleEvaluator } from '../src/evaluation/independentOracles';

export async function runAllValidationPhases() {
    console.log('>>> [1/4] EXECUTING DETERMINISTIC CONTEXT GOVERNOR INVARIANTS...');
    runGovernorTests();

    console.log('\\n>>> [2/4] EXECUTING DEEP PROFILERS, ORACLES & MUTATION ENGINES...');
    const latencyReport = await LatencyBreakdownProfiler.profileAllStages(30);
    const memoryReport = await MemoryProfiler.runCompleteAudit();
    const sdgReport = AdversarialSdgEvaluator.evaluateAdversarialCorpus();
    const networkReport = await NetworkAuditEngine.auditAll();
    const mutationReport = MutationEngine.runFullMutationSuite(600);
    const oracleReport = IndependentOracleEvaluator.runCompleteOracleVerification();

    console.log('\\n>>> [3/4] RUNNING COMPLETE MULTI-LANGUAGE TASK BENCHMARK CORPUS...');
    const reportRes = await ReportGenerator.runCompleteValidationSuite();

    console.log('\\n>>> [4/4] EMITTING DASHBOARD & CANONICAL FINAL VALIDATION ARTIFACTS...');
    console.log('Controlled synthetic validation summary: ' + reportRes.summary);
    console.log('Measured compiler warm p50: ' + latencyReport.totalCompilerWarmP50Ms + 'ms');

    console.log('  ✓ Emitted JSON Report: ' + reportRes.reportJsonPath);
    console.log('  ✓ Emitted Markdown Report: ' + reportRes.reportMdPath);
}
`;

    fs.writeFileSync(entryPath, entryContent);

    await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        platform: 'node',
        target: 'node20',
        alias: {
            'vscode': path.resolve(__dirname, '..', 'tests', 'mock-vscode.ts')
        },
        external: ['web-tree-sitter'],
        outfile: runnerBundlePath,
        format: 'cjs',
        sourcemap: false
    });

    const { runAllValidationPhases } = require(runnerBundlePath);
    await runAllValidationPhases();
    console.log('\nControlled synthetic validation completed. This is not production approval.\n');
}

main().catch(err => {
    console.error('\n❌ Master Validation Failed:', err);
    process.exit(1);
});
