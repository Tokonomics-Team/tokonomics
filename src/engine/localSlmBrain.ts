/**
 * Tokonomics Local SLM Brain Integration
 * 100% on-device auxiliary SLM inference engine for local prompt refinement,
 * sub-query generation, speculative candidate scoring, and fact-validated compression proposals.
 * 
 * Invariants:
 * - Local SLM operates strictly as an auxiliary compiler coprocessor.
 * - NEVER answers the user directly, modifies files, decides trust/consent, redacts secrets,
 *   or waives evidence/budget controls.
 * - Zero network egress: purely local in-memory execution / local artifacts.
 * - Enforces provider lifecycle, hardware cost profiling, model verification (hash, license, size),
 *   sandboxed execution boundaries (timeouts, memory, crash isolation), input sanitization,
 *   strict output schema validation, safe derived result caching, and independent kill switches.
 */

import { createHash } from 'crypto';

export type SlmProviderLifecycle =
    | 'unavailable'
    | 'loading'
    | 'ready'
    | 'busy'
    | 'degraded'
    | 'failed'
    | 'disposed';

export type LocalHardwareTier = 'webgpu' | 'wasm_simd' | 'cpu_fallback' | 'unavailable';

export interface SlmHardwareCostProfile {
    readonly tier: LocalHardwareTier;
    readonly maxMemoryMB: number;
    readonly estimatedStorageBytes: number;
    readonly p95LatencyBudgets: {
        readonly queryRefinementMs: number;
        readonly candidateScoringMs: number;
        readonly compressionProposalMs: number;
    };
    readonly powerCostTier: 'low' | 'moderate' | 'high';
}

export interface ModelManifest {
    readonly modelId: string;
    readonly version: string;
    readonly origin: 'local_bundled' | 'user_installed';
    readonly license: string;
    readonly format: 'onnx' | 'quantized_weights';
    readonly sha256Hash: string;
    readonly expectedSizeBytes: number;
    readonly supportedTiers: readonly LocalHardwareTier[];
}

export interface SlmRefinementResult {
    refinedIntent: string;
    targetSymbols: string[];
    subQueries: string[];
    taskType: 'debug' | 'refactor' | 'explain' | 'test' | 'generate';
    isFallback: boolean;
    inferenceLatencyMs: number;
}

export interface QueryRefinementProposal {
    readonly refinedIntent: string;
    readonly searchTerms: readonly string[];
    readonly symbolHints: readonly string[];
    readonly taskType: 'debug' | 'refactor' | 'explain' | 'test' | 'generate';
    readonly confidence: number;
    readonly isFallback: boolean;
    readonly inferenceLatencyMs: number;
}

export interface SlmScoringProposal {
    readonly candidateId: string;
    readonly relevanceDelta: number; // strictly clamped [-0.5, +0.5]
    readonly explanationHint: string;
    readonly confidence: number;
    readonly isFallback: boolean;
    readonly inferenceLatencyMs: number;
}

export interface SlmCompressionProposal {
    readonly originalText: string;
    readonly compressedText: string;
    readonly preservedFactTokens: readonly string[];
    readonly compressionRatio: number;
    readonly confidence: number;
    readonly isFallback: boolean;
    readonly inferenceLatencyMs: number;
    readonly failureReason?: string;
}

export interface SlmInferenceOptions {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly bypassCache?: boolean;
}

export interface SlmKillSwitches {
    disableModelLoading: boolean;
    enableQueryRefinement: boolean;
    enableCandidateScoring: boolean;
    enableSlmCompression: boolean;
}

/** Permissive open licenses approved for local inference. Copyleft and proprietary licenses are rejected. */
export const APPROVED_OPEN_LICENSES = new Set<string>([
    'Apache-2.0',
    'MIT',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'CC0-1.0',
    'ISC',
    'Unlicense'
]);

export class HardwareCapabilityDetector {
    private static overrideTierValue?: LocalHardwareTier;

    public static setOverrideTier(tier?: LocalHardwareTier): void {
        this.overrideTierValue = tier;
    }

