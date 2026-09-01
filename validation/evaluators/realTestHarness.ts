/**
 * Real Node.js VM Test Execution Harness
 * Executes transpiled JavaScript code and real unit test assertions in an isolated VM sandbox.
 */

import * as vm from 'vm';
import * as assert from 'assert';

export interface VmTestResult {
    passed: boolean;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    error?: string;
    logs: string[];
    executionTimeMs: number;
}

export class RealTestHarness {
    /**
     * Executes code and test suite within a secure Node.js VM context
     */
    public static runInSandbox(compiledJs: string, testSuiteCode: string): VmTestResult {
        const startTime = performance.now();
        const logs: string[] = [];
        let testsRun = 0;
        let testsPassed = 0;
        let testsFailed = 0;

        // Create an isolated sandbox with assertions and safe globals
        const sandbox: Record<string, any> = {
            assert,
            console: {
                log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
                warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' '))
            },
            exports: {},
            module: { exports: {} },
            require: (modName: string) => {
                if (modName === 'assert') return assert;
                throw new Error(`Sandboxed test cannot require external module: ${modName}`);
            },
            setTimeout,
            clearTimeout,
            Date,
            Math,
            JSON,
            Set,
            Map,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp,
            Promise,
            Error,
            TypeError,
            RangeError,
            // Test runner hooks inside sandbox
            __recordTestPass: () => { testsRun++; testsPassed++; },
            __recordTestFail: (err: any) => { testsRun++; testsFailed++; logs.push(`Test failure: ${err}`); }
        };

        try {
            const context = vm.createContext(sandbox);

            // 1. Run the transpiled implementation code
            const implementationScript = new vm.Script(compiledJs, { filename: 'implementation.js' });
            implementationScript.runInContext(context, { timeout: 2000 });

            // 2. Export modules to global scope in sandbox so tests can access them
            const exportSyncScript = new vm.Script(`
                if (module && module.exports) {
                    for (const key of Object.keys(module.exports)) {
                        globalThis[key] = module.exports[key];
                    }
                }
                if (exports) {
                    for (const key of Object.keys(exports)) {
                        globalThis[key] = exports[key];
                    }
                }
            `);
            exportSyncScript.runInContext(context);

            // 3. Run the test suite script
            const testScript = new vm.Script(testSuiteCode, { filename: 'test_suite.js' });
            testScript.runInContext(context, { timeout: 2000 });

            const elapsedMs = performance.now() - startTime;
            const allPassed = testsFailed === 0 && testsRun > 0;

            return {
                passed: allPassed,
                testsRun,
                testsPassed,
                testsFailed,
                logs,
                executionTimeMs: Math.round(elapsedMs * 100) / 100
            };
        } catch (err: any) {
            const elapsedMs = performance.now() - startTime;
            return {
                passed: false,
                testsRun: testsRun > 0 ? testsRun : 1,
                testsPassed,
                testsFailed: testsFailed > 0 ? testsFailed : 1,
                error: err?.message || String(err),
                logs,
                executionTimeMs: Math.round(elapsedMs * 100) / 100
            };
        }
    }
}
