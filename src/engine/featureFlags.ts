/**
 * Tokonomics Context Compiler - Feature Flag Registry & Runtime Configuration
 * Provides granular toggles and safety switches for every intelligence engine.
 */

export type PipelineMode = 'legacy' | 'hybrid' | 'compiler';

export type CompressionProviderType = 'noop' | 'rule' | 'lingua2' | 'slm' | 'legacy';

import { ComponentRegistry, RequestCapabilitySnapshot } from './componentRegistry';
import { OPTIMIZATION_PROFILES, RuntimeConfiguration, UserPreferenceRegistry } from '../config/userPreferences';

export interface CompilerFeatureFlags {
    // Emergency release override: preserve canonical request payloads verbatim.
    forcePassThrough: boolean;
    // Pipeline mode: 'legacy' (100% v4.1.2), 'hybrid' (transitional), 'compiler' (full compiler)
    pipelineMode: PipelineMode;

    // Workspace & Language Intelligence
    enableWorkspaceIndex: boolean;
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
    enableResponseCache: boolean;
    enableImageRightsizing: boolean;
    enableCachePlanner: boolean;
    enableLocalSlm: boolean;
    enableObservationMasking: boolean;
}

export const DEFAULT_FEATURE_FLAGS: CompilerFeatureFlags = Object.freeze({
    ...OPTIMIZATION_PROFILES.balanced.featureFlags
});

export class FeatureFlagRegistry {
    private static currentFlags: CompilerFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
    private static capabilityContext: {
        workspaceTrusted: boolean;
        experimentalConsent: boolean;
        disabledCapabilities: readonly string[];
    } = { workspaceTrusted: true, experimentalConsent: false, disabledCapabilities: Object.freeze([]) };

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
        const runtime = UserPreferenceRegistry.loadFromConfiguration(conf);
        this.applyRuntimeConfiguration(runtime);
        return this.currentFlags;
    }

    public static applyRuntimeConfiguration(runtime: RuntimeConfiguration): CompilerFeatureFlags {
        UserPreferenceRegistry.apply(runtime);
        this.currentFlags = { ...runtime.featureFlags };
        return this.getFlags();
    }

    public static getFlags(): CompilerFeatureFlags {
        return { ...this.currentFlags };
    }

    public static setCapabilityContext(context: {
        workspaceTrusted: boolean;
        experimentalConsent: boolean;
        disabledCapabilities: readonly string[];
    }): void {
        this.capabilityContext = {
            workspaceTrusted: context.workspaceTrusted,
            experimentalConsent: context.experimentalConsent,
            disabledCapabilities: Object.freeze([...context.disabledCapabilities])
        };
    }

    /** Capture all request-affecting capability decisions once at request entry. */
    public static captureRequestCapabilities(): RequestCapabilitySnapshot {
        return ComponentRegistry.capture(this.currentFlags, this.capabilityContext);
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
        UserPreferenceRegistry.reset();
        this.capabilityContext = { workspaceTrusted: true, experimentalConsent: false, disabledCapabilities: Object.freeze([]) };
    }
}
