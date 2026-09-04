import * as assert from 'assert';
import { ResponseCache, ResponseCacheRequest, isTimeSensitiveRequest } from '../src/cache/responseCache';
import { CachePlanner } from '../src/cache/cachePlanner';
import { CostCalculator, VerifiedProviderUsage } from '../src/cost/costCalculator';
import { CostReconciliationLedger } from '../src/cost/reconciliationLedger';
import { PricingCatalog } from '../src/cost/pricingCatalog';
import { CLAUDE_SONNET_PROFILE } from '../src/tokenizer/modelProfile';

function request(overrides: Partial<ResponseCacheRequest> = {}): ResponseCacheRequest {
    const base: ResponseCacheRequest = {
        requestText: 'Explain the authentication flow',
        conversation: [{ role: 'user', text: 'Earlier question' }],
        workspace: {
            roots: ['root-a'], snapshotGeneration: 7, ignorePolicyVersion: 'ignore-v2',
            files: [{ path: 'root-a:src/auth.ts', contentHash: 'auth-v1', sourceVersion: 'disk:1' }]
        },
        evidence: [{ id: 'symbol:authenticate', contentHash: 'evidence-v1' }],
        model: { provider: 'anthropic', id: 'claude-3-7-sonnet' },
        tools: [],
        compilerConfiguration: { mode: 'compiler', compression: 0.4 },
        policies: { trusted: true, contextMode: 'automatic' },
        extensionVersion: '6.0.0',
        safety: { intent: 'question' }
    };
    return { ...base, ...overrides };
}

