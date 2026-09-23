/**
 * SOTA Alignment — Phase 4: cache-stable conversations and authoritative budgeting.
 *
 * The defect: history was kept with a sliding window, so past a fixed turn count every request
 * dropped the oldest turn and shifted everything after it. A provider prefix cache matches an exact
 * byte prefix, so a prefix that moves every turn is never reused - the longest conversations, where
 * caching is worth the most, benefited least.
 *
 * The governing property is therefore prefix identity across turns, asserted directly by replaying a
 * growing conversation and comparing rendered bytes.
 */

import assert from 'assert';
import {
    resolveContextEpoch, applyContextEpoch, recordPrefixStability, prefixDigest,
    DEFAULT_CONTEXT_EPOCH, EpochTurn
} from '../src/history/contextEpoch';
import {
    countAuthoritative, requiresRepack, planRepack, CONSERVATIVE_ESTIMATE_MARGIN
} from '../src/engine/authoritativeCount';
import { buildConversationCheckpoint, renderCheckpoint } from '../src/history/contextEpoch';

const OPTIONS = { ...DEFAULT_CONTEXT_EPOCH, epochTokens: 4_000, minRetainedTurns: 2, maxRetainedTurns: 200 };

/** A turn of roughly `tokens` estimated size, deterministic in its index. */
function turn(index: number, tokens = 250): EpochTurn {
    return { content: `turn-${index} ` + 'x'.repeat(Math.max(0, tokens * 4 - 12)) };
}

function renderedPrefix(history: readonly EpochTurn[]): string {
    const decision = resolveContextEpoch(history, OPTIONS);
    const retained = applyContextEpoch(history, decision);
    // The prefix is everything except the newest turn: the bytes a provider cache could match.
    return retained.slice(0, Math.max(0, retained.length - 1)).map(item => item.content).join('|');
}

