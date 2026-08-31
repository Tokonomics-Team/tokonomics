/**
 * Tokonomics Temporal Git History & GitGraph Engine
 * Tracks commit graphs and symbol evolution (MODIFIES_SYMBOL, INTRODUCES, REMOVES, SUPERSEDES)
 * to answer regression and intent questions ("What changed around this symbol?").
 */

export interface GitCommitNode {
    hash: string;
    shortHash: string;
    author: string;
    message: string;
    timestamp: number;
    modifiedFiles: string[];
    modifiedSymbols: { symbolName: string; filePath: string; changeType: 'added' | 'modified' | 'deleted' }[];
}

export class GitGraph {
    private commits: Map<string, GitCommitNode> = new Map();
    private symbolHistory: Map<string, string[]> = new Map(); // symbolName -> commitHashes[]

    public registerCommit(commit: GitCommitNode): void {
        this.commits.set(commit.hash, commit);

        for (const mod of commit.modifiedSymbols) {
            if (!this.symbolHistory.has(mod.symbolName)) {
                this.symbolHistory.set(mod.symbolName, []);
            }
            this.symbolHistory.get(mod.symbolName)!.push(commit.hash);
        }
    }

    /**
     * Retrieves the recent commit history touching a specific symbol
     */
    public getRecentSymbolHistory(symbolName: string, limit: number = 5): GitCommitNode[] {
        const hashes = this.symbolHistory.get(symbolName) || [];
        return hashes
            .map(h => this.commits.get(h)!)
            .filter(Boolean)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Finds the commit that most recently modified a failing symbol
     */
    public findRecentModifyingCommit(symbolName: string): GitCommitNode | undefined {
        const history = this.getRecentSymbolHistory(symbolName, 1);
        return history.length > 0 ? history[0] : undefined;
    }

    /**
     * Formats temporal intent context for inclusion in LLM prompt
     */
    public formatSymbolHistorySummary(symbolName: string): string {
        const history = this.getRecentSymbolHistory(symbolName, 3);
        if (history.length === 0) return '';

        let md = `**Recent Git History for \`${symbolName}\`:**\n`;
        for (const c of history) {
            const dateStr = new Date(c.timestamp).toISOString().split('T')[0];
            md += `- \`[${c.shortHash}]\` (${dateStr}) ${c.message} (by ${c.author})\n`;
        }
        return md;
    }

    public clear(): void {
        this.commits.clear();
        this.symbolHistory.clear();
    }
}
