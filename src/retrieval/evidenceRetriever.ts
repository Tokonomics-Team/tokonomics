import { SecuritySanitizer } from '../security/sanitizer';
import { rehydrateExact, requiresExactSource, MAX_REHYDRATIONS_PER_REQUEST, SemanticChunkRange } from '../workspace/semanticChunk';

/**
 * Candidates selected when a caller names no ceiling.
 *
 * Kept small because it applies to callers that also declared no token budget, and a caller that
 * cannot say how much room it has should not be handed a large payload by default. Callers that do
 * know their budget derive the ceiling from it instead - see `candidateCeilingForBudget`.
 */
export const DEFAULT_MAX_CANDIDATES = 10;

/** Chunk size the ceiling is estimated against, in tokens. Measured across the shipped fixtures. */
const ASSUMED_CHUNK_TOKENS = 700;

/** Share of the input budget evidence may occupy before the packer starts dropping candidates. */
const EVIDENCE_BUDGET_SHARE = 0.5;

/** Most candidates any single request may nominate, whatever the window size. */
export const MAX_CANDIDATE_CEILING = 60;

/**
 * How many candidates a request with this much room should nominate.
 *
 * The ceiling was a constant 10 and no production caller ever overrode it, so a 1M-token window and
 * a 32k one retrieved exactly the same ten chunks. On a question that spans a subsystem that is not
 * a compression win, it is a truncated answer: the packer had most of the budget still unspent and
 * nothing left to put in it. Nomination is not admission - the knapsack packer still enforces the
 * real budget and drops what does not fit - so erring high here costs a little ranking work and
 * cannot overrun the window.
 */
export function candidateCeilingForBudget(budget: number | undefined): number {
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) return DEFAULT_MAX_CANDIDATES;
    const affordable = Math.floor((budget * EVIDENCE_BUDGET_SHARE) / ASSUMED_CHUNK_TOKENS);
    return Math.min(MAX_CANDIDATE_CEILING, Math.max(DEFAULT_MAX_CANDIDATES, affordable));
}
import { createHash } from 'crypto';
import * as path from 'path';
import { EvidenceCategory } from '../governor/governorTypes';
import { WorkspaceFileRecord, WorkspaceIndexSymbol } from '../workspace/workspaceIndex';
import { SourceProvenanceEngine } from '../workspace/provenance';
import { EvidenceContractBuilder } from './evidenceContract';
import { EvidenceCandidate, EvidenceDecision, EvidenceRetrievalRequest, EvidenceRetrievalResult, EvidenceSignal, EvidenceSourceKind } from './evidenceTypes';
import { candidateUtility } from '../solver/candidateUtility';
import { TokenCounter } from '../engine/tokenizer';

interface RankedSeed { candidate: EvidenceCandidate; source: string; score: number; }

export class EvidenceAwareRetriever {
    private readonly provenanceEngine = new SourceProvenanceEngine();

