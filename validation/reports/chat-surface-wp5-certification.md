# Native Chat Surface — Work Package 5 artifact evidence

Classification: internal candidate evidence. This report describes a **development candidate**, not
the certified 7.0.1 release artifact.

## 1. Artifact identity

| Field | Value |
|---|---|
| Candidate file | `tokonomics-chat-surface-candidate.vsix` |
| Candidate SHA-256 | `b9811b9ca83274955beade2f9a21078f88c92b4c8d51a99deee75973023b2f2b` |
| Entries | 15 |
| Manifest | `tokonomics@7.0.1`, engine `^1.106.0` |

The manifest version was deliberately left at 7.0.1 (plan §13: the version is an owner decision).
Because `npm run vsce:package` writes to `tokonomics-<name>-<version>.vsix`, building this candidate
temporarily overwrote the certified artifact. The certified file was backed up beforehand and
restored afterwards; `tokonomics-7.0.1.vsix` in the repository is once again the certified artifact
with SHA-256 `2f0d67a5e8d135d32878a98920860ce1000fbe4e1af7d8702711e4964a7f7668`, verified after
restore.

The artifact-bound evidence files (`vsix-inspection.json`, `extension-host-matrix.json`,
`artifact-provenance.json`, `sbom.cdx.json`) were likewise restored to their committed state so they
continue to describe the certified artifact. **They do not describe this candidate.** That is why
this note carries the candidate hash separately rather than rewriting the certified chain.

## 2. Two packaging defects found by this work package

### CHAT-001 — an internal planning document shipped in the archive

The first candidate archive contained `extension/TOKONOMICS_NATIVE_CHAT_SURFACE_IMPLEMENTATION_PLAN.md`
(16 entries instead of 15). `.vscodeignore` excluded `PHASE_*.md`, `*_CONTRACT.md` and a list of
specific filenames, none of which matched the new document.

Fix: `.vscodeignore` now also excludes `*_PLAN.md`, `*_ROADMAP.md` and `TOKONOMICS_*.md`.

### CHAT-002 — VSIX verification could not detect CHAT-001

`scripts/verify-vsix.js` passed on the leaking archive. Its internal-document rule was a denylist of
remembered filename patterns, so an unrecognised internal document was simply not a violation.
Separately, the emitted report set `internalDocumentsAbsent: true` and `developmentArtifactsAbsent:
true` as literals — the same assert-without-measuring pattern found in the oracle audit.

Fix: markdown is now **allowlisted** (only `extension/readme.md` and `extension/changelog.md` may
appear); any other markdown entry fails packaging. The report's check flags are now derived from the
inspected entries rather than hard-coded.

Both are locked by regression assertions in `tests/chatSurface.test.ts`.

## 3. Executed gates

| Gate | Command | Exit |
|---|---|---:|
| Strict compile | `npm run compile` | 0 |
| Full repository suite | `npm test` | 0 |
| Production bundle | `npm run package` | 0 |
| VSIX packaging | `npm run vsce:package` | 0 |
| Archive inspection | `npm run verify:vsix` | 0 |
| Controlled validation | `npm run validate:all` | 0 |
| Clean-room audit | `npm run audit:clean-room` | 0 |
| Phase 0 integrity | `npm run verify:phase0` | 0 |
| Supply chain (SBOM + provenance) | `npm run generate:supply-chain` | 0 |
| Dependency audit | `node scripts/audit-dependencies.js` | 0 — 0 vulnerabilities |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

## 4. Extension Host matrix — exact installed candidate

Installed from the candidate VSIX into isolated temporary profiles, not a development folder and not
the owner's profile.

| Host | Requested | Actual | Payload matched | Trusted workspace | Result |
|---|---|---|---|---|---|
| minimum | 1.106.0 | 1.106.0 | yes | passed | passed |
| stable | stable | 1.136.0 | yes | passed | passed |
| insiders | insiders | 1.137.0-insider | yes | passed | passed |

`allRequiredPassed: true`, no cleanup warning. Restricted-mode runtime remains not executed because
the development host forces workspace trust; restricted behaviour is covered by the repository
adversarial suites, as for the existing surfaces.

## 5. Acceptance criteria status (plan §12)

| Criterion | Status | Evidence |
|---|---|---|
| Every view prompt traverses the canonical compiler exactly once | Met | Send-count and exact-id assertions in `tests/chatSurface.test.ts` (WP3) |
| Zero prompt sent by opening the view or changing the model list | Met | Discovery is triggered only by `ready`/`refreshModels`; no send path is reachable without `submit` |
| No other extension's request is intercepted | Met | The controller only calls `selectChatModels({ vendor: 'tokonomics' })`; egress invariant enumerates permitted send sites |
| `@tokonomics`, dashboard, proxy, accounting, memory, four settings unregressed | Met | Full suite green; manifest parity asserts four settings and the unchanged participant |
| No recursion, double-send, duplicate ledger entry, stale-model send, cross-workspace history | Met | Proxy excluded from upstream candidates; replayed request ids refused; stale session ids rejected |
| Cancellation and disposal release view-owned work and listeners | Met | Cancellation and disposal tests; listeners disposed with the view |
| No critical/high security issue, no XSS/CSP/message-boundary failure | Met | CSP, nonce, no-`innerHTML`, and boundary fuzz assertions |
| Exact installed VSIX passes the supported host matrix | Met | Section 4 |
| Performance and memory inside approved budgets | **Not measured** | See section 6 |

## 6. Limitations

- Plan §12 item 9 asks for measured cold activation, view-open latency, first-token overhead,
  retained memory, listener count, queue depth and a 100-request soak against the approved baseline.
  Those were **not** measured. Registration is lazy and adds no activation-time work, and the
  existing performance suites remain green, but that is an argument, not a measurement. The
  performance criterion is therefore recorded as outstanding rather than met.
- Plan §12 item 10 asks for keyboard, screen-reader, zoom, high-contrast and all-theme accessibility
  checks in a real host. The document uses theme tokens, an ARIA live region, native controls,
  keyboard-activatable links and a deterministic focus order, and these are asserted structurally,
  but no assistive-technology session was run.
- Restricted Mode view behaviour was not executed in an installed host, for the same host-forces-trust
  reason recorded in the existing matrix.
- Real upstream model behaviour, provider accounts, billing and non-Windows hosts remain
  environment-dependent and are not established by this evidence.

## 7. Gate decision

The optional surface is safe to keep in the branch and did not regress the certified extension.
Because the performance and accessibility measurements in §12 items 9-10 were not executed, this is
**not** a completed Work Package 5 sign-off: promotion and any public documentation claim remain
blocked until those measurements exist and the owner approves an artifact checksum.
