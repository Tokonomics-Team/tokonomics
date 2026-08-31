import * as assert from 'assert';
import { HybridRetriever, IndexableDocument } from '../../src/search/hybridRetriever';
import { MmrDiversityRanker } from '../../src/search/mmrDiversity';

export function runPhase10And11HybridRetrievalValidation(): boolean {
    console.log('--- Phase 10 & 11: Hybrid Retrieval Quality & MMR Determinism ---');

    const retriever = new HybridRetriever();
    const doc1: IndexableDocument = {
        id: 'auth_jwt',
        filePath: 'src/auth/jwtValidator.ts',
        symbolName: 'JwtValidator',
        content: 'export class JwtValidator { public verifyToken(token: string) { return jwt.verify(token); } }',
        embedding: [0.9, 0.1, 0.05, 0.0]
    };
    const doc2: IndexableDocument = {
        id: 'db_pool',
        filePath: 'src/database/connectionPool.ts',
        symbolName: 'ConnectionPool',
        content: 'export class ConnectionPool { public acquireConnection() { return this.pool.get(); } }',
        embedding: [0.05, 0.9, 0.1, 0.0]
    };

    retriever.indexDocument(doc1);
    retriever.indexDocument(doc2);

    // Benchmark Recall on targeted query
    const results = retriever.retrieve({
        query: 'jwt verifyToken',
        queryVector: [0.85, 0.15, 0.0, 0.0],
        topK: 2,
        enableDense: true
    });
    assert.ok(results.length > 0, 'Retrieval must return top candidates');
    assert.strictEqual(results[0].id, 'auth_jwt', 'Top result must be JwtValidator (Recall@1 = 1.0)');

    // MMR Ranking Determinism: identical input must yield identical ranking
    const mmr = new MmrDiversityRanker();
    const cands = [
        { id: 'x', rerankScore: 0.9, rank: 1, rerankerUsed: 'cosine' as const, embedding: [1, 0], filePath: 'x.ts', symbolName: 'X', content: 'X' },
        { id: 'y', rerankScore: 0.85, rank: 2, rerankerUsed: 'cosine' as const, embedding: [0.9, 0.1], filePath: 'y.ts', symbolName: 'Y', content: 'Y' }
    ];
    const r1 = mmr.rankDiversity(cands, 2, 0.7);
    const r2 = mmr.rankDiversity(cands, 2, 0.7);
    assert.deepStrictEqual(r1, r2, 'MMR must be strictly deterministic for identical inputs');

    console.log('  ✓ Hybrid retrieval Recall@1 and MMR determinism verified.');
    return true;
}
