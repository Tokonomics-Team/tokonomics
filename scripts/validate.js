/**
 * Tokonomics Validation Runner (Fast Mode)
 * Executes Deterministic Context Governor tests, Full Context Oracle, and validation dashboard.
 */

const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🔬 TOKONOMICS VALIDATION PLANE (FAST VALIDATION RUNNER)');
    console.log('====================================================================================\n');

    const outTestDir = path.resolve(__dirname, '..', 'out_test');
    if (!fs.existsSync(outTestDir)) {
        fs.mkdirSync(outTestDir, { recursive: true });
    }

    const runnerBundlePath = path.resolve(outTestDir, 'validate_fast_runner.js');
    const entryPath = path.resolve(outTestDir, 'validate_fast_entry.ts');

    const entryContent = `
import { runGovernorTests } from '../tests/governor.test';
import { ReportGenerator } from '../validation/reports/reportGenerator';

export async function runFastValidation() {
    console.log('>>> [1/2] RUNNING DETERMINISTIC CONTEXT GOVERNOR TESTS...');
    runGovernorTests();

    console.log('\\n>>> [2/2] RUNNING BENCHMARK VALIDATION SUITE & EMITTING REPORTS...');
    const res = await ReportGenerator.runCompleteValidationSuite();

    console.log('\\nControlled synthetic validation summary: ' + res.summary);

    console.log('  ✓ Final Validation JSON: ' + res.reportJsonPath);
    console.log('  ✓ Final Validation Markdown: ' + res.reportMdPath);
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

    const { runFastValidation } = require(runnerBundlePath);
    await runFastValidation();
    console.log('\nControlled synthetic validation completed. This is not release certification.\n');
}

main().catch(err => {
    console.error('\n❌ Validation Failed:', err);
    process.exit(1);
});
