'use strict';

const fs = require('fs');
const path = require('path');
const {
    captureRepositoryMetadata,
    createCertificationReport,
    runGate,
    writeCertificationReport
} = require('./lib/certification-evidence');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const artifactPath = path.join(rootDir, `${packageJson.name}-${packageJson.version}.vsix`);
const deepMode = process.argv.includes('--deep');

function buildGates() {
    const gates = [
        {
            id: 'phase0-integrity',
            description: 'Measurement-truth, claim-registry, provenance, and metadata checks',
            command: process.execPath,
            args: ['scripts/verify-phase0.js'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'typescript',
            description: 'Strict TypeScript compilation',
            command: 'npm',
            args: ['run', 'compile', '--', '--pretty', 'false'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'automated-tests',
            description: 'Repository automated test suite',
            command: 'npm',
            args: ['test'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'production-bundle',
            description: 'Production extension bundle',
            command: 'npm',
            args: ['run', 'package'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'vsix-package',
            description: 'Create the exact VSIX artifact to be inspected',
            command: 'npm',
            args: ['run', 'vsce:package'],
            required: true,
            inheritOutput: true
        }
    ];

    if (deepMode) {
        gates.push({
            id: 'synthetic-validation',
            description: 'Controlled synthetic validation (not model task-success evidence)',
            command: 'npm',
            args: ['run', 'validate:all'],
            required: false,
            inheritOutput: true
        });
    }

    return gates;
}

async function main() {
    console.log('Tokonomics evidence-derived development validation');
    console.log('No release decision is pre-populated; every gate below is executed now.\n');

    // Capture source provenance before report generation changes tracked report files.
    const sourceMetadata = captureRepositoryMetadata(rootDir, null);
    const gates = [];

    for (const gate of buildGates()) {
        console.log(`\n[gate:${gate.id}] ${gate.description}`);
        const result = runGate(rootDir, gate);
        gates.push(result);
        console.log(`[gate:${gate.id}] ${result.status.toUpperCase()} (${result.durationMs} ms)`);
        if (result.required && result.status !== 'passed') {
            console.error(`Required gate failed: ${gate.id}`);
            break;
        }
    }

    const artifactMetadata = captureRepositoryMetadata(rootDir, artifactPath);
    const metadata = {
        ...sourceMetadata,
        artifact: artifactMetadata.artifact
    };
    const report = createCertificationReport(metadata, gates, {
        mode: deepMode ? 'deep' : 'standard'
    });
    const paths = writeCertificationReport(rootDir, report);

    console.log(`\nDecision: ${report.decision}`);
    console.log('Release certified: no');
    console.log(`JSON: ${paths.jsonPath}`);
    console.log(`Markdown: ${paths.markdownPath}`);

    if (!report.summary.allRequiredGatesPassed) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('Development validation failed unexpectedly:', error);
    process.exitCode = 1;
});
