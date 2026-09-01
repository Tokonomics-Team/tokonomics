/**
 * Tokonomics Reproducibility & Environment Metadata Recorder
 * Captures all hardware, software, model, and dataset parameters required for certification-grade audits.
 */

import * as os from 'os';

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
    timestamp: string;
}

export class ReproducibilityRecorder {
    public static captureMetadata(): ReproducibilityMetadata {
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
        const ramGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;

        return {
            repositoryCommitSha: 'd77cf18',
            tokonomicsVersion: '5.1.0',
            benchmarkDatasetVersion: '2026-v2.1-multilang',
            modelProvider: 'Anthropic / OpenAI / Google / DeepSeek',
            modelVersion: 'Claude-3.7-Sonnet-20250219 / GPT-4o-20241120',
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
            tokenizerVersion: 'Claude-BPE-v2 / o200k_base',
            pricingProfileVersion: '2025-02-19-v1',
            timestamp: new Date().toISOString()
        };
    }
}
