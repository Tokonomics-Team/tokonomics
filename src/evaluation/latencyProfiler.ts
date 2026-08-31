/**
 * Tokonomics Latency Breakdown & Percentile Profiler
 * Measures multi-stage execution latency across Cold and Warm execution profiles.
 */

import { PipelineOrchestrator } from '../engine/pipelineOrchestrator';
import { BM25Index, DenseVectorIndex } from '../search/hybridRetriever';
import { MmrDiversityRanker } from '../search/mmrDiversity';
import { ExactDedupEngine } from '../dedup/exactDedup';
import { SufficiencyEngine } from '../engine/sufficiencyEngine';
import { SystemDependenceGraph } from '../ast/systemDependenceGraph';
import { ContextKnapsackSolver } from '../solver/knapsackSolver';
import { RuleBasedCompressor } from '../compression/compressionProvider';
import { TokenCounter } from '../engine/tokenizer';
import { CachePlanner } from '../cache/cachePlanner';
import { CLAUDE_SONNET_PROFILE } from '../tokenizer/modelProfile';
import { ContextEntity } from '../solver/contextIR';

export interface StageLatencyMetrics {
    stageName: string;
    coldMs: number;
    warmP50Ms: number;
    warmP90Ms: number;
    warmP95Ms: number;
    warmP99Ms: number;
    meanMs: number;
}

export interface LatencyReport {
    measurementDate: string;
    totalWarmIterations: number;
    stages: StageLatencyMetrics[];
    totalCompilerColdMs: number;
    totalCompilerWarmP50Ms: number;
    totalCompilerWarmP90Ms: number;
    totalCompilerWarmP95Ms: number;
    totalCompilerWarmP99Ms: number;
}

export class LatencyBreakdownProfiler {
    public static async profileAllStages(iterations: number = 100): Promise<LatencyReport> {
        const stages: StageLatencyMetrics[] = [];

        // 1. Activation Simulation
        const actWarm: number[] = [];
        const tActColdStart = performance.now();
        const initOrchestrator = new PipelineOrchestrator();
        const actCold = performance.now() - tActColdStart;
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            const orch = new PipelineOrchestrator();
            actWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Activation', actCold, actWarm));

        // 2. Lexical Retrieval (BM25)
        const bm25 = new BM25Index();
        for (let d = 0; d < 200; d++) {
            bm25.addDocument(`doc_${d}`, `class Service${d} { execute() { return ${d}; } auth validation token database}`);
        }
        const tBm25Cold = performance.now();
        bm25.search('auth validation token', 10);
        const bm25Cold = performance.now() - tBm25Cold;
        const bm25Warm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            bm25.search('auth validation token', 10);
            bm25Warm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Lexical Retrieval (BM25)', bm25Cold, bm25Warm));

        // 3. Dense Vector Retrieval
        const dense = new DenseVectorIndex();
        for (let d = 0; d < 200; d++) {
            dense.addVector(`vec_${d}`, [Math.sin(d), Math.cos(d), Math.sin(d * 2), Math.cos(d * 2)]);
        }
        const tDenseCold = performance.now();
        dense.search([0.5, 0.5, 0.5, 0.5], 10);
        const denseCold = performance.now() - tDenseCold;
        const denseWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            dense.search([0.5, 0.5, 0.5, 0.5], 10);
            denseWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Dense Vector Search', denseCold, denseWarm));

        // 4. Reranking & MMR Diversity
        const mmr = new MmrDiversityRanker();
        const cands = Array.from({ length: 30 }).map((_, idx) => ({
            id: `cand_${idx}`,
            rerankScore: 0.9 - idx * 0.01,
            rank: idx + 1,
            rerankerUsed: 'cosine' as const,
            embedding: [Math.sin(idx), Math.cos(idx), 0.1, 0.2],
            filePath: `src/f_${idx}.ts`,
            symbolName: `Sym_${idx}`,
            content: `export class Sym_${idx} {}`
        }));
        const tMmrCold = performance.now();
        mmr.rankDiversity(cands, 10, 0.7);
        const mmrCold = performance.now() - tMmrCold;
        const mmrWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            mmr.rankDiversity(cands, 10, 0.7);
            mmrWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Reranking & MMR Diversity', mmrCold, mmrWarm));

        // 5. Deduplication Suite (Exact + Structural)
        const dedup = new ExactDedupEngine();
        const dedupItems = Array.from({ length: 50 }).map((_, idx) => ({
            id: `item_${idx}`,
            content: `export function helper_${idx % 5}() { return ${idx % 5}; }`,
            tokens: 20
        }));
        const tDedupCold = performance.now();
        dedup.deduplicate(dedupItems);
        const dedupCold = performance.now() - tDedupCold;
        const dedupWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            dedup.deduplicate(dedupItems);
            dedupWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Deduplication Suite', dedupCold, dedupWarm));

        // 6. Context Sufficiency & Stopping Rules
        const sufficiency = new SufficiencyEngine();
        const prof = sufficiency.buildTaskProfile('debug', 'Fix null pointer in AuthService', ['AuthService'], true);
        const entities = [
            { id: 'e1', filePath: 'src/a.ts', symbolName: 'AuthService', kind: 'class', content: 'class AuthService {}' },
            { id: 'e2', filePath: 'terminal', symbolName: 'Diag', kind: 'diagnostic', content: 'Null pointer at src/a.ts:10' }
        ];
        const tSuffCold = performance.now();
        sufficiency.evaluateSufficiency(prof, entities as any);
        const suffCold = performance.now() - tSuffCold;
        const suffWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            sufficiency.evaluateSufficiency(prof, entities as any);
            suffWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Sufficiency Stopping Rules', suffCold, suffWarm));

        // 7. SDG Program Slicing
        const sdg = new SystemDependenceGraph();
        const codeSample = `
export class OrderProcessor {
  public process(order: Order): double {
    const taxRate = 0.08;
    const basePrice = order.price;
    const isDiscounted = order.hasCoupon;
    console.log("log_123");
    let finalPrice = basePrice * (1 + taxRate);
    if (isDiscounted) finalPrice = finalPrice * 0.9;
    return finalPrice;
  }
}`;
        const tSdgCold = performance.now();
        sdg.computeBackwardSlice(codeSample, 10, 'finalPrice');
        const sdgCold = performance.now() - tSdgCold;
        const sdgWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            sdg.computeBackwardSlice(codeSample, 10, 'finalPrice');
            sdgWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('SDG Program Slicing', sdgCold, sdgWarm));

