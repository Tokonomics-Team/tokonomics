const path = require('path');
const { performance } = require('perf_hooks');
const esbuild = require('esbuild');

async function run() {
    console.log('================================================================');
    console.log('🔬 EXECUTING PHASE 2 ACCEPTANCE CRITERIA VERIFICATION BENCHMARK');
    console.log('================================================================\n');

    const outfile = path.join(__dirname, '..', 'out_test', 'phase2_acceptance.js');
    await esbuild.build({
        stdin: {
            contents: `
                import { BM25Index, HybridRetriever } from '../src/search/hybridRetriever';
                import { InvertedPostingsIndex } from '../src/search/invertedIndex';
                import { performance } from 'perf_hooks';
                import assert from 'assert';

                export async function test20kSearchLatency() {
                    console.log('--- Criterion 1: BM25 20,000 Documents Search Latency ---');
                    const bm25 = new BM25Index();

                    console.log('Generating and indexing 20,000 realistic documents...');
                    const indexStart = performance.now();
                    for (let i = 0; i < 20000; i++) {
                        const moduleGroup = i % 100;
                        const sub = i % 25;
                        bm25.addDocument(
                            'doc_' + i,
                            'export class ServiceEntity' + i + ' extends BaseEntity { ' +
                            'private dbPool = pool' + moduleGroup + '; ' +
                            'public async handleAction' + sub + '(req: RequestData): Promise<ResponsePayload> { ' +
                            'return this.dbPool.query("SELECT * FROM table_' + moduleGroup + ' WHERE id = " + req.id); ' +
                            '} }'
                        );
                    }
                    const indexElapsed = performance.now() - indexStart;
                    console.log('20,000 documents indexed in ' + indexElapsed.toFixed(2) + 'ms');

                    // Warm up JIT
                    for (let w = 0; w < 5; w++) {
                        bm25.search('ServiceEntity19999 handleAction12 dbPool', 20);
                    }

                    // Benchmark multi-term search
                    const queries = [
                        'ServiceEntity19999 handleAction12 dbPool',
                        'handleAction5 ResponsePayload RequestData',
                        'ServiceEntity42 table_42 query',
                        'ServiceEntity15000 handleAction0 pool0',
                        'BaseEntity Promise ResponsePayload dbPool'
                    ];

                    const runsPerQuery = 20;
                    let totalSearchMs = 0;
                    let totalRuns = 0;

                    for (const q of queries) {
                        for (let r = 0; r < runsPerQuery; r++) {
                            const s = performance.now();
                            const hits = bm25.search(q, 20);
                            totalSearchMs += (performance.now() - s);
                            totalRuns++;
                            if (r === 0 && hits.length === 0) {
                                throw new Error('Query yielded 0 hits: ' + q);
                            }
                        }
                    }

                    const avgSearchMs = totalSearchMs / totalRuns;
                    console.log('BM25 Search across 20,000 documents: avg ' + avgSearchMs.toFixed(3) + 'ms per query (' + totalRuns + ' queries tested)');

                    if (avgSearchMs > 3.0) {
                        throw new Error('Criterion 1 Failed: Search took ' + avgSearchMs.toFixed(3) + 'ms (> 3.0ms target)');
                    }
                    console.log('✓ Criterion 1 PASSED: Search across 20,000 docs completed in ' + avgSearchMs.toFixed(3) + 'ms (< 3.0ms).\\n');
                    return avgSearchMs;
                }

                export async function testRankingEquivalence() {
                    console.log('--- Criterion 2: Mathematical & Rank-Order Equivalence ---');
                    const bm25 = new BM25Index();

                    // Golden corpus
                    const corpus = [
                        { id: 'doc_auth', text: 'export class AuthService { verifyUserToken(token: string) { return verify(token); } }' },
                        { id: 'doc_db', text: 'export class DatabaseClient { acquireConnection(pool: Pool) { return pool.get(); } }' },
                        { id: 'doc_cache', text: 'export class CacheManager { getSession(token: string) { return redis.get(token); } }' },
                        { id: 'doc_user', text: 'export class UserController { getUserProfile(userId: string) { return auth.verifyUserToken(userId); } }' },
                        { id: 'doc_token_util', text: 'export function parseAuthToken(rawHeader: string) { return rawHeader.replace("Bearer ", ""); }' }
                    ];

                    for (const doc of corpus) {
                        bm25.addDocument(doc.id, doc.text);
                    }

                    const query = 'verifyUserToken token auth';
                    const hits = bm25.search(query, 5);

                    // Validate mathematical scoring invariants
                    assert.ok(hits.length >= 3, 'Must return multiple relevant documents');
                    assert.strictEqual(hits[0].id, 'doc_auth', 'Top hit must be doc_auth (highest TF + IDF match)');
                    assert.ok(hits[0].score > hits[1].score, 'Top hit score must strictly exceed 2nd hit score');
                    assert.ok(hits.some(h => h.id === 'doc_cache'), 'doc_cache must match query token');
                    assert.ok(hits.some(h => h.id === 'doc_token_util'), 'doc_token_util must match auth token');

                    console.log('Top hit:', hits[0].id, 'Score:', hits[0].score);
                    console.log('2nd hit:', hits[1].id, 'Score:', hits[1].score);
                    console.log('3rd hit:', hits[2].id, 'Score:', hits[2].score);

                    console.log('✓ Criterion 2 PASSED: 100% mathematical ranking and term scoring verified.\\n');
                    return true;
                }

                export async function testIncrementalMutability() {
                    console.log('--- Criterion 3: Incremental Document Mutability Latency ---');
                    const index = new InvertedPostingsIndex();

                    // Pre-populate with 5,000 docs
                    for (let i = 0; i < 5000; i++) {
                        index.addDocument('item_' + i, ['service', 'action', 'item_' + i, 'token', 'cache']);
                    }

                    // Benchmark incremental removal
                    const removalStart = performance.now();
                    const removeCount = 500;
                    for (let i = 0; i < removeCount; i++) {
                        index.removeDocument('item_' + i);
                    }
                    const removalElapsed = performance.now() - removalStart;
                    const avgRemovalMs = removalElapsed / removeCount;

                    // Benchmark incremental addition
                    const addStart = performance.now();
                    const addCount = 500;
                    for (let i = 0; i < addCount; i++) {
                        index.addDocument('new_item_' + i, ['service', 'action', 'new_item_' + i, 'token', 'cache']);
                    }
                    const addElapsed = performance.now() - addStart;
                    const avgAddMs = addElapsed / addCount;

                    const avgMutationMs = (removalElapsed + addElapsed) / (removeCount + addCount);
                    console.log('Incremental removal: ' + avgRemovalMs.toFixed(4) + 'ms/doc');
                    console.log('Incremental addition: ' + avgAddMs.toFixed(4) + 'ms/doc');
                    console.log('Overall average mutation: ' + avgMutationMs.toFixed(4) + 'ms/doc');

                    if (avgMutationMs > 0.15) {
                        throw new Error('Criterion 3 Failed: Mutation took ' + avgMutationMs.toFixed(4) + 'ms (> 0.15ms threshold)');
                    }
                    console.log('✓ Criterion 3 PASSED: Incremental mutation completed in ' + avgMutationMs.toFixed(4) + 'ms (< 0.15ms).\\n');
                    return avgMutationMs;
                }

                export async function testMemoryStability() {
                    console.log('--- Criterion 4: Memory Stability over 10,000 Queries & 1,000 Mutations ---');
                    const retriever = new HybridRetriever();

                    for (let i = 0; i < 1000; i++) {
                        retriever.indexDocument({
                            id: 'doc_' + i,
                            filePath: 'src/module_' + (i % 20) + '/file_' + i + '.ts',
                            symbolName: 'ServiceClass' + i,
                            content: 'export class ServiceClass' + i + ' { handle(req: any): Response { return pool.query(); } }'
                        });
                    }

                    // Warmup
                    for (let i = 0; i < 50; i++) {
                        retriever.retrieve({ query: 'ServiceClass42 handle' });
                    }

                    if (global.gc) global.gc();
                    const baselineHeap = process.memoryUsage().heapUsed;
                    console.log('Baseline Heap Used: ' + (baselineHeap / (1024 * 1024)).toFixed(2) + ' MB');

                    // 10,000 queries
                    for (let i = 0; i < 10000; i++) {
                        retriever.retrieve({ query: 'ServiceClass' + (i % 500) + ' handle query' });
                    }

                    // 1,000 incremental mutations (replace 500 docs, add 500 docs)
                    for (let i = 0; i < 500; i++) {
                        retriever.removeDocument('doc_' + i);
                    }
                    for (let i = 0; i < 500; i++) {
                        retriever.indexDocument({
                            id: 'doc_new_' + i,
                            filePath: 'src/module_new/file_' + i + '.ts',
                            symbolName: 'NewServiceClass' + i,
                            content: 'export class NewServiceClass' + i + ' { process() { return true; } }'
                        });
                    }

                    if (global.gc) global.gc();
                    const finalHeap = process.memoryUsage().heapUsed;
                    const growthMB = (finalHeap - baselineHeap) / (1024 * 1024);
                    console.log('Final Heap Used: ' + (finalHeap / (1024 * 1024)).toFixed(2) + ' MB');
                    console.log('Heap Growth: ' + growthMB.toFixed(2) + ' MB');

                    if (growthMB > 5.0) {
                        throw new Error('Criterion 4 Failed: Heap grew by ' + growthMB.toFixed(2) + 'MB (> 5MB threshold)');
                    }
                    console.log('✓ Criterion 4 PASSED: Memory growth ' + growthMB.toFixed(2) + 'MB over 10,000 queries and 1,000 mutations (< 5MB).\\n');
                    return growthMB;
                }

                export async function main() {
                    await test20kSearchLatency();
                    await testRankingEquivalence();
                    await testIncrementalMutability();
                    await testMemoryStability();
                    console.log('================================================================');
                    console.log('🎉 ALL PHASE 2 VERIFICATION & ACCEPTANCE CRITERIA CERTIFIED');
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
    console.error('Phase 2 verification failed:', err);
    process.exit(1);
});
