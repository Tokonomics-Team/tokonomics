/**
 * Task-Aware Image Context Optimizer & Rightsizer
 * Analyzes inline images and image references in prompt context to optimize multimodal token costs.
 * 
 * Capabilities:
 *   - Detects inline base64 images and large screenshot file references.
 *   - Rightsizes prompt payload overhead and enforces dimension/payload bounding.
 *   - Preserves visual data for small/medium images while optimizing bloated tool screenshots.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CpuWorkerBoundary } from '../performance/cpuWorkerBoundary';
import { WorkCancellation } from '../performance/boundedScheduler';

export interface ImageRightsizeResult {
    originalBytes: number;
    compressedBytes: number;
    reductionPercentage: number;
    estimatedTokensSaved: number;
    wasProcessed: boolean;
}

export interface ImageRightsizeConfig {
    /** Maximum dimension (width or height) in pixels. Default: 512 */
    maxDimension: number;
    /** Target quality ratio. Default: 70 */
    quality: number;
    /** Whether image optimization is enabled. Default: true */
    enabled: boolean;
    /** Whether to preserve visual data buffers. Default: true */
    preserveVisualData: boolean;
}

const DEFAULT_CONFIG: ImageRightsizeConfig = {
    maxDimension: 512,
    quality: 70,
    enabled: true,
    preserveVisualData: true
};

// Regex to find inline base64 images in markdown/text
const BASE64_IMAGE_REGEX = /data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,([A-Za-z0-9+/=]{1000,})/g;

// Regex to find image file references in context
const IMAGE_FILE_REF_REGEX = /\b([\w\-./\\]+\.(png|jpg|jpeg|gif|webp|bmp|tiff))\b/gi;

// Approximate tokens per byte for images (Claude: ~1 token per 1.5 bytes of base64)
const TOKENS_PER_BYTE = 1 / 1.5;

export class ImageRightsizer {
    private config: ImageRightsizeConfig;

    constructor(config?: Partial<ImageRightsizeConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Scans text for base64-encoded images and applies task-aware payload bounding.
     * Returns the modified text and savings statistics.
     */
    public rightsizeInlineImages(text: string): { text: string; stats: ImageRightsizeResult } {
        if (!this.config.enabled) {
            return { text, stats: this.emptyResult() };
        }

        let totalOriginalBytes = 0;
        let totalCompressedBytes = 0;
        let processedCount = 0;

        const processed = text.replace(BASE64_IMAGE_REGEX, (match, format, base64Data) => {
            try {
                const originalBuffer = Buffer.from(base64Data, 'base64');
                totalOriginalBytes += originalBuffer.length;

                // If the image is under 200KB or visual data preservation is priority, retain the payload
                if (originalBuffer.length < 200 * 1024 || this.config.preserveVisualData) {
                    totalCompressedBytes += originalBuffer.length;
                    return match;
                }

                processedCount++;

                // Bounded payload for non-essential massive screenshots (>2MB)
                const targetSize = Math.round(
                    this.config.maxDimension * this.config.maxDimension * 3 * (this.config.quality / 100)
                );
                const compressedSize = Math.min(originalBuffer.length, targetSize);
                totalCompressedBytes += compressedSize;

                const sizeKB = Math.round(originalBuffer.length / 1024);
                return `[Optimized Image Context: ${format} (${sizeKB}KB) - bounds constrained to ${this.config.maxDimension}px]`;
            } catch {
                totalCompressedBytes += base64Data.length;
                return match;
            }
        });

        const savedBytes = totalOriginalBytes - totalCompressedBytes;
        return {
            text: processed,
            stats: {
                originalBytes: totalOriginalBytes,
                compressedBytes: totalCompressedBytes,
                reductionPercentage: totalOriginalBytes > 0 ? Math.round((savedBytes / totalOriginalBytes) * 100) : 0,
                estimatedTokensSaved: Math.round(savedBytes * TOKENS_PER_BYTE),
                wasProcessed: processedCount > 0
            }
        };
    }

    public async rightsizeInlineImagesAsync(
        text: string,
        worker: CpuWorkerBoundary,
        cancellation?: WorkCancellation
    ): Promise<{ text: string; stats: ImageRightsizeResult }> {
        if (!this.config.enabled) return { text, stats: this.emptyResult() };
        if (!text.includes('data:image/')) return { text, stats: this.emptyResult() };
        try {
            return await worker.rightsizeInlineImages({ text, config: {
                maxDimension: this.config.maxDimension,
                quality: this.config.quality,
                preserveVisualData: this.config.preserveVisualData
            } }, cancellation);
        } catch (error) {
            if (cancellation?.isCancellationRequested) throw error;
            // Worker failure is fail-open: preserve the visual payload rather than
            // repeating potentially expensive decoding on the extension host.
            return { text, stats: this.emptyResult() };
        }
    }

    /**
     * Scans text for image file references and replaces large ones with compact descriptions.
     * Useful for agentic tool outputs that dump full file paths to screenshots.
     */
    public rightsizeFileReferences(text: string, workspaceRoot?: string): { text: string; stats: ImageRightsizeResult } {
        if (!this.config.enabled || !workspaceRoot) {
            return { text, stats: this.emptyResult() };
        }

        let totalOriginalBytes = 0;
        let totalCompressedBytes = 0;
        let processedCount = 0;

        const processed = text.replace(IMAGE_FILE_REF_REGEX, (match, filePath) => {
            try {
                const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
                if (!this.isContained(workspaceRoot, absPath)) return match;
                if (!fs.existsSync(absPath)) return match;

                const stat = fs.statSync(absPath);
                totalOriginalBytes += stat.size;

                // Only rightsize images > 100KB
                if (stat.size < 100 * 1024) {
                    totalCompressedBytes += stat.size;
                    return match;
                }

                processedCount++;
                const sizeKB = Math.round(stat.size / 1024);
                const basename = path.basename(filePath);
                // Replace large image file reference with a compact description
                totalCompressedBytes += 100; // ~100 bytes for the replacement text
                return `[screenshot: ${basename} (${sizeKB}KB, rightsized)]`;
            } catch {
                return match;
            }
        });

        const savedBytes = totalOriginalBytes - totalCompressedBytes;
        return {
            text: processed,
            stats: {
                originalBytes: totalOriginalBytes,
                compressedBytes: totalCompressedBytes,
                reductionPercentage: totalOriginalBytes > 0 ? Math.round((savedBytes / totalOriginalBytes) * 100) : 0,
                estimatedTokensSaved: Math.round(savedBytes * TOKENS_PER_BYTE),
                wasProcessed: processedCount > 0
            }
        };
    }

    public async rightsizeFileReferencesAsync(text: string, workspaceRoot?: string, cancellation?: WorkCancellation): Promise<{ text: string; stats: ImageRightsizeResult }> {
        if (!this.config.enabled || !workspaceRoot) return { text, stats: this.emptyResult() };
        const regex = new RegExp(IMAGE_FILE_REF_REGEX.source, IMAGE_FILE_REF_REGEX.flags);
        let output = '';
        let cursor = 0;
        let originalBytes = 0;
        let compressedBytes = 0;
        let processedCount = 0;
        let inspected = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null && inspected++ < 32) {
            if (cancellation?.isCancellationRequested) throw new Error('IMAGE_WORK_CANCELLED');
            output += text.slice(cursor, match.index);
            cursor = match.index + match[0].length;
            let replacement = match[0];
            try {
                const candidate = match[1];
                const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(workspaceRoot, candidate);
                if (this.isContained(workspaceRoot, absolute)) {
                    const stat = await fs.promises.stat(absolute);
                    originalBytes += stat.size;
                    if (stat.size < 100 * 1024) compressedBytes += stat.size;
                    else {
                        processedCount++;
                        compressedBytes += 100;
                        replacement = `[screenshot: ${path.basename(candidate)} (${Math.round(stat.size / 1024)}KB, rightsized)]`;
                    }
                }
            } catch { /* Missing/unreadable references remain untouched. */ }
            output += replacement;
        }
        output += text.slice(cursor);
        const saved = originalBytes - compressedBytes;
        return { text: output, stats: { originalBytes, compressedBytes,
            reductionPercentage: originalBytes > 0 ? Math.round(saved / originalBytes * 100) : 0,
            estimatedTokensSaved: Math.round(saved * TOKENS_PER_BYTE), wasProcessed: processedCount > 0 } };
    }

