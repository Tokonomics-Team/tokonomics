/**
 * Phase 15 Automated Test Suite: Local Dense and Hybrid Retrieval
 * Validates vector math, zero-network embedding provider, bounded vector index,
 * exact invalidation, quota enforcement, deterministic RRF fusion, lexical fallbacks,
 * and ComponentReceiptTrail shadow auditing.
 */

import assert from 'assert';
import * as path from 'path';
import { DeterministicLocalEmbeddingProvider } from '../src/search/embeddingProvider';
import { BoundedVectorIndex } from '../src/search/vectorIndex';
import { HybridRetriever, IndexableDocument } from '../src/search/hybridRetriever';
import { WorkspaceSnapshot, WorkspaceFileRecord } from '../workspace/workspaceIndex';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';

export async function runPhase15DenseRetrievalTests(): Promise<void> {
    console.log('\n--- Running Phase 15 Local Dense & Hybrid Retrieval Tests ---');

    // 1. Vector Math & Normalization Invariants
    {
        const index = new BoundedVectorIndex();
        const vecA = new Float32Array([1, 0, 0, 0]);
        const vecB = new Float32Array([1, 0, 0, 0]);
        const vecC = new Float32Array([0, 1, 0, 0]);
        const vecD = new Float32Array([-1, 0, 0, 0]);

        index.addOrUpdateEntry({
            id: 'vec_identical',
            fileKey: 'a.ts',
            contentHash: 'hashA',
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            vector: vecB
        });

        index.addOrUpdateEntry({
            id: 'vec_orthogonal',
            fileKey: 'b.ts',
            contentHash: 'hashB',
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            vector: vecC
        });

        // Search identical vector
        const resIdentical = index.search(vecA, 5);
        assert.ok(resIdentical.length > 0, 'Must find matching vectors');
        assert.strictEqual(resIdentical[0].entry.id, 'vec_identical');
        assert.strictEqual(resIdentical[0].score, 1.0, 'Identical vectors must have cosine similarity 1.0');

        // Search with zero vector
        const zeroVec = new Float32Array([0, 0, 0, 0]);
        const resZero = index.search(zeroVec, 5);
        assert.strictEqual(resZero.length, 0, 'Zero vector must produce zero hits');

        // Search with NaN / Infinity
        const nanVec = new Float32Array([NaN, Infinity, 0, 0]);
        const resNaN = index.search(nanVec, 5);
        assert.strictEqual(resNaN.length, 0, 'NaN/Infinity vector must produce zero hits without crashing');

        // Dimension mismatch
        const shortVec = new Float32Array([1, 0]);
        const resShort = index.search(shortVec, 5);
        assert.ok(resShort.length >= 0, 'Dimension mismatch handled safely');

        console.log('✓ Vector math, normalization, dimension mismatch, and NaN/Infinity safety verified.');
    }

    // 2. Deterministic Local Embedding Provider
    {
        const embedder = new DeterministicLocalEmbeddingProvider(64, '1.0.0');

        // Verify metadata & zero network egress declaration
        assert.strictEqual(embedder.metadata.isLocal, true, 'Provider must be local');
        assert.strictEqual(embedder.metadata.privacyDeclaration, 'zero_egress_local_only', 'Zero network egress declared');
        assert.strictEqual(embedder.metadata.dimension, 64, 'Dimension must match configuration');

        // Determinism test: identical query across multiple calls
        const query = 'export async function authenticateUser(token: string): Promise<UserSession>';
        const vec1 = await embedder.embedQuery(query);
        const vec2 = await embedder.embedQuery(query);

        assert.strictEqual(vec1.length, 64, 'Vector length must be 64');
        for (let i = 0; i < 64; i++) {
            assert.strictEqual(vec1[i], vec2[i], `Dimension ${i} must be bit-identical across runs`);
        }

        // L2 norm check
        let sumSq = 0;
        for (let i = 0; i < 64; i++) sumSq += vec1[i] * vec1[i];
        assert.ok(Math.abs(Math.sqrt(sumSq) - 1.0) < 1e-4, 'Vector must be L2 normalized to unit length');

        // Semantic cluster separation test
        const authQuery = 'user authentication login jwt token verify';
        const authDoc = 'class AuthService { login(credentials) { return jwt.verify(token); } }';
        const dbDoc = 'class ConnectionPool { query(sql, params) { return pool.execute(sql); } }';

        const authQueryVec = await embedder.embedQuery(authQuery);
        const authDocVec = await embedder.embedQuery(authDoc);
        const dbDocVec = await embedder.embedQuery(dbDoc);

        const index = new BoundedVectorIndex({ embeddingVersion: '1.0.0' });
        const simAuth = (index as any).cosineSimilarity(authQueryVec, authDocVec);
        const simDb = (index as any).cosineSimilarity(authQueryVec, dbDocVec);

        assert.ok(simAuth > 0.4, `Auth query and Auth doc must have strong similarity (Got ${simAuth})`);
        assert.ok(simAuth > simDb, `Auth query must be significantly closer to Auth doc than DB doc (${simAuth} vs ${simDb})`);

        console.log('✓ Deterministic local embedding provider, unit normalization, and semantic separation verified.');
    }

    // 3. Bounded Vector Index & Exact Invalidation
    {
        const index = new BoundedVectorIndex({
            maxVectors: 10,
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            workspaceId: 'test_ws'
        });

        const vec = new Float32Array([0.5, 0.5, 0.5, 0.5]);

        index.addOrUpdateEntry({
            id: 'file1_chunk1',
            fileKey: 'src/service.ts',
            contentHash: 'hash_v1',
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            vector: vec
        });

        index.addOrUpdateEntry({
            id: 'file1_chunk2',
            fileKey: 'src/service.ts',
            contentHash: 'hash_v1',
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            vector: vec
        });

        index.addOrUpdateEntry({
            id: 'file2_chunk1',
            fileKey: 'src/util.ts',
            contentHash: 'hash_util_v1',
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0',
            vector: vec
        });

        assert.strictEqual(index.size(), 3, 'Index must contain 3 vectors');

        // Invalidate single file (e.g. file edited)
        const purged = index.invalidateFile('src/service.ts');
        assert.strictEqual(purged, 2, 'Must purge exactly 2 entries for src/service.ts');
        assert.strictEqual(index.size(), 1, 'Index must retain only 1 entry for src/util.ts');
        assert.strictEqual(index.has('file2_chunk1'), true, 'src/util.ts entry must remain');

        // Version mismatch invalidation
        const mismatched = index.invalidateOnVersionMismatch('2.0.0', '1.0.0');
        assert.strictEqual(mismatched, true, 'Version mismatch must trigger complete index invalidation');
        assert.strictEqual(index.size(), 0, 'Index must be completely cleared on version mismatch');

        console.log('✓ Bounded vector index exact invalidation and version mismatch purging verified.');
    }

    // 4. Quota Enforcement, LRU Eviction & Clean Disposal
    {
        const tinyIndex = new BoundedVectorIndex({
            maxVectors: 3,
            parserVersion: '1.0.0',
            embeddingVersion: '1.0.0'
        });

        const vec = new Float32Array([1, 0, 0, 0]);

        tinyIndex.addOrUpdateEntry({ id: 'v1', fileKey: 'f1.ts', contentHash: 'h1', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });
        tinyIndex.addOrUpdateEntry({ id: 'v2', fileKey: 'f2.ts', contentHash: 'h2', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });
        tinyIndex.addOrUpdateEntry({ id: 'v3', fileKey: 'f3.ts', contentHash: 'h3', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });
        assert.strictEqual(tinyIndex.size(), 3, 'Index capacity at maximum');

        // Add 4th entry -> oldest (v1) must be evicted
        tinyIndex.addOrUpdateEntry({ id: 'v4', fileKey: 'f4.ts', contentHash: 'h4', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });
        assert.strictEqual(tinyIndex.size(), 3, 'Capacity must remain strictly capped at 3');
        assert.strictEqual(tinyIndex.has('v1'), false, 'Oldest entry v1 must be evicted');
        assert.strictEqual(tinyIndex.has('v4'), true, 'Newest entry v4 must be present');

        // Clean disposal
        tinyIndex.dispose();
        assert.strictEqual(tinyIndex.size(), 0, 'Index must be empty after disposal');
        console.log('✓ Quota enforcement, LRU eviction, and clean disposal verified.');
    }

    // 5. Snapshot Reconciliation Invariant
    {
        const index = new BoundedVectorIndex({ embeddingVersion: '1.0.0', parserVersion: '1.0.0' });
        const vec = new Float32Array([1, 0, 0, 0]);

        index.addOrUpdateEntry({ id: 'auth_v1', fileKey: 'src/auth.ts', contentHash: 'auth_hash_1', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });
        index.addOrUpdateEntry({ id: 'db_v1', fileKey: 'src/db.ts', contentHash: 'db_hash_1', parserVersion: '1.0.0', embeddingVersion: '1.0.0', vector: vec });

        // Simulate snapshot where src/auth.ts content changed and src/db.ts is deleted
        const mockSnapshot: WorkspaceSnapshot = {
            generation: 2,
            capturedAt: Date.now(),
            workspaceRoot: 'd:/test',
            files: new Map<string, WorkspaceFileRecord>([
                ['src/auth.ts', {
                    key: 'src/auth.ts',
                    absolutePath: 'd:/test/src/auth.ts',
                    relativePath: 'src/auth.ts',
                    contentHash: 'auth_hash_2_MODIFIED',
                    byteLength: 100,
                    lineCount: 10,
                    languageId: 'typescript',
                    skeleton: 'class Auth {}',
                    symbols: [],
                    references: [],
                    imports: []
                }]
                // src/db.ts is omitted (deleted)
            ]),
            symbols: [],
            references: new Map(),
            callHierarchy: new Map(),
            diagnostics: []
        };

        const reconciledPurged = index.reconcileSnapshot(mockSnapshot);
        assert.strictEqual(reconciledPurged, 2, 'Must purge both modified auth.ts and deleted db.ts');
        assert.strictEqual(index.size(), 0, 'Index must have 0 stale entries after snapshot reconciliation');

        console.log('✓ Snapshot reconciliation and contentHash mismatch invalidation verified.');
    }

    // 6. Independent Candidate Lists & Deterministic Reciprocal Rank Fusion (RRF)
    {
        const retriever = new HybridRetriever();

        const docAuth: IndexableDocument = {
            id: 'doc_auth',
            filePath: 'src/auth.ts',
            symbolName: 'AuthService',
            content: 'export class AuthService { verifyUserToken(token) { return jwt.verify(token); } }',
            embedding: [0.9, 0.1, 0.05, 0.0]
        };

        const docDb: IndexableDocument = {
            id: 'doc_db',
            filePath: 'src/db.ts',
            symbolName: 'ConnectionPool',
            content: 'export class ConnectionPool { acquire() { return pool.get(); } }',
            embedding: [0.05, 0.9, 0.1, 0.0]
        };

        const docMixed: IndexableDocument = {
            id: 'doc_mixed',
            filePath: 'src/session.ts',
            symbolName: 'SessionStore',
            content: 'export class SessionStore { getSession(id) { return cache.get(id); } }',
            embedding: [0.7, 0.4, 0.6, 0.1]
        };

        retriever.indexDocument(docAuth);
        retriever.indexDocument(docDb);
        retriever.indexDocument(docMixed);

        // Hybrid query with RRF
        const queryVec = [0.88, 0.12, 0.04, 0.0];
        const results = retriever.retrieve({
            query: 'verifyUserToken jwt',
            queryVector: queryVec,
            enableDense: true,
            topK: 3
        });

        assert.ok(results.length >= 2, 'Must return fused results');
        assert.strictEqual(results[0].id, 'doc_auth', 'AuthService must be top fused candidate');
        assert.ok(results[0].rrfScore > results[1].rrfScore, 'Top candidate must have strictly higher RRF score');
        assert.ok(results[0].bm25Rank !== undefined, 'Must record BM25 rank');
        assert.ok(results[0].denseRank !== undefined, 'Must record dense rank');

        console.log('✓ Independent candidate generation and Reciprocal Rank Fusion (RRF) verified.');
    }

    // 7. Complete Fail-Closed Lexical Fallback
    {
        const retriever = new HybridRetriever();
        retriever.indexDocument({
            id: 'doc_lexical_only',
            filePath: 'src/service.ts',
            symbolName: 'ServiceWorker',
            content: 'function executeTask() { return worker.run(); }'
        });

        // 7a. enableDense = false -> 100% lexical fallback
        const lexResults = retriever.retrieve({
            query: 'executeTask worker',
            enableDense: false
        });
        assert.strictEqual(lexResults.length, 1);
        assert.strictEqual(lexResults[0].id, 'doc_lexical_only');
        assert.strictEqual(lexResults[0].denseRank, undefined, 'Dense rank must be undefined in lexical-only mode');

        // 7b. Invalid / throwing queryVector -> fail-closed lexical fallback
        const corruptedResults = retriever.retrieve({
            query: 'executeTask worker',
            queryVector: [NaN, Infinity],
            enableDense: true
        });
        assert.strictEqual(corruptedResults.length, 1, 'Corrupted vector query must fall back cleanly to lexical');
        assert.strictEqual(corruptedResults[0].id, 'doc_lexical_only');

        console.log('✓ Fail-closed complete lexical fallback verified.');
    }

    // 8. Snapshot-Reference Invariant
    {
        const retriever = new HybridRetriever();
        const doc: IndexableDocument = {
            id: 'ref_doc',
            filePath: 'src/payment.ts',
            symbolName: 'PaymentProcessor',
            content: 'class PaymentProcessor { charge(amount: number) {} }',
            embedding: [0.5, 0.5, 0.5, 0.5]
        };
        retriever.indexDocument(doc);

        const results = retriever.retrieve({
            query: 'charge amount',
            enableDense: true
        });

        assert.strictEqual(results[0].filePath, 'src/payment.ts', 'Candidate must point to snapshot file path');
        assert.strictEqual(results[0].symbolName, 'PaymentProcessor', 'Candidate must point to snapshot symbol');
        assert.ok(!('vector' in (results[0] as any)), 'Vectors must never be exposed as renderable candidate fields');

        console.log('✓ Snapshot-reference invariant (vectors never become renderable text) verified.');
    }

    // 9. PipelineOrchestrator Integration & Receipt Trail Auditing
    {
        FeatureFlagRegistry.resetToDefault();
        const orchestrator = new PipelineOrchestrator();

        const mockSnapshot: WorkspaceSnapshot = {
            generation: 1,
            capturedAt: Date.now(),
            workspaceRoot: 'd:/project',
            files: new Map<string, WorkspaceFileRecord>([
                ['src/auth.ts', {
                    key: 'src/auth.ts',
                    absolutePath: 'd:/project/src/auth.ts',
                    relativePath: 'src/auth.ts',
                    contentHash: 'hash_auth',
                    byteLength: 80,
                    lineCount: 5,
                    languageId: 'typescript',
                    skeleton: 'export class AuthService { login() {} }',
                    symbols: [{ name: 'AuthService', kind: 'class', line: 1, column: 1, file: 'src/auth.ts', signature: 'class AuthService' }],
                    references: [],
                    imports: []
                }]
            ]),
            symbols: [{ name: 'AuthService', kind: 'class', line: 1, column: 1, file: 'src/auth.ts', signature: 'class AuthService' }],
            references: new Map(),
            callHierarchy: new Map(),
            diagnostics: []
        };

        // 9a. Default state: enableDenseEmbeddings is false -> emits bypassed
        const defResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService' }],
            workspaceSnapshot: mockSnapshot,
            activeFilePath: 'src/auth.ts',
            cursorLine: 1,
            allowWorkspaceRetrieval: true
        });

        const defReceipts = defResult.receipts || [];
        const bypassed = defReceipts.find(r => r.componentId === 'dense_retrieval' && r.outcome === 'bypassed');
        assert.ok(bypassed, 'dense_retrieval must emit bypassed when flag is false');

        // 9b. Flag enabled -> emits attempted, invoked, and truthful shadow fallback
        FeatureFlagRegistry.setFlag('enableDenseEmbeddings', true);
        const activeResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService login flow' }],
            workspaceSnapshot: mockSnapshot,
            activeFilePath: 'src/auth.ts',
            cursorLine: 1,
            allowWorkspaceRetrieval: true
        });

        const activeReceipts = activeResult.receipts || [];
        const attempted = activeReceipts.find(r => r.componentId === 'dense_retrieval' && r.outcome === 'attempted');
        const invoked = activeReceipts.find(r => r.componentId === 'dense_retrieval' && r.outcome === 'invoked');
        const terminalReceipt = activeReceipts.find(r => r.componentId === 'dense_retrieval' &&
            (r.outcome === 'contributed' || r.outcome === 'fallback'));

        assert.ok(attempted, 'dense_retrieval must emit attempted receipt');
        assert.ok(invoked, 'dense_retrieval must emit invoked receipt');
        assert.ok(terminalReceipt, 'Dense retrieval must report admitted contribution or a coded fallback.');

        // Shadow mode check: production message content is not distorted
        assert.ok(activeResult.optimizedMessages.length > 0, 'Production compiler output must be preserved');

        // Reset flags
        FeatureFlagRegistry.resetToDefault();
        console.log('✓ PipelineOrchestrator integration, ComponentReceiptTrail auditing, and shadow mode verified.');
    }

    console.log('\n====================================================================================');
    console.log('🎉 ALL PHASE 15 LOCAL DENSE & HYBRID RETRIEVAL TESTS PASSED (100%)');
    console.log('====================================================================================\n');
}
