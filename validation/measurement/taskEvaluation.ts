/**
 * Controlled model-task evaluation: the harness for the one class of evidence this project does not
 * have.
 *
 * Everything measured so far is `deterministic-structural`. It establishes what the compiler does to
 * a payload - tokens removed, control flow retained, bytes preserved, protocol invariants held - and
 * it establishes nothing about whether a model still answers the question. That gap is why the
 * savings gate prints "This measures information retention, not downstream answer quality", why
 * `task-success-uplift` is registered unverified, and why no default has been changed on the
 * strength of a compression ratio.
 *
 * Closing it requires running the same real task twice against the same real model, once with full
 * context and once with optimized context, and scoring the outcomes. That is a different kind of
 * experiment from everything else here: it costs money, needs credentials this extension is
 * forbidden to hold, and is non-deterministic, so it cannot live in the default test run.
 *
 * This module is the harness for that experiment. It is deliberately shipped **unrun**. It refuses
 * to execute without explicit authorization, and it records enough about its own configuration that
 * a result could later be audited or reproduced. Until it is run, nothing here constitutes evidence,
 * and the claim registry must continue to say so.
 *
 * Why build it unrun rather than not build it: the definitions - what counts as a task, what counts
 * as success, what margin counts as non-inferior - are the part that must be fixed *before* results
 * exist, or the analysis can be shaped by them afterwards. Pre-registering them is the point.
 */

import { createHash } from 'crypto';

/** Environment variable that must be set deliberately for any provider-backed run. */
export const AUTHORIZATION_ENV = 'TOKONOMICS_TASK_EVAL_AUTHORIZED';

export type TaskWorkload = 'debug' | 'refactor' | 'feature' | 'test' | 'explain' | 'search';

export interface EvaluationTask {
    readonly id: string;
    readonly workload: TaskWorkload;
    /** The instruction given to the model, identical in both arms. */
    readonly prompt: string;
    /** Repository-relative files forming the full-context arm. */
    readonly contextFiles: readonly string[];
    /**
     * How the answer is judged. Deliberately outcome-based: a scorer that rewards mentioning the
     * right symbol would pass an answer that never solves anything.
     */
    readonly successCriteria: readonly string[];
}

/**
 * Pre-registered non-inferiority margins, per workload.
 *
 * One universal margin would be wrong in both directions. A search task that returns the wrong file
 * is simply a failure, so its margin is tight; an explanation is judged qualitatively and tolerates
 * more variance. These are fixed here, before any result exists, because a margin chosen after
 * seeing the data is not a margin.
 */
export const NON_INFERIORITY_MARGINS: Readonly<Record<TaskWorkload, number>> = Object.freeze({
    debug: 0.05,
    refactor: 0.05,
    feature: 0.07,
    test: 0.05,
    explain: 0.10,
    search: 0.03
});

/** Minimum paired samples per workload before any statistic is reported. */
export const MINIMUM_SAMPLES_PER_WORKLOAD = 30;

export interface ArmResult {
    readonly arm: 'baseline' | 'optimized';
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Whether the answer met every success criterion. */
    readonly succeeded: boolean;
    /** Extra model or tool turns needed to recover from missing context. */
    readonly recoveryTurns: number;
    readonly timeToFirstTokenMs: number;
    readonly endToEndMs: number;
}

export interface PairedTaskResult {
    readonly taskId: string;
    readonly workload: TaskWorkload;
    readonly baseline: ArmResult;
    readonly optimized: ArmResult;
}

export interface WorkloadVerdict {
    readonly workload: TaskWorkload;
    readonly samples: number;
    readonly baselineSuccessRate: number;
    readonly optimizedSuccessRate: number;
    readonly successDelta: number;
    readonly inputTokenReduction: number;
    readonly margin: number;
    readonly nonInferior: boolean;
    readonly underpowered: boolean;
    readonly verdict: 'promote' | 'hold' | 'reject' | 'insufficient-samples';
    readonly reason: string;
}

/**
 * Decides a workload's verdict under the Pareto rule: no material quality regression, and at least
 * one meaningful resource improvement.
 *
 * A resource win with a quality regression is a reject, not a trade - the whole premise is that the
 * saving is free. A quality win with no resource change is a hold, because this system exists to
 * reduce cost and an optimization that does not is not doing its job.
 */
