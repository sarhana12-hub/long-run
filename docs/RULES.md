# Rule provenance

Every numeric rule the engine applies, where it lives, and where it comes from.

**Status key**
- **Sourced** — taken directly from a named coach or study.
- **Within source** — a single value chosen inside a range the source gives.
- **Judgement** — my own choice, not from guidance. These are the ones to question.

Where guidance exists for a Judgement item, the "Replace with" column says what the sourced
rule would be.

## Paces and fitness

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| VDOT from a race result; VO2-velocity and %max-duration equations | `vdotFromRace`, `pctMaxForDurationMin` | Daniels & Gilbert, *Oxygen Power*; Daniels, *Running Formula* | Sourced | — |
| Threshold = pace sustainable ~60 min; Interval = ~97–100% VO2max; Rep = ~mile pace | `THRESHOLD_PCT`, `INTERVAL_PCT`, `REP_PCT` | Daniels | Sourced | — |
| Easy pace at 68% VO2max | `EASY_PCT` | Daniels gives 59–74% | Within source | — |
| Marathon pace from the mileage-adjusted marathon prediction | `paceZonesFromVdot` | Daniels (M = race pace) + Vickers & Vertosick for the time | Sourced | — |
| M pace never slower than 95% of easy pace | `paceZonesFromVdot` | — | Judgement | Daniels: M sits at 75–84% VO2max; use that band as the floor instead of a ratio to easy |
| Long run pace = min(easy, M × 1.12) | `LONG_VS_MARATHON` | Daniels runs long runs at E pace; Pfitzinger 10–20% slower than MP | Within source | — |
| Fitness improves ~1 VDOT per 6 weeks of quality work, capped at +3 | `generatePlan` | Daniels (~1 VDOT per 4–6 weeks early on) | Within source (rate); cap is Judgement | Keep flagged |
| Paces follow current fitness, not the goal | `generatePlan` | Daniels | Sourced | — |

## Race prediction and goals

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Riegel k = 1.07 up to the half marathon | `predictRace` | Vickers & Vertosick 2016 | Sourced | — |
| Marathon from one race + weekly mileage (model 1), or two races (model 2) | `vvMarathonSecModel1/2` | Vickers & Vertosick 2016, Additional file 1 | Sourced | — |
| Range: k ± 0.015 (half and shorter); −4% / +5% (marathon) | `predictRace` | — | Judgement, shaped from the paper's residual error | Report the paper's own prediction error (model RMSE ≈ 15 min marathon) |
| Range widened 4% when longest recent run < 60% of race distance | `predictRace` | — | Judgement | None found; keep flagged |
| Goal "ambitious" if within 3% of the optimistic end; "beyond" past that | `assessGoal` | — | Judgement | None found; keep flagged |
| Race pace capped at the optimistic end when the goal is beyond it | `generatePlan` | Daniels (train at current fitness) | Sourced principle; 3% figure Judgement | — |

## Weekly volume

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Week one equals current mileage | `generatePlan` | Daniels (start from current training) | Sourced | — |
| Volume rises in steps of at most (sessions per week) miles, each level held for a 4-week block (3 weeks + a cutback) | `generatePlan` | Daniels (step rule); Pfitzinger (recovery weeks) | Sourced | — |
| 3 build weeks then a cutback at 80% | `generatePlan` | Pfitzinger (recovery weeks every 3rd–4th week) | Sourced | — |
| A cutback that would leave an easy run under 30 min is held at the block level instead | `generatePlan` | Daniels (beginner plans have no recovery weeks) | Sourced | — |
| Peak volume: 5K/10K hold current mileage; 15K–half peak at the top of the runner's Pfitzinger tier (up to 40 / 40–55 / 55–70 mi); marathon likewise (up to 55 / 55–70 / 70–85 mi); above the top tier, hold | `targetPeakWeeklyKm` | Daniels (short races need no extra volume); Pfitzinger, *Faster Road Racing* and *Advanced Marathoning* plan tiers | Sourced | — |
| Long-run emphasis nudges the tier peak by ±5 mi | `targetPeakWeeklyKm` | — | Judgement | None found; keep flagged |
| Short races trim ~10% for runners above 55/65/75 km | `targetPeakWeeklyKm` | — | Judgement, at the owner's request | Keep as an owner decision, labelled as such |
| Easy runs 30–60 min; each week runs as many days as can get 30 min once the long run and the session are in (up to what was asked, never below 3), with a note when that is fewer than asked; easy days are equalised before a day is dropped | `generatePlan`, `buildWeekDays` | Daniels | Sourced | — |
| Easy-run ceiling rises with the runner's level (60 min at ≤40 mi/week to 90 min at 60+), keyed to the block level rather than a week that came in short | `buildWeekDays` | Daniels; Pfitzinger general-aerobic runs | Within source | — |
| Medium-long runs 11–16 mi and shorter than the long run; only on five or more run days when the long run is itself at least 11 mi, never in race week | `generatePlan`, `buildWeekDays` | Pfitzinger, *Advanced Marathoning* | Sourced (the 11-mi gate follows from his range) | — |

