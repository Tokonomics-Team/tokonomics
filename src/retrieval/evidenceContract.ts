import { EvidencePolicyMatrix } from '../governor/evidencePolicy';
import { EvidenceCategory, TaskType } from '../governor/governorTypes';
import { EvidenceContract } from './evidenceTypes';

const STOP_WORDS = new Set(['Explain', 'Please', 'Create', 'Update', 'Review', 'Debug', 'Error', 'TypeScript', 'JavaScript']);

export class EvidenceContractBuilder {
    public static build(taskType: TaskType, query: string): EvidenceContract {
        const policy = EvidencePolicyMatrix.getPolicy(taskType);
        const hasError = /\b(error|exception|failed|failure|stack|diagnostic|traceback)\b/i.test(query);
        const required: EvidenceCategory[] = [];
        const optional: EvidenceCategory[] = [];
        const reasons = new Map<EvidenceCategory, string>();
        for (const requirement of policy.requiredEvidence) {
            reasons.set(requirement.category, requirement.reason);
            const applicable = requirement.category !== 'errorStackTrace' || hasError;
            if (applicable && (requirement.priority === 'critical' || requirement.priority === 'high')) required.push(requirement.category);
            else optional.push(requirement.category);
        }
        const forbidden: EvidenceCategory[] = [];
        if (taskType === 'completion') forbidden.push('gitHistory', 'architecture');
        if (taskType === 'search') forbidden.push('gitHistory');
        if (!['feature', 'architecture'].includes(taskType)) forbidden.push('generatedSourceSpec');
        const focalSymbols = [...new Set((query.match(/\b[A-Z][A-Za-z0-9_$]{2,}\b/g) || [])
            .filter(symbol => !STOP_WORDS.has(symbol)))].slice(0, 8);
        return Object.freeze({ taskType, focalSymbols: Object.freeze(focalSymbols), required: Object.freeze([...new Set(required)]),
            optional: Object.freeze([...new Set(optional)]), forbidden: Object.freeze([...new Set(forbidden)]), reasons });
    }
}
