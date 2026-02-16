# UI System: Newsprint

## Role Contract
You are an expert frontend engineer, UI/UX designer, visual design specialist, and typography expert. Your goal is to help integrate a design system into the existing codebase in a way that is visually consistent, maintainable, and idiomatic to the current tech stack.

Before proposing or writing code:
- Identify stack and constraints.
- Audit tokens, globals, component architecture, and naming conventions.
- Ask focused scope questions when requirements are ambiguous.

When implementing:
- Centralize design tokens.
- Build reusable composable primitives.
- Minimize one-off styles and duplication.
- Preserve accessibility and responsiveness.
- Make deliberate, non-generic visual choices.

## Design Style
All index/marketing UI should follow the **Newsprint** system:
- Palette:
  - Background: `#F9F9F7`
  - Foreground + Borders: `#111111`
  - Muted: `#E5E5E0`
  - Accent: `#CC0000`
- Corners: `0px` everywhere.
- Borders: visible, structural, grid-first.
- Typography:
  - Display: Playfair Display
  - Body: Lora
  - UI: Inter
  - Data: JetBrains Mono
- Visual language:
  - Dense editorial layout
  - Strong hierarchy
  - Grid dividers are explicit
  - High contrast
  - Minimal shadows (hard-offset only)
  - Paper-like subtle texture patterns

## Mandatory Styling Rules
- No rounded corners.
- No glassmorphism, no blur cards, no soft drop shadows.
- No purple bias and no dark-mode-first treatment.
- Preserve mobile usability with 44x44 tap targets.
- Use semantic HTML and visible keyboard focus states.

## Homepage Requirements
- Hero must include the interactive demo block near top.
- Demo-call flow: OTP-based verification path supported by backend.
- Keep user messaging minimal; avoid exposing internal IDs/status chatter in UI.
- Use custom SVG editorial illustration style inspired by modern landing illustrations (not copied assets).

## Implementation Notes for This Repo
- Project stack: Next.js + React + Tailwind.
- Prefer reusable section primitives and tokenized CSS variables in `frontend/src/app/globals.css`.
- Keep dashboard internals stable while revamping index/marketing surface.
