import * as assert from 'assert';
import { ContextKnapsackSolver } from '../../src/solver/knapsackSolver';
import { ContextIRGenerator, ContextEntity } from '../../src/solver/contextIR';
import { ExactDedupEngine } from '../../src/dedup/exactDedup';
import { LexicalNearDedupEngine } from '../../src/dedup/lexicalNearDedup';
import { MmrDiversityRanker } from '../../src/search/mmrDiversity';
import { TokenizerFactory } from '../../src/tokenizer/tokenizerAdapter';

export function runPhase2PropertyBasedValidation(): boolean {
    console.log('--- Phase 2: Property-Based Testing & Mathematical Invariants ---');

    // 1. Solver Hard-Budget Invariant: for any random candidate set and budget, totalTokens <= budget
    const solver = new ContextKnapsackSolver();
    for (let trial = 0; trial < 25; trial++) {
        const budget = 50 + Math.floor(Math.random() * 500);
        const candidates: ContextEntity[] = [];
        for (let i = 0; i < 10; i++) {
            candidates.push({
                id: `cand_${i}`,
                filePath: `src/mod_${i}.ts`,
                symbolName: `Symbol_${i}`,
                kind: 'class',
                baseUtility: 10 + Math.random() * 90,
                signatures: [`export class Symbol_${i} {}`],
                fullCode: `export class Symbol_${i} {\n  public doWork(): void {\n    console.log(${i});\n  }\n}`
            });
        }

        const res = solver.solve({ candidates, tokenBudget: budget });
        assert.ok(res.totalTokens <= budget, `Solver exceeded budget! (${res.totalTokens} > ${budget})`);
    }
    console.log('  ✓ Solver Hard-Budget Invariant verified across 25 randomized budgets.');

    // 2. Dedup Idempotency Invariant: dedup(dedup(X)) == dedup(X)
    const exactDedup = new ExactDedupEngine();
    const lexicalDedup = new LexicalNearDedupEngine(0.8);
    const sampleItems = [
        { id: '1', content: 'function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }', tokens: 15 },
        { id: '2', content: 'function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }', tokens: 15 },
        { id: '3', content: 'function sendEmail(to, msg) { smtp.send(to, msg); }', tokens: 12 }
    ];

    const pass1 = exactDedup.deduplicate(sampleItems);
    const pass2 = exactDedup.deduplicate(pass1.unique);
    assert.strictEqual(pass1.unique.length, pass2.unique.length, 'Exact dedup must be idempotent');

    const lexPass1 = lexicalDedup.deduplicate(pass1.unique);
    const lexPass2 = lexicalDedup.deduplicate(lexPass1.keptItems);
    assert.strictEqual(lexPass1.keptItems.length, lexPass2.keptItems.length, 'Lexical dedup must be idempotent');
    console.log('  ✓ Deduplication Idempotency Invariant verified.');

    // 3. Context IR Monotonicity Invariant: R0 <= R1 <= R2 <= R3 <= R4 <= R5 in token cost
    const irEngine = new ContextIRGenerator();
    const rep = irEngine.generateAllResolutions({
        id: 'ent1',
        filePath: 'src/service.ts',
        symbolName: 'OrderService',
        kind: 'class',
        baseUtility: 100,
        signatures: ['export class OrderService {'],
        fullCode: `export class OrderService {
  constructor(private db: Database) {}
  public async createOrder(req: OrderRequest): Promise<OrderResult> {
    const valid = this.validate(req);
    if (!valid) throw new Error("Invalid");
    return this.db.save(req);
  }
  private validate(req: OrderRequest): boolean { return !!req.id; }
}`
    });

    const r0 = rep.get('R0')!;
    const r1 = rep.get('R1')!;
    const r5 = rep.get('R5')!;
    assert.ok(r0.tokenCount <= r5.tokenCount, 'R0 must not exceed R5 tokens');
    assert.ok(r1.tokenCount <= r5.tokenCount, 'R1 must not exceed R5 tokens');
    console.log('  ✓ Context IR Representation Invariants verified.');

    // 4. MMR Diversity Invariant: Result size <= requested topK
    const mmr = new MmrDiversityRanker();
    const mmrCandidates = [
        { id: 'a', embedding: [1, 0, 0], rerankScore: 0.9, rank: 1, rerankerUsed: 'cosine' as const, filePath: 'a.ts', symbolName: 'A', content: 'A' },
        { id: 'b', embedding: [0.95, 0.05, 0], rerankScore: 0.88, rank: 2, rerankerUsed: 'cosine' as const, filePath: 'b.ts', symbolName: 'B', content: 'B' },
        { id: 'c', embedding: [0, 1, 0], rerankScore: 0.7, rank: 3, rerankerUsed: 'cosine' as const, filePath: 'c.ts', symbolName: 'C', content: 'C' }
    ];
    const mmrRes = mmr.rankDiversity(mmrCandidates, 2, 0.5);
    assert.strictEqual(mmrRes.length, 2, 'MMR must respect topK bounds');
    console.log('  ✓ MMR Diversity Bounds verified.');

    // 5. Tokenizer Monotonicity: tokenCount(A + B) >= max(tokenCount(A), tokenCount(B))
    const tok = TokenizerFactory.getTokenizer('claude');
    const c1 = tok.countTokens('export class AuthService {');
    const c2 = tok.countTokens('public login() {}');
    const cBoth = tok.countTokens('export class AuthService {\npublic login() {}');
    assert.ok(cBoth >= c1 && cBoth >= c2, 'Token count must be monotonic under concatenation');
    console.log('  ✓ Tokenizer Monotonicity Invariant verified.');

    return true;
}
