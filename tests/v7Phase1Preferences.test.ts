import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { AstPrunerEngine } from '../src/ast/pruner';
import {
    ConfigurationLike,
    migrateLegacyPreferences,
    LEGACY_SETTING_KEYS,
    PUBLIC_SETTING_KEYS,
    resolveRuntimeConfiguration,
    UserPreferenceRegistry
} from '../src/config/userPreferences';
import { ComponentReceiptTrail, ComponentRegistry } from '../src/engine/componentRegistry';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { TokenOptimizerLanguageModelProvider } from '../src/proxy/modelProvider';

class InspectableConfiguration implements ConfigurationLike {
    public readonly updates: Array<{ key: string; value: unknown; target: unknown }> = [];

    constructor(
        private readonly explicit: Record<string, unknown> = {},
        private readonly defaults: Record<string, unknown> = {}
    ) {}

    public get<T>(key: string, fallback: T): T {
        return (key in this.explicit ? this.explicit[key] : key in this.defaults ? this.defaults[key] : fallback) as T;
    }

    public inspect<T>(key: string) {
        return {
            defaultValue: this.defaults[key] as T | undefined,
            globalValue: this.explicit[key] as T | undefined
        };
    }

    public async update(key: string, value: unknown, target?: unknown): Promise<void> {
        this.updates.push({ key, value, target });
        this.explicit[key] = value;
    }
}

