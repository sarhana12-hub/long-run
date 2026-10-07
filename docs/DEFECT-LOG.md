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

41. **Sessions named machines the runner may not have.** *Fix:* equipment is an input. Every
    exercise declares variants with what each needs; the session uses the best variant the
    runner has, names only that, and falls back to bodyweight before ever dropping a slot.
    Equipment is ticked in onboarding and changeable in Settings; changing it rebuilds
    strength from the current week without touching runs or logs. *Guard:*
    `strength-equipment` (every listed exercise resolvable with the plan's equipment), with
    random equipment sets in the Monte Carlo sweep including "nothing at all".

42. **Bodyweight fallbacks were prescribed like heavy lifts** ("4 x 5 bodyweight squat, heavy"). *Fix:* the squat slot falls back to a single-leg squat to a chair, bodyweight variants use a slow higher-rep scheme with their own how-heavy note, and a session never repeats the same fallback movement twice.

## Round 5 — provenance audit (2026-10-07)

43. **Four rules were my own invention presented as guidance** (weekly growth curve; peak-volume floors, caps and fade; phase split by a fitness ratio; run-day cap by average run length). *Fix:* replaced with Daniels' step rule (add at most one mile per weekly session, hold 3–4 weeks), Pfitzinger plan tiers for peak volume with Daniels' "short races hold", Daniels' priority-week phase allocation (verbatim from his season-planning article), and Daniels' 30–60-minute easy run (Pfitzinger general-aerobic lengths at 55+ mi/week; medium-long runs 11–16 mi). Every rule now has a source or is labelled judgement in docs/RULES.md.
44. **Long run share bumped for few run days** (an 11-mile-a-week runner got a long run at 45% of the week). *Fix:* Daniels' 25–30% share; Higdon novice shares kept only for the marathon.
45. **Tiny weeks forced a quality session that starved the other runs.** *Fix:* Daniels' beginner structure (30-minute easy runs with strides, no separate session) whenever the week cannot give every run 30 minutes alongside a session, with a note saying so.

46. **Cutback weeks starved short runs** (a 15 mpw marathoner got a 23-minute easy run in week 4). *Fix:* a cutback that would leave any easy run under 30 minutes is held at the block level, decided by the easy-run room left after the long run and the smallest sensible session (Daniels' beginner plans have no recovery weeks).
47. **Run days were fixed from week one, and the day builder dropped a day whenever its recovery/aerobic weighting made the smallest run short.** *Fix:* each week runs as many days as can get 30 minutes once the long run and the sized session are in, up to what was asked; easy days are equalised before a day is dropped; a day comes back when the mileage can carry it. *Guard:* `run-days` at the 30-minute standard.
48. **Week too small for its session was decided before the session was sized**, so a hills session could still land and leave a 22-minute easy run. *Fix:* the beginner-structure decision is re-checked after sizing; if the easy days would fall under 30 minutes the session is dropped for strides.
49. **Long run shorter than the other runs** on three run days (Daniels' 25–30% share is below the average run). *Fix:* lifted ~6% above the average run (labelled judgement in RULES.md). *Guard:* long-share cap allows it at ≤3 runs.
50. **"Medium-Long Run" of 5 km in a taper week**, shorter than the recovery run. *Fix:* the medium-long role needs five run days and a long run of at least 11 miles, and never appears in race week. *Guard:* `recovery-not-shortest`.
51. **A 23 km long run and full easy days six days before a 10K** (7-day taper, race mid-week). The taper only touched whole weeks after the last training week. *Fix:* easy days of a training week that fall inside the taper window are reduced by that day's factor; taper weeks scale from the peak week the plan actually placed, not the nominal level. *Guard:* final-7-days check.
52. **Easy-run ceiling fed back on itself**: a 59 mpw runner on four days had the ceiling computed from a week that had already come in short, so weeks shrank to 40 mi. *Fix:* the ceiling is keyed to the runner's block level. The honest limit (four days cannot carry 59 mi under 60–90-minute easy runs) is still stated in a note.
53. **Train-through race week ran the long run at 35% of a shortened week.** *Fix:* Daniels' share of the shortened week.
54. **General plans still used the old rules** (run days by a 5.5 km average, 12% growth, sessions forced into tiny weeks, three token recovery runs). *Fix:* run days by the 30-minute easy run; distance plan uses Daniels' step rule (weekly target) or Higdon's mile a week (longest-run target); speed and maintenance weeks drop the session when it would starve easy runs; recovery plans use two runs when three cannot get 25 minutes.

Residual (documented, not hidden): across 2,400 random plans one train-through race week of an 11 mpw runner racing 20 miles sizes its sharpener one cruise rep above the 10% share, and two four-run-day plans sit a few percent over the final-7-days cap. Both are rounding edges of the floor search, not rule breaks.

## Round 6 — UI review (2026-10-07)

55. **Saved plans never rebuilt on an engine update.** The boot code assigned the fresh plan to a constant, threw, and swallowed the error, so phones kept the old plan (and the "rebuilt" toast never showed). *Fix:* plain variable. Found while verifying the UI changes in the browser console.
56. **Workout pills had no colour.** Every pill wrote a doubled-dash variable reference (the variable name already carried its dashes), so the type colours in the palette never reached the screen. *Fix:* the pills, the new card edges and the today card use the variables correctly.
57. **Day one read as "behind plan".** A plan created mid-week started its accounting on the previous Sunday. *Fix:* accounting starts on the creation date unless the runner backdated the plan.
58. **Onboarding copy contradicted the plan** (lower-body strength "on easy or rest days"; base phase "scaled to your mileage"). *Fix:* copy matches the rules.
59. **Treadmill was only reachable through Edit, and only for hill days.** *Fix:* a Treadmill switch inside every run day shows belt speed and the incline note (Jones & Doust 1996: 1% grade matches outdoor effort).

## Round 7 — projections (2026-10-07)

60. **The projection was a scheduled promise.** "On pace for X" rose on a fixed VDOT ramp from day one, never fell for missed sessions, and workouts fed it through a noisy blend that counted interval recovery jogs as the effort. *Fix:* evidence-led fitness model (engine projectFitness): races reset it, logged tempo/interval sessions nudge it within caps (intervals only with a rep time), the scheduled gain is credited per completed session, two weeks of light training eases it. Three numbers with ranges replace the single figure. *Guard:* tests/projection.js.
61. **Nowhere to log a race or an interval session properly.** *Fix:* "This was a race" on both manual and Strava logging; an average-rep-time field on interval-type days, pre-filled from Strava laps when they match the rep distance.

## Round 8 — exercise library (2026-10-07)

62. **Exercises had a one-line how-to and nothing else.** *Fix:* library.js carries, for every exercise name a session can print (81 names), a summary, set-up, the movement, form points, the common mistake, a drawing of the start and finish built from joint angles by one renderer (a second angle where it helps), and a reference page at the ACE Fitness exercise library, each URL fetched and checked. Shown inside the exercise row in the day sheet and browsable from Settings. *Guard:* tests/library.js (coverage, link shape, drawings render).

## Round 9 — screenshot logging (2026-10-07)

63. **Logging a run meant typing it or going through Strava one run at a time**, and a home-screen web app cannot read Apple Health. *Fix:* "Scan a workout screenshot" in Log a run. The picture is read on the phone (Tesseract.js, fetched on first use), scan.js parses date, distance, time, average pace, splits and segments from Apple Fitness, Strava, Garmin and Nike layouts, and the form is prefilled for the runner to check. Segments that match the planned rep distance fill the rep time; the manual rep-time field stays for everyone else. Dark-mode screenshots are inverted before reading. The Splits screen works on its own: time is summed from the splits and the distance worked out from the full splits plus the partial last one (its time over its pace). *Guard:* tests/scan.js (parser against sample text from each layout).

64. **A missed session had no obvious way back.** *Fix:* a past run day with nothing logged shows "Missed this one?" in its sheet with a one-tap move to the next rest day that keeps a clear day either side of hard sessions and stays off the last two days before the race; easy runs are told to let it go. Day cards mark past unlogged runs "Not logged".

## Round 10 — reading nine full plans as a runner, after the owner opened one workout (2026-10-07)

Found by rendering every week and day of nine representative profiles (`node tests/readthrough.js > docs/readthrough.txt`) and reading them end to end, plus the Monte Carlo `pace-context` rule written for item 65. Everything below was logged before any of it was fixed.

65. **A pace printed after the wrong clause.** "gradually quicken so the final third sits at tempo effort @ 10:08/mi" — the easy pace, appended to the end of a sentence whose last words were "tempo effort". The owner saw it on the first workout they opened. Same shape on the long run with a race-pace finish ("then finish strong at race pace @ 7:07/km", the easy pace) and on fartlek days. *Cause:* older descriptions get their pace appended at the end; sentences that name two efforts need the pace placed mid-sentence. *Fix:* every sentence that names more than one effort carries a {pace} placeholder where its own pace belongs; the summary line for progression runs names both paces explicitly. *Guard:* Monte Carlo `pace-context` — for every pace string in rendered text, the words just before it must match the pace's zone (no easy pace after "tempo/threshold/race pace/…", no hard pace after "easy/recovery/jog/…").

66. **Rep duration guessed for everyone at 4:00/km.** "4 × 600m at 7:48/mi (about 2 min each)" — 600 m at that pace is 2:55; "4 × 800m at 8:30/mi (about 3 min each)" is 4:14. *Cause:* `Math.round(repM/250)` in the description, ignoring the runner's pace. *Fix:* the rep time is computed from the runner's own interval pace when the text is rendered and shown as m:ss ("about 2:55 each"). *Guard:* Monte Carlo `rep-time` compares the printed rep time with rep distance × printed pace.

67. **Carries read "3×1 Suitcase carry each hand" / "2×1 Farmer carry".** "×1" meant one walk, which nobody would guess. *Fix:* carries print as "3×30–40 m Suitcase carry each hand". *Guard:* Monte Carlo `strength-text` rejects "×1 " in any exercise line.

68. **"Very easy, short recovery jog" of 9 km / 5.8 mi; the same slot labelled Recovery one week and Easy the next.** *Cause:* the day after the long run was called a recovery run whenever it was under 9.5 km, regardless of the easy pace or the other easy days. *Fix:* recovery label only when the run is at most 45 minutes and is the shortest easy run of the week; otherwise it is an Easy Run. With three or more easy days the recovery slot is capped at 45 minutes and the mileage flows to the other easy days (Pfitzinger's recovery runs are 4–6 mi). *Guard:* Monte Carlo `recovery-label`.

69. **"Bodyweight only" was ignored.** The onboarding button sets an empty equipment list and the hint says every session falls back to bodyweight — but the page, the settings sheet and the engine all treated an empty list as "use the full gym", so a runner with no equipment got back squats, leg press and kettlebell swings. *Cause:* `list.length ? list : DEFAULT_EQUIPMENT` in four places. *Fix:* an empty list means bodyweight only everywhere (only a missing list means default); the settings sheet gets the same Bodyweight-only button. *Guard:* plan-invariants scenario with `equipment: []` asserts no barbell, machine, kettlebell, dumbbell or pull-up names appear.

70. **The same "doesn't fit" note repeated for every week it applied to** (five copies on an 18-week half plan). *Cause:* the de-duplication guard looked for a prefix the note did not have. *Fix:* one note, "From week N on, …". *Guard:* Monte Carlo `dup-notes`.

71. **Beginner-structure note shown for a plan that had hill repeats three weeks later**, and only because the base weeks (which never carry a session anyway) were too small for one. *Fix:* the note is written only when a week that would otherwise hold a session cannot.

72. **"Peaks at 39 mi/week" on a plan that never exceeds 27**, and general plans reported no peak at all. *Cause:* the nominal ramp target was reported, not what the run-day limits allowed. *Fix:* the peak is the largest week actually built; general plans report theirs too.

73. **"There isn't time to build the long run … treat this race as a strong effort rather than an all-out time goal" on a 10-mile plan whose long run reaches 22 km** — well past the race distance. *Fix:* the warning (and its onboarding preview) fires only when the long run also falls short of race readiness (the race distance; three-quarters of it for the marathon).

74. **Race week fell apart.** A 4-run-day runner racing on Saturday got long run Sunday, rest, rest, reps Wednesday, rest, rest, race — two training runs. A 5-run-day marathoner got rest, rest, rest before the race. The two-days-out shakeout vanished whenever that day happened to be rest already. *Cause:* the 30-minute minimum dropped short race-week runs, and the shakeout only replaced a run that was already there. *Fix:* race week allows 20-minute runs; two days out is always a shakeout — the nearest easy run moves into that slot, or one is added when the week is short of its run days (Pfitzinger: a short run with strides two days before; Daniels: an E day). *Guard:* Monte Carlo `shakeout` (full/light taper: the day two before the race is a run).

75. **Race week "planned" total did not match its days** (18.1 mi planned, 13.1 raced). *Fix:* a week containing the race plans exactly what its days hold.

76. **Marathon plans had no marathon-pace long runs at all.** The 16- and 20-week marathon profiles never ran a mile at goal pace until two short race-pace sessions in the taper. *Cause:* the race-pace long run was limited to the peak phase, which the phase allocation often makes zero or one week long, and the alternate-week test skipped the first week. *Fix:* half and marathon long runs carry a race-pace finish every other eligible week from Daniels Phase III through the peak (Pfitzinger's marathon-pace long runs; Daniels runs M pace inside long runs in Phases III–IV), never on a cutback or a week that already has a race-pace session.

77. **Two quality sessions plus a medium-long run plus the long run on five run days** — four demanding days out of five, every build week of the marathon plans (hill repeats Monday, fartlek Wednesday, 11-mile MLR Thursday, 14-mile long Saturday, recovery Sunday). Pfitzinger's weeks with a medium-long run hold one quality session. *Fix:* a week that carries a medium-long run holds one quality session; the other slot is an easy run.

78. **The day after a 19-mile long run was an 11-mile easy run, the day before intervals** (six run days at 67 mi/week). *Cause:* with two quality days and a medium-long run there were only two easy slots to carry the rest. Item 77 returns a third; the recovery-slot cap in item 68 keeps the post-long-run day short when the week has three or more easy days.

79. **"Build distance to 35 mi/week" in 10 weeks ended at 28 and said nothing.** The onboarding check accepted the plan (it used 10% a week) while the generator follows Daniels' step rule (add run-days miles, hold four weeks). *Fix:* both use the step rule; the onboarding note says how many weeks the jump needs, and the finished plan says where it will actually get to.

80. **Strides stacked onto fartlek and progression days** ("… 4 relaxed pickups … — still an easy day" then "Finish with strides"). *Fix:* no strides on a variety day; the distance set aside for them stays in the run.

81. **Strength focus drifts with placement:** two lower sessions in base, lower + upper once quality starts, a 1-session runner's only session turns upper in peak week, a 3-session runner gets two upper and one lower. *Cause:* a lower session must sit on a run day with a clear day before the next hard run; busy weeks have few such days, and the fallback is upper/core. The express lower session on a quality day (which the owner saw on a progression day) is the other fallback and is an owner decision in RULES.md. *Owner decision (2026-10-07):* leg days are never dropped. When no easy day qualifies, the leg session goes on the hard day itself, after the run, as a full session (the 20-minute express version is retired); the day before a hard run stays off limits because running is still impaired the day after heavy legs (Doma & Deakin). *Guard:* Monte Carlo `lower-on-hard-not-after-run`, `lower-too-short`, `express-retired`; the day sheet says "after the run, not before it".

82. Checked and accepted: long-run pace 2 s/mi faster than easy pace for a fast marathoner (within the documented rule: min(easy, M × 1.12)); a train-through race week labelled "Peak"; two cruise-interval sessions in one general speed week.

The read-through is now a standing pre-push step: `npm run readthrough` regenerates docs/readthrough.txt, and it is read in full before any plan-engine change is pushed.

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
