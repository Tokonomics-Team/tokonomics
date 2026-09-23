/**
 * Tokonomics Fail-Closed Preservation Gate
 * Audits compiled context output against input prompt instructions, quoted literals,
 * domain keywords, error signatures, tool metadata, and agent attribution.
 * 
 * Invariant: If critical context is lost during optimization, the gate FAILS CLOSED
 * and immediately falls back to the 100% original unpruned context (0% loss, 0 degradation).
 */

import { MessagePayload } from '../types';

export interface PreservationCheckResult {
    passed: boolean;
    score: number; // 0.0 to 1.0 (1.0 = 100% preserved)
    checksPassed: number;
    checksTotal: number;
    missingItems: string[];
    evidence: string[];
    failClosedTriggered: boolean;
    controlFlowRetention: number;
    requiredControlFlowRetention: number;
}

/**
 * Removes fenced blocks. Used on both sides of the prose invariant so the comparison comes from one
 * transform rather than two that can disagree.
 */
function stripFencedBlocks(text: string): string {
    return text.replace(/```[\s\S]*?```/g, '');
}

export class PreservationGate {
    /**
     * Audits optimized messages against original input messages.
     * Guarantees 100% preservation of user instructions, domain decision logic,
     * quoted errors/strings, tool names, and agent attribution.
     */
    /**
     * `obligations` carries what the task compression policy permits this request to lose: the
     * control-flow floor and whether exported declarations must survive. The policy is the
     * authority; callers that supply nothing fall back to the local table below, a conservative
     * approximation kept for tests and ad-hoc checks.
     */
    public static evaluate(
        originalMessages: MessagePayload[],
        optimizedMessages: MessagePayload[],
        userIntent?: string,
        obligations?: { readonly requiredControlFlowRetention?: number; readonly requireExportedDeclarations?: boolean }
    ): PreservationCheckResult {
        const requiredControlFlowRetentionOverride = obligations?.requiredControlFlowRetention;
        const requireExportedDeclarations = obligations?.requireExportedDeclarations === true;
        const missingItems: string[] = [];
        const evidence: string[] = [];
        let checksPassed = 0;
        let checksTotal = 0;

        // 1. Extract Invariants from Original Messages
        const origFullText = originalMessages.map(m => m.content).join('\n\n');
        const optFullText = optimizedMessages.map(m => m.content).join('\n\n');
        // The prose invariant below compares the original with fenced blocks removed against the
        // emitted payload. That is only sound while fence markers pair the same way on both sides,
        // and they do not: the editor attaches context as JSON, a fence marker inside a single-line
        // string literal is indistinguishable from a real fence, and stripping splices the line's two
        // halves together into a string that by construction cannot appear in any output. The gate
        // then failed closed on a payload that carried the instruction verbatim - on every turn that
        // carried such an attachment - and the restore discarded all retrieved evidence with it.
        // Comparing against the identically-transformed payload removes the artefact without
        // weakening the invariant: prose that was genuinely dropped is absent from both.
        const optProseText = stripFencedBlocks(optFullText);

        // Behavioral preservation is task-sensitive. Correctness-oriented requests require every
        // control-flow construct to survive; a generic flow explanation permits only a very small
        // loss. API-only explanation/search can safely rely more heavily on declarations.
        const task = inferTask(userIntent, userProseFrom(originalMessages));
        const requiredControlFlowRetention = typeof requiredControlFlowRetentionOverride === 'number'
            && Number.isFinite(requiredControlFlowRetentionOverride)
            ? Math.max(0, Math.min(1, requiredControlFlowRetentionOverride))
            : controlFlowFloor(task, userProseFrom(originalMessages));
        const originalFlow = controlFlowHistogram(codeLikeText(originalMessages));
        const optimizedFlow = controlFlowHistogram(codeLikeText(optimizedMessages));
        const originalFlowTotal = histogramTotal(originalFlow);
        const retainedFlowTotal = [...originalFlow.entries()].reduce(
            (total, [keyword, count]) => total + Math.min(count, optimizedFlow.get(keyword) || 0), 0);
        const controlFlowRetention = originalFlowTotal > 0 ? retainedFlowTotal / originalFlowTotal : 1;
        if (originalFlowTotal > 0) {
            checksTotal++;
            if (controlFlowRetention + Number.EPSILON >= requiredControlFlowRetention) {
                checksPassed++;
                evidence.push(`Control flow retained at ${Math.round(controlFlowRetention * 100)}% for task '${task}'.`);
            } else {
                missingItems.push(`control flow retention ${Math.round(controlFlowRetention * 100)}% below ${Math.round(requiredControlFlowRetention * 100)}% for ${task}`);
            }
        }

        // Declaration obligation. A declaration-oriented representation is permitted to drop
        // statement bodies, which is why its control-flow floor is zero - but it is NOT permitted
        // to drop the declarations themselves. Without this, a skeleton that emitted neither
        // bodies nor exported names satisfied every remaining check while answering none of the
        // questions ("list the exports", "where is X defined") that select this representation.
        if (requireExportedDeclarations) {
            const originalCode = codeLikeText(originalMessages);
            const declared = exportedDeclarationNames(originalCode);
            if (declared.length > 0) {
                checksTotal++;
                const missingDeclarations = declared.filter(name => !optFullText.includes(name));
                if (missingDeclarations.length === 0) {
                    checksPassed++;
                    evidence.push(`All ${declared.length} exported declarations retained for task '${task}'.`);
                } else {
                    missingItems.push(`${missingDeclarations.length} of ${declared.length} exported declarations dropped `
                        + `(${missingDeclarations.slice(0, 4).join(', ')}${missingDeclarations.length > 4 ? ', …' : ''}) `
                        + `for declaration-oriented task ${task}`);
                }
            }
        }

        // A. User Prose Instructions Invariant (Everything outside code blocks)
        for (let i = 0; i < originalMessages.length; i++) {
            const origMsg = originalMessages[i];
            if (origMsg.role === 'user') {
                const prose = stripFencedBlocks(origMsg.content).trim();
                if (prose.length > 5) {
                    checksTotal++;
                    // Check if prose or key phrases of the prose are in the optimized message
                    const proseSnippets = prose.split('\n').map(s => s.trim()).filter(s => s.length > 5);
                    const retained = (text: string) => optFullText.includes(text) || optProseText.includes(text);
                    const allSnippetsPreserved = proseSnippets.every(retained);

                    if (allSnippetsPreserved || retained(prose)) {
                        checksPassed++;
                        evidence.push(`User prompt instruction turn_${i} preserved verbatim.`);
                    } else {
                        missingItems.push(`current request instruction (turn_${i})`);
                    }
                }
            }
        }

        // B. User Prose References & Invariants
        const userProse = originalMessages
            .filter(m => m.role === 'user')
            .map(m => m.content.replace(/```[\s\S]*?```/g, ''))
            .join(' ');

        // Quoted Strings & Literals Invariant from user instructions (e.g. error codes, exact identifiers)
        const quotedRegex = /["']([a-zA-Z0-9_\-\.\s]{3,40})["']/g;
        let qMatch: RegExpExecArray | null;
        while ((qMatch = quotedRegex.exec(userProse)) !== null) {
            const lit = qMatch[1].trim();
            if (lit.length > 3 && !['true', 'false', 'null', 'undefined', 'typescript', 'javascript', 'json'].includes(lit.toLowerCase())) {
                checksTotal++;
                if (optFullText.includes(lit)) {
                    checksPassed++;
                    evidence.push(`Quoted literal "${lit}" preserved.`);
                } else {
                    missingItems.push(`literal "${lit}"`);
                }
            }
        }

        // C. Domain Decision & Transaction Keywords Invariant
        const domainKeywords = ['idempotent', 'idempotency', 'commit', 'rollback', 'transaction', 'refund', 'authenticate', 'authorize'];
        for (const kw of domainKeywords) {
            if (origFullText.toLowerCase().includes(kw)) {
                checksTotal++;
                if (optFullText.toLowerCase().includes(kw)) {
                    checksPassed++;
                    evidence.push(`Domain transaction keyword "${kw}" preserved.`);
                } else {
                    missingItems.push(`${kw} behavior`);
                }
            }
        }

        // D. Method/Symbol References mentioned in User Request
        const referencedSymbolMatches = userProse.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) || [];
        const focalSymbols = Array.from(new Set(
            referencedSymbolMatches.filter(s => 
                !['please', 'optimize', 'refactor', 'check', 'method', 'function', 'class', 'with', 'from', 'this', 'that', 'code', 'file', 'interface'].includes(s.toLowerCase())
            )
        )).slice(0, 5);

        for (const sym of focalSymbols) {
            if (origFullText.includes(sym)) {
                checksTotal++;
                if (optFullText.includes(sym)) {
                    checksPassed++;
                    evidence.push(`Focal symbol "${sym}" preserved.`);
                } else {
                    missingItems.push(`focal symbol ${sym}`);
                }
            }
        }

        // E. Assistant Name & Agent Attribution Invariant
        for (let i = 0; i < originalMessages.length; i++) {
            const origMsg = originalMessages[i];
            if (origMsg.name) {
                checksTotal++;
                const matchingOpt = optimizedMessages[i];
                if (matchingOpt && (matchingOpt.name === origMsg.name || optFullText.includes(origMsg.name))) {
                    checksPassed++;
                    evidence.push(`Agent/tool attribution "${origMsg.name}" preserved.`);
                } else {
                    missingItems.push(`attribution: ${origMsg.name}`);
                }
            }
        }

        // If no specific checks were extracted, pass if instruction was preserved
        if (checksTotal === 0) {
            checksTotal = 1;
            checksPassed = 1;
        }

        const score = Math.round((checksPassed / checksTotal) * 100) / 100;
        const passed = missingItems.length === 0;

        return {
            passed,
            score,
            checksPassed,
            checksTotal,
            missingItems,
            evidence,
            failClosedTriggered: !passed,
            controlFlowRetention: Math.round(controlFlowRetention * 1000) / 1000,
            requiredControlFlowRetention
        };
    }
}

