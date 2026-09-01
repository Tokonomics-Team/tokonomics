# Tokonomics Development Validation Report

> Decision: **VALIDATION_PASSED_NOT_RELEASE_CERTIFIED**
> Classification: **development-validation**
> Release certified: **No**
> Generated: `2026-09-01T15:38:40.971Z`

## Reproducibility

- Commit: `716f88d0e5a63bb45df30524eccbc0ac4bcc8352`
- Branch: `main`
- Clean before validation: **yes**
- Package: `tokonomics@5.1.1`
- Lock metadata consistent: **yes**
- Dataset SHA-256: `0347d021aa250511b865a987c4fdf4dee8586335e5f48fdba4a79efdc6fed1d2`
- Node: `v24.19.0`
- Platform: `win32/x64`
- Artifact: `tokonomics-5.1.1.vsix` (1192515 bytes, SHA-256 `3a4dc025de143bedb3b25f78793b0af8b8da4d21424f81e50a960dffe26a5641`)

## Executed gates

| Gate | Description | Required | Result | Duration (ms) |
|---|---|---:|---:|---:|
| phase0-integrity | Measurement-truth, claim-registry, provenance, and metadata checks | yes | PASS | 157.41 |
| typescript | Strict TypeScript compilation | yes | PASS | 1076.04 |
| automated-tests | Repository automated test suite | yes | PASS | 6548.35 |
| production-bundle | Production extension bundle | yes | PASS | 539.58 |
| vsix-package | Create the exact VSIX artifact to be inspected | yes | PASS | 2086.49 |
| vsix-integrity | Inspect packaged trust metadata and compile every shipped parser WASM | yes | PASS | 61.58 |

## Limitations

- This report validates repository commands, not an installed VS Code Extension Host.
- Controlled synthetic benchmarks do not establish upstream-model task-success uplift.
- Artifact installation, parser loading, workspace-trust, and provider protocol certification remain future release gates.

This document contains no pre-populated production decision. Its gate states are derived
from commands executed during this run. A passing development-validation report is not
permission to publish production, privacy, savings, or task-success claims.
