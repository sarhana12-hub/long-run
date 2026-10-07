# UI review — Peak (2026-10-07)

Reviewed by walking the live app at iPhone size (375 × 812, light and dark) and at desktop
width: onboarding (all three steps), the Plan tab across base, build, race week and race day,
the day sheet, the strength sheet, the Edit sheet, Log a run, Progress and Settings. PWA
plumbing was checked in the code.

Nothing below has been changed yet. Items are grouped, and within each group ordered by how
much they matter. "Fix" lines describe what I would do.

## What already works well

- A coherent visual system: dark surface, lime accent, mono numerals for distances and
  times, rounded cards, a real bottom tab bar and bottom sheets. It reads as an app, not a
  web page. The light theme is equally clean.
- Day cards carry the right hierarchy: day, workout name, one-line description with pace,
  distance on the right, a strength badge when it applies.
- The day sheet is good: blurred backdrop, handle, Edit and close, bullets for each part of
  the session, purpose and effort, a single primary action.
- Phase banners ("Moving from Base into Build this week", "Race week…") give the week a story.
- The home-screen plumbing is correct: `viewport-fit=cover`, safe-area padding on the top
  bar, tab bar, floating button and sheets, a status-bar scrim, `100dvh`, standalone
  display, Apple touch icon, light and dark theme colours, overscroll disabled, 16 px inputs
  (no iOS zoom on focus), numeric keypad on time fields, network-first service worker.

## A. Copy that is wrong or stale (fix first: these cost trust)

1. **Strength hint on step 3 contradicts the plan.** It says lower-body sessions "go on easy
   or rest days". The rule you set is run days only; rest days rest the legs. *Fix:* "go on
   easy run days, never on rest days or the day before a hard run".
2. **Base-phase hint describes the old logic.** "Scaled to how close your current mileage is
   to what the plan will peak at" was the fitness-ratio rule that was replaced by Daniels'
   priority weeks. *Fix:* "Daniels' Phase I: easy running and strides before speed work;
   its length follows the weeks you have."
3. **Three coach's notes stacked on week 1 that seem to argue with each other** (build to
   36 mi, 40 mi is the target, 28 mi doesn't fit). *Fix:* one short paragraph on the plan,
   and the "doesn't fit" note shown only on the weeks it applies to, quoting that week's
   figure. Make the notes card collapsible after first read.
4. **Day one says "behind plan −9 mi, 0% adherence, a bit behind pace".** A plan created
   mid-week starts its accounting on the previous Sunday, so the days before the runner even
   had a plan count as missed. *Fix:* accounting starts on the creation date (or the first
   planned run on or after it) unless the runner chose to backdate.
