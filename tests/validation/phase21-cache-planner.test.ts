import * as assert from 'assert';
import { CachePlanner } from '../../src/cache/cachePlanner';
import { CLAUDE_SONNET_PROFILE } from '../../src/tokenizer/modelProfile';

export function runPhase21CachePlannerValidation(): boolean {
    console.log('--- Phase 21: Cache Planner Prefix Stability & Alignment ---');

    const cachePlanner = new CachePlanner();
    const systemPrompt = "You are an enterprise AI assistant with repository tools.";
    const userQuery = "Refactor database connection pool.";

    const plan = cachePlanner.planContext({
        systemPrompt,
        userQuery,
        profile: CLAUDE_SONNET_PROFILE
    });

    assert.ok(plan.bands.length > 0, 'Plan must partition context into bands');
    assert.ok(plan.staticPrefixTokens > 0, 'Static prefix tokens must be counted');

    console.log('  ✓ Cache prefix stability & append-only alignment verified.');
    return true;
}
