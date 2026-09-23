/**
 * Tokonomics Pluggable Semantic Compression Engine
 * Decoupled compression architecture supporting NoOp, Rule-Based, LLMLingua-2, Local SLM, and Legacy providers.
 */

import { TokenCounter } from '../engine/tokenizer';
import { CompressionProviderType } from '../engine/featureFlags';
import { LocalSlmBrain } from '../engine/localSlmBrain';

export interface CompressionResult {
    originalText: string;
    compressedText: string;
    originalTokens: number;
    compressedTokens: number;
    tokensSaved: number;
    compressionRatio: number;
    providerUsed: string;
}

export interface SemanticCompressionProvider {
    readonly id: CompressionProviderType;
    readonly name: string;
    compress(text: string, targetRatio?: number): Promise<CompressionResult>;
}

/**
 * 1. NoOpCompressor: Verbatim Transparency
 * Used when compression is unnecessary or harmful (focal active code, exact assertions).
 */
export class NoOpCompressor implements SemanticCompressionProvider {
    public readonly id: CompressionProviderType = 'noop';
    public readonly name: string = 'NoOp Verbatim Compressor';

    public async compress(text: string): Promise<CompressionResult> {
        const tokens = TokenCounter.countTokens(text);
        return {
            originalText: text,
            compressedText: text,
            originalTokens: tokens,
            compressedTokens: tokens,
            tokensSaved: 0,
            compressionRatio: 1.0,
            providerUsed: this.id
        };
    }
}

/**
 * 2. RuleBasedCompressor: Deterministic AST & Text Compaction
 * Strips comments, redundant docstring padding, and compacts whitespace without altering AST syntax.
 */
export class RuleBasedCompressor implements SemanticCompressionProvider {
    public readonly id: CompressionProviderType = 'rule';
    public readonly name: string = 'Rule-Based AST Normalizer';

    public async compress(text: string): Promise<CompressionResult> {
        const origTokens = TokenCounter.countTokens(text);

        // Normalize comments and whitespace
        let compressed = text
            .replace(/\/\*\*[\s\S]*?\*\//g, (match) => {
                // Compact multi-line docstrings to single line
                const inner = match.replace(/\/\*\*|\*\/|\*/g, ' ').replace(/\s+/g, ' ').trim();
                return inner.length > 0 ? `/** ${inner} */` : '';
            })
            .replace(/^[ \t]*\/\/[^/].*$/gm, '') // Remove single-line comments
            .replace(/\n\s*\n\s*\n+/g, '\n\n')  // Collapse consecutive blank lines
            .trim();

        const compTokens = TokenCounter.countTokens(compressed);
        const tokensSaved = Math.max(0, origTokens - compTokens);
        const ratio = origTokens > 0 ? Math.round((compTokens / origTokens) * 100) / 100 : 1.0;

        return {
            originalText: text,
            compressedText: compressed,
            originalTokens: origTokens,
            compressedTokens: compTokens,
            tokensSaved,
            compressionRatio: ratio,
            providerUsed: this.id
        };
    }
}

/**
 * 3. LLMLingua2Compressor: reserved identifier, deterministic rule compression.
 *
 * No learned compressor ships in this extension. The class is retained only so that persisted
 * configuration naming `lingua2` keeps resolving to a provider instead of failing, and it always
 * delegates to the deterministic rule compressor.
 *
 * It previously carried a "token classification simulation" that dropped words on `Math.random()`.
 * That branch was unreachable - the factory constructs this class with `onnxSessionAvailable: false`
 * - but had it ever been enabled it would have deleted source tokens nondeterministically, producing
 * a different payload for identical input and breaking both the preservation gate's premise and
 * prefix stability. It is removed rather than left guarded, because an unreachable hazard is still a
 * hazard once someone flips the constructor argument.
 *
 * A real learned compressor would need signed model artifacts, protected non-compressible spans,
 * deterministic execution, resource limits, and its own promotion study. None of that is in scope
 * here, so this provider makes no claim to perform learned compression.
 */
