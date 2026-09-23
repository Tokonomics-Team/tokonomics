const path = require('path');
const { performance } = require('perf_hooks');
const esbuild = require('esbuild');

async function run() {
    console.log('================================================================');
    console.log('🔬 EXECUTING PHASE 1 ACCEPTANCE CRITERIA VERIFICATION BENCHMARK');
    console.log('================================================================\n');

    // Build temporary bundle of the test runner
    const outfile = path.join(__dirname, '..', 'out_test', 'phase1_acceptance.js');
    await esbuild.build({
        stdin: {
            contents: `
                import { BM25Index } from '../src/search/hybridRetriever';
                import { ContextKnapsackSolver } from '../src/solver/knapsackSolver';
                import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';

                export async function testBM25Indexing() {
                    console.log('--- Criterion 1: BM25 5,000 Documents Indexing Latency ---');
                    const bm25 = new BM25Index();
                    const docs = [];
                    for (let i = 0; i < 5000; i++) {
                        docs.push({
                            id: 'doc_' + i,
                            content: 'export function processItem' + i + '(paramA: string, paramB: number): Promise<Result' + i + '> { return database.query("SELECT * FROM table_' + (i % 50) + ' WHERE id = " + paramB); }'
                        });
                    }

                    // Warm up JIT
                    for (let i = 0; i < 100; i++) {
                        bm25.addDocument('warm_' + i, docs[i].content);
                    }
                    bm25.clear();

                    const start = performance.now();
                    for (let i = 0; i < 5000; i++) {
                        bm25.addDocument(docs[i].id, docs[i].content);
                    }
                    const elapsedMs = performance.now() - start;
                    console.log('Indexed 5,000 documents in: ' + elapsedMs.toFixed(2) + 'ms');
                    const searchStart = performance.now();
                    const hits = bm25.search('processItem4999 query database', 10);
                    const searchMs = performance.now() - searchStart;
                    console.log('BM25 Top hit: ' + (hits[0] ? hits[0].id : 'none') + ' in ' + searchMs.toFixed(2) + 'ms');

                    if (elapsedMs > 200) {
                        throw new Error('Criterion 1 Failed: Indexing 5,000 documents took ' + elapsedMs.toFixed(2) + 'ms (> 200ms target)');
                    }
                    console.log('✓ Criterion 1 PASSED: 5,000 documents indexed in ' + elapsedMs.toFixed(2) + 'ms (< 200ms).\\n');
                    return elapsedMs;
                }

                export async function testKnapsackDP() {
                    console.log('--- Criterion 2: Knapsack DP Latency (128,000 Token Budget, 200 Candidates) ---');
                    const solver = new ContextKnapsackSolver();
                    const candidates = [];
                    for (let i = 0; i < 200; i++) {
                        candidates.push({
                            id: 'entity_' + i,
                            filePath: 'src/module_' + (i % 20) + '/service_' + i + '.ts',
                            symbolName: 'ServiceClass' + i,
                            kind: 'class',
                            baseUtility: (i % 10 === 0 ? 95 : (i % 3 === 0 ? 60 : 30)),
                            signatures: ['export class ServiceClass' + i + ' { handle(req: any): Response; }'],
                            fullCode: 'export class ServiceClass' + i + ' { private db = pool; public handle(req: any): Response { return this.db.exec(req); } }'
                        });
                    }

                    // Warm up JIT
                    for (let w = 0; w < 3; w++) {
                        solver.solve({ candidates, tokenBudget: 128000 });
                    }

                    // Benchmark 128,000 token budget
                    const runs = 10;
                    let totalMs = 0;
                    let lastResult;
                    for (let r = 0; r < runs; r++) {
                        const start = performance.now();
                        lastResult = solver.solve({
                            candidates,
                            tokenBudget: 128000
                        });
                        totalMs += (performance.now() - start);
                    }
                    const avgMs = totalMs / runs;
                    console.log('Knapsack DP 128k Budget across 200 candidates: avg ' + avgMs.toFixed(3) + 'ms (runs: ' + runs + ')');
                    console.log('Allocated Tokens: ' + lastResult.totalTokens + ' / 128,000 | Total Utility: ' + lastResult.totalUtility + ' | Included: ' + lastResult.includedCount);

                    if (avgMs > 1.5) {
                        throw new Error('Criterion 2 Failed: Knapsack DP took ' + avgMs.toFixed(3) + 'ms (> 1.5ms target)');
                    }
                    console.log('✓ Criterion 2 PASSED: Knapsack DP resolved in ' + avgMs.toFixed(3) + 'ms (< 1.5ms).\\n');
                    return avgMs;
                }

                export async function testMemoryLeakContinuous() {
                    console.log('--- Criterion 3: Memory Leak Audit (1,000 Continuous Invocations) ---');
                    const orchestrator = new PipelineOrchestrator();
                    
                    const mockSnapshot = {
                        generation: 1,
                        createdAt: Date.now(),
                        roots: [{ id: 'root_1', path: '/workspace', uri: '/workspace' }],
                        ignorePolicyVersion: '1.0',
                        files: new Map([
                            ['file_1', {
                                key: 'file_1',
                                relativePath: 'src/index.ts',
                                absolutePath: '/workspace/src/index.ts',
                                sourceVersion: '1',
                                contentHash: 'hash_1',
                                language: 'typescript',
                                skeleton: 'export class App { run(): void; }',
                                symbols: [{ name: 'App', kind: 'class', file: 'src/index.ts', line: 1, signature: 'export class App', terms: new Set(['app']) }],
                                references: [],
                                sizeBytes: 100,
                                memoryBytes: 200,
                                updateSequence: 1,
                                rootId: 'root_1'
                            }]
                        ]),
                        symbols: [{ name: 'App', kind: 'class', file: 'src/index.ts', line: 1, signature: 'export class App', terms: new Set(['app']) }],
                        memoryBytes: 1024
                    };

                    // Warmup
                    for (let i = 0; i < 50; i++) {
                        await orchestrator.compileContext({
                            messages: [{ role: 'user', content: 'What does the App class do?' }],
                            workspaceSnapshot: mockSnapshot,
                            allowWorkspaceRetrieval: false
                        });
                    }

                    if (global.gc) global.gc();
                    const initialMemory = process.memoryUsage().heapUsed;
                    console.log('Baseline Heap Used: ' + (initialMemory / (1024 * 1024)).toFixed(2) + ' MB');

                    for (let i = 0; i < 1000; i++) {
                        await orchestrator.compileContext({
                            messages: [{ role: 'user', content: 'Prompt iteration ' + i + ': Query the App service' }],
                            workspaceSnapshot: mockSnapshot,
                            allowWorkspaceRetrieval: false
                        });
                    }

                    if (global.gc) global.gc();
                    const finalMemory = process.memoryUsage().heapUsed;
                    const growthMB = (finalMemory - initialMemory) / (1024 * 1024);
                    console.log('Final Heap Used after 1,000 iterations: ' + (finalMemory / (1024 * 1024)).toFixed(2) + ' MB');
                    console.log('Heap Growth: ' + growthMB.toFixed(2) + ' MB');

                    if (growthMB > 5.0) {
                        throw new Error('Criterion 3 Failed: Heap grew by ' + growthMB.toFixed(2) + 'MB (> 5MB threshold)');
                    }
                    console.log('✓ Criterion 3 PASSED: Zero memory leak detected over 1,000 iterations (Growth: ' + growthMB.toFixed(2) + ' MB < 5MB).\\n');
                    return growthMB;
                }

                export async function main() {
                    const t1 = await testBM25Indexing();
                    const t2 = await testKnapsackDP();
                    const t3 = await testMemoryLeakContinuous();
                    console.log('================================================================');
                    console.log('🎉 ALL 3 PHASE 1 VERIFICATION & ACCEPTANCE CRITERIA CERTIFIED');
                    console.log('================================================================');
                }

                main().catch(err => {
                    console.error('Acceptance test failed:', err);
                    process.exit(1);
                });
            `,
            resolveDir: __dirname
        },
        bundle: true,
        outfile,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        external: ['vscode']
    });

    const { execSync } = require('child_process');
    execSync(`node --expose-gc "${outfile}"`, { stdio: 'inherit' });
}

run().catch(err => {
    console.error('Acceptance verification failed:', err);
    process.exit(1);
});
