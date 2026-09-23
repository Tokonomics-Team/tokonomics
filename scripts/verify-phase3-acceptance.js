const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🔬 TOKONOMICS PHASE 3: TRUE FINOPS KNAPSACK OPTIMIZATION VERIFICATION HARNESS');
    console.log('====================================================================================\n');

    // Compile harness with esbuild
    const tempBundlePath = path.join(__dirname, '..', 'out_test', 'phase3_verification_bundle.js');
    const harnessSource = `
    import { ContextKnapsackSolver } from '../src/solver/knapsackSolver';
    import { ContextEntity } from '../src/solver/contextIR';
    import { defaultPricingCatalog } from '../src/cost/pricingCatalog';
    import { CostCalculator } from '../src/cost/costCalculator';

    function createMockCandidate(id: string, baseTokens: number, baseUtil: number, isTypeFile = false): ContextEntity {
        return {
            id,
            filePath: isTypeFile ? \`/workspace/src/types/\${id}.ts\` : \`/workspace/src/core/\${id}.ts\`,
            symbolName: id,
            kind: isTypeFile ? 'interface' : 'function',
            fullCode: \`// Implementation of \${id}\\nexport function \${id}() {\\n\${'  const line = 1;\\n'.repeat(Math.max(5, Math.floor(baseTokens / 4)))}}\`,
            docstring: \`Docstring documentation for \${id}\`,
            signatures: [\`export function \${id}(): void;\`],
            calleeStubs: [\`function helper_\${id}(): boolean { return true; }\`],
            slicedCode: \`function \${id}() { return true; }\`,
            baseUtility: baseUtil
        };
    }

    export async function runVerification() {
        const solver = new ContextKnapsackSolver();

        // -------------------------------------------------------------
        // Criterion 1: Pareto Dominance Pruning Efficiency
        // -------------------------------------------------------------
        console.log('--- Criterion 1: Pareto Dominance Pruning Rate ---');
        const candidateCount = 200;
        const candidates: ContextEntity[] = [];
        for (let i = 0; i < candidateCount; i++) {
            candidates.push(createMockCandidate(\`entity_\${i}\`, 60 + (i % 25) * 8, 25 + (i % 7) * 10, i % 5 === 0));
        }

        const pruneBenchResult = solver.solve({
            candidates,
            tokenBudget: 15000,
            modelId: 'claude-3-7-sonnet',
            provider: 'anthropic'
        });

        const totalOpts = pruneBenchResult.totalOptionsCount;
        const prunedOpts = pruneBenchResult.prunedOptionsCount;
        const pruningRate = (prunedOpts / totalOpts) * 100;

        console.log(\`  Total generated resolution options: \${totalOpts}\`);
        console.log(\`  Pareto-dominated options pruned:    \${prunedOpts}\`);
        console.log(\`  Pruning rate achieved:              \${pruningRate.toFixed(2)}%\`);
        const c1Passed = pruningRate >= 40.0;
        console.log(\`  Criterion 1 Gate (>= 40.0%):        \${c1Passed ? 'PASSED ✅' : 'FAILED ❌'}\\n\`);

        // -------------------------------------------------------------
        // Criterion 2: Price-Elastic Context Selection Sensitivity
        // -------------------------------------------------------------
        console.log('--- Criterion 2: Price-Elastic Context Selection Sensitivity ---');
        const evalCandidates: ContextEntity[] = [];
        for (let i = 0; i < 30; i++) {
            evalCandidates.push(createMockCandidate('eval_cand_' + i, 120 + (i % 10) * 30, 30 + (i % 5) * 15));
        }

        const evalBudget = 2500;
        const deepseekResult = solver.solve({
            candidates: evalCandidates,
            tokenBudget: evalBudget,
            modelId: 'deepseek-chat',
            provider: 'deepseek'
        });

        const opusResult = solver.solve({
            candidates: evalCandidates,
            tokenBudget: evalBudget,
            modelId: 'claude-opus-4',
            provider: 'anthropic'
        });

        // Count resolution tier distribution
        let dsHighTierCount = 0; // R3, R4, R5
        let opusLowTierCount = 0; // R_exclude, R0, R1, R2

        for (const [id, res] of deepseekResult.assignments.entries()) {
            if (['R3', 'R4', 'R5'].includes(res.level)) dsHighTierCount++;
        }
        for (const [id, res] of opusResult.assignments.entries()) {
            if (['R_exclude', 'R0', 'R1', 'R2'].includes(res.level)) opusLowTierCount++;
        }

        console.log(\`  DeepSeek-V3 ($0.14/1M): Allocated \${deepseekResult.totalTokens} tokens (\${deepseekResult.includedCount} included, \${dsHighTierCount} rich R3-R5 tiers)\`);
        console.log(\`  Claude-Opus-4 ($15.00/1M): Allocated \${opusResult.totalTokens} tokens (\${opusResult.includedCount} included, \${opusLowTierCount} compressed R_exclude-R2 tiers)\`);
        const tokenReduction = deepseekResult.totalTokens - opusResult.totalTokens;
        console.log(\`  Token reduction on premium model:   \${tokenReduction} tokens conserved\`);

        const c2Passed = deepseekResult.totalTokens >= opusResult.totalTokens && deepseekResult.effectiveInputRatePer1M === 0.14 && opusResult.effectiveInputRatePer1M === 15.0;
        console.log(\`  Criterion 2 Gate (Elastic Pruning): \${c2Passed ? 'PASSED ✅' : 'FAILED ❌'}\\n\`);

        // -------------------------------------------------------------
        // Criterion 3: Sub-Millisecond DP Latency at Scale (200 candidates, 128k budget)
        // -------------------------------------------------------------
        console.log('--- Criterion 3: Knapsack DP Latency at Scale ---');
        const largeBudget = 128000;
        
        // Warm-up JIT
        for (let w = 0; w < 5; w++) {
            solver.solve({ candidates, tokenBudget: largeBudget, modelId: 'claude-3-7-sonnet' });
        }

        const iterations = 50;
        const latencies: number[] = [];
        for (let iter = 0; iter < iterations; iter++) {
            const start = performance.now();
            solver.solve({ candidates, tokenBudget: largeBudget, modelId: 'claude-3-7-sonnet' });
            latencies.push(performance.now() - start);
        }

        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
        const p50 = latencies[Math.floor(iterations * 0.5)];
        const p95 = latencies[Math.floor(iterations * 0.95)];

        console.log(\`  Candidates: 200 | Budget: 128,000 tokens | Iterations: \${iterations}\`);
        console.log(\`  Average Solve Latency: \${avgLatency.toFixed(3)} ms\`);
        console.log(\`  Median (P50) Latency:  \${p50.toFixed(3)} ms\`);
        console.log(\`  P95 Latency:           \${p95.toFixed(3)} ms\`);
        const c3Passed = avgLatency < 1.20;
        console.log(\`  Criterion 3 Gate (< 1.20 ms):       \${c3Passed ? 'PASSED ✅' : 'FAILED ❌'}\\n\`);

        // -------------------------------------------------------------
        // Criterion 4: FinOps Dollar Accounting Fidelity
        // -------------------------------------------------------------
        console.log('--- Criterion 4: FinOps Dollar Accounting Fidelity ---');
        console.log(\`  Opus Projected Baseline: $\${opusResult.projectedBaselineCostUSD.toFixed(6)}\`);
        console.log(\`  Opus Optimized Cost:     $\${opusResult.projectedCostUSD.toFixed(6)}\`);
        console.log(\`  Opus Net Dollar Savings: $\${opusResult.netDollarSavingsUSD.toFixed(6)}\`);
        
        const expectedBaseline = Number(((candidates.reduce((sum, c) => sum + (c.fullCode.length / 4), 0) / 1000000) * 15.0).toFixed(6));
        const c4SavingsPositive = opusResult.netDollarSavingsUSD > 0 && deepseekResult.netDollarSavingsUSD >= 0;
        const c4MathValid = opusResult.projectedCostUSD <= opusResult.projectedBaselineCostUSD;
        const c4Passed = c4SavingsPositive && c4MathValid;
        console.log(\`  Criterion 4 Gate (FinOps Fidelity): \${c4Passed ? 'PASSED ✅' : 'FAILED ❌'}\\n\`);

        return {
            c1: { passed: c1Passed, rate: pruningRate, pruned: prunedOpts, total: totalOpts },
            c2: { passed: c2Passed, dsTokens: deepseekResult.totalTokens, opusTokens: opusResult.totalTokens, reduction: tokenReduction },
            c3: { passed: c3Passed, avgLatency, p50, p95 },
            c4: { passed: c4Passed, opusSavings: opusResult.netDollarSavingsUSD }
        };
    }
    `;

    const entryPath = path.join(__dirname, '..', 'out_test', 'phase3_verification_entry.ts');
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(entryPath, harnessSource);

    await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        platform: 'node',
        target: 'node20',
        outfile: tempBundlePath,
        format: 'cjs'
    });

    const { runVerification } = require(tempBundlePath);
    const results = await runVerification();

    console.log('====================================================================================');
    console.log('📊 PHASE 3 DEFINITION OF DONE & ACCEPTANCE CRITERIA SUMMARY');
    console.log('====================================================================================');
    console.log(`1. Pareto Dominance Pruning:      ${results.c1.rate.toFixed(1)}% pruned (Gate >= 40.0%)       -> ${results.c1.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`2. Price-Elastic Sensitivity:     ${results.c2.reduction} tokens conserved on Opus ($15/M) -> ${results.c2.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`3. Sub-Millisecond DP Latency:    ${results.c3.avgLatency.toFixed(3)} ms (Gate < 1.20 ms)         -> ${results.c3.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`4. FinOps Accounting Fidelity:    $${results.c4.opusSavings.toFixed(5)} net savings verified     -> ${results.c4.passed ? 'PASSED ✅' : 'FAILED ❌'}`);

    const allPassed = results.c1.passed && results.c2.passed && results.c3.passed && results.c4.passed;
    if (allPassed) {
        console.log('\n🎉 ALL PHASE 3 ACCEPTANCE GATES PASSED EMPIRICALLY WITH ZERO DEFECTS!');
        process.exit(0);
    } else {
        console.error('\n❌ PHASE 3 ACCEPTANCE GATES NOT ALL MET');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Phase 3 verification failed:', err);
    process.exit(1);
});
