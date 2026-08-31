/**
 * Tokonomics Semantic Tool Registry & Schema Optimization Suite
 * In-memory registry, semantic tool selector, and structured tool result downsampler.
 */

import { TokenCounter } from '../engine/tokenizer';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
    isMutating: boolean;
    category: 'filesystem' | 'git' | 'database' | 'terminal' | 'search' | 'generic';
}

export interface ToolSelectionResult {
    selectedTools: ToolDefinition[];
    omittedCount: number;
    tokensSaved: number;
}

export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    public registerTool(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
    }

    public getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Selects top-k tools relevant to the prompt intent, omitting irrelevant schemas
     */
    public selectRelevantTools(userPrompt: string, topK: number = 5): ToolSelectionResult {
        const queryWords = new Set(userPrompt.toLowerCase().split(/\s+/));
        const scoredTools: { tool: ToolDefinition; score: number }[] = [];
        let allToolsTokens = 0;

        for (const tool of this.tools.values()) {
            const toolText = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
            const toolTokens = TokenCounter.countTokens(JSON.stringify(tool));
            allToolsTokens += toolTokens;

            let score = 0;
            for (const q of queryWords) {
                if (q.length > 2 && toolText.includes(q)) {
                    score += 1.0;
                }
            }

            scoredTools.push({ tool, score });
        }

        scoredTools.sort((a, b) => b.score - a.score);
        const selected = scoredTools.slice(0, topK).map(s => s.tool);

        let selectedTokens = 0;
        for (const t of selected) {
            selectedTokens += TokenCounter.countTokens(JSON.stringify(t));
        }

        const omittedCount = Math.max(0, this.tools.size - selected.length);
        const tokensSaved = Math.max(0, allToolsTokens - selectedTokens);

        return {
            selectedTools: selected,
            omittedCount,
            tokensSaved
        };
    }

    public clear(): void {
        this.tools.clear();
    }
}

export class ToolResultOptimizer {
    /**
     * Downsamples large JSON arrays returned by tool executions into typed summaries
     */
    public optimizeToolResult(rawJsonString: string, maxItems: number = 5): string {
        try {
            const data = JSON.parse(rawJsonString);

            // If it's a large array of objects, retain head/tail and insert schema summary
            if (Array.isArray(data) && data.length > maxItems) {
                const totalCount = data.length;
                const head = data.slice(0, 3);
                const tail = data.slice(data.length - 2);
                const sampleKeys = Object.keys(data[0] || {});

                const compressedPayload = {
                    totalItemsCount: totalCount,
                    itemSchemaProperties: sampleKeys,
                    itemsSample: [...head, { _omittedItemsCount: totalCount - 5 }, ...tail]
                };

                return JSON.stringify(compressedPayload, null, 2);
            }

            return rawJsonString;
        } catch {
            return rawJsonString;
        }
    }
}
