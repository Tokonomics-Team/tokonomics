import * as vscode from 'vscode';
import { SourcePolicyError, WorkspaceSourcePolicy } from '../security/sourcePolicy';

export interface ResolvedChatReferences { text: string; count: number; files: string[]; textCount: number; containsWorkspaceData: boolean; notices: string[]; }
const MAX_REFERENCES = 24;
const MAX_CONTEXT_CHARS = 200000;

/** Chat references contain values separately from prompt text; VS Code does not inline them. */
export async function resolveChatReferences(references: readonly vscode.ChatPromptReference[], options: {
    roots: string[]; trusted: boolean; enabled: boolean; includeUnsaved: boolean; token: vscode.CancellationToken;
}): Promise<ResolvedChatReferences> {
    const result: ResolvedChatReferences = { text: '', count: 0, files: [], textCount: 0, containsWorkspaceData: false, notices: [] };
    const seen = new Set<string>();
    const policy = new WorkspaceSourcePolicy(options.roots, options.trusted, 1024 * 1024);
    for (const reference of references.slice(0, MAX_REFERENCES)) {
        if (options.token.isCancellationRequested) throw new Error('CANCELLED');
        const value: any = reference.value;
        let content = '', label = 'Attached text', workspace = false;
        if (!options.enabled || !options.trusted) { result.notices.push('Attachments were not read because workspace context is disabled or the workspace is untrusted.'); break; }
        try {
            if (typeof value === 'string') {
                content = value;
            } else {
                const uri = value?.uri ?? value;
                if (uri?.scheme !== 'file' || typeof uri.fsPath !== 'string') {
                    result.notices.push('An attachment type could not be forwarded. Attach a text file or code selection.'); continue;
                }
                const allowed = policy.assertReadable(uri.fsPath);
                const document = await vscode.workspace.openTextDocument(uri);
                if (document.isDirty && !options.includeUnsaved) {
                    result.notices.push('An attached file has unsaved changes. Save it or enable Include Unsaved Changes.'); continue;
                }
                const range = value?.uri ? value.range : undefined;
                if (range && (!Number.isSafeInteger(range.start?.line) || !Number.isSafeInteger(range.end?.line)
                    || range.start.line < 0 || range.end.line < range.start.line)) {
                    result.notices.push('An attachment has an invalid selection range.'); continue;
                }
                content = document.getText(range);
                label = `<workspace>/${allowed.displayPath}` + (range ? ` (lines ${range.start.line + 1}–${range.end.line + 1})` : '');
                workspace = true;
            }
            const key = JSON.stringify([label, content]);
            if (seen.has(key) || !content.trim()) continue;
            seen.add(key);
            const section = `\n\nAttached context ${result.count + 1}: ${label}\n${JSON.stringify({ text: content })}`;
            if (result.text.length + section.length > MAX_CONTEXT_CHARS) {
                result.notices.push('Attached context exceeds the 200,000-character limit. Attach fewer files or narrower selections.'); continue;
            }
            result.text += section; result.count++; result.containsWorkspaceData ||= workspace;
            if (workspace) result.files.push(label); else result.textCount++;
        } catch (error) {
            result.notices.push(error instanceof SourcePolicyError && error.code === 'NOT_FILE'
                ? 'Folder attachments need Automatic workspace context; attach individual source files in Selection mode.'
                : 'An attachment could not be read under the workspace source policy. Check that it is a saved, allowed text file within this workspace.');
        }
    }
    if (references.length > MAX_REFERENCES) result.notices.push('Only the first 24 attachments were considered. Narrow the request.');
    result.notices = [...new Set(result.notices)];
    return result;
}

export function asksForWorkspaceSource(prompt: string): boolean {
    return !/```[\s\S]+```/.test(prompt) && /\b(?:codebase|workspace|repository|(?:this|my|our|the|current|entire|whole|local)\s+(?:(?:current|entire|whole|local|existing)\s+)?(?:code|file|project|extension|function|class|repo)|extension\s+source)\b/i.test(prompt);
}