export async function runSotaPhase4EpochBudgetTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 4 Epoch and Budget Tests ---');

    // ---------------------------------------------------------------------
    // 1. Within an epoch, the rendered prefix is byte-identical across turns.
    // ---------------------------------------------------------------------
    const history: EpochTurn[] = [];
    const prefixes: string[] = [];
    const epochs: number[] = [];
    for (let index = 0; index < 60; index++) {
        history.push(turn(index));
        const decision = resolveContextEpoch(history, OPTIONS);
        epochs.push(decision.epoch);
        prefixes.push(renderedPrefix(history));
    }

    let identicalWithinEpoch = 0;
    let epochChanges = 0;
    for (let index = 1; index < prefixes.length; index++) {
        if (epochs[index] !== epochs[index - 1]) { epochChanges++; continue; }
        // Same epoch: the previous prefix must be a prefix of the current one. It may have grown by
        // the turn that was newest last time, but nothing before it may have shifted.
        assert.ok(prefixes[index].startsWith(prefixes[index - 1]),
            `Turn ${index}: the retained prefix shifted inside epoch ${epochs[index]}; `
            + 'a provider prefix cache would be invalidated on every turn');
        identicalWithinEpoch++;
    }
    assert.ok(identicalWithinEpoch > 40,
        `Expected most turns to extend a stable prefix, got ${identicalWithinEpoch}`);
    assert.ok(epochChanges > 0 && epochChanges < 8,
        `The anchor must move rarely and by a lot; it moved ${epochChanges} times in 60 turns`);

    // The contrast that motivates all of this: a sliding window shifts on every turn past its limit.
    const windowPrefixes: string[] = [];
    for (let index = 10; index <= 40; index++) {
        const windowed = history.slice(0, index).slice(-8);
        windowPrefixes.push(windowed.slice(0, -1).map(item => item.content).join('|'));
    }
    const windowStable = windowPrefixes.filter((value, index) =>
        index > 0 && value.startsWith(windowPrefixes[index - 1])).length;
    assert.strictEqual(windowStable, 0,
        'A sliding window must be shown to shift on every turn - that is the behaviour being replaced');

    // ---------------------------------------------------------------------
    // 2. The anchor is derived, not remembered: same history, same decision.
    // ---------------------------------------------------------------------
    const first = resolveContextEpoch(history, OPTIONS);
    const second = resolveContextEpoch([...history], OPTIONS);
    assert.deepStrictEqual(first, second,
        'Two requests over the same conversation must agree on where the prefix starts');

    // ---------------------------------------------------------------------
    // 3. Recent turns are never dropped, and retention stays bounded.
    // ---------------------------------------------------------------------
    for (let size = 1; size <= 60; size++) {
        const slice = history.slice(0, size);
        const decision = resolveContextEpoch(slice, OPTIONS);
        assert.ok(decision.retainedTurns >= Math.min(OPTIONS.minRetainedTurns, size),
            `At ${size} turns, the most recent turns must always be retained`);
        assert.ok(decision.startIndex >= 0 && decision.startIndex <= slice.length,
            'The anchor must stay inside the conversation');
    }

    const long = Array.from({ length: 400 }, (_, index) => turn(index));
    const bounded = resolveContextEpoch(long, { ...OPTIONS, maxRetainedTurns: 20 });
    assert.ok(bounded.retainedTurns <= 20,
        'Retention must respect its ceiling on very long conversations');

    // ---------------------------------------------------------------------
    // 4. A checkpoint happens once, at the boundary, not every turn.
    // ---------------------------------------------------------------------
    const checkpoints: number[] = [];
    const growing: EpochTurn[] = [];
    for (let index = 0; index < 60; index++) {
        growing.push(turn(index));
        if (resolveContextEpoch(growing, OPTIONS).checkpointCreated) checkpoints.push(index);
    }
    assert.ok(checkpoints.length > 0, 'Long conversations must eventually checkpoint');
    assert.deepStrictEqual(checkpoints, [...new Set(checkpoints)],
        'Each checkpoint must be reported once');
    assert.ok(checkpoints.length <= 8,
        `Checkpoints must be rare; got ${checkpoints.length} in 60 turns`);

    // ---------------------------------------------------------------------
    // 5. Prefix records carry no conversation text.
    // ---------------------------------------------------------------------
    const decision = resolveContextEpoch(history, OPTIONS);
    const record = recordPrefixStability(applyContextEpoch(history, decision), decision);
    const serialized = JSON.stringify(record);
    assert.ok(!serialized.includes('xxxx'),
        'A prefix stability record must not contain conversation text');
    assert.ok(!serialized.includes('turn-3'),
        'A prefix stability record must not contain conversation text');
    assert.match(record.prefixDigest, /^[0-9a-f]{8}$/, 'The digest must be a short hex value');

    // The digest distinguishes different prefixes and matches identical ones.
    assert.strictEqual(prefixDigest([turn(1), turn(2)]), prefixDigest([turn(1), turn(2)]));
    assert.notStrictEqual(prefixDigest([turn(1), turn(2)]), prefixDigest([turn(1), turn(3)]));

    // ---------------------------------------------------------------------
    // 6. Authoritative counting: the model's tokenizer decides, when it exists.
    // ---------------------------------------------------------------------
    const counted = await countAuthoritative(
        { countTokens: async () => 1_200 }, 'payload', 1_000, 8_000);
    assert.strictEqual(counted.method, 'provider_counted');
    assert.strictEqual(counted.tokens, 1_200);
    assert.strictEqual(counted.withinBudget, true);
    // Drift is signed and relative: the estimator was low by 200 of 1200.
    assert.ok(Math.abs(counted.estimatorDrift - (-200 / 1200)) < 0.001,
        `Estimator drift must be recorded relative to the authoritative count, got ${counted.estimatorDrift}`);
    assert.ok(!/billed|usage|cost/i.test(counted.reason.replace('not billed usage', '')),
        'A token count must never be described as billed usage');

    // No counter available: the estimate is used, with a margin before judging fit.
    const estimated = await countAuthoritative(undefined, 'payload', 1_000, 1_020);
    assert.strictEqual(estimated.method, 'estimated');
    assert.strictEqual(estimated.withinBudget, false,
        'Without an authoritative count, the margin must make a near-limit payload count as over budget');
    assert.ok(CONSERVATIVE_ESTIMATE_MARGIN > 0);

    // A failing counter must not block a request that would otherwise have succeeded.
    const failed = await countAuthoritative(
        { countTokens: async () => { throw new Error('counter unavailable'); } }, 'payload', 500, 8_000);
    assert.strictEqual(failed.method, 'estimate_after_failure');
    assert.strictEqual(failed.tokens, 500);
    assert.strictEqual(failed.withinBudget, true);

    // A counter returning nonsense is treated as a failure, not trusted.
    const nonsense = await countAuthoritative(
        { countTokens: async () => Number.NaN }, 'payload', 500, 8_000);
    assert.strictEqual(nonsense.method, 'estimate_after_failure');

    // ---------------------------------------------------------------------
    // 7. Repacking is warranted only when the estimate was wrong in the costly direction.
    // ---------------------------------------------------------------------
    const overBudget = await countAuthoritative({ countTokens: async () => 9_000 }, 'p', 7_000, 8_000);
    assert.strictEqual(requiresRepack(overBudget, 7_000, 8_000), true,
        'An authoritative count over budget that the estimator thought fit must trigger a repack');
    assert.strictEqual(requiresRepack(counted, 1_000, 8_000), false,
        'A payload within budget must not be repacked');
    assert.strictEqual(requiresRepack(overBudget, 9_500, 8_000), false,
        'A payload the estimator already knew was too large was never packed; repacking is not the fix');
    assert.strictEqual(requiresRepack(failed, 500, 8_000), false,
        'An estimate cannot justify a repack; only an authoritative count can');
    assert.strictEqual(requiresRepack(overBudget, 7_000, undefined), false,
        'With no known budget there is nothing to be over');

    // ---------------------------------------------------------------------
    // 8. Repacking drops optional evidence, never mandatory, and fails closed.
    // ---------------------------------------------------------------------
    const items = [
        { id: 'must-a', tokens: 300, mandatory: true, value: 0.9 },
        { id: 'must-b', tokens: 300, mandatory: true, value: 0.8 },
        { id: 'opt-high', tokens: 300, mandatory: false, value: 0.7 },
        { id: 'opt-mid', tokens: 300, mandatory: false, value: 0.4 },
        { id: 'opt-low', tokens: 300, mandatory: false, value: 0.1 }
    ];

    const fitsAlready = planRepack(items, 100, 5_000);
    assert.deepStrictEqual(fitsAlready.droppedIds, [], 'A payload already within budget must drop nothing');
    assert.strictEqual(fitsAlready.fits, true);

    // Lowest value goes first, so what survives is what the packer already judged most useful.
    // 100 fixed + 5x300 = 1600. At a 1300 budget one drop is exactly enough, and the planner stops
    // there: dropping more evidence than the budget requires would be a saving nobody asked for.
    const trimmed = planRepack(items, 100, 1_300);
    assert.strictEqual(trimmed.fits, true);
    assert.deepStrictEqual(trimmed.droppedIds, ['opt-low'],
        'The planner must drop the least valuable item and stop as soon as the payload fits');
    assert.strictEqual(trimmed.retainedTokens, 1_300);

    // A tighter budget drops further up the value order, still lowest-first.
    const tighter = planRepack(items, 100, 1_000);
    assert.deepStrictEqual(tighter.droppedIds, ['opt-low', 'opt-mid'],
        'Optional evidence must be dropped lowest value first');
    assert.strictEqual(tighter.fits, true);
    assert.ok(!trimmed.droppedIds.some(id => id.startsWith('must-')),
        'Mandatory evidence must never be dropped to make room');

    // Mandatory evidence alone over budget fails closed rather than truncating: a request missing
    // the evidence it declared it needed produces a confident answer to a question it could not see.
    const impossible = planRepack(items, 100, 500);
    assert.strictEqual(impossible.fits, false,
        'When mandatory evidence alone exceeds the budget, the plan must not claim to fit');
    assert.ok(impossible.reason.includes('fails closed'));

    // Deterministic: the same overflow must always produce the same payload, or the cache miss it
    // causes would be permanent rather than one-off.
    const shuffled = [items[4], items[0], items[3], items[1], items[2]];
    assert.deepStrictEqual(planRepack(shuffled, 100, 1_300).droppedIds, trimmed.droppedIds,
        'Repacking must not depend on input order');

    // Equal-value optional items break ties by id rather than arbitrarily.
    const tied = [
        { id: 'b', tokens: 300, mandatory: false, value: 0.5 },
        { id: 'a', tokens: 300, mandatory: false, value: 0.5 }
    ];
    assert.deepStrictEqual(planRepack(tied, 0, 300).droppedIds, ['a'],
        'Ties must break deterministically by id');

    // ---------------------------------------------------------------------
    // 9. Checkpoints carry the facts that stay load-bearing after their turns are dropped.
    // ---------------------------------------------------------------------
    const droppedTurns: EpochTurn[] = [
        { content: 'We will use the canonical gateway for every send. Never bypass the protocol guard.' },
        { content: 'Please update src/engine/pipelineOrchestrator.ts and tests/agentic.test.ts.' },
        { content: "Error: Cannot find name 'resolveCeiling' in budget.ts" },
        { content: 'TODO: still need to wire the telemetry counter.' },
        { content: 'The build must not depend on network access.' }
    ];
    const checkpoint = buildConversationCheckpoint(droppedTurns, 2, 0);

    assert.ok(checkpoint.decisions.some(entry => /canonical gateway/i.test(entry)),
        'A stated decision must survive the epoch boundary');
    assert.ok(checkpoint.constraints.some(entry => /never bypass|must not depend/i.test(entry)),
        'A stated constraint must survive the epoch boundary');
    assert.ok(checkpoint.referencedFiles.some(entry => entry.includes('pipelineOrchestrator.ts')),
        'Referenced files must survive so later turns can request them by name');
    assert.ok(checkpoint.unresolvedTasks.some(entry => /telemetry counter/i.test(entry)),
        'Outstanding work must survive');
    assert.ok(checkpoint.openErrors.some(entry => /resolveCeiling/i.test(entry)),
        'An unresolved error must survive');
    assert.strictEqual(checkpoint.epoch, 2);

    // Extraction is deterministic, not generated: identical input yields an identical checkpoint,
    // which is what makes it assertable rather than merely trustworthy.
    assert.deepStrictEqual(buildConversationCheckpoint(droppedTurns, 2, 0), checkpoint,
        'Checkpoint extraction must be deterministic');

    // Every carried fact is verbatim from the source, never paraphrased.
    const sourceText = droppedTurns.map(item => item.content).join(String.fromCharCode(10));
    for (const entry of [...checkpoint.decisions, ...checkpoint.constraints,
        ...checkpoint.unresolvedTasks, ...checkpoint.openErrors]) {
        assert.ok(sourceText.includes(entry),
            `Checkpoint entry must be verbatim from the dropped turns: ${entry}`);
    }

    // An error later reported fixed is not carried forward: sending the model after a problem that
    // no longer exists is a more expensive failure than forgetting it.
    const resolvedLater = buildConversationCheckpoint([
        ...droppedTurns,
        { content: 'That is fixed now - resolveCeiling resolves correctly and the build is passing.' }
    ], 2, 0);
    assert.ok(!resolvedLater.openErrors.some(entry => /Cannot find name/i.test(entry)),
        'An error reported fixed must not be carried forward as open');

    // The resolution check needs a symbol to match on, and real diagnostics quote theirs. An error
    // that names no symbol is carried forward even if something later says "fixed": carrying a
    // resolved error wastes a few tokens, while dropping an open one hides a live problem, so the
    // conservative direction is deliberate.
    const unattributed = buildConversationCheckpoint([
        { content: 'Error: the build failed for reasons nobody wrote down.' },
        { content: 'That is fixed now.' }
    ], 2, 0);
    assert.ok(unattributed.openErrors.length > 0,
        'An error with no identifiable symbol must stay open rather than being guessed resolved');

    // Bounded: a checkpoint that grows with the conversation defeats its own purpose.
    const verbose = Array.from({ length: 200 }, (_, index) =>
        ({ content: `We will adopt approach number ${index} for the resolver stage.` }));
    const boundedCheckpoint = buildConversationCheckpoint(verbose, 3, 0);
    assert.ok(boundedCheckpoint.decisions.length <= 8,
        'Checkpoint categories must stay bounded regardless of conversation length');

    const rendered = renderCheckpoint(checkpoint);
    assert.ok(rendered.includes('conversation checkpoint'),
        'A rendered checkpoint must announce what it is');
    assert.ok(rendered.includes('pipelineOrchestrator.ts'));

    // An epoch that drops nothing produces nothing to carry.
    const emptyCheckpoint = buildConversationCheckpoint([], 1, 0);
    assert.deepStrictEqual(
        [...emptyCheckpoint.decisions, ...emptyCheckpoint.constraints, ...emptyCheckpoint.openErrors], []);

    console.log('  ✓ The rendered prefix is byte-stable within an epoch and shifts only at boundaries.');
    console.log('  ✓ A sliding window is shown to shift on every turn - the behaviour replaced.');
    console.log('  ✓ The anchor is derived from the conversation, not remembered.');
    console.log('  ✓ Recent turns are never dropped; retention stays bounded.');
    console.log('  ✓ Prefix records carry digests, never conversation text.');
    console.log('  ✓ The model\'s own tokenizer is authoritative; failure degrades, never blocks.');
    console.log('  ✓ Repacking only when an authoritative count contradicts the estimate.');
    console.log('  ✓ Repack drops optional evidence lowest-value first and fails closed on mandatory.');
    console.log('  ✓ Checkpoints carry decisions, constraints, files, tasks and open errors verbatim.');
    console.log('\n--- ALL SOTA PHASE 4 EPOCH AND BUDGET TESTS PASSED ---\n');
}
