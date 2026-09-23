import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SubscriptionError, SubscriptionProvider } from './cliTransport';

export interface SubscriptionChoice {
    id: string; name: string; vendor: string; family: string; version: string; maxInputTokens: number;
    provider: SubscriptionProvider; model?: string;
}

const choice = (provider: SubscriptionProvider, model?: string): SubscriptionChoice => ({
    id: `subscription:${provider}:${model || 'default'}`,
    name: `${provider === 'codex' ? 'Codex' : 'Claude'} subscription / ${model || 'CLI default'}`,
    vendor: 'Subscription login', family: provider, version: 'cli', maxInputTokens: 200000, provider, model
});

/**
 * Model aliases the Claude CLI accepts, newest first.
 *
 * Claude has no local model cache to read, so this list is maintained by hand and each entry is
 * checked against the CLI before it ships: `fable` resolves to claude-fable-5-1, `opus` to
 * claude-opus-5, `sonnet` to claude-sonnet-5, `haiku` to claude-haiku-4-5. Aliases rather than
 * pinned ids on purpose - the CLI resolves each to the current model of that family, so the list
 * does not go stale on the next release. `fable` is the newest family and was missing.
 */
export const CLAUDE_MODEL_ALIASES: readonly string[] = ['fable', 'opus', 'sonnet', 'haiku'];

/** Only identifiers are read from the CLI cache; cached instructions never enter a prompt. */
export function codexModelIds(cache: unknown): string[] {
    const models = (cache as any)?.models;
    if (!Array.isArray(models)) return [];
    return [...new Set<string>(models.filter(m => m?.visibility === 'list' && typeof m.slug === 'string'
        && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(m.slug)).map(m => m.slug))].slice(0, 40);
}

/** Local discovery only. The CLI remains authoritative for current account entitlement. */
export async function subscriptionChoices(): Promise<SubscriptionChoice[]> {
    let ids: string[] = [];
    const home = process.env.CODEX_HOME && path.isAbsolute(process.env.CODEX_HOME)
        ? process.env.CODEX_HOME : path.join(os.homedir(), '.codex');
    try {
        const file = path.join(home, 'models_cache.json');
        if ((await fs.promises.stat(file)).size <= 8 * 1024 * 1024) {
            ids = codexModelIds(JSON.parse(await fs.promises.readFile(file, 'utf8')));
        }
    } catch { /* A missing/stale cache leaves the CLI default available. */ }
    return [choice('codex'), ...ids.map(id => choice('codex', id)), choice('claude'),
        ...CLAUDE_MODEL_ALIASES.map(id => choice('claude', id))];
}

export async function resolveSubscriptionChoice(id: string): Promise<SubscriptionChoice | undefined> {
    if (!id.startsWith('subscription:')) return undefined;
    const found = (await subscriptionChoices()).find(item => item.id === id);
    if (!found) throw new SubscriptionError('That subscription model is no longer listed. Refresh models and choose again.');
    return found;
}
