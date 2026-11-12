# Design record — unslop audit and passes

Interface work followed the unslop skill (`https://github.com/heydamir/unslop`, Damir Sokolovsky, CC BY 4.0), installed
at `.opencode/skills/unslop/`. This file records the audit, the direction and what the passes changed, as the skill
requires.

## 1. Direction

- **Product.** An agent that buys the exact device you describe, after showing its work and asking you to approve —
  for people who know what they need but not which model.
- **Character.** Exact, watchful, tactile. Not "clean", "modern" or "premium".
- **World.** An instrument bench and a paper ledger: warm paper, ink, a draftsman's cobalt, monospace annotations.
- **Moments.** (1) The run ledger: a dark, hairline-ruled panel where each tool call lands with its result and
  duration. (2) The approval sheet, built like a signed purchase order with a stamped total. (3) The code-drawn product
  plates in the catalogue, consistent like a parts catalogue rather than stock photography.
- **Signature.** The tick rule: a vertical hairline with a small square tick and a two-digit index, used in the hero
  run, the timeline and the section numbering. One detail, repeated.

Palette: paper `#F7F4EE`, surface `#FDFBF7`, raised `#EFE9DF`, ink `#1F1B16`, secondary `#5E554A`, muted `#7B7266`,
hairline `rgba(31,27,22,0.10)`, cobalt accent `#1F3ED9`, toned semantics (`#1D7A4D`, `#8A5A15`, `#A33429`), night
`#14120F` for the ledger panel.

Type: Instrument Sans for interface, Instrument Serif for the hero and page display lines, IBM Plex Mono for figures,
meta and labels. Weights 400–600 only. Numbers are tabular everywhere money appears.

## 2. Audit before building

The brief itself listed the usual AI-dashboard tells. They were treated as a pre-build audit and each got a rule:

| Slop sign | Rule applied |
| --- | --- |
| Purple/blue gradients, glow, glass | One neutral ramp, one accent, depth from hairlines and surface steps |
| Emoji navigation and sparkle badges | Lucide line icons, 16px, 1.5 stroke; no emoji anywhere in the UI |
| Gradient wordmark tile | Flat mark: "M" in ink with a cobalt baseline rule |
| Oversized headings everywhere | Display serif only for hero and page titles; interface stays 12–15px |
| Chat bubbles and a generic chat layout | Editorial transcript with hairline separators and an inspectable run ledger |
| Every card floating | Borders and 4px grid, radii 8–18 with nested radius maths |
| Uppercase tracked section labels | Sentence case throughout, mono only for meta and indices |
| "AI-powered" marketing copy | Copy names the mechanism: catalogue records, policy, PayPal capture |
| Fabricated traction ("loved by 10,000") | Only checkable numbers: 39 records, 10 tools, sandbox |
| Pulsing/looping decoration | Motion only for live tool calls and menu entrances |

## 3. Passes applied

1. **Spacing.** 4px grid. Sidebar rows 36 with 2px gaps, page padding 24–32, panels 16, section rhythm 64/96. Icon box
   fixed at 16 so every nav label and every list label starts on the same line.
2. **Colour.** Warm neutral ramp across all surfaces; cobalt appears only on the primary approval action, the active
   nav marker, links and one key figure. No gradients on surfaces, no coloured shadows. Semantic colours are used only
   for real state (paid, policy violation, out of stock).
3. **Icons.** One set (Lucide), 16px (13–14 inline), stroke 1.5, always in the muted or secondary text role.
4. **Copy.** Headlines say what happens: "A shopping run is a sequence of tool calls, not a conversation", "The agent
   stops where the money starts". No exclamation marks, no trailing periods on labels, no hype verbs. Sample prices are
   labelled as sample, unconfigured PayPal is labelled as unconfigured.
5. **Type.** Instrument Sans + Instrument Serif + IBM Plex Mono. Sentence case. Tabular figures. Hero 64/1.04 with
   −0.02em, small text at 0 tracking.
6. **Layout.** Asymmetric hero: copy left, a code-built run ledger and approval preview right, no centred stack.
   App shell: 248px sidebar, fluid content capped at 1360. Login and landing composed as a whole with no dead band.
7. **Details.** Nested radii (18 panel → 10 inner control), mono indices, quiet counts instead of pills, a focus ring
   on every control, `details` disclosure for completed runs and raw tool IO.
8. **Visuals.** No stock imagery. Product figures are drawn in SVG per category so they are accurate, consistent and
   offline-safe; the hero visual is the product itself (a run ledger), not a decoration.
9. **Motion.** One ease (`cubic-bezier(0.22,1,0.36,1)`), 120–180ms for hover/press, 300ms for expansions. No
   `transition-all`, no `hover:scale`, no looping animation except the spinner on a genuinely live tool call.

## 4. Corrections made after rendering

- The landing "Awaiting approval" status was green; changed to the amber warn tone because it is pending, not settled.
- The login left panel left a dead band under the copy; the middle block is now vertically centred with the receipt
  rule anchoring the footer.
- The workspace composer sat against the transcript; it is now a sticky panel over a paper gradient so the run stays
  visible while typing.
- Playwright review confirmed no console errors on the landing, login, workspace, catalogue, comparison, cart,
  approval and checkout screens.

## 5. What was left alone

No generated imagery was used because no image tool was available and the app screens do not need one; the ledger and
product plates are built in code. The vendored skill is unmodified.
