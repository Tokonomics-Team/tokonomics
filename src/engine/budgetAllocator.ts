/**
 * Dynamic Proportional Context Budget Allocator
 * Automatically allocates exact token budgets across System Prompt, PageRank Repo Map,
 * AST Code Skeletons, and Conversation History with progressive multi-tier fallback.
 */

import { TokenCounter } from './tokenizer';
import { AstPrunerEngine } from '../ast/pruner';

export interface BudgetAllocation {
    systemBudget: number;
    repoMapBudget: number;
    codeBudget: number;
    historyBudget: number;
    queryBudget: number;
    totalBudget: number;
}

export interface AllocatedContext {
    systemPrompt: string;
    repoMap: string;
    prunedCode: string;
    historyMessages: Array<{ role: string; content: string }>;
    userQuery: string;
    totalTokens: number;
    pruningTierApplied: 'full' | 'stripped_bodies' | 'public_signatures_only' | 'type_contracts_only';
}

export class BudgetAllocator {
    constructor(private astEngine: AstPrunerEngine) {}

    /**
     * Slices the token budget proportionally across context layers
     */
    public calculateBudgets(totalBudget: number = 4000): BudgetAllocation {
        return {
            systemBudget: Math.round(totalBudget * 0.10), // 10%
            repoMapBudget: Math.round(totalBudget * 0.15), // 15%
            codeBudget: Math.round(totalBudget * 0.45),    // 45%
            historyBudget: Math.round(totalBudget * 0.20), // 20%
            queryBudget: Math.round(totalBudget * 0.10),   // 10%
            totalBudget
        };
    }

    /**
     * Fits all context components into the target token budget dynamically
     */
    public allocate(
        systemPrompt: string,
        repoMap: string,
        rawCode: string,
        rawHistory: Array<{ role: string; content: string }>,
        userQuery: string,
        targetTotalBudget: number = 4000,
        langId?: string
    ): AllocatedContext {
        const budgets = this.calculateBudgets(targetTotalBudget);

        // 1. Calculate base tokens
        const sysTokens = TokenCounter.countTokens(systemPrompt);
        const queryTokens = TokenCounter.countTokens(userQuery);

        // 2. Slice Repo Map to fit within its budget slice
        let fittedRepoMap = repoMap;
        let repoMapTokens = TokenCounter.countTokens(repoMap);
        if (repoMapTokens > budgets.repoMapBudget && repoMap.trim().length > 0) {
            const lines = repoMap.split('\n');
            const truncatedLines: string[] = [];
            let currentMapTok = 0;
            for (const line of lines) {
                const lTok = TokenCounter.countTokens(line);
                if (currentMapTok + lTok <= budgets.repoMapBudget) {
                    truncatedLines.push(line);
                    currentMapTok += lTok;
                } else {
                    break;
                }
            }
            fittedRepoMap = truncatedLines.join('\n');
            repoMapTokens = currentMapTok;
        }

        // Rebalance unused tokens to code & history
        const unusedBaseTokens = Math.max(0, budgets.systemBudget - sysTokens) + 
                                Math.max(0, budgets.queryBudget - queryTokens) +
                                Math.max(0, budgets.repoMapBudget - repoMapTokens);
        const adjustedCodeBudget = budgets.codeBudget + Math.round(unusedBaseTokens * 0.7);
        const adjustedHistoryBudget = budgets.historyBudget + Math.round(unusedBaseTokens * 0.3);

        // 3. Multi-Tier AST Code Fitting
        let prunedCode = rawCode;
        let pruningTier: AllocatedContext['pruningTierApplied'] = 'full';
        let codeTokens = TokenCounter.countTokens(rawCode);

        if (codeTokens > adjustedCodeBudget && rawCode.trim().length > 0) {
            // Tier 1: Strip function/method bodies
            const tier1 = this.astEngine.pruneCodeContext(rawCode, langId);
            prunedCode = tier1.prunedCode;
            codeTokens = tier1.prunedTokenCount;
            pruningTier = 'stripped_bodies';

            // Tier 2: If still over budget, retain only exported public declarations
            if (codeTokens > adjustedCodeBudget) {
                const lines = prunedCode.split('\n');
                const publicOnly = lines.filter(l => 
                    l.startsWith('export') || 
                    l.startsWith('pub') || 
                    l.startsWith('func') || 
                    l.startsWith('class') || 
                    l.startsWith('interface') || 
                    l.startsWith('type')
                ).join('\n');
                const t2Tokens = TokenCounter.countTokens(publicOnly);
                if (t2Tokens > 0) {
                    prunedCode = publicOnly;
                    codeTokens = t2Tokens;
                    pruningTier = 'public_signatures_only';
                }
            }

            // Tier 3: If still over budget, slice signatures line-by-line
            if (codeTokens > adjustedCodeBudget) {
                const lines = prunedCode.split('\n');
                const fittedLines: string[] = [];
                let accTokens = 0;
                for (const line of lines) {
                    const lTok = TokenCounter.countTokens(line);
                    if (accTokens + lTok <= adjustedCodeBudget) {
                        fittedLines.push(line);
                        accTokens += lTok;
                    } else {
                        break;
                    }
                }
                prunedCode = fittedLines.join('\n');
                codeTokens = accTokens;
                pruningTier = 'type_contracts_only';
            }
        }

        // 4. History Fitting (Sliding window from newest backwards)
        const fittedHistory: Array<{ role: string; content: string }> = [];
        let historyTokens = 0;
        for (let i = rawHistory.length - 1; i >= 0; i--) {
            const turn = rawHistory[i];
            const tCount = TokenCounter.countTokens(turn.content);
            if (historyTokens + tCount <= adjustedHistoryBudget) {
                fittedHistory.unshift(turn);
                historyTokens += tCount;
            } else {
                break;
            }
        }

        const totalTokens = sysTokens + repoMapTokens + codeTokens + historyTokens + queryTokens;

        return {
            systemPrompt,
            repoMap: fittedRepoMap,
            prunedCode,
            historyMessages: fittedHistory,
            userQuery,
            totalTokens,
            pruningTierApplied: pruningTier
        };
    }
}
