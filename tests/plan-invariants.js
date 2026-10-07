// Run: node tests/plan-invariants.js [--verbose]
// Generates plans for a matrix of recreational runners and asserts the coaching invariants
// in validatePlan() plus a few scenario-specific expectations. Exit code 1 on any failure.
const g = require('../engine.js');
const MI = g.KM_PER_MI;
const verbose = process.argv.includes('--verbose');
const mi = km => (km/MI).toFixed(1);
const RACE_KM = {'5k':5,'10k':10,'15k':15,'half':21.0975,'marathon':42.195};

function setupFor(o){
  // race on a given weekday (default Sunday) at least o.weeks weeks out
  let d = g.addDays(g.todayDate(), o.weeks*7); while(d.getDay()!==(o.raceDow??0)) d = g.addDays(d,1);
  const sched = g.deriveScheduleFromLongDow(o.longDow??0, o.strength??2);
  return {
    units:'mi', raceKey:o.race, raceDistanceKm:RACE_KM[o.race], raceDate:g.fmtDate(d),
    currentWeeklyKm:o.mpw*MI, recentDistanceKm:('recentKm' in o)?o.recentKm:5, recentTimeSec:('recentSec' in o)?o.recentSec:1200,
    recent2DistanceKm:o.recent2Km??null, recent2TimeSec:o.recent2Sec??null,
    longestRecentRunKm: o.longest!=null ? o.longest*MI : null,
    goalTimeSec:o.goalSec??null, longDow:o.longDow??0, weekStartDow:o.weekStartDow??0, ...sched,
    runsPerWeek:o.runs ?? g.runsPerWeekFor(o.mpw*MI), strengthPerWeek:o.strength??2,
    maxLongRunKm:o.maxLong? o.maxLong*MI : null, maxWeeklyKm:o.maxWeekly ? o.maxWeekly*MI : null,
    longRunEmphasis:o.longE??'balanced', speedEmphasis:o.speedE??'balanced',
    hillsMode:o.hilly?'hilly':'flat', skipBase:!!o.skipBase,
  };
}
function describe(plan){
  plan.weeks.forEach(w=>{
    const tot = w.days.reduce((a,d)=>a+(d.type==='race'?0:d.km),0);
    const long = w.days.find(d=>d.type==='long');
    const q = w.days.filter(d=>g.QUALITY_TYPES.includes(d.type)&&d.type!=='long'&&!d.easyVariety);
    const easy = w.days.filter(d=>d.type==='easy'||d.easyVariety);
    const qs = q.map(d=>`${d.type} ${mi(d.km)}(q${mi(d.qualityKm||0)})`).join(', ');
    const es = easy.map(d=>`${d.label[0]}${mi(d.km)}`).join(' ');
    const st = w.days.filter(d=>d.strength).map(d=>`${['Su','Mo','Tu','We','Th','Fr','Sa'][d.dow]}${d.strengthFocus==='upper'?'U':'L'}`).join(' ');
    const race = w.days.find(d=>d.type==='race');
    console.log(`  w${String(w.weekIndex+1).padStart(2)} ${w.phase.padEnd(6)}${w.isCutback?'*':' '} ${mi(tot).padStart(5)}mi long ${long?mi(long.km).padStart(4):'  - '}${long&&long.racePaceKm?`(${mi(long.racePaceKm)}@RP)`:''} | ${qs.padEnd(44)} | easy ${es.padEnd(24)} | str ${st}${race?' | RACE':''}`);
  });
}
let failures = 0;
function check(name, o, extra){
  const s = setupFor(o);
  const plan = g.generatePlan(s);
  const viol = g.validatePlan(plan, s);
  const custom = extra ? extra(plan, s) : [];
  const all = viol.concat(custom);
  const w1 = plan.weeks[0].paces;
  console.log(`\n=== ${name} === ${o.mpw} mpw, ${o.race}, ${plan.totalWeeks} wk (${plan.buildWeeksCount} train + ${plan.taperWeeks} taper), runs ${s.runsPerWeek}, VDOT ${plan.startVdot.toFixed(1)}->${plan.endVdot.toFixed(1)}, peak ${mi(plan.peakWeeklyKm)} mpw, peak long ${mi(plan.peakLongKm)} mi, E ${g.paceStr(w1.easyPerKm,'mi')} T ${g.paceStr(w1.tempoPerKm,'mi')} I ${g.paceStr(w1.intervalPerKm,'mi')} race ${g.paceStr(plan.racePerKm,'mi')}${plan.prediction?` pred ${g.secToClock(plan.prediction.lowSec)}–${g.secToClock(plan.prediction.highSec)}`:''}`);
  if(verbose || all.length) describe(plan);
  plan.warnings.forEach(x=>console.log('  note: '+x));
  if(all.length){ failures++; console.log('  FAIL:'); all.forEach(x=>console.log('   - '+x)); } else console.log('  ok');
  return plan;
}
const holdsVolume = (plan, s) => { const v = plan.weeks[0].days.reduce((a,d)=>a+d.km,0); return v < s.currentWeeklyKm*0.95 ? [`week 1 ${mi(v)} < current ${mi(s.currentWeeklyKm)}`] : []; };
const hasTaper = (plan) => { const w = plan.weeks.filter(x=>x.phase==='taper'); return w.length ? [] : ['no taper week']; };
const tempoShorterThanLong = (plan) => plan.weeks.flatMap(w=>{ const L=w.days.find(d=>d.type==='long'); return w.days.filter(d=>d.type==='tempo' && L && d.km>=L.km).map(d=>`w${w.weekIndex+1} tempo ${mi(d.km)} >= long ${mi(L.km)}`); });

