/**
 * Asymmetric Turn Compaction & Scratchpad Externalization Engine (v4.0)
 * 
 * Offloads long conversational narrative and intermediate working memory
 * to an external scratchpad file (.tokenopt/scratchpad.json or workspace state),
 * generating a dense executive task progress digest for the prompt.
 * 
 * Preserves recent error stack traces and active tool results in raw fidelity
 * to prevent retry hallucination loops.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MessagePayload } from '../types';
import { TokenCounter } from './tokenizer';

export interface ScratchpadState {
    activeGoal: string;
    completedSteps: string[];
    pendingSteps: string[];
    keyDecisions: string[];
    knownBlockers: string[];
    lastUpdated: number;
}

export interface CompactionResult {
    compactedMessages: MessagePayload[];
    scratchpadDigest: string;
    originalTokens: number;
    compactedTokens: number;
    tokensSaved: number;
}

export class ScratchpadManager {
    private scratchpadPath: string | undefined;

    constructor(private workspaceRoot?: string) {
        if (workspaceRoot) {
            const tokenOptDir = path.join(workspaceRoot, '.tokenopt');
            this.scratchpadPath = path.join(tokenOptDir, 'scratchpad.json');
        }
    }

    /**
     * Reads current scratchpad state from disk or returns default empty state.
     */
    public readState(): ScratchpadState {
        const empty = (): ScratchpadState => ({ activeGoal: 'General assistance', completedSteps: [],
            pendingSteps: [], keyDecisions: [], knownBlockers: [], lastUpdated: 0 });
        if (!this.scratchpadPath) return empty();
        try {
            const stat = fs.lstatSync(this.scratchpadPath);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return empty();
            const value: unknown = JSON.parse(fs.readFileSync(this.scratchpadPath, 'utf8'));
            if (!value || typeof value !== 'object') return empty();
            const state = value as Record<string, unknown>;
            if (typeof state.activeGoal !== 'string' || state.activeGoal.length > 4096) return empty();
            for (const key of ['completedSteps', 'pendingSteps', 'keyDecisions', 'knownBlockers']) {
                const items = state[key];
                if (!Array.isArray(items) || items.length > 64 || items.some(item => typeof item !== 'string' || item.length > 4096)) return empty();
            }
            if (typeof state.lastUpdated !== 'number' || !Number.isFinite(state.lastUpdated)) return empty();
            return state as unknown as ScratchpadState;
        } catch { return empty(); }
    }

    /**
     * Persists scratchpad working memory to external workspace file.
     */
    public writeState(state: ScratchpadState): void {
        if (!this.scratchpadPath) return;

        try {
            const dir = path.dirname(this.scratchpadPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            state.lastUpdated = Date.now();
            fs.writeFileSync(this.scratchpadPath, JSON.stringify(state, null, 2), 'utf8');
        } catch {
            console.warn('[ScratchpadManager] Scratchpad write failed safely.');
        }
    }

    /**
     * Generates a concise executive digest of the scratchpad state to inject into prompts.
     */
    public generatePromptDigest(state: ScratchpadState): string {
        const parts: string[] = [];
        parts.push(`[SCRATCHPAD STATE] Goal: ${state.activeGoal}`);
        if (state.completedSteps.length > 0) {
            parts.push(`Done: [${state.completedSteps.join('; ')}]`);
        }
        if (state.pendingSteps.length > 0) {
            parts.push(`Pending: [${state.pendingSteps.join('; ')}]`);
        }
        if (state.knownBlockers.length > 0) {
            parts.push(`Blockers: [${state.knownBlockers.join('; ')}]`);
        }
        return parts.join(' | ');
    }

    /**
     * Asymmetrically compacts multi-turn history:
     * - Older turns (t < N - 3) are extracted into scratchpad milestones.
     * - Recent error traces and active tool results are kept RAW to preserve syntax.
     */
    public compactAsymmetric(
        messages: MessagePayload[],
        recentWindowTurns: number = 4
    ): CompactionResult {
        const originalTokens = TokenCounter.countMessagesTokens(messages);
        if (messages.length <= recentWindowTurns) {
            const state = this.readState();
            const digest = this.generatePromptDigest(state);
            return {
                compactedMessages: messages,
                scratchpadDigest: digest,
                originalTokens,
                compactedTokens: originalTokens,
                tokensSaved: 0
            };
        }

        const state = this.readState();
        const olderMessages = messages.slice(0, messages.length - recentWindowTurns);
        const recentMessages = messages.slice(messages.length - recentWindowTurns);

        // Extract milestone learnings from older messages
        for (const msg of olderMessages) {
            const text = msg.content;
            // Extract goals / completed tasks from user messages
            if (msg.role === 'user' && text.length > 15 && text.length < 180) {
                const clean = text.replace(/[\n\r]+/g, ' ').trim();
                if (!state.completedSteps.includes(clean) && state.completedSteps.length < 8) {
                    state.completedSteps.push(clean);
                }
            }
            // Check for error traces in assistant messages — if error found in old turn, note it as blocker
            if (msg.role === 'assistant' && (text.includes('Error:') || text.includes('Exception:'))) {
                const match = text.match(/(?:Error|Exception):[^\n]+/);
                if (match && !state.knownBlockers.includes(match[0])) {
                    state.knownBlockers.push(match[0].substring(0, 100));
                }
            }
        }

        this.writeState(state);
        const digest = this.generatePromptDigest(state);

        // Build compacted payload: [Digest Summary Message] + [Recent Raw Messages (with errors preserved)]
        const compactedMessages: MessagePayload[] = [
            {
                role: 'system',
                content: digest
            },
            ...recentMessages
        ];

        const compactedTokens = TokenCounter.countMessagesTokens(compactedMessages);

        return {
            compactedMessages,
            scratchpadDigest: digest,
            originalTokens,
            compactedTokens,
            tokensSaved: Math.max(0, originalTokens - compactedTokens)
        };
    }
}
