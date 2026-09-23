/**
 * Tokonomics Chat Surface — webview document.
 *
 * The document is generated with a per-render cryptographic nonce and a restrictive
 * content-security-policy that permits no remote origin, no inline event handlers, no eval and no
 * network connection. Markdown is parsed in the host and rendered through an allowlisted DOM tree.
 * Untrusted text uses `textContent`; the script never assigns to `innerHTML`.
 *
 * Designed with the premium, sleek visual aesthetic of Codex, Claude, and Antigravity IDE,
 * featuring real-time, model-aware status indicators for Thinking, Analyzing, and Working.
 */

export interface ChatViewHtmlOptions {
    readonly nonce: string;
    readonly cspSource: string;
    readonly sessionId: string;
    readonly surface?: 'sidebar' | 'editor';
}

export function renderChatViewHtml(options: ChatViewHtmlOptions): string {
    const { nonce, cspSource, sessionId } = options;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${cspSource}; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none';">
<title>Tokonomics Chat</title>
<style nonce="${nonce}">
:root {
  color-scheme: light dark;
  --panel-radius: 8px;
  --card-radius: 10px;
  --bubble-radius: 14px;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background, #18181b);
  display: flex; flex-direction: column; height: 100vh; min-width: 180px;
  overflow: hidden;
}

/* Header Bar */
header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.08));
  background: var(--vscode-sideBar-background, #18181b);
  flex-shrink: 0;
}
.header-left {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;
}
.brand-badge {
  display: inline-flex; align-items: center; gap: 5px; font-weight: 700;
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--vscode-foreground);
}
.brand-sparkle {
  color: #38bdf8; font-size: 13px; line-height: 1;
}
header h1 {
  font-size: 11px; font-weight: 700; margin: 0; letter-spacing: .06em; text-transform: uppercase;
  display: inline-flex; align-items: center; gap: 5px;
}
#state {
  font-size: 11px; color: var(--vscode-descriptionForeground);
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; border-radius: 12px;
  background: var(--vscode-badge-background, rgba(255, 255, 255, 0.06));
  transition: all 0.2s ease;
  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#state.busy-active {
  color: var(--vscode-foreground);
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.pulse-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #38bdf8; display: inline-block; flex-shrink: 0;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.7);
  animation: pulse-anim 1.6s infinite ease-in-out;
}
@keyframes pulse-anim {
  0% { transform: scale(0.85); opacity: 0.5; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.5; }
}

.header-right {
  display: flex; align-items: center; gap: 6px;
}

/* Model Row */
#modelRow {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.06));
  background: var(--vscode-sideBarSectionHeader-background, rgba(0, 0, 0, 0.1));
  flex-shrink: 0;
}
#modelRow label {
  font-size: 11px; font-weight: 500; color: var(--vscode-descriptionForeground);
  display: flex; align-items: center; gap: 4px; flex: none;
}
#subscriptionActions {
  display: flex; gap: 6px; flex-wrap: wrap; padding: 6px 12px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.04));
  flex-shrink: 0;
}
.model-help {
  padding: 4px 12px; margin: 0; font-size: 11px;
  color: var(--vscode-descriptionForeground); opacity: 0.85; line-height: 1.4;
}

/* Controls */
select, textarea, button {
  font-family: inherit; font-size: 12px; color: var(--vscode-input-foreground);
  background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
  border-radius: 4px; padding: 4px 8px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
select {
  flex: 1 1 auto; min-width: 0; height: 26px;
  background-color: var(--vscode-dropdown-background, var(--vscode-input-background));
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
  border-color: var(--vscode-dropdown-border, rgba(255,255,255,0.12));
  cursor: pointer;
}
button {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  border: none; cursor: pointer; padding: 5px 12px; font-weight: 500; border-radius: 4px;
}
button:hover:enabled {
  background: var(--vscode-button-hoverBackground);
}
button.secondary {
  background: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.08));
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border: 1px solid rgba(255, 255, 255, 0.06);
}
button.secondary:hover:enabled {
  background: var(--vscode-button-secondaryHoverBackground, rgba(255, 255, 255, 0.14));
}
button:disabled { opacity: .45; cursor: not-allowed; }
:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

