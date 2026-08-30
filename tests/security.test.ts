import { SecuritySanitizer } from '../src/security/sanitizer';
import { TokenCounter } from '../src/engine/tokenizer';
import { AstPrunerEngine } from '../src/ast/pruner';
import { MetricsTracker } from '../src/metrics/tracker';
import { TokenIgnoreFilter } from '../src/ignore/tokenIgnore';
import * as assert from 'assert';

export async function runSecurityAndPerfTests() {
    console.log('\n--- Running Security, Sanitization & Performance Tests ---');

    // 1. Secret Redaction Test
    const codeWithSecrets = `
const apiKey = "sk-proj-abc1234567890abcdef1234567890";
const anthropicKey = "sk-ant-api03-1234567890abcdef1234567890";
const ghToken = "ghp_1234567890abcdef1234567890abcdef12";

export function connectCloud() {
    console.log("Connecting with key: " + apiKey);
}
`;

    const sanitized = SecuritySanitizer.sanitizeSecrets(codeWithSecrets);
    console.log(`[Security Test] Redacted ${sanitized.redactedCount} secrets from context payload.`);
    assert.strictEqual(sanitized.redactedCount, 3, 'Should redact all 3 API keys');
    assert.ok(!sanitized.sanitized.includes('sk-proj-abc'), 'OpenAI key should be redacted');
    assert.ok(!sanitized.sanitized.includes('sk-ant-api03'), 'Anthropic key should be redacted');
    assert.ok(!sanitized.sanitized.includes('ghp_1234567890'), 'GitHub token should be redacted');
    console.log('✓ Secret Redactor verified.');

    // 2. High-Performance Tokenizer Latency Test
    const largeText = 'function processData(x: number): number { return x * 2; }\n'.repeat(500); // 28KB
    const startTok = performance.now();
    const tokenCount = TokenCounter.countTokens(largeText);
    const tokDuration = performance.now() - startTok;

    console.log(`[Tokenizer Perf] Processed 28KB code (${tokenCount} tokens) in ${tokDuration.toFixed(3)}ms`);
    assert.ok(tokDuration < 15, `Tokenizer should take < 15ms, took ${tokDuration}ms`);
    console.log('✓ Tokenizer Performance verified.');

    // 3. AST Pruner Secret Redaction Integration
    const engine = new AstPrunerEngine();
    const pruneResult = engine.pruneCodeContext(codeWithSecrets, 'typescript');
    assert.ok(!pruneResult.prunedCode.includes('sk-proj-abc'), 'AST pruner output must be sanitized');
    console.log('✓ AST Pruner Secret Redaction integration verified.');

    // 4. Dynamic Time-Windowed Telemetry Tracker Test
    const tracker = new MetricsTracker();
    tracker.reset();

    tracker.recordOptimization(1500, 500, { astSaved: 1000, textCompressionSaved: 0, historyCompacted: 0, cacheAligned: 1200 });
    tracker.recordOptimization(2000, 800, { astSaved: 1200, textCompressionSaved: 0, historyCompacted: 0, cacheAligned: 0 });

    const todayStats = tracker.getTodayMetrics();
    const allTimeStats = tracker.getAllTimeMetrics();

    console.log(`[Dynamic Metrics] Today: ${todayStats.requests} requests, ${todayStats.savedTokens}/${todayStats.originalTokens} tokens (${todayStats.reductionPercentage}%), Cache Hit: ${todayStats.cacheHitPercentage}%`);
    assert.strictEqual(todayStats.requests, 2, 'Should count 2 requests today');
    assert.strictEqual(todayStats.savedTokens, 2200, 'Should save 2200 tokens');
    assert.strictEqual(todayStats.reductionPercentage, 62.9, 'Expected 62.9% reduction');
    assert.strictEqual(todayStats.cacheHitPercentage, 50.0, 'Expected 50% cache hit rate (1 out of 2)');
    assert.strictEqual(allTimeStats.requests, 2, 'All time requests should match');
    console.log('✓ Dynamic Time-Windowed Telemetry verified.');

    // 5. .tokenignore Filter Test
    const filter = new TokenIgnoreFilter();
    assert.ok(filter.isIgnored('d:/project/node_modules/react/index.js'), 'node_modules should be ignored');
    assert.ok(filter.isIgnored('d:/project/dist/bundle.min.js'), 'min.js in dist should be ignored');
    assert.ok(filter.isIgnored('d:/project/package-lock.json'), 'package-lock.json should be ignored');
    assert.ok(filter.isIgnored('d:/project/assets/logo.svg'), 'svg assets should be ignored');
    assert.ok(!filter.isIgnored('d:/project/src/services/auth.ts'), 'Source code should not be ignored');
    console.log('✓ .tokenignore Context Filter verified.');
}
