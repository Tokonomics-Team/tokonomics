/**
 * Enhanced MCP Tool Schema Compressor v4.0
 * 
 * Compression levels for MCP/Tool-calling JSON schemas:
 *   - "off":      No schema compression
 *   - "low":      Strip verbose descriptions only (>80 chars truncated)
 *   - "medium":   Strip descriptions + enum truncation + remove defaults/examples
 *   - "high":     Collapse all tools into a single meta-tool when >15 tools registered
 *   - "deferred": Code-mode on-demand resolution (suppresses full schemas, provides list_tools, get_tool_schema, call_tool)
 * 
 * Designed to combat MCP "context bloat" where tool definitions consume 30-50%
 * of the context budget before reasoning even begins.
 */

import { TokenCounter } from '../engine/tokenizer';

export type SchemaCompressionLevel = 'off' | 'low' | 'medium' | 'high' | 'deferred';

export interface MinifiedSchemaResult {
    minifiedSchema: string;
    originalTokens: number;
    minifiedTokens: number;
    savedTokens: number;
    compressionLevel: SchemaCompressionLevel;
    toolCount: number;
    collapsedToMetaTool: boolean;
}

const MAX_ENUM_VALUES = 3;
const LOW_DESC_LIMIT = 80;
const META_TOOL_THRESHOLD = 15;

export class ToolSchemaMinifier {
    private static toolRegistry: Map<string, any> = new Map();

    /**
     * Registers tools for deferred on-demand resolution.
     */
    public static registerTools(tools: any[]): void {
        for (const tool of tools) {
            const name = tool.name || tool.function?.name;
            if (name) {
                this.toolRegistry.set(name, tool);
            }
        }
    }

    /**
     * Resolves a single tool schema on-demand by name.
     */
    public static getToolSchema(toolName: string, level: SchemaCompressionLevel = 'medium'): any | null {
        const tool = this.toolRegistry.get(toolName);
        if (!tool) return null;
        return this.compressTool(tool, level);
    }

    /**
     * Minifies one or more tool JSON schemas at the specified compression level.
     */
    public static minifyToolSchemas(
        schemaInput: any,
        level: SchemaCompressionLevel = 'medium'
    ): MinifiedSchemaResult {
        const rawJson = typeof schemaInput === 'string'
            ? schemaInput
            : JSON.stringify(schemaInput, null, 2);
        const originalTokens = TokenCounter.countTokens(rawJson);

        if (level === 'off') {
            return {
                minifiedSchema: rawJson,
                originalTokens,
                minifiedTokens: originalTokens,
                savedTokens: 0,
                compressionLevel: 'off',
                toolCount: this.countTools(schemaInput),
                collapsedToMetaTool: false
            };
        }

        try {
            const parsed = typeof schemaInput === 'string'
                ? JSON.parse(schemaInput)
                : schemaInput;

            const tools = this.normalizeToToolArray(parsed);
            this.registerTools(tools);
            const toolCount = tools.length;

            // DEFERRED level: Code-mode on-demand resolution
            if (level === 'deferred') {
                return this.generateDeferredMetaTools(tools, originalTokens);
            }

            // HIGH level: If too many tools, collapse to meta-tool
            if (level === 'high' && toolCount > META_TOOL_THRESHOLD) {
                return this.collapseToMetaTool(tools, originalTokens);
            }

            // Apply per-tool compression
            const compressed = tools.map(tool => this.compressTool(tool, level));
            const output = Array.isArray(parsed) ? compressed
                : (tools.length === 1 ? compressed[0] : compressed);

            const minifiedJson = JSON.stringify(output);
            const minifiedTokens = TokenCounter.countTokens(minifiedJson);

            return {
                minifiedSchema: minifiedJson,
                originalTokens,
                minifiedTokens,
                savedTokens: Math.max(0, originalTokens - minifiedTokens),
                compressionLevel: level,
                toolCount,
                collapsedToMetaTool: false
            };
        } catch (e) {
            const compacted = rawJson.replace(/\s+/g, ' ');
            const minifiedTokens = TokenCounter.countTokens(compacted);
            return {
                minifiedSchema: compacted,
                originalTokens,
                minifiedTokens,
                savedTokens: Math.max(0, originalTokens - minifiedTokens),
                compressionLevel: level,
                toolCount: 0,
                collapsedToMetaTool: false
            };
        }
    }

    private static compressTool(tool: any, level: SchemaCompressionLevel): any {
        if (!tool || typeof tool !== 'object') return tool;
        const result: any = {};

        for (const [key, val] of Object.entries(tool)) {
            if (key === 'description' && typeof val === 'string') {
                if (val.length > LOW_DESC_LIMIT) {
                    result[key] = val.substring(0, LOW_DESC_LIMIT - 3).trimEnd() + '...';
                } else {
                    result[key] = val;
                }
                continue;
            }

            if (level === 'medium' || level === 'high' || level === 'deferred') {
                if (key === '$schema' || key === 'additionalProperties' || key === 'title' || key === 'examples' || key === 'example' || key === 'default') {
                    continue;
                }
            }

            if (key === 'parameters' || key === 'inputSchema' || key === 'properties'
                || key === 'items' || key === 'allOf' || key === 'oneOf' || key === 'anyOf') {
                result[key] = this.compressSchemaNode(val, level);
                continue;
            }

            if (key === 'enum' && Array.isArray(val) && val.length > MAX_ENUM_VALUES
                && (level === 'medium' || level === 'high' || level === 'deferred')) {
                const truncated = val.slice(0, MAX_ENUM_VALUES);
                truncated.push(`...(${val.length - MAX_ENUM_VALUES} more)`);
                result[key] = truncated;
                continue;
            }

            result[key] = val;
        }

        return result;
    }

