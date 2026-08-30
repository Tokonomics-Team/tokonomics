/**
 * Comprehensive Unit Test Suite for Enterprise AI Token Optimizer 4.0
 * Tests all Adopted SOTA capabilities:
 *   - ScratchpadManager (Asymmetric Compaction & Scratchpad Externalization)
 *   - ProgressiveHistorySummarizer (Turn Anchoring & Raw Error Trace Preservation)
 *   - PromptMinifier (Declarative Rule Shorthand & Symbol Substitution)
 *   - ResponseCache (Tier-1 Exact Hash + Tier-2 N-Gram MinHash Semantic Matching)
 *   - ToolSchemaMinifier (Deferred Code-Mode On-Demand Tool Schemas)
 *   - AgenticToolCompactor (Tool Batching & Head/Tail Regex Masking)
 *   - AstPrunerEngine (3-Tier Hierarchical Chunking: T0 / T1 / T2)
 *   - AgenticCircuitBreaker (Token Velocity Governance & Stagnation Detection)
 */

import { ScratchpadManager } from '../src/engine/scratchpadManager';
import { ProgressiveHistorySummarizer } from '../src/engine/progressiveSummarizer';
import { PromptMinifier } from '../src/engine/promptMinifier';
import { ResponseCache } from '../src/cache/responseCache';
import { ToolSchemaMinifier } from '../src/cache/schemaMinifier';
import { AgenticToolCompactor } from '../src/engine/agenticCompactor';
import { AstPrunerEngine } from '../src/ast/pruner';
import { AgenticCircuitBreaker } from '../src/metrics/circuitBreaker';
import { MessagePayload } from '../src/types';
import * as assert from 'assert';
import * as path from 'path';

