# Tokonomics Development Validation Report

> Decision: **VALIDATION_PASSED_NOT_RELEASE_CERTIFIED**
> Classification: **development-validation**
> Release certified: **No**
> Generated: `2026-09-02T01:38:41.149Z`

## Reproducibility

- Commit: `4cb41b7dd78c8abff3d759003e100302faf542e0`
- Branch: `main`
- Clean before validation: **yes**
- Package: `tokonomics@5.1.1`
- Lock metadata consistent: **yes**
- Dataset SHA-256: `0347d021aa250511b865a987c4fdf4dee8586335e5f48fdba4a79efdc6fed1d2`
- Node: `v24.19.0`
- Platform: `win32/x64`
- Artifact: `tokonomics-5.1.1.vsix` (1192115 bytes, SHA-256 `694442a890ef7161d461efeedca7b272600a6ef64dec5bf1eead83dc76502530`)

## Executed gates

| Gate | Description | Required | Result | Duration (ms) |
|---|---|---:|---:|---:|
| phase0-integrity | Measurement-truth, claim-registry, provenance, and metadata checks | yes | PASS | 157.43 |
| typescript | Strict TypeScript compilation | yes | PASS | 1124.79 |
| automated-tests | Repository automated test suite | yes | PASS | 6373.52 |
| production-bundle | Production extension bundle | yes | PASS | 555.02 |
| vsix-package | Create the exact VSIX artifact to be inspected | yes | PASS | 2469.79 |
| vsix-integrity | Inspect packaged trust metadata and compile every shipped parser WASM | yes | PASS | 55.54 |

## Limitations

- This report validates repository commands, not an installed VS Code Extension Host.
- Controlled synthetic benchmarks do not establish upstream-model task-success uplift.
- Artifact installation, parser loading, workspace-trust, and provider protocol certification remain future release gates.

This document contains no pre-populated production decision. Its gate states are derived
from commands executed during this run. A passing development-validation report is not
permission to publish production, privacy, savings, or task-success claims.
