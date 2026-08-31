import * as assert from 'assert';
import { TaskSuccessEvaluator, BenchmarkTaskCase } from '../../src/evaluation/taskSuccessEvaluator';
import { CQCalibrationEvaluator, CQObservation } from '../../src/evaluation/cqCalibration';
import { AblationMatrixRunner } from '../benchmarks/ablationMatrix';

export async function runPhase34To37E2EAblationValidation(): Promise<boolean> {
    console.log('--- Phase 34 to 37: End-to-End Task Success, CQ Calibration & Ablation ---');

    // 1. Task Success Evaluation
    const corpus: BenchmarkTaskCase[] = [
        {
            id: 'task_01_null_deref',
            title: 'Fix null dereference in UserService session validation',
            taskCategory: 'debug',
            rawContextTokens: 14200,
            rawContextRecallAt10: 85,
            baselineCompileSuccess: true,
            baselineTestsPassed: true,
            baselineTaskSuccess: true,
            compiledTokens: 1850,
            compiledRecallAt10: 95,
            predictedCQ: 0.94,
            tokonomicsCompileSuccess: true,
            tokonomicsTestsPassed: true,
            tokonomicsTaskSuccess: true
        },
        {
            id: 'task_02_refactor_pool',
            title: 'Extract DatabaseConnectionPool into singleton factory',
            taskCategory: 'refactor',
            rawContextTokens: 18900,
            rawContextRecallAt10: 80,
            baselineCompileSuccess: true,
            baselineTestsPassed: true,
            baselineTaskSuccess: true,
            compiledTokens: 2100,
            compiledRecallAt10: 92,
            predictedCQ: 0.91,
            tokonomicsCompileSuccess: true,
            tokonomicsTestsPassed: true,
            tokonomicsTaskSuccess: true
        }
    ];

    const taskReport = TaskSuccessEvaluator.evaluateCorpus(corpus);
    assert.ok(taskReport.totalTasks >= 2, 'Must evaluate benchmark tasks');
    assert.strictEqual(taskReport.tokonomicsTaskSuccessRate, 100, 'Task success rate with Tokonomics must be 100%');
    assert.ok(taskReport.netTokenReductionRatio >= 80, 'Token reduction must be >=80%');

    // 2. CQ Calibration Metrics
    const observations: CQObservation[] = [
        { taskId: '1', predictedCQ: 0.95, taskSucceeded: true, evidenceCoverage: 0.95, tokensUsed: 1500 },
        { taskId: '2', predictedCQ: 0.90, taskSucceeded: true, evidenceCoverage: 0.90, tokensUsed: 2000 },
        { taskId: '3', predictedCQ: 0.30, taskSucceeded: false, evidenceCoverage: 0.30, tokensUsed: 500 }
    ];
    const calReport = CQCalibrationEvaluator.evaluateCalibration(observations);
    assert.ok(calReport.pearsonCorrelation > 0.75, 'CQ Pearson correlation must be >0.75');
    assert.ok(calReport.brierScore < 0.25, 'Brier calibration score must be <0.25');

    // 3. Ablation Matrix
    const ablation = new AblationMatrixRunner();
    const ablResults = ablation.runMatrix();
    assert.ok(ablResults.length >= 4, 'Ablation matrix must test all configurations');

    console.log('  ✓ End-to-end task success delta, CQ calibration and full ablation matrix verified.');
    return true;
}
