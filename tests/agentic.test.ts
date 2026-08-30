import { AgenticToolCompactor } from '../src/engine/agenticCompactor';
import { CrossTurnDeduplicator } from '../src/engine/deduplicator';
import { ToolSchemaMinifier } from '../src/cache/schemaMinifier';
import { MessagePayload } from '../src/types';
import * as assert from 'assert';

export async function runAgenticTests() {
    console.log('\n--- Running Agentic History & Tool Output Tests ---');

    // 1. Agentic Tool History Condenser Test
    let largeToolLines = 'File Path: src/auth.ts\nTotal Lines: 60\n';
    for (let i = 1; i <= 40; i++) {
        largeToolLines += `<${i}>: const line_${i} = "data_${i}";\n`;
    }

    const multiTurnSession: MessagePayload[] = [
        { role: 'user', content: 'Please inspect auth.ts and tell me the method names.' },
        { role: 'assistant', content: largeToolLines },
        { role: 'user', content: 'Now please refactor the validateSession method.' },
        { role: 'assistant', content: 'Here is the refactored code.' }
    ];

    const agenticResult = AgenticToolCompactor.compactToolHistory(multiTurnSession, 2);
    console.log(`[Agentic Tool Compactor] Original: ${agenticResult.originalTokens} -> Compacted: ${agenticResult.compactedTokens} (${agenticResult.savedTokens} tokens saved)`);
    assert.ok(agenticResult.savedTokens > 50, 'Expected tool output condensation in older turns');
    assert.ok(agenticResult.compactedMessages[1].content.includes('pruned from historical turn'), 'Should contain condensation note');
    console.log('✓ Agentic Tool Output Condenser verified.');

    // 2. Cross-Turn Code Deduplication Test
    const duplicateCode = `\`\`\`typescript\n` + 'export const CONST_VAL = 1;\n'.repeat(15) + `\`\`\``;
    const historyWithDuplicates: MessagePayload[] = [
        { role: 'user', content: `Here is the module:\n${duplicateCode}` },
        { role: 'assistant', content: `Understood.` },
        { role: 'user', content: `Reviewing the same module again:\n${duplicateCode}` }
    ];

    const dedupResult = CrossTurnDeduplicator.deduplicateMessages(historyWithDuplicates);
    console.log(`[Code Deduplicator] Original: ${dedupResult.originalTokens} -> Deduplicated: ${dedupResult.deduplicatedTokens} (${dedupResult.savedTokens} tokens saved)`);
    assert.ok(dedupResult.duplicatesReplacedCount >= 1, 'Should find duplicate code snippet');
    assert.ok(dedupResult.messages[2].content.includes('Duplicate Code Block Pruned'), 'Should insert pointer marker');
    console.log('✓ Cross-Turn Code Deduplicator verified.');

    // 3. Enhanced MCP Schema Compressor Tests (3 levels)
    const toolSchemaWithExtras = {
        name: "execute_query",
        description: "This is an extremely long verbose description explaining how to execute queries against the SQL database with dozens of unnecessary words that waste tokens and bloat context.",
        parameters: {
            type: "object",
            properties: {
                sql: { type: "string", description: "The SQL statement to execute against the database engine." },
                timeout: { type: "number", description: "Timeout in milliseconds.", default: 5000 },
                format: {
                    type: "string",
                    description: "Output format for results.",
                    enum: ["json", "csv", "xml", "parquet", "avro", "protobuf", "msgpack"],
                    examples: ["json", "csv"]
                }
            },
            required: ["sql"],
            additionalProperties: true
        }
    };

    // Test LOW level
    const lowResult = ToolSchemaMinifier.minifyToolSchemas(toolSchemaWithExtras, 'low');
    console.log(`[Schema LOW] Original: ${lowResult.originalTokens} -> Minified: ${lowResult.minifiedTokens} (${lowResult.savedTokens} saved)`);
    assert.ok(lowResult.savedTokens > 3, 'LOW should truncate long descriptions');
    assert.ok(lowResult.minifiedSchema.includes('...'), 'LOW should have truncated description');
    console.log('✓ MCP Schema Compression [LOW] verified.');

    // Test MEDIUM level
    const medResult = ToolSchemaMinifier.minifyToolSchemas(toolSchemaWithExtras, 'medium');
    console.log(`[Schema MEDIUM] Original: ${medResult.originalTokens} -> Minified: ${medResult.minifiedTokens} (${medResult.savedTokens} saved)`);
    assert.ok(medResult.savedTokens > lowResult.savedTokens, 'MEDIUM should save more than LOW');
    assert.ok(!medResult.minifiedSchema.includes('"default"'), 'MEDIUM should strip defaults');
    assert.ok(!medResult.minifiedSchema.includes('"examples"'), 'MEDIUM should strip examples');
    assert.ok(medResult.minifiedSchema.includes('"...(4 more)"'), 'MEDIUM should truncate long enums');
    assert.ok(medResult.minifiedSchema.includes('"sql"'), 'Should preserve parameter keys');
    console.log('✓ MCP Schema Compression [MEDIUM] verified.');

    // Test HIGH level with meta-tool collapse (>15 tools)
    const manyTools = [];
    for (let i = 0; i < 20; i++) {
        manyTools.push({
            name: `tool_${i}`,
            description: `A tool that does operation number ${i} with various complex parameters and nested schemas.`,
            parameters: {
                type: "object",
                properties: {
                    input: { type: "string", description: `Input for tool ${i}` },
                    options: { type: "object", description: "Options object with many fields", default: {} }
                }
            }
        });
    }
    const highResult = ToolSchemaMinifier.minifyToolSchemas(manyTools, 'high');
    console.log(`[Schema HIGH] ${manyTools.length} tools -> Meta-tool: ${highResult.minifiedTokens} tokens (${highResult.savedTokens} saved, collapsed: ${highResult.collapsedToMetaTool})`);
    assert.ok(highResult.collapsedToMetaTool, 'HIGH should collapse >15 tools to meta-tool');
    assert.ok(highResult.minifiedSchema.includes('call_tool'), 'Should contain call_tool meta-tool');
    assert.ok(highResult.savedTokens > 200, 'HIGH should save substantial tokens from 20 tools');
    console.log('✓ MCP Schema Compression [HIGH / Meta-Tool Collapse] verified.');
}

