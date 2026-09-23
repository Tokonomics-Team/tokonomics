import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OptimizationEventBus } from '../events/optimizationEvent';
import { RequestLedger } from '../events/requestLedger';
import { defaultPricingCatalog } from '../cost/pricingCatalog';
import { TaskContext } from './taskContext';
import { addRecord, BudgetRule, emptyTotals, localDay, UsageRecord, UsageStore } from './usageStore';
import { parseClaudeUsage } from './claudeUsage';
import { FileCursor, readUsageBatch } from './usageFileReader';
import { ModelCandidate, recommendModels } from './modelRecommendation';
import { ModelProfileRegistry } from '../tokenizer/modelProfile';

type WatchState = { file: string; cursor: FileCursor };
export class FinOpsService {
    private static instance: FinOpsService;
    public readonly store = new UsageStore();
    private listeners = new Set<() => void>();
    private unsubscribe?: () => void;
    private saveTimer?: ReturnType<typeof setTimeout>;
    private watchTimer?: ReturnType<typeof setTimeout>;
    private saveQueue: Promise<void> = Promise.resolve();
    private watch?: WatchState;
    private file?: string;
    private lock?: string;
    private disposed = false;
    private busy = false;
    private writable = true;
    private recommendationMessages: string[] = [];
    public status = 'Local usage; no external source connected.';
    public static getInstance(): FinOpsService { return this.instance ??= new FinOpsService(); }
    public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.disposed = false;
        this.unsubscribe?.();
        const root = context.storageUri?.fsPath;
        if (root) {
            try { await fs.promises.mkdir(root, { recursive: true }); }
            catch { this.writable = false; this.status = 'Usage storage is unavailable; context optimization remains available.'; }
            this.file = path.join(root, 'task-usage-v1.json');
            this.lock = `${this.file}.lock`;
            try {
                let acquired = false;
                const maxAttempts = 5;
                for (let attempt = 0; attempt < maxAttempts && !acquired; attempt++) {
                    try {
                        const handle = await fs.promises.open(this.lock, 'wx');
                        await handle.writeFile(`${process.pid}\n${Date.now()}`);
                        await handle.close();
                        acquired = true;
                        break;
                    } catch (error: any) {
                        if (error.code !== 'EEXIST' && error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
                        let stat: fs.Stats | undefined;
                        try { stat = await fs.promises.stat(this.lock); }
                        catch (statErr: any) { if (statErr.code === 'ENOENT') continue; }

                        let pid = 0;
                        try {
                            const raw = await fs.promises.readFile(this.lock, 'utf8');
                            pid = Number(raw.trim().split('\n')[0]);
                        } catch (readErr: any) {
                            if (readErr.code === 'ENOENT') continue;
                        }

                        const isPidValid = Number.isSafeInteger(pid) && pid > 0;
                        const fileAgeMs = stat ? Date.now() - stat.mtimeMs : 0;
                        let alive = false;
                        if (isPidValid) {
                            try {
                                process.kill(pid, 0);
                                alive = true;
                            } catch (e: any) {
                                if (e.code === 'ESRCH') alive = false;
                                else if (e.code === 'EPERM') alive = fileAgeMs <= 10000;
                            }
                        }

                        if (!alive || (!isPidValid && fileAgeMs > 2000)) {
                            try { await fs.promises.unlink(this.lock); }
                            catch (unlinkErr: any) { if (unlinkErr.code !== 'ENOENT') { /* retry next backoff */ } }
                        } else if (attempt === maxAttempts - 1) {
                            throw new Error('Usage storage is open in another window.');
                        }

                        const backoffMs = 15 * Math.pow(2, attempt) + Math.floor(Math.random() * 10);
                        await new Promise(r => setTimeout(r, backoffMs));
                    }
                }
                if (!acquired) throw new Error('Usage storage is busy.');
            } catch {
                this.writable = false; this.lock = undefined;
                this.status = 'Usage history is read-only: another window owns storage or its lock is unavailable.';
            }
            try {
                const stat = await fs.promises.stat(this.file);
                if (stat.size > 20 * 1024 * 1024) throw new Error('Usage history exceeds 20 MiB.');
                const saved = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
                this.store.restore(saved.usage);
                if (saved.prices?.length) defaultPricingCatalog.importSnapshots(saved.prices);
                if (saved.watch && typeof saved.watch.file === 'string' && Number.isSafeInteger(saved.watch.cursor?.offset) && saved.watch.cursor.offset >= 0) this.watch = saved.watch;
            } catch (e: any) {
                if (e.code !== 'ENOENT') { this.writable = false; this.status = 'Usage history could not be loaded; preserved on disk. Export or repair it before resuming collection.'; }
            }
        } else {
            this.status = 'Temporary window: usage is in memory. Open a workspace for persistent history.';
        }
        if (this.writable) {
            for (const event of RequestLedger.getInstance().getLatestRequestEvents()) this.store.recordOptimization(event);
            this.unsubscribe = OptimizationEventBus.getInstance().subscribe(event => {
                try { if (this.store.recordOptimization(event)) this.changed(event.taskId); }
                catch { this.status = 'Usage history is full or an observation was invalid. Export history to inspect it.'; this.notify(); }
            });
            if (this.watch && vscode.workspace.isTrusted) this.scheduleWatch();
        }
        const commands: Record<string, () => Promise<void> | void> = {
            startTask: () => { this.requireWritable(); TaskContext.start(); this.changed(); vscode.window.showInformationMessage('New Tokonomics task started. Subsequent requests in this window belong to it.'); },
            endTask: () => { TaskContext.end(); this.changed(); },
            setSpendBudget: () => this.configureBudget(),
            importClaudeUsage: () => this.importFile(),
            watchClaudeUsage: () => this.startWatch(),
            stopUsageWatcher: () => { this.watch = undefined; if (this.watchTimer) clearTimeout(this.watchTimer); this.status = 'External usage watcher stopped.'; this.changed(); },
            exportUsage: () => this.exportUsage(),
            importPricing: () => this.importPricing(),
            recordTaskOutcome: () => this.recordOutcome(),
            recommendModel: () => this.recommend(),
            clearUsageHistory: async () => {
                this.requireWritable();
                const answer = await vscode.window.showWarningMessage('Delete local spend history and task outcomes? Budgets and imported prices are retained.', { modal: true }, 'Delete history');
                if (answer !== 'Delete history') return;
                const budgets = this.store.state.budgets;
                this.store.state = new UsageStore().state; this.store.state.budgets = budgets;
                this.store.state.clearedAt = Date.now();
                this.watch = undefined; TaskContext.end(); this.changed();
            }
        };
        for (const [name, handler] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`tokenOptimizer.${name}`, async () => {
            try { await handler(); } catch (error) { void vscode.window.showWarningMessage(error instanceof Error ? error.message : 'Usage action failed.'); }
        }));
        context.subscriptions.push({ dispose: () => this.dispose() });
        this.notify();
    }
    public snapshot(window: string = 'today', source = 'all') {
        this.store.prune();
        const now = Date.now();
        const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
        const since = window === 'today' ? midnight.getTime() : window === '7_days' ? now - 7 * 86400000 :
            window === 'session' ? this.windowStartedAt : now - 365 * 86400000;
        const records = this.store.state.records.filter(r => r.timestamp >= since && (source === 'all' || r.source === source));
        const totals = this.store.totals(records);
        const archives = this.store.state.archives.filter(a => a.day >= localDay(since) && (source === 'all' || a.source === source));
        for (const a of archives) for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += a.totals[key];
        const groups = new Map<string, UsageRecord[]>();
        for (const r of records) {
            let group = groups.get(r.taskId);
            if (!group) { group = []; groups.set(r.taskId, group); }
            group.push(r);
        }
        const tasks = [...groups].map(([id, rows]) => ({ id, source: rows[0].source,
            label: rows[0].source === 'claude-jsonl' ? 'Claude session' : id.startsWith('request_') ? 'Single request' : 'Tokonomics task',
            models: [...new Set(rows.map(r => r.model))].join(', '), timestamp: Math.max(...rows.map(r => r.timestamp)),
            totals: this.store.totals(rows), outcome: this.store.state.outcomes[id] ?? 'unrated' }))
            .sort((a, b) => b.timestamp - a.timestamp);
        const days = new Map<string, ReturnType<UsageStore['totals']>>();
        for (const r of records) { const day = localDay(r.timestamp); const t = days.get(day) ?? emptyTotals();
            addRecord(t, r); days.set(day, t); }
        for (const a of archives) { const t = days.get(a.day) ?? emptyTotals(); for (const key of Object.keys(t) as (keyof typeof t)[]) t[key] += a.totals[key]; days.set(a.day, t); }
        const modelTotals = new Map<string, ReturnType<UsageStore['totals']>>();
        for (const r of records) { const total = modelTotals.get(r.model) ?? emptyTotals(); addRecord(total, r); modelTotals.set(r.model, total); }
        for (const a of archives) { const total = modelTotals.get(a.model) ?? emptyTotals();
            for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += a.totals[key]; modelTotals.set(a.model, total); }
        const models = [...modelTotals].map(([model, total]) => ({ model, ...total })).sort((a, b) => b.requests - a.requests).slice(0, 100);
        const successes = tasks.filter(t => t.outcome === 'success').length;
        const rated = tasks.filter(t => t.outcome !== 'unrated');
        const ratedCost = rated.reduce((sum, t) => sum + t.totals.observedUSD + t.totals.projectedUSD, 0);
        const findings = [...new Map(records.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
            .flatMap(r => r.findings.map(text => ({ text, requestId: r.requestId })))
            .map(finding => [JSON.stringify([finding.requestId, finding.text]), finding])).values()];
        return { window, source, totals, tasks: tasks.slice(0, 100), taskCount: tasks.length, models,
            days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, ...total })),
            findings,
            budgets: this.store.budgetProgress(TaskContext.current()), activeTask: TaskContext.current(),
            activeTaskTotals: TaskContext.current() ? this.store.totals(this.store.state.records.filter(r => r.taskId === TaskContext.current())) : null,
            ratedTasks: rated.length, successfulTasks: successes,
            costPerSuccess: successes && rated.every(t => t.totals.pricedRequests === t.totals.requests) ? ratedCost / successes : null,
            costPerSuccessPartial: rated.some(t => t.totals.observedRequests < t.totals.requests),
            recommendations: this.recommendationMessages, watching: Boolean(this.watch), status: this.status, writable: this.writable,
            lastReceivedAt: records.length ? Math.max(...records.map(r => r.receivedAt)) : null,
            retention: '90 days of requests (10,000 maximum); daily aggregates retained for 365 days. External sessions are not inferred tasks. Costs are estimates, not bills.' };
    }
    private readonly windowStartedAt = Date.now();
    public setBudget(rule: BudgetRule): void { this.requireWritable(); this.store.setBudget(rule); this.changed(TaskContext.current()); }
    public removeBudget(scope: BudgetRule['scope']): void { this.requireWritable(); this.store.removeBudget(scope); this.changed(); }
    private async configureBudget(): Promise<void> {
        this.requireWritable();
        const scope = await vscode.window.showQuickPick(['task', 'daily', 'monthly'], { placeHolder: 'Budget scope (advisory, never stops another agent)' });
        if (!scope) return;
        const limit = await vscode.window.showInputBox({ prompt: 'USD limit; 0 removes this budget', validateInput: v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000 && v.trim() ? undefined : 'Enter a number from 0 to 1,000,000.' });
        if (limit === undefined) return;
        if (Number(limit) === 0) this.removeBudget(scope as BudgetRule['scope']);
        else this.setBudget({ scope: scope as BudgetRule['scope'], limitUSD: Number(limit), alertPercent: 80 });
    }
    private async chooseFile(label: string, extension: string): Promise<string | undefined> {
        const selected = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFiles: true, canSelectFolders: false,
            openLabel: label, filters: { [extension]: [extension] } });
        const uri = selected?.[0];
        if (uri && uri.scheme !== 'file') throw new Error('Select a file on the extension host (local, WSL, SSH or container host).');
        return uri?.fsPath;
    }
    public async ingestFile(file: string): Promise<{ accepted: number; invalid: number; ignored: number }> {
        this.requireWritable();
        if (this.busy) throw new Error('Another usage import is running.');
        this.busy = true;
        const result = { accepted: 0, invalid: 0, ignored: 0 };
        try {
            const stat = await fs.promises.stat(file);
            if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('Select a JSONL file up to 50 MiB.');
            let cursor: FileCursor = { offset: 0, identity: '' };
            let more = true;
            let totalBytes = 0;
            while (more && !this.disposed) {
                const previousOffset = cursor.offset;
                const batch = await readUsageBatch(file, cursor, true); cursor = batch.cursor; more = batch.more;
                totalBytes += Math.max(0, cursor.offset - previousOffset);
                if (totalBytes > 50 * 1024 * 1024) throw new Error('Usage import exceeded 50 MiB; stop the producer or choose a bounded export.');
                for (const line of batch.lines) {
                    try { const record = parseClaudeUsage(line);
                        if (record && this.store.upsert(record)) result.accepted++; else result.ignored++;
                    } catch (error) {
                        if (error instanceof Error && error.message.includes('history is full')) throw error;
                        result.invalid++;
                    }
                }
            }
            this.status = `Import: ${result.accepted} observations added/updated, ${result.ignored} unchanged/non-usage/old rows, ${result.invalid} invalid rows. JSONL coverage depends on the source.`;
            return result;
        } finally { this.busy = false; this.changed(); }
    }
    private async importFile(): Promise<void> {
        this.requireTrusted(); const file = await this.chooseFile('Import Claude assistant usage (metadata only)', 'jsonl');
        if (file) { await this.ingestFile(file); void vscode.window.showInformationMessage(this.status); }
    }
    private async startWatch(): Promise<void> {
        this.requireWritable(); this.requireTrusted();
        const file = await this.chooseFile('Watch this Claude JSONL file', 'jsonl');
        if (!file) return;
        this.watch = { file, cursor: { offset: 0, identity: '' } }; this.status = 'Watching the selected Claude JSONL file. Only usage metadata is retained.';
        this.scheduleWatch(); this.changed();
    }
    private scheduleWatch(): void {
        if (this.watchTimer) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => { void this.pollWatch(); }, 1000);
    }
    private async pollWatch(): Promise<void> {
        if (!this.watch || this.disposed || !this.writable) return;
        if (!vscode.workspace.isTrusted) { this.status = 'External watcher paused in Restricted Mode.'; this.notify(); this.scheduleWatch(); return; }
        if (this.busy) { this.scheduleWatch(); return; }
        const watch = this.watch;
        try {
            const batch = await readUsageBatch(watch.file, watch.cursor);
            if (this.watch !== watch || this.disposed) return;
            let accepted = 0, invalid = 0;
            for (const line of batch.lines) {
                try { const record = parseClaudeUsage(line); if (record && this.store.upsert(record)) accepted++; }
                catch (error) { if (error instanceof Error && error.message.includes('history is full')) throw error; invalid++; }
            }
            watch.cursor = batch.cursor;
            this.status = `Watching selected Claude log · ${accepted} updates in last poll${invalid ? ` · ${invalid} invalid rows skipped` : ''}.`;
            if (batch.lines.length) this.changed();
        } catch (e: any) {
            if (e.code !== 'ENOENT') { this.watch = undefined; this.status = 'Watcher paused: log format, size or storage limit failed. Choose a usage log to resume.'; this.changed(); return; }
            this.status = 'Waiting for the selected log after rotation or removal.'; this.notify();
        }
        this.scheduleWatch();
    }
    private async exportUsage(): Promise<void> {
        const content = JSON.stringify({ schema: 'tokonomics.usage-export.v1', exportedAt: Date.now(),
            ...this.store.state, prices: this.pricesForSave(), interpretation: this.snapshot('lifetime').retention }, null, 2);
        const document = await vscode.workspace.openTextDocument({ content, language: 'json' }); await vscode.window.showTextDocument(document);
    }
    private async importPricing(): Promise<void> {
        this.requireWritable(); const file = await this.chooseFile('Import versioned USD pricing', 'json'); if (!file) return;
        if ((await fs.promises.stat(file)).size > 1024 * 1024) throw new Error('Pricing file must be at most 1 MiB.');
        const count = defaultPricingCatalog.importSnapshots(JSON.parse(await fs.promises.readFile(file, 'utf8')));
        this.status = `${count} pricing snapshots imported. Existing observations retain their recorded prices.`; this.changed();
    }
    private async recordOutcome(): Promise<void> {
        this.requireWritable();
        const tasks = this.snapshot('lifetime').tasks;
        const choice = await vscode.window.showQuickPick(tasks.map(t => ({ label: `${t.label} · ${new Date(t.timestamp).toLocaleString()}`, description: t.models, id: t.id })), { placeHolder: 'Which task are you rating?' });
        if (!choice) return;
        const outcome = await vscode.window.showQuickPick(['success', 'failure'], { placeHolder: 'Did this task meet your goal? (Self-reported)' });
        if (outcome) { this.store.state.outcomes[choice.id] = outcome as 'success' | 'failure'; this.changed(); }
    }
    private async recommend(): Promise<void> {
        const latest = this.store.state.records.filter(r => r.source === 'tokonomics').sort((a, b) => b.timestamp - a.timestamp)[0];
        if (!latest) throw new Error('Send a Tokonomics request before comparing available models.');
        // Discovery is deliberately user initiated: the host may request consent.
        const models = (await vscode.lm.selectChatModels({})).filter(m => m.vendor !== 'tokonomics');
        const candidate = (m: vscode.LanguageModelChat): ModelCandidate => {
            // Match exact reviewed profile IDs only; broad family guessing is unsafe for recommendations.
            const profile = ModelProfileRegistry.getAllProfiles().find(p => p.modelId === m.id);
            return { id: m.id, name: m.name, maxInputTokens: m.maxInputTokens,
                maxOutputTokens: (m as any).maxOutputTokens ?? profile?.capabilities.maxOutputTokens ?? 0,
                tools: (m as any).capabilities?.toolCalling === true || profile?.capabilities.toolCalling === true,
                vision: (m as any).capabilities?.imageInput === true || profile?.capabilities.vision === true,
                rates: defaultPricingCatalog.find(m.id)?.currency === 'USD' ? defaultPricingCatalog.find(m.id)?.rates : undefined };
        };
        const current = models.find(m => m.id === latest.model);
        const event = latest.requestId ? RequestLedger.getInstance().getLatestRequestEvents().find(e => e.id === latest.requestId) : undefined;
        const output = latest.outputTokens ?? event?.budgetTrace?.outputReserve;
        const suggestions = current && output !== undefined ? recommendModels(candidate(current), models.map(candidate), {
            inputTokens: latest.inputTokens, outputTokens: output,
            cacheReadTokens: latest.cacheReadTokens ?? 0, cacheWriteTokens: latest.cacheWriteTokens ?? 0,
            // Requirements may not survive into a metadata-only event: require both capabilities conservatively.
            requiresTools: true, requiresVision: true, qualitySensitive: !event || ['debug', 'architecture', 'refactor'].includes(event.taskType)
        }) : [];
        this.recommendationMessages = suggestions.length ? suggestions.map(s => `${s.message} Estimated difference ~$${s.savingsUSD.toFixed(2)} (${s.savingsPercent.toFixed(0)}%).${latest.outputTokens === null ? ` Assumes the recorded output reserve of ${output} tokens; actual output is unavailable.` : ''}`) :
            ['No verified cheaper candidate: available prices, capability/output limits, task risk or savings threshold did not support a recommendation.'];
        this.notify();
        void vscode.window.showInformationMessage(this.recommendationMessages[0]);
    }
    private pricesForSave() { return defaultPricingCatalog.listOverrides().map(p => ({ provider: p.provider, modelId: p.modelId,
        currency: p.currency, effectiveFrom: p.effectiveFrom, source: p.sourceUrl, rates: p.rates })); }
    private changed(taskId?: string): void {
        if (this.writable) for (const message of this.store.takeAlerts(taskId ?? TaskContext.current())) void vscode.window.showWarningMessage(message);
        this.notify();
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 250);
    }
    private notify(): void { for (const listener of this.listeners) { try { listener(); } catch { /* UI cannot interrupt collection. */ } } }
    public flush(): Promise<void> {
        if (!this.file || !this.writable) return this.saveQueue;
        const data = JSON.stringify({ usage: this.store.state, prices: this.pricesForSave(), watch: this.watch });
        const file = this.file;
        this.saveQueue = this.saveQueue.then(async () => {
            if (Buffer.byteLength(data) > 20 * 1024 * 1024) throw new Error('Usage storage size exceeded.');
            await fs.promises.writeFile(`${file}.tmp`, data, { mode: 0o600 }); await fs.promises.rename(`${file}.tmp`, file);
        }).catch(() => { this.status = 'Usage history could not be saved. Export it before closing this window.'; this.notify(); });
        return this.saveQueue;
    }
    private requireWritable(): void { if (!this.writable) throw new Error(this.status); }
    private requireTrusted(): void { if (!vscode.workspace.isTrusted) throw new Error('External usage import requires a trusted workspace.'); }
    public async close(): Promise<void> {
        this.disposed = true; this.unsubscribe?.();
        if (this.watchTimer) clearTimeout(this.watchTimer); if (this.saveTimer) clearTimeout(this.saveTimer);
        this.listeners.clear();
        await this.flush();
        if (this.lock) {
            const lockPath = this.lock;
            this.lock = undefined;
            for (let i = 0; i < 3; i++) {
                try {
                    await fs.promises.unlink(lockPath);
                    break;
                } catch (e: any) {
                    if (e.code === 'ENOENT') break;
                    if (i < 2) await new Promise(r => setTimeout(r, 20));
                }
            }
        }
    }
    public dispose(): void { void this.close(); }
}