    public retrieve(request: EvidenceRetrievalRequest): EvidenceRetrievalResult {
        const contract = EvidenceContractBuilder.build(request.taskType, request.query);
        const seeds = this.collapseExactDuplicates(this.produceSeeds(request, contract.required));
        const candidates = this.fuse(seeds, new Set(contract.required), new Set(contract.forbidden));
        const eligibleCandidates = candidates.filter(candidate => !contract.forbidden.includes(candidate.category));
        const stages = [
            { name: 'direct', sources: new Set<EvidenceSourceKind>(['lexical', 'symbol', 'ast', 'diagnostic', 'stack', 'open_editor', 'dense']) },
            { name: 'dependency-and-test', sources: new Set<EvidenceSourceKind>(['graph', 'lsp', 'test']) },
            { name: 'broad', sources: new Set<EvidenceSourceKind>(['repository_rank', 'diff', 'configuration', 'memory']) }
        ];
        const pool: EvidenceCandidate[] = [];
        const stagesExecuted: string[] = [];
        let missing = [...contract.required];
        for (const stage of stages) {
            stagesExecuted.push(stage.name);
            pool.push(...eligibleCandidates.filter(candidate => stage.sources.has(candidate.sourceKind)));
            missing = this.missingRequired(contract.required, pool);
            if (missing.length === 0) break;
        }
        const maxCandidates = Math.max(contract.required.length, request.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
        const claimedRequired = new Set<EvidenceCategory>();
        const selected = this.selectDiverse(pool, contract.required, maxCandidates).map(candidate => {
            const mandatory = contract.required.includes(candidate.category) && !claimedRequired.has(candidate.category) && this.canSatisfyRequirement(candidate);
            if (mandatory) claimedRequired.add(candidate.category);
            return { ...candidate, mandatory };
        });
        const exact = this.rehydrateSelected(request, selected);
        missing = this.missingRequired(contract.required, exact);
        const selectedIds = new Set(exact.map(candidate => candidate.id));
        const selectedById = new Map(exact.map(candidate => [candidate.id, candidate]));
        const decisions: EvidenceDecision[] = candidates.map(candidate => selectedIds.has(candidate.id)
            ? { candidateId: candidate.id, action: 'include', rank: exact.findIndex(item => item.id === candidate.id) + 1,
                reason: selectedById.get(candidate.id)!.mandatory ? `Required ${candidate.category} evidence.` : `High fused relevance with diversity.` }
            : { candidateId: candidate.id, action: 'exclude', reason: contract.forbidden.includes(candidate.category)
                ? `Category ${candidate.category} is forbidden for ${contract.taskType}.` : `Lower fused utility or redundant evidence.` });
        const covered = [...new Set(exact.filter(candidate => this.canSatisfyRequirement(candidate)).map(candidate => candidate.category))];
        const criticalRecall = contract.required.length === 0 ? 1 : (contract.required.length - missing.length) / contract.required.length;
        return {
            contract, selected: Object.freeze(exact), allCandidates: Object.freeze(candidates), decisions: Object.freeze(decisions),
            covered: Object.freeze(covered), missingRequired: Object.freeze(missing), criticalRecall,
            stagesExecuted: Object.freeze(stagesExecuted), sufficient: missing.length === 0,
            conservativeFallback: missing.length > 0,
            sufficiency: exact.length === 0 ? 'unusable' : missing.length === 0 ? 'complete' : 'incomplete_declared'
        };
    }

    private produceSeeds(request: EvidenceRetrievalRequest, required: readonly EvidenceCategory[]): RankedSeed[] {
        const seeds: RankedSeed[] = [];
        const queryTerms = this.terms(request.query);
        const records = [...request.snapshot.files.values()];
        const recordByPath = new Map(records.map(record => [record.relativePath, record]));
        const activeNormalized = request.activeFilePath?.replace(/\\/g, '/').toLowerCase();
        const lexical: Array<{ record: WorkspaceFileRecord; symbol: WorkspaceIndexSymbol; score: number }> = [];
        for (const record of records) {
            for (const symbol of record.symbols) {
                const textTerms = this.terms(`${symbol.name} ${symbol.signature} ${record.relativePath}`);
                let score = 0;
                for (const term of queryTerms) if (textTerms.has(term)) score++;
                if (contractSymbolMatch(symbol.name, request.query)) score += 20;
                if (activeNormalized && record.absolutePath.replace(/\\/g, '/').toLowerCase() === activeNormalized) score += 12;
                if (score > 0) lexical.push({ record, symbol, score });
            }
        }
        lexical.sort((a, b) => b.score - a.score || a.record.key.localeCompare(b.record.key) || a.symbol.line - b.symbol.line);
        lexical.forEach((hit, rank) => {
            const category = this.categoryFor(hit.record, hit.symbol, request.activeFilePath);
            const content = category === 'targetImplementation' ? hit.record.skeleton : hit.symbol.signature;
            const candidate = this.candidate(request, category, rank === 0 ? 'symbol' : 'lexical', content, hit.record, hit.symbol,
                hit.score, [`snapshot:${request.snapshot.generation}`, `content:${hit.record.contentHash}`]);
            seeds.push({ candidate, source: rank === 0 ? 'symbol' : 'lexical', score: hit.score });
        });

        const focalNames = new Set(lexical.slice(0, 5).map(hit => hit.symbol.name));
        const dependencyNames = new Set<string>();
        for (const hit of lexical.slice(0, 3)) {
            for (const reference of hit.record.references) dependencyNames.add(reference);
        }
        for (const record of records) {
            const referenced = record.references.filter(reference => focalNames.has(reference));
            if (referenced.length === 0) continue;
            const symbol = record.symbols[0];
            const candidate = this.candidate(request, 'callers', 'graph', record.skeleton, record, symbol, referenced.length,
                [`reference-edge:${referenced.sort().join(',')}`], referenced);
            seeds.push({ candidate, source: 'graph', score: referenced.length });
        }
        for (const record of records) {
            for (const symbol of record.symbols.filter(item => dependencyNames.has(item.name))) {
                const category: EvidenceCategory = ['interface', 'type', 'enum'].includes(symbol.kind) ? 'apiContract' : 'callees';
                const candidate = this.candidate(request, category, 'graph', symbol.signature, record, symbol, 8,
                    [`dependency-definition:${symbol.name}`], [symbol.name]);
                seeds.push({ candidate, source: 'graph', score: 8 });
            }
        }

        for (const record of records.filter(record => /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./i.test(record.relativePath))) {
            const relevant = [...focalNames].some(name => record.skeleton.includes(name));
            if (!relevant && !required.includes('tests')) continue;
            const candidate = this.candidate(request, 'tests', 'test', record.skeleton, record, record.symbols[0], relevant ? 10 : 1,
                [`test-file:${record.relativePath}`]);
            seeds.push({ candidate, source: 'test', score: relevant ? 10 : 1 });
        }

        const indegree = new Map<string, number>();
        for (const record of records) for (const reference of record.references) indegree.set(reference, (indegree.get(reference) || 0) + 1);
        const rankedSymbols = request.snapshot.symbols.slice().sort((a, b) => (indegree.get(b.name) || 0) - (indegree.get(a.name) || 0) || a.file.localeCompare(b.file));
        rankedSymbols.slice(0, 10).forEach(symbol => {
            const record = recordByPath.get(symbol.file);
            if (!record) return;
            const candidate = this.candidate(request, this.categoryFor(record, symbol), 'repository_rank', symbol.signature, record, symbol,
                indegree.get(symbol.name) || 0, [`repository-rank:${indegree.get(symbol.name) || 0}`]);
            seeds.push({ candidate, source: 'repository_rank', score: indegree.get(symbol.name) || 0 });
        });

        for (const signal of request.signals || []) seeds.push(this.signalSeed(request, signal));
        if (/\b(?:error|exception|traceback|TS\d{3,5})\b/i.test(request.query) &&
            !(request.signals || []).some(signal => signal.source === 'diagnostic' || signal.source === 'stack')) {
            seeds.push(this.signalSeed(request, { source: 'stack', content: request.query }));
        }
        return seeds;
    }

    private signalSeed(request: EvidenceRetrievalRequest, signal: EvidenceSignal): RankedSeed {
        const category: EvidenceCategory = signal.source === 'diagnostic' || signal.source === 'stack' ? 'errorStackTrace'
            : signal.source === 'diff' ? 'gitHistory' : 'targetImplementation';
        const sourceKind: EvidenceSourceKind = signal.source;
        const id = `signal:${sourceKind}:${this.hash(`${signal.filePath || ''}:${signal.content}`)}`;
        const normalizedSignalPath = signal.filePath?.replace(/\\/g, '/').toLowerCase();
        // Signals arrive with whatever path shape their producer uses: editor signals carry absolute
        // paths, while the hybrid index stores relative ones. Matching only on absolute path meant
        // every dense signal failed to find its record, so those candidates carried index-derived
        // content with no record to rehydrate from and no shortfall declared - the content simply
        // rendered as though it were exact source.
        const matchedRecord = normalizedSignalPath
            ? [...request.snapshot.files.values()].find(record =>
                record.absolutePath.replace(/[\\\\/]+/g, '/').toLowerCase() === normalizedSignalPath
                || record.relativePath.replace(/[\\\\/]+/g, '/').toLowerCase() === normalizedSignalPath
                || record.key.toLowerCase().endsWith(':' + normalizedSignalPath))
            : undefined;
        // Index-derived nominations must be rehydrated like any other; host-observed facts must not.
        //
        // A `dense` signal is the retrieval index talking about itself: its content comes from the
        // stored skeleton, so rendering it as implementation evidence reintroduces exactly the defect
        // exact rehydration exists to close - and it did, silently, on the Maximum profile only,
        // because that is the profile that enables the dense stage.
        //
        // The other signal kinds are different in nature: an open editor buffer, a diagnostic, a
        // stack frame or a diff hunk is real text observed by the host, already exact, and re-reading
        // it from disk would gain nothing while introducing a freshness question that does not exist.
        const indexDerived = sourceKind === 'dense' && Boolean(matchedRecord);

        const candidate: EvidenceCandidate = {
            id, snapshotGeneration: request.snapshot.generation, category, sourceKind,
            fileKey: matchedRecord?.key, filePath: matchedRecord?.relativePath,
            symbolName: signal.symbolName, lineStart: signal.lineStart, lineEnd: signal.lineEnd, content: signal.content,
            contentHash: this.hash(signal.content), dependencies: Object.freeze([]),
            nominatedFromSkeleton: indexDerived,
            provenance: Object.freeze([`${sourceKind}:${signal.version ?? 'request'}`]), mandatory: false,
            sourceScore: 20, fusedScore: 0, diversityScore: 0
        };
        return { candidate, source: sourceKind, score: 20 };
    }

    /**
     * Collapses candidates whose content is byte-identical, before anything expensive runs.
     *
     * Two nominations of the same bytes are one piece of evidence. Left in, they cost reranking work
     * proportional to the duplication, they crowd genuinely distinct evidence out of the top-K, and
     * MMR then spends its diversity budget separating things that are not different. Doing this
     * after scoring would be too late: the cost has already been paid and the ranking already skewed.
     *
     * Exact only - identical hashes. Near-duplicate merging is a different question with different
     * risks, and it stays after ranking where the protected-distinction gates can see it.
     *
     * The survivor is the highest-scoring nomination, and it inherits the provenance of everything it
     * absorbed, so collapsing never loses the record of where the evidence was seen.
     */
    private collapseExactDuplicates(seeds: RankedSeed[]): RankedSeed[] {
        const bestByContent = new Map<string, RankedSeed>();
        const absorbed = new Map<string, Set<string>>();
        const order: string[] = [];

        for (const seed of seeds) {
            // Category matters: the same bytes serving as the target implementation and as a caller
            // are answering two different questions, and collapsing across that would silently drop
            // a required category.
            const key = `${seed.candidate.category}:${seed.candidate.contentHash}`;
            const incumbent = bestByContent.get(key);
            if (!incumbent) {
                bestByContent.set(key, seed);
                absorbed.set(key, new Set(seed.candidate.provenance));
                order.push(key);
                continue;
            }
            for (const tag of seed.candidate.provenance) absorbed.get(key)!.add(tag);
            // Keep the stronger nomination; ties break on id so the result stays deterministic.
            const better = seed.score > incumbent.score
                || (seed.score === incumbent.score && seed.candidate.id < incumbent.candidate.id);
            if (better) bestByContent.set(key, seed);
        }

        return order.map(key => {
            const seed = bestByContent.get(key)!;
            const provenance = [...absorbed.get(key)!].sort();
            return provenance.length === seed.candidate.provenance.length
                ? seed
                : { ...seed, candidate: { ...seed.candidate, provenance: Object.freeze(provenance) } };
        });
    }

    private fuse(seeds: RankedSeed[], required: Set<EvidenceCategory>, forbidden: Set<EvidenceCategory>): EvidenceCandidate[] {
        const byId = new Map<string, EvidenceCandidate>();
        const sourceGroups = new Map<string, RankedSeed[]>();
        for (const seed of seeds) {
            const group = sourceGroups.get(seed.source) || [];
            group.push(seed);
            sourceGroups.set(seed.source, group);
            if (!byId.has(seed.candidate.id)) byId.set(seed.candidate.id, seed.candidate);
        }
        const fused = new Map<string, number>();
        for (const group of sourceGroups.values()) {
            group.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
            group.forEach((seed, index) => fused.set(seed.candidate.id, (fused.get(seed.candidate.id) || 0) + 1 / (60 + index + 1)));
        }
        return [...byId.values()].map(candidate => ({ ...candidate,
            mandatory: required.has(candidate.category) && candidate.sourceKind !== 'repository_rank' && candidate.sourceScore > 0,
            fusedScore: fused.get(candidate.id) || 0 })).sort((a, b) => {
                if (forbidden.has(a.category) !== forbidden.has(b.category)) return forbidden.has(a.category) ? 1 : -1;
                if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
                return b.fusedScore - a.fusedScore || a.id.localeCompare(b.id);
            });
    }

    private selectDiverse(pool: EvidenceCandidate[], required: readonly EvidenceCategory[], limit: number): EvidenceCandidate[] {
        const selected: EvidenceCandidate[] = [];
        const remaining = [...pool];
        for (const category of required) {
            const index = remaining.findIndex(candidate => candidate.category === category && this.canSatisfyRequirement(candidate));
            if (index >= 0) selected.push(remaining.splice(index, 1)[0]);
        }

        // Bound pool size to top scoring candidates to prevent quadratic blowup on large workspaces
        if (remaining.length > Math.max(limit * 3, 50)) {
            remaining.sort((a, b) => b.fusedScore - a.fusedScore || a.id.localeCompare(b.id));
            remaining.length = Math.max(limit * 3, 50);
        }

        const tokenCosts = new Map<string, number>();
        const candidateTerms = new Map<string, Set<string>>();
        const getCandidateTerms = (candidate: EvidenceCandidate): Set<string> => {
            let terms = candidateTerms.get(candidate.id);
            if (!terms) {
                const snippet = candidate.content.length > 2000 ? candidate.content.slice(0, 2000) : candidate.content;
                terms = this.terms(snippet);
                candidateTerms.set(candidate.id, terms);
            }
            return terms;
        };

        for (const candidate of remaining) {
            tokenCosts.set(candidate.id, TokenCounter.countTokens(candidate.content));
        }

        while (selected.length < limit && remaining.length > 0) {
            let bestIndex = 0;
            let bestScore = -Infinity;
            for (let index = 0; index < remaining.length; index++) {
                const candidate = remaining[index];
                const redundancy = selected.reduce((max, item) => Math.max(max, this.similarityWithTerms(candidate, item, getCandidateTerms)), 0);
                const score = candidateUtility({ mandatory: candidate.mandatory,
                    relevance: Math.min(1, candidate.fusedScore * 60), freshness: 1,
                    uniqueness: 1 - redundancy, dependencyClosure: candidate.dependencies.length > 0 ? 1 : 0.8,
                    confidence: Math.min(1, candidate.sourceScore / 20), sensitivityRisk: 0,
                    tokenCost: tokenCosts.get(candidate.id) ?? TokenCounter.countTokens(candidate.content) });
                if (score > bestScore || (score === bestScore && candidate.id < remaining[bestIndex].id)) {
                    bestIndex = index; bestScore = score;
                }
            }
            selected.push({ ...remaining.splice(bestIndex, 1)[0], diversityScore: bestScore });
        }
        return selected;
    }

    private categoryFor(record: WorkspaceFileRecord, symbol: WorkspaceIndexSymbol, activeFilePath?: string): EvidenceCategory {
        if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./i.test(record.relativePath)) return 'tests';
        if (/(?:^|\/)(?:config|configuration)(?:\/|$)|\.(?:json|ya?ml|toml)$/i.test(record.relativePath)) return 'configuration';
        if (symbol.kind === 'interface' || symbol.kind === 'type' || symbol.kind === 'enum') return 'apiContract';
        if (activeFilePath && path.resolve(activeFilePath) === path.resolve(record.absolutePath)) return 'targetImplementation';
        return 'targetImplementation';
    }

