# Validation report status

Reports in this directory that predate the Phase 0 measurement-truth work are historical
development artifacts. They are not release certificates and must not be used as evidence
for marketplace, privacy, savings, task-success, semantic-preservation, or production-readiness
claims.

The active `npm run certify` command regenerates `certification-report.json` and
`certification-report.md` from commands executed during that run. It deliberately labels the
result as development validation, records the current Git and environment metadata, and never
grants release certification. Installed-VSIX and real VS Code Extension Host certification are
planned for Phase 9.

The controlled synthetic benchmark uses predetermined corpus fixtures. It may validate harness
mechanics and compiler transformations, but it does not measure an upstream model's ability to
generate correct patches.
