/**
 * Phase 5 Unit Tests: Hybrid Retrieval Engine (BM25 + Dense Vectors + RRF Fusion)
 */

import { HybridRetriever, IndexableDocument } from '../src/search/hybridRetriever';

export function runHybridRetrieverTests(): boolean {
    console.log('\n--- Running Phase 5 Hybrid Retrieval & RRF Fusion Tests ---');

    const retriever = new HybridRetriever();

    const doc1: IndexableDocument = {
        id: 'auth_jwt',
        filePath: 'src/auth/jwtValidator.ts',
        symbolName: 'JwtValidator',
        content: 'export class JwtValidator { public verifyToken(token: string) { return jwt.verify(token); } }',
        embedding: [0.9, 0.1, 0.05, 0.0] // High semantic match for auth
    };

    const doc2: IndexableDocument = {
        id: 'db_pool',
        filePath: 'src/database/connectionPool.ts',
        symbolName: 'ConnectionPool',
        content: 'export class ConnectionPool { public acquireConnection() { return this.pool.get(); } }',
        embedding: [0.05, 0.9, 0.1, 0.0] // High semantic match for DB
    };

    const doc3: IndexableDocument = {
        id: 'cache_redis',
        filePath: 'src/cache/redisStore.ts',
        symbolName: 'RedisStore',
        content: 'export class RedisStore { public getCachedSession(sessionId: string) { return redis.get(sessionId); } }',
        embedding: [0.6, 0.4, 0.8, 0.1] // Mixed match
    };

    retriever.indexDocument(doc1);
    retriever.indexDocument(doc2);
    retriever.indexDocument(doc3);

    // 1. Test Lexical BM25 Only (Deterministic Fallback / No-ML Core)
    const bm25OnlyResults = retriever.retrieve({
        query: 'verifyToken JwtValidator',
        enableDense: false
    });

    if (bm25OnlyResults.length === 0 || bm25OnlyResults[0].id !== 'auth_jwt') {
        throw new Error(`BM25 Lexical retrieval failed (Got: ${JSON.stringify(bm25OnlyResults)})`);
    }
    console.log(`[Hybrid Retriever] BM25 Lexical Top Hit: ${bm25OnlyResults[0].symbolName} (BM25 Score: ${bm25OnlyResults[0].bm25Score})`);

    // 2. Test Dense Vector Cosine Matching
    const queryVectorAuth = [0.88, 0.12, 0.04, 0.0];
    const denseResults = retriever.retrieve({
        query: 'authentication token validator',
        queryVector: queryVectorAuth,
        enableDense: true
    });

    if (denseResults.length === 0 || denseResults[0].id !== 'auth_jwt') {
        throw new Error(`Dense Cosine retrieval failed (Got: ${JSON.stringify(denseResults)})`);
    }
    console.log(`[Hybrid Retriever] Dense Top Hit: ${denseResults[0].symbolName} (Dense Score: ${denseResults[0].denseScore})`);

    // 3. Test Reciprocal Rank Fusion (RRF)
    const rrfResults = retriever.retrieve({
        query: 'acquireConnection pool',
        queryVector: [0.05, 0.85, 0.1, 0.0],
        enableDense: true,
        rrfK: 60
    });

    if (rrfResults.length === 0 || rrfResults[0].id !== 'db_pool') {
        throw new Error(`RRF Fusion retrieval failed (Got: ${JSON.stringify(rrfResults)})`);
    }

    console.log(`[Hybrid Retriever] RRF Fused Top Hit: ${rrfResults[0].symbolName} (RRF Score: ${rrfResults[0].rrfScore}, BM25 Rank: ${rrfResults[0].bm25Rank}, Dense Rank: ${rrfResults[0].denseRank})`);
    console.log('✓ Hybrid Retrieval (BM25 + Dense + RRF) verified.');

    return true;
}
