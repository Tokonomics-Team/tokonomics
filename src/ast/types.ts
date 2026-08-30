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
