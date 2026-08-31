import * as assert from 'assert';
import { PipelineOrchestrator } from '../../src/engine/pipelineOrchestrator';

export async function runPhase32NetworkIsolationValidation(): Promise<boolean> {
    console.log('--- Phase 32: Network Isolation Certification (0 Auxiliary Traffic) ---');

    let outboundAttempts = 0;

    const http = require('http');
    const https = require('https');

    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const spy = (...args: any[]) => {
        outboundAttempts++;
        throw new Error('NETWORK VIOLATION: Unauthorized outbound network request during local context compilation!');
    };

    http.request = spy;
    https.request = spy;

    try {
        const orchestrator = new PipelineOrchestrator();
        await orchestrator.compileContext({
            messages: [
                { role: 'user', content: 'Audit class SecureVault { private pass = "abc"; getPass() { return this.pass; } }' }
            ],
            maxTokenBudget: 500,
            userIntent: 'explain'
        });
    } finally {
        http.request = originalHttpRequest;
        https.request = originalHttpsRequest;
    }

    assert.strictEqual(outboundAttempts, 0, 'Zero network calls allowed during auxiliary context compilation');
    console.log('  ✓ Network Isolation Certified: 0 unauthorized outbound requests during local compilation.');
    return true;
}
