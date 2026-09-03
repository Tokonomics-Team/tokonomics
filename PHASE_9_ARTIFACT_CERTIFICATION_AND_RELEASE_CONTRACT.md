# Phase 9 artifact certification and release contract

## Scope and evidence rule

Phase 9 certifies an exact VSIX payload, not a mutable source checkout. Every artifact
report is bound to the VSIX SHA-256, package identity, Git commit, lockfile, build inputs,
host versions, and executed gate results. Source-level and controlled synthetic tests are
supporting evidence only; they cannot substitute for an installed Extension Host run or
establish provider task-success, billing, privacy, or savings claims.

Publication remains a human decision. No script uploads, publishes, signs, changes a
marketplace listing, or labels a build globally production-certified.

## Required release gates

1. Measurement-truth and claim-registry validation.
2. Strict TypeScript compilation and the complete repository regression suite.
3. Production bundling and creation of the named VSIX.
4. Bounded inspection of that VSIX: canonical paths, no duplicates, no encryption,
   no symlinks, entry/total size ceilings, compression-ratio ceiling, required files,
   manifest parity, unique commands, limited untrusted-workspace support, no wildcard
   activation, no source maps, and no private/development paths.
5. Compilation of every packaged Tree-sitter WASM module.
6. CycloneDX 1.5 SBOM and unsigned in-toto/SLSA-style provenance whose subject is the
   inspected artifact hash. `signed: false` is explicit; the report is not a signature.
7. Installation of the exact VSIX into isolated extension/user-data directories followed
   by payload comparison. VS Code's added `package.json.__metadata` is the only normalized
   field; all other manifest fields and packaged files must match.
8. Extension Host execution on the minimum supported VS Code, current Stable, and current
   Insiders channels. The external suite checks multi-root activation, trust state,
   commands, webview entry points, configuration defaults, diagnostic registration state,
   and parser loading. Missing hosts are `not-executed`, never passes.
9. Dependency audit with no unresolved known vulnerability.

`npm run certify` executes the local Stable artifact gate and deliberately reports an
incomplete matrix. `npm run certify:release` executes all three hosts and may report
`ARTIFACT_CERTIFIED_AWAITING_HUMAN_RELEASE_APPROVAL`; it still cannot publish.

## Compatibility policy

The authoritative matrix is `validation/compatibility-matrix.json`. Its minimum version
must equal the lower bound in `engines.vscode`; Stable and Insiders resolve at execution
time and the actual versions are recorded. A single report must contain passes for every
required entry. Results from different artifacts or runs cannot be combined.

Remote, WSL, SSH, Codespaces, Dev Container, provider-account, and marketplace behavior
are separate environment qualifications. They may not be inferred from the Electron
matrix.

The Extension Development Host forces its development workspace trusted. Consequently,
the matrix records Restricted Mode runtime as `not-executed`; it verifies the packaged
limited-trust declaration, while source-level Phase 1 tests exercise restricted workspace
reads and egress. A marketplace-installed Restricted Mode run remains a separate manual
release qualification and must not be reported as an automated host pass.

## Local release controls

- `releaseChannel=stable` enables the reviewed stable path.
- `releaseChannel=canary` enrolls a deterministic local 0-99 bucket only when it falls
  below `stagedRolloutPercent`; no installation identifier is transmitted or persisted.
- `releaseChannel=disabled` preserves canonical requests without optimization.
- `emergencyDisableOptimization=true` is the fastest complete pass-through switch.
- `disabledCapabilities` independently disables compiler, workspace index, response
  cache, image rightsizing, or local inference behavior.

Release-control changes are applied at runtime. Disabling workspace indexing clears the
active snapshot before further attachment and prevents new file-event work. A compiler
kill switch records the coded `release_control_pass_through` fallback and reports zero
token savings.

## Staged rollout

The recommended sequence is internal/isolated validation, 5% canary, 25%, 50%, then 100%.
At each step, review failures, cancellation, fallback rate, activation latency, queue
saturation, memory, unreconciled cost records, and user-reported correctness. Do not
advance on a material preservation, privacy, crash, provider-protocol, or data-loss
regression. Changing the percentage never requires a new remote service.

## Rollback rehearsal

1. Set `emergencyDisableOptimization=true`; verify a differential fixture is byte-identical
   and records zero savings.
2. If the incident is isolated, set the corresponding `disabledCapabilities` entry and
   re-enable only after its regression gate passes.
3. Set `releaseChannel=disabled` if configuration distribution requires a channel-level
   stop.
4. Retain the previous reviewed VSIX and its SHA-256. Uninstall the affected version,
   install that exact artifact with an isolated smoke test first, and verify its hash and
   compatibility evidence before wider rollback.
5. Never delete the request ledger or validation evidence to make a rollback appear clean.
   Record the incident window, affected artifact hashes, decision owner, and recovery gate.

The rollback is considered rehearsed only when automated tests prove the kill switch is
verbatim and deterministic, and an isolated host can install/activate the candidate VSIX.

## Generated evidence

- `validation/reports/vsix-inspection.json`
- `validation/reports/sbom.cdx.json`
- `validation/reports/artifact-provenance.json`
- `validation/reports/extension-host-matrix.json`
- `validation/reports/certification-report.json` and `.md`

Generated timestamps and invocation identifiers are intentionally per-run. Artifact and
entry hashes, package/lock metadata, matrix versions, and Git provenance provide the
reproducible linkage.