## Long run

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Long run ≤ 25% of weekly volume (30% below 40 mi/wk), ≤ 150 min | `longFracCap`, `longTimeCapMin` | Daniels | Sourced | — |
| Marathon only: up to 50% at ~40 mi/wk, easing to Daniels' share by 60–75 mi/wk | `longFracCap` | Higdon novice plans (20 mi on ~40 mi/wk) | Sourced (anchor); the easing curve is Judgement | — |
| Marathon time cap 195 min | `longTimeCapMin` | Pfitzinger allows up to ~3.5 h; Daniels 2.5 h | Within source | — |
| Peak long run: Daniels' share of peak volume; ceilings of 20 mi (half) and 20–22 mi (marathon) | `peakLongTargetKm` | Daniels; Pfitzinger | Sourced | — |
| Long run grows ~1 mile per week | `longStep` | Higdon | Sourced | — |
| Cutback week long run at 78% | `generatePlan` | — | Judgement | Pfitzinger recovery weeks: long run reduced ~20–25% |
| Race-pace finish in alternate peak long runs (40% marathon, 30% half) | `generatePlan` | Pfitzinger (MP long runs) | Sourced; percentages Within source | — |
| Start long run from the runner's longest recent run | `generatePlan` | — | Judgement (sensible, no citation) | Keep flagged |
| With few run days the long run is lifted to ~6% above the week's average run (outside the taper window) | `generatePlan` | — | Judgement: the long run must be the longest run of the week for its label to be true | Keep flagged |
| Train-through race week: the long run keeps Daniels' share of the shortened week | `generatePlan` | Daniels | Sourced | — |

## Quality sessions

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| T ≤ 10% of weekly volume; I ≤ 8% and ≤ 10 km; R ≤ 5% | `qualityShareCap` | Daniels | Sourced | — |
| T 20–40 min continuous; cruise intervals of ~5 min (mile) reps | `qualityMinutes`, `structuredEffort` | Daniels | Sourced | — |
| I reps 3–5 min with jog recovery about equal time; R reps 200–400 m with full recovery | `structuredEffort` | Daniels | Sourced | — |
| Hills 6–10 × 60–90 s | `structuredEffort` | Daniels (hills as R-type work), Pfitzinger | Sourced | — |
| Session minute budgets ramp through a phase (e.g. T 20→25 short, 20→40 long) | `qualityMinutes` | Daniels ranges | Within source | — |
| Floors scale down below 40 km/wk; weeks too small for a session at all use Daniels' beginner structure (easy runs + strides) | `floorMinutesFor`, `generatePlan` | Daniels beginner plans | Within source; the scaling curve is Judgement | — |
| Quality day shorter than the long run | `sizeQuality` | — | Judgement (owner complaint: tempo as long as the long run) | Keep as an owner decision |
| Warm-up 2 km, cool-down 1.5 km | `QUALITY_WARMUP_KM` | Daniels (10–20 min warm-up) | Within source | — |
| Second quality day from four runs (More) / five runs (Balanced); one at Less | `generatePlan` | Daniels' and Pfitzinger's 4-day plans (2 Q + L) | Sourced | — |
| Emphasis scales sessions 0.85 / 1 / 1.1; secondary session at 65% | `generatePlan`, `sizeQuality` | — | Judgement | None found; keep flagged |
| Base phase: easy only, strides, one gentle pickup run every other week | `generatePlan` | Daniels Phase I | Sourced | — |
| Strides on 2 easy days | `generatePlan` | Daniels | Sourced | — |
| Hard days ≥ 48 h apart | `qualityDowsFor` | Daniels, Pfitzinger | Sourced | — |

## Phases and taper

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Phases from Daniels' priority weeks: Phase I 1,2,3,13,21,23 · Phase II 10,11,12,18,19,20 · Phase III 7,8,9,14,15,16 · Phase IV 4,5,6,17,22,24; weeks beyond 24 extend Phase I | `danielsPhaseWeeks` | Daniels, "Setting Up a Season of Training" (Figure 10) and *Running Formula* Fig. 8.2 | Sourced (the >24-week extension is Judgement) | — |
| Session rotations by Daniels phase: II reps + hills, III intervals (+T), IV threshold + race-specific | `ROTATIONS` | Daniels | Sourced | — |
| Taper length: 7 d (5K/10K), 10 d (15K/10 mi), 14 d (half), 21 d (marathon) | `taperDaysFor` | Bosquet 2007 (8–14 d optimal), Pfitzinger (3-week marathon taper) | Sourced | — |
| Taper volume factors by days out | `taperVolumeFactor` | Bosquet (41–60% reduction), Pfitzinger | Within source; curve shape Judgement | — |
| Taper long-run factors | `taperLongFactor` | Pfitzinger marathon taper (long runs 21 → 13 mi) | Within source | — |
| Taper is measured in days: easy days of a training week that fall inside the window are reduced by that day's factor; taper weeks scale from the peak week the plan actually placed | `generatePlan` | Bosquet 2007 | Sourced (day-based); the per-day application is Judgement | — |
| Keep intensity in the taper; one sharpener per week | `generatePlan` | Bosquet, Mujika & Padilla | Sourced | — |
| Race week: rest the day before, shakeout two days out | `generatePlan` | Common practice (Pfitzinger, Daniels) | Sourced | — |
| Light taper = half length and half the cut; train-through protects two days | `generatePlan` | — | Judgement, at the owner's request | Keep as an owner decision |