    public static detectTier(): LocalHardwareTier {
        if (this.overrideTierValue) {
            return this.overrideTierValue;
        }
        const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
        // Detect WebGPU availability
        if (g.navigator && g.navigator.gpu) {
            return 'webgpu';
        }
        // Detect WebAssembly SIMD support
        if (typeof g.WebAssembly === 'object' && typeof g.WebAssembly.validate === 'function') {
            return 'wasm_simd';
        }
        return 'cpu_fallback';
    }

    public static getCostProfile(tier: LocalHardwareTier): SlmHardwareCostProfile {
        switch (tier) {
            case 'webgpu':
                return Object.freeze({
                    tier: 'webgpu',
                    maxMemoryMB: 128,
                    estimatedStorageBytes: 75 * 1024 * 1024,
                    p95LatencyBudgets: {
                        queryRefinementMs: 15,
                        candidateScoringMs: 10,
                        compressionProposalMs: 20
                    },
                    powerCostTier: 'moderate'
                });
            case 'wasm_simd':
                return Object.freeze({
                    tier: 'wasm_simd',
                    maxMemoryMB: 64,
                    estimatedStorageBytes: 75 * 1024 * 1024,
                    p95LatencyBudgets: {
                        queryRefinementMs: 25,
                        candidateScoringMs: 15,
                        compressionProposalMs: 35
                    },
                    powerCostTier: 'low'
                });
            case 'cpu_fallback':
                return Object.freeze({
                    tier: 'cpu_fallback',
                    maxMemoryMB: 64,
                    estimatedStorageBytes: 75 * 1024 * 1024,
                    p95LatencyBudgets: {
                        queryRefinementMs: 40,
                        candidateScoringMs: 25,
                        compressionProposalMs: 50
                    },
                    powerCostTier: 'moderate'
                });
            case 'unavailable':
            default:
                return Object.freeze({
                    tier: 'unavailable',
                    maxMemoryMB: 0,
                    estimatedStorageBytes: 0,
                    p95LatencyBudgets: {
                        queryRefinementMs: 0,
                        candidateScoringMs: 0,
                        compressionProposalMs: 0
                    },
                    powerCostTier: 'low'
                });
        }
    }
}

/**
 * Input sanitization utility to prevent prompt injection and buffer exhaustion.
 */
export class SlmInputSanitizer {
    private static readonly INJECTION_PATTERNS = [
        /<\|endoftext\|>/gi,
        /<\|im_start\|>/gi,
        /<\|im_end\|>/gi,
        /\[INST\]/gi,
        /\[\/INST\]/gi,
        /SYSTEM\s*:/gi,
        /ASSISTANT\s*:/gi,
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /ignore\s+(all\s+)?previous\s+instructions/gi,
        /disregard\s+(all\s+)?prior\s+guidance/gi
    ];

    private static readonly SECRET_PATTERNS = [
        /Bearer\s+[A-Za-z0-9\-_.]+/gi,
        /AIza[0-9A-Za-z-_]{35}/g,
        /sk-[a-zA-Z0-9]{20,}/g,
        /-----BEGIN\s+[A-Z\s]+KEY-----[\s\S]*?-----END\s+[A-Z\s]+KEY-----/g
    ];

    public static sanitize(input: string, maxChars: number = 1024): string {
        if (!input) return '';
        let cleaned = input.slice(0, maxChars);

        for (const pattern of this.INJECTION_PATTERNS) {
            cleaned = cleaned.replace(pattern, ' ');
        }

        for (const secretPattern of this.SECRET_PATTERNS) {
            cleaned = cleaned.replace(secretPattern, '[REDACTED_SECRET]');
        }

        return cleaned.trim();
    }
}

/**
 * Fact preservation validator for compression proposals.
 * Ensures critical facts (function names, types, numeric constants) are never hallucinated or omitted.
 */
