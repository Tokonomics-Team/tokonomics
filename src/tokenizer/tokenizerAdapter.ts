/**
 * Tokonomics Fast Statistical Token Estimation Adapters
 * 
 * Provides ultra-fast (< 0.01ms), zero-dependency statistical token count estimation
 * calibrated against provider character-to-token ratios for code and prose.
 * 
 * Note: To avoid heavy 5MB+ binary vocabulary tables (WASM tiktoken/SentencePiece)
 * inside the lightweight VS Code extension host, Tokonomics uses statistical estimation
 * for compile-time budget allocation. Authoritative token counts are reconciled
 * downstream from provider responses.
 */

export interface TokenizerAdapter {
    readonly provider: string;
    countTokens(text: string): number;
    encode(text: string): number[];
}

/**
 * 1. OpenAI Token Estimator (Calibrated against cl100k / o200k ratios)
 */
export class OpenAITokenizerAdapter implements TokenizerAdapter {
    public readonly provider: string = 'openai';

    public countTokens(text: string): number {
        if (!text) return 0;
        const isCode = text.includes('{') || text.includes('function') || text.includes('class');
        const factor = isCode ? 3.70 : 4.10;
        return Math.max(1, Math.ceil(text.length / factor));
    }

    /**
     * Generates a synthetic token ID sequence matching estimated token length
     * for internal budget tracking and simulation.
     */
    public encode(text: string): number[] {
        const count = this.countTokens(text);
        return new Array(count).fill(0).map((_, i) => i + 100);
    }
}

/**
 * 2. Anthropic Token Estimator (Calibrated against Claude tokenization ratios)
 */
export class AnthropicTokenizerAdapter implements TokenizerAdapter {
    public readonly provider: string = 'anthropic';

    public countTokens(text: string): number {
        if (!text) return 0;
        const isCode = text.includes('export') || text.includes('const') || text.includes('import');
        const factor = isCode ? 3.65 : 4.05;
        return Math.max(1, Math.ceil(text.length / factor));
    }

    public encode(text: string): number[] {
        const count = this.countTokens(text);
        return new Array(count).fill(0).map((_, i) => i + 200);
    }
}

/**
 * 3. DeepSeek Token Estimator (Calibrated against DeepSeek tokenization ratios)
 */
export class DeepSeekTokenizerAdapter implements TokenizerAdapter {
    public readonly provider: string = 'deepseek';

    public countTokens(text: string): number {
        if (!text) return 0;
        return Math.max(1, Math.ceil(text.length / 3.80));
    }

    public encode(text: string): number[] {
        const count = this.countTokens(text);
        return new Array(count).fill(0).map((_, i) => i + 300);
    }
}

/**
 * 4. Gemini Token Estimator (Calibrated against SentencePiece tokenization ratios)
 */
export class GeminiTokenizerAdapter implements TokenizerAdapter {
    public readonly provider: string = 'google';

    public countTokens(text: string): number {
        if (!text) return 0;
        return Math.max(1, Math.ceil(text.length / 4.20));
    }

    public encode(text: string): number[] {
        const count = this.countTokens(text);
        return new Array(count).fill(0).map((_, i) => i + 400);
    }
}

export class TokenizerFactory {
    public static getTokenizer(provider: string): TokenizerAdapter {
        switch (provider.toLowerCase()) {
            case 'openai': return new OpenAITokenizerAdapter();
            case 'anthropic': return new AnthropicTokenizerAdapter();
            case 'deepseek': return new DeepSeekTokenizerAdapter();
            case 'google': return new GeminiTokenizerAdapter();
            default: return new OpenAITokenizerAdapter();
        }
    }
}
