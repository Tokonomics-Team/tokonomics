/**
 * Tokonomics Pipeline Flow Integrity Auditor (Test-Only Instrumentation)
 * Tracks the execution order of all compiler stages during validation runs,
 * asserting strict topological sequence and detecting any missing, bypassed, or out-of-order stages.
 */

export interface StageExecutionRecord {
    requestId: string;
    stageId: string;
    stageName: string;
    sequenceNumber: number;
    enteredTimestampMs: number;
    status: 'completed' | 'skipped' | 'fallback' | 'failed';
    skippedReason?: string;
    durationMs: number;
}

export interface PipelineFlowAuditResult {
    requestId: string;
    isTopologicallyValid: boolean;
    expectedStagesCount: number;
    executedStagesCount: number;
    skippedStagesCount: number;
    outOfOrderStages: string[];
    bypassedStages: string[];
    records: StageExecutionRecord[];
}

export class PipelineFlowAuditor {
    private static readonly EXPECTED_STAGE_ORDER: string[] = [
        'STAGE_01_GOVERNOR',
        'STAGE_02_CONTEXT_IR',
        'STAGE_03_WORKSPACE_GRAPH',
        'STAGE_04_DELTA_ERROR_TEST',
        'STAGE_05_HYBRID_RETRIEVAL',
        'STAGE_06_RERANK_MMR',
        'STAGE_07_DEDUPLICATION',
        'STAGE_08_SUFFICIENCY_STOP',
        'STAGE_09_KNAPSACK_SOLVER',
        'STAGE_10_SDG_SLICING',
        'STAGE_11_SEMANTIC_COMPRESSION',
        'STAGE_12_CACHE_PLANNER',
        'STAGE_13_PROJECT_MEMORY',
        'STAGE_14_TOOLS_TERMINAL_VISION',
        'STAGE_15_EVIDENCE_SAFETY_GATE',
        'STAGE_16_PRICING_RECONCILIATION'
    ];

    /**
     * Audits a recorded sequence of stage executions for topological integrity
     */
    public static auditFlow(requestId: string, records: StageExecutionRecord[]): PipelineFlowAuditResult {
        const outOfOrder: string[] = [];
        const bypassed: string[] = [];
        const executedMap = new Map<string, number>();

        for (let i = 0; i < records.length; i++) {
            executedMap.set(records[i].stageId, i);
        }

        let lastIndex = -1;
        for (const stageId of this.EXPECTED_STAGE_ORDER) {
            if (executedMap.has(stageId)) {
                const currentIndex = executedMap.get(stageId)!;
                if (currentIndex < lastIndex) {
                    outOfOrder.push(`Stage ${stageId} executed out-of-order at index ${currentIndex} after ${lastIndex}`);
                }
                lastIndex = currentIndex;
            } else {
                bypassed.push(stageId);
            }
        }

        const isTopologicallyValid = outOfOrder.length === 0;

        return {
            requestId,
            isTopologicallyValid,
            expectedStagesCount: this.EXPECTED_STAGE_ORDER.length,
            executedStagesCount: records.filter(r => r.status === 'completed' || r.status === 'fallback').length,
            skippedStagesCount: records.filter(r => r.status === 'skipped').length,
            outOfOrderStages: outOfOrder,
            bypassedStages: bypassed,
            records
        };
    }
}