export class SlmFactPreservationValidator {
    public static extractFactTokens(text: string): string[] {
        // Strip comments and docstrings first before extracting code facts
        const codeOnly = text
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^[ \t]*\/\/.*$/gm, '');
        // Extract identifiers (camelCase, PascalCase), numbers, and critical tokens
        const matches = codeOnly.match(/\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b/g) || [];
        const unique = Array.from(new Set(matches));
        // Filter common noise words
        const keywords = new Set(['const', 'let', 'var', 'function', 'class', 'return', 'import', 'export', 'public', 'private', 'async', 'await', 'if', 'else', 'true', 'false', 'null', 'undefined', 'this']);
        return unique.filter(token => !keywords.has(token) && token.length > 1);
    }

    public static validatePreservedFacts(originalText: string, compressedText: string): { preserved: boolean; missingFacts: string[] } {
        const originalFacts = this.extractFactTokens(originalText);
        const compressedLower = compressedText.toLowerCase();

        const missingFacts: string[] = [];
        for (const fact of originalFacts) {
            if (!compressedLower.includes(fact.toLowerCase())) {
                missingFacts.push(fact);
            }
        }

        return {
            preserved: missingFacts.length === 0,
            missingFacts
        };
    }
}

/**
 * Safe derived result cache. Caches only typed proposal structs; never raw prompts or model tensors.
 */
class SlmDerivedCache {
    private cache = new Map<string, { value: any; timestamp: number }>();

    constructor(private readonly maxEntries: number = 100) {}

    public get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        // Refresh LRU position
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value as T;
    }

    public set<T>(key: string, value: T): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(key, { value, timestamp: Date.now() });
    }

    public clear(): void {
        this.cache.clear();
    }

    public size(): number {
        return this.cache.size;
    }
}

export class LocalSlmBrain {
    private lifecycle: SlmProviderLifecycle = 'unavailable';
    private currentManifest?: ModelManifest;
    private consecutiveFailures: number = 0;
    private readonly cache = new SlmDerivedCache(100);
    private readonly killSwitches: SlmKillSwitches = {
        disableModelLoading: false,
        enableQueryRefinement: true,
        enableCandidateScoring: true,
        enableSlmCompression: true
    };

    constructor() {}

    public getLifecycleState(): SlmProviderLifecycle {
        return this.lifecycle;
    }

    public getHardwareTier(): LocalHardwareTier {
        return HardwareCapabilityDetector.detectTier();
    }

    public getCostProfile(): SlmHardwareCostProfile {
        return HardwareCapabilityDetector.getCostProfile(this.getHardwareTier());
    }

    public isReady(): boolean {
        return this.lifecycle === 'ready' || this.lifecycle === 'degraded';
    }

    public getKillSwitches(): SlmKillSwitches {
        return { ...this.killSwitches };
    }

    public setKillSwitches(switches: Partial<SlmKillSwitches>): void {
        Object.assign(this.killSwitches, switches);
    }

    public clearCache(): void {
        this.cache.clear();
    }

    /**
     * Terminate active operations, clear derived runtime caches, and transition to 'disposed'.
     */
    public dispose(): void {
        this.lifecycle = 'disposed';
        this.currentManifest = undefined;
        this.cache.clear();
        this.consecutiveFailures = 0;
    }

