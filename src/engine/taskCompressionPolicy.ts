import type { OptimizationMode } from '../config/userPreferences';
import type { ContextGovernorDecision, TaskType } from '../governor/governorTypes';
import type { ResolutionLevel } from '../solver/contextIR';

const IMPLEMENTATION_CRITICAL = new Set<TaskType>(['debug', 'feature', 'refactor', 'review', 'test', 'completion']);

export interface TaskCompressionPolicy {
    readonly minimumResolution: ResolutionLevel;
    readonly compactFencedCodeBlankLines: boolean;
    readonly compactBraceLanguageIndentation: boolean;
    readonly rationale: string;
}

/**
 * Converts task intent, risk-adjusted aggressiveness and the user mode into an enforceable source
 * representation policy. Correctness-oriented work keeps implementation bodies verbatim. Only
 * API-shaped explanation/search requests may use declaration-oriented representations.
 */
export function resolveTaskCompressionPolicy(
    decision: Pick<ContextGovernorDecision, 'taskType' | 'optimizationAggressiveness'>,
    mode: OptimizationMode,
    instruction: string
): TaskCompressionPolicy {
    if (mode === 'off' || decision.optimizationAggressiveness === 'none') {
        return policy('R5', false, 'Optimization is disabled or risk forced verbatim source.');
    }
    if (IMPLEMENTATION_CRITICAL.has(decision.taskType)) {
        return policy('R5', false, `Task '${decision.taskType}' requires implementation bodies and control flow.`);
    }

    const apiShapedExplanation = decision.taskType === 'explain'
        && /\b(?:interface|public api|api surface|signature|signatures|exports|type definition|type definitions)\b/i.test(instruction)
        && !/\b(?:flow|logic|behavio(?:u)?r|edge case|correctness|implementation|how .* works?)\b/i.test(instruction);

    if (apiShapedExplanation) {
        const level: ResolutionLevel = mode === 'maximum' && decision.optimizationAggressiveness === 'aggressive'
            ? 'R2' : 'R3';
        return policy(level, mode === 'maximum', 'API-shaped explanation can use contracts without implementation bodies.', mode === 'maximum');
    }
    if (decision.taskType === 'search') {
        const level: ResolutionLevel = mode === 'maximum' && decision.optimizationAggressiveness === 'aggressive'
            ? 'R2' : 'R3';
        return policy(level, mode === 'maximum', 'Symbol search is declaration-oriented.', mode === 'maximum');
    }
    if (decision.taskType === 'architecture') {
        return policy(mode === 'maximum' ? 'R3' : 'R4', mode === 'maximum',
            'Architecture work retains contracts and dependency context.', mode === 'maximum');
    }

    // A generic explanation asks how code works. Balanced retains the full body. Maximum may try a
    // sliced body, but the task-calibrated preservation gate admits it only at >=95% control-flow
    // retention; otherwise the request deterministically returns to full source.
    if (decision.taskType === 'explain' && mode === 'maximum') {
        return policy('R4', true, 'Maximum may use a behavior-preserving slice for explanation.', true);
    }
    return policy('R5', false, 'Behavior-oriented explanation retains implementation control flow.');
}

/**
 * Control-flow retention the preservation gate must require for a given policy.
 *
 * This exists so the policy is the SINGLE authority on how much implementation detail a task may
 * lose. Previously the policy and the gate each carried their own per-task table encoding the same
 * judgment, and they disagreed: the policy permitted declaration-only representations for symbol
 * search while the gate demanded 25% control-flow retention for the same task. The permitted
 * representation was therefore always rejected, so the one path designed to compress safely could
 * never emit anything. Deriving the floor from the resolution the policy actually chose keeps the
 * two in step by construction.
 *
 * R5 keeps the source verbatim, so nothing may be lost. R4 is a behaviour-preserving slice and is
 * held to a near-total floor. R3 and R2 are declaration-oriented by design: bodies are expected to
 * be absent, so requiring control flow there would forbid the representation the policy selected.
 */

/**
 * Obligations the preservation gate must enforce for a given policy.
 *
 * Control flow is the wrong yardstick for a declaration-oriented representation: a skeleton has
 * none by construction. What such a representation MUST keep instead is the declarations
 * themselves - the exported names the request is asking about. Expressing both obligations here
 * keeps the policy the single authority over what a task is allowed to lose.
 */
export interface PreservationObligations {
    readonly requiredControlFlowRetention: number;
    /** True when every exported declaration in the source must survive into the payload. */
    readonly requireExportedDeclarations: boolean;
}

export function preservationObligationsForPolicy(
    policy: Pick<TaskCompressionPolicy, 'minimumResolution'>
): PreservationObligations {
    const declarationOriented = policy.minimumResolution === 'R3'
        || policy.minimumResolution === 'R2'
        || policy.minimumResolution === 'R1'
        || policy.minimumResolution === 'R0';
    return Object.freeze({
        requiredControlFlowRetention: controlFlowFloorForPolicy(policy),
        requireExportedDeclarations: declarationOriented
    });
}

export function controlFlowFloorForPolicy(policy: Pick<TaskCompressionPolicy, 'minimumResolution'>): number {
    switch (policy.minimumResolution) {
        case 'R5': return 1;
        case 'R4': return 0.95;
        // R3 and below are declaration skeletons: they carry signatures and contracts and no
        // statement bodies at all, so their measured control-flow retention is zero by
        // construction. Any non-zero floor here forbids the exact representation the policy just
        // selected. Behavioural safety for these tasks comes from the policy refusing to select
        // them for implementation-critical work, not from a floor the representation cannot meet.
        // The gate's other obligations - required facts, identifiers, literals, the user's
        // instruction - still apply unchanged.
        default: return 0;
    }
}

/** Rebuilds a fenced block without introducing a duplicate newline before the closing fence. */
export function renderFencedCode(language: string, code: string): string {
    return `\`\`\`${language}\n${code}${code.endsWith('\n') ? '' : '\n'}\`\`\``;
}

function policy(
    minimumResolution: ResolutionLevel,
    compactFencedCodeBlankLines: boolean,
    rationale: string,
    compactBraceLanguageIndentation = false
): TaskCompressionPolicy {
    return Object.freeze({ minimumResolution, compactFencedCodeBlankLines, compactBraceLanguageIndentation, rationale });
}
