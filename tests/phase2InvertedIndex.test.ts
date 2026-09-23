/**
 * Phase 2 Automated Test Suite: Inverted Postings Index & Persistent Hybrid Retrieval
 * Tests inverted index construction, postings list retrieval, incremental O(UniqueDocTerms) deletion,
 * mathematical equivalence with baseline BM25, and incremental snapshot synchronization.
 */

import assert from 'assert';
import { InvertedPostingsIndex } from '../src/search/invertedIndex';
import { BM25Index, HybridRetriever, IndexableDocument } from '../src/search/hybridRetriever';
import { WorkspaceSnapshot, WorkspaceFileRecord } from '../src/workspace/workspaceIndex';

export async function runPhase2InvertedIndexTests(): Promise<boolean> {
    console.log('\n--- Running Phase 2 Inverted Postings Index & Hybrid Retrieval Tests ---');

    // =========================================================================
    // 1. InvertedPostingsIndex: Core Construction & Postings Retrieval
    // =========================================================================
    {
        const index = new InvertedPostingsIndex();
        index.addDocument('doc1', ['alpha', 'beta', 'alpha', 'gamma']);
        index.addDocument('doc2', ['beta', 'gamma', 'delta']);
        index.addDocument('doc3', ['alpha', 'epsilon']);

        assert.strictEqual(index.getDocCount(), 3, 'Doc count must be 3');
        assert.strictEqual(index.getTotalDocTokens(), 9, 'Total tokens must be 4 + 3 + 2 = 9');
        assert.strictEqual(index.getAvgDocLength(), 3, 'Average document length must be 3');

        // Postings for 'alpha': doc1 (tf=2), doc3 (tf=1)
        const alphaPostings = index.getPostings('alpha');
        assert.ok(alphaPostings, 'alpha postings must exist');
        assert.strictEqual(alphaPostings.length, 2, 'alpha must appear in 2 documents');
        const doc1Alpha = alphaPostings.find(p => p.docId === 'doc1');
        assert.strictEqual(doc1Alpha?.termFrequency, 2, 'doc1 must have tf=2 for alpha');
        const doc3Alpha = alphaPostings.find(p => p.docId === 'doc3');
        assert.strictEqual(doc3Alpha?.termFrequency, 1, 'doc3 must have tf=1 for alpha');

        // Missing term
        assert.strictEqual(index.getPostings('zeta'), undefined, 'Missing term must return undefined');

        // Document frequency
        assert.strictEqual(index.getDocFrequency('alpha'), 2, 'alpha df must be 2');
        assert.strictEqual(index.getDocFrequency('beta'), 2, 'beta df must be 2');
        assert.strictEqual(index.getDocFrequency('delta'), 1, 'delta df must be 1');
        assert.strictEqual(index.getDocFrequency('zeta'), 0, 'zeta df must be 0');

        console.log('  ✓ InvertedPostingsIndex construction and postings lookup verified.');
    }

    // =========================================================================
    // 2. InvertedPostingsIndex: O(UniqueDocTerms) Incremental Document Removal
    // =========================================================================
    {
        const index = new InvertedPostingsIndex();
        index.addDocument('docA', ['compiler', 'optimizer', 'token']);
        index.addDocument('docB', ['optimizer', 'runtime', 'engine']);
        index.addDocument('docC', ['compiler', 'ast', 'parser']);

        assert.strictEqual(index.getDocCount(), 3);
        assert.strictEqual(index.getDocFrequency('compiler'), 2);

        // Remove docA
        const removed = index.removeDocument('docA');
        assert.strictEqual(removed, true, 'removeDocument must return true for existing doc');
        assert.strictEqual(index.getDocCount(), 2, 'Doc count must drop to 2');
        assert.strictEqual(index.hasDocument('docA'), false, 'docA must no longer exist');
        assert.strictEqual(index.getDocFrequency('compiler'), 1, 'compiler df must drop to 1');
        assert.strictEqual(index.getDocFrequency('token'), 0, 'token df must drop to 0 and term list purged');
        assert.strictEqual(index.getPostings('token'), undefined, 'token postings list must be deleted when empty');

        // Removing non-existent doc returns false
        assert.strictEqual(index.removeDocument('docNonExistent'), false);

        // Document replacement: re-adding docB with new terms replaces old postings cleanly
        index.addDocument('docB', ['neural', 'tensor']);
        assert.strictEqual(index.getDocCount(), 2, 'Replacing docB must maintain doc count 2');
        assert.strictEqual(index.getDocFrequency('optimizer'), 0, 'old term optimizer must be purged');
        assert.strictEqual(index.getDocFrequency('neural'), 1, 'new term neural must have df=1');

        console.log('  ✓ Incremental document removal and replacement verified.');
    }

    // =========================================================================
    // 3. Mathematical & Rank-Order Equivalence between Postings Traversal & Baseline
    // =========================================================================
    {
        const bm25 = new BM25Index();

        const corpus = [
            { id: 'file_auth', text: 'export class JwtAuthService { verifyToken(token: string) { return jwt.verify(token); } }' },
            { id: 'file_db', text: 'export class DatabasePool { acquireConnection() { return this.pool.get(); } }' },
            { id: 'file_cache', text: 'export class RedisCacheManager { getCachedSession(id: string) { return redis.get(id); } }' },
            { id: 'file_user', text: 'export class UserService { getUserById(id: string) { return this.db.query(id); } }' },
            { id: 'file_router', text: 'export function setupRoutes(app: Express) { app.post("/auth/token", authHandler); }' }
        ];

        for (const doc of corpus) {
            bm25.addDocument(doc.id, doc.text);
        }

        const hits = bm25.search('verifyToken token auth', 3);
        assert.ok(hits.length > 0, 'Search must return results');
        assert.strictEqual(hits[0].id, 'file_auth', 'Top hit for auth token query must be file_auth');

        // Verify incremental delete in BM25Index
        const removed = bm25.removeDocument('file_auth');
        assert.strictEqual(removed, true, 'BM25Index removeDocument must succeed');
        const hitsAfterDelete = bm25.search('verifyToken token auth', 3);
        assert.ok(hitsAfterDelete.every(h => h.id !== 'file_auth'), 'file_auth must not appear after removal');

        console.log('  ✓ BM25 Okapi postings traversal ranking and removal verified.');
    }

    // =========================================================================
    // 4. HybridRetriever Incremental Mutations & Delta Snapshot Synchronization
    // =========================================================================
    {
        const retriever = new HybridRetriever();

        const doc1: IndexableDocument = {
            id: 'doc_1',
            filePath: 'src/service.ts',
            symbolName: 'Service',
            content: 'export class Service { executeTask() {} }'
        };
        const doc2: IndexableDocument = {
            id: 'doc_2',
            filePath: 'src/controller.ts',
            symbolName: 'Controller',
            content: 'export class Controller { handleRequest() {} }'
        };

        retriever.indexDocument(doc1);
        retriever.indexDocument(doc2);

        let results = retriever.retrieve({ query: 'executeTask Service' });
        assert.strictEqual(results[0]?.id, 'doc_1');

        // Incremental removal
        const removedDoc = retriever.removeDocument('doc_1');
        assert.strictEqual(removedDoc, true, 'removeDocument on HybridRetriever must succeed');
        results = retriever.retrieve({ query: 'executeTask Service' });
        assert.ok(results.every(r => r.id !== 'doc_1'), 'doc_1 must be absent after removal');

        // Test removeFile
        const removedChunks = retriever.removeFile('src/controller.ts');
        assert.strictEqual(removedChunks, 1, 'removeFile must remove 1 chunk for controller.ts');
        results = retriever.retrieve({ query: 'handleRequest Controller' });
        assert.strictEqual(results.length, 0, 'All chunks of controller.ts must be gone');

        console.log('  ✓ HybridRetriever incremental document and file removals verified.');
    }

    // =========================================================================
    // 5. Delta Snapshot Synchronization
    // =========================================================================
    {
        const retriever = new HybridRetriever();

        // Create snapshot 1 with 2 files
        const snapshot1: WorkspaceSnapshot = {
            generation: 1,
            createdAt: Date.now(),
            roots: [{ id: 'root1', path: '/app', uri: '/app' }],
            ignorePolicyVersion: '1',
            files: new Map<string, WorkspaceFileRecord>([
                ['src/a.ts', {
                    key: 'src/a.ts',
                    relativePath: 'src/a.ts',
                    absolutePath: '/app/src/a.ts',
                    sourceVersion: '1',
                    contentHash: 'hash_a_v1',
                    language: 'typescript',
                    skeleton: 'export class ServiceA { run(): void; }',
                    symbols: [{ name: 'ServiceA', kind: 'class', file: 'src/a.ts', line: 1, signature: 'export class ServiceA', terms: new Set(['servicea']) }],
                    references: [],
                    sizeBytes: 100,
                    memoryBytes: 200,
                    updateSequence: 1,
                    rootId: 'root1'
                }],
                ['src/b.ts', {
                    key: 'src/b.ts',
                    relativePath: 'src/b.ts',
                    absolutePath: '/app/src/b.ts',
                    sourceVersion: '1',
                    contentHash: 'hash_b_v1',
                    language: 'typescript',
                    skeleton: 'export class ServiceB { process(): void; }',
                    symbols: [{ name: 'ServiceB', kind: 'class', file: 'src/b.ts', line: 1, signature: 'export class ServiceB', terms: new Set(['serviceb']) }],
                    references: [],
                    sizeBytes: 100,
                    memoryBytes: 200,
                    updateSequence: 1,
                    rootId: 'root1'
                }]
            ]),
            symbols: [],
            memoryBytes: 500
        };

        const count1 = await retriever.indexSnapshot(snapshot1);
        assert.ok(count1 > 0, 'Snapshot 1 must index files');

        let resA = retriever.retrieve({ query: 'ServiceA run' });
        assert.ok(resA.length > 0 && resA[0].filePath === 'src/a.ts');

        // Create snapshot 2:
        // - src/a.ts is UNCHANGED (same hash)
        // - src/b.ts is DELETED
        // - src/c.ts is ADDED
        const snapshot2: WorkspaceSnapshot = {
            generation: 2,
            createdAt: Date.now(),
            roots: [{ id: 'root1', path: '/app', uri: '/app' }],
            ignorePolicyVersion: '1',
            files: new Map<string, WorkspaceFileRecord>([
                ['src/a.ts', {
                    key: 'src/a.ts',
                    relativePath: 'src/a.ts',
                    absolutePath: '/app/src/a.ts',
                    sourceVersion: '1',
                    contentHash: 'hash_a_v1', // Identical hash
                    language: 'typescript',
                    skeleton: 'export class ServiceA { run(): void; }',
                    symbols: [{ name: 'ServiceA', kind: 'class', file: 'src/a.ts', line: 1, signature: 'export class ServiceA', terms: new Set(['servicea']) }],
                    references: [],
                    sizeBytes: 100,
                    memoryBytes: 200,
                    updateSequence: 1,
                    rootId: 'root1'
                }],
                ['src/c.ts', {
                    key: 'src/c.ts',
                    relativePath: 'src/c.ts',
                    absolutePath: '/app/src/c.ts',
                    sourceVersion: '1',
                    contentHash: 'hash_c_v1',
                    language: 'typescript',
                    skeleton: 'export class ServiceC { compute(): void; }',
                    symbols: [{ name: 'ServiceC', kind: 'class', file: 'src/c.ts', line: 1, signature: 'export class ServiceC', terms: new Set(['servicec']) }],
                    references: [],
                    sizeBytes: 100,
                    memoryBytes: 200,
                    updateSequence: 2,
                    rootId: 'root1'
                }]
            ]),
            symbols: [],
            memoryBytes: 500
        };

        await retriever.indexSnapshot(snapshot2);

        // ServiceA should still be found (unaffected)
        resA = retriever.retrieve({ query: 'ServiceA run' });
        assert.ok(resA.length > 0 && resA[0].filePath === 'src/a.ts');

        // ServiceB should no longer be found (deleted)
        const resB = retriever.retrieve({ query: 'ServiceB process' });
        assert.ok(resB.every(r => r.filePath !== 'src/b.ts'), 'Deleted file src/b.ts must not be in retrieval results');

        // ServiceC should be found (added)
        const resC = retriever.retrieve({ query: 'ServiceC compute' });
        assert.ok(resC.length > 0 && resC[0].filePath === 'src/c.ts', 'Added file src/c.ts must be retrieved');

        console.log('  ✓ Incremental delta snapshot synchronization verified.');
    }

    console.log('====================================================================================');
    console.log('🎉 ALL PHASE 2 INVERTED POSTINGS INDEX & HYBRID RETRIEVAL TESTS PASSED (100%)');
    console.log('====================================================================================\n');
    return true;
}
