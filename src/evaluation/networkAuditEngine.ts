/**
 * Tokonomics Static & Runtime Network Isolation Audit Engine
 * Performs static AST scanning across all repository source files and
 * active runtime socket/HTTP monkey-patching during all context compiler operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
const http = require('http');
const https = require('https');
import { PipelineOrchestrator } from '../engine/pipelineOrchestrator';
import { LocalSlmBrain } from '../engine/localSlmBrain';
import { BM25Index, DenseVectorIndex } from '../search/hybridRetriever';
import { RuleBasedCompressor } from '../compression/compressionProvider';

export interface StaticNetworkAuditFinding {
    filePath: string;
    lineNumber: number;
    forbiddenPattern: string;
    lineSnippet: string;
}

export interface RuntimeNetworkCallAttempt {
    timestamp: number;
    protocol: string;
    host?: string;
    port?: number;
    stackTrace: string;
}

export interface NetworkIsolationAuditReport {
    measurementDate: string;
    filesScannedCount: number;
    staticForbiddenPatternsChecked: string[];
    staticFindings: StaticNetworkAuditFinding[];
    runtimeUnauthorizedCalls: RuntimeNetworkCallAttempt[];
    isStaticCertifiedClean: boolean;
    isRuntimeCertifiedClean: boolean;
    isOverallNetworkCertified: boolean;
}

export class NetworkAuditEngine {
    public static readonly FORBIDDEN_PATTERNS = [
        /\brequire\s*\(\s*['"](http|https|http2|net|tls|dgram|axios|got|superagent|request|undici)['"]\s*\)/i,
        /\bimport\s+.*?\s+from\s+['"](http|https|http2|net|tls|dgram|axios|got|superagent|request|undici)['"]/i,
        /\b(fetch|axios|superagent)\s*\(/i,
        /\bchild_process.*?\b(curl|wget|nc|ncat|telnet)\b/i
    ];

    /**
     * Scans source files (excluding evaluation/network test interceptors themselves) for network dependencies
     */
    public static runStaticAudit(srcDir: string = path.resolve(process.cwd(), 'src')): {
        filesScanned: number;
        findings: StaticNetworkAuditFinding[];
    } {
        const findings: StaticNetworkAuditFinding[] = [];
        let filesScanned = 0;

        const scanRecursive = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanRecursive(fullPath);
                } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
                    // Skip network audit harness itself from self-detection
                    if (entry.name.includes('networkAuditEngine') || entry.name.includes('network-isolation')) {
                        continue;
                    }

                    filesScanned++;
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const lines = content.split('\n');

                    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                        const line = lines[lineIdx];
                        for (const pattern of this.FORBIDDEN_PATTERNS) {
                            if (pattern.test(line)) {
                                findings.push({
                                    filePath: path.relative(process.cwd(), fullPath),
                                    lineNumber: lineIdx + 1,
                                    forbiddenPattern: pattern.toString(),
                                    lineSnippet: line.trim()
                                });
                            }
                        }
                    }
                }
            }
        };

        scanRecursive(srcDir);
        return { filesScanned, findings };
    }

    /**
     * Executes local pipeline components with active socket interception
     */
    public static async runRuntimeInterceptionAudit(): Promise<RuntimeNetworkCallAttempt[]> {
        const intercepted: RuntimeNetworkCallAttempt[] = [];

        // Save original functions
        const originalHttpReq = http.request;
        const originalHttpsReq = https.request;
        const originalSocketConnect = net.Socket.prototype.connect;
        const originalFetch = global.fetch;

        // Intercept HTTP
        (http as any).request = function (...args: any[]) {
            const stack = new Error().stack || '';
            intercepted.push({ timestamp: Date.now(), protocol: 'http', stackTrace: stack });
            throw new Error('[SECURITY VIOLATION] Unauthorized HTTP call in Tokonomics Core');
        };

        // Intercept HTTPS
        (https as any).request = function (...args: any[]) {
            const stack = new Error().stack || '';
            intercepted.push({ timestamp: Date.now(), protocol: 'https', stackTrace: stack });
            throw new Error('[SECURITY VIOLATION] Unauthorized HTTPS call in Tokonomics Core');
        };

        // Intercept TCP Socket connect
        (net.Socket.prototype as any).connect = function (...args: any[]) {
            const stack = new Error().stack || '';
            intercepted.push({ timestamp: Date.now(), protocol: 'tcp', stackTrace: stack });
            throw new Error('[SECURITY VIOLATION] Unauthorized TCP socket connection in Tokonomics Core');
        };

        // Intercept global.fetch if defined
        if (typeof global.fetch === 'function') {
            (global as any).fetch = function (...args: any[]) {
                const stack = new Error().stack || '';
                intercepted.push({ timestamp: Date.now(), protocol: 'fetch', stackTrace: stack });
                throw new Error('[SECURITY VIOLATION] Unauthorized fetch call in Tokonomics Core');
            };
        }

        try {
            // Exercise 1: Indexing & BM25 / Dense Vector
            const bm25 = new BM25Index();
            const dense = new DenseVectorIndex();
            for (let i = 0; i < 20; i++) {
                bm25.addDocument(`d_${i}`, `Document content ${i} authentication database`);
                dense.addVector(`v_${i}`, [0.1, 0.2, 0.3]);
            }
            bm25.search('authentication', 5);
            dense.search([0.1, 0.2, 0.3], 5);

            // Exercise 2: Local SLM Brain Query Refinement
            const slm = new LocalSlmBrain(false);
            await slm.refineQuery('Fix null pointer exception in AuthService');

            // Exercise 3: Semantic Compression
            const compressor = new RuleBasedCompressor();
            await compressor.compress('In order to ensure that the system executes properly, please make sure database is initialized.');

            // Exercise 4: Pipeline Orchestrator Context Compilation
            const orchestrator = new PipelineOrchestrator();
            await orchestrator.compileContext({
                messages: [{ role: 'user', content: 'Explain class AuthManager { login() { return true; } }' }],
                maxTokenBudget: 500,
                userIntent: 'explain'
            });

        } finally {
            // Restore originals
            (http as any).request = originalHttpReq;
            (https as any).request = originalHttpsReq;
            net.Socket.prototype.connect = originalSocketConnect;
            if (originalFetch) {
                global.fetch = originalFetch;
            }
        }

        return intercepted;
    }

    public static async auditAll(): Promise<NetworkIsolationAuditReport> {
        const staticAudit = this.runStaticAudit();
        const runtimeAudit = await this.runRuntimeInterceptionAudit();

        return {
            measurementDate: new Date().toISOString().split('T')[0],
            filesScannedCount: staticAudit.filesScanned,
            staticForbiddenPatternsChecked: this.FORBIDDEN_PATTERNS.map(p => p.toString()),
            staticFindings: staticAudit.findings,
            runtimeUnauthorizedCalls: runtimeAudit,
            isStaticCertifiedClean: staticAudit.findings.length === 0,
            isRuntimeCertifiedClean: runtimeAudit.length === 0,
            isOverallNetworkCertified: staticAudit.findings.length === 0 && runtimeAudit.length === 0
        };
    }
}
