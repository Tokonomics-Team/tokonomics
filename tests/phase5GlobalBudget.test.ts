import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { AstPrunerEngine } from '../src/ast/pruner';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { ContextEntity, ContextIRGenerator, RESOLUTION_LEVELS } from '../src/solver/contextIR';
import { GlobalTokenBudgeter, TokenBudgetExceededError } from '../src/solver/globalBudget';
import { ContextKnapsackSolver, SolverConstraintError } from '../src/solver/knapsackSolver';
import { GENERIC_DEFAULT_PROFILE } from '../src/tokenizer/modelProfile';
import { CanonicalPayloadTokenEstimator } from '../src/tokenizer/canonicalPayload';
import { canonicalTextMessage, CanonicalMessage } from '../src/protocol/canonicalProtocol';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';

export async function runPhase5GlobalBudgetTests(): Promise<void> {
    console.log('Running Phase 5 global payload budgeting and authoritative selection tests...');
    const budgeter = new GlobalTokenBudgeter();
    const base = budgeter.planBase({
        messages: [{ role: 'user', content: 'Implement a bounded parser.' }], profile: GENERIC_DEFAULT_PROFILE,
        requestedTotalTokens: 256, requestedOutputTokens: 48, fixedProtocolTokens: 12
    });
    assert.strictEqual(base.totalTokenLimit, 256);
    assert.strictEqual(base.outputReserve, 48);
    assert.strictEqual(base.fixedProtocolTokens, 12);
    assert.ok(base.candidateTokenBudget > 0);
    assert.ok(budgeter.finalize(base, [{ role: 'user', content: 'Implement a bounded parser.' }]).withinBudget);
    assert.throws(() => budgeter.planBase({
        messages: [{ role: 'user', content: 'mandatory '.repeat(200) }], profile: GENERIC_DEFAULT_PROFILE,
        requestedTotalTokens: 128, requestedOutputTokens: 24
    }), TokenBudgetExceededError);
    assert.throws(() => budgeter.planBase({
        messages: [{ role: 'user', content: 'cannot fit' }], profile: GENERIC_DEFAULT_PROFILE,
        requestedTotalTokens: 1, requestedOutputTokens: 1
    }), TokenBudgetExceededError, 'caller budget was silently raised');

    const ir = new ContextIRGenerator();
    const metadataEntity = entity('metadata', 20, 'export class Metadata {}');
    const metadata = ir.renderResolution(metadataEntity, 'R2').metadata;
    assert.deepStrictEqual(metadata.provenance, ['fixture:metadata']);
    assert.strictEqual(metadata.renderLocation, 'evidence');
    assert.strictEqual(metadata.mandatory, false);
    assert.ok(metadata.freshness && metadata.sensitivity && metadata.transformationHistory.length > 0);

    const solver = new ContextKnapsackSolver();
    const dependency = entity('dependency', 15, 'export interface RequiredDependency { id: string }', {
        mandatory: false, minimumResolution: 'R2'
    });
    const mandatory = entity('mandatory', 50, 'export class MandatoryService { run(): void {} }', {
        mandatory: true, minimumResolution: 'R2', dependencies: ['dependency']
    });
    const closure = solver.solve({ candidates: [mandatory, dependency], tokenBudget: 200 });
    assert.notStrictEqual(closure.assignments.get('mandatory')?.level, 'R_exclude');
    assert.notStrictEqual(closure.assignments.get('dependency')?.level, 'R_exclude');
    assert.throws(() => solver.solve({ candidates: [mandatory], tokenBudget: 200 }), SolverConstraintError);
    assert.throws(() => solver.solve({
        candidates: [
            entity('conflict-a', 20, 'class A {}', { mandatory: true, conflicts: ['conflict-b'] }),
            entity('conflict-b', 20, 'class B {}', { mandatory: true, conflicts: ['conflict-a'] })
        ], tokenBudget: 200
    }), SolverConstraintError);
    const asymmetricConflict = solver.solve({
        candidates: [
            entity('a-mandatory', 10, 'class MandatoryWinner {}', { mandatory: true }),
            entity('z-optional', 100, 'class OptionalLoser {}', { conflicts: ['a-mandatory'] })
        ], tokenBudget: 200
    });
    assert.strictEqual(asymmetricConflict.assignments.get('z-optional')?.level, 'R_exclude');
    assert.throws(() => solver.solve({ candidates: [mandatory, dependency], tokenBudget: 1 }), SolverConstraintError);
    const optional = entity('optional', 100, 'export class OptionalExpansion { details(): string { return "large"; } }');
    const mandatoryMinimum = ir.renderResolution(mandatory, 'R2').tokenCount + ir.renderResolution(dependency, 'R2').tokenCount;
    const tightClosure = solver.solve({ candidates: [mandatory, dependency, optional], tokenBudget: mandatoryMinimum });
    assert.strictEqual(tightClosure.assignments.get('optional')?.level, 'R_exclude');
    assert.notStrictEqual(tightClosure.assignments.get('mandatory')?.level, 'R_exclude');

    const optimalityCandidates = [
        entity('opt-a', 12, 'export class Alpha { run(): number { return 1; } }'),
        entity('opt-b', 21, 'export class Beta { run(): number { return 2; } }'),
        entity('opt-c', 33, 'export class Gamma { run(): number { return 3; } }')
    ];
    const optimalityBudget = 38;
    const solved = solver.solve({ candidates: optimalityCandidates, tokenBudget: optimalityBudget });
    const solvedScore = [...solved.assignments.values()].reduce((sum, resolution) => sum + netScore(resolution), 0);
    const bruteScore = bruteForceScore(optimalityCandidates, optimalityBudget, ir);
    assert.ok(Math.abs(solvedScore - bruteScore) < 0.001, `DP ${solvedScore} != brute-force ${bruteScore}`);

    const structured: CanonicalMessage[] = [
        canonicalTextMessage('user', 'Run the selected tool.'),
        { role: 'assistant', parts: [{ kind: 'tool_call', callId: 'call-1', name: 'lookup', input: { query: 'alpha' } }] },
        { role: 'user', parts: [{ kind: 'tool_result', callId: 'call-1', content: [{ kind: 'text', text: 'alpha result' }] }] },
        { role: 'user', parts: [{ kind: 'data', mimeType: 'image/png', data: new Uint8Array(300) }] }
    ];
    const structuredTokens = CanonicalPayloadTokenEstimator.countNonTextParts(structured);
    assert.ok(structuredTokens >= 100, 'tool/image/schema token allocation was not charged');

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase5-'));
    fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
    const serviceFile = path.join(temp, 'src', 'service.ts');
    fs.writeFileSync(serviceFile, [
        "import { ServiceContract } from './types';",
        'export class BudgetService { execute(value: ServiceContract): string { return value.id; } }'
    ].join('\n'));
    fs.writeFileSync(path.join(temp, 'src', 'types.ts'), 'export interface ServiceContract { id: string }\n');
    const index = new VersionedWorkspaceIndex([temp], new AstPrunerEngine());
    try {
        const snapshot = await index.initialize();
        FeatureFlagRegistry.setPipelineMode('compiler');
        const orchestrator = new PipelineOrchestrator(new AstPrunerEngine(), undefined, undefined, undefined, index);
        const request = {
            messages: [{ role: 'user' as const, content: 'Explain BudgetService and ServiceContract' }],
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: serviceFile,
            maxTokenBudget: 500, maxOutputTokens: 80, deferSideEffects: true
        };
        const first = await orchestrator.compileContext(request);
        const second = await orchestrator.compileContext(request);
        assert.ok(first.budgetPlan?.withinBudget);
        assert.ok(first.budgetPlan!.projectedTotalTokens <= 500);
        assert.ok(first.budgetPlan!.renderedAssignments.length >= 2, 'mandatory evidence was evicted');
        assert.deepStrictEqual(first.budgetPlan!.renderedAssignments, second.budgetPlan!.renderedAssignments);
        assert.deepStrictEqual(first.optimizedMessages, second.optimizedMessages);
        for (const assignment of first.budgetPlan!.renderedAssignments) {
            const candidate = first.evidenceRetrieval!.selected.find(item => item.id === assignment.entityId)!;
            assert.ok(first.optimizedMessages.some(message => message.content.includes(candidate.content)));
            const header = `--- ${candidate.category} |`;
            const blockStart = first.optimizedMessages[0].content.indexOf(header);
            assert.ok(blockStart >= 0);
            const next = first.optimizedMessages[0].content.indexOf('\n\n--- ', blockStart);
            const close = first.optimizedMessages[0].content.indexOf('\n</tokonomics-evidence>', blockStart);
            const renderedText = first.optimizedMessages[0].content.slice(blockStart, next >= 0 ? next : close);
            assert.strictEqual(createHash('sha256').update(renderedText).digest('hex'), assignment.renderedTextHash);
        }

        const codePrompt = [
            'Optimize BudgetWorker while keeping calculate behavior.', '```typescript',
            'export class BudgetWorker {',
            '  calculate(values: number[]): number {',
            '    const normalized = values.map(value => Math.max(0, value));',
            '    const total = normalized.reduce((sum, value) => sum + value, 0);',
            '    if (total < 0) { throw new Error("invalid total"); }',
            '    return total;', '  }', '}', '```'
        ].join('\n');
        const codeResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: codePrompt }], maxTokenBudget: 500, maxOutputTokens: 80, deferSideEffects: true
        });
        const codeAssignment = codeResult.budgetPlan!.renderedAssignments.find(item => item.entityId.startsWith('entity_code_'));
        assert.ok(codeAssignment, 'rendered code assignment was absent from the budget audit');
        const renderedCode = codeResult.optimizedMessages[0].content.match(/```[^\n]*\n([\s\S]*?)\n```/)?.[1];
        assert.ok(renderedCode);
        assert.strictEqual(createHash('sha256').update(renderedCode!).digest('hex'), codeAssignment!.renderedTextHash);

        const canonical = new CanonicalRequestCompiler(orchestrator);
        await assert.rejects(() => canonical.compile({ messages: structured, maxTokenBudget: 128, maxOutputTokens: 24 }), TokenBudgetExceededError);
    } finally {
        FeatureFlagRegistry.resetToDefault();
        index.dispose();
        fs.rmSync(temp, { recursive: true, force: true });
    }
    console.log('Phase 5 global payload budgeting and authoritative selection tests passed.');
}

