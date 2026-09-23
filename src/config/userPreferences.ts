import type { CompilerFeatureFlags } from '../engine/featureFlags';
import type { ReleaseControlConfiguration } from '../release/releaseControl';
import type { TokenOptimizationConfig, TargetProvider } from '../types';

export type OptimizationMode = 'off' | 'balanced' | 'maximum';
export type WorkspaceContextPreference = 'none' | 'selection' | 'automatic';

export interface UserPreferences {
    readonly optimizationMode: OptimizationMode;
    readonly workspaceContext: WorkspaceContextPreference;
    readonly includeUnsavedChanges: boolean;
    readonly responseReuse: boolean;
}

export interface OptimizationProfile {
    readonly id: OptimizationMode;
    readonly label: 'Off' | 'Balanced' | 'Maximum Savings';
    readonly featureFlags: Readonly<CompilerFeatureFlags>;
    readonly tokenOptimization: Readonly<TokenOptimizationConfig>;
}

export interface RuntimeConfiguration {
    readonly schemaVersion: 1;
    readonly preferences: Readonly<UserPreferences>;
    readonly profile: Readonly<OptimizationProfile>;
    readonly featureFlags: Readonly<CompilerFeatureFlags>;
    readonly tokenOptimization: Readonly<TokenOptimizationConfig>;
    readonly workspace: Readonly<{
        contextMode: 'off' | 'selection' | 'automatic';
        includeUnsavedBuffers: boolean;
        ramBudgetMB: number;
        maxIndexFileSizeKB: number;
        backgroundWarming: boolean;
    }>;
    readonly responseCache: Readonly<{ enabled: boolean; maxSize: number }>;
    readonly image: Readonly<{ enabled: boolean; maxDimension: number }>;
    readonly modelAllowList: readonly string[];
    readonly releaseControl: Readonly<ReleaseControlConfiguration>;
    readonly experiments: Readonly<{
        consent: false;
        enabled: readonly string[];
        disabled: readonly string[];
        maxLatencyMs: number;
        maxMemoryMB: number;
    }>;
    readonly migration: Readonly<{
        source: 'v7-public' | 'v6-legacy' | 'defaults';
        migratedLegacyKeys: readonly string[];
        malformedKeys: readonly string[];
    }>;
}

export interface ConfigurationLike {
    get<T>(key: string, defaultValue: T): T;
    inspect?<T>(key: string): {
        readonly globalValue?: T;
        readonly workspaceValue?: T;
        readonly workspaceFolderValue?: T;
        readonly defaultValue?: T;
    } | undefined;
    update?(key: string, value: unknown, target?: unknown): PromiseLike<void>;
}

