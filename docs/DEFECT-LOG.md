# Plan generator defect log

A running record of every plan-quality defect found, how it showed up, what caused it, and
what now guards against it. Each entry is a scenario or rule in `tests/plan-invariants.js`
(named scenarios) or `tests/monte-carlo.js` (random profiles, every day checked).

Run both with `npm test`.

## Round 1 — assessment of the original generator (2026-10-06)

1. **Tempo runs as long as the race or the long run.** Quality distance was 40% of the
   week's non-long volume with only a flat 8–9 km cap. A 5K runner got a 5-mile tempo on a
   5.6-mile long run. *Fix:* sessions are sized by minutes at their pace, capped by Daniels'
   weekly shares (T ≤ 10%, I ≤ 8%, R ≤ 5%), and the whole session stays shorter than the
   long run.
2. **Weekly volume collapsed for high-mileage runners.** Five stacked caps meant a 45 mpw
   runner was told to run 30 for a 10K, and a 25 mpw marathoner started at 15. *Fix:* week
   one equals current mileage; growth, hold and (for short races) a modest trim are explicit.
3. **No taper for a Sunday race.** Taper was counted in calendar weeks and the race week
   counted as one. *Fix:* taper is measured in days before the race.
4. **Training paces drifted toward the goal time.** Threshold pace moved from 7:08 to 6:41
   over a plan whether or not fitness changed. *Fix:* paces follow current fitness and step
   up about one VDOT per six weeks of quality work; an unrealistic goal is flagged and race
   pace capped at the optimistic end of the predicted range.
5. **Race predictions used the elite-calibrated VDOT curve.** A 20:00 5K projected a 3:11
   marathon. *Fix:* Riegel k=1.07 through the half, Vickers & Vertosick mileage-adjusted
   models for the marathon, with a range rather than a point.
6. **Low-mileage runners' long runs were half the week.** *Fix:* long-run share caps by
   race and volume, plus a time cap.
7. **Strength had no plyometrics and no progression.** *Fix:* heavy lifts plus plyometrics
   in a four-week wave, maintenance in peak, express version on workout days.

## Round 2 — first workout the user opened (2026-10-07)

8. **Threshold pace printed after the recovery clause**, so "60–90s easy jog @ 7:39/mi"
   read as the jog pace. *Fix:* `{pace}` and `{easy}` placeholders put every pace where it
   belongs; the easy pace is shown for the jogs. *Guard:* Monte Carlo `pace-missing`,
   `easy-pace-missing`, `bad-text`.
9. **A 3 × 1000 m cruise session that was technically within the 10% cap.** The cap was
   being used as a target. *Fix:* floors (about 20 min at threshold, 12 at I pace at 40+
   km/week, scaling down for lower volume), cruise intervals as mile repeats. *Guard:*
   invariant "only N min at threshold (floor F)".
10. **Strength on the same day as intervals with no regard for time.** *Fix:* rest and easy
    days always outrank a workout day; a forced workout-day session is a 20-minute express
    version and the sheet says so. *Guard:* `express-too-long`, `full-lower-on-hard`.
11. **Short races held volume regardless.** *Fix:* a 5K/10K plan eases a runner who is well
    above what the race needs down about 10%, with a note.
12. **"Bigger jump than usual" note after every cutback.** *Fix:* the note describes the
    return to full volume.

## Round 3 — reading full plans as a runner (2026-10-07)

13. **Two identical strength sessions in one week.** Both sessions used the same pool index.
    *Fix:* sessions in a week draw different lifts; upper sessions rotate push/pull/core.
    *Guard:* `strength-duplicate`.
14. **Upper-body/core sessions had effectively disappeared.** *Fix:* explicit lower vs upper
    split restored: lower on easy/recovery run days with a clear day before any hard run,
    upper on rest days or the day before quality. *Guard:* `lower-on-rest`,
    `lower-before-hard`, `upper-on-long`.
15. **No strength two weeks out.** The final-10-days rule was applied to whole weeks.
    *Fix:* per day. *Guard:* scenario "no strength session 11–17 days out".
16. **Base-phase fartlek was a hidden hard session** (7–8 surges at 5K effort). *Fix:* a few
    relaxed one-minute pickups, labelled as still an easy day. *Guard:* `base-fartlek-hard`.
17. **The day after the long run could be the second-longest run of the week** (11 miles
    after a 16-mile Sunday). *Fix:* the recovery role applies whenever there are two or more
    easy days; a long "recovery" run is relabelled a plain easy run. *Guard:*
    `recovery-not-shortest`.
18. **Race-week easy runs starved to 2 miles.** Easy caps were tied to that week's shrunken
    long run. *Fix:* taper weeks cap against the peak long run. *Guard:* `tiny-run`.
19. **Three identical race-pace sessions across the marathon taper.** *Fix:* taper quality
    varies by distance from the race.