function entity(id: string, utility: number, code: string, metadata: ContextEntity['metadata'] = {}): ContextEntity {
    return {
        id, filePath: `src/${id}.ts`, symbolName: id, kind: 'class', baseUtility: utility,
        signatures: [code.split('{')[0].trim()], slicedCode: code, fullCode: code,
        metadata: { provenance: [`fixture:${id}`], renderLocation: 'evidence', dependencies: [], conflicts: [],
            freshness: 'fixture', sensitivity: 'public', transformationHistory: ['fixture'], ...metadata }
    };
}

function netScore(resolution: ReturnType<ContextIRGenerator['renderResolution']>): number {
    if (resolution.level === 'R_exclude') return 0;
    return Math.round(Math.max(0.01, resolution.utility - resolution.tokenCount * 0.005 - resolution.risk * 25) * 100) / 100;
}

function bruteForceScore(candidates: ContextEntity[], budget: number, ir: ContextIRGenerator): number {
    let best = 0;
    const visit = (index: number, tokens: number, score: number) => {
        if (index === candidates.length) { best = Math.max(best, score); return; }
        for (const level of RESOLUTION_LEVELS) {
            const resolution = ir.renderResolution(candidates[index], level);
            if (tokens + resolution.tokenCount <= budget) visit(index + 1, tokens + resolution.tokenCount, score + netScore(resolution));
        }
    };
    visit(0, 0, 0);
    return best;
}
