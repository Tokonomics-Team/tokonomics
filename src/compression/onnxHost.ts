/**
 * Tokonomics Memory-Bounded Local ONNX Host
 * Manages local WebAssembly inference sessions with strict memory limits (<= 100MB envelope).
 */

export interface OnnxHostConfig {
    maxMemoryMB: number; // Default 100MB
    executionProvider: 'wasm' | 'webgpu' | 'cpu';
    numThreads: number;
    maxSessions: number;
}

export class OnnxMemoryBoundedHost {
    private config: OnnxHostConfig;
    private allocatedBytes: number = 0;
    private loadedSessions: Map<string, any> = new Map();

    constructor(config?: Partial<OnnxHostConfig>) {
        this.config = {
            maxMemoryMB: config?.maxMemoryMB ?? 100,
            executionProvider: config?.executionProvider ?? 'wasm',
            numThreads: config?.numThreads ?? 1,
            maxSessions: config?.maxSessions ?? 4
        };
    }

    /**
     * Checks whether a new model allocation can fit inside the strict memory envelope
     */
    public canAllocateModel(estimatedBytes: number): boolean {
        const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
        return (this.allocatedBytes + estimatedBytes) <= maxBytes;
    }

    /**
     * Registers a loaded model session and tracks memory consumption
     */
    public registerSession(modelId: string, estimatedBytes: number, sessionObj?: any): boolean {
        const existing = this.loadedSessions.get(modelId);
        const existingBytes = typeof existing?.bytes === 'number' ? existing.bytes : 0;
        if (!existing && this.loadedSessions.size >= this.config.maxSessions) return false;
        if (existing) this.allocatedBytes = Math.max(0, this.allocatedBytes - existingBytes);
        if (!this.canAllocateModel(estimatedBytes)) {
            this.allocatedBytes += existingBytes;
            return false;
        }

        this.allocatedBytes += estimatedBytes;
        this.loadedSessions.set(modelId, { session: sessionObj, id: modelId, bytes: estimatedBytes });
        return true;
    }

    /**
     * Unloads a model session to reclaim memory buffer
     */
    public unloadSession(modelId: string, estimatedBytes?: number): void {
        const existing = this.loadedSessions.get(modelId);
        if (existing) {
            this.loadedSessions.delete(modelId);
            this.allocatedBytes = Math.max(0, this.allocatedBytes - (typeof existing.bytes === 'number' ? existing.bytes : estimatedBytes || 0));
        }
    }

    public getMemoryStats(): { usedMB: number; maxMB: number; percentage: number; activeModels: number } {
        const usedMB = Math.round((this.allocatedBytes / (1024 * 1024)) * 100) / 100;
        return {
            usedMB,
            maxMB: this.config.maxMemoryMB,
            percentage: Math.round((usedMB / this.config.maxMemoryMB) * 100),
            activeModels: this.loadedSessions.size
        };
    }

    public clear(): void {
        this.loadedSessions.clear();
        this.allocatedBytes = 0;
    }
}
