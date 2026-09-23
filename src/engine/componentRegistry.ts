import type { CompilerFeatureFlags } from './featureFlags';

export type ComponentId =
    | 'canonical_request_compiler'
    | 'context_governor'
    | 'workspace_snapshot'
    | 'evidence_aware_retrieval'
    | 'context_solver'
    | 'sdg_slicing'
    | 'sufficiency_engine'
    | 'rule_compression'
    | 'cache_planner'
    | 'global_payload_budget'
    | 'protocol_guard'
    | 'preservation_gate'
    | 'evidence_safety_gate'
    | 'cost_projection'
    | 'response_cache'
    | 'image_rightsizing'
    | 'lsp_intelligence'
    | 'delta_context'
    | 'error_intelligence'
    | 'test_graph'
    | 'git_graph'
    | 'terminal_optimizer'
    | 'source_provenance'
    | 'dense_retrieval'
    | 'cross_encoder'
    | 'standalone_mmr'
    | 'semantic_dedup'
    | 'project_memory'
    | 'local_slm';

export type ComponentIntegrationState =
    | 'production_reachable'
    | 'conditional'
    | 'shadow_only'
    | 'component_tested_only'
    | 'replaced'
    | 'dormant'
    | 'unwired';

export type ComponentReceiptOutcome =
    | 'attempted'
    | 'invoked'
    | 'contributed'
    | 'bypassed'
    | 'timed_out'
    | 'failed'
    | 'fallback';

export interface ComponentResourceBudget {
    readonly maxLatencyMs: number;
    readonly maxMemoryMB: number;
}

export interface ComponentDefinition {
    readonly id: ComponentId;
    readonly stage: string;
    readonly integrationState: ComponentIntegrationState;
    readonly featureFlag?: keyof CompilerFeatureFlags;
    readonly releaseCapability?: 'compiler' | 'workspaceIndex' | 'responseCache' | 'imageRightsizing' | 'localInference';
    readonly requiresTrustedWorkspace: boolean;
    readonly requiresConsent: boolean;
    readonly fallback: string;
    readonly budget: ComponentResourceBudget;
    readonly lifecycleStatus?: 'active' | 'retired' | 'deprecated';
}

export interface ComponentCapabilityState {
    readonly id: ComponentId;
    readonly integrationState: ComponentIntegrationState;
    readonly configured: boolean;
    readonly effective: boolean;
    readonly reason: 'available' | 'configuration_disabled' | 'release_kill_switch' | 'workspace_untrusted'
        | 'consent_required' | 'not_production_reachable' | 'pipeline_mode' | 'optimization_off';
}

export interface ComponentRuntimeStatus extends ComponentCapabilityState {
    readonly observed: boolean;
    readonly contributed: boolean;
    readonly outcome: ComponentReceiptOutcome | 'eligible_not_observed' | 'unavailable';
}

export interface RequestCapabilitySnapshot {
    readonly pipelineMode: CompilerFeatureFlags['pipelineMode'];
    readonly forcePassThrough: boolean;
    readonly workspaceTrusted: boolean;
    readonly experimentalConsent: boolean;
    readonly disabledCapabilities: readonly string[];
    readonly components: readonly ComponentCapabilityState[];
}

export interface ComponentReceipt {
    readonly componentId: ComponentId;
    readonly outcome: ComponentReceiptOutcome;
    readonly sequence: number;
    readonly reason?: string;
}

