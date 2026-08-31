/**
 * Phase 6 Unit Tests: Reranking, MMR Diversity, and 4-Tier Deduplication Suite
 */

import { CosineReranker, CrossEncoderReranker, HybridReranker, CandidateItem } from '../src/search/reranker';
import { MmrDiversityRanker } from '../src/search/mmrDiversity';
import { ExactDedupEngine } from '../src/dedup/exactDedup';
import { AstFingerprintEngine } from '../src/dedup/astFingerprint';
import { LexicalNearDedupEngine } from '../src/dedup/lexicalNearDedup';
import { EmbeddingSemanticDedupEngine } from '../src/dedup/semanticDedup';

export async function runRerankDedupTests(): Promise<boolean> {
    console.log('\n--- Running Phase 6 Reranking, MMR Diversity & 4-Tier Deduplication Tests ---');

    // 1. Test Rerankers
    const candidates: CandidateItem[] = [
        { id: 'item_1', filePath: 'src/a.ts', symbolName: 'SymbolA', content: 'auth token login validation', initialScore: 0.5, embedding: [0.9, 0.1, 0.0] },
        { id: 'item_2', filePath: 'src/b.ts', symbolName: 'SymbolB', content: 'database pool connection', initialScore: 0.8, embedding: [0.1, 0.9, 0.0] },
        { id: 'item_3', filePath: 'src/c.ts', symbolName: 'SymbolC', content: 'auth session verify', initialScore: 0.4, embedding: [0.85, 0.15, 0.0] }
    ];

    const cosineReranker = new CosineReranker();
    const crossReranker = new CrossEncoderReranker(false); // test fallback
    const hybridReranker = new HybridReranker();

    const queryVec = [0.95, 0.05, 0.0];
    const cosineRanked = await cosineReranker.rank('auth token', candidates, queryVec);
    const crossRanked = await crossReranker.rank('auth token', candidates, queryVec);
    const hybridRanked = await hybridReranker.rank('auth token', candidates, queryVec);

    if (cosineRanked[0].id !== 'item_1' || crossRanked[0].id !== 'item_1' || hybridRanked[0].id !== 'item_1') {
        throw new Error('Rerankers failed to prioritize top semantic match item_1');
    }

    console.log(`[Reranker] Top match: ${cosineRanked[0].symbolName} (Cosine Score: ${cosineRanked[0].rerankScore}, Reranker: ${crossRanked[0].rerankerUsed})`);
    console.log('✓ Reranker (Cosine, CrossEncoder, Hybrid) verified.');

    // 2. Test MMR Diversity
    const mmr = new MmrDiversityRanker();
    const mmrRanked = mmr.rankDiversity(cosineRanked, 3, 0.3);

    if (mmrRanked[1].id !== 'item_2') {
        throw new Error(`MMR Diversity failed to promote diverse item_2 (Got order: ${mmrRanked.map(r => r.id).join(', ')})`);
    }

    console.log(`[MMR Diversity] Re-ordered candidates: ${mmrRanked.map(r => r.symbolName).join(' ➔ ')}`);
    console.log('✓ MMR Diversity Ranker verified.');

    // 3. Test Exact Dedup (Tier 1)
    const exactDedup = new ExactDedupEngine();
    const dedupRes = exactDedup.deduplicate([
        { id: 'd1', content: 'function calculate() { return 42; }', tokens: 10 },
        { id: 'd2', content: 'function calculate() { return 42; }', tokens: 10 },
        { id: 'd3', content: 'function unique() { return 100; }', tokens: 10 }
    ]);

    if (dedupRes.unique.length !== 2 || dedupRes.duplicates.length !== 1 || dedupRes.totalTokensSaved !== 10) {
        throw new Error(`Exact dedup failed (Got: ${JSON.stringify(dedupRes)})`);
    }
    console.log(`[Exact Dedup (Tier 1)] Saved ${dedupRes.totalTokensSaved} tokens from verbatim duplicate`);
    console.log('✓ ExactDedupEngine verified.');

    // 4. Test AST Structural Fingerprinting (Tier 2)
    const astFp = new AstFingerprintEngine();
    const codeA = 'function computeTotal(price: number, tax: number): number { return price + tax; }';
    const codeB = 'function calculateSum(a: number, b: number): number { return a + b; }';
    const codeC = 'function findMax(list: number[]): number { return Math.max(...list); }';

    const isIsomorphicAB = astFp.areIsomorphic(codeA, codeB);
    const isIsomorphicAC = astFp.areIsomorphic(codeA, codeC);

    if (!isIsomorphicAB || isIsomorphicAC) {
        throw new Error(`AST Structural Fingerprinting failed (AB: ${isIsomorphicAB}, AC: ${isIsomorphicAC})`);
    }
    console.log('✓ AstFingerprintEngine isomorphic detection (Tier 2) verified.');

    // 5. Test Lexical Near-Duplicate Shingling (Tier 3)
    const lexicalDedup = new LexicalNearDedupEngine(0.70);
    const lexRes = lexicalDedup.deduplicate([
        { id: 'l1', content: 'The quick brown fox jumps over the lazy dog and runs quickly.', tokens: 15 },
        { id: 'l2', content: 'The quick brown fox jumps over the lazy dog and runs very quickly.', tokens: 16 },
        { id: 'l3', content: 'Database pool connection initialized on port 5432 successfully.', tokens: 10 }
    ]);

    if (lexRes.keptItems.length !== 2 || lexRes.culledDuplicates.length !== 1) {
        throw new Error(`Lexical near-dedup failed (Got: ${JSON.stringify(lexRes)})`);
    }
    console.log(`[Lexical Dedup (Tier 3)] Culled near-duplicate '${lexRes.culledDuplicates[0].duplicateId}' (Jaccard: ${lexRes.culledDuplicates[0].jaccardSimilarity})`);
    console.log('✓ LexicalNearDedupEngine verified.');

    // 6. Test Embedding-Based Semantic Dedup (Tier 4)
    const semDedup = new EmbeddingSemanticDedupEngine(0.90);
    const semRes = semDedup.deduplicate([
        { id: 's1', content: 'auth.login(u, p)', tokens: 25, embedding: [0.95, 0.05, 0.0] },
        { id: 's2', content: 'auth.login(u, p) with comments', tokens: 25, embedding: [0.94, 0.06, 0.0] },
        { id: 's3', content: 'view.render()', tokens: 15, embedding: [0.1, 0.9, 0.0] }
    ]);

    if (semRes.keptItems.length !== 2 || semRes.culledDuplicates.length !== 1) {
        throw new Error(`Semantic dedup failed (Got: ${JSON.stringify(semRes)})`);
    }
    console.log(`[Embedding Semantic Dedup (Tier 4)] Culled duplicate '${semRes.culledDuplicates[0].duplicateId}' (Cosine: ${semRes.culledDuplicates[0].cosineSimilarity})`);
    console.log('✓ EmbeddingSemanticDedupEngine verified.');

    return true;
}
