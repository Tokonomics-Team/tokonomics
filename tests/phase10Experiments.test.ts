import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { AstPrunerEngine } from '../src/ast/pruner';
import { ExperimentalCandidateAdapters } from '../src/experiments/candidateAdapters';
import { ExperimentRuntime } from '../src/experiments/experimentRuntime';
import { EXPERIMENT_IDS, ExperimentOutcome } from '../src/experiments/experimentTypes';
import { ExperimentPromotionEvaluator } from '../src/experiments/promotionEvaluator';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';

export async function runPhase10ExperimentTests(): Promise<void> {
    console.log('\n--- Running Phase 10 Governed Experiment & Promotion Tests ---');
    ExperimentRuntime.reset();
    assert.ok(EXPERIMENT_IDS.every(id => !ExperimentRuntime.gate(id).enabled));
    ExperimentRuntime.configure({ consent: false, enabled: ['confidence-progressive-compilation'], disabled: [],
        trustedWorkspace: true, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.gate('confidence-progressive-compilation').reason, 'consent_required');
    ExperimentRuntime.configure({ consent: true, enabled: ['confidence-progressive-compilation'], disabled: [],
        trustedWorkspace: true, releaseEnabled: false, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.gate('confidence-progressive-compilation').reason, 'release_disabled');
    ExperimentRuntime.configure({ consent: true, enabled: ['confidence-progressive-compilation', 'unknown'], disabled: [],
        trustedWorkspace: false, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.gate('confidence-progressive-compilation').enabled, true);
    assert.strictEqual(ExperimentRuntime.gate('bounded-local-semantic-retrieval').reason, 'not_selected');

    ExperimentRuntime.configure({ consent: true, enabled: ['bounded-local-semantic-retrieval'], disabled: [],
        trustedWorkspace: false, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.gate('bounded-local-semantic-retrieval').reason, 'workspace_trust_required');
    ExperimentRuntime.configure({ consent: true, enabled: ['bounded-local-semantic-retrieval'], disabled: ['bounded-local-semantic-retrieval'],
        trustedWorkspace: true, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.gate('bounded-local-semantic-retrieval').reason, 'kill_switch');
    ExperimentRuntime.configure({ consent: true, enabled: ['bounded-local-semantic-retrieval'], disabled: [],
        trustedWorkspace: true, releaseEnabled: true, maxLatencyMs: 10, maxMemoryMB: 16 });
    assert.strictEqual(ExperimentRuntime.gate('bounded-local-semantic-retrieval').reason, 'resource_budget_exceeded');

    ExperimentRuntime.configure({ consent: true, enabled: ['confidence-progressive-compilation'], disabled: [],
        trustedWorkspace: true, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    assert.strictEqual(ExperimentRuntime.runShadow('confidence-progressive-compilation', 'private prompt', 'fallback', () => { throw new Error('candidate'); }), 'fallback');
    const diagnostic = ExperimentRuntime.diagnostics().records.at(-1)!;
    assert.strictEqual(diagnostic.reason, 'candidate_error');
    assert.doesNotMatch(JSON.stringify(diagnostic), /private prompt/);
    assert.match(diagnostic.inputHash, /^[0-9a-f]{64}$/);
    assert.strictEqual(ExperimentRuntime.runShadow('confidence-progressive-compilation', 'invalid', 'fallback', () => 'bad', value => value === 'good'), 'fallback');
    assert.strictEqual(ExperimentRuntime.diagnostics().records.at(-1)!.reason, 'invalid_output');
    assert.strictEqual(ExperimentRuntime.runShadow('confidence-progressive-compilation', 'slow', 'fallback', () => {
        const until = performance.now() + 6;
        while (performance.now() < until) { /* bounded test-only delay */ }
        return 'candidate';
    }), 'fallback');
    assert.strictEqual(ExperimentRuntime.diagnostics().records.at(-1)!.reason, 'latency_budget_exceeded');
    for (let index = 0; index < 300; index++) ExperimentRuntime.runShadow('confidence-progressive-compilation', `request-${index}`, 'ok', () => 'ok');
    assert.strictEqual(ExperimentRuntime.diagnostics().records.length, 256, 'Experiment diagnostics must remain bounded.');

    assert.deepStrictEqual(ExperimentalCandidateAdapters.rankEvidence([
        { id: 'b', lexical: 0.1, graph: 0.1, recency: 0, risk: 0 },
        { id: 'a', lexical: 1, graph: 1, recency: 1, risk: 0 }
    ]), ['a', 'b']);
    assert.deepStrictEqual(ExperimentalCandidateAdapters.rankEvidence([
        { id: 'z', lexical: 1, graph: 1, recency: 1, risk: 0 },
        { id: 'a', lexical: 1, graph: 1, recency: 1, risk: 0 }
    ]), ['a', 'z'], 'Ranking ties must be deterministic.');
    assert.deepStrictEqual(ExperimentalCandidateAdapters.snapshotDelta({ a: '1', b: '2', d: '5' }, { a: '1', b: '3', c: '4' }), ['b', 'c', 'd']);
    assert.strictEqual(ExperimentalCandidateAdapters.compilationTier(0.99, 0.5, 0), 'complete');
    assert.deepStrictEqual(ExperimentalCandidateAdapters.cosineTopK([1, 0], [{ id: 'x', vector: [0, 1] }, { id: 'y', vector: [1, 0] }]), ['y', 'x']);
    assert.deepStrictEqual(ExperimentalCandidateAdapters.cosineTopK(new Array(385).fill(1), []), []);
    assert.strictEqual(ExperimentalCandidateAdapters.visionDecision({ width: 4000, height: 2000, smallestTextPixels: 10 }), 'pass_through');
    assert.ok(ExperimentalCandidateAdapters.adaptiveBudget({ hardLimit: 1000, confidence: 0.95, risk: 0.1, expectedCostPerToken: 1 }) <= 1000);

    const syntheticDecision = ExperimentPromotionEvaluator.evaluate({
        source: 'synthetic', oracleIndependent: true, artifactBound: true, datasetFrozen: true,
        artifactSha256: 'a'.repeat(64), datasetSha256: 'b'.repeat(64), outcomes: []
    }, { productionReachable: true, fallbackVerified: true, independentlyDisableable: true, privacyConsentVerified: true, resourceBudgetVerified: true });
    assert.strictEqual(syntheticDecision.decision, 'hold');
    assert.ok(syntheticDecision.reasons.includes('independent_external_benchmark_required'));
    const incomparableCost = ExperimentPromotionEvaluator.evaluate({
        source: 'external-independent', oracleIndependent: true, artifactBound: true, datasetFrozen: true,
        artifactSha256: 'a'.repeat(64), datasetSha256: 'b'.repeat(64),
        outcomes: Array.from({ length: 30 }, (_, index) => ({ taskId: `none-${index}`, baselineSuccess: false,
            candidateSuccess: true, baselineCostUSD: 1, candidateCostUSD: 1, baselineLatencyMs: 1, candidateLatencyMs: 1 }))
    }, { productionReachable: true, fallbackVerified: true, independentlyDisableable: true, privacyConsentVerified: true, resourceBudgetVerified: true });
    assert.ok(incomparableCost.reasons.includes('cost_per_success_not_comparable'));
    const malformed = ExperimentPromotionEvaluator.evaluate({
        source: 'external-independent', oracleIndependent: true, artifactBound: true, datasetFrozen: true,
        artifactSha256: 'a'.repeat(64), datasetSha256: 'b'.repeat(64),
        outcomes: [{ taskId: 'invalid', baselineSuccess: true, candidateSuccess: true,
            baselineCostUSD: -1, candidateCostUSD: Number.NaN, baselineLatencyMs: 1, candidateLatencyMs: 1 }]
    });
    assert.strictEqual(malformed.sampleSize, 0);
    assert.ok(malformed.reasons.includes('minimum_sample_size_not_met'));

    const strongOutcomes: ExperimentOutcome[] = Array.from({ length: 100 }, (_, index) => ({
        taskId: `external-${index}`, baselineSuccess: index < 70, candidateSuccess: index < 90,
        baselineCostUSD: 1, candidateCostUSD: 0.7, baselineLatencyMs: 10, candidateLatencyMs: 10
    }));
    const promotion = ExperimentPromotionEvaluator.evaluate({
        source: 'external-independent', oracleIndependent: true, artifactBound: true, datasetFrozen: true,
        artifactSha256: 'a'.repeat(64), datasetSha256: 'b'.repeat(64), outcomes: strongOutcomes
    }, { productionReachable: true, fallbackVerified: true, independentlyDisableable: true, privacyConsentVerified: true, resourceBudgetVerified: true });
    assert.strictEqual(promotion.decision, 'promote', promotion.reasons.join(', '));
    assert.strictEqual(promotion.promotionPath, 'quality');
    const costPromotion = ExperimentPromotionEvaluator.evaluate({
        source: 'external-independent', oracleIndependent: true, artifactBound: true, datasetFrozen: true,
        artifactSha256: 'c'.repeat(64), datasetSha256: 'd'.repeat(64),
        outcomes: Array.from({ length: 100 }, (_, index) => ({ taskId: `cost-${index}`, baselineSuccess: index < 90,
            candidateSuccess: index < 90, baselineCostUSD: 1, candidateCostUSD: 0.7, baselineLatencyMs: 10, candidateLatencyMs: 10 }))
    }, { productionReachable: true, fallbackVerified: true, independentlyDisableable: true, privacyConsentVerified: true, resourceBudgetVerified: true });
    assert.strictEqual(costPromotion.decision, 'promote', costPromotion.reasons.join(', '));
    assert.strictEqual(costPromotion.promotionPath, 'cost');

    FeatureFlagRegistry.resetToDefault();
    FeatureFlagRegistry.setPipelineMode('legacy');
    const orchestrator = new PipelineOrchestrator(new AstPrunerEngine());
    const request = { messages: [{ role: 'user' as const, content: 'Explain this function without changing the protocol.' }], requestId: 'phase10-shadow' };
    ExperimentRuntime.reset();
    const baseline = await orchestrator.compileContext(request);
    assert.strictEqual(ExperimentRuntime.diagnostics().records.length, 0, 'Default-off experiments must not record prompt activity.');
    ExperimentRuntime.configure({ consent: true, enabled: ['confidence-progressive-compilation'], disabled: [],
        trustedWorkspace: true, releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32 });
    const shadow = await orchestrator.compileContext(request);
    assert.deepStrictEqual(shadow.optimizedMessages, baseline.optimizedMessages, 'Shadow experiments must not alter model-bound messages.');
    assert.ok(shadow.trace.decisions.some(item => item.itemId === 'experiment_confidence_progressive_compilation'));

    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const properties = manifest.contributes.configuration.properties;
    assert.strictEqual(properties['tokenOptimizer.experimentalConsent'].default, false);
    assert.deepStrictEqual(properties['tokenOptimizer.experimentalFeatures'].default, []);
    assert.deepStrictEqual(properties['tokenOptimizer.disabledExperiments'].items.enum, [...EXPERIMENT_IDS]);
    ExperimentRuntime.reset();
    FeatureFlagRegistry.resetToDefault();
    console.log('Phase 10 consent, trust, resource, fallback, shadow isolation, and statistical promotion contracts passed.');
}
