/**
 * Tokonomics Legacy Pipeline
 *
 * The pre-compiler execution path, retained for differential testing against the frozen v4.1.2
 * golden baseline and reachable only when `pipelineMode` is `legacy` or `hybrid`. It is kept out of
 * the orchestrator so that file stays composition and lifecycle coordination rather than carrying a
 * superseded algorithm alongside the current one.
 *
 * Behaviour is unchanged by the extraction: prose is preserved verbatim and only fenced code blocks
 * are offered to the AST pruner, which may decline.
 */

import type { AstPrunerEngine } from '../ast/pruner';
import type { MessagePayload } from '../types';
import type { Decision } from './traceLogger';
import { renderFencedCode } from './taskCompressionPolicy';

export async function executeLegacyPipeline(
    astEngine: AstPrunerEngine,
    request: { readonly messages: readonly MessagePayload[] },
    decisions: Decision[]
): Promise<MessagePayload[]> {
    const result: MessagePayload[] = [];
    const parserLabel = astEngine?.getActiveParserLabel ? astEngine.getActiveParserLabel() : 'AST Parser';

    for (let i = 0; i < request.messages.length; i++) {
        const msg = request.messages[i];
        if (msg.role === 'user' && msg.content.includes('```')) {
            let updatedContent = msg.content;
            const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
            let match: RegExpExecArray | null;
            let blocksPruned = 0;
            while ((match = codeBlockRegex.exec(msg.content)) !== null) {
                const fullMatch = match[0];
                const langTag = match[1] || 'typescript';
                const pruned = astEngine.pruneCodeContext(match[2], langTag as never);
                if (pruned.wasPruned && pruned.prunedCode.trim().length > 0) {
                    updatedContent = updatedContent.replace(fullMatch, renderFencedCode(langTag, pruned.prunedCode));
                    blocksPruned++;
                }
            }
            result.push({ ...msg, content: updatedContent });
            decisions.push({
                itemId: `turn_${i}`,
                action: blocksPruned > 0 ? 'compress' : 'preserve',
                reason: blocksPruned > 0
                    ? `AST skeleton pruner applied to ${blocksPruned} code fence(s); user instructions preserved verbatim`
                    : 'Code block below pruning threshold; preserved intact',
                confidence: 1.0,
                evidence: [parserLabel]
            });
        } else {
            result.push({ ...msg });
            decisions.push({
                itemId: `turn_${i}`, action: 'preserve',
                reason: 'Standard conversational text preserved verbatim',
                confidence: 1.0, evidence: ['Verbatim pass-through']
            });
        }
    }
    return result;
}
