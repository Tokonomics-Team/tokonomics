import assert from 'assert';
import { ComponentRegistry, ComponentReceiptTrail, ComponentId } from '../src/engine/componentRegistry';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { BoundedEconomics } from '../src/cost/boundedEconomics';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { AstPrunerEngine } from '../src/ast/pruner';

export async function runPhase11ReachabilityTests(): Promise<void> {
    console.log('--- Running Phase 11 Reachability Truth & Measurement Repair Tests ---');

    // 1. Registry Parity & Invariants
    const definitions = ComponentRegistry.definitions();
    assert.strictEqual(definitions.length, 29, 'Component registry must declare exactly 29 components');

    const standaloneIds: ComponentId[] = [];

    for (const id of standaloneIds) {
        const def = ComponentRegistry.definition(id);
        assert.strictEqual(def.integrationState, 'component_tested_only', `${id} must be marked component_tested_only`);
        assert.strictEqual(def.budget.maxLatencyMs, 0, `${id} must have zero production latency budget while unwired`);
    }

    const shadowRetrieverIds: ComponentId[] = [];
    for (const id of shadowRetrieverIds) {
        const def = ComponentRegistry.definition(id);
        assert.strictEqual(def.integrationState, 'shadow_only', `${id} must be marked shadow_only`);
        assert.strictEqual(def.budget.maxLatencyMs, 25, `${id} must have 25ms latency budget`);
        assert.strictEqual(def.budget.maxMemoryMB, 16, `${id} must have 16MB memory budget`);
    }
    assert.strictEqual(ComponentRegistry.definition('lsp_intelligence').integrationState, 'conditional');
    assert.strictEqual(ComponentRegistry.definition('dense_retrieval').integrationState, 'conditional');

    const phase13And14ProductionIds: ComponentId[] = [
        'delta_context', 'error_intelligence', 'test_graph', 'git_graph',
        'terminal_optimizer', 'source_provenance'
    ];
    for (const id of phase13And14ProductionIds) {
        const def = ComponentRegistry.definition(id);
        assert.strictEqual(def.integrationState, 'conditional', `${id} must be production-conditional after v7 Phase 7`);
        assert.strictEqual(def.budget.maxLatencyMs, 10, `${id} must have 10ms latency budget`);
        assert.strictEqual(def.budget.maxMemoryMB, 8, `${id} must have 8MB memory budget`);
    }

    const phase16ShadowIds: Array<{ id: ComponentId; maxLatencyMs: number; maxMemoryMB: number }> = [
        { id: 'cross_encoder', maxLatencyMs: 20, maxMemoryMB: 8 },
        { id: 'standalone_mmr', maxLatencyMs: 10, maxMemoryMB: 4 },
        { id: 'semantic_dedup', maxLatencyMs: 15, maxMemoryMB: 8 }
    ];
    for (const item of phase16ShadowIds) {
        const def = ComponentRegistry.definition(item.id);
        assert.strictEqual(def.integrationState, 'conditional', `${item.id} must be production-conditional after v7 Phase 8`);
        assert.strictEqual(def.budget.maxLatencyMs, item.maxLatencyMs, `${item.id} latency budget`);
        assert.strictEqual(def.budget.maxMemoryMB, item.maxMemoryMB, `${item.id} memory budget`);
    }

    const phase17ShadowIds: Array<{ id: ComponentId; maxLatencyMs: number; maxMemoryMB: number }> = [
        { id: 'project_memory', maxLatencyMs: 15, maxMemoryMB: 8 }
    ];
    for (const item of phase17ShadowIds) {
        const def = ComponentRegistry.definition(item.id);
        assert.strictEqual(def.integrationState, 'conditional', `${item.id} must be production-conditional after v7 Phase 10`);
        assert.strictEqual(def.budget.maxLatencyMs, item.maxLatencyMs, `${item.id} latency budget`);
        assert.strictEqual(def.budget.maxMemoryMB, item.maxMemoryMB, `${item.id} memory budget`);
        assert.strictEqual(def.requiresConsent, true, `${item.id} must require explicit consent`);
        assert.strictEqual(def.requiresTrustedWorkspace, true, `${item.id} must require trusted workspace`);
    }

    const phase18ShadowIds: Array<{ id: ComponentId; maxLatencyMs: number; maxMemoryMB: number }> = [
        { id: 'local_slm', maxLatencyMs: 25, maxMemoryMB: 16 }
    ];
    for (const item of phase18ShadowIds) {
        const def = ComponentRegistry.definition(item.id);
        assert.strictEqual(def.integrationState, 'shadow_only', `${item.id} must be marked shadow_only in Phase 18`);
        assert.strictEqual(def.budget.maxLatencyMs, item.maxLatencyMs, `${item.id} latency budget`);
        assert.strictEqual(def.budget.maxMemoryMB, item.maxMemoryMB, `${item.id} memory budget`);
        assert.strictEqual(def.requiresConsent, true, `${item.id} must require explicit consent`);
        assert.strictEqual(def.requiresTrustedWorkspace, true, `${item.id} must require trusted workspace`);
        assert.strictEqual(def.releaseCapability, 'localInference', `${item.id} must declare localInference release capability`);
    }

    const coreIds: ComponentId[] = [
        'canonical_request_compiler', 'context_governor', 'global_payload_budget',
        'protocol_guard', 'preservation_gate', 'evidence_safety_gate', 'cost_projection'
    ];

    for (const id of coreIds) {
        const def = ComponentRegistry.definition(id);
        assert.strictEqual(def.integrationState, 'production_reachable', `${id} must be production_reachable`);
    }

    assert.throws(() => {
        ComponentRegistry.definition('non_existent_component' as any);
    }, /Unknown component/, 'Unknown component ID lookup must throw');

    // 2. Capability Snapshot Truthfulness (Rule 4: Configured != Enabled)
    FeatureFlagRegistry.resetToDefault();
    FeatureFlagRegistry.setFlag('enableLspIntelligence', true);
    FeatureFlagRegistry.setFlag('enableLocalSlm', true);
    FeatureFlagRegistry.setFlag('enableContextSolver', true);
    FeatureFlagRegistry.setPipelineMode('legacy');

    const defaultSnapshot = FeatureFlagRegistry.captureRequestCapabilities();
    const lspState = defaultSnapshot.components.find(c => c.id === 'lsp_intelligence');
    assert.ok(lspState, 'lsp_intelligence must be present in snapshot');
    assert.strictEqual(lspState.configured, true, 'lsp_intelligence flag was set to true');
    assert.strictEqual(lspState.effective, false, 'Unwired lsp_intelligence must never be effective');
    assert.strictEqual(lspState.reason, 'pipeline_mode', 'LSP follows the request pipeline-mode gate');

    const slmState = defaultSnapshot.components.find(c => c.id === 'local_slm');
    assert.ok(slmState);
    assert.strictEqual(slmState.effective, false);
    assert.strictEqual(slmState.reason, 'not_production_reachable');

    const solverStateLegacy = defaultSnapshot.components.find(c => c.id === 'context_solver');
    assert.ok(solverStateLegacy);
    assert.strictEqual(solverStateLegacy.configured, true);
    assert.strictEqual(solverStateLegacy.effective, false, 'In legacy pipeline mode, compiler stages must be pipeline_mode gated');
    assert.strictEqual(solverStateLegacy.reason, 'pipeline_mode');

    // In compiler pipeline mode, configured core stage becomes effective and available
    FeatureFlagRegistry.setFlag('pipelineMode', 'compiler');
    const compilerSnapshot = FeatureFlagRegistry.captureRequestCapabilities();
    const solverStateCompiler = compilerSnapshot.components.find(c => c.id === 'context_solver');
    assert.ok(solverStateCompiler);
    assert.strictEqual(solverStateCompiler.effective, true);
    assert.strictEqual(solverStateCompiler.reason, 'available');

    // Untrusted workspace disables workspace-dependent components
    FeatureFlagRegistry.setCapabilityContext({
        workspaceTrusted: false,
        experimentalConsent: true,
        disabledCapabilities: []
    });
    const untrustedSnapshot = FeatureFlagRegistry.captureRequestCapabilities();
    const workspaceSnapshotCap = untrustedSnapshot.components.find(c => c.id === 'workspace_snapshot');
    assert.ok(workspaceSnapshotCap);
    assert.strictEqual(workspaceSnapshotCap.effective, false);
    assert.strictEqual(workspaceSnapshotCap.reason, 'workspace_untrusted');

    // Release kill switches override configuration
    FeatureFlagRegistry.setCapabilityContext({
        workspaceTrusted: true,
        experimentalConsent: true,
        disabledCapabilities: ['workspaceIndex']
    });
    const killSwitchedSnapshot = FeatureFlagRegistry.captureRequestCapabilities();
    const killedRetrieval = killSwitchedSnapshot.components.find(c => c.id === 'evidence_aware_retrieval');
    assert.ok(killedRetrieval);
    assert.strictEqual(killedRetrieval.effective, false);
    assert.strictEqual(killedRetrieval.reason, 'release_kill_switch');

    FeatureFlagRegistry.resetToDefault();

    // 3. Receipt Trail State Machine & Content-Free Integrity
    const trail = new ComponentReceiptTrail(FeatureFlagRegistry.captureRequestCapabilities());

    // Invalid transitions
    assert.throws(() => {
        trail.record('context_governor', 'invoked');
    }, /cannot be invoked before it is attempted/, 'Cannot invoke before attempted');

    assert.throws(() => {
        trail.record('context_governor', 'contributed');
    }, /cannot contribute before it is invoked/, 'Cannot contribute before invoked');

    // Valid state transitions
    trail.record('context_governor', 'attempted');
    trail.record('context_governor', 'invoked');
    trail.record('context_governor', 'contributed');

    // Idempotent duplicate recordings ignored without throwing
    trail.record('context_governor', 'contributed');

    // Terminal outcome rejects subsequent transitions
    assert.throws(() => {
        trail.record('context_governor', 'failed');
    }, /already has a terminal receipt/, 'Terminal receipt blocks further transitions');

    // Content-free audit: no prompt/path leaks in reason strings
    trail.record('workspace_snapshot', 'bypassed', 'path/to/my_secret_code.ts user prompt text');
    const receipts = trail.snapshot();
    for (const r of receipts) {
        assert.ok(!r.reason?.includes('/'), 'Receipt reason must sanitize path separators');
        assert.ok(!r.reason?.includes(' '), 'Receipt reason must sanitize spaces');
        assert.ok(/^[a-z0-9_.:-]*$/i.test(r.reason || ''), 'Receipt reason must contain only safe token chars');
    }

    // 4. Pipeline Orchestrator & Canonical Compiler Integration
    const orchestrator = new PipelineOrchestrator(new AstPrunerEngine());
    const compiler = new CanonicalRequestCompiler(orchestrator);

    const compileResult = await compiler.compile({
        messages: [
            { role: 'user', parts: [{ kind: 'text', text: 'function calculate() { return 42; }' }] }
        ]
    });

    assert.ok(compileResult.capabilities, 'CanonicalCompileResult must carry capabilities snapshot');
    assert.ok(compileResult.receipts, 'CanonicalCompileResult must carry receipts');
    assert.ok(compileResult.receipts.length >= 6, 'Canonical compiler must record receipts for executed stages');

    const receiptMap = new Map(compileResult.receipts.map(r => [r.componentId, r.outcome]));
    assert.strictEqual(receiptMap.get('canonical_request_compiler'), 'contributed');
    assert.strictEqual(receiptMap.get('context_governor'), 'contributed');
    assert.strictEqual(receiptMap.get('global_payload_budget'), 'contributed');
    assert.strictEqual(receiptMap.get('protocol_guard'), 'contributed');
    assert.strictEqual(receiptMap.get('preservation_gate'), 'contributed');
    assert.strictEqual(receiptMap.get('cost_projection'), 'contributed');

    // Prove unwired modules are never recorded as invoked or contributed in production
    for (const id of standaloneIds) {
        const outcome = receiptMap.get(id);
        assert.ok(outcome !== 'invoked' && outcome !== 'contributed', `Unwired component ${id} must never invoke or contribute in production`);
    }

    // 5. Bounded Economics Invariant Tests
    // Percentage clamping
    assert.strictEqual(BoundedEconomics.percentage(104.1), 100.0, '104.1% must clamp to 100.0%');
    assert.strictEqual(BoundedEconomics.percentage(99.1 + 5.0), 100.0, 'Synthetic 99.1 + 5.0 must clamp to 100.0%');
    assert.strictEqual(BoundedEconomics.percentage(-10.5), 0.0, 'Negative percentage must clamp to 0.0%');
    assert.strictEqual(BoundedEconomics.percentage(NaN), 0.0, 'NaN must evaluate to 0.0%');
    assert.strictEqual(BoundedEconomics.percentage(Infinity), 0.0, 'Infinity must evaluate to 0.0%');
    assert.strictEqual(BoundedEconomics.percentage(80.34), 80.3, 'Percentage rounds to 1 decimal place');

    // Reduction percentage domain [0, 100]
    assert.strictEqual(BoundedEconomics.reductionPercentage(11512, 101), 99.1, 'Synthetic reduction must be exactly 99.1%');
    assert.strictEqual(BoundedEconomics.reductionPercentage(100, 150), 0.0, 'Cost increases cannot yield negative reduction');
    assert.strictEqual(BoundedEconomics.reductionPercentage(0, 100), 0.0, 'Zero baseline returns 0.0%');
    assert.strictEqual(BoundedEconomics.reductionPercentage(-100, 50), 0.0, 'Negative baseline returns 0.0%');
    assert.strictEqual(BoundedEconomics.reductionPercentage(100, -50), 100.0, 'Negative optimized clamped cleanly');

    // Monotonic dollar savings
    assert.strictEqual(BoundedEconomics.savingsUSD(0.05, 0.01), 0.04, 'Projected savings must be positive');
    assert.strictEqual(BoundedEconomics.savingsUSD(0.01, 0.05), 0.0, 'Savings cannot be negative');
    assert.strictEqual(BoundedEconomics.savingsUSD(NaN, 0.05), 0.0, 'Invalid dollars return 0');

    // Domain validator
    assert.strictEqual(BoundedEconomics.isValidPercentage(80.3), true);
    assert.strictEqual(BoundedEconomics.isValidPercentage(0), true);
    assert.strictEqual(BoundedEconomics.isValidPercentage(100), true);
    assert.strictEqual(BoundedEconomics.isValidPercentage(104.1), false);
    assert.strictEqual(BoundedEconomics.isValidPercentage(-0.1), false);
    assert.strictEqual(BoundedEconomics.isValidPercentage(null), false);

    console.log('Phase 11 reachability truth, capability snapshot, receipt trail, and bounded economics contracts passed.');
}
