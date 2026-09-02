/**
 * Comprehensive Test Suite for Enterprise AI Token Optimizer 3.0
 * Tests DiffOutputOptimizer, RelevanceScorer, ModelRouter, FileWatchIndex, and ResponseCache.
 */

import { DiffOutputOptimizer } from '../src/engine/diffOutputOptimizer';
import { RelevanceScorer } from '../src/engine/relevanceScorer';
import { ModelRouter } from '../src/engine/modelRouter';
import { FileWatchIndex } from '../src/repo/repoMap';
import { ResponseCache } from '../src/cache/responseCache';
import * as assert from 'assert';
import * as path from 'path';

export async function runV3EngineTests() {
    console.log('\n--- Running Enterprise Token Optimizer 3.0 SOTA Engine Tests ---');

    // 1. DiffOutputOptimizer Tests
    console.log('[DiffOutputOptimizer] Testing intent classification & diff parsing...');
    
    const editIntent = DiffOutputOptimizer.analyzeIntent('Please refactor the authentication method to use async/await', true);
    assert.strictEqual(editIntent.intent, 'edit', 'Should classify refactor as edit');
    assert.strictEqual(editIntent.shouldRequestDiff, true, 'Should request diff for edit intent');
    assert.ok(editIntent.systemSuffix.includes('unified diff'), 'Should include diff instructions in system prompt');

    const questionIntent = DiffOutputOptimizer.analyzeIntent('Can you explain how the PageRank algorithm works in this repo?');
    assert.strictEqual(questionIntent.intent, 'question', 'Should classify explain as question');
    assert.strictEqual(questionIntent.shouldRequestDiff, false, 'Should not request diff for questions');

    const sampleDiff = `Here are the changes:
\`\`\`diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,3 @@
 function authenticate() {
-    const token = getTokenSync();
+    const token = await getTokenAsync();
     return token;
\`\`\``;
    const parsedDiffs = DiffOutputOptimizer.parseDiffBlocks(sampleDiff);
    assert.strictEqual(parsedDiffs.length, 1, 'Should parse one diff block');
    assert.strictEqual(parsedDiffs[0].filename, 'src/auth.ts', 'Should extract filename');
    assert.strictEqual(parsedDiffs[0].hunks.length, 1, 'Should extract hunk');
    assert.strictEqual(parsedDiffs[0].hunks[0].additions.length, 1);
    assert.strictEqual(parsedDiffs[0].hunks[0].deletions.length, 1);
    console.log('✓ DiffOutputOptimizer (Intent & Diff Parsing) verified.');

    // 2. RelevanceScorer Tests
    console.log('[RelevanceScorer] Testing tab relevance scoring...');
    const workspaceRoot = path.resolve(__dirname, '..');
    const activeFile = path.join(workspaceRoot, 'src', 'proxy', 'chatParticipant.ts');
    const relatedFile = path.join(workspaceRoot, 'src', 'proxy', 'contextAnalyzer.ts');
    const distantFile = path.join(workspaceRoot, 'README.md');

    const prScores = new Map<string, number>();
    prScores.set(relatedFile, 0.85);
    prScores.set(distantFile, 0.10);

    const relevanceResult = RelevanceScorer.scoreFiles(activeFile, [relatedFile, distantFile], prScores, 20);
    assert.ok(relevanceResult.scores.length === 2, 'Should score both files');
    assert.ok(relevanceResult.scores[0].score > relevanceResult.scores[1].score, 'Related file should score higher than distant file');
    assert.ok(relevanceResult.relevantFiles.includes(relatedFile), 'Related file should pass threshold');
    console.log(`[RelevanceScorer] ${path.basename(relatedFile)} score: ${relevanceResult.scores[0].score}, ${path.basename(distantFile)} score: ${relevanceResult.scores[1].score}`);
    console.log('✓ Tab Relevance Scorer verified.');

    // 3. ModelRouter Tests
    console.log('[ModelRouter] Testing task complexity classification...');
    const simpleTask = ModelRouter.analyzeComplexity('Fix typo in variable name and format code');
    assert.strictEqual(simpleTask.suggestedTier, 'flash', 'Simple formatting task should route to Flash tier');
    assert.ok(simpleTask.estimatedCostSavingsPercent >= 90, 'Flash tier should estimate ~95% cost savings');

    const complexTask = ModelRouter.analyzeComplexity('Design and architect a multi-tenant microservices security authentication system with distributed deadlock prevention across multiple files', 4, 12);
    assert.strictEqual(complexTask.suggestedTier, 'reasoning', 'Complex system architecture task should route to Reasoning tier');
    console.log(`[ModelRouter] Simple task -> ${simpleTask.tierLabel} (${simpleTask.estimatedCostSavingsPercent}% saved)`);
    console.log(`[ModelRouter] Complex task -> ${complexTask.tierLabel}`);
    console.log('✓ Intelligent Model Router verified.');

    // 4. FileWatchIndex Tests
    console.log('[FileWatchIndex] Testing incremental indexing & dirty caching...');
    const watchIndex = new FileWatchIndex(workspaceRoot);
    const map1 = watchIndex.getMap([], 1024, workspaceRoot);
    assert.ok(map1.totalFilesIndexed > 0, 'First scan should index files');
    assert.strictEqual(watchIndex.needsRefresh, false, 'Index should be clean after scan');

    // Change a file
    watchIndex.onFileChanged(activeFile);
    assert.strictEqual(watchIndex.needsRefresh, true, 'Index should be marked dirty on file change');
    const map2 = watchIndex.getMap([], 1024, workspaceRoot);
    assert.strictEqual(watchIndex.needsRefresh, false, 'Index should be clean after lazy regeneration');
    console.log('✓ Incremental File Watch Indexer verified.');

    // 5. ResponseCache Tests
    console.log('[ResponseCache] Testing complete SHA-256 request caching & safety guards...');
    const cache = new ResponseCache(10, 5000); // 5 sec TTL
    const q1 = 'What does this project do?';
    const a1 = 'Enterprise AI Token Optimizer compresses context for VS Code.';
    const cacheRequest = {
        requestText: q1,
        conversation: [],
        workspace: { roots: ['root'], snapshotGeneration: 1, ignorePolicyVersion: 'v1', files: [{ path: 'README.md', contentHash: 'readme-v1', sourceVersion: '1' }] },
        evidence: [],
        model: { provider: 'anthropic', id: 'claude-test' },
        tools: [],
        compilerConfiguration: { mode: 'compiler' },
        policies: { trusted: true },
        extensionVersion: 'test',
        safety: { intent: 'question' }
    };

    // Store question
    const stored = cache.store(cacheRequest, a1, 'completed');
    assert.strictEqual(stored, true, 'Should allow caching read-only question');

    // Lookup hit
    const hit1 = cache.lookup(cacheRequest);
    assert.strictEqual(hit1.hit, true, 'Should find cached response on exact hash match');
    assert.strictEqual(hit1.response, a1, 'Cached text should match stored response');

    // Uncacheable edit intent test
    const editRequest = { ...cacheRequest, requestText: 'Refactor this code', safety: { intent: 'edit' } };
    const editStore = cache.store(editRequest, 'diff patch', 'completed');
    assert.strictEqual(editStore, false, 'Should NEVER cache edit responses');
    const editLookup = cache.lookup(editRequest);
    assert.strictEqual(editLookup.hit, false, 'Should NEVER return cache hit for edit intent');

    // File invalidation test
    const invalidatedCount = cache.invalidateForFile('README.md');
    assert.strictEqual(invalidatedCount, 1, 'Should invalidate 1 entry for README.md');
    const hitAfterInvalidation = cache.lookup(cacheRequest);
    assert.strictEqual(hitAfterInvalidation.hit, false, 'Should miss cache after file invalidation');

    console.log('✓ Exact Response Cache (SHA-256 + Safety Guards) verified.');
}
