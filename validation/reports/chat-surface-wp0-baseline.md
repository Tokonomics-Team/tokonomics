# Native Chat Surface — Work Package 0 evidence note

Classification: internal design evidence. No production code was changed to produce this note.

Baseline commit: `3976101fa3e32e0ea18bce9f3a0d8e9ffb46a850` on `v7.1.0-audit-remediation`.

## 1. Worktree safety gate (plan §4)

`git status --short` at the time of the gate reported five modified generated-evidence files
(`validation/reports/final-independent-audit.*`, `final-validation-report.*`,
`validation/results/raw-benchmark-results.json`) and one untracked user-owned directory
(`.github/workflows/`).

The five modified files are self-referential audit output: each run records the commit it was
generated against, so they re-dirty after every verification run. None of them, and none of the
untracked user directory, overlaps any file this feature plans to touch. Per plan §4 the tree was
**not** cleaned, reset, stashed or reformatted; those files were left exactly as found and are not
staged by this work.

Result: gate passed, no overlap.

## 2. Traced production request path (plan §7 tasks 1-2)

| Responsibility | Owning call site |
|---|---|
| Provider construction and registration | `src/extension.ts:288-302`, vendor `tokonomics` |
| Canonical compile | `modelProvider.provideLanguageModelChatResponse` → `this.compiler.compile(...)` |
| Egress preparation | `CanonicalProviderGateway.prepare(protocol, compiled.messages, forwardOptions, boundaryContext)` |
| Upstream send (only `sendRequest` site in `src/`) | `CanonicalProviderGateway.send(targetModel, prepared, token)` |
| Foreground scheduling / backpressure | `this.inferenceScheduler.schedule({ priority: 'foreground', cancellation })` |
| Terminal success | `this.compiler.commit(compiled)` then `onOptimizationComplete()` |
| Terminal failure / cancellation | `this.compiler.fail(compiled, code)` |
| Usage reconciliation | `CostCalculator.parseVerifiedProviderUsage` → `costReconciliationLedger.begin/reconcile` |
| Lifecycle events → dashboard | `OptimizationEventBus.getInstance().emit(...)`, projected by `src/ui/dashboardController.ts` |
| Upstream model selection | `resolveUpstreamModelAndProvider(config, requestedFamilyOrId)` |

The provider already excludes itself from upstream candidates
(`m.id !== 'token-optimizer-proxy' && vendor !== 'tokonomics'`), so recursion prevention exists and
must be preserved rather than reimplemented.

## 3. Minimum-host API availability (plan §7 task 3)

Verified against the pinned `@types/vscode@1.106.0`, matching `engines.vscode: ^1.106.0`:

| API | Present |
|---|---|
| `WebviewViewProvider` / `resolveWebviewView` | yes |
| `window.registerWebviewViewProvider` | yes |
| `lm.selectChatModels` | yes |
| `lm.onDidChangeChatModels` (`Event<void>`) | yes |

No proposed or private API is required.

## 4. Model metadata available (plan §7 task 4)

`LanguageModelChat` exposes exactly: `id`, `name`, `vendor`, `family`, `version`, `maxInputTokens`,
plus `sendRequest` and `countTokens`.

There is **no** `capabilities` member on this interface at the minimum supported version. The UI
DTO therefore carries only the six readable metadata fields and must not display or infer
capability flags. Consent, quota and availability are observable only as thrown errors from
`selectChatModels`/`sendRequest`, never as advertised metadata.

## 5. Message-schema design (plan §7 task 5)

A discriminated union in both directions, validated in the extension host, with explicit bounds:
inbound message types are `ready`, `selectModel`, `submit`, `cancel`, `newSession`, `openDashboard`,
`openTrace`; outbound are `state`, `models`, `appendUser`, `streamStart`, `streamDelta`,
`streamEnd`, `error`, `cleared`, `usage`. Every inbound message carries the view's session id and is
rejected if the id is stale, and prompt text is capped before it reaches the controller.

## 6. Change surface (plan §7 task 6)

New files (all additive):

- `src/ui/chatProtocol.ts` — typed message schema, bounds, validation
- `src/ui/chatSessionController.ts` — extension-host routing, history, cancellation
- `src/ui/chatViewProvider.ts` — `WebviewViewProvider`, CSP/nonce HTML, bridge
- `tests/chatSurface.test.ts` — focused suite

Existing production files requiring surgical modification — exactly two, the plan's maximum:

- `src/extension.ts` — register the view provider and the focus command
- `src/proxy/modelProvider.ts` — honour one namespaced explicit upstream-target option

`package.json` additionally gains manifest contributions (`viewsContainers`, `views`, one command),
which is unavoidable for any view and adds no public setting.

## 7. Baseline (plan §7 task 7)

`npm run compile` exit 0; `npm test` exit 0 at the baseline commit.

## 8. Gate decision

**GO.** The feature can be built as a thin client over the existing proxy, compiler, gateway and
ledger. No parallel provider stack, no second compiler, and no broad refactor is required.
