/**
 * Phase 10 Unit Tests: Pluggable Semantic Compression Providers & ONNX Host
 */

import {
    NoOpCompressor,
    RuleBasedCompressor,
    LLMLingua2Compressor,
    LocalSLMCompressor,
    LegacyRegexCompressor,
    CompressionProviderFactory
} from '../src/compression/compressionProvider';
import { OnnxMemoryBoundedHost } from '../src/compression/onnxHost';

export async function runCompressionProvidersTests(): Promise<boolean> {
    console.log('\n--- Running Phase 10 Pluggable Compression & ONNX Host Tests ---');

    const sampleCode = `
/**
 * Processes authentication token requests.
 * @param username user identifier
 * @param pass secret password
 */
export class AuthHandler {
    // Single line debug comment to remove
    public async handleLogin(username: string, pass: string): Promise<boolean> {
        // internal check
        return true;
    }
}
`;

    // 1. Test NoOpCompressor
    const noop = new NoOpCompressor();
    const noopRes = await noop.compress(sampleCode);
    if (noopRes.tokensSaved !== 0 || noopRes.compressedText !== sampleCode) {
        throw new Error(`NoOpCompressor must preserve code verbatim (Saved: ${noopRes.tokensSaved})`);
    }
    console.log(`[NoOp Compressor] Tokens: ${noopRes.compressedTokens} (Preserved verbatim 100%)`);
    console.log('✓ NoOpCompressor verified.');

    // 2. Test RuleBasedCompressor
    const rule = new RuleBasedCompressor();
    const ruleRes = await rule.compress(sampleCode);
    if (ruleRes.tokensSaved <= 0 || ruleRes.compressedText.includes('// Single line debug comment')) {
        throw new Error(`RuleBasedCompressor failed to compact comments (Got: ${ruleRes.compressedText})`);
    }
    console.log(`[Rule Compressor] Original: ${ruleRes.originalTokens} ➔ Compressed: ${ruleRes.compressedTokens} (Saved: ${ruleRes.tokensSaved} tokens)`);
    console.log('✓ RuleBasedCompressor verified.');

    // 3. Test LLMLingua-2 with Fallback
    const lingua = new LLMLingua2Compressor(false);
    const linguaRes = await lingua.compress(sampleCode);
    if (!linguaRes.providerUsed.includes('fallback: rule') || linguaRes.tokensSaved <= 0) {
        throw new Error(`LLMLingua-2 fallback cascade failed (Got: ${linguaRes.providerUsed})`);
    }
    console.log(`[LLMLingua-2] Fallback Cascade: ${linguaRes.providerUsed} (Saved: ${linguaRes.tokensSaved} tokens)`);
    console.log('✓ LLMLingua2Compressor fallback verified.');

    // 4. Test LocalSLM with Fallback
    const slm = new LocalSLMCompressor(false);
    const slmRes = await slm.compress(sampleCode);
    if (!slmRes.providerUsed.includes('fallback: rule')) {
        throw new Error(`LocalSLM fallback cascade failed (Got: ${slmRes.providerUsed})`);
    }
    console.log('✓ LocalSLMCompressor fallback verified.');

    // 5. Test LegacyRegexCompressor & Factory
    const legacy = CompressionProviderFactory.createProvider('legacy');
    const legacyRes = await legacy.compress(sampleCode);
    if (legacyRes.tokensSaved <= 0) {
        throw new Error(`LegacyRegexCompressor failed to compress`);
    }
    console.log('✓ LegacyRegexCompressor & Factory verified.');

    // 6. Test OnnxMemoryBoundedHost
    const host = new OnnxMemoryBoundedHost({ maxMemoryMB: 100 });
    const modelSize30MB = 30 * 1024 * 1024;
    const modelSize80MB = 80 * 1024 * 1024;

    const alloc1 = host.registerSession('embed_model', modelSize30MB);
    const alloc2 = host.registerSession('slm_model', modelSize80MB); // 30 + 80 = 110MB > 100MB -> Reject

    if (!alloc1 || alloc2) {
        throw new Error('OnnxMemoryBoundedHost failed to enforce 100MB memory ceiling');
    }

    const stats = host.getMemoryStats();
    console.log(`[ONNX Host] Memory: ${stats.usedMB} MB / ${stats.maxMB} MB (${stats.percentage}%) | Active Models: ${stats.activeModels}`);

    host.unloadSession('embed_model', modelSize30MB);
    if (host.getMemoryStats().usedMB !== 0) {
        throw new Error('OnnxMemoryBoundedHost failed to reclaim unloaded session memory');
    }
    console.log('✓ OnnxMemoryBoundedHost memory envelope & reclamation verified.');

    return true;
}
