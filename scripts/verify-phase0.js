'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    captureRepositoryMetadata,
    validateClaimRegistry
} = require('./lib/certification-evidence');

const rootDir = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function verify() {
    const errors = [];
    const check = (name, fn) => {
        try {
            fn();
            console.log(`PASS ${name}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${name}: ${message}`);
            console.error(`FAIL ${name}: ${message}`);
        }
    };

    check('roadmap exists and requires approval between phases', () => {
        const roadmap = read('MODERNIZATION_ROADMAP.md');
        assert.match(roadmap, /explicit owner approval/i);
        assert.match(roadmap, /Phase 10 - Evaluated state-of-the-art experiments/);
    });

    check('package and lockfile root metadata agree', () => {
        const metadata = captureRepositoryMetadata(rootDir, null);
        assert.strictEqual(metadata.package.metadataConsistent, true,
            `${metadata.package.name}@${metadata.package.version} != ${metadata.package.lockName}@${metadata.package.lockVersion}`);
    });

    check('claim registry is structurally valid', () => {
        const result = validateClaimRegistry(
            rootDir,
            path.join(rootDir, 'validation', 'claims', 'claim-registry.json')
        );
        assert.strictEqual(result.valid, true, result.errors.join('; '));
    });

    check('active certification entry points are evidence-derived', () => {
        const activeSources = [
            read('scripts/certify.js'),
            read('scripts/certify-deep.js'),
            read('scripts/validate.js'),
            read('scripts/validate-all.js'),
            read('scripts/clean-room-audit.js'),
            read('scripts/run-benchmark.js'),
            read('validation/reports/reportGenerator.ts'),
            read('validation/reports/finalIndependentAuditGenerator.ts')
        ].join('\n');
        const forbidden = [
            /CERTIFIED FOR WORLDWIDE PRODUCTION/i,
            /releaseDecision\s*:\s*["']CERTIFIED/i,
            /APPROVED_FOR_GLOBAL_ROLLOUT/i,
            /allGatesPassed\s*:\s*true/i,
            /totalTestSuites\s*:\s*\d+/i,
            /repositoryCommitSha\s*:\s*["'][0-9a-f]{7,40}["']/i
        ];
        for (const pattern of forbidden) {
            assert.doesNotMatch(activeSources, pattern);
        }
        assert.match(activeSources, /createCertificationReport/);
    });

    check('dataset discloses controlled synthetic classification', () => {
        const metadata = JSON.parse(read('validation/datasets/datasetMetadata.json'));
        assert.strictEqual(metadata.classification, 'Controlled Synthetic Benchmark');
        assert.match(metadata.classificationRationale, /programmatically verified|synthetic|deterministic/i);
    });

    check('legacy report limitations are prominent', () => {
        const status = read('validation/reports/README.md');
        assert.match(status, /historical\s+development artifacts/i);
        assert.match(status, /not release certificates/i);
        assert.match(status, /predetermined corpus fixtures/i);
    });

    check('reproducibility recorder does not contain a fixed commit SHA', () => {
        const source = read('validation/reports/reproducibilityRecorder.ts');
        assert.doesNotMatch(source, /repositoryCommitSha\s*:\s*["'][0-9a-f]{7,40}["']/i);
    });

    if (errors.length > 0) {
        console.error(`\nPhase 0 integrity failed with ${errors.length} error(s).`);
        process.exitCode = 1;
        return;
    }

    console.log('\nPhase 0 integrity checks passed.');
}

verify();
