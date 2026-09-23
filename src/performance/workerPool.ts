/**
 * Tokonomics 7.0 Task Worker Pool & Resilient Event Loop Boundary
 * 
 * Provides a persistent, pre-warmed pool of Node.js Worker threads to isolate
 * CPU-intensive operations (PageRank RepoMap, Knapsack DP, AST pruning, and image rightsizing)
 * from the single-threaded VS Code Extension Host.
 * 
 * Architecture:
 * - Dynamic pool sizing: min(max(1, CPUs - 1), 4)
 * - Zero cold-start latency: workers pre-spawned and kept warm across operations
 * - Resilient worker recycling: automatic replacement on unhandled worker crash or termination
 * - Cooperative cancellation: cleanly terminates executing worker on cancellation and spins up a fresh worker
 * - In-process fallback: transparently falls back to microtask-sliced synchronous execution in restricted environments
 */

import * as os from 'os';
import { WorkCancellation, WorkCancelledError, WorkQueueFullError } from './boundedScheduler';
import { ContextKnapsackSolver, SolverResult, KnapsackSolverParams } from '../solver/knapsackSolver';
import { AstPruneResult } from '../ast/types';
import { WorkspaceRankInput, RankedWorkspaceSymbol } from './cpuWorkerBoundary';

export type WorkerOperation =
    | 'rank-workspace'
    | 'inline-images'
    | 'knapsack-solve'
    | 'ast-prune'
    | 'batch-ast-prune'
    | 'ping';

export interface WorkerTaskRequest {
    id: string;
    operation: WorkerOperation;
    payload: unknown;
}

export interface WorkerTaskResponse {
    id: string;
    success: boolean;
    result?: unknown;
    error?: string;
    durationMs?: number;
}

export interface WorkerPoolStats {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    queuedTasks: number;
    completedTasks: number;
    failedTasks: number;
    recycledWorkers: number;
    inProcessFallback: boolean;
}

export interface TaskWorkerPoolOptions {
    minWorkers?: number;
    maxWorkers?: number;
    taskTimeoutMs?: number;
    maxInputBytes?: number;
    forceInProcess?: boolean;
    maxQueuedTasks?: number;
    maxQueuedBytes?: number;
    idleShrinkMs?: number;
}

interface QueuedTask {
    id: string;
    operation: WorkerOperation;
    payload: unknown;
    cancellation?: WorkCancellation;
    timeoutMs: number;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    enqueuedAt: number;
    inputBytes: number;
}

interface ActiveWorkerEntry {
    worker: import('worker_threads').Worker;
    workerId: number;
    busy: boolean;
    currentTask?: QueuedTask;
    currentTimeoutTimer?: NodeJS.Timeout;
    cancellationDisposable?: { dispose(): void };
    retiring?: boolean;
}

/**
 * Self-contained Worker script executed inside background Node.js Worker threads.
 * Uses CommonJS require from 'worker_threads'.
 */
