/**
 * Tokonomics Pipeline Flow Integrity Auditor (Corrective Hardened)
 * Tracks the execution order of all compiler stages during validation runs,
 * asserting strict topological partial ordering and differentiating:
 * - MANDATORY: Stages that MUST execute for every prompt compilation
 * - CONDITIONAL: Stages that execute only when context triggers are present (e.g. Vision on images, Terminal on errors)
 * - OPTIONAL: Stages configured via user settings (e.g. Local SLM acceleration)
 */

export type StageRequirement = 'MANDATORY' | 'CONDITIONAL' | 'OPTIONAL';

export interface StageDefinition {
    stageId: string;
    stageName: string;
    requirement: StageRequirement;
    precedingStages: string[];
}

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
    mandatoryStagesPassed: boolean;
    conditionalStagesAudited: boolean;
    executedStagesCount: number;
    skippedStagesCount: number;
    outOfOrderStages: string[];
    missingMandatoryStages: string[];
    invalidSkippedStages: string[];
    records: StageExecutionRecord[];
}

export class PipelineFlowAuditor {
    public static readonly STAGE_DEFINITIONS: Record<string, StageDefinition> = {
        STAGE_01_GOVERNOR: { stageId: 'STAGE_01_GOVERNOR', stageName: 'Context Governor', requirement: 'MANDATORY', precedingStages: [] },
        STAGE_02_CONTEXT_IR: { stageId: 'STAGE_02_CONTEXT_IR', stageName: 'Context IR Parser', requirement: 'MANDATORY', precedingStages: ['STAGE_01_GOVERNOR'] },
        STAGE_03_WORKSPACE_GRAPH: { stageId: 'STAGE_03_WORKSPACE_GRAPH', stageName: 'Workspace Graph', requirement: 'MANDATORY', precedingStages: ['STAGE_02_CONTEXT_IR'] },
        STAGE_04_DELTA_ERROR_TEST: { stageId: 'STAGE_04_DELTA_ERROR_TEST', stageName: 'Delta & Error Context', requirement: 'CONDITIONAL', precedingStages: ['STAGE_03_WORKSPACE_GRAPH'] },
        STAGE_05_HYBRID_RETRIEVAL: { stageId: 'STAGE_05_HYBRID_RETRIEVAL', stageName: 'Hybrid Retrieval', requirement: 'MANDATORY', precedingStages: ['STAGE_03_WORKSPACE_GRAPH'] },
        STAGE_06_RERANK_MMR: { stageId: 'STAGE_06_RERANK_MMR', stageName: 'Reranker & MMR', requirement: 'MANDATORY', precedingStages: ['STAGE_05_HYBRID_RETRIEVAL'] },
        STAGE_07_DEDUPLICATION: { stageId: 'STAGE_07_DEDUPLICATION', stageName: '4-Tier Deduplication', requirement: 'MANDATORY', precedingStages: ['STAGE_06_RERANK_MMR'] },
        STAGE_08_SUFFICIENCY_STOP: { stageId: 'STAGE_08_SUFFICIENCY_STOP', stageName: 'Sufficiency Stopping Engine', requirement: 'MANDATORY', precedingStages: ['STAGE_07_DEDUPLICATION'] },
        STAGE_09_KNAPSACK_SOLVER: { stageId: 'STAGE_09_KNAPSACK_SOLVER', stageName: '0/1 Knapsack Solver', requirement: 'MANDATORY', precedingStages: ['STAGE_08_SUFFICIENCY_STOP'] },
        STAGE_10_SDG_SLICING: { stageId: 'STAGE_10_SDG_SLICING', stageName: 'SDG Program Slicing', requirement: 'CONDITIONAL', precedingStages: ['STAGE_09_KNAPSACK_SOLVER'] },
        STAGE_11_SEMANTIC_COMPRESSION: { stageId: 'STAGE_11_SEMANTIC_COMPRESSION', stageName: 'Semantic Compression', requirement: 'MANDATORY', precedingStages: ['STAGE_09_KNAPSACK_SOLVER'] },
        STAGE_12_CACHE_PLANNER: { stageId: 'STAGE_12_CACHE_PLANNER', stageName: 'KV Cache Planner', requirement: 'MANDATORY', precedingStages: ['STAGE_11_SEMANTIC_COMPRESSION'] },
        STAGE_13_PROJECT_MEMORY: { stageId: 'STAGE_13_PROJECT_MEMORY', stageName: 'Project Memory & GitGraph', requirement: 'CONDITIONAL', precedingStages: ['STAGE_12_CACHE_PLANNER'] },
        STAGE_14_TOOLS_TERMINAL_VISION: { stageId: 'STAGE_14_TOOLS_TERMINAL_VISION', stageName: 'Tools, Terminal & Vision', requirement: 'CONDITIONAL', precedingStages: ['STAGE_12_CACHE_PLANNER'] },
        STAGE_15_EVIDENCE_SAFETY_GATE: { stageId: 'STAGE_15_EVIDENCE_SAFETY_GATE', stageName: 'Evidence Safety Gate', requirement: 'MANDATORY', precedingStages: ['STAGE_09_KNAPSACK_SOLVER'] },
        STAGE_16_PRICING_RECONCILIATION: { stageId: 'STAGE_16_PRICING_RECONCILIATION', stageName: 'Pricing Reconciliation', requirement: 'MANDATORY', precedingStages: ['STAGE_15_EVIDENCE_SAFETY_GATE'] }
    };

