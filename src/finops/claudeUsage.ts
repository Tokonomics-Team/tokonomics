import { CostCalculator } from '../cost/costCalculator';
import { hashId, UsageRecord } from './usageStore';

/** Claude assistant JSONL v1. Only allowlisted metadata escapes the parser. */
export function parseClaudeUsage(line: string, receivedAt = Date.now()): UsageRecord | undefined {
    const row = JSON.parse(line);
    if (!row || row.type !== 'assistant' || !row.message?.usage) return undefined;
    const message = row.message;
    if (typeof row.sessionId !== 'string' || row.sessionId.length > 300 || typeof message.id !== 'string' || message.id.length > 300 ||
        typeof message.model !== 'string' || !/^[a-zA-Z0-9._:@/-]{1,150}$/.test(message.model)) throw new Error('Missing Claude session/message/model identity.');
    const timestamp = Date.parse(row.timestamp);
    if (!Number.isFinite(timestamp)) throw new Error('Claude usage requires a timestamp.');
    const id = `claude:${hashId(`${row.sessionId}:${message.id}`)}`;
    const usage = CostCalculator.parseVerifiedProviderUsage(message.usage, id, 'anthropic', message.model);
    if (!usage) throw new Error('Incomplete or invalid Claude token usage.');
    usage.timestamp = timestamp;
    let costUSD: number | null = null;
    let priceVersion: string | undefined;
    let priceSource: string | undefined;
    try {
        const cost = CostCalculator.calculateVerifiedReconciledCost(usage, usage.inputTokens);
        costUSD = cost.actualOptimizedCostUSD;
        priceVersion = cost.pricingCatalogVersion;
        priceSource = cost.pricingSource;
    } catch { /* Usage remains useful when the matching historical price is unavailable. */ }
    return { id, taskId: `claude_session_${hashId(row.sessionId)}`, timestamp, receivedAt,
        source: 'claude-jsonl', parserVersion: 'claude-assistant-jsonl-v1', provider: 'anthropic', model: message.model,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheWriteInputTokens, costUSD, avoidedCostUSD: null, evidence: 'observed_usage',
        priceVersion, priceSource, inputSemantics: 'inclusive', status: 'imported', savingsTokens: null,
        findings: ['Observed Claude session usage. Task boundaries and optimization savings are not inferred from this log.'] };
}