export const WORKER_THREAD_SOURCE = `
const { parentPort } = require('worker_threads');

// -----------------------------------------------------------------------------
// Operation 1: Image Rightsizing
// -----------------------------------------------------------------------------
function handleInlineImages(payload) {
    const { text, config } = payload;
    let originalBytes = 0, compressedBytes = 0, processedCount = 0;
    const regex = /data:image\\/(png|jpeg|jpg|gif|webp|bmp);base64,([A-Za-z0-9+/=]{1000,})/g;
    const processed = text.replace(regex, (match, format, base64Data) => {
        try {
            const bytes = Buffer.from(base64Data, 'base64').length;
            originalBytes += bytes;
            if (bytes < 200 * 1024 || config.preserveVisualData) {
                compressedBytes += bytes;
                return match;
            }
            processedCount++;
            const target = Math.round(config.maxDimension * config.maxDimension * 3 * (config.quality / 100));
            compressedBytes += Math.min(bytes, target);
            return '[Optimized Image Context: ' + format + ' (' + Math.round(bytes / 1024) + 'KB) - bounds constrained to ' + config.maxDimension + 'px]';
        } catch {
            compressedBytes += base64Data.length;
            return match;
        }
    });
    const saved = originalBytes - compressedBytes;
    return {
        text: processed,
        stats: {
            originalBytes,
            compressedBytes,
            reductionPercentage: originalBytes ? Math.round(saved / originalBytes * 100) : 0,
            estimatedTokensSaved: Math.round(saved / 1.5),
            wasProcessed: processedCount > 0
        }
    };
}

// -----------------------------------------------------------------------------
// Operation 2: PageRank Workspace Ranking (12 Iterations)
// -----------------------------------------------------------------------------
function handleRankWorkspace(payload) {
    const { files, activeKeys } = payload;
    const active = new Set(activeKeys || []);
    const owners = new Map();
    for (const file of files) {
        for (const symbol of file.symbols) {
            const list = owners.get(symbol.name) || [];
            list.push(file.key);
            owners.set(symbol.name, list);
        }
    }
    const outgoing = new Map();
    for (const file of files) {
        const targets = new Set();
        for (const reference of file.references) {
            for (const owner of owners.get(reference) || []) {
                if (owner !== file.key) targets.add(owner);
            }
        }
        outgoing.set(file.key, targets);
    }
    const keys = files.map(file => file.key);
    let scores = new Map(keys.map(key => [key, active.has(key) ? 10 : 1]));
    for (let iteration = 0; iteration < 12; iteration++) {
        const next = new Map(keys.map(key => [key, active.has(key) ? 1 : 0.15]));
        for (const key of keys) {
            const targets = outgoing.get(key) || new Set();
            if (!targets.size) continue;
            const share = (scores.get(key) || 0) * 0.85 / targets.size;
            for (const target of targets) {
                next.set(target, (next.get(target) || 0) + share);
            }
        }
        scores = next;
    }
    const pathToKey = new Map(files.map(file => [file.relativePath, file.key]));
    const ranked = files.flatMap(file => file.symbols.map(symbol => ({
        ...symbol,
        score: scores.get(pathToKey.get(symbol.file) || file.key) || 0
    }))).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
    return ranked;
}

// -----------------------------------------------------------------------------
// Operation 3: Pure AST Pruning & Slicing
// -----------------------------------------------------------------------------
function countSimpleTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

function handleAstPrune(payload) {
    const { code, language } = payload;
    if (!code) {
        return {
            originalTokens: 0,
            prunedTokens: 0,
            compressionRatio: 1,
            originalCode: '',
            prunedCode: '',
            language: language || 'text',
            symbolsFound: 0,
            executionTimeMs: 0
        };
    }
    const start = Date.now();
    const lines = code.split('\\n');
    const prunedLines = [];
    let insideBody = false;
    let braceDepth = 0;
    let symbolsFound = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Structural declarations to preserve
        if (/^(export\\s+)?(default\\s+)?(class|interface|type|enum|function|const|let|var|import|package|namespace)\\b/.test(trimmed) ||
            /^(public|private|protected|static|readonly|async|override)\\b/.test(trimmed) ||
            /^(def|class|async\\s+def)\\b/.test(trimmed)) {
            prunedLines.push(line);
            symbolsFound++;
            if (trimmed.includes('{')) braceDepth += (trimmed.match(/\\{/g) || []).length;
            if (trimmed.includes('}')) braceDepth -= (trimmed.match(/\\}/g) || []).length;
            if (braceDepth > 0) insideBody = true;
            continue;
        }

        if (insideBody) {
            if (trimmed.includes('{')) braceDepth += (trimmed.match(/\\{/g) || []).length;
            if (trimmed.includes('}')) braceDepth -= (trimmed.match(/\\}/g) || []).length;
            if (braceDepth <= 0) {
                insideBody = false;
                prunedLines.push(line);
            } else if (prunedLines[prunedLines.length - 1] !== '    // ... [body pruned for token optimization]') {
                prunedLines.push('    // ... [body pruned for token optimization]');
            }
            continue;
        }

        // Keep comments with @ or interface notes, skip generic comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            if (trimmed.includes('@') || trimmed.includes('TODO') || trimmed.includes('FIXME')) {
                prunedLines.push(line);
            }
            continue;
        }

        if (trimmed.length > 0 && !insideBody) {
            prunedLines.push(line);
        }
    }

    const prunedCode = prunedLines.join('\\n');
    const origTokens = countSimpleTokens(code);
    const prunTokens = countSimpleTokens(prunedCode);
    return {
        originalTokens: origTokens,
        prunedTokens: prunTokens,
        compressionRatio: origTokens > 0 ? (origTokens - prunTokens) / origTokens : 0,
        originalCode: code,
        prunedCode,
        language: language || 'typescript',
        symbolsFound,
        executionTimeMs: Date.now() - start
    };
}

// -----------------------------------------------------------------------------
// Operation 4: 0-1 Multi-Choice Knapsack DP Solver with FinOps Economics
// -----------------------------------------------------------------------------
function countWorkerTokens(text) {
    if (!text || text.length === 0) return 0;
    const len = text.length;
    if (len > 10000) {
        let punctuationCount = 0;
        const sampleSize = Math.min(len, 2000);
        for (let i = 0; i < sampleSize; i++) {
            const code = text.charCodeAt(i);
            if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) {
                punctuationCount++;
            }
        }
        const puncRatio = punctuationCount / sampleSize;
        const divisor = puncRatio > 0.15 ? 3.6 : 4.2;
        return Math.max(1, Math.round(len / divisor));
    }
    const regex = /[\\p{L}\\p{N}]+|[^\\s\\p{L}\\p{N}]+|\\s+/gu;
    let tokens = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const chunk = match[0];
        const cLen = chunk.length;
        const c0 = chunk.charCodeAt(0);
        if (c0 <= 32) {
            tokens += Math.max(1, Math.floor(cLen / 6));
        } else if (c0 >= 48 && c0 <= 57) {
            tokens += Math.ceil(cLen / 3.0);
        } else if ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95 || c0 === 36) {
            if (cLen <= 6) tokens += 1;
            else if (cLen <= 11) tokens += 2;
            else if (cLen <= 18) tokens += 3;
            else tokens += Math.ceil(cLen / 4.2);
        } else {
            tokens += Math.ceil(cLen / 2.8);
        }
    }
    return Math.max(1, tokens);
}

function pruneDominatedWorkerOptions(options) {
    if (options.length <= 1) return options;
    options.sort((a, b) => {
        if (a.tokens !== b.tokens) return a.tokens - b.tokens;
        return b.netScore - a.netScore;
    });
    const pruned = [];
    let maxScoreSeen = -Infinity;
    for (let j = 0; j < options.length; j++) {
        const opt = options[j];
        if (pruned.length > 0 && opt.tokens === pruned[pruned.length - 1].tokens) continue;
        if (opt.netScore <= maxScoreSeen) continue;
        pruned.push(opt);
        maxScoreSeen = opt.netScore;
    }
    return pruned.length > 0 ? pruned : [options[0]];
}

function handleKnapsackSolve(payload) {
    const startTime = Date.now();
    const budget = Math.max(0, payload.tokenBudget);
    const maxRisk = payload.maxRisk !== undefined ? payload.maxRisk : 1.0;
    const lambdaCache = payload.lambdaCache !== undefined ? payload.lambdaCache : 0.2;
    const lambdaCost = payload.lambdaCost !== undefined ? payload.lambdaCost : 0.005;
    const lambdaRisk = payload.lambdaRisk !== undefined ? payload.lambdaRisk : 0.5;

    const BUNDLED_PRICES = [
        { provider: 'anthropic', modelId: 'claude-3-7-sonnet', aliases: ['claude-3-5-sonnet'], input: 3, output: 15, cacheRead: 0.30 },
        { provider: 'anthropic', modelId: 'claude-opus-4', aliases: [], input: 15, output: 75, cacheRead: 1.50 },
        { provider: 'openai', modelId: 'gpt-4o', aliases: [], input: 2.50, output: 10, cacheRead: 1.25 },
        { provider: 'deepseek', modelId: 'deepseek-chat', aliases: ['deepseek-reasoner'], input: 0.14, output: 0.28, cacheRead: 0.014 },
        { provider: 'google', modelId: 'gemini-2.5-pro', aliases: ['gemini-1.5-pro'], input: 1.25, output: 5, cacheRead: 0.3125 },
        { provider: 'generic', modelId: 'generic-llm', aliases: ['generic'], input: 2, output: 6, cacheRead: 1.0 }
    ];

    let pricingEntry = null;
    if (payload.pricingEntry && payload.pricingEntry.rates) {
        pricingEntry = {
            rates: payload.pricingEntry.rates,
            modelId: payload.pricingEntry.modelId || 'custom-model',
            provider: payload.pricingEntry.provider || 'custom-provider'
        };
    } else {
        const needle = (payload.modelId || 'generic-llm').toLowerCase().trim();
        const providerNeedle = (payload.provider || '').toLowerCase().trim();
        const matched = BUNDLED_PRICES.find(c =>
            (!providerNeedle || c.provider === providerNeedle) &&
            (needle === c.modelId || needle.startsWith(c.modelId + '-') ||
                c.aliases.some(a => needle === a || needle.startsWith(a + '-')))
        ) || BUNDLED_PRICES.find(c => c.modelId === 'generic-llm');

        pricingEntry = {
            rates: {
                inputCostPer1M: matched.input,
                outputCostPer1M: matched.output,
                cachedInputCostPer1M: matched.cacheRead
            },
            modelId: matched.modelId,
            provider: matched.provider
        };
    }

    const inputRate = pricingEntry.rates.inputCostPer1M;
    const outputRate = pricingEntry.rates.outputCostPer1M;
    const cachedInputRate = pricingEntry.rates.cachedInputCostPer1M !== undefined ? pricingEntry.rates.cachedInputCostPer1M : (inputRate * 0.5);

    const refInputRate = payload.referenceInputRate !== undefined ? payload.referenceInputRate : 3.00;
    const refOutputRate = payload.referenceOutputRate !== undefined ? payload.referenceOutputRate : 15.00;
    const priceFactorInput = Math.max(0.001, inputRate / refInputRate);
    const priceFactorOutput = Math.max(0.001, outputRate / refOutputRate);
    const effectiveLambdaRisk = lambdaRisk * priceFactorOutput;

    const RESOLUTION_LEVELS = ['R_exclude', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5'];

    const solverCandidates = (payload.candidates || []).map(e => {
        const baseUtil = (typeof e.baseUtility === 'number' && Number.isFinite(e.baseUtility)) ? e.baseUtility : 1.0;
        const meta = e.metadata || {};
        const normalizedMeta = {
            provenance: meta.provenance || (e.provenanceOrigin ? [e.provenanceOrigin] : ['request']),
            renderLocation: meta.renderLocation || 'evidence',
            mandatory: meta.mandatory === true,
            minimumResolution: meta.minimumResolution || 'R0',
            dependencies: meta.dependencies || [],
            conflicts: meta.conflicts || [],
            freshness: meta.freshness || 'request',
            sensitivity: meta.sensitivity || 'workspace',
            transformationHistory: meta.transformationHistory || ['ingested']
        };

        const resolutions = {};
        resolutions['R_exclude'] = { level: 'R_exclude', text: '', tokenCount: 0, utility: 0.0, risk: 0.0, metadata: normalizedMeta };

        const r0Text = '// [Ref: ' + (e.filePath || '') + ':' + (e.symbolName || '') + ']';
        resolutions['R0'] = { level: 'R0', text: r0Text, tokenCount: countWorkerTokens(r0Text), utility: baseUtil * 0.15, risk: 0.40, metadata: normalizedMeta };

        let r1Text = '';
        if (e.kind === 'class') r1Text = 'class ' + e.symbolName + ' { /* ... */ }';
        else if (e.kind === 'interface') r1Text = 'interface ' + e.symbolName + ' { /* ... */ }';
        else if (e.kind === 'function') r1Text = 'function ' + e.symbolName + '(...): any;';
        else r1Text = 'type ' + e.symbolName + ' = any;';
        resolutions['R1'] = { level: 'R1', text: r1Text, tokenCount: countWorkerTokens(r1Text), utility: baseUtil * 0.35, risk: 0.25, metadata: normalizedMeta };

        const doc = e.docstring ? (e.docstring + '\\n') : '';
        const sigs = (e.signatures || []).join('\\n');
        const r2Text = doc + sigs;
        resolutions['R2'] = { level: 'R2', text: r2Text, tokenCount: countWorkerTokens(r2Text), utility: baseUtil * 0.75, risk: 0.08, metadata: normalizedMeta };

        const stubs = e.calleeStubs && e.calleeStubs.length > 0 ? ('\\n  // Key Dependencies Invoked:\\n  // ' + e.calleeStubs.join('\\n  // ')) : '';
        const r3Text = doc + sigs + stubs;
        resolutions['R3'] = { level: 'R3', text: r3Text, tokenCount: countWorkerTokens(r3Text), utility: baseUtil * 0.88, risk: 0.04, metadata: normalizedMeta };

        const r4Text = e.slicedCode && e.slicedCode.trim().length > 0 ? e.slicedCode : (e.fullCode || '');
        resolutions['R4'] = { level: 'R4', text: r4Text, tokenCount: countWorkerTokens(r4Text), utility: baseUtil * 0.96, risk: 0.02, metadata: normalizedMeta };

        const r5Text = e.fullCode || '';
        resolutions['R5'] = { level: 'R5', text: r5Text, tokenCount: countWorkerTokens(r5Text), utility: baseUtil * 1.0, risk: 0.0, metadata: normalizedMeta };

        const isCacheEligible = (e.filePath || '').includes('types') || (e.filePath || '').includes('interface');

        return {
            entity: e,
            metadata: normalizedMeta,
            resolutions,
            isCacheEligible
        };
    });

    let hasAnyConstraints = false;
    for (let i = 0; i < solverCandidates.length; i++) {
        const meta = solverCandidates[i].metadata;
        if (meta && (meta.mandatory || (meta.dependencies && meta.dependencies.length > 0) || (meta.conflicts && meta.conflicts.length > 0))) {
            hasAnyConstraints = true;
            break;
        }
    }

    const excludedByConflict = new Set();
    const mandatoryIds = new Set();

    if (hasAnyConstraints) {
        const byId = new Map(solverCandidates.map(c => [c.entity.id, c]));
        for (const c of solverCandidates) {
            if (c.metadata.mandatory) mandatoryIds.add(c.entity.id);
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const id of [...mandatoryIds]) {
                const candidate = byId.get(id);
                if (!candidate) continue;
                for (const dependency of candidate.metadata.dependencies) {
                    if (!byId.has(dependency)) throw new Error('Mandatory entity ' + id + ' depends on missing entity ' + dependency + '.');
                    if (!mandatoryIds.has(dependency)) { mandatoryIds.add(dependency); changed = true; }
                }
            }
        }
        for (const id of mandatoryIds) {
            const candidate = byId.get(id);
            if (!candidate) continue;
            for (const conflict of candidate.metadata.conflicts) {
                if (mandatoryIds.has(conflict)) throw new Error('Mandatory entities ' + id + ' and ' + conflict + ' conflict.');
            }
        }
        const processedConflicts = new Set();
        for (const candidate of solverCandidates) {
            const id = candidate.entity.id;
            for (const conflict of candidate.metadata.conflicts) {
                const other = byId.get(conflict);
                const pairKey = [id, conflict].sort().join('\\0');
                if (!other || processedConflicts.has(pairKey)) continue;
                processedConflicts.add(pairKey);
                const candBaseUtil = (typeof candidate.entity.baseUtility === 'number' && Number.isFinite(candidate.entity.baseUtility)) ? candidate.entity.baseUtility : 1.0;
                const otherBaseUtil = (typeof other.entity.baseUtility === 'number' && Number.isFinite(other.entity.baseUtility)) ? other.entity.baseUtility : 1.0;
                const loser = mandatoryIds.has(id) ? conflict : mandatoryIds.has(conflict) ? id
                    : candBaseUtil >= otherBaseUtil ? conflict : id;
                excludedByConflict.add(loser);
            }
        }
    }

    const candidateOptions = [];
    let totalOptionsCount = 0;
    let prunedOptionsCount = 0;

    for (const cand of solverCandidates) {
        const rawOptions = [];
        const metadata = cand.metadata;
        const minimumIndex = RESOLUTION_LEVELS.indexOf(metadata.minimumResolution);
        const isExcluded = excludedByConflict.has(cand.entity.id);
        const isMandatory = mandatoryIds.has(cand.entity.id);

        for (const level of RESOLUTION_LEVELS) {
            const res = cand.resolutions[level];
            if (!res) continue;
            if (isExcluded && level !== 'R_exclude') continue;
            if (isMandatory && (level === 'R_exclude' || RESOLUTION_LEVELS.indexOf(level) < minimumIndex)) continue;

            const isOptionCached = cand.isCacheEligible && (level === 'R2' || level === 'R5');
            const cacheBonus = isOptionCached ? 15.0 : 0.0;
            const optionCostFactor = isOptionCached ? (cachedInputRate / refInputRate) : priceFactorInput;
            const costPenalty = res.tokenCount * lambdaCost * optionCostFactor;
            const riskPenalty = res.risk * 50.0 * effectiveLambdaRisk;
            const netScore = level === 'R_exclude' ? 0.0 : Math.max(0.01, res.utility + cacheBonus * lambdaCache - costPenalty - riskPenalty);

            rawOptions.push({
                entityId: cand.entity.id,
                level,
                tokens: res.tokenCount,
                utility: res.utility,
                risk: res.risk,
                netScore: Math.round(netScore * 100) / 100,
                rendered: res
            });
        }

        if (rawOptions.length === 0) throw new Error('Entity ' + cand.entity.id + ' has no allowed representation.');

        totalOptionsCount += rawOptions.length;
        const pruned = pruneDominatedWorkerOptions(rawOptions);
        prunedOptionsCount += (rawOptions.length - pruned.length);
        candidateOptions.push(pruned);
    }

    const bucketSize = budget > 10000 
        ? Math.max(10, Math.ceil(budget / 250)) 
        : (budget > 4000 ? 10 : 1);
    const numBuckets = Math.floor(budget / bucketSize);
    const stride = numBuckets + 1;

    let dp = new Float64Array(stride).fill(-1);
    let nextDp = new Float64Array(stride).fill(-1);
    dp[0] = 0;

    const numCandidates = candidateOptions.length;
    const backtrack = new Uint8Array(numCandidates * stride);
    let maxReachableB = 0;

    const optBuckets = new Int32Array(8);
    const optScores = new Float64Array(8);

    for (let i = 0; i < numCandidates; i++) {
        const options = candidateOptions[i];
        const numOpts = options.length;
        for (let o = 0; o < numOpts; o++) {
            optBuckets[o] = Math.ceil(options[o].tokens / bucketSize);
            optScores[o] = options[o].netScore;
        }

        nextDp.fill(-1);
        const backtrackOffset = i * stride;
        let nextMaxReachableB = maxReachableB;
        let hasAnyValid = false;

        for (let b = 0; b <= maxReachableB; b++) {
            const scoreB = dp[b];
            if (scoreB < 0) continue;

            for (let optIdx = 0; optIdx < numOpts; optIdx++) {
                const newB = b + optBuckets[optIdx];
                if (newB <= numBuckets) {
                    const newScore = scoreB + optScores[optIdx];
                    if (newScore > nextDp[newB]) {
                        nextDp[newB] = newScore;
                        backtrack[backtrackOffset + newB] = optIdx;
                        if (newB > nextMaxReachableB) nextMaxReachableB = newB;
                        hasAnyValid = true;
                    }
                }
            }
        }

        if (!hasAnyValid) {
            throw new Error('Mandatory representations exceed the ' + budget + '-token candidate budget.');
        }

        maxReachableB = nextMaxReachableB;
        const tmp = dp;
        dp = nextDp;
        nextDp = tmp;
    }

    let bestB = 0;
    let maxScore = -1;
    for (let b = 0; b <= numBuckets; b++) {
        if (dp[b] > maxScore) {
            maxScore = dp[b];
            bestB = b;
        }
    }

    const assignments = [];
    let currentB = bestB;
    let totalTokens = 0;
    let totalUtility = 0;
    let totalRisk = 0;
    let excludedCount = 0;
    let includedCount = 0;

    for (let i = numCandidates - 1; i >= 0; i--) {
        const options = candidateOptions[i];
        const chosenOptIdx = backtrack[i * stride + currentB];
        const chosenOpt = options[chosenOptIdx];

        assignments.push([chosenOpt.entityId, chosenOpt.rendered]);
        totalTokens += chosenOpt.tokens;
        totalUtility += chosenOpt.utility;
        totalRisk += chosenOpt.risk;

        if (chosenOpt.level === 'R_exclude') excludedCount++;
        else includedCount++;

        const optBucketsCount = Math.ceil(chosenOpt.tokens / bucketSize);
        currentB = Math.max(0, currentB - optBucketsCount);
    }
    assignments.reverse();

    let baselineTokens = 0;
    for (const cand of solverCandidates) {
        const r5 = cand.resolutions['R5'];
        baselineTokens += r5 ? r5.tokenCount : (cand.resolutions['R3'] ? cand.resolutions['R3'].tokenCount : 0);
    }

    let totalCachedTokens = 0;
    for (let a = 0; a < assignments.length; a++) {
        const id = assignments[a][0];
        const res = assignments[a][1];
        const cand = solverCandidates.find(c => c.entity.id === id);
        if (cand && cand.isCacheEligible && (res.level === 'R2' || res.level === 'R5')) {
            totalCachedTokens += res.tokenCount;
        }
    }
    const nonCachedTokens = Math.max(0, totalTokens - totalCachedTokens);

    const projectedBaselineCostUSD = Number(((baselineTokens / 1_000_000) * inputRate).toFixed(6));
    const projectedCostUSD = Number((
        (nonCachedTokens / 1_000_000) * inputRate +
        (totalCachedTokens / 1_000_000) * cachedInputRate
    ).toFixed(6));
    const netDollarSavingsUSD = Number(Math.max(0, projectedBaselineCostUSD - projectedCostUSD).toFixed(6));

    let baselineUtility = 0;
    for (const cand of solverCandidates) {
        const r5Util = cand.resolutions['R5'] ? cand.resolutions['R5'].utility : (cand.resolutions['R3'] ? cand.resolutions['R3'].utility : 100.0);
        baselineUtility += r5Util;
    }
    const qualityPreservedScore = baselineUtility > 0
        ? Number(Math.min(1.0, totalUtility / baselineUtility).toFixed(4))
        : 1.0;

    if (payload.minQualityScore !== undefined && qualityPreservedScore < payload.minQualityScore) {
        throw new Error('Quality preservation constraint violated: achieved ' + qualityPreservedScore + ' < required ' + payload.minQualityScore);
    }

    const optimalityGuarantee = bucketSize === 1 ? 'token_exact_global_optimum' : 'quantized_bucket_optimum';
    const maxDiscretizationErrorTokens = numCandidates * bucketSize;

    return {
        assignments,
        totalTokens,
        totalUtility: Math.round(totalUtility * 10) / 10,
        totalRisk: Math.round((totalRisk / (includedCount || 1)) * 100) / 100,
        excludedCount,
        includedCount,
        executionTimeMs: Date.now() - startTime,
        projectedCostUSD,
        projectedBaselineCostUSD,
        netDollarSavingsUSD,
        effectiveInputRatePer1M: inputRate,
        effectiveOutputRatePer1M: outputRate,
        pricingModelId: pricingEntry.modelId,
        pricingProvider: pricingEntry.provider,
        prunedOptionsCount,
        totalOptionsCount,
        optimalityGuarantee,
        bucketSize,
        maxDiscretizationErrorTokens,
        qualityPreservedScore
    };
}

// -----------------------------------------------------------------------------
// Main Worker Dispatch Loop
// -----------------------------------------------------------------------------
parentPort.on('message', request => {
    if (!request || !request.id) return;
    const { id, operation, payload } = request;
    const start = Date.now();

    try {
        let result;
        if (operation === 'inline-images') {
            result = handleInlineImages(payload);
        } else if (operation === 'rank-workspace') {
            result = handleRankWorkspace(payload);
        } else if (operation === 'ast-prune') {
            result = handleAstPrune(payload);
        } else if (operation === 'batch-ast-prune') {
            const items = payload.items || [];
            result = items.map(item => handleAstPrune(item));
        } else if (operation === 'knapsack-solve') {
            result = handleKnapsackSolve(payload);
        } else if (operation === 'ping') {
            result = 'pong';
        } else {
            throw new Error('UNKNOWN_WORKER_OPERATION: ' + operation);
        }

        parentPort.postMessage({
            id,
            success: true,
            result,
            durationMs: Date.now() - start
        });
    } catch (err) {
        parentPort.postMessage({
            id,
            success: false,
            error: err && err.message ? err.message : String(err),
            durationMs: Date.now() - start
        });
    }
});
`;

