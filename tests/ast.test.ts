import { AstPrunerEngine } from '../src/ast/pruner';
import { TokenCounter } from '../src/engine/tokenizer';
import * as assert from 'assert';

export async function runAstTests() {
    console.log('\n--- Running AST Pruner Tests ---');
    const engine = new AstPrunerEngine();
    await engine.initialize(__dirname);

    // Test 1: TypeScript Class & Function Body Stripping
    const tsCode = `
import { AnalyticsService } from './analytics';
import { Logger } from '../utils/logger';

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    isActive: boolean;
}

export type AuthToken = string;

export class UserProcessor {
    private logger: Logger = new Logger();
    public userCount: number = 0;
    
    public async processUser(userId: string): Promise<boolean> {
        this.logger.info(\`Processing user: \${userId}\`);
        const user = await Database.findUser(userId);
        if (!user || !user.isActive) {
            this.logger.warn('User not active');
            return false;
        }
        await AnalyticsService.track('user_process', { userId });
        for (let i = 0; i < 100; i++) {
            this.userCount += i;
            console.log('Computing complex checksums:', i);
        }
        return true;
    }

    public getUserStatus(userId: string): UserProfile {
        const profile = Database.get(userId);
        return profile;
    }
}

export async function calculateMetrics(data: number[]): Promise<number> {
    let sum = 0;
    for (const val of data) {
        sum += val * 2;
        if (sum > 1000) {
            sum = sum % 1000;
        }
    }
    return sum;
}
`;

    const result = engine.pruneCodeContext(tsCode, 'typescript');
    console.log(`[AST Test TS] Original: ${result.originalTokenCount} tokens -> Pruned: ${result.prunedTokenCount} tokens (${result.reductionPercentage}% reduction in ${result.durationMs}ms)`);

    assert.ok(result.reductionPercentage >= 50, `Expected at least 50% token reduction, got ${result.reductionPercentage}%`);
    assert.ok(result.prunedCode.includes('UserProfile'), 'Should preserve interface UserProfile');
    assert.ok(result.prunedCode.includes('AuthToken'), 'Should preserve type AuthToken');
    assert.ok(result.prunedCode.includes('processUser'), 'Should preserve method processUser signature');
    assert.ok(!result.prunedCode.includes('Computing complex checksums'), 'Should strip method inner implementation body');
    console.log('✓ TypeScript AST Pruning verified.');

    // Test 2: Python Code Signature Extraction
    const pythonCode = `
import os
import sys
from typing import List, Optional, Dict

class DataPipeline:
    def __init__(self, config_path: str):
        self.config_path = config_path
        self.records = []
        with open(config_path, 'r') as f:
            self.raw_data = f.read()

    def process_batch(self, batch_id: int, items: List[Dict[str, str]]) -> bool:
        """Processes incoming data batches and persists to storage."""
        for item in items:
            cleaned = item.get('val', '').strip().lower()
            if len(cleaned) > 0:
                self.records.append(cleaned)
                print(f"Appended {cleaned}")
        return True

def run_server(port: int = 8080) -> None:
    print(f"Starting server on port {port}")
    while True:
        pass
`;

    const pyResult = engine.pruneCodeContext(pythonCode, 'python');
    console.log(`[AST Test Python] Original: ${pyResult.originalTokenCount} tokens -> Pruned: ${pyResult.prunedTokenCount} tokens (${pyResult.reductionPercentage}% reduction in ${pyResult.durationMs}ms)`);

    assert.ok(pyResult.reductionPercentage >= 40, `Expected at least 40% reduction on Python code, got ${pyResult.reductionPercentage}%`);
    assert.ok(pyResult.prunedCode.includes('class DataPipeline'), 'Should preserve class definition');
    assert.ok(pyResult.prunedCode.includes('def process_batch'), 'Should preserve method signature');
    assert.ok(!pyResult.prunedCode.includes('Appended {cleaned}'), 'Should strip inner loop implementation');
    console.log('✓ Python AST Pruning verified.');
}
