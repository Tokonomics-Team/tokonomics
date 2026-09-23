/**
 * Controlled model-task evaluation: the one evidence class this project did not have.
 *
 * Runs each task twice against the same real model - once with the whole focal file attached, once
 * with the context Tokonomics actually produces - and scores the answers. The model runs with tools
 * disabled, so the context is the only variable; an agent that could read the repository would
 * answer both arms identically and the experiment would measure nothing.
 *
 *   TOKONOMICS_TASK_EVAL_AUTHORIZED=yes npm run evaluate:tasks
 *
 * This issues real model requests. It refuses to run without the authorization variable, and it is
 * never part of the default test run.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const AUTH_ENV = 'TOKONOMICS_TASK_EVAL_AUTHORIZED';

async function build() {
    const outfile = path.join(root, 'out_test', 'taskeval.js');
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'validation', 'measurement', 'taskEvalRunner.ts')],
        bundle: true, platform: 'node', format: 'cjs', outfile,
        external: ['vscode'], logLevel: 'silent'
    });
    return require(outfile);
}

function sleep(ms) {
    // Deliberately synchronous: the evaluation is a sequential experiment, and pacing it with a
    // real pause is simpler to reason about than interleaving async work into a measurement loop.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Invokes the model with tools disabled, prompt delivered on stdin to avoid argument limits.
 *
 * Retries with backoff because the first run of this evaluation lost its last nine calls to what was
 * almost certainly rate limiting: the process exited non-zero with empty stdout and empty stderr,
 * every call from the twentieth onward failed, and the same prompt succeeded immediately afterwards.
 * A transport failure scored as a wrong answer would have reported a 21-point quality regression
 * that never happened, so the failure has to be distinguishable from the result.
 */
function askModel(execPath, promptText, timeoutMs, attempts = 3) {
    const started = Date.now();
    let last = { status: null, signal: null, stdout: '', stderr: '', error: null };
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const result = spawnSync(execPath, ['-p', '--allowedTools', ''], {
            input: promptText,
            encoding: 'utf8',
            timeout: timeoutMs,
            maxBuffer: 32 * 1024 * 1024
        });
        last = {
            status: result.status, signal: result.signal,
            stdout: result.stdout || '', stderr: result.stderr || '',
            error: result.error ? String(result.error.message) : null
        };
        if (result.status === 0 && last.stdout.trim().length > 0) {
            return {
                ok: true, answer: last.stdout.trim(), error: '', attempts: attempt,
                elapsedMs: Date.now() - started
            };
        }
        if (attempt < attempts) sleep(attempt * 20_000);
    }
    return {
        ok: false,
        answer: last.stdout.trim(),
        error: [last.stderr.trim(), last.error, `status=${last.status}`, `signal=${last.signal}`]
            .filter(Boolean).join(' | '),
        attempts,
        elapsedMs: Date.now() - started
    };
}

/** Pause between calls, so a sequential experiment does not look like a burst. */
const INTER_CALL_PAUSE_MS = 3_000;

function pct(value) { return `${(value * 100).toFixed(1)}%`; }

