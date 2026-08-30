const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('⚡ Building & Running Enterprise Token Optimizer 4.0 SOTA Security & Performance Test Suite...');
    const runnerPath = path.join(__dirname, '..', 'out_test', 'runner.js');

    const testEntry = `
import { runAstTests } from '../tests/ast.test';
import { runMultiLangAstTests } from '../tests/multiLangAst.test';
import { runCacheTests } from '../tests/cache.test';
import { runCompressTests } from '../tests/compress.test';
import { runAgenticTests } from '../tests/agentic.test';
import { runSecurityAndPerfTests } from '../tests/security.test';
import { runSotaEngineTests } from '../tests/sota.test';
import { runV3EngineTests } from '../tests/v3.test';
import { runV4EngineTests } from '../tests/v4.test';
import { runRamManagerTests } from '../tests/ram.test';
import { runLoggerTests } from '../tests/logger.test';
import { runE2ETests } from '../tests/e2e.test';

async function runAll() {
    try {
        await runAstTests();
        await runMultiLangAstTests();
        await runCacheTests();
        await runCompressTests();
        await runAgenticTests();
        await runSecurityAndPerfTests();
        await runSotaEngineTests();
        await runV3EngineTests();
        await runV4EngineTests();
        await runRamManagerTests();
        await runLoggerTests();
        await runE2ETests();
        console.log('\\n====================================================================================');
        console.log('🎉 ALL V4.0 SOTA TESTS (SCRATCHPAD, ANCHORS, SHORTHAND, HYBRID CACHE, T0/T1/T2, CIRCUIT BREAKER) PASSED WITH 100% SUCCESS');
        console.log('====================================================================================\\n');
    } catch (err) {
        console.error('\\n❌ Test Failed:', err);
        process.exit(1);
    }
}

runAll();
`;

    const tempEntryPath = path.join(__dirname, '..', 'tests', '_entry.ts');
    fs.writeFileSync(tempEntryPath, testEntry);

    try {
        await esbuild.build({
            entryPoints: [tempEntryPath],
            bundle: true,
            outfile: runnerPath,
            platform: 'node',
            target: 'node20',
            external: ['vscode', 'web-tree-sitter'],
            format: 'cjs'
        });

        require(runnerPath);
    } finally {
        if (fs.existsSync(tempEntryPath)) {
            fs.unlinkSync(tempEntryPath);
        }
    }
}

main().catch(err => {
    console.error('Build error:', err);
    process.exit(1);
});
