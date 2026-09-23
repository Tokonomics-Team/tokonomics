import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { sanitizeModelHistoryText, boundedHistory } from '../src/history/modelHistory';
import { CanonicalPayloadTokenEstimator } from '../src/tokenizer/canonicalPayload';
import { GlobalTokenBudgeter, TokenBudgetExceededError } from '../src/solver/globalBudget';
import { ModelProfileRegistry } from '../src/tokenizer/modelProfile';
import { candidateUtility } from '../src/solver/candidateUtility';
import { OPTIMIZATION_PROFILES } from '../src/config/userPreferences';

export function runV7Phase9UtilityBudgetTests(): boolean {
    console.log('\n--- Running v7.0.1 Phase 9 utility/budget tests ---');
    const history = `> ⚡ **Tokonomics:** 100 → 40 tokens\n\nThe actual model answer stays.\n\n> 💡 This task could use Flash tier — save ~90% cost`;
    const sanitized = sanitizeModelHistoryText(history);
    assert.strictEqual(sanitized, 'The actual model answer stays.');
    assert.deepStrictEqual(boundedHistory([1, 2, 3, 4, 5, 6], 2), [3, 4, 5, 6]);

    const cyclic: any = { tools: [{ name: 'readFile', schema: { path: 'string', required: true } }], max_tokens: 500 };
    cyclic.self = cyclic;
    const optionsTokens = CanonicalPayloadTokenEstimator.countRequestOptions(cyclic);
    assert.ok(optionsTokens > 10 && Number.isFinite(optionsTokens), 'Tools/options and cycles must have a conservative bounded cost');

    const budgeter = new GlobalTokenBudgeter();
    const profile = ModelProfileRegistry.getProfile('gpt-4o');
    for (let budget = 128; budget <= 4096; budget += 137) {
        try {
            const base = budgeter.planBase({ messages: [{ role: 'user', content: 'implement bounded queue' }], profile,
                requestedTotalTokens: budget, requestedOutputTokens: Math.floor(budget / 4), fixedProtocolTokens: optionsTokens });
            const final = budgeter.finalize(base, [{ role: 'user', content: 'implement bounded queue' }]);
            assert.ok(final.projectedTotalTokens <= final.totalTokenLimit);
            assert.strictEqual(final.measurementType, 'heuristic_estimate');
        } catch (error) {
            assert.ok(error instanceof TokenBudgetExceededError, 'Budget failures must be typed and fail closed');
        }
    }

    const common = { relevance: 0.8, freshness: 1, uniqueness: 1, dependencyClosure: 1,
        confidence: 0.9, sensitivityRisk: 0, tokenCost: 100 };
    assert.ok(candidateUtility({ ...common, mandatory: true }) > candidateUtility({ ...common, mandatory: false }));
    assert.ok(candidateUtility({ ...common, mandatory: false, sensitivityRisk: 1 }) < candidateUtility({ ...common, mandatory: false }));
    assert.strictEqual(OPTIMIZATION_PROFILES.balanced.featureFlags.enableCachePlanner, false,
        'Cache planner claim must stay off until canonical/provider cache controls are preserved');
    assert.strictEqual(OPTIMIZATION_PROFILES.maximum.tokenOptimization.enableCacheAlignment, false);

    const participantSource = fs.readFileSync(path.join(process.cwd(), 'src', 'proxy', 'chatParticipant.ts'), 'utf8');
    // History must be bounded before it becomes model input. The mechanism changed from a sliding
    // window to a quantised epoch anchor - a window shifted the rendered prefix on every turn and so
    // could never reuse a provider prefix cache - but the bound itself is still required.
    assert.match(participantSource, /resolveContextEpoch\(epochHistory/);
    assert.match(participantSource, /applyContextEpoch\(chatContext\.history/);
    assert.match(participantSource, /maxRetainedTurns:/);
    assert.match(participantSource, /sanitizeModelHistoryText\(/);
    const providerSource = fs.readFileSync(path.join(process.cwd(), 'src', 'proxy', 'modelProvider.ts'), 'utf8');
    assert.match(providerSource, /requestOptions:/, 'Provider options must enter whole-request token budgeting');

    console.log('History filtering, full payload accounting, typed budget failures, utility monotonicity, and cache truth passed.');
    return true;
}
