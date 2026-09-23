import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runProcess, runSubscription, hasSubscriptionLogin, AUTH_PROBE_TIMEOUT_MS, Cancellation, SubscriptionProvider, SubscriptionError,
    SubscriptionActivity, SubscriptionActivityListener } from './cliTransport';

let state: vscode.Memento | undefined;
export function registerSubscriptionCommands(context: vscode.ExtensionContext): void {
    state = context.globalState;
    context.subscriptions.push(vscode.commands.registerCommand('tokenOptimizer.configureSubscriptionCli', async () => {
        const provider = await vscode.window.showQuickPick(['codex', 'claude'], { placeHolder: 'Choose subscription CLI to configure (sign in using its terminal login command)' });
        if (!provider) return;
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: false,
            openLabel: `Select ${provider} executable` });
        if (!files?.length) return;
        const file = files[0].fsPath;
        if (!path.isAbsolute(file) || /\.(cmd|bat|ps1|js)$/i.test(file)) {
            void vscode.window.showWarningMessage('Select the native CLI executable, not a shell script or npm shim.'); return;
        }
        await state!.update(`subscriptionCli.${provider}`, file);
        void vscode.window.showInformationMessage(`Configured ${provider}. Use @tokonomics /${provider} followed by your question in VS Code Chat (Ask).`);
    }));
}

/** Publisher-qualified identifier of the editor extension that ships each provider's CLI. */
const BUNDLING_EXTENSION: Record<SubscriptionProvider, string> = {
    codex: 'openai.chatgpt',
    claude: 'anthropic.claude-code'
};

/**
 * Paths, relative to the bundling extension, where each CLI has shipped.
 *
 * More than one is listed on purpose: the layout is the vendor's private detail and has moved
 * between releases, and a single hard-coded path is one reorganisation away from making the whole
 * feature unavailable on a machine where the binary is present.
 */
const BUNDLED_RELATIVE_PATHS: Record<SubscriptionProvider, readonly string[]> = {
    codex: ['bin/windows-x86_64/codex.exe', 'bin/windows-x64/codex.exe', 'bin/aarch64-apple-darwin/codex', 'bin/x86_64-apple-darwin/codex',
        'bin/x86_64-unknown-linux-musl/codex', 'bin/aarch64-unknown-linux-musl/codex', 'bin/codex'],
    claude: ['resources/native-binary/claude.exe', 'resources/native-binary/claude', 'bin/claude.exe', 'bin/claude']
};

function isExecutableFile(candidate: string): boolean {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
}

/**
 * Directories that hold an installed extension.
 *
 * `vscode.extensions.getExtension` answers this in one call and is tried first, but it only knows
 * about extensions in the calling extension host. Tokonomics declares `extensionKind: workspace`,
 * so on a remote or container window the provider's CLI extension can be installed and running in
 * the other host, invisible to that lookup while its binary sits on the same disk. Scanning the
 * extensions directory covers that case; it is a cheap directory listing, done only on a miss.
 */
function installedExtensionDirectories(provider: SubscriptionProvider): string[] {
    const found: string[] = [];
    const fromApi = vscode.extensions?.getExtension?.(BUNDLING_EXTENSION[provider]);
    if (fromApi?.extensionPath) found.push(fromApi.extensionPath);
    const fromAll = vscode.extensions?.all?.find(e => e.id.toLowerCase() === BUNDLING_EXTENSION[provider].toLowerCase());
    if (fromAll?.extensionPath && !found.includes(fromAll.extensionPath)) found.push(fromAll.extensionPath);
    const prefix = `${BUNDLING_EXTENSION[provider]}-`;
    for (const root of ['.vscode', '.vscode-insiders', '.vscode-server', '.vscode-server-insiders', '.cursor', '.windsurf', '.antigravity-ide', '.antigravity', '.antigravity-server', '.vscodium']
        .map(folder => path.join(os.homedir(), folder, 'extensions'))) {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            // Extension folders are named publisher.name-version, and the publisher casing on disk
            // does not have to match the casing in the manifest.
            if (entry.name.toLowerCase().startsWith(prefix)) found.push(path.join(root, entry.name));
        }
    }
    // Newest first, so a machine carrying several versions resolves the current one.
    return [...new Set(found)].sort().reverse();
}

/**
 * Directories where each vendor's own installer places the native binary.
 *
 * PATH alone was not enough: both CLIs install to a per-user directory that their installers add to
 * the *interactive shell* profile, and an editor launched from a desktop shortcut inherits the
 * environment from before that edit - so the binary is present and `resolveCli` could not see it.
 */
