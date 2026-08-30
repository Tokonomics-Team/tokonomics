/**
 * Hard Agentic Loop Circuit Breaker & Token Velocity Governor v4.0
 * 
 * Protects against runaway agentic loops and massive unexpected cloud bills:
 *   - Velocity alerts when token consumption exceeds threshold (default: >50k tokens/min)
 *   - Loop circuit breaker: flags stagnation when consecutive turns execute identical actions
 *   - Automated context reset recommendations when agent reasoning is trapped in retry loops
 */

import { TokenCounter } from '../engine/tokenizer';

export interface VelocityRecord {
    timestamp: number;
    tokens: number;
}

export interface CircuitBreakerStatus {
    tripped: boolean;
    reason?: 'velocity_exceeded' | 'stagnation_detected' | 'consecutive_error_loop';
    message?: string;
    tokensPerMinute: number;
    consecutiveDuplicateCount: number;
    recommendedAction?: 'reset_context' | 'pause_agent' | 'refine_prompt';
}

export class AgenticCircuitBreaker {
    private velocityHistory: VelocityRecord[] = [];
    private lastTurnActionHashes: number[] = [];
    private consecutiveErrors: number = 0;

    constructor(
        private maxTokensPerMinute: number = 50000,
        private maxConsecutiveIdenticalActions: number = 3,
        private maxConsecutiveErrors: number = 4
    ) {}

    /**
     * Records a turn's token consumption and evaluates velocity and stagnation rules.
     */
    public evaluateTurn(
        tokensConsumed: number,
        actionSignature: string,
        isError: boolean = false
    ): CircuitBreakerStatus {
        const now = Date.now();

        // 1. Record and prune velocity history (1-minute sliding window)
        this.velocityHistory.push({ timestamp: now, tokens: tokensConsumed });
        const oneMinuteAgo = now - 60000;
        this.velocityHistory = this.velocityHistory.filter(r => r.timestamp >= oneMinuteAgo);

        const tokensInLastMinute = this.velocityHistory.reduce((sum, r) => sum + r.tokens, 0);

        // Check Token Velocity Threshold
        if (tokensInLastMinute > this.maxTokensPerMinute) {
            return {
                tripped: true,
                reason: 'velocity_exceeded',
                message: `⚠️ Token Velocity Alert: Consumed ${tokensInLastMinute.toLocaleString()} tokens/min (Limit: ${this.maxTokensPerMinute.toLocaleString()}). Pausing runaway loop.`,
                tokensPerMinute: tokensInLastMinute,
                consecutiveDuplicateCount: 0,
                recommendedAction: 'pause_agent'
            };
        }

        // 2. Evaluate Error Loop
        if (isError) {
            this.consecutiveErrors++;
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                return {
                    tripped: true,
                    reason: 'consecutive_error_loop',
                    message: `⚠️ Loop Detected: ${this.consecutiveErrors} consecutive error iterations without progress. Context reset recommended.`,
                    tokensPerMinute: tokensInLastMinute,
                    consecutiveDuplicateCount: 0,
                    recommendedAction: 'reset_context'
                };
            }
        } else {
            this.consecutiveErrors = 0;
        }

        // 3. Evaluate Action Stagnation (Identical tool/prompt hash repeated)
        const actionHash = this.fnv1a(actionSignature);
        this.lastTurnActionHashes.push(actionHash);
        if (this.lastTurnActionHashes.length > 10) {
            this.lastTurnActionHashes.shift();
        }

        let consecutiveDupes = 0;
        for (let i = this.lastTurnActionHashes.length - 1; i >= 0; i--) {
            if (this.lastTurnActionHashes[i] === actionHash) {
                consecutiveDupes++;
            } else {
                break;
            }
        }

        if (consecutiveDupes >= this.maxConsecutiveIdenticalActions) {
            return {
                tripped: true,
                reason: 'stagnation_detected',
                message: `⚠️ Stagnation Alert: Agent performed identical action ${consecutiveDupes} times in a row. Stopping infinite loop.`,
                tokensPerMinute: tokensInLastMinute,
                consecutiveDuplicateCount: consecutiveDupes,
                recommendedAction: 'refine_prompt'
            };
        }

        return {
            tripped: false,
            tokensPerMinute: tokensInLastMinute,
            consecutiveDuplicateCount: consecutiveDupes
        };
    }

    /**
     * Resets the circuit breaker state.
     */
    public reset(): void {
        this.velocityHistory = [];
        this.lastTurnActionHashes = [];
        this.consecutiveErrors = 0;
    }

    private fnv1a(str: string): number {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash;
    }
}
