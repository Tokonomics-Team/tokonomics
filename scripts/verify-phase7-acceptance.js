const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

async function main() {
    console.log('====================================================================================');
    console.log('🔬 TOKONOMICS PHASE 7: CONTENT-ADDRESSABLE BLOB AST CACHING ACCEPTANCE HARNESS');
    console.log('====================================================================================\n');

    const tempBundlePath = path.join(__dirname, '..', 'out_test', 'phase7_verification_bundle.js');
    const harnessSource = `
    import { BlobAstCache } from '../src/cache/blobAstCache';
    import { AstPrunerEngine } from '../src/ast/pruner';
    import { VersionedWorkspaceIndex } from '../src/workspace/workspaceIndex';
    import { WorkspaceIdentity } from '../src/workspace/workspaceIdentity';
    import * as path from 'path';
    import * as fs from 'fs';
    import * as os from 'os';

    export async function runVerification() {
        // -------------------------------------------------------------
        // Criterion 1: Content-Addressable Cache Hit & Parse Elimination
        // -------------------------------------------------------------
        console.log('--- Criterion 1: Content-Addressable Cache Hit & Parse Elimination (> 90% Hit Rate) ---');
        const pruner = new AstPrunerEngine();
        const cache = pruner.getBlobAstCache();
        cache.clear();

        // Generate 50 realistic TypeScript files
        const codeFiles = [];
        for (let i = 0; i < 50; i++) {
            codeFiles.push(\`
                export interface ModuleService_\${i} {
                    id: string;
                    execute(param: number): Promise<boolean>;
                }

                export class Implementation_\${i} implements ModuleService_\${i} {
                    id = "service_\${i}";
                    async execute(param: number): Promise<boolean> {
                        const localValue = param * 2;
                        return localValue > 0;
                    }
                }
            \`);
        }

        // Simulate 1,000 compilation/pruning queries sampled across the 50 files
        for (let q = 0; q < 1000; q++) {
            const fileIdx = q % 50;
            pruner.pruneCodeContext(codeFiles[fileIdx], 'typescript', { structuralTier: 'T1' });
        }

        const stats1 = cache.getStats();
        console.log('  Total Prune Invocations:    1,000');
        console.log('  Unique Files Parsed:        ' + stats1.entries + ' (initial misses: ' + stats1.misses + ')');
        console.log('  Cache Hits (Eliminated):    ' + stats1.hits);
        console.log('  Measured Cache Hit Rate:    ' + stats1.hitRate + '% (Gate: > 90.0%)');

        const crit1Pass = stats1.hitRate >= 90.0 && stats1.hits >= 900;
        console.log('  Criterion 1 Gate (> 90% Hit Rate): ' + (crit1Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 2: Sub-0.05ms Retrieval Speedup & CPU Savings
        // -------------------------------------------------------------
        console.log('--- Criterion 2: Sub-0.05ms Retrieval Speedup & CPU Savings ---');
        const benchmarkCode = \`
import { Observable, Subject } from 'rxjs';
import { BaseService, ServiceContext, TransactionReceipt } from '../core/base';
import { SecurityToken, TokenClaims, ValidationStatus } from '../auth/token';

export interface EnterpriseOrderPayload {
    id: string;
    clientId: string;
    tenantId: string;
    items: Array<{ sku: string; quantity: number; unitPriceUsd: number; discounts: string[] }>;
    shippingAddress: { line1: string; city: string; state: string; postalCode: string; countryIso: string };
    paymentMethodToken: string;
    submittedAtIso: string;
}

export interface ProcessingMetrics {
    orderId: string;
    durationMs: number;
    validationStatus: ValidationStatus;
    totalAmountUsd: number;
}

/**
 * EnterpriseOrderProcessor coordinates high-throughput distributed order fulfillment.
 * Includes inventory reservation, fraud validation, and multi-tenant ledger persistence.
 */
export class EnterpriseOrderProcessor extends BaseService {
    private readonly auditStream = new Subject<ProcessingMetrics>();
    private readonly cache = new Map<string, TransactionReceipt>();
    private isShuttingDown = false;

    constructor(context: ServiceContext, private readonly ledgerEndpoint: string) {
        super(context);
    }

    public async processOrder(payload: EnterpriseOrderPayload, token: SecurityToken): Promise<TransactionReceipt> {
        if (this.isShuttingDown) throw new Error('Service is terminating');
        this.verifyTokenClaims(token, ['orders:write', 'inventory:reserve']);
        this.validateOrderStructure(payload);

        const startTime = Date.now();
        const existing = this.cache.get(payload.id);
        if (existing) return existing;

        const reserved = await this.reserveInventory(payload.items);
        if (!reserved) throw new Error('Inventory allocation failure');

        const totalUsd = payload.items.reduce((sum, item) => sum + (item.quantity * item.unitPriceUsd), 0);
        const receipt: TransactionReceipt = {
            transactionId: 'txn_' + payload.id,
            status: 'CONFIRMED',
            settledAmountUsd: totalUsd,
            timestamp: Date.now()
        };

        this.cache.set(payload.id, receipt);
        this.auditStream.next({ orderId: payload.id, durationMs: Date.now() - startTime, validationStatus: 'VALID', totalAmountUsd: totalUsd });
        return receipt;
    }

    public async refundOrder(orderId: string, reason: string): Promise<boolean> {
        const order = this.cache.get(orderId);
        if (!order) return false;
        order.status = 'REFUNDED';
        return true;
    }

    private verifyTokenClaims(token: SecurityToken, required: string[]): void {
        if (!token.isValid) throw new Error('Unauthorized');
    }

    private validateOrderStructure(payload: EnterpriseOrderPayload): void {
        if (!payload.id || !payload.clientId || payload.items.length === 0) throw new Error('Malformed order');
    }

    private async reserveInventory(items: EnterpriseOrderPayload['items']): Promise<boolean> {
        return items.every(i => i.quantity > 0 && i.sku.length > 0);
    }
}
        \`;

        // Measure cold parse (bypassing cache)
        const coldRuns = 50;
        let totalColdTime = 0;
        for (let i = 0; i < coldRuns; i++) {
            const start = performance.now();
            pruner.pruneCodeContext(benchmarkCode, 'typescript', { structuralTier: 'T1', bypassCache: true });
            totalColdTime += (performance.now() - start);
        }
        const avgColdTimeMs = totalColdTime / coldRuns;

        // Populate cache
        pruner.pruneCodeContext(benchmarkCode, 'typescript', { structuralTier: 'T1' });

        // Measure warm cached retrieval
        const warmRuns = 200;
        let totalWarmTime = 0;
        for (let i = 0; i < warmRuns; i++) {
            const start = performance.now();
            pruner.pruneCodeContext(benchmarkCode, 'typescript', { structuralTier: 'T1' });
            totalWarmTime += (performance.now() - start);
        }
        const avgWarmTimeMs = totalWarmTime / warmRuns;
        const cpuSavingsPct = ((avgColdTimeMs - avgWarmTimeMs) / avgColdTimeMs) * 100;

        console.log('  Cold Parse Average Latency: ' + avgColdTimeMs.toFixed(4) + ' ms');
        console.log('  Cached Retrieval Latency:   ' + avgWarmTimeMs.toFixed(4) + ' ms (Gate: < 0.05ms)');
        console.log('  Relative Speedup:           ' + (avgColdTimeMs / avgWarmTimeMs).toFixed(1) + 'x faster');
        console.log('  CPU Parse Reduction:        ' + cpuSavingsPct.toFixed(1) + '% (Gate: > 80.0%)');

        const crit2Pass = avgWarmTimeMs < 0.05 && cpuSavingsPct >= 80.0;
        console.log('  Criterion 2 Gate (< 0.05ms retrieval, > 80% CPU savings): ' + (crit2Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 3: Git-Aware Zero-Parsing Rename Recovery
        // -------------------------------------------------------------
        console.log('--- Criterion 3: Git-Aware Zero-Parsing Rename Recovery (< 0.5ms, 0 AST parses) ---');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-bench-rename-'));
        let crit3Pass = false;
        try {
            const oldPath = path.join(tempDir, 'initialService.ts');
            const newPath = path.join(tempDir, 'renamedService.ts');
            fs.writeFileSync(oldPath, benchmarkCode, 'utf8');

            const identity = new WorkspaceIdentity([tempDir]);
            const index = new VersionedWorkspaceIndex([tempDir], pruner, { budgetMB: 10 });

            await index.initialize();
            const preSnap = index.captureSnapshot();
            const oldIdent = identity.identify(oldPath);
            const oldRecord = preSnap.files.get(oldIdent.key);

            let prunerCalled = 0;
            const origPrune = pruner.pruneCodeContext.bind(pruner);
            pruner.pruneCodeContext = (code, lang, opts) => {
                prunerCalled++;
                return origPrune(code, lang, opts);
            };

            fs.renameSync(oldPath, newPath);

            const renameStart = performance.now();
            const ok = await index.rename(oldPath, newPath);
            const renameTimeMs = performance.now() - renameStart;

            pruner.pruneCodeContext = origPrune;

            const postSnap = index.captureSnapshot();
            const newIdent = identity.identify(newPath);
            const newRecord = postSnap.files.get(newIdent.key);

            console.log('  Rename Operation Success:   ' + ok);
            console.log('  Rename Recovery Duration:   ' + renameTimeMs.toFixed(4) + ' ms (Gate: < 0.5ms)');
            console.log('  AST Pruner Calls Invoked:   ' + prunerCalled + ' (Gate: 0)');
            console.log('  Skeleton Transferred:       ' + (newRecord && newRecord.skeleton === oldRecord.skeleton ? 'YES (Intact)' : 'NO'));
            console.log('  Symbols Remapped:           ' + (newRecord && newRecord.symbols[0].file === newIdent.relativePath ? 'YES' : 'NO'));

            crit3Pass = ok && renameTimeMs < 0.5 && prunerCalled === 0 && newRecord && newRecord.skeleton === oldRecord.skeleton;
        } finally {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
        console.log('  Criterion 3 Gate (< 0.5ms, 0 parses): ' + (crit3Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Criterion 4: LRU Eviction & Dual Memory Boundedness
        // -------------------------------------------------------------
        console.log('--- Criterion 4: LRU Eviction & Dual Memory Boundedness ---');
        const boundedCache = new BlobAstCache({ maxEntries: 50, maxMemoryBytes: 64 * 1024 });

        // Insert 150 entries
        for (let i = 0; i < 150; i++) {
            boundedCache.set('key_' + i, {
                prunedCode: 'export const item_' + i + ' = ' + i + ';',
                originalTokenCount: 10,
                prunedTokenCount: 5,
                reductionPercentage: 50,
                language: 'typescript',
                wasPruned: true,
                durationMs: 0.5
            });
        }

        const boundedStats = boundedCache.getStats();
        console.log('  Total Entries Inserted:     150');
        console.log('  Cache Entries Held:         ' + boundedStats.entries + ' (Max: ' + boundedStats.maxEntries + ')');
        console.log('  Total Evictions Executed:   ' + boundedStats.evictions);
        console.log('  Total Memory Consumed:      ' + (boundedStats.memoryBytes / 1024).toFixed(2) + ' KB (Max: ' + (boundedStats.maxMemoryBytes / 1024).toFixed(2) + ' KB)');

        const crit4Pass = boundedStats.entries <= boundedStats.maxEntries &&
                           boundedStats.memoryBytes <= boundedStats.maxMemoryBytes &&
                           boundedStats.evictions >= 100;
        console.log('  Criterion 4 Gate (Capacity strictly bounded with LRU eviction): ' + (crit4Pass ? 'PASSED ✅' : 'FAILED ❌') + '\\n');

        // -------------------------------------------------------------
        // Summary
        // -------------------------------------------------------------
        const allPassed = crit1Pass && crit2Pass && crit3Pass && crit4Pass;
        console.log('====================================================================================');
        if (allPassed) {
            console.log('🎯 ALL PHASE 7 ACCEPTANCE CRITERIA EMPIRICALLY VERIFIED AND PASSED ✅');
        } else {
            console.log('❌ ONE OR MORE CRITERIA FAILED TO PASS GATES');
        }
        console.log('====================================================================================\\n');

        return allPassed;
    }
    `;

    const entryPath = path.join(__dirname, '..', 'out_test', '_phase7_verification_entry.ts');
    fs.writeFileSync(entryPath, harnessSource);

    try {
        await esbuild.build({
            entryPoints: [entryPath],
            bundle: true,
            outfile: tempBundlePath,
            platform: 'node',
            target: 'node20',
            alias: {
                'vscode': path.join(__dirname, '..', 'tests', 'mock-vscode.ts')
            },
            external: ['web-tree-sitter'],
            format: 'cjs'
        });

        const { runVerification } = require(tempBundlePath);
        const success = await runVerification();
        if (!success) {
            process.exit(1);
        }
    } finally {
        if (fs.existsSync(entryPath)) fs.unlinkSync(entryPath);
        if (fs.existsSync(tempBundlePath)) fs.unlinkSync(tempBundlePath);
    }
}

main().catch(err => {
    console.error('Verification harness execution error:', err);
    process.exit(1);
});
