/**
 * Tokonomics Context Compiler - Feature Flag Registry & Runtime Configuration
 * Provides granular toggles and safety switches for every intelligence engine.
 */

export type PipelineMode = 'legacy' | 'hybrid' | 'compiler';

export type CompressionProviderType = 'noop' | 'rule' | 'lingua2' | 'slm' | 'legacy';

export interface CompilerFeatureFlags {
    // Emergency release override: preserve canonical request payloads verbatim.
    forcePassThrough: boolean;
    // Pipeline mode: 'legacy' (100% v4.1.2), 'hybrid' (transitional), 'compiler' (full compiler)
    pipelineMode: PipelineMode;

    // Workspace & Language Intelligence
    enableLspIntelligence: boolean;
    enableDeltaContext: boolean;
    enableErrorIntelligence: boolean;
    enableTestGraph: boolean;
    enableGitGraph: boolean;
    enableTerminalOptimizer: boolean;
    enableProvenance: boolean;

    // Retrieval & Ranking
    enableDenseEmbeddings: boolean;
    enableCrossEncoder: boolean;
    enableMmrDiversity: boolean;
    enableSemanticDedup: boolean;

    // Solvers & Slicing
    enableContextSolver: boolean;
    enableSdgSlicing: boolean;
    enableSufficiencyEngine: boolean;

    // Compression & Memory
    enablePluggableCompression: boolean;
    compressionProvider: CompressionProviderType;
    enableProjectMemory: boolean;

    // Caching, Models & Tools
    enableCachePlanner: boolean;
    enableExactTokenizers: boolean;
    enableSchemaSynthesis: boolean;
    enableTaskAwareVision: boolean;
    enableLocalSlm: boolean;
}

export const DEFAULT_FEATURE_FLAGS: CompilerFeatureFlags = {
    forcePassThrough: false,
    pipelineMode: 'legacy',
    enableLspIntelligence: false,
    enableDeltaContext: false,
    enableErrorIntelligence: false,
    enableTestGraph: false,
    enableGitGraph: false,
    enableTerminalOptimizer: false,
    enableProvenance: false,
    enableDenseEmbeddings: false,
    enableCrossEncoder: false,
    enableMmrDiversity: true,
    enableSemanticDedup: true,
    enableContextSolver: false,
    enableSdgSlicing: false,
    enableSufficiencyEngine: false,
    enablePluggableCompression: false,
    compressionProvider: 'rule',
    enableProjectMemory: false,
    enableCachePlanner: false,
    enableExactTokenizers: false,
    enableSchemaSynthesis: false,
    enableTaskAwareVision: false,
    enableLocalSlm: false
};

export class FeatureFlagRegistry {
    private static currentFlags: CompilerFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

    /**
     * Initializes or updates feature flags from VS Code configuration
     */
    public static loadFromConfiguration(config?: any): CompilerFeatureFlags {
        let conf = config;
        if (!conf) {
            try {
                const vscodeModule = require('vscode');
                conf = vscodeModule.workspace?.getConfiguration?.('tokenOptimizer');
            } catch {}
        }
        if (!conf) {
            return this.currentFlags;
        }

        const get = <T>(key: string, def: T): T => (conf && typeof conf.get === 'function' ? conf.get(key, def) : def);
        const mode = get<PipelineMode>('pipelineMode', 'compiler');
        
        this.currentFlags = {
            ...DEFAULT_FEATURE_FLAGS,
            forcePassThrough: get<boolean>('emergencyDisableOptimization', false),
            pipelineMode: mode,
            enableLspIntelligence: mode !== 'legacy' && get<boolean>('enableLspIntelligence', true),
            enableDeltaContext: mode !== 'legacy' && get<boolean>('enableDeltaContext', true),
            enableErrorIntelligence: mode !== 'legacy' && get<boolean>('enableErrorIntelligence', true),
            enableTestGraph: mode === 'compiler' && get<boolean>('enableTestGraph', true),
            enableGitGraph: mode === 'compiler' && get<boolean>('enableGitGraph', true),
            enableTerminalOptimizer: mode !== 'legacy' && get<boolean>('enableTerminalOptimizer', true),
            enableProvenance: mode !== 'legacy' && get<boolean>('enableProvenance', true),
            enableDenseEmbeddings: mode === 'compiler' && get<boolean>('enableDenseEmbeddings', false),
            enableCrossEncoder: mode === 'compiler' && get<boolean>('enableCrossEncoder', false),
            enableMmrDiversity: get<boolean>('enableMmrDiversity', true),
            enableSemanticDedup: get<boolean>('enableSemanticDedup', true),
            enableContextSolver: mode === 'compiler' && get<boolean>('enableContextSolver', true),
            enableSdgSlicing: mode === 'compiler' && get<boolean>('enableSdgSlicing', false),
            enableSufficiencyEngine: mode === 'compiler' && get<boolean>('enableSufficiencyEngine', true),
            enablePluggableCompression: mode === 'compiler' && get<boolean>('enablePluggableCompression', true),
            compressionProvider: get<CompressionProviderType>('compressionProvider', 'rule'),
            enableProjectMemory: mode === 'compiler' && get<boolean>('enableProjectMemory', true),
            enableCachePlanner: mode !== 'legacy' && get<boolean>('enableCachePlanner', true),
            enableExactTokenizers: mode !== 'legacy' && get<boolean>('enableExactTokenizers', true),
            enableSchemaSynthesis: mode !== 'legacy' && get<boolean>('enableSchemaSynthesis', true),
            enableTaskAwareVision: mode !== 'legacy' && get<boolean>('enableTaskAwareVision', true),
            enableLocalSlm: mode === 'compiler' && get<boolean>('enableLocalSlm', false)
        };

        return this.currentFlags;
    }

    public static getFlags(): CompilerFeatureFlags {
        return { ...this.currentFlags };
    }

    public static setFlag<K extends keyof CompilerFeatureFlags>(key: K, value: CompilerFeatureFlags[K]): void {
        this.currentFlags[key] = value;
    }

    public static setPipelineMode(mode: PipelineMode): void {
        this.currentFlags.pipelineMode = mode;
    }

    public static setReleasePassThrough(enabled: boolean): void {
        this.currentFlags.forcePassThrough = enabled;
    }

    public static resetToDefault(): void {
        this.currentFlags = { ...DEFAULT_FEATURE_FLAGS };
    }
}
