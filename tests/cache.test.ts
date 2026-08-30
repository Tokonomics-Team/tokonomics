import { CacheAlignerEngine } from '../src/cache/aligner';
import { TokenCounter } from '../src/engine/tokenizer';
import * as assert from 'assert';

export async function runCacheTests() {
    console.log('\n--- Running Cache Aligner Tests ---');
    const aligner = new CacheAlignerEngine();

    // Test 1: Anthropic Ephemeral Cache Header on 1024+ token prefix
    const largeSystemPrompt = 'You are an advanced enterprise AI assistant with comprehensive knowledge. '.repeat(80);
    const astContext = 'export interface ServiceConfig { port: number; host: string; } '.repeat(40);
    const history = [
        { role: 'user' as const, content: 'Can you help me configure the service?' },
        { role: 'assistant' as const, content: 'Certainly! Here is how you configure the service.' }
    ];
    const userQuery = 'How do I bind to 0.0.0.0?';

    const resultAnthropic = aligner.alignPayload(
        largeSystemPrompt,
        astContext,
        history,
        userQuery,
        { targetProvider: 'anthropic', minCachePrefixTokens: 1024 }
    );

    console.log(`[Cache Test Anthropic] Total tokens: ${resultAnthropic.totalTokens}, Static Prefix: ${resultAnthropic.staticPrefixTokens}, Cache Eligible: ${resultAnthropic.isCacheEligible}`);
    assert.ok(resultAnthropic.isCacheEligible, 'Should be eligible for Anthropic prompt caching');
    assert.strictEqual(resultAnthropic.alignedMessages[0].role, 'system');
    assert.deepStrictEqual(resultAnthropic.alignedMessages[0].cacheControl, { type: 'ephemeral' });
    assert.strictEqual(resultAnthropic.alignedMessages[resultAnthropic.alignedMessages.length - 1].role, 'user');
    assert.strictEqual(resultAnthropic.alignedMessages[resultAnthropic.alignedMessages.length - 1].content, userQuery);
    console.log('✓ Anthropic cache alignment & ephemeral header verified.');

    // Test 2: OpenAI Prefix Stabilization
    const resultOpenAI = aligner.alignPayload(
        largeSystemPrompt,
        astContext,
        history,
        userQuery,
        { targetProvider: 'openai', minCachePrefixTokens: 1024 }
    );

    console.log(`[Cache Test OpenAI] Total tokens: ${resultOpenAI.totalTokens}, Static Prefix: ${resultOpenAI.staticPrefixTokens}`);
    assert.strictEqual(resultOpenAI.alignedMessages[0].role, 'system');
    assert.ok(resultOpenAI.alignedMessages[0].content.includes('REPOSITORY INTERFACE SPECIFICATION'));
    // Query is strictly trailing
    assert.strictEqual(resultOpenAI.alignedMessages[resultOpenAI.alignedMessages.length - 1].content, userQuery);
    console.log('✓ OpenAI prefix stabilization verified.');
}
