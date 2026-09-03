/** Bounded, cancellation-aware priority scheduling for extension-host work. */

export type WorkPriority = 'foreground' | 'index' | 'warming' | 'experiment';

export interface WorkCancellation {
    readonly isCancellationRequested: boolean;
}

export interface WorkSpec {
    key?: string;
    priority: WorkPriority;
    cancellation?: WorkCancellation;
    deadlineMs?: number;
}

export interface WorkContext {
    readonly cancellation?: WorkCancellation;
    checkpoint(): void;
    yield(): Promise<void>;
}

export interface SchedulerStats {
    running: number;
    queued: number;
    capacity: number;
    accepted: number;
    completed: number;
    cancelled: number;
    superseded: number;
    rejected: number;
    peakQueued: number;
}

export class WorkCancelledError extends Error {
    constructor(message = 'Scheduled work was cancelled.') { super(message); this.name = 'WorkCancelledError'; }
}

export class WorkSupersededError extends Error {
    constructor(message = 'Scheduled work was superseded by a newer job.') { super(message); this.name = 'WorkSupersededError'; }
}

export class WorkQueueFullError extends Error {
    constructor(message = 'The bounded work queue is full.') { super(message); this.name = 'WorkQueueFullError'; }
}

type Job<T> = {
    sequence: number;
    spec: WorkSpec;
    task: (context: WorkContext) => Promise<T> | T;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
};

const PRIORITY: Record<WorkPriority, number> = { foreground: 0, index: 1, warming: 2, experiment: 3 };

export class BoundedPriorityScheduler {
    private queue: Job<unknown>[] = [];
    private queuedByKey = new Map<string, Job<unknown>>();
    private running = 0;
    private sequence = 0;
    private disposed = false;
    private foregroundBurst = 0;
    private counters = { accepted: 0, completed: 0, cancelled: 0, superseded: 0, rejected: 0, peakQueued: 0 };

    constructor(
        private readonly maxConcurrency = 2,
        private readonly capacity = 128,
        private readonly maxForegroundBurst = 8
    ) {
        if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) throw new Error('Scheduler concurrency must be at least one.');
        if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Scheduler capacity must be at least one.');
    }

    public schedule<T>(spec: WorkSpec, task: (context: WorkContext) => Promise<T> | T): Promise<T> {
        if (this.disposed) return Promise.reject(new WorkCancelledError('Scheduler is disposed.'));
        if (spec.cancellation?.isCancellationRequested) {
            this.counters.cancelled++;
            return Promise.reject(new WorkCancelledError());
        }

        return new Promise<T>((resolve, reject) => {
            const job: Job<T> = { sequence: ++this.sequence, spec: { ...spec }, task, resolve, reject };
            if (spec.key) {
                const previous = this.queuedByKey.get(spec.key);
                if (previous) {
                    this.removeQueued(previous);
                    this.counters.superseded++;
                    previous.reject(new WorkSupersededError());
                }
            }

            if (this.queue.length >= this.capacity) {
                const victim = this.findEvictionCandidate(spec.priority);
                if (!victim) {
                    this.counters.rejected++;
                    reject(new WorkQueueFullError());
                    return;
                }
                this.removeQueued(victim);
                this.counters.superseded++;
                victim.reject(new WorkSupersededError('Lower-priority queued work was displaced by newer work.'));
            }

            this.queue.push(job as Job<unknown>);
            if (spec.key) this.queuedByKey.set(spec.key, job as Job<unknown>);
            this.counters.accepted++;
            this.counters.peakQueued = Math.max(this.counters.peakQueued, this.queue.length);
            this.drain();
        });
    }

    public getStats(): SchedulerStats {
        return Object.freeze({ running: this.running, queued: this.queue.length, capacity: this.capacity, ...this.counters });
    }

    public dispose(): void {
        this.disposed = true;
        for (const job of this.queue.splice(0)) job.reject(new WorkCancelledError('Scheduler disposed before work started.'));
        this.queuedByKey.clear();
    }

    private drain(): void {
        while (!this.disposed && this.running < this.maxConcurrency && this.queue.length > 0) {
            const job = this.takeNext();
            if (!job) return;
            if (job.spec.key) this.queuedByKey.delete(job.spec.key);
            if (this.isCancelled(job.spec)) {
                this.counters.cancelled++;
                job.reject(new WorkCancelledError());
                continue;
            }
            this.running++;
            const context: WorkContext = {
                cancellation: job.spec.cancellation,
                checkpoint: () => {
                    if (this.isCancelled(job.spec)) throw new WorkCancelledError();
                },
                yield: async () => {
                    await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
                    if (this.isCancelled(job.spec)) throw new WorkCancelledError();
                }
            };
            Promise.resolve().then(() => job.task(context)).then(
                value => { this.counters.completed++; job.resolve(value); },
                error => {
                    if (error instanceof WorkCancelledError) this.counters.cancelled++;
                    job.reject(error);
                }
            ).finally(() => { this.running--; this.drain(); });
        }
    }

    private takeNext(): Job<unknown> | undefined {
        let candidates = this.queue;
        if (this.foregroundBurst >= this.maxForegroundBurst && this.queue.some(job => job.spec.priority !== 'foreground')) {
            candidates = this.queue.filter(job => job.spec.priority !== 'foreground');
        }
        let selected = candidates[0];
        for (const job of candidates) {
            const priorityDelta = PRIORITY[job.spec.priority] - PRIORITY[selected.spec.priority];
            if (priorityDelta < 0 || (priorityDelta === 0 && job.sequence < selected.sequence)) selected = job;
        }
        this.removeQueued(selected);
        if (selected.spec.priority === 'foreground') this.foregroundBurst++;
        else this.foregroundBurst = 0;
        return selected;
    }

    private findEvictionCandidate(incoming: WorkPriority): Job<unknown> | undefined {
        const incomingPriority = PRIORITY[incoming];
        return [...this.queue]
            .filter(job => PRIORITY[job.spec.priority] > incomingPriority)
            .sort((a, b) => PRIORITY[b.spec.priority] - PRIORITY[a.spec.priority] || b.sequence - a.sequence)[0];
    }

    private removeQueued(job: Job<unknown>): void {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        if (job.spec.key && this.queuedByKey.get(job.spec.key) === job) this.queuedByKey.delete(job.spec.key);
    }

    private isCancelled(spec: WorkSpec): boolean {
        return this.disposed || !!spec.cancellation?.isCancellationRequested || (spec.deadlineMs !== undefined && Date.now() > spec.deadlineMs);
    }
}
