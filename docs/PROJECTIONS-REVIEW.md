# Projection methods — how supportable are they? (2026-10-07)

What the app does to (1) project a race time at setup, (2) judge a goal time, and (3) move
the projection during the plan, with the evidence behind each step and where it is weak.
Nothing here has been changed yet.

## 1. Projection at setup

**5K to half marathon: Riegel's formula with k = 1.07**, from the recent race closest in
distance to the target; range from k = 1.055 to 1.09; narrowed to ±1% when the recent race
is the same distance.

- *Source:* Vickers & Vertosick 2016 (2,303 recreational runners). They found the classic
  k = 1.06 too optimistic for recreational runners and k = 1.07 a better fit up to the half.
- *Supportable:* yes, the strongest published basis for recreational runners.
- *Weak points:* the ±0.015 band is my choice (labelled Judgement in RULES.md). The band does
  not widen with the distance gap: a 5K predicting a half is far less certain than a 10K
  predicting a half, and the paper's own errors grow with that gap. Nothing accounts for how
  old the race result is.

**Marathon: Vickers & Vertosick models 1 and 2**, which add weekly mileage; one race or two
races; range −4% / +5%.

- *Source:* the paper's supplementary coefficients, quoted directly.
- *Supportable:* yes; it is the best published model for this population.
- *Weak points:* the mileage term is the runner's mileage *at setup*. By race day the plan
  has them at peak mileage, so the setup projection is pessimistic and the end-of-plan
  projection on Progress (which reuses the setup mileage) understates what their own plan
  implies. The paper's mileage is "typical weekly mileage in training for the marathon".

**Tanda (2011)** is coded as a marathon cross-check but unused, because it needs eight
weeks of training data (km per week and mean training pace). Those data exist once the
runner logs; it is a sourced way to check the marathon projection from training itself.

**Specificity note:** the slow end widens 4% when the longest recent run is under 60% of
race distance. Sensible, no citation (flagged).

## 2. Judging a goal time

Realistic if at or slower than the projection; ambitious if within 3% of the optimistic
end; beyond that, race pace is capped at the optimistic end and the goal is flagged.

- *Source:* the principle (train at current fitness, not at the goal) is Daniels. The 3%
  figure is Judgement.
- *Supportable:* the behaviour is right. The threshold is a convention and should stay
  labelled as one.

## 3. Moving the projection during the plan

Three mechanisms are at work.

**a. A scheduled fitness ramp.** The plan assumes VDOT rises by one point per six weeks of
build and peak training, capped at +3, as a straight line. Training paces step up with it
and Progress shows "On pace for X if you complete the rest of the plan" from day one.

- *Source:* Daniels' rule of thumb (about one VDOT per four to six weeks early in a build,
  slower once fit). The +3 cap is Judgement.
- *Weak point:* it is a promise, not a projection. It appears before a single run is logged
  and does not fall when sessions are missed. Adherence is computed but never feeds it.

**b. Recalibration from logged quality sessions.** Logged tempo, cruise, interval and
over-under runs are turned into an implied VDOT: warm-up and cool-down are backed out at
the week's easy pace, the remaining pace is inverted through the zone's %VO2max, the last
three such sessions are averaged and blended with the baseline at 25 / 35 / 45% weight.

- *Source:* inverting a pace through Daniels' %VO2max table is Daniels' own method, but he
  applies it to **race** results, and says to raise training VDOT only after a race or when
  workouts clearly feel easier across several sessions.
- *Weak points:*
  1. For intervals, cruise intervals and over-unders the logged time includes the recovery
     jogs. Only warm-up and cool-down are stripped, so the implied VDOT is biased low and a
     runner who hits every rep looks unfit. Only continuous tempos are clean.
  2. Running a tempo faster than prescribed reads as higher fitness; often it is just a
     tempo run too hard. A twenty-minute effort is weak evidence next to a race.
  3. Mid-plan races, the best evidence there is, cannot be logged as races at all.
  4. The weights (25 / 35 / 45%) are Judgement.
  5. The blend only applies in the current week; a strong block early in the plan is not
     carried forward unless more sessions keep coming.

**c. Missed training.** Adherence and ahead/behind mileage are shown but never change the
projection.

## 4. What I would change, in order

1. **Log a race.** A tune-up race resets the VDOT (Daniels) and re-runs the Vickers &
   Vertosick projection with the mileage actually logged in the preceding weeks. This is the
   one change that makes the projection evidence-led.
2. **Strip recoveries from interval-type logs**, using the planned structure (reps, recovery
   distance, jog pace), or recalibrate only from continuous tempos and races until Strava
   laps are imported.
3. **Gate the ramp on evidence.** Show the end-of-plan projection as a range, scale the
   expected gain by the share of quality sessions completed (a 60% block earns 60% of the
   gain), and word it "if the rest goes to plan". Drop the day-one "on pace for" figure.
4. **Use actual mileage in the marathon term**: the last eight weeks of logged kilometres
   where they exist, the plan's own level otherwise, and run Tanda as a cross-check once
   eight weeks of logs exist.
5. **Widen the band with the distance gap and the age of the result** (a race older than
   about eight weeks is weaker evidence). The specific numbers would be Judgement and must
   be labelled as such in RULES.md.
6. **Record every one of these in docs/RULES.md** with its source or its Judgement label.

## Bottom line

The setup projections stand on the best published work for recreational runners. The
in-plan adjustment is the weak part: it is driven by a scheduled ramp plus a noisy signal
from workouts, while the strongest evidence (races and missed sessions) is ignored.

## Status (2026-10-07, same day)

Built: a race log (manual and Strava) that resets the number; average rep time for interval, cruise and rep sessions (typed, or read from Strava laps when they match the rep distance) so those sessions count; the scheduled gain credited per completed quality session; a two-week detraining rule; the three-number card with a headline inside its range; a goal line; marathon mileage term fed with logged mileage for "now" and peak mileage for the potential; training paces that follow the evidence-led number. Rules and their status are in docs/RULES.md under "Fitness projection". Tests: tests/projection.js.

Not built: Tanda as a mid-plan cross-check (needs eight weeks of logs and a display decision); widening the setup band with the distance gap and the age of the race result.
