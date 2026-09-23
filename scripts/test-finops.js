const esbuild = require('esbuild');
const path = require('path');
async function main() {
    const result = await esbuild.build({ stdin: { contents: "import { runFinOpsTests } from './tests/finOps.test'; runFinOpsTests().catch(e => { console.error(e); process.exitCode = 1; });", resolveDir: process.cwd(), loader: 'ts' },
        bundle: true, write: false, platform: 'node', format: 'cjs', alias: { vscode: path.join(process.cwd(), 'tests/mock-vscode.ts') } });
    new Function('require', result.outputFiles[0].text)(require);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