function inProcessInlineImages(payload: any) {
    const { text, config } = payload;
    let originalBytes = 0, compressedBytes = 0, processedCount = 0;
    const regex = /data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,([A-Za-z0-9+/=]{1000,})/g;
    const processed = text.replace(regex, (match: string, format: string, base64Data: string) => {
        try {
            const bytes = Buffer.from(base64Data, 'base64').length;
            originalBytes += bytes;
            if (bytes < 200 * 1024 || config.preserveVisualData) {
                compressedBytes += bytes;
                return match;
            }
            processedCount++;
            const target = Math.round(config.maxDimension * config.maxDimension * 3 * (config.quality / 100));
            compressedBytes += Math.min(bytes, target);
            return `[Optimized Image Context: ${format} (${Math.round(bytes / 1024)}KB) - bounds constrained to ${config.maxDimension}px]`;
        } catch {
            compressedBytes += base64Data.length;
            return match;
        }
    });
    const saved = originalBytes - compressedBytes;
    return {
        text: processed,
        stats: {
            originalBytes,
            compressedBytes,
            reductionPercentage: originalBytes ? Math.round(saved / originalBytes * 100) : 0,
            estimatedTokensSaved: Math.round(saved / 1.5),
            wasProcessed: processedCount > 0
        }
    };
}