function nativeInstallDirectories(provider: SubscriptionProvider): string[] {
    const home = os.homedir();
    const shared = [path.join(home, '.local', 'bin'), path.join(home, 'bin')];
    const perProvider = provider === 'claude'
        ? [path.join(home, '.claude', 'local'), path.join(home, '.claude', 'bin')]
        : [path.join(home, '.codex', 'bin')];
    const platformSpecific = process.platform === 'win32'
        ? [path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', provider),
            path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), provider, 'bin')]
        : ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin'];
    return [...shared, ...perProvider, ...platformSpecific];
}

/**
 * Every place this looks for a provider CLI, in priority order.
 *
 * Exported so the failure message and the diagnostic surface can name the same list the search
 * used, rather than a description of it that can drift.
 */
export function cliSearchPaths(provider: SubscriptionProvider): string[] {
    const executable = provider + (process.platform === 'win32' ? '.exe' : '');
    const bundled = installedExtensionDirectories(provider)
        .flatMap(directory => BUNDLED_RELATIVE_PATHS[provider].map(relative => path.join(directory, relative)));
    // Native installations only. An npm shim (.cmd/.ps1/.bat/.js) is a script, and executing one
    // would run whatever a workspace or profile put on the resolution path.
    const installed = [...nativeInstallDirectories(provider), ...(process.env.PATH ?? '').split(path.delimiter)]
        .filter(directory => directory && path.isAbsolute(directory))
        .map(directory => path.join(directory, executable));
    return [...new Set([...bundled, ...installed])];
}

export function resolveCli(provider: SubscriptionProvider): string {
    const configured = state?.get<string>(`subscriptionCli.${provider}`);
    if (configured) {
        if (isExecutableFile(configured)) return configured;
        throw new SubscriptionError(`The configured ${provider} CLI is no longer at ${configured}. Run Tokonomics: Configure subscription CLI to point at the current one, or clear the setting to search again.`);
    }
    const searched = cliSearchPaths(provider);
    const resolved = searched.find(isExecutableFile);
    if (resolved) return resolved;
    throw new SubscriptionError(`${provider} native CLI was not found. Install and sign in to its official CLI, then run Tokonomics: Configure subscription CLI. Searched ${searched.length} location(s), including ${searched.slice(0, 3).join(', ')}.`);
}

/**
 * What `/claude` and `/codex` can see, reported without sending a request.
 *
 * The two ways this feature fails on a working machine are an unresolved binary and a login the
 * CLI will not accept, and neither is visible from a failed answer. Running the command with no
 * question answers both, so a user can tell "Tokonomics cannot find it" from "the provider said no"
 * without reading a log.
 */
