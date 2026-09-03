'use strict';

const fs = require('fs');
const path = require('path');
const { inspectVsix } = require('./lib/vsix-artifact');

const root = path.resolve(__dirname, '..');
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifact = path.join(root, `${sourceManifest.name}-${sourceManifest.version}.vsix`);
const reportPath = path.join(root, 'validation', 'reports', 'vsix-inspection.json');
const required = [
    'extension.vsixmanifest', '[Content_Types].xml', 'extension/dist/extension.js', 'extension/package.json',
    'extension/readme.md', 'extension/changelog.md', 'extension/LICENSE.txt',
    'extension/parsers/tree-sitter.wasm', 'extension/parsers/tree-sitter-typescript.wasm',
    'extension/parsers/tree-sitter-javascript.wasm', 'extension/parsers/tree-sitter-python.wasm'
];
const forbiddenPath = /(^|\/)(?:src|tests?|validation|scripts|out|out_test|\.git|\.github|\.vscode-test)(?:\/|$)|(?:\.map|\.ts|\.log|\.env|\.pem|\.key|package-lock\.json)$/i;

async function verify() {
    const inspected = await inspectVsix(artifact);
    const errors = [];
    for (const name of required) if (!inspected.entries.has(name)) errors.push(`Missing required entry: ${name}`);
    for (const name of inspected.entries.keys()) if (forbiddenPath.test(name)) errors.push(`Forbidden private/development artifact: ${name}`);
    if (errors.length) throw new Error(errors.join('; '));

    const packagedManifest = JSON.parse(inspected.entries.get('extension/package.json').bytes.toString('utf8'));
    if (packagedManifest.name !== sourceManifest.name || packagedManifest.version !== sourceManifest.version) throw new Error('Packaged identity differs from source manifest.');
    if (packagedManifest.main !== './dist/extension.js') throw new Error('Packaged main entry is not the inspected production bundle.');
    if (packagedManifest.engines?.vscode !== sourceManifest.engines.vscode) throw new Error('Packaged VS Code engine range differs from source manifest.');
    if (packagedManifest.capabilities?.untrustedWorkspaces?.supported !== 'limited') throw new Error('Packaged manifest must declare limited untrusted-workspace support.');
    if ((packagedManifest.activationEvents || []).includes('*')) throw new Error('Wildcard activation is forbidden.');
    const commandIds = (packagedManifest.contributes?.commands || []).map(command => command.command);
    if (new Set(commandIds).size !== commandIds.length) throw new Error('Packaged command identifiers are not unique.');
    for (const key of ['tokenOptimizer.releaseChannel', 'tokenOptimizer.stagedRolloutPercent', 'tokenOptimizer.emergencyDisableOptimization', 'tokenOptimizer.disabledCapabilities']) {
        if (!packagedManifest.contributes?.configuration?.properties?.[key]) throw new Error(`Packaged release control is missing: ${key}`);
    }

    for (const name of required.filter(name => name.endsWith('.wasm'))) await WebAssembly.compile(inspected.entries.get(name).bytes);
    const bundle = inspected.entries.get('extension/dist/extension.js').bytes.toString('utf8');
    for (const marker of ['validation/', 'tests/', 'sourceMappingURL=', 'CERTIFIED FOR WORLDWIDE PRODUCTION']) {
        if (bundle.includes(marker)) throw new Error(`Production bundle contains forbidden marker: ${marker}`);
    }

    const report = {
        schemaVersion: 1,
        classification: 'artifact-inspection-evidence',
        generatedAt: new Date().toISOString(),
        artifact: { path: path.basename(artifact), sha256: inspected.sha256, sizeBytes: inspected.sizeBytes, totalUncompressedBytes: inspected.totalUncompressedBytes },
        package: { name: packagedManifest.name, version: packagedManifest.version, vscodeEngine: packagedManifest.engines.vscode },
        checks: { safeArchivePaths: true, boundedArchive: true, requiredEntries: true, parserWasmCompiled: true, manifestParity: true, releaseControlsPresent: true, developmentArtifactsAbsent: true },
        entries: [...inspected.entries.values()].map(({ name, sizeBytes, compressedSizeBytes, sha256 }) => ({ name, sizeBytes, compressedSizeBytes, sha256 }))
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`VSIX integrity verified: ${path.basename(artifact)} (${report.entries.length} files, SHA-256 ${inspected.sha256}).`);
}

verify().catch(error => {
    console.error(`VSIX integrity verification failed: ${error.message}`);
    process.exitCode = 1;
});