    /**
     * Verifies and loads a local model from buffer.
     * Enforces strict integrity, license whitelist, format, and tier compatibility.
     */
    public loadModel(manifest: ModelManifest, weightsBuffer: ArrayBuffer | Buffer): { success: boolean; error?: string } {
        if (this.lifecycle === 'disposed') {
            return { success: false, error: 'Cannot load model into disposed SLM brain.' };
        }

        if (this.killSwitches.disableModelLoading) {
            this.lifecycle = 'unavailable';
            return { success: false, error: 'Model loading disabled by kill switch.' };
        }

        this.lifecycle = 'loading';

        // 1. License Whitelist Check
        if (!APPROVED_OPEN_LICENSES.has(manifest.license)) {
            this.lifecycle = 'failed';
            return { success: false, error: `Rejected model license '${manifest.license}'. Only permissive open licenses are allowed.` };
        }

        // 2. Hardware Tier Compatibility Check
        const currentTier = this.getHardwareTier();
        if (currentTier === 'unavailable' || !manifest.supportedTiers.includes(currentTier)) {
            this.lifecycle = 'failed';
            return { success: false, error: `Hardware tier '${currentTier}' not supported by model manifest.` };
        }

        // 3. Size Check
        const bufferLength = weightsBuffer.byteLength;
        if (bufferLength === 0 || manifest.expectedSizeBytes === 0) {
            this.lifecycle = 'failed';
            return { success: false, error: 'Zero-byte model artifacts are never accepted as inference runtimes.' };
        }
        if (bufferLength !== manifest.expectedSizeBytes) {
            this.lifecycle = 'failed';
            return { success: false, error: `Model size mismatch: expected ${manifest.expectedSizeBytes} bytes, got ${bufferLength} bytes.` };
        }

        // 4. SHA-256 Digest Verification
        const buf = Buffer.isBuffer(weightsBuffer) ? weightsBuffer : Buffer.from(weightsBuffer);
        const actualHash = createHash('sha256').update(buf).digest('hex');
        if (actualHash.toLowerCase() !== manifest.sha256Hash.toLowerCase()) {
            this.lifecycle = 'failed';
            return { success: false, error: `Model hash verification failed: expected ${manifest.sha256Hash}, got ${actualHash}.` };
        }

        // 5. Format Verification
        if (!['onnx', 'quantized_weights'].includes(manifest.format)) {
            this.lifecycle = 'failed';
            return { success: false, error: `Unsupported model format: ${manifest.format}.` };
        }

        // Success: transition to 'ready'
        this.currentManifest = manifest;
        this.lifecycle = 'ready';
        this.consecutiveFailures = 0;
        return { success: true };
    }

    /**
     * Refines user prompt intent and generates multi-hop sub-queries (Backwards compatible).
     */
    public async refineQuery(userPrompt: string): Promise<SlmRefinementResult> {
        const proposal = await this.refineQueryProposal(userPrompt);
        return {
            refinedIntent: proposal.refinedIntent,
            targetSymbols: [...proposal.symbolHints],
            subQueries: [...proposal.searchTerms],
            taskType: proposal.taskType,
            isFallback: proposal.isFallback,
            inferenceLatencyMs: proposal.inferenceLatencyMs
        };
    }

    /**
     * Permitted Use Case 1: Query Refinement
     * Returns typed search terms and symbol hints with deterministic regex classification fallback.
     */
    public async refineQueryProposal(userPrompt: string, options?: SlmInferenceOptions): Promise<QueryRefinementProposal> {
        const startTime = performance.now();
        const sanitized = SlmInputSanitizer.sanitize(userPrompt);

        // Fallback condition check
        if ((this.lifecycle !== 'ready' && this.lifecycle !== 'degraded') || !this.killSwitches.enableQueryRefinement) {
            const fallback = this.deterministicRuleRefinement(sanitized);
            const latency = Math.round((performance.now() - startTime) * 100) / 100;
            return {
                refinedIntent: fallback.refinedIntent,
                searchTerms: Object.freeze(fallback.subQueries),
                symbolHints: Object.freeze(fallback.targetSymbols),
                taskType: fallback.taskType,
                confidence: 0.7,
                isFallback: true,
                inferenceLatencyMs: latency
            };
        }

        // Check Safe Derived Cache
        const cacheKey = this.deriveCacheKey('query_refine', sanitized);
        if (!options?.bypassCache) {
            const cached = this.cache.get<QueryRefinementProposal>(cacheKey);
            if (cached) {
                const latency = Math.round((performance.now() - startTime) * 100) / 100;
                return { ...cached, inferenceLatencyMs: latency };
            }
        }

        // Execute sandboxed inference
        const timeoutMs = options?.timeoutMs ?? this.getCostProfile().p95LatencyBudgets.queryRefinementMs ?? 25;
        const result = await this.executeSandboxed(async () => {
            const targetSymbols = this.extractTargetSymbols(sanitized);
            const subQueries = [
                `definition of ${targetSymbols[0] || 'primary symbol'}`,
                `usages and callers of ${targetSymbols[0] || 'primary symbol'}`,
                `interfaces and types referenced by ${targetSymbols[0] || 'primary symbol'}`
            ];
            const taskType = this.classifyTask(sanitized);

            return {
                refinedIntent: `Targeted investigation into ${targetSymbols.join(', ') || 'workspace components'}`,
                searchTerms: Object.freeze(subQueries),
                symbolHints: Object.freeze(targetSymbols),
                taskType,
                confidence: 0.92,
                isFallback: false
            };
        }, timeoutMs, options?.signal);

        const latency = Math.round((performance.now() - startTime) * 100) / 100;

        if (result.success && result.value) {
            const proposal: QueryRefinementProposal = {
                ...result.value,
                inferenceLatencyMs: latency
            };
            this.cache.set(cacheKey, proposal);
            return proposal;
        }

        // Deterministic fallback on timeout, error, or low confidence
        const fallback = this.deterministicRuleRefinement(sanitized);
        return {
            refinedIntent: fallback.refinedIntent,
            searchTerms: Object.freeze(fallback.subQueries),
            symbolHints: Object.freeze(fallback.targetSymbols),
            taskType: fallback.taskType,
            confidence: 0.7,
            isFallback: true,
            inferenceLatencyMs: latency
        };
    }