export interface MigrationStateLike {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

export const PUBLIC_SETTING_KEYS = Object.freeze([
    'optimizationMode',
    'workspaceContext',
    'includeUnsavedChanges',
    'responseReuse'
] as const);

export const LEGACY_SETTING_KEYS = Object.freeze([
    'workspaceContextMode', 'includeUnsavedBuffers', 'enableContextGovernor', 'governorAggressiveness',
    'enforceEvidenceSafetyGate', 'enableAstPruning', 'enableCacheAlignment', 'enableTextCompression',
    'compressionRatio', 'targetProvider', 'maxHistoryTurns', 'stripDiffsAndLogs',
    'targetUpstreamModelFamily', 'enableDailyBudgetGuardrail', 'dailyBudgetUsd', 'mcpSchemaCompression',
    'enableDiffOutputOptimization', 'enableModelRouting', 'enableResponseCache', 'tabRelevanceThreshold',
    'maxIndexFileSizeKB', 'responseCacheMaxSize', 'modelAllowList', 'enableImageRightsizing',
    'imageMaxDimension', 'ramBudgetMB', 'enableBackgroundRamWarming', 'enableRamSemanticIndex',
    'pipelineMode', 'releaseChannel', 'stagedRolloutPercent', 'emergencyDisableOptimization',
    'disabledCapabilities', 'experimentalConsent', 'experimentalFeatures', 'disabledExperiments',
    'experimentalMaxLatencyMs', 'experimentalMaxMemoryMB'
] as const);

const MIGRATION_STATE_KEY = 'tokonomics.configurationMigration.v7.0.1';
const EMPTY_CONFIGURATION: ConfigurationLike = { get: (_key, defaultValue) => defaultValue };

function compilerFlags(mode: OptimizationMode): CompilerFeatureFlags {
    const enabled = mode !== 'off';
    // Maximum Savings opts into the deeper workspace signal and retrieval stages. Every one of
    // these is snapshot-bound, individually kill-switched, deadline-bounded and has a
    // deterministic fallback; Balanced deliberately stays on the smaller, longer-certified path.
    const deepAnalysis = mode === 'maximum';
    return Object.freeze({
        forcePassThrough: !enabled,
        pipelineMode: 'compiler',
        enableWorkspaceIndex: enabled,
        enableLspIntelligence: deepAnalysis,
        enableDeltaContext: deepAnalysis,
        enableErrorIntelligence: deepAnalysis,
        enableTestGraph: deepAnalysis,
        enableGitGraph: deepAnalysis,
        enableTerminalOptimizer: deepAnalysis,
        enableProvenance: deepAnalysis,
        enableDenseEmbeddings: deepAnalysis,
        enableCrossEncoder: deepAnalysis,
        enableMmrDiversity: deepAnalysis,
        enableSemanticDedup: deepAnalysis,
        enableContextSolver: enabled,
        enableSdgSlicing: enabled,
        enableSufficiencyEngine: deepAnalysis,
        enablePluggableCompression: enabled,
        compressionProvider: 'rule',
        enableProjectMemory: false,
        enableResponseCache: enabled,
        enableImageRightsizing: enabled,
        // Off in every profile. CachePlanner computes a cache_control layout that the VS Code Language
        // Model API has no field to carry and no usage reporting to verify, so enabling it would buy a
        // capability claim rather than a saving. ADR-001 records the decision and the reopening triggers.
        enableCachePlanner: false,
        enableLocalSlm: false,
        // Masking older tool observations. Enabled by default rather than held behind Maximum
        // Savings, because it is inert on everything except the workload it targets: it is a
        // byte-identical no-op on plain chat, attached files, multi-turn text and short tool
        // sessions, and only engages past roughly seven accumulated tool observations. Turning it on
        // therefore changes nothing for a user who never runs a long agentic loop, and removes
        // 53-77% of the payload for one who does. External evidence is arXiv:2508.21433, which found
        // masking halves cost at equal solve rate; local evidence is the inertness and protocol
        // invariants enforced by measure:savings and the remediation suite.
        enableObservationMasking: enabled
    });
}

function tokenOptimization(mode: OptimizationMode): TokenOptimizationConfig {
    const enabled = mode !== 'off';
    return Object.freeze({
        enableAstPruning: enabled,
        enableCacheAlignment: false,
        enableTextCompression: enabled,
        compressionRatio: mode === 'maximum' ? 0.3 : 0.4,
        targetProvider: 'auto',
        maxHistoryTurns: mode === 'maximum' ? 6 : 8,
        stripDiffsAndLogs: enabled,
        targetUpstreamModelFamily: 'auto',
        enableDiffOutputOptimization: enabled,
        enableModelRouting: enabled,
        enableResponseCache: enabled,
        tabRelevanceThreshold: 20,
        ramBudgetMB: 64,
        enableBackgroundRamWarming: true,
        enableRamSemanticIndex: true,
        workspaceContextMode: 'selection',
        includeUnsavedBuffers: false
    });
}

function profile(mode: OptimizationMode): OptimizationProfile {
    return Object.freeze({
        id: mode,
        label: mode === 'off' ? 'Off' : mode === 'maximum' ? 'Maximum Savings' : 'Balanced',
        featureFlags: compilerFlags(mode),
        tokenOptimization: tokenOptimization(mode)
    });
}

export const OPTIMIZATION_PROFILES: Readonly<Record<OptimizationMode, OptimizationProfile>> = Object.freeze({
    off: profile('off'),
    balanced: profile('balanced'),
    maximum: profile('maximum')
});

function explicitValue<T>(configuration: ConfigurationLike, key: string): T | undefined {
    const inspected = configuration.inspect?.<T>(key);
    if (!inspected) return undefined;
    return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(minimum, Math.min(maximum, value))
        : fallback;
}

function stringArray(value: unknown): readonly string[] {
    if (!Array.isArray(value)) return Object.freeze([]);
    return Object.freeze(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean));
}