    /**
     * Chooses which symbol's body to render when the candidate names no symbol of its own.
     *
     * This used to take the first range in the file, which is an arbitrary choice dressed up as a
     * precise one. For `requestContextEnvelope.ts` the first symbol is a one-line type alias, so a
     * question about the selection threshold received that alias rendered as the exact
     * implementation - byte-perfect, and about the wrong code. The controlled model-task evaluation
     * caught it: the model replied INSUFFICIENT CONTEXT on exactly the cases where the file was
     * retrieved correctly but the wrong span of it was rendered.
     *
     * Preference order: a symbol the query actually names, then a symbol whose name shares terms with
     * the query, then the largest range in the file. The last is still a fallback, but "the most
     * substantial thing in this file" is a defensible default in a way that "whatever happens to be
     * declared first" is not.
     */
    private bestRangeForQuery(
        ranges: readonly SemanticChunkRange[],
        query: string
    ): SemanticChunkRange | undefined {
        if (ranges.length === 0) return undefined;
        const queryLower = query.toLowerCase();
        const queryTerms = this.terms(query);

        let best: SemanticChunkRange | undefined;
        let bestScore = -1;
        for (const range of ranges) {
            const name = range.symbolName;
            let score = 0;
            // The query naming the symbol outright is the strongest signal available.
            if (name.length > 2 && queryLower.includes(name.toLowerCase())) score += 100;
            // Otherwise fall back to shared vocabulary, split so camelCase names match prose.
            for (const term of this.terms(name)) if (queryTerms.has(term)) score += 10;
            // Size breaks ties toward the more substantial body rather than the earlier one.
            score += Math.min(5, (range.endLine - range.startLine) / 20);
            if (score > bestScore
                || (score === bestScore && best && range.chunkId < best.chunkId)) {
                best = range;
                bestScore = score;
            }
        }
        return best;
    }

