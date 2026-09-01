const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function build() {
    const parserSource = path.dirname(require.resolve('@vscode/tree-sitter-wasm'));
    const parserOutput = path.join(__dirname, 'parsers');
    fs.mkdirSync(parserOutput, { recursive: true });
    for (const asset of ['tree-sitter.wasm', 'tree-sitter-typescript.wasm', 'tree-sitter-javascript.wasm', 'tree-sitter-python.wasm']) {
        fs.copyFileSync(path.join(parserSource, asset), path.join(parserOutput, asset));
    }
    const context = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile: 'dist/extension.js',
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        sourcemap: !isProduction,
        minify: isProduction,
        logLevel: 'info'
    });

    if (isWatch) {
        console.log('[esbuild] Watching for changes...');
        await context.watch();
    } else {
        await context.rebuild();
        await context.dispose();
        console.log(`[esbuild] Build complete (${isProduction ? 'production' : 'development'}).`);
    }
}

build().catch(err => {
    console.error('[esbuild] Build failed:', err);
    process.exit(1);
});