/* Activity & Thought Panel (Claude & Antigravity Style) */
#activityPanel {
  margin: 6px 12px; border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--panel-radius); padding: 0;
  background: var(--vscode-editorWidget-background, rgba(30, 35, 45, 0.3));
  overflow: hidden; flex-shrink: 0;
}
#activityPanel summary {
  cursor: pointer; font-size: 11.5px; font-weight: 500;
  padding: 6px 10px; list-style: none; display: flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--vscode-descriptionForeground);
  user-select: none;
}
#activityPanel summary::-webkit-details-marker { display: none; }
#activityPanel summary::before {
  content: '▶'; font-size: 9px; transition: transform 0.15s ease; opacity: 0.7;
}
#activityPanel[open] summary::before {
  transform: rotate(90deg);
}
#activityPanel[open] summary {
  border-bottom: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.06));
}
#activityList {
  margin: 0; padding: 6px 10px; max-height: 160px; overflow-y: auto;
  font-size: 11px; list-style-position: inside;
}
#activityList li {
  margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4;
  color: var(--vscode-foreground); opacity: 0.9;
}

/* Transcript Area */
#transcript {
  min-height: 0; flex: 1 1 auto; overflow-y: auto;
  padding: 14px 14px; display: flex; flex-direction: column; gap: 14px;
}
.msg {
  min-width: 0; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px;
}

/* User Message Bubble */
.msg.user {
  align-self: flex-end; max-width: 90%;
}
.msg.user .who {
  display: none;
}
.msg.user .body {
  background: var(--vscode-input-background, #21262d);
  color: var(--vscode-input-foreground, var(--vscode-foreground));
  border: 1px solid var(--vscode-editorWidget-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--bubble-radius) var(--bubble-radius) 3px var(--bubble-radius);
  padding: 9px 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

/* Assistant Message */
.msg.assistant {
  align-self: flex-start; width: 100%;
}
.msg.assistant .who {
  font-size: 11px; font-weight: 600; letter-spacing: .02em;
  color: #38bdf8; display: flex; align-items: center; gap: 5px;
  margin-bottom: 2px;
}
.msg.assistant .who::before {
  content: '✦'; font-size: 12px; color: #38bdf8;
}
.msg.assistant .body {
  white-space: normal; line-height: 1.55; color: var(--vscode-foreground);
  padding: 0 2px;
}
.msg.assistant .body > :first-child { margin-top: 0; }
.msg.assistant .body > :last-child { margin-bottom: 0; }

/* System / Info / Error Messages */
.msg.info .who, .msg.error .who {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
}
.msg.info .body {
  background: rgba(56, 189, 248, 0.06); border-left: 3px solid #38bdf8;
  padding: 6px 10px; border-radius: 0 4px 4px 0; font-size: 12px;
}
.msg.error .body {
  background: rgba(239, 68, 68, 0.08); border-left: 3px solid var(--vscode-errorForeground, #f87171);
  color: var(--vscode-errorForeground, #f87171); padding: 8px 12px; border-radius: 0 4px 4px 0;
  font-size: 12px;
}

/* Usage & Savings Chip */
.msg .usage {
  margin-top: 4px; font-size: 10px; font-weight: 500;
  color: #38bdf8; background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px; padding: 2px 8px; width: fit-content;
  display: inline-flex; align-items: center; gap: 4px;
}
.msg .usage::before {
  content: '⚡'; font-size: 10px;
}

/* Markdown Elements */
.body p { margin: 0 0 10px; }
.body h1, .body h2, .body h3, .body h4, .body h5, .body h6 { line-height: 1.3; margin: 16px 0 8px; font-weight: 600; }
.body h1 { font-size: 1.4em; } .body h2 { font-size: 1.25em; } .body h3 { font-size: 1.1em; }
.body ul, .body ol { padding-left: 20px; margin: 8px 0; }
.body li > p { margin: 3px 0; }
.body blockquote {
  margin: 10px 0; padding: 4px 12px;
  border-left: 3px solid var(--vscode-textBlockQuote-border, rgba(255,255,255,0.2));
  color: var(--vscode-descriptionForeground);
}
.body code {
  font-family: var(--vscode-editor-font-family, Consolas, Monaco, "Courier New", monospace);
  font-size: .92em; background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.3));
  border: 1px solid rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 4px;
}

/* Code Blocks (Codex / Claude Aesthetic) */
.code-block {
  margin: 12px 0; background: var(--vscode-textCodeBlock-background, #161b22);
  border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.code-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 10px; background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.08));
}
.code-language {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  color: var(--vscode-descriptionForeground); letter-spacing: 0.05em;
  font-family: var(--vscode-editor-font-family, monospace);
}
.code-copy-btn {
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--vscode-descriptionForeground); border-radius: 3px;
  font-size: 10px; padding: 2px 7px; cursor: pointer;
  transition: all 0.15s ease;
}
.code-copy-btn:hover {
  background: rgba(255, 255, 255, 0.08); color: var(--vscode-foreground);
  border-color: rgba(255, 255, 255, 0.2);
}
.code-copy-btn.copied {
  color: #4ade80; border-color: rgba(74, 222, 128, 0.4);
}
.body pre {
  margin: 0; padding: 10px 12px; overflow-x: auto; white-space: pre; overflow-wrap: normal;
  font-family: var(--vscode-editor-font-family, Consolas, Monaco, "Courier New", monospace);
  font-size: 12px; line-height: 1.45;
}
.body pre code { padding: 0; background: transparent; border: none; }

