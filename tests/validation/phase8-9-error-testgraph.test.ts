import * as assert from 'assert';
import { ErrorIntelligence } from '../../src/workspace/errorIntelligence';
import { TestGraph } from '../../src/workspace/testGraph';

export function runPhase8And9ErrorTestGraphValidation(): boolean {
    console.log('--- Phase 8 & 9: Error Intelligence & TestGraph Linkage ---');

    // 1. Error Intelligence extraction
    const errorEngine = new ErrorIntelligence();
    const linkerError = "Property 'validateSession' does not exist on type 'AuthService'";
    const diag = errorEngine.classifyDiagnostic(linkerError, 'src/auth.ts', 10);

    assert.strictEqual(diag.extractedSymbol, 'validateSession', 'Error engine must extract target symbol');
    const targets = errorEngine.resolveRootCauseTargets([diag]);
    assert.ok(targets.length > 0, 'Error engine must resolve root cause targets');
    assert.strictEqual(targets[0].retrievalPriority, 'highest', 'Root cause target must be highest priority');

    // 2. TestGraph failure priority
    const testGraph = new TestGraph();
    testGraph.registerTest({
        id: 'tests/auth.test.ts:test_login_failure',
        testFilePath: 'tests/auth.test.ts',
        testName: 'test_login_failure',
        targetSymbols: ['AuthService'],
        fixtures: ['fixtures/users.json'],
        mocks: ['MockDB']
    });
    testGraph.markTestFailing('tests/auth.test.ts:test_login_failure', true);

    const testPkg = testGraph.getTestContextPackage('AuthService');
    assert.strictEqual(testPkg.failingTests.length, 1, 'TestGraph must identify 1 failing test');
    assert.strictEqual(testPkg.fixtures.length, 1, 'TestGraph must package relevant fixtures');

    console.log('  ✓ Error intelligence and TestGraph failure prioritization verified.');
    return true;
}
