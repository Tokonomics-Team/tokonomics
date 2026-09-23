import * as vscode from 'vscode';
import { TokenOptimizerLanguageModelProvider } from '../proxy/modelProvider';
import { streamQueue } from '../subscriptions/subscriptionModels';
import { SubscriptionActivityListener } from '../subscriptions/cliTransport';

/** In-process adapter: the panel uses the canonical proxy even without Copilot's model registry. */
export function panelModel(provider: TokenOptimizerLanguageModelProvider,
    onActivity?: SubscriptionActivityListener): vscode.LanguageModelChat {
    return {
        id: 'token-optimizer-proxy', vendor: 'tokonomics',
        async sendRequest(messages: vscode.LanguageModelChatMessage[], options: unknown, token: vscode.CancellationToken) {
            const queue = streamQueue();
            void provider.provideLanguageModelChatResponse({ family: 'auto' }, messages, options,
                { report(part: unknown) {
                    if (!(part instanceof vscode.LanguageModelTextPart)) throw new Error('UNSUPPORTED_OUTPUT_PART');
                    queue.push(part.value);
                } }, token, onActivity).then(() => queue.end(), error => queue.end(error));
            return { text: queue.drain() } as any;
        }
    } as unknown as vscode.LanguageModelChat;
}
