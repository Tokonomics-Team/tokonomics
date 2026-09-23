import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type SubscriptionProvider = 'codex' | 'claude';
export class SubscriptionError extends Error {}
export interface Cancellation { isCancellationRequested: boolean; onCancellationRequested(listener: () => void): { dispose(): void }; }
export interface CliResult { text: string; usage?: Record<string, unknown>; model?: string; }

/**
 * What the provider is doing, reported while it is doing it.
 *
 * The CLIs emit a running account of a turn - the model they picked, reasoning, the answer as it is
 * produced - and all of it was parsed only after the process exited, so a request that took a minute
 * showed nothing for a minute and then everything at once. These are the events worth surfacing;
 * `text` is the answer itself and the rest is context about how it was reached.
 */
export interface SubscriptionActivity {
    readonly kind: 'model' | 'text' | 'reasoning' | 'command' | 'file' | 'tool' | 'plan' | 'status';
    readonly text?: string;
    readonly model?: string;
    readonly id?: string;
    readonly status?: 'running' | 'completed' | 'failed';
}

export type SubscriptionActivityListener = (activity: SubscriptionActivity) => void;

/**
 * Translates one event from a provider's JSON stream into activity.
 *
 * Pure and per-event, so the streaming contract is testable against recorded provider output with no
 * CLI, no process, and no account.
 */
export function parseCliActivity(provider: SubscriptionProvider, event: any): SubscriptionActivity[] {
    if (!event || typeof event !== 'object') return [];
    if (provider === 'claude') {
        const block = event.type === 'stream_event' && event.event?.type === 'content_block_start'
            ? event.event.content_block : undefined;
        if (block?.type === 'tool_use' && typeof block.name === 'string') {
            return [{ kind: 'tool', id: block.id, text: block.name, status: 'running' }];
        }
        if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
            return event.message.content.filter((part: any) => part?.type === 'tool_use' && typeof part.name === 'string')
                .slice(0, 40).map((part: any): SubscriptionActivity => {
                    const input = part.input || {};
                    if (part.name === 'Bash' && typeof input.command === 'string')
                        return { kind: 'command', id: part.id, text: input.command, status: 'running' };
                    if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(part.name) && typeof input.file_path === 'string')
                        return { kind: 'file', id: part.id, text: `${part.name}: ${input.file_path}`, status: 'running' };
                    if (part.name === 'TodoWrite' && Array.isArray(input.todos))
                        return { kind: 'plan', id: part.id, text: input.todos.slice(0, 20).map((t: any) => `${t.status}: ${t.content}`).join('\n'), status: 'running' };
                    return { kind: 'tool', id: part.id, text: part.name, status: 'running' };
                });
        }
        if (event.type === 'user' && Array.isArray(event.message?.content)) {
            return event.message.content.filter((part: any) => part?.type === 'tool_result' && typeof part.tool_use_id === 'string')
                .slice(0, 40).map((part: any): SubscriptionActivity => ({ kind: 'tool', id: part.tool_use_id,
                    status: part.is_error ? 'failed' : 'completed' }));
        }
        if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string') {
            return [{ kind: 'model', model: event.model }];
        }
        // Incremental deltas, requested with --include-partial-messages. The `assistant` event that
        // follows repeats the same text as one block, so it is deliberately not a source here.
        if (event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
            const delta = event.event.delta;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') return [{ kind: 'text', text: delta.text }];
            if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') return [{ kind: 'reasoning', text: delta.thinking }];
        }
        return [];
    }
    if (['item.started', 'item.updated', 'item.completed'].includes(event.type) && event.item) {
        const item = event.item;
        const status = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
            ? 'failed' : event.type === 'item.completed' ? 'completed' : 'running';
        if (item.type === 'command_execution' && typeof item.command === 'string')
            return [{ kind: 'command', id: item.id, text: item.command, status }];
        if (item.type === 'file_change' && Array.isArray(item.changes))
            return [{ kind: 'file', id: item.id, text: item.changes.slice(0, 20)
                .map((c: any) => `${c.kind || 'change'}: ${typeof c.path === 'string' ? c.path : 'unknown path'}`).join('\n'), status }];
        if (item.type === 'todo_list' && Array.isArray(item.items))
            return [{ kind: 'plan', id: item.id, text: item.items.slice(0, 20)
                .map((t: any) => `${t.completed ? 'Done' : 'Next'}: ${t.text}`).join('\n'), status }];
        if (item.type === 'mcp_tool_call' && typeof item.tool === 'string')
            return [{ kind: 'tool', id: item.id, text: `${item.server || 'MCP'} / ${item.tool}`, status }];
        if (item.type === 'web_search' && typeof item.query === 'string')
            return [{ kind: 'tool', id: item.id, text: `Search: ${item.query}`, status }];
    }
    if (event.type === 'item.completed') {
        // Reasoning is surfaced as activity but never as answer text: it is the provider's working,
        // and it is not what the user asked to be told, cached, or carried into the next turn.
        if (event.item?.type === 'reasoning' && typeof event.item.text === 'string') return [{ kind: 'reasoning', text: event.item.text }];
        if (event.item?.type === 'agent_message' && typeof event.item.text === 'string') return [{ kind: 'text', text: `${event.item.text}\n` }];
    }
    return [];
}

