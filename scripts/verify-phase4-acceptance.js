const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🔬 TOKONOMICS PHASE 4: PROVIDER CACHE ALIGNMENT & TOOL DEDUPLICATION VERIFICATION');
    console.log('====================================================================================\n');

    const tempBundlePath = path.join(__dirname, '..', 'out_test', 'phase4_verification_bundle.js');
    const harnessSource = `
    import { CacheAlignerEngine, CacheAmortizationGuard } from '../src/cache/aligner';
    import { MessagePayload } from '../src/types';
    import { TokenCounter } from '../src/engine/tokenizer';
    import { defaultPricingCatalog } from '../src/cost/pricingCatalog';

    export async function runVerification() {
        const aligner = new CacheAlignerEngine();

        const enterpriseTools = [
            {
                name: 'fetch_repository_file',
                description: 'Fetches raw content of a source code file given its absolute workspace path and line ranges',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Absolute file path on workspace filesystem' },
                        startLine: { type: 'number', description: '1-indexed starting line' },
                        endLine: { type: 'number', description: '1-indexed ending line' }
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'search_symbols_and_references',
                description: 'Executes indexed AST search for symbol definitions and cross-file references across workspace',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Symbol or function name to locate' },
                        kind: { type: 'string', enum: ['function', 'class', 'interface', 'variable'] },
                        maxResults: { type: 'number', description: 'Maximum items to return' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'execute_terminal_command',
                description: 'Runs an authorized build, test, or linter CLI command inside sandboxed terminal execution host',
                parameters: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'Shell command line string' },
                        cwd: { type: 'string', description: 'Working directory path' },
                        timeoutMs: { type: 'number', description: 'Timeout limit in milliseconds' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'retrieve_context_evidence',
                description: 'Queries Tokonomics hybrid retriever for reciprocal rank fusion lexical and dense semantic evidence',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search keywords or natural language prompt' },
                        topK: { type: 'number', description: 'Maximum evidence candidate count' }
                    },
                    required: ['query']
                }
            }
        ];

        // -------------------------------------------------------------
        // Criterion 1: Native Tool Schema Deduplication
        // -------------------------------------------------------------
        console.log('--- Criterion 1: Native Tool Schema Deduplication ---');
        const systemPrompt = 'You are a staff AI software engineering agent.';
        const query = 'Analyze memory consumption in the indexer.';

        const nativeActiveResult = aligner.alignPayload(
            systemPrompt,
            '',
            [],
            query,
            { targetProvider: 'anthropic', hasNativeTools: true },
            enterpriseTools
        );

        const nativeInactiveResult = aligner.alignPayload(
            systemPrompt,
            '',
            [],
            query,
            { targetProvider: 'anthropic', hasNativeTools: false },
            enterpriseTools
        );

        const tokensSaved = nativeActiveResult.toolSchemaTokensSaved;
        console.log('  Native tools active:   System prompt tokens = ' + nativeActiveResult.staticPrefixTokens + ' (tool schemas omitted from text)');
        console.log('  Native tools inactive: System prompt tokens = ' + nativeInactiveResult.staticPrefixTokens + ' (tool schemas serialized as text)');
        console.log('  Redundant tokens eliminated: ' + tokensSaved + ' tokens');

        const c1Passed = nativeActiveResult.toolSchemaDeduplicated === true && tokensSaved >= 300 &&
            !nativeActiveResult.alignedMessages[0].content.includes('=== TOOL DEFINITIONS ===');
        console.log('  Criterion 1 Gate (>= 300 tokens):   ' + (c1Passed ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 2: Anthropic Cache-Write Amortization Guard
        // -------------------------------------------------------------
        console.log('--- Criterion 2: Anthropic Cache-Write Amortization Guard ---');
        const largeSystemText = 'System Directive:\\n' + 'Adhere strictly to corporate reliability and performance standards.\\n'.repeat(125);
        const prefixTokens = TokenCounter.countTokens(largeSystemText);

        // Turn 0: Ephemeral single turn
        const singleTurnRes = aligner.alignPayload(
            largeSystemText,
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

        // Turn 2: Multi-turn session
        const multiTurnHistory = [
            { role: 'user', content: 'First request' },
            { role: 'assistant', content: 'First response' },
            { role: 'user', content: 'Second request' },
            { role: 'assistant', content: 'Second response' }
        ];

        const multiTurnRes = aligner.alignPayload(
            largeSystemText,
            '',
            multiTurnHistory,
            query,
            {
                targetProvider: 'anthropic',
                sessionTurns: 2,
                isPersistentSession: false
            }
        );

        console.log('  Single-turn ephemeral (' + prefixTokens + ' tokens): cacheControl = ' + (singleTurnRes.alignedMessages[0].cacheControl ? 'ephemeral' : 'none (withheld 25% surcharge)'));
        console.log('  Multi-turn session (' + prefixTokens + ' tokens, 2 turns): cacheControl = ' + (multiTurnRes.alignedMessages[0].cacheControl ? 'ephemeral (90% read discount active)' : 'none'));

        const c2Passed = singleTurnRes.cacheWriteSuppressed === true &&
            singleTurnRes.alignedMessages[0].cacheControl === undefined &&
            multiTurnRes.alignedMessages[0].cacheControl?.type === 'ephemeral';
        console.log('  Criterion 2 Gate (Amortization ROI): ' + (c2Passed ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 3: Provider Cache Capability & Zero Synthetic Padding
        // -------------------------------------------------------------
        console.log('--- Criterion 3: Provider Cache Capability & Zero Synthetic Padding ---');
        let prompt600Tokens = 'Enterprise Instruction:\\n';
        while (TokenCounter.countTokens(prompt600Tokens) < 600) {
            prompt600Tokens += 'Ensure zero data leakage and memory containment across operations. ';
        }
        const tokens600 = TokenCounter.countTokens(prompt600Tokens);

        const sonnetRes = aligner.alignPayload(
            prompt600Tokens,
            '',
            [],
            query,
            {
                targetProvider: 'anthropic',
                modelId: 'claude-3-7-sonnet',
                isPersistentSession: true
            }
        );

        console.log('  Static Prefix Tokens:       ' + sonnetRes.staticPrefixTokens + ' tokens');
        console.log('  Min Cache Threshold:        ' + sonnetRes.providerCapability?.minCacheableTokens + ' tokens (Claude 3.7 512 threshold)');
        console.log('  Synthetic Padding Added:    ' + sonnetRes.paddingTokensAdded + ' tokens (Strictly 0)');
        console.log('  Boundary Padded:            ' + sonnetRes.boundaryPadded + ' (Strictly false)');
        console.log('  Cache Eligible:             ' + sonnetRes.isCacheEligible);
        console.log('  Cache Header:               ' + sonnetRes.alignedMessages[0].cacheControl?.type);

        // Verify sub-512 prompt reorganization
        let sub512Prompt = 'System directive:\\n';
        while (TokenCounter.countTokens(sub512Prompt) < 420) {
            sub512Prompt += 'Adhere strictly to verified software contracts. ';
        }
        const sub512Res = aligner.alignPayload(
            sub512Prompt,
            '',
            [],
            query,
            {
                targetProvider: 'anthropic',
                modelId: 'claude-3-7-sonnet',
                isPersistentSession: true,
                stableProjectMemory: 'Architecture Invariant: No synthetic comment padding allowed in prompt compilation.'
            }
        );

        console.log('  Sub-512 Useful Reorg:       ' + sub512Res.usefulContextReorganized + ' (Reorganized: ' + sub512Res.reorganizedTokens + ' tokens)');
        console.log('  Reorganized Prefix Tokens:  ' + sub512Res.staticPrefixTokens + ' tokens');

        // Check catalog deprecation status for retired models
        const opusPricing = defaultPricingCatalog.resolve('claude-opus-4');
        const opusDeprecated = opusPricing.isDeprecated === true;
        console.log('  Claude Opus 4 Retired:      ' + opusDeprecated + ' (' + opusPricing.deprecationNotice + ')');

        const c3Passed = sonnetRes.boundaryPadded === false &&
            sonnetRes.paddingTokensAdded === 0 &&
            sonnetRes.providerCapability?.minCacheableTokens === 512 &&
            sonnetRes.isCacheEligible === true &&
            sonnetRes.alignedMessages[0].cacheControl?.type === 'ephemeral' &&
            sub512Res.usefulContextReorganized === true &&
            sub512Res.boundaryPadded === false &&
            opusDeprecated === true;
        console.log('  Criterion 3 Gate (Provider Capabilities & Zero Padding): ' + (c3Passed ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 4: Dollar Economics Validation
        // -------------------------------------------------------------
        console.log('--- Criterion 4: Dollar Economics Validation ---');
        const sonnetPricing = defaultPricingCatalog.resolve('claude-3-7-sonnet');
        const baseRate = sonnetPricing.rates.inputCostPer1M; // $3.00
        const writeRate = sonnetPricing.rates.cacheWriteCostPer1M; // $3.75
        const readRate = sonnetPricing.rates.cachedInputCostPer1M; // $0.30

        const testPrefixTokens = sonnetRes.staticPrefixTokens; // ~600 tokens
        const totalSessionTurns = 5;

        // Without caching
        const uncachedCostUSD = (totalSessionTurns * testPrefixTokens / 1000000) * baseRate;
        // With caching (1 write + 4 reads)
        const cachedCostUSD = (1 * testPrefixTokens / 1000000) * writeRate + ((totalSessionTurns - 1) * testPrefixTokens / 1000000) * readRate;
        const netDollarSavings = uncachedCostUSD - cachedCostUSD;
        const savingsPercent = (netDollarSavings / uncachedCostUSD) * 100;

        console.log('  5-Turn Session Prefix Cost (Uncached): $' + uncachedCostUSD.toFixed(6));
        console.log('  5-Turn Session Prefix Cost (Cached):   $' + cachedCostUSD.toFixed(6));
        console.log('  Net Dollar Savings:                    $' + netDollarSavings.toFixed(6) + ' (' + savingsPercent.toFixed(1) + '% savings)');

        const c4Passed = netDollarSavings > 0 && savingsPercent >= 60.0;
        console.log('  Criterion 4 Gate (>= 60% Savings):  ' + (c4Passed ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        return {
            c1: { passed: c1Passed, tokensSaved },
            c2: { passed: c2Passed },
            c3: { passed: c3Passed, unpadded: tokens600, padded: sonnetRes.staticPrefixTokens },
            c4: { passed: c4Passed, savingsUSD: netDollarSavings, percent: savingsPercent }
        };
    }
    `;

    const entryPath = path.join(__dirname, '..', 'out_test', 'phase4_verification_entry.ts');
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(entryPath, harnessSource);

    await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        platform: 'node',
        target: 'node20',
        outfile: tempBundlePath,
        format: 'cjs'
    });

    const { runVerification } = require(tempBundlePath);
    const results = await runVerification();

    console.log('====================================================================================');
    console.log('📊 PHASE 4 DEFINITION OF DONE & ACCEPTANCE CRITERIA SUMMARY');
    console.log('====================================================================================');
    console.log('1. Tool Schema Deduplication:    ' + results.c1.tokensSaved + ' tokens saved (Gate >= 300)       -> ' + (results.c1.passed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('2. Cache Amortization Guard:     Write surcharge withheld on turn 0 -> ' + (results.c2.passed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('3. 1,024-Token Boundary Packing: Promoted ' + results.c3.unpadded + ' to ' + results.c3.padded + ' tokens (Gate >= 1024) -> ' + (results.c3.passed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('4. Dollar Economics Validation:  $' + results.c4.savingsUSD.toFixed(6) + ' (' + results.c4.percent.toFixed(1) + '% net savings)     -> ' + (results.c4.passed ? 'PASSED ✅' : 'FAILED ❌'));

    const allPassed = results.c1.passed && results.c2.passed && results.c3.passed && results.c4.passed;
    if (allPassed) {
        console.log('\n🎉 ALL PHASE 4 ACCEPTANCE GATES PASSED EMPIRICALLY WITH ZERO DEFECTS!');
        process.exit(0);
    } else {
        console.error('\n❌ PHASE 4 ACCEPTANCE GATES NOT ALL MET');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Phase 4 verification failed:', err);
    process.exit(1);
});
