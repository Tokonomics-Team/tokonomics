/** Local, CSP-safe spend UI. Dynamic values are rendered with textContent. */
export const spendDashboardHtml = `
    <section class="spend-panel" aria-labelledby="spendHeading">
        <div class="spend-heading"><div><h2 id="spendHeading">Your AI usage</h2>
        <p class="card-sub">Requests, token usage and cost estimates in one place.</p></div>
        <label>Source <select id="spendSource"><option value="all">All sources</option><option value="tokonomics">Tokonomics requests</option><option value="claude-jsonl">Claude sessions</option></select></label></div>
        <p id="spendStatus" role="status">Loading local usage...</p>
        <div class="spend-actions">
            <button data-spend-command="startTask">Start task</button>
            <button data-spend-command="endTask" hidden>End task</button>
            <button data-spend-command="importClaudeUsage">Import Claude usage</button>
        </div>
        <div class="spend-cards">
            <div class="card"><div class="card-label">Tokens tracked</div><strong id="spendTokens">&mdash;</strong><p id="spendRequests" class="card-sub">Waiting for usage</p><p class="card-sub">Input + known output; includes local estimates</p></div>
            <div class="card"><div class="card-label">Usage at reference prices</div><strong id="spendObserved">&mdash;</strong><p class="card-sub">Reported tokens &times; recorded prices</p></div>
            <div class="card"><div class="card-label">Estimated avoided cost</div><strong id="spendAvoided">&mdash;</strong><p class="card-sub">Tokonomics requests &middot; uncached baseline</p></div>
        </div>
        <p class="card-sub spend-note">Cost estimates are not bills. Subscription fees and remaining quota are not measured.</p>
        <p id="spendTask" class="card-sub"></p>
        <details><summary>Task controls &amp; budgets</summary>
            <div class="spend-actions"><button data-spend-command="setSpendBudget">Set budget</button><button data-spend-command="recordTaskOutcome">Rate task outcome</button></div>
            <p class="card-sub">Budget alerts include all sources. They notify you without stopping requests; projections may omit output costs.</p><div id="spendBudgets"></div>
        </details>
        <h3>Recent activity</h3><p id="spendTaskCount" class="card-sub"></p>
        <div class="spend-table-wrap"><table><thead><tr><th>Activity</th><th>Model</th><th>Requests</th><th>At reference prices</th><th>Input estimate</th><th>Outcome</th></tr></thead><tbody id="spendTasks"></tbody></table></div>
        <details><summary>Cost trend &amp; data coverage</summary>
            <svg id="spendTrend" viewBox="0 0 500 100" role="img" aria-label="Daily rate-derived and projected spend trend"></svg><p id="spendTrendCaption" class="card-sub"></p>
            <p>Input-only estimate: <strong id="spendProjected">&mdash;</strong></p><p class="card-sub">For requests without provider usage. Output costs are unknown.</p>
            <p id="spendCoverage"></p><p id="spendFreshness" class="card-sub"></p>
        </details>
        <details><summary>Models &amp; tokens</summary><div class="spend-table-wrap"><table><thead><tr><th>Model</th><th>Input, incl. cache</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>At reference prices</th><th>Input estimate</th></tr></thead><tbody id="spendModels"></tbody></table></div><p class="card-sub">Unknown output and cache counts are excluded from totals; see data coverage.</p></details>
        <details><summary>Findings &amp; task quality</summary><div class="spend-columns"><div><h3>Context findings</h3><ul id="spendFindings"></ul></div><div><h3>Task outcomes</h3><p id="spendQuality"></p><button data-spend-command="recommendModel">Compare available models</button><ul id="spendRecommendations"></ul><p class="card-sub">Task outcomes are self-reported. Comparisons do not switch models.</p></div></div></details>
        <details><summary>Connections &amp; data</summary>
            <p class="card-sub">In VS Code Chat (Ask), use <code>@tokonomics /codex</code> or <code>@tokonomics /claude</code>. Send the command without a question to check the CLI and login.</p>
            <div class="spend-actions"><button data-spend-command="configureSubscriptionCli">Configure subscription CLI</button><button data-spend-command="watchClaudeUsage">Watch a usage log</button><button data-spend-command="stopUsageWatcher">Stop watcher</button><button data-spend-command="exportUsage">Export usage</button></div>
            <p id="spendRetention"></p><p class="card-sub">Prices are recorded locally. Import reviewed snapshots to update rates; past costs stay unchanged.</p>
            <div class="spend-actions"><button data-spend-command="importPricing">Import prices</button><button data-spend-command="clearUsageHistory">Clear spend history</button></div>
        </details>
    </section>`;

