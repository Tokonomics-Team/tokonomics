/**
 * Type definitions for AST structural pruner and multi-language engine
 */

export type SupportedLanguage = 
    | 'typescript' 
    | 'typescriptreact' 
    | 'javascript' 
    | 'javascriptreact' 
    | 'python' 
    | 'go' 
    | 'rust' 
    | 'java' 
    | 'csharp' 
    | 'c' 
    | 'cpp' 
    | 'php' 
    | 'sql' 
    | 'ruby'
    | 'generic';

export interface AstPrunerOptions {
    preserveComments?: boolean;
    preserveDocstrings?: boolean;
    stripDocstringExamples?: boolean;
    preserveExportedOnly?: boolean;
    customPlaceholder?: string;
    maxDepth?: number;
    referencedSymbols?: string[];
    structuralTier?: 'T0' | 'T1' | 'T2';
    bypassCache?: boolean;
}

export interface AstPruneResult {
    prunedCode: string;
    originalTokenCount: number;
    prunedTokenCount: number;
    reductionPercentage: number;
    language: SupportedLanguage;
    wasPruned: boolean;
    durationMs: number;
    extractedSymbolsCount?: number;
}

export interface CacheProvenanceVersions {
    SECURITY_POLICY_VERSION: string;
    SANITIZER_VERSION: string;
    AST_PRUNER_VERSION: string;
    PARSER_GRAMMAR_VERSION: string;
}

export const CACHE_PROVENANCE_VERSIONS: CacheProvenanceVersions = {
    SECURITY_POLICY_VERSION: '2026-09-v2',
    SANITIZER_VERSION: '2.1.0',
    AST_PRUNER_VERSION: '7.0.0',
    PARSER_GRAMMAR_VERSION: 'web-tree-sitter-0.3.1'
};
