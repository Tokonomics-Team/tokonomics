import { randomUUID } from 'crypto';

/** Window-local explicit task selection; never inferred from prompt content or idle time. */
export class TaskContext {
    private static active?: string;
    private static requests = new Map<string, string>();
    public static start(): string { return this.active = `task_${randomUUID()}`; }
    public static end(): void { this.active = undefined; }
    public static current(): string | undefined { return this.active; }
    public static resolve(requestId: string, sessionId: string, supplied?: string): string {
        const existing = this.requests.get(requestId);
        if (existing) return existing;
        const id = supplied || this.active || (sessionId.startsWith('chat_') ? sessionId : `request_${requestId}`);
        this.requests.set(requestId, id);
        if (this.requests.size > 5000) this.requests.delete(this.requests.keys().next().value!);
        return id;
    }
}
