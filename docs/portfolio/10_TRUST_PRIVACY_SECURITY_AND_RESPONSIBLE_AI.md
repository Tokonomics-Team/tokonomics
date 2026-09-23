# Trust, Privacy, Security, and Responsible AI

## Product trust promise

Tokonomics should never improve a token metric by silently weakening task evidence, expanding data access or misleading the user about cost.

## Responsible-AI risk taxonomy

| Risk | Example | Customer harm | Product control |
|---|---|---|---|
| Context omission | Missing dependency causes wrong answer | Incorrect code, wasted time/cost | Mandatory evidence contract and fallback |
| Instruction override | Retrieved file contains malicious instructions | Model behavior manipulation | Treat retrieved text as evidence, not authority |
| Stale evidence | File changes after indexing | Edits based on old code | Snapshot/version/hash validation |
| Secret exposure | Credential appears in source/tool output | Security incident | Final outbound redaction and source policy |
| Privacy overreach | Automatic index in untrusted workspace | Unconsented source processing | Restricted Mode and context settings |
| Misleading economics | Missing usage shown as $0 saved | Bad purchasing/ROI decision | Evidence states and unavailable reasons |
| Automation bias | User trusts “optimized” label | Reduced review | Explainability and conservative wording |
| Unequal language support | Some parsers preserve less | Hidden quality differences | Per-language evaluation and fallback |
| Resource harm | Index consumes excessive CPU/RAM | Poor editor experience | Budgets, cancellation and topology controls |

## Data-flow summary

1. User supplies a prompt and optional selection.
2. With appropriate trust/context mode, Tokonomics considers local workspace evidence.
3. The final outbound payload passes safety and protocol checks.
4. The payload is sent to the upstream model selected in VS Code.
5. Content-free metrics may be retained locally within declared bounds.

Local context preparation does not mean the selected model provider receives no data.

## Privacy principles

- Data minimization.
- Purpose limitation.
- User control and understandable consent.
- Local, bounded and rebuildable derived state.
- No raw prompt/source/response telemetry.
- Explicit deletion mechanisms.
- Honest disclosure of upstream provider handling.

## Security requirements

### Workspace boundary

- Trust required for automatic workspace context.
- Root containment and multi-root identity.
- Ignore policies and sensitive-file filtering.
- Block traversal, symlink escape, binary and oversized content.
- Treat virtual/remote topology explicitly.

### Outbound boundary

- Scan final rendered text and string options.
- Redact known credential patterns and sensitive paths.
- Preserve protocol relationships and count all parts.
- Reject unknown structures rather than silently omitting them.
- Respect cancellation immediately before send.

### Storage boundary

- Avoid source/prompt/response persistence by default.
- Bound numeric metadata.
- Encrypt consented project memory.
- Make memory inspectable, editable, exportable and erasable.
- Isolate workspace/project/session identities.

### Supply chain and packaging

- Pin and inspect shipped runtime assets.
- Generate SBOM and artifact provenance.
- Reject source maps, private docs and development files from VSIX.
- Scan for secrets and suspicious archive properties.
- Treat unsigned provenance as evidence, not a digital signature.

## Threat scenarios

### Retrieved prompt injection

An indexed README or source comment tells the model to ignore the user. The context renderer must clearly delimit evidence and preserve higher-priority user/system instructions. Security tests should include indirect and obfuscated instructions.

### Poisoned diagnostics or terminal output

Untrusted output includes escape sequences, credentials, misleading paths or instruction text. Normalize controls, bound length, redact sensitive values and preserve provenance.

### Cache contamination

An item derived from one workspace/session appears in another. Cache keys and storage scopes must include the relevant identity and policy. Zero-residue deletion must be tested.

### Stale exact source

The file changes after snapshot capture. Revalidation must reject the chunk rather than send wrong lines under an “exact” label.

### Cost deception

The provider does not return usage. The dashboard must show unavailable—not infer billed savings from a local token estimate.

## Responsible-AI evaluation

- Measure quality by task and language.
- Track explicit insufficiency and unsupported edits.
- Review a sample of successes, not only failures.
- Test adversarial context and retrieval poisoning.
- Use human review for ambiguous coding outcomes.
- Record model version because behavior changes.
- Keep a kill switch for high-risk stages.

## Risk register

| ID | Risk | Probability | Impact | Owner | Mitigation | Release status |
|---|---|---:|---:|---|---|---|
| R1 | Missing dependency closure | High | High | Product + Engineering | P0 regression and exact closure | Blocker |
| R2 | Agentic masking quality unknown | Medium | High | AI Evaluation | Tool-enabled paired evaluation | Blocker for capacity claim |
| R3 | Misleading dollar claims | High | High | Product | Evidence ledger and claim review | Controlled |
| R4 | Native assistant makes value redundant | Medium/high | High | Product Strategy | Customer discovery and comparative beta | Open |
| R5 | Sidebar workflow confusion | Medium | Medium | Design/Product | Usability gate before promotion | Open |
| R6 | Secret/path leakage | Low/medium | Critical | Security/Engineering | Final-boundary safety and adversarial tests | Must remain green |
| R7 | Remote host misplacement | Medium | High | Engineering | Topology declaration and no unsafe indexing | Controlled/test further |
| R8 | Benchmark overfitting | High | High | AI Evaluation | Frozen holdout and multi-repo corpus | Open |

## Release trust gate

- Threat model reviewed.
- No critical/high unresolved issue.
- Restricted Mode and all context settings tested.
- Final outbound boundary tested with adversarial data.
- Data inventory and deletion behavior documented.
- Provider disclosure present in onboarding and privacy material.
- Model-task quality gates passed for promoted workloads.
- Claims match the evidence register.

## Incident response outline

1. Detect and classify severity.
2. Disable affected capability through a kill switch.
3. Preserve content-free evidence; do not collect user source by default.
4. Notify affected users according to legal/security guidance.
5. Provide reset/delete instructions.
6. Reproduce with sanitized fixture.
7. Fix, red-team and stage rollout.
8. Publish an appropriate customer-facing incident summary.

