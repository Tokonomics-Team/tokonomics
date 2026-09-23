/**
 * Evidence classes and the promotion rule that binds a claim's wording to the evidence behind it.
 *
 * The project already tracked a claim's *status*. What it did not track was the *kind* of evidence
 * that status rested on, so nothing structurally prevented a number measured on a synthetic corpus
 * from being described as though it had been observed in production. This module makes the class
 * explicit and makes promotion above it impossible rather than merely discouraged.
 *
 * The three classes are ordered by what they can support, not by how much work they took:
 *
 * - `deterministic-structural`: the compiler was run over fixed inputs and its output inspected.
 *   Proves what the system does to a payload - token counts, retained control flow, byte equality,
 *   protocol invariants. Proves nothing whatsoever about whether a model answers the question, which
 *   is why a compression ratio can never on its own support a quality claim.
 *
 * - `controlled-model-task`: a real model completed real tasks with baseline and optimized context,
 *   scored on outcomes. Supports quality and non-inferiority statements for the workloads tested,
 *   and only those.
 *
 * - `production-reconciled`: provider-reported usage from real user traffic, reconciled against
 *   billing. The only class that supports an unqualified cost claim, and the one the VS Code
 *   Language Model API currently makes unreachable - it reports no usage at all (ADR-001).
 *
 * Pure module: deterministic in its arguments, no I/O.
 */

export type EvidenceClass =
    | 'deterministic-structural'
    | 'controlled-model-task'
    | 'production-reconciled';

export type ClaimStatus =
    | 'unverified'
    | 'experimental'
    | 'qualified'
    | 'verified'
    | 'retired';

/**
 * What a claim is about, which decides what its evidence can settle.
 *
 * An `artifact` claim describes the system itself - what the bundle contains, where code runs, what
 * a mechanism does to a payload. Structural inspection settles those completely: "no local model
 * ships in this extension" is proven by looking in the bundle, and no amount of model evaluation
 * would make it truer.
 *
 * An `outcome` claim describes what happens as a result - tokens saved, quality retained, money not
 * spent. Inspecting the system cannot settle those, because the system is not the thing being
 * claimed about. This distinction is why the ceiling is not a property of the evidence class alone.
 */
export type ClaimScope = 'artifact' | 'outcome';

/** Highest status each evidence class can support, per claim scope. */
const CEILING: Readonly<Record<ClaimScope, Readonly<Record<EvidenceClass, ClaimStatus>>>> = Object.freeze({
    artifact: Object.freeze({
        'deterministic-structural': 'verified' as ClaimStatus,
        'controlled-model-task': 'verified' as ClaimStatus,
        'production-reconciled': 'verified' as ClaimStatus
    }),
    outcome: Object.freeze({
        // Structural measurement shows what happened to a payload, never what it was worth.
        'deterministic-structural': 'qualified' as ClaimStatus,
        // A controlled study generalises to the workloads it tested, and no further.
        'controlled-model-task': 'qualified' as ClaimStatus,
        'production-reconciled': 'verified' as ClaimStatus
    })
});

const RANK: Readonly<Record<ClaimStatus, number>> = Object.freeze({
    retired: 0, unverified: 1, experimental: 2, qualified: 3, verified: 4
});

export interface ClaimRecord {
    readonly id: string;
    readonly status: ClaimStatus;
    readonly evidenceClass?: EvidenceClass;
    readonly claimScope?: ClaimScope;
    readonly publicLocations?: readonly string[];
    readonly limitations?: string;
}

export interface ClaimViolation {
    readonly claimId: string;
    readonly problem: string;
}

/**
 * Checks every claim against the promotion rule.
 *
 * Four conditions, each of which has a specific failure it prevents:
 *
 * 1. A claim must declare its evidence class. Without one, its status rests on nothing inspectable.
 * 2. A claim may not exceed its class ceiling - the rule that stops a structural measurement being
 *    stated as a production fact.
 * 3. A claim stated publicly must be at least `qualified`; an unverified claim in the README is a
 *    promise the evidence does not support.
 * 4. A claim below `verified` that is public must disclose its limitations, because a qualified
 *    claim without its qualification is an unqualified claim.
 */
export function findClaimViolations(claims: readonly ClaimRecord[]): ClaimViolation[] {
    const violations: ClaimViolation[] = [];
    for (const claim of claims) {
        if (claim.status === 'retired') continue;

        if (!claim.evidenceClass) {
            violations.push({ claimId: claim.id, problem: 'declares no evidence class' });
            continue;
        }
        if (!claim.claimScope) {
            violations.push({ claimId: claim.id, problem: 'declares no claim scope' });
            continue;
        }
        const ceiling = CEILING[claim.claimScope][claim.evidenceClass];
        if (RANK[claim.status] > RANK[ceiling]) {
            violations.push({
                claimId: claim.id,
                problem: `is '${claim.status}' but ${claim.evidenceClass} evidence for an `
                    + `${claim.claimScope} claim supports at most '${ceiling}'`
            });
        }
        const isPublic = (claim.publicLocations || []).length > 0;
        if (isPublic && RANK[claim.status] < RANK.qualified) {
            violations.push({
                claimId: claim.id,
                problem: `is stated publicly in ${(claim.publicLocations || []).join(', ')} while only '${claim.status}'`
            });
        }
        if (isPublic && claim.status !== 'verified'
            && (!claim.limitations || claim.limitations.trim().length === 0)) {
            violations.push({
                claimId: claim.id,
                problem: 'is public and not verified, but discloses no limitations'
            });
        }
    }
    return violations;
}

/** Human-readable description of what a class can and cannot support. */
export function describeEvidenceClass(evidenceClass: EvidenceClass): string {
    switch (evidenceClass) {
        case 'deterministic-structural':
            return 'Compiler output over fixed inputs. Establishes what happens to a payload; '
                + 'establishes nothing about whether a model answers the question.';
        case 'controlled-model-task':
            return 'A real model completed real tasks with baseline and optimized context. '
                + 'Supports quality statements for the workloads tested, and only those.';
        case 'production-reconciled':
            return 'Provider-reported usage from real traffic, reconciled against billing. '
                + 'The only class supporting an unqualified cost claim.';
    }
}
