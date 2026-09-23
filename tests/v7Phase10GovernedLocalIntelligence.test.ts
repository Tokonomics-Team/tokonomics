import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { ProjectMemoryEngine } from '../src/memory/projectMemory';
import { LocalModelManager, SignedLocalModelManifest } from '../src/engine/localModelManager';
import { ComponentRegistry } from '../src/engine/componentRegistry';
import { DEFAULT_FEATURE_FLAGS, FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';

export async function runV7Phase10GovernedLocalIntelligenceTests(): Promise<void> {
    console.log('\n--- Running v7.0.1 Phase 10 governed local-intelligence tests ---');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-v7-p10-'));
    try {
        assert.strictEqual(DEFAULT_FEATURE_FLAGS.enableProjectMemory, false);
        assert.strictEqual(DEFAULT_FEATURE_FLAGS.enableLocalSlm, false);
        assert.strictEqual(ComponentRegistry.definition('project_memory').integrationState, 'conditional');
        assert.strictEqual(ComponentRegistry.definition('local_slm').integrationState, 'shadow_only');

        const memoryDir = path.join(tempDir, 'memory');
        const engine = new ProjectMemoryEngine({ storageDir: memoryDir,
            encryptionKeyProvider: { getKey: () => Buffer.alloc(32, 7) }, keyVersion: 3, maxItemsPerWorkspace: 3 });
        const workspaceId = 'phase10_workspace';
        engine.setWorkspaceTrust(workspaceId, true);
        assert.throws(() => engine.addMemoryItem(workspaceId, { id: 'x', type: 'decision', title: 'Title', description: 'Description' }), /consent/i);
        engine.setWorkspaceConsent(workspaceId, true);
        const item = engine.addMemoryItem(workspaceId, { id: 'decision-1', type: 'decision', title: 'Use bounded queues',
            description: 'All request queues must declare a finite capacity.', reason: 'Prevents overload collapse',
            source: 'user_command', confidence: 0.95, expiresAt: Date.now() + 60_000 });
        assert.strictEqual(item.schemaVersion, 2);
        assert.strictEqual(item.revision, 1);
        assert.strictEqual(item.scope, 'workspace');
        assert.strictEqual(item.reason, 'Prevents overload collapse');
        assert.strictEqual(item.source, 'user_command');
        const encrypted = fs.readFileSync(path.join(memoryDir, `tokonomics_memory_${workspaceId}.enc`));
        assert.strictEqual(encrypted.subarray(0, 4).toString('ascii'), 'TKM2');
        assert.strictEqual(encrypted.readUInt32BE(4), 3);
        assert.ok(!encrypted.toString('utf8').includes('bounded queues'));
        const metadata = engine.exportMetadata(workspaceId);
        assert.ok(metadata.includes(item.contentHash));
        assert.ok(!metadata.includes(item.description));
        assert.strictEqual(engine.rebuildMemory(workspaceId), 1);
        assert.strictEqual(engine.deleteMemoryItem(workspaceId, item.id), true);
        assert.strictEqual(engine.inspectMemory(workspaceId).length, 0);

        const high = engine.addMemoryItem(workspaceId, { id: 'sensitive', type: 'constraint', title: 'Private constraint',
            description: 'Keep this internal business rule private.', sensitivity: 'high', reason: 'User classified', source: 'user_command' });
        assert.ok(high);
        assert.strictEqual(engine.retrieveCandidates('private constraint', workspaceId).length, 0, 'High-sensitivity memory cannot enter model candidates');
        engine.eraseWorkspaceMemory(workspaceId);

        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const modelDir = path.join(tempDir, 'models');
        const manager = new LocalModelManager(modelDir, new Map([['release-key', publicKey.export({ type: 'spki', format: 'pem' }).toString()]]), '8.0.0', 1024);
        const bytes = Buffer.from('non-empty-test-model-artifact');
        const unsigned: SignedLocalModelManifest = { modelId: 'fixture', version: '1.0.0', origin: 'user_installed',
            license: 'Apache-2.0', format: 'quantized_weights', sha256Hash: createHash('sha256').update(bytes).digest('hex'),
            expectedSizeBytes: bytes.byteLength, supportedTiers: ['wasm_simd', 'cpu_fallback'], signerKeyId: 'release-key',
            signatureBase64: '', minExtensionVersion: '7.0.0', maxRuntimeMemoryMB: 256 };
        const manifest = { ...unsigned, signatureBase64: sign(null, Buffer.from(manager.canonicalManifest(unsigned)), privateKey).toString('base64') };
        assert.throws(() => manager.install(manifest, bytes, { explicitApproval: false }), /approval/i);
        assert.throws(() => manager.install(manifest, Buffer.from('tampered'), { explicitApproval: true }), /size mismatch|hash mismatch/i);
        const installed = manager.install(manifest, bytes, { explicitApproval: true });
        assert.ok(fs.existsSync(installed.artifactPath));
        manager.delete(installed, true);
        assert.ok(!fs.existsSync(installed.artifactPath));

        const slmSource = fs.readFileSync(path.join(process.cwd(), 'src', 'engine', 'localSlmBrain.ts'), 'utf8');
        assert.ok(!slmSource.includes('mock_simulated'));
        assert.ok(!slmSource.includes('DEFAULT_BUILTIN_SLM_MANIFEST'));

        const contributing = new ProjectMemoryEngine();
        contributing.setWorkspaceTrust(workspaceId, true);
        contributing.setWorkspaceConsent(workspaceId, true);
        contributing.addMemoryItem(workspaceId, { id: 'memory-evidence', type: 'decision', title: 'Bound request queues',
            description: 'Request queues use finite capacity.', reason: 'Reliability decision', source: 'user_command' });
        const orchestrator = new PipelineOrchestrator();
        orchestrator.setProjectMemoryEngine(contributing);
        FeatureFlagRegistry.resetToDefault();
        FeatureFlagRegistry.setFlag('pipelineMode', 'compiler');
        FeatureFlagRegistry.setFlag('enableWorkspaceIndex', true);
        FeatureFlagRegistry.setFlag('enableProjectMemory', true);
        FeatureFlagRegistry.setCapabilityContext({ workspaceTrusted: true, experimentalConsent: true, disabledCapabilities: [] });
        const result = await orchestrator.compileContext({ messages: [{ role: 'user', content: 'Explain bounded request queues' }],
            allowWorkspaceRetrieval: true, workspaceSnapshot: { generation: 1, createdAt: Date.now(), roots: [],
                ignorePolicyVersion: 'test', files: new Map(), symbols: [], memoryBytes: 0,
                coverage: { rootsScanned: 0, candidatesExamined: 0, filesIndexed: 0, filesSkipped: 0, truncated: false, reason: 'empty' },
                identity: { workspaceId } } as any });
        assert.ok(result.receipts?.some(receipt => receipt.componentId === 'project_memory' && receipt.outcome === 'contributed'));
        assert.ok(result.evidenceRetrieval?.selected.some(candidate => candidate.sourceKind === 'memory'));
        console.log('Phase 10 consent, encryption rotation, lifecycle, candidate, and signed-artifact gates passed.');
    } finally {
        FeatureFlagRegistry.resetToDefault();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
