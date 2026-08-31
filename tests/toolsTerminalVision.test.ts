/**
 * Phase 13 Unit Tests: Semantic Tools, Terminal Output Optimizer & Task-Aware Vision
 */

import { ToolRegistry, ToolResultOptimizer, ToolDefinition } from '../src/tools/toolIndex';
import { TerminalOutputOptimizer } from '../src/workspace/terminalOptimizer';
import { TaskAwareVisionOptimizer } from '../src/vision/taskAwareVision';

export function runToolsTerminalVisionTests(): boolean {
    console.log('\n--- Running Phase 13 Tools, Terminal & Vision Optimization Tests ---');

    // 1. Test Semantic Tool Selection
    const registry = new ToolRegistry();
    registry.registerTool({
        name: 'readFile',
        description: 'Reads content from workspace file',
        parameters: { path: 'string' },
        isMutating: false,
        category: 'filesystem'
    });

    registry.registerTool({
        name: 'gitCommit',
        description: 'Creates a new git commit with message',
        parameters: { message: 'string' },
        isMutating: true,
        category: 'git'
    });

    registry.registerTool({
        name: 'queryDatabase',
        description: 'Executes SQL query against local database pool',
        parameters: { sql: 'string' },
        isMutating: false,
        category: 'database'
    });

    const selection = registry.selectRelevantTools('Please read the auth service file', 1);
    if (selection.selectedTools.length !== 1 || selection.selectedTools[0].name !== 'readFile') {
        throw new Error(`Tool selection failed (Got: ${JSON.stringify(selection.selectedTools)})`);
    }

    console.log(`[Tool Registry] Selected: ${selection.selectedTools[0].name} (Omitted ${selection.omittedCount} irrelevant tools, Saved ${selection.tokensSaved} tokens)`);
    console.log('✓ ToolRegistry semantic tool selection verified.');

    // 2. Test Tool Result Downsampling
    const resultOptimizer = new ToolResultOptimizer();
    const largeArray = new Array(50).fill(0).map((_, i) => ({ id: i, user: `user_${i}`, role: 'admin' }));
    const rawJson = JSON.stringify(largeArray);
    const optimizedJson = resultOptimizer.optimizeToolResult(rawJson, 5);

    if (!optimizedJson.includes('totalItemsCount') || !optimizedJson.includes('_omittedItemsCount')) {
        throw new Error(`Tool result downsampling failed (Got: ${optimizedJson})`);
    }
    console.log(`[Tool Result Optimizer] Downsampled 50-item JSON array ➔ Compact summary`);
    console.log('✓ ToolResultOptimizer JSON downsampling verified.');

    // 3. Test Terminal Output Optimizer
    const terminalOpt = new TerminalOutputOptimizer();
    const rawNpmError = `
FAIL tests/auth.test.ts
  ✕ should authenticate valid session (45 ms)
  ✕ should reject expired token (12 ms)

  ● should authenticate valid session
    at Object.login (src/auth/authService.ts:25:12)
    at runTest (tests/auth.test.ts:40:9)
`;
    const cluster = terminalOpt.parseTerminalOutput(rawNpmError);

    if (cluster.tool !== 'npm' || cluster.failedTestNames.length !== 2 || cluster.extractedStackFrames.length === 0) {
        throw new Error(`Terminal output parsing failed (Got: ${JSON.stringify(cluster)})`);
    }

    console.log(`[Terminal Optimizer] Detected ${cluster.tool.toUpperCase()} Failures: ${cluster.failedTestNames.join(', ')}`);
    console.log('✓ TerminalOutputOptimizer verified.');

    // 4. Test Task-Aware Vision Optimizer
    const visionOpt = new TaskAwareVisionOptimizer();

    const codeOcrPlan = visionOpt.planImageOptimization({
        width: 1920,
        height: 1080,
        imageType: 'code_screenshot',
        ocrTextSimulated: 'export class OrderService { calculateTotal() {} }'
    });

    if (codeOcrPlan.action !== 'convert_to_code' || codeOcrPlan.tokensSaved < 1000) {
        throw new Error(`Vision code OCR conversion failed (Saved: ${codeOcrPlan.tokensSaved} tokens)`);
    }

    const downscalePlan = visionOpt.planImageOptimization({
        width: 3840,
        height: 2160,
        imageType: 'architecture_diagram'
    });

    if (downscalePlan.action !== 'downscale' || downscalePlan.targetWidth !== 1024) {
        throw new Error(`Vision downscaling failed (Target width: ${downscalePlan.targetWidth})`);
    }

    console.log(`[Vision Optimizer] Code Screenshot ➔ Code OCR: Saved ${codeOcrPlan.tokensSaved} tokens`);
    console.log(`[Vision Optimizer] 4K Diagram ➔ 1024px: Downscaled to ${downscalePlan.targetWidth}x${downscalePlan.targetHeight}`);
    console.log('✓ TaskAwareVisionOptimizer verified.');

    return true;
}
