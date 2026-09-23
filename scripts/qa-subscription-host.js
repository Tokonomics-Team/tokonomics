'use strict';
// Real workspace/LSP APIs in an isolated VS Code profile. Provider dispatch is stubbed;
// no account, network request, or live-user profile is used by this check.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

async function main() {
    const root = path.resolve(__dirname, '..');
    const code = process.env.TOKONOMICS_HOST_PATH || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe');
    if (!fs.existsSync(code)) throw new Error('Set TOKONOMICS_HOST_PATH to the VS Code executable.');
    const scratch = fs.mkdtempSync(path.join(root, 'scratch', 'subscription-host-'));
    const extension = path.join(scratch, 'extension');
    const user = path.join(scratch, 'user');
    const resultPath = path.join(scratch, 'result.json');
    fs.mkdirSync(extension, { recursive: true });
    fs.mkdirSync(path.join(user, 'User'), { recursive: true });
    fs.writeFileSync(path.join(extension, 'package.json'), JSON.stringify({ name: 'tokonomics-host-check', publisher: 'localtest', version: '0.0.1', engines: { vscode: '^1.106.0' }, main: 'empty.js' }));
    fs.writeFileSync(path.join(extension, 'empty.js'), 'exports.activate=()=>{};');
    fs.writeFileSync(path.join(user, 'User', 'settings.json'), JSON.stringify({
        'tokenOptimizer.workspaceContext': 'automatic', 'tokenOptimizer.optimizationMode': 'maximum',
        'tokenOptimizer.includeUnsavedChanges': false, 'security.workspace.trust.enabled': false
    }));
    const names = new Set();
    function scan(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) scan(file);
            else if (file.endsWith('.ts')) for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bvscode\.(\w+)/g)) names.add(match[1]);
        }
    }
    scan(path.join(root, 'src'));
    const shim = path.join(extension, 'vscode-shim.ts');
    fs.writeFileSync(shim, "const real=eval('require')('vscode');\n" + [...names].map(name => name === 'chat'
        ? 'export const chat={...real.chat,createChatParticipant:(_id,handler)=>{globalThis.tokonomicsHandler=handler;return {dispose(){}}}};'
        : `export const ${name}=real.${name};`).join('\n'));
    const source = `
        import { activate } from './src/extension';
        import { CanonicalRequestCompiler } from './src/protocol/canonicalCompiler';
        import { CanonicalProviderGateway } from './src/protocol/providerGateway';
        const real=eval('require')('vscode'), fs=require('fs'), path=require('path');
        export async function run() {
            const report={host:real.version,trusted:real.workspace.isTrusted,messages:[],compilations:[],sends:[]};
            const original=CanonicalRequestCompiler.prototype.compile;
            CanonicalRequestCompiler.prototype.compile=async function(request) {
                const result=await original.call(this,request);
                report.compilations.push({selected:result.compilation.evidenceRetrieval?.selected.length,
                    lsp:result.receipts?.filter(r=>r.componentId==='lsp_intelligence')});
                return result;
            };
            CanonicalProviderGateway.send=async function(model,request) {
                const text=JSON.stringify(request.messages);
                report.sends.push({model:model.id,hasEvidence:text.includes('<tokonomics-evidence'),
                    hasSourceHeader:text.includes('--- ') && text.includes('.ts:')
                        && (text.includes('export ') || text.includes('function ')),characters:text.length});
                return {text:(async function*(){yield 'LOCAL_HOST_CHECK_REACHED_SEND';})()};
            };
            const store=new Map([['subscriptionCli.codex',${JSON.stringify(process.execPath)}],['subscriptionCli.claude',${JSON.stringify(process.execPath)}]]);
            const state={get:(key,fallback)=>store.has(key)?store.get(key):fallback,update:async(key,value)=>store.set(key,value)};
            const context={subscriptions:[],extensionPath:${JSON.stringify(root)},globalState:state,workspaceState:state,
                asAbsolutePath:file=>path.resolve(${JSON.stringify(root)},file)};
            try {
                const doc=await real.workspace.openTextDocument(real.Uri.file(path.resolve('docs/SUBSCRIPTION_CHAT.md')));
                await real.window.showTextDocument(doc);
                await activate(context);
                for(const command of ['codex','claude']) {
                    const cancellation=new real.CancellationTokenSource();
                    try { await globalThis.tokonomicsHandler({command,
                        prompt:'can you analyze the current project and tell me the actual cost savings for an individual developer',
                        references:[{id:'skills',value:JSON.stringify({text:('Available editor skills and instructions. '+String.fromCharCode(96).repeat(3)+'text'+String.fromCharCode(96).repeat(3)).repeat(200)})}]},
                        {history:[]},{markdown:value=>report.messages.push(value),button:()=>{},progress:()=>{}},cancellation.token);
                    } finally { cancellation.dispose(); }
                }
                report.passed=report.sends.length===2 && report.sends.every(s=>s.hasEvidence && s.hasSourceHeader)
                    && report.messages.filter(m=>m==='LOCAL_HOST_CHECK_REACHED_SEND').length===2;
            } catch(error) { report.error=error.stack; report.passed=false; }
            finally {
                for(const disposable of context.subscriptions) disposable?.dispose?.();
                fs.writeFileSync(${JSON.stringify(resultPath)},JSON.stringify(report,null,2));
            }
            if(!report.passed) throw new Error('Host check failed; see result.json');
        }
    `;
    const bundle = await esbuild.build({ stdin: { contents: source, loader: 'ts', resolveDir: root }, bundle: true,
        platform: 'node', format: 'cjs', write: false, alias: { vscode: shim } });
    const test = path.join(extension, 'test.cjs');
    fs.writeFileSync(test, `process.chdir(${JSON.stringify(root)});\n` + bundle.outputFiles[0].text);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawnSync(code, [`--user-data-dir=${user}`, `--extensions-dir=${path.join(scratch, 'extensions')}`,
        `--extensionDevelopmentPath=${extension}`, `--extensionTestsPath=${test}`, '--disable-workspace-trust',
        '--skip-welcome', '--skip-release-notes', root], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
    fs.writeFileSync(path.join(scratch, 'host.log'), (child.stdout || '') + (child.stderr || ''));
    console.log('Host report: ' + resultPath);
    const report = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : {};
    if (child.error || child.status !== 0 || !report.passed) throw new Error('Real host check failed: ' + (child.error?.message || report.error || child.status));
    console.log(JSON.stringify({ host: report.host, passed: report.passed, sends: report.sends, provider: 'stubbed; no network request' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
