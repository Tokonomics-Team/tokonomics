import { Worker } from 'worker_threads';
import { WorkCancellation, WorkCancelledError } from './boundedScheduler';

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

const WORKER_SOURCE = `
const { parentPort } = require('worker_threads');
parentPort.on('message', ({ operation, payload }) => {
  if (operation === 'inline-images') {
    const { text, config } = payload;
    let originalBytes = 0, compressedBytes = 0, processedCount = 0;
    const regex = /data:image\\/(png|jpeg|jpg|gif|webp|bmp);base64,([A-Za-z0-9+/=]{1000,})/g;
    const processed = text.replace(regex, (match, format, base64Data) => {
      try {
        const bytes = Buffer.from(base64Data, 'base64').length;
        originalBytes += bytes;
        if (bytes < 200 * 1024 || config.preserveVisualData) { compressedBytes += bytes; return match; }
        processedCount++;
        const target = Math.round(config.maxDimension * config.maxDimension * 3 * (config.quality / 100));
        compressedBytes += Math.min(bytes, target);
        return '[Optimized Image Context: ' + format + ' (' + Math.round(bytes / 1024) + 'KB) - bounds constrained to ' + config.maxDimension + 'px]';
      } catch { compressedBytes += base64Data.length; return match; }
    });
    const saved = originalBytes - compressedBytes;
    parentPort.postMessage({ text: processed, stats: { originalBytes, compressedBytes, reductionPercentage: originalBytes ? Math.round(saved / originalBytes * 100) : 0, estimatedTokensSaved: Math.round(saved / 1.5), wasProcessed: processedCount > 0 } });
    return;
  }
  const { files, activeKeys } = payload;
  const active = new Set(activeKeys);
  const owners = new Map();
  for (const file of files) for (const symbol of file.symbols) {
    const list = owners.get(symbol.name) || [];
    list.push(file.key); owners.set(symbol.name, list);
  }
  const outgoing = new Map();
  for (const file of files) {
    const targets = new Set();
    for (const reference of file.references) for (const owner of owners.get(reference) || []) if (owner !== file.key) targets.add(owner);
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
      for (const target of targets) next.set(target, (next.get(target) || 0) + share);
    }
    scores = next;
  }
  const pathToKey = new Map(files.map(file => [file.relativePath, file.key]));
  const ranked = files.flatMap(file => file.symbols.map(symbol => ({ ...symbol, score: scores.get(pathToKey.get(symbol.file) || file.key) || 0 })))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  parentPort.postMessage(ranked);
});`;

/** Isolates serializable CPU-heavy ranking from the VS Code extension event loop. */
export class CpuWorkerBoundary {
    private readonly activeWorkers = new Set<Worker>();
    private disposed = false;

    constructor(private readonly timeoutMs = 15_000, private readonly maxInputBytes = 32 * 1024 * 1024) {}

    public rankWorkspace(input: WorkspaceRankInput, cancellation?: WorkCancellation): Promise<RankedWorkspaceSymbol[]> {
        return this.runWorker<RankedWorkspaceSymbol[]>('rank-workspace', input, cancellation);
    }

    public rightsizeInlineImages(input: { text: string; config: { maxDimension: number; quality: number; preserveVisualData: boolean } }, cancellation?: WorkCancellation): Promise<{ text: string; stats: { originalBytes: number; compressedBytes: number; reductionPercentage: number; estimatedTokensSaved: number; wasProcessed: boolean } }> {
        return this.runWorker('inline-images', input, cancellation);
    }

    private runWorker<T>(operation: string, input: unknown, cancellation?: WorkCancellation): Promise<T> {
        if (this.disposed) return Promise.reject(new WorkCancelledError('CPU worker boundary is disposed.'));
        if (cancellation?.isCancellationRequested) return Promise.reject(new WorkCancelledError());
        const inputBytes = input && typeof input === 'object' && 'text' in input && typeof (input as { text?: unknown }).text === 'string'
            ? Buffer.byteLength((input as { text: string }).text)
            : Buffer.byteLength(JSON.stringify(input));
        if (inputBytes > this.maxInputBytes) return Promise.reject(new Error('WORKER_INPUT_LIMIT'));
        return new Promise<T>((resolve, reject) => {
            const worker = new Worker(WORKER_SOURCE, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
            this.activeWorkers.add(worker);
            let settled = false;
            const finish = (error?: unknown, result?: T) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearInterval(cancellationPoll);
                this.activeWorkers.delete(worker);
                void worker.terminate();
                error ? reject(error) : resolve(result as T);
            };
            const timeout = setTimeout(() => finish(new Error('WORKER_TIMEOUT')), this.timeoutMs);
            const cancellationPoll = setInterval(() => {
                if (cancellation?.isCancellationRequested) finish(new WorkCancelledError());
            }, 10);
            worker.once('message', result => finish(undefined, result as T));
            worker.once('error', finish);
            worker.once('exit', code => { if (code !== 0 && !settled) finish(new Error(`WORKER_EXIT_${code}`)); });
            worker.postMessage({ operation, payload: input });
        });
    }

    public dispose(): void {
        this.disposed = true;
        for (const worker of this.activeWorkers) void worker.terminate();
        this.activeWorkers.clear();
    }
}