    private static compressSchemaNode(node: any, level: SchemaCompressionLevel): any {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            return node.map(item => this.compressSchemaNode(item, level));
        }

        const result: any = {};
        for (const [key, val] of Object.entries(node)) {
            if (key === 'description' && typeof val === 'string') {
                if (level === 'medium' || level === 'high' || level === 'deferred') {
                    continue;
                }
                if (val.length > LOW_DESC_LIMIT) {
                    result[key] = val.substring(0, LOW_DESC_LIMIT - 3).trimEnd() + '...';
                } else {
                    result[key] = val;
                }
                continue;
            }

            if ((level === 'medium' || level === 'high' || level === 'deferred') &&
                (key === 'examples' || key === 'example' || key === 'default' || key === '$schema' || key === 'title' || key === 'additionalProperties')) {
                continue;
            }

            if (key === 'enum' && Array.isArray(val) && val.length > MAX_ENUM_VALUES
                && (level === 'medium' || level === 'high' || level === 'deferred')) {
                const truncated = val.slice(0, MAX_ENUM_VALUES);
                truncated.push(`...(${val.length - MAX_ENUM_VALUES} more)`);
                result[key] = truncated;
                continue;
            }

            if (typeof val === 'object') {
                result[key] = this.compressSchemaNode(val, level);
            } else {
                result[key] = val;
            }
        }

        return result;
    }

    /**
     * DEFERRED Code-Mode: Generates 3 foundational meta-tools (list_tools, get_tool_schema, call_tool).
     */
    private static generateDeferredMetaTools(tools: any[], originalTokens: number): MinifiedSchemaResult {
        const catalog = tools.map(t => {
            const name = t.name || t.function?.name || 'unknown';
            const desc = t.description || t.function?.description || '';
            const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
            return `${name}: ${shortDesc}`;
        });

        const metaTools = [
            {
                name: "list_tools",
                description: `List available tools in catalog (${tools.length} tools registered). Catalog summary: [${catalog.join('; ')}]`,
                parameters: { type: "object", properties: {} }
            },
            {
                name: "get_tool_schema",
                description: "Retrieve complete JSON parameter schema on-demand for a specific tool name",
                parameters: {
                    type: "object",
                    properties: { tool_name: { type: "string", description: "Target tool name" } },
                    required: ["tool_name"]
                }
            },
            {
                name: "call_tool",
                description: "Execute a tool by name with arguments",
                parameters: {
                    type: "object",
                    properties: {
                        tool_name: { type: "string" },
                        arguments: { type: "object" }
                    },
                    required: ["tool_name", "arguments"]
                }
            }
        ];

        const minifiedJson = JSON.stringify(metaTools);
        const minifiedTokens = TokenCounter.countTokens(minifiedJson);

        return {
            minifiedSchema: minifiedJson,
            originalTokens,
            minifiedTokens,
            savedTokens: Math.max(0, originalTokens - minifiedTokens),
            compressionLevel: 'deferred',
            toolCount: tools.length,
            collapsedToMetaTool: true
        };
    }

    private static collapseToMetaTool(tools: any[], originalTokens: number): MinifiedSchemaResult {
        const catalog = tools.map(t => {
            const name = t.name || t.function?.name || 'unknown';
            const desc = t.description || t.function?.description || '';
            const shortDesc = desc.length > 60 ? desc.substring(0, 57) + '...' : desc;
            return `${name}: ${shortDesc}`;
        });

        const metaTool = {
            name: "call_tool",
            description: `Meta-tool: invoke any of ${tools.length} available tools by name. Available: [${catalog.join('; ')}]`,
            parameters: {
                type: "object",
                properties: {
                    tool_name: { type: "string", description: "Name of the tool to invoke" },
                    arguments: { type: "object", description: "Arguments object to pass to the tool" }
                },
                required: ["tool_name", "arguments"]
            }
        };

        const minifiedJson = JSON.stringify(metaTool);
        const minifiedTokens = TokenCounter.countTokens(minifiedJson);

        return {
            minifiedSchema: minifiedJson,
            originalTokens,
            minifiedTokens,
            savedTokens: Math.max(0, originalTokens - minifiedTokens),
            compressionLevel: 'high',
            toolCount: tools.length,
            collapsedToMetaTool: true
        };
    }

    private static normalizeToToolArray(input: any): any[] {
        if (Array.isArray(input)) return input;
        if (input.tools && Array.isArray(input.tools)) return input.tools;
        return [input];
    }

    private static countTools(input: any): number {
        try {
            const parsed = typeof input === 'string' ? JSON.parse(input) : input;
            return this.normalizeToToolArray(parsed).length;
        } catch {
            return 0;
        }
    }
}
