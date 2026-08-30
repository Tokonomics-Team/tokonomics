const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function build() {
    const context = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile: 'dist/extension.js',
        external: ['vscode', 'web-tree-sitter'],
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
