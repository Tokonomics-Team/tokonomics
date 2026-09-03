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
const releaseMode = process.argv.includes('--release');

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
        },
        {
            id: 'vsix-integrity',
            description: 'Inspect packaged trust metadata and compile every shipped parser WASM',
            command: process.execPath,
            args: ['scripts/verify-vsix.js'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'supply-chain',
            description: 'Generate CycloneDX SBOM and artifact-bound provenance',
            command: process.execPath,
            args: ['scripts/generate-supply-chain.js'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'extension-host-matrix',
            description: releaseMode ? 'Install and test exact VSIX on minimum, stable, and Insiders hosts' : 'Install and test exact VSIX on the local stable host',
            command: process.execPath,
            args: ['scripts/run-extension-host-matrix.js', releaseMode ? '--all' : '--local'],
            required: true,
            inheritOutput: true
        },
        {
            id: 'dependency-audit',
            description: 'Registry-backed dependency vulnerability audit',
            command: 'npm',
            args: ['audit', '--audit-level=moderate'],
            required: true,
            inheritOutput: true
        }
    ];

    if (deepMode || releaseMode) {
        gates.push({
            id: 'clean-room-audit',
            description: 'Controlled differential, oracle, mutation, and adversarial audit',
            command: 'npm',
            args: ['run', 'audit:clean-room'],
            required: releaseMode,
            inheritOutput: true
        });
    }

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
    const requiredPassed = gates.filter(gate => gate.required).every(gate => gate.status === 'passed');
    const decision = !requiredPassed ? 'ARTIFACT_VALIDATION_FAILED'
        : !metadata.package.metadataConsistent ? 'ARTIFACT_VALIDATION_FAILED_METADATA_MISMATCH'
        : !metadata.repository.clean ? 'ARTIFACT_VALIDATION_PASSED_DIRTY_SOURCE'
        : releaseMode ? 'ARTIFACT_CERTIFIED_AWAITING_HUMAN_RELEASE_APPROVAL' : 'LOCAL_ARTIFACT_VALIDATION_PASSED_MATRIX_INCOMPLETE';
    const report = createCertificationReport(metadata, gates, {
        mode: releaseMode ? 'release-matrix' : deepMode ? 'deep' : 'standard',
        classification: 'artifact-certification',
        decision,
        limitations: releaseMode
            ? [
                'Passing artifact gates does not authorize publication; release remains a human decision.',
                'Account-backed provider availability, billing, and upstream model quality are environment-dependent.',
                'Controlled synthetic benchmarks do not establish production task-success or savings claims.'
            ]
            : [
                'Only the locally installed stable host was executed; minimum and Insiders remain required release gates.',
                'Account-backed provider availability, billing, and upstream model quality were not certified.',
                'Controlled synthetic benchmarks do not establish production task-success or savings claims.'
            ]
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
