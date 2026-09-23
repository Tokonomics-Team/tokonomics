'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const esbuild = require('esbuild');
async function main() {
    const browser = process.env.FINOPS_BROWSER_PATH || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
    if (!browser) throw Error('Set FINOPS_BROWSER_PATH to a Chromium browser.');
    const scratch = path.resolve('scratch'); fs.mkdirSync(scratch, { recursive: true });
    const compiled = await esbuild.build({ stdin: { contents: `import {renderChatViewHtml} from './src/ui/chatViewHtml';
        import {renderChatMarkdown} from './src/ui/chatMarkdown';
        module.exports={html:renderChatViewHtml({nonce:'panelQA',cspSource:'data:',sessionId:'qa-session'}),editorHtml:renderChatViewHtml({nonce:'panelQA',cspSource:'data:',sessionId:'qa-session',surface:'editor'}),renderChatMarkdown};`,
        loader: 'ts', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
    const loaded = { exports: {} }; new Function('module', 'require', compiled.outputFiles[0].text)(loaded, require);
    const sample = fs.readFileSync(path.resolve('tests/fixtures/chat-formatting.md'), 'utf8');
    const markdown = loaded.exports.renderChatMarkdown(sample);
    const hostile = loaded.exports.renderChatMarkdown('<img src=x onerror=alert(1)> [bad](command:doSomething) [safe](https://example.com) ![image](https://example.com/track)');
    const bridge = `
    window.qaErrors=[];window.addEventListener('error',e=>qaErrors.push(e.message));
    const send=data=>window.dispatchEvent(new MessageEvent('message',{data}));
    window.qaSent=[];
    window.qaDraft={sessionId:'qa-session',draft:'An unfinished question'};
    window.acquireVsCodeApi=()=>({getState:()=>qaDraft,setState:s=>{qaDraft=s},postMessage:m=>{
        qaSent.push(m);
        if(m.type==='ready'||m.type==='refreshModels')setTimeout(()=>send({type:'models',sessionId:'qa-session',selectedModelId:'auto',models:[
            {id:'subscription:codex:default',name:'Codex subscription / CLI default'},
            {id:'subscription:codex:gpt-fixture',name:'Codex subscription / gpt-fixture'},
            {id:'subscription:claude:sonnet',name:'Claude subscription / sonnet'}]}),0);
        if(m.type==='checkSubscription')setTimeout(()=>send({type:'notice',sessionId:'qa-session',message:'Synthetic login check: ready.'}),0);
        if(m.type==='submit') {
            send({type:'busy',sessionId:'qa-session',busy:true});
            send({type:'appendUser',sessionId:'qa-session',requestId:m.requestId,text:m.prompt});
            send({type:'streamStart',sessionId:'qa-session',requestId:m.requestId});
            send({type:'activity',sessionId:'qa-session',text:'Answering with fixture-model'});
            send({type:'activity',sessionId:'qa-session',entryId:'cmd',category:'command',text:'npm test',status:'running'});
            send({type:'activity',sessionId:'qa-session',entryId:'cmd',category:'command',text:'npm test',status:'completed'});
            send({type:'activity',sessionId:'qa-session',entryId:'file',category:'file',text:'update: src/app.ts',status:'completed'});
            send({type:'activity',sessionId:'qa-session',entryId:'plan',category:'plan',text:'Next: Verify the fix',status:'running'});
            setTimeout(()=>{send({type:'streamDelta',sessionId:'qa-session',text:'Compiled context reaches your selected subscription. <img src=x onerror=alert(1)>'});
                send({type:'streamEnd',sessionId:'qa-session'});send({type:'busy',sessionId:'qa-session',busy:false});},100);
        }
    }});
    window.addEventListener('DOMContentLoaded',()=>{(async()=>{
        const wait=()=>new Promise(r=>setTimeout(r,150)),check=(v,s)=>{if(!v)throw Error(s)};await wait();
        check(document.getElementById('prompt').value==='An unfinished question','Composer draft was not restored');
        const sidebarButton=document.getElementById('openSidebarBtn');
        (sidebarButton || document.getElementById('openEditorBtn')).click();
        check(qaSent.some(m=>m.type===(sidebarButton?'openSidebar':'openEditor')),'Surface switch bridge missing');
        const select=document.getElementById('modelSelect');
        check(select.querySelectorAll('optgroup').length===2,'Subscription groups missing');
        select.value='subscription:claude:sonnet';select.dispatchEvent(new Event('change'));
        check(qaSent.some(m=>m.type==='selectModel'&&m.modelId==='subscription:claude:sonnet'),'Exact model selection lost');
        document.getElementById('checkSubscriptionBtn').click();await wait();
        check(document.getElementById('transcript').textContent.includes('Synthetic login check'),'Login check missing');
        document.getElementById('configureSubscriptionBtn').click();
        check(qaSent.some(m=>m.type==='configureSubscription'),'Setup action missing');
        const prompt=document.getElementById('prompt');prompt.value='Explain the selected code';
        prompt.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        check(document.getElementById('cancelBtn').disabled===false,'Cancel unavailable during response');
        check(select.disabled,'Selection should be locked during response');await wait();
        check(qaSent.filter(m=>m.type==='submit').length===1,'Duplicate send');
        // A turn that shows one unchanging word for its whole duration is indistinguishable from one
        // that has hung, which is how this read before: the status must name the stage and show that
        // time is passing, and progress must never be written into the transcript as an answer.
        check(!document.getElementById('transcript').textContent.includes('Answering with fixture-model'),
            'Progress must not be rendered as an answer');
        const activities=document.getElementById('activityList');
        check(activities.textContent.includes('npm test [completed]'),'Command completion was dropped');
        check([...activities.children].filter(e=>e.textContent.includes('npm test')).length===1,'A command should update its existing row');
        check(activities.textContent.includes('src/app.ts') && activities.textContent.includes('Next: Verify'),'File/plan events missing');
        check(!document.getElementById('transcript').textContent.includes('npm test'),'Tool activity leaked into answer');
        check(document.getElementById('transcript').textContent.includes('Compiled context'),'Answer did not stream');
        check(!document.querySelector('#transcript img'),'Provider text became executable HTML');
        send({type:'streamDelta',sessionId:'stale-session',text:'STALE_RESPONSE'});
        check(!document.body.textContent.includes('STALE_RESPONSE'),'Stale session text accepted');
        check(!document.getElementById('sendBtn').disabled,'Send stayed disabled');
        check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
        // Drive the elapsed indicator with a fresh busy turn and confirm it is live.
        send({type:'busy',sessionId:'qa-session',busy:true});
        send({type:'activity',sessionId:'qa-session',text:'Waiting for the model'});
        const started=document.getElementById('state').textContent;
        check(started.includes('Waiting for the model'),'Status did not name the stage: '+started);
        await new Promise(r=>setTimeout(r,1200));
        const ticked=document.getElementById('state').textContent;
        check(/[0-9]+s$/.test(ticked),'Status must show elapsed time while busy: '+ticked);
        send({type:'busy',sessionId:'qa-session',busy:false});
        check(!/[0-9]+s$/.test(document.getElementById('state').textContent),'Elapsed time must stop when idle');
        send({type:'streamEnd',sessionId:'qa-session'});
        const transcript=[{role:'user',text:'Saved question',requestId:'req_saved'},
            {role:'assistant',text:'Saved answer',requestId:'req_saved',usage:'Saved usage'}];
        send({type:'restore',sessionId:'qa-session',transcript,busy:false,requestId:null});
        send({type:'restore',sessionId:'qa-session',transcript,busy:false,requestId:null});
        check(document.querySelectorAll('#transcript .msg').length===2,'Ready replay duplicated the transcript');
        check(document.getElementById('transcript').textContent.includes('Saved usage'),'Replay lost usage');
        document.getElementById('historyBtn').click();
        check(qaSent.some(m=>m.type==='showHistory'),'History action missing');
        send({type:'restore',sessionId:'qa-session',transcript:[{role:'user',text:'Stream',requestId:'req_live'},
            {role:'assistant',text:'Partial ',requestId:'req_live'}],busy:true,requestId:'req_live'});
        check(document.getElementById('historyBtn').disabled,'History must be locked during a request');
        check(!document.getElementById('cancelBtn').disabled,'Restored request must remain cancellable');
        send({type:'streamDelta',sessionId:'qa-session',requestId:'req_live',text:'continued'});
        send({type:'streamEnd',sessionId:'qa-session',requestId:'req_live'});
        check(document.querySelector('#transcript .assistant .body').textContent==='Partial continued','Stream did not reconnect after replay');
        check(qaSent.filter(m=>m.type==='submit').length===1,'Restore resent a prompt');
        send({type:'session',sessionId:'qa-new'});
        check(qaDraft.draft===''&&qaDraft.sessionId==='qa-new','New session leaked the previous draft');
        send({type:'restore',sessionId:'qa-new',transcript:[{role:'assistant',text:'hostile',markdown:${JSON.stringify(hostile)}}],busy:false,requestId:null});
        check(!document.querySelector('#transcript img, #transcript script, #transcript iframe'),'Unsafe markup became active DOM');
        check([...document.querySelectorAll('#transcript a')].every(a=>a.href==='https://example.com/'),'Unsafe links became navigable');
        send({type:'restore',sessionId:'qa-new',transcript:[{role:'assistant',text:${JSON.stringify(sample)},markdown:${JSON.stringify(markdown)},requestId:'formatted'}],busy:false,requestId:null});
        check(document.querySelectorAll('#transcript table').length===1,'Table did not render');
        check(document.querySelectorAll('#transcript td').length===12,'Table cells missing');
        check(document.querySelector('#transcript pre code').textContent.includes('value != null'),'Fenced code was not preserved');
        check(document.querySelector('#transcript strong')&&document.querySelector('#transcript ul'),'Emphasis or list missing');
        check(!document.getElementById('transcript').textContent.includes('&#x20;'),'Entity shown literally');
        check(document.documentElement.scrollWidth<=innerWidth,'Formatted reply caused page overflow');
        const transcriptBox=document.getElementById('transcript');
        check(transcriptBox.scrollHeight>transcriptBox.clientHeight,'Long formatted reply must scroll within transcript');
        check(document.getElementById('sendBtn').getBoundingClientRect().bottom<=innerHeight,'Composer pushed offscreen');
        check(qaErrors.length===0,qaErrors.join(';'));
        document.body.dataset.panelQa='passed';
    })().catch(e=>document.body.dataset.panelQa='failed: '+e.message);});`;
    const theme = ':root{--vscode-editor-background:#181c24;--vscode-foreground:#e2e8f0;--vscode-descriptionForeground:#adb9c9;--vscode-panel-border:#48546a;--vscode-input-background:#242d3c;--vscode-input-foreground:#e2e8f0;--vscode-input-border:#48546a;--vscode-button-background:#215eba;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#303a4c;--vscode-button-secondaryForeground:#e2e8f0;--vscode-focusBorder:#75b7ff;--vscode-font-family:system-ui;}';
    for (const [name, size] of [['wide', '900,800'], ['narrow', '380,850'], ['editor', '900,800']]) {
        const html = (name === 'editor' ? loaded.exports.editorHtml : loaded.exports.html).replace('</head>', `<style nonce="panelQA">${theme}:root{--vscode-sideBar-background:#181c24;--vscode-font-size:13px;}body{width:${name === 'narrow' ? 380 : 900}px;max-width:100vw;}</style><script nonce="panelQA">${bridge}</script></head>`);
        const file = path.join(scratch, `panel-${name}.html`); fs.writeFileSync(file, html);
        const profile = fs.mkdtempSync(path.join(scratch, 'panel-browser-'));
        const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
            `--window-size=${size}`, '--virtual-time-budget=6000', '--dump-dom', `--screenshot=${path.join(scratch, 'panel-' + name + '.png')}`,
            require('url').pathToFileURL(file).href], { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
        fs.writeFileSync(path.join(scratch, `panel-${name}-dom.html`), result.stdout || '');
        if (result.status !== 0 || !result.stdout.includes('data-panel-qa="passed"')) throw Error(`${name}: ${/data-panel-qa="([^"]+)/.exec(result.stdout)?.[1] || result.error || result.stderr}`);
        console.log(`${name}: model groups, exact selection, setup/login bridge, keyboard send, streaming, live status, draft/history restoration, streaming replay, busy state, supplied Markdown table/code/emphasis sample, XSS, stale messages and layout passed.`);
    }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
