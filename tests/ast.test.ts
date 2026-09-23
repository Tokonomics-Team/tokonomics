import { AstPrunerEngine } from '../src/ast/pruner';
import { TokenCounter } from '../src/engine/tokenizer';
import * as assert from 'assert';
import * as path from 'path';

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

    // Test 3: Tree-sitter WASM Export Statement Unwrapping
    const wasmEngine = new AstPrunerEngine();
    await wasmEngine.initialize(path.join(__dirname, '..'));
    if (wasmEngine.hasTreeSitterActive()) {
        const exportedTs = `
export function computeLargeAlgorithm(a: number, b: number): number {
    let acc = 0;
    for (let i = 0; i < 1000; i++) {
        acc += (a * i) ^ (b + i);
        console.log("Expensive intermediate iteration:", i, acc);
    }
    return acc;
}

export class HeavyWorker {
    private id: string = "worker-1";
    public executeTask(payload: string): boolean {
        console.log("Detailed worker task running on payload:", payload);
        for (let j = 0; j < 500; j++) {
            Math.sqrt(j * 42);
        }
        return true;
    }
}
`;
        const wasmResult = wasmEngine.pruneCodeContext(exportedTs, 'typescript');
        assert.ok(wasmResult.reductionPercentage >= 50, `Expected at least 50% reduction with Tree-sitter on exported code, got ${wasmResult.reductionPercentage}%`);
        assert.ok(wasmResult.prunedCode.includes('export function computeLargeAlgorithm(a: number, b: number): number { /* [Pruned] */ }'),
            'Exported function should have its body pruned and signature preserved with export prefix');
        assert.ok(wasmResult.prunedCode.includes('export class HeavyWorker'), 'Exported class should be preserved');
        assert.ok(wasmResult.prunedCode.includes('executeTask(payload: string): boolean;'), 'Class method signature should be preserved');
        assert.ok(!wasmResult.prunedCode.includes('Expensive intermediate iteration'), 'Exported function body should be stripped');
        assert.ok(!wasmResult.prunedCode.includes('Detailed worker task running'), 'Exported class method body should be stripped');
        console.log('✓ Tree-sitter WASM Export Statement Unwrapping verified.');

        // Test 4: Tree-sitter WASM Python Class Method & Signature Preservation
        const pythonClassSource = `
import os
from typing import List, Dict, Optional

class DataPipeline:
    """Manages ingestion and processing of data records."""
    records: List[str] = []

    def __init__(self, config_path: str):
        self.config_path = config_path
        with open(config_path, 'r') as f:
            self.raw_data = f.read()

    @classmethod
    def create_default(cls) -> "DataPipeline":
        """Factory for default pipeline."""
        return cls("/etc/pipeline.conf")

    def process_batch(self, batch_id: int, items: List[Dict[str, str]]) -> bool:
        """Processes incoming data batches and persists to storage."""
        for i in range(100):
            item = items[i % len(items)] if items else {}
            cleaned = item.get('val', '').strip().lower()
            if len(cleaned) > 0:
                self.records.append(cleaned)
                print(f"Appended {cleaned} at index {i}")
        return True

def run_standalone(verbose: bool = False) -> None:
    print("Standalone runner running with verbose =", verbose)
    for step in range(50):
        print("Executing step:", step)
`;
        const wasmPyResult = wasmEngine.pruneCodeContext(pythonClassSource, 'python');
        assert.ok(wasmPyResult.reductionPercentage >= 40, `Expected at least 40% reduction with Tree-sitter on Python code, got ${wasmPyResult.reductionPercentage}%`);
        assert.ok(wasmPyResult.prunedCode.includes('class DataPipeline:'), 'Python class header must be preserved');
        assert.ok(wasmPyResult.prunedCode.includes('def __init__(self, config_path: str):'), 'Method __init__ must be preserved');
        assert.ok(wasmPyResult.prunedCode.includes('@classmethod'), 'Method decorator @classmethod must be preserved');
        assert.ok(wasmPyResult.prunedCode.includes('def create_default(cls) -> "DataPipeline":'), 'Classmethod signature must be preserved');
        assert.ok(wasmPyResult.prunedCode.includes('def process_batch(self, batch_id: int, items: List[Dict[str, str]]) -> bool:'), 'Method process_batch with parameters and return type must be preserved');
        assert.ok(wasmPyResult.prunedCode.includes('def run_standalone(verbose: bool = False) -> None:'), 'Top-level function signature must be preserved');
        assert.ok(!wasmPyResult.prunedCode.includes('with open(config_path'), 'Method inner body must be stripped');
        assert.ok(!wasmPyResult.prunedCode.includes('cleaned = item.get'), 'Method inner loop must be stripped');
        console.log('✓ Tree-sitter WASM Python Class Method & Signature Preservation verified.');
    }
}

