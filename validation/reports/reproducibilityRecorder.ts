/**
 * Tokonomics Reproducibility & Environment Metadata Recorder
 * Captures all hardware, software, model, and dataset parameters required for certification-grade audits.
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface ReproducibilityMetadata {
    repositoryCommitSha: string;
    tokonomicsVersion: string;
    benchmarkDatasetVersion: string;
    modelProvider: string;
    modelVersion: string;
    temperature: number;
    maxOutputTokens: number;
    compilerFeatureFlags: Record<string, any>;
    operatingSystem: string;
    cpuModel: string;
    ramTotalGB: number;
    tokenizerVersion: string;
    pricingProfileVersion: string;
    benchmarkClassification: string;
    datasetMetadataSha256: string;
    timestamp: string;
}

export class ReproducibilityRecorder {
    public static captureMetadata(): ReproducibilityMetadata {
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
        const ramGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;

        const rootDir = process.cwd();
        const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'));
        const datasetPath = path.resolve(rootDir, 'validation', 'datasets', 'datasetMetadata.json');
        const datasetRaw = fs.readFileSync(datasetPath, 'utf8');
        const datasetMetadata = JSON.parse(datasetRaw);

        let repositoryCommitSha = 'unknown';
        try {
            repositoryCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd: rootDir,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
        } catch {
            // A source archive may not contain Git metadata; keep the limitation explicit.
        }

        const datasetMetadataSha256 = require('crypto')
            .createHash('sha256')
            .update(datasetRaw)
            .digest('hex');

        return {
            repositoryCommitSha,
            tokonomicsVersion: packageJson.version,
            benchmarkDatasetVersion: datasetMetadata.benchmarkVersion,
            modelProvider: 'none (controlled synthetic fixture)',
            modelVersion: 'not applicable',
            temperature: 0.0,
            maxOutputTokens: 4096,
            compilerFeatureFlags: {
                pipelineMode: 'compiler',
                governorEnabled: true,
                knapsackSolverEnabled: true,
                sdgSlicingEnabled: true,
                exactDedupEnabled: true,
                cachePlannerEnabled: true
            },
            operatingSystem: `${os.type()} ${os.release()} (${os.arch()})`,
            cpuModel,
            ramTotalGB: ramGB,
            tokenizerVersion: 'Tokonomics local estimator',
            pricingProfileVersion: 'synthetic-estimate-only',
            benchmarkClassification: datasetMetadata.classification,
            datasetMetadataSha256,
            timestamp: new Date().toISOString()
        };
    }
}
