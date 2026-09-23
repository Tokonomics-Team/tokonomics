/**
 * Tokonomics Observation Masking
 *
 * Replaces the content of older tool results with a compact placeholder, keeping recent results in
 * full. Pure string replacement: no model call, no summarisation, no heuristic about meaning.
 *
 * Why this and not compression of source code. Roughly 84% of the tokens in a long agentic turn are
 * tool observations - file reads, command output, search results - rather than code the user wrote
 * into the prompt. Lindenbauer et al., "The Complexity Trap" (arXiv:2508.21433, DL4Code @ NeurIPS
 * 2025), compared observation masking against LLM summarisation inside SWE-agent on SWE-bench
 * Verified across five model configurations and found masking halves cost relative to the raw agent
 * while matching, and sometimes slightly exceeding, the solve rate of summarisation. The simpler
 * technique won.
 *
 * Why it applies here specifically. A request carrying tool results is structured, so the canonical
 * compiler sets preserveProtocol and forwards the messages untouched: today an agentic request
 * receives no optimisation at all. Masking operates on the parts directly and therefore reaches the
 * one workload the text pipeline cannot.
 *
 * Protocol safety. Message count, order, roles, names, tool-call identifiers and part cardinality
 * are all preserved exactly. A masked result remains a tool_result part with the same callId; only
 * the text inside it is replaced. Non-text children (images, binary data) are never masked, because
 * their size is not the problem and their loss would be silent.
 *
 * Cache behaviour. The masking boundary is quantised so it advances in strides rather than moving on
 * every turn. A boundary that shifted each turn would rewrite the middle of the prompt every request
 * and invalidate the provider's prefix cache continuously - the same trade ADR-001 rejects for
 * delta-only prompting. Quantising means the prefix stays byte-stable for a run of turns, then moves
 * once, which is the behaviour Anthropic's own `clear_at_least` option exists to produce.
 *
 * Pure module: deterministic in its arguments, no I/O, no VS Code, no configuration.
 */

/** Minimal shape this transform needs; mirrors CanonicalMessage without importing the protocol. */
export interface MaskableToolResultChild {
    readonly kind: 'text' | 'data';
    readonly text?: string;
    readonly mimeType?: string;
}

export interface MaskablePart {
    readonly kind: 'text' | 'tool_call' | 'tool_result' | 'data';
    readonly callId?: string;
    readonly content?: readonly MaskableToolResultChild[];
    readonly [key: string]: unknown;
}

export interface MaskableMessage {
    readonly role: string;
    readonly name?: string;
    readonly parts: readonly MaskablePart[];
}

export interface ObservationMaskingOptions {
    /** Tool results this many positions from the end are always kept in full. */
    readonly keepRecent: number;
    /** Masking only begins once total tool-result text exceeds this many characters. */
    readonly triggerChars: number;
    /** Results shorter than this are left alone; masking them costs more than it saves. */
    readonly minResultChars: number;
    /** The boundary advances in whole strides, so the prefix stays stable between moves. */
    readonly boundaryStride: number;
}

export const DEFAULT_OBSERVATION_MASKING: ObservationMaskingOptions = Object.freeze({
    keepRecent: 3,
    triggerChars: 20_000,
    minResultChars: 400,
    boundaryStride: 4
});

export interface ObservationMaskingResult<T> {
    readonly messages: T[];
    readonly maskedCount: number;
    readonly charsRemoved: number;
    readonly totalObservationChars: number;
    readonly applied: boolean;
    /** Why masking did not run, when it did not. Empty when it did. */
    readonly skippedReason?: 'disabled' | 'below_trigger' | 'nothing_maskable' | 'failed' | 'evidence_preservation';
}

/** Text a masked observation is replaced with. States what was removed so the model can ask for it. */
export function maskPlaceholder(originalChars: number, toolName: string | undefined): string {
    const tool = toolName ? ` from ${toolName}` : '';
    return `[tokonomics: earlier tool output${tool} elided, ${originalChars} characters. `
        + 'Re-run the tool if this output is needed again.]';
}

/**
 * Masks older tool observations.
 *
 * Never throws: any failure returns the input unchanged, because a masking fault must not be able
 * to break a request that would otherwise have succeeded.
 */
export function maskObservations<T extends MaskableMessage>(messages: readonly T[],
    options: ObservationMaskingOptions = DEFAULT_OBSERVATION_MASKING): ObservationMaskingResult<T> {
    try {
        return maskObservationsCore(messages, options);
    } catch {
        // Masking fault must not break a request that would otherwise have succeeded.
        return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
            totalObservationChars: 0, applied: false, skippedReason: 'failed' };
    }
}

