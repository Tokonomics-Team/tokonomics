import { randomUUID } from 'crypto';
import { PipelineOrchestrator, ContextCompileResult, CancellationLike } from '../engine/pipelineOrchestrator';
import { MessagePayload, TargetProvider } from '../types';
import { CanonicalMessage, VsCodeProtocolAdapter } from './canonicalProtocol';
import { maskObservations, ObservationMaskingResult } from '../compression/observationMasking';
import { FeatureFlagRegistry } from '../engine/featureFlags';
import { WorkspaceSnapshot } from '../workspace/workspaceIndex';
import { WorkspaceSignalSnapshot } from '../workspace/signalTypes';
import { EvidenceSignal } from '../retrieval/evidenceTypes';
import { CanonicalPayloadTokenEstimator } from '../tokenizer/canonicalPayload';
import { OptimizationEventBus } from '../events/optimizationEvent';
import { BoundedPriorityScheduler, WorkQueueFullError } from '../performance/boundedScheduler';
import { ComponentReceipt, RequestCapabilitySnapshot } from '../engine/componentRegistry';
import { RequestLifecycleController, RequestLifecycleScope } from '../performance/requestLifecycle';

export interface CanonicalCompileRequest {
    messages: CanonicalMessage[];
    /** Explicit chat attachments must survive text optimization; the egress sanitizer still runs. */
    preserveText?: boolean;
    callerSuppliedSource?: boolean;
    requestId?: string;
    sessionId?: string;
    /** Content-free identity of the host request envelope that produced this compilation. */
    envelopeId?: string;
    /** Bounded, consented editor/workspace signals captured once per request. */
    signalSnapshot?: WorkspaceSignalSnapshot;
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
    requestOptions?: unknown;
}

export interface CanonicalCompileResult {
    requestId: string;
    messages: CanonicalMessage[];
    compilation: ContextCompileResult;
    structuredPassThrough: boolean;
    capabilities?: RequestCapabilitySnapshot;
    receipts?: readonly ComponentReceipt[];
    /**
     * Outcome of observation masking, when the request was structured and masking was enabled.
     * Surfaced here rather than on the component receipt trail because masking runs at the protocol
     * layer, outside the orchestrator that owns that trail; this keeps the contribution auditable at
     * the layer that actually performed it.
     */
    observationMasking?: {
        readonly applied: boolean;
        readonly maskedCount: number;
        readonly charsRemoved: number;
        readonly totalObservationChars: number;
        readonly skippedReason?: string;
    };
    /** Owns cancellation/deadline until the downstream request is committed or failed. */
    lifecycle?: RequestLifecycleScope;
}

export class CanonicalRequestCompiler {
    private readonly protocol = new VsCodeProtocolAdapter();

    constructor(
        private readonly orchestrator: PipelineOrchestrator,
        private readonly scheduler?: BoundedPriorityScheduler,
        private readonly prepare?: () => Promise<void>,
        private readonly lifecycleController: RequestLifecycleController = RequestLifecycleController.getInstance()
    ) {}

    public async compile(request: CanonicalCompileRequest): Promise<CanonicalCompileResult> {
        const requestId = request.requestId || `tok_${randomUUID()}`;
        const lifecycle = this.lifecycleController.begin(requestId, request.cancellation);
        const normalized = { ...request, requestId, cancellation: lifecycle.cancellation };
        try {
            const result = !this.scheduler
                ? await this.compileNow(normalized)
                : await this.scheduler.schedule({
                    key: `compile:${requestId}`,
                    priority: 'foreground',
                    cancellation: lifecycle.cancellation,
                    deadlineMs: lifecycle.deadlineAt,
                    estimatedBytes: estimateCanonicalBytes(request.messages)
                }, async context => {
                    context.checkpoint();
                    if (this.prepare) await this.prepare();
                    context.checkpoint();
                    return this.compileNow(normalized);
                }).catch(error => {
                    if (error instanceof WorkQueueFullError) return this.compileNow(normalized, 'foreground_queue_full_pass_through');
                    throw error;
                });
            return { ...result, lifecycle };
        } catch (error) {
            lifecycle.fail(lifecycle.cancellation.isCancellationRequested);
            throw error;
        }
    }

