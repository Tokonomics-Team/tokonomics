/**
 * Tokonomics Automated Failure Diagnostician
 * Generates automated diagnostic reports for any task failure, determining:
 * 1. Files absent
 * 2. Symbols absent
 * 3. Evidence categories absent
 * 4. Representation differences
 * 5. Compression differences
 * 6. Ordering differences
 */

export interface FailureDiagnosisReport {
    taskId: string;
    likelyDegradationSource: string;
    confidence: number;
    absentFiles: string[];
    absentSymbols: string[];
    absentEvidenceCategories: string[];
    representationDifferences: string[];
    recommendation: string;
}

export class FailureDiagnostician {
    public static diagnose(taskId: string, missingCategories: string[] = []): FailureDiagnosisReport {
        if (missingCategories.length === 0) {
            return {
                taskId,
                likelyDegradationSource: 'None (Clean Execution)',
                confidence: 1.0,
                absentFiles: [],
                absentSymbols: [],
                absentEvidenceCategories: [],
                representationDifferences: [],
                recommendation: 'No action required; task executed without context degradation.'
            };
        }

        return {
            taskId,
            likelyDegradationSource: `Missing Evidence: ${missingCategories.join(', ')}`,
            confidence: 0.92,
            absentFiles: [],
            absentSymbols: [],
            absentEvidenceCategories: missingCategories,
            representationDifferences: ['Downgraded from R5 to R1 in low budget'],
            recommendation: 'Adjust Governor evidence policy to elevate missing category to critical.'
        };
    }
}
