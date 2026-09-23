/**
 * Tokonomics Context Intermediate Representation (IR) Engine
 * Manages discrete multi-resolution representation tiers (R_exclude to R5) for granular context compilation.
 */

import { TokenCounter } from '../engine/tokenizer';

export type ResolutionLevel = 'R_exclude' | 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export const RESOLUTION_LEVELS: ResolutionLevel[] = [
    'R_exclude',
    'R0',
    'R1',
    'R2',
    'R3',
    'R4',
    'R5'
];

export type RenderLocation = 'system' | 'history' | 'latest_user' | 'tool' | 'evidence';
export type ContextSensitivity = 'public' | 'workspace' | 'sensitive';

export interface ContextIRMetadata {
    provenance: readonly string[];
    renderLocation: RenderLocation;
    mandatory: boolean;
    minimumResolution: ResolutionLevel;
    dependencies: readonly string[];
    conflicts: readonly string[];
    freshness: string;
    sensitivity: ContextSensitivity;
    transformationHistory: readonly string[];
}

export interface ContextEntity {
    id: string;
    filePath: string;
    symbolName: string;
    kind: 'class' | 'interface' | 'function' | 'type' | 'enum' | 'struct' | 'module' | 'file';
    fullCode: string;
    docstring?: string;
    signatures: string[];
    calleeStubs?: string[];
    slicedCode?: string;
    provenanceOrigin?: string;
    baseUtility: number;
    metadata?: Partial<ContextIRMetadata>;
}

export interface RenderedResolution {
    level: ResolutionLevel;
    text: string;
    tokenCount: number;
    utility: number;
    risk: number;
    metadata: ContextIRMetadata;
}

export class ContextIRGenerator {
    private static readonly EMPTY_ARRAY: readonly string[] = Object.freeze([]);
    private static readonly resolutionCache = new WeakMap<ContextEntity, Map<ResolutionLevel, RenderedResolution>>();

    /**
     * Renders a specific resolution level for an entity
     */
    public renderResolution(entity: ContextEntity, level: ResolutionLevel, precomputedMetadata?: ContextIRMetadata): RenderedResolution {
        const metadata = precomputedMetadata || this.normalizeMetadata(entity);
        const baseUtil = (typeof entity.baseUtility === 'number' && Number.isFinite(entity.baseUtility))
            ? entity.baseUtility
            : 1.0;

        switch (level) {
            case 'R_exclude':
                return {
                    level: 'R_exclude',
                    text: '',
                    tokenCount: 0,
                    utility: 0.0,
                    risk: 0.0,
                    metadata
                };

            case 'R0': {
                // R0: Minimal Entity Reference Pointer
                const text = `// [Ref: ${entity.filePath}:${entity.symbolName}]`;
                return {
                    level: 'R0',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 0.15,
                    risk: 0.40,
                    metadata
                };
            }

            case 'R1': {
                // R1: Minimal Name Skeleton
                let text = '';
                if (entity.kind === 'class') {
                    text = `class ${entity.symbolName} { /* ... */ }`;
                } else if (entity.kind === 'interface') {
                    text = `interface ${entity.symbolName} { /* ... */ }`;
                } else if (entity.kind === 'function') {
                    text = `function ${entity.symbolName}(...): any;`;
                } else {
                    text = `type ${entity.symbolName} = any;`;
                }
                return {
                    level: 'R1',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 0.35,
                    risk: 0.25,
                    metadata
                };
            }

            case 'R2': {
                // R2: API Contract (Exported signatures + return types + docstrings)
                const doc = entity.docstring ? `${entity.docstring}\n` : '';
                const sigs = entity.signatures.join('\n');
                const text = `${doc}${sigs}`;
                return {
                    level: 'R2',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 0.75,
                    risk: 0.08,
                    metadata
                };
            }

            case 'R3': {
                // R3: API Contract + Callee Call-Site Stubs
                const doc = entity.docstring ? `${entity.docstring}\n` : '';
                const sigs = entity.signatures.join('\n');
                const stubs = entity.calleeStubs && entity.calleeStubs.length > 0 
                    ? `\n  // Key Dependencies Invoked:\n  // ${entity.calleeStubs.join('\n  // ')}` 
                    : '';
                const text = `${doc}${sigs}${stubs}`;
                return {
                    level: 'R3',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 0.88,
                    risk: 0.04,
                    metadata
                };
            }

            case 'R4': {
                // R4: Sliced Program Body (Backward slice along dependency chains)
                const text = entity.slicedCode && entity.slicedCode.trim().length > 0
                    ? entity.slicedCode
                    : entity.fullCode;
                return {
                    level: 'R4',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 0.96,
                    risk: 0.02,
                    metadata
                };
            }

            case 'R5': {
                // R5: Full Verbatim Source (Focal Active Code)
                const text = entity.fullCode;
                return {
                    level: 'R5',
                    text,
                    tokenCount: TokenCounter.countTokens(text),
                    utility: baseUtil * 1.0,
                    risk: 0.0,
                    metadata
                };
            }
        }
    }

