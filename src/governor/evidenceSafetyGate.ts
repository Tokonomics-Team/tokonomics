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
        const providedSet = new Set<EvidenceCategory>(provided);
        const missing: EvidenceRequirement[] = [];

        for (const req of required) {
            if (!providedSet.has(req.category)) {
                missing.push(req);
            }
        }

        const criticalMissing = missing.filter(m => m.priority === 'critical');
        const highMissing = missing.filter(m => m.priority === 'high');

        let passed = true;
        let actionTaken: EvidenceSafetyResult['actionTaken'] = 'proceed';

        if (criticalMissing.length > 0) {
            // Critical evidence is missing -> must fail closed to prevent quality degradation
            passed = false;
            actionTaken = 'fail_closed_fallback';
        } else if (highMissing.length > 1) {
            // Multiple high-priority items missing -> downgrade to conservative representation
            passed = false;
            actionTaken = 'downgrade_to_conservative';
        }

        const totalReq = required.length;
        const matched = totalReq - missing.length;
        const confidence = totalReq > 0 ? Math.round((matched / totalReq) * 100) / 100 : 1.0;

        return {
            passed,
            required,
            provided,
            missing,
            confidence,
            actionTaken
        };
    }
}
