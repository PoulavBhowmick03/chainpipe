# Accessibility pass — dashboard

> AI-generated, 2026-06-26. Branch `theme/solana-accent`. `npm run build` passes before and
> after these edits. I applied the **unambiguous, non-visual** fixes directly (listed under
> "Fixed"); the rest are documented with file:line for you to triage, because they touch
> layout/behaviour where your judgement matters.

## Fixed in this pass (safe, no visual change)

- **`components/PipelineBuilder.tsx`** — the form had **zero** label/control associations and
  one input (budget) with no label at all. Added:
  - `aria-label="Budget locked, in USDC"` on the budget input (was completely unlabelled).
  - `htmlFor`/`id` pairs tying each visible `<label>` to its control (Skill, Task, Input URL,
    Alloc USDC, Deadline H).
  - `role="group"` + `aria-labelledby` on the tier selector, with `aria-pressed` and a
    descriptive `aria-label` ("Required tier N") on each T1/T2/T3 button (the visible text
    "T1" isn't a meaningful name on its own).
  - `aria-pressed` + descriptive `aria-label` on each "Depends on" toggle button.
- **`components/CommandPalette.tsx`** — added `aria-modal="true"` to the dialog and
  `aria-label="Search commands"` to the search input (placeholder text is not a reliable
  accessible name).

## Remaining gaps (not touched — your call)

Scope signal from the scan: only 8 `aria-*` attributes and 1 `role=` across the whole
`app/` + `components/` tree before this pass; 0 `alt=` (there appear to be no `<img>` tags —
imagery is CSS/SVG, so confirm decorative SVGs are `aria-hidden`).

1. **Other forms with unassociated labels.** Same pattern as PipelineBuilder likely exists in:
   - `app/work/page.tsx` (has an input)
   - `components/BazaarTable.tsx` (filter/search input)
   - `app/my/stake/page.tsx` (6 `onClick` handlers — check stake-amount inputs)
   Grep `grep -rn "<input\|<select\|<textarea" app components` and verify each has either a
   wrapping/`htmlFor` label or an `aria-label`.

2. **Icon-/glyph-only buttons.** Buttons whose only content is a glyph ("→", "✓", "+", "↗")
   have no accessible name. PipelineBuilder's "+ Add node" and "Purge" are fine (real text),
   but audit the arrow/checkmark-only ones (e.g. the create button's trailing "→" is
   decorative and fine since the button has text, but standalone glyph buttons elsewhere are
   not). Add `aria-label` or visually-hidden text.

3. **CommandPalette focus trap.** It traps nothing — Tab can move focus to the page behind
   the open dialog. For a `aria-modal` dialog this is technically incorrect. Low priority
   (it's keyboard-driven via arrows), but a proper trap (or `inert` on the background) would
   finish it. Also consider `role="listbox"`/`role="option"` + `aria-activedescendant` for
   the results so SR users hear the active item during arrow nav.

4. **Color-contrast / non-color status.** The theme uses `C.dim`/`C.faint` greys and
   green/red purely for state (e.g. over-budget, dispute timers). Two things to verify with a
   contrast checker against the dark bg: (a) the faint greys meet WCAG AA (4.5:1 for body
   text), and (b) state isn't communicated by **color alone** — e.g. the budget bar going
   `C.red` should also have a textual "over budget" cue (it does, good — confirm the same
   elsewhere, like `DisputeTimer`).

5. **Focus-visible styles.** Inputs in CommandPalette use `outline: "none"` (L84). Confirm
   there's a visible focus indicator somewhere (custom ring) or keyboard users lose the focus
   cue. Check `globals.css` for a `:focus-visible` rule; if absent, that's an AA failure.

6. **Landmark/heading order.** Spot-check that each page has one `<h1>` and headings don't
   skip levels (the builder jumps between `<h2>` "01 / Specification" and `<h3>` "Ledger
   Appropriation" in sibling sections — verify the outline reads sensibly).

## How to verify

There's already `playwright` in devDependencies and a `scripts/shoot.mjs`. The cheapest
objective check is to add `@axe-core/playwright` and assert zero violations on each route —
that would catch 1, 2, and 5 automatically and give you a regression guard. Manual SR pass
(VoiceOver: Cmd-F5) on the create-pipeline flow is the highest-signal human check.
