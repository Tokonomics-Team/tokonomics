import { WorkCancellation, WorkCancelledError } from './boundedScheduler';
import { TaskWorkerPool, WorkerPoolStats, TaskWorkerPoolOptions } from './workerPool';
import { KnapsackSolverParams, SolverResult } from '../solver/knapsackSolver';
import { AstPruneResult } from '../ast/types';

export interface WorkspaceRankInput {
    files: readonly {
        key: string;
        relativePath: string;
        references: readonly string[];
        symbols: readonly { name: string; kind: string; file: string; line: number; signature: string }[];
    }[];
    activeKeys: readonly string[];
}

export interface RankedWorkspaceSymbol {
    name: string;
    kind: string;
    file: string;
    line: number;
    signature: string;
    score: number;
}

/**
 * Modern Tokonomics 7.0 CPU Worker Boundary
 * Wraps the persistent TaskWorkerPool to isolate serializable CPU-heavy
 * PageRank calculations, image rightsizing, Knapsack DP solving, and AST pruning
 * from the VS Code Extension Host single thread.
 */
export class CpuWorkerBoundary {
    private readonly pool: TaskWorkerPool;
    private disposed = false;

    constructor(
        private readonly timeoutMs = 15_000,
        private readonly maxInputBytes = 32 * 1024 * 1024,
        options?: TaskWorkerPoolOptions
    ) {
        this.pool = new TaskWorkerPool({
            taskTimeoutMs: timeoutMs,
            maxInputBytes,
            ...options
        });
    }

    public rankWorkspace(input: WorkspaceRankInput, cancellation?: WorkCancellation): Promise<RankedWorkspaceSymbol[]> {
        return this.pool.execute<RankedWorkspaceSymbol[]>('rank-workspace', input, cancellation, this.timeoutMs);
    }

    public rightsizeInlineImages(
        input: { text: string; config: { maxDimension: number; quality: number; preserveVisualData: boolean } },
        cancellation?: WorkCancellation
    ): Promise<{
        text: string;
        stats: {
            originalBytes: number;
            compressedBytes: number;
            reductionPercentage: number;
            estimatedTokensSaved: number;
            wasProcessed: boolean;
        };
    }> {
        return this.pool.execute('inline-images', input, cancellation, this.timeoutMs);
    }

    public async solveKnapsack(
        params: KnapsackSolverParams,
        cancellation?: WorkCancellation
    ): Promise<SolverResult> {
        const raw = await this.pool.execute<any>('knapsack-solve', params, cancellation, this.timeoutMs);
        return {
            ...raw,
            assignments: new Map<string, any>(raw.assignments)
        };
    }

    public pruneCodeContext(
        input: { code: string; language?: string },
        cancellation?: WorkCancellation
    ): Promise<AstPruneResult> {
        return this.pool.execute<AstPruneResult>('ast-prune', input, cancellation, this.timeoutMs);
    }

    public batchPrune(
        items: { code: string; language?: string }[],
        cancellation?: WorkCancellation
    ): Promise<AstPruneResult[]> {
        return this.pool.execute<AstPruneResult[]>('batch-ast-prune', { items }, cancellation, this.timeoutMs);
    }

    public getPoolStats(): WorkerPoolStats {
        return this.pool.getStats();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pool.dispose();
    }
}
