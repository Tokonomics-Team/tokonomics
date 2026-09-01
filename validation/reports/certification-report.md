# Tokonomics Development Validation Report

> Decision: **VALIDATION_PASSED_DIRTY_WORKTREE**
> Classification: **development-validation**
> Release certified: **No**
> Generated: `2026-09-01T14:26:57.347Z`

## Reproducibility

- Commit: `ea24a265d2757e7faf4a2f3779fa57b3e44f1daa`
- Branch: `main`
- Clean before validation: **no**
- Package: `tokonomics@5.1.1`
- Lock metadata consistent: **yes**
- Dataset SHA-256: `0347d021aa250511b865a987c4fdf4dee8586335e5f48fdba4a79efdc6fed1d2`
- Node: `v24.19.0`
- Platform: `win32/x64`
- Artifact: `tokonomics-5.1.1.vsix` (822503 bytes, SHA-256 `57785f30162b5c8687ac7273e0618cc618c2a3605b1c35c4281cf609df6ea76a`)

## Executed gates

| Gate | Description | Required | Result | Duration (ms) |
|---|---|---:|---:|---:|
| phase0-integrity | Measurement-truth, claim-registry, provenance, and metadata checks | yes | PASS | 159.57 |
| typescript | Strict TypeScript compilation | yes | PASS | 1043.84 |
| automated-tests | Repository automated test suite | yes | PASS | 6404.62 |
| production-bundle | Production extension bundle | yes | PASS | 543.26 |
| vsix-package | Create the exact VSIX artifact to be inspected | yes | PASS | 1866.56 |

## Limitations

- This report validates repository commands, not an installed VS Code Extension Host.
- Controlled synthetic benchmarks do not establish upstream-model task-success uplift.
- Artifact installation, parser loading, workspace-trust, and provider protocol certification remain future release gates.

This document contains no pre-populated production decision. Its gate states are derived
from commands executed during this run. A passing development-validation report is not
permission to publish production, privacy, savings, or task-success claims.
