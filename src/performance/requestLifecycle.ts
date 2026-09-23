import { WorkCancellation, WorkCancelledError } from './boundedScheduler';

export type RequestTerminalOutcome = 'completed' | 'failed' | 'cancelled' | 'timed_out';

export class RequestLifecycleCapacityError extends Error {
    constructor() { super('REQUEST_CAPACITY_EXCEEDED'); this.name = 'RequestLifecycleCapacityError'; }
}

class LifecycleCancellation implements WorkCancellation {
    private cancelled = false;
    private listeners = new Set<() => void>();
    constructor(private readonly parent?: WorkCancellation) {}
    public get isCancellationRequested(): boolean { return this.cancelled || this.parent?.isCancellationRequested === true; }
    public cancel(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        for (const listener of [...this.listeners]) listener();
        this.listeners.clear();
    }
    public onCancellationRequested(listener: () => void): { dispose(): void } {
        if (this.isCancellationRequested) {
            listener();
            return { dispose: () => undefined };
        }
        this.listeners.add(listener);
        const parentDisposable = this.parent?.onCancellationRequested?.(() => this.cancel());
        return { dispose: () => { this.listeners.delete(listener); parentDisposable?.dispose(); } };
    }
}

export class RequestLifecycleScope {
    public readonly cancellation: LifecycleCancellation;
    public readonly deadlineAt: number;
    private terminalOutcome?: RequestTerminalOutcome;
    private terminalCount = 0;
    private readonly children = new Set<string>();
    private timer?: ReturnType<typeof setTimeout>;
    private parentDisposable?: { dispose(): void };

    constructor(
        public readonly requestId: string,
        parent: WorkCancellation | undefined,
        timeoutMs: number,
        private readonly onTerminal: (scope: RequestLifecycleScope) => void,
        private readonly maxChildren: number
    ) {
        this.cancellation = new LifecycleCancellation(parent);
        this.deadlineAt = Date.now() + Math.max(1, timeoutMs);
        this.timer = setTimeout(() => this.finish('timed_out'), Math.max(1, timeoutMs));
        this.parentDisposable = parent?.onCancellationRequested?.(() => this.finish('cancelled'));
    }

    public get outcome(): RequestTerminalOutcome | undefined { return this.terminalOutcome; }
    public get completionCount(): number { return this.terminalCount; }
    public get activeChildCount(): number { return this.children.size; }

    public checkpoint(): void {
        if (this.cancellation.isCancellationRequested) throw new WorkCancelledError();
    }

    public async runChild<T>(name: string, operation: (cancellation: WorkCancellation) => Promise<T>): Promise<T> {
        this.checkpoint();
        if (this.children.size >= this.maxChildren) throw new RequestLifecycleCapacityError();
        const childId = `${name}:${this.children.size + 1}`;
        this.children.add(childId);
        let cancellationDisposable: { dispose(): void } | undefined;
        const cancelled = new Promise<T>((_resolve, reject) => {
            cancellationDisposable = this.cancellation.onCancellationRequested(() => reject(new WorkCancelledError()));
        });
        try {
            return await Promise.race([operation(this.cancellation), cancelled]);
        } finally {
            cancellationDisposable?.dispose();
            this.children.delete(childId);
        }
    }

    public complete(): boolean { return this.finish('completed'); }
    public fail(cancelled = false): boolean { return this.finish(cancelled ? 'cancelled' : 'failed'); }

    public finish(outcome: RequestTerminalOutcome): boolean {
        if (this.terminalOutcome) return false;
        this.terminalOutcome = outcome;
        this.terminalCount++;
        if (outcome !== 'completed') this.cancellation.cancel();
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.parentDisposable?.dispose();
        this.parentDisposable = undefined;
        this.children.clear();
        this.onTerminal(this);
        return true;
    }
}

export class RequestLifecycleController {
    private static instance: RequestLifecycleController;
    private readonly active = new Map<string, RequestLifecycleScope>();
    private disposed = false;

    constructor(private readonly maxActiveRequests = 64, private readonly maxChildrenPerRequest = 64) {}

    public static getInstance(): RequestLifecycleController {
        if (!RequestLifecycleController.instance) RequestLifecycleController.instance = new RequestLifecycleController();
        return RequestLifecycleController.instance;
    }

    public begin(requestId: string, cancellation?: WorkCancellation, timeoutMs = 60_000): RequestLifecycleScope {
        if (this.disposed) throw new WorkCancelledError('Request lifecycle controller is disposed.');
        if (!requestId?.trim() || this.active.has(requestId)) throw new Error('REQUEST_ID_NOT_UNIQUE');
        if (this.active.size >= this.maxActiveRequests) throw new RequestLifecycleCapacityError();
        const scope = new RequestLifecycleScope(requestId, cancellation, timeoutMs, completed => {
            if (this.active.get(requestId) === completed) this.active.delete(requestId);
        }, this.maxChildrenPerRequest);
        this.active.set(requestId, scope);
        return scope;
    }

    public getActiveCount(): number { return this.active.size; }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const scope of [...this.active.values()]) scope.finish('cancelled');
        this.active.clear();
    }
}
