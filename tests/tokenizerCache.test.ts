/**
 * Phase 12 Unit Tests: Model Profiles, Tokenizers & Cache Alignment Planner
 */

import { ModelProfileRegistry, CLAUDE_SONNET_PROFILE, GPT_FLAGSHIP_PROFILE } from '../src/tokenizer/modelProfile';
import { TokenizerFactory } from '../src/tokenizer/tokenizerAdapter';
import { CachePlanner } from '../src/cache/cachePlanner';

export function runTokenizerCacheTests(): boolean {
    console.log('\n--- Running Phase 12 Model Profiles, Tokenizers & Cache Planner Tests ---');

    // 1. Test ModelProfileRegistry & Capability Matrix
    const claudeProfile = ModelProfileRegistry.getProfile('claude-3-5-sonnet');
    const gptProfile = ModelProfileRegistry.getProfile('gpt-4o');

    if (!claudeProfile.capabilities.promptCaching || claudeProfile.pricing.cachedInputCostPer1M !== 0.30) {
        throw new Error(`Claude profile capability/pricing error: ${JSON.stringify(claudeProfile)}`);
    }

    if (!gptProfile.capabilities.vision || gptProfile.contextWindow !== 128_000) {
        throw new Error(`GPT profile error: ${JSON.stringify(gptProfile)}`);
    }

    console.log(`[Model Profile] Claude 3.5 Sonnet: ${claudeProfile.contextWindow} tokens, Caching: ${claudeProfile.capabilities.promptCaching} ($${claudeProfile.pricing.cachedInputCostPer1M}/1M cached)`);
    console.log('✓ ModelProfileRegistry & Capability Matrix verified.');

    // 2. Test Tokenizer Adapters
    const openAiTok = TokenizerFactory.getTokenizer('openai');
    const anthropicTok = TokenizerFactory.getTokenizer('anthropic');
    const deepSeekTok = TokenizerFactory.getTokenizer('deepseek');
    const geminiTok = TokenizerFactory.getTokenizer('google');

    const sampleText = 'export class AuthService { public async login(u: string, p: string): Promise<Session> {} }';
    const c1 = openAiTok.countTokens(sampleText);
    const c2 = anthropicTok.countTokens(sampleText);
    const c3 = deepSeekTok.countTokens(sampleText);
    const c4 = geminiTok.countTokens(sampleText);

    if (c1 <= 0 || c2 <= 0 || c3 <= 0 || c4 <= 0) {
        throw new Error(`Tokenizer adapters returned invalid counts (${c1}, ${c2}, ${c3}, ${c4})`);
    }

    console.log(`[Tokenizer Adapters] Code Token Counts: OpenAI=${c1}, Claude=${c2}, DeepSeek=${c3}, Gemini=${c4}`);
    console.log('✓ TokenizerAdapter abstraction verified.');

    // 3. Test Cache Alignment Planner
    const planner = new CachePlanner();
    const largeStaticPrompt = 'You are an expert compiler engineer.\n'.repeat(150); // > 1024 tokens
    const query = 'How do I optimize backward slicing?';

    const plan = planner.planContext({
        systemPrompt: largeStaticPrompt,
        projectMemory: 'Decision: Use RS256 JWT',
        toolSchemas: '{"name": "lookupSymbol"}',
        userQuery: query,
        profile: CLAUDE_SONNET_PROFILE
    });

    if (!plan.isCacheEligible || plan.staticPrefixTokens < 1024) {
        throw new Error(`Cache planner failed to trigger cache eligibility (Prefix: ${plan.staticPrefixTokens})`);
    }

    if (plan.effectiveCostSavingsUSD !== 0 || plan.savingsPercentage !== 0 || !plan.cacheReadScenarioSavingsUSD || plan.cacheReadScenarioSavingsUSD <= 0) {
        throw new Error(`Cache eligibility was incorrectly counted as a verified saving`);
    }

    if (!plan.providerCacheHeader || plan.providerCacheHeader.cache_control.type !== 'ephemeral') {
        throw new Error(`Anthropic ephemeral cache header not generated`);
    }

    console.log(`[Cache Planner] Static Prefix: ${plan.staticPrefixTokens} tokens (Cache Eligible: ${plan.isCacheEligible})`);
    console.log(`[Cache Planner] Raw Cost: $${plan.unoptimizedCostUSD} ➔ Effective Cost: $${plan.effectiveCostUSD} (Saved ${plan.savingsPercentage}%)`);
    console.log('✓ CachePlanner prefix invariant & cost calculation verified.');

    return true;
}
