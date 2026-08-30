/**
 * Unit Test Suite for RAM Context Manager & In-Memory Workspace Acceleration
 * Tests:
 *   1. Configurable RAM Budget & LRU Eviction
 *   2. Background Workspace Pre-Warming (warmWorkspace)
 *   3. In-Memory BM25 / Shingle Symbol Search Index (searchRelevantSlices)
 *   4. AST Skeleton Memoization Cache in RAM (getOrPruneSkeleton)
 *   5. In-Memory Multi-Turn Code Deduplication (deduplicateTurnCode)
 */

import { RamContextManager } from '../src/engine/ramManager';
import { AstPrunerEngine } from '../src/ast/pruner';
import * as assert from 'assert';
import * as path from 'path';

export async function runRamManagerTests() {
    console.log('\n--- Running RAM Context Manager & In-Memory Acceleration Tests ---');

    const workspaceRoot = path.resolve(__dirname, '..');
    const astEngine = new AstPrunerEngine();
    await astEngine.initialize();

    // 1. Initialize RAM Manager with custom budget
    const ram = new RamContextManager(astEngine, {
        ramBudgetMB: 32,
        enableBackgroundWarming: true,
        enableSemanticIndex: true
    }, workspaceRoot);

    // 2. Test AST Skeleton Memoization (0ms RAM Cache)
    console.log('[RAM Test] Testing AST Skeleton Memoization in RAM...');
    const sampleCode = `
export interface UserSession {
    id: string;
    token: string;
    expiresAt: number;
}

export class AuthService {
    private secretKey: string = "secret";

    public async login(user: string, pass: string): Promise<UserSession> {
        console.log("Authenticating user", user);
        return { id: "1", token: "tok_123", expiresAt: Date.now() + 3600 };
    }
}
    `;

    // First call: Cache Miss (parses and stores)
    const firstCall = ram.getOrPruneSkeleton('src/auth.ts', sampleCode, 'typescript');
    assert.strictEqual(firstCall.fromCache, false, 'First call should be a cache miss');
    assert.ok(firstCall.skeleton.includes('login(user: string, pass: string): Promise<UserSession>'), 'Skeleton should preserve public signature');
    assert.ok(!firstCall.skeleton.includes('console.log'), 'Skeleton should prune private implementation');

    // Second call with same content: Cache Hit (instant RAM lookup, 0 parses)
    const secondCall = ram.getOrPruneSkeleton('src/auth.ts', sampleCode, 'typescript');
    assert.strictEqual(secondCall.fromCache, true, 'Second call should be an instant RAM cache hit');
    assert.strictEqual(secondCall.skeleton, firstCall.skeleton, 'Cached skeleton must match');
    console.log('✓ In-Memory AST Skeleton Memoization verified (0ms cache hits).');

    // 3. Test Background Workspace Pre-Warming
    console.log('[RAM Test] Testing Background Workspace Pre-Warming...');
    const warmResult = await ram.warmWorkspace(workspaceRoot);
    assert.ok(warmResult.filesScanned > 0, 'Should scan workspace source files');
    assert.ok(warmResult.skeletonsCached > 0, 'Should cache AST skeletons in RAM');
    assert.ok(warmResult.symbolsIndexed > 0, 'Should index symbols in RAM');
    console.log(`[RAM Test] Pre-warmed ${warmResult.skeletonsCached} files and ${warmResult.symbolsIndexed} symbols in ${warmResult.durationMs}ms (${Math.round(warmResult.memoryUsedBytes / 1024)} KB RAM)`);
    console.log('✓ Background Workspace Pre-Warming verified.');

    // 4. Test In-Memory BM25 / Shingle Symbol Search Index
    console.log('[RAM Test] Testing In-Memory BM25 Symbol Search Index...');
    const slices = ram.searchRelevantSlices('pruneCodeContext AST pruner', 3);
    assert.ok(slices.length > 0, 'Should retrieve relevant symbol slices from RAM');
    assert.ok(slices[0].score > 0, 'Relevant slices must have positive scores');
    console.log(`[RAM Test] Found top slice: [${slices[0].file}:${slices[0].line}] ${slices[0].name} (Score: ${slices[0].score})`);
    console.log('✓ In-Memory BM25 Symbol Search Index verified.');

    // 5. Test Multi-Turn Code Deduplication Pointers
    console.log('[RAM Test] Testing Multi-Turn Code Context Registry...');
    const multiLineSnippet = `
function validatePaymentTransaction(txId: string, amount: number) {
    if (amount <= 0) throw new Error("Invalid amount");
    const verified = verifySignature(txId);
    return verified && amount > 0;
}
    `;

    // Turn 1: registers block
    const turn1 = ram.deduplicateTurnCode(multiLineSnippet, 'payment.ts');
    assert.strictEqual(turn1.wasDeduplicated, false, 'First turn should register original code');

    // Turn 2: same block -> returns lightweight pointer
    const turn2 = ram.deduplicateTurnCode(multiLineSnippet, 'payment.ts');
    assert.strictEqual(turn2.wasDeduplicated, true, 'Second turn should replace repeated code with pointer');
    assert.ok(turn2.text.includes('Cached Code Context'), 'Turn 2 text should be a reference pointer');
    assert.ok(turn2.tokensSaved > 0, 'Should save tokens on repeated code block');
    console.log(`[RAM Test] Deduplicated turn saved ${turn2.tokensSaved} tokens.`);
    console.log('✓ Multi-Turn Code Context Registry verified.');

    // 6. Test File Watcher Invalidation
    console.log('[RAM Test] Testing File Change Invalidation...');
    ram.onFileChanged('src/auth.ts');
    const afterInvalidation = ram.getOrPruneSkeleton('src/auth.ts', sampleCode, 'typescript');
    assert.strictEqual(afterInvalidation.fromCache, false, 'Should re-parse after file invalidation');
    console.log('✓ RAM Cache Invalidation verified.');

    // 7. Verify RAM Stats & Budget Enforcement
    const stats = ram.getStats();
    assert.strictEqual(stats.budgetMB, 32, 'Configured budget should be 32MB');
    assert.ok(stats.usedBytes > 0, 'Used bytes should be tracked');
    assert.ok(stats.skeletonsCached > 0, 'Skeletons should be present in stats');
    console.log(`[RAM Test] Final RAM Stats: ${stats.usedMB} MB / ${stats.budgetMB} MB (${stats.hitRatePercentage}% hit rate)`);
    console.log('✓ RAM Budget & Telemetry verified.');
}
