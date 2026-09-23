'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
    captureBaseline,
    compareMeasurementRuns,
    renderBaselineMarkdown,
    validateMeasurement
} = require('./lib/v7-phase0-baseline');

const rootDir = path.resolve(__dirname, '..');
const scope = JSON.parse(fs.readFileSync(path.join(rootDir, 'validation', 'baselines', 'v7.0.1', 'phase0-scope.json'), 'utf8'));

function runMeasurement() {
    const output = execFileSync(process.execPath, ['scripts/run-v7-phase0-benchmark.js'], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return JSON.parse(output.split(/\r?\n/).filter(Boolean).pop());
}

function main() {
    const first = runMeasurement();
    const second = runMeasurement();
    for (const [index, measurement] of [first, second].entries()) {
        const validation = validateMeasurement(measurement, scope.metricContract);
        if (!validation.valid) throw new Error(`Phase 0 measurement run ${index + 1} invalid: ${validation.errors.join('; ')}`);
    }
    const reproducibility = compareMeasurementRuns(first, second, scope.metricContract.repeatTolerance);
    if (!reproducibility.passed) {
        throw new Error(`Phase 0 repeatability failed: ${reproducibility.failures.join('; ')}`);
    }
    const report = captureBaseline(rootDir, [first, second]);
    report.reproducibility = reproducibility;
    const reportsDir = path.join(rootDir, 'validation', 'reports');
    const jsonPath = path.join(reportsDir, 'v7.0.1-phase0-baseline.json');
    const markdownPath = path.join(reportsDir, 'v7.0.1-phase0-baseline.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(markdownPath, renderBaselineMarkdown(report), 'utf8');
    console.log(`Phase 0 baseline fingerprint: ${report.stableFingerprint}`);
    console.log(`Repeatability: PASS (${report.measurements.length} runs)`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${markdownPath}`);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
}
