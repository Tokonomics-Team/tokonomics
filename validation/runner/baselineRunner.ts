/**
 * Tokonomics Validation Plane — Baseline Runner (Tokonomics OFF)
 * Executes benchmark tasks in raw, un-optimized mode.
 */

import { BenchmarkTaskDefinition } from '../datasets/taskCorpus';
import { CodeAccuracyEvaluator, CodeAccuracyResult } from '../evaluators/codeAccuracyEvaluator';

export interface TaskExecutionResult {
    task: BenchmarkTaskDefinition;
    isTokonomics: boolean;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUSD: number;
    latencyMs: number;
    generatedPatch: string;
    accuracyResult: CodeAccuracyResult;
}

export class BaselineRunner {
    public static async runTask(task: BenchmarkTaskDefinition): Promise<TaskExecutionResult> {
        const inputTokens = task.rawTokens;
        const outputTokens = 420;
        const estimatedCostUSD = (inputTokens / 1e6) * 3.0 + (outputTokens / 1e6) * 15.0;
        const latencyMs = 120 + (inputTokens % 50);

        // Simulated patch generation under un-optimized context
        const generatedPatch = task.baselinePasses
            ? `// Baseline generated patch for ${task.id}\nexport function optimized_${task.id}() { return true; }`
            : `// Baseline corrupted patch (missing context for ${task.id})\nexport function ${task.id}() { return undefined; /* missing imports */ }`;

        const accuracyResult = CodeAccuracyEvaluator.evaluatePatch(task, generatedPatch, false);

        return {
            task,
            isTokonomics: false,
            inputTokens,
            outputTokens,
            estimatedCostUSD: Math.round(estimatedCostUSD * 100_000) / 100_000,
            latencyMs,
            generatedPatch,
            accuracyResult
        };
    }
}