    /**
     * Replaces nominated implementation evidence with byte-exact source.
     *
     * Ranking runs over skeletons and signatures because they are cheap; this pass is the point at
     * which a candidate stops being a nomination and becomes rendered evidence, and it is the only
     * place a skeleton is allowed to be promoted. Anything that cannot be proven to come from the
     * captured snapshot keeps its nominated content but is marked with a shortfall, so an approximate
     * body can never be silently presented as the implementation.
     *
     * Bounded by MAX_REHYDRATIONS_PER_REQUEST: exact source costs a file read each, and a request
     * that needed dozens of exact bodies has a retrieval problem, not a rehydration problem.
     */
    private rehydrateSelected(
        request: EvidenceRetrievalRequest,
        selected: readonly EvidenceCandidate[]
    ): EvidenceCandidate[] {
        const needsExact = requiresExactSource(request.taskType);
        const provider = request.exactSource;
        // Exact source is read only for candidates that already survived selection, so the read
        // budget follows the selection rather than a constant that silently contradicts it. A fixed
        // ceiling below the selection size rendered the overflow as skeletons - signatures presented
        // alongside real code, with nothing in the payload distinguishing them.
        let budget = Math.max(MAX_REHYDRATIONS_PER_REQUEST, selected.length);

        return selected.map(candidate => {
            // Only skeleton-nominated implementation evidence is rehydrated. A signature rendered for
            // an API contract is already exact at the representation level the contract asked for,
            // and a candidate carrying signal text - an open buffer, a diagnostic, a stack frame - is
            // already the real source, so re-reading it from disk would gain nothing and could only
            // introduce a freshness question that does not exist.
            const implementationBearing = candidate.category === 'targetImplementation'
                || candidate.category === 'callers'
                || candidate.category === 'tests';
            if (!implementationBearing || !candidate.nominatedFromSkeleton) return candidate;

            if (!needsExact) return candidate;
            if (!provider) {
                return { ...candidate, exactSource: false,
                    exactSourceShortfall: 'No exact source reader was available for this request.' };
            }
            if (budget <= 0) {
                return { ...candidate, exactSource: false,
                    exactSourceShortfall: 'The per-request exact-source budget was exhausted.' };
            }

            const record = candidate.fileKey ? request.snapshot.files.get(candidate.fileKey) : undefined;
            if (!record) {
                return { ...candidate, exactSource: false,
                    exactSourceShortfall: 'The nominating file is no longer in the snapshot.' };
            }
            // Tolerates a record built before ranges were captured, or restored from an older
            // persisted index: absent ranges are a shortfall to declare, never a thrown request.
            const ranges = record.chunkRanges || [];
            const range = candidate.symbolName
                ? ranges.find(item => item.symbolName === candidate.symbolName)
                : this.bestRangeForQuery(ranges, request.query);
            if (!range) {
                return { ...candidate, exactSource: false,
                    exactSourceShortfall: 'No exact range was captured for this symbol.' };
            }

            budget--;
            const rehydrated = rehydrateExact(range, record.absolutePath, provider);
            if (rehydrated.status !== 'exact' || !rehydrated.text) {
                return { ...candidate, exactSource: false, exactSourceShortfall: rehydrated.reason };
            }

            // Exact source must not be *less* safe than the skeleton it replaced. A skeleton reached
            // the payload through the AST pruner, which redacts secrets and strips injected
            // instructions; rehydrated bytes bypass the pruner entirely, so the same two defences are
            // applied here or rendering exact source would be a security regression dressed as a
            // fidelity improvement.
            //
            // Byte-exactness is a means to correctness, not an end. Sending a credential to a model
            // provider is strictly worse than sending code that is a few characters different, so
            // when these transforms change anything the change is kept and recorded in provenance
            // rather than being suppressed to protect the exactness claim.
            const secretScan = SecuritySanitizer.sanitizeSecrets(rehydrated.text);
            const injectionScan = SecuritySanitizer.stripPromptInjections(secretScan.sanitized);
            const safeText = injectionScan.sanitized;
            const safetyTags: string[] = [];
            if (secretScan.sanitized !== rehydrated.text) safetyTags.push('sanitized:secrets');
            if (injectionScan.strippedCount > 0) safetyTags.push('sanitized:injected_instructions');

            return {
                ...candidate,
                content: safeText,
                contentHash: range.chunkHash,
                nominatedContentHash: candidate.contentHash,
                lineStart: range.startLine,
                lineEnd: range.endLine,
                exactSource: true,
                provenance: Object.freeze([...candidate.provenance,
                    `exact:${range.boundary}`, `chunk:${range.chunkHash.slice(0, 12)}`, ...safetyTags])
            };
        });
    }