export async function runV7Phase1PreferencesTests(): Promise<void> {
    console.log('\n--- Running v7.0.1 Phase 1 Settings & Capability Truth Tests ---');

    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const properties = manifest.contributes.configuration.properties;
    assert.deepStrictEqual(Object.keys(properties).sort(), PUBLIC_SETTING_KEYS.map(key => `tokenOptimizer.${key}`).sort(),
        'The public settings surface must contain exactly the four approved controls.');
    assert.deepStrictEqual(properties['tokenOptimizer.optimizationMode'].enum, ['off', 'balanced', 'maximum']);
    assert.strictEqual(properties['tokenOptimizer.optimizationMode'].default, 'balanced');
    assert.deepStrictEqual(properties['tokenOptimizer.workspaceContext'].enum, ['none', 'selection', 'automatic']);
    assert.strictEqual(properties['tokenOptimizer.workspaceContext'].default, 'selection');
    assert.strictEqual(properties['tokenOptimizer.includeUnsavedChanges'].default, false);
    assert.strictEqual(properties['tokenOptimizer.responseReuse'].default, true);

    const defaults = resolveRuntimeConfiguration();
    assert.deepStrictEqual(defaults.preferences, {
        optimizationMode: 'balanced', workspaceContext: 'selection', includeUnsavedChanges: false, responseReuse: true
    });
    assert.strictEqual(defaults.migration.source, 'defaults');
    assert.strictEqual(defaults.featureFlags.pipelineMode, 'compiler');
    assert.strictEqual(defaults.featureFlags.enableContextSolver, true);
    assert.strictEqual(defaults.featureFlags.enableSdgSlicing, true);
    for (const preview of [
        'enableLspIntelligence', 'enableDeltaContext', 'enableErrorIntelligence', 'enableTestGraph',
        'enableGitGraph', 'enableTerminalOptimizer', 'enableProvenance', 'enableDenseEmbeddings',
        'enableCrossEncoder', 'enableMmrDiversity', 'enableSemanticDedup', 'enableProjectMemory', 'enableLocalSlm'
    ] as const) assert.strictEqual(defaults.featureFlags[preview], false, `${preview} must remain default-off.`);
    assert.strictEqual(defaults.experiments.consent, false);
    assert.deepStrictEqual(defaults.experiments.enabled, []);

    const maximum = resolveRuntimeConfiguration(new InspectableConfiguration({
        optimizationMode: 'maximum', workspaceContext: 'automatic', includeUnsavedChanges: true, responseReuse: false
    }));
    assert.deepStrictEqual(maximum.preferences, {
        optimizationMode: 'maximum', workspaceContext: 'automatic', includeUnsavedChanges: true, responseReuse: false
    });
    assert.strictEqual(maximum.migration.source, 'v7-public');
    assert.strictEqual(maximum.featureFlags.enableSdgSlicing, true);
    assert.strictEqual(maximum.featureFlags.enableResponseCache, false);
    assert.strictEqual(maximum.featureFlags.enableCachePlanner, false);
    assert.strictEqual(maximum.workspace.backgroundWarming, true);

    const malformed = resolveRuntimeConfiguration(new InspectableConfiguration({
        optimizationMode: 'turbo', workspaceContext: 'everything', includeUnsavedChanges: 'yes', responseReuse: 1
    }));
    assert.deepStrictEqual(malformed.preferences, {
        optimizationMode: 'balanced', workspaceContext: 'selection', includeUnsavedChanges: false, responseReuse: true
    });
    assert.deepStrictEqual([...malformed.migration.malformedKeys].sort(),
        ['includeUnsavedChanges', 'optimizationMode', 'responseReuse', 'workspaceContext']);

    const legacyConfiguration = new InspectableConfiguration({
        governorAggressiveness: 'aggressive', workspaceContextMode: 'automatic', includeUnsavedBuffers: true,
        enableResponseCache: false, modelAllowList: ['claude'], disabledCapabilities: ['workspaceIndex', 'unknown']
    });
    const stateValues = new Map<string, unknown>();
    const state = {
        get: <T>(key: string, fallback?: T) => (stateValues.has(key) ? stateValues.get(key) : fallback) as T,
        update: async (key: string, value: unknown) => { stateValues.set(key, value); }
    };
    const migrated = await migrateLegacyPreferences(legacyConfiguration, state);
    assert.strictEqual(migrated.migration.source, 'v6-legacy');
    assert.deepStrictEqual(migrated.preferences, {
        optimizationMode: 'maximum', workspaceContext: 'automatic', includeUnsavedChanges: true, responseReuse: false
    });
    assert.deepStrictEqual(legacyConfiguration.updates.map(update => update.key).sort(), [...PUBLIC_SETTING_KEYS].sort());
    assert.ok(legacyConfiguration.updates.every(update => update.target === true), 'Migration must use the global target.');
    await migrateLegacyPreferences(legacyConfiguration, state);
    assert.strictEqual(legacyConfiguration.updates.length, 4, 'The versioned migration must run only once.');

    const retiredOnly = resolveRuntimeConfiguration(new InspectableConfiguration({
        experimentalConsent: true, experimentalFeatures: ['bounded-local-semantic-retrieval'],
        pipelineMode: 'legacy', enableProjectMemory: true, enableLocalSlm: true
    }));
    assert.strictEqual(retiredOnly.migration.source, 'v6-legacy');
    assert.ok(['experimentalConsent', 'experimentalFeatures', 'pipelineMode'].every(key =>
        retiredOnly.migration.migratedLegacyKeys.includes(key)));
    assert.deepStrictEqual(retiredOnly.preferences, defaults.preferences,
        'Legacy advanced controls without a public equivalent must fall back to the safe profile.');
    assert.strictEqual(retiredOnly.experiments.consent, false);
    assert.strictEqual(retiredOnly.featureFlags.enableProjectMemory, false);
    assert.strictEqual(retiredOnly.featureFlags.enableLocalSlm, false);

    const everyLegacyKey = resolveRuntimeConfiguration(new InspectableConfiguration(
        Object.fromEntries(LEGACY_SETTING_KEYS.map(key => [key, true]))
    ));
    assert.deepStrictEqual([...everyLegacyKey.migration.migratedLegacyKeys].sort(), [...LEGACY_SETTING_KEYS].sort(),
        'Every v6 key must be recognized and deterministically migrated or safely ignored.');
    assert.strictEqual(everyLegacyKey.featureFlags.forcePassThrough, true,
        'Unsafe or contradictory legacy controls must resolve conservatively.');

    const legacyReferenced = resolveRuntimeConfiguration(new InspectableConfiguration({ workspaceContextMode: 'referenced' }));
    assert.strictEqual(legacyReferenced.preferences.workspaceContext, 'selection',
        'Migration must not widen referenced-file access to automatic workspace discovery.');

    const workspaceOverride = resolveRuntimeConfiguration({
        get: <T>(_key: string, fallback: T) => fallback,
        inspect: <T>(key: string) => key === 'optimizationMode'
            ? { globalValue: 'balanced' as T, workspaceValue: 'maximum' as T, workspaceFolderValue: 'off' as T }
            : undefined
    });
    assert.strictEqual(workspaceOverride.preferences.optimizationMode, 'off',
        'The narrowest workspace-folder override must take precedence.');

    const publicWins = resolveRuntimeConfiguration(new InspectableConfiguration({
        optimizationMode: 'off', workspaceContext: 'none', includeUnsavedChanges: false, responseReuse: true,
        governorAggressiveness: 'aggressive', workspaceContextMode: 'automatic', includeUnsavedBuffers: true,
        enableResponseCache: false
    }));
    assert.deepStrictEqual(publicWins.preferences, {
        optimizationMode: 'off', workspaceContext: 'none', includeUnsavedChanges: false, responseReuse: true
    });
    assert.strictEqual(publicWins.featureFlags.forcePassThrough, true);
    assert.strictEqual(publicWins.featureFlags.enableWorkspaceIndex, false);

    FeatureFlagRegistry.applyRuntimeConfiguration(defaults);
    FeatureFlagRegistry.setCapabilityContext({ workspaceTrusted: false, experimentalConsent: false, disabledCapabilities: [] });
    const restricted = FeatureFlagRegistry.captureRequestCapabilities();
    const workspaceStatus = restricted.components.find(component => component.id === 'workspace_snapshot');
    assert.strictEqual(workspaceStatus?.effective, false);
    assert.strictEqual(workspaceStatus?.reason, 'workspace_untrusted');
    const initiallyObserved = ComponentRegistry.runtimeStatuses(restricted);
    assert.strictEqual(initiallyObserved.find(component => component.id === 'context_solver')?.outcome, 'eligible_not_observed');
    const trail = new ComponentReceiptTrail(restricted);
    trail.record('context_solver', 'attempted');
    trail.record('context_solver', 'invoked');
    trail.record('context_solver', 'fallback', 'no_output_effect');
    const observed = ComponentRegistry.runtimeStatuses(restricted, trail.snapshot());
    assert.strictEqual(observed.find(component => component.id === 'context_solver')?.outcome, 'fallback');
    assert.strictEqual(observed.find(component => component.id === 'context_solver')?.contributed, false);

    const off = resolveRuntimeConfiguration(new InspectableConfiguration({ optimizationMode: 'off' }));
    FeatureFlagRegistry.applyRuntimeConfiguration(off);
    const orchestrator: any = new PipelineOrchestrator(new AstPrunerEngine());
    const calls: Record<string, number> = { sdg: 0, solver: 0, sufficiency: 0, compression: 0, cache: 0, signals: 0, dense: 0 };
    orchestrator.sdgSlicer.computeIntentAwareSlice = () => { calls.sdg++; throw new Error('unexpected'); };
    orchestrator.knapsackSolver.solveAsync = async () => { calls.solver++; throw new Error('unexpected'); };
    orchestrator.knapsackSolver.solve = () => { calls.solver++; throw new Error('unexpected'); };
    orchestrator.sufficiencyEngine.buildTaskProfile = () => { calls.sufficiency++; throw new Error('unexpected'); };
    orchestrator.compressor.compress = async () => { calls.compression++; throw new Error('unexpected'); };
    orchestrator.cachePlanner.planContext = () => { calls.cache++; throw new Error('unexpected'); };
    orchestrator.signalCoordinator.coordinateSignals = () => { calls.signals++; throw new Error('unexpected'); };
    orchestrator.persistentHybrid.retrieve = () => { calls.dense++; throw new Error('unexpected'); };
    const input = [
        { role: 'system' as const, content: '  Preserve this system instruction exactly.  ' },
        { role: 'user' as const, content: `Review this code:\n\`\`\`ts\n${'const exampleValue = 1;\n'.repeat(50)}\`\`\`` }
    ];
    const offResult = await orchestrator.compileContext({
        messages: input,
        allowWorkspaceRetrieval: true,
        workspaceSnapshot: { generation: 1, files: new Map(), symbols: [], roots: [] } as any,
        requestId: 'v7-phase1-off'
    });
    assert.deepStrictEqual(offResult.optimizedMessages, input, 'Off mode must preserve the canonical messages.');
    assert.deepStrictEqual(calls, { sdg: 0, solver: 0, sufficiency: 0, compression: 0, cache: 0, signals: 0, dense: 0 },
        'Disabled stages must execute zero component calls.');

    UserPreferenceRegistry.apply(maximum);
    const provider = new TokenOptimizerLanguageModelProvider(new CanonicalRequestCompiler(new PipelineOrchestrator()), () => undefined);
    const providerConfig = (provider as any).getOptimizationConfig();
    assert.strictEqual(providerConfig.compressionRatio, maximum.tokenOptimization.compressionRatio);
    assert.strictEqual(providerConfig.enableResponseCache, false);
    for (const entryPoint of ['src/proxy/modelProvider.ts', 'src/proxy/chatParticipant.ts']) {
        const source = fs.readFileSync(path.join(process.cwd(), entryPoint), 'utf8');
        assert.doesNotMatch(source, /getConfiguration\(['"]tokenOptimizer['"]\)/,
            `${entryPoint} must consume the central runtime configuration.`);
    }

    FeatureFlagRegistry.resetToDefault();
    console.log('v7.0.1 Phase 1 settings, migration, restricted-mode, and zero-call gates passed.');
}
