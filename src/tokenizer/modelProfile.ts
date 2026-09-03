/**
 * Tokonomics Data-Driven Model Profile & Capability Matrix
 * Configurable provider/model capability profiles, prompt caching economics, and live pricing curves.
 */

export interface ModelCapabilityMatrix {
    toolCalling: boolean;
    structuredOutput: boolean;
    vision: boolean;
    reasoning: boolean;
    promptCaching: boolean;
    maxOutputTokens: number;
}

export interface ModelPricingCurve {
    inputCostPer1M: number;       // Standard uncached input cost
    cachedInputCostPer1M: number; // Cached read cost
    cacheWriteCostPer1M?: number; // Cache creation/write cost (if applicable, e.g. Anthropic)
    cacheStorageCostPerHourPer1M?: number; // Storage duration fee (e.g. Gemini context caching)
    outputCostPer1M: number;      // Output token cost
}

export interface ModelCachePolicy {
    supported: boolean;
    minPrefixTokens: number;        // Minimum tokens required to trigger cache (e.g. 1024 for Anthropic, 32768 for Gemini Pro)
    blockIncrementTokens: number;   // Incremental block alignment (e.g. 1024 or 128)
    discountRatio: number;          // Nominal discount ratio
    supportsImplicitCaching: boolean; // e.g. OpenAI / Gemini 2.5+ automatic caching
    supportsExplicitHeaders: boolean; // e.g. Anthropic cache_control: { type: "ephemeral" }
    defaultTtlSeconds?: number;     // e.g. 300s
}

export interface ModelProfile {
    provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'generic';
    modelId: string;
    displayName: string;
    contextWindow: number;
    capabilities: ModelCapabilityMatrix;
    pricing: ModelPricingCurve;
    cachePolicy: ModelCachePolicy;
    targetImageResolution: number;
}

export const CLAUDE_SONNET_PROFILE: ModelProfile = {
    provider: 'anthropic',
    modelId: 'claude-3-7-sonnet',
    displayName: 'Claude 3.7 / 3.5 Sonnet',
    contextWindow: 200_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: true,
        vision: true,
        reasoning: true,
        promptCaching: true,
        maxOutputTokens: 8192
    },
    pricing: {
        inputCostPer1M: 3.00,
        cachedInputCostPer1M: 0.30,
        cacheWriteCostPer1M: 3.75,
        outputCostPer1M: 15.00
    },
    cachePolicy: {
        supported: true,
        minPrefixTokens: 1024,
        blockIncrementTokens: 1024,
        discountRatio: 0.90,
        supportsImplicitCaching: false,
        supportsExplicitHeaders: true,
        defaultTtlSeconds: 300
    },
    targetImageResolution: 1568
};

export const CLAUDE_OPUS_PROFILE: ModelProfile = {
    provider: 'anthropic',
    modelId: 'claude-opus-4',
    displayName: 'Claude Opus (Current Generation)',
    contextWindow: 200_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: true,
        vision: true,
        reasoning: true,
        promptCaching: true,
        maxOutputTokens: 8192
    },
    pricing: {
        inputCostPer1M: 15.00,
        cachedInputCostPer1M: 1.50,
        cacheWriteCostPer1M: 18.75,
        outputCostPer1M: 75.00
    },
    cachePolicy: {
        supported: true,
        minPrefixTokens: 1024,
        blockIncrementTokens: 1024,
        discountRatio: 0.90,
        supportsImplicitCaching: false,
        supportsExplicitHeaders: true,
        defaultTtlSeconds: 300
    },
    targetImageResolution: 1568
};

export const GPT_FLAGSHIP_PROFILE: ModelProfile = {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o / GPT-5 Series',
    contextWindow: 128_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: true,
        vision: true,
        reasoning: true,
        promptCaching: true,
        maxOutputTokens: 16384
    },
    pricing: {
        inputCostPer1M: 2.50,
        cachedInputCostPer1M: 1.25,
        outputCostPer1M: 10.00
    },
    cachePolicy: {
        supported: true,
        minPrefixTokens: 1024,
        blockIncrementTokens: 128,
        discountRatio: 0.50,
        supportsImplicitCaching: true,
        supportsExplicitHeaders: false
    },
    targetImageResolution: 2048
};

export const DEEPSEEK_V3_PROFILE: ModelProfile = {
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    displayName: 'DeepSeek-V3 / R1',
    contextWindow: 64_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        reasoning: true,
        promptCaching: true,
        maxOutputTokens: 8192
    },
    pricing: {
        inputCostPer1M: 0.14,
        cachedInputCostPer1M: 0.014,
        outputCostPer1M: 0.28
    },
    cachePolicy: {
        supported: true,
        minPrefixTokens: 64,
        blockIncrementTokens: 64,
        discountRatio: 0.90,
        supportsImplicitCaching: true,
        supportsExplicitHeaders: false
    },
    targetImageResolution: 1024
};

