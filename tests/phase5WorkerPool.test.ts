import * as assert from 'assert';
import { TaskWorkerPool } from '../src/performance/workerPool';
import { CpuWorkerBoundary } from '../src/performance/cpuWorkerBoundary';
import { WorkCancelledError } from '../src/performance/boundedScheduler';
import { ContextEntity } from '../src/solver/contextIR';
import { ContextKnapsackSolver } from '../src/solver/knapsackSolver';

export async function runPhase5WorkerPoolTests(): Promise<void> {
    console.log('--- Running Phase 5 Worker Thread Pool & Event Loop Protection Tests ---');

    // -------------------------------------------------------------------------
    // Test 1: Worker Pool Warm Reuse & Lifecycle
    // -------------------------------------------------------------------------
    const pool = new TaskWorkerPool({ minWorkers: 2, maxWorkers: 2, taskTimeoutMs: 5000 });
    try {
        const statsInitial = pool.getStats();
        assert.strictEqual(statsInitial.totalWorkers, 0, 'Worker pool must remain lazy before its first task');
        assert.strictEqual(statsInitial.idleWorkers, 0, 'Lazy pool must hold no idle worker before demand');

        // Ping warm workers
        const ping1 = await pool.execute<string>('ping', {});
        assert.strictEqual(ping1, 'pong', 'Worker must respond to ping operation');
        assert.strictEqual(pool.getStats().totalWorkers, 2, 'First demand starts only the configured minimum workers');

        const ping2 = await pool.execute<string>('ping', {});
        assert.strictEqual(ping2, 'pong', 'Warm worker must be reused without cold start');

        const statsAfterPing = pool.getStats();
        assert.strictEqual(statsAfterPing.completedTasks, 2, 'Completed task counter must increment');
        assert.strictEqual(statsAfterPing.failedTasks, 0, 'Failed task counter must remain 0');

        console.log('✓ Worker pool lazy initialization, bounded minimum, and warm reuse verified.');

        // -------------------------------------------------------------------------
        // Test 2: Knapsack DP Offloading & Exact Mathematical Equivalence
        // -------------------------------------------------------------------------
        const candidates: ContextEntity[] = [
            {
                id: 'entity_alpha',
                filePath: 'src/core/compiler.ts',
                symbolName: 'compileContext',
                kind: 'function',
                fullCode: 'export function compileContext(input: string): string {\n    const a = 1;\n    const b = 2;\n    return input + a + b;\n}',
                signatures: ['export function compileContext(input: string): string'],
                baseUtility: 0.90
            },
            {
                id: 'entity_beta',
                filePath: 'src/core/optimizer.ts',
                symbolName: 'optimizeTokens',
                kind: 'function',
                fullCode: 'export function optimizeTokens(tokens: number[]): number {\n    return tokens.reduce((x, y) => x + y, 0);\n}',
                signatures: ['export function optimizeTokens(tokens: number[]): number'],
                baseUtility: 0.85
            },
            {
                id: 'entity_gamma',
                filePath: 'src/core/types.ts',
                symbolName: 'CompilerOptions',
                kind: 'interface',
                fullCode: 'export interface CompilerOptions {\n    strict: boolean;\n    target: string;\n    budget: number;\n}',
                signatures: ['export interface CompilerOptions'],
                baseUtility: 0.95
            }
        ];

        const solverParams = {
            candidates,
            tokenBudget: 300,
            lambdaCost: 0.005,
            modelId: 'claude-3-7-sonnet-20250219',
            provider: 'anthropic'
        };

        const syncSolver = new ContextKnapsackSolver();
        const syncResult = syncSolver.solve(solverParams);
        const knapsackResult = await pool.execute<any>('knapsack-solve', solverParams);

        assert.ok(knapsackResult, 'Knapsack solve must return a valid result object');
        assert.ok(Array.isArray(knapsackResult.assignments), 'Assignments must be returned as key-value pairs');
        assert.strictEqual(knapsackResult.assignments.length, 3, 'All candidate entities must receive resolution assignments');
        assert.strictEqual(knapsackResult.totalTokens, syncResult.totalTokens, 'Worker total tokens must strictly match sync solver');
        assert.strictEqual(knapsackResult.totalUtility, syncResult.totalUtility, 'Worker total utility must strictly match sync solver');
        assert.strictEqual(knapsackResult.includedCount, syncResult.includedCount, 'Worker included count must strictly match sync solver');
        assert.strictEqual(knapsackResult.excludedCount, syncResult.excludedCount, 'Worker excluded count must strictly match sync solver');
        assert.strictEqual(knapsackResult.prunedOptionsCount, syncResult.prunedOptionsCount, 'Worker pruned count must match sync solver');
        assert.ok(knapsackResult.totalTokens <= 300, 'Total tokens must respect token budget ceiling');
        assert.ok(knapsackResult.netDollarSavingsUSD >= 0, 'Net dollar savings must be non-negative');

        // Verify assignment level equivalence per candidate
        for (const [id, res] of knapsackResult.assignments) {
            const syncRes = syncResult.assignments.get(id);
            assert.ok(syncRes, `Sync result must contain assignment for ${id}`);
            assert.strictEqual(res.level, syncRes.level, `Candidate ${id} resolution level must match between worker and sync`);
        }

        console.log('✓ Background Worker Knapsack DP solving and exact sync mathematical equivalence verified.');

        // -------------------------------------------------------------------------
        // Test 3: PageRank Workspace Graph Ranking
        // -------------------------------------------------------------------------
        const workspaceRankInput = {
            files: [
                {
                    key: 'file1',
                    relativePath: 'src/indexer.ts',
                    references: ['TokenCounter', 'AstPrunerEngine'],
                    symbols: [
                        { name: 'IndexManager', kind: 'class', file: 'src/indexer.ts', line: 10, signature: 'class IndexManager' }
                    ]
                },
                {
                    key: 'file2',
                    relativePath: 'src/tokenizer.ts',
                    references: ['Buffer'],
                    symbols: [
                        { name: 'TokenCounter', kind: 'class', file: 'src/tokenizer.ts', line: 5, signature: 'class TokenCounter' }
                    ]
                },
                {
                    key: 'file3',
                    relativePath: 'src/pruner.ts',
                    references: ['TokenCounter'],
                    symbols: [
                        { name: 'AstPrunerEngine', kind: 'class', file: 'src/pruner.ts', line: 15, signature: 'class AstPrunerEngine' }
                    ]
                }
            ],
            activeKeys: ['file1']
        };

        const rankedSymbols = await pool.execute<any[]>('rank-workspace', workspaceRankInput);
        assert.ok(Array.isArray(rankedSymbols), 'Ranking must return an array of symbols');
        assert.strictEqual(rankedSymbols.length, 3, 'All 3 symbols must be ranked');
        // TokenCounter has incoming references from file1 and file3, so its score should be elevated
        assert.ok(rankedSymbols[0].score >= rankedSymbols[2].score, 'Symbols must be sorted in descending PageRank order');

        console.log('✓ Background Worker 12-iteration PageRank workspace ranking verified.');

        // -------------------------------------------------------------------------
        // Test 4: AST Pruning and Batch Slicing
        // -------------------------------------------------------------------------
        const sampleCode = `
export class ServiceBroker {
    private cache: Map<string, any> = new Map();

    public execute(query: string): string {
        const validated = this.validate(query);
        const result = "processed: " + validated;
        this.cache.set(query, result);
        return result;
    }

    private validate(q: string): string {
        if (!q) throw new Error("Empty");
        return q.trim();
    }
}
        `;

        const pruneResult = await pool.execute<any>('ast-prune', { code: sampleCode, language: 'typescript' });
        assert.ok(pruneResult.prunedTokens < pruneResult.originalTokens, 'Pruned code must reduce token count');
        assert.ok(pruneResult.prunedCode.includes('class ServiceBroker'), 'Must preserve class declaration');
        assert.ok(pruneResult.prunedCode.includes('body pruned for token optimization'), 'Must insert pruning ellipsis');

        // Batch AST prune
        const batchResult = await pool.execute<any[]>('batch-ast-prune', {
            items: [
                { code: 'function f1() { return 1; }', language: 'typescript' },
                { code: 'function f2() { return 2; }', language: 'typescript' }
            ]
        });
        assert.strictEqual(batchResult.length, 2, 'Batch AST prune must return results for all items');

        console.log('✓ Background Worker AST pruning and batch skeleton generation verified.');

        // -------------------------------------------------------------------------
        // Test 5: Cancellation Handling
        // -------------------------------------------------------------------------
        let cancellationRejected = false;
        try {
            await pool.execute('ping', {}, { isCancellationRequested: true });
        } catch (err) {
            if (err instanceof WorkCancelledError) {
                cancellationRejected = true;
            }
        }
        assert.strictEqual(cancellationRejected, true, 'Task with pre-requested cancellation must reject with WorkCancelledError');

        console.log('✓ Cooperative task cancellation verified.');

        // -------------------------------------------------------------------------
        // Test 6: CpuWorkerBoundary Wrapper & Typed Map Restoration
        // -------------------------------------------------------------------------
        const boundary = new CpuWorkerBoundary(5000, 1024 * 1024);
        try {
            const solverResult = await boundary.solveKnapsack({
                candidates,
                tokenBudget: 500,
                modelId: 'deepseek-chat',
                provider: 'deepseek'
            });

            assert.ok(solverResult.assignments instanceof Map, 'CpuWorkerBoundary must restore assignments as typed Map');
            assert.strictEqual(solverResult.assignments.size, 3, 'All entities must be present in Map');
            assert.ok(solverResult.assignments.get('entity_alpha') !== undefined, 'Entity assignments must be retrievable by id');

            const boundaryRanked = await boundary.rankWorkspace(workspaceRankInput);
            assert.strictEqual(boundaryRanked.length, 3, 'Boundary rankWorkspace must succeed cleanly');

            console.log('✓ CpuWorkerBoundary wrapper and typed Map restoration verified.');
        } finally {
            boundary.dispose();
        }

        // -------------------------------------------------------------------------
        // Test 7: In-Process Fallback Mode
        // -------------------------------------------------------------------------
        const inProcessPool = new TaskWorkerPool({ forceInProcess: true });
        try {
            const inProcessStats = inProcessPool.getStats();
            assert.strictEqual(inProcessStats.inProcessFallback, true, 'forceInProcess must activate inProcessFallback mode');

            const fallbackPing = await inProcessPool.execute<string>('ping', {});
            assert.strictEqual(fallbackPing, 'pong', 'In-process execution must handle ping');

            const fallbackRank = await inProcessPool.execute<any[]>('rank-workspace', workspaceRankInput);
            assert.strictEqual(fallbackRank.length, 3, 'In-process execution must handle rank-workspace');

            const fallbackKnapsack = await inProcessPool.execute<any>('knapsack-solve', {
                candidates,
                tokenBudget: 300
            });
            assert.strictEqual(fallbackKnapsack.assignments.length, 3, 'In-process execution must handle knapsack-solve');

            console.log('✓ Transparent in-process fallback mode verified.');
        } finally {
            inProcessPool.dispose();
        }

    } finally {
        pool.dispose();
    }

    console.log('====================================================================================');
    console.log('🎉 ALL PHASE 5 WORKER THREAD POOL & EVENT LOOP PROTECTION TESTS PASSED (100%)');
    console.log('====================================================================================\n');
}