check('10k, 45 mpw, 20:00 5k', {race:'10k', mpw:45, weeks:12, recentSec:20*60, longest:10}, (p,s)=>[...hasTaper(p), ...tempoShorterThanLong(p)]);
check('10k, 30 mpw', {race:'10k', mpw:30, weeks:10, recentSec:22*60}, (p,s)=>[...holdsVolume(p,s), ...hasTaper(p)]);
check('10k, 30 mpw, speed high', {race:'10k', mpw:30, weeks:10, recentSec:22*60, speedE:'high'});
check('5k, 20 mpw', {race:'5k', mpw:20, weeks:8, recentSec:25*60}, (p,s)=>[...tempoShorterThanLong(p), ...hasTaper(p)]);
check('5k, 40 mpw', {race:'5k', mpw:40, weeks:10, recentSec:19*60, longest:9}, (p,s)=>[...tempoShorterThanLong(p)]);
check('5k, race Saturday, week starts Monday', {race:'5k', mpw:25, weeks:8, recentSec:24*60, raceDow:6, weekStartDow:1, longDow:0});
check('Half, 25 mpw', {race:'half', mpw:25, weeks:12, recentSec:24*60, longest:8}, hasTaper);
check('Half, 50 mpw, two races', {race:'half', mpw:50, weeks:14, recentSec:19*60, recent2Km:10, recent2Sec:40*60, longest:13});
check('Half, 15 mpw slow', {race:'half', mpw:15, weeks:16, recentSec:32*60, longest:5});
check('Half, 35 mpw, goal 1:30 from 21:00 5k', {race:'half', mpw:35, weeks:12, recentSec:21*60, goalSec:90*60, longest:10}, (p)=> p.goalStatus==='beyond' || p.goalStatus==='ambitious' ? [] : ['expected goal to be flagged']);
check('Half, 6 weeks short notice, 20 mpw', {race:'half', mpw:20, weeks:6, recentSec:25*60});
check('Marathon, 40 mpw', {race:'marathon', mpw:40, weeks:18, recentSec:22*60, longest:12}, hasTaper);
check('Marathon, 25 mpw', {race:'marathon', mpw:25, weeks:16, recentSec:28*60, longest:8});
check('Marathon, 40 mpw, long high, hilly', {race:'marathon', mpw:40, weeks:18, recentSec:22*60, longE:'high', hilly:true, longest:14});
check('Marathon, 55 mpw, 6 runs, speed high', {race:'marathon', mpw:55, weeks:18, recentSec:19*60, runs:6, speedE:'high', longest:16});
check('Marathon, cap 40 mpw & 18 mi long', {race:'marathon', mpw:35, weeks:18, recentSec:24*60, maxWeekly:40, maxLong:18, longest:10});
check('10k, 45 mpw, 3 runs/wk', {race:'10k', mpw:45, weeks:12, recentSec:20*60, runs:3});
check('10k, no recent race', {race:'10k', mpw:20, weeks:10, recentKm:null, recentSec:null});
check('Marathon, race Monday', {race:'marathon', mpw:40, weeks:16, recentSec:22*60, raceDow:1, longDow:6});
check('Half, 3 strength/wk, long Saturday', {race:'half', mpw:30, weeks:12, recentSec:23*60, strength:3, longDow:6});
check('5k, 1 strength, skip base', {race:'5k', mpw:30, weeks:8, recentSec:21*60, strength:1, skipBase:true});
check('10k, 24 mpw, long Friday (reported: thin cruise session)', {race:'10k', mpw:24, weeks:10, recentSec:23*60, longDow:5}, (p)=>{
  const bad=[]; p.weeks.forEach(w=>{ if(w.phase==='taper'||w.isCutback) return; w.days.forEach(d=>{ if(d.type==='cruise'||d.type==='tempo'){ const min=g.minutesForKm(d.qualityKm, w.paces.tempoPerKm); if(min<19) bad.push(`w${w.weekIndex+1} ${d.type} ${min.toFixed(0)} min`); } }); }); return bad; });
