// Run: node tests/projection.js
// Checks the fitness projection (start / now / if-you-complete-the-plan) against the rules
// it claims to follow: a race resets fitness, logged quality sessions nudge it within caps,
// interval sessions only count once the rep time is known, missed training earns nothing,
// two weeks of light running starts a slow decline, and the potential number shrinks as
// sessions are skipped. Exit code 1 on any failure.
const g = require('../engine.js');
const MI = g.KM_PER_MI;
let failures = 0;
function check(name, ok, detail){ if(ok) console.log('  ok   '+name); else { failures++; console.log('  FAIL '+name+(detail?' — '+detail:'')); } }

function makePlan(){
  let d = g.addDays(g.todayDate(), 16*7); while(d.getDay()!==0) d = g.addDays(d,1);
  const setup = {units:'mi', raceKey:'half', raceDistanceKm:21.0975, raceDate:g.fmtDate(d), currentWeeklyKm:25*MI,
    recentDistanceKm:5, recentTimeSec:25*60+30, goalTimeSec:null, longDow:0, weekStartDow:0, ...g.deriveScheduleFromLongDow(0,2),
    runsPerWeek:5, strengthPerWeek:2, longRunEmphasis:'balanced', speedEmphasis:'balanced', hillsMode:'flat', skipBase:false, taperMode:'full', equipment:g.DEFAULT_EQUIPMENT.slice()};
  return {setup, plan: g.generatePlan(setup)};
}
const {setup, plan} = makePlan();
const start = g.parseDate(plan.weeks[0].weekStart);
const dayOf = (type, nth=0) => { let k=0; for(const w of plan.weeks){ for(const d of w.days){ if(d.type===type){ if(k===nth) return {day:d, week:w}; k++; } } } return null; };
const at = n => g.addDays(start, n);
// Every planned run up to (not including) a date, logged at its own pace - a runner who has
// done the training, so the detraining rule stays out of the way.
function fullLogsBefore(dateStr){
  const logs = [];
  plan.weeks.forEach(w=>w.days.forEach(d=>{ if(d.km>0 && d.type!=='race' && d.date<dateStr){ const pace = (d.paceKey && w.paces[d.paceKey]) || w.paces.easyPerKm; logs.push({id:'f'+d.date, date:d.date, distanceKm:d.km, durationSec:Math.round(d.km*pace)}); } }));
  return logs;
}

console.log('1. nothing logged, day one');
{
  const f = g.projectFitness(plan, [], at(0));
  check('now equals start', Math.abs(f.nowVdot-plan.startVdot)<0.05, `${f.nowVdot} vs ${plan.startVdot}`);
  check('potential equals the plan end', Math.abs(f.potentialVdot-plan.endVdot)<0.1, `${f.potentialVdot} vs ${plan.endVdot}`);
  check('anchor is the setup race', f.anchor.kind==='start');
  check('no-evidence band is wide', f.nowBand>=0.9);
}

console.log('2. a tempo run at the prescribed pace');
{
  const t = dayOf('tempo'); const today = g.parseDate(t.day.date);
  const paces = t.week.paces; const easy = paces.easyPerKm, tempo = paces.tempoPerKm;
  const sec = (t.day.warmupKm+t.day.cooldownKm)*easy + (t.day.km-t.day.warmupKm-t.day.cooldownKm)*tempo;
  const f = g.projectFitness(plan, fullLogsBefore(t.day.date).concat([{id:'a', date:t.day.date, distanceKm:t.day.km, durationSec:Math.round(sec)}]), today);
  check('counts as evidence', f.evidence.length===1 && f.evidence[0].type==='tempo');
  check('moves now up a little, not a lot', f.nowVdot>=plan.startVdot-0.05 && f.nowVdot<=plan.startVdot+1.2, `${f.nowVdot} vs ${plan.startVdot}`);
  check('credits the session toward the scheduled gain', f.sessionsDone>=1 && f.earnedGain>0);
  check('no detraining when the training was done', f.decay===0, String(f.lowDays));
}

console.log('3. a race resets fitness');
{
  const t = dayOf('tempo'); const raceDate = g.fmtDate(g.addDays(g.parseDate(t.day.date), 3));
  const raceSec = Math.round(g.predictedTimeMinFromVdot(plan.startVdot+2, 5)*60);
  const f = g.projectFitness(plan, [{id:'r', date:raceDate, distanceKm:5, durationSec:raceSec, kind:'race'}], g.parseDate(raceDate));
  check('anchor is the race', f.anchor.kind==='race');
  check('now is about the race VDOT', Math.abs(f.nowVdot-(plan.startVdot+2))<0.3, `${f.nowVdot} vs ${plan.startVdot+2}`);
}

