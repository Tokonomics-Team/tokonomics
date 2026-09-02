import { TokenCounter } from '../engine/tokenizer';
import { MessagePayload } from '../types';
import { ModelProfile } from '../tokenizer/modelProfile';

export interface RenderedBudgetAssignment {
    entityId: string;
    level: string;
    tokenCount: number;
    renderedTextHash: string;
}

export interface PayloadBudgetPlan {
    totalTokenLimit: number;
    inputTokenLimit: number;
    outputReserve: number;
    tokenizerSafetyMargin: number;
    estimatorErrorMargin: number;
    fixedProtocolTokens: number;
    baseInputTokens: number;
    candidateTokenBudget: number;
    finalInputTokens: number;
    projectedTotalTokens: number;
    withinBudget: boolean;
    tokenizer: 'tokonomics-error-bounded-estimator-v1';
    renderedAssignments: readonly RenderedBudgetAssignment[];
}

export class TokenBudgetExceededError extends Error {
    constructor(message: string, public readonly plan: PayloadBudgetPlan) {
        super(message);
        this.name = 'TokenBudgetExceededError';
    }
}

export class GlobalTokenBudgeter {
    public planBase(params: {
        messages: readonly MessagePayload[];
        profile: ModelProfile;
        requestedTotalTokens?: number;
        requestedOutputTokens?: number;
        fixedProtocolTokens?: number;
    }): PayloadBudgetPlan {
        const totalTokenLimit = Math.max(1, Math.min(params.requestedTotalTokens ?? params.profile.contextWindow, params.profile.contextWindow));
        const outputReserve = Math.max(1, Math.min(
            params.requestedOutputTokens ?? Math.max(16, Math.floor(totalTokenLimit * 0.20)),
            params.profile.capabilities.maxOutputTokens,
            totalTokenLimit - 1
        ));
        const tokenizerSafetyMargin = Math.max(4, Math.ceil(totalTokenLimit * 0.02));
        const inputCapacityBeforeEstimator = Math.max(0, totalTokenLimit - outputReserve - tokenizerSafetyMargin);
        const estimatorErrorMargin = Math.max(4, Math.ceil(inputCapacityBeforeEstimator * 0.08));
        const inputTokenLimit = Math.max(0, inputCapacityBeforeEstimator - estimatorErrorMargin);
        const fixedProtocolTokens = Math.max(0, params.fixedProtocolTokens || 0);
        const baseInputTokens = TokenCounter.countMessagesTokens([...params.messages]) + fixedProtocolTokens;
        const candidateTokenBudget = Math.max(0, inputTokenLimit - baseInputTokens);
        const plan: PayloadBudgetPlan = {
            totalTokenLimit, inputTokenLimit, outputReserve, tokenizerSafetyMargin, estimatorErrorMargin,
            fixedProtocolTokens, baseInputTokens, candidateTokenBudget, finalInputTokens: baseInputTokens,
            projectedTotalTokens: baseInputTokens + outputReserve + tokenizerSafetyMargin + estimatorErrorMargin,
            withinBudget: baseInputTokens <= inputTokenLimit,
            tokenizer: 'tokonomics-error-bounded-estimator-v1',
            renderedAssignments: Object.freeze([])
        };
        if (!plan.withinBudget) {
            throw new TokenBudgetExceededError(
                `Mandatory protocol and message content requires ${baseInputTokens} estimated input tokens, exceeding the ${inputTokenLimit}-token safe input allowance.`,
                plan
            );
        }
        return plan;
    }

    public finalize(base: PayloadBudgetPlan, messages: readonly MessagePayload[]): PayloadBudgetPlan {
        const finalInputTokens = TokenCounter.countMessagesTokens([...messages]) + base.fixedProtocolTokens;
        const projectedTotalTokens = finalInputTokens + base.outputReserve + base.tokenizerSafetyMargin + base.estimatorErrorMargin;
        const plan = { ...base, finalInputTokens, projectedTotalTokens, withinBudget: projectedTotalTokens <= base.totalTokenLimit };
        if (!plan.withinBudget) {
            throw new TokenBudgetExceededError(
                `Rendered payload projects ${projectedTotalTokens} total tokens, exceeding the ${base.totalTokenLimit}-token limit.`,
                plan
            );
        }
        return plan;
    }
}
