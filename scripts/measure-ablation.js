/**
 * Retrieval stage ablation gate.
 *
 * Answers a question nothing else in this repository does: does each retrieval stage Maximum Savings
 * enables actually change the evidence that reaches the model? A stage that is enabled, budgeted and
 * receipted but inert is indistinguishable from one that works until someone measures it.
 *
 *   npm run measure:ablation
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function build() {
    const outfile = path.join(root, 'out_test', 'ablation.js');
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'validation', 'measurement', 'retrievalAblation.ts')],
        bundle: true, platform: 'node', format: 'cjs', outfile,
        external: ['vscode'], logLevel: 'silent'
    });
    return require(outfile);
}

async function main() {
    const { runRetrievalAblation, writeAblationReport } = await build();
    const report = await runRetrievalAblation(root);
    const target = writeAblationReport(root, report);

    console.log('='.repeat(84));
    console.log('RETRIEVAL STAGE ABLATION - does each stage change what reaches the model?');
    console.log('='.repeat(84));
    for (const row of report.results) {
        console.log(`\n${row.stage}`);
        console.log(`  mandatory evidence delta     ${row.mandatoryDelta}`);
        console.log(`  focal file recall delta      ${row.focalDelta}`);
        console.log(`  exact implementation delta   ${row.exactImplementationDelta}`);
        console.log(`  token delta                  ${row.tokenDelta}`);
        console.log(`  verdict                      ${row.verdict}`);
        console.log(`  ${row.reason}`);
    }
    console.log(`\nEvidence: ${path.relative(root, target)}`);
    if (report.inertStages.length > 0) {
        console.log(`\nInert on this corpus: ${report.inertStages.join(', ')}`);
        console.log('This is evidence they earn nothing here, not proof they are useless in general.');
    }
    console.log('\nAblation is diagnostic evidence, not a pass/fail gate: a stage may be justified by');
    console.log('workloads this corpus does not contain. It fails only if it cannot run.');
}

main().catch(error => {
    console.error(`\nAblation failed: ${error && error.stack ? error.stack : error}`);
    process.exit(1);
});
