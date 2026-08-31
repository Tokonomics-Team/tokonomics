import * as assert from 'assert';
import { RuleBasedCompressor } from '../../src/compression/compressionProvider';
import { PreservationGate } from '../../src/evaluation/preservationGate';

export async function runPhase16And17CompressionValidatorValidation(): Promise<boolean> {
    console.log('--- Phase 16 & 17: Semantic Compression & Safety Validation ---');

    const compressor = new RuleBasedCompressor();
    const rawProse = "In order to initialize the system, the developer must first configure the database.";
    const compressed = await compressor.compress(rawProse);

    assert.ok(compressed.compressedText.length <= rawProse.length, 'Compression must reduce or maintain character length');

    // PreservationGate: Inject intentionally corrupted context (missing active request)
    const origMessages = [
        { role: 'user', content: 'Debug TypeError: Cannot read property of undefined in AuthController.ts' }
    ];
    const corruptedMessages = [
        { role: 'user', content: 'Hello world' }
    ];

    const gateCheck = PreservationGate.evaluate(origMessages, corruptedMessages, 'debug');
    assert.strictEqual(gateCheck.passed, false, 'Preservation gate must REJECT corrupted context with missing error literal');
    assert.ok(gateCheck.missingItems.length > 0, 'Gate must report missing error literals');

    console.log('  ✓ Semantic compression and corrupt-context rejection gate verified.');
    return true;
}
