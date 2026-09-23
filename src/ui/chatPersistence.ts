import { MAX_SESSION_CHARS, MAX_SESSION_MESSAGES } from './chatProtocol';
import { SecuritySanitizer } from '../security/sanitizer';

export interface ChatTurn { role: 'user' | 'assistant'; text: string; }
export interface ChatTranscriptRow {
    role: 'user' | 'assistant' | 'error' | 'info';
    text: string;
    requestId?: string;
    usage?: string;
}
export interface SavedChatSession {
    id: string;
    selectedModelId: string;
    history: ChatTurn[];
    transcript: ChatTranscriptRow[];
    updatedAt: number;
    interrupted?: boolean;
}
export const CHAT_STORAGE_KEY = 'tokonomics.chatHistory.v1';
export const MAX_SAVED_CHATS = 10;

/** Validate local storage too; restored display data never becomes model history implicitly. */
export function normalizeChatSession(value: unknown): SavedChatSession | undefined {
    if (!value || typeof value !== 'object') return;
    const raw = value as SavedChatSession;
    if (typeof raw.id !== 'string' || !/^chat_[\w-]{1,200}$/.test(raw.id)) return;
    if (typeof raw.selectedModelId !== 'string' || raw.selectedModelId.length > 256) return;
    if (!Array.isArray(raw.history) || !Array.isArray(raw.transcript)) return;
    const clean = (text: string) => SecuritySanitizer.sanitizeSecrets(text.slice(-MAX_SESSION_CHARS)).sanitized;
    const bound = <T extends { text: string }>(rows: T[]): T[] => {
        const kept: T[] = [];
        let remaining = MAX_SESSION_CHARS;
        for (const row of rows.slice(-MAX_SESSION_MESSAGES).reverse()) {
            if (remaining <= 0) break;
            const text = clean(row.text).slice(-remaining);
            kept.unshift({ ...row, text }); remaining -= text.length;
        }
        return kept;
    };
    return {
        id: raw.id, selectedModelId: raw.selectedModelId, interrupted: raw.interrupted === true,
        updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
        history: bound(raw.history.slice(-MAX_SESSION_MESSAGES).filter(row => row && ['user', 'assistant'].includes(row.role)
            && typeof row.text === 'string').map(row => ({ role: row.role, text: row.text }))),
        transcript: bound(raw.transcript.slice(-MAX_SESSION_MESSAGES).filter(row => row && ['user', 'assistant', 'error', 'info'].includes(row.role)
            && typeof row.text === 'string').map(row => ({ role: row.role, text: row.text,
                requestId: typeof row.requestId === 'string' ? row.requestId.slice(0, 256) : undefined,
                usage: typeof row.usage === 'string' ? clean(row.usage).slice(0, 2000) : undefined })))
    };
}

export function restoreChatArchive(value: unknown, workspace: string): SavedChatSession[] {
    if (!value || typeof value !== 'object') return [];
    const raw = value as { workspace?: unknown; sessions?: unknown };
    if (raw.workspace !== workspace || !Array.isArray(raw.sessions)) return [];
    const seen = new Set<string>();
    return raw.sessions.slice(0, MAX_SAVED_CHATS).map(normalizeChatSession)
        .filter((session): session is SavedChatSession => {
            if (!session || seen.has(session.id)) return false;
            seen.add(session.id); return true;
        });
}
