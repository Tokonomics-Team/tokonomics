/**
 * SOTA Alignment — Phase 5: evidence classes and claim promotion.
 *
 * The project tracked what each claim's status was, but not what kind of evidence that status rested
 * on, so nothing structurally prevented a number measured on fixed inputs from being stated as
 * though it had been observed in production. These tests make the promotion rule enforceable.
 *
 * They also assert that the provider-backed evaluator cannot start itself, that its margins were
 * pre-registered - a margin chosen after seeing results is not a margin - and that a claim the
 * measured evidence contradicts stays unverified and unpublished.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { findClaimViolations, describeEvidenceClass, ClaimRecord } from '../validation/claims/evidenceClass';
import {
    judgeWorkload, checkAuthorization, describeRun, NON_INFERIORITY_MARGINS,
    MINIMUM_SAMPLES_PER_WORKLOAD, AUTHORIZATION_ENV, CONTROLLED_MODEL_TASK_STATUS,
    PairedTaskResult, EvaluationTask
} from '../validation/measurement/taskEvaluation';

function pair(id: string, workload: 'debug', baselineOk: boolean, optimizedOk: boolean,
    baselineTokens = 10_000, optimizedTokens = 3_000): PairedTaskResult {
    const arm = (ok: boolean, tokens: number, name: 'baseline' | 'optimized') => ({
        arm: name, inputTokens: tokens, outputTokens: 400, succeeded: ok,
        recoveryTurns: 0, timeToFirstTokenMs: 500, endToEndMs: 4_000
    });
    return { taskId: id, workload, baseline: arm(baselineOk, baselineTokens, 'baseline'),
        optimized: arm(optimizedOk, optimizedTokens, 'optimized') };
}

export async function runSotaPhase5EvidenceClaimTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 5 Evidence and Claim Tests ---');

    const rootDir = path.join(__dirname, '..');

    // ---------------------------------------------------------------------
    // 1. Every registered claim satisfies the promotion rule.
    // ---------------------------------------------------------------------
    const registry = JSON.parse(fs.readFileSync(
        path.join(rootDir, 'validation', 'claims', 'claim-registry.json'), 'utf8'));
    const violations = findClaimViolations(registry.claims as ClaimRecord[]);
    assert.deepStrictEqual(violations, [],
        'Claims must not hold a status their evidence class and scope cannot support:\n'
        + violations.map(item => `  ${item.claimId} ${item.problem}`).join('\n'));

    for (const claim of registry.claims as ClaimRecord[]) {
        assert.ok(claim.evidenceClass, `${claim.id} must declare an evidence class`);
        assert.ok(claim.claimScope, `${claim.id} must declare a claim scope`);
    }

    // ---------------------------------------------------------------------
    // 2. The rule actually bites.
    // ---------------------------------------------------------------------
    // An outcome claim cannot be verified on structural evidence: measuring what happened to a
    // payload says nothing about what it was worth. This is the substitution the rule exists to stop.
    const overreach = findClaimViolations([{
        id: 'invented-savings', status: 'verified',
        evidenceClass: 'deterministic-structural', claimScope: 'outcome'
    }]);
    assert.strictEqual(overreach.length, 1);
    assert.ok(overreach[0].problem.includes('supports at most'),
        'An outcome claim verified on structural evidence must be rejected');

    // But an artifact claim may be verified on structural evidence, because inspecting the bundle is
    // exactly how you settle what is in the bundle.
    assert.deepStrictEqual(findClaimViolations([{
        id: 'no-local-model', status: 'verified',
        evidenceClass: 'deterministic-structural', claimScope: 'artifact'
    }]), [], 'An artifact claim is settled by structural inspection and may be verified');

    // A claim stated publicly on unverified evidence is a promise the evidence does not support.
    const publicUnverified = findClaimViolations([{
        id: 'leaked', status: 'unverified', evidenceClass: 'deterministic-structural',
        claimScope: 'outcome', publicLocations: ['README.md']
    }]);
    assert.ok(publicUnverified.some(item => item.problem.includes('stated publicly')),
        'An unverified claim must not appear in public documentation');

    // A public, non-verified claim without disclosed limitations is an unqualified claim.
    const undisclosed = findClaimViolations([{
        id: 'bare', status: 'qualified', evidenceClass: 'deterministic-structural',
        claimScope: 'outcome', publicLocations: ['README.md']
    }]);
    assert.ok(undisclosed.some(item => item.problem.includes('no limitations')),
        'A qualified public claim must disclose what qualifies it');

    // Retired claims are exempt: they are no longer made.
    assert.deepStrictEqual(findClaimViolations([{ id: 'gone', status: 'retired' }]), []);

    // ---------------------------------------------------------------------
    // 3. Cost claims remain unreachable through the current provider boundary.
    // ---------------------------------------------------------------------
    const cacheClaim = (registry.claims as ClaimRecord[]).find(item => item.id === 'provider-cache-savings');
    assert.ok(cacheClaim, 'The provider cache claim must remain registered');
    assert.strictEqual(cacheClaim.evidenceClass, 'production-reconciled',
        'A cost claim requires reconciled provider usage, which ADR-001 records as unavailable');
    assert.strictEqual(cacheClaim.status, 'unverified');
    assert.deepStrictEqual(cacheClaim.publicLocations, [],
        'An unverifiable cost claim must appear nowhere public');

    assert.ok(describeEvidenceClass('deterministic-structural').includes('nothing about whether a model'),
        'The structural class must state its own limit');

    // ---------------------------------------------------------------------
    // 4. The provider-backed evaluator refuses to start itself.
    // ---------------------------------------------------------------------
    assert.strictEqual(checkAuthorization({}).authorized, false,
        'Provider-backed evaluation must never run without explicit authorization');
    assert.strictEqual(checkAuthorization({ [AUTHORIZATION_ENV]: 'true' }).authorized, false,
        'Only the exact opt-in value authorizes a run; a truthy-looking value must not');
    assert.strictEqual(checkAuthorization({ [AUTHORIZATION_ENV]: 'yes' }).authorized, true);
    assert.strictEqual(process.env[AUTHORIZATION_ENV], undefined,
        'The repository test run must not carry evaluation authorization');
    // The pilot has now been run, and it must not be possible to say so without the evidence file.
    assert.strictEqual(CONTROLLED_MODEL_TASK_STATUS.hasBeenRun, true,
        'The controlled model-task pilot has been run; its status must say so');
    const evaluationReport = path.join(rootDir, 'validation', 'reports', 'task-evaluation.json');
    assert.ok(fs.existsSync(evaluationReport),
        'A status claiming the evaluation ran must be backed by its evidence file');
    const evaluation = JSON.parse(fs.readFileSync(evaluationReport, 'utf8'));
    assert.strictEqual(evaluation.evidenceClass, 'controlled-model-task');
    assert.strictEqual(evaluation.toolsDisabled, true,
        'The model must run without tools, or the context is not the only variable and the '
        + 'comparison measures nothing');
    // A contaminated run reports no quality delta at all: a call that never completed is not a
    // wrong answer, and averaging it in as one manufactures a regression out of an outage.
    if (evaluation.transportFailures > 0) {
        assert.strictEqual(evaluation.qualityDelta, null,
            'A run with transport failures must withhold its quality delta');
    } else {
        assert.strictEqual(typeof evaluation.qualityDelta, 'number');
    }

    // The measured result contradicts the task-success claim, so that claim must stay unverified.
    const upliftClaim = (registry.claims as ClaimRecord[]).find(item => item.id === 'task-success-uplift');
    assert.ok(upliftClaim);
    assert.strictEqual(upliftClaim.status, 'unverified',
        'Evidence pointing against a claim is a stronger reason to leave it unverified, not a weaker one');
    assert.deepStrictEqual(upliftClaim.publicLocations, [],
        'A claim the evidence contradicts must appear nowhere public');

    // ---------------------------------------------------------------------
    // 5. Verdicts follow the Pareto rule, not the token number.
    // ---------------------------------------------------------------------
    const many = (count: number, baselineOk: boolean, optimizedOk: boolean) =>
        Array.from({ length: count }, (_, index) => pair(`t${index}`, 'debug', baselineOk, optimizedOk));

    const underpowered = judgeWorkload(many(10, true, true), 'debug');
    assert.strictEqual(underpowered.verdict, 'insufficient-samples',
        'Below the pre-registered sample floor, no verdict may be reported');
    assert.ok(underpowered.reason.includes(String(MINIMUM_SAMPLES_PER_WORKLOAD)));

    const promoted = judgeWorkload(many(40, true, true), 'debug');
    assert.strictEqual(promoted.verdict, 'promote');
    assert.ok(promoted.inputTokenReduction > 0.5);

    // A quality regression is a reject even when tokens fall dramatically: the premise is that the
    // saving is free, so a saving that costs correctness is not the thing being claimed.
    const regressed = judgeWorkload([...many(20, true, true), ...many(20, true, false)], 'debug');
    assert.strictEqual(regressed.verdict, 'reject',
        'A material quality regression must reject regardless of the token saving');
    assert.ok(regressed.reason.includes('does not buy this back'));

    // Quality held but no saving is a hold, not a promotion.
    const noSaving = judgeWorkload(
        Array.from({ length: 40 }, (_, index) => pair(`t${index}`, 'debug', true, true, 10_000, 10_000)),
        'debug');
    assert.strictEqual(noSaving.verdict, 'hold',
        'An optimization that preserves quality but saves nothing has nothing to promote');

    // ---------------------------------------------------------------------
    // 6. Margins are per workload and pre-registered.
    // ---------------------------------------------------------------------
    assert.ok(NON_INFERIORITY_MARGINS.search < NON_INFERIORITY_MARGINS.explain,
        'A search task that returns the wrong file is simply wrong; an explanation tolerates more variance');
    const workloads = Object.keys(NON_INFERIORITY_MARGINS);
    assert.ok(workloads.length >= 6, 'Every measured workload needs its own margin');
    for (const [workload, margin] of Object.entries(NON_INFERIORITY_MARGINS)) {
        assert.ok(margin > 0 && margin <= 0.15, `${workload} margin must be a real, tight bound`);
    }

    // The run identity pins the corpus and the margins, so a result cannot be reinterpreted later
    // under different definitions.
    const tasks: EvaluationTask[] = [{
        id: 'demo', workload: 'debug', prompt: 'Fix the off-by-one in computeVector.',
        contextFiles: ['src/search/embeddingProvider.ts'], successCriteria: ['patch applies', 'tests pass']
    }];
    const identity = describeRun(tasks, 'claude-sonnet-5', 'balanced', '7.0.1', '2026-09-07T00:00:00.000Z');
    assert.match(identity.taskCorpusHash, /^[0-9a-f]{64}$/);
    assert.match(identity.marginsHash, /^[0-9a-f]{64}$/);
    assert.strictEqual(describeRun(tasks, 'claude-sonnet-5', 'balanced', '7.0.1', '2026-09-07T00:00:00.000Z').taskCorpusHash,
        identity.taskCorpusHash, 'The same corpus must hash identically, so runs are comparable');

    // ---------------------------------------------------------------------
    // 7. The savings gate keeps saying what it does not measure.
    // ---------------------------------------------------------------------
    const gate = fs.readFileSync(path.join(rootDir, 'scripts', 'measure-savings.js'), 'utf8');
    assert.ok(gate.includes('not downstream answer quality'),
        'The savings gate must keep stating that it measures retention, not answer quality');

    console.log('  ✓ Every registered claim satisfies the promotion rule.');
    console.log('  ✓ An outcome claim cannot be verified on structural evidence; an artifact claim can.');
    console.log('  ✓ Cost claims stay unverified and unpublished while provider usage is unavailable.');
    console.log('  ✓ Provider-backed evaluation refuses to start itself; the pilot result is bound to its evidence file.');
    console.log('  ✓ Verdicts follow the Pareto rule: a saving that costs correctness is rejected.');
    console.log('  ✓ Non-inferiority margins are per workload and pre-registered.');
    console.log('\n--- ALL SOTA PHASE 5 EVIDENCE AND CLAIM TESTS PASSED ---\n');
}
