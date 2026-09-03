import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export function runPublicDocumentationTests(): void {
    console.log('\n--- Running Public Documentation Disclosure Tests ---');
    const root = process.cwd();
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const publicText = `${readme}\n${changelog}`;
    const forbidden = [
        /\bsrc\//i, /PipelineOrchestrator/i, /tree-sitter/i, /PageRank/i, /\bBM25\b/i,
        /knapsack/i, /McNemar/i, /\bHMAC\b/i, /16-stage/i,
        /System Dependence Graph/i, /Reciprocal Rank/i, /T0\s*\/\s*T1\s*\/\s*T2/i
    ];
    for (const pattern of forbidden) assert.doesNotMatch(publicText, pattern, `Public documentation exposes internal detail: ${pattern}`);
    assert.match(readme, /^# Tokonomics 6\.0/m);
    assert.match(changelog, /^## 6\.0\.0\b/m);
    assert.ok(readme.length < 8_000, 'Public README should remain concise.');
    assert.ok(changelog.length < 5_000, 'Public changelog should remain concise.');

    const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
    for (const entry of ['INTERNAL_ARCHITECTURE_AND_FEATURES.md', '*_CONTRACT.md', 'PHASE_*.md', 'SECURITY_AND_PRIVACY.md']) {
        assert.ok(vscodeIgnore.includes(entry), `VSIX exclusion is missing: ${entry}`);
    }
    console.log('Public README/changelog disclosure boundary and internal-document exclusions passed.');
}