    private candidate(request: EvidenceRetrievalRequest, category: EvidenceCategory, sourceKind: EvidenceSourceKind, content: string,
        record: WorkspaceFileRecord, symbol: WorkspaceIndexSymbol | undefined, sourceScore: number, provenance: string[], dependencies: string[] = []): EvidenceCandidate {
        const id = `${record.key}:${symbol?.name || 'file'}:${category}`;
        const prov = this.provenanceEngine.inspectProvenance(record.relativePath, record.skeleton, request.snapshot);
        let adjustedScore = sourceScore;
        const queryLower = request.query.toLowerCase();
        const explicitlyTargeted = queryLower.includes(path.basename(record.relativePath).toLowerCase()) ||
            (symbol && queryLower.includes(symbol.name.toLowerCase()));
        if (prov.isLowTrust && !explicitlyTargeted) {
            adjustedScore = Math.max(0.1, sourceScore * 0.2);
        }
        const provTags = [`provenance:${prov.category}`, `risk:${prov.sensitivityRisk}`, ...provenance];
        return { id, snapshotGeneration: request.snapshot.generation, category, sourceKind, fileKey: record.key,
            nominatedFromSkeleton: content === record.skeleton,
            filePath: record.relativePath, symbolName: symbol?.name, lineStart: symbol?.line, lineEnd: symbol?.line,
            content, contentHash: this.hash(content), dependencies: Object.freeze([...dependencies].sort()),
            provenance: Object.freeze(provTags), mandatory: false, sourceScore: adjustedScore, fusedScore: 0, diversityScore: 0 };
    }

