import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/** A small, inert DOM description. No provider-supplied HTML or attributes cross the bridge. */
export interface ChatMarkdownNode {
    tag?: string;
    text?: string;
    children?: ChatMarkdownNode[];
    href?: string;
    start?: number;
    language?: string;
    align?: 'left' | 'center' | 'right';
}

const parserOptions = { html: false, linkify: false, typographer: false, maxNesting: 20 };
const parser = new MarkdownIt(parserOptions);
const allowedTags = new Set(['p', 'strong', 'em', 's', 'blockquote', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a']);

/** Parse CommonMark plus tables/strikethrough. Raw HTML and images remain inert text. */
export function renderChatMarkdown(text: string): ChatMarkdownNode[] {
    let remainingNodes = 12_000;
    function convert(tokens: Token[]): ChatMarkdownNode[] {
        const root: ChatMarkdownNode[] = [];
        const stack: ChatMarkdownNode[][] = [root];
        const push = (node: ChatMarkdownNode) => { if (--remainingNodes >= 0) stack[stack.length - 1].push(node); };
        for (const token of tokens) {
            if (remainingNodes <= 0) break;
            if (token.type === 'inline') { for (const node of convert(token.children || [])) push(node); }
            else if (token.type === 'fence' || token.type === 'code_block') {
                push({ tag: 'pre', text: token.content, language: token.info.trim().split(/\s+/)[0].slice(0, 40) });
            } else if (token.type === 'code_inline') push({ tag: 'code', text: token.content });
            else if (token.type === 'softbreak') push({ text: '\n' });
            else if (token.type === 'hardbreak') push({ tag: 'br' });
            else if (token.type === 'hr') push({ tag: 'hr' });
            else if (token.type === 'image') push({ text: token.content || '[Image]' });
            else if (token.nesting === 1) {
                const tag = allowedTags.has(token.tag) ? token.tag : 'span';
                const children: ChatMarkdownNode[] = [];
                const node: ChatMarkdownNode = { tag, children };
                if (tag === 'a') {
                    const href = token.attrGet('href') || '';
                    if (/^(https?:\/\/|mailto:)/i.test(href) && !/[\u0000-\u0020\u007f]/.test(href)) node.href = href;
                }
                if (tag === 'ol') {
                    const start = Number(token.attrGet('start') || '1');
                    if (Number.isSafeInteger(start) && start > 0) node.start = start;
                }
                const alignment = /^text-align:(left|center|right)$/.exec(token.attrGet('style') || '');
                if ((tag === 'th' || tag === 'td') && alignment) node.align = alignment[1] as 'left' | 'center' | 'right';
                push(node); stack.push(children);
            } else if (token.nesting === -1) { if (stack.length > 1) stack.pop(); }
            else push({ text: token.content });
        }
        return root;
    }
    try {
        const nodes = convert(parser.parse(text.slice(0, 200_000), {}));
        // Preserve all text rather than silently dropping it if pathological markup exceeds the DOM budget.
        return remainingNodes <= 0 ? [{ tag: 'pre', text: text.slice(0, 200_000) }] : nodes;
    } catch { return [{ tag: 'pre', text: text.slice(0, 200_000) }]; }
}
