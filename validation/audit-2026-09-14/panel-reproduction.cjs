const fs = require('fs');
const path = require('path');
const assert = require('assert');
const esbuild = require('esbuild');
async function main() {
  const root = path.resolve(__dirname, '../..');
  const output = path.join(__dirname, 'probes-panel.js');
  await esbuild.build({ stdin: { contents: [
    'export * from "./src/ui/chatSessionController";',
    'export * from "./src/proxy/chatContextReferences";',
    'export * from "./src/governor/contextGovernor";',
    'export * from "./src/engine/retrievalRenderPolicy";'
  ].join('\n'), resolveDir: root, loader: 'ts' }, outfile: output,
    bundle: true, platform: 'node', format: 'cjs', target: 'node20',
    alias: { vscode: path.join(root, 'tests/mock-vscode.ts') },
    external: ['@vscode/tree-sitter-wasm'], logLevel: 'silent' });
  const m = require(output);
  const prompt = fs.readFileSync(path.join(__dirname, 'panel-prompt.txt'), 'utf8');
  const decision = m.DeterministicContextGovernor.getInstance().evaluateContext({ userPrompt: prompt });
  const result = { promptChars: prompt.length, hasCodeFence: prompt.includes('```'),
    asksForWorkspaceSource: m.asksForWorkspaceSource(prompt),
    taskType: decision.taskType, cases: [] };
  const renderInput = { messages: [{ role: 'user', content: prompt }], allowWorkspaceRetrieval: true,
    hasRetrieval: true, selectedCount: 1, conservativeFallback: true, missingRequired: ['errorStackTrace'] };
  result.renderPolicy = m.resolveRetrievalRenderDecision(renderInput);
  result.withExplicitSourceProvenance = m.resolveRetrievalRenderDecision({ ...renderInput, callerSuppliedSource: false });
  assert.strictEqual(result.renderPolicy.callerSuppliedContext, true);
  assert.strictEqual(result.renderPolicy.shouldRender, false);
  assert.strictEqual(result.withExplicitSourceProvenance.shouldRender, true);
  for (const raw of [
    'No project source was prepared. Set Token Optimizer: Workspace Context to Automatic in a trusted workspace, or paste the relevant code.',
    'No project source was prepared: no workspace files are indexed yet. Open a folder in a trusted window, or paste the relevant code.',
    'No project source was prepared: retrieval admitted nothing from 172 indexed file(s) for this request. Attach the files you mean, or paste the relevant code.'
  ]) {
    const messages = [];
    const controller = new m.ChatSessionController({ post: message => messages.push(message) },
      'panel_probe', { subscribe: () => () => {} },
      () => ({ sendRequest: async () => { throw new Error(raw); } }));
    await controller.submit('panel_probe_request', prompt);
    const displayed = messages.find(message => message.type === 'error')?.message;
    assert.strictEqual(displayed, raw.includes('prepared.') ? raw : 'The request failed before a reply was produced.');
    result.cases.push({ injectedError: raw, displayedError: displayed });
    controller.dispose();
  }
  assert.strictEqual(result.asksForWorkspaceSource, true);
  assert.strictEqual(result.hasCodeFence, false);
  fs.writeFileSync(path.join(__dirname, 'panel-reproduction.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
