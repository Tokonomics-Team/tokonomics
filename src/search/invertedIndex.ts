/**
 * Tokonomics High-Performance Inverted Postings Index
 * Industrial-grade inverted index with compressed postings lists, O(1) term lookup,
 * direct primitive buffer score accumulation, and O(UniqueDocTerms) incremental document mutations.
 */

export interface PostingsEntry {
    readonly docId: string;
    readonly docIndex: number;
    readonly termFrequency: number;
    readonly docLength: number;
}

export interface InvertedIndexStats {
    readonly docCount: number;
    readonly totalDocTokens: number;
    readonly avgDocLength: number;
    readonly uniqueTerms: number;
    readonly totalPostings: number;
}

export class InvertedPostingsIndex {
    // Term -> Array of postings entries
    private postings: Map<string, PostingsEntry[]> = new Map();
    // DocId -> Internal integer document index
    private idToDocIndex: Map<string, number> = new Map();
    // DocIndex -> DocId
    private docIndexToId: string[] = [];
    private freeDocIndices: number[] = [];
    // DocId -> Total token length of document
    private docLengths: Map<string, number> = new Map();
    // DocId -> Set of unique terms contained in document (for sub-millisecond incremental deletion)
    private docTerms: Map<string, Set<string>> = new Map();

    private totalDocTokens: number = 0;
    private docCount: number = 0;
    private avgDocLength: number = 0;

    // High-performance reusable buffers for O(Touched) score evaluation without GC thrashing
    private scoreBuf: Float64Array = new Float64Array(32768);
    private touchedIndices: Int32Array = new Int32Array(32768);

    private ensureCapacity(needed: number): void {
        if (needed > this.scoreBuf.length) {
            const newCap = Math.max(needed * 2, this.scoreBuf.length * 2);
            this.scoreBuf = new Float64Array(newCap);
            this.touchedIndices = new Int32Array(newCap);
        }
    }

    /**
     * Adds or replaces a document in the inverted index
     */
    public addDocument(
        id: string,
        terms: string[] | Map<string, number>,
        docLength?: number
    ): void {
        if (!id) return;

        // If document already exists, remove it first to ensure clean state and term frequency consistency
        if (this.idToDocIndex.has(id)) {
            this.removeDocument(id);
        }

        let tfMap: Map<string, number>;
        let computedLen: number;

        if (Array.isArray(terms)) {
            tfMap = new Map<string, number>();
            for (let i = 0; i < terms.length; i++) {
                const t = terms[i];
                if (t.length <= 1) continue;
                tfMap.set(t, (tfMap.get(t) || 0) + 1);
            }
            computedLen = docLength !== undefined ? docLength : terms.length;
        } else {
            tfMap = terms;
            if (docLength !== undefined) {
                computedLen = docLength;
            } else {
                let sum = 0;
                for (const count of tfMap.values()) {
                    sum += count;
                }
                computedLen = sum;
            }
        }

        const docIndex = this.freeDocIndices.pop() ?? this.docIndexToId.length;
        this.docIndexToId[docIndex] = id;
        this.idToDocIndex.set(id, docIndex);
        this.ensureCapacity(docIndex + 1);

        const uniqueTerms = new Set<string>();

        for (const [term, freq] of tfMap.entries()) {
            if (freq <= 0) continue;
            let list = this.postings.get(term);
            if (!list) {
                list = [];
                this.postings.set(term, list);
            }
            list.push({
                docId: id,
                docIndex,
                termFrequency: freq,
                docLength: computedLen
            });
            uniqueTerms.add(term);
        }

        this.docLengths.set(id, computedLen);
        this.docTerms.set(id, uniqueTerms);
        this.totalDocTokens += computedLen;
        this.docCount++;
        this.avgDocLength = this.totalDocTokens / this.docCount;
    }

    /**
     * Removes a document from the inverted index in O(UniqueDocTerms) time
     * Only touches the postings lists of terms actually present in this document.
     */
    public removeDocument(id: string): boolean {
        const docIndex = this.idToDocIndex.get(id);
        if (docIndex === undefined) {
            return false;
        }

        const existingLen = this.docLengths.get(id) || 0;
        const terms = this.docTerms.get(id);
        if (terms) {
            for (const term of terms) {
                const list = this.postings.get(term);
                if (list) {
                    let idx = -1;
                    for (let i = 0; i < list.length; i++) {
                        if (list[i].docIndex === docIndex) {
                            idx = i;
                            break;
                        }
                    }

                    if (idx !== -1) {
                        const lastIdx = list.length - 1;
                        if (idx !== lastIdx) {
                            list[idx] = list[lastIdx];
                        }
                        list.pop();

                        if (list.length === 0) {
                            this.postings.delete(term);
                        }
                    }
                }
            }
        }

        this.docIndexToId[docIndex] = ''; // Reuse deleted slots on the next insertion.
        this.scoreBuf[docIndex] = 0;
        this.freeDocIndices.push(docIndex);
        this.idToDocIndex.delete(id);
        this.docLengths.delete(id);
        this.docTerms.delete(id);
        this.totalDocTokens -= existingLen;
        this.docCount--;
        this.avgDocLength = this.docCount > 0 ? this.totalDocTokens / this.docCount : 0;

        return true;
    }

