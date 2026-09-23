/**
 * Tokonomics Local Embedding Provider Subsystem
 * Defines embedding provider interfaces, metadata contracts, and a 100% offline,
 * deterministic local embedding engine with zero network egress.
 */

import { createHash } from 'crypto';

export interface EmbeddingProviderMetadata {
    readonly providerId: string;
    readonly modelName: string;
    readonly dimension: number;
    readonly version: string;
    readonly isLocal: boolean;
    readonly hardwareRequirements: 'cpu' | 'webgpu' | 'any';
    readonly privacyDeclaration: 'zero_egress_local_only';
    readonly contentHash?: string;
    readonly representation: 'hashed_lexical_projection' | 'hashed_structural_projection' | 'learned_dense_model';
}

export interface CancellationToken {
    readonly isCancellationRequested: boolean;
}

export interface EmbeddingProvider {
    readonly metadata: EmbeddingProviderMetadata;
    embedQuery(query: string, cancellationToken?: CancellationToken): Promise<Float32Array>;
    embedBatch(chunks: readonly string[], cancellationToken?: CancellationToken): Promise<Float32Array[]>;
    /**
     * Optional. Lets a provider learn corpus-level token statistics so common identifiers can be
     * down-weighted. Providers that ignore it must still produce valid vectors.
     */
    observeCorpus?(documents: readonly string[]): void;
    dispose?(): void;
}

/**
 * 100% Offline, Deterministic Local Embedding Provider
 * Employs subword character n-gram hashing with positional decay, semantic quadrant
 * projection, and L2 normalization. Requires zero external weights or network calls.
 */
export class DeterministicLocalEmbeddingProvider implements EmbeddingProvider {
    public readonly metadata: EmbeddingProviderMetadata;

    // High-level semantic concept clusters for dense vector quadrant alignment
    private static readonly SEMANTIC_CLUSTERS: Record<string, number> = {
        // Authentication & Security
        auth: 0, login: 0, password: 0, token: 0, jwt: 0, credential: 0, permission: 0, session: 0,
        verify: 0, authorize: 0, oauth: 0, secret: 0, hash: 0, crypto: 0, security: 0,
        // Database & Storage
        db: 1, database: 1, sql: 1, query: 1, table: 1, schema: 1, connection: 1, pool: 1,
        transaction: 1, migrate: 1, orm: 1, entity: 1, record: 1, repository: 1, store: 1,
        // Networking & API
        api: 2, http: 2, rest: 2, endpoint: 2, request: 2, response: 2, route: 2, server: 2,
        client: 2, url: 2, fetch: 2, header: 2, payload: 2, socket: 2, grpc: 2,
        // Cache & Memory
        cache: 3, redis: 3, memory: 3, ram: 3, buffer: 3, evict: 3, ttl: 3, lru: 3,
        // Error & Diagnostics
        error: 4, exception: 4, fail: 4, failure: 4, crash: 4, bug: 4, reject: 4, catch: 4,
        stack: 4, trace: 4, panic: 4, diagnostic: 4,
        // Testing & Verification
        test: 5, spec: 5, mock: 5, stub: 5, assert: 5, fixture: 5, suite: 5, expect: 5,
        // Concurrency & Async
        async: 6, await: 6, promise: 6, thread: 6, task: 6, mutex: 6, lock: 6, worker: 6,
        queue: 6, event: 6, stream: 6, emitter: 6,
        // UI & Presentation
        ui: 7, view: 7, component: 7, render: 7, template: 7, html: 7, css: 7, style: 7
    };

    /**
     * Corpus document frequencies, used to down-weight identifiers that appear everywhere.
     * Populated only via observeCorpus(); absent statistics simply mean uniform weighting.
     */
    private documentFrequency: Map<string, number> = new Map();
    private observedDocuments = 0;
    /** Hard bound on the statistics table so an adversarial workspace cannot grow it without limit. */
    private static readonly MAX_DF_TERMS = 20_000;