export async function runPhase6CacheEconomicsTests(): Promise<boolean> {
    console.log('\n--- Running Phase 6 Exact Cache & Token Economics Tests ---');

    const cache = new ResponseCache(50, 60_000, 0.75);
    const base = request();
    assert.strictEqual(cache.store(base, 'The exact answer', 'completed'), true);
    assert.strictEqual(cache.lookup(base).response, 'The exact answer');

    const variants: ResponseCacheRequest[] = [
        request({ requestText: 'Explain a different flow' }),
        request({ conversation: [{ role: 'user', text: 'Different history' }] }),
        request({ workspace: { ...base.workspace, snapshotGeneration: 8 } }),
        request({ workspace: { ...base.workspace, files: [{ ...base.workspace.files[0], contentHash: 'auth-v2' }] } }),
        request({ evidence: [{ id: 'symbol:authenticate', contentHash: 'evidence-v2' }] }),
        request({ model: { provider: 'anthropic', id: 'claude-opus-4' } }),
        request({ tools: [{ name: 'read_file', schema: { type: 'object' } }] }),
        request({ compilerConfiguration: { mode: 'compiler', compression: 0.6 } }),
        request({ policies: { trusted: true, contextMode: 'selection' } }),
        request({ extensionVersion: '6.0.1' })
    ];
    for (const variant of variants) assert.strictEqual(cache.lookup(variant).hit, false, 'Changed answer input produced a false hit');

    const unsafe = [
        request({ safety: { intent: 'edit' } }),
        request({ safety: { intent: 'question', hasToolCalls: true } }),
        request({ safety: { intent: 'question', partialStream: true } }),
        request({ safety: { intent: 'question', cancelled: true } }),
        request({ safety: { intent: 'question', failed: true } }),
        request({ safety: { intent: 'question', unresolvedWorkspace: true } }),
        request({ safety: { intent: 'question', timeSensitive: true } })
    ];
    unsafe.forEach(item => {
        assert.strictEqual(cache.store(item, 'unsafe', 'completed'), false);
        assert.strictEqual(cache.lookup(item).hit, false);
    });
    assert.strictEqual(cache.store(base, 'partial', 'partial'), false);
    assert.strictEqual(cache.store(base, 'cancelled', 'cancelled'), false);
    assert.strictEqual(cache.store(base, 'failed', 'failed'), false);
    assert.strictEqual(isTimeSensitiveRequest('What is the latest model price today?'), true);

    const rephrased = request({ requestText: 'Please explain the authentication flow' });
    assert.strictEqual(cache.lookup(rephrased).hit, false, 'Approximate answer replay must remain disabled');
    const hints = cache.findHints(rephrased);
    assert.ok(hints.length > 0);
    assert.strictEqual('response' in hints[0], false);
    assert.strictEqual(cache.invalidateForFile('root-a:src/auth.ts'), 1);
    assert.strictEqual(cache.lookup(base).hit, false);

    const planner = new CachePlanner().planContext({
        systemPrompt: 'Stable system instructions. '.repeat(300), userQuery: 'Explain auth.', profile: CLAUDE_SONNET_PROFILE
    });
    assert.strictEqual(planner.isCacheEligible, true);
    assert.strictEqual(planner.effectiveCostUSD, planner.unoptimizedCostUSD, 'Eligibility must not be booked as a cache read');
    assert.strictEqual(planner.effectiveCostSavingsUSD, 0);
    assert.ok((planner.cacheReadScenarioSavingsUSD || 0) > 0);

    const catalog = new PricingCatalog();
    const bundled = catalog.resolve('claude-3-7-sonnet', 'anthropic');
    assert.ok(bundled.catalogVersion && bundled.effectiveFrom && bundled.sourceUrl && bundled.currency === 'USD');
    catalog.registerEnterpriseOverride({
        provider: 'anthropic', modelId: 'enterprise-claude', currency: 'EUR', effectiveFrom: '2026-01-01',
        source: 'contract:finance-42',
        rates: { inputCostPer1M: 1, cachedInputCostPer1M: 0.1, cacheWriteCostPer1M: 1.2, outputCostPer1M: 4 }
    });
    assert.strictEqual(catalog.resolve('enterprise-claude', 'anthropic').currency, 'EUR');

    const projected = CostCalculator.calculateProjectedCost(20_000, 10_000, 8_000, 'claude-3-7-sonnet');
    assert.strictEqual(projected.cacheReadAssumed, false);
    assert.strictEqual(projected.optimizedCostUSD, 0.03);
    assert.ok(projected.pricingCatalogVersion && projected.pricingSource);
    assert.strictEqual(CostCalculator.calculateProjectedCost(10, 5, 0, 'unknown-model').pricingAvailable, false);
    assert.strictEqual(CostCalculator.statusWhenProviderUsageUnavailable({
        costStatus: 'projected', projectedRawCostUSD: 0.01,
        projectedOptimizedCostUSD: 0.004, projectedSavingsUSD: 0.006
    }), 'projected', 'A valid estimate must remain projected when provider usage is unavailable');
    assert.strictEqual(CostCalculator.statusWhenProviderUsageUnavailable({
        costStatus: 'unavailable', projectedRawCostUSD: 0,
        projectedOptimizedCostUSD: 0, projectedSavingsUSD: 0
    }), 'unavailable', 'Missing model pricing must remain unavailable');

    const usage: VerifiedProviderUsage = {
        requestId: 'req-6', provider: 'anthropic', model: 'claude-3-7-sonnet',
        inputTokens: 10_000, outputTokens: 2_000, cacheReadInputTokens: 1_000, cacheWriteInputTokens: 1_000,
        source: 'provider-reported'
    };
    const ledger = new CostReconciliationLedger();
    ledger.begin({ requestId: 'req-6', provider: 'anthropic', model: 'claude-3-7-sonnet', unoptimizedInputTokens: 20_000 });
    const reconciled = ledger.reconcile('req-6', usage);
    assert.strictEqual(reconciled.requestId, 'req-6');
    assert.strictEqual(reconciled.usageSource, 'provider-reported');
    assert.strictEqual(reconciled.actualOptimizedCostUSD, 0.05805);
    assert.strictEqual(reconciled.actualRawCostUSD, 0.09);
    assert.strictEqual(reconciled.actualSavingsUSD, 0.03195);
    assert.throws(() => ledger.reconcile('req-6', usage), /No originating request|already reconciled/);

    const mismatchLedger = new CostReconciliationLedger();
    mismatchLedger.begin({ requestId: 'req-x', provider: 'openai', model: 'gpt-4o', unoptimizedInputTokens: 100 });
    assert.throws(() => mismatchLedger.reconcile('req-x', { ...usage, requestId: 'req-x' }), /Provider usage does not match/);
    assert.strictEqual(CostCalculator.parseVerifiedProviderUsage({ inputTokens: 10 }, 'x', 'openai', 'gpt-4o'), undefined);
    assert.ok(CostCalculator.parseVerifiedProviderUsage({ input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 3 }, 'x', 'openai', 'gpt-4o'));
    assert.throws(() => CostCalculator.calculateVerifiedReconciledCost({ ...usage, model: 'unknown-model' }, 20_000), /No versioned pricing entry/);

    const loss = CostCalculator.calculateVerifiedReconciledCost({
        ...usage, requestId: 'loss', inputTokens: 20_000, cacheReadInputTokens: 0, cacheWriteInputTokens: 0,
        additionalModelCostUSD: 0.25
    }, 20_000);
    assert.ok(loss.actualSavingsUSD < 0, 'Net economic loss must not be clamped into a false saving');

    console.log('Phase 6 exact-cache adversarial matrix and request-bound economics passed.');
    return true;
}
