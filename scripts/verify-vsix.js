'use strict';

const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifact = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const required = new Set([
    'extension/dist/extension.js',
    'extension/package.json',
    'extension/parsers/tree-sitter.wasm',
    'extension/parsers/tree-sitter-typescript.wasm',
    'extension/parsers/tree-sitter-javascript.wasm',
    'extension/parsers/tree-sitter-python.wasm'
]);

function readEntry(zip, entry) {
    return new Promise((resolve, reject) => {
        zip.openReadStream(entry, (error, stream) => {
            if (error) return reject(error);
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    });
}

async function verify() {
    if (!fs.existsSync(artifact)) throw new Error(`VSIX artifact not found: ${artifact}`);
    await new Promise((resolve, reject) => {
        yauzl.open(artifact, { lazyEntries: true, validateEntrySizes: true }, (openError, zip) => {
            if (openError) return reject(openError);
            const found = new Set();
            zip.on('error', reject);
            zip.on('entry', async entry => {
                try {
                    if (required.has(entry.fileName)) {
                        if (found.has(entry.fileName)) throw new Error(`Duplicate required VSIX entry: ${entry.fileName}`);
                        found.add(entry.fileName);
                        const bytes = await readEntry(zip, entry);
                        if (entry.fileName.endsWith('.wasm')) await WebAssembly.compile(bytes);
                        if (entry.fileName === 'extension/package.json') {
                            const packagedManifest = JSON.parse(bytes.toString('utf8'));
                            if (packagedManifest.capabilities?.untrustedWorkspaces?.supported !== 'limited') {
                                throw new Error('Packaged manifest does not declare limited untrusted-workspace support.');
                            }
                        }
                    }
                    zip.readEntry();
                } catch (error) {
                    zip.close();
                    reject(error);
                }
            });
            zip.on('end', () => {
                const missing = [...required].filter(name => !found.has(name));
                if (missing.length) reject(new Error(`VSIX is missing required entries: ${missing.join(', ')}`));
                else resolve();
            });
            zip.readEntry();
        });
    });
    console.log(`VSIX integrity verified: ${path.basename(artifact)} (${required.size} required entries, all WASM modules valid).`);
}

verify().catch(error => {
    console.error(`VSIX integrity verification failed: ${error.message}`);
    process.exitCode = 1;
});
