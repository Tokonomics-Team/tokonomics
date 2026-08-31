import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export function runPhase31VsCodeIntegrationValidation(): boolean {
    console.log('--- Phase 31: VS Code Host Integration & Slash Commands Parity ---');

    const projectRoot = process.cwd();
    const pkgPath = path.resolve(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Check all 10 registered commands
    const expectedCommands = [
        'tokenOptimizer.showDashboard',
        'tokenOptimizer.showAnalyticsWebview',
        'tokenOptimizer.comparePrunedDiff',
        'tokenOptimizer.optimizeSelection',
        'tokenOptimizer.toggleAstPruning',
        'tokenOptimizer.resetMetrics',
        'tokenOptimizer.exportLogs',
        'tokenOptimizer.liveStats',
        'tokenOptimizer.aggregateStats',
        'tokenOptimizer.explainTrace'
    ];

    const commands = pkg.contributes.commands.map((c: any) => c.command);
    for (const ec of expectedCommands) {
        assert.ok(commands.includes(ec), `Command ${ec} must be contributed in package.json`);
    }

    // Check all 10 slash commands
    const expectedSlash = ['dashboard', 'live', 'explain', 'stats', 'map', 'pack', 'analyze', 'compact', 'logs', 'ram'];
    const slashCommands = pkg.contributes.chatParticipants[0].commands.map((c: any) => c.name);
    for (const es of expectedSlash) {
        assert.ok(slashCommands.includes(es), `Slash command /${es} must be contributed`);
    }

    console.log('  ✓ VS Code 10 commands and 10 slash commands parity verified.');
    return true;
}
