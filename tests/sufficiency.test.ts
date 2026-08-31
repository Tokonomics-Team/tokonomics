/**
 * Phase 7 Unit Tests: Context Sufficiency & Adaptive Stopping Engine
 */

import { SufficiencyEngine, CandidateContextEntity } from '../src/engine/sufficiencyEngine';

export function runSufficiencyTests(): boolean {
    console.log('\n--- Running Phase 7 Context Sufficiency & Stopping Rules Tests ---');

    const engine = new SufficiencyEngine();

    // 1. Test TaskProfile generation for debugging
    const profile = engine.buildTaskProfile('debug', 'Fix null pointer in AuthService.validateToken', ['AuthService'], true);

    if (profile.stoppingThreshold !== 0.90 || profile.objectives.length !== 3) {
        throw new Error(`Task profile construction failed (Got: ${JSON.stringify(profile)})`);
    }
    console.log(`[Sufficiency] Built Debug Profile for AuthService (Objectives: ${profile.objectives.length}, Stopping Threshold: ${profile.stoppingThreshold})`);

    // 2. Test Partial Evidence (Insufficient)
    const entity1: CandidateContextEntity = {
        id: 'auth_interface',
        filePath: 'src/types/auth.ts',
        symbolName: 'AuthService',
        kind: 'interface',
        content: 'export interface AuthService { validateToken(t: string): boolean; }'
    };

    const partialReport = engine.evaluateSufficiency(profile, [entity1]);

    if (partialReport.isSufficient || partialReport.recommendedAction !== 'retrieve_more') {
        throw new Error(`Sufficiency should be false for partial evidence (Got: ${JSON.stringify(partialReport)})`);
    }
    console.log(`[Sufficiency] Partial Evidence Coverage: ${Math.round(partialReport.coverageScore * 100)}% (Action: ${partialReport.recommendedAction})`);

    // 3. Test Full Evidence (Sufficient -> Halt Retrieval)
    const entity2: CandidateContextEntity = {
        id: 'auth_impl',
        filePath: 'src/services/authService.ts',
        symbolName: 'AuthService',
        kind: 'class',
        content: 'export class AuthService { public validateToken(token: string) { if (!token) throw new Error("Null token"); return true; } }'
    };

    const entity3: CandidateContextEntity = {
        id: 'error_log',
        filePath: 'terminal',
        symbolName: 'ErrorDiag',
        kind: 'diagnostic',
        content: 'Error: Null token in validateToken at src/services/authService.ts:15'
    };

    const fullReport = engine.evaluateSufficiency(profile, [entity1, entity2, entity3]);

    if (!fullReport.isSufficient || fullReport.recommendedAction !== 'halt_retrieval' || fullReport.coverageScore < 0.90) {
        throw new Error(`Sufficiency should be true for complete evidence (Got: ${JSON.stringify(fullReport)})`);
    }

    console.log(`[Sufficiency] Complete Evidence Coverage: ${Math.round(fullReport.coverageScore * 100)}% (Action: ${fullReport.recommendedAction})`);
    console.log('✓ SufficiencyEngine & adaptive stopping rules verified.');

    return true;
}