async function main() {
    if (process.env[AUTH_ENV] !== 'yes') {
        console.error(`Provider-backed evaluation is not authorized.`);
        console.error(`Set ${AUTH_ENV}=yes to run it deliberately. It issues real model requests.`);
        process.exit(2);
    }
    const execPath = process.env.CLAUDE_CODE_EXECPATH;
    if (!execPath || !fs.existsSync(execPath)) {
        console.error('No model executable available (CLAUDE_CODE_EXECPATH unset or missing).');
        process.exit(2);
    }

    const { buildTasks, scoreAnswer } = await build();
    // Profile is selectable so the two shipped profiles can be compared against each other, which is
    // the question a user actually faces: does Maximum Savings answer better or worse than Balanced?
    const profile = process.env.TOKONOMICS_EVAL_PROFILE === 'balanced' ? 'balanced' : 'maximum';
    const built = await buildTasks(root, profile);

    console.log('='.repeat(84));
    console.log('CONTROLLED MODEL-TASK EVALUATION - real model, tools disabled, context is the variable');
    console.log('='.repeat(84));
    console.log(`tasks: ${built.length}   arms: 2   total model calls: ${built.length * 2}   profile: ${profile}`);

    const rows = [];
    for (const item of built) {
        const record = { id: item.task.id, workload: item.task.workload, arms: {} };
        for (const arm of ['baseline', 'optimized']) {
            const prompt = item[arm];
            const response = askModel(execPath, prompt.text, 180_000);
            sleep(INTER_CALL_PAUSE_MS);
            const scored = response.ok
                ? scoreAnswer(item.task, response.answer)
                : { succeeded: false, declaredInsufficient: false, missingGroups: ['<no answer>'] };
            record.arms[arm] = {
                contextTokens: prompt.contextTokens,
                succeeded: scored.succeeded,
                declaredInsufficient: scored.declaredInsufficient,
                missingGroups: scored.missingGroups,
                elapsedMs: response.elapsedMs,
                transportOk: response.ok,
                attempts: response.attempts,
                answer: response.answer.slice(0, 600),
                error: response.error.slice(0, 300)
            };
            const mark = scored.succeeded ? 'PASS' : (scored.declaredInsufficient ? 'INSUFFICIENT' : 'FAIL');
            console.log(`  ${item.task.id.padEnd(30)} ${arm.padEnd(10)} ${String(prompt.contextTokens).padStart(6)} tok  ${mark}`);
        }
        rows.push(record);
    }

    const arm = name => rows.map(row => row.arms[name]);
    const successes = name => arm(name).filter(entry => entry.succeeded).length;
    const tokens = name => arm(name).reduce((sum, entry) => sum + entry.contextTokens, 0);
    const transportFailures = rows.filter(row =>
        !row.arms.baseline.transportOk || !row.arms.optimized.transportOk).length;

    const baselineRate = successes('baseline') / rows.length;
    const optimizedRate = successes('optimized') / rows.length;
    const tokenReduction = tokens('baseline') > 0
        ? (tokens('baseline') - tokens('optimized')) / tokens('baseline')
        : 0;

    console.log('\n' + '-'.repeat(84));
    console.log(`baseline  success ${successes('baseline')}/${rows.length} (${pct(baselineRate)})   context ${tokens('baseline')} tokens`);
    console.log(`optimized success ${successes('optimized')}/${rows.length} (${pct(optimizedRate)})   context ${tokens('optimized')} tokens`);
    console.log(`context token reduction ${pct(tokenReduction)}`);
    if (transportFailures > 0) {
        console.log(`
TRANSPORT FAILURES: ${transportFailures} task(s) did not get an answer from the`);
        console.log('model in one or both arms. A call that never completed is not a wrong answer, so');
        console.log('no quality delta is reported: the comparison is contaminated and must be re-run.');
    } else {
        console.log(`quality delta ${((optimizedRate - baselineRate) * 100).toFixed(1)} points`);
    }

    const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        evidenceClass: 'controlled-model-task',
        model: 'claude-code-cli-default',
        profile,
        toolsDisabled: true,
        tasks: rows.length,
        baselineSuccessRate: Number(baselineRate.toFixed(4)),
        optimizedSuccessRate: Number(optimizedRate.toFixed(4)),
        baselineContextTokens: tokens('baseline'),
        optimizedContextTokens: tokens('optimized'),
        contextTokenReduction: Number(tokenReduction.toFixed(4)),
        transportFailures,
        // A run with any transport failure reports no quality delta at all. A call that never
        // completed is not evidence about context quality, and averaging it in as a failure would
        // manufacture a regression out of an infrastructure problem.
        qualityDelta: transportFailures === 0
            ? Number((optimizedRate - baselineRate).toFixed(4))
            : null,
        qualityDeltaWithheldReason: transportFailures === 0 ? null
            : 'One or more model calls did not complete; the comparison is contaminated.',
        results: rows,
        limitations: [
            'Sample size is below the pre-registered minimum of 30 paired samples per workload, so no',
            'promotion verdict is reported. This is pilot evidence.',
            'Scoring is exact substring matching, which produces false negatives on unusual phrasing',
            'and therefore biases against concluding that optimization preserved quality.',
            'One repository, one model, questions with short factual answers. It does not measure',
            'multi-turn agentic work, patch application, or test outcomes.'
        ]
    };
    const target = path.join(root, 'validation', 'reports',
        profile === 'balanced' ? 'task-evaluation-balanced.json' : 'task-evaluation.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + os.EOL, 'utf8');
    console.log(`\nEvidence: ${path.relative(root, target)}`);
    console.log('Pilot evidence: below the pre-registered sample floor, so no promotion verdict follows.');
}

main().catch(error => {
    console.error(`\nEvaluation failed: ${error && error.stack ? error.stack : error}`);
    process.exit(1);
});
