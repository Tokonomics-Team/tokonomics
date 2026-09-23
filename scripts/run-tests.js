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
import { runDashboardLiveUpdateTests } from '../tests/dashboardLiveUpdate.test';
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
import { runPhase5GlobalBudgetTests } from '../tests/phase5GlobalBudget.test';
import { runPhase6CacheEconomicsTests } from '../tests/phase6CacheEconomics.test';
import { runPhase7ObservabilityLedgerTests } from '../tests/phase7ObservabilityLedger.test';
import { runPhase8PerformanceResilienceTests } from '../tests/phase8PerformanceResilience.test';
import { runPhase9ReleaseCertificationTests } from '../tests/phase9ReleaseCertification.test';
import { runPhase10ExperimentTests } from '../tests/phase10Experiments.test';
import { runPhase11ReachabilityTests } from '../tests/phase11Reachability.test';
import { runPhase12LspIntelligenceTests } from '../tests/phase12LspIntelligence.test';
import { runPhase13SignalIntelligenceTests } from '../tests/phase13SignalIntelligence.test';
import { runPhase14TerminalProvenanceTests } from '../tests/phase14TerminalProvenance.test';
import { runPhase15DenseRetrievalTests } from '../tests/phase15DenseRetrieval.test';
import { runPhase16RerankDedupTests } from '../tests/phase16RerankDedup.test';
import { runPhase17ProjectMemoryTests } from '../tests/phase17ProjectMemory.test';
import { runPhase18LocalSlmTests } from '../tests/phase18LocalSlm.test';
import { runPhase19UnifiedCertificationTests } from '../tests/phase19UnifiedCertification.test';
import { runAuditRemediationTests } from '../tests/v71AuditRemediation.test';
import { runSotaPhase0CapabilityTruthTests } from '../tests/sotaPhase0CapabilityTruth.test';
import { runSotaPhase1ContextEntryTests } from '../tests/sotaPhase1ContextEntry.test';
import { runSotaPhase2ExactChunkTests } from '../tests/sotaPhase2ExactChunks.test';
import { runSotaPhase3RetrievalOrderingTests } from '../tests/sotaPhase3RetrievalOrdering.test';
import { runSotaPhase4EpochBudgetTests } from '../tests/sotaPhase4EpochBudget.test';
import { runSotaPhase5EvidenceClaimTests } from '../tests/sotaPhase5EvidenceClaims.test';
import { runSotaPhase6HardeningTests } from '../tests/sotaPhase6Hardening.test';
import { runChatSurfaceTests } from '../tests/chatSurface.test';
import { runPublicDocumentationTests } from '../tests/publicDocumentation.test';
import { runPhase2InvertedIndexTests } from '../tests/phase2InvertedIndex.test';
import { runPhase3FinOpsKnapsackTests } from '../tests/phase3FinOpsKnapsack.test';
import { runPhase4CacheAlignmentTests } from '../tests/phase4CacheAlignment.test';
import { runPhase5WorkerPoolTests } from '../tests/phase5WorkerPool.test';
import { runPhase6WebviewBridgeTests } from '../tests/phase6WebviewBridge.test';
import { runPhase7BlobAstCacheTests } from '../tests/phase7BlobAstCache.test';
import { runPhase8SecuritySanitizerTests } from '../tests/phase8SecuritySanitizer.test';
import { runMonorepoScaleTests } from '../tests/monorepoScale.test';
import { runV7Phase1PreferencesTests } from '../tests/v7Phase1Preferences.test';
import { runV7Phase2SecurityBoundaryTests } from '../tests/v7Phase2SecurityBoundary.test';
import { runV7Phase3LifecycleResourceTests } from '../tests/v7Phase3LifecycleResources.test';
import { runV7Phase4AccountingDashboardTests } from '../tests/v7Phase4AccountingDashboard.test';
import { runV7Phase5IncrementalSnapshotTests } from '../tests/v7Phase5IncrementalSnapshots.test';
import { runV7Phase6StageContractTests } from '../tests/v7Phase6StageContracts.test';
import { runV7Phase7ProductionSignalTests } from '../tests/v7Phase7ProductionSignals.test';
import { runV7Phase8ProductionRetrievalTests } from '../tests/v7Phase8ProductionRetrieval.test';
import { runV7Phase9UtilityBudgetTests } from '../tests/v7Phase9UtilityBudget.test';
import { runV7Phase10GovernedLocalIntelligenceTests } from '../tests/v7Phase10GovernedLocalIntelligence.test';
import { runV7Phase11ReleaseContractTests } from '../tests/v7Phase11ReleaseContract.test';

