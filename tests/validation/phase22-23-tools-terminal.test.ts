import * as assert from 'assert';
import { ToolRegistry } from '../../src/tools/toolIndex';
import { TerminalOutputOptimizer } from '../../src/workspace/terminalOptimizer';

export function runPhase22And23ToolsTerminalValidation(): boolean {
    console.log('--- Phase 22 & 23: Agentic Tools & Structured Terminal Error Extraction ---');

    // 1. Tool Selection
    const registry = new ToolRegistry();
    registry.registerTool({
        name: 'readFile',
        description: 'Reads content from workspace file',
        parameters: { path: 'string' },
        isMutating: false,
        category: 'filesystem'
    });

    const shortlisted = registry.selectRelevantTools('Read src/index.ts file content', 1);
    assert.ok(shortlisted.selectedTools.length > 0, 'Tool registry must shortlist relevant tools');
    assert.strictEqual(shortlisted.selectedTools[0].name, 'readFile', 'readFile must be selected');

    // 2. Structured Terminal Error Extraction (No blind middle truncation)
    const terminal = new TerminalOutputOptimizer();
    const rawLog = `
npm ERR! code ELIFECYCLE
npm ERR! errno 1
✕ AuthService > login should fail on bad password
`;
    const failureCluster = terminal.parseTerminalOutput(rawLog);
    assert.strictEqual(failureCluster.tool, 'npm', 'Tool must be identified as npm');
    assert.ok(failureCluster.failedTestNames.length > 0, 'Failed test name must be extracted');

    console.log('  ✓ Agentic tool selection and structured terminal error extraction verified.');
    return true;
}
