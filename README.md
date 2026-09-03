# Tokonomics 6.0

AI context efficiency and usage visibility for Visual Studio Code.

[![Version](https://img.shields.io/badge/version-6.0.0-blue.svg)](https://marketplace.visualstudio.com/)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.106%2B-purple.svg)](https://code.visualstudio.com/)
[![Validation](https://img.shields.io/badge/artifact-tested-blue.svg)]()
[![License](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE.txt)

Tokonomics helps reduce unnecessary context sent during AI-assisted development and
shows request-level token and cost information when reliable usage data is available.
Results vary by task, workspace, model, and provider.

## Highlights

- Works directly inside VS Code.
- Helps keep coding context focused and within configured limits.
- Provides workspace-aware chat commands and context utilities.
- Shows session activity, token estimates, and supported cost information.
- Includes local safety controls, Restricted Mode behavior, and emergency disablement.
- Keeps optional preview features disabled until you explicitly enable them.

## Getting started

1. Install the Tokonomics VSIX or install it from your approved extension source.
2. Open the VS Code Chat view.
3. Enter a request using `@tokonomics`:

   ```text
   @tokonomics explain the authentication flow in this workspace
   ```

4. Open the Command Palette and search for `Tokonomics` to see the available actions.

Tokonomics uses conservative defaults. Workspace-derived context is limited in
Restricted Mode and can be further controlled from VS Code settings.

## Chat commands

| Command | Purpose |
|---|---|
| `/dashboard` | Open the activity dashboard |
| `/live` | View the current session summary |
| `/explain` | Explain the latest context decision |
| `/stats` | View available usage totals |
| `/map` | Create a concise workspace overview |
| `/pack` | Prepare selected workspace context |
| `/analyze` | Review the active file |
| `/compact` | Prepare selected text for AI use |
| `/logs` | Open sanitized diagnostics |
| `/ram` | View the configured local memory status |

## Common settings

Settings are available under `Tokonomics` in VS Code:

- Workspace context mode
- Local memory limit
- Response-cache controls
- Release channel and emergency disablement
- Capability kill switches
- Optional preview-feature consent

Preview features are off by default. Enabling consent alone does not select a preview
feature, and every preview feature can be disabled independently.

## Privacy and security

Tokonomics performs its context preparation inside the local extension process and
does not require a Tokonomics-operated intermediary service. Prompts and selected
context are still sent to the AI provider chosen in VS Code.

The extension applies local safeguards and sanitized diagnostics, but users should
still review context before sending sensitive material. VS Code, other installed
extensions, and the selected AI provider have their own privacy and network behavior.

## Compatibility and validation

Tokonomics 6.0 requires VS Code `1.106.0` or later. Release builds are checked as exact
VSIX artifacts against the configured Windows minimum, Stable, and Insiders host
matrix. Other editors, operating systems, remote environments, provider accounts, and
billing behavior require separate qualification.

Repository benchmarks include controlled test fixtures. They validate expected
software behavior but do not guarantee production token savings, cost reduction, or
model-quality improvement.

## Support

- [Report a bug](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Request a feature](https://github.com/Tokonomics-Team/tokonomics/issues)
- [Community discussions](https://github.com/Tokonomics-Team/tokonomics/discussions)
- [Project website](https://tokonomics-team.github.io/tokonomics)

When reporting a problem, use the Tokonomics diagnostic export and review it before
sharing.

## License

Tokonomics is proprietary software. See [LICENSE.txt](LICENSE.txt).
