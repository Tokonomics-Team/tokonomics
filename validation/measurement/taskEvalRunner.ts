/**
 * Builds the two arms of the controlled model-task evaluation.
 *
 * Baseline is what a developer does today: attach the whole focal file. Optimized is what Tokonomics
 * produces for the same question - retrieval-first, no attachment - taken from the real compiler
 * rather than reconstructed here, so the thing measured is the thing that ships.
 *
 * The model is invoked with tools disabled. That matters more than it looks: an agent with file
 * access would answer every question by reading the repository, both arms would score identically,
 * and the experiment would report "no difference" while measuring nothing at all. Removing tools is
 * what makes the context the only variable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../../src/engine/featureFlags';
import { OPTIMIZATION_PROFILES, OptimizationMode } from '../../src/config/userPreferences';
import { VersionedWorkspaceIndex } from '../../src/workspace/workspaceIndex';
import { TokenCounter } from '../../src/engine/tokenizer';
import { EVAL_TASKS, EvalTask } from './taskEvalCorpus';

const NL = String.fromCharCode(10);

/** Instruction wrapper, identical in both arms so only the evidence differs. */
function frame(prompt: string, context: string): string {
    return [
        'Answer the question using ONLY the context below. Do not use any tools and do not read any',
        'files. If the context does not contain the answer, reply exactly: INSUFFICIENT CONTEXT.',
        'Answer in at most three sentences.',
        '',
        `QUESTION: ${prompt}`,
        '',
        'CONTEXT:',
        context
    ].join(NL);
}

export interface ArmPrompt {
    readonly taskId: string;
    readonly arm: 'baseline' | 'optimized';
    readonly text: string;
    readonly contextTokens: number;
}

export interface BuiltTask {
    readonly task: EvalTask;
    readonly baseline: ArmPrompt;
    readonly optimized: ArmPrompt;
}

function applyProfile(mode: OptimizationMode): void {
    const profile = OPTIMIZATION_PROFILES[mode];
    FeatureFlagRegistry.applyRuntimeConfiguration({
        schemaVersion: 1,
        preferences: {
            optimizationMode: mode, workspaceContext: 'selection',
            includeUnsavedChanges: false, responseReuse: true
        },
        profile,
        featureFlags: profile.featureFlags,
        tokenOptimization: profile.tokenOptimization,
        workspace: {
            contextMode: 'selection', includeUnsavedBuffers: false, ramBudgetMB: 64,
            maxIndexFileSizeKB: 256, backgroundWarming: false
        },
        responseCache: { enabled: true, maxSize: 100 },
        image: { enabled: true, maxDimension: 1568 }
    } as never);
}

/**
 * Builds both arms for every task.
 *
 * The optimized arm carries whatever the compiler emitted, including the case where it emitted very
 * little. Substituting the baseline when retrieval returns something thin would hide precisely the
 * failure this evaluation exists to detect.
 */
export async function buildTasks(rootDir: string, mode: OptimizationMode = 'maximum'): Promise<BuiltTask[]> {
    applyProfile(mode);
    const index = new VersionedWorkspaceIndex(
        [path.join(rootDir, 'src')], undefined, { trusted: true, budgetMB: 64 });
    const snapshot = await index.ensureInitialized();

    const built: BuiltTask[] = [];
    for (const task of EVAL_TASKS) {
        const focalAbsolute = path.join(rootDir, task.focalFile);
        const source = fs.readFileSync(focalAbsolute, 'utf8');
        const baselineContext = '```typescript' + NL + `// ${task.focalFile}` + NL + source + NL + '```';

        const compiled = await new PipelineOrchestrator().compileContext({
            messages: [{ role: 'user', content: task.prompt }],
            sessionId: 'task-evaluation', targetProvider: 'anthropic',
            targetModel: 'claude-3-5-sonnet', deferSideEffects: true,
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: focalAbsolute
        } as never);
        const optimizedContext = compiled.optimizedMessages
            .map((message: { content: string }) => message.content).join(NL);

        built.push({
            task,
            baseline: {
                taskId: task.id, arm: 'baseline',
                text: frame(task.prompt, baselineContext),
                contextTokens: TokenCounter.countTokens(baselineContext)
            },
            optimized: {
                taskId: task.id, arm: 'optimized',
                text: frame(task.prompt, optimizedContext),
                contextTokens: TokenCounter.countTokens(optimizedContext)
            }
        });
    }
    return built;
}

/**
 * Scores one answer.
 *
 * Every expectation group must be satisfied by at least one of its alternatives. An explicit
 * INSUFFICIENT CONTEXT reply is recorded as a failure rather than an error: it is the honest
 * outcome when the context lacked the answer, and it is the outcome this evaluation is looking for.
 */
export function scoreAnswer(task: EvalTask, answer: string): {
    readonly succeeded: boolean;
    readonly declaredInsufficient: boolean;
    readonly missingGroups: readonly string[];
} {
    const normalized = answer.toLowerCase();
    const declaredInsufficient = normalized.includes('insufficient context');
    const missing: string[] = [];
    for (const group of task.expect) {
        if (!group.some(alternative => normalized.includes(alternative.toLowerCase()))) {
            missing.push(group.join(' | '));
        }
    }
    return Object.freeze({
        succeeded: missing.length === 0 && !declaredInsufficient,
        declaredInsufficient,
        missingGroups: Object.freeze(missing)
    });
}
