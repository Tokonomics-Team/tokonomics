import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
    'tokenOptimizer.showDashboard', 'tokenOptimizer.showAnalyticsWebview', 'tokenOptimizer.comparePrunedDiff',
    'tokenOptimizer.optimizeSelection', 'tokenOptimizer.toggleAstPruning', 'tokenOptimizer.resetMetrics',
    'tokenOptimizer.exportLogs', 'tokenOptimizer.liveStats', 'tokenOptimizer.aggregateStats', 'tokenOptimizer.explainTrace'
];

export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension('tokonomics.tokonomics');
    assert.ok(extension, 'The installed tokonomics.tokonomics extension must be discoverable.');
    assert.strictEqual(extension.packageJSON.version, process.env.TOKONOMICS_EXPECTED_VERSION);
    const expectedPath = fs.realpathSync(process.env.TOKONOMICS_EXPECTED_EXTENSION_PATH!);
    assert.strictEqual(fs.realpathSync(extension.extensionPath), expectedPath, 'Host must activate the isolated VSIX installation.');

    const api: any = await Promise.race([
        extension.activate(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Extension activation timed out.')), 15_000))
    ]);
    const diagnostics = api?.getCertificationDiagnostics?.();
    assert.strictEqual(diagnostics?.workspaceTrusted, true);
    assert.strictEqual(diagnostics?.workspaceRootCount, 2, 'Multi-root fixture must reach the installed extension.');
    assert.strictEqual(diagnostics?.languageModelProviderRegistered, true);
    assert.strictEqual(diagnostics?.chatParticipantRegistered, true);
    assert.strictEqual(diagnostics?.releaseChannel, 'stable');
    assert.strictEqual(diagnostics?.forcePassThrough, false);

    const registered = new Set(await vscode.commands.getCommands(true));
    for (const command of EXPECTED_COMMANDS) assert.ok(registered.has(command), `Missing registered command: ${command}`);
    await vscode.commands.executeCommand('tokenOptimizer.showDashboard');
    await vscode.commands.executeCommand('tokenOptimizer.showAnalyticsWebview');

    const config = vscode.workspace.getConfiguration('tokenOptimizer');
    assert.strictEqual(config.inspect('releaseChannel')?.defaultValue, 'stable');
    assert.strictEqual(config.inspect('stagedRolloutPercent')?.defaultValue, 100);
    assert.strictEqual(config.inspect('emergencyDisableOptimization')?.defaultValue, false);
    assert.deepStrictEqual(config.inspect('disabledCapabilities')?.defaultValue, []);

    for (const parser of ['tree-sitter.wasm', 'tree-sitter-typescript.wasm', 'tree-sitter-javascript.wasm', 'tree-sitter-python.wasm']) {
        const bytes = fs.readFileSync(path.join(extension.extensionPath, 'parsers', parser));
        await WebAssembly.compile(bytes);
    }
}