export async function subscriptionDiagnostics(provider: SubscriptionProvider, token: Cancellation): Promise<string> {
    const lines: string[] = [`### Tokonomics subscription check: \`${provider}\``, ''];
    if (!vscode.workspace.isTrusted) {
        lines.push('- **Workspace trust:** not trusted, so subscription chat is unavailable here.');
        return lines.join('\n');
    }
    let executable: string;
    try {
        executable = resolveCli(provider);
    } catch (error) {
        lines.push(`- **CLI:** not found. ${error instanceof Error ? error.message : String(error)}`);
        return lines.join('\n');
    }
    lines.push(`- **CLI:** \`${executable}\``);
    const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tokonomics-subscription-check-'));
    try {
        const auth = await runProcess(executable, provider === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'],
            '', cwd, token, AUTH_PROBE_TIMEOUT_MS, provider === 'codex');
        const signedIn = hasSubscriptionLogin(provider, auth);
        lines.push(`- **Login:** ${signedIn ? 'signed in to a subscription login.' : 'the CLI did not report a subscription login. Sign in with its own login command in a terminal.'}`);
    } catch (error) {
        lines.push(`- **Login:** could not be checked. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await fs.promises.rmdir(cwd).catch(() => {});
    }
    lines.push('', `Ask a question with \`@tokonomics /${provider} your question\`. This mode answers using compiled context; it does not edit files.`);
    return lines.join('\n');
}

/**
 * Instructions sent ahead of the conversation.
 *
 * Two things the model cannot work out for itself, and got wrong without being told:
 *
 * The process runs in an empty scratch directory, because the transport deliberately gives the CLI
 * no access to the workspace - everything it may see is in the conversation. Left unexplained, the
 * model inspected that directory and reported its findings, telling the user their project was not
 * a git repository and naming a temp path they had never heard of.
 *
 * Context is compiled and attached automatically, so the model has no way to know whether the user
 * chose it or Tokonomics did. Asked only "Hi", it opened with an inventory of the bundle it had been
 * handed and the elisions in it. The attachment is a means, not the subject: describe it when it
 * bears on the answer - when something needed is missing - and not otherwise.
 */
export const SUBSCRIPTION_PREAMBLE = [
    'Answer the final user request using this JSON conversation. Earlier assistant turns are history.',
    'Provide explanations or suggested code changes in your answer. Do not execute tools or change files.',
    'Your working directory is an empty scratch directory, not the user\'s project. Its contents, and',
    'the absence of a repository or tooling in it, say nothing about their workspace: do not inspect or',
    'describe it. Any project context is supplied in this conversation.',
    'That context was selected and attached automatically, not by the user. Answer what was actually',
    'asked; describe the attached context only when it bears on the answer, such as when something you',
    'need is missing from it. A greeting deserves a greeting, not an inventory.',
    ''
].join('\n');

/** Adapter used exclusively through the canonical gateway, never a global model provider. */
export function subscriptionTranscript(messages: readonly vscode.LanguageModelChatMessage[]): string {
    const transcript = messages.map(message => {
        if (![vscode.LanguageModelChatMessageRole.User, vscode.LanguageModelChatMessageRole.Assistant].includes(message.role)) throw new SubscriptionError('Unsupported conversation role.');
        return { role: message.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant',
            content: message.content.map(part => {
                if (!(part instanceof vscode.LanguageModelTextPart)) throw new SubscriptionError('Subscription chat currently supports text context only.');
                return part.value;
            }).join('') };
    });
    return SUBSCRIPTION_PREAMBLE + JSON.stringify(transcript);
}

/**
 * Input budget declared for a CLI-backed model.
 *
 * The CLI chooses its own model per request. Retrieval and packing use this bounded local budget
 * until the adapter can discover the selected model's effective input allowance before dispatch.
 *
 * This is a local compiler ceiling, not a verified limit of the model selected by the CLI.
 * The transport separately enforces a 1 MiB UTF-8 prompt cap; token and byte limits are not
 * interchangeable. A provider with a smaller effective window may reject a large request.
 */
export const SUBSCRIPTION_INPUT_BUDGET_TOKENS = 200000;

/**
 * A queue that lets a push-based process feed a pull-based async iterator.
 *
 * The CLI pushes lines as it produces them; the chat participant pulls chunks with `for await`.
 * Without something in between, the answer could only be handed over once the process had exited,
 * which is why a request that took a minute rendered nothing for a minute.
 */
export function streamQueue() {
    const buffered: string[] = [];
    let wake: (() => void) | undefined;
    let ended = false;
    let failure: Error | undefined;
    return {
        push(value: string) { buffered.push(value); wake?.(); wake = undefined; },
        end(error?: Error) { ended = true; failure = error; wake?.(); wake = undefined; },
        async *drain(): AsyncGenerator<string> {
            for (;;) {
                while (buffered.length > 0) yield buffered.shift()!;
                if (failure) throw failure;
                if (ended) return;
                await new Promise<void>(resolve => { wake = resolve; });
            }
        }
    };
}

export interface SubscriptionModelOptions {
    readonly model?: string;
    /** Called as the provider works, so the turn can show what is happening while it happens. */
    readonly onActivity?: SubscriptionActivityListener;
}

export function subscriptionModel(provider: SubscriptionProvider, options?: SubscriptionModelOptions): vscode.LanguageModelChat {
    if (!vscode.workspace.isTrusted) throw new SubscriptionError('Subscription CLI chat requires a trusted workspace.');
    const executable = resolveCli(provider);
    return {
        id: `${provider}-subscription${options?.model ? ':' + options.model : ''}`,
        name: `${provider} subscription${options?.model ? ' / ' + options.model : ''}`, vendor: provider === 'codex' ? 'openai' : 'anthropic',
        family: provider, version: 'cli', maxInputTokens: SUBSCRIPTION_INPUT_BUDGET_TOKENS,
        async sendRequest(messages: vscode.LanguageModelChatMessage[], _options: unknown, token: vscode.CancellationToken) {
            if (!vscode.workspace.isTrusted) throw new SubscriptionError('Workspace trust was revoked.');
            const queue = streamQueue();
            const state: { usage?: Record<string, unknown>; model?: string } = {};
            let streamedAnswer = false;
            const relay = (activity: SubscriptionActivity) => {
                if (activity.kind === 'text' && activity.text) { streamedAnswer = true; queue.push(activity.text); return; }
                if (activity.kind === 'model' && activity.model) state.model = activity.model;
                options?.onActivity?.(activity);
            };
            runSubscription(provider, executable, subscriptionTranscript(messages), token, relay, options?.model).then(result => {
                state.usage = result.usage;
                state.model = result.model ?? state.model;
                // A provider that streamed nothing - or a stream this build does not recognise - still
                // has its validated answer delivered, so streaming can never lose a completed reply.
                if (!streamedAnswer && result.text) queue.push(result.text);
                queue.end();
            }, error => queue.end(error instanceof Error ? error : new SubscriptionError(String(error))));
            // Usage and model are read after the stream is drained, so they resolve by the time the
            // caller looks at them.
            return { text: queue.drain(),
                get usage() { return state.usage; },
                get subscriptionModel() { return state.model; } } as any;
        }
    } as unknown as vscode.LanguageModelChat;
}
