import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AstPrunerEngine } from '../src/ast/pruner';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { EvidenceContractBuilder } from '../src/retrieval/evidenceContract';
import { EvidenceAwareRetriever } from '../src/retrieval/evidenceRetriever';
import { StructuredPreservationGate } from '../src/retrieval/structuredPreservation';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';

export async function runPhase4EvidenceRetrievalTests(): Promise<void> {
    console.log('Running Phase 4 evidence-aware retrieval and preservation tests...');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase4-'));
    const sourceDir = path.join(temp, 'src');
    const testDir = path.join(temp, 'tests');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    const paymentFile = path.join(sourceDir, 'payment.ts');
    fs.writeFileSync(paymentFile, [
        "import { PaymentRequest } from './types';",
        "import { LedgerClient } from './ledger';",
        'export class PaymentService {',
        '  constructor(private ledger: LedgerClient) {}',
        '  async charge(request: PaymentRequest): Promise<string> {',
        '    return this.ledger.record(request.id);',
        '  }',
        '}'
    ].join('\n'));
    fs.writeFileSync(path.join(sourceDir, 'types.ts'), 'export interface PaymentRequest { id: string; amount: number }\n');
    fs.writeFileSync(path.join(sourceDir, 'ledger.ts'), 'export class LedgerClient { record(id: string): string { return id; } }\n');
    fs.writeFileSync(path.join(testDir, 'payment.test.ts'), [
        "import { PaymentService } from '../src/payment';",
        'export function PaymentServiceRegressionTest(): void {',
        '  void PaymentService;',
        '}'
    ].join('\n'));

    const index = new VersionedWorkspaceIndex([temp], new AstPrunerEngine());
    try {
        const snapshot = await index.initialize();
        const retriever = new EvidenceAwareRetriever();

        const explainContract = EvidenceContractBuilder.build('explain', 'Explain PaymentService and PaymentRequest');
        assert.deepStrictEqual(explainContract.required, ['targetImplementation', 'apiContract']);
        assert.ok(!explainContract.required.includes('errorStackTrace'));
        const debugContract = EvidenceContractBuilder.build('debug', 'Fix PaymentService Error: ledger rejected request');
        assert.ok(debugContract.required.includes('errorStackTrace'));

        const request = {
            query: 'Explain PaymentService and PaymentRequest', taskType: 'explain' as const,
            snapshot, activeFilePath: paymentFile, maxCandidates: 6
        };
        const first = retriever.retrieve(request);
        const second = retriever.retrieve(request);
        assert.strictEqual(first.sufficient, true, `missing required evidence: ${first.missingRequired.join(', ')}`);
        assert.strictEqual(first.criticalRecall, 1);
        assert.deepStrictEqual(first.selected.map(candidate => candidate.id), second.selected.map(candidate => candidate.id));
        assert.deepStrictEqual(first.decisions, second.decisions, 'retrieval decisions were not deterministic');
        assert.ok(new Set(first.selected.map(candidate => candidate.filePath).filter(Boolean)).size > 1, 'MMR did not retain file diversity');
        const selectedFacts = first.selected.map(candidate => candidate.content).join('\n');
        for (const criticalFact of ['PaymentService', 'PaymentRequest']) {
            assert.ok(selectedFacts.includes(criticalFact), `selected evidence lost oracle fact ${criticalFact}`);
        }
        const debug = retriever.retrieve({
            query: 'Fix PaymentService Error: ledger rejected request', taskType: 'debug', snapshot,
            activeFilePath: paymentFile,
            signals: [{ source: 'diagnostic', content: 'TS2322: ledger rejected request', filePath: paymentFile, lineStart: 6, lineEnd: 6 }]
        });
        assert.strictEqual(debug.sufficient, true, `debug expansion missed ${debug.missingRequired.join(', ')}`);
        assert.deepStrictEqual(new Set(debug.contract.required), new Set(debug.covered.filter(category => debug.contract.required.includes(category))));
        const diagnostic = debug.selected.find(candidate => candidate.sourceKind === 'diagnostic');
        assert.strictEqual(diagnostic?.filePath, 'src/payment.ts', 'signal path was not canonicalized to snapshot identity');
        assert.ok(!debug.selected.some(candidate => candidate.filePath?.includes(temp)), 'absolute workspace path entered rendered evidence');

        const completion = retriever.retrieve({
            query: 'Continue PaymentService', taskType: 'completion', snapshot, activeFilePath: paymentFile,
            signals: [{ source: 'diff', content: '- old secret history\n+ new secret history' }]
        });
        const diffCandidate = completion.allCandidates.find(candidate => candidate.sourceKind === 'diff');
        assert.ok(diffCandidate, 'diff producer did not create a candidate');
        assert.ok(!completion.selected.some(candidate => candidate.id === diffCandidate!.id), 'forbidden diff entered completion context');

        const emptyIndex = new VersionedWorkspaceIndex([path.join(temp, 'missing')], new AstPrunerEngine());
        const missing = retriever.retrieve({ query: 'Continue MissingService', taskType: 'completion', snapshot: emptyIndex.captureSnapshot() });
        assert.strictEqual(missing.conservativeFallback, true);
        assert.ok(missing.missingRequired.includes('targetImplementation'));
        emptyIndex.dispose();

        const original = [{ role: 'user' as const, content: 'Fix PaymentService at src/payment.ts:10-12\nTS2322: bad assignment\ncallId="tool-7"' }];
        const corrupted = [{ role: 'user' as const, content: 'Fix the service' }];
        const preservation = StructuredPreservationGate.evaluate(original, corrupted, original[0].content);
        assert.strictEqual(preservation.passed, false);
        assert.ok(preservation.missing.some(item => item.startsWith('symbol:PaymentService')));
        assert.ok(preservation.missing.some(item => item.startsWith('range:')));
        assert.ok(preservation.missing.some(item => item.startsWith('diagnostic:')));
        assert.ok(preservation.missing.some(item => item === 'tool-pair:tool-7'));

        FeatureFlagRegistry.setPipelineMode('compiler');
        const orchestrator = new PipelineOrchestrator(new AstPrunerEngine(), undefined, undefined, undefined, index);
        const compiled = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService and PaymentRequest' }],
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: paymentFile, deferSideEffects: true
        });
        assert.strictEqual(compiled.evidenceRetrieval?.sufficient, true);
        assert.ok(compiled.optimizedMessages[0].content.includes('<tokonomics-evidence'));
        assert.ok(compiled.optimizedMessages[0].content.includes('PaymentRequest'));

        FeatureFlagRegistry.setPipelineMode('legacy');
        const legacy = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService and PaymentRequest' }],
            workspaceSnapshot: snapshot, allowWorkspaceRetrieval: true, activeFilePath: paymentFile, deferSideEffects: true
        });
        assert.ok(legacy.optimizedMessages[0].content.includes('<tokonomics-evidence'), 'legacy text pipeline selected but did not render evidence');
        const structured = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService' }], workspaceSnapshot: snapshot,
            allowWorkspaceRetrieval: true, preserveProtocol: true, deferSideEffects: true
        });
        assert.strictEqual(structured.evidenceRetrieval, undefined, 'structured pass-through attempted text evidence injection');
        FeatureFlagRegistry.setPipelineMode('compiler');

        const noConsent = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain PaymentService' }], workspaceSnapshot: snapshot, deferSideEffects: true
        });
        assert.ok(!noConsent.optimizedMessages.some(message => message.content.includes('<tokonomics-evidence')));

        const fallbackPrompt = 'Continue MissingService without enough workspace evidence';
        const fallback = await orchestrator.compileContext({
            messages: [{ role: 'user', content: fallbackPrompt }], workspaceSnapshot: emptySnapshot(snapshot),
            allowWorkspaceRetrieval: true, deferSideEffects: true
        });
        assert.strictEqual(fallback.evidenceRetrieval?.conservativeFallback, true);
        assert.strictEqual(fallback.optimizedMessages[0].content, fallbackPrompt);

        const dynamicCode = [
            'Fix DynamicService while preserving runtime dispatch.',
            '```typescript',
            'export class DynamicService {',
            '  execute(methodName: string, payload: unknown): unknown {',
            '    const target: any = this;',
            '    const selected = target[methodName];',
            '    const evaluated = eval("payload");',
            '    if (!selected) { throw new Error("missing dynamic handler"); }',
            '    return selected.call(this, evaluated);',
            '  }',
            '}',
            '```'
        ].join('\n');
        const dynamic = await orchestrator.compileContext({ messages: [{ role: 'user', content: dynamicCode }], deferSideEffects: true });
        assert.ok(dynamic.optimizedMessages[0].content.includes('eval("payload")'), 'dynamic-risk slice was not preserved verbatim');
        assert.ok(dynamic.trace.decisions.some(decision => decision.itemId.startsWith('slice_safety_')));
    } finally {
        FeatureFlagRegistry.resetToDefault();
        index.dispose();
        fs.rmSync(temp, { recursive: true, force: true });
    }
    console.log('Phase 4 evidence-aware retrieval and preservation tests passed.');
}

function emptySnapshot(template: ReturnType<VersionedWorkspaceIndex['captureSnapshot']>): ReturnType<VersionedWorkspaceIndex['captureSnapshot']> {
    return Object.freeze({ ...template, generation: template.generation + 1000, files: new Map(), symbols: Object.freeze([]), memoryBytes: 0 });
}