function inProcessRankWorkspace(payload: any) {
    const { files, activeKeys } = payload;
    const active = new Set(activeKeys || []);
    const owners = new Map<string, string[]>();
    for (const file of files) {
        for (const symbol of file.symbols) {
            const list = owners.get(symbol.name) || [];
            list.push(file.key);
            owners.set(symbol.name, list);
        }
    }
    const outgoing = new Map<string, Set<string>>();
    for (const file of files) {
        const targets = new Set<string>();
        for (const reference of file.references) {
            for (const owner of owners.get(reference) || []) {
                if (owner !== file.key) targets.add(owner);
            }
        }
        outgoing.set(file.key, targets);
    }
    const keys = files.map((file: any) => file.key);
    let scores = new Map<string, number>(keys.map((key: string) => [key, active.has(key) ? 10 : 1]));
    for (let iteration = 0; iteration < 12; iteration++) {
        const next = new Map<string, number>(keys.map((key: string) => [key, active.has(key) ? 1 : 0.15]));
        for (const key of keys) {
            const targets = outgoing.get(key) || new Set();
            if (!targets.size) continue;
            const share = (scores.get(key) || 0) * 0.85 / targets.size;
            for (const target of targets) {
                next.set(target, (next.get(target) || 0) + share);
            }
        }
        scores = next;
    }
    const pathToKey = new Map(files.map((file: any) => [file.relativePath, file.key]));
    const ranked = files.flatMap((file: any) => file.symbols.map((symbol: any) => ({
        ...symbol,
        score: scores.get(pathToKey.get(symbol.file) || file.key) || 0
    }))).sort((a: any, b: any) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
    return ranked;
}

function inProcessCountTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

function inProcessAstPrune(payload: any) {
    const { code, language } = payload;
    if (!code) {
        return {
            originalTokens: 0,
            prunedTokens: 0,
            compressionRatio: 1,
            originalCode: '',
            prunedCode: '',
            language: language || 'text',
            symbolsFound: 0,
            executionTimeMs: 0
        };
    }
    const start = Date.now();
    const lines = code.split('\n');
    const prunedLines: string[] = [];
    let insideBody = false;
    let braceDepth = 0;
    let symbolsFound = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (/^(export\s+)?(default\s+)?(class|interface|type|enum|function|const|let|var|import|package|namespace)\b/.test(trimmed) ||
            /^(public|private|protected|static|readonly|async|override)\b/.test(trimmed) ||
            /^(def|class|async\s+def)\b/.test(trimmed)) {
            prunedLines.push(line);
            symbolsFound++;
            if (trimmed.includes('{')) braceDepth += (trimmed.match(/\{/g) || []).length;
            if (trimmed.includes('}')) braceDepth -= (trimmed.match(/\}/g) || []).length;
            if (braceDepth > 0) insideBody = true;
            continue;
        }

        if (insideBody) {
            if (trimmed.includes('{')) braceDepth += (trimmed.match(/\{/g) || []).length;
            if (trimmed.includes('}')) braceDepth -= (trimmed.match(/\}/g) || []).length;
            if (braceDepth <= 0) {
                insideBody = false;
                prunedLines.push(line);
            } else if (prunedLines[prunedLines.length - 1] !== '    // ... [body pruned for token optimization]') {
                prunedLines.push('    // ... [body pruned for token optimization]');
            }
            continue;
        }

        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            if (trimmed.includes('@') || trimmed.includes('TODO') || trimmed.includes('FIXME')) {
                prunedLines.push(line);
            }
            continue;
        }

        if (trimmed.length > 0 && !insideBody) {
            prunedLines.push(line);
        }
    }

    const prunedCode = prunedLines.join('\n');
    const origTokens = inProcessCountTokens(code);
    const prunTokens = inProcessCountTokens(prunedCode);
    return {
        originalTokens: origTokens,
        prunedTokens: prunTokens,
        compressionRatio: origTokens > 0 ? (origTokens - prunTokens) / origTokens : 0,
        originalCode: code,
        prunedCode,
        language: language || 'typescript',
        symbolsFound,
        executionTimeMs: Date.now() - start
    };
}

