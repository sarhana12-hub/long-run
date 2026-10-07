// Run: node tests/readthrough.js > docs/readthrough.txt
// Renders a spread of representative plans, every week and every day, exactly as the page
// prints them (day card summary, the full day sheet lines, strength summary), so a person
// can read them as a runner would. This is the review step the rule checks cannot do.
const g = require('../engine.js');
const { loadPageRenderers } = require('./render-helpers.js');
const ui = loadPageRenderers();
const MI = g.KM_PER_MI;
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
function raceOn(weeks, dow){ let d = g.addDays(g.todayDate(), weeks*7); while(d.getDay()!==dow) d = g.addDays(d,1); return g.fmtDate(d); }
const PROFILES = [
  {name:'10K in 4 weeks, 20 mpw, 4 runs, 2 strength, trained since 8 weeks ago (the owner)', s:{units:'mi', raceKey:'10k', raceDistanceKm:10, weeks:4, raceDow:6, mpw:20, recent:{km:5, sec:25*60+30}, runs:4, strength:2, longDow:0, skipBase:false, taper:'full', hills:'flat', trainedWeeksAgo:8}},
  {name:'Half in 16 weeks, 25 mpw, 5 runs, 2 strength', s:{units:'mi', raceKey:'half', raceDistanceKm:21.0975, weeks:16, raceDow:0, mpw:25, recent:{km:5, sec:25*60+30}, runs:5, strength:2, longDow:0, skipBase:false, taper:'full', hills:'flat'}},
  {name:'Marathon in 20 weeks, 35 mpw, 5 runs, 2 strength, hilly', s:{units:'mi', raceKey:'marathon', raceDistanceKm:42.195, weeks:20, raceDow:0, mpw:35, recent:{km:10, sec:52*60}, runs:5, strength:2, longDow:6, skipBase:false, taper:'full', hills:'hilly'}},
  {name:'5K in 8 weeks, 12 mpw, 3 runs, 1 strength, bodyweight only', s:{units:'mi', raceKey:'5k', raceDistanceKm:5, weeks:8, raceDow:6, mpw:12, recent:{km:5, sec:30*60}, runs:3, strength:1, longDow:0, skipBase:false, taper:'full', hills:'flat', equipment:[]}},
  {name:'10 mile in 12 weeks, 45 mpw, 6 runs, 3 strength, skip base, light taper, km', s:{units:'km', raceKey:'10mi', raceDistanceKm:10*MI, weeks:12, raceDow:0, mpw:45, recent:{km:10, sec:42*60}, runs:6, strength:3, longDow:0, skipBase:true, taper:'light', hills:'flat'}},
  {name:'Half in 10 weeks, 18 mpw, 4 runs, 0 strength, train through, faster build', s:{units:'mi', raceKey:'half', raceDistanceKm:21.0975, weeks:10, raceDow:0, mpw:18, recent:{km:5, sec:28*60}, runs:4, strength:0, longDow:0, skipBase:false, taper:'none', hills:'flat', buildPace:'faster'}},
  {name:'Marathon in 16 weeks, 55 mpw, 6 runs, 2 strength, goal 3:30', s:{units:'mi', raceKey:'marathon', raceDistanceKm:42.195, weeks:16, raceDow:0, mpw:55, recent:{km:21.0975, sec:100*60}, runs:6, strength:2, longDow:0, skipBase:false, taper:'full', hills:'flat', goalSec:3.5*3600}},
  {name:'General: Build speed, 8 weeks, 25 mpw, 5 runs', s:{planKind:'speed', units:'mi', weeks:8, mpw:25, recent:{km:5, sec:26*60}, runs:5, strength:2, longDow:0}},
  {name:'General: Build distance to 35 mpw, 10 weeks, 20 mpw', s:{planKind:'distance', units:'mi', weeks:10, mpw:20, recent:{km:5, sec:27*60}, runs:4, strength:1, longDow:0, distanceGoalMetric:'weekly', target:35}},
];
function setupFor(p){
  const s = p.s; const base = {units:s.units, currentWeeklyKm:s.mpw*MI, recentDistanceKm:s.recent.km, recentTimeSec:s.recent.sec, longDow:s.longDow, weekStartDow:0, ...g.deriveScheduleFromLongDow(s.longDow, s.strength), runsPerWeek:s.runs, strengthPerWeek:s.strength, equipment: s.equipment!=null ? s.equipment : g.DEFAULT_EQUIPMENT.slice()};
  if(s.planKind){ return {...base, planKind:s.planKind, weeks:s.weeks, distanceGoalMetric:s.distanceGoalMetric||'weekly', distanceGoalCurrentKm:s.mpw*MI, distanceGoalTargetKm:(s.target||s.mpw)*MI}; }
  return {...base, raceKey:s.raceKey, raceDistanceKm:s.raceDistanceKm, raceDate:raceOn(s.weeks, s.raceDow), goalTimeSec:s.goalSec||null, longRunEmphasis:'balanced', speedEmphasis:'balanced', hillsMode:s.hills, skipBase:!!s.skipBase, taperMode:s.taper, buildPace:s.buildPace||'standard'};
}
PROFILES.forEach(p=>{
  const setup = setupFor(p);
  const dayOne = p.s.trainedWeeksAgo ? g.addDays(g.todayDate(), -7*p.s.trainedWeeksAgo) : undefined;
  const plan = setup.planKind ? g.generateGeneralPlan(setup, dayOne) : g.generatePlan(setup, dayOne);
  const unit = setup.units;
  console.log(`\n==================== ${p.name} ====================`);
  console.log(`peak ${g.fmtDist(plan.peakWeeklyKm||0, unit, 0)}/wk, long up to ${g.fmtDist(plan.peakLongKm||0, unit, 0)}; weeks ${plan.weeks.length}`);
  (plan.warnings||[]).forEach(w=>console.log(`NOTE: ${w}`));
  plan.weeks.forEach(w=>{
    const label = w.isCutback ? 'cutback' : w.phase;
    console.log(`\n-- Week ${w.weekIndex+1} (${label}${w.beginnerStructure?', beginner structure':''}) total ${g.fmtDist(w.targetKm, unit, 1)}  E ${g.paceStr(w.paces.easyPerKm, unit)} T ${g.paceStr(w.paces.tempoPerKm, unit)} I ${g.paceStr(w.paces.intervalPerKm, unit)}${w.paces.racePerKm?' race '+g.paceStr(w.paces.racePerKm, unit):''}`);
    w.days.forEach(d=>{
      const parts = ui.workoutPartsFor(d, w.paces, unit, 'pace');
      const sum = ui.daySummaryText(d, w.paces, unit, 'pace');
      const str = d.strength ? `  [+${d.strengthFocus}${d.strengthAfterRun?'/after run':''}${d.strengthTimeMin?' '+d.strengthTimeMin+'min':''}: ${(d.strengthExercises||[]).map(x=>x.split(' (')[0]).join('; ')}]` : '';
      console.log(`  ${DOW[d.dow]} ${d.label.padEnd(16)} ${d.km?g.fmtDist(d.km,unit).padStart(7):'       '}  ${sum}${str}`);
      if(parts.length>1 || (parts[0] && parts[0]!==sum)) parts.forEach(x=>console.log(`       · ${x}`));
    });
  });
});
