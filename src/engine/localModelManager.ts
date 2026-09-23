import * as fs from 'fs';
import * as path from 'path';
import { createHash, verify } from 'crypto';
import { LocalSlmBrain, ModelManifest } from './localSlmBrain';

export interface SignedLocalModelManifest extends ModelManifest {
    readonly signerKeyId: string;
    readonly signatureBase64: string;
    readonly minExtensionVersion: string;
    readonly maxRuntimeMemoryMB: number;
}

export interface InstalledLocalModel {
    readonly manifest: SignedLocalModelManifest;
    readonly artifactPath: string;
    readonly installedBytes: number;
}

/** Local-only artifact lifecycle. Deliberately has no network/download method. */
export class LocalModelManager {
    constructor(
        private readonly storageDir: string,
        private readonly trustedSigners: ReadonlyMap<string, string>,
        private readonly extensionVersion: string,
        private readonly storageQuotaBytes = 512 * 1024 * 1024
    ) {}

    public install(manifest: SignedLocalModelManifest, bytes: Buffer, options: {
        explicitApproval: boolean;
        signal?: AbortSignal;
    }): InstalledLocalModel {
        if (!options.explicitApproval) throw new Error('Explicit model installation approval is required.');
        if (options.signal?.aborted) throw new Error('Model installation cancelled.');
        this.verifyManifest(manifest, bytes);
        const existingBytes = this.installedBytes();
        if (existingBytes + bytes.byteLength > this.storageQuotaBytes) throw new Error('Local model storage quota exceeded.');
        const available = typeof fs.statfsSync === 'function' && fs.existsSync(this.storageDir)
            ? fs.statfsSync(this.storageDir).bavail * fs.statfsSync(this.storageDir).bsize : Number.POSITIVE_INFINITY;
        if (available < bytes.byteLength * 1.1) throw new Error('Insufficient disk space for local model installation.');

        fs.mkdirSync(this.storageDir, { recursive: true });
        const artifactPath = this.artifactPath(manifest);
        const temporary = `${artifactPath}.partial`;
        if (options.signal?.aborted) throw new Error('Model installation cancelled.');
        fs.writeFileSync(temporary, bytes, { flag: 'wx' });
        try {
            if (options.signal?.aborted) throw new Error('Model installation cancelled.');
            fs.renameSync(temporary, artifactPath);
            fs.writeFileSync(`${artifactPath}.manifest.json`, JSON.stringify(manifest, null, 2), { flag: 'wx' });
        } catch (error) {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
            throw error;
        }
        return Object.freeze({ manifest, artifactPath, installedBytes: bytes.byteLength });
    }

    public load(installed: InstalledLocalModel, brain: LocalSlmBrain): { success: boolean; error?: string } {
        const bytes = fs.readFileSync(this.assertContained(installed.artifactPath));
        this.verifyManifest(installed.manifest, bytes);
        return brain.loadModel(installed.manifest, bytes);
    }

    public delete(installed: InstalledLocalModel, explicitApproval: boolean): void {
        if (!explicitApproval) throw new Error('Explicit model deletion approval is required.');
        const artifact = this.assertContained(installed.artifactPath);
        for (const target of [artifact, `${artifact}.manifest.json`, `${artifact}.partial`]) {
            if (fs.existsSync(target)) fs.unlinkSync(target);
        }
    }

    public verifyManifest(manifest: SignedLocalModelManifest, bytes: Buffer): void {
        if (bytes.byteLength === 0 || manifest.expectedSizeBytes === 0) throw new Error('Zero-byte model artifacts are prohibited.');
        if (bytes.byteLength !== manifest.expectedSizeBytes) throw new Error('Model artifact size mismatch.');
        if (bytes.byteLength > this.storageQuotaBytes) throw new Error('Model exceeds local storage quota.');
        if (!this.isCompatible(manifest.minExtensionVersion)) throw new Error('Model requires an incompatible Tokonomics version.');
        if (!Number.isFinite(manifest.maxRuntimeMemoryMB) || manifest.maxRuntimeMemoryMB <= 0 || manifest.maxRuntimeMemoryMB > 4096) {
            throw new Error('Model runtime memory declaration is invalid or exceeds the hard cap.');
        }
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (digest !== manifest.sha256Hash.toLowerCase()) throw new Error('Model artifact hash mismatch.');
        const publicKey = this.trustedSigners.get(manifest.signerKeyId);
        if (!publicKey) throw new Error('Model signer is not trusted.');
        const valid = verify(null, Buffer.from(this.canonicalManifest(manifest)), publicKey, Buffer.from(manifest.signatureBase64, 'base64'));
        if (!valid) throw new Error('Model manifest signature is invalid.');
    }

    public canonicalManifest(manifest: SignedLocalModelManifest): string {
        return JSON.stringify({ modelId: manifest.modelId, version: manifest.version, origin: manifest.origin,
            license: manifest.license, format: manifest.format, sha256Hash: manifest.sha256Hash,
            expectedSizeBytes: manifest.expectedSizeBytes, supportedTiers: [...manifest.supportedTiers].sort(),
            signerKeyId: manifest.signerKeyId, minExtensionVersion: manifest.minExtensionVersion,
            maxRuntimeMemoryMB: manifest.maxRuntimeMemoryMB });
    }

    private artifactPath(manifest: SignedLocalModelManifest): string {
        const name = `${manifest.modelId}-${manifest.version}`.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
        return this.assertContained(path.join(this.storageDir, `${name}.model`));
    }

    private assertContained(target: string): string {
        const root = path.resolve(this.storageDir);
        const resolved = path.resolve(target);
        const relative = path.relative(root, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Local model path escapes storage boundary.');
        return resolved;
    }

    private installedBytes(): number {
        if (!fs.existsSync(this.storageDir)) return 0;
        return fs.readdirSync(this.storageDir).filter(name => name.endsWith('.model'))
            .reduce((sum, name) => sum + fs.statSync(path.join(this.storageDir, name)).size, 0);
    }

    private isCompatible(required: string): boolean {
        const parse = (value: string) => value.split('.').map(part => Number.parseInt(part, 10) || 0).slice(0, 3);
        const current = parse(this.extensionVersion), minimum = parse(required);
        for (let index = 0; index < 3; index++) {
            if ((current[index] || 0) > (minimum[index] || 0)) return true;
            if ((current[index] || 0) < (minimum[index] || 0)) return false;
        }
        return true;
    }
}
