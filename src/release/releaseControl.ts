import { createHash } from 'crypto';

export type ReleaseChannel = 'stable' | 'canary' | 'disabled';
export type KillSwitchCapability =
    | 'compiler'
    | 'workspaceIndex'
    | 'responseCache'
    | 'imageRightsizing'
    | 'localInference';

export interface ReleaseControlConfiguration {
    channel: ReleaseChannel;
    stagedRolloutPercent: number;
    emergencyDisableOptimization: boolean;
    disabledCapabilities: readonly string[];
}

export interface ReleaseControlSnapshot {
    readonly channel: ReleaseChannel;
    readonly rolloutBucket: number;
    readonly rolloutPercent: number;
    readonly enrolled: boolean;
    readonly forcePassThrough: boolean;
    readonly disabledCapabilities: ReadonlySet<KillSwitchCapability>;
    readonly reason: 'enabled' | 'emergency_kill_switch' | 'release_disabled' | 'outside_canary_rollout';
}

const CAPABILITIES = new Set<KillSwitchCapability>([
    'compiler', 'workspaceIndex', 'responseCache', 'imageRightsizing', 'localInference'
]);

/** Local, deterministic release controls. No network-fetched flags or identifiers are used. */
export class ReleaseControl {
    public static evaluate(configuration: ReleaseControlConfiguration, installationId: string): ReleaseControlSnapshot {
        const rolloutPercent = Math.max(0, Math.min(100, Math.floor(configuration.stagedRolloutPercent)));
        const rolloutBucket = this.bucket(installationId);
        const disabledCapabilities = new Set<KillSwitchCapability>();
        for (const capability of configuration.disabledCapabilities || []) {
            if (CAPABILITIES.has(capability as KillSwitchCapability)) disabledCapabilities.add(capability as KillSwitchCapability);
        }

        let reason: ReleaseControlSnapshot['reason'] = 'enabled';
        if (configuration.emergencyDisableOptimization) reason = 'emergency_kill_switch';
        else if (configuration.channel === 'disabled') reason = 'release_disabled';
        else if (configuration.channel === 'canary' && rolloutBucket >= rolloutPercent) reason = 'outside_canary_rollout';

        const forcePassThrough = reason !== 'enabled' || disabledCapabilities.has('compiler');
        return Object.freeze({
            channel: configuration.channel,
            rolloutBucket,
            rolloutPercent,
            enrolled: reason === 'enabled',
            forcePassThrough,
            disabledCapabilities,
            reason
        });
    }

    private static bucket(installationId: string): number {
        const digest = createHash('sha256').update(`tokonomics-release-v1:${installationId || 'anonymous'}`).digest();
        return digest.readUInt32BE(0) % 100;
    }
}
