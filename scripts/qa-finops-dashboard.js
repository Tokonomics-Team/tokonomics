'use strict';
// Browser QA of the real dashboard HTML using synthetic usage and a VS Code message bridge.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

async function main() {
    const browser = process.env.FINOPS_BROWSER_PATH || [
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe'
    ].find(file => fs.existsSync(file));
    if (!browser) throw new Error('Set FINOPS_BROWSER_PATH to an installed Chromium browser for dashboard QA.');
    const scratch = path.resolve('scratch'); fs.mkdirSync(scratch, { recursive: true });
    const source = `
        import { DashboardWebviewPanel } from './src/ui/dashboardWebview';
        import { LiveMetricsAggregator } from './src/metrics/liveAggregator';
        import { FinOpsService } from './src/finops/finOpsService';
        import { parseClaudeUsage } from './src/finops/claudeUsage';
        const service = new FinOpsService();
        for(let i=0;i<5;i++) service.store.upsert(parseClaudeUsage(JSON.stringify({type:'assistant',sessionId:'demo-session',timestamp:new Date(Date.now()-i*86400000).toISOString(),message:{id:'demo-'+i,model:'claude-sonnet-4-6',usage:{input_tokens:15000,output_tokens:1200,cache_read_input_tokens:30000,cache_creation_input_tokens:5000}}}))!);
        service.store.setBudget({scope:'daily',limitUSD:.5,alertPercent:80});
        const panel = Object.create(DashboardWebviewPanel.prototype); panel.panel={webview:{cspSource:'data:'}};
        const html=panel.getHtml(LiveMetricsAggregator.getInstance().getAggregateSummary('today'),[],null,null);
        const snapshots=Object.fromEntries(['session','today','7_days','lifetime'].flatMap(w=>['all','tokonomics','claude-jsonl'].map(s=>[w+':'+s,service.snapshot(w,s)])));
        module.exports={html,snapshots};
    `;
    const compiled = await esbuild.build({ stdin: { contents: source, loader: 'ts', resolveDir: process.cwd() }, bundle: true,
        platform: 'node', format: 'cjs', write: false, alias: { vscode: path.resolve('tests/mock-vscode.ts') } });
    const loaded = { exports: {} }; new Function('require', 'module', compiled.outputFiles[0].text)(require, loaded);
    let { html, snapshots } = loaded.exports;
    const nonce = /script-src 'nonce-([^']+)'/.exec(html)[1];
    const bridge = `
        window.qaErrors=[];window.addEventListener('error',e=>window.qaErrors.push(e.message));
        window.acquireVsCodeApi=function(){let state={},win='today',source='all';return {getState:()=>state,setState:s=>state=s,postMessage:m=>{
            if(m.command==='spendAction')window.qaCommand=m.actionName;
            else if(m.command)window.qaCommand=m.command;
            if(m.action==='CHANGE_TIME_WINDOW')win=m.window;
            if(m.action==='CHANGE_SPEND_SOURCE')source=m.source;
            setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'SPEND_UPDATE',payload:(${JSON.stringify(snapshots)})[win+':'+source]}})),0);
        }}};
        window.addEventListener('DOMContentLoaded',()=>{(async()=>{
            const wait=()=>new Promise(resolve=>setTimeout(resolve,50));
            const check=(condition,message)=>{if(!condition)throw new Error(message);};await wait();
            const visible=element=>element.checkVisibility();
            check(visible(document.getElementById('view-usage')) && !visible(document.getElementById('view-context')), 'Usage must be the default view');
            check(!visible(document.querySelector('[data-spend-command="clearUsageHistory"]')), 'Destructive controls must be inside a disclosure');
            check(document.getElementById('spendCoverage').textContent.includes('1/1 usage'),'Initial usage snapshot missing');
            const source=document.getElementById('spendSource');source.value='tokonomics';source.dispatchEvent(new Event('change'));await wait();
            check(document.getElementById('spendTasks').children.length===0,'Source filtering failed');
            source.value='all';source.dispatchEvent(new Event('change'));await wait();
            document.querySelector('[data-window="7_days"]').click();await wait();
            check(document.getElementById('spendCoverage').textContent.includes('5/5 usage'),'Time-window update failed');
            const budgetButton=document.querySelector('[data-spend-command="setSpendBudget"]');
            budgetButton.closest('details').querySelector('summary').click();
            check(visible(budgetButton), 'Budget controls should expand');
            budgetButton.click();await wait();
            check(window.qaCommand==='setSpendBudget','Budget command bridge failed');
            budgetButton.closest('details').querySelector('summary').click();
            for(const view of ['context','diagnostics','usage']) {
                const button=document.querySelector('[data-view="'+view+'"]');button.focus();button.click();await wait();
                check(button.getAttribute('aria-pressed')==='true' && document.activeElement===button, 'View selection must preserve focus and selection state');
                check(visible(document.getElementById('view-'+view)), 'Selected view is hidden');
                check(document.querySelectorAll('[data-dashboard-view]:not([hidden])').length===1, 'Views should not overlap');
                check(document.documentElement.scrollWidth<=innerWidth, view+' overflows the viewport');
                if(view==='context') {
                    document.getElementById('btnScanWorkspace').click();await wait();
                    check(window.qaCommand==='scanWorkspace' && document.getElementById('workspaceAuditDetails').open, 'Audit action must reveal its results');
                }
            }
            check(document.getElementById('spendTrend').querySelector('polyline'),'Spend chart missing');
            check(document.querySelector('.spend-panel').getBoundingClientRect().right <= innerWidth,'Spend panel overflows viewport');
            check(window.qaErrors.length===0,window.qaErrors.join(';'));
            const previewView=new URL(location.href).searchParams.get('view') || 'usage';
            document.querySelector('[data-view="'+previewView+'"]').click();
            document.body.setAttribute('data-finops-qa','passed');
        })().catch(e=>document.body.setAttribute('data-finops-qa','failed: '+e.message));});
    `;
    const theme = `:root{--vscode-editor-background:#151923;--vscode-foreground:#dfe6f3;--vscode-editor-foreground:#dfe6f3;--vscode-panel-border:#394253;--vscode-descriptionForeground:#a8b4c7;--vscode-button-background:#215eba;--vscode-button-hoverBackground:#3275d1;--vscode-button-foreground:#fff;--vscode-focusBorder:#85b8ff;--vscode-progressBar-background:#62b3ff;--vscode-charts-blue:#62b3ff;--vscode-font-family:system-ui;}body{background:#151923;color:#dfe6f3;}`;
    html = html.replace('</head>', `<style nonce="${nonce}">${theme}</style><script nonce="${nonce}">${bridge}</script></head>`)
        .replace('<body>', '<body><p>Development preview · synthetic usage fixtures</p>');
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1]);
    const preview = path.join(scratch, 'finops-browser-qa.html'); fs.writeFileSync(preview, html);
    const sizes = [['wide', '1440,1300', 'usage'], ['narrow', '480,1000', 'usage'],
        ['context', '1440,1300', 'context'], ['diagnostics', '480,1000', 'diagnostics'], ['light', '1440,1300', 'usage']];
    for (const [name, size, view] of sizes) {
        const previewFile = name === 'light' ? path.join(scratch, 'finops-browser-light.html') : preview;
        if (name === 'light') fs.writeFileSync(previewFile, html.replace('</head>', `<style nonce="${nonce}">:root{--vscode-editor-background:#ffffff;--vscode-foreground:#202020;--vscode-editor-foreground:#202020;--vscode-sideBar-background:#f5f5f5;--vscode-editorWidget-background:#f5f5f5;--vscode-panel-border:#c8c8c8;--vscode-descriptionForeground:#535353;--vscode-textLink-foreground:#005fb8;}body{background:#ffffff;color:#202020;}</style></head>`));
        const profile = fs.mkdtempSync(path.join(scratch, 'finops-browser-profile-'));
        const screenshot = path.join(scratch, `finops-${name}.png`);
        const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
            `--window-size=${size}`, '--virtual-time-budget=2000', '--dump-dom', `--screenshot=${screenshot}`,
            require('url').pathToFileURL(previewFile).href + '?view=' + view], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        fs.writeFileSync(path.join(scratch, `finops-${name}-dom.html`), result.stdout || '');
        if (result.error || result.status !== 0 || !result.stdout.includes('data-finops-qa="passed"')) {
            throw new Error(`${name} dashboard QA failed: ${result.error?.message || /data-finops-qa="([^"]+)"/.exec(result.stdout)?.[1] || result.stderr.slice(-1000)}`);
        }
        console.log(`${name}: rendered, filters, time window, budget command bridge, chart and layout passed. Screenshot: ${screenshot}`);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