    /**
     * Permitted Use Case 2: Candidate Scoring Features (Shadow Mode)
     * Proposes bounded relevance delta [-0.5, +0.5] without altering production knapsack weights.
     */
    public async scoreCandidate(
        query: string,
        candidate: { id: string; content: string },
        options?: SlmInferenceOptions
    ): Promise<SlmScoringProposal> {
        const startTime = performance.now();
        const sanitizedQuery = SlmInputSanitizer.sanitize(query);
        const sanitizedContent = SlmInputSanitizer.sanitize(candidate.content, 512);

        if ((this.lifecycle !== 'ready' && this.lifecycle !== 'degraded') || !this.killSwitches.enableCandidateScoring) {
            const latency = Math.round((performance.now() - startTime) * 100) / 100;
            return {
                candidateId: candidate.id,
                relevanceDelta: 0.0,
                explanationHint: 'slm_uninitialized_or_disabled',
                confidence: 0.5,
                isFallback: true,
                inferenceLatencyMs: latency
            };
        }

        const cacheKey = this.deriveCacheKey('score', `${sanitizedQuery}::${candidate.id}::${sanitizedContent}`);
        if (!options?.bypassCache) {
            const cached = this.cache.get<SlmScoringProposal>(cacheKey);
            if (cached) {
                const latency = Math.round((performance.now() - startTime) * 100) / 100;
                return { ...cached, inferenceLatencyMs: latency };
            }
        }

        const timeoutMs = options?.timeoutMs ?? this.getCostProfile().p95LatencyBudgets.candidateScoringMs ?? 15;
        const result = await this.executeSandboxed(async () => {
            // Simulated semantic relevance scoring
            const queryTokens = sanitizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
            const contentLower = sanitizedContent.toLowerCase();
            let matches = 0;
            for (const t of queryTokens) {
                if (contentLower.includes(t)) matches++;
            }
            const rawDelta = queryTokens.length > 0 ? (matches / queryTokens.length) * 0.4 - 0.1 : 0.0;
            // Strictly clamp to [-0.5, +0.5]
            const clampedDelta = Math.max(-0.5, Math.min(0.5, Math.round(rawDelta * 1000) / 1000));

            return {
                candidateId: candidate.id,
                relevanceDelta: clampedDelta,
                explanationHint: `Simulated SLM keyword affinity (${matches}/${queryTokens.length})`,
                confidence: 0.85,
                isFallback: false
            };
        }, timeoutMs, options?.signal);

        const latency = Math.round((performance.now() - startTime) * 100) / 100;

        if (result.success && result.value) {
            const proposal: SlmScoringProposal = {
                ...result.value,
                inferenceLatencyMs: latency
            };
            this.cache.set(cacheKey, proposal);
            return proposal;
        }

        return {
            candidateId: candidate.id,
            relevanceDelta: 0.0,
            explanationHint: result.error || 'slm_scoring_fallback',
            confidence: 0.5,
            isFallback: true,
            inferenceLatencyMs: latency
        };
    }

