import { AstPrunerEngine } from '../src/ast/pruner';
import { CacheAlignerEngine } from '../src/cache/aligner';
import { MetricsTracker } from '../src/metrics/tracker';
import { ContextAnalyzer } from '../src/proxy/contextAnalyzer';
import { TokenOptimizationConfig } from '../src/types';
import * as assert from 'assert';

export async function runE2ETests() {
    console.log('\n--- Running End-to-End Pipeline & Metrics Tests ---');

    const astEngine = new AstPrunerEngine();
    await astEngine.initialize(__dirname);
    const cacheAligner = new CacheAlignerEngine();
    const metricsTracker = new MetricsTracker();
    const contextAnalyzer = new ContextAnalyzer(astEngine, cacheAligner, metricsTracker);

    const config: TokenOptimizationConfig = {
        enableAstPruning: true,
        enableCacheAlignment: true,
        enableTextCompression: true,
        compressionRatio: 0.4,
        targetProvider: 'anthropic',
        maxHistoryTurns: 6,
        stripDiffsAndLogs: true,
        targetUpstreamModelFamily: 'gpt-4o'
    };

    const simulatedSession = [
        {
            role: 'system',
            content: 'You are an autonomous senior software architect. Adhere to type-safety.'
        },
        {
            role: 'user',
            content: 'Please inspect the repository context and optimize the UserManager implementation.'
        },
        {
            role: 'assistant',
            content: 'Understood. Please provide the repository files and current test diff.'
        },
        {
            role: 'user',
            content: `Here is the full repository source context for review:

\`\`\`typescript
import { Database } from '../db/connection';
import { Logger } from '../utils/logger';
import { AnalyticsService } from '../analytics/client';

export interface UserDTO {
    id: string;
    email: string;
    roles: string[];
    createdAt: Date;
}

export interface UserFilter {
    role?: string;
    limit: number;
    offset: number;
}

export class UserManager {
    private logger = new Logger();
    private cache = new Map<string, UserDTO>();
    public totalQueriesExecuted: number = 0;

    public async getUser(id: string): Promise<UserDTO | null> {
        this.logger.debug('Fetching user: ' + id);
        this.totalQueriesExecuted++;
        if (this.cache.has(id)) {
            return this.cache.get(id)!;
        }
        const row = await Database.query('SELECT * FROM users WHERE id = $1', [id]);
        if (!row || row.length === 0) {
            return null;
        }
        const dto: UserDTO = {
            id: row[0].id,
            email: row[0].email,
            roles: JSON.parse(row[0].roles_json),
            createdAt: new Date(row[0].created_at)
        };
        for (let i = 0; i < 50; i++) {
            this.logger.debug('Validating session token hashes: ' + i);
        }
        this.cache.set(id, dto);
        return dto;
    }

    public async updateUserRoles(id: string, roles: string[]): Promise<boolean> {
        this.logger.info('Updating user roles for: ' + id);
        this.totalQueriesExecuted++;
        await Database.query('UPDATE users SET roles_json = $1 WHERE id = $2', [JSON.stringify(roles), id]);
        this.cache.delete(id);
        await AnalyticsService.track('roles_updated', { userId: id, count: roles.length });
        return true;
    }

    public async listUsers(filter: UserFilter): Promise<UserDTO[]> {
        this.logger.info('Listing users with filter: ' + JSON.stringify(filter));
        const rows = await Database.query('SELECT * FROM users LIMIT $1 OFFSET $2', [filter.limit, filter.offset]);
        const results: UserDTO[] = [];
        for (const row of rows) {
            results.push({
                id: row.id,
                email: row.email,
                roles: JSON.parse(row.roles_json),
                createdAt: new Date(row.created_at)
            });
        }
        return results;
    }
}

export async function computeSecurityHash(input: string, salt: string): Promise<string> {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return 'SEC_' + hash.toString(16);
}
\`\`\`

Please recommend best practices for refactoring listUsers to support streaming pagination.
`
        }
    ];

    const result = contextAnalyzer.processMessages(simulatedSession, config);

    console.log(`[E2E Test] Original Tokens: ${result.stats.originalTokens} -> Optimized Tokens: ${result.stats.optimizedTokens} (${result.stats.reductionPercentage}% Net Reduction)`);
    console.log(`[E2E Test] Estimated USD Cost Saved: $${result.stats.estimatedCostSavedUsd.toFixed(4)} USD`);
    console.log(`[E2E Test] Estimated Latency Saved: ${result.stats.latencySavedMs}ms`);

    assert.ok(result.stats.reductionPercentage >= 45, `Expected >= 45% reduction on code context hydration, got ${result.stats.reductionPercentage}%`);
    assert.strictEqual(result.alignedMessages[0].role, 'system');
    assert.ok(result.alignedMessages[0].content.includes('REPOSITORY INTERFACE SPECIFICATION'));
    assert.strictEqual(result.alignedMessages[result.alignedMessages.length - 1].role, 'user');

    const metrics = metricsTracker.getCumulativeMetrics();
    assert.strictEqual(metrics.totalRequests, 1);
    assert.ok(metrics.totalSavedTokens > 0);
    console.log('✓ End-to-End optimization pipeline & ROI metrics verified.');
}