function validProvider(value: unknown): value is TargetProvider {
    return ['auto', 'anthropic', 'openai', 'gemini', 'deepseek', 'generic'].includes(String(value));
}

function inferLegacyMode(configuration: ConfigurationLike, migrated: string[]): OptimizationMode | undefined {
    const emergency = explicitValue<boolean>(configuration, 'emergencyDisableOptimization');
    const releaseChannel = explicitValue<string>(configuration, 'releaseChannel');
    const ast = explicitValue<boolean>(configuration, 'enableAstPruning');
    const cache = explicitValue<boolean>(configuration, 'enableCacheAlignment');
    const text = explicitValue<boolean>(configuration, 'enableTextCompression');
    const aggressiveness = explicitValue<string>(configuration, 'governorAggressiveness');
    const ratio = explicitValue<number>(configuration, 'compressionRatio');
    const observed = [
        ['emergencyDisableOptimization', emergency], ['releaseChannel', releaseChannel],
        ['enableAstPruning', ast], ['enableCacheAlignment', cache], ['enableTextCompression', text],
        ['governorAggressiveness', aggressiveness], ['compressionRatio', ratio]
    ] as const;
    for (const [key, value] of observed) if (value !== undefined) migrated.push(key);
    if (emergency === true || releaseChannel === 'disabled' || (ast === false && cache === false && text === false)) return 'off';
    if (aggressiveness === 'aggressive' || (typeof ratio === 'number' && ratio <= 0.3)) return 'maximum';
    return observed.some(([, value]) => value !== undefined) ? 'balanced' : undefined;
}