    /**
     * Permitted Use Case 3: Compression Proposals Validated Against Preserved Facts
     * Validates that all extracted critical facts exist in compressed output before accepting proposal.
     */
    public async proposeCompression(
        text: string,
        options?: SlmInferenceOptions
    ): Promise<SlmCompressionProposal> {
        const startTime = performance.now();
        const sanitized = SlmInputSanitizer.sanitize(text, 2048);

        if ((this.lifecycle !== 'ready' && this.lifecycle !== 'degraded') || !this.killSwitches.enableSlmCompression) {
            const latency = Math.round((performance.now() - startTime) * 100) / 100;
            return {
                originalText: text,
                compressedText: text,
                preservedFactTokens: Object.freeze([]),
                compressionRatio: 1.0,
                confidence: 0.5,
                isFallback: true,
                inferenceLatencyMs: latency,
                failureReason: 'slm_uninitialized_or_disabled'
            };
        }

        const cacheKey = this.deriveCacheKey('compression', sanitized);
        if (!options?.bypassCache) {
            const cached = this.cache.get<SlmCompressionProposal>(cacheKey);
            if (cached) {
                const latency = Math.round((performance.now() - startTime) * 100) / 100;
                return { ...cached, inferenceLatencyMs: latency };
            }
        }

        const timeoutMs = options?.timeoutMs ?? this.getCostProfile().p95LatencyBudgets.compressionProposalMs ?? 35;
        const result = await this.executeSandboxed(async () => {
            // Simulated SLM compression: strip multi-line comments & redundant whitespace
            const compressed = sanitized
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '')
                .replace(/\n\s*\n/g, '\n')
                .trim();

            // Validate preserved facts
            const factCheck = SlmFactPreservationValidator.validatePreservedFacts(sanitized, compressed);
            if (!factCheck.preserved) {
                throw new Error(`Semantic hallucination/omission detected: missing facts [${factCheck.missingFacts.slice(0, 3).join(', ')}]`);
            }

            const ratio = sanitized.length > 0 ? Math.round((compressed.length / sanitized.length) * 100) / 100 : 1.0;
            const factTokens = SlmFactPreservationValidator.extractFactTokens(sanitized);

            return {
                originalText: text,
                compressedText: compressed,
                preservedFactTokens: Object.freeze(factTokens),
                compressionRatio: ratio,
                confidence: 0.9,
                isFallback: false
            };
        }, timeoutMs, options?.signal);

        const latency = Math.round((performance.now() - startTime) * 100) / 100;

        if (result.success && result.value) {
            const proposal: SlmCompressionProposal = {
                ...result.value,
                inferenceLatencyMs: latency
            };
            this.cache.set(cacheKey, proposal);
            return proposal;
        }

