import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const evidence = require('../scripts/lib/certification-evidence');

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

    console.log('[Phase 0] Measurement-truth contracts passed.');
}
