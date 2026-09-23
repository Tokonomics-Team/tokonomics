import { createHash } from 'crypto';
import { PromptOptimizationEvent } from '../events/optimizationEvent';
import { effectiveCostState } from '../cost/accountingTruth';

export type SpendEvidence = 'observed_usage' | 'input_projection' | 'unavailable';
export interface UsageRecord {
    id: string; taskId: string; requestId?: string; timestamp: number; receivedAt: number;
    source: 'tokonomics' | 'claude-jsonl'; parserVersion: string; provider: string; model: string;
    inputTokens: number; outputTokens: number | null; cacheReadTokens: number | null; cacheWriteTokens: number | null;
    costUSD: number | null; avoidedCostUSD: number | null; evidence: SpendEvidence;
    priceVersion?: string; priceSource?: string; inputSemantics: 'inclusive'; status: string;
    savingsTokens: number | null; findings: string[];
}
export interface BudgetRule { scope: 'task' | 'daily' | 'monthly'; limitUSD: number; alertPercent: number; }
export interface SpendTotals {
    requests: number; observedRequests: number; pricedRequests: number; observedPricedRequests: number; projectedRequests: number; avoidedCostRequests: number; observedUSD: number; projectedUSD: number;
    avoidedUSD: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
}
export interface ArchivedDay { day: string; source: UsageRecord['source']; model: string; totals: SpendTotals; }
export interface UsageState {
    version: 1; records: UsageRecord[]; archives: ArchivedDay[]; budgets: BudgetRule[];
    outcomes: Partial<Record<string, 'success' | 'failure'>>; alerted: string[]; startedAt: number; clearedAt?: number;
}
const DAY = 86400000;
export const emptyTotals = (): SpendTotals => ({ requests: 0, observedRequests: 0, pricedRequests: 0, observedPricedRequests: 0, projectedRequests: 0, avoidedCostRequests: 0,
    observedUSD: 0, projectedUSD: 0, avoidedUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
export function localDay(time: number): string {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addRecord(total: SpendTotals, r: UsageRecord): void {
    total.requests++;
    if (r.evidence === 'observed_usage') total.observedRequests++;
    if (r.costUSD !== null) {
        total.pricedRequests++;
        if (r.evidence === 'observed_usage') { total.observedUSD += r.costUSD; total.observedPricedRequests++; }
        else { total.projectedUSD += r.costUSD; total.projectedRequests++; }
    }
    if (r.avoidedCostUSD !== null) total.avoidedCostRequests++;
    total.avoidedUSD += r.avoidedCostUSD ?? 0;
    total.inputTokens += r.inputTokens;
    total.outputTokens += r.outputTokens ?? 0;
    total.cacheReadTokens += r.cacheReadTokens ?? 0;
    total.cacheWriteTokens += r.cacheWriteTokens ?? 0;
}
export function hashId(text: string): string { return createHash('sha256').update(text).digest('hex'); }

/** Separate usage store: external requests never receive an invented optimization baseline. */
export class UsageStore {
    private _state!: UsageState;
    private byId = new Map<string, UsageRecord>();
    private lastPruneAt = 0;
    public get state(): UsageState { return this._state; }
    public set state(value: UsageState) { this._state = value; this.byId = new Map(value.records.map(r => [r.id, r])); this.lastPruneAt = 0; }
    constructor(private readonly clock: () => number = Date.now) {
        this.state = { version: 1, records: [], archives: [], budgets: [], outcomes: {}, alerted: [], startedAt: clock() };
    }
    public restore(raw: unknown): void {
        const value = raw as UsageState;
        if (!value || value.version !== 1 || !Array.isArray(value.records) || !Array.isArray(value.archives) ||
            !Array.isArray(value.budgets) || !Array.isArray(value.alerted) || !value.outcomes || !Number.isFinite(value.startedAt)) {
            throw new Error('Unsupported usage-store format.');
        }
        if (value.records.length > 10000 || value.archives.length > 20000) throw new Error('Usage store exceeds bounds.');
        for (const r of value.records) this.validateRecord(r);
        for (const rule of value.budgets) validateBudget(rule);
        for (const a of value.archives) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day) || !['tokonomics', 'claude-jsonl'].includes(a.source) ||
                typeof a.model !== 'string' || !a.totals || (Object.keys(emptyTotals()) as (keyof SpendTotals)[]).some(key => !Number.isFinite(a.totals[key]))) throw new Error('Invalid aggregate.');
        }
        this.state = JSON.parse(JSON.stringify(value));
        this.prune();
    }
    public upsert(record: UsageRecord): boolean {
        this.validateRecord(record);
        this.prune();
        if (record.timestamp < this.clock() - 90 * DAY || record.timestamp > this.clock() + 5 * 60000) return false;
        const old = this.byId.get(record.id);
        if (old) {
            if (old.source !== record.source || old.taskId !== record.taskId) return false;
            if (record.receivedAt < old.receivedAt) return false;
            // Partial/replayed Claude rows must not replace a more complete observation.
            if (record.source === 'claude-jsonl' && (record.inputTokens < old.inputTokens || (record.outputTokens ?? 0) < (old.outputTokens ?? 0))) return false;
            const comparable = (r: UsageRecord) => JSON.stringify({ ...r, receivedAt: 0 });
            if (comparable(old) === comparable(record)) return false;
            // Freeze the original timestamp and price once observed; replay cannot reprice history.
            record.timestamp = old.timestamp;
            if (record.source === 'claude-jsonl' && record.inputTokens === old.inputTokens && record.outputTokens === old.outputTokens &&
                record.cacheReadTokens === old.cacheReadTokens && record.cacheWriteTokens === old.cacheWriteTokens) return false;
            this.state.records[this.state.records.indexOf(old)] = record;
        } else {
            if (this.state.records.length >= 10000) throw new Error('Usage history is full. Export and clear it before importing more.');
            this.state.records.push(record);
        }
        this.byId.set(record.id, record);
        this.prune();
        return true;
    }
    public recordOptimization(event: PromptOptimizationEvent): boolean {
        if (this.state.clearedAt && event.timestamp <= this.state.clearedAt) return false;
        // Received/compiled prompts have not necessarily reached a provider.
        const old = this.byId.get(`tokonomics:${event.id}`);
        const sent = ['REQUEST_SENT', 'MODEL_USAGE_RECEIVED', 'COST_RECONCILED', 'PROMPT_COMPLETED'].includes(event.state);
        if (!sent && !(old && event.state === 'OPTIMIZATION_FAILED')) return false;
        if (event.cacheState === 'response_hit') return false;
        const costState = effectiveCostState(event);
        if (old?.evidence === 'observed_usage' && costState !== 'reconciled') {
            return this.upsert({ ...old, receivedAt: this.clock(), status: event.state });
        }
        const observed = costState === 'reconciled' || (Boolean(event.subscriptionTransport) && Number.isSafeInteger(event.observedInputTokens));
        const cost = observed ? event.actualOptimizedCostUSD : costState === 'projected' ? event.projectedOptimizedCostUSD : undefined;
        const evidence: SpendEvidence = observed ? 'observed_usage' : costState === 'projected' ? 'input_projection' : 'unavailable';
        const findings: string[] = [];
        if (event.subscriptionTransport) findings.push(`${event.subscriptionTransport} subscription CLI: reported tokens include provider overhead. Subscription charges and remaining quota are unavailable.`);
        if (event.savedTokens > 0) findings.push(`${event.savedTokens.toLocaleString()} input tokens removed locally. Inspect the compiler trace before relying on the reduced context.`);
        if (event.fallbackReasons?.length) findings.push('A safety fallback restored or adjusted context. Inspect the trace for the reason.');
        if (event.budgetTrace && event.budgetTrace.finalInputTokens >= event.budgetTrace.inputLimit * .8) findings.push('Context pressure exceeds 80% of the input budget. Consider a narrower task or larger-context model.');
        if (event.stageMetrics.some(s => /mask|dedup/i.test(s.stageName) && s.tokensSaved > 0)) findings.push('Repeated context or old tool observations were reduced. Inspect stage evidence.');
        return this.upsert({ id: `tokonomics:${event.id}`, taskId: old?.taskId ?? event.taskId ?? `request_${event.id}`,
            requestId: event.id, timestamp: old?.timestamp ?? event.timestamp, receivedAt: this.clock(), source: 'tokonomics',
            parserVersion: 'compiler-v1', provider: event.provider, model: event.model,
            inputTokens: observed ? event.observedInputTokens ?? event.optimizedInputTokens : event.optimizedInputTokens,
            outputTokens: observed ? event.outputTokens ?? null : null, cacheReadTokens: observed ? event.cachedTokens ?? null : null,
            cacheWriteTokens: observed ? event.cacheWriteTokens ?? null : null,
            costUSD: typeof cost === 'number' && Number.isFinite(cost) && (!event.pricingCurrency || event.pricingCurrency === 'USD') ? cost : null,
            avoidedCostUSD: observed ? event.actualSavingsUSD ?? null : costState === 'projected' ? event.projectedSavingsUSD : null,
            evidence, priceVersion: event.pricingCatalogVersion, priceSource: event.pricingSource,
            inputSemantics: 'inclusive', status: event.state, savingsTokens: event.savedTokens, findings });
    }
    public setBudget(rule: BudgetRule): void {
        validateBudget(rule);
        this.state.budgets = [...this.state.budgets.filter(r => r.scope !== rule.scope), { ...rule }];
    }
    public removeBudget(scope: BudgetRule['scope']): void { this.state.budgets = this.state.budgets.filter(r => r.scope !== scope); }
    public totals(records = this.state.records): SpendTotals {
        const total = emptyTotals(); records.forEach(r => addRecord(total, r)); return total;
    }
    public budgetProgress(taskId?: string) {
        const today = localDay(this.clock());
        return this.state.budgets.map(rule => {
            const records = this.state.records.filter(r => rule.scope === 'task' ? r.taskId === taskId :
                rule.scope === 'daily' ? localDay(r.timestamp) === today : localDay(r.timestamp).slice(0, 7) === today.slice(0, 7));
            const totals = this.totals(records);
            const usd = totals.observedUSD + totals.projectedUSD;
            const percent = usd / rule.limitUSD * 100;
            const period = rule.scope === 'task' ? taskId ?? '' : rule.scope === 'daily' ? today : today.slice(0, 7);
            const key = `${rule.scope}:${period}:${rule.limitUSD}:${rule.alertPercent}`;
            return { ...rule, usd, percent, partial: totals.pricedRequests < totals.requests || totals.observedRequests < totals.requests,
                active: rule.scope !== 'task' || Boolean(taskId), key };
        });
    }
    public takeAlerts(taskId?: string): string[] {
        const alerts: string[] = [];
        for (const rule of this.budgetProgress(taskId)) {
            if (rule.active && rule.percent >= rule.alertPercent && !this.state.alerted.includes(rule.key)) {
                this.state.alerted.push(rule.key);
                alerts.push(`${rule.scope} budget: ~$${rule.usd.toFixed(2)} of $${rule.limitUSD.toFixed(2)}${rule.partial ? ' (partial usage/input projections)' : ' (rate-derived usage)'}. Advisory only.`);
            }
        }
        this.state.alerted = this.state.alerted.slice(-1000);
        return alerts;
    }
    public prune(): void {
        if (this.clock() - this.lastPruneAt < 60000) return;
        this.lastPruneAt = this.clock();
        const cutoff = this.clock() - 90 * DAY;
        for (const r of this.state.records.filter(r => r.timestamp < cutoff)) {
            const day = localDay(r.timestamp);
            let bucket = this.state.archives.find(a => a.day === day && a.source === r.source && a.model === r.model);
            if (!bucket) this.state.archives.push(bucket = { day, source: r.source, model: r.model, totals: emptyTotals() });
            addRecord(bucket.totals, r);
        }
        this.state.records = this.state.records.filter(r => r.timestamp >= cutoff);
        this.byId = new Map(this.state.records.map(r => [r.id, r]));
        this.state.archives = this.state.archives.filter(a => a.day >= localDay(this.clock() - 365 * DAY));
        const tasks = new Set(this.state.records.map(r => r.taskId));
        this.state.outcomes = Object.fromEntries(Object.entries(this.state.outcomes).filter(([id, v]) => tasks.has(id) && v && ['success', 'failure'].includes(v)));
    }
    private validateRecord(r: UsageRecord): void {
        if (!r || typeof r.id !== 'string' || r.id.length > 300 || typeof r.taskId !== 'string' || r.taskId.length > 300 ||
            !['tokonomics', 'claude-jsonl'].includes(r.source) || typeof r.model !== 'string' || r.model.length > 160 ||
            typeof r.provider !== 'string' || !Number.isFinite(r.timestamp) || !Number.isFinite(r.receivedAt) ||
            !Array.isArray(r.findings) || !['observed_usage', 'input_projection', 'unavailable'].includes(r.evidence)) throw new Error('Invalid usage record.');
        for (const n of [r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens]) {
            if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid usage count.');
        }
        if ((r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0) > r.inputTokens) throw new Error('Cache categories exceed inclusive input.');
        if (r.costUSD !== null && (!Number.isFinite(r.costUSD) || r.costUSD < 0)) throw new Error('Invalid usage cost.');
        if (r.avoidedCostUSD !== null && !Number.isFinite(r.avoidedCostUSD)) throw new Error('Invalid avoided cost.');
    }
}
function validateBudget(rule: BudgetRule): void {
    if (!rule || !['task', 'daily', 'monthly'].includes(rule.scope) || !Number.isFinite(rule.limitUSD) || rule.limitUSD <= 0 || rule.limitUSD > 1000000 ||
        !Number.isFinite(rule.alertPercent) || rule.alertPercent <= 0 || rule.alertPercent > 100) throw new Error('Budget must be $0–$1,000,000 (exclusive of zero), with an alert percentage in (0,100].');
}