export function judgeWorkload(results: readonly PairedTaskResult[], workload: TaskWorkload): WorkloadVerdict {
    const rows = results.filter(row => row.workload === workload);
    const margin = NON_INFERIORITY_MARGINS[workload];
    const samples = rows.length;

    const rate = (arm: 'baseline' | 'optimized') =>
        samples === 0 ? 0 : rows.filter(row => row[arm].succeeded).length / samples;
    const baselineSuccessRate = rate('baseline');
    const optimizedSuccessRate = rate('optimized');
    const successDelta = optimizedSuccessRate - baselineSuccessRate;

    const baselineTokens = rows.reduce((sum, row) => sum + row.baseline.inputTokens, 0);
    const optimizedTokens = rows.reduce((sum, row) => sum + row.optimized.inputTokens, 0);
    const inputTokenReduction = baselineTokens === 0 ? 0
        : Number(((baselineTokens - optimizedTokens) / baselineTokens).toFixed(4));

    const underpowered = samples < MINIMUM_SAMPLES_PER_WORKLOAD;
    const nonInferior = successDelta >= -margin;

    if (underpowered) {
        return Object.freeze({
            workload, samples, baselineSuccessRate, optimizedSuccessRate, successDelta,
            inputTokenReduction, margin, nonInferior, underpowered,
            verdict: 'insufficient-samples' as const,
            reason: `${samples} paired samples is below the pre-registered minimum of `
                + `${MINIMUM_SAMPLES_PER_WORKLOAD}; no verdict is reported.`
        });
    }
    if (!nonInferior) {
        return Object.freeze({
            workload, samples, baselineSuccessRate, optimizedSuccessRate, successDelta,
            inputTokenReduction, margin, nonInferior, underpowered,
            verdict: 'reject' as const,
            reason: `Success fell by ${(-successDelta * 100).toFixed(1)} points against a `
                + `pre-registered margin of ${(margin * 100).toFixed(0)}. A token saving does not buy this back.`
        });
    }
    if (inputTokenReduction <= 0.01) {
        return Object.freeze({
            workload, samples, baselineSuccessRate, optimizedSuccessRate, successDelta,
            inputTokenReduction, margin, nonInferior, underpowered,
            verdict: 'hold' as const,
            reason: 'Quality held but input tokens did not meaningfully fall, so there is nothing to promote.'
        });
    }
    return Object.freeze({
        workload, samples, baselineSuccessRate, optimizedSuccessRate, successDelta,
        inputTokenReduction, margin, nonInferior, underpowered,
        verdict: 'promote' as const,
        reason: `Quality is non-inferior within ${(margin * 100).toFixed(0)} points and input tokens `
            + `fell ${(inputTokenReduction * 100).toFixed(1)}%.`
    });
}

export interface EvaluationAuthorization {
    readonly authorized: boolean;
    readonly reason: string;
}

/**
 * Whether a provider-backed run may proceed.
 *
 * Refuses by default. This spends the user's money against their own credentials on a
 * non-deterministic experiment; it is not something a test run or a build should ever start on its
 * own, and an accidental run is a worse failure than no run at all.
 */
export function checkAuthorization(environment: Record<string, string | undefined>): EvaluationAuthorization {
    if (environment[AUTHORIZATION_ENV] !== 'yes') {
        return Object.freeze({
            authorized: false,
            reason: `Provider-backed evaluation is not authorized. Set ${AUTHORIZATION_ENV}=yes to run it `
                + 'deliberately. It issues real model requests against credentials this extension does not '
                + 'hold and must never be started by a build or test run.'
        });
    }
    return Object.freeze({ authorized: true, reason: 'Explicitly authorized by the operator.' });
}

/**
 * Identity of an evaluation run, so a result can be tied to exactly what produced it.
 *
 * Recorded before results exist. A result whose configuration is not pinned cannot be reproduced or
 * audited, and an unreproducible number is not evidence regardless of how carefully it was measured.
 */
export interface EvaluationRunIdentity {
    readonly taskCorpusHash: string;
    readonly modelId: string;
    readonly profile: string;
    readonly extensionVersion: string;
    readonly marginsHash: string;
    readonly startedAt: string;
}

export function describeRun(
    tasks: readonly EvaluationTask[],
    modelId: string,
    profile: string,
    extensionVersion: string,
    startedAt: string
): EvaluationRunIdentity {
    const corpus = tasks.map(task =>
        `${task.id}|${task.workload}|${task.prompt}|${task.contextFiles.join(',')}|${task.successCriteria.join(',')}`)
        .sort().join(String.fromCharCode(10));
    return Object.freeze({
        taskCorpusHash: createHash('sha256').update(corpus).digest('hex'),
        modelId,
        profile,
        extensionVersion,
        marginsHash: createHash('sha256').update(JSON.stringify(NON_INFERIORITY_MARGINS)).digest('hex'),
        startedAt
    });
}

/**
 * The status this evidence class currently has.
 *
 * Exported so reports and tests state the same thing, and so the day it changes, it changes in one
 * place with a result behind it.
 */
export const CONTROLLED_MODEL_TASK_STATUS = Object.freeze({
    hasBeenRun: true,
    reason: 'A pilot has been run: 14 paired tasks against a real model with tools disabled, so the '
        + 'context was the only variable (validation/reports/task-evaluation.json). Baseline full-file '
        + 'context answered 14/14; optimized context answered 11/14, for a 21.4 point regression '
        + 'against pre-registered margins of 3 to 10 points, at a 16.9 percent context reduction. All '
        + 'three losses were explicit INSUFFICIENT CONTEXT replies, and one carried 66 percent more '
        + 'tokens than the baseline while still lacking the answer - so the cause is evidence '
        + 'selection, not over-compression. Below the pre-registered floor of 30 samples per workload, '
        + 'so no promotion verdict follows; the evidence points against the claim rather than being '
        + 'absent, which is a stronger reason to leave it unverified.'
});