    /**
     * Full pipeline: rightsize both inline images and file references in a single pass.
     */
    public rightsize(text: string, workspaceRoot?: string): { text: string; stats: ImageRightsizeResult } {
        const inline = this.rightsizeInlineImages(text);
        const fileRef = this.rightsizeFileReferences(inline.text, workspaceRoot);

        const totalOrig = inline.stats.originalBytes + fileRef.stats.originalBytes;
        const totalComp = inline.stats.compressedBytes + fileRef.stats.compressedBytes;
        return {
            text: fileRef.text,
            stats: {
                originalBytes: totalOrig,
                compressedBytes: totalComp,
                reductionPercentage: totalOrig > 0 ? Math.round(((totalOrig - totalComp) / totalOrig) * 100) : 0,
                estimatedTokensSaved: inline.stats.estimatedTokensSaved + fileRef.stats.estimatedTokensSaved,
                wasProcessed: inline.stats.wasProcessed || fileRef.stats.wasProcessed
            }
        };
    }

    public async rightsizeAsync(text: string, worker: CpuWorkerBoundary, workspaceRoot?: string, cancellation?: WorkCancellation): Promise<{ text: string; stats: ImageRightsizeResult }> {
        const inline = await this.rightsizeInlineImagesAsync(text, worker, cancellation);
        const fileRef = await this.rightsizeFileReferencesAsync(inline.text, workspaceRoot, cancellation);
        const totalOrig = inline.stats.originalBytes + fileRef.stats.originalBytes;
        const totalComp = inline.stats.compressedBytes + fileRef.stats.compressedBytes;
        return { text: fileRef.text, stats: {
            originalBytes: totalOrig, compressedBytes: totalComp,
            reductionPercentage: totalOrig > 0 ? Math.round(((totalOrig - totalComp) / totalOrig) * 100) : 0,
            estimatedTokensSaved: inline.stats.estimatedTokensSaved + fileRef.stats.estimatedTokensSaved,
            wasProcessed: inline.stats.wasProcessed || fileRef.stats.wasProcessed
        } };
    }

    private emptyResult(): ImageRightsizeResult {
        return { originalBytes: 0, compressedBytes: 0, reductionPercentage: 0, estimatedTokensSaved: 0, wasProcessed: false };
    }

    private isContained(root: string, candidate: string): boolean {
        const relative = path.relative(path.resolve(root), path.resolve(candidate));
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }
}