export class LLMLingua2Compressor implements SemanticCompressionProvider {
    public readonly id: CompressionProviderType = 'lingua2';
    public readonly name: string = 'Deterministic rule compression (no learned model available)';
    private fallbackRule: RuleBasedCompressor = new RuleBasedCompressor();

    public async compress(text: string): Promise<CompressionResult> {
        const fb = await this.fallbackRule.compress(text);
        return { ...fb, providerUsed: `${this.id} (fallback: rule)` };
    }
}

/**
 * 4. LocalSLMCompressor: 0.5B Parameter Local Summary Model
 * Context summarizer with fallback to RuleBasedCompressor.
 */
export class LocalSLMCompressor implements SemanticCompressionProvider {
    public readonly id: CompressionProviderType = 'slm';
    public readonly name: string = 'Deterministic rule compression (local SLM unavailable in standard runtime)';
    private fallbackRule: RuleBasedCompressor = new RuleBasedCompressor();

    constructor(private slmModelAvailable: boolean = false, private slmBrain?: LocalSlmBrain) {}

    public async compress(text: string): Promise<CompressionResult> {
        if (!this.slmModelAvailable) {
            const fb = await this.fallbackRule.compress(text);
            return { ...fb, providerUsed: `${this.id} (fallback: rule)` };
        }

        // If local SLM brain is provided and ready, attempt fact-validated proposal
        if (this.slmBrain && this.slmBrain.isReady()) {
            try {
                const proposal = await this.slmBrain.proposeCompression(text);
                if (!proposal.isFallback && proposal.compressedText) {
                    const origTokens = TokenCounter.countTokens(text);
                    const compTokens = TokenCounter.countTokens(proposal.compressedText);
                    const tokensSaved = Math.max(0, origTokens - compTokens);
                    return {
                        originalText: text,
                        compressedText: proposal.compressedText,
                        originalTokens: origTokens,
                        compressedTokens: compTokens,
                        tokensSaved,
                        compressionRatio: origTokens > 0 ? Math.round((compTokens / origTokens) * 100) / 100 : 1.0,
                        providerUsed: this.id
                    };
                }
            } catch {
                // Fallback to rule
            }
        }

        // Local SLM summarization fallback to RuleBasedCompressor
        const fb = await this.fallbackRule.compress(text);
        return { ...fb, providerUsed: `${this.id} (fallback: rule)` };
    }
}

/**
 * 5. LegacyRegexCompressor: v4.1.2 Backward-Compatible Regex Engine
 */
export class LegacyRegexCompressor implements SemanticCompressionProvider {
    public readonly id: CompressionProviderType = 'legacy';
    public readonly name: string = 'Legacy Regex Compressor';

    public async compress(text: string): Promise<CompressionResult> {
        const origTokens = TokenCounter.countTokens(text);
        let compressed = text.replace(/\s+/g, ' ').replace(/; /g, ';').trim();
        const compTokens = TokenCounter.countTokens(compressed);
        const tokensSaved = Math.max(0, origTokens - compTokens);

        return {
            originalText: text,
            compressedText: compressed,
            originalTokens: origTokens,
            compressedTokens: compTokens,
            tokensSaved,
            compressionRatio: origTokens > 0 ? Math.round((compTokens / origTokens) * 100) / 100 : 1.0,
            providerUsed: this.id
        };
    }
}

/**
 * Provider Factory
 */
export class CompressionProviderFactory {
    public static createProvider(type: CompressionProviderType): SemanticCompressionProvider {
        switch (type) {
            case 'noop': return new NoOpCompressor();
            case 'rule': return new RuleBasedCompressor();
            case 'lingua2': return new LLMLingua2Compressor();
            case 'slm': return new LocalSLMCompressor(false);
            case 'legacy': return new LegacyRegexCompressor();
            default: return new RuleBasedCompressor();
        }
    }
}