.table-scroll { max-width: 100%; overflow-x: auto; margin: 12px 0; border-radius: 4px; }
.body table { width: 100%; border-collapse: collapse; font-size: 12px; }
.body th, .body td { padding: 6px 10px; min-width: 100px; border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1)); text-align: left; }
.body th { background: rgba(255, 255, 255, 0.04); font-weight: 600; }
.body .align-right { text-align: right; } .body .align-center { text-align: center; }
.body a { color: var(--vscode-textLink-foreground, #38bdf8); text-decoration: underline; }
.body hr { border: 0; border-top: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.08)); margin: 14px 0; }

/* Empty Welcome State */
#empty {
  color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.6;
  background: var(--vscode-editorWidget-background, rgba(30, 35, 45, 0.2));
  border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--card-radius); padding: 14px 16px; margin: 8px 0;
}

/* Composer Area (Codex / Antigravity Floating Card) */
footer {
  border-top: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.08));
  padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
  background: var(--vscode-sideBar-background, #18181b);
  flex-shrink: 0;
}
#composer {
  display: flex; flex-direction: column; gap: 6px;
  background: var(--vscode-input-background, #1f242c);
  border: 1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--card-radius); padding: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
#composer:focus-within {
  border-color: var(--vscode-focusBorder, #38bdf8);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder, #38bdf8), 0 2px 12px rgba(0, 0, 0, 0.3);
}
textarea {
  resize: vertical; min-height: 54px; max-height: 220px; width: 100%;
  background: transparent; border: none; outline: none; padding: 4px;
  font-size: 12.5px; line-height: 1.5; color: var(--vscode-input-foreground);
}
textarea:focus { outline: none; }
#actions {
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  padding-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.04);
}
#actions .spacer { flex: 1 1 auto; }
#sendBtn {
  background: var(--vscode-button-background, #0284c7);
  color: var(--vscode-button-foreground, #ffffff);
  border-radius: 6px; font-weight: 600; padding: 5px 14px;
}
#sendBtn:hover:enabled {
  background: var(--vscode-button-hoverBackground, #0369a1);
}
#links {
  display: flex; gap: 12px; font-size: 11px; padding: 2px 4px;
}
#links a {
  color: var(--vscode-textLink-foreground, #38bdf8); cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center; gap: 3px;
}
#links a:hover { text-decoration: underline; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
</style>
</head>
<body>
<header>
  <div class="header-left">
    <span class="brand-badge"><span class="brand-sparkle">✦</span> Tokonomics</span>
    <span id="state" role="status">Ready</span>
  </div>
  <div class="header-right">
    ${options.surface === 'editor' ? '<button id="openSidebarBtn" class="secondary" type="button" title="Return this conversation to the dockable sidebar">Open in sidebar</button>' : '<button id="openEditorBtn" class="secondary" type="button" title="Keep this chat visible while switching sidebar chats">Open in editor</button>'}
  </div>
</header>

<div id="modelRow">
  <label for="modelSelect"><span>⚡</span> Model</label>
  <select id="modelSelect" aria-label="Upstream model">
    <option value="auto">Auto (VS Code models)</option>
  </select>
  <button id="refreshBtn" class="secondary" type="button" title="Refresh the model list">Refresh</button>
</div>

<div id="subscriptionActions">
  <button id="checkSubscriptionBtn" type="button" class="secondary">Check login</button>
  <button id="configureSubscriptionBtn" type="button" class="secondary">Configure CLI</button>
