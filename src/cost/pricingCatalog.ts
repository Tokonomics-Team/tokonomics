import { ModelPricingCurve } from '../tokenizer/modelProfile';

export interface PricingCatalogEntry {
    id: string;
    provider: string;
    modelId: string;
    aliases: readonly string[];
    currency: string;
    effectiveFrom: string;
    catalogVersion: string;
    sourceUrl: string;
    rates: ModelPricingCurve;
    isDeprecated?: boolean;
    deprecationNotice?: string;
}

export interface EnterprisePricingOverride {
    provider: string;
    modelId: string;
    currency: string;
    effectiveFrom: string;
    source: string;
    rates: ModelPricingCurve;
}

const CATALOG_VERSION = '2026-09-06.v3';

/**
 * Pinned reference prices. They are versioned inputs, not a claim that a vendor's
 * live price is unchanged; enterprise contracts can replace them explicitly.
 */
const BUNDLED_PRICES: readonly PricingCatalogEntry[] = Object.freeze([
    entry('anthropic', 'claude-sonnet-5', [], '2026-09-01', 'https://platform.claude.com/docs/en/about-claude/pricing', 2, 10, 0.20, 2.50),
    entry('anthropic', 'claude-sonnet-4-6', ['claude-sonnet-4-5'], '2025-09-29', 'https://platform.claude.com/docs/en/about-claude/pricing', 3, 15, 0.30, 3.75),
    entry('anthropic', 'claude-3-7-sonnet', ['claude-3-5-sonnet'], '2025-02-19', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 3, 15, 0.30, 3.75),
    entry('anthropic', 'claude-3-5-haiku', [], '2024-10-22', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 0.80, 4.00, 0.08, 1.00),
    entry('anthropic', 'claude-opus-4', [], '2025-05-22', 'https://docs.anthropic.com/en/docs/about-claude/model-deprecations', 15, 75, 1.50, 18.75, undefined, true, 'Claude Opus 4 was retired on June 15, 2026. Migrate to Claude 3.7 Sonnet or newer.'),
    entry('openai', 'gpt-4o', [], '2024-11-20', 'https://openai.com/api/pricing/', 2.50, 10, 1.25),
    entry('openai', 'gpt-5.4', [], '2026-03-05', 'https://openai.com/api/pricing/', 2.50, 15, 0.25),
    entry('openai', 'gpt-5.6-sol', [], '2026-08-01', 'https://platform.openai.com/docs/models/compare', 4, 20, 0.40),
    entry('openai', 'gpt-5.6-terra', [], '2026-08-01', 'https://platform.openai.com/docs/models/compare', 2, 12, 0.20),
    entry('deepseek', 'deepseek-chat', ['deepseek-reasoner'], '2024-12-26', 'https://api-docs.deepseek.com/quick_start/pricing', 0.14, 0.28, 0.014),
    entry('deepseek', 'deepseek-v4-flash', [], '2026-07-24', 'https://api-docs.deepseek.com/quick_start/pricing', 0.14, 0.28, 0.0028),
    entry('deepseek', 'deepseek-v4-pro', [], '2026-07-24', 'https://api-docs.deepseek.com/quick_start/pricing', 0.435, 0.87, 0.003625),
    entry('google', 'gemini-2.5-pro', ['gemini-1.5-pro'], '2025-03-25', 'https://ai.google.dev/gemini-api/docs/pricing', 1.25, 5, 0.3125, undefined, 4.50),
    entry('google', 'gemini-3.8-flash', [], '2026-08-01', 'https://ai.google.dev/gemini-api/docs/pricing', 0.75, 3.75, 0.75),
    entry('generic', 'generic-llm', ['generic'], '2026-09-02', 'internal:generic-reference', 2, 6, 2)
]);

function entry(
    provider: string,
    modelId: string,
    aliases: readonly string[],
    effectiveFrom: string,
    sourceUrl: string,
    input: number,
    output: number,
    cacheRead: number,
    cacheWrite?: number,
    cacheStorage?: number,
    isDeprecated?: boolean,
    deprecationNotice?: string
): PricingCatalogEntry {
    return Object.freeze({
        id: `${provider}:${modelId}:${effectiveFrom}`,
        provider,
        modelId,
        aliases: Object.freeze([...aliases]),
        currency: 'USD',
        effectiveFrom,
        catalogVersion: CATALOG_VERSION,
        sourceUrl,
        rates: Object.freeze({
            inputCostPer1M: input,
            outputCostPer1M: output,
            cachedInputCostPer1M: cacheRead,
            cacheWriteCostPer1M: cacheWrite,
            cacheStorageCostPerHourPer1M: cacheStorage
        }),
        isDeprecated: isDeprecated === true,
        deprecationNotice: deprecationNotice || undefined
    });
}

export class PricingCatalog {
    private readonly overrides = new Map<string, PricingCatalogEntry>();

    public resolve(modelIdOrAlias: string, provider?: string): PricingCatalogEntry {
        return this.find(modelIdOrAlias, provider) || [...this.overrides.values(), ...BUNDLED_PRICES]
            .find(candidate => candidate.modelId === 'generic-llm')!;
    }

    public resolveStrict(modelIdOrAlias: string, provider?: string, at?: number): PricingCatalogEntry {
        const matched = this.find(modelIdOrAlias, provider, at);
        if (!matched) throw new Error(`No versioned pricing entry for ${provider || 'unknown-provider'}/${modelIdOrAlias || 'unknown-model'}.`);
        return matched;
    }

