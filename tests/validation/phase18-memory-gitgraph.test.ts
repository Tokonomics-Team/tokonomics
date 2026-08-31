import * as assert from 'assert';
import { ProjectMemory } from '../../src/memory/projectMemory';
import { GitGraph, GitCommitNode } from '../../src/workspace/gitGraph';

export function runPhase18MemoryGitGraphValidation(): boolean {
    console.log('--- Phase 18: Project Memory & GitGraph State Validation ---');

    // 1. Decision Supersession & State Invariants
    const memory = new ProjectMemory();
    memory.addItem({ id: 'dec_1', type: 'decision', title: 'Database', description: 'MongoDB', status: 'active', confidence: 0.9 });
    memory.addItem({ id: 'dec_2', type: 'decision', title: 'Database', description: 'PostgreSQL', status: 'active', confidence: 0.95 });
    memory.supersedeItem('dec_1', 'dec_2');

    const activeDecisions = memory.getActiveItems();
    assert.strictEqual(activeDecisions.length, 1, 'Only active (non-superseded) decision must be returned');
    assert.strictEqual(activeDecisions[0].id, 'dec_2', 'Active decision must be dec_2 (PostgreSQL)');

    // 2. GitGraph commit extraction
    const gitGraph = new GitGraph();
    const commit: GitCommitNode = {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        author: 'dev',
        message: 'feat: add auth',
        timestamp: Date.now(),
        modifiedFiles: ['src/auth.ts'],
        modifiedSymbols: [{ symbolName: 'AuthService', filePath: 'src/auth.ts', changeType: 'added' }]
    };
    gitGraph.registerCommit(commit);
    const commits = gitGraph.getRecentSymbolHistory('AuthService');
    assert.strictEqual(commits.length, 1, 'GitGraph must return 1 commit for AuthService');

    console.log('  ✓ Project memory decision supersession & GitGraph state verified.');
    return true;
}
