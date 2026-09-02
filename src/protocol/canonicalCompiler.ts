import { randomUUID } from 'crypto';
import { PipelineOrchestrator, ContextCompileResult, CancellationLike } from '../engine/pipelineOrchestrator';
import { MessagePayload, TargetProvider } from '../types';
import { CanonicalMessage, VsCodeProtocolAdapter } from './canonicalProtocol';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { EvidenceSignal } from '../retrieval/evidenceTypes';
import { CanonicalPayloadTokenEstimator } from '../tokenizer/canonicalPayload';
import { OptimizationEventBus } from '../events/optimizationEvent';

export interface CanonicalCompileRequest {
    messages: CanonicalMessage[];
    requestId?: string;
    sessionId?: string;
    targetProvider?: TargetProvider;
    targetModel?: string;
    maxTokenBudget?: number;
    maxOutputTokens?: number;
    activeFilePath?: string;
    cursorLine?: number;
    userIntent?: string;
    cancellation?: CancellationLike;
    workspaceSnapshot?: WorkspaceSnapshot;
    allowWorkspaceRetrieval?: boolean;
    evidenceSignals?: readonly EvidenceSignal[];
}

export interface CanonicalCompileResult {
    requestId: string;
    messages: CanonicalMessage[];
    compilation: ContextCompileResult;
    structuredPassThrough: boolean;
}

export class CanonicalRequestCompiler {
    private readonly protocol = new VsCodeProtocolAdapter();

    constructor(private readonly orchestrator: PipelineOrchestrator) {}

    public async compile(request: CanonicalCompileRequest): Promise<CanonicalCompileResult> {
        const requestId = request.requestId || `tok_${randomUUID()}`;
        const structuredPassThrough = this.protocol.isStructured(request.messages);
        const textMessages: MessagePayload[] = request.messages.map(message => ({
            role: message.role,
            name: message.name,
            content: message.parts.filter(part => part.kind === 'text').map(part => (part as { kind: 'text'; text: string }).text).join('')
        }));
        const compilation = await this.orchestrator.compileContext({
            messages: textMessages,
            requestId,
            sessionId: request.sessionId,
            targetProvider: request.targetProvider,
            targetModel: request.targetModel,
            maxTokenBudget: request.maxTokenBudget,
            maxOutputTokens: request.maxOutputTokens,
            fixedProtocolTokens: CanonicalPayloadTokenEstimator.countNonTextParts(request.messages),
            activeFilePath: request.activeFilePath,
            cursorLine: request.cursorLine,
            userIntent: request.userIntent,
            cancellation: request.cancellation,
            preserveProtocol: structuredPassThrough,
            deferSideEffects: true,
            workspaceSnapshot: request.workspaceSnapshot,
            allowWorkspaceRetrieval: request.allowWorkspaceRetrieval,
            evidenceSignals: request.evidenceSignals
        });

        const messages = structuredPassThrough
            ? request.messages.map(message => ({ ...message, parts: message.parts.slice() }))
            : compilation.optimizedMessages.map(message => ({
                role: message.role,
                name: message.name,
                parts: [{ kind: 'text' as const, text: message.content }]
            }));
        return { requestId, messages, compilation, structuredPassThrough };
    }

    public commit(result: CanonicalCompileResult): void {
        this.orchestrator.commitCompilation(result.compilation);
    }

    /** Record a terminal downstream failure without committing successful metrics. */
    public fail(result: CanonicalCompileResult, errorCode: string): void {
        if (result.compilation.committed) return;
        const safeCode = errorCode.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64) || 'UNKNOWN_ERROR';
        OptimizationEventBus.getInstance().emit({
            ...result.compilation.event,
            timestamp: Date.now(),
            state: 'OPTIMIZATION_FAILED',
            isCostReconciled: false,
            costStatus: 'unavailable',
            errorCode: safeCode,
            traceId: `${result.requestId}:failed:${safeCode}`
        });
    }
}
