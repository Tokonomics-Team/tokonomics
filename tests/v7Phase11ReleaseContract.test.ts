import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export function runV7Phase11ReleaseContractTests(): void {
    console.log('\n--- Running v7.0.1 Phase 11 release-contract tests ---');
    const root = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    assert.strictEqual(pkg.version, '8.0.0');
    assert.strictEqual(lock.version, '8.0.0');
    assert.strictEqual(lock.packages[''].version, '8.0.0');
    assert.ok(pkg.displayName.includes('8.0.0'));
    assert.ok(pkg.scripts['vsce:package'].includes('tokonomics-8.0.0.vsix'));
    assert.ok(pkg.scripts['publish:ovsx'].includes('tokonomics-8.0.0.vsix'));
    for (const script of ['compile', 'test', 'package', 'validate:all', 'audit:clean-room', 'certify:deep', 'certify:release']) {
        assert.ok(pkg.scripts[script], `Required release script missing: ${script}`);
    }
    const settings = Object.keys(pkg.contributes.configuration.properties).sort();
    assert.deepStrictEqual(settings, ['tokenOptimizer.includeUnsavedChanges', 'tokenOptimizer.optimizationMode',
        'tokenOptimizer.responseReuse', 'tokenOptimizer.workspaceContext']);
    const commandIds = pkg.contributes.commands.map((command: { command: string }) => command.command);
    assert.strictEqual(commandIds.length, new Set(commandIds).size);
    assert.ok(commandIds.includes('tokenOptimizer.manageProjectMemory'));

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.match(readme, /^# Tokonomics 8\.0\.0/m);
    assert.match(changelog, /^## 8\.0\.0\b/m);
    assert.doesNotMatch(`${readme}\n${changelog}`, /PipelineOrchestrator|BM25|knapsack|cross-encoder|AES-256-GCM|Ed25519|threshold|architecture layer/i);
    assert.match(changelog, /local-model assistance is not enabled or advertised/i);

    const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
    for (const pattern of ['src/**', 'tests/**', 'validation/**', 'scripts/**', 'INTERNAL_ARCHITECTURE_AND_FEATURES.md', '*.map']) {
        assert.ok(vscodeIgnore.includes(pattern), `VSIX exclusion missing: ${pattern}`);
    }
    console.log('Phase 11 version, four-setting, documentation, command, and package-boundary contracts passed.');
}
