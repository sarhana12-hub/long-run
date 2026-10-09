# Design brief: Summit illustrations for Peak

## What Peak is
Peak is a running training-plan app (a single-page PWA, dark-mode-first). Users generate a personalized week-by-week plan toward a race, log their runs, and track progress. It's built for one person's own use and a couple of close friends — not a commercial product, so the tone should be encouraging and low-key rather than polished/corporate.

## What we're building
A small in-app achievement system with two tiers:
- **Frequent badges** — a simple line-icon badge that pops up for common wins (first run logged, hitting a week's mileage target, a new fastest tempo run). This already exists: a single-color mountain/peak line icon inside a colored circle.
- **Rare "summit" moments** — bigger, more special celebrations for two plan-defining milestones:
  1. **50% of the plan completed** (by training volume)
  2. **Race day / plan finished**

## What we need from you
Two illustrations that read as a pair — the same runner/mountain scene at two points in a single journey:
1. **Halfway up** — a small runner figure partway up a mountain ascent, on the trail, with the summit still ahead.
2. **At the summit** — the same runner at the top of the mountain, arrived.

They should clearly belong to the same visual world (same mountain shape, same runner character/style, same palette) so a user immediately reads them as "further along the same climb," not two unrelated pieces of art.

## Style constraints
- **Format:** SVG (this is a static app with no image hosting — icons are inlined as SVG strings directly in the HTML/JS).
- **Palette:** needs to work on our accent green:
  - Dark mode (default): `--accent:#D4FA4D`, `--accent-ink:#0E1704`, background surfaces `#1A211C`/`#101511`
  - Light mode: `--accent:#C3F53A`, `--accent-ink:#122006`, background surfaces `#FFFFFF`/`#F3F5F0`
  - Simplest path: keep it to 1-2 colors so it can adapt between light/dark, similar to how our existing icons use `currentColor` for strokes. If you want a filled/multi-tone illustration instead, it should still hold up against both a near-black and a near-white background.
- **Size/shape:** these will sit inside a celebration modal (a bottom sheet), likely larger than our existing 44px line icons — think a small hero illustration, roughly square or slightly wide, not a thin icon. Fine to suggest your own proportions.
- **Not needed:** no text/lockup baked into the artwork, no photorealism — a friendly, minimal illustrative style matching an app that already uses simple geometric line icons elsewhere (see attached icons for reference: a mountain-peak brand mark, and a circular badge with a simplified peak glyph).

## Deliverable
Two SVG files (or the raw SVG markup), one per moment, sized/styled consistently with each other.