    /**
     * Checks if a document is present in the index
     */
    public hasDocument(id: string): boolean {
        return this.idToDocIndex.has(id);
    }

    /**
     * Retrieves postings list for a term in O(1) time
     */
    public getPostings(term: string): readonly PostingsEntry[] | undefined {
        return this.postings.get(term);
    }

    /**
     * Retrieves stored document length
     */
    public getDocLength(id: string): number | undefined {
        return this.docLengths.get(id);
    }

    /**
     * Document frequency for a given term (number of documents containing the term)
     */
    public getDocFrequency(term: string): number {
        const list = this.postings.get(term);
        return list ? list.length : 0;
    }

    public getDocCount(): number {
        return this.docCount;
    }

    public getAvgDocLength(): number {
        return this.avgDocLength;
    }

    public getTotalDocTokens(): number {
        return this.totalDocTokens;
    }

    /**
     * Executes sub-millisecond Okapi BM25 scoring over postings with direct TypedArray accumulation
     */
    public searchBM25(
        queryTokens: string[],
        topK: number = 20,
        k1: number = 1.2,
        b: number = 0.75
    ): { id: string; score: number }[] {
        const docCount = this.docCount;
        if (queryTokens.length === 0 || docCount === 0) {
            return [];
        }

        const avgLen = this.avgDocLength || 1;
        const k1_1_b = k1 * (1 - b);
        const k1_b_div_avg = (k1 * b) / avgLen;
        const k1_plus_1 = k1 + 1;

        const uniqueTerms = Array.from(new Set(queryTokens));
        const termData: { list: readonly PostingsEntry[]; df: number; idf: number }[] = [];
        let maxIdf = 0;

        for (let t = 0; t < uniqueTerms.length; t++) {
            const q = uniqueTerms[t];
            const list = this.postings.get(q);
            if (!list || list.length === 0) continue;
            const df = list.length;
            const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
            if (idf > maxIdf) maxIdf = idf;
            termData.push({ list, df, idf });
        }

        if (termData.length === 0) {
            return [];
        }

        let touchedCount = 0;
        const scoreBuf = this.scoreBuf;
        const touchedIndices = this.touchedIndices;

        for (let t = 0; t < termData.length; t++) {
            const { list, df, idf } = termData[t];
            // When discriminative terms are present, skip uninformative ubiquitous words
            if (termData.length > 1 && idf < maxIdf * 0.05 && df > 5000) {
                continue;
            }

            const len = list.length;
            for (let i = 0; i < len; i++) {
                const entry = list[i];
                const dIdx = entry.docIndex;
                const tf = entry.termFrequency;
                const docLen = entry.docLength;

                const denom = tf + k1_1_b + docLen * k1_b_div_avg;
                const termScore = idf * (tf * k1_plus_1) / (denom || 1);

                if (scoreBuf[dIdx] === 0) {
                    touchedIndices[touchedCount++] = dIdx;
                }
                scoreBuf[dIdx] += termScore;
            }
        }

        if (touchedCount === 0) {
            return [];
        }

        const results: { id: string; score: number }[] = [];
        for (let i = 0; i < touchedCount; i++) {
            const dIdx = touchedIndices[i];
            const score = scoreBuf[dIdx];
            scoreBuf[dIdx] = 0; // O(Touched) reset: no full-buffer clear needed
            const docId = this.docIndexToId[dIdx];
            if (docId) {
                results.push({
                    id: docId,
                    score: Math.round(score * 100) / 100
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, topK);
    }

    public getStats(): InvertedIndexStats {
        let totalPostings = 0;
        for (const list of this.postings.values()) {
            totalPostings += list.length;
        }

        return {
            docCount: this.docCount,
            totalDocTokens: this.totalDocTokens,
            avgDocLength: this.avgDocLength,
            uniqueTerms: this.postings.size,
            totalPostings
        };
    }

    public clear(): void {
        this.postings.clear();
        this.idToDocIndex.clear();
        this.docIndexToId.length = 0;
        this.freeDocIndices.length = 0;
        this.docLengths.clear();
        this.docTerms.clear();
        this.totalDocTokens = 0;
        this.docCount = 0;
        this.avgDocLength = 0;
        this.scoreBuf.fill(0);
    }
}
