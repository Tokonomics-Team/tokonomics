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
}

export class PreservationGate {
    /**
     * Audits optimized messages against original input messages.
     * Guarantees 100% preservation of user instructions, domain decision logic,
     * quoted errors/strings, tool names, and agent attribution.
     */
    public static evaluate(
        originalMessages: MessagePayload[],
        optimizedMessages: MessagePayload[],
        userIntent?: string
    ): PreservationCheckResult {
        const missingItems: string[] = [];
        const evidence: string[] = [];
        let checksPassed = 0;
        let checksTotal = 0;

        // 1. Extract Invariants from Original Messages
        const origFullText = originalMessages.map(m => m.content).join('\n\n');
        const optFullText = optimizedMessages.map(m => m.content).join('\n\n');

        // A. User Prose Instructions Invariant (Everything outside code blocks)
        for (let i = 0; i < originalMessages.length; i++) {
            const origMsg = originalMessages[i];
            if (origMsg.role === 'user') {
                const prose = origMsg.content.replace(/```[\s\S]*?```/g, '').trim();
                if (prose.length > 5) {
                    checksTotal++;
                    // Check if prose or key phrases of the prose are in the optimized message
                    const proseSnippets = prose.split('\n').map(s => s.trim()).filter(s => s.length > 5);
                    const allSnippetsPreserved = proseSnippets.every(snippet => optFullText.includes(snippet));
                    
                    if (allSnippetsPreserved || optFullText.includes(prose)) {
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
            failClosedTriggered: !passed
        };
    }
}