/** Line boundary in a provider's JSONL stream. */
const SPLIT_LINES = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));

/** Longest provider explanation carried into an error message. */
const MAX_DETAIL_CHARS = 400;

/**
 * The provider's own explanation of a failure, cleaned for display.
 *
 * A failing CLI already says exactly what is wrong - a spent usage limit, an unknown option, an
 * expired login - and collapsing all of it into one generic sentence left the only actionable fact
 * on the floor. The text is the provider's message about the user's own account, shown only to that
 * user, in the chat turn they started. Control characters are stripped and the length is bounded so
 * a runaway stream cannot flood the transcript.
 */
export function sanitizeProviderDetail(detail: string | undefined): string | undefined {
    if (!detail) return undefined;
    const cleaned = detail.split(/\r?\n/)
        .map(line => [...line].map(character => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127 ? ' ' : character;
        }).join('').trim())
        .filter(Boolean).join(' ').trim();
    if (!cleaned) return undefined;
    return cleaned.length > MAX_DETAIL_CHARS ? `${cleaned.slice(0, MAX_DETAIL_CHARS - 3)}...` : cleaned;
}

/**
 * Pulls the provider's failure message out of whatever the CLI managed to emit.
 *
 * Both CLIs report failures as JSON events on stdout before exiting non-zero, so the exit code
 * alone is the least informative signal available. Lines that do not parse are searched too,
 * because a CLI that rejects its own arguments prints plain text and exits before the stream starts.
 */
export function describeCliFailure(streamOutput: string, stderrOutput?: string): string | undefined {
    for (const line of streamOutput.split(/\r?\n/).filter(Boolean)) {
        let event: any;
        try { event = JSON.parse(line); } catch { continue; }
        const candidate = typeof event?.error === 'string' ? event.error
            : typeof event?.error?.message === 'string' ? event.error.message
            : typeof event?.message === 'string' ? event.message
            : event?.is_error === true && typeof event?.result === 'string' ? event.result
            : undefined;
        if (candidate) return sanitizeProviderDetail(candidate);
    }
    const plain = streamOutput.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('{'));
    return sanitizeProviderDetail(plain.join(' ')) ?? sanitizeProviderDetail(stderrOutput);
}

/** Appends the provider's own words to a Tokonomics explanation, when the provider offered any. */
function withDetail(message: string, detail: string | undefined): SubscriptionError {
    return new SubscriptionError(detail ? `${message} The provider reported: ${detail}` : message);
}

