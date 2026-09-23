import { createHash } from 'crypto';
import { LocalSlmBrain, ModelManifest } from '../src/engine/localSlmBrain';

/** Test-only deterministic adapter fixture. This is excluded from the production package. */
export function createLocalSlmTestFixture(): LocalSlmBrain {
    const bytes = Buffer.from('tokonomics-test-only-adapter-fixture');
    const manifest: ModelManifest = {
        modelId: 'test-only-adapter', version: '1.0.0', origin: 'local_bundled',
        license: 'Apache-2.0', format: 'quantized_weights',
        sha256Hash: createHash('sha256').update(bytes).digest('hex'), expectedSizeBytes: bytes.byteLength,
        supportedTiers: ['webgpu', 'wasm_simd', 'cpu_fallback']
    };
    const brain = new LocalSlmBrain();
    const result = brain.loadModel(manifest, bytes);
    if (!result.success) throw new Error(result.error);
    return brain;
}
