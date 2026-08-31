/**
 * Tokonomics Context Sufficiency & Adaptive Stopping Engine
 * Analyzes task objectives to determine when accumulated evidence is mathematically sufficient,
 * preventing context bloat by halting candidate retrieval once coverage threshold theta is met.
 */

export type TaskIntent = 'debug' | 'refactor' | 'explain' | 'test' | 'generate' | 'general';

export type ObjectiveKind = 
    | 'focal_implementation' 
    | 'type_definition' 
    | 'callee_dependencies' 
    | 'caller_context' 
    | 'test_spec' 
    | 'error_diagnostic';

export interface TaskObjective {
    id: string;
    kind: ObjectiveKind;
    targetSymbol?: string;
    description: string;
    weight: number;
    satisfied: boolean;
    satisfiedBy?: string;
}

export interface TaskProfile {
    intent: TaskIntent;
    focalSymbols: string[];
    objectives: TaskObjective[];
    stoppingThreshold: number; // theta (0.0 to 1.0)
}

export interface SufficiencyReport {
    isSufficient: boolean;
    coverageScore: number;
    stoppingThreshold: number;
    satisfiedObjectives: string[];
    missingObjectives: string[];
    recommendedAction: 'halt_retrieval' | 'retrieve_more';
}

export interface CandidateContextEntity {
    id: string;
    filePath: string;
    symbolName: string;
    kind: string;
    content: string;
}

export class SufficiencyEngine {
    /**
     * Extracts structured TaskProfile and required evidence objectives from user intent and query
     */
    public buildTaskProfile(
        intent: TaskIntent,
        userQuery: string,
        focalSymbols: string[] = [],
        hasDiagnostics: boolean = false
    ): TaskProfile {
        const objectives: TaskObjective[] = [];
        let threshold = 0.80;

        switch (intent) {
            case 'debug':
                threshold = 0.90; // High rigor needed for bug fixing
                if (hasDiagnostics) {
                    objectives.push({
                        id: 'obj_error_diag',
                        kind: 'error_diagnostic',
                        description: 'Error diagnostic message & stack frame',
                        weight: 1.5,
                        satisfied: false
                    });
                }
                for (const sym of focalSymbols) {
                    objectives.push({
                        id: `obj_impl_${sym}`,
                        kind: 'focal_implementation',
                        targetSymbol: sym,
                        description: `Implementation body for ${sym}`,
                        weight: 2.0,
                        satisfied: false
                    });
                    objectives.push({
                        id: `obj_type_${sym}`,
                        kind: 'type_definition',
                        targetSymbol: sym,
                        description: `Type contract & parameters for ${sym}`,
                        weight: 1.0,
                        satisfied: false
                    });
                }
                break;

            case 'refactor':
                threshold = 0.85;
                for (const sym of focalSymbols) {
                    objectives.push({
                        id: `obj_impl_${sym}`,
                        kind: 'focal_implementation',
                        targetSymbol: sym,
                        description: `Focal code of ${sym}`,
                        weight: 2.0,
                        satisfied: false
                    });
                    objectives.push({
                        id: `obj_callers_${sym}`,
                        kind: 'caller_context',
                        targetSymbol: sym,
                        description: `Caller sites of ${sym}`,
                        weight: 1.0,
                        satisfied: false
                    });
                    objectives.push({
                        id: `obj_tests_${sym}`,
                        kind: 'test_spec',
                        targetSymbol: sym,
                        description: `Unit test assertions for ${sym}`,
                        weight: 1.0,
                        satisfied: false
                    });
                }
                break;

            case 'explain':
                threshold = 0.70; // Lower evidence needed for high-level explanations
                for (const sym of focalSymbols) {
                    objectives.push({
                        id: `obj_type_${sym}`,
                        kind: 'type_definition',
                        targetSymbol: sym,
                        description: `API signature of ${sym}`,
                        weight: 1.5,
                        satisfied: false
                    });
                }
                break;

            default:
                threshold = 0.75;
                for (const sym of focalSymbols) {
                    objectives.push({
                        id: `obj_impl_${sym}`,
                        kind: 'focal_implementation',
                        targetSymbol: sym,
                        description: `Code for ${sym}`,
                        weight: 1.0,
                        satisfied: false
                    });
                }
                break;
        }

        if (objectives.length === 0) {
            // Default baseline objective
            objectives.push({
                id: 'obj_query_context',
                kind: 'focal_implementation',
                description: 'Relevant workspace code matching prompt query',
                weight: 1.0,
                satisfied: false
            });
        }

        return {
            intent,
            focalSymbols,
            objectives,
            stoppingThreshold: threshold
        };
    }

    /**
     * Evaluates whether accumulated candidate entities satisfy the task profile objectives
     */
    public evaluateSufficiency(
        profile: TaskProfile,
        accumulatedEntities: CandidateContextEntity[]
    ): SufficiencyReport {
        let totalWeight = 0;
        let satisfiedWeight = 0;
        const satisfiedObjectives: string[] = [];
        const missingObjectives: string[] = [];

        for (const obj of profile.objectives) {
            totalWeight += obj.weight;
            let isSatisfied = false;
            let matchedEntity: CandidateContextEntity | undefined;

            for (const entity of accumulatedEntities) {
                // Match criteria based on objective kind
                if (obj.targetSymbol && entity.symbolName.includes(obj.targetSymbol)) {
                    if (obj.kind === 'focal_implementation' && entity.content.length > 20) {
                        isSatisfied = true;
                        matchedEntity = entity;
                        break;
                    }
                    if (obj.kind === 'type_definition' && (entity.kind === 'interface' || entity.kind === 'type' || entity.content.includes('interface') || entity.content.includes('type'))) {
                        isSatisfied = true;
                        matchedEntity = entity;
                        break;
                    }
                } else if (obj.kind === 'test_spec' && (entity.filePath.includes('test') || entity.filePath.includes('spec'))) {
                    isSatisfied = true;
                    matchedEntity = entity;
                    break;
                } else if (obj.kind === 'error_diagnostic' && entity.content.includes('Error')) {
                    isSatisfied = true;
                    matchedEntity = entity;
                    break;
                } else if (obj.id === 'obj_query_context' && accumulatedEntities.length > 0) {
                    isSatisfied = true;
                    matchedEntity = entity;
                    break;
                }
            }

            if (isSatisfied) {
                obj.satisfied = true;
                obj.satisfiedBy = matchedEntity?.id;
                satisfiedWeight += obj.weight;
                satisfiedObjectives.push(obj.id);
            } else {
                missingObjectives.push(obj.id);
            }
        }

        const coverageScore = totalWeight > 0 ? Math.round((satisfiedWeight / totalWeight) * 100) / 100 : 1.0;
        const isSufficient = coverageScore >= profile.stoppingThreshold;

        return {
            isSufficient,
            coverageScore,
            stoppingThreshold: profile.stoppingThreshold,
            satisfiedObjectives,
            missingObjectives,
            recommendedAction: isSufficient ? 'halt_retrieval' : 'retrieve_more'
        };
    }
}
