import { TextCompressorEngine } from '../src/engine/compress';
import { ConversationalCompactor } from '../src/engine/compactor';
import { MessagePayload } from '../src/types';
import * as assert from 'assert';

export async function runCompressTests() {
    console.log('\n--- Running Compression & Compaction Tests ---');

    // Test 1: Natural Language Compression
    const verboseDoc = `
# Enterprise Token Optimization Guide

Please note that it is definitely worth noting that Large Language Models are essentially transformational.
Furthermore, obviously we can clearly see that input prefill tokens represent literally 80% of total API expenditures.
In order to optimize these costs, we should certainly employ AST structural pruning.

\`\`\`typescript
export function optimizeContext(payload: string): string {
    return payload.trim();
}
\`\`\`

Consequently, as mentioned earlier, we can dramatically reduce enterprise AI operational expenditures.
`;

    const compressResult = TextCompressorEngine.compressText(verboseDoc, 0.4);
    console.log(`[Compress Test] Original: ${compressResult.originalTokens} tokens -> Compressed: ${compressResult.compressedTokens} tokens (${compressResult.reductionPercentage}% reduction)`);

    assert.ok(compressResult.reductionPercentage > 15, 'Expected token reduction on verbose text');
    assert.ok(compressResult.compressedText.includes('export function optimizeContext'), 'Should preserve code block untouched');
    assert.ok(compressResult.compressedText.includes('# Enterprise Token Optimization Guide'), 'Should preserve markdown header');
    assert.ok(!compressResult.compressedText.includes('it is definitely worth noting that'), 'Should strip wordy filler phrase');
    console.log('✓ Semantic text compression verified.');

    // Test 2: Conversational Diff & Log Compaction
    const chatHistory: MessagePayload[] = [
        { role: 'user', content: 'Here are the build error logs and git diff' },
        { 
            role: 'assistant', 
            content: `Here is the git diff:
diff --git a/src/index.ts b/src/index.ts
index 1234567..89abcdef 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,5 @@
-const a = 1;
+const a = 2;
+const b = 3;
+const c = 4;
+const d = 5;
+const e = 6;
+const f = 7;
+const g = 8;
+const h = 9;
+const i = 10;
+const j = 11;
+const k = 12;
+const l = 13;
+const m = 14;
+const n = 15;
+const o = 16;
+const p = 17;
+const q = 18;
+const r = 19;
+const s = 20;
+const t = 21;
+const u = 22;
+const v = 23;
+const w = 24;
+const x = 25;
+const y = 26;
+const z = 27;
` 
        }
    ];

    const compactResult = ConversationalCompactor.compactHistory(chatHistory, 4, true);
    console.log(`[Compactor Test] Original: ${compactResult.originalTokens} tokens -> Compacted: ${compactResult.compactedTokens} tokens (${compactResult.savedTokens} tokens saved)`);

    assert.ok(compactResult.wasCompacted, 'Should compact verbose git diff');
    assert.ok(compactResult.compactedHistory[1].content.includes('diff lines pruned'), 'Should insert diff summary note');
    console.log('✓ Conversational diff and log compaction verified.');
}
