import { randomUUID } from 'crypto';
import { PipelineOrchestrator, ContextCompileResult, CancellationLike } from '../engine/pipelineOrchestrator';
import { MessagePayload, TargetProvider } from '../types';
import { CanonicalMessage, VsCodeProtocolAdapter } from './canonicalProtocol';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export interface CanonicalCompileRequest {
    messages: CanonicalMessage[];
    requestId?: string;
    sessionId?: string;
    targetProvider?: TargetProvider;
    targetModel?: string;
    maxTokenBudget?: number;
    activeFilePath?: string;
    cursorLine?: number;
    userIntent?: string;
    cancellation?: CancellationLike;
    workspaceSnapshot?: WorkspaceSnapshot;
    allowWorkspaceRetrieval?: boolean;
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
            activeFilePath: request.activeFilePath,
            cursorLine: request.cursorLine,
            userIntent: request.userIntent,
            cancellation: request.cancellation,
            preserveProtocol: structuredPassThrough,
            deferSideEffects: true,
            workspaceSnapshot: request.workspaceSnapshot,
            allowWorkspaceRetrieval: request.allowWorkspaceRetrieval
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
}
