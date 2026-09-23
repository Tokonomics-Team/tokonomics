import type { MessagePayload } from '../types';
import type { RequestCapabilitySnapshot } from './componentRegistry';
import type { ModelProfile } from '../tokenizer/modelProfile';
import type { WorkspaceSnapshot } from '../workspace/workspaceIndex';

export type CanonicalStageId =
    | 'normalization' | 'intent' | 'evidence_policy' | 'retrieval' | 'candidate_creation'
    | 'transformation' | 'selection' | 'assembly' | 'preservation' | 'egress' | 'accounting';

export type PipelineStageFailureCode = 'STAGE_CANCELLED' | 'STAGE_DEADLINE_EXCEEDED' | 'STAGE_FAILED' | 'STAGE_DISABLED';

export interface PipelineCancellation {
    readonly isCancellationRequested: boolean;
}

export interface PipelinePrivacyPolicy {
    readonly workspaceTrusted: boolean;
    readonly workspaceContentAllowed: boolean;
    readonly externalContentRequiresConsent: true;
}

export interface StageMeasurement {
    readonly stage: CanonicalStageId;
    readonly outcome: 'completed' | 'fallback' | 'failed' | 'cancelled';
    readonly latencyMs: number;
    readonly code?: PipelineStageFailureCode;
}

export interface StageMeasurementRecorder {
    record(measurement: StageMeasurement): void;
    snapshot(): readonly StageMeasurement[];
}

export interface ImmutablePipelineRequestContext {
    readonly requestId: string;
    readonly startedAt: number;
    readonly deadlineAt: number;
    readonly cancellation?: PipelineCancellation;
    readonly profile: Readonly<ModelProfile>;
    readonly capabilities: RequestCapabilitySnapshot;
    readonly snapshot?: WorkspaceSnapshot;
    readonly privacy: PipelinePrivacyPolicy;
    readonly measurements: StageMeasurementRecorder;
}

export interface PipelineStage<I, O> {
    readonly id: CanonicalStageId;
    readonly enabled: boolean;
    readonly fallback?: (input: I, context: ImmutablePipelineRequestContext, error: PipelineStageError) => O | Promise<O>;
    execute(input: I, context: ImmutablePipelineRequestContext): O | Promise<O>;
}

export class PipelineStageError extends Error {
    constructor(
        public readonly stage: CanonicalStageId,
        public readonly code: PipelineStageFailureCode,
        options?: { cause?: unknown }
    ) {
        super(`${stage}:${code}`);
        this.name = 'PipelineStageError';
        if (options?.cause !== undefined) (this as Error & { cause?: unknown }).cause = options.cause;
    }
}

export function createStageMeasurementRecorder(): StageMeasurementRecorder {
    const values: StageMeasurement[] = [];
    return Object.freeze({
        record(measurement: StageMeasurement) { values.push(Object.freeze({ ...measurement })); },
        snapshot() { return Object.freeze(values.slice()); }
    });
}

export function createPipelineRequestContext(input: Omit<ImmutablePipelineRequestContext, 'privacy' | 'measurements'> & {
    privacy?: Partial<PipelinePrivacyPolicy>;
    measurements?: StageMeasurementRecorder;
}): ImmutablePipelineRequestContext {
    const workspaceTrusted = input.privacy?.workspaceTrusted ?? input.capabilities.workspaceTrusted;
    return Object.freeze({
        ...input,
        profile: Object.freeze({ ...input.profile }),
        privacy: Object.freeze({
            workspaceTrusted,
            workspaceContentAllowed: input.privacy?.workspaceContentAllowed ?? workspaceTrusted,
            externalContentRequiresConsent: true as const
        }),
        measurements: input.measurements ?? createStageMeasurementRecorder()
    });
}

export async function executePipelineStage<I, O>(
    stage: PipelineStage<I, O>, input: I, context: ImmutablePipelineRequestContext
): Promise<O> {
    const started = performance.now();
    let failure: PipelineStageError | undefined;
    if (!stage.enabled) failure = new PipelineStageError(stage.id, 'STAGE_DISABLED');
    else if (context.cancellation?.isCancellationRequested) failure = new PipelineStageError(stage.id, 'STAGE_CANCELLED');
    else if (Date.now() >= context.deadlineAt) failure = new PipelineStageError(stage.id, 'STAGE_DEADLINE_EXCEEDED');
    try {
        if (failure) throw failure;
        const output = await stage.execute(input, context);
        if (context.cancellation?.isCancellationRequested) throw new PipelineStageError(stage.id, 'STAGE_CANCELLED');
        if (Date.now() >= context.deadlineAt) throw new PipelineStageError(stage.id, 'STAGE_DEADLINE_EXCEEDED');
        context.measurements.record({ stage: stage.id, outcome: 'completed', latencyMs: performance.now() - started });
        return output;
    } catch (cause) {
        const error = cause instanceof PipelineStageError ? cause : new PipelineStageError(stage.id, 'STAGE_FAILED', { cause });
        if (stage.fallback) {
            const output = await stage.fallback(input, context, error);
            context.measurements.record({ stage: stage.id, outcome: 'fallback', latencyMs: performance.now() - started, code: error.code });
            return output;
        }
        context.measurements.record({ stage: stage.id, outcome: error.code === 'STAGE_CANCELLED' ? 'cancelled' : 'failed',
            latencyMs: performance.now() - started, code: error.code });
        throw error;
    }
}

export const MessageNormalizationStage: PipelineStage<readonly MessagePayload[], MessagePayload[]> = Object.freeze({
    id: 'normalization', enabled: true,
    execute(messages: readonly MessagePayload[]) {
        return messages.map((message: MessagePayload) => ({ ...message, content: String(message.content) }));
    }
});
