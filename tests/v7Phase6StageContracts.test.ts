import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentRegistry } from '../src/engine/componentRegistry';
import { DEFAULT_FEATURE_FLAGS } from '../src/engine/featureFlags';
import { executePipelineStage, createPipelineRequestContext, MessageNormalizationStage, PipelineStageError } from '../src/engine/pipelineStages';
import { ModelProfileRegistry } from '../src/tokenizer/modelProfile';

function context(overrides: { cancelled?: boolean; deadlineAt?: number } = {}) {
    return createPipelineRequestContext({
        requestId: 'phase6', startedAt: Date.now(), deadlineAt: overrides.deadlineAt ?? Date.now() + 10_000,
        cancellation: { isCancellationRequested: overrides.cancelled === true },
        profile: ModelProfileRegistry.getProfile('gpt-4o'),
        capabilities: ComponentRegistry.capture(DEFAULT_FEATURE_FLAGS),
        privacy: { workspaceTrusted: true, workspaceContentAllowed: true }
    });
}

export async function runV7Phase6StageContractTests(): Promise<boolean> {
    console.log('\n--- Running v7.0.1 Phase 6 stage-contract tests ---');
    const source = [{ role: 'user' as const, content: 'preserve me' }];
    const normalized = await executePipelineStage(MessageNormalizationStage, source, context());
    assert.deepStrictEqual(normalized, source, 'Normalization extraction must preserve approved canonical bytes');
    assert.notStrictEqual(normalized, source, 'Stages must not mutate caller-owned arrays');

    const fallback = await executePipelineStage<number, number>({
        id: 'retrieval', enabled: true, execute: () => { throw new Error('fixture'); },
        fallback: value => value
    }, 42, context());
    assert.strictEqual(fallback, 42, 'A stage fallback must have explicit ownership');

    await assert.rejects(() => executePipelineStage({ id: 'selection', enabled: false, execute: () => 1 }, 0, context()),
        (error: unknown) => error instanceof PipelineStageError && error.code === 'STAGE_DISABLED');
    await assert.rejects(() => executePipelineStage({ id: 'assembly', enabled: true, execute: () => 1 }, 0, context({ cancelled: true })),
        (error: unknown) => error instanceof PipelineStageError && error.code === 'STAGE_CANCELLED');
    await assert.rejects(() => executePipelineStage({ id: 'egress', enabled: true, execute: () => 1 }, 0, context({ deadlineAt: Date.now() - 1 })),
        (error: unknown) => error instanceof PipelineStageError && error.code === 'STAGE_DEADLINE_EXCEEDED');

    const measuredContext = context();
    await executePipelineStage({ id: 'accounting', enabled: true, execute: value => value + 1 }, 1, measuredContext);
    assert.deepStrictEqual(measuredContext.measurements.snapshot().map(item => item.stage), ['accounting']);
    assert.strictEqual(measuredContext.privacy.externalContentRequiresConsent, true);
    assert.ok(Object.isFrozen(measuredContext) && Object.isFrozen(measuredContext.privacy));

    const stageSource = fs.readFileSync(path.join(process.cwd(), 'src', 'engine', 'pipelineStages.ts'), 'utf8');
    assert.doesNotMatch(stageSource, /from ['"](?:\.\.\/)?(?:ui|proxy)|from ['"]vscode['"]|require\(['"]vscode['"]\)/,
        'Core stage contracts must not import UI, provider, or VS Code adapters');
    const orchestratorLines = fs.readFileSync(path.join(process.cwd(), 'src', 'engine', 'pipelineOrchestrator.ts'), 'utf8').split(/\r?\n/).length;
    assert.ok(orchestratorLines < 1_600, 'Orchestrator growth must remain bounded while extraction continues');

    console.log('Golden normalization, typed failure/fallback/cancellation, immutable context, measurements, and boundaries passed.');
    return true;
}
