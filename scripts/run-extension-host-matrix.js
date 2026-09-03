'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } = require('@vscode/test-electron');
const { inspectVsix, sha256 } = require('./lib/vsix-artifact');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'validation', 'compatibility-matrix.json'), 'utf8'));
const artifactPath = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const reportPath = path.join(root, 'validation', 'reports', 'extension-host-matrix.json');
const fullMatrix = process.argv.includes('--all');

function localStableExecutable() {
    const configured = process.env.TOKONOMICS_VSCODE_STABLE_PATH;
    const candidates = [
        configured,
        process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe') : undefined,
        process.platform === 'darwin' ? '/Applications/Visual Studio Code.app/Contents/MacOS/Electron' : undefined,
        process.platform === 'linux' ? '/usr/share/code/code' : undefined
    ].filter(Boolean);
    return candidates.find(candidate => fs.existsSync(candidate));
}

function hostMetadata(executable) {
    const installRoot = path.dirname(executable);
    const direct = path.join(installRoot, 'resources', 'app', 'product.json');
    const candidates = [direct, ...fs.readdirSync(installRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(installRoot, entry.name, 'resources', 'app', 'product.json'))]
        .filter(candidate => fs.existsSync(candidate));
    if (candidates.length !== 1) throw new Error(`Expected one VS Code product manifest, found ${candidates.length}.`);
    const product = JSON.parse(fs.readFileSync(candidates[0], 'utf8'));
    if (!product.version || !product.commit) throw new Error('VS Code product manifest is missing version or commit metadata.');
    return { actualVersion: product.version, hostCommit: product.commit, hostQuality: product.quality || 'unknown' };
}

function installArtifact(executable, extensionsDir, userDataDir) {
    const resolved = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
    const windowsBatch = process.platform === 'win32' && /\.cmd$/i.test(resolved[0]);
    const command = windowsBatch ? executable : resolved[0];
    let baseArgs = resolved.slice(1);
    if (windowsBatch) {
        const installRoot = path.dirname(executable);
        const direct = path.join(installRoot, 'resources', 'app', 'out', 'cli.js');
        const candidates = [direct, ...fs.readdirSync(installRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path.join(installRoot, entry.name, 'resources', 'app', 'out', 'cli.js'))]
            .filter(candidate => fs.existsSync(candidate));
        if (candidates.length !== 1) throw new Error(`Expected one VS Code Electron CLI, found ${candidates.length}.`);
        baseArgs = [candidates[0]];
    }
    const result = spawnSync(command, [...baseArgs, '--install-extension', artifactPath, '--force', '--extensions-dir', extensionsDir, '--user-data-dir', userDataDir], {
        cwd: root, encoding: 'utf8', shell: false, timeout: 120_000,
        env: windowsBatch ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env
    });
    if (result.status !== 0) throw new Error(`VSIX installation failed: ${result.stderr || result.stdout || result.error}`);
    const directories = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith(`${manifest.publisher}.${manifest.name}-`))
        .map(entry => path.join(extensionsDir, entry.name));
    if (directories.length !== 1) throw new Error(`Expected one isolated VSIX installation, found ${directories.length}.`);
    return directories[0];
}

function verifyInstalledBytes(installedPath, artifact) {
    for (const entry of artifact.entries.values()) {
        if (!entry.name.startsWith('extension/')) continue;
        const relative = entry.name.slice('extension/'.length);
        const installedFile = path.join(installedPath, ...relative.split('/'));
        if (!fs.existsSync(installedFile)) {
            throw new Error(`Installed file differs from inspected VSIX entry: ${entry.name}`);
        }
        const installedBytes = fs.readFileSync(installedFile);
        if (relative === 'package.json') {
            const packagedManifest = JSON.parse(entry.bytes.toString('utf8'));
            const installedManifest = JSON.parse(installedBytes.toString('utf8'));
            delete installedManifest.__metadata;
            if (JSON.stringify(installedManifest) !== JSON.stringify(packagedManifest)) throw new Error('Installed manifest changed beyond host-owned __metadata.');
        } else if (sha256(installedBytes) !== entry.sha256) {
            throw new Error(`Installed file differs from inspected VSIX entry: ${entry.name}`);
        }
    }
}

async function resolveExecutable(host) {
    if (!fullMatrix && host.id !== 'stable') return undefined;
    if (host.id === 'stable' && localStableExecutable()) return localStableExecutable();
    return downloadAndUnzipVSCode({ version: host.version, cachePath: path.join(root, '.vscode-test'), timeout: 60_000 });
}