function inProcessKnapsackSolve(payload: any) {
    const solver = new ContextKnapsackSolver();
    const result = solver.solve(payload);
    return {
        ...result,
        assignments: Array.from(result.assignments.entries())
    };
}

export class TaskWorkerPool {
    private static instance: TaskWorkerPool | null = null;
    private workers: ActiveWorkerEntry[] = [];
    private taskQueue: QueuedTask[] = [];
    private completedCount = 0;
    private failedCount = 0;
    private recycledCount = 0;
    private nextWorkerId = 1;
    private nextTaskId = 1;
    private disposed = false;
    private inProcessMode = false;
    private initialized = false;
    private queuedBytes = 0;
    private shrinkTimer?: NodeJS.Timeout;

    private readonly minWorkers: number;
    private readonly maxWorkers: number;
    private readonly defaultTimeoutMs: number;
    private readonly maxInputBytes: number;
    private readonly maxQueuedTasks: number;
    private readonly maxQueuedBytes: number;
    private readonly idleShrinkMs: number;

    constructor(options: TaskWorkerPoolOptions = {}) {
        const cpus = os.cpus()?.length || 4;
        this.maxWorkers = options.maxWorkers ?? Math.min(Math.max(1, cpus - 1), 4);
        this.minWorkers = options.minWorkers ?? Math.min(1, this.maxWorkers);
        this.defaultTimeoutMs = options.taskTimeoutMs ?? 30_000;
        this.maxInputBytes = options.maxInputBytes ?? 32 * 1024 * 1024;
        this.inProcessMode = Boolean(options.forceInProcess);
        this.initialized = this.inProcessMode;
        this.maxQueuedTasks = Math.max(1, options.maxQueuedTasks ?? 64);
        this.maxQueuedBytes = Math.max(this.maxInputBytes, options.maxQueuedBytes ?? 64 * 1024 * 1024);
        this.idleShrinkMs = Math.max(10, options.idleShrinkMs ?? 30_000);
        if (this.minWorkers < 0 || this.maxWorkers < 1 || this.minWorkers > this.maxWorkers) throw new Error('Invalid worker bounds.');
    }

