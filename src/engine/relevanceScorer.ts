/**
 * Tab/File Relevance Scorer v3.0
 * 
 * Scores each open editor tab on a 0-100 relevance scale using:
 *   - Import relationship to the active file (40%)
 *   - Edit recency (25%)
 *   - PageRank score from RepoMapEngine (20%)
 *   - Path proximity — same directory = higher relevance (15%)
 * 
 * Files scoring below a configurable threshold are auto-excluded from context packing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TokenCounter } from './tokenizer';

export interface FileRelevanceScore {
    filePath: string;
    fileName: string;
    score: number;              // 0-100
    importScore: number;        // 0-100 (weighted 40%)
    recencyScore: number;       // 0-100 (weighted 25%)
    pageRankScore: number;      // 0-100 (weighted 20%)
    proximityScore: number;     // 0-100 (weighted 15%)
    isRelevant: boolean;        // score >= threshold
}

export interface RelevanceScoringResult {
    scores: FileRelevanceScore[];
    relevantFiles: string[];
    excludedFiles: string[];
    threshold: number;
}

// Common import/require patterns across languages
const IMPORT_PATTERNS = [
    /import\s+.*?from\s+['"]([^'"]+)['"]/g,           // ES6 import
    /import\s+['"]([^'"]+)['"]/g,                       // side-effect import
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,            // CommonJS require
    /from\s+(\S+)\s+import/g,                           // Python from X import
    /import\s+"([^"]+)"/g,                               // Go import
    /use\s+(\S+);/g,                                    // Rust use
    /#include\s+[<"]([^>"]+)[>"]/g,                      // C/C++ include
];

export class RelevanceScorer {
    /**
     * Score a set of open files relative to the currently active file.
     */
    public static scoreFiles(
        activeFilePath: string,
        openFilePaths: string[],
        pageRankScores: Map<string, number>,
        threshold: number = 20
    ): RelevanceScoringResult {
        const scores: FileRelevanceScore[] = [];
        const activeDir = path.dirname(activeFilePath);
        const activeName = path.basename(activeFilePath, path.extname(activeFilePath));

        // Extract imports from the active file
        const activeImports = this.extractImports(activeFilePath);

        for (const filePath of openFilePaths) {
            if (filePath === activeFilePath) continue; // Skip the active file itself

            const fileName = path.basename(filePath);
            const fileDir = path.dirname(filePath);
            const fileBaseName = path.basename(filePath, path.extname(filePath));

            // 1. Import relationship score (40%)
            const importScore = this.calculateImportScore(
                activeImports, filePath, fileBaseName, activeFilePath
            );

            // 2. Edit recency score (25%) — based on file mtime
            const recencyScore = this.calculateRecencyScore(filePath);

            // 3. PageRank score (20%) — from existing RepoMapEngine
            const normalizedPR = pageRankScores.get(filePath) || 0;
            const pageRankScore = Math.min(100, Math.round(normalizedPR * 100));

            // 4. Path proximity score (15%)
            const proximityScore = this.calculateProximityScore(activeDir, fileDir);

            // Weighted composite
            const compositeScore = Math.round(
                importScore * 0.40 +
                recencyScore * 0.25 +
                pageRankScore * 0.20 +
                proximityScore * 0.15
            );

            scores.push({
                filePath,
                fileName,
                score: compositeScore,
                importScore,
                recencyScore,
                pageRankScore,
                proximityScore,
                isRelevant: compositeScore >= threshold
            });
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        return {
            scores,
            relevantFiles: scores.filter(s => s.isRelevant).map(s => s.filePath),
            excludedFiles: scores.filter(s => !s.isRelevant).map(s => s.filePath),
            threshold
        };
    }

    /**
     * Extract import/require paths from a source file.
     */
    private static extractImports(filePath: string): Set<string> {
        const imports = new Set<string>();
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            for (const pattern of IMPORT_PATTERNS) {
                // Reset lastIndex for each file
                const regex = new RegExp(pattern.source, pattern.flags);
                let match: RegExpExecArray | null;
                while ((match = regex.exec(content)) !== null) {
                    if (match[1]) {
                        // Normalize: strip leading ./ ../ and extensions
                        const normalized = match[1]
                            .replace(/^\.\//, '')
                            .replace(/\.\w+$/, '')
                            .split('/').pop() || match[1];
                        imports.add(normalized.toLowerCase());
                    }
                }
            }
        } catch {
            // File might not be readable
        }
        return imports;
    }

    /**
     * Score how strongly a file is imported by the active file.
     */
    private static calculateImportScore(
        activeImports: Set<string>,
        filePath: string,
        fileBaseName: string,
        activeFilePath: string
    ): number {
        // Direct import match
        if (activeImports.has(fileBaseName.toLowerCase())) {
            return 100;
        }

        // Check if active file is imported by this file (reverse dependency)
        const reverseImports = this.extractImports(filePath);
        const activeBaseName = path.basename(activeFilePath, path.extname(activeFilePath));
        if (reverseImports.has(activeBaseName.toLowerCase())) {
            return 70; // Reverse dependency is slightly less relevant
        }

        // Partial match on directory-based imports
        for (const imp of activeImports) {
            if (fileBaseName.toLowerCase().includes(imp) || imp.includes(fileBaseName.toLowerCase())) {
                return 50;
            }
        }

        return 0;
    }

    /**
     * Score based on how recently the file was modified (mtime).
     * Files modified in the last 5 minutes score 100, >1 hour scores 0.
     */
    private static calculateRecencyScore(filePath: string): number {
        try {
            const stat = fs.statSync(filePath);
            const ageMs = Date.now() - stat.mtimeMs;
            const ageMinutes = ageMs / (1000 * 60);

            if (ageMinutes < 5) return 100;
            if (ageMinutes < 15) return 80;
            if (ageMinutes < 30) return 60;
            if (ageMinutes < 60) return 40;
            if (ageMinutes < 120) return 20;
            return 5; // Very old, but still open — slight relevance
        } catch {
            return 10;
        }
    }

    /**
     * Score based on directory path proximity to the active file.
     * Same directory = 100, sibling directory = 70, deeper nesting = lower.
     */
    private static calculateProximityScore(activeDir: string, fileDir: string): number {
        if (activeDir === fileDir) return 100;

        const activeSegments = activeDir.split(path.sep);
        const fileSegments = fileDir.split(path.sep);

        // Count shared path segments
        let shared = 0;
        const maxLen = Math.min(activeSegments.length, fileSegments.length);
        for (let i = 0; i < maxLen; i++) {
            if (activeSegments[i] === fileSegments[i]) {
                shared++;
            } else {
                break;
            }
        }

        const totalSegments = Math.max(activeSegments.length, fileSegments.length);
        if (totalSegments === 0) return 0;

        const ratio = shared / totalSegments;
        return Math.round(ratio * 100);
    }
}
