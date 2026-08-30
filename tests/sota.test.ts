import { RepoMapEngine } from '../src/repo/repoMap';
import { BudgetAllocator } from '../src/engine/budgetAllocator';
import { ProgressiveHistorySummarizer } from '../src/engine/progressiveSummarizer';
import { AstPrunerEngine } from '../src/ast/pruner';
import * as assert from 'assert';
import * as path from 'path';

export async function runSotaEngineTests() {
    console.log('\n--- Running SOTA PageRank Repo Map, Budget Allocator & Progressive Summarizer Tests ---');

    // 1. RepoMapEngine PageRank Test
    const workspaceRoot = path.resolve(__dirname, '..');
    const repoEngine = new RepoMapEngine(workspaceRoot);
    const mapResult = repoEngine.generateRepoMap([], 1024, workspaceRoot);

    console.log(`[PageRank Repo Map] Indexed ${mapResult.totalFilesIndexed} files, ranked ${mapResult.rankedSymbolsCount} symbols (${mapResult.tokenCount} tokens in ${mapResult.durationMs}ms)`);
    assert.ok(mapResult.totalFilesIndexed > 5, 'Should index workspace source files');
    assert.ok(mapResult.tokenCount <= 1024, 'Repo map should strictly fit in 1024 token budget');
    assert.ok(mapResult.mapText.includes('# Workspace Structural Repository Map'), 'Should include header');
    console.log('✓ PageRank Repository Map verified.');

    // 2. BudgetAllocator Proportional Fitting Test
    const astEngine = new AstPrunerEngine();
    const allocator = new BudgetAllocator(astEngine);

    const rawCode = `
export class OrderService {
    private orders: any[] = [];
    public createOrder(id: string, amount: number): boolean {
        console.log("Creating order: " + id);
        for (let i = 0; i < 100; i++) {
            this.orders.push({ i, amount });
        }
        return true;
    }
}
function internalHelperPrivate() { return "secret"; }
`.repeat(10); // Heavy code

    const history = [
        { role: 'user', content: 'Turn 1: Setup project' },
        { role: 'assistant', content: 'Turn 1: Done setup.' },
        { role: 'user', content: 'Turn 2: Add database layer' },
        { role: 'assistant', content: 'Turn 2: Done adding db.' }
    ];

    const allocated = allocator.allocate(
        'System: You are an expert engineer.',
        mapResult.mapText,
        rawCode,
        history,
        'Refactor order creation to be async',
        800, // Tight 800 token budget constraint
        'typescript'
    );

    console.log(`[Budget Allocator] Pruned tier: ${allocated.pruningTierApplied}, Fitted Total Tokens: ${allocated.totalTokens} (Target: 800)`);
    assert.ok(allocated.totalTokens <= 800, `Allocated tokens (${allocated.totalTokens}) should be <= 800`);
    assert.ok(allocated.pruningTierApplied !== 'full', 'Heavy code should trigger AST pruning tier');
    console.log('✓ Proportional Token Budget Allocator verified.');

    // 3. ProgressiveHistorySummarizer Test
    const longHistory = [
        { role: 'user', content: 'Fix bug in auth service' },
        { role: 'assistant', content: '```typescript\nfunction fix() {}\n```' },
        { role: 'user', content: 'Run test suite' },
        { role: 'assistant', content: 'All 15 tests passed.' },
        { role: 'user', content: 'Now deploy to staging' },
        { role: 'assistant', content: 'Staging deployment complete.' },
        { role: 'user', content: 'Final question on CORS settings' }
    ];

    const summarized = ProgressiveHistorySummarizer.summarize(longHistory, 2);
    console.log(`[Progressive Summarizer] Original turns: ${longHistory.length} -> Condensed: ${summarized.messages.length} messages (Saved ${summarized.tokensSaved} tokens, ${summarized.turnsSummarized} turns summarized)`);
    assert.ok(summarized.messages[0].content.includes('TURN ANCHORS') || summarized.messages[0].content.includes('SUMMARY'), 'Should generate milestone or anchor header');
    console.log('✓ Progressive Recursive History Summarizer verified.');
}
