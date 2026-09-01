/**
 * Tokonomics Evidence Requirement Policy Matrix
 * Data-driven mapping from TaskType to required EvidenceCategories and retrieval modes.
 */

import { TaskType, EvidenceRequirement, RetrievalMode, OptimizationAggressiveness } from './governorTypes';

export interface TaskPolicy {
    retrievalMode: RetrievalMode;
    defaultAggressiveness: OptimizationAggressiveness;
    maxReductionPct: number;
    requiredEvidence: EvidenceRequirement[];
}

export class EvidencePolicyMatrix {
    private static readonly POLICIES: Record<TaskType, TaskPolicy> = {
        debug: {
            retrievalMode: 'error-driven',
            defaultAggressiveness: 'conservative',
            maxReductionPct: 65,
            requiredEvidence: [
                { category: 'errorStackTrace', priority: 'critical', reason: 'Error location & diagnostic payload are essential for root-cause analysis' },
                { category: 'targetImplementation', priority: 'critical', reason: 'Failing function or class body must be examined' },
                { category: 'callers', priority: 'high', reason: 'Callers provide invocation arguments and execution context' },
                { category: 'tests', priority: 'high', reason: 'Existing tests verify regression behavior' },
                { category: 'configuration', priority: 'medium', reason: 'Environment variables or settings affecting runtime behavior' },
                { category: 'gitHistory', priority: 'medium', reason: 'Recent changes that may have introduced the defect' }
            ]
        },
        refactor: {
            retrievalMode: 'dependency',
            defaultAggressiveness: 'balanced',
            maxReductionPct: 75,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'critical', reason: 'The implementation to be restructured' },
                { category: 'callers', priority: 'critical', reason: 'Callers ensure refactored signatures do not break downstream consumers' },
                { category: 'apiContract', priority: 'critical', reason: 'Public API interfaces and type definitions must remain intact' },
                { category: 'tests', priority: 'high', reason: 'Unit test suite to validate preservation of behavior' },
                { category: 'architecture', priority: 'high', reason: 'Module boundary definitions and layer rules' }
            ]
        },
        explain: {
            retrievalMode: 'local',
            defaultAggressiveness: 'aggressive',
            maxReductionPct: 85,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'high', reason: 'Primary code entity being explained' },
                { category: 'apiContract', priority: 'high', reason: 'Signatures and docstrings' },
                { category: 'callers', priority: 'medium', reason: 'Usage examples' },
                { category: 'callees', priority: 'medium', reason: 'Sub-routines invoked' },
                { category: 'tests', priority: 'low', reason: 'Optional behavioral demonstration' }
            ]
        },
        test: {
            retrievalMode: 'test-driven',
            defaultAggressiveness: 'balanced',
            maxReductionPct: 70,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'critical', reason: 'Source code under test' },
                { category: 'tests', priority: 'critical', reason: 'Existing test conventions, assertions and test runner structure' },
                { category: 'fixtures', priority: 'high', reason: 'Mock payloads and test factories' },
                { category: 'mocks', priority: 'high', reason: 'External service stubs' },
                { category: 'apiContract', priority: 'high', reason: 'Type definitions and method signatures to test' }
            ]
        },
        feature: {
            retrievalMode: 'dependency',
            defaultAggressiveness: 'balanced',
            maxReductionPct: 75,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'critical', reason: 'Anchor point for extending functionality' },
                { category: 'apiContract', priority: 'high', reason: 'Interface contracts for new endpoints/methods' },
                { category: 'architecture', priority: 'high', reason: 'Architectural conventions for new modules' },
                { category: 'tests', priority: 'medium', reason: 'Patterns for adding feature tests' }
            ]
        },
        review: {
            retrievalMode: 'broad',
            defaultAggressiveness: 'conservative',
            maxReductionPct: 60,
            requiredEvidence: [
                { category: 'gitHistory', priority: 'critical', reason: 'Diff changes and commit intent' },
                { category: 'targetImplementation', priority: 'critical', reason: 'Modified implementation lines' },
                { category: 'callers', priority: 'high', reason: 'Impact on upstream callers' },
                { category: 'tests', priority: 'high', reason: 'Adequacy of test coverage for changes' },
                { category: 'apiContract', priority: 'high', reason: 'Public API changes and deprecations' }
            ]
        },
        architecture: {
            retrievalMode: 'broad',
            defaultAggressiveness: 'balanced',
            maxReductionPct: 80,
            requiredEvidence: [
                { category: 'architecture', priority: 'critical', reason: 'Package topology, folder structure, and dependency graphs' },
                { category: 'apiContract', priority: 'high', reason: 'Cross-module public contracts' },
                { category: 'configuration', priority: 'high', reason: 'Build configurations and workspace settings' }
            ]
        },
        search: {
            retrievalMode: 'minimal',
            defaultAggressiveness: 'aggressive',
            maxReductionPct: 88,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'high', reason: 'Matching symbols or search references' },
                { category: 'apiContract', priority: 'high', reason: 'Symbol definitions and type signatures' }
            ]
        },
        completion: {
            retrievalMode: 'local',
            defaultAggressiveness: 'aggressive',
            maxReductionPct: 85,
            requiredEvidence: [
                { category: 'targetImplementation', priority: 'critical', reason: 'Immediate cursor scope and enclosing block' },
                { category: 'apiContract', priority: 'high', reason: 'Locally imported symbols and types' }
            ]
        }
    };

    /**
     * Retrieves the data-driven policy for a given TaskType
     */
    public static getPolicy(taskType: TaskType): TaskPolicy {
        return this.POLICIES[taskType] || this.POLICIES.completion;
    }
}