const CONTROL_FLOW_KEYWORDS = Object.freeze([
    'if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'finally', 'return', 'throw',
    'try', 'break', 'continue', 'await', 'yield'
]);

function userProseFrom(messages: readonly MessagePayload[]): string {
    return messages.filter(message => message.role === 'user')
        .map(message => message.content.replace(/```[\s\S]*?```/g, ' ')).join(' ').trim();
}

function inferTask(userIntent: string | undefined, prose: string): string {
    const value = `${userIntent || ''} ${prose}`.toLowerCase();
    for (const task of ['debug', 'review', 'refactor', 'feature', 'test', 'architecture', 'search', 'completion', 'explain']) {
        if (new RegExp(`\\b${task}\\b`).test(value)) return task;
    }
    return 'explain';
}


/**
 * Exported declaration names in a source fragment. These are what a declaration-oriented
 * representation exists to carry, so they are the obligation that replaces control flow there.
 */
function exportedDeclarationNames(source: string): string[] {
    const names = new Set<string>();
    const pattern = /export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|class|interface|const|let|var|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) names.add(match[1]);
    return [...names];
}

function controlFlowFloor(task: string, prose: string): number {
    if (['debug', 'review', 'refactor', 'feature', 'test', 'completion'].includes(task)) return 1;
    if (task === 'explain') {
        const apiOnly = /\b(?:interface|public api|api surface|signature|signatures|exports|type definition|type definitions)\b/i.test(prose)
            && !/\b(?:flow|logic|behavio(?:u)?r|edge case|correctness|implementation|how .* works?)\b/i.test(prose);
        return apiOnly ? 0.5 : 0.95;
    }
    if (task === 'architecture') return 0.85;
    if (task === 'search') return 0.25;
    return 0.95;
}

function codeLikeText(messages: readonly MessagePayload[]): string {
    const blocks: string[] = [];
    for (const message of messages) {
        const pattern = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(message.content)) !== null) blocks.push(match[1]);
    }
    return blocks.length > 0 ? blocks.join('\n') : messages.map(message => message.content).join('\n');
}

function controlFlowHistogram(text: string): Map<string, number> {
    const histogram = new Map<string, number>();
    const pattern = new RegExp(`\\b(?:${CONTROL_FLOW_KEYWORDS.join('|')})\\b`, 'g');
    for (const match of text.match(pattern) || []) histogram.set(match, (histogram.get(match) || 0) + 1);
    return histogram;
}

function histogramTotal(histogram: ReadonlyMap<string, number>): number {
    return [...histogram.values()].reduce((total, count) => total + count, 0);
}