    public static getSharedInstance(): TaskWorkerPool {
        if (!TaskWorkerPool.instance || TaskWorkerPool.instance.disposed) {
            TaskWorkerPool.instance = new TaskWorkerPool();
        }
        return TaskWorkerPool.instance;
    }

    private initializePool(): void {
        if (this.initialized) return;
        this.initialized = true;
        try {
            // Test if worker_threads is supported and functional
            const { Worker } = require('worker_threads');
            for (let i = 0; i < this.minWorkers; i++) {
                this.spawnWorker(Worker);
            }
        } catch (err) {
            // Environment cannot instantiate Worker threads -> fallback to in-process execution
            this.inProcessMode = true;
        }
    }

    private spawnWorker(WorkerConstructor: typeof import('worker_threads').Worker): ActiveWorkerEntry {
        const workerId = this.nextWorkerId++;
        const worker = new WorkerConstructor(WORKER_THREAD_SOURCE, {
            eval: true,
            resourceLimits: {
                maxOldGenerationSizeMb: 128,
                maxYoungGenerationSizeMb: 32
            }
        });

        const entry: ActiveWorkerEntry = {
            worker,
            workerId,
            busy: false
        };

        worker.on('message', (response: WorkerTaskResponse) => {
            this.handleWorkerResponse(entry, response);
        });

        worker.on('error', (err: Error) => {
            this.handleWorkerCrash(entry, err);
        });

        worker.on('exit', (code: number) => {
            if (code !== 0 && !this.disposed && !entry.retiring) {
                this.handleWorkerCrash(entry, new Error(`Worker exited with code ${code}`));
            }
        });

        this.workers.push(entry);
        return entry;
    }