        // 8. Multi-Choice Knapsack Solver (N=50 candidates)
        const solver = new ContextKnapsackSolver();
        const solverCands: ContextEntity[] = Array.from({ length: 50 }).map((_, idx) => ({
            id: `entity_${idx}`,
            filePath: `src/mod_${idx}.ts`,
            symbolName: `Class_${idx}`,
            kind: 'class',
            baseUtility: 50 + (idx % 50),
            signatures: [`class Class_${idx}`],
            fullCode: `class Class_${idx} { run() { return ${idx}; } }`
        }));
        const tSolverCold = performance.now();
        solver.solve({ candidates: solverCands, tokenBudget: 2000 });
        const solverCold = performance.now() - tSolverCold;
        const solverWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            solver.solve({ candidates: solverCands, tokenBudget: 2000 });
            solverWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Context Knapsack Solver', solverCold, solverWarm));

        // 9. Semantic Compression
        const compressor = new RuleBasedCompressor();
        const rawProse = "In order to ensure that the system executes properly, please make sure that the database is initialized.";
        const tCompCold = performance.now();
        await compressor.compress(rawProse);
        const compCold = performance.now() - tCompCold;
        const compWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            await compressor.compress(rawProse);
            compWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Semantic Compression', compCold, compWarm));

        // 10. Cache Planner
        const cachePlanner = new CachePlanner();
        const tCacheCold = performance.now();
        cachePlanner.planContext({ systemPrompt: 'System instructions', userQuery: 'User task', profile: CLAUDE_SONNET_PROFILE });
        const cacheCold = performance.now() - tCacheCold;
        const cacheWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            cachePlanner.planContext({ systemPrompt: 'System instructions', userQuery: 'User task', profile: CLAUDE_SONNET_PROFILE });
            cacheWarm.push(performance.now() - t0);
        }
        stages.push(this.calcMetrics('Cache Planner', cacheCold, cacheWarm));

        // 11. Full End-to-End Compiler Pipeline
        const orchestrator = new PipelineOrchestrator();
        const compilePayload = {
            messages: [{ role: 'user' as const, content: 'Refactor UserService session validation:\n```typescript\n' + codeSample + '\n```' }],
            maxTokenBudget: 2500,
            userIntent: 'refactor'
        };
        const tFullCold = performance.now();
        await orchestrator.compileContext(compilePayload);
        const fullCold = performance.now() - tFullCold;
        const fullWarm: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            await orchestrator.compileContext(compilePayload);
            fullWarm.push(performance.now() - t0);
        }
        const fullMetrics = this.calcMetrics('Total Optimization Pipeline', fullCold, fullWarm);
        stages.push(fullMetrics);

        return {
            measurementDate: new Date().toISOString().split('T')[0],
            totalWarmIterations: iterations,
            stages,
            totalCompilerColdMs: Math.round(fullCold * 100) / 100,
            totalCompilerWarmP50Ms: fullMetrics.warmP50Ms,
            totalCompilerWarmP90Ms: fullMetrics.warmP90Ms,
            totalCompilerWarmP95Ms: fullMetrics.warmP95Ms,
            totalCompilerWarmP99Ms: fullMetrics.warmP99Ms
        };
    }

    private static calcMetrics(stageName: string, coldMs: number, warmLatencies: number[]): StageLatencyMetrics {
        const sorted = [...warmLatencies].sort((a, b) => a - b);
        const n = sorted.length;
        const p50 = sorted[Math.floor(n * 0.50)];
        const p90 = sorted[Math.floor(n * 0.90)];
        const p95 = sorted[Math.floor(n * 0.95)];
        const p99 = sorted[Math.floor(n * 0.99)];
        const mean = sorted.reduce((a, b) => a + b, 0) / n;

        return {
            stageName,
            coldMs: Math.round(coldMs * 100) / 100,
            warmP50Ms: Math.round(p50 * 100) / 100,
            warmP90Ms: Math.round(p90 * 100) / 100,
            warmP95Ms: Math.round(p95 * 100) / 100,
            warmP99Ms: Math.round(p99 * 100) / 100,
            meanMs: Math.round(mean * 100) / 100
        };
    }
}