    private async compileNow(request: CanonicalCompileRequest, fallbackReason?: string): Promise<CanonicalCompileResult> {
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
            fixedProtocolTokens: CanonicalPayloadTokenEstimator.countNonTextParts(request.messages)
                + CanonicalPayloadTokenEstimator.countRequestOptions(request.requestOptions),
            activeFilePath: request.activeFilePath,
            cursorLine: request.cursorLine,
            userIntent: request.userIntent,
            cancellation: request.cancellation,
            preserveProtocol: structuredPassThrough || !!fallbackReason,
            preserveText: request.preserveText === true,
            callerSuppliedSource: request.callerSuppliedSource,
            deferSideEffects: true,
            workspaceSnapshot: request.workspaceSnapshot,
            allowWorkspaceRetrieval: request.allowWorkspaceRetrieval,
            evidenceSignals: request.evidenceSignals,
            signalSnapshot: request.signalSnapshot,
            fallbackReasons: fallbackReason ? [fallbackReason] : undefined
        });

        // Structured requests bypass the text compiler, so tool observations - the bulk of an agentic
        // turn - previously went upstream untouched. Masking works on the parts directly, preserving
        // message count, roles, names, tool-call identifiers and part cardinality; only the text
        // inside older tool results is replaced. Any failure returns the input unchanged.
        let observationMasking: ObservationMaskingResult<CanonicalMessage> | undefined;
        let structuredMessages: CanonicalMessage[] = [];
        if (structuredPassThrough) {
            structuredMessages = request.messages.map(message => ({ ...message, parts: message.parts.slice() }));
            if (FeatureFlagRegistry.getFlags().enableObservationMasking) {
                observationMasking = maskObservations(structuredMessages);
                if (observationMasking.applied) structuredMessages = observationMasking.messages;
            }
        }
        const messages = structuredPassThrough
            ? structuredMessages
            : compilation.optimizedMessages.map(message => ({
                role: message.role,
                name: message.name,
                parts: [{ kind: 'text' as const, text: message.content }]
            }));
        return {
            requestId,
            messages,
            observationMasking: observationMasking && {
                applied: observationMasking.applied,
                maskedCount: observationMasking.maskedCount,
                charsRemoved: observationMasking.charsRemoved,
                totalObservationChars: observationMasking.totalObservationChars,
                skippedReason: observationMasking.skippedReason
            },
            compilation,
            structuredPassThrough,
            capabilities: compilation.capabilities,
            receipts: compilation.receipts
        };
    }

    public commit(result: CanonicalCompileResult): void {
        this.orchestrator.commitCompilation(result.compilation);
        result.lifecycle?.complete();
    }

    /**
     * Release a compilation that was superseded before anything was sent.
     *
     * Distinct from `fail`: nothing went wrong, so no failure event is emitted and no metrics are
     * recorded. `complete()` rather than `fail()` because `fail()` cancels the scope's token, which
     * would abort the compilation that replaces this one.
     */
    public abandon(result: CanonicalCompileResult): void {
        if (result.compilation.committed) return;
        result.lifecycle?.complete();
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
        result.lifecycle?.fail(errorCode === 'CANCELLED');
    }
}

function estimateCanonicalBytes(messages: readonly CanonicalMessage[]): number {
    let bytes = 0;
    for (const message of messages) for (const part of message.parts) {
        if (part.kind === 'text') bytes += Buffer.byteLength(part.text, 'utf8');
        else if (part.kind === 'data') bytes += part.data.byteLength;
        else bytes += Buffer.byteLength(JSON.stringify(part), 'utf8');
    }
    return Math.max(1, bytes);
}
