/**
 * Tokonomics First-Class Test Graph Engine
 * Links Test Suites and Cases to Target Code Symbols, Fixtures, and Mocks.
 */

export interface TestNode {
    id: string; // e.g. "tests/auth.test.ts:should_login_user"
    testFilePath: string;
    testName: string;
    targetSymbols: string[]; // Symbols directly under test
    fixtures: string[];      // Data fixtures / JSON payloads
    mocks: string[];         // Mocked dependencies
    isFailing?: boolean;
    sourceVersion?: string;  // Content hash or version tag of test file
    timestamp?: number;
    failureMessage?: string;
}

export class TestGraph {
    private tests: Map<string, TestNode> = new Map();
    private symbolToTests: Map<string, Set<string>> = new Map();

    public registerTest(test: TestNode): void {
        this.tests.set(test.id, {
            ...test,
            timestamp: test.timestamp ?? Date.now()
        });

        for (const sym of test.targetSymbols) {
            if (!this.symbolToTests.has(sym)) {
                this.symbolToTests.set(sym, new Set());
            }
            this.symbolToTests.get(sym)!.add(test.id);
        }
    }

    /**
     * Expires and removes tests whose testFilePath or sourceVersion does not match current workspace file versions
     */
    public expireStaleTests(currentFileVersions: ReadonlyMap<string, string>): number {
        let expiredCount = 0;
        for (const [id, test] of this.tests.entries()) {
            const currentVersion = currentFileVersions.get(test.testFilePath);
            if (test.sourceVersion && currentVersion && test.sourceVersion !== currentVersion) {
                this.removeTest(id);
                expiredCount++;
            }
        }
        return expiredCount;
    }

    public removeTest(testId: string): void {
        const test = this.tests.get(testId);
        if (!test) return;
        this.tests.delete(testId);
        for (const sym of test.targetSymbols) {
            const set = this.symbolToTests.get(sym);
            if (set) {
                set.delete(testId);
                if (set.size === 0) {
                    this.symbolToTests.delete(sym);
                }
            }
        }
    }

    public markTestFailing(testId: string, isFailing: boolean = true): void {
        const test = this.tests.get(testId);
        if (test) {
            test.isFailing = isFailing;
        }
    }

    /**
     * Finds all test suites and cases associated with a given code symbol
     */
    public getTestsForSymbol(symbolName: string): TestNode[] {
        const testIds = this.symbolToTests.get(symbolName);
        if (!testIds) {
            return [];
        }
        return Array.from(testIds).map(id => this.tests.get(id)!).filter(Boolean);
    }

    /**
     * Builds a compact prioritized test context bundle for an active symbol
     * Priority: Target Code + Failing Test + Fixture + Mock > 5 Unrelated Source Files
     */
    public getTestContextPackage(symbolName: string): {
        targetSymbol: string;
        failingTests: TestNode[];
        passingTests: TestNode[];
        fixtures: string[];
        mocks: string[];
    } {
        const allTests = this.getTestsForSymbol(symbolName);
        const failingTests = allTests.filter(t => t.isFailing);
        const passingTests = allTests.filter(t => !t.isFailing);

        const fixtures = new Set<string>();
        const mocks = new Set<string>();

        for (const t of allTests) {
            t.fixtures.forEach(f => fixtures.add(f));
            t.mocks.forEach(m => mocks.add(m));
        }

        return {
            targetSymbol: symbolName,
            failingTests,
            passingTests,
            fixtures: Array.from(fixtures),
            mocks: Array.from(mocks)
        };
    }

    public getTestCount(): number {
        return this.tests.size;
    }

    public clear(): void {
        this.tests.clear();
        this.symbolToTests.clear();
    }
}
