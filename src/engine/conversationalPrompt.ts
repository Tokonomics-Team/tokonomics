/**
 * Tokonomics conversational-prompt detection.
 *
 * Some turns are not tasks. "Hi", "thanks", "ok" ask nothing of the workspace, and retrieving for
 * them is not merely wasted work - it changes the answer. Measured on this repository, "Hi" compiled
 * from 7 tokens to 514 and arrived carrying eight files, and the model opened by describing the
 * bundle it had been handed rather than saying hello. A context optimizer that inflates a greeting
 * seventy-fold, and derails it, is failing at its own purpose twice over.
 *
 * The rule is deliberately narrow, because the cost of the two mistakes is not symmetric. Skipping
 * retrieval on a real task produces a confidently uninformed answer; retrieving for a greeting wastes
 * a few hundred tokens. So this recognises only utterances that are unambiguously not tasks: short,
 * free of code, paths and questions, and composed entirely of known social tokens. Anything it does
 * not recognise - including every imperative, every question, and anything long enough to carry a
 * requirement - is treated as a task and retrieves normally.
 *
 * Pure module: no I/O, no VS Code, deterministic in its argument.
 */

/** Longest prompt considered. A real request that needs no context is still shorter than this. */
export const MAX_CONVERSATIONAL_CHARS = 40;

/**
 * Words a purely social turn can be made of.
 *
 * Every entry is a complete utterance or a filler around one. A word that could begin a request -
 * "run", "check", "show", "fix" - is deliberately absent.
 */
const SOCIAL_WORDS: ReadonlySet<string> = new Set([
    'hi', 'hii', 'hiya', 'hello', 'helo', 'hey', 'heya', 'yo', 'sup', 'howdy', 'greetings',
    'good', 'morning', 'afternoon', 'evening', 'night', 'gm', 'gn',
    'thanks', 'thank', 'you', 'thx', 'ty', 'tysm', 'cheers', 'appreciated', 'appreciate', 'it',
    'ok', 'okay', 'k', 'kk', 'cool', 'nice', 'great', 'awesome', 'perfect', 'lovely', 'excellent',
    'got', 'understood', 'noted', 'sure', 'yep', 'yeah', 'yes', 'no', 'nope', 'right',
    'bye', 'goodbye', 'cya', 'later', 'ciao', 'farewell', 'see', 'ya',
    'please', 'there', 'again', 'a', 'lot', 'much', 'welcome', 'np', 'sorry', 'hmm', 'wow',
    'and', 'to', 'the', 'me', 'my', 'friend', 'team', 'all', 'everyone', 'buddy', 'mate',
    'so', 'very', 'really', 'alright', 'indeed', 'fine',
    'say', 'says', 'saying', 'tell', 'greet'
]);

/**
 * True when the prompt is social filler rather than a request about anything.
 *
 * Never true for a prompt that carries code, a path, a question mark, or any word that is not
 * recognisably social, so a task cannot be mistaken for a greeting by being brief.
 */
export function isConversationalOnly(prompt: string): boolean {
    const trimmed = (prompt || '').trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CONVERSATIONAL_CHARS) return false;

    // A question is a request, however short. Code fences, paths, extensions, mentions and symbol
    // punctuation all mean the turn is about something concrete.
    if (/[?`~<>{}[\]()=/\\@#$*|]/.test(trimmed)) return false;
    if (/\d/.test(trimmed)) return false;

    // Emoji and other symbols are social; they are removed rather than counted as words.
    const words = trimmed
        .toLowerCase()
        .replace(/[^a-z\s'-]+/g, ' ')
        .split(/\s+/)
        .map(word => word.replace(/^['-]+|['-]+$/g, ''))
        .filter(Boolean);

    // Punctuation or emoji alone - "👋", "!!" - is social, and asks for nothing.
    if (words.length === 0) return true;
    if (words.length > 6) return false;
    return words.every(word => SOCIAL_WORDS.has(word));
}