    constructor(dimension: number = 256, version: string = '2.0.0') {
        this.metadata = Object.freeze({
            providerId: 'tokonomics_deterministic_local_embedder',
            modelName: 'tokonomics-hash-structural-v2',
            dimension,
            version,
            isLocal: true,
            hardwareRequirements: 'cpu',
            privacyDeclaration: 'zero_egress_local_only',
            contentHash: createHash('sha256').update(`local_embedder_v2_${dimension}_${version}`).digest('hex')
            ,representation: 'hashed_structural_projection'
        });
    }

    /**
     * Records corpus token statistics so that ubiquitous identifiers contribute less than
     * distinctive ones. This is the main reason the vector carries information the BM25 ranker
     * it is fused with does not already have: without it, a hash of the same tokens BM25 indexes
     * produces a highly correlated ranking and Reciprocal Rank Fusion gains almost nothing.
     */
    public observeCorpus(documents: readonly string[]): void {
        for (const document of documents) {
            if (typeof document !== 'string' || document.length === 0) continue;
            this.observedDocuments++;
            const seen = new Set(this.tokenize(document));
            for (const token of seen) {
                if (this.documentFrequency.size >= DeterministicLocalEmbeddingProvider.MAX_DF_TERMS
                    && !this.documentFrequency.has(token)) continue;
                this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
            }
        }
    }

    /** Inverse document frequency in [0.25, 1]; neutral when no corpus has been observed. */
    private inverseDocumentFrequency(token: string): number {
        if (this.observedDocuments === 0) return 1;
        const df = this.documentFrequency.get(token) || 0;
        const idf = Math.log((this.observedDocuments + 1) / (df + 1)) + 1;
        const maxIdf = Math.log(this.observedDocuments + 1) + 1;
        return Math.max(0.25, Math.min(1, idf / maxIdf));
    }

