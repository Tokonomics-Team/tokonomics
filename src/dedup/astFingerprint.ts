/**
 * Tokonomics AST Structural Fingerprint Deduplication Engine
 * Identifies isomorphic code blocks that share identical syntactic structure despite variable renaming or formatting.
 */

export interface AstFingerprintResult {
    fingerprint: string;
    normalizedStructure: string;
}

export class AstFingerprintEngine {
    /**
     * Generates a structural fingerprint of code by masking identifiers, string literals, and numbers
     */
    public generateFingerprint(code: string): AstFingerprintResult {
        let structure = code
            // Strip comments
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Normalize strings and numbers
            .replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, 'STR')
            .replace(/\b[0-9]+\b/g, 'NUM')
            // Mask variable names and keywords
            .replace(/\b(const|let|var|function|class|interface|type|return|if|else|for|while|import|export|from|async|await)\b/g, '$1')
            .replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, 'ID')
            // Collapse whitespaces
            .replace(/\s+/g, ' ')
            .trim();

        // 32-bit FNV hash of structure
        let hash = 0x811c9dc5;
        for (let i = 0; i < structure.length; i++) {
            hash ^= structure.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }

        return {
            fingerprint: (hash >>> 0).toString(16),
            normalizedStructure: structure
        };
    }

    public areIsomorphic(codeA: string, codeB: string): boolean {
        const fpA = this.generateFingerprint(codeA);
        const fpB = this.generateFingerprint(codeB);
        return fpA.fingerprint === fpB.fingerprint;
    }
}
