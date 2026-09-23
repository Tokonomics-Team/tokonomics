/**
 * Audit Remediation Regression Suite
 *
 * Locks in the corrections made in response to the independent v7.0.1 architecture audit.
 * Each block names the finding it closes so a future regression is traceable to the defect it
 * reintroduces rather than to an anonymous assertion.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineOrchestrator } from '../src/engine/pipelineOrchestrator';
import { ComponentRegistry } from '../src/engine/componentRegistry';
import { OPTIMIZATION_PROFILES } from '../src/config/userPreferences';
import { InlineEvidenceClassifier } from '../src/governor/inlineEvidenceClassifier';
import { ConservativePathCompressor } from '../src/compression/conservativePathCompressor';
import { createPrefixStableKeywordResolver, deriveKeywords } from '../src/engine/prefixContinuity';
import { resolveDeferredStageReceipts, extractInstructionText, applyConservativeReduction } from '../src/engine/safePathPolicy';
import { buildRetrievalRenderDecisions, resolveRetrievalRenderDecision, shortfallAttribute } from '../src/engine/retrievalRenderPolicy';
import { maskObservations } from '../src/compression/observationMasking';
import { DeterministicLocalEmbeddingProvider } from '../src/search/embeddingProvider';
import { NetworkAuditEngine } from '../src/evaluation/networkAuditEngine';
import { OracleAuditEngine } from '../validation/audit/oracleAuditEngine';
import { PreservationGate } from '../src/evaluation/preservationGate';
import { DeterministicContextGovernor } from '../src/governor/contextGovernor';
import { resolveTaskCompressionPolicy } from '../src/engine/taskCompressionPolicy';

const LONG_FUNCTION = 'export function computeInvoiceTotal(items: Item[]): number {\n'
    + Array.from({ length: 60 }, (_, i) => `    const line${i} = items[${i}].price * items[${i}].qty;`).join('\n')
    + '\n    return 0;\n}';

export async function runAuditRemediationTests(): Promise<void> {
    console.log('\n--- Running Audit Remediation Regression Tests (TOK-001 - TOK-007) ---');

    // ---------------------------------------------------------------------
    // TOK-002: contribution receipts must describe the payload actually sent
    // ---------------------------------------------------------------------
    {
        const restoredReceipts = resolveDeferredStageReceipts(
            [{ component: 'context_solver', changedOutput: true }, { component: 'sdg_slicing', changedOutput: false }],
            [{ role: 'user', content: 'original' }],
            [{ role: 'user', content: 'original' }],
            true
        );
        assert.deepStrictEqual(restoredReceipts.map(r => r.outcome), ['fallback', 'fallback'],
            'A stage reverted by a restore must never record a contribution');
        assert.strictEqual(restoredReceipts[0].reason, 'restored_by_preservation_gate');
        assert.strictEqual(restoredReceipts[1].reason, 'no_output_effect');

        const survivingReceipts = resolveDeferredStageReceipts(
            [{ component: 'context_solver', changedOutput: true }],
            [{ role: 'user', content: 'original long content' }],
            [{ role: 'user', content: 'reduced' }],
            false
        );
        assert.strictEqual(survivingReceipts[0].outcome, 'contributed',
            'A stage whose effect survives to the emitted payload must still record a contribution');

        // End to end: a fail-closed request must carry zero contribution receipts for compiler stages.
        const orchestrator = new PipelineOrchestrator();
        const result = await orchestrator.compileContext({
            messages: [
                { role: 'user', content: 'Here is the module:\n\n```typescript\n' + LONG_FUNCTION + '\n```' },
                { role: 'assistant', content: 'Understood.' },
                { role: 'user', content: 'Fix the rounding bug in computeInvoiceTotal.' }
            ],
            sessionId: 's', targetProvider: 'anthropic', targetModel: 'claude-3-5-sonnet', deferSideEffects: true
        } as any);
        if (result.event.fallbackReasons.includes('preservation_gate_restored_original_content')) {
            const compilerStages = new Set(['context_solver', 'sdg_slicing', 'sufficiency_engine', 'rule_compression', 'cache_planner']);
            const overclaimed = result.receipts.filter(r => compilerStages.has(r.componentId) && r.outcome === 'contributed');
            assert.deepStrictEqual(overclaimed, [],
                'A restored payload must not carry compiler-stage contribution receipts');
        }
        console.log('  ✓ TOK-002: contribution receipts are bound to the emitted payload, not intermediate work.');
    }

    // ---------------------------------------------------------------------
    // TOK-001: every 'conditional' component must be reachable
    // ---------------------------------------------------------------------
    {
        const consentReachable = new Set(['enableProjectMemory']);
        const profiles = (['off', 'balanced', 'maximum'] as const).map(mode =>
            OPTIMIZATION_PROFILES[mode].featureFlags as unknown as Record<string, unknown>);
        const unreachable = ComponentRegistry.definitions()
            .filter(d => d.integrationState === 'conditional' && d.featureFlag)
            .filter(d => !consentReachable.has(d.featureFlag as string))
            .filter(d => !profiles.some(flags => flags[d.featureFlag as string] === true))
            .map(d => d.id);
        assert.deepStrictEqual(unreachable, [],
            'Components declared conditional must be enableable through a supported user action');

        // Balanced must stay on the conservative, longer-certified path.
        const balanced = OPTIMIZATION_PROFILES.balanced.featureFlags;
        assert.strictEqual(balanced.enableLspIntelligence, false, 'Balanced must not silently enable deep workspace analysis');
        assert.strictEqual(balanced.enableDenseEmbeddings, false);
        assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableLspIntelligence, true,
            'Maximum Savings is the supported way to reach the deep analysis stages');
        console.log('  ✓ TOK-001: all conditional components reachable; Balanced remains conservative.');
    }

    // ---------------------------------------------------------------------
    // TOK-003: the oracle audit must verify declarations, not assert them
    // ---------------------------------------------------------------------
    {
        const report = OracleAuditEngine.auditAllSubsystems();
        assert.strictEqual(report.unresolvedDeclarationCount, 0,
            'Every declared oracle implementation path must resolve against this commit');
        for (const entry of report.entries) {
            for (const declaration of [entry.implementationUnderTest, entry.oracleImplementation]) {
                for (const candidate of declaration.split('&').map(part => part.trim().split(/\s+/)[0])) {
                    if (!/\.[cm]?tsx?$/.test(candidate)) continue;
                    assert.ok(fs.existsSync(path.resolve(process.cwd(), candidate)),
                        `Oracle matrix declares a path that does not exist: ${candidate}`);
                }
            }
        }
        assert.ok(report.auditPassed, 'Oracle audit must pass on a clean tree');
        console.log(`  ✓ TOK-003: oracle audit resolves all ${report.totalSuitesAudited} declarations against the filesystem.`);
    }

    // ---------------------------------------------------------------------
    // TOK-007: zero-egress evidence must cover the shipped bundle
    // ---------------------------------------------------------------------
    {
        const bundle = NetworkAuditEngine.auditProductionBundle();
        if (bundle.bundleFound) {
            assert.deepStrictEqual(bundle.unexplainedOccurrences, [],
                'The shipped bundle must contain no network primitive outside the WASM loader exception');
            console.log(`  ✓ TOK-007: production bundle audited (${bundle.occurrences} loader references, 0 unexplained).`);
        } else {
            console.log('  · TOK-007: bundle not built in this run; source-level audit still applies.');
        }
    }

    // ---------------------------------------------------------------------
    // Inline evidence classification must under-claim, never over-claim
    // ---------------------------------------------------------------------
    {
        // The historical defect: the word "Error" appearing anywhere (including inside source)
        // was treated as proof that a stack trace had been supplied.
        const sourceWithThrow = '```typescript\nfunction f() { throw new Error("Duplicate transaction"); }\n```';
        assert.ok(!InlineEvidenceClassifier.classify([sourceWithThrow]).categories.includes('errorStackTrace'),
            'A throw statement in source is not a stack trace');

        const realTrace = '```\nTypeError: cannot read x\n    at compute (/repo/src/a.ts:41:32)\n    at main (/repo/src/b.ts:8:1)\n```';
        assert.ok(InlineEvidenceClassifier.classify([realTrace]).categories.includes('errorStackTrace'),
            'A genuine stack trace must be recognised');

        assert.ok(!InlineEvidenceClassifier.classify(['Just refactor it please']).categories.includes('tests'),
            'The word "test" alone is not test evidence');
        assert.ok(InlineEvidenceClassifier.classify([
            '```typescript\ndescribe("x", () => { it("works", () => { expect(f()).toBe(1); }); });\n```'
        ]).categories.includes('tests'), 'A real test block must be recognised');

        // Categories that only workspace retrieval can establish must never be claimed inline.
        const everything = InlineEvidenceClassifier.classify([realTrace, sourceWithThrow]);
        for (const forbidden of ['callers', 'callees', 'architecture']) {
            assert.ok(!everything.categories.includes(forbidden as any),
                `${forbidden} cannot be established from inline content and must never be claimed`);
        }
        assert.deepStrictEqual(InlineEvidenceClassifier.classify([]).categories, [],
            'Empty input must yield no categories so the gate keeps failing closed');
        console.log('  ✓ Inline evidence classification under-claims: no fabricated categories.');
    }

    // ---------------------------------------------------------------------
    // Intent must come from the instruction, not from attached code
    // ---------------------------------------------------------------------
    {
        const withCode = 'Refactor payment flow.\n\n```typescript\ntry { commit(); } catch (e) { throw new Error("fail"); }\n```';
        assert.strictEqual(extractInstructionText(withCode), 'Refactor payment flow.',
            'Fenced code must not contribute to intent classification');
        assert.strictEqual(extractInstructionText('```only code```'), '```only code```',
            'A code-only payload must fall back to the full text rather than an empty instruction');

        const orchestrator = new PipelineOrchestrator();
        const result = await orchestrator.compileContext({
            messages: [{ role: 'user', content: withCode }],
            targetProvider: 'openai', userIntent: 'edit', deferSideEffects: true
        } as any);
        assert.strictEqual(result.governorDecision.taskType, 'refactor',
            'A refactor request must not be classified as debug because its code contains error handling');
        console.log('  ✓ Task intent is derived from the user instruction, not from attached source.');
    }

    // ---------------------------------------------------------------------
    // Quality calibration: task-aware bodies and control-flow preservation
    // ---------------------------------------------------------------------
    {
        const source = `export function authorize(user: User) {
    if (!user.active) return false;
    try {
        return checkPolicy(user);
    } catch (error) {
        throw new Error('authorization failed');
    }
}`;
        const original = [{ role: 'user' as const, content: `Review edge cases.\n\n\`\`\`typescript\n${source}\n\`\`\`` }];
        const skeleton = [{ role: 'user' as const, content: 'Review edge cases.\n\n```typescript\nexport function authorize(user: User): boolean;\n```' }];
        // Appending evidence to a message that carries a fenced block inside a single-line JSON
        // attachment must not read as dropping the instruction. The gate stripped fences from the
        // original only, splicing that line's two halves into a string that cannot appear in any
        // output, so it failed closed on a payload containing the instruction verbatim - and the
        // restore threw away every retrieved file with it, on every turn the editor attached its
        // skills list.
        const attachedSkills = 'Analyze the current project.\n\nAttached context 1: skills\n'
            + '{"text":"# Available VS Code skills\\n```text\\nUse the editor skill\\n```"}';
        const withSkills = [{ role: 'user' as const, content: attachedSkills }];
        const withEvidence = [{ role: 'user' as const, content: attachedSkills
            + '\n\n<tokonomics-evidence snapshot="1">\nexport const CATALOG = 1;\n</tokonomics-evidence>' }];
        assert.ok(withEvidence[0].content.includes(withSkills[0].content), 'The fixture must append, never remove');
        assert.strictEqual(PreservationGate.evaluate(withSkills, withEvidence, 'question', []).passed, true,
            'A payload carrying the instruction verbatim must pass, fenced attachment or not');
        // The invariant itself must still fail closed when the instruction is genuinely gone.
        assert.strictEqual(PreservationGate.evaluate(withSkills,
            [{ role: 'user' as const, content: 'unrelated replacement text that keeps none of the request' }], 'question', []).passed,
            false, 'Dropping the instruction must still fail closed');

        const reviewGate = PreservationGate.evaluate(original, skeleton, 'review');
        assert.strictEqual(reviewGate.passed, false,
            'Review compression must fail closed when implementation control flow disappears');
        assert.strictEqual(reviewGate.controlFlowRetention, 0);
        assert.ok(reviewGate.missingItems.some(item => item.includes('control flow retention')));

        const genericExplainGate = PreservationGate.evaluate(
            [{ role: 'user', content: `Explain how the main flow works.\n\n\`\`\`typescript\n${source}\n\`\`\`` }],
            [{ role: 'user', content: 'Explain how the main flow works.\n\n```typescript\nexport function authorize(user: User): boolean;\n```' }],
            'explain'
        );
        assert.strictEqual(genericExplainGate.passed, false,
            'Behavior explanations must not be reduced to signature skeletons');

        const governor = DeterministicContextGovernor.getInstance();
        const balanced = governor.evaluateContext({ userPrompt: 'Explain the public API signatures.', optimizationMode: 'balanced' });
        const maximum = governor.evaluateContext({ userPrompt: 'Explain the public API signatures.', optimizationMode: 'maximum' });
        assert.strictEqual(balanced.optimizationAggressiveness, 'balanced');
        assert.strictEqual(maximum.optimizationAggressiveness, 'aggressive');
        assert.strictEqual(resolveTaskCompressionPolicy(balanced, 'balanced', 'Explain the public API signatures.').minimumResolution, 'R3');
        assert.strictEqual(resolveTaskCompressionPolicy(maximum, 'maximum', 'Explain the public API signatures.').minimumResolution, 'R2');

        const reviewDecision = governor.evaluateContext({ userPrompt: 'Review this for edge cases.', optimizationMode: 'maximum' });
        assert.strictEqual(resolveTaskCompressionPolicy(reviewDecision, 'maximum', 'Review this for edge cases.').minimumResolution, 'R5',
            'Review always retains full implementation bodies regardless of savings mode');
        const flowExplanation = 'Explain what this module does and how the main flow works.';
        const balancedFlow = governor.evaluateContext({ userPrompt: flowExplanation, optimizationMode: 'balanced' });
        const maximumFlow = governor.evaluateContext({ userPrompt: flowExplanation, optimizationMode: 'maximum' });
        assert.strictEqual(resolveTaskCompressionPolicy(balancedFlow, 'balanced', flowExplanation).minimumResolution, 'R5');
        assert.strictEqual(resolveTaskCompressionPolicy(maximumFlow, 'maximum', flowExplanation).minimumResolution, 'R4',
            'Maximum may attempt a slice, which the 95% flow gate must still approve');
        console.log('  ✓ Task-aware compression and control-flow fail-closed calibration are enforced.');
    }

    // ---------------------------------------------------------------------
    // Conservative path: cheaper, never less safe
    // ---------------------------------------------------------------------
    {
        // Each rule is asserted on its own so a regression names the rule that broke.
        const trailing = ConservativePathCompressor.compress('alpha   \nbeta\t\n');
        assert.ok(trailing.appliedRules.includes('trailing_whitespace'));
        assert.ok(trailing.text.length < 'alpha   \nbeta\t\n'.length, 'Trailing whitespace must shrink the payload');

        const blanks = ConservativePathCompressor.compress(['a', '', '', '', '', '', 'b'].join('\n'));
        assert.ok(blanks.appliedRules.includes('blank_line_runs'));
        assert.strictEqual(blanks.text, ['a', '', '', 'b'].join('\n'), 'Blank runs collapse to the configured maximum');

        const repeated = ConservativePathCompressor.compress(Array.from({ length: 40 }, () => 'WARN retry failed').join('\n'));
        assert.ok(repeated.appliedRules.includes('repeated_log_lines'));
        assert.ok(repeated.text.length < 40 * 'WARN retry failed'.length, 'Long identical runs must shrink');
        assert.ok(/repeated 37 more times/.test(repeated.text), 'Folded runs must state the exact original count');

        const blob = ConservativePathCompressor.compress('head ' + 'a'.repeat(5000) + ' tail');
        assert.ok(blob.appliedRules.includes('opaque_blob_truncation'));
        assert.ok(blob.text.length < 3000, 'Opaque blobs must be truncated');
        assert.ok(blob.text.includes('head') && blob.text.includes('tail'), 'Surrounding content must survive');

        const noisy = ['line one   ', '', '', '', '', 'keep me'].join('\n');
        const compressed = ConservativePathCompressor.compress(noisy);
        assert.ok(compressed.changed && compressed.text.length < noisy.length, 'Combined noise reduction must reduce size');
        assert.ok(compressed.text.includes('keep me'), 'Content lines must survive noise reduction');

        // Every non-blank source line must survive intact.
        const codeIn = LONG_FUNCTION.split('\n').map(l => l + '   ').join('\n');
        const codeOut = ConservativePathCompressor.compress(codeIn).text;
        for (const line of LONG_FUNCTION.split('\n').filter(l => l.trim().length > 0)) {
            assert.ok(codeOut.includes(line.trim()), `Noise reduction dropped a source line: ${line.trim().slice(0, 40)}`);
        }

        const fencedWithBlankLines = 'Explain flow.\n```typescript\nconst a = 1;\n\nconst b = 2;\n```';
        const balancedFenced = ConservativePathCompressor.compress(fencedWithBlankLines);
        const maximumFenced = ConservativePathCompressor.compress(
            fencedWithBlankLines, { compactFencedCodeBlankLines: true, compactBraceLanguageIndentation: true });
        assert.strictEqual(balancedFenced.text, fencedWithBlankLines,
            'Balanced preserves ordinary source formatting');
        assert.ok(maximumFenced.appliedRules.includes('fenced_code_blank_lines'));
        const indented = 'Explain flow.\n```typescript\nif (ready) {\n    return value;\n}\n```';
        const compactedIndentation = ConservativePathCompressor.compress(
            indented, { compactBraceLanguageIndentation: true });
        assert.ok(compactedIndentation.appliedRules.includes('brace_language_indentation'));
        assert.ok(compactedIndentation.text.includes('\nreturn value;'),
            'Maximum may remove non-semantic indentation in brace languages');
        assert.ok(maximumFenced.text.length < balancedFenced.text.length,
            'Maximum has a distinct, source-token-preserving reduction path');

        // It must be a strict no-op when verification fails.
        const rejected = applyConservativeReduction([{ role: 'user', content: noisy }], () => false);
        assert.strictEqual(rejected.applied, false, 'A failed preservation check must discard the reduction');
        assert.strictEqual(rejected.messages[0].content, noisy, 'A failed preservation check must return the input unchanged');
        console.log('  ✓ Conservative-path reduction is content-preserving and no-ops when verification fails.');
    }

    // ---------------------------------------------------------------------
    // Prefix continuity: unchanged history renders identical bytes
    // ---------------------------------------------------------------------
    {
        const history = [
            { role: 'user' as const, content: 'Module:\n\n```typescript\n' + LONG_FUNCTION + '\n```' },
            { role: 'assistant' as const, content: 'Reviewed.' }
        ];
        const renders: string[][] = [];
        for (const turn of ['Refactor computeInvoiceTotal.', 'Explain the rounding behaviour.', 'Add currency support.']) {
            const orchestrator = new PipelineOrchestrator();
            const result = await orchestrator.compileContext({
                messages: [...history, { role: 'user', content: turn }],
                sessionId: 'prefix-session', targetProvider: 'anthropic',
                targetModel: 'claude-3-5-sonnet', deferSideEffects: true
            } as any);
            renders.push(result.optimizedMessages.slice(0, history.length).map(m => m.content));
        }
        for (let turn = 1; turn < renders.length; turn++) {
            assert.deepStrictEqual(renders[turn], renders[0],
                'History must render identical bytes across turns so the provider prefix cache stays valid');
        }

        // The resolver itself: history uses its own keywords, the latest user turn uses focal ones.
        const resolver = createPrefixStableKeywordResolver(
            [{ role: 'user', content: 'about sessions' }, { role: 'user', content: 'about billing' }],
            ['billing', 'invoice']
        );
        assert.strictEqual(resolver.latestUserIndex, 1);
        assert.deepStrictEqual(resolver.forMessage(1), ['billing', 'invoice']);
        assert.ok(resolver.forMessage(0).includes('sessions'), 'History keywords come from the history message itself');
        assert.ok(!resolver.forMessage(0).includes('invoice'), 'History slicing must not depend on the current query');
        assert.deepStrictEqual(deriveKeywords('the const class from import'), [],
            'Stopwords alone must yield no keywords');
        console.log('  ✓ Prefix continuity: unchanged history renders identical bytes across turns.');
    }

    // ---------------------------------------------------------------------
    // Embedding provider honesty and determinism
    // ---------------------------------------------------------------------
    {
        const provider = new DeterministicLocalEmbeddingProvider();
        assert.strictEqual(provider.metadata.representation, 'hashed_structural_projection',
            'The provider must not describe itself as a learned model');
        assert.strictEqual(provider.metadata.isLocal, true);
        assert.strictEqual(provider.metadata.privacyDeclaration, 'zero_egress_local_only');

        const first = await provider.embedQuery(LONG_FUNCTION);
        const second = await provider.embedQuery(LONG_FUNCTION);
        assert.deepStrictEqual(Array.from(first), Array.from(second), 'Embedding must be deterministic');
        assert.strictEqual(first.length, provider.metadata.dimension);
        for (const value of first) assert.ok(Number.isFinite(value), 'Embedding must contain no NaN or Infinity');

        // Structural features must separate documents that share vocabulary but differ in shape.
        const flat = 'function a(){ return 1; }';
        const nested = 'function a(){ if (x) { for (;;) { while (y) { try { return 1; } catch(e) {} } } } }';
        const dot = (u: Float32Array, v: Float32Array) => u.reduce((sum, value, index) => sum + value * v[index], 0);
        const flatVec = await provider.embedQuery(flat);
        const nestedVec = await provider.embedQuery(nested);
        assert.ok(dot(flatVec, nestedVec) < 0.999, 'Structurally different code must not produce identical vectors');

        // Corpus statistics must be bounded and must not throw on adversarial input.
        provider.observeCorpus(['', 'a b c', LONG_FUNCTION]);
        assert.ok(Number.isFinite((await provider.embedQuery('a b c'))[0]));
        console.log('  ✓ Embedding provider is honest, deterministic, bounded and structurally sensitive.');
    }

    // ---------------------------------------------------------------------
    // Retrieval-first must never emit a context-free payload
    // ---------------------------------------------------------------------
    {
        // Measured defect: with no attached source, an incomplete evidence contract restored the
        // caller's messages - the bare instruction - so debug, refactor and feature requests went
        // upstream with 19-33 tokens and no code, while retrieval had admitted ten candidates.
        const bare = [{ role: 'user' as const, content: 'Fix the rounding defect in computeVector.' }];

        const soleContext = resolveRetrievalRenderDecision({
            messages: bare, allowWorkspaceRetrieval: true, hasRetrieval: true,
            conservativeFallback: true, selectedCount: 10, missingRequired: ['errorStackTrace']
        });
        assert.strictEqual(soleContext.retrievalIsSoleContext, true,
            'A bare instruction with admitted evidence is a retrieval-first request');
        assert.strictEqual(soleContext.shouldRender, true,
            'Admitted evidence must be rendered rather than collapsing the payload to the instruction');
        assert.deepStrictEqual([...soleContext.shortfallCategories], ['errorStackTrace'],
            'The missing category must be declared so the model can ask for it');
        assert.ok(shortfallAttribute(soleContext.shortfallCategories).includes('errorStackTrace'));

        // With attached source, an incomplete contract still restores the caller payload.
        const attached = resolveRetrievalRenderDecision({
            messages: [{ role: 'user' as const, content: 'Fix this. ```ts export function f() { return 1; } ```' }],
            allowWorkspaceRetrieval: true, hasRetrieval: true,
            conservativeFallback: true, selectedCount: 10, missingRequired: ['errorStackTrace']
        });
        assert.strictEqual(attached.callerSuppliedContext, true);
        assert.strictEqual(attached.retrievalIsSoleContext, false);
        assert.strictEqual(attached.shouldRender, false, 'Attached context keeps the conservative restore');
        assert.deepStrictEqual([...attached.shortfallCategories], []);

        // An editor attachment is not caller-supplied source. VS Code attaches its skills list on
        // every turn: it is long and full of fenced code, so the shape heuristic read it as attached
        // source, and the request was treated as one that already carried its own code. The caller
        // knows the difference and now says so.
        const skillsList = '{"text":"# Available VS Code skills\\n```text\\nUse the editor skill\\n```"}';
        const skillsShaped = [{ role: 'user' as const,
            content: 'Analyze the current project and tell me the cost savings.\n\nAttached context 1: skills\n' + skillsList }];
        const heuristicOnly = resolveRetrievalRenderDecision({
            messages: skillsShaped, allowWorkspaceRetrieval: true, hasRetrieval: true,
            conservativeFallback: true, selectedCount: 10, missingRequired: ['errorStackTrace']
        });
        assert.strictEqual(heuristicOnly.callerSuppliedContext, true,
            'The shape heuristic alone cannot tell a skills list from attached source');
        const declared = resolveRetrievalRenderDecision({
            messages: skillsShaped, allowWorkspaceRetrieval: true, hasRetrieval: true, callerSuppliedSource: false,
            conservativeFallback: true, selectedCount: 10, missingRequired: ['errorStackTrace']
        });
        assert.strictEqual(declared.callerSuppliedContext, false, 'A caller that knows overrides the heuristic');
        assert.strictEqual(declared.retrievalIsSoleContext, true);
        assert.strictEqual(declared.shouldRender, true,
            'Retrieved evidence must reach a request whose only attachment is an editor skills list');
        // A caller that declares real source still gets the conservative restore.
        assert.strictEqual(resolveRetrievalRenderDecision({
            messages: bare, allowWorkspaceRetrieval: true, hasRetrieval: true, callerSuppliedSource: true,
            conservativeFallback: true, selectedCount: 10, missingRequired: ['errorStackTrace']
        }).shouldRender, false, 'Declared attached source keeps the conservative restore');

        // Retrieval asked for but nothing admissible: the emptiness must be surfaced, not silent.
        const nothing = resolveRetrievalRenderDecision({
            messages: bare, allowWorkspaceRetrieval: true, hasRetrieval: true,
            conservativeFallback: true, selectedCount: 0, missingRequired: ['errorStackTrace']
        });
        assert.strictEqual(nothing.shouldRender, false);
        assert.strictEqual(nothing.emptyContextWarning, true, 'An empty retrieval result must be reported');
        assert.strictEqual(buildRetrievalRenderDecisions(nothing, 0)[0].itemId, 'retrieval_yielded_no_context');

        // A satisfied contract renders without any shortfall annotation.
        const satisfied = resolveRetrievalRenderDecision({
            messages: bare, allowWorkspaceRetrieval: true, hasRetrieval: true,
            conservativeFallback: false, selectedCount: 10, missingRequired: []
        });
        assert.strictEqual(satisfied.shouldRender, true);
        assert.strictEqual(shortfallAttribute(satisfied.shortfallCategories), '');
        assert.deepStrictEqual(buildRetrievalRenderDecisions(satisfied, 1), []);

        console.log('  ✓ Retrieval-first: admitted evidence rendered and shortfalls declared, never an empty payload.');
    }

    // ---------------------------------------------------------------------
    // Observation masking: the agentic path the text compiler cannot reach
    // ---------------------------------------------------------------------
    {
        const toolCall = (callId: string, name: string) => ({ kind: 'tool_call' as const, callId, name, input: {} });
        const toolResult = (callId: string, chars: number) => ({
            kind: 'tool_result' as const, callId,
            content: [{ kind: 'text' as const, text: 'x'.repeat(chars) }]
        });
        const trajectory: any[] = [{ role: 'user', parts: [{ kind: 'text', text: 'Fix the failing test.' }] }];
        for (let i = 0; i < 12; i++) {
            trajectory.push({ role: 'assistant', parts: [toolCall('c' + i, i % 2 ? 'read_file' : 'run_tests')] });
            trajectory.push({ role: 'user', parts: [toolResult('c' + i, 4000)] });
        }

        const masked = maskObservations(trajectory);
        assert.ok(masked.applied, 'A long tool trajectory must be masked');
        assert.ok(masked.maskedCount > 0 && masked.maskedCount < 12, 'Recent observations must survive');

        // Protocol invariants. Masking may replace text inside a tool result and nothing else.
        assert.strictEqual(masked.messages.length, trajectory.length, 'Message count is preserved');
        for (let i = 0; i < trajectory.length; i++) {
            assert.strictEqual(masked.messages[i].role, trajectory[i].role, 'Roles are preserved');
            assert.strictEqual(masked.messages[i].parts.length, trajectory[i].parts.length, 'Part cardinality is preserved');
        }
        const callIds = (set: any[]) => set.flatMap(m => m.parts.filter((p: any) => p.callId).map((p: any) => p.callId));
        assert.deepStrictEqual(callIds(masked.messages), callIds(trajectory), 'Tool-call identifiers are preserved');
        const calls = (set: any[]) => JSON.stringify(set.flatMap(m => m.parts.filter((p: any) => p.kind === 'tool_call')));
        assert.strictEqual(calls(masked.messages), calls(trajectory), 'tool_call parts are never modified');

        // The most recent observations must remain readable.
        const tail = masked.messages.slice(-6).flatMap((m: any) => m.parts.filter((p: any) => p.kind === 'tool_result'));
        assert.ok(tail.length > 0 && tail.every((p: any) => !p.content[0].text.startsWith('[tokonomics:')),
            'The most recent tool results must not be masked');
        assert.ok(/elided, 4000 characters/.test(JSON.stringify(masked.messages)),
            'The placeholder must state how much was removed so the model can ask for it');

        // Cache stability. A boundary that moved on every turn would rewrite the middle of the
        // prompt on every request and invalidate the provider prefix cache continuously.
        const maskedPositions = (set: any[]) => set.flatMap((m: any, i: number) => m.parts.map((p: any) =>
            p.kind === 'tool_result' && p.content[0].text.startsWith('[tokonomics:') ? i : -1))
            .filter((x: number) => x >= 0).join(',');
        const grow = (extra: number) => {
            const grown = [...trajectory];
            for (let k = 0; k < extra; k++) {
                grown.push({ role: 'assistant', parts: [toolCall('e' + k, 'read_file')] });
                grown.push({ role: 'user', parts: [toolResult('e' + k, 4000)] });
            }
            return maskedPositions(maskObservations(grown).messages);
        };
        assert.strictEqual(grow(1), grow(2), 'The masking boundary must hold steady between strides');

        // Determinism: identical input must produce identical bytes.
        assert.strictEqual(JSON.stringify(maskObservations(trajectory).messages),
            JSON.stringify(masked.messages), 'Masking must be deterministic');

        // A short trajectory is left alone; masking it would cost more than it saves.
        const small = maskObservations([{ role: 'user', parts: [toolResult('s1', 100)] }] as any);
        assert.strictEqual(small.applied, false);
        assert.strictEqual(small.skippedReason, 'below_trigger');

        // Non-text children must survive: their size is not the problem and silent loss would be worse.
        const withImage = [{ role: 'user', parts: [{ kind: 'tool_result', callId: 'i1', content: [
            { kind: 'text', text: 'y'.repeat(30000) }, { kind: 'data', mimeType: 'image/png' }
        ] }] }, ...trajectory];
        const imageResult = maskObservations(withImage as any);
        assert.ok(JSON.stringify(imageResult.messages).includes('image/png'),
            'Non-text tool-result children must never be masked away');

        // Malformed input must not break a request that would otherwise succeed.
        assert.strictEqual(maskObservations([{ role: 'user', parts: [{ kind: 'tool_result' }] }] as any).applied, false);

        // Enabled by default. The property that makes that safe is inertness: masking must be a
        // byte-identical no-op on every request shape that is not a long tool trajectory, so turning
        // it on cannot affect a user who never runs one.
        assert.strictEqual(OPTIMIZATION_PROFILES.balanced.featureFlags.enableObservationMasking, true);
        assert.strictEqual(OPTIMIZATION_PROFILES.maximum.featureFlags.enableObservationMasking, true);
        assert.strictEqual(OPTIMIZATION_PROFILES.off.featureFlags.enableObservationMasking, false,
            'Optimization Off must disable masking with everything else');

        const inertShapes: Array<[string, any[]]> = [
            ['plain chat', [{ role: 'user', parts: [{ kind: 'text', text: 'How do I reverse a string?' }] }]],
            ['large attached file', [{ role: 'user', parts: [{ kind: 'text', text: 'x'.repeat(60000) }] }]],
            ['multi-turn text', [
                { role: 'user', parts: [{ kind: 'text', text: 'a'.repeat(50000) }] },
                { role: 'assistant', parts: [{ kind: 'text', text: 'ok' }] }
            ]],
            ['short tool session', [
                { role: 'assistant', parts: [toolCall('s0', 'read_file')] },
                { role: 'user', parts: [toolResult('s0', 900)] }
            ]]
        ];
        for (const [label, shape] of inertShapes) {
            const outcome = maskObservations(shape as any);
            assert.strictEqual(outcome.applied, false, `${label}: masking must not engage`);
            assert.strictEqual(JSON.stringify(outcome.messages), JSON.stringify(shape),
                `${label}: masking must be byte-identical when it does not engage`);
        }

        console.log('  ✓ Observation masking: protocol-safe, cache-stable, deterministic, bounded.');
    }

    console.log('\n--- ALL AUDIT REMEDIATION REGRESSION TESTS PASSED ---\n');
}
