import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { OPTIMIZATION_PROFILES } from '../src/config/userPreferences';
import { ComponentRegistry } from '../src/engine/componentRegistry';
import { DeterministicLocalEmbeddingProvider } from '../src/search/embeddingProvider';
import { DeterministicLocalCrossEncoder } from '../src/search/reranker';

export async function runV7Phase8ProductionRetrievalTests(): Promise<boolean> {
    console.log('\n--- Running v7.0.1 Phase 8 production retrieval tests ---');
    assert.strictEqual(OPTIMIZATION_PROFILES.balanced.featureFlags.enableDenseEmbeddings, false);
    assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableDenseEmbeddings, true);
    assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableCrossEncoder, true);
    assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableMmrDiversity, true);
    assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableSemanticDedup, true);
    // The default provider must never describe itself as a learned model. It is a hashed
    // projection: lexical features plus structural shape descriptors and corpus-weighted
    // tokens. The label is the honesty contract for the retrieval receipts.
    const defaultEmbedder = new DeterministicLocalEmbeddingProvider();
    assert.strictEqual(defaultEmbedder.metadata.representation, 'hashed_structural_projection');
    assert.notStrictEqual(defaultEmbedder.metadata.representation, 'learned_dense_model');
    assert.ok(defaultEmbedder.metadata.isLocal && defaultEmbedder.metadata.privacyDeclaration === 'zero_egress_local_only');
    assert.strictEqual(new DeterministicLocalCrossEncoder().metadata.scoringMode, 'lexical_interaction');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-v7-p8-'));
    try {
        fs.writeFileSync(path.join(root, 'auth.ts'), 'export class AuthService { validateSession() { return true; } }\n');
        fs.writeFileSync(path.join(root, 'controller.ts'), 'export function login() { return new AuthService().validateSession(); }\n');
        const index = new VersionedWorkspaceIndex([root]);
        const snapshot = await index.initialize();
        FeatureFlagRegistry.resetToDefault();
        for (const key of ['enableDenseEmbeddings', 'enableCrossEncoder', 'enableMmrDiversity', 'enableSemanticDedup'] as const) {
            FeatureFlagRegistry.setFlag(key, true);
        }
        const orchestrator = new PipelineOrchestrator();
        const result = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService validateSession login flow' }],
            workspaceSnapshot: snapshot, activeFilePath: path.join(root, 'auth.ts'), cursorLine: 1,
            allowWorkspaceRetrieval: true,
            evidenceSignals: [
                { source: 'lsp', content: 'export class AuthService { validateSession() { return true; } }', version: snapshot.generation },
                { source: 'dense', content: 'export class AuthService { validateSession() { return true; } }', version: snapshot.generation }
            ]
        });
        const vectors = (orchestrator as any).persistentHybrid.getVectorIndex().size();
        assert.ok(vectors > 0, 'Production dense mode must populate its vector index');
        assert.ok(result.evidenceRetrieval?.stagesExecuted.includes('lexical_interaction_rerank'));
        assert.ok(result.evidenceRetrieval?.stagesExecuted.includes('mmr_diversity'));
        assert.ok(result.evidenceRetrieval?.stagesExecuted.includes('provenance_aware_dedup'));
        assert.ok(result.evidenceRetrieval?.selected.every(candidate => candidate.provenance.length > 0));
        for (const id of ['dense_retrieval', 'cross_encoder', 'standalone_mmr', 'semantic_dedup'] as const) {
            assert.strictEqual(ComponentRegistry.definition(id).integrationState, 'conditional');
            const terminal = result.receipts?.find(receipt => receipt.componentId === id &&
                ['contributed', 'fallback'].includes(receipt.outcome));
            assert.ok(terminal, `${id} must have a truthful terminal outcome`);
            assert.notStrictEqual(terminal?.reason, 'shadow_result_discarded');
        }
        index.dispose();
    } finally {
        FeatureFlagRegistry.resetToDefault();
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log('Populated vectors, bounded applied reranking/MMR/dedup, provenance, and honest modes passed.');
    return true;
}