    private handleWorkerResponse(entry: ActiveWorkerEntry, response: WorkerTaskResponse): void {
        const task = entry.currentTask;
        if (!task || task.id !== response.id) return;

        this.cleanupActiveTimers(entry);
        entry.busy = false;
        entry.currentTask = undefined;

        if (response.success) {
            this.completedCount++;
            task.resolve(response.result);
        } else {
            this.failedCount++;
            task.reject(new Error(response.error || 'Worker task failed'));
        }

        // Pump next task in queue
        this.pumpQueue();
        this.scheduleShrink();
    }

    private handleWorkerCrash(entry: ActiveWorkerEntry, error: Error): void {
        this.cleanupActiveTimers(entry);
        const task = entry.currentTask;
        entry.busy = false;
        entry.currentTask = undefined;

        // Remove from worker list
        const idx = this.workers.indexOf(entry);
        if (idx !== -1) {
            this.workers.splice(idx, 1);
        }

        try {
            void entry.worker.terminate();
        } catch {
            // ignore cleanup errors
        }

        if (task) {
            this.failedCount++;
            task.reject(error);
        }

        // Respawn replacement worker if not disposed
        if (!this.disposed && !this.inProcessMode) {
            this.recycledCount++;
            try {
                const { Worker } = require('worker_threads');
                this.spawnWorker(Worker);
                this.pumpQueue();
            } catch {
                this.inProcessMode = true;
            }
        }
    }

    private cleanupActiveTimers(entry: ActiveWorkerEntry): void {
        if (entry.currentTimeoutTimer) {
            clearTimeout(entry.currentTimeoutTimer);
            entry.currentTimeoutTimer = undefined;
        }
        entry.cancellationDisposable?.dispose();
        entry.cancellationDisposable = undefined;
    }

    public execute<T>(
        operation: WorkerOperation,
        payload: unknown,
        cancellation?: WorkCancellation,
        timeoutMs?: number
    ): Promise<T> {
        if (this.disposed) {
            return Promise.reject(new WorkCancelledError('TaskWorkerPool is disposed.'));
        }
        if (cancellation?.isCancellationRequested) {
            return Promise.reject(new WorkCancelledError());
        }

        // Check input size limit
        const inputBytes = payload && typeof payload === 'object' && 'text' in payload && typeof (payload as { text?: unknown }).text === 'string'
            ? Buffer.byteLength((payload as { text: string }).text)
            : Buffer.byteLength(JSON.stringify(payload || ''));

        if (inputBytes > this.maxInputBytes) {
            return Promise.reject(new Error('WORKER_INPUT_LIMIT'));
        }

        this.initializePool();
        if (this.inProcessMode) {
            return this.executeInProcess<T>(operation, payload, cancellation, timeoutMs ?? this.defaultTimeoutMs);
        }

        if (this.taskQueue.length >= this.maxQueuedTasks || this.queuedBytes + inputBytes > this.maxQueuedBytes) {
            return Promise.reject(new WorkQueueFullError('The bounded worker queue is full.'));
        }

        return new Promise<T>((resolve, reject) => {
            const task: QueuedTask = {
                id: `task_${this.nextTaskId++}`,
                operation,
                payload,
                cancellation,
                timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
                resolve: resolve as (val: unknown) => void,
                reject,
                enqueuedAt: Date.now(),
                inputBytes
            };

            this.taskQueue.push(task);
            this.queuedBytes += inputBytes;
            this.growForDemand();
            this.pumpQueue();
        });
    }