</div>
<p class="model-help">Choose a subscription above, or Refresh for VS Code models. Model access depends on your account. Codex choices use its local cache; open Codex and Refresh if choices are missing.</p>
<details id="activityPanel" hidden open><summary>Latest request activity</summary><ol id="activityList" aria-label="Provider activity"></ol></details>
<div id="transcript" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
  <p id="empty">Prompts sent from this view are optimized automatically before they reach the model
  you choose above. Models come from what this editor exposes; chats inside another extension's own
  panel are not available here and are never intercepted. Subscription choices use your CLI login.
  For project questions, set Workspace Context to Automatic in a trusted workspace, or paste code.
  This panel provides answers and suggested changes; it does not edit files.</p>
</div>

<footer>
  <div id="composer">
    <label class="visually-hidden" for="prompt">Prompt</label>
    <textarea id="prompt" rows="3" placeholder="Ask something. Enter sends, Shift+Enter adds a line."
      aria-describedby="state"></textarea>
    <div id="actions">
      <button id="sendBtn" type="button">Send</button>
      <button id="cancelBtn" class="secondary" type="button" disabled>Cancel</button>
      <span class="spacer"></span>
      <button id="historyBtn" class="secondary" type="button" title="Reopen up to 10 recent chats saved locally in this workspace, or delete saved chats">History</button>
      <button id="newBtn" class="secondary" type="button">New Session</button>
    </div>
  </div>
  <div id="links">
    <a id="dashboardLink" role="button" tabindex="0">Dashboard</a>
    <a id="traceLink" role="button" tabindex="0">Decision trace</a>
  </div>
  <span class="model-help">Chats are saved locally for this workspace. Manage them in History.</span>
</footer>