console.log('4. intervals need a rep time');
{
  const t = dayOf('intervals'); const today = g.parseDate(t.day.date);
  const repM = g.repMetersForDay(t.day);
  check('rep distance read from the session', repM>=400 && repM<=1600, String(repM));
  const f0 = g.projectFitness(plan, [{id:'i', date:t.day.date, distanceKm:t.day.km, durationSec:Math.round(t.day.km*t.week.paces.easyPerKm)}], today);
  check('whole-run time alone is not evidence', f0.evidence.length===0);
  const repSec = Math.round(t.week.paces.intervalPerKm*repM/1000);
  const f1 = g.projectFitness(plan, [{id:'i', date:t.day.date, distanceKm:t.day.km, durationSec:Math.round(t.day.km*t.week.paces.easyPerKm), repSec, repMeters:repM}], today);
  check('rep time makes it evidence', f1.evidence.length===1 && f1.evidence[0].type==='intervals');
}

console.log('5. a tempo run far too fast is capped');
{
  const t = dayOf('tempo'); const today = g.parseDate(t.day.date);
  const f = g.projectFitness(plan, fullLogsBefore(t.day.date).concat([{id:'a', date:t.day.date, distanceKm:t.day.km, durationSec:Math.round(t.day.km*t.week.paces.tempoPerKm*0.6)}]), today);
  check('one session moves now by under a point', f.workoutAdjust<=1.0 && f.workoutAdjust>0, String(f.workoutAdjust));
}

console.log('6. five weeks of nothing after one logged run');
{
  const today = at(35);
  const first = plan.weeks[0].days.find(d=>d.km>0);
  const f = g.projectFitness(plan, [{id:'first', date:first.date, distanceKm:first.km, durationSec:Math.round(first.km*plan.weeks[0].paces.easyPerKm)}], today);
  check('counts the light stretch', f.lowDays>=14, String(f.lowDays));
  check('now has eased below the start', f.nowVdot<plan.startVdot && f.decay>0, `${f.nowVdot} vs ${plan.startVdot}, decay ${f.decay}`);
  check('potential has shrunk (missed sessions earn nothing)', f.potentialVdot < plan.endVdot-0.05 || plan.endVdot-plan.startVdot<0.2, `${f.potentialVdot} vs ${plan.endVdot}`);
  check('decay is capped', f.decay<=2);
}

console.log('6b. nothing logged at all: no decline (defect 84)');
{
  const today = at(35);
  const f = g.projectFitness(plan, [], today);
  check('no decay without any logs', f.decay===0 && f.lowDays===0, `decay ${f.decay}, lowDays ${f.lowDays}`);
  check('now equals the start', Math.abs(f.nowVdot-plan.startVdot)<0.05, `${f.nowVdot} vs ${plan.startVdot}`);
  const g2 = g.projectFitness(plan, [], today, {trackingStart: g.fmtDate(at(35))});
  check('tracking start honoured', g2.decay===0, String(g2.decay));
  check('weeks before the tracking start count as done in full', g2.sessionsDue>0 ? g2.sessionsDone===g2.sessionsDue : true, `${g2.sessionsDone}/${g2.sessionsDue}`);
}

console.log('7. race-time projections');
{
  const t = dayOf('tempo'); const today = g.parseDate(t.day.date);
  const p = g.fitnessProjections(plan, [], today, plan.raceDistanceKm, 0);
  const ordered = x => x.lowSec<=x.sec && x.sec<=x.highSec;
  check('start, now and potential each carry a range', ordered(p.start) && ordered(p.now) && ordered(p.potential));
  check('potential is faster than now', p.potential.sec < p.now.sec);
  const p2 = g.fitnessProjections(plan, [], today, plan.raceDistanceKm, p.potential.sec+1);
  check('goal inside the reachable range', p2.goal.status==='inside');
  const p3 = g.fitnessProjections(plan, [], today, plan.raceDistanceKm, p.potential.lowSec*0.9);
  check('goal beyond the range', p3.goal.status==='beyond');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall projection checks passed');
process.exit(failures ? 1 : 0);
