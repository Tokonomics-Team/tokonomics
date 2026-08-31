/**
 * Tokonomics End-to-End Task Success Evaluation Framework
 * Evaluates real-world software engineering tasks across Baseline Context vs Tokonomics Context,
 * measuring Token Efficiency, Recall@10, Compile Success %, Test Pass %, and Functional Task Success %.
 */

export interface BenchmarkTaskCase {
    id: string;
    title: string;
    taskCategory: 'debug' | 'refactor' | 'type_fix' | 'feature' | 'test_gen';
    rawContextTokens: number;
    rawContextRecallAt10: number;
    
    // Baseline outcomes (with uncompressed / raw retrieval context)
    baselineCompileSuccess: boolean;
    baselineTestsPassed: boolean;
    baselineTaskSuccess: boolean;

    // Tokonomics outcomes (with compiled IR / sliced SDG / knapsack optimized context)
    compiledTokens: number;
    compiledRecallAt10: number;
    predictedCQ: number;
    tokonomicsCompileSuccess: boolean;
    tokonomicsTestsPassed: boolean;
    tokonomicsTaskSuccess: boolean;
}

export interface TaskSuccessComparisonReport {
    totalTasks: number;
    measurementDate: string;
    providerEvaluated: string;
    modelEvaluated: string;

    // Token & Cost Metrics
    baselineAvgTokens: number;
    tokonomicsAvgTokens: number;
    netTokenReductionRatio: number;
    baselineAvgCostUSD: number;
    tokonomicsAvgCostUSD: number;
    netCostReductionRatio: number;

    // Retrieval & Coverage
    baselineRecallAt10: number;
    tokonomicsRecallAt10: number;
    avgPredictedCQ: number;

    // Real Execution Success
    baselineCompileRate: number;
    tokonomicsCompileRate: number;
    compileDelta: number;

    baselineTestPassRate: number;
    tokonomicsTestPassRate: number;
    testPassDelta: number;

    baselineTaskSuccessRate: number;
    tokonomicsTaskSuccessRate: number;
    taskSuccessDelta: number;
}

export class TaskSuccessEvaluator {
    public static evaluateCorpus(
        tasks: BenchmarkTaskCase[],
        provider: string = 'Anthropic',
        model: string = 'Claude 3.7 / 3.5 Sonnet'
    ): TaskSuccessComparisonReport {
        const n = tasks.length;
        if (n === 0) {
            throw new Error('Task corpus cannot be empty');
        }

        const baselineTokens = tasks.reduce((a, t) => a + t.rawContextTokens, 0) / n;
        const tokonomicsTokens = tasks.reduce((a, t) => a + t.compiledTokens, 0) / n;
        const tokenReduction = (baselineTokens - tokonomicsTokens) / baselineTokens;

        // Pricing at $3.00 / 1M uncached input, cached at $0.30 / 1M for Tokonomics prefix
        const baselineCost = (baselineTokens / 1_000_000) * 3.00;
        const tokonomicsCost = (tokonomicsTokens / 1_000_000) * 0.30;
        const costReduction = (baselineCost - tokonomicsCost) / baselineCost;

        const baseRecall = tasks.reduce((a, t) => a + t.rawContextRecallAt10, 0) / n;
        const tokRecall = tasks.reduce((a, t) => a + t.compiledRecallAt10, 0) / n;
        const avgCQ = tasks.reduce((a, t) => a + t.predictedCQ, 0) / n;

        const baseCompile = tasks.filter(t => t.baselineCompileSuccess).length / n;
        const tokCompile = tasks.filter(t => t.tokonomicsCompileSuccess).length / n;

        const baseTest = tasks.filter(t => t.baselineTestsPassed).length / n;
        const tokTest = tasks.filter(t => t.tokonomicsTestsPassed).length / n;

        const baseSuccess = tasks.filter(t => t.baselineTaskSuccess).length / n;
        const tokSuccess = tasks.filter(t => t.tokonomicsTaskSuccess).length / n;

        return {
            totalTasks: n,
            measurementDate: new Date().toISOString().split('T')[0],
            providerEvaluated: provider,
            modelEvaluated: model,

            baselineAvgTokens: Math.round(baselineTokens),
            tokonomicsAvgTokens: Math.round(tokonomicsTokens),
            netTokenReductionRatio: Math.round(tokenReduction * 1000) / 10,
            baselineAvgCostUSD: Math.round(baselineCost * 10000) / 10000,
            tokonomicsAvgCostUSD: Math.round(tokonomicsCost * 10000) / 10000,
            netCostReductionRatio: Math.round(costReduction * 1000) / 10,

            baselineRecallAt10: Math.round(baseRecall * 10) / 10,
            tokonomicsRecallAt10: Math.round(tokRecall * 10) / 10,
            avgPredictedCQ: Math.round(avgCQ * 1000) / 10,

            baselineCompileRate: Math.round(baseCompile * 1000) / 10,
            tokonomicsCompileRate: Math.round(tokCompile * 1000) / 10,
            compileDelta: Math.round((tokCompile - baseCompile) * 1000) / 10,

            baselineTestPassRate: Math.round(baseTest * 1000) / 10,
            tokonomicsTestPassRate: Math.round(tokTest * 1000) / 10,
            testPassDelta: Math.round((tokTest - baseTest) * 1000) / 10,

            baselineTaskSuccessRate: Math.round(baseSuccess * 1000) / 10,
            tokonomicsTaskSuccessRate: Math.round(tokSuccess * 1000) / 10,
            taskSuccessDelta: Math.round((tokSuccess - baseSuccess) * 1000) / 10
        };
    }
}