/** Core masking logic, wrapped by the public function in a try/catch. */
function maskObservationsCore<T extends MaskableMessage>(messages: readonly T[],
    options: ObservationMaskingOptions): ObservationMaskingResult<T> {

    // ── 1. Locate every tool-result text part and measure total size ──────
    interface ToolResultRef {
        /** Index into the messages array. */
        msgIdx: number;
        /** Index into the message's parts array. */
        partIdx: number;
        /** Total characters across all text children in this part. */
        textChars: number;
        /** The tool name from the preceding tool_call, if available. */
        toolName: string | undefined;
    }

    const refs: ToolResultRef[] = [];
    let totalObservationChars = 0;

    // Build a callId→toolName map from tool_call parts.
    const callIdToName = new Map<string, string>();
    for (const msg of messages) {
        if (!msg.parts) continue;
        for (const part of msg.parts) {
            if (part.kind === 'tool_call' && part.callId && (part as any).name) {
                callIdToName.set(part.callId, (part as any).name);
            }
        }
    }

    for (let mi = 0; mi < messages.length; mi++) {
        const msg = messages[mi];
        if (!msg.parts) continue;
        for (let pi = 0; pi < msg.parts.length; pi++) {
            const part = msg.parts[pi];
            if (part.kind !== 'tool_result') continue;
            // Compute total text chars in this tool result's children.
            const children = part.content;
            if (!children || !Array.isArray(children)) continue;
            let textChars = 0;
            for (const child of children) {
                if (child.kind === 'text' && typeof child.text === 'string') {
                    textChars += child.text.length;
                }
            }
            totalObservationChars += textChars;
            refs.push({
                msgIdx: mi, partIdx: pi, textChars,
                toolName: part.callId ? callIdToName.get(part.callId) : undefined
            });
        }
    }

    // ── 2. Check trigger threshold ───────────────────────────────────────
    if (totalObservationChars < options.triggerChars) {
        return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
            totalObservationChars, applied: false, skippedReason: 'below_trigger' };
    }

    // ── 3. Determine masking boundary ────────────────────────────────────
    // The last `keepRecent` tool results are never masked.
    // The boundary is quantised to `boundaryStride` so it moves in whole strides
    // rather than on every turn, keeping the provider prefix cache stable.
    const maskableCount = refs.length - options.keepRecent;
    if (maskableCount <= 0) {
        return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
            totalObservationChars, applied: false, skippedReason: 'nothing_maskable' };
    }
    // Quantise: round maskableCount down to the nearest stride.
    const quantised = Math.floor(maskableCount / options.boundaryStride) * options.boundaryStride;
    if (quantised <= 0) {
        return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
            totalObservationChars, applied: false, skippedReason: 'nothing_maskable' };
    }

    // Do not mask older observations if any contains critical causal failure or error evidence.
    // Retaining observations preserves causal evidence, panic/failure records, and cache stability.
    const CRITICAL_ERROR_PATTERN = /\b(?:panic|fatal|exception|error|exit\s*code|traceback)\b/i;
    for (let ri = 0; ri < quantised; ri++) {
        const ref = refs[ri];
        const part = messages[ref.msgIdx]?.parts?.[ref.partIdx];
        if (part && Array.isArray(part.content)) {
            for (const child of part.content) {
                if (child.kind === 'text' && typeof child.text === 'string' && (CRITICAL_ERROR_PATTERN.test(child.text) || /^\s*at\s+/m.test(child.text))) {
                    return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
                        totalObservationChars, applied: false, skippedReason: 'evidence_preservation' };
                }
            }
        }
    }

    // ── 4. Deep-clone messages and apply masking ─────────────────────────
    const cloned: T[] = messages.map(m => ({
        ...m,
        parts: m.parts ? m.parts.map(p => {
            if (p.kind === 'tool_result' && p.content) {
                return { ...p, content: p.content.map(c => ({ ...c })) };
            }
            return { ...p };
        }) : []
    })) as T[];

    let maskedCount = 0;
    let charsRemoved = 0;

    for (let ri = 0; ri < quantised; ri++) {
        const ref = refs[ri];
        // Skip results that are too short to be worth masking.
        if (ref.textChars < options.minResultChars) continue;

        const clonedPart = cloned[ref.msgIdx].parts[ref.partIdx] as any;
        const children = clonedPart.content;
        if (!children || !Array.isArray(children)) continue;

        // Replace text children with the placeholder; preserve non-text children.
        let partCharsRemoved = 0;
        const placeholder = maskPlaceholder(ref.textChars, ref.toolName);
        let placeholderInserted = false;
        for (let ci = 0; ci < children.length; ci++) {
            if (children[ci].kind === 'text' && typeof children[ci].text === 'string') {
                if (!placeholderInserted) {
                    partCharsRemoved += children[ci].text.length;
                    children[ci] = { ...children[ci], text: placeholder };
                    placeholderInserted = true;
                } else {
                    // Subsequent text children: collapse into the placeholder.
                    partCharsRemoved += children[ci].text.length;
                    children[ci] = { ...children[ci], text: '' };
                }
            }
            // Non-text children (images, binary) are never touched.
        }
        if (partCharsRemoved > 0) {
            maskedCount++;
            charsRemoved += partCharsRemoved;
        }
    }

    if (maskedCount === 0) {
        return { messages: cloned, maskedCount: 0, charsRemoved: 0,
            totalObservationChars, applied: false, skippedReason: 'nothing_maskable' };
    }

    return { messages: cloned, maskedCount, charsRemoved, totalObservationChars, applied: true };
}
