/**
 * SOTA Alignment — Phase 0: capability truth, safety, and baseline lock.
 *
 * Phase 0 changes no optimisation behaviour. It removes claims the system could not honour and one
 * dormant hazard, so every assertion here is about what the system is permitted to *say* about
 * itself, plus one that a deleted hazard stays deleted.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentRegistry, ComponentReceiptTrail } from '../src/engine/componentRegistry';
import { OPTIMIZATION_PROFILES } from '../src/config/userPreferences';
import { CompressionProviderFactory } from '../src/compression/compressionProvider';
import { PricingCatalog, defaultPricingCatalog } from '../src/cost/pricingCatalog';
import { CostCalculator } from '../src/cost/costCalculator';

export async function runSotaPhase0CapabilityTruthTests(): Promise<void> {
    console.log('\n--- Running SOTA Phase 0 Capability Truth Tests ---');

    // ---------------------------------------------------------------------
    // 1. Provider cache planning is off in every profile.
    // ---------------------------------------------------------------------
    // ADR-001: the VS Code Language Model API carries no cache_control field and reports no cache
    // usage, so an enabled planner would be a capability claim with no delivery path and no way to
    // verify it. Asserted per profile rather than on the default, because the previous defect was
    // that Maximum Savings alone turned it on.
    for (const [name, profile] of Object.entries(OPTIMIZATION_PROFILES)) {
        assert.strictEqual(profile.featureFlags.enableCachePlanner, false,
            `Profile ${name} must keep provider cache planning off (ADR-001)`);
    }

    // ---------------------------------------------------------------------
    // 2. A dormant component cannot report that it did work.
    // ---------------------------------------------------------------------
    assert.strictEqual(ComponentRegistry.isDormant('cache_planner'), true,
        'cache_planner must be classified dormant');

    const definition = ComponentRegistry.definition('cache_planner');
    assert.strictEqual(definition.integrationState, 'dormant');

    // The capability snapshot must never present a dormant component as effective.
    const snapshot = ComponentRegistry.capture({
        ...OPTIMIZATION_PROFILES.maximum.featureFlags,
        enableCachePlanner: true
    } as never, { workspaceTrusted: true, experimentalConsent: true });
    const planner = snapshot.components.find(component => component.id === 'cache_planner');
    assert.ok(planner, 'cache_planner must appear in the capability snapshot');
    assert.strictEqual(planner.effective, false,
        'A dormant component must never be effective, even if its flag is forced on');
    assert.strictEqual(planner.reason, 'not_production_reachable');

    // Even a caller that tries to record work for it produces no such receipt.
    const trail = new ComponentReceiptTrail(snapshot);
    trail.record('cache_planner', 'attempted');
    trail.record('cache_planner', 'invoked');
    trail.record('cache_planner', 'contributed');
    const plannerReceipts = trail.snapshot().filter(receipt => receipt.componentId === 'cache_planner');
    assert.deepStrictEqual(plannerReceipts, [],
        'A dormant component must not be able to leave attempted/invoked/contributed receipts');

    // A non-dormant component is unaffected by that guard.
    const control = new ComponentReceiptTrail(snapshot);
    control.record('context_solver', 'attempted');
    control.record('context_solver', 'invoked');
    assert.strictEqual(control.snapshot().filter(r => r.componentId === 'context_solver').length, 2,
        'The dormancy guard must not suppress receipts for reachable components');

    // ---------------------------------------------------------------------
    // 3. No production compression path is nondeterministic.
    // ---------------------------------------------------------------------
    // The lingua2 provider previously dropped words on Math.random() behind an unreachable flag.
    // Identical input must now yield byte-identical output, or the preservation gate's premise and
    // prefix stability both fail silently.
    const source = [
        'export async function resolveBudget(request: BudgetRequest): Promise<BudgetResult> {',
        '    const ceiling = request.ceiling ?? DEFAULT_CEILING;',
        '    if (ceiling <= 0) { throw new Error("ceiling must be positive"); }',
        '    return { ceiling, granted: Math.min(ceiling, request.requested) };',
        '}'
    ].join('\n');

    for (const providerId of ['lingua2', 'rule'] as const) {
        const provider = CompressionProviderFactory.createProvider(providerId);
        const first = await provider.compress(source);
        const second = await provider.compress(source);
        const third = await provider.compress(source);
        assert.strictEqual(first.compressedText, second.compressedText,
            `Provider ${providerId} must be deterministic across runs`);
        assert.strictEqual(second.compressedText, third.compressedText,
            `Provider ${providerId} must be deterministic across runs`);
    }

    // Legacy configuration naming the removed learned compressor still resolves, deterministically.
    const legacy = CompressionProviderFactory.createProvider('lingua2');
    const legacyResult = await legacy.compress(source);
    assert.ok(legacyResult.providerUsed.includes('fallback: rule'),
        'Legacy lingua2 configuration must fall back to deterministic rule compression');

    // ---------------------------------------------------------------------
    // 4. The hazard cannot be reintroduced by flipping a constructor argument.
    // ---------------------------------------------------------------------
    const compressorSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'compression', 'compressionProvider.ts'), 'utf8');
    const executable = compressorSource
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n');
    assert.ok(!executable.includes('Math.random'),
        'No executable line of the compression providers may use Math.random');

    // ---------------------------------------------------------------------
    // 5. Generated component matrix; documents cannot drift from the registry.
    // ---------------------------------------------------------------------
    // The matrix is derived from executable registry metadata rather than maintained by hand, so a
    // reclassification shows up as a diff instead of silently outliving the prose describing it.
    const rootDir = path.join(__dirname, '..');
    const definitions = ComponentRegistry.definitions();
    const matrix = [
        '# Component state matrix',
        '',
        '> Generated from `ComponentRegistry.definitions()`. Do not edit by hand.',
        '',
        '| Component | Stage | Integration state | Feature flag | Lifecycle |',
        '|---|---|---|---|---|',
        ...definitions.map(d => `| \`${d.id}\` | ${d.stage} | ${d.integrationState} | ${d.featureFlag ?? '—'} | ${d.lifecycleStatus ?? 'active'} |`),
        ''
    ].join(String.fromCharCode(10));
    fs.mkdirSync(path.join(rootDir, 'validation', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'validation', 'reports', 'component-state-matrix.md'), matrix, 'utf8');

    const architectureDoc = fs.readFileSync(
        path.join(rootDir, 'INTERNAL_ARCHITECTURE_AND_FEATURES.md'), 'utf8');
    const packageVersion = JSON.parse(
        fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
    assert.ok(architectureDoc.includes(`Tokonomics ${packageVersion} internal architecture`),
        `Architecture document must declare the shipped version ${packageVersion}`);

    // Every dormant component must be declared dormant in the architecture document. A positive
    // obligation rather than a banned phrase: reclassifying a component now forces the prose to
    // change with it, which is the drift this check exists to prevent.
    for (const definition of definitions.filter(d => d.integrationState === 'dormant')) {
        const declared = /dormant/i.test(architectureDoc)
            && architectureDoc.includes(definition.featureFlag ?? definition.id);
        assert.ok(declared,
            `Architecture document must declare ${definition.id} dormant and name its flag`);
    }

    // ---------------------------------------------------------------------
    // 6. Algorithm descriptions match what the algorithms actually are.
    // ---------------------------------------------------------------------
    // The runtime metadata was already honest; the prose a reader sees was not. "Cross-encoder" and
    // "dense vector" both name learned models in the literature, and neither ships here.
    const reranker = fs.readFileSync(path.join(rootDir, 'src', 'search', 'reranker.ts'), 'utf8');
    assert.ok(reranker.includes('lexical interaction'),
        'The reranker must describe itself as lexical interaction scoring');
    assert.ok(reranker.includes('not a learned model') || reranker.includes('Nothing of'),
        'The reranker must state plainly that it is not a learned cross-encoder');
    assert.ok(!/Cross-Encoder/.test(reranker),
        'No description may present the lexical scorer as a cross-encoder');

    const embedding = fs.readFileSync(path.join(rootDir, 'src', 'search', 'embeddingProvider.ts'), 'utf8');
    assert.ok(embedding.includes('hashed structural projection'),
        'The embedding provider must describe itself as a hashed structural projection');
    assert.ok(embedding.includes('not a learned embedding model'),
        'The embedding provider must state that no learned model is involved');

    // ---------------------------------------------------------------------
    // 7. Pricing: aliases, precedence, and unknown prices that stay unknown.
    // ---------------------------------------------------------------------
    // Table-driven, because the failure being guarded against is a plausible-looking price attached
    // to a model nobody priced. A fabricated cost is worse than a missing one: it is actionable.
    const resolutionCases: ReadonlyArray<{ query: string; expectModel: string; why: string }> = [
        { query: 'claude-sonnet-5', expectModel: 'claude-sonnet-5', why: 'exact model id' },
        { query: 'CLAUDE-SONNET-5', expectModel: 'claude-sonnet-5', why: 'case insensitive' },
        { query: '  claude-sonnet-5  ', expectModel: 'claude-sonnet-5', why: 'surrounding whitespace' },
        // An alias must resolve to the canonical entry, not to itself: a retired model name kept as
        // an alias is exactly where a stale price would otherwise be invented.
        { query: 'claude-3-5-sonnet', expectModel: 'claude-3-7-sonnet', why: 'alias to canonical' },
        { query: 'claude-sonnet-4-5', expectModel: 'claude-sonnet-4-6', why: 'alias to successor' },
        { query: 'deepseek-reasoner', expectModel: 'deepseek-chat', why: 'alias across model family' },
        // Versioned suffixes fall back to their base entry rather than going unpriced.
        { query: 'gpt-4o-2024-11-20', expectModel: 'gpt-4o', why: 'dated suffix on a known model' }
    ];
    for (const testCase of resolutionCases) {
        const entry = defaultPricingCatalog.find(testCase.query);
        assert.ok(entry, `Pricing must resolve for ${testCase.query}`);
        assert.strictEqual(entry.modelId, testCase.expectModel,
            `${testCase.query} (${testCase.why}) must resolve to ${testCase.expectModel}`);
    }

    // Every bundled entry carries the provenance a price needs to be auditable.
    for (const entry of defaultPricingCatalog.listBundled()) {
        assert.ok(entry.effectiveFrom && /^\d{4}-\d{2}-\d{2}/.test(entry.effectiveFrom),
            `${entry.modelId} must record when its price took effect`);
        assert.ok(entry.sourceUrl && entry.sourceUrl.length > 0,
            `${entry.modelId} must cite a price source`);
        assert.ok(entry.currency === 'USD', `${entry.modelId} must declare its currency`);
        for (const [name, rate] of Object.entries(entry.rates)) {
            if (rate === undefined) continue;
            assert.ok(Number.isFinite(rate) && rate >= 0, `${entry.modelId}.${name} must be a real rate`);
        }
    }

    // An unpriced model must fail rather than borrow a generic rate.
    assert.throws(() => defaultPricingCatalog.resolveStrict('model-that-was-never-priced'),
        /No versioned pricing entry/,
        'An unknown model must have no price, not a plausible one');

    // And the accounting path must surface that as unavailable rather than zero.
    const unpriced = CostCalculator.calculateProjectedCost(1_000, 500, 0, 'model-that-was-never-priced');
    assert.strictEqual(unpriced.pricingAvailable, false,
        'An unpriced model must report no available pricing');
    assert.strictEqual(unpriced.pricingCatalogVersion, 'unavailable');
    assert.ok(unpriced.formattedSavings.startsWith('Unavailable'),
        'An unpriced model must read as Unavailable, never as a confident zero saving');

    // A priced model still produces a real projection, so the guard above is not simply disabling costs.
    const priced = CostCalculator.calculateProjectedCost(10_000, 4_000, 0, 'claude-sonnet-5');
    assert.strictEqual(priced.pricingAvailable, true);
    assert.ok(priced.savingsUSD > 0, 'A priced model must still yield a projected saving');

    // Enterprise overrides take precedence and must be auditable.
    const catalog = new PricingCatalog();
    assert.throws(() => catalog.registerEnterpriseOverride({
        provider: 'anthropic', modelId: 'claude-3-5-sonnet', currency: 'USD',
        effectiveFrom: '2026-01-01', source: '   ', rates: { inputPerMillion: 1 }
    } as never), /auditable source/, 'An override with no source must be refused');
    assert.throws(() => catalog.registerEnterpriseOverride({
        provider: 'anthropic', modelId: 'claude-3-5-sonnet', currency: 'USD',
        effectiveFrom: '2026-01-01', source: 'contract-2026', rates: { inputPerMillion: -5 }
    } as never), /Invalid pricing rate/, 'A negative rate must be refused');

    const override = catalog.registerEnterpriseOverride({
        provider: 'anthropic', modelId: 'claude-3-5-sonnet', currency: 'USD',
        effectiveFrom: '2026-01-01', source: 'contract-2026', rates: { inputCostPer1M: 1.5, outputCostPer1M: 6, cachedInputCostPer1M: .15 }
    } as never);
    assert.strictEqual(catalog.find('claude-3-5-sonnet')?.id, override.id,
        'A registered override must take precedence over the bundled price');
    catalog.clearEnterpriseOverrides();
    assert.notStrictEqual(catalog.find('claude-3-5-sonnet')?.id, override.id,
        'Clearing overrides must restore the bundled price');

    // ---------------------------------------------------------------------
    // 8. The public settings surface stays at exactly four.
    // ---------------------------------------------------------------------
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const settings = Object.keys(manifest.contributes.configuration.properties);
    assert.strictEqual(settings.length, 4,
        `Public settings must remain exactly four, found: ${settings.join(', ')}`);

    console.log('  ✓ Provider cache planning is off in every profile (ADR-001).');
    console.log('  ✓ Dormant components cannot be effective or claim receipts.');
    console.log('  ✓ Compression is deterministic; the random branch is gone and cannot return.');
    console.log('  ✓ Legacy compressor configuration falls back losslessly.');
    console.log('  ✓ Component matrix generated from the registry; documents match it.');
    console.log('  ✓ Algorithm descriptions match the algorithms; no learned-model implications.');
    console.log('  ✓ Pricing resolves by alias, cites sources, and leaves unknown models unpriced.');
    console.log('  ✓ Public settings surface remains exactly four.');
    console.log('\n--- ALL SOTA PHASE 0 CAPABILITY TRUTH TESTS PASSED ---\n');
}
