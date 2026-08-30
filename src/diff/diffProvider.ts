/**
 * Side-by-Side Visual Diff Provider
 * Renders a side-by-side diff comparing the original source code with its token-optimized AST skeleton.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AstPrunerEngine } from '../ast/pruner';
import { TokenCounter } from '../engine/tokenizer';

export class PrunedDiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly SCHEME = 'token-optimizer-pruned';
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    private contentMap = new Map<string, string>();

    constructor(private astEngine: AstPrunerEngine) {}

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contentMap.get(uri.toString()) || '// No pruned content generated.';
    }

    public setPrunedContent(uri: vscode.Uri, content: string): void {
        this.contentMap.set(uri.toString(), content);
        this.onDidChangeEmitter.fire(uri);
    }

    public static register(context: vscode.ExtensionContext, astEngine: AstPrunerEngine): PrunedDiffContentProvider {
        const provider = new PrunedDiffContentProvider(astEngine);
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider(PrunedDiffContentProvider.SCHEME, provider)
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('tokenOptimizer.comparePrunedDiff', async (fileUri?: vscode.Uri) => {
                let document: vscode.TextDocument | undefined;

                if (fileUri) {
                    document = await vscode.workspace.openTextDocument(fileUri);
                } else if (vscode.window.activeTextEditor) {
                    document = vscode.window.activeTextEditor.document;
                }

                if (!document) {
                    vscode.window.showWarningMessage('Open a source file to compare its token-optimized AST skeleton.');
                    return;
                }

                const originalCode = document.getText();
                const lang = document.languageId;
                const originalTokens = TokenCounter.countTokens(originalCode);
                const pruneResult = astEngine.pruneCodeContext(originalCode, lang);

                const fileName = path.basename(document.fileName);
                const virtualUri = vscode.Uri.parse(
                    `${PrunedDiffContentProvider.SCHEME}:/${fileName}?t=${Date.now()}`
                );

                provider.setPrunedContent(virtualUri, pruneResult.prunedCode);

                const title = `${fileName} (Original: ${originalTokens} tok ➔ Pruned: ${pruneResult.prunedTokenCount} tok | -${pruneResult.reductionPercentage}%)`;
                await vscode.commands.executeCommand('vscode.diff', document.uri, virtualUri, title);
            })
        );

        return provider;
    }
}