/** Prompts use stdin, never shell text, argv, logs or temporary files. */
export function runProcess(executable: string, args: string[], input: string, cwd: string,
    token: Cancellation, timeoutMs = 600000, captureStatus = false,
    onLine?: (line: string) => void): Promise<string> {
    if (token.isCancellationRequested) return Promise.reject(new SubscriptionError('Request cancelled.'));
    const env = { ...process.env };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key];
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', size = 0, settled = false;
        // Held only for the lifetime of this call, and only to explain a failure to the user who
        // started it. It is never logged, cached, or attached to an event.
        let diagnostics = '';
        let spawnFailed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancel: { dispose(): void } | undefined;
        const finish = (error?: Error) => {
            if (settled) return; settled = true;
            if (timer) clearTimeout(timer); cancel?.dispose();
            if (error) { child.kill(); reject(error); } else resolve(output);
        };
        cancel = token.onCancellationRequested(() => finish(new SubscriptionError('Request cancelled.')));
        timer = setTimeout(() => finish(new SubscriptionError('Provider CLI timed out. Retry a smaller request.')), timeoutMs);
        child.stdout.setEncoding('utf8');
        // Complete lines are handed on as they arrive. The full output is still accumulated, because
        // the final validation reads the whole stream - streaming is an addition to that, not a
        // replacement for it, so a stream that ends without a completed result still fails closed.
        let carry = '';
        child.stdout.on('data', (chunk: string) => {
            size += Buffer.byteLength(chunk);
            if (size > 8 * 1024 * 1024) { finish(new SubscriptionError('Provider output exceeded the 8 MiB limit.')); return; }
            output += chunk;
            if (!onLine) return;
            carry += chunk;
            const lines = carry.split(SPLIT_LINES);
            carry = lines.pop() ?? '';
            for (const line of lines) if (line.trim()) onLine(line);
        });
        // stderr never becomes part of an answer and is never logged. A bounded copy is kept in
        // memory so a CLI that rejects its own arguments - which prints there and exits before the
        // JSON stream starts - can still tell the user what it rejected.
        child.stderr.on('data', chunk => {
            const text = chunk.toString();
            if (captureStatus && output.length < 16384) output += text;
            if (diagnostics.length < 16384) diagnostics += text;
        });
        // A broken stdin pipe is what an already-exited CLI looks like from this side, so it is not
        // a failure in its own right. Reporting it immediately raced the exit code and buried the
        // real reason - which arrives on 'close' a moment later - behind a message about input.
        child.stdin.on('error', () => { if (!spawnFailed) child.stdin.destroy(); });
        child.on('error', () => {
            spawnFailed = true;
            finish(withDetail('Cannot start provider CLI. Run Tokonomics: Configure subscription CLI.',
                sanitizeProviderDetail(diagnostics)));
        });
        child.on('close', code => {
            if (settled) return;
            if (code === 0 && carry.trim() && onLine) onLine(carry);
            finish(code === 0 ? undefined
                : withDetail('Provider CLI failed. Check its login, subscription limits and supported flags in a terminal.',
                    describeCliFailure(output, diagnostics)));
        });
        child.stdin.end(input);
        if (token.isCancellationRequested) finish(new SubscriptionError('Request cancelled.'));
    });
}

export function cliArguments(provider: SubscriptionProvider, model?: string): string[] {
    if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) throw new SubscriptionError('Invalid subscription model identifier.');
    const args = provider === 'codex'
        ? ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
            '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
            '--disable', 'shell_tool', '--disable', 'multi_agent', '--disable', 'apps', '-']
        // --include-partial-messages is what makes the answer arrive as it is written rather than in
        // one block when the process exits.
        : ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
            '--no-session-persistence', '--safe-mode',
            '--tools', '', '--disallowedTools', '*', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
            '--permission-mode', 'dontAsk', '--settings', '{"disableAllHooks":true}'];
    if (model) args.push('--model', model);
    return args;
}

export function parseCliResult(provider: SubscriptionProvider, output: string): CliResult {
    const result: CliResult = { text: '' };
    let completed = false;
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
        let event: any;
        try { event = JSON.parse(line); } catch { throw new SubscriptionError('Provider returned an unsupported JSON stream. Update the CLI.'); }
        if (event.type === 'error' || event.type === 'turn.failed' || event.is_error) {
            throw new SubscriptionError(['Provider reported a failed request. Check subscription limits and login in its CLI.',
                describeCliFailure(line)].filter(Boolean).join(' The provider reported: '));
        }
        if (provider === 'codex') {
            if (event.type === 'item.completed' && event.item?.type === 'agent_message') result.text += `${event.item.text}\n`;
            if (event.type === 'turn.completed') {
                completed = true;
                if (event.usage) result.usage = { inputTokens: event.usage.input_tokens, outputTokens: event.usage.output_tokens,
                    cachedTokens: event.usage.cached_input_tokens ?? 0 };
            }
        } else {
            if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string') result.model = event.model;
            if (event.type === 'result') {
                completed = event.subtype === 'success';
                if (typeof event.result === 'string') result.text = event.result;
                if (event.usage) result.usage = event.usage;
            }
        }
    }
    if (!completed || !result.text.trim()) throw new SubscriptionError('Provider returned no completed text answer. No response was cached.');
    return result;
}

/** Login probes are short-lived; a cold CLI on Windows still needs more than a moment. */
export const AUTH_PROBE_TIMEOUT_MS = 45000;

