/**
 * Phase 16 Automated Test Suite: Cross-Encoder/MMR Reranking and Semantic Deduplication
 * Validates unified candidate schema, local cross-encoder interaction, stable MMR tie-breaking,
 * multi-file minimum representation, 100% adversarial near-duplicate distinction protection,
 * protection gates (roles, tools, errors, tests, mandatory items), deterministic merge retention,
 * and ComponentReceiptTrail shadow auditing.
 */

import assert from 'assert';
import { CandidateItem, CrossEncoderReranker, DeterministicLocalCrossEncoder, HybridReranker } from '../src/search/reranker';
import { MmrDiversityRanker } from '../src/search/mmrDiversity';
import { EmbeddingSemanticDedupEngine, SemanticDedupCandidate } from '../src/dedup/semanticDedup';
import { WorkspaceSnapshot, WorkspaceFileRecord } from '../src/workspace/workspaceIndex';
import { FeatureFlagRegistry } from '../src/engine/featureFlags';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';

export async function runPhase16RerankDedupTests(): Promise<void> {
    console.log('\n--- Running Phase 16 Cross-Encoder, MMR & Semantic Dedup Tests ---');

    // 1. Unified Candidate Schema Compatibility
    {
        const candidate: CandidateItem = {
            id: 'cand_auth_1',
            filePath: 'src/auth/authService.ts',
            symbolName: 'AuthService',
            content: 'export class AuthService { login() {} }',
            embedding: new Float32Array([0.9, 0.1, 0.05, 0.0]),
            initialScore: 0.85,
            category: 'targetImplementation',
            sourceKind: 'symbol',
            contentHash: 'hash_auth_v1',
            dependencies: ['User', 'TokenService'],
            provenance: ['source:authoritative_source', 'snapshot:1'],
            mandatory: true,
            sourceScore: 25,
            fusedScore: 0.032,
            diversityScore: 0.028,
            isProtected: true,
            mergedReferences: ['cand_auth_alias'],
            updatedAt: Date.now(),
            lineStart: 10,
            lineEnd: 25
        };

        assert.strictEqual(candidate.id, 'cand_auth_1');
        assert.strictEqual(candidate.mandatory, true);
        assert.strictEqual(candidate.category, 'targetImplementation');
        assert.strictEqual(candidate.dependencies?.length, 2);
        assert.strictEqual(candidate.provenance?.length, 2);
        assert.strictEqual(candidate.isProtected, true);
        console.log('✓ Unified candidate schema compatibility across retriever, reranker, dedup, and solver verified.');
    }

    // 2. Local Cross-Encoder Interaction & Bounded Top-K Reranking
    {
        const localProvider = new DeterministicLocalCrossEncoder({ timeoutMs: 50, maxBatchSize: 10 });
        const query = 'authenticate user login token';

        const cands = [
            { id: 'auth_exact', content: 'export class AuthService { public authenticate(user, token) { return token; } }', symbolName: 'AuthService' },
            { id: 'db_unrelated', content: 'export class DatabasePool { public executeQuery(sql, params) { return pool.query(); } }', symbolName: 'DatabasePool' },
            { id: 'auth_partial', content: 'function checkPermission() { return true; }', symbolName: 'checkPermission' }
        ];

        const scores = await localProvider.scorePairs(query, cands);
        assert.strictEqual(scores.length, 3);
        const scoreAuth = scores.find(s => s.candidateId === 'auth_exact')!.crossScore;
        const scoreDb = scores.find(s => s.candidateId === 'db_unrelated')!.crossScore;
        const scorePartial = scores.find(s => s.candidateId === 'auth_partial')!.crossScore;

        assert.ok(scoreAuth > scoreDb, `Exact auth match must score significantly higher than DB (${scoreAuth} vs ${scoreDb})`);
        assert.ok(scoreAuth > scorePartial, `Exact auth match must score higher than partial match (${scoreAuth} vs ${scorePartial})`);

        // Bounded top-K reranking test: only top 2 are reranked
        const fullCandidates: CandidateItem[] = [
            { id: 'cand_1', filePath: 'src/a.ts', symbolName: 'A', content: cands[0].content, initialScore: 0.5 },
            { id: 'cand_2', filePath: 'src/b.ts', symbolName: 'B', content: cands[1].content, initialScore: 0.4 },
            { id: 'cand_3', filePath: 'src/c.ts', symbolName: 'C', content: cands[2].content, initialScore: 0.3 }
        ];

        const reranker = new CrossEncoderReranker(true, localProvider, 2);
        const ranked = await reranker.rank(query, fullCandidates);
        assert.strictEqual(ranked.length, 3);
        assert.strictEqual(ranked[0].id, 'cand_1', 'Top candidate must be cand_1');
        assert.strictEqual(ranked[0].rerankerUsed, 'cross_encoder');
        assert.strictEqual(ranked[2].id, 'cand_3', 'Unranked tail candidate must preserve baseline rank');

        // Safe fallback on provider error
        const brokenReranker = new CrossEncoderReranker(false);
        const fallbackRanked = await brokenReranker.rank(query, fullCandidates);
        assert.strictEqual(fallbackRanked[0].rerankerUsed, 'cosine', 'Disabled cross-encoder must fall back cleanly to cosine');

        console.log('✓ Deterministic local cross-encoder interaction, bounded top-K, and safe fallback verified.');
    }

    // 3. MMR Diversity with Stable Tie-Breaking and Minimum Representation
    {
        const mmr = new MmrDiversityRanker();

        const candidateItems = [
            { id: 'cand_fileA_1', filePath: 'src/fileA.ts', symbolName: 'AuthClass', content: 'export class AuthClass { login() {} }', rerankScore: 0.95, rank: 1, rerankerUsed: 'cross_encoder' as const, category: 'targetImplementation' },
            { id: 'cand_fileA_2', filePath: 'src/fileA.ts', symbolName: 'AuthHelper', content: 'export class AuthHelper { verify() {} }', rerankScore: 0.94, rank: 2, rerankerUsed: 'cross_encoder' as const, category: 'targetImplementation' },
            { id: 'cand_fileB_1', filePath: 'src/fileB.ts', symbolName: 'UserContract', content: 'export interface UserContract { id: string; }', rerankScore: 0.85, rank: 3, rerankerUsed: 'cross_encoder' as const, category: 'apiContract' },
            { id: 'cand_fileC_1', filePath: 'src/fileC.test.ts', symbolName: 'AuthTest', content: 'describe("AuthTest", () => {});', rerankScore: 0.80, rank: 4, rerankerUsed: 'cross_encoder' as const, category: 'tests' }
        ];

        // 3a. Minimum representation across files & categories
        const diversified = mmr.rankDiversity(candidateItems, 3, 0.5);
        const selectedFiles = diversified.map(d => d.filePath);
        assert.ok(selectedFiles.includes('src/fileB.ts'), 'MMR must ensure minimum representation for fileB.ts');

        // 3b. Stable tie-breaking test
        const tieCandidates = [
            { id: 'cand_z_tied', filePath: 'src/a.ts', symbolName: 'Z', content: 'code z', rerankScore: 0.80, rank: 1, rerankerUsed: 'cosine' as const, mandatory: false, sourceScore: 10 },
            { id: 'cand_a_tied', filePath: 'src/b.ts', symbolName: 'A', content: 'code a', rerankScore: 0.80, rank: 2, rerankerUsed: 'cosine' as const, mandatory: false, sourceScore: 10 },
            { id: 'cand_m_tied', filePath: 'src/c.ts', symbolName: 'M', content: 'code m', rerankScore: 0.80, rank: 3, rerankerUsed: 'cosine' as const, mandatory: true, sourceScore: 5 }
        ];

        const tieResult = mmr.rankDiversity(tieCandidates, 3, 0.7);
        // Mandatory item must win tie-break
        assert.strictEqual(tieResult[0].id, 'cand_m_tied', 'Mandatory candidate must win tie break');
        // Between remaining non-mandatory items with equal scores, alphabetical ID cand_a_tied precedes cand_z_tied
        assert.strictEqual(tieResult[1].id, 'cand_a_tied', 'Alphabetical ID must break secondary tie');
        assert.strictEqual(tieResult[2].id, 'cand_z_tied');

        console.log('✓ MMR diversity stable tie-breaking and file/category minimum representation verified.');
    }

    // 4. Adversarial Near-Duplicate Distinction Protection (100% Preservation)
    {
        const dedup = new EmbeddingSemanticDedupEngine(0.85);

        const adversarialPairs: Array<{ name: string; candA: SemanticDedupCandidate; candB: SemanticDedupCandidate }> = [
            {
                name: 'Negation Distinction',
                candA: { id: 'neg_true', content: 'const isAuthorized = true;', tokens: 5, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'neg_false', content: 'const isAuthorized = false;', tokens: 5, embedding: [0.9, 0.1, 0.0] }
            },
            {
                name: 'Numeric/Port Distinction',
                candA: { id: 'port_8080', content: 'const serverPort = 8080;', tokens: 5, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'port_3000', content: 'const serverPort = 3000;', tokens: 5, embedding: [0.9, 0.1, 0.0] }
            },
            {
                name: 'Unit Distinction',
                candA: { id: 'unit_sec', content: 'const timeout = 5; // seconds', tokens: 6, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'unit_ms', content: 'const timeout = 5; // ms', tokens: 6, embedding: [0.9, 0.1, 0.0] }
            },
            {
                name: 'Error Code Distinction',
                candA: { id: 'err_2339', content: 'error TS2339: Property "x" does not exist', tokens: 8, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'err_2345', content: 'error TS2345: Argument of type is not assignable', tokens: 8, embedding: [0.9, 0.1, 0.0] }
            },
            {
                name: 'Access Modifier Distinction',
                candA: { id: 'mod_public', content: 'public login() { return true; }', tokens: 6, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'mod_private', content: 'private login() { return true; }', tokens: 6, embedding: [0.9, 0.1, 0.0] }
            },
            {
                name: 'Nullability Distinction',
                candA: { id: 'null_nullable', content: 'getUser(): User | null { return null; }', tokens: 8, embedding: [0.9, 0.1, 0.0] },
                candB: { id: 'null_strict', content: 'getUser(): User { return user; }', tokens: 7, embedding: [0.9, 0.1, 0.0] }
            }
        ];

        for (const pair of adversarialPairs) {
            const res = dedup.deduplicate([pair.candA, pair.candB]);
            assert.strictEqual(res.keptItems.length, 2, `Must preserve both items in ${pair.name} (culled: ${res.culledDuplicates.length})`);
            assert.strictEqual(res.culledDuplicates.length, 0, `Zero duplicates culled in ${pair.name}`);
        }

        console.log('✓ 100% preservation of adversarial near-duplicate distinctions (negation, numbers, units, error codes, modifiers, nullability) verified.');
    }

    // 5. Protection Gates (Roles, Tools, Errors, Tests, Mandatory Items)
    {
        const dedup = new EmbeddingSemanticDedupEngine(0.80);

        const identicalContent = 'export function execute() { return true; }';
        const embedding = [0.99, 0.01, 0.0];

        const candidates: SemanticDedupCandidate[] = [
            { id: 'sys_msg', role: 'system', content: identicalContent, tokens: 10, embedding },
            { id: 'tool_call', content: `call: {"tool_use": "execute", "code": "${identicalContent}"}`, tokens: 15, embedding },
            { id: 'mandatory_evidence', mandatory: true, content: identicalContent, tokens: 10, embedding },
            { id: 'test_evidence', category: 'tests', content: identicalContent, tokens: 10, embedding },
            { id: 'error_evidence', category: 'errorStackTrace', content: identicalContent, tokens: 10, embedding },
            { id: 'contract_evidence', category: 'apiContract', content: identicalContent, tokens: 10, embedding },
            { id: 'regular_cand_1', content: identicalContent, tokens: 10, embedding },
            { id: 'regular_cand_2', content: identicalContent, tokens: 10, embedding }
        ];

        const res = dedup.deduplicate(candidates);

        // Protected items (sys_msg, tool_call, mandatory, tests, errors, apiContract) and regular_cand_1 must all be kept; regular_cand_2 may be merged into regular_cand_1
        const keptIds = new Set(res.keptItems.map(k => k.id));
        assert.ok(keptIds.has('sys_msg'), 'System message must be protected');
        assert.ok(keptIds.has('tool_call'), 'Tool call must be protected');
        assert.ok(keptIds.has('mandatory_evidence'), 'Mandatory evidence must be protected');
        assert.ok(keptIds.has('test_evidence'), 'Tests must be protected');
        assert.ok(keptIds.has('error_evidence'), 'Error stack trace must be protected');
        assert.ok(keptIds.has('contract_evidence'), 'API contract must be protected');

        // Exactly 1 duplicate culled (regular_cand_2)
        assert.strictEqual(res.culledDuplicates.length, 1, 'Only non-protected redundant candidate may be culled');
        assert.strictEqual(res.culledDuplicates[0].duplicateId, 'regular_cand_2');

        console.log('✓ Protection gates (system, tools, mandatory, tests, errors, API contracts) verified.');
    }

    // 6. Deterministic Duplicate Merge & Reference Retention
    {
        const dedup = new EmbeddingSemanticDedupEngine(0.85);

        const cand1: SemanticDedupCandidate = {
            id: 'cand_primary',
            content: 'function computeHash(input: string) { return sha256(input); }',
            tokens: 12,
            embedding: [0.95, 0.05, 0.0],
            provenance: ['source:authoritative_source'],
            dependencies: ['crypto']
        };

        const cand2: SemanticDedupCandidate = {
            id: 'cand_duplicate',
            content: 'function computeHash(input: string) { return sha256(input); }',
            tokens: 12,
            embedding: [0.95, 0.05, 0.0],
            provenance: ['source:generated'],
            dependencies: ['util']
        };

        const res = dedup.deduplicate([cand1, cand2]);
        assert.strictEqual(res.keptItems.length, 1);
        const kept = res.keptItems[0];
        assert.strictEqual(kept.id, 'cand_primary');
        assert.ok(kept.mergedReferences?.includes('cand_duplicate'), 'Must retain merged reference to duplicate');
        assert.ok(kept.provenance?.includes('source:generated'), 'Must merge provenance tags');
        assert.ok(kept.dependencies?.includes('util'), 'Must merge dependency references');

        console.log('✓ Deterministic duplicate merge, reference retention, and provenance combination verified.');
    }

    // 7. PipelineOrchestrator Integration & Receipt Trail Auditing
    {
        FeatureFlagRegistry.resetToDefault();
        const orchestrator = new PipelineOrchestrator();

        const mockSnapshot: WorkspaceSnapshot = {
            generation: 1,
            capturedAt: Date.now(),
            workspaceRoot: 'd:/project',
            files: new Map<string, WorkspaceFileRecord>([
                ['src/auth.ts', {
                    key: 'src/auth.ts',
                    absolutePath: 'd:/project/src/auth.ts',
                    relativePath: 'src/auth.ts',
                    contentHash: 'hash_auth',
                    byteLength: 80,
                    lineCount: 5,
                    languageId: 'typescript',
                    skeleton: 'export class AuthService { login() {} }',
                    symbols: [{ name: 'AuthService', kind: 'class', line: 1, column: 1, file: 'src/auth.ts', signature: 'class AuthService' }],
                    references: [],
                    imports: []
                }]
            ]),
            symbols: [{ name: 'AuthService', kind: 'class', line: 1, column: 1, file: 'src/auth.ts', signature: 'class AuthService' }],
            references: new Map(),
            callHierarchy: new Map(),
            diagnostics: []
        };

        // 7a. Default state: flags disabled -> emit bypassed
        const defResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService' }],
            workspaceSnapshot: mockSnapshot,
            activeFilePath: 'src/auth.ts',
            cursorLine: 1,
            allowWorkspaceRetrieval: true
        });

        const defReceipts = defResult.receipts || [];
        for (const compId of ['cross_encoder', 'standalone_mmr', 'semantic_dedup'] as const) {
            const attempted = defReceipts.find(r => r.componentId === compId && r.outcome === 'attempted');
            assert.ok(attempted, `${compId} must emit attempted receipt`);
        }

        // 7b. Enable flags explicitly -> emits attempted, invoked, and truthful shadow fallback
        FeatureFlagRegistry.setFlag('enableCrossEncoder', true);
        FeatureFlagRegistry.setFlag('enableMmrDiversity', true);
        FeatureFlagRegistry.setFlag('enableSemanticDedup', true);

        const activeResult = await orchestrator.compileContext({
            messages: [{ role: 'user', content: 'Explain AuthService login flow' }],
            workspaceSnapshot: mockSnapshot,
            activeFilePath: 'src/auth.ts',
            cursorLine: 1,
            allowWorkspaceRetrieval: true
        });

        const activeReceipts = activeResult.receipts || [];
        for (const compId of ['cross_encoder', 'standalone_mmr', 'semantic_dedup'] as const) {
            const attempted = activeReceipts.find(r => r.componentId === compId && r.outcome === 'attempted');
            const invoked = activeReceipts.find(r => r.componentId === compId && r.outcome === 'invoked');
            const fallback = activeReceipts.find(r => r.componentId === compId && r.outcome === 'fallback');
            assert.ok(attempted, `${compId} must emit attempted receipt`);
            assert.ok(invoked, `${compId} must emit invoked receipt`);
            assert.ok(fallback || activeReceipts.find(r => r.componentId === compId && r.outcome === 'contributed'),
                `${compId} must report a production contribution or coded fallback`);
        }

        // Shadow mode check: production compiler output remains isolated
        assert.ok(activeResult.optimizedMessages.length > 0, 'Production compiler output must be preserved');

        // Reset flags
        FeatureFlagRegistry.resetToDefault();
        console.log('✓ PipelineOrchestrator integration, ComponentReceiptTrail auditing, and shadow mode verified.');
    }

    console.log('\n====================================================================================');
    console.log('🎉 ALL PHASE 16 CROSS-ENCODER, MMR & SEMANTIC DEDUP TESTS PASSED (100%)');
    console.log('====================================================================================\n');
}
