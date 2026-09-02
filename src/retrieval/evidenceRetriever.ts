import { createHash } from 'crypto';
import * as path from 'path';
import { EvidenceCategory } from '../governor/governorTypes';
import { WorkspaceFileRecord, WorkspaceIndexSymbol } from '../workspace/workspaceIndex';
import { EvidenceContractBuilder } from './evidenceContract';
import { EvidenceCandidate, EvidenceDecision, EvidenceRetrievalRequest, EvidenceRetrievalResult, EvidenceSignal, EvidenceSourceKind } from './evidenceTypes';

interface RankedSeed { candidate: EvidenceCandidate; source: string; score: number; }

export class EvidenceAwareRetriever {
    public retrieve(request: EvidenceRetrievalRequest): EvidenceRetrievalResult {
        const contract = EvidenceContractBuilder.build(request.taskType, request.query);
        const seeds = this.produceSeeds(request, contract.required);
        const candidates = this.fuse(seeds, new Set(contract.required), new Set(contract.forbidden));
        const eligibleCandidates = candidates.filter(candidate => !contract.forbidden.includes(candidate.category));
        const stages = [
            { name: 'direct', sources: new Set<EvidenceSourceKind>(['lexical', 'symbol', 'ast', 'diagnostic', 'stack', 'open_editor']) },
            { name: 'dependency-and-test', sources: new Set<EvidenceSourceKind>(['graph', 'lsp', 'test']) },
            { name: 'broad', sources: new Set<EvidenceSourceKind>(['repository_rank', 'diff', 'configuration']) }
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
        const maxCandidates = Math.max(contract.required.length, request.maxCandidates ?? 10);
        const selected = this.selectDiverse(pool, contract.required, maxCandidates);
        missing = this.missingRequired(contract.required, selected);
        const selectedIds = new Set(selected.map(candidate => candidate.id));
        const decisions: EvidenceDecision[] = candidates.map(candidate => selectedIds.has(candidate.id)
            ? { candidateId: candidate.id, action: 'include', rank: selected.findIndex(item => item.id === candidate.id) + 1,
                reason: candidate.mandatory ? `Required ${candidate.category} evidence.` : `High fused relevance with diversity.` }
            : { candidateId: candidate.id, action: 'exclude', reason: contract.forbidden.includes(candidate.category)
                ? `Category ${candidate.category} is forbidden for ${contract.taskType}.` : `Lower fused utility or redundant evidence.` });
        const covered = [...new Set(selected.filter(candidate => this.canSatisfyRequirement(candidate)).map(candidate => candidate.category))];
        const criticalRecall = contract.required.length === 0 ? 1 : (contract.required.length - missing.length) / contract.required.length;
        return {
            contract, selected: Object.freeze(selected), allCandidates: Object.freeze(candidates), decisions: Object.freeze(decisions),
            covered: Object.freeze(covered), missingRequired: Object.freeze(missing), criticalRecall,
            stagesExecuted: Object.freeze(stagesExecuted), sufficient: missing.length === 0, conservativeFallback: missing.length > 0
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
        const matchedRecord = normalizedSignalPath
            ? [...request.snapshot.files.values()].find(record => record.absolutePath.replace(/\\/g, '/').toLowerCase() === normalizedSignalPath)
            : undefined;
        const candidate: EvidenceCandidate = {
            id, snapshotGeneration: request.snapshot.generation, category, sourceKind,
            fileKey: matchedRecord?.key, filePath: matchedRecord?.relativePath,
            symbolName: signal.symbolName, lineStart: signal.lineStart, lineEnd: signal.lineEnd, content: signal.content,
            contentHash: this.hash(signal.content), dependencies: Object.freeze([]),
            provenance: Object.freeze([`${sourceKind}:${signal.version ?? 'request'}`]), mandatory: false,
            sourceScore: 20, fusedScore: 0, diversityScore: 0
        };
        return { candidate, source: sourceKind, score: 20 };
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
        while (selected.length < limit && remaining.length > 0) {
            let bestIndex = 0;
            let bestScore = -Infinity;
            for (let index = 0; index < remaining.length; index++) {
                const candidate = remaining[index];
                const redundancy = selected.reduce((max, item) => Math.max(max, this.similarity(candidate, item)), 0);
                const score = candidate.fusedScore * 0.72 - redundancy * 0.28;
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

    private candidate(request: EvidenceRetrievalRequest, category: EvidenceCategory, sourceKind: EvidenceSourceKind, content: string,
        record: WorkspaceFileRecord, symbol: WorkspaceIndexSymbol | undefined, sourceScore: number, provenance: string[], dependencies: string[] = []): EvidenceCandidate {
        const id = `${record.key}:${symbol?.name || 'file'}:${category}`;
        return { id, snapshotGeneration: request.snapshot.generation, category, sourceKind, fileKey: record.key,
            filePath: record.relativePath, symbolName: symbol?.name, lineStart: symbol?.line, lineEnd: symbol?.line,
            content, contentHash: this.hash(content), dependencies: Object.freeze([...dependencies].sort()),
            provenance: Object.freeze(provenance), mandatory: false, sourceScore, fusedScore: 0, diversityScore: 0 };
    }

    private missingRequired(required: readonly EvidenceCategory[], candidates: readonly EvidenceCandidate[]): EvidenceCategory[] {
        const covered = new Set(candidates.filter(candidate => this.canSatisfyRequirement(candidate)).map(candidate => candidate.category));
        return required.filter(category => !covered.has(category));
    }

    private canSatisfyRequirement(candidate: EvidenceCandidate): boolean {
        return candidate.sourceKind !== 'repository_rank' && candidate.sourceScore > 0 && candidate.content.trim().length > 0;
    }

    private similarity(a: EvidenceCandidate, b: EvidenceCandidate): number {
        if (a.fileKey && a.fileKey === b.fileKey) return 1;
        const at = this.terms(a.content), bt = this.terms(b.content);
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