    /**
     * Audits a recorded sequence of stage executions for topological partial ordering and conditional validity
     */
    public static auditFlow(requestId: string, records: StageExecutionRecord[]): PipelineFlowAuditResult {
        const outOfOrder: string[] = [];
        const missingMandatory: string[] = [];
        const invalidSkipped: string[] = [];
        const executionSequenceMap = new Map<string, number>();

        for (let i = 0; i < records.length; i++) {
            executionSequenceMap.set(records[i].stageId, i);
        }

        // 1. Check all stage definitions for ordering & mandatory presence
        for (const [stageId, def] of Object.entries(this.STAGE_DEFINITIONS)) {
            const record = records.find(r => r.stageId === stageId);

            if (!record) {
                if (def.requirement === 'MANDATORY') {
                    missingMandatory.push(stageId);
                }
                continue;
            }

            if (record.status === 'skipped') {
                if (def.requirement === 'MANDATORY') {
                    invalidSkipped.push(`Mandatory stage ${stageId} was unexpectedly skipped!`);
                } else if (!record.skippedReason) {
                    invalidSkipped.push(`Conditional/Optional stage ${stageId} skipped without providing a reason.`);
                }
                continue;
            }

            // Verify that all preceding required stages executed before this stage
            const currentIndex = executionSequenceMap.get(stageId)!;
            for (const precId of def.precedingStages) {
                if (executionSequenceMap.has(precId)) {
                    const precIndex = executionSequenceMap.get(precId)!;
                    if (precIndex > currentIndex) {
                        outOfOrder.push(`Stage ${stageId} executed at sequence ${currentIndex} before preceding required stage ${precId} at ${precIndex}`);
                    }
                }
            }
        }

        const isTopologicallyValid = outOfOrder.length === 0;
        const mandatoryStagesPassed = missingMandatory.length === 0 && invalidSkipped.length === 0;

        return {
            requestId,
            isTopologicallyValid,
            mandatoryStagesPassed,
            conditionalStagesAudited: true,
            executedStagesCount: records.filter(r => r.status === 'completed' || r.status === 'fallback').length,
            skippedStagesCount: records.filter(r => r.status === 'skipped').length,
            outOfOrderStages: outOfOrder,
            missingMandatoryStages: missingMandatory,
            invalidSkippedStages: invalidSkipped,
            records
        };
    }
}
