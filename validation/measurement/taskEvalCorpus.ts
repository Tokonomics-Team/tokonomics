/**
 * Task corpus for the controlled model-task evaluation.
 *
 * Every question is answerable from this repository's own source, and every expected answer was read
 * out of that source rather than recalled. The questions are deliberately about behaviour rather
 * than about constants: "what is MAX_CHUNK_BYTES" can be answered by anything that happens to
 * contain the declaration line, while "what status is returned when the file hash no longer matches"
 * requires the function body - which is exactly the evidence optimization might drop.
 *
 * Scoring is exact substring matching, case-insensitive. Each entry in `expect` is a group of
 * acceptable phrasings; every group must be satisfied by at least one of its alternatives. Grouping
 * exists so a question with a genuinely two-part answer ("explain and search") is not satisfied by
 * half of it, while a question with one answer expressible several ways is not failed for wording.
 *
 * A substring grader is a blunt instrument, chosen for being blunt: an LLM grader would put a second
 * model's judgement inside a measurement whose entire purpose is to be checkable by anyone. Its cost
 * is false negatives - a correct answer phrased unusually - and that error biases against concluding
 * that optimization preserved quality, so it cannot manufacture the result this project would prefer.
 */

export interface EvalTask {
    readonly id: string;
    readonly workload: 'debug' | 'explain' | 'search' | 'refactor';
    /** File a developer would plausibly attach to ask this. Forms the baseline arm. */
    readonly focalFile: string;
    readonly prompt: string;
    /** Groups of alternatives. Every group must match; within a group, any alternative counts. */
    readonly expect: readonly (readonly string[])[];
}

export const EVAL_TASKS: readonly EvalTask[] = Object.freeze([
    {
        id: 'masking-below-trigger',
        workload: 'explain',
        focalFile: 'src/compression/observationMasking.ts',
        prompt: 'In maskObservations, what happens when the total tool-result text is less than or '
            + 'equal to the trigger threshold? Name the exact skippedReason value returned.',
        expect: [['below_trigger']]
    },
    {
        id: 'masking-non-text-children',
        workload: 'explain',
        focalFile: 'src/compression/observationMasking.ts',
        prompt: 'When maskObservations masks a tool result, what happens to non-text children such '
            + 'as images or binary data? Answer in one sentence.',
        expect: [['preserv', 'retain', 'kept', 'keeps', 'unchanged', 'not masked', 'never masked']]
    },
    {
        id: 'masking-failure-behaviour',
        workload: 'debug',
        focalFile: 'src/compression/observationMasking.ts',
        prompt: 'If maskObservations throws internally, what does it return? Name the exact '
            + 'skippedReason value.',
        expect: [['failed']]
    },
    {
        id: 'chunk-stale-file',
        workload: 'debug',
        focalFile: 'src/workspace/semanticChunk.ts',
        prompt: 'In rehydrateExact, what status is returned when the file content hash no longer '
            + 'matches the hash captured in the range? Give the exact status string.',
        expect: [['stale_file']]
    },
    {
        id: 'chunk-binary-file',
        workload: 'debug',
        focalFile: 'src/workspace/semanticChunk.ts',
        prompt: 'In rehydrateExact, what status is returned when the source file contains a NUL '
            + 'byte? Give the exact status string.',
        expect: [['unavailable']]
    },
    {
        id: 'chunk-exact-task-policy',
        workload: 'explain',
        focalFile: 'src/workspace/semanticChunk.ts',
        prompt: 'Which two task types does requiresExactSource return false for? List both exactly.',
        expect: [['explain'], ['search']]
    },
    {
        id: 'chunk-window-boundary',
        workload: 'explain',
        focalFile: 'src/workspace/semanticChunk.ts',
        prompt: 'When the language structure cannot be followed, what boundary kind does '
            + 'extractChunkRanges record for the chunk? Give the exact value.',
        expect: [['line_window']]
    },
    {
        id: 'envelope-selection-threshold',
        workload: 'search',
        focalFile: 'src/engine/requestContextEnvelope.ts',
        prompt: 'A selection must be strictly longer than how many characters to count as deliberate '
            + 'evidence? Give the number.',
        expect: [['30']]
    },
    {
        id: 'envelope-dirty-buffer',
        workload: 'explain',
        focalFile: 'src/engine/requestContextEnvelope.ts',
        prompt: 'Under mayReadDocument, may a document with unsaved changes be read when the user '
            + 'has not permitted unsaved buffers? Answer yes or no, and say why in one sentence.',
        expect: [['no', 'cannot', 'not readable', 'must not'], ['unsaved', 'dirty', 'consent', 'permit']]
    },
    {
        id: 'envelope-fallback-condition',
        workload: 'explain',
        focalFile: 'src/engine/requestContextEnvelope.ts',
        prompt: 'resolveFallbackAttachment returns a full-document fallback only when retrieval '
            + 'produced what? Answer in one short sentence.',
        expect: [['no evidence', 'nothing', 'zero', 'no candidates', 'unusable', 'no usable']]
    },
    {
        id: 'count-failure-degrades',
        workload: 'debug',
        focalFile: 'src/engine/authoritativeCount.ts',
        prompt: 'If the model token counter throws, what counting method does countAuthoritative '
            + 'report? Give the exact method string.',
        expect: [['estimate_after_failure']]
    },
    {
        id: 'repack-mandatory',
        workload: 'refactor',
        focalFile: 'src/engine/authoritativeCount.ts',
        prompt: 'In planRepack, may mandatory items ever be dropped to make the payload fit? '
            + 'Answer yes or no, and say what happens instead when they alone exceed the budget.',
        expect: [['no', 'never', 'not'], ['fails closed', 'does not fit', 'fits: false', 'fails', 'not fit']]
    },
    {
        id: 'epoch-anchor',
        workload: 'explain',
        focalFile: 'src/history/contextEpoch.ts',
        prompt: 'In resolveContextEpoch, the retained window is anchored at which epoch boundary '
            + 'relative to the current epoch? Answer in one short sentence.',
        expect: [['one epoch behind', 'previous epoch', 'epoch - 1', 'one behind', 'earlier epoch',
            'preceding epoch', 'one epoch back', 'epoch-1']]
    },
    {
        id: 'epoch-prefix-stability',
        workload: 'explain',
        focalFile: 'src/history/contextEpoch.ts',
        prompt: 'Why must the epoch anchor not depend on the current conversation length? '
            + 'Answer in one sentence.',
        expect: [['shift', 'move', 'slid', 'chang'], ['prefix', 'cache']]
    }
]);
