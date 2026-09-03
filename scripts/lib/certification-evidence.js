'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLAIM_STATUSES = new Set([
    'verified',
    'qualified',
    'experimental',
    'unverified',
    'retired'
]);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function git(rootDir, args, fallback = 'unknown') {
    try {
        return execFileSync('git', args, {
            cwd: rootDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trimEnd();
    } catch {
        return fallback;
    }
}

function classifyRepositoryStatus(rawStatus) {
    const statusEntries = rawStatus === '' ? [] : rawStatus.split(/\r?\n/).filter(Boolean);
    const isGeneratedEvidence = entry => {
        const file = entry.slice(3).replace(/\\/g, '/');
        return (/^validation\/reports\/.*\.(?:json|md)$/i.test(file) && !file.endsWith('/README.md'))
            || /^validation\/results\/.*\.json$/i.test(file);
    };

    return {
        sourceStatus: statusEntries.filter(entry => !isGeneratedEvidence(entry)),
        generatedEvidenceStatus: statusEntries.filter(isGeneratedEvidence)
    };
}

function captureRepositoryMetadata(rootDir, artifactPath) {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageLockPath = path.join(rootDir, 'package-lock.json');
    const datasetMetadataPath = path.join(rootDir, 'validation', 'datasets', 'datasetMetadata.json');
    const packageJson = readJson(packageJsonPath);
    const packageLock = readJson(packageLockPath);
    const lockRoot = packageLock.packages && packageLock.packages['']
        ? packageLock.packages['']
        : {};
    const rawStatus = git(rootDir, ['status', '--porcelain'], 'unavailable');
    const { sourceStatus, generatedEvidenceStatus } = classifyRepositoryStatus(rawStatus);
    const artifactExists = Boolean(artifactPath && fs.existsSync(artifactPath));

    return {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        repository: {
            commitSha: git(rootDir, ['rev-parse', 'HEAD']),
            branch: git(rootDir, ['branch', '--show-current']),
            clean: sourceStatus.length === 0,
            status: sourceStatus,
            generatedEvidenceStatus
        },
        package: {
            name: packageJson.name,
            version: packageJson.version,
            lockName: lockRoot.name || packageLock.name || null,
            lockVersion: lockRoot.version || packageLock.version || null,
            metadataConsistent: packageJson.name === (lockRoot.name || packageLock.name)
                && packageJson.version === (lockRoot.version || packageLock.version)
        },
        dataset: {
            path: path.relative(rootDir, datasetMetadataPath).replace(/\\/g, '/'),
            sha256: fs.existsSync(datasetMetadataPath) ? sha256File(datasetMetadataPath) : null,
            metadata: fs.existsSync(datasetMetadataPath) ? readJson(datasetMetadataPath) : null
        },
        artifact: artifactExists ? {
            path: path.relative(rootDir, artifactPath).replace(/\\/g, '/'),
            sizeBytes: fs.statSync(artifactPath).size,
            sha256: sha256File(artifactPath)
        } : null,
        environment: {
            platform: process.platform,
            architecture: process.arch,
            nodeVersion: process.version,
            osRelease: os.release(),
            cpuModel: os.cpus()[0]?.model || 'unknown',
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem()
        }
    };
}

function resolveCommand(command, args, options = {}) {
    const platform = options.platform || process.platform;
    const npmExecPath = options.npmExecPath || process.env.npm_execpath;
    const nodeExecPath = options.nodeExecPath || process.execPath;

    if (platform === 'win32' && command === 'npm' && npmExecPath) {
        return {
            command: nodeExecPath,
            args: [npmExecPath, ...(args || [])]
        };
    }
    return { command, args: args || [] };
}

function runGate(rootDir, gate) {
    const startedAt = new Date().toISOString();
    const start = process.hrtime.bigint();
    const resolved = resolveCommand(gate.command, gate.args || []);
    const result = spawnSync(resolved.command, resolved.args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
        env: process.env,
        stdio: gate.inheritOutput ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const spawnError = result.error ? String(result.error.message || result.error) : null;
    const exitCode = typeof result.status === 'number' ? result.status : 1;

    return {
        id: gate.id,
        description: gate.description,
        required: gate.required !== false,
        command: [gate.command, ...(gate.args || [])].join(' '),
        startedAt,
        durationMs: Math.round(durationMs * 100) / 100,
        exitCode,
        status: exitCode === 0 && !spawnError ? 'passed' : 'failed',
        error: spawnError,
        stdoutTail: gate.inheritOutput ? null : tail(result.stdout || '', 40),
        stderrTail: gate.inheritOutput ? null : tail(result.stderr || '', 40)
    };
}

function tail(value, maxLines) {
    const lines = String(value).split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - maxLines)).join('\n').trim();
}

function deriveValidationDecision(metadata, gates) {
    const required = gates.filter(gate => gate.required);
    const failed = required.filter(gate => gate.status !== 'passed');
    if (failed.length > 0) {
        return 'VALIDATION_FAILED';
    }
    if (!metadata.package.metadataConsistent) {
        return 'VALIDATION_FAILED_METADATA_MISMATCH';
    }
    if (!metadata.repository.clean) {
        return 'VALIDATION_PASSED_DIRTY_WORKTREE';
    }
    return 'VALIDATION_PASSED_NOT_RELEASE_CERTIFIED';
}

function createCertificationReport(metadata, gates, options = {}) {
    const required = gates.filter(gate => gate.required);
    const passed = gates.filter(gate => gate.status === 'passed');
    const decision = options.decision || deriveValidationDecision(metadata, gates);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: options.mode || 'standard',
        classification: options.classification || 'development-validation',
        releaseCertified: false,
        decision,
        summary: {
            gatesExecuted: gates.length,
            gatesPassed: passed.length,
            requiredGates: required.length,
            requiredGatesPassed: required.filter(gate => gate.status === 'passed').length,
            allRequiredGatesPassed: required.every(gate => gate.status === 'passed')
        },
        metadata,
        gates,
        limitations: options.limitations || [
            'This report validates repository commands, not an installed VS Code Extension Host.',
            'Controlled synthetic benchmarks do not establish upstream-model task-success uplift.',
            'Artifact installation, parser loading, workspace-trust, and provider protocol certification remain future release gates.'
        ]
    };
}

