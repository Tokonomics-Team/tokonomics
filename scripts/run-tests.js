const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('Building and running Tokonomics repository automated tests...');
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
import { runContextIRTests } from '../tests/contextIR.test';
import { runWorkspaceGraphTests } from '../tests/workspaceGraph.test';
import { runLspContextTests } from '../tests/lspContext.test';
import { runDeltaErrorTestGraphTests } from '../tests/deltaErrorTest.test';
import { runHybridRetrieverTests } from '../tests/hybridRetriever.test';
import { runRerankDedupTests } from '../tests/rerankDedup.test';
import { runSufficiencyTests } from '../tests/sufficiency.test';
import { runKnapsackSolverTests } from '../tests/knapsackSolver.test';
import { runSdgSlicingTests } from '../tests/sdgSlicing.test';
import { runAdversarialSlicingTests } from '../tests/adversarialSlicing.test';
import { runCompressionProvidersTests } from '../tests/compressionProviders.test';
import { runMemoryGitGraphTests } from '../tests/memoryGitGraph.test';
import { runTokenizerCacheTests } from '../tests/tokenizerCache.test';
import { runToolsTerminalVisionTests } from '../tests/toolsTerminalVision.test';
import { runLocalSlmBrainTests } from '../tests/localSlmBrain.test';
import { runAblationTests } from '../tests/ablation.test';
import { runTaskSuccessCalibrationTests } from '../tests/taskSuccessCalibration.test';
import { runDashboardAggregatorTests } from '../tests/dashboardAggregator.test';
import { runEventReconciliationTests } from '../tests/eventReconciliation.test';
import { runDashboardResilienceTests } from '../tests/dashboardResilience.test';
import { runCompilerIntegrationTests } from '../tests/compilerIntegration.test';
import { runE2ETests } from '../tests/e2e.test';
import { runComprehensiveAuditTests } from '../tests/comprehensive-audit.test';
import { runPhase0MeasurementTruthTests } from '../tests/phase0MeasurementTruth.test';
import { runPhase1SecurityBoundaryTests } from '../tests/phase1SecurityBoundary.test';
import { runPhase2ProtocolCompilerTests } from '../tests/phase2ProtocolCompiler.test';
import { runPhase3WorkspaceSnapshotTests } from '../tests/phase3WorkspaceSnapshot.test';
import { runPhase4EvidenceRetrievalTests } from '../tests/phase4EvidenceRetrieval.test';

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
        runContextIRTests();
        runWorkspaceGraphTests();
        await runLspContextTests();
        runDeltaErrorTestGraphTests();
        runHybridRetrieverTests();
        await runRerankDedupTests();
        runSufficiencyTests();
        runKnapsackSolverTests();
        runSdgSlicingTests();
        await runAdversarialSlicingTests();
        await runCompressionProvidersTests();
        runMemoryGitGraphTests();
        runTokenizerCacheTests();
        runToolsTerminalVisionTests();
        await runLocalSlmBrainTests();
        runAblationTests();
        await runTaskSuccessCalibrationTests();
        runDashboardAggregatorTests();
        await runEventReconciliationTests();
        await runDashboardResilienceTests();
        await runCompilerIntegrationTests();
        await runE2ETests();
        await runComprehensiveAuditTests();
        runPhase0MeasurementTruthTests();
        await runPhase1SecurityBoundaryTests();
        await runPhase2ProtocolCompilerTests();
        await runPhase3WorkspaceSnapshotTests();
        await runPhase4EvidenceRetrievalTests();
        console.log('\\n====================================================================================');
        console.log('ALL AUTOMATED REPOSITORY TESTS PASSED');
        console.log('Synthetic benchmark passes do not constitute release, provider, or model-quality certification.');
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
            alias: {
                'vscode': path.join(__dirname, '..', 'tests', 'mock-vscode.ts')
            },
            external: ['web-tree-sitter'],
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