export const GEMINI_PRO_PROFILE: ModelProfile = {
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 / 3.x Pro',
    contextWindow: 2_000_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: true,
        vision: true,
        reasoning: true,
        promptCaching: true,
        maxOutputTokens: 8192
    },
    pricing: {
        inputCostPer1M: 1.25,
        cachedInputCostPer1M: 0.3125,
        cacheStorageCostPerHourPer1M: 4.50,
        outputCostPer1M: 5.00
    },
    cachePolicy: {
        supported: true,
        minPrefixTokens: 32768,
        blockIncrementTokens: 1024,
        discountRatio: 0.75,
        supportsImplicitCaching: true,
        supportsExplicitHeaders: false
    },
    targetImageResolution: 2048
};

export const GENERIC_DEFAULT_PROFILE: ModelProfile = {
    provider: 'generic',
    modelId: 'generic-llm',
    displayName: 'Standard LLM',
    contextWindow: 128_000,
    capabilities: {
        toolCalling: true,
        structuredOutput: false,
        vision: true,
        reasoning: false,
        promptCaching: false,
        maxOutputTokens: 4096
    },
    pricing: {
        inputCostPer1M: 2.00,
        cachedInputCostPer1M: 2.00,
        outputCostPer1M: 6.00
    },
    cachePolicy: {
        supported: false,
        minPrefixTokens: 0,
        blockIncrementTokens: 0,
        discountRatio: 0.0,
        supportsImplicitCaching: false,
        supportsExplicitHeaders: false
    },
    targetImageResolution: 1024
};

export class ModelProfileRegistry {
    private static customProfiles: Map<string, ModelProfile> = new Map();
    private static readonly MAX_CUSTOM_PROFILES = 64;

    private static defaultProfiles: Map<string, ModelProfile> = new Map([
        ['claude-3-7-sonnet', CLAUDE_SONNET_PROFILE],
        ['claude-3-5-sonnet', CLAUDE_SONNET_PROFILE],
        ['claude-opus-4', CLAUDE_OPUS_PROFILE],
        ['gpt-4o', GPT_FLAGSHIP_PROFILE],
        ['gpt-5', GPT_FLAGSHIP_PROFILE],
        ['deepseek-chat', DEEPSEEK_V3_PROFILE],
        ['deepseek-reasoner', DEEPSEEK_V3_PROFILE],
        ['gemini-2.5-pro', GEMINI_PRO_PROFILE],
        ['gemini-1.5-pro', GEMINI_PRO_PROFILE],
        ['gemini-flash', GEMINI_PRO_PROFILE]
    ]);

    public static registerProfile(profile: ModelProfile): void {
        const key = profile.modelId.toLowerCase();
        this.customProfiles.delete(key);
        this.customProfiles.set(key, profile);
        while (this.customProfiles.size > this.MAX_CUSTOM_PROFILES) {
            const oldest = this.customProfiles.keys().next().value;
            if (oldest === undefined) break;
            this.customProfiles.delete(oldest);
        }
    }

    public static getProfile(modelIdOrName?: string): ModelProfile {
        if (!modelIdOrName) return GENERIC_DEFAULT_PROFILE;
        const normalized = modelIdOrName.toLowerCase().trim();

        // 1. Check custom user profiles first
        if (this.customProfiles.has(normalized)) {
            return this.customProfiles.get(normalized)!;
        }

        // 2. Check defaults
        for (const [key, profile] of this.defaultProfiles.entries()) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return profile;
            }
        }

        if (normalized.includes('opus')) return CLAUDE_OPUS_PROFILE;
        if (normalized.includes('claude') || normalized.includes('anthropic') || normalized.includes('sonnet')) return CLAUDE_SONNET_PROFILE;
        if (normalized.includes('gpt') || normalized.includes('openai')) return GPT_FLAGSHIP_PROFILE;
        if (normalized.includes('deepseek')) return DEEPSEEK_V3_PROFILE;
        if (normalized.includes('gemini') || normalized.includes('google')) return GEMINI_PRO_PROFILE;

        return GENERIC_DEFAULT_PROFILE;
    }

    public static getAllProfiles(): ModelProfile[] {
        const merged = new Map([...this.defaultProfiles, ...this.customProfiles]);
        return Array.from(merged.values());
    }

    public static clearCustomProfiles(): void {
        this.customProfiles.clear();
    }
}