function renderMarkdownReport(report) {
    const gateRows = report.gates.map(gate => {
        const result = gate.status === 'passed' ? 'PASS' : 'FAIL';
        return `| ${gate.id} | ${gate.description} | ${gate.required ? 'yes' : 'no'} | ${result} | ${gate.durationMs} |`;
    }).join('\n');
    const limitations = report.limitations.map(item => `- ${item}`).join('\n');
    const artifact = report.metadata.artifact
        ? `\`${report.metadata.artifact.path}\` (${report.metadata.artifact.sizeBytes} bytes, SHA-256 \`${report.metadata.artifact.sha256}\`)`
        : 'Not produced by this run.';

    return `# Tokonomics Development Validation Report

> Decision: **${report.decision}**
> Classification: **${report.classification}**
> Release certified: **No**
> Generated: \`${report.generatedAt}\`

## Reproducibility

- Commit: \`${report.metadata.repository.commitSha}\`
- Branch: \`${report.metadata.repository.branch}\`
- Clean before validation: **${report.metadata.repository.clean ? 'yes' : 'no'}**
- Package: \`${report.metadata.package.name}@${report.metadata.package.version}\`
- Lock metadata consistent: **${report.metadata.package.metadataConsistent ? 'yes' : 'no'}**
- Dataset SHA-256: \`${report.metadata.dataset.sha256 || 'unavailable'}\`
- Node: \`${report.metadata.environment.nodeVersion}\`
- Platform: \`${report.metadata.environment.platform}/${report.metadata.environment.architecture}\`
- Artifact: ${artifact}

## Executed gates

| Gate | Description | Required | Result | Duration (ms) |
|---|---|---:|---:|---:|
${gateRows}

## Limitations

${limitations}

This document contains no pre-populated production decision. Its gate states are derived
from commands executed during this run. A passing development-validation report is not
permission to publish production, privacy, savings, or task-success claims.
`;
}

function writeCertificationReport(rootDir, report) {
    const reportsDir = path.join(rootDir, 'validation', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const jsonPath = path.join(reportsDir, 'certification-report.json');
    const markdownPath = path.join(reportsDir, 'certification-report.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(markdownPath, renderMarkdownReport(report), 'utf8');
    return { jsonPath, markdownPath };
}

function validateClaimRegistry(rootDir, registryPath) {
    const registry = readJson(registryPath);
    const errors = [];
    const ids = new Set();

    if (registry.schemaVersion !== 1) {
        errors.push('claim registry schemaVersion must be 1');
    }
    if (!Array.isArray(registry.claims) || registry.claims.length === 0) {
        errors.push('claim registry must contain at least one claim');
        return { valid: false, errors, registry };
    }

    for (const claim of registry.claims) {
        if (!claim.id || ids.has(claim.id)) {
            errors.push(`claim id is missing or duplicated: ${claim.id || '<missing>'}`);
        }
        ids.add(claim.id);
        if (!CLAIM_STATUSES.has(claim.status)) {
            errors.push(`claim ${claim.id} has unsupported status ${claim.status}`);
        }
        if (!Array.isArray(claim.publicLocations)) {
            errors.push(`claim ${claim.id} publicLocations must be an array`);
        } else {
            if ((claim.status === 'verified' || claim.status === 'qualified') && claim.publicLocations.length === 0) {
                errors.push(`claim ${claim.id} must name at least one public location`);
            }
            for (const location of claim.publicLocations) {
                if (!fs.existsSync(path.resolve(rootDir, location))) {
                    errors.push(`claim ${claim.id} references missing public location ${location}`);
                }
            }
        }
        if (claim.status === 'verified' && (!Array.isArray(claim.evidence) || claim.evidence.length === 0)) {
            errors.push(`verified claim ${claim.id} must reference evidence`);
        }
        for (const evidencePath of claim.evidence || []) {
            if (!fs.existsSync(path.resolve(rootDir, evidencePath))) {
                errors.push(`claim ${claim.id} references missing evidence ${evidencePath}`);
            }
        }
    }

    return { valid: errors.length === 0, errors, registry };
}

module.exports = {
    classifyRepositoryStatus,
    captureRepositoryMetadata,
    createCertificationReport,
    deriveValidationDecision,
    readJson,
    renderMarkdownReport,
    resolveCommand,
    runGate,
    sha256File,
    validateClaimRegistry,
    writeCertificationReport
};