import { runFinOpsTests } from '../tests/finOps.test';
import { runSubscriptionTests } from '../tests/subscriptions.test';
import { runChatContextForwardingTests } from '../tests/chatContextForwarding.test';

async function runAll() {
    try {
        await runFinOpsTests();
        await runSubscriptionTests();
        await runChatContextForwardingTests();
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
        await runPhase2InvertedIndexTests();
        await runRerankDedupTests();
        runSufficiencyTests();
        runKnapsackSolverTests();
        await runPhase3FinOpsKnapsackTests();
        await runPhase4CacheAlignmentTests();
        await runPhase5WorkerPoolTests();
        await runPhase6WebviewBridgeTests();
        await runPhase7BlobAstCacheTests();
        await runPhase8SecuritySanitizerTests();
        await runMonorepoScaleTests();
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
        await runDashboardLiveUpdateTests();
        await runEventReconciliationTests();
        await runDashboardResilienceTests();
        await runCompilerIntegrationTests();
        await runE2ETests();
        await runComprehensiveAuditTests();
        runPhase0MeasurementTruthTests();
        await runV7Phase1PreferencesTests();
        await runV7Phase2SecurityBoundaryTests();
        await runV7Phase3LifecycleResourceTests();
        runV7Phase4AccountingDashboardTests();
        await runV7Phase5IncrementalSnapshotTests();
        await runV7Phase6StageContractTests();
        await runV7Phase7ProductionSignalTests();
        await runV7Phase8ProductionRetrievalTests();
        runV7Phase9UtilityBudgetTests();
        await runV7Phase10GovernedLocalIntelligenceTests();
        runV7Phase11ReleaseContractTests();
        await runPhase1SecurityBoundaryTests();
        await runPhase2ProtocolCompilerTests();
        await runPhase3WorkspaceSnapshotTests();
        await runPhase4EvidenceRetrievalTests();
        await runPhase5GlobalBudgetTests();
        await runPhase6CacheEconomicsTests();
        await runPhase7ObservabilityLedgerTests();
        await runPhase8PerformanceResilienceTests();
        await runPhase9ReleaseCertificationTests();
        await runPhase10ExperimentTests();
        await runPhase11ReachabilityTests();
        await runPhase12LspIntelligenceTests();
        await runPhase13SignalIntelligenceTests();
        await runPhase14TerminalProvenanceTests();
        await runPhase15DenseRetrievalTests();
        await runPhase16RerankDedupTests();
        await runPhase17ProjectMemoryTests();
        await runPhase18LocalSlmTests();
        await runPhase19UnifiedCertificationTests();
        await runAuditRemediationTests();
        await runSotaPhase0CapabilityTruthTests();
        await runSotaPhase1ContextEntryTests();
        await runSotaPhase2ExactChunkTests();
        await runSotaPhase3RetrievalOrderingTests();
        await runSotaPhase4EpochBudgetTests();
        await runSotaPhase5EvidenceClaimTests();
        await runSotaPhase6HardeningTests();
        await runChatSurfaceTests();
        runPublicDocumentationTests();
        console.log('\\n====================================================================================');
        console.log('ALL AUTOMATED REPOSITORY TESTS PASSED');
        console.log('Synthetic benchmark passes do not constitute release, provider, or model-quality certification.');
        console.log('====================================================================================\\n');
        process.exit(0);
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