/** Interactive subscription logins the Claude CLI reports. Console and API-key auth are deliberately excluded: they bill per token. */
export const SUBSCRIPTION_AUTH_METHODS: readonly string[] = ['claude.ai', 'oauth'];

/** Diagnostics and dispatch must accept exactly the same login methods. */
export function hasSubscriptionLogin(provider: SubscriptionProvider, auth: string): boolean {
    if (provider === 'codex') return /logged in using chatgpt/i.test(auth);
    try {
        const status = JSON.parse(auth);
        return status?.loggedIn === true && SUBSCRIPTION_AUTH_METHODS.includes(String(status.authMethod));
    } catch { return false; }
}

/** Active temporary directories created for subscription CLI runs, tracked for guaranteed cleanup. */
const activeSubscriptionTempDirs = new Set<string>();

/** Cleanly and recursively removes a temporary subscription directory and all residual artifacts. */
export async function cleanupSubscriptionTempDir(dirPath: string): Promise<void> {
    activeSubscriptionTempDirs.delete(dirPath);
    try {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch {
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
        } catch { /* best effort */ }
    }
}

// Register process exit cleanups so orphaned directories are never leaked on abnormal termination
if (typeof process !== 'undefined' && typeof process.on === 'function') {
    const purgeActiveTempDirs = () => {
        for (const dir of activeSubscriptionTempDirs) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch { /* best effort during exit */ }
        }
        activeSubscriptionTempDirs.clear();
    };
    process.once('exit', purgeActiveTempDirs);
    process.once('SIGINT', purgeActiveTempDirs);
    process.once('SIGTERM', purgeActiveTempDirs);
}

export async function runSubscription(provider: SubscriptionProvider, executable: string, prompt: string,
    token: Cancellation, onActivity?: SubscriptionActivityListener, model?: string): Promise<CliResult> {
    if (Buffer.byteLength(prompt) > 1024 * 1024) throw new SubscriptionError('Compiled subscription context exceeds 1 MiB. Narrow the task.');
    const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tokonomics-subscription-'));
    activeSubscriptionTempDirs.add(cwd);
    try {
        onActivity?.({ kind: 'status', id: 'login', text: 'Checking subscription login', status: 'running' });
        // The login probe is a separate, short-lived invocation, so it gets its own timeout. A cold
        // CLI on Windows can spend several seconds before it prints anything.
        const auth = await runProcess(executable, provider === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'], '', cwd, token, AUTH_PROBE_TIMEOUT_MS, provider === 'codex');
        if (provider === 'codex') {
            if (!hasSubscriptionLogin(provider, auth)) throw new SubscriptionError('Sign in using ChatGPT with codex login before using /codex. API-key authentication is not used here.');
        } else {
            let status: any; try { status = JSON.parse(auth); } catch { /* fail closed */ }
            // A subscription login is what this transport is for: it deliberately does not run on an
            // API key, so the accepted methods are the interactive ones the CLI reports.
            if (!hasSubscriptionLogin(provider, auth)) {
                throw new SubscriptionError(status?.loggedIn
                    ? `The Claude CLI is signed in with "${String(status.authMethod)}", which is not a subscription login. Run claude auth login and choose your Claude subscription.`
                    : 'Sign in to your Claude subscription with claude auth login before using /claude.');
            }
        }
        onActivity?.({ kind: 'status', id: 'login', text: 'Subscription login checked', status: 'completed' });
        onActivity?.({ kind: 'status', id: 'provider', text: 'Waiting for provider events', status: 'running' });
        const onLine = onActivity
            ? (line: string) => {
                let event: unknown;
                try { event = JSON.parse(line); } catch { return; }
                for (const activity of parseCliActivity(provider, event)) onActivity(activity);
            }
            : undefined;
        const result = parseCliResult(provider, await runProcess(executable, cliArguments(provider, model), prompt, cwd, token, 600000, false, onLine));
        onActivity?.({ kind: 'status', id: 'provider', text: 'Provider reply completed', status: 'completed' });
        return result;
    } catch (error) {
        onActivity?.({ kind: 'status', id: 'provider', text: token.isCancellationRequested ? 'Provider request cancelled' : 'Provider request stopped', status: 'failed' });
        throw error;
    } finally {
        await cleanupSubscriptionTempDir(cwd);
    }
}
