---
version: alpha
name: AdPub × Linear
description: >
  Sistema operacional inspirado na gramática do Linear (densidade precisa,
  superfícies quietas, controles de 6px, lista como objeto primário) com o
  acento laranja AdPub (#ff5701) no lugar do roxo. Ferramenta de publicação
  Meta em lote para operadores de agência — não merchandising, não landing.
colors:
  brand: "#ff5701"
  brand-deep: "#c94100"
  on-brand: "#1a1005"
  canvas-light: "#f7f7f8"
  surface-light: "#ffffff"
  ink-light: "#1b1b1f"
  muted-light: "#5c5e66"
  line-light: "#e4e4e7"
  canvas-dark: "#0f0f11"
  surface-dark: "#18181b"
  ink-dark: "#f4f4f5"
  muted-dark: "#a1a1aa"
  line-dark: "#2c2c32"
  ok: "#187044"
  warn: "#8a5800"
  danger: "#bc2637"
typography:
  family: Geist
  mono: Geist Mono
  body: 13px / 1.45
  title: 20px / 1.2 / 600 / -0.02em
radius:
  control: 6px
  panel: 8px
  pill: none
---

# AdPub design system

Use this file before any UI. Product truth lives in PRODUCT.md. Mode: **Operate**.

## Visual theme

Linear's product UI is the grammar: quiet canvas, hairline separators, tight type, one accent used as signal. AdPub keeps the orange mark so the tool stays ours.

Atmosphere: a well-lit control room, not a store and not a marketing site. Light is the default scene (daytime ops). Dark is a first-class peer, same geometry, not a dimmed invert.

Density: information-dense lists and forms. Padding 8 / 12 / 16 / 24. Never 80–160px marketing section gaps inside the app.

## Color roles

| Token | Light | Dark | Role |
|---|---|---|---|
| canvas | `#f7f7f8` | `#0f0f11` | App chrome behind panels |
| surface | `#ffffff` | `#18181b` | Panels, nav, tables |
| surface-2 | `#f3f3f5` | `#222226` | Hover, header cells, muted wells |
| text | `#1b1b1f` | `#f4f4f5` | Primary copy |
| muted | `#5c5e66` | `#a1a1aa` | Secondary; ≥4.5:1 on canvas |
| border | `#e4e4e7` | `#2c2c32` | Hairlines only |
| brand solid | `#ff5701` | `#ff5701` | Primary CTA, mark, selection |
| brand text | `#c94100` | `#ff9d70` | Links, selected nav (readable) |
| on-brand | `#1a1005` | `#1a1005` | Text on solid orange |
| accent-subtle | `#fff1ea` | `#3a241c` | Selected row / nav wash |
| ok / warn / danger | `#187044` / `#8a5800` / `#bc2637` | `#73d9a4` / `#f7cb73` / `#ff929b` | Status text, not fills |

Do not use Linear purple, Meta cobalt, or Optimistic VF. Do not use saturated status *fills* as text color.

## Typography

Geist (humanist grotesk; Inter's role in Linear). Geist Mono only for IDs, hashes, dates, money.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page title | 20px | 600 | -0.02em |
| Panel title | 13px | 600 | 0 |
| Body / control | 13px | 400 | 0 |
| Meta / hint | 12px | 400 | 0 |
| Section in nav | 11px | 600 | 0.06em; uppercase |

No kicker/eyebrow above headings. No gradient text.

## Components

**Buttons.** 6px radius, 13px/600, height 32–36px (40px on coarse pointer). Primary = solid brand. Secondary = surface + hairline. Ghost = transparent, hover surface-2. Never 100px pills.

**Inputs.** 6px, 40px min height, hairline, focus 2px brand ring offset 1px. Placeholder uses muted at full opacity.

**Tables.** The product. Flush to the panel; no card-in-card. Row hover surface-2. Tabular nums. Primary name is a link in text color, brand only on hover/focus.

**Tabs.** Underline / quiet selected, not inverted pills.

**Badges.** Small, 4px radius, tinted wash + readable text. Not pills.

**Nav.** 240px sidebar, hairline right. Selected item: accent-subtle + brand text. Collapse to 64px icons.

**Auth.** Split: dark stage with purpose on the left, form on the right. Mobile stacks stage compact then form.

**Notices.** Hairline + surface-2. Error uses danger text, names the problem and next step.

## Layout

App: sidebar + top bar + content. Content maxes naturally; tables scroll inside the panel. Toolbar and list share one workspace surface.

Spacing: group 8px, section 20–24px. More space above a heading than below it.

## Depth

Almost flat. Separation is hairline + canvas/surface contrast. Shadows, if any: `0 8px 24px rgba(15,15,17,.06)` — offset and blur, never a colored halo.

## Do

- One primary action per page head.
- Filters sit on the list they affect.
- Empty states name the next action.
- Theme Claro / Escuro / Sistema is always reachable.

## Don't

- Marketplace cards, 24px feature tiles, 100px CTAs (the discarded Meta commerce world).
- Nested cards. Hero-metric rows of big numbers as page structure.
- Purple accent, cobalt purchase buttons, Optimistic VF.
- Decorative glass, gradient type, emoji-as-icon.

## Responsive

- ≥900px: sidebar + content.
- <900px: drawer nav, stacked editor/review, content padding 16px.
- <600px: page head wraps; toolbar fields full width; hide email and workspace label.

## Agent prompt

Operate surface. Linear density, AdPub orange `#ff5701`, Geist, 6px controls, 8px panels, PT-BR ops copy. Lists beat cards. Never restyle as Meta Shop or a landing page.
