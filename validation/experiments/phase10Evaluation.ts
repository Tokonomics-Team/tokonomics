import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { ExperimentCatalog } from '../../src/experiments/experimentCatalog';
import { ExperimentPromotionEvaluator } from '../../src/experiments/promotionEvaluator';

function sha256(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function git(root: string, args: string[]): string {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return 'unavailable'; }
}

export function generatePhase10Evaluation(rootDir = process.cwd()): { jsonPath: string; markdownPath: string; report: any } {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const artifactPath = path.join(rootDir, `${manifest.name}-${manifest.version}.vsix`);
    const artifactSha256 = sha256(artifactPath);
    const candidates = ExperimentCatalog.all().map(definition => {
        const productionReachable = definition.id === 'confidence-progressive-compilation';
        const decision = ExperimentPromotionEvaluator.evaluate({
            source: 'synthetic', oracleIndependent: false, artifactBound: false, datasetFrozen: false, outcomes: []
        }, {
            productionReachable,
            fallbackVerified: true,
            independentlyDisableable: true,
            privacyConsentVerified: true,
            resourceBudgetVerified: true
        });
        return { ...definition, runtimeMode: 'shadow-only', productionReachable, promotion: decision };
    });
    const report = {
        schemaVersion: 1,
        classification: 'experimental-governance-evidence',
        generatedAt: new Date().toISOString(),
        sourceCommit: git(rootDir, ['rev-parse', 'HEAD']),
        artifact: artifactSha256 ? { path: path.basename(artifactPath), sha256: artifactSha256 } : null,
        policy: {
            defaultEnabled: false, explicitConsentRequired: true, localOnly: true, shadowOnly: true,
            minimumIndependentSampleSize: 30, maximumPromotionPValue: 0.05,
            minimumTaskSuccessUplift: 0.02, successNonInferiorityMargin: 0.02,
            minimumRelativeCostPerSuccessImprovement: 0.05, maximumLatencyRegressionRatio: 1.10
        },
        candidates,
        promotedCandidates: [],
        decision: 'NO_CANDIDATE_PROMOTED_IN_PHASE_10',
        releaseCertified: false,
        limitations: [
            'No external independent paired task benchmark was supplied.',
            'Internal controlled and synthetic tests validate machinery, not production task-success uplift.',
            'Shadow candidates cannot alter model-bound payloads.'
        ]
    };
    const reportDir = path.join(rootDir, 'validation', 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const jsonPath = path.join(reportDir, 'phase10-experiment-report.json');
    const markdownPath = path.join(reportDir, 'phase10-experiment-report.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const rows = candidates.map(candidate => `| ${candidate.id} | ${candidate.runtimeMode} | ${candidate.productionReachable ? 'yes' : 'no'} | ${candidate.promotion.decision} | ${candidate.promotion.reasons.join(', ')} |`).join('\n');
    fs.writeFileSync(markdownPath, `# Phase 10 experiment evaluation\n\n> Decision: **${report.decision}**\n> Source commit: \`${report.sourceCommit}\`\n> Release certified: **No**\n\n| Candidate | Runtime mode | Production hook reached | Decision | Blocking evidence |\n|---|---|---:|---|---|\n${rows}\n\n## Limitations\n\n${report.limitations.map(item => `- ${item}`).join('\n')}\n`);
    return { jsonPath, markdownPath, report };
}

if (require.main === module) {
    const result = generatePhase10Evaluation();
    console.log(`Phase 10 decision: ${result.report.decision}`);
    console.log(`JSON: ${result.jsonPath}`);
    console.log(`Markdown: ${result.markdownPath}`);
}