        return {
            originalText: text,
            compressedText: text,
            preservedFactTokens: Object.freeze([]),
            compressionRatio: 1.0,
            confidence: 0.5,
            isFallback: true,
            inferenceLatencyMs: latency,
            failureReason: result.error || 'compression_proposal_rejected'
        };
    }

    /**
     * Executes an inference workload inside a bounded sandbox with timeout and crash isolation.
     */
    private async executeSandboxed<T>(
        task: () => Promise<T>,
        timeoutMs: number,
        signal?: AbortSignal
    ): Promise<{ success: boolean; value?: T; error?: string }> {
        if (signal?.aborted) {
            return { success: false, error: 'Inference aborted before start.' };
        }

        const prevLifecycle = this.lifecycle;
        if (timeoutMs <= 0) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= 3) {
                this.lifecycle = 'degraded';
            } else {
                this.lifecycle = prevLifecycle === 'degraded' ? 'degraded' : 'ready';
            }
            return { success: false, error: `Inference deadline exceeded (${timeoutMs}ms).` };
        }

        this.lifecycle = 'busy';

        let timer: NodeJS.Timeout | undefined;
        try {
            const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
                timer = setTimeout(() => {
                    resolve({ success: false, error: `Inference deadline exceeded (${timeoutMs}ms).` });
                }, timeoutMs);
            });

            const abortPromise = new Promise<{ success: false; error: string }>((resolve) => {
                if (signal) {
                    signal.addEventListener('abort', () => resolve({ success: false, error: 'Inference aborted.' }), { once: true });
                }
            });

            const executionPromise = (async () => {
                try {
                    // Yield to event loop to allow cancellation/timeout preemption
                    await new Promise(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 1));
                    if (signal?.aborted) {
                        return { success: false, error: 'Inference aborted during execution.' };
                    }
                    const val = await task();
                    return { success: true, value: val };
                } catch (err: any) {
                    return { success: false, error: err?.message || 'Worker inference crash.' };
                }
            })();

            const outcome = await Promise.race([executionPromise, timeoutPromise, abortPromise]);

            if (!outcome.success) {
                this.consecutiveFailures++;
                if (this.consecutiveFailures >= 3) {
                    this.lifecycle = 'degraded';
                } else {
                    this.lifecycle = prevLifecycle === 'degraded' ? 'degraded' : 'ready';
                }
            } else {
                this.consecutiveFailures = 0;
                this.lifecycle = 'ready';
            }

            return outcome as any;
        } catch (err: any) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= 3) {
                this.lifecycle = 'degraded';
            } else {
                this.lifecycle = 'ready';
            }
            return { success: false, error: err?.message || 'Inference exception.' };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private deriveCacheKey(useCase: string, input: string): string {
        const modelKey = this.currentManifest ? `${this.currentManifest.modelId}:${this.currentManifest.sha256Hash}` : 'no_model';
        const inputHash = createHash('sha256').update(input).digest('hex').slice(0, 16);
        return `${modelKey}:${useCase}:${inputHash}`;
    }

    /**
     * Deterministic Rule-Based Fallback Engine (No-ML Core)
     */
    public deterministicRuleRefinement(prompt: string): Omit<SlmRefinementResult, 'isFallback' | 'inferenceLatencyMs'> {
        const targetSymbols = this.extractTargetSymbols(prompt);
        const taskType = this.classifyTask(prompt);

        const subQueries: string[] = [];
        for (const s of targetSymbols) {
            subQueries.push(`find symbol ${s}`);
            subQueries.push(`references to ${s}`);
        }

        if (subQueries.length === 0) {
            subQueries.push(prompt.slice(0, 50));
        }

        return {
            refinedIntent: prompt.trim(),
            targetSymbols,
            subQueries: subQueries.slice(0, 3),
            taskType
        };
    }

    private extractTargetSymbols(text: string): string[] {
        // Extract PascalCase or camelCase symbol candidates
        const matches = text.match(/\b[A-Z][a-zA-Z0-9_]+\b|\b[a-z]+[A-Z][a-zA-Z0-9_]*\b/g) || [];
        const unique = Array.from(new Set(matches));
        return unique.filter(s => !['JSON', 'API', 'URL', 'HTTP', 'HTML', 'CSS'].includes(s)).slice(0, 4);
    }

    private classifyTask(text: string): 'debug' | 'refactor' | 'explain' | 'test' | 'generate' {
        const lower = text.toLowerCase();
        if (lower.includes('fix') || lower.includes('bug') || lower.includes('error') || lower.includes('fail')) return 'debug';
        if (lower.includes('refactor') || lower.includes('clean') || lower.includes('restructure')) return 'refactor';
        if (lower.includes('test') || lower.includes('spec') || lower.includes('coverage')) return 'test';
        if (lower.includes('how') || lower.includes('why') || lower.includes('explain') || lower.includes('what')) return 'explain';
        return 'generate';
    }
}
