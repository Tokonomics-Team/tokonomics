/**
 * Phase 13 Automated Test Suite: Delta, Diagnostic, Test, and Git Intelligence
 * 
 * Verifies:
 * 1. Request-scoped WorkspaceSignalSnapshot ingestion and normalization.
 * 2. ANSI escape code, control character, and path traversal sanitization in ErrorIntelligence.
 * 3. Secret redaction and author email stripping in GitGraph metadata.
 * 4. Freshness timestamps, version hash invalidation, and stale test cache eviction.
 * 5. Deterministic precedence: Diagnostics > Failing Tests > Delta Focus > Git History.
 * 6. Snapshot source text policy (zero unverified text from dirty buffers).
 * 7. PipelineOrchestrator integration and ComponentReceiptTrail auditing across all 4 independent flags.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AstPrunerEngine } from '../src/ast/pruner';
import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
import { WorkspaceSignalCoordinator } from '../src/workspace/signalCoordinator';
import { DeltaContextEngine } from '../src/workspace/deltaContextEngine';
import { ErrorIntelligence } from '../src/workspace/errorIntelligence';
import { TestGraph } from '../src/workspace/testGraph';
import { GitGraph } from '../src/workspace/gitGraph';
import { WorkspaceSignalSnapshot } from '../src/workspace/signalTypes';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';

export async function runPhase13SignalIntelligenceTests(): Promise<void> {
    console.log('\n--- Running Phase 13 Delta, Diagnostic, Test & Git Intelligence Tests ---');

    // Setup temporary workspace
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase13-'));
    const srcDir = path.join(tempDir, 'src');
    const testDir = path.join(tempDir, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });

    const authFile = path.join(srcDir, 'authService.ts');
    const userFile = path.join(srcDir, 'userModel.ts');
    const authTestFile = path.join(testDir, 'authService.test.ts');

    fs.writeFileSync(authFile, [
        "import { UserModel } from './userModel';",
        'export class AuthService {',
        '  private users = new UserModel();',
        '  public login(username: string, token: string): boolean {',
        '    return this.users.validate(username, token);',
        '  }',
        '  public logout(username: string): void {',
        '    this.users.clearSession(username);',
        '  }',
        '}'
    ].join('\n'));

    fs.writeFileSync(userFile, [
        'export class UserModel {',
        '  public validate(user: string, pass: string): boolean {',
        '    return user.length > 0 && pass.length > 0;',
        '  }',
        '  public clearSession(user: string): void {}',
        '}'
    ].join('\n'));

    fs.writeFileSync(authTestFile, [
        "import { AuthService } from '../src/authService';",
        'export function testAuthLogin(): void {',
        '  const s = new AuthService();',
        '  s.login("admin", "invalid_pass");',
        '}'
    ].join('\n'));

    const index = new VersionedWorkspaceIndex([tempDir], new AstPrunerEngine());
    const snapshot = await index.initialize();
    assert.ok(snapshot.files.size >= 3, 'Snapshot must index at least 3 files');

    const coordinator = new WorkspaceSignalCoordinator();

    // 1. Normalization of WorkspaceSignalSnapshot
    {
        const signalSnapshot: WorkspaceSignalSnapshot = {
            snapshotGeneration: snapshot.generation,
            capturedAt: Date.now(),
            cursorSelection: {
                documentUri: authFile,
                documentVersion: snapshot.generation,
                cursorLine: 4,
                selection: { startLine: 4, startCharacter: 2, endLine: 6, endCharacter: 3 }
            },
            diagnostics: [
                {
                    filePath: authFile,
                    line: 5,
                    message: "Property 'validate' does not exist on type 'UserModel'",
                    severity: 'error',
                    category: 'undefined_symbol',
                    extractedSymbol: 'validate',
                    documentVersion: snapshot.generation
                }
            ],
            testOutcomes: [
                {
                    testId: 'tests/authService.test.ts:testAuthLogin',
                    testFilePath: authTestFile,
                    testName: 'testAuthLogin',
                    targetSymbols: ['AuthService', 'login'],
                    fixtures: ['user_fixture.json'],
                    mocks: ['MockUserRepository'],
                    isFailing: true,
                    failureMessage: 'AssertionError: login failed',
                    timestamp: Date.now(),
                    sourceVersion: snapshot.files.get(snapshot.roots[0].id + ':tests/authservice.test.ts')?.contentHash
                }
            ],
            gitHistory: [
                {
                    hash: 'c0ffee1234567890abcdef',
                    shortHash: 'c0ffee1',
                    authorName: 'Developer',
                    message: 'Refactor login authentication method',
                    timestamp: Date.now() - 3600000,
                    modifiedFiles: ['src/authService.ts'],
                    modifiedSymbols: [{ symbolName: 'AuthService', filePath: authFile, changeType: 'modified' }]
                }
            ]
        };

        const res = coordinator.coordinateSignals({
            snapshot,
            signals: signalSnapshot,
            activeFilePath: authFile,
            cursorLine: 4,
            userPrompt: 'Fix login error',
            flags: {
                enableDeltaContext: true,
                enableErrorIntelligence: true,
                enableTestGraph: true,
                enableGitGraph: true
            }
        });

        assert.ok(res.errorSignals.length > 0, 'Must produce error signals');
        assert.ok(res.testSignals.length > 0, 'Must produce test signals');
        assert.ok(res.deltaSignals.length > 0, 'Must produce delta signals');
        assert.ok(res.gitSignals.length > 0, 'Must produce git signals');
        assert.strictEqual(res.discardedStaleCount, 0, 'Zero stale signals discarded when versions match');
        console.log('✓ Normalization of WorkspaceSignalSnapshot into typed evidence verified.');
    }

    // 2. ANSI Escape, Control Characters & Path Traversal Attack Defense
    {
        const errorIntel = new ErrorIntelligence();

        // 2a. ANSI escape sequences and non-printable control characters
        const maliciousTerminal = '\u001b[31;1mError: Crash in \u0007\u001b[0mat Object.login (' + authFile + ':4:10)\n\u001b[32mSome other text\u001b[0m';
        const parsed = errorIntel.parseStackTrace(maliciousTerminal);
        assert.strictEqual(parsed.length, 1, 'Should parse exactly 1 clean diagnostic');
        assert.strictEqual(parsed[0].extractedSymbol, 'Object.login');
        assert.strictEqual(parsed[0].line, 4);
        assert.ok(!parsed[0].message.includes('\u001b'), 'ANSI escape codes must be stripped');
        assert.ok(!parsed[0].message.includes('\u0007'), 'Control characters must be stripped');

        // 2b. Null byte path traversal attempt
        const nullByteTerminal = 'at eval (src/authService.ts\0/../../etc/passwd:10:5)';
        const nullParsed = errorIntel.parseStackTrace(nullByteTerminal);
        assert.strictEqual(nullParsed.length, 0, 'Null-byte path traversal attempt must be rejected');

        console.log('✓ ANSI escape, control character, and path traversal sanitization verified.');
    }

    // 3. Secret Redaction & Author Email Stripping in Git Metadata
    {
        const gitGraph = new GitGraph();

        const mockSecret = ['sk', 'test', 'mocktoken1234567890'].join('_');
        gitGraph.registerCommit({
            hash: 'deadbeef1234567890abcdef',
            shortHash: 'deadbee',
            author: 'Jane Doe <jane.doe@enterprise.com>', // PII email
            message: 'Update stripe client with secret api_key=' + mockSecret + ' and remote https://github.com/secret/repo.git',
            timestamp: Date.now(),
            modifiedFiles: ['src/authService.ts'],
            modifiedSymbols: [{ symbolName: 'AuthService', filePath: authFile, changeType: 'modified' }]
        });

        const history = gitGraph.getRecentSymbolHistory('AuthService', 1);
        assert.strictEqual(history.length, 1);
        const commit = history[0];

        // Verify author email is stripped
        assert.ok(!commit.author.includes('@'), 'Author email must be stripped');
        assert.ok(!commit.author.includes('<'), 'Author email brackets must be stripped');
        assert.strictEqual(commit.author, 'Jane Doe');

        // Verify secrets are redacted from commit message
        assert.ok(!commit.message.includes(mockSecret), 'API key secret must be redacted');
        assert.ok(commit.message.includes('REDACTED') || commit.message.includes('***'), 'Commit message must contain redaction notice');

        // Verify remote URL is stripped
        assert.ok(!commit.message.includes('https://github.com/secret'), 'Remote URL must be stripped');

        // Verify summary formatting
        const summary = gitGraph.formatSymbolHistorySummary('AuthService');
        assert.ok(!summary.includes('@'), 'Summary must not contain email');
        assert.ok(!summary.includes(mockSecret), 'Summary must not contain secrets');

        console.log('✓ Secret redaction, email stripping, and URL filtering in Git metadata verified.');
    }

    // 4. Freshness & Stale-State Invalidation
    {
        // 4a. Delta freshness check
        const deltaEngine = new DeltaContextEngine();
        const staleAttention = deltaEngine.computeAttentionWeight({
            symbolLine: 5,
            filePath: authFile,
            activeFilePath: authFile,
            cursorLine: 5,
            expectedDocumentVersion: 1, // Compiler at version 1
            actualDocumentVersion: 5    // Dirty editor at version 5
        });

        assert.strictEqual(staleAttention.staleDiscarded, true, 'Diverged document version must trigger staleDiscarded');
        assert.strictEqual(staleAttention.cursorGravityScore, 0.0, 'Stale cursor gravity must be zeroed');

        // 4b. TestGraph cache invalidation on file edit
        const testGraph = new TestGraph();
        testGraph.registerTest({
            id: 'test_1',
            testFilePath: authTestFile,
            testName: 'testAuthLogin',
            targetSymbols: ['AuthService'],
            fixtures: [],
            mocks: [],
            isFailing: true,
            sourceVersion: 'hash_v1'
        });

        // Current versions reflect hash_v2 (file modified)
        const updatedVersions = new Map([[authTestFile, 'hash_v2']]);
        const expiredCount = testGraph.expireStaleTests(updatedVersions);
        assert.strictEqual(expiredCount, 1, 'Must expire 1 test due to mismatched sourceVersion');
        assert.strictEqual(testGraph.getTestsForSymbol('AuthService').length, 0, 'Expired test must be removed');

        console.log('✓ Delta freshness and TestGraph cache invalidation verified.');
    }

    // 5. Deterministic Precedence Hierarchy
    {
        // Precedence: Diagnostics > Failing Tests > Delta Focus > Git History
        const signalSnapshot: WorkspaceSignalSnapshot = {
            snapshotGeneration: snapshot.generation,
            capturedAt: Date.now(),
            cursorSelection: {
                documentUri: authFile,
                documentVersion: snapshot.generation,
                cursorLine: 2
            },
            diagnostics: [
                {
                    filePath: authFile,
                    line: 5,
                    message: "Critical error: user session expired",
                    severity: 'error',
                    category: 'runtime_exception',
                    extractedSymbol: 'AuthService',
                    documentVersion: snapshot.generation
                }
            ],
            testOutcomes: [
                {
                    testId: 'test_failing',
                    testFilePath: authTestFile,
                    testName: 'testAuthLogin',
                    targetSymbols: ['AuthService'],
                    fixtures: [],
                    mocks: [],
                    isFailing: true,
                    sourceVersion: undefined,
                    timestamp: Date.now()
                }
            ],
            gitHistory: [
                {
                    hash: 'abc1234',
                    shortHash: 'abc1234',
                    authorName: 'Developer',
                    message: 'Past commit',
                    timestamp: Date.now() - 100000,
                    modifiedFiles: ['src/authService.ts'],
                    modifiedSymbols: [{ symbolName: 'AuthService', filePath: authFile, changeType: 'modified' }]
                }
            ]
        };

        const res = coordinator.coordinateSignals({
            snapshot,
            signals: signalSnapshot,
            activeFilePath: authFile,
            cursorLine: 2,
            flags: {
                enableDeltaContext: true,
                enableErrorIntelligence: true,
                enableTestGraph: true,
                enableGitGraph: true
            }
        });

        const sources = res.combinedSignals.map(s => s.source);
        const diagIdx = sources.indexOf('diagnostic');
        const testIdx = sources.indexOf('test');
        const deltaIdx = sources.indexOf('open_editor');
        const gitIdx = sources.indexOf('diff');

        assert.ok(diagIdx !== -1, 'Diagnostic signal must exist');
        assert.ok(testIdx !== -1, 'Test signal must exist');
        assert.ok(deltaIdx !== -1, 'Delta signal must exist');
        assert.ok(gitIdx !== -1, 'Git signal must exist');

        assert.ok(diagIdx < testIdx, 'Diagnostics must precede failing tests');
        assert.ok(testIdx < deltaIdx, 'Failing tests must precede delta gravity');
        assert.ok(deltaIdx < gitIdx, 'Delta gravity must precede Git history');

        console.log('✓ Deterministic precedence hierarchy (Diag > Test > Delta > Git) verified.');
    }

    // 6. Pipeline Orchestrator Integration & ComponentReceiptTrail Audit
    {
        FeatureFlagRegistry.resetToDefault();
        const orchestrator = new PipelineOrchestrator();

        // 6a. Default state (all flags false) -> all 4 Phase 13 components emit 'bypassed'
        const defaultResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService login flow' }],
            workspaceSnapshot: snapshot,
            activeFilePath: authFile,
            cursorLine: 2,
            allowWorkspaceRetrieval: true
        });

        const receipts = defaultResult.receipts || [];
        for (const compId of ['delta_context', 'error_intelligence', 'test_graph', 'git_graph'] as const) {
            const receipt = receipts.find(r => r.componentId === compId && r.outcome === 'bypassed');
            assert.ok(receipt, `${compId} must emit bypassed receipt when flag is false`);
        }

        // 6b. Enable flags independently -> emits attempted, invoked, contributed
        FeatureFlagRegistry.setFlag('enableDeltaContext', true);
        FeatureFlagRegistry.setFlag('enableErrorIntelligence', true);
        FeatureFlagRegistry.setFlag('enableTestGraph', true);
        FeatureFlagRegistry.setFlag('enableGitGraph', true);

        const activeResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Fix AuthService login error' }],
            workspaceSnapshot: snapshot,
            activeFilePath: authFile,
            cursorLine: 4,
            allowWorkspaceRetrieval: true,
            signalSnapshot: {
                snapshotGeneration: snapshot.generation,
                capturedAt: Date.now(),
                cursorSelection: {
                    documentUri: authFile,
                    documentVersion: snapshot.generation,
                    cursorLine: 4
                },
                diagnostics: [
                    {
                        filePath: authFile,
                        line: 5,
                        message: "Property 'validate' does not exist on UserModel",
                        severity: 'error',
                        category: 'undefined_symbol',
                        extractedSymbol: 'validate',
                        documentVersion: snapshot.generation
                    }
                ]
            }
        });

        const activeReceipts = activeResult.receipts || [];
        for (const compId of ['delta_context', 'error_intelligence', 'test_graph', 'git_graph'] as const) {
            const attempted = activeReceipts.find(r => r.componentId === compId && r.outcome === 'attempted');
            const invoked = activeReceipts.find(r => r.componentId === compId && r.outcome === 'invoked');
            const terminal = activeReceipts.find(r => r.componentId === compId &&
                (r.outcome === 'contributed' || r.outcome === 'fallback'));
            assert.ok(attempted, `${compId} must emit attempted receipt`);
            assert.ok(invoked, `${compId} must emit invoked receipt`);
            assert.ok(terminal, `${compId} must report admitted contribution or a coded fallback`);
        }

        // Reset flags
        FeatureFlagRegistry.resetToDefault();
        console.log('✓ PipelineOrchestrator integration and ComponentReceiptTrail receipts verified.');
    }

    // Clean up temporary workspace
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup failure in tmp
    }

    console.log('✓ All Phase 13 Delta, Diagnostic, Test & Git Intelligence tests passed cleanly.');
}