export const spendDashboardCss = `
    .spend-panel { margin: 0; padding: 0; background: var(--vscode-editor-background); }
    .spend-panel h2 { margin: 0 0 6px; font-size: 22px; } .spend-panel h3 { margin: 18px 0 8px; }
    .spend-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; flex-wrap: wrap; }
    .spend-panel button, .spend-panel select { padding: 7px 11px; border-radius: 4px; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font: inherit; }
    .spend-panel button:hover { background: var(--vscode-button-hoverBackground); } .spend-panel button:focus-visible, .spend-panel select:focus-visible, .spend-panel summary:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .spend-panel button:disabled { opacity: .5; cursor: default; } .spend-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .spend-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; } .spend-cards strong { display: block; font-size: 24px; margin: 10px 0; overflow-wrap: anywhere; }
    .spend-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr)); gap: 24px; }
    .spend-table-wrap { overflow-x: auto; } .spend-panel table { width: 100%; min-width: 650px; border-collapse: collapse; } .spend-panel td, .spend-panel th { text-align: left; padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); overflow-wrap: anywhere; }
    .spend-panel progress { width: 100%; accent-color: var(--vscode-progressBar-background); } #spendTrend { width: 100%; height: 100px; }
    .spend-panel li { margin: 9px 0; } .spend-panel details { margin-top: 12px; border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; } .spend-note { margin: 12px 0; } .spend-panel p { line-height: 1.6; } .spend-cards .card { min-width: 0; } .spend-panel summary { cursor: pointer; padding: 6px 0; } #spendStatus { color: var(--vscode-descriptionForeground); }
`;

