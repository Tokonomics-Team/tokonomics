import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecuritySanitizer } from '../src/security/sanitizer';
import { ModelRequestBoundary, RequestBoundaryError } from '../src/security/requestBoundary';
import { TokenIgnoreFilter } from '../src/ignore/tokenIgnore';
import { WorkspaceSourcePolicy, SourcePolicyError } from '../src/security/sourcePolicy';
import { AstPrunerEngine } from '../src/ast/pruner';
import { TokenOptimizerLanguageModelProvider } from '../src/proxy/modelProvider';
import * as mockVscode from './mock-vscode';

function expectCode(fn: () => unknown, code: string): void {
    assert.throws(fn, (error: unknown) => error instanceof RequestBoundaryError || error instanceof SourcePolicyError
        ? error.code === code
        : false);
}

export async function runPhase1SecurityBoundaryTests(): Promise<void> {
    console.log('Running Phase 1 trust, source-policy, egress, and parser tests...');

    const secretCorpus = [
        'sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456',
        'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
        'glpat-abcdefghijklmnopqrstuvwxyz1234',
        'AIzaabcdefghijklmnopqrstuvwxyz123456789',
        'AKIAABCDEFGHIJKLMNOP',
        'npm_abcdefghijklmnopqrstuvwxyz1234567890',
        'sk_live_abcdefghijklmnopqrstuvwxyz',
        'eyJabcdefghijk.abcdefghijkl.abcdefghijkl',
        'password=supersecretvalue'
    ].join('\n');
    const sanitized = SecuritySanitizer.sanitizeSecrets(secretCorpus);
    assert.ok(sanitized.redactedCount >= 9, 'representative cloud and generic credentials must be redacted');
    assert.strictEqual(sanitized.residualSecret, false, 'the post-redaction scan must be clean');
    assert.ok(!sanitized.sanitized.includes('supersecretvalue'));

    const workspace = path.join(os.tmpdir(), 'tokonomics-boundary-workspace');
    const prepared = ModelRequestBoundary.prepare(
        [{ role: 'user', content: `Inspect ${path.join(workspace, 'src', 'auth.ts')} password=anothersecretvalue` }],
        { tools: [{ description: 'uses ghp_abcdefghijklmnopqrstuvwxyz1234567890' }] },
        { workspaceRoots: [workspace], workspaceTrusted: true, containsWorkspaceData: true }
    );
    assert.ok(prepared.messages[0].content.includes('<workspace>/src/auth.ts'));
    assert.ok(!JSON.stringify(prepared).includes('anothersecretvalue'));
    assert.ok(!JSON.stringify(prepared.options).includes('ghp_'));
    expectCode(() => ModelRequestBoundary.prepare([{ role: 'user', content: 'workspace data' }], {}, {
        workspaceTrusted: false, containsWorkspaceData: true
    }), 'UNTRUSTED_WORKSPACE');
    expectCode(() => ModelRequestBoundary.prepare([{ role: 'user', content: 'cancelled' }], {}, {
        workspaceTrusted: true, isCancellationRequested: true
    }), 'CANCELLED');
    expectCode(() => ModelRequestBoundary.prepare([{ role: 'user', content: 'x'.repeat(100) }], {}, {
        workspaceTrusted: true, maxPayloadBytes: 20
    }), 'PAYLOAD_TOO_LARGE');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase1-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-outside-'));
    try {
        fs.mkdirSync(path.join(tempRoot, 'src'));
        fs.writeFileSync(path.join(tempRoot, '.gitignore'), 'ignored.ts\n');
        fs.writeFileSync(path.join(tempRoot, '.tokenignore'), '*.generated.ts\n!.env\n');
        fs.writeFileSync(path.join(tempRoot, 'src', 'safe.ts'), 'export const safe = true;\n');
        fs.writeFileSync(path.join(tempRoot, 'ignored.ts'), 'ignored');
        fs.writeFileSync(path.join(tempRoot, 'thing.generated.ts'), 'ignored');
        fs.writeFileSync(path.join(tempRoot, '.env'), 'PASSWORD=must-not-read');
        fs.writeFileSync(path.join(tempRoot, 'binary.ts'), Buffer.from([0, 1, 2]));
        const outside = path.join(outsideRoot, 'outside.ts');
        fs.writeFileSync(outside, 'outside');

        const ignore = new TokenIgnoreFilter(tempRoot);
        assert.ok(ignore.isIgnored(path.join(tempRoot, 'ignored.ts')), '.gitignore must be honored');
        assert.ok(ignore.isIgnored(path.join(tempRoot, 'thing.generated.ts')), '.tokenignore globs must be honored');
        assert.ok(ignore.isIgnored(path.join(tempRoot, '.env')), 'sensitive defaults cannot be negated');

        const policy = new WorkspaceSourcePolicy([tempRoot], true);
        const safe = policy.readText(path.join(tempRoot, 'src', 'safe.ts'));
        assert.strictEqual(safe.displayPath, 'src/safe.ts');
        expectCode(() => policy.readText(outside), 'OUTSIDE_WORKSPACE');
        expectCode(() => policy.readText(path.join(tempRoot, '.env')), 'IGNORED');
        expectCode(() => policy.readText(path.join(tempRoot, 'binary.ts')), 'BINARY');
        expectCode(() => new WorkspaceSourcePolicy([tempRoot], false).readText(path.join(tempRoot, 'src', 'safe.ts')), 'UNTRUSTED_WORKSPACE');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        fs.rmSync(outsideRoot, { recursive: true, force: true });
    }

    for (const asset of ['tree-sitter.wasm', 'tree-sitter-typescript.wasm', 'tree-sitter-javascript.wasm', 'tree-sitter-python.wasm']) {
        const bytes = fs.readFileSync(path.join(process.cwd(), 'parsers', asset));
        await WebAssembly.compile(bytes);
    }
    const parser = new AstPrunerEngine();
    await parser.initialize(process.cwd());
    assert.strictEqual(parser.hasTreeSitterActive(), true, 'the packaged runtime and every required grammar must initialize');
    const pruned = parser.pruneCodeContext(`
        import { readFile } from 'fs';
        export interface User { id: string; name: string; }
        export class UserService {
            private users: User[] = [];
            public findUser(id: string): User | undefined {
                return this.users.find(user => user.id === id);
            }
            public load(path: string): string {
                return readFile(path, () => undefined) as unknown as string;
            }
        }
    `, 'typescript');
    assert.ok(pruned.prunedCode.includes('UserService'));

    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    assert.strictEqual(manifest.capabilities.untrustedWorkspaces.supported, 'limited');
    assert.strictEqual(manifest.contributes.configuration.properties['tokenOptimizer.workspaceContextMode'].default, 'selection');

    mockVscode.clearLastModelRequest();
    const proxy = new TokenOptimizerLanguageModelProvider({
        processMessages: (messages: any[]) => ({
            alignedMessages: messages,
            stats: { originalTokens: 10, optimizedTokens: 8, reductionPercentage: 20 }
        })
    } as any, () => undefined);
    await proxy.provideLanguageModelChatResponse(
        {},
        [{ role: mockVscode.LanguageModelChatMessageRole.User, content: [new mockVscode.LanguageModelTextPart('password=providersecretvalue')] }],
        { tools: [{ description: 'Bearer abcdefghijklmnopqrstuvwxyz12345' }] },
        { report: () => undefined } as any,
        { isCancellationRequested: false } as any
    );
    const outbound = JSON.stringify(mockVscode.lastModelRequest);
    assert.ok(mockVscode.lastModelRequest, 'the mock provider must observe a successful outbound request');
    assert.ok(!outbound.includes('providersecretvalue') && !outbound.includes('abcdefghijklmnopqrstuvwxyz12345'), 'canaries must not reach the provider in messages or tool options');
    console.log('Phase 1 security boundary tests passed.');
}
