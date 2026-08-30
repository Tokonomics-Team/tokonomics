/**
 * Unit Test Suite for Anonymized Logger & Crash Reporter
 * Tests:
 *   1. PII and Username Sanitization
 *   2. File Path & Workspace Sanitization
 *   3. Secret and API Key Redaction in Logs
 *   4. Exception Capture & Stack Trace Sanitization
 *   5. Diagnostic Report Generation
 */

import { AnonymizedLogger } from '../src/security/anonymizedLogger';
import * as assert from 'assert';

export async function runLoggerTests() {
    console.log('\n--- Running Anonymized Logger & Crash Reporter Tests ---');

    const logger = AnonymizedLogger.getInstance();
    logger.clear();

    // 1. Test Username and Path Sanitization
    console.log('[Logger Test] Testing Username and Path Sanitization...');
    const rawPathWin = 'Error loading AST at C:\\Users\\admin\\Desktop\\my_project\\src\\index.ts';
    const sanitizedWin = logger.sanitize(rawPathWin);
    assert.ok(!sanitizedWin.includes('admin'), 'Should scrub username from Windows path');
    assert.ok(!sanitizedWin.includes('C:\\Users'), 'Should replace Users directory with <user_home>');
    console.log(`[Logger Test] Windows path sanitized to: "${sanitizedWin}"`);

    const rawPathUnix = 'Failed to read file /home/alice_smith/projects/auth/service.py';
    const sanitizedUnix = logger.sanitize(rawPathUnix);
    assert.ok(!sanitizedUnix.includes('alice_smith'), 'Should scrub username from Unix path');
    console.log(`[Logger Test] Unix path sanitized to: "${sanitizedUnix}"`);
    console.log('✓ Username and Path Sanitization verified.');

    // 2. Test Secret and API Key Redaction
    console.log('[Logger Test] Testing Secret and API Key Redaction in Logs...');
    const rawSecretLog = 'Connection failed with sk-ant-api03-abcdef1234567890abcdef1234567890 for user auth';
    const sanitizedSecret = logger.sanitize(rawSecretLog);
    assert.ok(!sanitizedSecret.includes('abcdef1234567890'), 'Should redact API key from log text');
    assert.ok(sanitizedSecret.includes('REDACTED_API_KEY'), 'Should contain redacted placeholder');
    console.log('✓ Secret Redaction in Logs verified.');

    // 3. Test IP Address Redaction
    console.log('[Logger Test] Testing IP Address Redaction in Logs...');
    const rawIpLog = 'Proxy connection dropped to upstream 192.168.1.105:8080';
    const sanitizedIp = logger.sanitize(rawIpLog);
    assert.ok(!sanitizedIp.includes('192.168.1.105'), 'Should redact IP address');
    assert.ok(sanitizedIp.includes('<ip_redacted>'), 'Should include IP redacted tag');
    console.log('✓ IP Address Redaction verified.');

    // 4. Test Log Recording and Crash Capture
    console.log('[Logger Test] Testing Log Recording & Exception Capture...');
    logger.info('RAMManager', 'Pre-warmed 50 files in RAM.');
    logger.warn('ModelRouter', 'Unrecognized model ID requested, falling back to default.');
    
    try {
        throw new Error('Simulated Tree-sitter WASM OutOfMemory at C:\\Users\\admin\\node_modules\\web-tree-sitter');
    } catch (err) {
        logger.captureException('AstPruner', err, 'Tree-sitter WASM parse');
    }

    assert.strictEqual(logger.getLogCount(), 3, 'Should hold 3 log entries');
    assert.strictEqual(logger.getErrorCount(), 1, 'Should record 1 crash/error entry');
    console.log('✓ Log Recording and Exception Capture verified.');

    // 5. Test Anonymized Markdown Report Export
    console.log('[Logger Test] Testing Anonymized Markdown Report Export...');
    const report = logger.exportAnonymizedReport();
    assert.ok(report.includes('# ⚡ Tokonomics Anonymized Diagnostic Log'), 'Report must contain header');
    assert.ok(report.includes('100% Sanitized'), 'Report must state privacy guarantee');
    assert.ok(!report.includes('admin'), 'Exported report must NOT contain user names');
    assert.ok(!report.includes('192.168.1.105'), 'Exported report must NOT contain IPs');
    console.log('✓ Anonymized Markdown Report Export verified.');
}