check('10k, 50 mpw (trims toward what a 10k needs)', {race:'10k', mpw:50, weeks:12, recentSec:19*60, longest:12}, (p,s)=>{ const settled=Math.max(...p.weeks.filter(w=>w.weekIndex>=3 && w.phase!=='taper').map(w=>w.plannedKm||0)); return settled <= s.currentWeeklyKm*0.92 ? [] : [`expected a ~10% trim after the first weeks, settled at ${mi(settled)} vs current ${mi(s.currentWeeklyKm)}`]; });
check('Marathon, 40 mpw, 5 runs (reported: strength variety, recovery day)', {race:'marathon', mpw:40, weeks:18, recentSec:22*60, longest:12, runs:5}, (p)=>{
  const bad=[];
  p.weeks.forEach(w=>{
    const st=w.days.filter(d=>d.strength);
    for(let a=0;a<st.length;a++) for(let b=a+1;b<st.length;b++){ if(st[a].strengthExercises.join('|')===st[b].strengthExercises.join('|')) bad.push(`w${w.weekIndex+1} two identical strength sessions`); }
    const long=w.days.find(d=>d.type==='long'); const after=w.days.find(d=>d.dow===(long?long.dow+1:99)%7);
    if(long && after && after.type==='easy' && w.days.filter(d=>d.type==='easy').length>=2){ const others=w.days.filter(d=>d.type==='easy' && d!==after && d.label!=='Shakeout Jog'); if(others.some(o=>o.km<after.km)) bad.push(`w${w.weekIndex+1} day after long (${after.km}) longer than another easy day`); }
    w.days.forEach(d=>{ if(d.easyVariety && d.type==='fartlek' && !/pickups/.test(d.descBase)) bad.push(`w${w.weekIndex+1} base fartlek is a hard session`); });
    if(w.phase==='taper'){ const easy=w.days.filter(d=>d.type==='easy' && d.label!=='Shakeout Jog'); easy.forEach(e=>{ if(e.km<3 && w.daysToRaceAtStart>7) bad.push(`w${w.weekIndex+1} taper easy day only ${e.km} km`); }); }
  });
  const lateStrength = p.weeks.flatMap(w=>w.days).filter(d=>d.strength && d.daysToRace>10 && d.daysToRace<=17).length;
  if(!lateStrength) bad.push('no strength session 11-17 days out (week-level cutoff bug)');
  return bad; });
check('Marathon, 30 weeks out', {race:'marathon', mpw:30, weeks:30, recentSec:25*60, longest:9});

// general plans
['speed','distance','maintenance','recovery'].forEach(kind=>{
  const sched = g.deriveScheduleFromLongDow(0, kind==='speed'?2:1);
  const s = {planKind:kind, units:'mi', weeks:kind==='recovery'?2:8, currentWeeklyKm:30*MI, recentDistanceKm:5, recentTimeSec:22*60, longDow:0, weekStartDow:0, ...sched, runsPerWeek:4, strengthPerWeek:kind==='speed'?2:1, distanceGoalMetric:'weekly', distanceGoalCurrentKm:30*MI, distanceGoalTargetKm:40*MI};
  const plan = g.generateGeneralPlan(s);
  const viol = g.validatePlan(plan, s);
  console.log(`\n=== general: ${kind} === ${plan.totalWeeks} wk`);
  if(verbose || viol.length) describe(plan);
  if(viol.length){ failures++; console.log('  FAIL:'); viol.forEach(x=>console.log('   - '+x)); } else console.log('  ok');
});

// prediction sanity
console.log('\n=== prediction table (5k -> others), 30 mpw, longest run 10 mi ===');
[[18],[20],[22],[25],[28],[32]].forEach(([m])=>{
  const a = {races:[{km:5, sec:m*60}], weeklyKm:30*MI, longestKm:10*MI};
  const r = k => g.predictRace(a, k);
  console.log(`  5k ${m}:00 -> 10k ${g.secToClock(r(10).sec)}  half ${g.secToClock(r(21.0975).sec)} (${g.secToClock(r(21.0975).lowSec)}–${g.secToClock(r(21.0975).highSec)})  marathon ${g.secToClock(r(42.195).sec)} (${g.secToClock(r(42.195).lowSec)}–${g.secToClock(r(42.195).highSec)})  | VDOT-only marathon ${g.secToClock(g.predictedTimeMinFromVdot(g.vdotFromRace(5,m*60),42.195)*60)}`);
});
console.log(`\n${failures ? failures+' scenario(s) FAILED' : 'all scenarios passed'}`);
process.exit(failures ? 1 : 0);
