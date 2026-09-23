# Tokonomics panel audit-prompt failure

The earlier audit did not reproduce this panel incident. This follow-up inspected the saved failed turn, its persisted lifecycle event, the installed 8.0.0 bundle, and the checkout's panel/compiler code. Production source and the earlier remediation patch remain unchanged.

## Incident evidence

- Request: `req_1789372160372_gof36ldm`, failed at 2026-09-14 13:19:54.313 IST.
- Selected model: `subscription:codex:default`.
- The saved turn starts `MISSION: DEEP CODE AUDIT & BUG HUNT FOR TOKONOMICS`. It is a variant of the attached audit request, not byte-identical. It contains no fenced source and exceeds 600 characters.
- The saved transcript contains the reported message, `The request failed before a reply was produced.`
- The ledger classifies the request as `debug` (confidence 0.92), records retrieval `conservative_fallback`, workspace snapshot `no_admitted_evidence`, and `preservation_gate_restored_original_content`.
- Canonical compilation contributed successfully. The failure is recorded afterward as `UPSTREAM_PROVIDER_ERROR`. This broad label includes local provider guards; it does not establish a Codex service error.
- Final selection trace is empty; input estimates remain 6,012 to 6,012, with an input limit of 111,636. The evidence does not indicate a prompt-size rejection.
- The diagnostics output contains activation/index-readiness messages, but no underlying exception for this turn.

See [the scoped event extract](panel-failed-request.json). The original event does not retain the raw exception, exact missing evidence categories, or intermediate selected-candidate count. Its `request_not_sent` cost label alone is not proof that no network dispatch occurred.

## Reproduced root-cause chain

1. `src/engine/retrievalRenderPolicy.ts:68` infers caller-supplied source from any message containing a code fence **or exceeding 600 characters**. It examines assistant history too. Long instructions are consequently treated as attached source.
2. `src/proxy/modelProvider.ts:128` does not pass `callerSuppliedSource` to compilation, so this heuristic applies to panel requests even though the controller sends text history without an attachment provenance signal.
3. With a conservative retrieval fallback, `retrievalRenderPolicy.ts:77` suppresses rendering whenever that heuristic says source is already present. `pipelineOrchestrator.ts:891` also restores original messages on that branch. Existing retrieved candidates can thus be discarded, leaving instructions and conversational history without repository evidence.
4. `modelProvider.ts:157` blocks subscription requests asking for workspace source when there is no code fence and no `<tokonomics-evidence` marker in the compiled messages. Its automatic-context errors start `No project source was prepared:`.
5. `src/ui/chatSessionController.ts:491` recognizes only `No project source was prepared.` with a **period**. The colon variants fall through to line 511 and become the reported generic message. Its catch at line 307 does not log the caught exception.

The installed 8.0.0 bundle contains the same provider guard and punctuation mismatch. The saved event and deterministic reproductions strongly support this local failure chain. The raw historical exception was discarded, so the precise original exception text cannot be recovered or independently proven.

## Local validation

Run `node validation/audit-2026-09-14/panel-reproduction.cjs`.

The probe uses the saved audit prompt and real source modules with the repository's VS Code mock. It performs no provider inference or outbound request. Results are in [panel-reproduction.json](panel-reproduction.json).

- The exact saved prompt is recognized as requesting workspace source and classified as debug.
- Given one admitted candidate and an incomplete evidence contract, the render policy incorrectly returns `callerSuppliedContext: true`, `shouldRender: false`.
- Explicit `callerSuppliedSource: false` changes the same case to `shouldRender: true`, with the missing category declared.
- Both colon-form provider errors, injected through the real panel controller, reproduce the user's exact generic message. The period-form error remains visible.

The candidate count and missing category in the probe are controlled test inputs, not reconstructed historical facts. This is a deterministic component reproduction plus persisted incident correlation, not a replay against the live Codex subscription.

## Remediation scope

The functional fix should propagate explicit source provenance from the panel into compilation. For this text-only panel path, instructions and prior assistant responses must not count as attached workspace source. Preserve admitted exact evidence and declare shortfalls under the existing retrieval policy; retain the provider guard when no usable source exists.

The display fix should use a typed missing-source error/code shared by provider and controller. A minimal compatibility correction is to recognize both punctuation variants, for example `/^No project source was prepared[.:]/.test(raw)`. That change alone improves the explanation but does not restore missing evidence.

Record a bounded, content-free failure code and stage with the request ID before classifying the error. Add integration coverage for a long instruction-only audit request, prior long assistant history, incomplete retrieval with usable candidates, and both missing-source outcomes. These fixes are recommendations in this follow-up, not applied or release-validated changes.
