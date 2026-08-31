/**
 * Phase 11 Unit Tests: Semantic Project Memory & Temporal GitGraph History
 */

import { ProjectMemory } from '../src/memory/projectMemory';
import { GitGraph, GitCommitNode } from '../src/workspace/gitGraph';

export function runMemoryGitGraphTests(): boolean {
    console.log('\n--- Running Phase 11 Semantic Project Memory & GitGraph Tests ---');

    // 1. Test Semantic Project Memory
    const memory = new ProjectMemory();

    memory.addItem({
        id: 'dec_auth_jwt',
        type: 'decision',
        title: 'Use RS256 JWT Tokens',
        description: 'Selected RS256 over HS256 for asymmetric public key validation.',
        status: 'active',
        confidence: 0.95
    });

    memory.addItem({
        id: 'const_db_timeout',
        type: 'constraint',
        title: 'DB Connection Timeout',
        description: 'All queries must terminate within 5000ms.',
        status: 'active',
        confidence: 1.0
    });

    memory.addItem({
        id: 'dec_auth_legacy',
        type: 'decision',
        title: 'Use Session Cookies',
        description: 'Old stateful session cookies.',
        status: 'active',
        confidence: 0.8
    });

    // Supersede legacy cookie decision with JWT
    memory.supersedeItem('dec_auth_legacy', 'dec_auth_jwt');

    const activeItems = memory.getActiveItems();
    if (activeItems.length !== 2) {
        throw new Error(`Project memory active items filtering failed (Expected 2, got ${activeItems.length})`);
    }

    const summary = memory.formatCompactSummary(200);
    if (!summary.includes('RS256 JWT Tokens') || summary.includes('Session Cookies')) {
        throw new Error(`Project memory summary failed to reflect superseded state`);
    }

    console.log(`[Project Memory] Stored ${activeItems.length} active items (Superseded legacy decision)`);
    console.log('✓ ProjectMemory typed knowledge graph verified.');

    // 2. Test GitGraph Temporal History
    const gitGraph = new GitGraph();

    const commit1: GitCommitNode = {
        hash: 'a1b2c3d4e5f6',
        shortHash: 'a1b2c3d',
        author: 'Alice',
        message: 'Initial AuthService implementation',
        timestamp: Date.now() - 86400000 * 2, // 2 days ago
        modifiedFiles: ['src/auth/authService.ts'],
        modifiedSymbols: [{ symbolName: 'AuthService', filePath: 'src/auth/authService.ts', changeType: 'added' }]
    };

    const commit2: GitCommitNode = {
        hash: 'f6e5d4c3b2a1',
        shortHash: 'f6e5d4c',
        author: 'Bob',
        message: 'Refactor token validation to use RS256',
        timestamp: Date.now() - 3600000, // 1 hour ago
        modifiedFiles: ['src/auth/authService.ts'],
        modifiedSymbols: [{ symbolName: 'AuthService', filePath: 'src/auth/authService.ts', changeType: 'modified' }]
    };

    gitGraph.registerCommit(commit1);
    gitGraph.registerCommit(commit2);

    const history = gitGraph.getRecentSymbolHistory('AuthService');
    const recentModifying = gitGraph.findRecentModifyingCommit('AuthService');

    if (history.length !== 2 || recentModifying?.hash !== commit2.hash) {
        throw new Error(`GitGraph symbol history resolution failed (Got recent: ${recentModifying?.shortHash})`);
    }

    const historySummary = gitGraph.formatSymbolHistorySummary('AuthService');
    if (!historySummary.includes('Refactor token validation') || !historySummary.includes('Bob')) {
        throw new Error(`GitGraph history summary formatting failed`);
    }

    console.log(`[GitGraph] Retrieved ${history.length} commits for AuthService (Latest: [${recentModifying.shortHash}] by ${recentModifying.author})`);
    console.log('✓ GitGraph temporal history tracking verified.');

    return true;
}