const DEFINITIONS: readonly ComponentDefinition[] = Object.freeze([
    core('canonical_request_compiler', 'request_boundary', 10, 1),
    core('context_governor', 'governance', 5, 1),
    conditional('workspace_snapshot', 'workspace_context', 'workspaceIndex', 'enableWorkspaceIndex', true, 25, 64),
    conditional('evidence_aware_retrieval', 'retrieval', 'workspaceIndex', 'enableWorkspaceIndex', true, 40, 64),
    flaggedCore('context_solver', 'selection', 'enableContextSolver', 20, 8),
    flaggedCore('sdg_slicing', 'representation', 'enableSdgSlicing', 30, 16),
    flaggedCore('sufficiency_engine', 'retrieval', 'enableSufficiencyEngine', 10, 4),
    flaggedCore('rule_compression', 'compression', 'enablePluggableCompression', 20, 8),
    dormant('cache_planner', 'cache_planning', 'enableCachePlanner', 10, 4),
    core('global_payload_budget', 'budget', 10, 4),
    core('protocol_guard', 'preservation', 5, 2),
    core('preservation_gate', 'preservation', 10, 4),
    core('evidence_safety_gate', 'preservation', 10, 4),
    core('cost_projection', 'economics', 5, 2),
    conditional('response_cache', 'provider_boundary', 'responseCache', 'enableResponseCache', false, 10, 16),
    conditional('image_rightsizing', 'request_boundary', 'imageRightsizing', 'enableImageRightsizing', true, 100, 32),
    conditional('lsp_intelligence', 'retrieval', undefined, 'enableLspIntelligence', true, 25, 16),
    conditional('delta_context', 'workspace_signals', undefined, 'enableDeltaContext', true, 10, 8),
    conditional('error_intelligence', 'workspace_signals', undefined, 'enableErrorIntelligence', true, 10, 8),
    conditional('test_graph', 'workspace_signals', undefined, 'enableTestGraph', true, 10, 8),
    conditional('git_graph', 'workspace_signals', undefined, 'enableGitGraph', true, 10, 8),
    conditional('terminal_optimizer', 'workspace_signals', undefined, 'enableTerminalOptimizer', true, 10, 8),
    conditional('source_provenance', 'source_policy', undefined, 'enableProvenance', true, 10, 8),
    conditional('dense_retrieval', 'retrieval', undefined, 'enableDenseEmbeddings', true, 25, 16),
    conditional('cross_encoder', 'reranking', undefined, 'enableCrossEncoder', true, 20, 8),
    conditional('standalone_mmr', 'reranking', undefined, 'enableMmrDiversity', true, 10, 4),
    conditional('semantic_dedup', 'deduplication', undefined, 'enableSemanticDedup', true, 15, 8),
    governedConditional('project_memory', 'memory', undefined, 'enableProjectMemory', 15, 8),
    shadow('local_slm', 'local_inference', 'enableLocalSlm', 25, 16, true, 'localInference', 'retired')
]);

function core(id: ComponentId, stage: string, maxLatencyMs: number, maxMemoryMB: number): ComponentDefinition {
    return Object.freeze({ id, stage, integrationState: 'production_reachable', requiresTrustedWorkspace: false,
        requiresConsent: false, fallback: 'canonical_pass_through', budget: Object.freeze({ maxLatencyMs, maxMemoryMB }), lifecycleStatus: 'active' });
}

function flaggedCore(id: ComponentId, stage: string, featureFlag: keyof CompilerFeatureFlags,
    maxLatencyMs: number, maxMemoryMB: number): ComponentDefinition {
    return Object.freeze({ ...core(id, stage, maxLatencyMs, maxMemoryMB), featureFlag });
}

function conditional(id: ComponentId, stage: string, releaseCapability: ComponentDefinition['releaseCapability'],
    featureFlag: keyof CompilerFeatureFlags | undefined, requiresTrustedWorkspace: boolean,
    maxLatencyMs: number, maxMemoryMB: number): ComponentDefinition {
    return Object.freeze({ id, stage, integrationState: 'conditional', featureFlag, releaseCapability,
        requiresTrustedWorkspace, requiresConsent: false, fallback: 'canonical_baseline',
        budget: Object.freeze({ maxLatencyMs, maxMemoryMB }), lifecycleStatus: 'active' });
}

function governedConditional(id: ComponentId, stage: string, releaseCapability: ComponentDefinition['releaseCapability'],
    featureFlag: keyof CompilerFeatureFlags, maxLatencyMs: number, maxMemoryMB: number): ComponentDefinition {
    return Object.freeze({ ...conditional(id, stage, releaseCapability, featureFlag, true, maxLatencyMs, maxMemoryMB),
        requiresConsent: true, fallback: 'deterministic_no_memory_fallback' });
}

