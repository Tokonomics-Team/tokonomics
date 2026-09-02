import * as assert from 'assert';
import { CanonicalRequestCompiler } from '../src/protocol/canonicalCompiler';
import { canonicalTextMessage, ProtocolError, VsCodeProtocolAdapter } from '../src/protocol/canonicalProtocol';
import { prepareCanonicalEgress } from '../src/protocol/canonicalEgress';
import { CompilationCancelledError, PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { OptimizationEventBus } from '../src/events/optimizationEvent';
import { TraceLogger } from '../src/engine/traceLogger';
import { TokenOptimizerLanguageModelProvider } from '../src/proxy/modelProvider';
import * as mock from './mock-vscode';

export async function runPhase2ProtocolCompilerTests(): Promise<void> {
    console.log('Running Phase 2 canonical compiler and protocol conformance tests...');
    const adapter = new VsCodeProtocolAdapter();
    const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const providerMessages: any[] = [
        {
            role: mock.LanguageModelChatMessageRole.Assistant,
            name: 'assistant-agent',
            content: [
                new mock.LanguageModelTextPart('I will inspect it.'),
                new mock.LanguageModelToolCallPart('call-1', 'read_file', { path: 'src/app.ts' }),
                new mock.LanguageModelDataPart(imageBytes, 'image/png')
            ]
        },
        {
            role: mock.LanguageModelChatMessageRole.User,
            name: 'tool-user',
            content: [
                new mock.LanguageModelToolResultPart('call-1', [
                    new mock.LanguageModelTextPart('file contents'),
                    mock.LanguageModelDataPart.text('{"ok":true}', 'application/json')
                ])
            ]
        }
    ];
    const canonical = adapter.fromProviderMessages(providerMessages as any);
    const roundTrip: any[] = adapter.toUpstreamMessages(canonical);
    assert.strictEqual(roundTrip[0].name, 'assistant-agent');
    assert.strictEqual(roundTrip[1].name, 'tool-user');
    assert.ok(roundTrip[0].content[1] instanceof mock.LanguageModelToolCallPart);
    assert.strictEqual(roundTrip[0].content[1].callId, 'call-1');
    assert.deepStrictEqual([...roundTrip[0].content[2].data], [...imageBytes]);
    assert.strictEqual(roundTrip[1].content[0].callId, 'call-1');

    assert.throws(() => adapter.fromProviderMessages([{
        role: mock.LanguageModelChatMessageRole.User, content: [{ futurePart: true }]
    }] as any), (error: unknown) => error instanceof ProtocolError && error.code === 'UNSUPPORTED_INPUT_PART');
    assert.throws(() => adapter.toUpstreamMessages([canonicalTextMessage('system', 'do not rewrite me')]),
        (error: unknown) => error instanceof ProtocolError && error.code === 'UNSUPPORTED_SYSTEM_ROLE');

    const secretImage = imageBytes.slice();
    const secured = prepareCanonicalEgress([{
        role: 'assistant',
        parts: [
            { kind: 'tool_call', callId: 'call-secret', name: 'tool', input: { password: 'toolsecretvalue' } },
            { kind: 'data', mimeType: 'text/plain', data: new TextEncoder().encode('password=datasecretvalue') },
            { kind: 'data', mimeType: 'image/png', data: secretImage }
        ]
    }], { tools: [{ description: 'Bearer abcdefghijklmnopqrstuvwxyz12345' }] }, {
        workspaceTrusted: true
    });
    const securedTool = secured.messages[0].parts[0] as any;
    const securedTextData = secured.messages[0].parts[1] as any;
    const securedImage = secured.messages[0].parts[2] as any;
    assert.ok(!JSON.stringify(securedTool.input).includes('toolsecretvalue'));
    assert.ok(!new TextDecoder().decode(securedTextData.data).includes('datasecretvalue'));
    assert.ok(!JSON.stringify(secured.options).includes('abcdefghijklmnopqrstuvwxyz12345'));
    assert.deepStrictEqual([...securedImage.data], [...secretImage], 'opaque binary data must remain byte-identical');

    const bus = OptimizationEventBus.getInstance();
    const orchestrator = new PipelineOrchestrator();
    const compiler = new CanonicalRequestCompiler(orchestrator);
    const structured = await compiler.compile({
        requestId: 'phase2-structured-pass-through',
        messages: canonical,
        targetProvider: 'anthropic',
        cancellation: { isCancellationRequested: false }
    });
    assert.strictEqual(structured.structuredPassThrough, true);
    assert.strictEqual((structured.messages[0].parts[1] as any).callId, 'call-1');
    assert.deepStrictEqual([...(structured.messages[0].parts[2] as any).data], [...imageBytes]);
    assert.strictEqual(structured.compilation.event.id, 'phase2-structured-pass-through');

    let metricWrites = 0;
    const cancellingOrchestrator = new PipelineOrchestrator(undefined, undefined, undefined, {
        recordOptimization: () => { metricWrites++; }
    } as any);
    const latestEventBefore = bus.getLatestEvent();
    const traceCountBefore = TraceLogger.getInstance().getTraces().length;
    await assert.rejects(() => cancellingOrchestrator.compileContext({
        requestId: 'phase2-cancelled',
        messages: [{ role: 'user', content: 'must not create side effects' }],
        cancellation: { isCancellationRequested: true }
    }), (error: unknown) => error instanceof CompilationCancelledError);
    assert.strictEqual(metricWrites, 0);
    assert.strictEqual(bus.getLatestEvent(), latestEventBefore);
    assert.strictEqual(TraceLogger.getInstance().getTraces().length, traceCountBefore);

    mock.clearLastModelRequest();
    const emittedParts: any[] = [];
    const proxy = new TokenOptimizerLanguageModelProvider(new CanonicalRequestCompiler(new PipelineOrchestrator()), () => undefined);
    mock.setNextModelResponseParts([
        new mock.LanguageModelTextPart('tool requested'),
        new mock.LanguageModelToolCallPart('response-call', 'search', { query: 'symbol' }),
        new mock.LanguageModelDataPart(imageBytes, 'image/png')
    ]);
    await proxy.provideLanguageModelChatResponse(
        { family: 'auto' }, providerMessages, {
            modelOptions: { temperature: 0 },
            tools: [{ name: 'search', description: 'password=schemasecretvalue', inputSchema: { type: 'object' } }],
            toolMode: 1
        }, { report: part => emittedParts.push(part) } as any, { isCancellationRequested: false } as any
    );
    assert.strictEqual(emittedParts.length, 3, 'all known upstream response part types must be streamed');
    assert.ok(emittedParts[1] instanceof mock.LanguageModelToolCallPart);
    assert.ok(emittedParts[2] instanceof mock.LanguageModelDataPart);
    assert.ok(mock.lastModelRequest);
    const captured = mock.lastModelRequest!;
    assert.strictEqual(captured.messages[0].name, 'assistant-agent');
    assert.strictEqual(captured.messages[0].content[1].callId, 'call-1');
    assert.deepStrictEqual([...captured.messages[0].content[2].data], [...imageBytes]);
    assert.ok(!JSON.stringify(captured.options).includes('schemasecretvalue'));
    const lifecycle = bus.getRecentEvents(2);
    assert.strictEqual(new Set(lifecycle.map(event => event.id)).size, 1, 'compile and reconciliation must share one request ID');
    assert.deepStrictEqual(lifecycle.map(event => event.state), ['OPTIMIZATION_COMPLETED', 'COST_RECONCILED']);

    const equivalencePrompt = 'Explain canonical entrypoint equivalence marker 98231.';
    assert.ok(mock.activeChatParticipantHandler, 'the activated chat participant must be available for equivalence testing');
    mock.clearLastModelRequest();
    mock.setNextModelResponseParts([new mock.LanguageModelTextPart('chat complete')]);
    await mock.activeChatParticipantHandler!(
        { prompt: equivalencePrompt, command: undefined },
        { history: [] },
        { markdown: () => undefined },
        { isCancellationRequested: false }
    );
    const chatPayload = normalizeCaptured(mock.lastModelRequest);
    mock.clearLastModelRequest();
    mock.setNextModelResponseParts([new mock.LanguageModelTextPart('provider complete')]);
    await proxy.provideLanguageModelChatResponse(
        { family: 'auto' },
        [{ role: mock.LanguageModelChatMessageRole.User, content: [new mock.LanguageModelTextPart(equivalencePrompt)] }],
        { toolMode: 1 }, { report: () => undefined } as any, { isCancellationRequested: false } as any
    );
    const providerPayload = normalizeCaptured(mock.lastModelRequest);
    assert.deepStrictEqual(providerPayload.messages, chatPayload.messages, 'chat and provider entry points must render the same canonical text payload');

    const lateCancelToken = { isCancellationRequested: false };
    mock.setNextModelResponseParts([new mock.LanguageModelTextPart('partial'), new mock.LanguageModelTextPart('must not stream')]);
    await proxy.provideLanguageModelChatResponse(
        { family: 'auto' },
        [{ role: mock.LanguageModelChatMessageRole.User, content: [new mock.LanguageModelTextPart('cancel during streaming')] }],
        { toolMode: 1 }, { report: () => { lateCancelToken.isCancellationRequested = true; } } as any, lateCancelToken as any
    );
    const cancellationEvent = bus.getLatestEvent();
    assert.strictEqual(cancellationEvent?.state, 'OPTIMIZATION_FAILED', 'stream cancellation must be recorded as a terminal failure');
    assert.strictEqual(cancellationEvent?.errorCode, 'CANCELLED');
    assert.strictEqual(cancellationEvent?.costStatus, 'unavailable');

    mock.setNextModelResponseParts([{ futureResponsePart: true }]);
    await assert.rejects(() => proxy.provideLanguageModelChatResponse(
        { family: 'auto' }, [{ role: mock.LanguageModelChatMessageRole.User, content: [new mock.LanguageModelTextPart('future response test')] }],
        { toolMode: 1 }, { report: () => undefined } as any, { isCancellationRequested: false } as any
    ), (error: unknown) => error instanceof ProtocolError && error.code === 'UNSUPPORTED_OUTPUT_PART');
    const protocolFailure = bus.getLatestEvent();
    assert.strictEqual(protocolFailure?.state, 'OPTIMIZATION_FAILED', 'unsupported output must not commit a successful lifecycle');
    assert.strictEqual(protocolFailure?.errorCode, 'UNSUPPORTED_OUTPUT_PART');

    console.log('Phase 2 canonical compiler and protocol conformance tests passed.');
}

function normalizeCaptured(request: { messages: any[]; options: any } | undefined): any {
    assert.ok(request, 'an upstream request must have been captured');
    return {
        messages: request!.messages.map(message => ({
            role: message.role,
            name: message.name,
            parts: message.content.map((part: any) => part instanceof mock.LanguageModelTextPart
                ? { kind: 'text', value: part.value }
                : { kind: part.constructor.name })
        }))
    };
}