    /**
     * Pre-computes and caches all 7 resolution representations for an entity
     */
    public generateAllResolutions(entity: ContextEntity, precomputedMetadata?: ContextIRMetadata): Map<ResolutionLevel, RenderedResolution> {
        const cached = ContextIRGenerator.resolutionCache.get(entity);
        if (cached) return cached;

        const metadata = precomputedMetadata || this.normalizeMetadata(entity);
        const resolutions = new Map<ResolutionLevel, RenderedResolution>();
        for (const level of RESOLUTION_LEVELS) {
            resolutions.set(level, this.renderResolution(entity, level, metadata));
        }
        ContextIRGenerator.resolutionCache.set(entity, resolutions);
        return resolutions;
    }

    private static readonly DEFAULT_METADATA: ContextIRMetadata = Object.freeze({
        provenance: Object.freeze(['request']),
        renderLocation: 'evidence',
        mandatory: false,
        minimumResolution: 'R0',
        dependencies: ContextIRGenerator.EMPTY_ARRAY,
        conflicts: ContextIRGenerator.EMPTY_ARRAY,
        freshness: 'request',
        sensitivity: 'workspace',
        transformationHistory: Object.freeze(['ingested'])
    });

    public normalizeMetadata(entity: ContextEntity): ContextIRMetadata {
        const input = entity.metadata;
        if (!input) {
            if (!entity.provenanceOrigin) {
                return ContextIRGenerator.DEFAULT_METADATA;
            }
            return Object.freeze({
                provenance: Object.freeze([entity.provenanceOrigin]),
                renderLocation: 'evidence',
                mandatory: false,
                minimumResolution: 'R0',
                dependencies: ContextIRGenerator.EMPTY_ARRAY,
                conflicts: ContextIRGenerator.EMPTY_ARRAY,
                freshness: 'request',
                sensitivity: 'workspace',
                transformationHistory: Object.freeze(['ingested'])
            });
        }
        return Object.freeze({
            provenance: Object.freeze([...(input.provenance || (entity.provenanceOrigin ? [entity.provenanceOrigin] : ['request']))]),
            renderLocation: input.renderLocation || 'evidence',
            mandatory: input.mandatory === true,
            minimumResolution: input.minimumResolution || 'R0',
            dependencies: input.dependencies && input.dependencies.length > 0 ? Object.freeze([...input.dependencies]) : ContextIRGenerator.EMPTY_ARRAY,
            conflicts: input.conflicts && input.conflicts.length > 0 ? Object.freeze([...input.conflicts]) : ContextIRGenerator.EMPTY_ARRAY,
            freshness: input.freshness || 'request',
            sensitivity: input.sensitivity || 'workspace',
            transformationHistory: input.transformationHistory && input.transformationHistory.length > 0 ? Object.freeze([...input.transformationHistory]) : Object.freeze(['ingested'])
        });
    }
}
