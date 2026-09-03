# Validation report status

Reports in this directory that predate the Phase 0 measurement-truth work are historical
development artifacts. They are not release certificates and must not be used as evidence
for marketplace, privacy, savings, task-success, semantic-preservation, or production-readiness
claims.

The active `npm run certify` command regenerates `certification-report.json` and
`certification-report.md` from commands executed during that run. It packages, inspects,
installs, and launches the exact VSIX on the local Stable host, but deliberately labels the
minimum/Insiders matrix incomplete. `npm run certify:release` executes the required minimum,
Stable, and Insiders matrix. Even a complete pass awaits human release approval and never
publishes automatically.

Phase 9 artifact evidence also includes bounded VSIX inspection, per-entry hashes, a
CycloneDX SBOM, unsigned artifact provenance, and an installed-host compatibility matrix.
Reports from different artifact hashes or runs must not be combined to imply certification.

The Phase 10 experiment report is a promotion-decision ledger, not a release certificate.
It must hold candidates lacking external independent paired outcomes, a frozen dataset,
exact-artifact binding, production reachability, fallback evidence, independent disablement,
consent checks, or resource evidence. Internal and synthetic results cannot promote a
candidate.

The controlled synthetic benchmark uses predetermined corpus fixtures. It may validate harness
mechanics and compiler transformations, but it does not measure an upstream model's ability to
generate correct patches.