export async function runV4EngineTests() {
    console.log('\n--- Running Enterprise Token Optimizer 4.0 SOTA Engine Tests ---');

    // 1. ScratchpadManager Tests (Asymmetric Compaction & State Persistence)
    console.log('[ScratchpadManager] Testing asymmetric turn compaction & working memory...');
    const workspaceRoot = path.resolve(__dirname, '..');
    const scratchpad = new ScratchpadManager(workspaceRoot);

    const historyWithErrors: MessagePayload[] = [
        { role: 'user', content: 'Please refactor database connection pooling.' },
        { role: 'assistant', content: 'Refactored pool connection logic in db.ts.' },
        { role: 'user', content: 'Run integration test suite.' },
        { role: 'assistant', content: 'Error: Connection timeout at PostgreSQL 5432 after 5000ms.\n  at Pool.connect (src/db.ts:45)\n  at test (tests/db.test.ts:12)' },
        { role: 'user', content: 'Fix the timeout configuration.' },
        { role: 'assistant', content: 'Updated timeout to 15000ms in config.ts.' }
    ];

    const compactionResult = scratchpad.compactAsymmetric(historyWithErrors, 2);
    assert.ok(compactionResult.scratchpadDigest.includes('SCRATCHPAD STATE'), 'Should generate scratchpad digest');
    assert.ok(compactionResult.tokensSaved >= 0, 'Should save tokens or condense history');
    assert.ok(compactionResult.compactedMessages.length <= historyWithErrors.length, 'Compacted message count should be smaller or equal');
    console.log('✓ ScratchpadManager (Asymmetric Compaction) verified.');

    // 2. ProgressiveHistorySummarizer with Turn Anchoring
    console.log('[ProgressiveSummarizer] Testing Turn Anchoring & Raw Error Trace Preservation...');
    const summarized = ProgressiveHistorySummarizer.summarize(historyWithErrors, 2);
    assert.ok(summarized.anchorsCount > 0, 'Should generate turn anchors');
    assert.ok(summarized.messages[0].content.includes('TURN ANCHORS'), 'Should format turn anchor headers');
    assert.ok(summarized.messages[0].content.includes('PRESERVED ERROR CONSTRAINTS') || summarized.messages[0].content.includes('Task:'), 'Should preserve error constraints or tasks');
    console.log(`[ProgressiveSummarizer] Generated ${summarized.anchorsCount} turn anchors (${summarized.tokensSaved} tokens saved)`);
    console.log('✓ Turn Anchoring & Error Constraint Retention verified.');

    // 3. PromptMinifier (Token Shorthand & Declarative Tables)
    console.log('[PromptMinifier] Testing system prompt shorthand minification...');
    const verbosePrompt = 'You must always ensure that you do not use any console.log statements and format your output as diff. Please make sure to write clean code.';
    const minifiedPrompt = PromptMinifier.minifySystemPrompt(verbosePrompt);
    assert.ok(minifiedPrompt.tokensSaved > 0, 'Should reduce tokens in verbose system prompt');
    assert.ok(minifiedPrompt.minifiedPrompt.includes('RULE:') || minifiedPrompt.minifiedPrompt.includes('NO:'), 'Should substitute shorthand rules');
    console.log(`[PromptMinifier] Original: ${minifiedPrompt.originalTokens} -> Minified: ${minifiedPrompt.minifiedTokens} (${minifiedPrompt.reductionPercentage}% saved)`);
    console.log('✓ Declarative Prompt Minifier verified.');

    // 4. ResponseCache Tier-2 Approximate Matching (MinHash / Shingle Jaccard)
    console.log('[ResponseCache] Testing Tier-2 Semantic Approximate Shingle Matching...');
    const cache = new ResponseCache(10, 60000, 0.85);
    const originalQ = 'How do I configure the database connection pool in PostgreSQL?';
    const rephrasedQ = 'How do I configure the database connection pool in PostgreSQL please?';
    const answer = 'Set poolSize: 20 and timeoutMs: 10000 in config.json.';

    cache.store(originalQ, 'src/db.ts', answer, 'question');
    const exactHit = cache.lookup(originalQ, 'src/db.ts', 'question');
    assert.strictEqual(exactHit.hit, true);
    assert.strictEqual(exactHit.tier, 'exact_hash', 'Original query should hit exact hash tier');

    const approxHit = cache.lookup(rephrasedQ, 'src/db.ts', 'question');
    assert.strictEqual(approxHit.hit, true, 'Rephrased query should hit semantic approximate tier');
    assert.strictEqual(approxHit.tier, 'semantic_approximate');
    assert.ok((approxHit.similarityScore || 0) >= 0.85, 'Similarity score should exceed 0.85');
    console.log(`[ResponseCache] Exact Hit -> Tier 1 (1.00 score) | Approximate Hit -> Tier 2 (${approxHit.similarityScore} score)`);
    console.log('✓ Hybrid Response Cache (Tier-1 + Tier-2 Approximate) verified.');

    // 5. ToolSchemaMinifier (Deferred Code-Mode On-Demand Tools)
    console.log('[ToolSchemaMinifier] Testing Deferred Code-Mode Meta-Tool Resolution...');
    const tools = [
        { name: 'read_file', description: 'Reads content of a file from filesystem', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
        { name: 'execute_sql', description: 'Executes SQL statement against database', parameters: { type: 'object', properties: { sql: { type: 'string' } } } }
    ];
    const deferredResult = ToolSchemaMinifier.minifyToolSchemas(tools, 'deferred');
    assert.ok(deferredResult.minifiedSchema.includes('list_tools'), 'Should generate list_tools meta-tool');
    assert.ok(deferredResult.minifiedSchema.includes('get_tool_schema'), 'Should generate get_tool_schema meta-tool');
    assert.ok(deferredResult.minifiedSchema.includes('call_tool'), 'Should generate call_tool meta-tool');

    const resolved = ToolSchemaMinifier.getToolSchema('read_file', 'medium');
    assert.ok(resolved !== null, 'Should resolve tool schema on-demand by name');
    console.log('✓ Deferred Code-Mode Meta-Tools & On-Demand Schemas verified.');

    // 6. AgenticToolCompactor (Batching & Head/Tail Regex Masking)
    console.log('[AgenticToolCompactor] Testing Head/Tail regex masking & batching...');
    let largeTestOutput = 'PASS tests/auth.test.ts\n';
    for (let i = 1; i <= 50; i++) {
        largeTestOutput += `  ✓ test step ${i} completed successfully\n`;
    }
    largeTestOutput += 'Tests: 50 passed, 50 total\nTime: 1.234s';

    const maskedOutput = AgenticToolCompactor.maskHeadTail(largeTestOutput, 4, 4);
    assert.ok(maskedOutput.includes('intermediate execution output masked'), 'Should mask middle lines');
    assert.ok(maskedOutput.includes('PASS tests/auth.test.ts'), 'Should preserve head');
    assert.ok(maskedOutput.includes('50 passed'), 'Should preserve tail');
    console.log('✓ Tool Output Head/Tail Masking verified.');

    // 7. AstPrunerEngine (3-Tier Hierarchical Chunking: T0 / T1 / T2)
    console.log('[AstPruner] Testing 3-Tier Hierarchical Chunking (T0 / T1 / T2)...');
    const astEngine = new AstPrunerEngine();
    const sampleCode = `
export interface UserSession { id: string; role: string; }
export class AuthService {
    public async validate(token: string): Promise<boolean> {
        const decoded = verify(token);
        for (let i = 0; i < 10; i++) {
            console.log("validating", i);
        }
        return decoded != null;
    }
}`;

    const t0 = astEngine.pruneCodeContext(sampleCode, 'typescript', { structuralTier: 'T0' });
    const t1 = astEngine.pruneCodeContext(sampleCode, 'typescript', { structuralTier: 'T1' });
    const t2 = astEngine.pruneCodeContext(sampleCode, 'typescript', { structuralTier: 'T2' });

    assert.ok(t0.prunedTokenCount <= t1.prunedTokenCount, 'T0 (types/classes only) should have fewest tokens');
    assert.ok(t1.prunedTokenCount < t2.prunedTokenCount, 'T1 (signatures) should be smaller than T2 (full body)');
    assert.strictEqual(t2.reductionPercentage, 0, 'T2 should preserve 100% full implementation');
    console.log(`[AstPruner] T0: ${t0.prunedTokenCount} tokens | T1: ${t1.prunedTokenCount} tokens | T2: ${t2.prunedTokenCount} tokens`);
    console.log('✓ 3-Tier Hierarchical AST Chunking verified.');

    // 8. AgenticCircuitBreaker (Velocity Alerts & Stagnation Loop Breaker)
    console.log('[CircuitBreaker] Testing Token Velocity & Stagnation Loop Breakers...');
    const breaker = new AgenticCircuitBreaker(10000, 3, 3);

    // Normal evaluation
    const status1 = breaker.evaluateTurn(2000, 'action_read_file');
    assert.strictEqual(status1.tripped, false);

    // Stagnation evaluation (3 identical actions in a row)
    breaker.evaluateTurn(1000, 'action_identical');
    breaker.evaluateTurn(1000, 'action_identical');
    const statusStagnant = breaker.evaluateTurn(1000, 'action_identical');
    assert.strictEqual(statusStagnant.tripped, true);
    assert.strictEqual(statusStagnant.reason, 'stagnation_detected', 'Should trip circuit breaker on repeated stagnation');

    // Velocity evaluation
    breaker.reset();
    const statusVelocity = breaker.evaluateTurn(15000, 'action_large_dump');
    assert.strictEqual(statusVelocity.tripped, true);
    assert.strictEqual(statusVelocity.reason, 'velocity_exceeded', 'Should trip circuit breaker when velocity > 10,000 tokens/min');
    console.log('✓ Agentic Circuit Breaker & Velocity Governor verified.');
}
