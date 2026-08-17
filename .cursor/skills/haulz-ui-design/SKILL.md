---
name: haulz-ui-design
description: >-
  HAULZ UI/UX rules for guest marketing and app chrome. Use when editing guest
  pages, landings, calculator shell, visual polish, DESIGN.md, or when the user
  asks about look & feel, hero, branding, or frontend design.
---

# HAULZ UI Design Skill

## When to use

Apply on any change to:

- `src/pages/guest/**`
- guest styles (`guest-shadcn.css`, calc guest shell)
- marketing / promotional surfaces
- visual refactors that touch layout, color, type, motion

Also use when the user says: дизайн, UI, hero, лендинг, guest home, визуал, «сделай красивее».

## Required reading (in order)

1. `docs/DESIGN.md` — source of truth
2. Nearby existing screen (same folder) — match patterns
3. `src/design-tokens.css` + `src/styles/modules/theme.css` for tokens
4. User frontend design rules in the session (hero budget, no cards in hero, brand first)

## Hard rules (do not violate)

- Brand **HAULZ** must be hero-level on guest/landing first viewport.
- First viewport: brand + one headline + one short line + one CTA group + one dominant visual. Nothing else.
- No hero overlay badges/chips/stickers.
- Default: no cards; never cards in the hero.
- No purple/indigo glow themes, cream+terracotta kits, or broadsheet newspaper layouts.
- Prefer existing tokens (`#2563eb` / `#3655FF` brand blues). Do not invent a new palette.
- Guest small edits: preserve current guest shell. Full visual refresh: move toward Manrope/DM Sans per `docs/DESIGN.md`.
- Mobile and desktop both required.

## Workflow

1. State which surface you are editing (guest vs app).
2. Sketch section purpose in one sentence before coding.
3. Implement with existing components (`shadcn` on guest, SaaS modules in app).
4. Self-check against the Agent checklist in `docs/DESIGN.md`.
5. If guest routes changed, run `npm run test:e2e:guest` when a preview/dev server is available.

## Out of scope

- VPS / DNS / SSL (use haulz-vps-ops)
- Large refactors without UI (use haulz-refactor)
- Inventing product data (cargo numbers, invoice amounts) — bind to API/cache fields only
