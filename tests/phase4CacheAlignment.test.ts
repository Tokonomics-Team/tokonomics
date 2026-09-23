import * as assert from 'assert';
import { CacheAlignerEngine, CacheAmortizationGuard } from '../src/cache/aligner';
import { MessagePayload } from '../src/types';
import { TokenCounter } from '../src/engine/tokenizer';

export async function runPhase4CacheAlignmentTests(): Promise<void> {
    console.log('\n--- Running Phase 4: Provider Cache Alignment & Tool Schema Deduplication Tests ---');
    const aligner = new CacheAlignerEngine();

    const mockToolSchemas = [
        {
            name: 'fetch_repository_file',
            description: 'Fetches raw content of a source code file given its absolute workspace path',
            parameters: {
                type: 'object',
                properties: {
                    filePath: { type: 'string', description: 'Absolute file path' },
                    startLine: { type: 'number', description: '1-indexed starting line' },
                    endLine: { type: 'number', description: '1-indexed ending line' }
                },
                required: ['filePath']
            }
        },
        {
            name: 'search_symbols_and_references',
            description: 'Executes indexed AST search for symbol definitions and cross-file references',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Symbol or function name' },
                    maxResults: { type: 'number', description: 'Maximum items to return' }
                },
                required: ['query']
            }
        }
    ];

    // 1. Test Native Tool Schema Deduplication
    {
        console.log('Testing Native Tool Schema Deduplication...');
        const systemPrompt = 'You are a staff software engineer assistant.';
        const history: MessagePayload[] = [];
        const query = 'Refactor the authentication handler.';

        // Case A: Native tool calling active -> suppress text injection in system prompt
        const resWithNative = aligner.alignPayload(
            systemPrompt,
            '',
            history,
            query,
            { targetProvider: 'anthropic', hasNativeTools: true },
            mockToolSchemas
        );

        assert.strictEqual(resWithNative.toolSchemaDeduplicated, true, 'toolSchemaDeduplicated should be true when native tools active');
        assert.ok(resWithNative.toolSchemaTokensSaved >= 50, 'Tokens saved should be positive');
        assert.ok(!resWithNative.alignedMessages[0].content.includes('=== TOOL DEFINITIONS ==='), 'System prompt must not contain text schema when native tools active');

        // Case B: Runtime without native tool calling -> serialize as text
        const resWithoutNative = aligner.alignPayload(
            systemPrompt,
            '',
            history,
            query,
            { targetProvider: 'anthropic', hasNativeTools: false },
            mockToolSchemas
        );

        assert.strictEqual(resWithoutNative.toolSchemaDeduplicated, false, 'toolSchemaDeduplicated should be false when native tools inactive');
        assert.strictEqual(resWithoutNative.toolSchemaTokensSaved, 0, 'Tokens saved should be 0');
        assert.ok(resWithoutNative.alignedMessages[0].content.includes('=== TOOL DEFINITIONS ==='), 'System prompt must contain text schema when native tools inactive');
        console.log(`✓ Native Tool Schema Deduplication verified (saved ${resWithNative.toolSchemaTokensSaved} tokens).`);
    }

    // 2. Test Anthropic Cache-Write Amortization Guard
    {
        console.log('Testing Anthropic Cache-Write Amortization Guard...');
        // Create 1,100 tokens of system prompt
        const largeSystemPrompt = 'Instruction Directive:\n' + 'Always adhere to enterprise safety constraints and maintain test coverage.\n'.repeat(120);
        const query = 'How do I run tests?';

        // Case A: Single-turn request with dynamic/ephemeral prefix -> suppress write surcharge (avoid 25% penalty)
        const singleTurnRes = aligner.alignPayload(
            largeSystemPrompt,
            '',
            [],
            query,
            {
                targetProvider: 'anthropic',
                sessionTurns: 0,
                isPersistentSession: false,
                hasInvariantTypes: false
            }
        );

        assert.strictEqual(singleTurnRes.isCacheEligible, true, 'Token count exceeds 1024');
        assert.strictEqual(singleTurnRes.cacheWriteSuppressed, true, 'Cache write should be suppressed on ephemeral single-turn');
        assert.strictEqual(singleTurnRes.alignedMessages[0].cacheControl, undefined, 'cacheControl must be undefined when suppressed');

        // Case B: Multi-turn request -> add cache breakpoint (guarantees >= 65% net savings)
        const multiTurnHistory: MessagePayload[] = [
            { role: 'user', content: 'Turn 1 user request' },
            { role: 'assistant', content: 'Turn 1 assistant response' }
        ];

        const multiTurnRes = aligner.alignPayload(
            largeSystemPrompt,
            '',
            multiTurnHistory,
            query,
            {
                targetProvider: 'anthropic',
                sessionTurns: 1,
                isPersistentSession: false
            }
        );

        assert.strictEqual(multiTurnRes.cacheWriteSuppressed, false, 'Cache write should not be suppressed on multi-turn');
        assert.strictEqual(multiTurnRes.alignedMessages[0].cacheControl?.type, 'ephemeral', 'cacheControl must be set on multi-turn');

        // Case C: Persistent session or invariant types present -> always cache
        const persistentRes = aligner.alignPayload(
            largeSystemPrompt,
            'export interface User { id: string; }',
            [],
            query,
            {
                targetProvider: 'anthropic',
                isPersistentSession: true
            }
        );

        assert.strictEqual(persistentRes.alignedMessages[0].cacheControl?.type, 'ephemeral', 'Persistent session must have cacheControl');
        console.log('✓ Anthropic Cache-Write Amortization Guard correctly prevents negative ROI.');
    }

    // 3. Test KV-Cache 1,024-Token Boundary Packing
    {
        console.log('Testing KV-Cache 1,024-Token Boundary Packing...');
        // Test 3: Provider Cache Capabilities & Zero Synthetic Padding (Claude 3.7 Sonnet 512-token threshold)
        console.log('Testing Provider Cache Capabilities & Zero Synthetic Padding...');
        
        // Claude 3.7 Sonnet supports 512-token cache threshold
        let prompt600Tokens = 'System directive:\n';
        while (TokenCounter.countTokens(prompt600Tokens) < 600) {
            prompt600Tokens += 'Maintain high software engineering standards and security. ';
        }
        const tokens600 = TokenCounter.countTokens(prompt600Tokens);
        assert.ok(tokens600 >= 512 && tokens600 < 800, `Tokens must be >= 512 and < 800 (was ${tokens600})`);

        const sonnetRes = aligner.alignPayload(
            prompt600Tokens,
            '',
            [],
            'Run audit',
            {
                targetProvider: 'anthropic',
                modelId: 'claude-3-7-sonnet',
                isPersistentSession: true
            }
        );

        // Assert zero synthetic comment padding was added
        assert.strictEqual(sonnetRes.boundaryPadded, false, 'boundaryPadded must be false (no synthetic comments injected)');
        assert.strictEqual(sonnetRes.paddingTokensAdded, 0, 'paddingTokensAdded must be 0');
        assert.strictEqual(sonnetRes.providerCapability?.minCacheableTokens, 512, 'Claude 3.7 Sonnet must have 512 minCacheableTokens');
        assert.strictEqual(sonnetRes.isCacheEligible, true, '600-token prompt must qualify for Claude 3.7 cache eligibility at 512 threshold');
        assert.strictEqual(sonnetRes.alignedMessages[0].cacheControl?.type, 'ephemeral', 'Cache control must be active on useful prompt prefix');

        // Test sub-512 prompt with useful context reorganization
        let sub512Prompt = 'System directive:\n';
        while (TokenCounter.countTokens(sub512Prompt) < 450) {
            sub512Prompt += 'Maintain high software engineering standards. ';
        }
        const sub512Tokens = TokenCounter.countTokens(sub512Prompt);
        assert.ok(sub512Tokens < 512, `Sub-512 tokens must be < 512 (was ${sub512Tokens})`);

        let projectMemory = 'Invariant architectural rules:\n';
        while (TokenCounter.countTokens(projectMemory) < 100) {
            projectMemory += 'All worker offloading must prove exact mathematical equivalence. ';
        }

        const sub512Res = aligner.alignPayload(
            sub512Prompt,
            '',
            [],
            'Run audit',
            {
                targetProvider: 'anthropic',
                modelId: 'claude-3-7-sonnet',
                isPersistentSession: true,
                stableProjectMemory: projectMemory
            }
        );

        assert.strictEqual(sub512Res.boundaryPadded, false, 'Zero synthetic comment padding');
        assert.strictEqual(sub512Res.paddingTokensAdded, 0);
        assert.strictEqual(sub512Res.usefulContextReorganized, true, 'Useful stable project memory must be reorganized across boundary');
        assert.ok(sub512Res.staticPrefixTokens >= 512, 'Reorganized useful context must reach or cross 512 threshold');
        assert.strictEqual(sub512Res.isCacheEligible, true, 'Reorganized prefix must be cache eligible');

        console.log(`✓ ProviderCacheCapability verified: Claude 3.7 Sonnet (512-token threshold) with zero synthetic padding.`);
    }

    // 4. Test Multi-Provider Alignment (OpenAI & DeepSeek Implicit Caching)
    {
        console.log('Testing Multi-Provider Alignment (OpenAI & DeepSeek)...');
        const systemPrompt = 'Directives:\n' + 'System rules and standards.\n'.repeat(120);

        const openaiRes = aligner.alignPayload(
            systemPrompt,
            '',
            [],
            'Query',
            { targetProvider: 'openai' }
        );

        assert.strictEqual(openaiRes.provider, 'openai');
        assert.ok(openaiRes.cachedBlocksCount >= 1, 'OpenAI cached block count should be >= 1');
        assert.strictEqual(openaiRes.alignedMessages[0].cacheControl, undefined, 'OpenAI does not use explicit ephemeral headers');

        const deepseekRes = aligner.alignPayload(
            systemPrompt,
            '',
            [],
            'Query',
            { targetProvider: 'deepseek' }
        );

        assert.strictEqual(deepseekRes.provider, 'deepseek');
        assert.ok(deepseekRes.cachedBlocksCount >= 1, 'DeepSeek cached block count should be >= 1');
        console.log('✓ Multi-provider alignment (OpenAI/DeepSeek) verified.');
    }

    // 5. Test Backward Compatibility with Unparameterized Calls
    {
        console.log('Testing backward compatibility with default options...');
        const legacyRes = aligner.alignPayload(
            'System text',
            'AST text',
            [],
            'User query'
        );

        assert.strictEqual(legacyRes.alignedMessages.length, 2);
        assert.strictEqual(legacyRes.provider, 'anthropic');
        assert.strictEqual(typeof legacyRes.totalTokens, 'number');
        console.log('✓ Backward compatibility with default invocations preserved.');
    }

    console.log('🎉 ALL PHASE 4 CACHE ALIGNMENT & DEDUPLICATION TESTS PASSED\n');
}

if (require.main === module) {
    runPhase4CacheAlignmentTests().catch(err => {
        console.error('Phase 4 test failed:', err);
        process.exit(1);
    });
}