    public find(modelIdOrAlias: string, provider?: string, at?: number): PricingCatalogEntry | undefined {
        const needle = modelIdOrAlias.toLowerCase().trim();
        const providerNeedle = provider?.toLowerCase().trim();
        const eligible = (entries: readonly PricingCatalogEntry[]) => entries
            .filter(candidate => Date.parse(candidate.effectiveFrom) <= (at ?? Date.now()))
            .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom));
        const candidates = [...eligible([...this.overrides.values()]), ...eligible(BUNDLED_PRICES)];
        return candidates.find(candidate =>
            (!providerNeedle || candidate.provider === providerNeedle) &&
            (needle === candidate.modelId || needle.startsWith(`${candidate.modelId}-`) ||
                candidate.aliases.some(alias => needle === alias || needle.startsWith(`${alias}-`)))
        );
    }

    public registerEnterpriseOverride(override: EnterprisePricingOverride): PricingCatalogEntry {
        if (!override.source.trim()) throw new Error('Enterprise pricing overrides require an auditable source.');
        validateRates(override.rates);
        if (!/^[A-Z]{3}$/.test(override.currency) || !Number.isFinite(Date.parse(override.effectiveFrom))) throw new Error('Pricing requires a currency code and a valid effective date.');
        const resolved: PricingCatalogEntry = Object.freeze({
            id: `enterprise:${override.provider}:${override.modelId}:${override.effectiveFrom}`,
            provider: override.provider.toLowerCase(),
            modelId: override.modelId.toLowerCase(),
            aliases: Object.freeze([]),
            currency: override.currency,
            effectiveFrom: override.effectiveFrom,
            catalogVersion: `${CATALOG_VERSION}+enterprise`,
            sourceUrl: override.source,
            rates: Object.freeze({ ...override.rates, tiers: override.rates.tiers && Object.freeze(override.rates.tiers.map(t => Object.freeze({ ...t }))) })
        });
        this.overrides.set(resolved.id, resolved);
        return resolved;
    }

    public clearEnterpriseOverrides(): void { this.overrides.clear(); }
    public listBundled(): readonly PricingCatalogEntry[] { return BUNDLED_PRICES; }
    public listOverrides(): readonly PricingCatalogEntry[] { return [...this.overrides.values()]; }

    /** Validate the entire import before changing the catalog. Existing historical versions survive. */
    public importSnapshots(value: unknown): number {
        if (!Array.isArray(value) || value.length === 0 || value.length > 1000) throw new Error('Expected 1–1000 pricing entries.');
        const temporary = new PricingCatalog();
        for (const row of value) {
            if (!row || typeof row !== 'object' || row.currency !== 'USD' || !/^[a-z0-9._-]{1,100}$/.test(row.provider) ||
                !/^[a-z0-9._-]{1,150}$/.test(row.modelId) || typeof row.source !== 'string' || row.source.length > 500 ||
                typeof row.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom) ||
                !Number.isFinite(Date.parse(row.effectiveFrom)) || new Date(row.effectiveFrom).toISOString().slice(0, 10) !== row.effectiveFrom) {
                throw new Error('Invalid provider, model ID or price source.');
            }
            if (temporary.listOverrides().some(p => p.provider === row.provider && p.modelId === row.modelId && p.effectiveFrom === row.effectiveFrom)) {
                throw new Error('Duplicate model/effective-date entries in price import.');
            }
            temporary.registerEnterpriseOverride(row);
        }
        if (new Set([...this.overrides.keys(), ...temporary.listOverrides().map(p => p.id)]).size > 1000) throw new Error('Pricing snapshot limit is 1000.');
        for (const row of temporary.listOverrides()) {
            const old = this.overrides.get(row.id);
            if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('A historical price version cannot be overwritten. Use a new effective date.');
        }
        for (const row of temporary.listOverrides()) this.overrides.set(row.id, row);
        return temporary.listOverrides().length;
    }
}

function validateRates(rates: ModelPricingCurve): void {
    if (!rates || typeof rates !== 'object') throw new Error('Pricing rates required.');
    for (const name of ['inputCostPer1M', 'outputCostPer1M', 'cachedInputCostPer1M'] as const) {
        if (typeof rates[name] !== 'number' || !Number.isFinite(rates[name]) || rates[name] < 0) throw new Error(`Invalid pricing rate ${name}.`);
    }
    for (const [name, rate] of Object.entries(rates)) {
        if (name !== 'tiers' && rate !== undefined && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0)) throw new Error(`Invalid pricing rate ${name}.`);
    }
    if (rates.tiers !== undefined) {
        if (!Array.isArray(rates.tiers) || rates.tiers.length > 20) throw new Error('Invalid pricing tiers.');
        let previous = -1;
        for (const tier of rates.tiers) {
            if (!tier || 'tiers' in tier) throw new Error('Nested pricing tiers are not supported.');
            if (!Number.isSafeInteger(tier.aboveInputTokens) || tier.aboveInputTokens <= previous) throw new Error('Tier thresholds must be ascending nonnegative integers.');
            previous = tier.aboveInputTokens;
            validateRates(tier);
        }
    }
}

export const defaultPricingCatalog = new PricingCatalog();
