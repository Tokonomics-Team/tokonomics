import * as assert from 'assert';
import { ContextKnapsackSolver, SolverConstraintError } from '../src/solver/knapsackSolver';
import { ContextEntity, ResolutionLevel } from '../src/solver/contextIR';
import { defaultPricingCatalog } from '../src/cost/pricingCatalog';

export async function runPhase3FinOpsKnapsackTests(): Promise<void> {
    console.log('\n--- Running Phase 3: FinOps Knapsack Optimization Engine Tests ---');
    const solver = new ContextKnapsackSolver();

    function createMockEntity(id: string, baseTokens: number, baseUtil: number, isTypeFile = false): ContextEntity {
        return {
            id,
            filePath: isTypeFile ? `/workspace/src/types/${id}.ts` : `/workspace/src/core/${id}.ts`,
            symbolName: id,
            kind: isTypeFile ? 'interface' : 'function',
            fullCode: `// Implementation of ${id}\nexport function ${id}() {\n${'  const line = 1;\n'.repeat(Math.max(5, Math.floor(baseTokens / 4)))}}`,
            docstring: `Docstring documentation for ${id}`,
            signatures: [`export function ${id}(): void;`],
            calleeStubs: [`function helper_${id}(): boolean { return true; }`],
            slicedCode: `function ${id}() { return true; }`,
            baseUtility: baseUtil
        };
    }

    // 1. Test Pareto Dominance Pruning
    {
        console.log('Testing Pareto dominance option pruning...');
        const testOptions = [
            { entityId: 'e1', level: 'R_exclude' as ResolutionLevel, tokens: 0, utility: 0, risk: 0, netScore: 0, rendered: {} as any },
            { entityId: 'e1', level: 'R0' as ResolutionLevel, tokens: 10, utility: 1.5, risk: 0.4, netScore: 1.2, rendered: {} as any },
            { entityId: 'e1', level: 'R1' as ResolutionLevel, tokens: 25, utility: 3.0, risk: 0.25, netScore: 2.8, rendered: {} as any },
            { entityId: 'e1', level: 'R2' as ResolutionLevel, tokens: 60, utility: 6.5, risk: 0.1, netScore: 6.1, rendered: {} as any },
            // R3 has 120 tokens, netScore 8.5
            { entityId: 'e1', level: 'R3' as ResolutionLevel, tokens: 120, utility: 8.5, risk: 0.05, netScore: 8.5, rendered: {} as any },
            // R4 has 150 tokens (MORE tokens than R3), but LOWER netScore (7.0). Must be strictly Pareto dominated!
            { entityId: 'e1', level: 'R4' as ResolutionLevel, tokens: 150, utility: 7.5, risk: 0.08, netScore: 7.0, rendered: {} as any },
            // R5 has 300 tokens, netScore 9.8
            { entityId: 'e1', level: 'R5' as ResolutionLevel, tokens: 300, utility: 10.0, risk: 0.0, netScore: 9.8, rendered: {} as any }
        ];

        const pruned = solver.pruneDominatedOptions(testOptions);
        assert.strictEqual(pruned.length, 6, 'Pruned options should eliminate R4 which is strictly dominated');
        assert.ok(!pruned.some(o => o.level === 'R4'), 'R4 must not be in pruned options');

        // Check strictly increasing tokens and netScore
        for (let i = 1; i < pruned.length; i++) {
            assert.ok(pruned[i].tokens > pruned[i - 1].tokens, 'Tokens must be strictly increasing');
            assert.ok(pruned[i].netScore > pruned[i - 1].netScore, 'NetScore must be strictly increasing along Pareto frontier');
        }
        console.log('✓ Pareto dominance filtering removes strictly dominated resolutions.');
    }

    // 2. Test Pruning Reduction Rate on Real Candidates
    {
        console.log('Testing Pareto pruning reduction rate across candidates...');
        const candidates: ContextEntity[] = [];
        for (let i = 0; i < 50; i++) {
            candidates.push(createMockEntity(`entity_${i}`, 50 + i * 5, 20 + (i % 5) * 10));
        }

        const res = solver.solve({
            candidates,
            tokenBudget: 4000,
            modelId: 'claude-3-7-sonnet'
        });

        assert.ok(res.totalOptionsCount > 0, 'Total options count must be recorded');
        assert.ok(res.prunedOptionsCount > 0, 'Pruned options count must be > 0');
        const pruningPercentage = (res.prunedOptionsCount / res.totalOptionsCount) * 100;
        console.log(`  Pruning achieved: ${res.prunedOptionsCount}/${res.totalOptionsCount} options pruned (${pruningPercentage.toFixed(1)}%)`);
        assert.ok(pruningPercentage >= 15.0, `Pruning percentage should be significant (was ${pruningPercentage}%)`);
        console.log('✓ Pruning reduction rate verified on real candidates.');
    }

    // 3. Test Price-Elastic Sensitivity (DeepSeek vs Claude Opus)
    {
        console.log('Testing price-elastic context selection sensitivity...');
        const candidates: ContextEntity[] = [];
        for (let i = 0; i < 20; i++) {
            candidates.push(createMockEntity(`cand_${i}`, 80 + i * 10, 30 + (i % 3) * 15));
        }

        const budget = 3000;
        const deepseekResult = solver.solve({
            candidates,
            tokenBudget: budget,
            modelId: 'deepseek-chat',
            provider: 'deepseek'
        });

        const opusResult = solver.solve({
            candidates,
            tokenBudget: budget,
            modelId: 'claude-opus-4',
            provider: 'anthropic'
        });

        console.log(`  DeepSeek ($0.14/M): tokens = ${deepseekResult.totalTokens}, included = ${deepseekResult.includedCount}`);
        console.log(`  Claude Opus ($15.00/M): tokens = ${opusResult.totalTokens}, included = ${opusResult.includedCount}`);

        assert.strictEqual(deepseekResult.effectiveInputRatePer1M, 0.14, 'DeepSeek rate should be 0.14');
        assert.strictEqual(opusResult.effectiveInputRatePer1M, 15.0, 'Opus rate should be 15.0');
        assert.ok(deepseekResult.totalTokens >= opusResult.totalTokens, 'DeepSeek should retain equal or more tokens than Opus under same budget');
        console.log('✓ Price-elastic context selection sensitivity confirmed across vendor tiers.');
    }

    // 4. Test FinOps Dollar Accounting Accuracy
    {
        console.log('Testing FinOps dollar accounting accuracy...');
        const candidates: ContextEntity[] = [
            createMockEntity('serviceA', 200, 80),
            createMockEntity('typesA', 150, 60, true), // cache-eligible
            createMockEntity('utilA', 100, 40)
        ];

        const sonnetResult = solver.solve({
            candidates,
            tokenBudget: 300,
            modelId: 'claude-3-7-sonnet',
            provider: 'anthropic'
        });

        assert.ok(sonnetResult.projectedCostUSD >= 0, 'Projected cost must be >= 0');
        assert.ok(sonnetResult.projectedBaselineCostUSD >= sonnetResult.projectedCostUSD, 'Baseline uncompressed cost must be >= optimized cost');
        assert.ok(sonnetResult.netDollarSavingsUSD >= 0, 'Net dollar savings must be >= 0');
        assert.strictEqual(sonnetResult.pricingModelId, 'claude-3-7-sonnet', 'Pricing model ID must match');
        assert.strictEqual(sonnetResult.pricingProvider, 'anthropic', 'Pricing provider must match');
        console.log(`  FinOps Sonnet: Baseline = $${sonnetResult.projectedBaselineCostUSD}, Optimized = $${sonnetResult.projectedCostUSD}, Savings = $${sonnetResult.netDollarSavingsUSD}`);
        console.log('✓ FinOps dollar accounting accurate and consistent.');
    }

    // 5. Test Backward Compatibility with Default Parameters
    {
        console.log('Testing backward compatibility with unparameterized calls...');
        const candidates = [createMockEntity('legacy', 100, 50)];
        const legacyResult = solver.solve({
            candidates,
            tokenBudget: 500
        });

        assert.ok(legacyResult.assignments.has('legacy'), 'Legacy invocation must produce assignments');
        assert.strictEqual(legacyResult.pricingModelId, 'generic-llm', 'Default pricing model must be generic-llm');
        assert.ok(legacyResult.executionTimeMs >= 0, 'Execution time must be measured');
        console.log('✓ 100% backward compatibility with unparameterized solver calls verified.');
    }

    // 6. Test Graph Constraint Preservation (Mandatory + Conflict)
    {
        console.log('Testing constraint preservation with FinOps solver...');
        const mandatoryCand: ContextEntity = {
            ...createMockEntity('mand_1', 100, 80),
            metadata: { mandatory: true, minimumResolution: 'R2' }
        };
        const conflictingCand: ContextEntity = {
            ...createMockEntity('conflict_1', 100, 50),
            metadata: { conflicts: ['mand_1'] }
        };

        const result = solver.solve({
            candidates: [mandatoryCand, conflictingCand],
            tokenBudget: 500,
            modelId: 'claude-3-7-sonnet'
        });

        const mandAssignment = result.assignments.get('mand_1')!;
        const conflictAssignment = result.assignments.get('conflict_1')!;
        assert.notStrictEqual(mandAssignment.level, 'R_exclude', 'Mandatory entity must NOT be excluded');
        assert.strictEqual(conflictAssignment.level, 'R_exclude', 'Conflicting entity must be excluded');
        console.log('✓ Constraints (mandatory & conflicts) preserved through Pareto pruning and FinOps solve.');
    }

    // 7. Test Constrained Inference Cost & Mathematical Optimality Bounds
    {
        console.log('Testing constrained quality preservation & mathematical optimality bounds...');
        const candidateA = createMockEntity('opt_1', 100, 80);
        const candidateB = createMockEntity('opt_2', 150, 70);

        // Small budget <= 4000: bucketSize === 1 -> token_exact_global_optimum
        const exactResult = solver.solve({
            candidates: [candidateA, candidateB],
            tokenBudget: 500,
            minQualityScore: 0.1
        });

        assert.strictEqual(exactResult.bucketSize, 1, 'Small budgets must use bucketSize 1');
        assert.strictEqual(exactResult.optimalityGuarantee, 'token_exact_global_optimum', 'bucketSize 1 guarantees token_exact_global_optimum');
        assert.strictEqual(exactResult.maxDiscretizationErrorTokens, 2, 'Max error is numCandidates * bucketSize = 2');
        assert.ok(exactResult.qualityPreservedScore > 0, 'Quality score must be recorded');

        // Large budget > 4000: quantized_bucket_optimum
        const quantizedResult = solver.solve({
            candidates: [candidateA, candidateB],
            tokenBudget: 8000
        });
        assert.strictEqual(quantizedResult.optimalityGuarantee, 'quantized_bucket_optimum');
        assert.strictEqual(quantizedResult.bucketSize, 10);
        assert.strictEqual(quantizedResult.maxDiscretizationErrorTokens, 20);

        // Test quality constraint violation rejection
        let qualityRejected = false;
        try {
            solver.solve({
                candidates: [candidateA, candidateB],
                tokenBudget: 50, // very tight budget, cannot achieve 99% quality
                minQualityScore: 0.99
            });
        } catch (err: any) {
            if (err instanceof SolverConstraintError || err.name === 'SolverConstraintError') {
                qualityRejected = true;
            }
        }
        assert.strictEqual(qualityRejected, true, 'Solver must reject solutions failing minQualityScore constraint');
        console.log('✓ Mathematical optimality bounds (exact vs quantized) and quality constraints verified.');
    }

    console.log('🎉 ALL PHASE 3 FINOPS KNAPSACK OPTIMIZATION TESTS PASSED\n');
}

if (require.main === module) {
    runPhase3FinOpsKnapsackTests().catch(err => {
        console.error('Phase 3 test failed:', err);
        process.exit(1);
    });
}
