'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    captureRepositoryMetadata,
    validateClaimRegistry
} = require('./lib/certification-evidence');
const {
    BASELINE_CLASSIFICATION,
    captureBaseline,
    validateScopeManifest
} = require('./lib/v7-phase0-baseline');

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

    check('v7.0.1 final plan is authoritative and phase-gated', () => {
        const roadmap = read('PHASE_V7.0.1_FINAL_IMPLEMENTATION_PLAN.md');
        assert.match(roadmap, /final master development plan/i);
        assert.match(roadmap, /supersedes all\s+earlier modernization roadmaps/i);
        assert.match(roadmap, /wait for explicit repository-owner approval/i);
        assert.match(roadmap, /## Phase 11 - Production hardening and v7\.0\.1 release certification/);
    });

    check('v7.0.1 fixture, metric, reachability, and finding scope is complete', () => {
        const scope = JSON.parse(read('validation/baselines/v7.0.1/phase0-scope.json'));
        const result = validateScopeManifest(rootDir, scope);
        assert.strictEqual(result.valid, true, result.errors.join('; '));
        assert.strictEqual(scope.classification, BASELINE_CLASSIFICATION);
        assert.ok(scope.fixtureSets.length >= 5);
        assert.ok(scope.auditFindings.length >= 29);
        assert.deepStrictEqual(new Set(scope.auditFindings.map(item => item.id)).size, scope.auditFindings.length);
        assert.ok(scope.reachabilityProbes.some(probe => probe.entryPoint === 'chat-participant'));
        assert.ok(scope.reachabilityProbes.some(probe => probe.entryPoint === 'language-model-provider'));
        assert.ok(scope.reachabilityProbes.some(probe => probe.entryPoint === 'installed-vsix'));
    });

    check('v7.0.1 structural baseline is deterministic within one source state', () => {
        const first = captureBaseline(rootDir);
        const second = captureBaseline(rootDir);
        assert.strictEqual(first.stableFingerprint, second.stableFingerprint);
        assert.match(first.stableFingerprint, /^[0-9a-f]{64}$/);
        assert.strictEqual(first.classification, BASELINE_CLASSIFICATION);
        assert.strictEqual(first.releaseCertified, false);
        assert.ok(first.inventory.entryPoints.commands.length > 0);
        assert.ok(first.inventory.components.length > 0);
        assert.ok(first.inventory.resources.outboundModelCalls.length > 0);
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
        assert.match(status, /v7\.0\.1 Phase 0 baseline/i);
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
