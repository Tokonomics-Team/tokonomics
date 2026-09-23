import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CostCalculator, ratesForInput } from '../src/cost/costCalculator';
import { PricingCatalog, defaultPricingCatalog } from '../src/cost/pricingCatalog';
import { parseClaudeUsage } from '../src/finops/claudeUsage';
import { UsageStore, UsageRecord } from '../src/finops/usageStore';
import { readUsageBatch } from '../src/finops/usageFileReader';
import { TaskContext } from '../src/finops/taskContext';
import { recommendModels, ModelCandidate } from '../src/finops/modelRecommendation';
import { FinOpsService } from '../src/finops/finOpsService';
import { spendDashboardScript, spendCommands } from '../src/ui/spendDashboard';
import { DashboardController } from '../src/ui/dashboardController';

export async function runFinOpsTests(): Promise<void> {
    const now = Date.parse('2026-09-11T12:00:00Z');
    const raw = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 };
    const anthropic = CostCalculator.parseVerifiedProviderUsage(raw, 'a', 'anthropic', 'claude-3-7-sonnet')!;
    assert.strictEqual(anthropic.inputTokens, 1300);
    const cost = CostCalculator.calculateVerifiedReconciledCost(anthropic, 2000);
    assert.strictEqual(cost.actualOptimizedCostUSD, .0021);
    assert.strictEqual(cost.isEstimate, true);
    assert.strictEqual(cost.savingsBasis, 'hypothetical-uncached-input-baseline');
    assert.strictEqual(CostCalculator.parseVerifiedProviderUsage({ inputTokens: 1300, outputTokens: 50, cachedTokens: 1000, cacheWriteTokens: 200 }, 'a', 'anthropic', 'x')!.inputTokens, 1300);
    assert.strictEqual(CostCalculator.parseVerifiedProviderUsage({ prompt_tokens: 1300, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1000 } }, 'a', 'openai', 'x')!.inputTokens, 1300);
    for (const broken of [{ ...raw, input_tokens: -1 }, { ...raw, output_tokens: 1.1 }, { ...raw, cache_read_input_tokens: '100' }, { ...raw, output_tokens: undefined }]) {
        assert.strictEqual(CostCalculator.parseVerifiedProviderUsage(broken, 'a', 'anthropic', 'x'), undefined);
    }
    const rates = { inputCostPer1M: 3, cachedInputCostPer1M: .3, cacheWriteCostPer1M: 3.75, outputCostPer1M: 15,
        cacheWrite1HourCostPer1M: 6, tiers: [{ aboveInputTokens: 200000, inputCostPer1M: 6, cachedInputCostPer1M: .6, outputCostPer1M: 30 }] };
    assert.strictEqual(ratesForInput(rates, 200000).inputCostPer1M, 3);
    assert.strictEqual(ratesForInput(rates, 200001).inputCostPer1M, 6);
    const catalog = new PricingCatalog();
    const price = { provider: 'anthropic', modelId: 'example-model', currency: 'USD', effectiveFrom: '2026-01-01', source: 'reviewed-contract', rates };
    catalog.importSnapshots([price, { ...price, effectiveFrom: '2026-08-01', rates: { ...rates, inputCostPer1M: 4 } }]);
    assert.strictEqual(catalog.resolveStrict('example-model', 'anthropic', Date.parse('2026-05-01')).rates.inputCostPer1M, 3);
    assert.strictEqual(catalog.resolveStrict('example-model', 'anthropic', now).rates.inputCostPer1M, 4);
    assert.throws(() => catalog.importSnapshots([{ ...price, rates: { ...rates, inputCostPer1M: 9 } }]), /overwritten/);
    assert.throws(() => catalog.importSnapshots([{ ...price, currency: 'EUR' }]), /Invalid/);
    assert.throws(() => catalog.importSnapshots([{ ...price, modelId: 'ok' }, { ...price, modelId: 'bad', rates: { inputCostPer1M: -1 } }]), /rate/);
    assert.strictEqual(catalog.find('ok'), undefined, 'Pricing imports must be atomic');

    const line = (id = 'message-1', usage = raw) => JSON.stringify({ type: 'assistant', sessionId: 'session-private', timestamp: new Date(now).toISOString(),
        message: { id, model: 'claude-3-7-sonnet', usage, content: [{ text: 'PRIVATE PROMPT' }] }, cwd: 'SECRET PATH' });
    const observation = parseClaudeUsage(line(), now)!;
    assert.ok(!JSON.stringify(observation).includes('PRIVATE') && !JSON.stringify(observation).includes('SECRET') && !JSON.stringify(observation).includes('session-private'));
    assert.strictEqual(observation.avoidedCostUSD, null);
    assert.strictEqual(observation.inputTokens, 1300);
    assert.strictEqual(parseClaudeUsage(JSON.stringify({ type: 'user', message: { content: 'private' } })), undefined);

    // Scoped / routed model parsing (Bedrock, OpenRouter, Vertex)
    const bedrockLine = JSON.stringify({ type: 'assistant', sessionId: 'session-bedrock', timestamp: new Date(now).toISOString(),
        message: { id: 'msg-bedrock', model: 'anthropic.claude-3-7-sonnet-20250219-v1:0', usage: raw, content: [] } });
    const bedrockObs = parseClaudeUsage(bedrockLine, now)!;
    assert.strictEqual(bedrockObs.model, 'anthropic.claude-3-7-sonnet-20250219-v1:0');

    const openRouterLine = JSON.stringify({ type: 'assistant', sessionId: 'session-openrouter', timestamp: new Date(now).toISOString(),
        message: { id: 'msg-openrouter', model: 'anthropic/claude-3-7-sonnet', usage: raw, content: [] } });
    const openRouterObs = parseClaudeUsage(openRouterLine, now)!;
    assert.strictEqual(openRouterObs.model, 'anthropic/claude-3-7-sonnet');

    const vertexLine = JSON.stringify({ type: 'assistant', sessionId: 'session-vertex', timestamp: new Date(now).toISOString(),
        message: { id: 'msg-vertex', model: 'claude-3-7-sonnet@20250219', usage: raw, content: [] } });
    const vertexObs = parseClaudeUsage(vertexLine, now)!;
    assert.strictEqual(vertexObs.model, 'claude-3-7-sonnet@20250219');

    const badModelLine = JSON.stringify({ type: 'assistant', sessionId: 'session-bad', timestamp: new Date(now).toISOString(),
        message: { id: 'msg-bad', model: 'bad model with spaces', usage: raw, content: [] } });
    assert.throws(() => parseClaudeUsage(badModelLine, now), /Missing Claude session\/message\/model identity/);

    const store = new UsageStore(() => now);
    assert.strictEqual(store.upsert(observation), true);
    assert.strictEqual(store.upsert({ ...observation, receivedAt: now + 1 }), false);
    assert.strictEqual(store.upsert(parseClaudeUsage(line('message-1', { ...raw, output_tokens: 25 }), now + 2)!), false);
    assert.strictEqual(store.upsert(parseClaudeUsage(line('message-1', { ...raw, output_tokens: 100 }), now + 3)!), true);
    assert.strictEqual(store.totals().requests, 1);
    assert.strictEqual(store.totals().outputTokens, 100);
    assert.strictEqual(store.upsert({ ...observation, id: 'old', timestamp: now - 91 * 86400000 }), false);
    store.setBudget({ scope: 'daily', limitUSD: .001, alertPercent: 80 });
    assert.strictEqual(store.takeAlerts().length, 1);
    assert.strictEqual(store.takeAlerts().length, 0);
    const restored = new UsageStore(() => now); restored.restore(JSON.parse(JSON.stringify(store.state)));
    assert.strictEqual(restored.takeAlerts().length, 0, 'Alerts survive restart');
    assert.throws(() => store.setBudget({ scope: 'task', limitUSD: NaN, alertPercent: 80 }));
    store.setBudget({ scope: 'task', limitUSD: 1, alertPercent: 80 });
    assert.strictEqual(store.budgetProgress().find(r => r.scope === 'task')!.active, false);
    assert.strictEqual(store.budgetProgress('different-task').find(r => r.scope === 'task')!.usd, 0);
    const archived = new UsageStore(() => now + 91 * 86400000);
    archived.restore(JSON.parse(JSON.stringify(store.state)));
    assert.strictEqual(archived.state.records.length, 0);
    assert.strictEqual(archived.state.archives.length, 1);
    assert.strictEqual(archived.state.archives[0].totals.requests, 1);
    const later = new UsageStore(() => now + 367 * 86400000); later.restore(archived.state); assert.strictEqual(later.state.archives.length, 0);

    const baseEvent: any = { id: 'compiler-1', sessionId: 'session_chat_participant', taskId: 'task-one', timestamp: now,
        state: 'OPTIMIZATION_COMPLETED', provider: 'anthropic', model: 'claude-3-7-sonnet', optimizedInputTokens: 100,
        savedTokens: 50, projectedOptimizedCostUSD: .003, projectedSavingsUSD: .001, costStatus: 'projected', pricingSource: 'source', stageMetrics: [] };
    const owned = new UsageStore(() => now);
    assert.strictEqual(owned.recordOptimization(baseEvent), false, 'Compilation alone is not spend');
    assert.strictEqual(owned.recordOptimization({ ...baseEvent, state: 'REQUEST_SENT' }), true);
    owned.recordOptimization({ ...baseEvent, state: 'COST_RECONCILED', costState: 'reconciled', observedInputTokens: 1300,
        outputTokens: 50, cachedTokens: 1000, cacheWriteTokens: 200, actualOptimizedCostUSD: .0021, actualSavingsUSD: .004 });
    owned.recordOptimization({ ...baseEvent, state: 'PROMPT_COMPLETED' });
    assert.strictEqual(owned.totals().observedUSD, .0021, 'Completion cannot demote observed usage');
    assert.strictEqual(owned.totals().inputTokens, 1300);
    const active = TaskContext.start();
    assert.strictEqual(TaskContext.resolve('request-a', 'session'), active); TaskContext.end(); TaskContext.start();
    assert.strictEqual(TaskContext.resolve('request-a', 'session'), active, 'In-flight correlation survives task switching'); TaskContext.end();

    const candidate: ModelCandidate = { id: 'current', name: 'Current', maxInputTokens: 300000, maxOutputTokens: 8000, tools: true, vision: true, rates };
    const cheap = { ...candidate, id: 'cheap', name: 'Cheaper', rates: { inputCostPer1M: 1, outputCostPer1M: 3, cachedInputCostPer1M: .1 } };
    const use = { inputTokens: 100000, outputTokens: 1000, requiresTools: true, requiresVision: true };
    assert.strictEqual(recommendModels(candidate, [cheap], use).length, 1);
    assert.strictEqual(recommendModels(candidate, [{ ...cheap, vision: false }], use).length, 0);
    assert.strictEqual(recommendModels(candidate, [{ ...cheap, maxInputTokens: 2000 }], use).length, 0);
    assert.strictEqual(recommendModels(candidate, [cheap], { ...use, qualitySensitive: true }).length, 0);
    assert.strictEqual(recommendModels(candidate, [cheap], { ...use, requiresStructuredOutput: true }).length, 0);
    assert.strictEqual(recommendModels(candidate, [cheap], { ...use, cacheReadTokens: 100000 }).length, 0, 'A cheaper sticker price must not ignore an existing warm cache');
    new Function(spendDashboardScript); // Parse embedded UI JavaScript independently of TS compilation.
    assert.ok(spendCommands.has('importClaudeUsage') && !spendCommands.has('arbitraryCommand'));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-finops-'));
    const file = path.join(root, 'usage.jsonl');
    const registerCommand = vscode.commands.registerCommand;
    // These service instances represent distinct VS Code processes sharing one storage directory.
    (vscode.commands as any).registerCommand = () => ({ dispose() {} });
    try {
        const first = line();
        await fs.promises.writeFile(file, first.slice(0, -4));
        const partial = await readUsageBatch(file); assert.strictEqual(partial.lines.length, 0); assert.strictEqual(partial.cursor.offset, 0);
        await fs.promises.appendFile(file, first.slice(-4) + '\n' + line('message-2'));
        const complete = await readUsageBatch(file, partial.cursor); assert.strictEqual(complete.lines.length, 1);
        const final = await readUsageBatch(file, complete.cursor, true); assert.strictEqual(final.lines.length, 1);
        await fs.promises.writeFile(file, line('rewritten-message') + '\n' + line('extra-message') + '\n');
        const regrown = await readUsageBatch(file, final.cursor); assert.strictEqual(regrown.lines.length, 2, 'Copy-truncate with regrowth must reset the cursor');
        await fs.promises.writeFile(file, '{}\n');
        const truncated = await readUsageBatch(file, final.cursor); assert.deepStrictEqual(truncated.lines, ['{}']);
        await fs.promises.writeFile(file, 'x'.repeat(1024 * 1024 + 1));
        await assert.rejects(() => readUsageBatch(file), /1 MiB/);
        const currentLine = JSON.parse(line()); currentLine.timestamp = new Date().toISOString();
        await fs.promises.writeFile(file, JSON.stringify(currentLine) + '\n');
        const service = new FinOpsService();
        const imported = await service.ingestFile(file); assert.strictEqual(imported.accepted, 1);
        assert.strictEqual((await service.ingestFile(file)).accepted, 0);
        const view = service.snapshot('today', 'claude-jsonl'); assert.strictEqual(view.totals.requests, 1); assert.strictEqual(view.totals.avoidedUSD, 0);
        await service.close();

        const subscriptions: any[] = [];
        const context: any = { storageUri: { fsPath: root }, subscriptions };
        const persistent = new FinOpsService(); await persistent.initialize(context);
        await persistent.ingestFile(file);
        persistent.setBudget({ scope: 'monthly', limitUSD: 50, alertPercent: 80 });
        await persistent.flush();
        assert.ok(fs.existsSync(path.join(root, 'task-usage-v1.json')));
        const competing = new FinOpsService(); await competing.initialize({ ...context, subscriptions: [] });
        assert.strictEqual(competing.snapshot().writable, false, 'A second window must not overwrite the first window');
        await competing.close();
        await persistent.close();
        const reopened = new FinOpsService(); await reopened.initialize({ ...context, subscriptions: [] });
        assert.strictEqual(reopened.snapshot().writable, true);
        assert.strictEqual(reopened.store.state.budgets[0].limitUSD, 50);
        assert.strictEqual((await reopened.ingestFile(file)).accepted, 0, 'Replay after restart must not add spend');
        await reopened.close();
        assert.strictEqual(fs.existsSync(path.join(root, 'task-usage-v1.json.lock')), false);

        // Verify Step 9: Stale lock eviction for dead PID and corrupt lock files
        const lockPath = path.join(root, 'task-usage-v1.json.lock');

        // 1. Dead PID lock eviction
        await fs.promises.writeFile(lockPath, '99999999\n');
        assert.strictEqual(fs.existsSync(lockPath), true);
        const deadPidRecovered = new FinOpsService();
        await deadPidRecovered.initialize({ ...context, subscriptions: [] });
        assert.strictEqual(deadPidRecovered.snapshot().writable, true, 'Dead PID lock file must be evicted');
        await deadPidRecovered.close();
        assert.strictEqual(fs.existsSync(lockPath), false);

        // 2. Corrupt/empty lock file older than 2s eviction
        await fs.promises.writeFile(lockPath, 'invalid_pid\n');
        const pastTime = new Date(Date.now() - 5000);
        fs.utimesSync(lockPath, pastTime, pastTime);
        const corruptRecovered = new FinOpsService();
        await corruptRecovered.initialize({ ...context, subscriptions: [] });
        assert.strictEqual(corruptRecovered.snapshot().writable, true, 'Corrupt backdated lock file must be evicted');
        await corruptRecovered.close();
        assert.strictEqual(fs.existsSync(lockPath), false);

        const messages: any[] = []; let receive: (value: any) => Promise<void> = async () => {};
        const controller = new DashboardController();
        const detach = controller.registerWebview({ postMessage: async (m: any) => { messages.push(m); return true; },
            onDidReceiveMessage: (listener: any) => { receive = listener; return { dispose() {} }; } } as any);
        await receive({ action: 'DASHBOARD_READY' });
        assert.ok(messages.some(m => m.type === 'SPEND_UPDATE'));
        await receive({ action: 'CHANGE_SPEND_SOURCE', source: 'claude-jsonl' });
        assert.strictEqual(messages[messages.length - 1].payload.source, 'claude-jsonl');
        const count = messages.length; await receive({ action: 'CHANGE_SPEND_SOURCE', source: '<script>' }); assert.strictEqual(messages.length, count);
        detach(); controller.dispose();
    } finally {
        (vscode.commands as any).registerCommand = registerCommand;
        // This test created this single temporary file and directory.
        for (const name of ['usage.jsonl', 'task-usage-v1.json', 'task-usage-v1.json.lock', 'task-usage-v1.json.tmp']) await fs.promises.unlink(path.join(root, name)).catch(() => {});
        await fs.promises.rmdir(root);
    }
    console.log('FinOps: normalization, pricing, replay, privacy, budgets, retention, correlation, recommendations, file boundaries and UI syntax passed.');
}
