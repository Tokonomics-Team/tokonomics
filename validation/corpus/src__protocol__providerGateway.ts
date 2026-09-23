import * as vscode from 'vscode';
import { RequestBoundaryContext, RequestBoundaryError } from '../security/requestBoundary';
import { CanonicalMessage, VsCodeProtocolAdapter } from './canonicalProtocol';
import { CanonicalEgressResult, prepareCanonicalEgress } from './canonicalEgress';

const PREPARED_REQUEST = Symbol('tokonomics.prepared-provider-request');

export interface PreparedProviderRequest extends CanonicalEgressResult {
    readonly upstreamMessages: readonly vscode.LanguageModelChatMessage[];
    readonly [PREPARED_REQUEST]: true;
}

/** The only production owner of an upstream language-model send operation. */
export class CanonicalProviderGateway {
    public static prepare(
        adapter: VsCodeProtocolAdapter,
        messages: readonly CanonicalMessage[],
        options: unknown,
        context: RequestBoundaryContext
    ): PreparedProviderRequest {
        const prepared = prepareCanonicalEgress(messages, options, context);
        return Object.freeze({
            ...prepared,
            upstreamMessages: Object.freeze(adapter.toUpstreamMessages(prepared.messages)),
            [PREPARED_REQUEST]: true as const
        });
    }

    public static async send(
        targetModel: vscode.LanguageModelChat,
        request: PreparedProviderRequest,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelChatResponse> {
        if (!request || request[PREPARED_REQUEST] !== true) {
            throw new RequestBoundaryError('SANITIZATION_FAILED', 'Only canonical boundary output can reach a provider.');
        }
        if (token.isCancellationRequested) {
            throw new RequestBoundaryError('CANCELLED', 'Request cancelled before provider dispatch.');
        }
        return targetModel.sendRequest([...request.upstreamMessages], request.options as vscode.LanguageModelChatRequestOptions, token);
    }
}
