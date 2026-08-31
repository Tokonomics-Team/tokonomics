/**
 * Tokonomics Memory-Bounded Local ONNX Host
 * Manages local WebAssembly inference sessions with strict memory limits (<= 100MB envelope).
 */

export interface OnnxHostConfig {
    maxMemoryMB: number; // Default 100MB
    executionProvider: 'wasm' | 'webgpu' | 'cpu';
    numThreads: number;
}

export class OnnxMemoryBoundedHost {
    private config: OnnxHostConfig;
    private allocatedBytes: number = 0;
    private loadedSessions: Map<string, any> = new Map();

    constructor(config?: Partial<OnnxHostConfig>) {
        this.config = {
            maxMemoryMB: config?.maxMemoryMB ?? 100,
            executionProvider: config?.executionProvider ?? 'wasm',
            numThreads: config?.numThreads ?? 1
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
        if (!this.canAllocateModel(estimatedBytes)) {
            return false;
        }

        this.allocatedBytes += estimatedBytes;
        this.loadedSessions.set(modelId, sessionObj || { id: modelId, bytes: estimatedBytes });
        return true;
    }

    /**
     * Unloads a model session to reclaim memory buffer
     */
    public unloadSession(modelId: string, estimatedBytes: number): void {
        if (this.loadedSessions.has(modelId)) {
            this.loadedSessions.delete(modelId);
            this.allocatedBytes = Math.max(0, this.allocatedBytes - estimatedBytes);
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