<script nonce="${nonce}">
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const activityRows = new Map();
  let activityModel = '';

  function getModelFriendlyName() {
    if (activityModel) {
      return activityModel.split('/').pop().replace(/^subscription:[^:]+:/, '').trim();
    }
    const sel = document.getElementById('modelSelect');
    if (!sel || !sel.options || sel.selectedIndex < 0) return '';
    const opt = sel.options[sel.selectedIndex];
    if (!opt || opt.value === 'auto') return 'Tokonomics';
    return (opt.textContent || opt.value).split(' / ').pop().split(' — ')[0].trim();
  }

  function activityEntry(id, text, category, status) {
    const panel = document.getElementById('activityPanel'), list = document.getElementById('activityList');
    panel.hidden = false;
    let row = activityRows.get(id);
    if (!row) {
      if (activityRows.size >= 100) { const first = activityRows.keys().next().value; activityRows.get(first).remove(); activityRows.delete(first); }
      row = document.createElement('li'); list.appendChild(row); activityRows.set(id, row);
    }
    row.textContent = (category ? category + ': ' : '') + String(text).slice(0, 1200) + (status ? ' [' + status + ']' : '');
    list.scrollTop = list.scrollHeight;
  }
  let sessionId = ${JSON.stringify(sessionId)};

  const el = {
    state: document.getElementById('state'),
    transcript: document.getElementById('transcript'),
    empty: document.getElementById('empty'),
    modelSelect: document.getElementById('modelSelect'),
    refreshBtn: document.getElementById('refreshBtn'),
    prompt: document.getElementById('prompt'),
    sendBtn: document.getElementById('sendBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    newBtn: document.getElementById('newBtn'),
    historyBtn: document.getElementById('historyBtn'),
    dashboardLink: document.getElementById('dashboardLink'),
    traceLink: document.getElementById('traceLink')
  };

  let busy = false;
  let pendingRequestId = null;
  let streamBody = null;
  const messageSources = new WeakMap();
  let stateLabel = 'Ready';
  let busySince = 0;
  let ticker = null;

  const draft = typeof vscode.getState === 'function' ? vscode.getState() : null;
  if (draft && draft.sessionId === sessionId && typeof draft.draft === 'string') el.prompt.value = draft.draft.slice(0, 32000);
  function saveDraft() { if (typeof vscode.setState === 'function') vscode.setState({ sessionId: sessionId, draft: el.prompt.value.slice(0, 32000) }); }
  el.prompt.addEventListener('input', saveDraft);
  function post(message) { vscode.postMessage(message); }

  function setBusy(next) {
    busy = next;
    el.sendBtn.disabled = next;
    el.cancelBtn.disabled = !next;
    el.newBtn.disabled = next;
    el.historyBtn.disabled = next;
    el.refreshBtn.disabled = next;
    el.modelSelect.disabled = next;
    if (next) {
      el.state.classList.add('busy-active');
      busySince = Date.now();
      if (!ticker) ticker = setInterval(renderState, 1000);
    } else {
      el.state.classList.remove('busy-active');
      if (ticker) { clearInterval(ticker); ticker = null; }
      busySince = 0;
      activityModel = '';
    }
    renderState();
  }

  function renderState() {
    var elapsed = busy && busySince ? Math.round((Date.now() - busySince) / 1000) : 0;
    el.state.textContent = elapsed > 0 ? stateLabel + ' \u00b7 ' + elapsed + 's' : stateLabel;
  }

  function setState(text) {
    stateLabel = text;
    renderState();
  }

  function hideEmpty() { if (el.empty && el.empty.parentNode) el.empty.parentNode.removeChild(el.empty); }

  function renderMarkdown(body, nodes) {
    const allowed = new Set(['p','strong','em','s','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6',
      'table','thead','tbody','tr','th','td','a','span','code','br','hr']);
    function append(parent, node) {
      if (!node || typeof node !== 'object') return;
      if (node.tag === 'pre') {
        const block = document.createElement('div'); block.className = 'code-block';
        const header = document.createElement('div'); header.className = 'code-header';
        const lang = document.createElement('span'); lang.className = 'code-language';
        lang.textContent = node.language || 'code';
        header.appendChild(lang);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn'; copyBtn.type = 'button'; copyBtn.textContent = 'Copy';
        copyBtn.title = 'Copy code';
        copyBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          const codeText = node.text || '';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codeText).then(function () {
              copyBtn.textContent = 'Copied!';
              copyBtn.classList.add('copied');
              setTimeout(function () {
                copyBtn.textContent = 'Copy';
                copyBtn.classList.remove('copied');
              }, 1500);
            }).catch(function () {});
          }
        });
        header.appendChild(copyBtn);
        block.appendChild(header);

        const pre = document.createElement('pre'), code = document.createElement('code');
        code.textContent = node.text || '';
        pre.appendChild(code); block.appendChild(pre); parent.appendChild(block); return;
      }
      if (!allowed.has(node.tag)) { parent.appendChild(document.createTextNode(node.text || '')); return; }
      const element = document.createElement(node.tag === 'a' && !node.href ? 'span' : node.tag);
      if (node.tag === 'a' && typeof node.href === 'string' && ['https://', 'http://', 'mailto:'].some(prefix => node.href.toLowerCase().startsWith(prefix))) {
        element.href = node.href; element.target = '_blank'; element.rel = 'noopener noreferrer';
      }
      if (node.tag === 'ol' && Number.isSafeInteger(node.start)) element.start = node.start;
      if (['left','center','right'].includes(node.align)) element.className = 'align-' + node.align;
      if (typeof node.text === 'string') element.textContent = node.text;
      for (const child of node.children || []) append(element, child);
      if (node.tag === 'table') {
        const scroll = document.createElement('div'); scroll.className = 'table-scroll'; scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Table (scroll horizontally if needed)');
        scroll.appendChild(element); parent.appendChild(scroll);
      } else parent.appendChild(element);
    }
    const fragment = document.createDocumentFragment();
    for (const node of nodes) append(fragment, node);
    body.replaceChildren(fragment);
  }

  function addMessage(kind, who, text, markdown) {
    hideEmpty();
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + kind;
    const label = document.createElement('div');
    label.className = 'who';
    label.textContent = who;
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = text;
    messageSources.set(body, text);
    if (kind === 'assistant' && markdown) renderMarkdown(body, markdown);
    wrap.appendChild(label);
    wrap.appendChild(body);
    el.transcript.appendChild(wrap);
    el.transcript.scrollTop = el.transcript.scrollHeight;
    return { wrap: wrap, body: body };
  }

  function submit() {
    if (busy) return;
    const text = el.prompt.value;
    if (!text || text.trim().length === 0) return;
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    pendingRequestId = requestId;
    setBusy(true);
    const model = getModelFriendlyName();
    setState(model ? (model + ' · Compiling context…') : 'Compiling context…');
    post({ type: 'submit', sessionId: sessionId, requestId: requestId, prompt: text });
    el.prompt.value = '';
    saveDraft();
  }

  el.sendBtn.addEventListener('click', submit);
  el.cancelBtn.addEventListener('click', function () {
    if (!busy) return;
    const model = getModelFriendlyName();
    setState(model ? (model + ' · Cancelling…') : 'Cancelling…');
    post({ type: 'cancel', sessionId: sessionId });
  });
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  if (openSidebarBtn) openSidebarBtn.addEventListener('click', function () { post({ type: 'openSidebar', sessionId: sessionId }); });
  const openEditorBtn = document.getElementById('openEditorBtn');
  if (openEditorBtn) openEditorBtn.addEventListener('click', function () { post({ type: 'openEditor', sessionId: sessionId }); });
  el.historyBtn.addEventListener('click', function () {
    if (!busy) post({ type: 'showHistory', sessionId: sessionId });
  });
  el.newBtn.addEventListener('click', function () {
    if (busy) return;
    post({ type: 'newSession', sessionId: sessionId });
  });
  el.refreshBtn.addEventListener('click', function () {
    if (busy) return;
    post({ type: 'refreshModels', sessionId: sessionId });
  });
  el.modelSelect.addEventListener('change', function () {
    const value = el.modelSelect.value;
    if (value) post({ type: 'selectModel', sessionId: sessionId, modelId: value });
  });
  el.prompt.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  function activate(node, handler) {
    node.addEventListener('click', handler);
    node.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler(); }
    });
  }
  activate(el.dashboardLink, function () { post({ type: 'openDashboard' }); });
  activate(el.traceLink, function () { post({ type: 'openTrace' }); });
  document.getElementById('checkSubscriptionBtn').addEventListener('click', function () { post({ type: 'checkSubscription' }); });
  document.getElementById('configureSubscriptionBtn').addEventListener('click', function () { post({ type: 'configureSubscription' }); });

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'session') {
      if (typeof message.sessionId !== 'string' || message.sessionId.length === 0 || message.sessionId.length > 256) return;
      if (sessionId !== message.sessionId) { el.prompt.value = ''; }
      sessionId = message.sessionId;
      saveDraft();
      return;
    }
    if (typeof message.sessionId === 'string' && message.sessionId !== sessionId) return;

    switch (message.type) {
      case 'restore': {
        activityRows.clear(); document.getElementById('activityList').replaceChildren(); document.getElementById('activityPanel').hidden = true;
        el.transcript.replaceChildren(); streamBody = null;
        pendingRequestId = message.requestId;
        for (const row of message.transcript || []) {
          const created = addMessage(row.role, row.role === 'user' ? 'You' : row.role === 'assistant' ? 'Assistant' : 'Tokonomics', row.text, row.markdown);
          created.wrap.dataset.requestId = row.requestId || '';
          if (row.usage) { const usage = document.createElement('div'); usage.className = 'usage'; usage.textContent = row.usage; created.wrap.appendChild(usage); }
          if (message.busy && row.role === 'assistant' && row.requestId === message.requestId) streamBody = created.body;
        }
        if (!el.transcript.firstChild) el.transcript.appendChild(el.empty);
        setBusy(Boolean(message.busy));
        const model = getModelFriendlyName();
        setState(message.busy ? (model ? model + ' · Request in progress…' : 'Request in progress…') : 'Ready');
        break;
      }
      case 'notice':
        addMessage('info', 'Tokonomics', message.message);
        break;
      case 'activity':
        if (typeof message.text === 'string') {
          if (message.category === 'model' && message.text.startsWith('Answering with ')) {
            activityModel = message.text.replace('Answering with ', '').trim();
          }
          if (busy) {
            const model = getModelFriendlyName();
            const firstLine = message.text.split('\\n')[0].slice(0, 100);
            if (firstLine.includes(model) || firstLine.startsWith('Answering with')) {
              setState(firstLine);
            } else {
              setState(model ? (model + ' · ' + firstLine) : firstLine);
            }
          }
          activityEntry(message.entryId || 'status', message.text, message.category, message.status);
        }
        break;
      case 'models': {
        const previous = el.modelSelect.value;
        while (el.modelSelect.firstChild) el.modelSelect.removeChild(el.modelSelect.firstChild);
        el.modelSelect.disabled = busy;
        const auto = document.createElement('option');
        auto.value = 'auto';
        auto.textContent = 'Auto (VS Code models)';
        el.modelSelect.appendChild(auto);
        const groups = {};
        for (const model of message.models) {
          const groupName = model.id.startsWith('subscription:codex:') ? 'Codex subscription'
            : model.id.startsWith('subscription:claude:') ? 'Claude subscription' : 'VS Code models';
          if (!groups[groupName]) { const group = document.createElement('optgroup'); group.label = groupName; groups[groupName] = group; el.modelSelect.appendChild(group); }
          const option = document.createElement('option');
          option.value = model.id;
          const suffix = model.vendor ? ' — ' + model.vendor : '';
          option.textContent = groupName === 'VS Code models' ? model.name + suffix : model.name.split(' / ').pop();
          groups[groupName].appendChild(option);
        }
        if (message.selectedModelId && message.selectedModelId !== 'auto' && !message.models.some(model => model.id === message.selectedModelId)) {
          const missing = document.createElement('option'); missing.value = message.selectedModelId;
          missing.textContent = message.selectedModelId + ' (Refresh to check availability)'; el.modelSelect.appendChild(missing);
        }
        el.modelSelect.value = message.selectedModelId || 'auto';
        if (message.selectionLost) {
          addMessage('error', 'Tokonomics', 'The model you had selected is no longer available. Choose another model, or use Auto.');
          setState('Model unavailable');
        } else if (previous && el.modelSelect.value !== previous) {
          setState('Model changed');
        }
        break;
      }
      case 'busy':
        setBusy(Boolean(message.busy));
        break;
      case 'appendUser':
        activityRows.clear(); document.getElementById('activityList').replaceChildren();
        activityEntry('local', 'Compiling context', 'Tokonomics', 'running');
        addMessage('user', 'You', message.text).wrap.dataset.requestId = message.requestId;
        break;
      case 'streamStart': {
        const model = getModelFriendlyName();
        const created = addMessage('assistant', model ? ('Assistant (' + model + ')') : 'Assistant', '');
        created.wrap.dataset.requestId = message.requestId;
        streamBody = created.body;
        setState(model ? (model + ' · Waiting for the model…') : 'Waiting for the model…');
        break;
      }
      case 'streamDelta': {
        const model = getModelFriendlyName();
        const targetLabel = model ? (model + ' · Responding…') : 'Responding…';
        if (stateLabel !== targetLabel) setState(targetLabel);
        if (streamBody) {
          const source = (messageSources.get(streamBody) || '') + message.text;
          messageSources.set(streamBody, source);
          if (message.markdown) renderMarkdown(streamBody, message.markdown);
          else if (!streamBody.firstElementChild) streamBody.textContent = source;
        }
        el.transcript.scrollTop = el.transcript.scrollHeight;
        break;
      }
      case 'streamEnd':
        if (streamBody && message.markdown) renderMarkdown(streamBody, message.markdown);
        activityEntry('local', 'Reply completed', 'Tokonomics', 'completed');
        streamBody = null;
        pendingRequestId = null;
        setBusy(false);
        setState('Ready');
        break;
      case 'usage': {
        const nodes = Array.from(el.transcript.querySelectorAll('.msg.assistant'));
        const last = nodes.reverse().find(node => node.dataset.requestId === message.requestId);
        if (last) {
          const usage = last.querySelector('.usage') || document.createElement('div');
          usage.className = 'usage';
          usage.textContent = message.summary;
          last.appendChild(usage);
        }
        break;
      }
      case 'error':
        if (streamBody && message.markdown) renderMarkdown(streamBody, message.markdown);
        activityEntry('local', message.kind === 'cancelled' ? 'Request cancelled' : 'Request stopped', 'Tokonomics', 'failed');
        streamBody = null;
        pendingRequestId = null;
        setBusy(false);
        addMessage('error', 'Tokonomics', message.message);
        setState('Ready');
        break;
      case 'cleared': {
        activityRows.clear(); document.getElementById('activityList').replaceChildren(); document.getElementById('activityPanel').hidden = true;
        while (el.transcript.firstChild) el.transcript.removeChild(el.transcript.firstChild);
        el.transcript.appendChild(el.empty);
        streamBody = null;
        pendingRequestId = null;
        setBusy(false);
        setState('Ready');
        break;
      }
      default:
        break;
    }
  });

  post({ type: 'ready' });
}());
</script>
</body>
</html>`;
}
