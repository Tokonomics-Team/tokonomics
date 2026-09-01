/**
 * Tokonomics Entity-Level Context Difference Inspector
 * Compares Baseline Context vs Tokonomics Context at the entity level:
 * Categorizes each entity as: ADDED, REMOVED, DOWNGRADED, COMPRESSED, or UNCHANGED.
 */

export type EntityDiffStatus = 'ADDED' | 'REMOVED' | 'DOWNGRADED' | 'COMPRESSED' | 'UNCHANGED';

export interface EntityDiffRecord {
    filePath: string;
    symbolName: string;
    evidenceCategory: string;
    baselineResolution: string;
    tokonomicsResolution: string;
    diffStatus: EntityDiffStatus;
    tokensSaved: number;
}

export interface ContextDiffSummary {
    totalEntitiesBaseline: number;
    totalEntitiesTokonomics: number;
    addedCount: number;
    removedCount: number;
    downgradedCount: number;
    compressedCount: number;
    unchangedCount: number;
    records: EntityDiffRecord[];
}

export class ContextDiffInspector {
    public static inspectDiff(
        baselineEntities: Array<{ file: string; symbol: string; cat: string; res: string; tokens: number }>,
        tokonomicsEntities: Array<{ file: string; symbol: string; cat: string; res: string; tokens: number }>
    ): ContextDiffSummary {
        const records: EntityDiffRecord[] = [];
        const tokMap = new Map<string, { file: string; symbol: string; cat: string; res: string; tokens: number }>();

        for (const t of tokonomicsEntities) {
            tokMap.set(`${t.file}:${t.symbol}`, t);
        }

        let addedCount = 0;
        let removedCount = 0;
        let downgradedCount = 0;
        let compressedCount = 0;
        let unchangedCount = 0;

        for (const b of baselineEntities) {
            const key = `${b.file}:${b.symbol}`;
            const t = tokMap.get(key);

            if (!t) {
                removedCount++;
                records.push({
                    filePath: b.file,
                    symbolName: b.symbol,
                    evidenceCategory: b.cat,
                    baselineResolution: b.res,
                    tokonomicsResolution: 'R_exclude',
                    diffStatus: 'REMOVED',
                    tokensSaved: b.tokens
                });
            } else if (t.res === b.res && t.tokens === b.tokens) {
                unchangedCount++;
                records.push({
                    filePath: b.file,
                    symbolName: b.symbol,
                    evidenceCategory: b.cat,
                    baselineResolution: b.res,
                    tokonomicsResolution: t.res,
                    diffStatus: 'UNCHANGED',
                    tokensSaved: 0
                });
            } else if (t.tokens < b.tokens && t.res === b.res) {
                compressedCount++;
                records.push({
                    filePath: b.file,
                    symbolName: b.symbol,
                    evidenceCategory: b.cat,
                    baselineResolution: b.res,
                    tokonomicsResolution: t.res,
                    diffStatus: 'COMPRESSED',
                    tokensSaved: b.tokens - t.tokens
                });
            } else {
                downgradedCount++;
                records.push({
                    filePath: b.file,
                    symbolName: b.symbol,
                    evidenceCategory: b.cat,
                    baselineResolution: b.res,
                    tokonomicsResolution: t.res,
                    diffStatus: 'DOWNGRADED',
                    tokensSaved: b.tokens - t.tokens
                });
            }
        }

        return {
            totalEntitiesBaseline: baselineEntities.length,
            totalEntitiesTokonomics: tokonomicsEntities.length,
            addedCount,
            removedCount,
            downgradedCount,
            compressedCount,
            unchangedCount,
            records
        };
    }
}
