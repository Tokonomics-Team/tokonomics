import * as assert from 'assert';
import { SufficiencyEngine, CandidateContextEntity } from '../../src/engine/sufficiencyEngine';

export function runPhase13SufficiencyStoppingValidation(): boolean {
    console.log('--- Phase 13: Context Sufficiency Adaptive Stopping Rules ---');

    const engine = new SufficiencyEngine();
    const profile = engine.buildTaskProfile('debug', 'Fix null pointer in PaymentProcessor', ['PaymentProcessor'], true);

    const entity1: CandidateContextEntity = {
        id: 'payment_interface',
        filePath: 'src/types/payment.ts',
        symbolName: 'PaymentProcessor',
        kind: 'interface',
        content: 'export interface PaymentProcessor { process(amt: number): boolean; }'
    };

    // 1. Partial evidence -> action: retrieve_more
    const partialReport = engine.evaluateSufficiency(profile, [entity1]);
    assert.strictEqual(partialReport.recommendedAction, 'retrieve_more', 'Partial evidence must prompt more retrieval');
    assert.ok(partialReport.coverageScore < 1.0, 'Coverage must be < 100%');

    // 2. Complete evidence -> action: halt_retrieval
    const entity2: CandidateContextEntity = {
        id: 'payment_impl',
        filePath: 'src/services/payment.ts',
        symbolName: 'PaymentProcessor',
        kind: 'class',
        content: 'export class PaymentProcessor { public process(amt: number) { return true; } }'
    };
    const entity3: CandidateContextEntity = {
        id: 'error_diag',
        filePath: 'terminal',
        symbolName: 'ErrorDiag',
        kind: 'diagnostic',
        content: 'Error: PaymentProcessor failed on process'
    };

    const completeReport = engine.evaluateSufficiency(profile, [entity1, entity2, entity3]);
    assert.strictEqual(completeReport.recommendedAction, 'halt_retrieval', 'Complete evidence must halt retrieval');
    assert.ok(completeReport.coverageScore >= 0.90, 'Coverage must be >= 90%');

    console.log('  ✓ Adaptive retrieval stopping rules verified.');
    return true;
}
