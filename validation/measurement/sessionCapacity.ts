/**
 * Session capacity: how much work fits before the context window is exhausted.
 *
 * On a flat subscription there is no meter to move, so token reduction saves no money. But that is
 * not the same as producing no value. What a flat seat rations is *requests* and *window*, and both
 * of those are things token reduction can buy back:
 *
 * - A request that does not fit the model's input window fails or is truncated, so an agentic
 *   session has a hard ceiling on how many tool calls it can accumulate before it dies.
 * - A request that comes back wrong because its context was bloated or misselected costs a retry,
 *   and on a per-request quota a retry is a whole unit of the thing being rationed.
 *
 * So the honest unit for a subscription user is not dollars saved, it is work completed per request
 * and turns survived per session. This module measures the second, because it is deterministic and
 * needs no model call: grow a realistic agentic trajectory turn by turn and record when the payload
 * crosses the window, with masking and without.
 *
 * This measures capacity, not answer quality. A longer session is worthless if masking degrades the
 * answers, and that remains untested.
 */

import { maskObservations, DEFAULT_OBSERVATION_MASKING, MaskableMessage } from '../../src/compression/observationMasking';
import { TokenCounter } from '../../src/engine/tokenizer';

/** Characters of tool output a typical agentic turn produces (file read, search, command output). */
export const OBSERVATION_CHARS_PER_TURN = 4_000;

/** Characters of assistant reasoning and tool-call arguments per turn. */
export const TURN_OVERHEAD_CHARS = 600;

export interface CapacityPoint {
    readonly turn: number;
    readonly maskedTokens: number;
    readonly unmaskedTokens: number;
}

export interface CapacityResult {
    readonly windowTokens: number;
    /** Last turn that still fits, without masking. */
    readonly unmaskedTurnLimit: number;
    /** Last turn that still fits, with masking. */
    readonly maskedTurnLimit: number;
    readonly capacityMultiple: number;
    readonly points: readonly CapacityPoint[];
}

function buildTrajectory(turns: number): MaskableMessage[] {
    const messages: MaskableMessage[] = [
        { role: 'user', parts: [{ kind: 'text', text: 'Find and fix the failing integration test.' }] }
    ];
    for (let turn = 0; turn < turns; turn++) {
        messages.push({
            role: 'assistant',
            parts: [
                { kind: 'text', text: 'r'.repeat(TURN_OVERHEAD_CHARS) },
                { kind: 'tool_call', callId: `call_${turn}`, name: 'read_file' }
            ]
        });
        messages.push({
            role: 'tool',
            parts: [{
                kind: 'tool_result',
                callId: `call_${turn}`,
                content: [{ kind: 'text', text: `observation ${turn} ` + 'o'.repeat(OBSERVATION_CHARS_PER_TURN) }]
            }]
        });
    }
    return messages;
}

function payloadTokens(messages: readonly MaskableMessage[]): number {
    let chars = 0;
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.kind === 'text' && typeof part.text === 'string') chars += part.text.length;
            for (const child of part.content || []) {
                if (child.kind === 'text' && typeof child.text === 'string') chars += child.text.length;
            }
        }
    }
    return TokenCounter.countTokens('x'.repeat(chars));
}

/**
 * Grows a trajectory until both arms exceed the window.
 *
 * Both arms are measured on the same trajectory at every turn, so the comparison is paired: the
 * difference is masking and nothing else.
 */
export function measureSessionCapacity(windowTokens: number, maxTurns: number = 400): CapacityResult {
    const points: CapacityPoint[] = [];
    let unmaskedLimit = 0;
    let maskedLimit = 0;

    for (let turn = 1; turn <= maxTurns; turn++) {
        const trajectory = buildTrajectory(turn);
        const unmasked = payloadTokens(trajectory);
        const masked = payloadTokens(maskObservations(trajectory, DEFAULT_OBSERVATION_MASKING).messages);

        if (unmasked <= windowTokens) unmaskedLimit = turn;
        if (masked <= windowTokens) maskedLimit = turn;
        points.push({ turn, maskedTokens: masked, unmaskedTokens: unmasked });

        if (masked > windowTokens && unmasked > windowTokens) break;
    }

    return Object.freeze({
        windowTokens,
        unmaskedTurnLimit: unmaskedLimit,
        maskedTurnLimit: maskedLimit,
        capacityMultiple: unmaskedLimit > 0
            ? Number((maskedLimit / unmaskedLimit).toFixed(2))
            : 0,
        points: Object.freeze(points)
    });
}
