'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { captureRepositoryMetadata, sha256File } = require('./certification-evidence');

const BASELINE_SCHEMA_VERSION = 1;
const BASELINE_CLASSIFICATION = 'development-baseline-not-release-certification';

function slash(value) {
    return value.replace(/\\/g, '/');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256Value(value) {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function trackedFiles(rootDir, prefixes) {
    const output = execFileSync('git', ['ls-files', '--', ...prefixes], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return output.split(/\r?\n/).filter(Boolean).map(slash).sort();
}

function hashFileSet(rootDir, files) {
    const records = files.map(relativePath => ({
        path: slash(relativePath),
        sha256: sha256File(path.join(rootDir, relativePath)),
        sizeBytes: fs.statSync(path.join(rootDir, relativePath)).size
    }));
    return { sha256: sha256Value(records), fileCount: records.length, files: records };
}

function sourceLocations(rootDir, pattern) {
    const files = trackedFiles(rootDir, ['src']);
    const locations = [];
    for (const relativePath of files.filter(file => file.endsWith('.ts'))) {
        const lines = fs.readFileSync(path.join(rootDir, relativePath), 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (pattern.test(line)) locations.push({ path: relativePath, line: index + 1 });
            pattern.lastIndex = 0;
        });
    }
    return locations;
}

function parseComponentDefinitions(rootDir) {
    const source = fs.readFileSync(path.join(rootDir, 'src', 'engine', 'componentRegistry.ts'), 'utf8');
    const block = source.match(/export type ComponentId\s*=([\s\S]*?);/);
    if (!block) throw new Error('Unable to parse ComponentId registry');
    const ids = [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    const stages = [...source.matchAll(/\b(core|conditional|flaggedCore|shadow)\(\s*'([^']+)'\s*,\s*'([^']+)'/g)]
        .map(match => ({ constructor: match[1], id: match[2], stage: match[3] }));
    return { ids, stages };
}

function buildInventory(rootDir) {
    const packageJson = readJson(path.join(rootDir, 'package.json'));
    const contributes = packageJson.contributes || {};
    const scans = {
        persistentState: /\b(?:globalState|workspaceState|SecretStorage|\.secrets)\b/g,
        timers: /\b(?:setTimeout|setInterval)\s*\(/g,
        watchers: /\b(?:createFileSystemWatcher|onDidChangeTextDocument|onDidSaveTextDocument|onDidCreateFiles|onDidDeleteFiles|onDidRenameFiles|onDidChangeWorkspaceFolders|onDidChangeConfiguration)\s*\(/g,
        workers: /\bnew\s+(?:Worker|WorkerConstructor)\s*\(/g,
        queues: /\b(?:queue|pendingUpdates|queuedByKey)\b/g,
        outboundModelCalls: /\.sendRequest\s*\(/g
    };
    const resources = {};
    for (const [name, pattern] of Object.entries(scans)) resources[name] = sourceLocations(rootDir, pattern);

    const componentDefinitions = parseComponentDefinitions(rootDir);
    return {
        activationEvents: [...(packageJson.activationEvents || [])].sort(),
        entryPoints: {
            chatParticipants: (contributes.chatParticipants || []).map(item => item.id).sort(),
            languageModelProviders: (contributes.languageModelChatProviders || []).map(item => item.vendor).sort(),
            commands: (contributes.commands || []).map(item => item.command).sort()
        },
        publicSettings: Object.keys(contributes.configuration?.properties || {}).sort(),
        components: componentDefinitions.ids.sort(),
        componentStages: componentDefinitions.stages.sort((left, right) => left.id.localeCompare(right.id)),
        resources
    };
}

function validateScopeManifest(rootDir, scope) {
    const errors = [];
    if (scope.schemaVersion !== 1) errors.push('scope schemaVersion must be 1');
    if (scope.targetRelease !== '7.0.1') errors.push('scope targetRelease must be 7.0.1');
    if (scope.classification !== BASELINE_CLASSIFICATION) errors.push('scope classification is invalid');
    if (!fs.existsSync(path.join(rootDir, scope.authoritativePlan || ''))) errors.push('authoritative plan is missing');
    if (!Array.isArray(scope.fixtureSets) || scope.fixtureSets.length < 5) errors.push('at least five fixture sets are required');
    for (const set of scope.fixtureSets || []) {
        if (!set.id || !Array.isArray(set.requiredCoverage) || set.requiredCoverage.length === 0) {
            errors.push(`fixture set ${set.id || '<missing>'} has no required coverage`);
        }
        for (const relativePath of set.paths || []) {
            if (!fs.existsSync(path.join(rootDir, relativePath))) errors.push(`fixture path is missing: ${relativePath}`);
        }
    }
    for (const probe of scope.reachabilityProbes || []) {
        for (const relativePath of probe.evidence || []) {
            if (!fs.existsSync(path.join(rootDir, relativePath))) errors.push(`reachability evidence is missing: ${relativePath}`);
        }
    }
    if (!scope.metricContract || !Array.isArray(scope.metricContract.required) || scope.metricContract.required.length < 10) {
        errors.push('metric contract must declare the required Phase 0 measurements');
    }
    if (!scope.metricContract?.repeatTolerance || !Array.isArray(scope.metricContract.repeatTolerance.exactFields)) {
        errors.push('metric contract must declare repeat tolerances');
    }
    const findingIds = new Set();
    for (const finding of scope.auditFindings || []) {
        if (!finding.id || findingIds.has(finding.id)) errors.push(`audit finding is missing or duplicated: ${finding.id || '<missing>'}`);
        findingIds.add(finding.id);
        if (!Number.isInteger(finding.ownerPhase) || finding.ownerPhase < 0 || finding.ownerPhase > 11) {
            errors.push(`audit finding ${finding.id} has invalid owner phase`);
        }
    }
    return { valid: errors.length === 0, errors };
}

function validateMeasurement(measurement, metricContract) {
    const errors = [];
    for (const field of metricContract.required || []) {
        if (!(field in measurement)) errors.push(`measurement is missing ${field}`);
        else if (typeof measurement[field] !== 'number' || !Number.isFinite(measurement[field])) errors.push(`measurement ${field} must be finite`);
    }
    if (measurement.criticalEvidenceRecall < 0 || measurement.criticalEvidenceRecall > 1) errors.push('criticalEvidenceRecall must be within [0,1]');
    if (measurement.preservationRate < 0 || measurement.preservationRate > 1) errors.push('preservationRate must be within [0,1]');
    if (measurement.originalTokens < 0 || measurement.optimizedTokens < 0) errors.push('token measurements must be non-negative');
    return { valid: errors.length === 0, errors };
}

function commandVersion(command, args) {
    const resolved = process.platform === 'win32' && command === 'npm' && process.env.npm_execpath
        ? { command: process.execPath, args: [process.env.npm_execpath, ...args] }
        : { command, args };
    const result = spawnSync(resolved.command, resolved.args, { encoding: 'utf8', shell: false });
    if (result.error || result.status !== 0) return null;
    return String(result.stdout || '').trim().split(/\r?\n/)[0] || null;
}

function captureBaseline(rootDir, measurementRuns = []) {
    const scopePath = path.join(rootDir, 'validation', 'baselines', 'v7.0.1', 'phase0-scope.json');
    const scope = readJson(scopePath);
    const scopeValidation = validateScopeManifest(rootDir, scope);
    if (!scopeValidation.valid) throw new Error(scopeValidation.errors.join('; '));
    const packageJson = readJson(path.join(rootDir, 'package.json'));
    const fixturePaths = [...new Set(scope.fixtureSets.flatMap(set => set.paths))].sort();
    const suiteFiles = trackedFiles(rootDir, ['tests', 'validation/datasets']);
    const inventory = buildInventory(rootDir);
    const metadata = captureRepositoryMetadata(rootDir, null);
    const bundlePath = path.join(rootDir, 'dist', 'extension.js');
    const artifactCandidates = fs.readdirSync(rootDir).filter(name => /^tokonomics-.*\.vsix$/i.test(name)).sort();

    const baseline = {
        schemaVersion: BASELINE_SCHEMA_VERSION,
        classification: BASELINE_CLASSIFICATION,
        releaseCertified: false,
        targetRelease: '7.0.1',
        generatedAt: new Date().toISOString(),
        metadata: {
            ...metadata,
            npmVersion: commandVersion('npm', ['--version']),
            vscode: {
                configuredEngine: packageJson.engines?.vscode || null,
                detectedVersion: process.env.VSCODE_VERSION || commandVersion(process.platform === 'win32' ? 'code.cmd' : 'code', ['--version']),
                detectionMayBeUnavailableOutsideExtensionHost: true
            },
            lockfileSha256: sha256File(path.join(rootDir, 'package-lock.json')),
            packageManifestSha256: sha256File(path.join(rootDir, 'package.json')),
            bundle: fs.existsSync(bundlePath) ? { path: 'dist/extension.js', sizeBytes: fs.statSync(bundlePath).size, sha256: sha256File(bundlePath) } : null,
            availableVsixArtifacts: artifactCandidates.map(name => ({ path: name, sizeBytes: fs.statSync(path.join(rootDir, name)).size, sha256: sha256File(path.join(rootDir, name)) }))
        },
        fingerprints: {
            scope: hashFileSet(rootDir, [slash(path.relative(rootDir, scopePath))]),
            fixtures: hashFileSet(rootDir, fixturePaths),
            executableSuite: hashFileSet(rootDir, suiteFiles)
        },
        inventory,
        coverage: scope.fixtureSets.map(set => ({ id: set.id, requiredCoverage: set.requiredCoverage, paths: set.paths })),
        reachability: scope.reachabilityProbes,
        auditFindings: scope.auditFindings,
        measurements: measurementRuns,
        knownLimitations: scope.knownLimitations
    };
    baseline.stableFingerprint = sha256Value({
        targetRelease: baseline.targetRelease,
        repositoryCommit: baseline.metadata.repository.commitSha,
        packageVersion: baseline.metadata.package.version,
        lockfileSha256: baseline.metadata.lockfileSha256,
        scope: baseline.fingerprints.scope.sha256,
        fixtures: baseline.fingerprints.fixtures.sha256,
        executableSuite: baseline.fingerprints.executableSuite.sha256,
        inventory: baseline.inventory,
        reachability: baseline.reachability,
        auditFindings: baseline.auditFindings
    });
    return baseline;
}

function compareMeasurementRuns(first, second, tolerance) {
    const failures = [];
    for (const field of tolerance.exactFields || []) {
        if (first[field] !== second[field]) failures.push(`${field} changed: ${first[field]} != ${second[field]}`);
    }
    const latencyFields = ['coldCompileLatencyMs', 'warmCompileLatencyMs', 'indexBuildLatencyMs', 'indexRebuildLatencyMs', 'retrievalLatencyMs', 'eventLoopDelayMs'];
    for (const field of latencyFields) {
        const low = Math.max(0.001, Math.min(first[field], second[field]));
        const high = Math.max(first[field], second[field]);
        if (!Number.isFinite(high) || high / low > tolerance.latencyRatioMaximum) failures.push(`${field} exceeded repeat tolerance`);
    }
    for (const field of ['heapDeltaBytes', 'rssDeltaBytes']) {
        if (Math.abs(first[field] - second[field]) > tolerance.memoryDeltaAbsoluteBytes) failures.push(`${field} exceeded repeat tolerance`);
    }
    return { passed: failures.length === 0, failures };
}

function renderBaselineMarkdown(report) {
    const inventory = report.inventory;
    const measurement = report.measurements[0] || {};
    const reproducibility = report.reproducibility || { passed: false, failures: ['repeat probe not executed'] };
    return `# Tokonomics v7.0.1 Phase 0 Baseline Evidence\n\n` +
        `> Classification: **${report.classification}**\n\n` +
        `> Release certified: **No**\n\n` +
        `> Generated: \`${report.generatedAt}\`\n\n` +
        `## Identity\n\n` +
        `- Source commit: \`${report.metadata.repository.commitSha}\`\n` +
        `- Source clean: **${report.metadata.repository.clean ? 'yes' : 'no'}**\n` +
        `- Package: \`${report.metadata.package.name}@${report.metadata.package.version}\`\n` +
        `- Target release: \`${report.targetRelease}\`\n` +
        `- Lockfile SHA-256: \`${report.metadata.lockfileSha256}\`\n` +
        `- Fixture SHA-256: \`${report.fingerprints.fixtures.sha256}\`\n` +
        `- Executable-suite SHA-256: \`${report.fingerprints.executableSuite.sha256}\`\n` +
        `- Stable baseline fingerprint: \`${report.stableFingerprint}\`\n\n` +
        `## Inventory\n\n` +
        `- Commands: ${inventory.entryPoints.commands.length}\n` +
        `- Chat participants: ${inventory.entryPoints.chatParticipants.length}\n` +
        `- Language-model providers: ${inventory.entryPoints.languageModelProviders.length}\n` +
        `- Public settings at baseline: ${inventory.publicSettings.length}\n` +
        `- Registered components: ${inventory.components.length}\n` +
        `- Timer sites: ${inventory.resources.timers.length}\n` +
        `- Watcher sites: ${inventory.resources.watchers.length}\n` +
        `- Worker-construction sites: ${inventory.resources.workers.length}\n` +
        `- Outbound model-call sites: ${inventory.resources.outboundModelCalls.length}\n\n` +
        `## Executable measurement probe\n\n` +
        `- Files indexed: ${measurement.filesIndexed ?? 'not run'}\n` +
        `- Index build/rebuild: ${measurement.indexBuildLatencyMs ?? 'n/a'} / ${measurement.indexRebuildLatencyMs ?? 'n/a'} ms\n` +
        `- Compile cold/warm p50: ${measurement.coldCompileLatencyMs ?? 'n/a'} / ${measurement.warmCompileLatencyMs ?? 'n/a'} ms\n` +
        `- Retrieval p50: ${measurement.retrievalLatencyMs ?? 'n/a'} ms\n` +
        `- Critical-evidence recall: ${measurement.criticalEvidenceRecall ?? 'n/a'}\n` +
        `- Preservation rate: ${measurement.preservationRate ?? 'n/a'}\n` +
        `- Tokens: ${measurement.originalTokens ?? 'n/a'} -> ${measurement.optimizedTokens ?? 'n/a'}\n` +
        `- Projected cost saved: ${measurement.projectedCostSavedUsd ?? 'n/a'} USD\n` +
        `- Repeat within tolerance: **${reproducibility.passed ? 'yes' : 'no'}**\n\n` +
        `## Evidence limits\n\n${report.knownLimitations.map(item => `- ${item}`).join('\n')}\n\n` +
        `This baseline is an engineering comparison point. It is not a production, provider-billing,` +
        ` marketplace-savings, or downstream-model-quality certificate.\n`;
}

module.exports = {
    BASELINE_CLASSIFICATION,
    buildInventory,
    captureBaseline,
    compareMeasurementRuns,
    hashFileSet,
    renderBaselineMarkdown,
    sha256Value,
    stableJson,
    validateMeasurement,
    validateScopeManifest
};