20. **Week labels: "Taper" for the real race week, "Race Week" for the week starting on race
    day.** *Fix:* labels follow days to race.
21. **A rest day carrying strength still said "Full rest".** *Fix:* rest-day text is rebuilt
    after strength placement. *Guard:* `rest-strength-text`.

## Round 4 — Monte Carlo sweep (2026-10-07)

22. **Marathon pace slower than easy pace for low-mileage runners.** The mileage-adjusted
    marathon prediction was used as the M zone unchanged. *Fix:* M pace is clamped to at
    least 5% faster than easy. *Guard:* `m-pace-order`.
23. **Half-mile "runs" when run days exceed what the volume can fill.** *Fix:* run days are
    capped so the average run is at least ~5.5 km, with a note; any easy day under 2 km
    becomes rest. *Guard:* `tiny-run`, `run-days`.
24. **Three run days in a row with four rest days around them.** Rest-day spreading
    protected the day after the long run first. *Fix:* easy days are chosen to maximise
    spacing from the runs already placed. *Guard:* `hard-adjacent`, visual review.
25. **Distance plans produced a week with only the long run.** The run-day cap was computed
    before the weekly volume existed (NaN). *Fix:* ordering. *Guard:* general-plan sweep.
26. **General plans ignored the long-run time cap; the speed block ignored the chosen
    strength count.** *Fix:* both honoured. *Guard:* `long-too-long`, `strength-count`.
27. **Session floor search added a whole rep when it missed the floor by a few metres**
    (3 × 1600 m becoming 4 × 1600 m, past the 10% share). *Fix:* a near miss counts.
28. **Floors shrank with "low" speed emphasis** (17-minute tempos). *Fix:* emphasis scales
    the budget above the floor, never the floor.
29. **Floors were a flat 20 minutes regardless of volume**, which at 20 km/week made the
    tempo day the biggest run and starved easy days. *Fix:* floors scale with weekly volume.
30. **Two quality days at 30 km/week on five runs.** *Fix:* a second quality day needs five
    runs *and* at least 40 km/week.
31. **A secondary fartlek sized to a 3 km jog.** *Fix:* whole-run sessions are never scaled.
32. **Train-through race weeks judged against a truncated total** (post-race rest days).
    *Fix:* accounting uses the planned volume for the week containing race day.

33. **Taper checks compared against actual peak totals**, which understate the peak for
    few-run-day runners; the check now uses the planned peak week.
34. **General plans gave no note when run days could not carry the volume.** *Fix:* same
    note as race plans.
35. **Standalone marathon-pace runs reached 97 minutes.** *Fix:* capped at 55 minutes at
    marathon pace; longer race-pace work belongs inside the long run.
36. **Distance plans could grow 18% a week when the target was aggressive.** *Fix:* capped at
    12% week to week; the onboarding warning already says the target may not be reached.
37. **Lower-body strength could land on a rest day.** Rest days are for the legs. *Fix:* lower
    sessions pair with an easy or recovery run only. *Guard:* .
38. **No way to opt out of tapering.** *Fix:* race approach choice: full taper, light taper,
    or train through (only race day and the day before are protected; strength continues).

39. **Strength library drifted into unfamiliar territory** (Nordic curl, Copenhagen plank,
    hollow hold, drop jumps) with no how-to text. *Fix:* familiar movements only; every
    exercise beyond the obvious carries a one-sentence how-to shown under "How to do these"
    in the day sheet. *Guard:* `strength-howto` (every listed exercise either basic or
    explained).

40. **Library assumed equipment the owner doesn't have** (trap bar, cable machine) and
    included the Pallof press, which fails the familiarity test. *Fix:* reconfigured to the
    confirmed kit (barbell, dumbbells, kettlebells, bench/box, leg press, pull-up bar, mini
    bands): Romanian deadlift replaces the trap-bar lift, leg press and kettlebell swings
    join the lower pools, mini-band side steps and suitcase carries replace the Pallof press,
    pull-ups and hanging knee raises use the bar.

## Rules now checked on every random plan

Text: no placeholders or "undefined", every quality session shows its own pace and the easy
pace for recovery jogs, easy and long runs show their pace, rest days with strength say so.
Sizing: 20–95 minutes per quality session, warm-up present, rep counts within bounds, quality
day shorter than the long run (weeks ≥ 25 km), long run under its time cap, easy runs ≥ 2 km.
Structure: hard days ≥ 48 h apart, recovery run is the shortest easy run, run-day count
matches what the volume supports, cutback weeks lower than the week before, week totals
within 8% of plan, shakeout only two days out, a race day exists, nothing hard the day before.
Strength: count ≤ chosen, lower never on rest/long days or before a hard run, upper never on
the long run, no two identical sessions in a week, none inside the taper cutoff, express
sessions ≤ 25 min, no lifting adjacent to race day.
