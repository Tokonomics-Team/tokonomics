/**
 * Tokonomics Hard Evidence Safety Gate
 * Enforces the invariant: RequiredEvidence ⊆ ProvidedEvidence
 * Never allows aggressive context reduction when critical task evidence is missing.
 */

import { EvidenceRequirement, EvidenceCategory, EvidenceSafetyResult } from './governorTypes';

export class EvidenceSafetyGate {
    /**
     * Audits the provided evidence against the required evidence matrix
     */
    public static auditEvidence(
        required: EvidenceRequirement[],
        provided: EvidenceCategory[]
    ): EvidenceSafetyResult {
        const present = new Set<EvidenceCategory>(provided);
        const missing = required.filter(requirement => !present.has(requirement.category));
        const criticalMissing = missing.filter(m => m.priority === 'critical');
        const actionTaken: EvidenceSafetyResult['actionTaken'] = criticalMissing.length > 0
            ? 'fail_closed_fallback'
            : missing.length > 0
                ? 'downgrade_to_conservative'
                : 'proceed';

        return {
            passed: missing.length === 0,
            required: required.map(requirement => ({ ...requirement })),
            provided: [...present],
            missing: missing.map(requirement => ({ ...requirement })),
            confidence: required.length ? (required.length - missing.length) / required.length : 1,
            actionTaken
        };
    }
}
