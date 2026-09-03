import { createHmac, randomBytes } from 'crypto';
import { ExperimentCatalog } from './experimentCatalog';
import { EXPERIMENT_IDS, ExperimentExecutionRecord, ExperimentGateSnapshot, ExperimentId, ExperimentRuntimeConfiguration } from './experimentTypes';

const KNOWN_IDS = new Set<string>(EXPERIMENT_IDS);
const DEFAULT_CONFIGURATION: ExperimentRuntimeConfiguration = Object.freeze({
    consent: false, enabled: [], disabled: [], trustedWorkspace: false,
    releaseEnabled: true, maxLatencyMs: 25, maxMemoryMB: 32
});

/** Process-local experiment boundary. It stores hashes and outcomes, never prompt or workspace content. */
export class ExperimentRuntime {
    private static configuration: ExperimentRuntimeConfiguration = DEFAULT_CONFIGURATION;
    private static records: ExperimentExecutionRecord[] = [];
    private static readonly maxRecords = 256;
    private static readonly diagnosticSalt = randomBytes(32);

    public static configure(configuration: ExperimentRuntimeConfiguration): void {
        this.configuration = Object.freeze({
            ...configuration,
            enabled: Object.freeze(configuration.enabled.filter(id => KNOWN_IDS.has(id))),
            disabled: Object.freeze(configuration.disabled.filter(id => KNOWN_IDS.has(id))),
            maxLatencyMs: Math.max(1, Math.min(250, Math.floor(configuration.maxLatencyMs))),
            maxMemoryMB: Math.max(1, Math.min(256, Math.floor(configuration.maxMemoryMB)))
        });
    }

    public static gate(id: ExperimentId): ExperimentGateSnapshot {
        const definition = ExperimentCatalog.get(id);
        const enabled = new Set(this.configuration.enabled);
        const disabled = new Set(this.configuration.disabled);
        let reason: ExperimentGateSnapshot['reason'] = 'enabled';
        if (!this.configuration.releaseEnabled) reason = 'release_disabled';
        else if (disabled.has(id)) reason = 'kill_switch';
        else if (!enabled.has(id)) reason = 'not_selected';
        else if (!this.configuration.consent) reason = 'consent_required';
        else if (definition.requiresTrustedWorkspace && !this.configuration.trustedWorkspace) reason = 'workspace_trust_required';
        else if (definition.estimatedMaxLatencyMs > this.configuration.maxLatencyMs
            || definition.estimatedMaxMemoryMB > this.configuration.maxMemoryMB) reason = 'resource_budget_exceeded';
        return Object.freeze({ id, enabled: reason === 'enabled', reason });
    }

    public static runShadow<T>(id: ExperimentId, inputIdentity: string, fallback: T,
        candidate: () => T, validate: (value: T) => boolean = () => true): T {
        const gate = this.gate(id);
        const started = performance.now();
        if (!gate.enabled) {
            this.record(id, inputIdentity, 'fallback', gate.reason, performance.now() - started);
            return fallback;
        }
        try {
            const result = candidate();
            const latencyMs = performance.now() - started;
            if (!validate(result)) {
                this.record(id, inputIdentity, 'fallback', 'invalid_output', latencyMs);
                return fallback;
            }
            if (latencyMs > Math.min(this.configuration.maxLatencyMs, ExperimentCatalog.get(id).estimatedMaxLatencyMs)) {
                this.record(id, inputIdentity, 'fallback', 'latency_budget_exceeded', latencyMs);
                return fallback;
            }
            this.record(id, inputIdentity, 'shadow_completed', 'enabled', latencyMs);
            return result;
        } catch {
            this.record(id, inputIdentity, 'fallback', 'candidate_error', performance.now() - started);
            return fallback;
        }
    }

    public static diagnostics(): { gates: readonly ExperimentGateSnapshot[]; records: readonly ExperimentExecutionRecord[] } {
        return Object.freeze({
            gates: Object.freeze(EXPERIMENT_IDS.map(id => this.gate(id))),
            records: Object.freeze(this.records.map(record => Object.freeze({ ...record })))
        });
    }

    public static reset(): void { this.configuration = DEFAULT_CONFIGURATION; this.records = []; }

    private static record(id: ExperimentId, inputIdentity: string, status: ExperimentExecutionRecord['status'],
        reason: ExperimentExecutionRecord['reason'], latencyMs: number): void {
        this.records.push(Object.freeze({
            id, timestamp: Date.now(), inputHash: createHmac('sha256', this.diagnosticSalt).update(inputIdentity.slice(0, 1024)).digest('hex'),
            status, reason, latencyMs: Math.round(latencyMs * 1000) / 1000
        }));
        if (this.records.length > this.maxRecords) this.records.splice(0, this.records.length - this.maxRecords);
    }
}
