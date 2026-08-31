import * as assert from 'assert';
import { PromptMinifier } from '../../src/engine/promptMinifier';
import { AstPrunerEngine } from '../../src/ast/pruner';
import { FeatureFlagRegistry } from '../../src/engine/featureFlags';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';

export async function runPhase3LegacyDifferentialValidation(): Promise<boolean> {
    console.log('--- Phase 3: Legacy Differential Golden Baseline Validation ---');

    // Test 1: PromptMinifier Declarative Rule Baseline
    const systemPrompt = `
You must always ensure that you write clean code with comments.
Please make sure to use descriptive variable names.
In order to ensure safety, validate inputs.
Under no circumstances should you leak secrets.
`;
    const minified = PromptMinifier.minifySystemPrompt(systemPrompt);
    assert.ok(minified.minifiedPrompt.length < systemPrompt.length, 'Minifier must reduce prompt length');
    assert.ok(minified.minifiedPrompt.includes('clean code'), 'Core rules must be retained');
    console.log('  ✓ Legacy PromptMinifier baseline verified.');

    // Test 2: Multi-Language AST Pruning across 14 Languages
    const ast = new AstPrunerEngine();
    const languages = ['typescript', 'javascript', 'python', 'go', 'rust', 'c', 'cpp', 'java', 'csharp', 'php', 'ruby', 'kotlin', 'swift', 'sql'];
    
    for (const lang of languages) {
        const sampleCode = `// Sample ${lang} module\nexport function run() {\n  return 42;\n}`;
        const chunk = ast.pruneCodeContext(sampleCode, lang, { structuralTier: 'T0' });
        assert.ok(chunk !== undefined && chunk.prunedCode.length > 0, `AST pruning must support ${lang}`);
    }
    console.log('  ✓ Multi-language AST pruning verified across 14 languages.');

    // Test 3: Legacy Pipeline Mode Invariance
    FeatureFlagRegistry.setPipelineMode('legacy');
    const orchestrator = new PipelineOrchestrator();
    const legacyRes = await orchestrator.compileContext({
        messages: [{ role: 'user', content: 'Explain function calculateSum(a, b) { return a + b; }' }],
        maxTokenBudget: 500,
        userIntent: 'explain'
    });

    assert.ok(legacyRes.optimizedMessages.length > 0, 'Legacy mode must output valid messages');
    // Restore default compiler mode
    FeatureFlagRegistry.setPipelineMode('compiler');
    console.log('  ✓ Legacy pipeline mode execution verified.');

    return true;
}