## Strength

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Heavy compound lifts 3–4 × 4–6 plus plyometrics; 2–3 sessions/week; ≥ 6–8 weeks | `buildLowerStrengthWorkout` | Blagrove 2018; Beattie 2014; Rønnestad & Mujika 2014; Balsalobre-Fernández 2016 | Sourced | — |
| Reduce strength in peak; stop in the final ~10 days | `lowerStrengthTierForPhase` | Rønnestad & Mujika (maintenance dose); Blagrove | Sourced | — |
| No heavy legs the day before a hard run | `placeStrengthDays` | Doma & Deakin 2013 | Sourced | — |
| Lower body on run days only; upper/core on rest days or before quality | `placeStrengthDays` | — | Owner decision | — |
| Four-week effort wave (RIR 3 → 2 → 1–2 → back off) | `buildLowerStrengthWorkout` | Standard mesocycle practice (Rønnestad uses 4-week blocks) | Within source | — |
| Trunk/anti-rotation and carries in the upper session | `buildUpperStrengthWorkout` | Sato & Mokha 2009; Hung 2019 | Sourced | — |
| Express session ~20 min on a workout day | `buildLowerStrengthWorkout` | — | Owner decision | — |
| Bodyweight fallbacks go single-leg and slow | `STRENGTH_EXERCISES` | Blagrove (load must be high enough to matter) | Within source | — |

## General plans

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Speed block: 3:1 waves, two quality days | `generateSpeedPlan` | Pfitzinger (recovery weeks), Daniels (Q days) | Sourced | — |
| Distance plan (weekly target): Daniels' step rule in 4-week blocks, cutback at 85% | `generateDistancePlan` | Daniels; Pfitzinger | Sourced | — |
| Distance plan (longest-run target): long run up ~1 mile a week, cutback long run at 78% | `generateDistancePlan` | Higdon | Sourced | — |
| General plans: run days by the 30-minute easy run; speed and maintenance weeks drop the session (strides instead) when it would leave easy runs under 30 min | `generalWeekCommon`, `generateSpeedPlan`, `generateMaintenancePlan` | Daniels | Sourced | — |
| Maintenance: flat volume, one threshold session | `generateMaintenancePlan` | Daniels (T work as maintenance) | Sourced | — |
| Recovery: 55% → 75% of volume, easy only, one fewer run day (two when the volume cannot give three runs 25 min) | `generateRecoveryPlan` | — | Judgement | None found; keep flagged |

## Fitness projection (Progress tab)

| Rule | Where | Source | Status | Replace with |
|---|---|---|---|---|
| Start / now / potential are VDOT values turned into race times by the same model as setup (Vickers & Vertosick above 40 km, Riegel 1.07 below) | `fitnessProjections` | Vickers & Vertosick 2016; Riegel | Sourced | — |
| A logged race resets fitness to the race's VDOT | `projectFitness` | Daniels (VDOT comes from races) | Sourced | — |
| Scheduled gain of about one VDOT per six weeks of quality training, credited only for quality sessions actually logged | `projectFitness` | Daniels (rate); per-session crediting | Sourced rate; crediting is Judgement | — |
| Tempo and over/under sessions read through the threshold %VO2max; cruise, interval and rep sessions through their own %VO2max once the average rep time is known; whole-run times of interval sessions are never used | `projectFitness` | Daniels' zone definitions | Sourced | — |
| One session moves the number a fraction (weights 0.5–1 by type, 21-day half-life, damping 1.5); per-session reading capped at +2/−3 VDOT; the sum capped at ±2 | `FITNESS` | — | Judgement (keeps a tempo run too hard from counting for more than a race) | Keep flagged |
| After 14 days under half the planned volume, 0.5 VDOT per further week, capped at 2 | `FITNESS` | Mujika & Padilla 2000 (VO2max −4 to −14% over 2–8 weeks of detraining) | Sourced window; per-week figure Within source | — |
| "Now" range widens by up to ±1 VDOT when there is no race or session evidence; the potential carries ±0.6 VDOT on top of the model's band | `FITNESS` | — | Judgement | Keep flagged |
| Marathon-model mileage term: setup mileage at the start, logged mileage over the last eight weeks now (once three weeks of logs exist), the plan's peak for the potential | `fitnessProjections` | Vickers & Vertosick (mileage term) | Sourced | — |
| Training paces follow the evidence-led number for the current week and add the scheduled gain for later weeks; past weeks keep the paces they were run at | `getWeekPaces` | Daniels (adjust paces after races; ~1 VDOT per 6 weeks otherwise) | Sourced | — |
