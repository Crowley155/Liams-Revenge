# USDWatch Agent Instructions

These instructions apply to the whole repository.

## Required UI Guardrails

Before creating, editing, reviewing, or polishing any UI, read and apply:

1. Project design context: `.impeccable.md`
2. Global UI guardrails when available: `C:\Users\willi\.codex\design.md`

If the global file is unavailable in the current environment, still apply this baseline:

- Build the real product surface first, not a marketing placeholder.
- Keep parent-facing workflows calm, direct, and task-focused.
- Use existing components, tokens, routes, and patterns before inventing new ones.
- Avoid generic AI/SaaS tells: gradient text, decorative orbs, glassmorphism, nested cards, repeated feature-card grids, fake metrics, oversized hero treatments for app screens, and purple-blue/cyan tech palettes.
- Do not use cards inside cards.
- Use icons for familiar actions like delete, close, upload, search, filter, download, save, and navigation.
- Design explicit empty, loading, error, disabled, hover, focus, active, selected, mobile, narrow-container, and long-text states.
- Keep text from overlapping or overflowing on desktop, mobile, and narrow panes.
- Prefer restrained, dense, scannable product UI for the private app.
- Use direct UX copy. Avoid filler like "seamless", "unlock", "leverage", and implementation details that do not help the parent act.
- Respect `prefers-reduced-motion` for nonessential animation.

Project-specific guidance and existing design-system conventions win when they are more concrete.

## Repository Safety

- Do not commit secrets or local `.env` files.
- Keep `deliverables/` and `superpowers/` untouched unless the user explicitly asks to edit them.
- Run relevant frontend/backend checks before pushing implementation work.
- Push completed implementation work to GitHub unless the user explicitly asks to keep it local.
