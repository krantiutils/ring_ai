# Agent Instructions

## UI Authority
For all frontend/index/marketing design work in this repository, follow `UI.md` as the source of truth.
The current enforced system is **Terminal CLI** (dark, monospace, scanline, shell-metaphor UI).
Codex/Claude must not introduce styles that conflict with this system.

Required behavior:
1. Build a clear model of existing stack/tokens/component architecture before edits.
2. Ask focused scope questions if requirements are ambiguous.
3. Implement using reusable patterns and centralized tokens.
4. Preserve accessibility, responsiveness, and maintainability.
5. Enforce Newsprint style rules from `UI.md`.

## Issue Tracking
This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context.

Quick reference:
- `bd ready`
- `bd create "<title>" --type task --priority 2`
- `bd close <id>`
- `bd sync`
