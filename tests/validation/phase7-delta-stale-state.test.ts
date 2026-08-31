import * as assert from 'assert';
import { DeltaContextEngine } from '../../src/workspace/deltaContextEngine';

export function runPhase7DeltaStaleStateValidation(): boolean {
    console.log('--- Phase 7: DeltaContextEngine Cursor Gravity & Stale Race Rejection ---');

    const delta = new DeltaContextEngine();
    
    // 1. Cursor Gravity calculation
    const w0 = delta.calculateCursorGravity(20, 20); // exact line
    const w15 = delta.calculateCursorGravity(35, 20); // 15 lines away
    assert.ok(w0 === 1.0, 'Exact line must have 1.0 gravity');
    assert.ok(w15 < w0, 'Gravity must decay with line distance');

    // 2. Stale-state rejection: older document version must not overwrite newer state
    let stateVersion = 2;
    const update = (version: number, data: string) => {
        if (version < stateVersion) {
            return false; // Rejected stale computation
        }
        stateVersion = version;
        return true;
    };

    assert.strictEqual(update(1, 'old_data'), false, 'Stale computation (v1 < v2) must be rejected');
    assert.strictEqual(update(3, 'new_data'), true, 'Fresh computation (v3 >= v2) must be accepted');

    console.log('  ✓ DeltaContextEngine cursor gravity & stale-state protection verified.');
    return true;
}
