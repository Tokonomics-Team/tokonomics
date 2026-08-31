/**
 * Tokonomics SCIP (Source Code Intelligence Protocol) Indexer
 * Standardized cross-file symbol indexing and definition-reference linkage.
 */

export interface ScipOccurrence {
    symbol: string;
    filePath: string;
    line: number;
    character: number;
    role: 'definition' | 'reference' | 'import' | 'implementation';
    syntaxKind?: string;
}

export interface ScipSymbolInformation {
    symbol: string;
    kind: 'class' | 'interface' | 'function' | 'method' | 'type' | 'enum' | 'struct' | 'module';
    filePath: string;
    line: number;
    signature: string;
    docstring?: string;
    enclosingSymbol?: string;
    relationships: { symbol: string; relation: 'extends' | 'implements' | 'calls' | 'references' }[];
}

export class ScipIndexer {
    private symbols: Map<string, ScipSymbolInformation> = new Map();
    private occurrencesByFile: Map<string, ScipOccurrence[]> = new Map();
    private occurrencesBySymbol: Map<string, ScipOccurrence[]> = new Map();

    /**
     * Registers a symbol definition in the SCIP index
     */
    public registerSymbol(info: ScipSymbolInformation): void {
        this.symbols.set(info.symbol, info);
        
        // Add definition occurrence
        const defOcc: ScipOccurrence = {
            symbol: info.symbol,
            filePath: info.filePath,
            line: info.line,
            character: 0,
            role: 'definition',
            syntaxKind: info.kind
        };
        this.addOccurrence(defOcc);
    }

    /**
     * Registers a symbol reference occurrence (call, import, type reference)
     */
    public registerOccurrence(occ: ScipOccurrence): void {
        this.addOccurrence(occ);
    }

    private addOccurrence(occ: ScipOccurrence): void {
        // Index by file
        if (!this.occurrencesByFile.has(occ.filePath)) {
            this.occurrencesByFile.set(occ.filePath, []);
        }
        this.occurrencesByFile.get(occ.filePath)!.push(occ);

        // Index by symbol
        if (!this.occurrencesBySymbol.has(occ.symbol)) {
            this.occurrencesBySymbol.set(occ.symbol, []);
        }
        this.occurrencesBySymbol.get(occ.symbol)!.push(occ);
    }

    /**
     * Resolves the primary definition for a given symbol name or SCIP string
     */
    public findDefinition(symbolOrName: string): ScipSymbolInformation | undefined {
        if (this.symbols.has(symbolOrName)) {
            return this.symbols.get(symbolOrName);
        }

        const cleanQuery = symbolOrName.replace(/[.()#]/g, '');

        // Match by suffix, substring or cleaned name
        for (const [key, val] of this.symbols.entries()) {
            if (key.includes(symbolOrName) || key.endsWith(symbolOrName) || key.endsWith(`${symbolOrName}.`)) {
                return val;
            }
            const cleanKey = key.replace(/[.()#]/g, '');
            if (cleanKey.endsWith(cleanQuery) || cleanKey.includes(cleanQuery)) {
                return val;
            }
        }
        return undefined;
    }

    /**
     * Retrieves all cross-file references to a symbol
     */
    public findReferences(symbolOrName: string): ScipOccurrence[] {
        const direct = this.occurrencesBySymbol.get(symbolOrName);
        if (direct && direct.length > 0) {
            return direct.filter(o => o.role === 'reference');
        }

        // Fuzzy match
        for (const [key, occurrences] of this.occurrencesBySymbol.entries()) {
            if (key.includes(symbolOrName) || key.endsWith(symbolOrName) || key.endsWith(`${symbolOrName}.`)) {
                return occurrences.filter(o => o.role === 'reference');
            }
        }
        return [];
    }

    public getAllSymbols(): ScipSymbolInformation[] {
        return Array.from(this.symbols.values());
    }

    public getSymbolCount(): number {
        return this.symbols.size;
    }

    public clear(): void {
        this.symbols.clear();
        this.occurrencesByFile.clear();
        this.occurrencesBySymbol.clear();
    }
}
