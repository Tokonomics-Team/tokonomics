import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const evidence = require('../scripts/lib/certification-evidence');
const v7Baseline = require('../scripts/lib/v7-phase0-baseline');

export function runPhase0MeasurementTruthTests(): void {
    console.log('[Phase 0] Testing measurement truth and release-safety contracts...');
    const rootDir = process.cwd();

    const metadata = evidence.captureRepositoryMetadata(rootDir, null);
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: rootDir,
        encoding: 'utf8'
    }).trim();

    assert.strictEqual(metadata.repository.commitSha, expectedCommit,
        'Repository metadata must use the commit checked out at execution time');
    assert.strictEqual(metadata.package.version, packageJson.version,
        'Certification metadata must use the package version at execution time');
    assert.strictEqual(metadata.package.metadataConsistent, true,
        'package.json and package-lock.json root metadata must agree');
    assert.match(metadata.dataset.sha256, /^[0-9a-f]{64}$/,
        'Dataset metadata must have a reproducible SHA-256');
    assert.strictEqual(metadata.dataset.metadata.classification, 'Controlled Synthetic Benchmark');

    const scopePath = path.join(rootDir, 'validation', 'baselines', 'v7.0.1', 'phase0-scope.json');
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    const scopeValidation = v7Baseline.validateScopeManifest(rootDir, scope);
    assert.strictEqual(scopeValidation.valid, true, scopeValidation.errors.join('; '));
    assert.strictEqual(scope.targetRelease, '7.0.1');
    assert.strictEqual(scope.classification, v7Baseline.BASELINE_CLASSIFICATION);
    assert.ok(scope.auditFindings.some((finding: any) => finding.id === 'settings-runtime-mismatch' && finding.ownerPhase === 1));
    assert.ok(scope.auditFindings.some((finding: any) => finding.id === 'receipt-only-test-assertions' && finding.ownerPhase === 0));

    const firstBaseline = v7Baseline.captureBaseline(rootDir);
    const secondBaseline = v7Baseline.captureBaseline(rootDir);
    assert.strictEqual(firstBaseline.stableFingerprint, secondBaseline.stableFingerprint,
        'Stable baseline fingerprint must be repeatable for unchanged source');
    assert.match(firstBaseline.stableFingerprint, /^[0-9a-f]{64}$/);
    assert.strictEqual(firstBaseline.releaseCertified, false);
    assert.strictEqual(firstBaseline.classification, 'development-baseline-not-release-certification');
    assert.strictEqual(firstBaseline.metadata.package.version, packageJson.version);
    assert.match(firstBaseline.metadata.lockfileSha256, /^[0-9a-f]{64}$/);
    if (firstBaseline.metadata.bundle) {
        assert.match(firstBaseline.metadata.bundle.sha256, /^[0-9a-f]{64}$/);
    }
    assert.ok(firstBaseline.inventory.entryPoints.chatParticipants.includes('token-optimizer-participant'));
    assert.ok(firstBaseline.inventory.entryPoints.languageModelProviders.includes('tokonomics'));
    assert.ok(firstBaseline.inventory.entryPoints.commands.includes('tokenOptimizer.showDashboard'));
    assert.strictEqual(firstBaseline.inventory.components.length, 29);
    assert.strictEqual(firstBaseline.inventory.publicSettings.length, 4,
        'The current inventory must reflect the completed Phase 1 four-setting surface');
    const frozenPhase0 = JSON.parse(fs.readFileSync(
        path.join(rootDir, 'validation', 'reports', 'v7.0.1-phase0-baseline.json'), 'utf8'
    ));
    assert.ok(frozenPhase0.inventory.publicSettings.length > 5,
        'The frozen Phase 0 evidence must retain the pre-Phase 1 oversized settings baseline');
    assert.ok(firstBaseline.inventory.resources.timers.length > 0);
    assert.ok(firstBaseline.inventory.resources.workers.length > 0);
    // Every tracked upstream send must sit at a permitted site. Enumerating the sites is stricter
    // than counting them: a send introduced anywhere else fails even if the total happens to match.
    // providerGateway.ts is the single UPSTREAM egress boundary. chatSessionController.ts sends only
    // to Tokonomics' own proxy model, which re-enters that same gateway, so it is not a second
    // upstream path; the security suite additionally proves it can target no other vendor.
    const PERMITTED_OUTBOUND_SEND_SITES = new Set([
        'src/protocol/providerGateway.ts',
        'src/ui/chatSessionController.ts'
    ]);
    const outboundSites = firstBaseline.inventory.resources.outboundModelCalls
        .map((location: { path: string }) => location.path.replace(/[^A-Za-z0-9_./-]/g, '/'));
    for (const site of outboundSites) {
        assert.ok(PERMITTED_OUTBOUND_SEND_SITES.has(site),
            `Unapproved upstream send site introduced: ${site}`);
    }
    assert.strictEqual(outboundSites.filter((site: string) => site === 'src/protocol/providerGateway.ts').length, 1,
        'Phase 2 must consolidate every tracked upstream send behind exactly one canonical gateway site');
    const providerGateway = fs.readFileSync(path.join(rootDir, 'src', 'protocol', 'providerGateway.ts'), 'utf8');
    assert.strictEqual((providerGateway.match(/\.sendRequest\s*\(/g) || []).length, 1);

    const repeatableMeasurement = {
        filesIndexed: 250, criticalEvidenceRecall: 1, preservationRate: 1,
        originalTokens: 30, optimizedTokens: 30, coldCompileLatencyMs: 10,
        warmCompileLatencyMs: 2, indexBuildLatencyMs: 100, indexRebuildLatencyMs: 90,
        retrievalLatencyMs: 0.1, eventLoopDelayMs: 5, heapDeltaBytes: 1024, rssDeltaBytes: 2048,
        peakQueueDepth: 1, projectedCostSavedUsd: 0
    };
    assert.strictEqual(v7Baseline.validateMeasurement(repeatableMeasurement, scope.metricContract).valid, true);
    assert.strictEqual(v7Baseline.validateMeasurement(
        { ...repeatableMeasurement, preservationRate: 2 }, scope.metricContract
    ).valid, false, 'Out-of-domain semantic metrics must be rejected');
    assert.strictEqual(v7Baseline.compareMeasurementRuns(
        repeatableMeasurement,
        { ...repeatableMeasurement, coldCompileLatencyMs: 20, heapDeltaBytes: 4096 },
        scope.metricContract.repeatTolerance
    ).passed, true);
    assert.strictEqual(v7Baseline.compareMeasurementRuns(
        repeatableMeasurement,
        { ...repeatableMeasurement, criticalEvidenceRecall: 0 },
        scope.metricContract.repeatTolerance
    ).passed, false, 'Semantic baseline drift must fail repeatability');

    const hashTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokonomics-phase0-hash-'));
    try {
        fs.writeFileSync(path.join(hashTemp, 'fixture.txt'), 'version-one');
        const before = v7Baseline.hashFileSet(hashTemp, ['fixture.txt']).sha256;
        fs.writeFileSync(path.join(hashTemp, 'fixture.txt'), 'version-two');
        const after = v7Baseline.hashFileSet(hashTemp, ['fixture.txt']).sha256;
        assert.notStrictEqual(before, after, 'Changing a fixture must invalidate its fingerprint');
    } finally {
        fs.rmSync(hashTemp, { recursive: true, force: true });
    }

    const classifiedStatus = evidence.classifyRepositoryStatus([
        ' M validation/reports/first-generated-report.json',
        '?? validation/results/new-evidence.json',
        ' M src/extension.ts'
    ].join('\n'));
    assert.deepStrictEqual(classifiedStatus.generatedEvidenceStatus, [
        ' M validation/reports/first-generated-report.json',
        '?? validation/results/new-evidence.json'
    ], 'Generated evidence must be classified correctly even when it is the first porcelain entry');
    assert.deepStrictEqual(classifiedStatus.sourceStatus, [' M src/extension.ts']);

    const windowsNpm = evidence.resolveCommand('npm', ['test'], {
        platform: 'win32',
        npmExecPath: 'C:\\node\\npm-cli.js',
        nodeExecPath: 'C:\\node\\node.exe'
    });
    assert.deepStrictEqual(windowsNpm, {
        command: 'C:\\node\\node.exe',
        args: ['C:\\node\\npm-cli.js', 'test']
    }, 'Windows npm gates must use the npm JavaScript CLI rather than spawning npm.cmd');

    const registryResult = evidence.validateClaimRegistry(
        rootDir,
        path.join(rootDir, 'validation', 'claims', 'claim-registry.json')
    );
    assert.strictEqual(registryResult.valid, true, registryResult.errors.join('; '));
    assert.ok(registryResult.registry.claims.some((claim: any) => claim.status === 'unverified'),
        'The registry must expose unresolved claims rather than silently treating all claims as verified');
    assert.ok(registryResult.registry.claims.some((claim: any) =>
        claim.status === 'unverified' && claim.publicLocations.length === 0),
    'Unverified claims may remain auditable without being repeated in public release material');
    assert.ok(registryResult.registry.claims.some((claim: any) => claim.status === 'retired'),
        'Retired certification claims must remain auditable');

    const passingGates = [{
        id: 'test',
        description: 'test gate',
        required: true,
        command: 'test',
        startedAt: new Date(0).toISOString(),
        durationMs: 1,
        exitCode: 0,
        status: 'passed',
        error: null,
        stdoutTail: '',
        stderrTail: ''
    }];

    const cleanMetadata = {
        ...metadata,
        repository: { ...metadata.repository, clean: true, status: [] }
    };
    const cleanReport = evidence.createCertificationReport(cleanMetadata, passingGates);
    assert.strictEqual(cleanReport.decision, 'VALIDATION_PASSED_NOT_RELEASE_CERTIFIED');
    assert.strictEqual(cleanReport.releaseCertified, false,
        'A passing repository validation must not imply installed-extension certification');

    const dirtyReport = evidence.createCertificationReport({
        ...metadata,
        repository: { ...metadata.repository, clean: false, status: [' M example.ts'] }
    }, passingGates);
    assert.strictEqual(dirtyReport.decision, 'VALIDATION_PASSED_DIRTY_WORKTREE');

    const failedReport = evidence.createCertificationReport(cleanMetadata, [{
        ...passingGates[0],
        exitCode: 1,
        status: 'failed'
    }]);
    assert.strictEqual(failedReport.decision, 'VALIDATION_FAILED');
    assert.strictEqual(failedReport.summary.allRequiredGatesPassed, false);

    const markdown = evidence.renderMarkdownReport(cleanReport);
    assert.match(markdown, /Release certified: \*\*No\*\*/);
    assert.match(markdown, /controlled synthetic benchmarks/i);
    assert.doesNotMatch(markdown, /CERTIFIED FOR WORLDWIDE PRODUCTION/i);

    const activeCertificationSource = [
        fs.readFileSync(path.join(rootDir, 'scripts', 'certify.js'), 'utf8'),
        fs.readFileSync(path.join(rootDir, 'scripts', 'certify-deep.js'), 'utf8')
    ].join('\n');
    assert.doesNotMatch(activeCertificationSource, /releaseDecision\s*:\s*['"]CERTIFIED/i);
    assert.doesNotMatch(activeCertificationSource, /allGatesPassed\s*:\s*true/i);
    assert.doesNotMatch(activeCertificationSource, /totalTestSuites\s*:\s*\d+/i);

    const methodology = fs.readFileSync(
        path.join(rootDir, 'validation', 'reports', 'benchmark-methodology.md'),
        'utf8'
    );
    assert.match(methodology, /predetermined fixed or buggy patches/i);
    assert.match(methodology, /do not invoke an upstream model/i);
    assert.match(methodology, /model task-success uplift/i);

    const reproducibilitySource = fs.readFileSync(
        path.join(rootDir, 'validation', 'reports', 'reproducibilityRecorder.ts'),
        'utf8'
    );
    assert.doesNotMatch(reproducibilitySource,
        /repositoryCommitSha\s*:\s*['"][0-9a-f]{7,40}['"]/i,
        'Reproducibility metadata must not contain a fixed commit SHA');

    const plan = fs.readFileSync(path.join(rootDir, 'PHASE_V7.0.1_FINAL_IMPLEMENTATION_PLAN.md'), 'utf8');
    assert.match(plan, /final master development plan/i);
    assert.match(plan, /audits do not create another overhaul plan/i);

    console.log('[Phase 0] Measurement-truth contracts passed.');
}
