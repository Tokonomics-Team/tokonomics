import { SecuritySanitizer } from '../security/sanitizer';

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
    private maxHistoryDepth: number = 5;

    public registerCommit(commit: GitCommitNode): void {
        // Step 5: Privacy & Secret Sanitization
        // Strip author email address
        const sanitizedAuthor = (commit.author || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
            .trim() || 'developer';

        // Strip remote URLs and sanitize secrets from message
        const messageWithoutUrls = (commit.message || '')
            .replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]')
            .replace(/git@[^\s]+/g, '[REDACTED_URL]');
        const sanitizedMessage = SecuritySanitizer.sanitizeSecrets(messageWithoutUrls).sanitized;

        const sanitizedCommit: GitCommitNode = {
            ...commit,
            author: sanitizedAuthor,
            message: sanitizedMessage
        };

        this.commits.set(sanitizedCommit.hash, sanitizedCommit);

        for (const mod of sanitizedCommit.modifiedSymbols) {
            if (!this.symbolHistory.has(mod.symbolName)) {
                this.symbolHistory.set(mod.symbolName, []);
            }
            const list = this.symbolHistory.get(mod.symbolName)!;
            if (!list.includes(sanitizedCommit.hash)) {
                list.push(sanitizedCommit.hash);
                // Cap history depth
                if (list.length > this.maxHistoryDepth) {
                    list.shift();
                }
            }
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
