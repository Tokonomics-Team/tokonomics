/**
 * Optional Developer Utility: Download Tree-Sitter WASM Grammars
 * 
 * Note: Tokonomics' default production engine is the pure TypeScript Stateful AST Slicer,
 * which requires zero binary/WASM files and runs across 14 languages out of the box.
 * This script is an optional developer tool for experimental WASM grammar testing.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const parsersDir = path.join(__dirname, '..', 'parsers');
if (!fs.existsSync(parsersDir)) {
    fs.mkdirSync(parsersDir, { recursive: true });
}

const GRAMMARS = [
    {
        name: 'tree-sitter-typescript.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.20.5/tree-sitter-typescript.wasm'
    },
    {
        name: 'tree-sitter-javascript.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.21.0/tree-sitter-javascript.wasm'
    }
];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                }).on('error', (err) => {
                    fs.unlink(dest, () => {});
                    reject(err);
                });
            } else if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                file.close();
                fs.unlink(dest, () => {});
                reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log('[download-parsers] Checking WASM grammars in', parsersDir);
    for (const grammar of GRAMMARS) {
        const dest = path.join(parsersDir, grammar.name);
        if (!fs.existsSync(dest)) {
            console.log(`[download-parsers] Downloading ${grammar.name}...`);
            try {
                await downloadFile(grammar.url, dest);
                console.log(`[download-parsers] Successfully downloaded ${grammar.name}`);
            } catch (err) {
                console.warn(`[download-parsers] Could not download ${grammar.name} (${err.message}). The extension will seamlessly use its high-speed heuristic AST pruner.`);
            }
        } else {
            console.log(`[download-parsers] Grammar ${grammar.name} already present.`);
        }
    }
}

main().catch(console.error);
