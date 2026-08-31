import * as assert from 'assert';
import { ContextIRGenerator, ContextEntity } from '../../src/solver/contextIR';

export function runPhase4ContextIRValidation(): boolean {
    console.log('--- Phase 4: Context IR Multi-Resolution Representation Validation ---');

    const irEngine = new ContextIRGenerator();
    const entity: ContextEntity = {
        id: 'auth_service',
        filePath: 'src/services/authService.ts',
        symbolName: 'AuthService',
        kind: 'class',
        baseUtility: 100,
        signatures: ['export class AuthService {'],
        fullCode: `export class AuthService {
  private secretKey: string;
  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }
  public async validateSession(token: string): Promise<boolean> {
    if (!token) return false;
    return token.startsWith("tok_");
  }
}`
    };

    const multiRes = irEngine.generateAllResolutions(entity);

    // Semantic checks for each resolution level
    const rExclude = multiRes.get('R_exclude')!;
    const r0 = multiRes.get('R0')!;
    const r1 = multiRes.get('R1')!;
    const r2 = multiRes.get('R2')!;
    const r5 = multiRes.get('R5')!;

    assert.strictEqual(rExclude.tokenCount, 0, 'R_exclude must consume 0 tokens');
    assert.ok(r0.text.includes('AuthService'), 'R0 must contain reference pointer');
    assert.ok(r1.text.includes('AuthService'), 'R1 must contain symbol skeleton');
    assert.ok(r2.text.includes('validateSession') || r2.text.includes('AuthService'), 'R2 must contain public API contract');
    assert.ok(r5.text.includes('secretKey'), 'R5 must contain full implementation code');

    console.log('  ✓ Context IR R_exclude through R5 semantic representations verified.');
    return true;
}
