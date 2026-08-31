/**
 * Phase 4 Unit Tests: DeltaContextEngine, ErrorIntelligence, and TestGraph
 */

import { DeltaContextEngine } from '../src/workspace/deltaContextEngine';
import { ErrorIntelligence } from '../src/workspace/errorIntelligence';
import { TestGraph } from '../src/workspace/testGraph';

export function runDeltaErrorTestGraphTests(): boolean {
    console.log('\n--- Running Phase 4 Delta, Error & TestGraph Intelligence Tests ---');

    // 1. Test DeltaContextEngine
    const deltaEngine = new DeltaContextEngine();

    const w0 = deltaEngine.calculateCursorGravity(20, 20); // exact line
    const w15 = deltaEngine.calculateCursorGravity(35, 20); // 15 lines away (1 sigma)
    const w45 = deltaEngine.calculateCursorGravity(65, 20); // 45 lines away (3 sigma)

    if (w0 !== 1.0 || w15 > 0.45 || w15 < 0.30 || w45 > 0.10) {
        throw new Error(`Cursor gravity decay calculation error (w0=${w0}, w15=${w15}, w45=${w45})`);
    }

    const sampleDiff = `
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,5 @@
+    public async login() {
+        return true;
+    }
`;
    const modifiedLines = deltaEngine.parseDiffHunks(sampleDiff);
    const authModified = modifiedLines.get('src/auth.ts');
    if (!authModified || !authModified.has(10) || !authModified.has(12)) {
        throw new Error(`Git diff parsing failed (Got: ${JSON.stringify(Array.from(authModified || []))})`);
    }

    const attention = deltaEngine.computeAttentionWeight({
        symbolLine: 10,
        symbolEndLine: 15,
        filePath: 'src/auth.ts',
        activeFilePath: 'src/auth.ts',
        cursorLine: 11,
        gitDiffModifiedLines: modifiedLines
    });

    if (attention.compositeAttentionWeight < 1.0 || !attention.isModifiedInGitDiff) {
        throw new Error(`Composite attention scoring failed (Got: ${JSON.stringify(attention)})`);
    }

    console.log(`[Delta Engine] Cursor Gravity (15 lines): ${w15} | Composite Attention: ${attention.compositeAttentionWeight}`);
    console.log('✓ DeltaContextEngine verified.');

    // 2. Test ErrorIntelligence
    const errorIntel = new ErrorIntelligence();

    const diag = errorIntel.classifyDiagnostic(
        "Property 'validateSession' does not exist on type 'AuthService'",
        'src/controllers/authController.ts',
        34
    );

    if (diag.category !== 'undefined_symbol' || diag.extractedSymbol !== 'validateSession') {
        throw new Error(`Diagnostic classification failed (Got: ${JSON.stringify(diag)})`);
    }

    const sampleTerminalStack = `
Error: Request failed with status 401
    at Object.validateSession (D:\\project\\src\\auth\\session.ts:45:12)
    at handleLogin (D:\\project\\src\\routes\\login.ts:88:5)
`;
    const parsedStack = errorIntel.parseStackTrace(sampleTerminalStack);
    if (parsedStack.length !== 2 || parsedStack[0].extractedSymbol !== 'Object.validateSession') {
        throw new Error(`Stack trace parsing failed (Got: ${JSON.stringify(parsedStack)})`);
    }

    const targets = errorIntel.resolveRootCauseTargets([diag]);
    if (targets.length !== 1 || targets[0].symbolName !== 'validateSession' || targets[0].retrievalPriority !== 'highest') {
        throw new Error(`Root cause target resolution failed (Got: ${JSON.stringify(targets)})`);
    }

    console.log(`[Error Intelligence] Classified '${diag.message}' ➔ Target: ${targets[0].symbolName} [PRIORITY: ${targets[0].retrievalPriority}]`);
    console.log('✓ ErrorIntelligence & targeted root-cause resolver verified.');

    // 3. Test TestGraph
    const testGraph = new TestGraph();

    testGraph.registerTest({
        id: 'tests/auth.test.ts:test_login_success',
        testFilePath: 'tests/auth.test.ts',
        testName: 'test_login_success',
        targetSymbols: ['AuthService', 'validateSession'],
        fixtures: ['fixtures/users.json'],
        mocks: ['MockDatabasePool']
    });

    testGraph.registerTest({
        id: 'tests/auth.test.ts:test_login_invalid_pass',
        testFilePath: 'tests/auth.test.ts',
        testName: 'test_login_invalid_pass',
        targetSymbols: ['AuthService'],
        fixtures: ['fixtures/users.json'],
        mocks: ['MockDatabasePool']
    });

    testGraph.markTestFailing('tests/auth.test.ts:test_login_invalid_pass', true);

    const testPackage = testGraph.getTestContextPackage('AuthService');
    if (testPackage.failingTests.length !== 1 || testPackage.passingTests.length !== 1 || testPackage.fixtures.length !== 1) {
        throw new Error(`Test package generation failed (Got: ${JSON.stringify(testPackage)})`);
    }

    console.log(`[Test Graph] Bundled ${testPackage.failingTests.length} failing test, ${testPackage.fixtures.length} fixture, and ${testPackage.mocks.length} mock for ${testPackage.targetSymbol}`);
    console.log('✓ TestGraph verified.');

    return true;
}
