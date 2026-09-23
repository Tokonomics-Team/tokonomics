'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { inspectVsix } = require('./lib/vsix-artifact');

async function main() {
    const root = path.resolve(__dirname, '..');
    const code = process.env.TOKONOMICS_HOST_PATH || path.join(process.env.LOCALAPPDATA, 'Programs/Microsoft VS Code/Code.exe');
    const artifact = path.resolve(process.argv[2] || 'tokonomics-subscription-panel.vsix');
    const inspected = await inspectVsix(artifact);
    const scratch = fs.mkdtempSync(path.join(root, 'scratch', 'installed-panel-'));
    const user = path.join(scratch, 'user'), extensions = path.join(scratch, 'extensions'), workspace = path.join(scratch, 'workspace');
    const harness = path.join(scratch, 'harness'), reportPath = path.join(scratch, 'report.json');
    for (const dir of [path.join(user, 'User'), extensions, workspace, harness]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'index.ts'), 'export function forwardedValue() { return 317; }\n');
    fs.writeFileSync(path.join(user, 'User/settings.json'), JSON.stringify({ 'security.workspace.trust.enabled': false,
        'tokenOptimizer.workspaceContext': 'automatic', 'tokenOptimizer.optimizationMode': 'balanced' }));
    const installRoot = path.dirname(code);
    const cli = [path.join(installRoot, 'resources/app/out/cli.js'), ...fs.readdirSync(installRoot, { withFileTypes: true })
        .filter(e => e.isDirectory()).map(e => path.join(installRoot, e.name, 'resources/app/out/cli.js'))].find(fs.existsSync);
    if (!cli) throw Error('VS Code Electron CLI not found. Set TOKONOMICS_HOST_PATH.');
    const installed = spawnSync(code, [cli, '--install-extension', artifact, '--force', '--user-data-dir', user, '--extensions-dir', extensions],
        { encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    if (installed.status !== 0) throw Error('Isolated VSIX install failed: ' + installed.stdout + installed.stderr);
    const installedPath = path.join(extensions, fs.readdirSync(extensions).find(n => n.startsWith('tokonomics.tokonomics-ai-')));
    if (!inspected.entries.get('extension/dist/extension.js').bytes.equals(fs.readFileSync(path.join(installedPath, 'dist/extension.js')))) throw Error('Installed bytes differ');
    fs.writeFileSync(path.join(harness, 'package.json'), JSON.stringify({ name: 'installed-panel-check', publisher: 'localtest',
        version: '0.0.1', engines: { vscode: '^1.106.0' }, activationEvents: ['*'], main: 'empty.js' }));
    // --extensionTestsPath forces in-memory workspace storage in VS Code. Launch an ordinary
    // isolated development host so a second process can verify actual disk-backed restoration.
    fs.writeFileSync(path.join(harness, 'empty.js'), `const test=require('./test.cjs'); exports.activate=()=>{setTimeout(async()=>{
        try{await test.run();}catch(error){console.error(error);}
        finally{await require('vscode').commands.executeCommand('workbench.action.quit');}
    },0);};`);
    const fixture = path.join(scratch, 'cli-fixture.cjs');
    fs.writeFileSync(fixture, `
        const args=process.argv.slice(2),emit=e=>process.stdout.write(JSON.stringify(e)+'\\n');
        if(args[0]==='login'){process.stdout.write('Logged in using ChatGPT');process.exit(0);}
        if(args[0]==='auth'){emit({loggedIn:true,authMethod:'claude.ai'});process.exit(0);}
        let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>text+=v);process.stdin.on('end',()=>{
            if(!text.includes('317')||!text.includes('tokonomics-evidence')){emit({type:'error',message:'Fixture expected compiled workspace source'});process.exit(1);}
            const chosen=args.includes('--model')?args[args.indexOf('--model')+1]:'default';
            const answer='Fixture received workspace source; model='+chosen;
            // Synthetic activity only; the fixture never runs this command or changes a file.
            if(args[0]==='exec'){
                emit({type:'item.started',item:{id:'cmd',type:'command_execution',command:'npm test',status:'in_progress'}});
                emit({type:'item.completed',item:{id:'cmd',type:'command_execution',command:'npm test',exit_code:0}});
            } else {
                emit({type:'assistant',message:{content:[{type:'tool_use',id:'edit',name:'Edit',input:{file_path:'src/app.ts'}}]}});
                emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'edit'}]}});
            }
            if(args[0]==='exec'){emit({type:'item.completed',item:{type:'agent_message',text:answer}});emit({type:'turn.completed',usage:{input_tokens:100,output_tokens:8}});}
            else {emit({type:'system',subtype:'init',model:chosen});emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:answer}}});emit({type:'result',subtype:'success',result:answer,usage:{input_tokens:100,output_tokens:8}});}
        });
    `);
    const test = path.join(harness, 'test.cjs');
    fs.writeFileSync(test, `
        const fs=require('fs'),Module=require('module'),vscode=require('vscode');
        const original=Module._load;const report={host:vscode.version,installedBytesVerified:true,messages:[],invocations:[],spawns:[]};
        let captured;let historyChoice;const originalSpawn=require('child_process').spawn;
        Module._load=function(id,parent,...rest){
            const value=original.call(this,id,parent,...rest);
            if(!parent?.filename.toLowerCase().startsWith(${JSON.stringify(installedPath.toLowerCase())}))return value;
            if(id==='child_process')return {...value,spawn:(exe,args,options)=>{
                report.spawns.push({exe,arg0:args[0]});
                // Redirect on the command shape, not on the executable path. The extension activates
                // on onStartupFinished - before this test can seed a configured CLI path - so keying
                // the fixture to a seeded path silently fell through to the developer's real CLIs,
                // spending real subscription quota and making the run depend on their account.
                if(['login','auth','exec','-p'].includes(args[0])){
                    report.invocations.push(args);
                    return originalSpawn(${JSON.stringify(process.execPath)},[${JSON.stringify(fixture)},...args],options);
                }
                throw Object.assign(new Error('Unexpected process launch in hermetic panel test: '+exe),{code:'ENOENT'});
            }};
            if(id==='vscode')return new Proxy(value,{get(api,key){if(key!=='window')return api[key];return new Proxy(api.window,{get(window,key){
                if(key==='showQuickPick'&&historyChoice)return async items=>items.find(item=>item.sessionId===historyChoice);
                if(key!=='registerWebviewViewProvider')return window[key];return (id,provider,options)=>{
                if(id==='tokenOptimizer.chatView'){
                    captured=provider;report.retainContextWhenHidden=options?.webviewOptions?.retainContextWhenHidden;
                    const post=provider.post.bind(provider);
                    provider.post=message=>{report.messages.push(message);return post(message);};
                }
                return value.window.registerWebviewViewProvider(id,provider,options);
            };}});}});
            return value;
        };
        exports.run=async()=>{
            const check=(ok,message)=>{if(!ok)throw Error(message)};
            try {
                const extension=vscode.extensions.getExtension('tokonomics.tokonomics-ai');check(extension,'Installed extension absent');
                // Set paths in the actual extension's Memento during activation, before any CLI call.
                const module=require(${JSON.stringify(path.join(installedPath, 'dist/extension.js'))});
                const activate=module.activate;
                module.activate=async context=>{await context.globalState.update('subscriptionCli.codex',${JSON.stringify(process.execPath)});
                    await context.globalState.update('subscriptionCli.claude',${JSON.stringify(process.execPath)});return activate(context);};
                await extension.activate();
                check((await vscode.commands.getCommands(true)).includes('tokenOptimizer.openChat'),'Open Chat not registered');
                await vscode.commands.executeCommand('tokenOptimizer.openChatInEditor');
                for(let i=0;i<40&&!captured?.controller;i++)await new Promise(r=>setTimeout(r,100));
                check(captured?.controller,'Installed panel did not resolve');
                check(captured.editorPanel?.visible,'Open Chat must open a visible editor tab');
                const sessionId=captured.controller.currentSessionId;
                await captured.handleInbound({type:'ready'});
                check(report.messages.some(m=>m.type==='models'&&m.models.some(x=>x.id==='subscription:claude:sonnet')),'Subscription picker missing');
                check(report.retainContextWhenHidden===true,'Hidden webview context is not retained');
                if(process.env.TOKONOMICS_QA_RESTORE==='1'){
                    const state=captured.controller.snapshot();
                    check(state.history.length===4,'Restart lost model-visible history');
                    check(state.transcript.filter(row=>row.role==='assistant').length===2,'Restart lost visible replies');
                    check(state.selectedModelId==='subscription:claude:sonnet','Restart lost selected model');
                    check(!captured.controller.isBusy,'Restart restored a phantom request');
                    check(report.spawns.length===0,'Restoring history must not contact a provider');
                    check(report.messages.some(m=>m.type==='restore'&&m.transcript.some(row=>row.text.includes('model=sonnet'))),'Saved answer was not restored to the view');
                    report.restartRestored=true;report.passed=true;return;
                }
                for(const [i,modelId] of ['subscription:codex:default','subscription:claude:sonnet'].entries()){
                    await captured.handleInbound({type:'selectModel',sessionId,modelId});
                    // The webview generates req_-prefixed ids and the provider's correlation-id
                    // boundary only accepts that shape. An unrealistic id here made the request lose
                    // its identity, so usage could never be matched back to the turn.
                    await captured.handleInbound({type:'submit',sessionId,requestId:'req_installed_'+i,prompt:'Explain forwardedValue in the current project'});
                }
                check(report.spawns.every(s=>['login','auth','exec','-p'].includes(s.arg0)),
                    'A process outside the fixture was launched: '+JSON.stringify(report.spawns));
                check(report.messages.filter(m=>m.type==='streamEnd').length===2,'Panel did not complete both requests');
                check(report.messages.some(m=>m.type==='activity'&&m.category==='command'&&m.status==='completed'),'Command completion not relayed');
                check(report.messages.some(m=>m.type==='activity'&&m.category==='file'&&m.status==='completed'),'File tool completion not relayed');
                check(report.messages.some(m=>m.type==='streamDelta'&&m.text.includes('model=sonnet')),'Selected Claude model lost');
                check(report.messages.some(m=>m.type==='streamDelta'&&m.text.includes('model=default')),'Codex default route missing');
                check(report.messages.some(m=>m.type==='usage'&&m.summary.includes('Subscription charges')),'Subscription usage not reported');
                const originalController=captured.controller;
                await vscode.commands.executeCommand('tokenOptimizer.openChat');
                for(let i=0;i<40&&!captured.view?.visible;i++)await new Promise(r=>setTimeout(r,100));
                check(captured.view?.visible && !captured.editorPanel,'Open Chat must return to a movable sidebar');
                check(captured.controller===originalController,'Sidebar return lost the conversation');
                check(extension.packageJSON.contributes.viewsContainers.secondarySidebar.some(container=>container.id==='tokonomicsChat'), 'Chat is not contributed to the secondary sidebar');
                report.secondarySidebar=true;
                await vscode.commands.executeCommand('tokenOptimizer.openChatInEditor');
                const editor=captured.editorPanel;
                for(const command of ['workbench.view.explorer','workbench.action.chat.open']) {
                    await vscode.commands.executeCommand(command);
                    await new Promise(r=>setTimeout(r,200));
                    check(captured.editorPanel===editor && editor.visible,'Sidebar switch hid the Tokonomics editor: '+command);
                }
                check(vscode.window.tabGroups.all.some(group=>group.tabs.some(tab=>tab.input instanceof vscode.TabInputWebview
                    && tab.label==='Tokonomics Chat' && !tab.isPreview)), 'Chat must remain a pinned editor tab');
                report.editorRemainedVisible=true;
                check(report.messages.some(message=>message.type==='streamEnd'&&message.markdown?.some(node=>node.tag==='p')),'Installed bundle did not format answers');
                await vscode.commands.executeCommand('tokenOptimizer.openChatInEditor');
                await captured.handleInbound({type:'ready'});
                check(captured.controller===originalController,'Sidebar switch replaced the controller');
                check(report.messages.some(m=>m.type==='restore'&&m.transcript.filter(row=>row.role==='assistant').length===2),'Sidebar switch lost replies');
                await captured.handleInbound({type:'newSession',sessionId});
                historyChoice=sessionId;
                await captured.handleInbound({type:'showHistory',sessionId:captured.controller.currentSessionId});
                historyChoice=undefined;
                check(captured.controller.currentSessionId===sessionId,'History picker did not reopen the earlier conversation');
                captured.save();await captured.writes;
                // Close the editor deliberately before quitting. This tests reopening disk-backed
                // chat history in the next process without racing VS Code's eager webview serializer
                // activation against this test harness's instrumentation.
                captured.editorPanel.dispose();
                report.switchAndHistoryRestored=true;
                report.passed=true;
            }catch(e){report.passed=false;report.error=e.stack;throw e;}
            finally{Module._load=original;fs.writeFileSync(process.env.TOKONOMICS_QA_RESTORE==='1'?${JSON.stringify(reportPath + '.restart')}:${JSON.stringify(reportPath)},JSON.stringify(report,null,2));}
        };
    `);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const reports=[];
    for (const phase of ['initial', 'restart']) {
        const child = spawnSync(code, [`--user-data-dir=${user}`, `--extensions-dir=${extensions}`, `--extensionDevelopmentPath=${harness}`,
            '--new-window', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', workspace],
            { encoding: 'utf8', env: { ...env, TOKONOMICS_QA_RESTORE: phase === 'restart' ? '1' : '0' }, windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
        fs.writeFileSync(path.join(scratch, 'host-' + phase + '.log'), (child.stdout || '') + (child.stderr || ''));
        const file = phase === 'restart' ? reportPath + '.restart' : reportPath;
        console.log('Report: ' + file);
        const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (child.status !== 0 || !report.passed) throw Error(report.error || child.error || 'Host test failed');
        reports.push(report);
    }
    const report = reports[0];
    console.log(JSON.stringify({ passed: true, host: report.host, sha256: inspected.sha256, installedBytesVerified: true, secondarySidebar: report.secondarySidebar, editorRemainedVisible: report.editorRemainedVisible, sidebarAndHistoryRestored: report.switchAndHistoryRestored, restartRestored: reports[1].restartRestored,
        completed: report.messages.filter(m => m.type === 'streamEnd').length, provider: 'local fixtures; no subscription usage' }));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
