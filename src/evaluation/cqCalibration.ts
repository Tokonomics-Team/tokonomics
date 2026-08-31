/**
 * Tokonomics Context Quality (CQ) Calibration & Predictive Accuracy Engine
 * Evaluates the mathematical correlation and calibration error between
 * predicted Context Quality (CQ) and observed downstream task success.
 */

export interface CQObservation {
    taskId: string;
    predictedCQ: number;         // 0.0 to 1.0
    taskSucceeded: boolean;      // 0 or 1
    evidenceCoverage: number;    // 0.0 to 1.0
    tokensUsed: number;
}

export interface CalibrationReport {
    totalObservations: number;
    brierScore: number;           // Mean squared error between predicted prob and binary outcome (0.0 is perfect)
    pearsonCorrelation: number;   // Linear correlation between CQ and success (-1.0 to +1.0)
    spearmanCorrelation: number;  // Rank correlation (-1.0 to +1.0)
    expectedCalibrationError: number; // ECE across probability bins (0.0 to 1.0)
    binAnalysis: { binRange: string; count: number; meanPredictedCQ: number; actualSuccessRate: number }[];
    isCalibrated: boolean;
}

export class CQCalibrationEvaluator {
    /**
     * Evaluates calibration metrics across a corpus of evaluated tasks
     */
    public static evaluateCalibration(observations: CQObservation[]): CalibrationReport {
        if (observations.length === 0) {
            return {
                totalObservations: 0,
                brierScore: 0,
                pearsonCorrelation: 0,
                spearmanCorrelation: 0,
                expectedCalibrationError: 0,
                binAnalysis: [],
                isCalibrated: false
            };
        }

        const n = observations.length;
        const cqValues = observations.map(o => o.predictedCQ);
        const yValues = observations.map(o => o.taskSucceeded ? 1 : 0);

        // 1. Brier Score: (1/N) * sum((CQ_i - y_i)^2)
        const brierScore = cqValues.reduce((sum, cq, i) => sum + Math.pow(cq - yValues[i], 2), 0) / n;

        // 2. Pearson Correlation
        const meanCQ = cqValues.reduce((a: number, b: number) => a + b, 0) / n;
        const meanY = yValues.reduce((a: number, b: number) => a + b, 0) / n;

        let num = 0, denCQ = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const diffCQ = cqValues[i] - meanCQ;
            const diffY = yValues[i] - meanY;
            num += diffCQ * diffY;
            denCQ += diffCQ * diffCQ;
            denY += diffY * diffY;
        }
        const pearson = (denCQ > 0 && denY > 0) ? num / (Math.sqrt(denCQ) * Math.sqrt(denY)) : 0;

        // 3. Spearman Rank Correlation
        const rankCQ = this.computeRanks(cqValues);
        const rankY = this.computeRanks(yValues);
        let dSquaredSum = 0;
        for (let i = 0; i < n; i++) {
            dSquaredSum += Math.pow(rankCQ[i] - rankY[i], 2);
        }
        const spearman = 1 - (6 * dSquaredSum) / (n * (n * n - 1));

        // 4. Expected Calibration Error (ECE) over 5 equal bins [0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0]
        const numBins = 5;
        const binAnalysis: { binRange: string; count: number; meanPredictedCQ: number; actualSuccessRate: number }[] = [];
        let totalWeightedEce = 0;

        for (let b = 0; b < numBins; b++) {
            const minBound = b / numBins;
            const maxBound = (b + 1) / numBins;
            const binItems = observations.filter(o => 
                b === numBins - 1 
                    ? o.predictedCQ >= minBound && o.predictedCQ <= maxBound 
                    : o.predictedCQ >= minBound && o.predictedCQ < maxBound
            );

            if (binItems.length > 0) {
                const meanPred = binItems.reduce((acc, it) => acc + it.predictedCQ, 0) / binItems.length;
                const actualSuccess = binItems.filter(it => it.taskSucceeded).length / binItems.length;
                const binEce = Math.abs(meanPred - actualSuccess);
                totalWeightedEce += (binItems.length / n) * binEce;

                binAnalysis.push({
                    binRange: `[${minBound.toFixed(1)} - ${maxBound.toFixed(1)}]`,
                    count: binItems.length,
                    meanPredictedCQ: Math.round(meanPred * 100) / 100,
                    actualSuccessRate: Math.round(actualSuccess * 100) / 100
                });
            }
        }

        return {
            totalObservations: n,
            brierScore: Math.round(brierScore * 1000) / 1000,
            pearsonCorrelation: Math.round(pearson * 1000) / 1000,
            spearmanCorrelation: Math.round(spearman * 1000) / 1000,
            expectedCalibrationError: Math.round(totalWeightedEce * 1000) / 1000,
            binAnalysis,
            isCalibrated: totalWeightedEce < 0.15 && pearson > 0.60
        };
    }

    private static computeRanks(arr: number[]): number[] {
        const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
        const ranks = new Array(arr.length);
        for (let r = 0; r < sorted.length; r++) {
            ranks[sorted[r].i] = r + 1;
        }
        return ranks;
    }
}
