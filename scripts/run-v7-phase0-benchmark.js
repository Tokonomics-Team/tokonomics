'use strict';

const crypto = require('crypto');
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const runId = crypto.randomBytes(8).toString('hex');
    const bundlePath = path.join(os.tmpdir(), `tokonomics-v7-phase0-${runId}.cjs`);
    try {
        await esbuild.build({
            entryPoints: [path.join(rootDir, 'scripts', 'v7-phase0-benchmark-entry.ts')],
            bundle: true,
            outfile: bundlePath,
            platform: 'node',
            target: 'node20',
            format: 'cjs',
            alias: { vscode: path.join(rootDir, 'tests', 'mock-vscode.ts') },
            external: ['web-tree-sitter'],
            logLevel: 'silent'
        });
        const output = execFileSync(process.execPath, ['--expose-gc', bundlePath], {
            cwd: rootDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        }).trim();
        const lines = output.split(/\r?\n/).filter(Boolean);
        const result = JSON.parse(lines[lines.length - 1]);
        process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
        if (fs.existsSync(bundlePath)) fs.rmSync(bundlePath, { force: true });
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});
