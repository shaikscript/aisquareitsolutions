# AI Square — visual language ("Ink & Brass")

One accent, flat surfaces, hairline rules, quiet motion. If a screen needs a
second colour to read, the hierarchy is wrong — fix the hierarchy.

## Surfaces (dark, default)
| token | value | use |
| --- | --- | --- |
| `--bg` | `#0b0b0c` | page |
| `--bg-soft` | `#0e0e10` | alternating bands |
| `--panel` | `#121214` | cards |
| `--panel-2` | `#161618` | nested blocks, inputs |
| `--panel-3` | `#1b1b1e` | pressed / active fills |
| `--line` | `rgba(255,255,255,.075)` | every border |
| `--line-strong` | `rgba(255,255,255,.13)` | emphasis borders |

## Type
- `--text #f3f0e9` (bone, never pure white), `--muted #a29e96`, `--faint #78756d`.
- Sans: Geist Variable. Editorial accents: Instrument Serif italic, used only on
  emphasised words inside a headline (`.hero h1 em`, `page-hero h1 em`).
- Numbers in stats/tables: tabular, mono for codes and IDs.

## Accent
- Exactly one: brass `--brass #d9a441`, bright `#f0c574`, ink-on-brass `--bg`.
- Semantic colours are desaturated and only appear in badges and meters:
  ok `#7fa88c`, warn `#d98a4e`, danger `#c9564e`, info `#7e9bb5`.
- No purple. No multi-hue gradients. No coloured halos on cards, buttons or menus.

## Shape & depth
- Radii: 6 / 10 / 14 / 18 / 24 / 30 (`--r-xs` … `--r-2xl`); buttons and inputs
  use `--r-btn` (10px), a rectangle — not a pill.
- Exactly two pill shapes remain: badges and filter chips.
- Shadows are black-only and short: `--shadow-sm/md/lg`. Elevation = border +
  shadow, never a glow.
- Glass blur is capped at 14px and only on the sticky app chrome.

## Motion
- `--ease cubic-bezier(.22,1,.36,1)`, 140 / 240 / 560ms.
- Hover lifts 1px, never scales up. Entrances fade + 8px rise. Nothing bounces.

## Light theme ("Daylight")
- Paper `#f7f4ec`, panel `#fffdf8`, ink text `#16140f`, accent deep ochre `#8a6520`.
- Same geometry and same rules; only lightness inverts.

## Regenerating brand icons
`tools/make-brand.sh` redraws `public/brand/*.png` from the same geometry as
`LogoMark` (needs ImageMagick; no browser required).