function shadow(id: ComponentId, stage: string, featureFlag: keyof CompilerFeatureFlags,
    maxLatencyMs: number, maxMemoryMB: number, requiresConsent: boolean = false,
    releaseCapability?: ComponentDefinition['releaseCapability'],
    lifecycleStatus: 'active' | 'retired' | 'deprecated' = 'active'): ComponentDefinition {
    return Object.freeze({ id, stage, integrationState: 'shadow_only', featureFlag, releaseCapability,
        requiresTrustedWorkspace: true, requiresConsent, fallback: 'deterministic_syntactic_fallback',
        budget: Object.freeze({ maxLatencyMs, maxMemoryMB }), lifecycleStatus });
}

/**
 * A component whose code exists but cannot execute in any shipped profile.
 *
 * Distinct from `shadow_only`, which runs off the critical path and can still be observed. A dormant
 * component is retained for a future evaluation that the current provider boundary cannot support,
 * so it must never appear as a capability, never be invoked, and never report savings. `cache_planner`
 * is dormant because ADR-001 establishes that the VS Code Language Model API exposes no `cache_control`
 * delivery path and no cache usage to measure one with.
 */
function dormant(id: ComponentId, stage: string, featureFlag: keyof CompilerFeatureFlags,
    maxLatencyMs: number, maxMemoryMB: number): ComponentDefinition {
    return Object.freeze({ id, stage, integrationState: 'dormant', featureFlag,
        requiresTrustedWorkspace: false, requiresConsent: false, fallback: 'canonical_message_order',
        budget: Object.freeze({ maxLatencyMs, maxMemoryMB }), lifecycleStatus: 'deprecated' });
}

function standalone(id: ComponentId, stage: string, featureFlag: keyof CompilerFeatureFlags,
    requiresConsent = false, releaseCapability?: ComponentDefinition['releaseCapability']): ComponentDefinition {
    return Object.freeze({ id, stage, integrationState: 'component_tested_only', featureFlag, releaseCapability,
        requiresTrustedWorkspace: true, requiresConsent, fallback: 'deterministic_production_baseline',
        budget: Object.freeze({ maxLatencyMs: 0, maxMemoryMB: 0 }), lifecycleStatus: 'retired' });
}

export class ComponentRegistry {
    public static definitions(): readonly ComponentDefinition[] {
        return DEFINITIONS;
    }

    public static definition(id: ComponentId): ComponentDefinition {
        const definition = DEFINITIONS.find(candidate => candidate.id === id);
        if (!definition) throw new Error(`Unknown component: ${id}`);
        return definition;
    }

    public static isDormant(id: ComponentId): boolean {
        return ComponentRegistry.definition(id).integrationState === 'dormant';
    }

    public static isRetired(id: ComponentId): boolean {
        const definition = DEFINITIONS.find(candidate => candidate.id === id);
        return definition?.lifecycleStatus === 'retired';
    }

    public static getRetiredComponents(): readonly ComponentDefinition[] {
        return DEFINITIONS.filter(candidate => candidate.lifecycleStatus === 'retired');
    }

    public static capture(flags: CompilerFeatureFlags, context: {
        workspaceTrusted?: boolean;
        experimentalConsent?: boolean;
        disabledCapabilities?: readonly string[];
    } = {}): RequestCapabilitySnapshot {
        const workspaceTrusted = context.workspaceTrusted !== false;
        const experimentalConsent = context.experimentalConsent === true;
        const disabled = new Set(context.disabledCapabilities || []);
        const components = DEFINITIONS.map(definition => {
            const configured = definition.featureFlag ? flags[definition.featureFlag] === true : true;
            let reason: ComponentCapabilityState['reason'] = 'available';
            if (definition.integrationState !== 'production_reachable' && definition.integrationState !== 'conditional') {
                reason = 'not_production_reachable';
            } else if (flags.forcePassThrough && definition.featureFlag) {
                reason = 'optimization_off';
            } else if (flags.pipelineMode === 'legacy' && definition.featureFlag) {
                reason = 'pipeline_mode';
            } else if (!configured) {
                reason = 'configuration_disabled';
            } else if (definition.releaseCapability && disabled.has(definition.releaseCapability)) {
                reason = 'release_kill_switch';
            } else if (definition.requiresTrustedWorkspace && !workspaceTrusted) {
                reason = 'workspace_untrusted';
            } else if (definition.requiresConsent && !experimentalConsent) {
                reason = 'consent_required';
            }
            return Object.freeze({ id: definition.id, integrationState: definition.integrationState, configured,
                effective: reason === 'available', reason });
        });
        return Object.freeze({ pipelineMode: flags.pipelineMode, forcePassThrough: flags.forcePassThrough,
            workspaceTrusted, experimentalConsent, disabledCapabilities: Object.freeze([...disabled].sort()),
            components: Object.freeze(components) });
    }

