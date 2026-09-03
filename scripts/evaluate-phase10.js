'use strict';

const esbuild = require('esbuild');
const path = require('path');

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const output = path.join(rootDir, 'out_test', 'phase10-evaluation.js');
    await esbuild.build({
        entryPoints: [path.join(rootDir, 'validation', 'experiments', 'phase10Evaluation.ts')],
        outfile: output,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        sourcemap: false,
        logLevel: 'silent'
    });
    const result = require(output).generatePhase10Evaluation(rootDir);
    console.log(`Phase 10 decision: ${result.report.decision}`);
    console.log(`JSON: ${result.jsonPath}`);
    console.log(`Markdown: ${result.markdownPath}`);
}

main().catch(error => {
    console.error('Phase 10 evaluation failed:', error);
    process.exitCode = 1;
});
