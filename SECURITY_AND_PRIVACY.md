# Tokonomics security and privacy contract

Tokonomics compiles context locally, but the compiled request is sent to the upstream
language model selected in VS Code. The upstream provider's terms and retention policy
therefore apply to transmitted requests.

## Workspace access and outbound context

- Restricted Mode disables workspace indexing, background warming, project-file
  commands, automatic active-file attachment, and RAM retrieval.
- The default `workspaceContextMode` is `selection`. Only a deliberate editor selection
  is eligible; full active-file discovery requires the explicit `automatic` setting.
- Unsaved buffers are excluded by default. Sensitive filenames, ignore rules, binary
  files, oversized files, paths outside the workspace, and symlink escapes are blocked.
- Immediately before a cloud request, the complete compiled text and string-valued
  model options pass through one fail-closed boundary for cancellation, size limits,
  credential redaction, and path anonymization.
- Tool inputs, tool-result text, textual data parts, and nested tool/model options use
  the same final boundary. Opaque binary parts are not decoded or rewritten, but are
  copied byte-for-byte and counted toward the outbound payload limit.
- Unknown request or response part types are rejected rather than omitted. A cancelled
  or protocol-invalid request does not commit optimization metrics or a successful
  lifecycle event.

## Local retention

- Source text, prompts, model responses, parser trees, repository maps, and RAM slices
  are held in memory only. The response cache is session-memory only.
- VS Code global storage retains at most 1,000 numeric optimization metadata records;
  it does not retain prompt text, source code, filenames, or secrets.
- Diagnostics retain at most 500 sanitized entries in memory and mirror those entries
  to the session's VS Code output channel. Export occurs only through an explicit user
  command.
- `Tokonomics: Reset Session Metrics` deletes persisted optimization metrics and
  metadata, clears the response cache, and clears buffered/output-channel diagnostics.
  Uninstalling the extension and asking VS Code to remove its extension data removes
  the remaining extension-scoped global storage.

## Packaging guarantee

The production build copies a version-pinned Microsoft VS Code Tree-sitter runtime and
the TypeScript, JavaScript, and Python grammars into the VSIX. Certification opens the
actual VSIX, checks trust metadata and required entries, and compiles every shipped WASM
module. A missing or invalid asset fails certification.