export function resolveRuntimeConfiguration(configuration: ConfigurationLike = EMPTY_CONFIGURATION): RuntimeConfiguration {
    const migratedLegacyKeys: string[] = [];
    const malformedKeys: string[] = [];
    for (const key of LEGACY_SETTING_KEYS) {
        if (explicitValue(configuration, key) !== undefined) migratedLegacyKeys.push(key);
    }
    const explicitMode = explicitValue<unknown>(configuration, 'optimizationMode');
    let optimizationMode: OptimizationMode;
    let source: RuntimeConfiguration['migration']['source'] = 'defaults';
    if (explicitMode !== undefined) {
        if (['off', 'balanced', 'maximum'].includes(String(explicitMode))) {
            optimizationMode = explicitMode as OptimizationMode;
            source = 'v7-public';
        } else {
            optimizationMode = 'balanced';
            malformedKeys.push('optimizationMode');
        }
    } else {
        const legacyMode = inferLegacyMode(configuration, migratedLegacyKeys);
        optimizationMode = legacyMode || 'balanced';
        if (legacyMode) source = 'v6-legacy';
    }

    const explicitWorkspace = explicitValue<unknown>(configuration, 'workspaceContext');
    const legacyWorkspace = explicitValue<unknown>(configuration, 'workspaceContextMode');
    let workspaceContext: WorkspaceContextPreference = 'selection';
    if (explicitWorkspace !== undefined) {
        if (['none', 'selection', 'automatic'].includes(String(explicitWorkspace))) workspaceContext = explicitWorkspace as WorkspaceContextPreference;
        else malformedKeys.push('workspaceContext');
        source = 'v7-public';
    } else if (legacyWorkspace !== undefined) {
        migratedLegacyKeys.push('workspaceContextMode');
        workspaceContext = legacyWorkspace === 'automatic' ? 'automatic' : legacyWorkspace === 'off' ? 'none' : 'selection';
        if (source === 'defaults') source = 'v6-legacy';
    }

    const explicitUnsaved = explicitValue<unknown>(configuration, 'includeUnsavedChanges');
    const legacyUnsaved = explicitValue<unknown>(configuration, 'includeUnsavedBuffers');
    let includeUnsavedChanges = false;
    if (explicitUnsaved !== undefined) {
        if (typeof explicitUnsaved === 'boolean') includeUnsavedChanges = explicitUnsaved;
        else malformedKeys.push('includeUnsavedChanges');
        source = 'v7-public';
    } else if (legacyUnsaved !== undefined) {
        migratedLegacyKeys.push('includeUnsavedBuffers');
        includeUnsavedChanges = legacyUnsaved === true;
        if (source === 'defaults') source = 'v6-legacy';
    }

    const explicitReuse = explicitValue<unknown>(configuration, 'responseReuse');
    const legacyReuse = explicitValue<unknown>(configuration, 'enableResponseCache');
    let responseReuse = true;
    if (explicitReuse !== undefined) {
        if (typeof explicitReuse === 'boolean') responseReuse = explicitReuse;
        else malformedKeys.push('responseReuse');
        source = 'v7-public';
    } else if (legacyReuse !== undefined) {
        migratedLegacyKeys.push('enableResponseCache');
        responseReuse = legacyReuse !== false;
        if (source === 'defaults') source = 'v6-legacy';
    }

    const selectedProfile = OPTIMIZATION_PROFILES[optimizationMode];
    const workspaceMode = workspaceContext === 'none' ? 'off' : workspaceContext;
    const legacyTargetProvider = explicitValue<unknown>(configuration, 'targetProvider');
    const legacyTargetFamily = explicitValue<unknown>(configuration, 'targetUpstreamModelFamily');
    const legacyAllowList = explicitValue<unknown>(configuration, 'modelAllowList');
    const legacyDisabledCapabilities = explicitValue<unknown>(configuration, 'disabledCapabilities');
    const legacyRamBudget = explicitValue<unknown>(configuration, 'ramBudgetMB');
    const legacyFileSize = explicitValue<unknown>(configuration, 'maxIndexFileSizeKB');
    const legacyCacheSize = explicitValue<unknown>(configuration, 'responseCacheMaxSize');
    const legacyImageEnabled = explicitValue<unknown>(configuration, 'enableImageRightsizing');
    const legacyImageDimension = explicitValue<unknown>(configuration, 'imageMaxDimension');
    for (const [key, value] of [
        ['targetProvider', legacyTargetProvider], ['targetUpstreamModelFamily', legacyTargetFamily],
        ['modelAllowList', legacyAllowList], ['disabledCapabilities', legacyDisabledCapabilities],
        ['ramBudgetMB', legacyRamBudget], ['maxIndexFileSizeKB', legacyFileSize],
        ['responseCacheMaxSize', legacyCacheSize], ['enableImageRightsizing', legacyImageEnabled],
        ['imageMaxDimension', legacyImageDimension]
    ] as const) {
        if (value !== undefined) migratedLegacyKeys.push(key);
    }

    const preferences = Object.freeze({ optimizationMode, workspaceContext, includeUnsavedChanges, responseReuse });
    const featureFlags = Object.freeze({
        ...selectedProfile.featureFlags,
        forcePassThrough: optimizationMode === 'off',
        enableWorkspaceIndex: optimizationMode !== 'off' && workspaceContext !== 'none',
        enableResponseCache: optimizationMode !== 'off' && responseReuse,
        enableImageRightsizing: optimizationMode !== 'off' && legacyImageEnabled !== false,
        enableCachePlanner: false
    });
    const tokenConfig = Object.freeze({
        ...selectedProfile.tokenOptimization,
        targetProvider: validProvider(legacyTargetProvider) ? legacyTargetProvider : 'auto',
        targetUpstreamModelFamily: typeof legacyTargetFamily === 'string' && legacyTargetFamily.trim() ? legacyTargetFamily : 'auto',
        enableResponseCache: optimizationMode !== 'off' && responseReuse,
        workspaceContextMode: workspaceMode,
        includeUnsavedBuffers: includeUnsavedChanges
    });
    const disabledCapabilities = stringArray(legacyDisabledCapabilities)
        .filter(value => ['compiler', 'workspaceIndex', 'responseCache', 'imageRightsizing', 'localInference'].includes(value));
    if (source === 'defaults' && migratedLegacyKeys.length > 0) source = 'v6-legacy';

    return Object.freeze({
        schemaVersion: 1 as const,
        preferences,
        profile: selectedProfile,
        featureFlags,
        tokenOptimization: tokenConfig,
        workspace: Object.freeze({
            contextMode: workspaceMode,
            includeUnsavedBuffers: includeUnsavedChanges,
            ramBudgetMB: boundedNumber(legacyRamBudget, 64, 16, 1024),
            maxIndexFileSizeKB: boundedNumber(legacyFileSize, 300, 50, 5000),
            backgroundWarming: workspaceContext === 'automatic'
        }),
        responseCache: Object.freeze({
            enabled: optimizationMode !== 'off' && responseReuse,
            maxSize: boundedNumber(legacyCacheSize, 100, 10, 500)
        }),
        image: Object.freeze({
            enabled: optimizationMode !== 'off' && legacyImageEnabled !== false,
            maxDimension: boundedNumber(legacyImageDimension, 512, 128, 2048)
        }),
        modelAllowList: stringArray(legacyAllowList),
        releaseControl: Object.freeze({
            channel: 'stable' as const,
            stagedRolloutPercent: 100,
            emergencyDisableOptimization: optimizationMode === 'off',
            disabledCapabilities
        }),
        experiments: Object.freeze({
            consent: false as const,
            enabled: Object.freeze([]),
            disabled: Object.freeze([]),
            maxLatencyMs: 25,
            maxMemoryMB: 32
        }),
        migration: Object.freeze({
            source,
            migratedLegacyKeys: Object.freeze([...new Set(migratedLegacyKeys)].sort()),
            malformedKeys: Object.freeze([...new Set(malformedKeys)].sort())
        })
    });
}

export async function migrateLegacyPreferences(
    configuration: ConfigurationLike,
    state?: MigrationStateLike
): Promise<RuntimeConfiguration> {
    const resolved = resolveRuntimeConfiguration(configuration);
    if (!state || state.get<number>(MIGRATION_STATE_KEY) === 1 || resolved.migration.source !== 'v6-legacy') return resolved;
    for (const key of PUBLIC_SETTING_KEYS) {
        if (explicitValue(configuration, key) !== undefined || !configuration.update) continue;
        await configuration.update(key, resolved.preferences[key], true);
    }
    await state.update(MIGRATION_STATE_KEY, 1);
    return resolved;
}

export class UserPreferenceRegistry {
    private static current: RuntimeConfiguration = resolveRuntimeConfiguration();

    public static loadFromConfiguration(configuration?: ConfigurationLike): RuntimeConfiguration {
        this.current = resolveRuntimeConfiguration(configuration);
        return this.current;
    }

    public static apply(configuration: RuntimeConfiguration): void {
        this.current = configuration;
    }

    public static get(): RuntimeConfiguration {
        return this.current;
    }

    public static reset(): void {
        this.current = resolveRuntimeConfiguration();
    }
}