export const spendDashboardScript = `
        function updateSpend(s) {
            if (!s || !s.totals) return;
            const put = function(id, value) { document.getElementById(id).textContent = value; };
            const usd = function(n) { return n === null || !Number.isFinite(n) ? 'Unavailable' : '~$' + n.toFixed(4); };
            const t = s.totals;
            put('spendTokens', t.requests ? (t.inputTokens + t.outputTokens).toLocaleString() : 'No usage yet');
            put('spendRequests', t.requests + ' requests | ' + t.observedRequests + ' with reported usage');
            document.querySelector('[data-spend-command="startTask"]').hidden = Boolean(s.activeTask);
            document.querySelector('[data-spend-command="endTask"]').hidden = !s.activeTask;
            put('spendObserved', t.observedPricedRequests ? usd(t.observedUSD) : 'Unavailable');
            put('spendProjected', t.projectedRequests > 0 ? usd(t.projectedUSD) : 'Unavailable');
            put('spendAvoided', t.avoidedCostRequests > 0 ? usd(t.avoidedUSD) : 'Unavailable');
            put('spendCoverage', t.observedRequests + '/' + t.requests + ' usage · ' + t.pricedRequests + '/' + t.requests + ' priced');
            put('spendFreshness', s.lastReceivedAt ? 'Last observation ' + new Date(s.lastReceivedAt).toLocaleString() : 'No observations yet');
            put('spendStatus', s.status);
            document.getElementById('spendSource').value = s.source;
            put('spendTask', s.activeTask ? 'Task active. End it when your work is complete.' : 'Start a task to group requests toward one goal.');
            document.querySelectorAll('[data-spend-command]').forEach(function(b) {
                b.disabled = (!s.writable && !['exportUsage','recommendModel','endTask'].includes(b.dataset.spendCommand)) || (b.dataset.spendCommand === 'endTask' && !s.activeTask) || (b.dataset.spendCommand === 'stopUsageWatcher' && !s.watching);
            });
            const budgets = document.getElementById('spendBudgets'); budgets.replaceChildren();
            if (!s.budgets.length) budgets.textContent = 'No budgets configured. Set a task, daily or monthly limit.';
            s.budgets.forEach(function(b) { const box = document.createElement('div'); const label = document.createElement('p');
                label.textContent = b.scope + ': ' + usd(b.usd) + ' / $' + b.limitUSD.toFixed(2) + (b.active ? ' (' + b.percent.toFixed(0) + '%)' : ' — start a task') + (b.partial ? ' · partial/projection' : '');
                const bar = document.createElement('progress'); bar.max = 100; bar.value = Math.min(100, b.percent); bar.setAttribute('aria-label', label.textContent);
                box.append(label, bar); budgets.append(box); });
            const table = function(id, rows) { const body = document.getElementById(id); body.replaceChildren(); rows.forEach(function(values) {
                const tr = document.createElement('tr'); values.forEach(function(value) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }); body.append(tr); }); };
            table('spendTasks', s.tasks.map(function(task) { return [task.label + ' · ' + new Date(task.timestamp).toLocaleString(), task.models, task.totals.requests, task.totals.observedPricedRequests ? usd(task.totals.observedUSD) : 'Unavailable', task.totals.projectedRequests ? usd(task.totals.projectedUSD) : 'Unavailable', task.outcome]; }));
            put('spendTaskCount', s.tasks.length ? 'Showing ' + s.tasks.length + ' of ' + s.taskCount + ' retained activities in this window.' : 'No usage in this window. Send a Tokonomics request or import a Claude assistant JSONL log.');
            table('spendModels', s.models.map(function(m) { return [m.model, m.inputTokens, m.outputTokens, m.cacheReadTokens, m.cacheWriteTokens, m.observedPricedRequests ? usd(m.observedUSD) : 'Unavailable', m.projectedRequests ? usd(m.projectedUSD) : 'Unavailable']; }));
            const findings = document.getElementById('spendFindings'); findings.replaceChildren();
            s.findings.forEach(function(f) { const li = document.createElement('li'); li.textContent = f.text;
                if (f.requestId) { const button = document.createElement('button'); button.textContent = 'Inspect trace'; button.addEventListener('click', function() { inspectEvent(f.requestId); }); li.append(' ', button); } findings.append(li); });
            if (!s.findings.length) findings.textContent = 'Findings appear when request evidence is available.';
            put('spendQuality', s.ratedTasks + ' rated · ' + s.successfulTasks + ' successful · estimated cost per success: ' + usd(s.costPerSuccess) + '. Includes rated failed tasks.' + (s.costPerSuccessPartial ? ' Input projections omit unknown output costs.' : ''));
            const rec = document.getElementById('spendRecommendations'); rec.replaceChildren(); s.recommendations.forEach(function(text) { const li = document.createElement('li'); li.textContent = text; rec.append(li); });
            put('spendRetention', s.retention);
            const svg = document.getElementById('spendTrend'); svg.replaceChildren();
            const points = s.days.map(function(d) { return d.observedUSD + d.projectedUSD; }); const max = Math.max.apply(Math, points.concat([0.00001]));
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            path.setAttribute('points', points.map(function(v,i) { return (points.length === 1 ? 250 : 5 + i * 490 / (points.length - 1)) + ',' + (95 - 90 * v / max); }).join(' '));
            path.setAttribute('fill','none'); path.setAttribute('stroke','var(--vscode-charts-blue)'); path.setAttribute('stroke-width','3'); svg.append(path);
            if (points.length === 1) { const dot = document.createElementNS('http://www.w3.org/2000/svg','circle'); dot.setAttribute('cx','250'); dot.setAttribute('cy',String(95 - 90 * points[0] / max)); dot.setAttribute('r','4'); dot.setAttribute('fill','var(--vscode-charts-blue)'); svg.append(dot); }
            put('spendTrendCaption', s.days.length ? s.days[0].day + ' to ' + s.days[s.days.length-1].day + ' · peak ' + usd(Math.max.apply(Math,points)) + '/day · observed + input projections' : 'No daily spend yet.');
        }
        document.querySelectorAll('[data-spend-command]').forEach(function(button) { button.addEventListener('click', function() { vscode.postMessage({ command: 'spendAction', actionName: button.dataset.spendCommand }); }); });
        document.getElementById('spendSource').addEventListener('change', function(e) { vscode.postMessage({ action: 'CHANGE_SPEND_SOURCE', source: e.target.value }); });
`;

export const spendCommands = new Set(['configureSubscriptionCli', 'startTask', 'endTask', 'setSpendBudget', 'recordTaskOutcome', 'importClaudeUsage',
    'watchClaudeUsage', 'stopUsageWatcher', 'exportUsage', 'importPricing', 'recommendModel', 'clearUsageHistory']);
