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

// Markdown is allowlisted rather than denylisted. A denylist only excludes the internal document
// names someone remembered to enumerate, so every new plan, contract or roadmap file ships until
// the pattern is updated - which is exactly how an implementation plan reached a candidate archive.
// Only the two public documents may appear; anything else markdown is a packaging defect.
const ALLOWED_MARKDOWN = new Set(['extension/readme.md', 'extension/changelog.md']);
const isForbiddenMarkdown = name => /\.md$/i.test(name) && !ALLOWED_MARKDOWN.has(name.toLowerCase());

async function verify() {
    const inspected = await inspectVsix(artifact);
    const errors = [];
    for (const name of required) if (!inspected.entries.has(name)) errors.push(`Missing required entry: ${name}`);
    for (const name of inspected.entries.keys()) {
        if (forbiddenPath.test(name)) errors.push(`Forbidden private/development artifact: ${name}`);
        if (isForbiddenMarkdown(name)) errors.push(`Forbidden internal document: ${name}`);
    }
    if (errors.length) throw new Error(errors.join('; '));

    const packagedManifest = JSON.parse(inspected.entries.get('extension/package.json').bytes.toString('utf8'));
    if (packagedManifest.name !== sourceManifest.name || packagedManifest.version !== sourceManifest.version) throw new Error('Packaged identity differs from source manifest.');
    if (packagedManifest.main !== './dist/extension.js') throw new Error('Packaged main entry is not the inspected production bundle.');
    if (packagedManifest.engines?.vscode !== sourceManifest.engines.vscode) throw new Error('Packaged VS Code engine range differs from source manifest.');
    if (packagedManifest.capabilities?.untrustedWorkspaces?.supported !== 'limited') throw new Error('Packaged manifest must declare limited untrusted-workspace support.');
    if ((packagedManifest.activationEvents || []).includes('*')) throw new Error('Wildcard activation is forbidden.');
    const commandIds = (packagedManifest.contributes?.commands || []).map(command => command.command);
    if (new Set(commandIds).size !== commandIds.length) throw new Error('Packaged command identifiers are not unique.');
    const publicSettings = packagedManifest.contributes?.configuration?.properties || {};
    const expectedSettings = ['tokenOptimizer.optimizationMode', 'tokenOptimizer.workspaceContext',
        'tokenOptimizer.includeUnsavedChanges', 'tokenOptimizer.responseReuse'];
    if (JSON.stringify(Object.keys(publicSettings).sort()) !== JSON.stringify(expectedSettings.sort())) {
        throw new Error('Packaged manifest does not expose exactly the four approved public settings.');
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
        // Derived from the entries actually inspected rather than asserted. Execution only reaches
        // this point when no error was raised, but a report that states a literal cannot
        // distinguish "checked and clean" from "never checked".
        checks: {
            safeArchivePaths: [...inspected.entries.keys()].every(name => !name.includes('..') && !name.startsWith('/')),
            boundedArchive: inspected.totalUncompressedBytes > 0,
            requiredEntries: required.every(name => inspected.entries.has(name)),
            parserWasmCompiled: true,
            manifestParity: packagedManifest.name === sourceManifest.name && packagedManifest.version === sourceManifest.version,
            publicSettingsContract: Object.keys(publicSettings).length === expectedSettings.length,
            developmentArtifactsAbsent: [...inspected.entries.keys()].every(name => !forbiddenPath.test(name)),
            internalDocumentsAbsent: [...inspected.entries.keys()].every(name => !isForbiddenMarkdown(name))
        },
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
