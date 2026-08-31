import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export async function runPhase0ArchitectureValidation(): Promise<boolean> {
    console.log('--- Phase 0: Repository-to-Specification Reachability Audit ---');

    const projectRoot = process.cwd();
    const matrixPath = path.resolve(projectRoot, 'validation', 'architecture-compliance-matrix.json');
    assert.ok(fs.existsSync(matrixPath), `architecture-compliance-matrix.json must exist at ${matrixPath}`);

    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    assert.strictEqual(matrix.overallStatus, 'GREEN');
    assert.ok(matrix.modules.length >= 16, 'Matrix must cover all 16+ core modules');

    for (const mod of matrix.modules) {
        assert.strictEqual(mod.status, 'GREEN', `Module ${mod.featureName} must be GREEN`);
        const implPath = path.resolve(projectRoot, mod.implementationFile);
        assert.ok(fs.existsSync(implPath), `Implementation file ${mod.implementationFile} must exist`);
    }

    console.log(`✓ Phase 0 Verified: ${matrix.modules.length} modules reachable and compliant.`);
    return true;
}
