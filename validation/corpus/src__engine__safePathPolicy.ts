/**
 * Tokonomics Safe-Path Policy
 *
 * Pure decision helpers for the compiler's conservative path. These were extracted from the
 * orchestrator so that the orchestrator keeps composing stages rather than embedding policy,
 * and so each rule can be unit-tested against its inputs alone.
 *
 * Nothing here performs I/O, touches VS Code, mutates shared state, or reads configuration.
 * Every function is deterministic in its arguments.
 */

import type { MessagePayload } from '../types';
import { ConservativeCompressionOptions, ConservativePathCompressor } from '../compression/conservativePathCompressor';

/** Compiler stages whose contribution is only known after the preservation gates have run. */
export type DeferredCompilerStage =
    | 'context_solver' | 'sdg_slicing' | 'sufficiency_engine' | 'rule_compression' | 'cache_planner';

export interface DeferredStageOutcome {
    readonly component: DeferredCompilerStage;
    readonly changedOutput: boolean;
}

export interface ResolvedStageReceipt {
    readonly component: DeferredCompilerStage;
    readonly outcome: 'contributed' | 'fallback';
    readonly reason?: string;
}

/**
 * Decides the terminal receipt for each compiler stage once the emitted payload is settled.
 *
 * A stage that changed the intermediate payload but whose work was reverted by a preservation,
 * structured-content or evidence-safety restore did NOT contribute to the result, and must not
 * claim it did. This is the rule that keeps contribution receipts bound to the payload actually
 * sent rather than to intermediate work.
 */
export function resolveDeferredStageReceipts(
    pending: readonly DeferredStageOutcome[],
    original: readonly MessagePayload[],
    emitted: readonly MessagePayload[],
    contentRestored: boolean
): ResolvedStageReceipt[] {
    const payloadMatchesOriginal = contentRestored || (emitted.length === original.length
        && emitted.every((message, index) => message.content === original[index]?.content));
    return pending.map(entry => {
        const effectSurvived = entry.changedOutput && !payloadMatchesOriginal;
        if (effectSurvived) return { component: entry.component, outcome: 'contributed' as const };
        return {
            component: entry.component,
            outcome: 'fallback' as const,
            reason: !entry.changedOutput ? 'no_output_effect'
                : contentRestored ? 'restored_by_preservation_gate' : 'no_surviving_output_effect'
        };
    });
}

export interface ConservativeReductionOutcome {
    readonly messages: MessagePayload[];
    readonly applied: boolean;
    readonly rules: readonly string[];
}

/**
 * Applies noise-only reductions to a payload that was restored verbatim for safety.
 *
 * The caller supplies `verifies`, which must re-run the real preservation gates against the
 * candidate. If verification fails for any reason the original messages are returned unchanged,
 * so this can never weaken the fail-closed guarantee - at worst it is a no-op.
 */
export function applyConservativeReduction(
    messages: readonly MessagePayload[],
    verifies: (candidate: MessagePayload[]) => boolean,
    options: ConservativeCompressionOptions = {}
): ConservativeReductionOutcome {
    try {
        const reduced = messages.map(message => {
            const result = ConservativePathCompressor.compress(message.content, options);
            return { message: { ...message, content: result.text }, rules: result.appliedRules, changed: result.changed };
        });
        if (!reduced.some(entry => entry.changed)) {
            return { messages: [...messages], applied: false, rules: [] };
        }
        const candidate = reduced.map(entry => entry.message);
        if (!verifies(candidate)) {
            return { messages: [...messages], applied: false, rules: [] };
        }
        return {
            messages: candidate,
            applied: true,
            rules: [...new Set(reduced.flatMap(entry => entry.rules))]
        };
    } catch {
        return { messages: [...messages], applied: false, rules: [] };
    }
}

/**
 * Extracts the user's instruction from a payload by removing fenced code blocks.
 *
 * Intent classification must describe what the user asked, not what they pasted. Attached source
 * that happens to contain error handling, test helpers or configuration otherwise drags the task
 * type toward whichever category those tokens suggest.
 */
export function extractInstructionText(fullText: string): string {
    const stripped = fullText.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped.length > 0 ? stripped : fullText;
}

export interface EvidencePolicyDecisionInput {
    readonly inlineCategories: readonly string[];
    readonly inlineTruncated: boolean;
    readonly missingCategories: readonly string[];
    readonly workspaceRetrievalAuthorized: boolean;
    readonly contentRestored: boolean;
    readonly confidence: number;
}

export interface EvidencePolicyDecision {
    readonly itemId: string;
    readonly action: 'include' | 'compress' | 'preserve';
    readonly reason: string;
    readonly confidence: number;
    readonly evidence: string[];
}

/**
 * Builds the auditable decisions describing how the evidence contract was satisfied and why the
 * resulting coverage was accepted. Kept out of the orchestrator so the wording and the conditions
 * can be asserted directly in tests.
 */
export function buildEvidencePolicyDecisions(input: EvidencePolicyDecisionInput): EvidencePolicyDecision[] {
    const decisions: EvidencePolicyDecision[] = [];
    if (input.inlineCategories.length > 0) {
        decisions.push({
            itemId: 'inline_evidence_classification',
            action: 'include',
            reason: `Evidence satisfied from context already supplied by the caller: ${input.inlineCategories.join(', ')}`
                + (input.inlineTruncated ? ' (input truncated at the scan bound)' : ''),
            confidence: 1,
            evidence: ['InlineEvidenceClassifier', ...input.inlineCategories.map(category => `inline:${category}`)]
        });
    }
    if (input.missingCategories.length > 0) {
        decisions.push({
            itemId: 'evidence_coverage_partial',
            action: input.contentRestored ? 'preserve' : 'compress',
            reason: `Partial evidence coverage (missing [${input.missingCategories.join(', ')}]`
                + `${input.workspaceRetrievalAuthorized ? '' : '; workspace-derived categories are unobtainable without workspace context'}). `
                + 'Preservation gates validated the emitted payload at this coverage level.',
            confidence: input.confidence,
            evidence: ['EvidenceSafetyGate', 'PreservationGate', 'StructuredPreservationGate',
                ...(input.workspaceRetrievalAuthorized ? [] : ['scope:no_workspace_context'])]
        });
    }
    return decisions;
}