    private pumpQueue(): void {
        if (this.disposed || this.taskQueue.length === 0) return;

        // Find available idle worker
        const idleWorker = this.workers.find(w => !w.busy);
        if (!idleWorker) return;

        // Find highest priority non-cancelled task
        while (this.taskQueue.length > 0) {
            const task = this.taskQueue.shift()!;
            this.queuedBytes = Math.max(0, this.queuedBytes - task.inputBytes);
            if (task.cancellation?.isCancellationRequested) {
                task.reject(new WorkCancelledError());
                continue;
            }

            // Assign to idle worker
            idleWorker.busy = true;
            idleWorker.currentTask = task;

            // Setup timeout timer
            idleWorker.currentTimeoutTimer = setTimeout(() => {
                const activeTask = idleWorker.currentTask;
                if (activeTask && activeTask.id === task.id) {
                    this.handleWorkerCrash(idleWorker, new Error('WORKER_TIMEOUT'));
                }
            }, task.timeoutMs);

            if (task.cancellation?.onCancellationRequested) {
                idleWorker.cancellationDisposable = task.cancellation.onCancellationRequested(() => {
                    const activeTask = idleWorker.currentTask;
                    if (activeTask && activeTask.id === task.id) this.handleWorkerCrash(idleWorker, new WorkCancelledError());
                });
            }

            idleWorker.worker.postMessage({
                id: task.id,
                operation: task.operation,
                payload: task.payload
            });
            break;
        }
    }

    /**
     * In-process fallback execution for environments where Worker threads are restricted.
     * Slices work into microtasks using Promise.resolve() / setImmediate to yield event loop.
     */
    private executeInProcess<T>(
        operation: WorkerOperation,
        payload: unknown,
        cancellation?: WorkCancellation,
        timeoutMs: number = this.defaultTimeoutMs
    ): Promise<T> {
        const task = new Promise<T>((resolve, reject) => {
            setImmediate(() => {
                try {
                    if (cancellation?.isCancellationRequested) throw new WorkCancelledError();
                    let result: unknown;
                    if (operation === 'ping') {
                        result = 'pong';
                    } else if (operation === 'inline-images') {
                        result = inProcessInlineImages(payload);
                    } else if (operation === 'rank-workspace') {
                        result = inProcessRankWorkspace(payload);
                    } else if (operation === 'ast-prune') {
                        result = inProcessAstPrune(payload);
                    } else if (operation === 'batch-ast-prune') {
                        const items = (payload as any).items || [];
                        result = items.map((item: any) => inProcessAstPrune(item));
                    } else if (operation === 'knapsack-solve') {
                        result = inProcessKnapsackSolve(payload);
                    } else {
                        throw new Error('UNKNOWN_WORKER_OPERATION: ' + operation);
                    }

                    resolve(result as T);
                } catch (err) {
                    reject(err);
                }
            });
        });
        let timer: NodeJS.Timeout | undefined;
        let cancellationDisposable: { dispose(): void } | undefined;
        const deadline = new Promise<T>((_resolve, reject) => {
            timer = setTimeout(() => reject(new WorkCancelledError('In-process work exceeded its deadline.')), timeoutMs);
            if (cancellation?.onCancellationRequested) {
                cancellationDisposable = cancellation.onCancellationRequested(() => reject(new WorkCancelledError()));
            }
        });
        return Promise.race([task, deadline]).finally(() => {
            if (timer) clearTimeout(timer);
            cancellationDisposable?.dispose();
        });
    }

    private growForDemand(): void {
        if (this.inProcessMode || this.workers.length >= this.maxWorkers) return;
        const idle = this.workers.filter(worker => !worker.busy).length;
        if (this.taskQueue.length <= idle) return;
        try {
            const { Worker } = require('worker_threads');
            this.spawnWorker(Worker);
        } catch {
            this.inProcessMode = true;
        }
    }

    private scheduleShrink(): void {
        if (this.shrinkTimer || this.workers.length <= this.minWorkers) return;
        this.shrinkTimer = setTimeout(() => {
            this.shrinkTimer = undefined;
            while (this.workers.length > this.minWorkers) {
                const index = this.workers.findIndex(worker => !worker.busy);
                if (index < 0) break;
                const [worker] = this.workers.splice(index, 1);
                worker.retiring = true;
                void worker.worker.terminate();
            }
        }, this.idleShrinkMs);
    }

    public getStats(): WorkerPoolStats {
        const busy = this.workers.filter(w => w.busy).length;
        return {
            totalWorkers: this.workers.length,
            idleWorkers: this.workers.length - busy,
            busyWorkers: busy,
            queuedTasks: this.taskQueue.length,
            completedTasks: this.completedCount,
            failedTasks: this.failedCount,
            recycledWorkers: this.recycledCount,
            inProcessFallback: this.inProcessMode
        };
    }

    public dispose(): void {
        this.disposed = true;
        if (this.shrinkTimer) clearTimeout(this.shrinkTimer);
        this.shrinkTimer = undefined;
        for (const task of this.taskQueue) {
            task.reject(new WorkCancelledError('TaskWorkerPool is disposed.'));
        }
        this.taskQueue = [];
        this.queuedBytes = 0;

        for (const entry of this.workers) {
            this.cleanupActiveTimers(entry);
            try {
                void entry.worker.terminate();
            } catch {
                // ignore
            }
        }
        this.workers = [];
    }
}
