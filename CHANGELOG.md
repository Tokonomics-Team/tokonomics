# Tokonomics release notes

This file summarizes user-visible changes. Internal design, implementation details,
security-sensitive controls, and evaluation methods are maintained separately.

## 6.0.0 — 2026-09-03

- Introduced the Tokonomics 6.0 release line.
- Improved context preparation reliability and conservative fallback behavior.
- Strengthened workspace trust, privacy, resource, and release controls.
- Added independently disableable, opt-in preview features; all remain off by default.
- Improved request-level activity, token, and supported cost reporting.
- Improved live dashboard refresh behavior, theme integration, responsiveness, and accessibility.
- Expanded automated release checks for supported VS Code versions and packaged builds.
- Simplified public documentation and separated internal engineering documentation.

No preview feature is promoted as a production capability in this release. Measured
results continue to depend on the task, workspace, model, and provider.

## 5.x — 2026

- Added workspace-aware context preparation and chat integration.
- Added activity dashboards, diagnostics, and configurable local resource limits.
- Improved handling of failures, cancellation, workspace changes, and Restricted Mode.
- Added packaged-extension compatibility and integrity checks.

## 4.x — 2026

- Added broader context and usage-management capabilities.
- Improved local diagnostics and user controls.

## 1.x–3.x — 2026

- Initial VS Code releases.
- Added workspace utilities, chat commands, and usage visibility.

Historical statements from earlier development artifacts are not production
guarantees. Current behavior is defined by the installed release and its documented
settings.