async function main() {
    const artifact = await inspectVsix(artifactPath);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase9-host-'));
    const results = [];
    let cleanupWarning;
    try {
        const suitePath = path.join(tempRoot, 'extension-host-suite.js');
        await esbuild.build({ entryPoints: [path.join(root, 'tests', 'phase9ExtensionHost.test.ts')], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: suitePath, external: ['vscode'] });
        const workspaceA = path.join(tempRoot, 'workspace-a');
        const workspaceB = path.join(tempRoot, 'workspace-b');
        fs.mkdirSync(workspaceA); fs.mkdirSync(workspaceB);
        fs.writeFileSync(path.join(workspaceA, 'index.ts'), 'export const alpha = 1;\n');
        fs.writeFileSync(path.join(workspaceB, 'index.ts'), 'export const beta = 2;\n');
        const workspaceFile = path.join(tempRoot, 'phase9.code-workspace');
        fs.writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: workspaceA }, { path: workspaceB }], settings: {
            'tokenOptimizer.workspaceContextMode': 'selection', 'tokenOptimizer.enableBackgroundRamWarming': false
        } }));

        for (const host of matrix.hosts) {
            const started = Date.now();
            const evidence = { id: host.id, requestedVersion: host.version, channel: host.channel, requiredForRelease: host.requiredForRelease };
            try {
                const executable = await resolveExecutable(host);
                if (!executable) {
                    results.push({ ...evidence, status: 'not-executed', reason: 'Host unavailable in local-only mode.', durationMs: Date.now() - started });
                    continue;
                }
                const hostRoot = path.join(tempRoot, host.id);
                const extensionsDir = path.join(hostRoot, 'extensions');
                const userDataDir = path.join(hostRoot, 'user-data');
                fs.mkdirSync(extensionsDir, { recursive: true }); fs.mkdirSync(userDataDir, { recursive: true });
                const installedPath = installArtifact(executable, extensionsDir, userDataDir);
                verifyInstalledBytes(installedPath, artifact);
                const runInstalledHost = async (profilePath) => {
                    const inheritedElectronMode = process.env.ELECTRON_RUN_AS_NODE;
                    delete process.env.ELECTRON_RUN_AS_NODE;
                    try {
                        await runTests({
                        vscodeExecutablePath: executable,
                        extensionDevelopmentPath: installedPath,
                        extensionTestsPath: suitePath,
                        reuseMachineInstall: true,
                        extensionTestsEnv: { TOKONOMICS_EXPECTED_VERSION: manifest.version, TOKONOMICS_EXPECTED_EXTENSION_PATH: installedPath },
                        launchArgs: [workspaceFile, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
                            '--extensions-dir', extensionsDir, '--user-data-dir', profilePath]
                        });
                    } finally {
                        if (inheritedElectronMode === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
                        else process.env.ELECTRON_RUN_AS_NODE = inheritedElectronMode;
                    }
                };
                await runInstalledHost(userDataDir);
                results.push({ ...evidence, status: 'passed', ...hostMetadata(executable), installedPayloadMatched: true,
                    trustedWorkspacePassed: true, restrictedWorkspaceRuntime: 'not-executed-development-host-forces-trust',
                    manifestNormalization: 'host-owned __metadata removed before comparison', durationMs: Date.now() - started });
            } catch (error) {
                results.push({ ...evidence, status: 'failed', error: String(error?.message || error).slice(0, 2000), durationMs: Date.now() - started });
                if (!fullMatrix) break;
            }
        }
    } finally {
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch (error) {
            cleanupWarning = `Temporary profile cleanup deferred: ${String(error?.code || error?.message || error)}`;
        }
    }
    const required = results.filter(result => result.requiredForRelease);
    const allRequiredPassed = required.length === matrix.hosts.filter(host => host.requiredForRelease).length && required.every(result => result.status === 'passed');
    const report = {
        schemaVersion: 1, classification: 'installed-vsix-extension-host-evidence', generatedAt: new Date().toISOString(),
        mode: fullMatrix ? 'full-matrix' : 'local-only', artifact: { path: path.basename(artifactPath), sha256: artifact.sha256 },
        results, allRequiredPassed, releaseCertified: false, cleanupWarning: cleanupWarning || null,
        limitations: allRequiredPassed ? ['Provider availability and account-backed model behavior remain environment-dependent.'] : ['Every required host must pass in one full-matrix run before release certification.']
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Extension Host matrix: ${results.map(result => `${result.id}=${result.status}`).join(', ')}.`);
    if (results.some(result => result.status === 'failed') || (fullMatrix && !allRequiredPassed)) process.exitCode = 1;
}

main().catch(error => { console.error(`Extension Host matrix failed: ${error.message}`); process.exitCode = 1; });