5. **The pace joke** ("about the running pace of a golf cart… getting yelled at by the
   starter") appears under the recent-race field for every runner, every time. One laugh,
   then it reads as unprofessional. *Fix:* plain "That's about 8:12/mi"; keep the humour for
   a badge.
6. **"On pace for 1:53:29 if you complete the rest of the plan" on day one.** This is a
   scheduled VDOT ramp, not evidence (see docs/PROJECTIONS-REVIEW.md). *Fix:* "could reach
   about 1:53 by race week if training goes to plan", shown as a range.

## B. Intuitiveness and ease of use

7. **Onboarding repeats the logo, tagline and page title on every step**, about a quarter
   of the first phone screen each time, and the Next button is always below the fold.
   *Fix:* compact header after step 1 and a sticky Next/Back bar.
8. **Custom distance and Units share a row**, so at phone width the Units chips stack
   vertically beside an empty input. *Fix:* Units on its own row, directly under the
   distance chips.
9. **Placeholders truncate on a phone** ("leave blank to let paces guid…", "Just type
   digits, e.g. 4…"). *Fix:* short placeholders, with the sentence as a hint below.
10. **"Rest days per week"** is asked while everything else talks about running days.
    *Fix:* ask for running days directly.
11. **Gym equipment in onboarding is a collapsed row ("17 of 34 ticked")** with no idea of
    what is ticked. *Fix:* show the first three names and "+14".
12. **Treadmill is hidden in Edit.** The toggle lives in the Edit form behind Save, and only
    exists for hill days; everything else relies on the global Speed (mph) display. You
    asked for the choice each time. *Fix:* a one-tap "Treadmill today" switch at the top of
    the day sheet that rewrites the session in mph and incline for any workout.
13. **The strength block is a wall of bullets.** Each exercise is one long sentence (sets,
    equipment, load, rest). *Fix:* rows with the exercise name bold, sets × reps in mono on
    the right, the cue on a second line, "How to" per exercise, and set checkboxes so the
    sheet works as a gym companion.
14. **No "today" marker.** The Plan tab opens on the current week, but nothing says which
    day is today once you scroll or browse another week. *Fix:* a Today pill in the top bar
    that jumps back, and a highlighted card for today.
15. **The floating "Log a run" button covers content**: the bottom card's distance on Plan,
    the stat tiles on Progress. *Fix:* hide it on Progress and Settings; add bottom padding
    on Plan.
16. **"0.0 mi / 13.1 mi" wraps to two lines** in the race-week header on a phone.
    *Fix:* `white-space: nowrap` and a smaller secondary figure.
17. **The "?" help is small and unexplained.** First-time users never learn what Base,
    Build, Cutback and Peak mean. *Fix:* a one-time "How to read your plan" card on first
    visit; the help button at a 44 px target.
18. **Settings is one very long page** (the 34-row equipment list in the middle).
    *Fix:* collapsible groups, equipment behind its own row.

## C. Aesthetic appeal

19. **The coach's-notes card uses the same surface as the day cards** and so competes with
    them. *Fix:* an accent-bordered callout like the phase banner, collapsed by default.
20. **Workout types look identical at a glance.** *Fix:* a thin left border on each day card
    in the phase palette already used by the trail chart (easy, long, quality, rest), plus a
    small icon per type. A week's shape becomes readable without reading.
21. **The eyebrow "TRAINING PLANS, TAILORED TO RACE DAY"** is marketing copy repeated on
    every onboarding step. *Fix:* step 1 only.
22. **Sheet body text is a touch large** (about 17 px rendered), which forces scrolling on
    strength days. *Fix:* 15 px body in sheets, titles unchanged.
23. **Desktop is a 520 px phone column** with a bottom tab bar in a wide window. Fine for a
    phone-first app, but at 900 px and up the week list and the day sheet could sit side by
    side with the tabs on top.

## D. Utility

24. **No today card.** The first thing a runner wants is "what do I do today": workout,
    paces, strength, and a Log button in one card at the top of the Plan tab.
25. **No calendar export.** An .ics of the plan (one event per day, updated on rebuild) is
    a cheap win for a PWA with no notifications.
26. **The race-day pacing sheet is buried in Settings.** *Fix:* on the race-day card and on
    Progress in the final two weeks.
27. **Mid-plan races have nowhere to go.** A tune-up race is the best evidence of fitness
    and the app can't record one as a race. *Fix:* "Log a race" (distance, time) that
    updates the projection (see the projections review).
28. **Strava import exists; laps don't.** Interval sessions can only be logged as one
    distance and time, which blurs the quality portion (again, see the projections review).

## Phone-specific notes

- Safe areas, status bar, standalone display, icons and theme colours are all correct.
- **No iOS splash images** (`apple-touch-startup-image`): the home-screen app launches to a
  blank screen before the shell paints. Low effort to add.
- Inputs are 16 px, so focusing a field doesn't zoom. Time fields use the numeric keypad.
  The distance field is `type=number`; `inputmode=decimal` is the safer choice across
  locales.
- Date fields use the native iOS picker with a custom placeholder overlay. Works.
- Sheets draw a drag handle; if swipe-to-dismiss isn't wired, either wire it or drop the
  handle, since iOS users will try it.
- Touch targets: chips and cards are 44 px or more; the help button is about 36 px.
- The week strip scrolls horizontally and keeps the active chip in view. Good.
- Text uses fixed pixel sizes, so iOS Dynamic Type is ignored. Acceptable for now.

## Suggested order of work

1. Copy fixes (A1, A2, A5) and the day-one accounting (A4). An afternoon.
2. Notes callout + collapsible (A3, C19), FAB overlap (B15), header wrap (B16), splash
   images, placeholders (B9). Small.
3. Today card and Today pill (D24, B14), treadmill switch in the sheet (B12), strength rows
   with checkboxes (B13). The visible step up in "feels like a real app".
4. Day-card colour coding and icons (C20), onboarding header and sticky buttons (B7),
   units row (B8).
5. Log a race, calendar export, pacing sheet placement (D27, D25, D26).

## Status (2026-10-07, same day)

Done: A1–A6, B7–B18, C19–C21, C23 (wider column with the tabs on top from 900 px; not a
two-pane layout), D24–D26, and the phone notes (launch images for every iPhone size,
decimal keypad on distance fields, swipe-down to close sheets, 44 px help target).

Found while doing it: workout pills had never been coloured (a doubled-dash CSS variable),
and the boot-time plan rebuild had been failing silently since the engine was introduced
(assignment to a constant), so phones never rebuilt saved plans on engine updates. Both fixed.

Deferred, on purpose: C22 (sheet text is already 14.5 px once the preview scaling is
accounted for), D27 "Log a race" and D28 Strava laps, which belong with the projection
work in docs/PROJECTIONS-REVIEW.md. Per-type icons are a small set (dot, route, bolt,
moon, flag) rather than one per workout.