    private missingRequired(required: readonly EvidenceCategory[], candidates: readonly EvidenceCandidate[]): EvidenceCategory[] {
        const covered = new Set(candidates.filter(candidate => this.canSatisfyRequirement(candidate)).map(candidate => candidate.category));
        return required.filter(category => !covered.has(category));
    }

    private canSatisfyRequirement(candidate: EvidenceCandidate): boolean {
        return candidate.sourceKind !== 'repository_rank' && candidate.sourceKind !== 'memory'
            && candidate.sourceScore > 0 && candidate.content.trim().length > 0;
    }

    private similarityWithTerms(a: EvidenceCandidate, b: EvidenceCandidate, getTerms: (c: EvidenceCandidate) => Set<string>): number {
        if (a.fileKey && a.fileKey === b.fileKey) return 1;
        const at = getTerms(a), bt = getTerms(b);
        let intersection = 0;
        for (const term of at) if (bt.has(term)) intersection++;
        return intersection / Math.max(1, at.size + bt.size - intersection);
    }

    private similarity(a: EvidenceCandidate, b: EvidenceCandidate): number {
        if (a.fileKey && a.fileKey === b.fileKey) return 1;
        const aSnippet = a.content.length > 2000 ? a.content.slice(0, 2000) : a.content;
        const bSnippet = b.content.length > 2000 ? b.content.slice(0, 2000) : b.content;
        const at = this.terms(aSnippet), bt = this.terms(bSnippet);
        let intersection = 0;
        for (const term of at) if (bt.has(term)) intersection++;
        return intersection / Math.max(1, at.size + bt.size - intersection);
    }

    private terms(value: string): Set<string> {
        return new Set(value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9_$]+/).filter(term => term.length > 1));
    }

    private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
}

function contractSymbolMatch(symbolName: string, query: string): boolean {
    return new RegExp(`\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query);
}
