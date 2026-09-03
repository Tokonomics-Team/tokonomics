'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { inspectVsix, sha256 } = require('./lib/vsix-artifact');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockPath = path.join(root, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const artifactPath = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const reportsDir = path.join(root, 'validation', 'reports');

function hashFile(relativePath) {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    return { uri: relativePath.replace(/\\/g, '/'), digest: { sha256: sha256(bytes) } };
}

function commitSha() {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

async function main() {
    const artifact = await inspectVsix(artifactPath);
    const runtimePackages = Object.entries(lock.packages || {})
        .filter(([location, entry]) => location && entry && entry.dev !== true && entry.version)
        .map(([location, entry]) => {
            const name = entry.name || location.replace(/^node_modules\//, '');
            return {
                type: 'library', name, version: entry.version,
                'bom-ref': `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
                purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
                scope: 'required',
                properties: [{ name: 'tokonomics:packaging', value: name === '@vscode/tree-sitter-wasm' ? 'bundled-and-parser-assets-copied' : 'bundled' }]
            };
        })
        .sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));
    const rootRef = `pkg:npm/${manifest.name}@${manifest.version}`;
    const timestamp = new Date().toISOString();
    const sbom = {
        bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
        metadata: {
            timestamp,
            tools: [{ vendor: 'Tokonomics', name: 'generate-supply-chain.js', version: '1' }],
            component: { type: 'application', name: manifest.name, version: manifest.version, 'bom-ref': rootRef },
            properties: [
                { name: 'tokonomics:artifact:sha256', value: artifact.sha256 },
                { name: 'tokonomics:artifact:fileCount', value: String(artifact.entries.size) }
            ]
        },
        components: runtimePackages,
        dependencies: [{ ref: rootRef, dependsOn: runtimePackages.map(component => component['bom-ref']) }]
    };
    const provenance = {
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: path.basename(artifactPath), digest: { sha256: artifact.sha256 } }],
        predicateType: 'https://slsa.dev/provenance/v1',
        predicate: {
            buildDefinition: {
                buildType: 'https://tokonomics.dev/build/vsix/v1',
                externalParameters: { package: `${manifest.name}@${manifest.version}`, command: 'npm run vsce:package -- --no-dependencies' },
                internalParameters: { signed: false, networkRequiredForBuild: false },
                resolvedDependencies: [hashFile('package.json'), hashFile('package-lock.json'), hashFile('esbuild.js'), hashFile('.vscodeignore')]
            },
            runDetails: {
                builder: { id: 'https://tokonomics.dev/local-builder/v1' },
                metadata: { invocationId: crypto.randomUUID(), startedOn: timestamp, finishedOn: new Date().toISOString() },
                byproducts: [{ name: 'repository-commit', content: commitSha() }, { name: 'node', content: process.version }, { name: 'platform', content: `${process.platform}/${process.arch}/${os.release()}` }]
            }
        }
    };
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`);
    fs.writeFileSync(path.join(reportsDir, 'artifact-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
    console.log(`Supply-chain evidence generated for ${path.basename(artifactPath)} (${runtimePackages.length} runtime components, SHA-256 ${artifact.sha256}).`);
}

main().catch(error => { console.error(`Supply-chain evidence generation failed: ${error.message}`); process.exitCode = 1; });