    private tokenize(text: string): string[] {
        return text
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9_]/g, ' ')
            .toLowerCase()
            .split(/\s+/)
            .filter(token => token.length > 0);
    }

    public async embedQuery(query: string, cancellationToken?: CancellationToken): Promise<Float32Array> {
        if (cancellationToken?.isCancellationRequested) {
            throw new Error('Embedding cancelled by caller');
        }
        return this.computeVector(query);
    }

    public async embedBatch(chunks: readonly string[], cancellationToken?: CancellationToken): Promise<Float32Array[]> {
        const results: Float32Array[] = [];
        for (let i = 0; i < chunks.length; i++) {
            if (cancellationToken?.isCancellationRequested) {
                throw new Error('Batch embedding cancelled by caller');
            }
            results.push(this.computeVector(chunks[i]));
        }
        return results;
    }

    public dispose(): void {
        // No persistent buffers or unmanaged resources to release in pure JS engine
    }

    private computeVector(text: string): Float32Array {
        const dim = this.metadata.dimension;
        const vector = new Float32Array(dim);

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return vector;
        }

        const tokens = this.tokenize(text);
        if (tokens.length === 0) {
            return vector;
        }

        // Region split: the leading 3/4 of the vector carries lexical/semantic features, the
        // trailing 1/4 carries structural shape. Keeping structure in its own band stops it being
        // swamped by token hashes and is what gives this vector signal a lexical ranker lacks.
        const structuralBase = Math.floor(dim * 0.75);
        const structuralSpan = dim - structuralBase;

        for (let pos = 0; pos < tokens.length; pos++) {
            const token = tokens[pos];
            const posWeight = 1.0 / Math.sqrt(1.0 + pos * 0.05);
            const idf = this.inverseDocumentFrequency(token);
            const weight = posWeight * idf;

            // 1. Semantic cluster projection (domain-concept steering).
            const clusterIdx = DeterministicLocalEmbeddingProvider.SEMANTIC_CLUSTERS[token];
            if (clusterIdx !== undefined) {
                const bandWidth = Math.max(1, Math.floor(structuralBase / 8));
                const quadrantBase = (clusterIdx * bandWidth) % Math.max(1, structuralBase);
                for (let k = 0; k < bandWidth; k++) {
                    vector[(quadrantBase + k) % structuralBase] += 1.5 * posWeight;
                }
            }

            // 2. Full-token hash, IDF weighted so ubiquitous identifiers stop dominating.
            const fullHash = this.fnv1a(token);
            vector[Math.abs(fullHash) % structuralBase] += 1.0 * ((fullHash & 1) === 0 ? 1 : -1) * weight;

            // 3. Adjacent-token bigram. Captures usage context ("validate session", "payment retry")
            //    that a bag-of-words lexical index cannot represent.
            if (pos + 1 < tokens.length) {
                const bigramHash = this.fnv1a(`${token} ${tokens[pos + 1]}`);
                vector[Math.abs(bigramHash) % structuralBase] += 0.7 * ((bigramHash & 1) === 0 ? 1 : -1) * weight;
            }

            // 4. Character n-grams (3 and 4) for morphological robustness across naming styles.
            for (const size of [3, 4]) {
                if (token.length < size) continue;
                for (let i = 0; i <= token.length - size; i++) {
                    const h = this.fnv1a(token.substring(i, i + size));
                    vector[Math.abs(h) % structuralBase] += (size === 3 ? 0.4 : 0.3) * ((h & 1) === 0 ? 1 : -1) * weight;
                }
            }
        }

        // 5. Structural shape features, computed from the raw text rather than its tokens. These
        //    describe what the code IS (nesting, branching, declaration density, size class) rather
        //    than which words it contains, and are the component least correlated with BM25.
        if (structuralSpan > 0) {
            for (const [slot, value] of this.structuralFeatures(text).entries()) {
                vector[structuralBase + (slot % structuralSpan)] += value;
            }
        }

        return this.normalizeL2(vector);
    }

    /**
     * Deterministic structural descriptors of a code fragment, each scaled into roughly [0, 1.5].
     * Bounded work: every measure is a single linear scan or a length ratio.
     */
    private structuralFeatures(text: string): Map<number, number> {
        const sample = text.length > 20_000 ? text.slice(0, 20_000) : text;
        const lines = sample.split(String.fromCharCode(10));
        const lineCount = Math.max(1, lines.length);
        let maxIndent = 0;
        let totalIndent = 0;
        for (const line of lines) {
            const indent = line.length - line.replace(/^[ 	]+/, '').length;
            totalIndent += indent;
            if (indent > maxIndent) maxIndent = indent;
        }
        const count = (pattern: RegExp) => (sample.match(pattern) || []).length;
        const branching = count(/(?:if|else|switch|case|for|while|catch|match)/g);
        const declarations = count(/(?:function|class|interface|struct|enum|def|func|fn|impl|type)/g);
        const asyncness = count(/(?:async|await|Promise|Future|go\s|spawn|thread)/g);
        const invocations = count(/\w\s*\(/g);
        const stringLiterals = count(/["'`]/g) / 2;
        const comments = count(/(?:\/\/|#|\/\*)/g);

        const scale = (value: number, ceiling: number) => Math.min(1.5, (value / ceiling) * 1.5);
        return new Map<number, number>([
            [0, scale(maxIndent, 40)],
            [1, scale(totalIndent / lineCount, 12)],
            [2, scale(branching / lineCount, 0.5)],
            [3, scale(declarations / lineCount, 0.3)],
            [4, scale(asyncness / lineCount, 0.3)],
            [5, scale(invocations / lineCount, 1.5)],
            [6, scale(stringLiterals / lineCount, 1)],
            [7, scale(comments / lineCount, 0.5)],
            [8, scale(lineCount, 200)],
            [9, scale(sample.length / lineCount, 80)]
        ]);
    }

    private fnv1a(str: string): number {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return hash;
    }

    private normalizeL2(vec: Float32Array): Float32Array {
        let sumSq = 0;
        for (let i = 0; i < vec.length; i++) {
            const v = vec[i];
            if (!Number.isFinite(v)) {
                vec[i] = 0;
            } else {
                sumSq += v * v;
            }
        }

        const norm = Math.sqrt(sumSq);
        if (norm > 1e-8 && Number.isFinite(norm)) {
            for (let i = 0; i < vec.length; i++) {
                vec[i] /= norm;
            }
        } else {
            vec.fill(0);
        }

        return vec;
    }
}
