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
}

export interface EnterprisePricingOverride {
    provider: string;
    modelId: string;
    currency: string;
    effectiveFrom: string;
    source: string;
    rates: ModelPricingCurve;
}

const CATALOG_VERSION = '2026-09-02.v1';

/**
 * Pinned reference prices. They are versioned inputs, not a claim that a vendor's
 * live price is unchanged; enterprise contracts can replace them explicitly.
 */
const BUNDLED_PRICES: readonly PricingCatalogEntry[] = Object.freeze([
    entry('anthropic', 'claude-3-7-sonnet', ['claude-3-5-sonnet'], '2025-02-19', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 3, 15, 0.30, 3.75),
    entry('anthropic', 'claude-opus-4', [], '2025-05-22', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 15, 75, 1.50, 18.75),
    entry('openai', 'gpt-4o', [], '2024-11-20', 'https://openai.com/api/pricing/', 2.50, 10, 1.25),
    entry('deepseek', 'deepseek-chat', ['deepseek-reasoner'], '2024-12-26', 'https://api-docs.deepseek.com/quick_start/pricing', 0.14, 0.28, 0.014),
    entry('google', 'gemini-2.5-pro', ['gemini-1.5-pro'], '2025-03-25', 'https://ai.google.dev/gemini-api/docs/pricing', 1.25, 5, 0.3125, undefined, 4.50),
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
    cacheStorage?: number
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
        })
    });
}

export class PricingCatalog {
    private readonly overrides = new Map<string, PricingCatalogEntry>();

    public resolve(modelIdOrAlias: string, provider?: string): PricingCatalogEntry {
        return this.find(modelIdOrAlias, provider) || [...this.overrides.values(), ...BUNDLED_PRICES]
            .find(candidate => candidate.modelId === 'generic-llm')!;
    }

    public resolveStrict(modelIdOrAlias: string, provider?: string): PricingCatalogEntry {
        const matched = this.find(modelIdOrAlias, provider);
        if (!matched) throw new Error(`No versioned pricing entry for ${provider || 'unknown-provider'}/${modelIdOrAlias || 'unknown-model'}.`);
        return matched;
    }

    public find(modelIdOrAlias: string, provider?: string): PricingCatalogEntry | undefined {
        const needle = modelIdOrAlias.toLowerCase().trim();
        const providerNeedle = provider?.toLowerCase().trim();
        const candidates = [...this.overrides.values(), ...BUNDLED_PRICES];
        return candidates.find(candidate =>
            (!providerNeedle || candidate.provider === providerNeedle) &&
            (needle === candidate.modelId || needle.startsWith(`${candidate.modelId}-`) ||
                candidate.aliases.some(alias => needle === alias || needle.startsWith(`${alias}-`)))
        );
    }

    public registerEnterpriseOverride(override: EnterprisePricingOverride): PricingCatalogEntry {
        if (!override.source.trim()) throw new Error('Enterprise pricing overrides require an auditable source.');
        for (const [name, rate] of Object.entries(override.rates)) {
            if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) throw new Error(`Invalid pricing rate ${name}.`);
        }
        const resolved: PricingCatalogEntry = Object.freeze({
            id: `enterprise:${override.provider}:${override.modelId}:${override.effectiveFrom}`,
            provider: override.provider.toLowerCase(),
            modelId: override.modelId.toLowerCase(),
            aliases: Object.freeze([]),
            currency: override.currency,
            effectiveFrom: override.effectiveFrom,
            catalogVersion: `${CATALOG_VERSION}+enterprise`,
            sourceUrl: override.source,
            rates: Object.freeze({ ...override.rates })
        });
        this.overrides.set(resolved.modelId, resolved);
        return resolved;
    }

    public clearEnterpriseOverrides(): void { this.overrides.clear(); }
    public listBundled(): readonly PricingCatalogEntry[] { return BUNDLED_PRICES; }
}

export const defaultPricingCatalog = new PricingCatalog();