    /** Combine eligibility with request receipts. UI and diagnostics must use this observed view. */
    public static runtimeStatuses(
        snapshot: RequestCapabilitySnapshot,
        receipts: readonly ComponentReceipt[] = []
    ): readonly ComponentRuntimeStatus[] {
        const latest = new Map<ComponentId, ComponentReceipt>();
        for (const receipt of receipts) latest.set(receipt.componentId, receipt);
        return Object.freeze(snapshot.components.map(capability => {
            const receipt = latest.get(capability.id);
            const outcome: ComponentRuntimeStatus['outcome'] = receipt?.outcome
                ?? (capability.effective ? 'eligible_not_observed' : 'unavailable');
            return Object.freeze({
                ...capability,
                observed: Boolean(receipt),
                contributed: receipt?.outcome === 'contributed',
                outcome
            });
        }));
    }
}

const TERMINAL_OUTCOMES = new Set<ComponentReceiptOutcome>(['contributed', 'bypassed', 'timed_out', 'failed', 'fallback']);

/** Request-local, content-free, append-only receipt trail. */
export class ComponentReceiptTrail {
    private receipts: ComponentReceipt[] = [];
    private seen = new Set<string>();
    private terminal = new Set<ComponentId>();

    constructor(public readonly capabilities: RequestCapabilitySnapshot) {}

    public isTerminal(componentId: ComponentId): boolean { return this.terminal.has(componentId); }

    /**
     * Records an outcome only while the component is still undecided.
     *
     * A timeout or a failure finalizes a component from inside the stage that owns it, and the
     * surrounding pass-through and fallback paths then record their own view of the same component.
     * `record` treats that as a protocol violation and throws, which turned a degraded request into
     * a failed one. The rule belongs here rather than in each caller: whoever finalized a component
     * first observed it directly, so their receipt is the one to keep.
     */
    public recordIfPending(componentId: ComponentId, outcome: ComponentReceiptOutcome, reason?: string): void {
        if (!this.terminal.has(componentId)) this.record(componentId, outcome, reason);
    }

    public record(componentId: ComponentId, outcome: ComponentReceiptOutcome, reason?: string): void {
        const definition = ComponentRegistry.definition(componentId);
        // A dormant component cannot execute in any shipped profile, so it must not be able to leave a
        // trace saying it did. Attempts are dropped rather than thrown: a caller reaching this point is
        // a stale guard, not a protocol violation, and failing the request would be worse than ignoring
        // the receipt. Only `bypassed` is retained, because that is the truthful record.
        if (definition.integrationState === 'dormant' && outcome !== 'bypassed') return;
        const key = `${componentId}:${outcome}`;
        if (this.seen.has(key)) return;
        if (this.terminal.has(componentId)) throw new Error(`Component ${componentId} already has a terminal receipt.`);
        const prior = this.receipts.filter(receipt => receipt.componentId === componentId);
        if (outcome === 'invoked' && !prior.some(receipt => receipt.outcome === 'attempted')) {
            throw new Error(`Component ${componentId} cannot be invoked before it is attempted.`);
        }
        if (outcome === 'contributed' && !prior.some(receipt => receipt.outcome === 'invoked')) {
            throw new Error(`Component ${componentId} cannot contribute before it is invoked.`);
        }
        const safeReason = reason?.replace(/[^a-z0-9_.:-]/gi, '_').slice(0, 96);
        this.receipts.push(Object.freeze({ componentId, outcome, sequence: this.receipts.length + 1,
            ...(safeReason ? { reason: safeReason } : {}) }));
        this.seen.add(key);
        if (TERMINAL_OUTCOMES.has(outcome)) this.terminal.add(componentId);
    }

    public snapshot(): readonly ComponentReceipt[] {
        return Object.freeze(this.receipts.map(receipt => Object.freeze({ ...receipt })));
    }
}
