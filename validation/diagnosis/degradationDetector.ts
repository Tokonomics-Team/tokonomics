/**
 * Tokonomics Output-Degradation Detector
 * Automatically flags and classifies any benchmark task where:
 * Baseline Task Success = PASS AND Tokonomics Task Success = FAIL
 */

import { TaskExecutionResult } from '../runner/baselineRunner';

export interface DegradationIncident {
    taskId: string;
    language: string;
    category: string;
    baselinePasses: boolean;
    tokonomicsPasses: boolean;
    classification: 'TOKONOMICS_POTENTIAL_DEGRADATION' | 'NO_DEGRADATION';
    suspectedStage: string;
}

export class DegradationDetector {
    public static auditTaskPair(
        baseline: TaskExecutionResult,
        tokonomics: TaskExecutionResult
    ): DegradationIncident | null {
        const basePass = baseline.accuracyResult.taskSuccess;
        const tokPass = tokonomics.accuracyResult.taskSuccess;

        if (basePass && !tokPass) {
            return {
                taskId: baseline.task.id,
                language: baseline.task.language,
                category: baseline.task.category,
                baselinePasses: basePass,
                tokonomicsPasses: tokPass,
                classification: 'TOKONOMICS_POTENTIAL_DEGRADATION',
                suspectedStage: 'ContextReductionOrSlicing'
            };
        }

        return null;
    }
}
