/**
 * Tokonomics Real Executable Benchmark Task Corpus
 * Contains concrete, realistic software engineering tasks with complete source code,
 * existing test suites, and new acceptance criteria across multiple domains.
 */

export interface ExecutableTask {
    id: string;
    language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
    category: 'debug' | 'feature' | 'refactor' | 'type_fix' | 'test_gen';
    title: string;
    description: string;
    sourceCode: string;
    patchBuggy: string;
    patchFixed: string;
    existingTests: string;
    acceptanceTests: string;
    rawPromptContext: string;
}

export class ExecutableTaskCorpus {
    public static getTasks(): ExecutableTask[] {
        return [
            {
                id: 'exec_01_lru_cache_ttl',
                language: 'typescript',
                category: 'feature',
                title: 'Add Time-To-Live (TTL) expiration to LRU Cache',
                description: 'Implement TTL expiration on get() and eviction of expired items',
                sourceCode: `
export class LruCache<K, V> {
    private capacity: number;
    private cache: Map<K, { value: V; expiresAt: number }>;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    public put(key: K, value: V, ttlMs: number = 10000): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }

    public get(key: K): V | undefined {
        const item = this.cache.get(key);
        if (!item) return undefined;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        // Re-insert for LRU ordering
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    public size(): number {
        return this.cache.size;
    }
}`,
                patchBuggy: `
export class LruCache<K, V> {
    // BUG: Missing TTL expiration check in get()
    private capacity: number;
    private cache: Map<K, V>;
    constructor(capacity: number) { this.capacity = capacity; this.cache = new Map(); }
    public put(key: K, value: V): void { this.cache.set(key, value); }
    public get(key: K): V | undefined { return this.cache.get(key); }
    public size(): number { return this.cache.size; }
}`,
                patchFixed: `
export class LruCache<K, V> {
    private capacity: number;
    private cache: Map<K, { value: V; expiresAt: number }>;
    constructor(capacity: number) { this.capacity = capacity; this.cache = new Map(); }
    public put(key: K, value: V, ttlMs: number = 10000): void {
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.capacity) {
            const first = this.cache.keys().next().value;
            if (first !== undefined) this.cache.delete(first);
        }
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    public get(key: K): V | undefined {
        const item = this.cache.get(key);
        if (!item) return undefined;
        if (Date.now() > item.expiresAt) { this.cache.delete(key); return undefined; }
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }
    public size(): number { return this.cache.size; }
}`,
                existingTests: `
                    try {
                        const cache = new LruCache(2);
                        cache.put("a", 1);
                        cache.put("b", 2);
                        assert.strictEqual(cache.get("a"), 1);
                        cache.put("c", 3); // should evict "b"
                        assert.strictEqual(cache.get("b"), undefined);
                        assert.strictEqual(cache.get("c"), 3);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                acceptanceTests: `
                    try {
                        const cacheTtl = new LruCache(3);
                        cacheTtl.put("temp", 99, -100); // Already expired
                        assert.strictEqual(cacheTtl.get("temp"), undefined);
                        cacheTtl.put("alive", 100, 50000);
                        assert.strictEqual(cacheTtl.get("alive"), 100);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                rawPromptContext: `You are working on LruCache.ts. Implement time-to-live expiration support on get and put.`
            },
            {
                id: 'exec_02_payment_idempotency',
                language: 'typescript',
                category: 'debug',
                title: 'Fix race condition in Idempotent Payment Processor',
                description: 'Ensure double-charge prevention with status locking',
                sourceCode: `
export interface PaymentResult {
    transactionId: string;
    status: 'SUCCESS' | 'ALREADY_PROCESSED' | 'FAILED';
    amount: number;
}

export class PaymentProcessor {
    private processedTx: Map<string, { status: string; amount: number }> = new Map();

    public processCharge(idempotencyKey: string, amount: number): PaymentResult {
        if (!idempotencyKey || idempotencyKey.trim().length === 0) {
            throw new Error("Idempotency key required");
        }
        if (amount <= 0) {
            throw new Error("Amount must be positive");
        }
        if (this.processedTx.has(idempotencyKey)) {
            const existing = this.processedTx.get(idempotencyKey)!;
            return { transactionId: idempotencyKey, status: 'ALREADY_PROCESSED', amount: existing.amount };
        }
        // Lock before processing
        this.processedTx.set(idempotencyKey, { status: 'SUCCESS', amount });
        return { transactionId: idempotencyKey, status: 'SUCCESS', amount };
    }
}`,
                patchBuggy: `
export class PaymentProcessor {
    // BUG: Missing check for existing idempotency key before charge
    private processedTx: Map<string, any> = new Map();
    public processCharge(idempotencyKey: string, amount: number) {
        this.processedTx.set(idempotencyKey, { status: 'SUCCESS', amount });
        return { transactionId: idempotencyKey, status: 'SUCCESS', amount };
    }
}`,
                patchFixed: `
export class PaymentProcessor {
    private processedTx: Map<string, { status: string; amount: number }> = new Map();
    public processCharge(idempotencyKey: string, amount: number) {
        if (!idempotencyKey || idempotencyKey.trim() === '') throw new Error("Idempotency key required");
        if (amount <= 0) throw new Error("Amount must be positive");
        if (this.processedTx.has(idempotencyKey)) {
            return { transactionId: idempotencyKey, status: 'ALREADY_PROCESSED', amount: this.processedTx.get(idempotencyKey).amount };
        }
        this.processedTx.set(idempotencyKey, { status: 'SUCCESS', amount });
        return { transactionId: idempotencyKey, status: 'SUCCESS', amount };
    }
}`,
                existingTests: `
                    try {
                        const proc = new PaymentProcessor();
                        const res = proc.processCharge("tx_01", 100);
                        assert.strictEqual(res.status, 'SUCCESS');
                        assert.strictEqual(res.amount, 100);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                acceptanceTests: `
                    try {
                        const proc = new PaymentProcessor();
                        const res1 = proc.processCharge("tx_dup", 250);
                        assert.strictEqual(res1.status, 'SUCCESS');
                        const res2 = proc.processCharge("tx_dup", 250);
                        assert.strictEqual(res2.status, 'ALREADY_PROCESSED');
                        assert.strictEqual(res2.amount, 250);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                rawPromptContext: `PaymentProcessor must guard against duplicate charges using idempotency keys.`
            },
            {
                id: 'exec_03_token_bucket_rate_limiter',
                language: 'typescript',
                category: 'feature',
                title: 'Implement Token Bucket Rate Limiter with Refill',
                description: 'Calculates fractional token replenishment over time intervals',
                sourceCode: `
export class TokenBucketLimiter {
    private capacity: number;
    private tokens: number;
    private refillRatePerSec: number;
    private lastRefill: number;

    constructor(capacity: number, refillRatePerSec: number) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.refillRatePerSec = refillRatePerSec;
        this.lastRefill = Date.now();
    }

    public tryConsume(tokensRequested: number = 1): boolean {
        this.refill();
        if (this.tokens >= tokensRequested) {
            this.tokens -= tokensRequested;
            return true;
        }
        return false;
    }

    private refill(): void {
        const now = Date.now();
        const elapsedSec = (now - this.lastRefill) / 1000;
        const tokensToAdd = elapsedSec * this.refillRatePerSec;
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    public getAvailableTokens(): number {
        this.refill();
        return this.tokens;
    }
}`,
                patchBuggy: `
export class TokenBucketLimiter {
    // BUG: Does not track fractional tokens or refill timestamps correctly
    private tokens: number;
    constructor(capacity: number, rate: number) { this.tokens = capacity; }
    public tryConsume() { if (this.tokens > 0) { this.tokens--; return true; } return false; }
    public getAvailableTokens() { return this.tokens; }
}`,
                patchFixed: `
export class TokenBucketLimiter {
    private capacity: number;
    private tokens: number;
    private refillRatePerSec: number;
    private lastRefill: number;
    constructor(capacity: number, refillRatePerSec: number) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.refillRatePerSec = refillRatePerSec;
        this.lastRefill = Date.now();
    }
    public tryConsume(tokensRequested: number = 1): boolean {
        this.refill();
        if (this.tokens >= tokensRequested) {
            this.tokens -= tokensRequested;
            return true;
        }
        return false;
    }
    private refill(): void {
        const now = Date.now();
        const elapsedSec = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
        this.lastRefill = now;
    }
    public getAvailableTokens(): number {
        this.refill();
        return this.tokens;
    }
}`,
                existingTests: `
                    try {
                        const limiter = new TokenBucketLimiter(5, 2);
                        assert.strictEqual(limiter.tryConsume(3), true);
                        assert.strictEqual(limiter.tryConsume(2), true);
                        assert.strictEqual(limiter.tryConsume(1), false);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                acceptanceTests: `
                    try {
                        const limiter = new TokenBucketLimiter(10, 5);
                        assert.strictEqual(limiter.tryConsume(10), true);
                        assert.strictEqual(limiter.tryConsume(1), false);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                rawPromptContext: `Implement a token bucket rate limiter with smooth continuous refill.`
            },
            {
                id: 'exec_04_dag_topological_sorter',
                language: 'typescript',
                category: 'refactor',
                title: 'Topological DAG Dependency Sorter with Cycle Detection',
                description: 'Produces execution order for tasks and detects circular dependency graphs',
                sourceCode: `
export class DagSorter {
    public static sort(nodes: string[], edges: Array<[string, string]>): string[] {
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        for (const n of nodes) {
            adj.set(n, []);
            inDegree.set(n, 0);
        }

        for (const [from, to] of edges) {
            adj.get(from)!.push(to);
            inDegree.set(to, (inDegree.get(to) || 0) + 1);
        }

        const queue: string[] = [];
        for (const n of nodes) {
            if (inDegree.get(n) === 0) queue.push(n);
        }

        const order: string[] = [];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            order.push(curr);
            for (const neighbor of adj.get(curr) || []) {
                const deg = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, deg);
                if (deg === 0) queue.push(neighbor);
            }
        }

        if (order.length !== nodes.length) {
            throw new Error("Cycle detected in dependency graph");
        }

        return order;
    }
}`,
                patchBuggy: `
export class DagSorter {
    // BUG: Missing cycle detection (returns incomplete array without throwing error)
    public static sort(nodes: string[], edges: Array<[string, string]>) {
        return nodes;
    }
}`,
                patchFixed: `
export class DagSorter {
    public static sort(nodes: string[], edges: Array<[string, string]>): string[] {
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        for (const n of nodes) { adj.set(n, []); inDegree.set(n, 0); }
        for (const [from, to] of edges) {
            adj.get(from)!.push(to);
            inDegree.set(to, (inDegree.get(to) || 0) + 1);
        }
        const queue: string[] = [];
        for (const n of nodes) { if (inDegree.get(n) === 0) queue.push(n); }
        const order: string[] = [];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            order.push(curr);
            for (const neighbor of adj.get(curr) || []) {
                const deg = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, deg);
                if (deg === 0) queue.push(neighbor);
            }
        }
        if (order.length !== nodes.length) throw new Error("Cycle detected in dependency graph");
        return order;
    }
}`,
                existingTests: `
                    try {
                        const nodes = ["A", "B", "C"];
                        const edges = [["A", "B"], ["B", "C"]];
                        const order = DagSorter.sort(nodes, edges);
                        assert.deepStrictEqual(order, ["A", "B", "C"]);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                acceptanceTests: `
                    try {
                        const cyclicNodes = ["X", "Y"];
                        const cyclicEdges = [["X", "Y"], ["Y", "X"]];
                        assert.throws(() => DagSorter.sort(cyclicNodes, cyclicEdges), /Cycle detected/);
                        __recordTestPass();
                    } catch (e) {
                        __recordTestFail(e);
                    }
                `,
                rawPromptContext: `Implement topological DAG sorting with cycle detection.`
            }
        ];
    }
}
