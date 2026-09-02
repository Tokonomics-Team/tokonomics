/**
 * Phase 16 Unit Tests: Full Context Compiler End-to-End Integration
 */

import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { AstPrunerEngine } from '../src/ast/pruner';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { MessagePayload } from '../src/types';
import { TraceLogger } from '../src/engine/traceLogger';
import { RamContextManager } from '../src/engine/ramManager';

export async function runCompilerIntegrationTests(): Promise<boolean> {
    console.log('\n--- Running Phase 16 Full Context Compiler Integration Tests ---');

    // 1. Set Compiler Mode
    FeatureFlagRegistry.setPipelineMode('compiler');

    const astEngine = new AstPrunerEngine();
    const orchestrator = new PipelineOrchestrator(astEngine);

    const messages: MessagePayload[] = [
        {
            role: 'system',
            content: `
/**
 * System Architecture Specification
 * Handles routing and authentication.
 */
You are an expert compiler assistant. Always maintain strict typing.
`
        },
        {
            role: 'user',
            content: `
Please optimize the CheckoutController checkout method:

\`\`\`typescript
export class CheckoutController {
    private auth = new AuthService();
    private db = new DatabasePool();

    public async processCheckout(order: Order): Promise<Receipt> {
        const valid = await this.auth.verify(order.userId);
        if (!valid) throw new Error("Unauthorized");
        
        // Orthogonal debug logging
        const debugTrace = "trace_checkout_123";
        console.log(debugTrace);
        for (let i = 0; i < 5; i++) {
            // spin loop
        }

        const receipt = await this.db.createReceipt(order);
        return receipt;
    }
}
\`\`\`
`
        }
    ];

    const result = await orchestrator.compileContext({
        messages,
        targetProvider: 'claude-3-5-sonnet',
        maxTokenBudget: 1500,
        activeFilePath: 'src/checkout.ts',
        cursorLine: 18
    });

    if (result.pipelineModeUsed !== 'compiler') {
        throw new Error(`Expected compiler mode, got ${result.pipelineModeUsed}`);
    }

    if (result.reductionPercentage < 20) {
        throw new Error(`Context compiler token reduction too low: ${result.reductionPercentage}%; ${result.trace.decisions
            .filter(decision => decision.action === 'preserve').map(decision => `${decision.itemId}=${decision.reason}`).join(' | ')}`);
    }

    if (result.contextQuality.predictedCQ < 85.0) {
        throw new Error(`Context compiler CQ below acceptable threshold: ${result.contextQuality.predictedCQ}%`);
    }

    // Verify TraceLogger Singleton & RamManager wiring
    const singletonTraces = TraceLogger.getInstance().getTraces();
    if (singletonTraces.length === 0) {
        throw new Error('TraceLogger.getInstance() failed to record compilation trace globally');
    }

    const ramManager = new RamContextManager(astEngine);
    orchestrator.setRamManager(ramManager);
    if (!orchestrator.getRamManager()) {
        throw new Error('PipelineOrchestrator failed to retain RamManager instance');
    }

    console.log(`[Compiler Integration] Pipeline Mode: ${result.pipelineModeUsed.toUpperCase()}`);
    console.log(`[Compiler Integration] Tokens: ${result.originalTokens} ➔ ${result.optimizedTokens} (-${result.reductionPercentage}%)`);
    console.log(`[Compiler Integration] Context Quality: ${result.contextQuality.predictedCQ}% [${result.contextQuality.rating}]`);
    console.log(`[Compiler Integration] Decisions Logged: ${result.trace.decisions.length} (Stage: ${result.trace.stage})`);
    console.log(`[Compiler Integration] Effective Cost Saved: $${result.effectiveCostSavedUSD.toFixed(5)} USD`);
    console.log(`[Compiler Integration] TraceLogger Singleton Traces Retrievable: ${singletonTraces.length}`);

    console.log('✓ Full Context Compiler end-to-end integration verified.');

    return true;
}
