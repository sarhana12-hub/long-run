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
    runsPerWeek:o.runs ?? g.runsPerWeekFor(o.mpw*MI), strengthPerWeek:o.strength??2, equipment:o.equipment,
    maxLongRunKm:o.maxLong? o.maxLong*MI : null, maxWeeklyKm:o.maxWeekly ? o.maxWeekly*MI : null,
    longRunEmphasis:o.longE??'balanced', speedEmphasis:o.speedE??'balanced',
    hillsMode:o.hilly?'hilly':'flat', skipBase:!!o.skipBase,
    taperMode:o.taperMode||'full',
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
// 69 bodyweight only: no gym exercise may appear
check('10k, 20 mpw, bodyweight only', {race:'10k', mpw:20, weeks:10, recentSec:25*60, equipment:[]}, (p)=>{ const bad=[]; p.weeks.forEach(w=>w.days.forEach(d=>(d.strengthExercises||[]).forEach(x=>{ if(/Back squat|Leg press|Kettlebell|Barbell|Dumbbell|Pull-ups|Hamstring curl|Calf press|Smith|Trap bar|Goblet squat|Farmer carry|Suitcase carry|Lat pulldown|Seated row|Chest press|Weighted step-ups|Bulgarian split squat/i.test(x)) bad.push(`w${w.weekIndex+1} ${x.split(' (')[0]}`); }))); return bad.length ? [bad.slice(0,3).join('; ')] : []; });
// 89 the session outranks an extra run day: build/peak weeks keep a quality session even when five days cannot hold it
check('10k, 20 mpw, 5 runs: build weeks keep their session', {race:'10k', mpw:20, weeks:12, recentSec:23*60+15, runs:5}, (p)=>p.weeks.filter(w=>(w.phase==='build'||w.phase==='peak') && !w.isCutback && !w.days.some(d=>d.type==='race') && !w.days.some(d=>g.QUALITY_TYPES.includes(d.type) && !d.easyVariety && d.type!=='long')).map(w=>`w${w.weekIndex+1} ${w.phase} has no quality session`));
// 79 distance plan says so when the weeks cannot reach the target
{ const s = {units:'mi', planKind:'distance', weeks:10, currentWeeklyKm:20*MI, recentDistanceKm:5, recentTimeSec:27*60, longDow:0, weekStartDow:0, runsPerWeek:4, strengthPerWeek:1, distanceGoalMetric:'weekly', distanceGoalCurrentKm:20*MI, distanceGoalTargetKm:35*MI, ...g.deriveScheduleFromLongDow(0,1)}; const p = g.generateGeneralPlan(s); const ok = (p.warnings||[]).some(x=>/reaches about/.test(x)) && p.peakWeeklyKm>0; console.log(`\n=== distance 20->35 in 10 weeks === peak ${mi(p.peakWeeklyKm)} mpw`); (p.warnings||[]).forEach(x=>console.log('  note: '+x)); if(!ok){ failures++; console.log('  FAIL: expected a shortfall note and a reported peak'); } else console.log('  ok'); }
// 144 upper session: standard by default, the full version only when chosen for that day; never in a taper week
{
  const mk = () => [{date:'2026-10-09', dow:5, type:'easy', km:8, strength:true, strengthFocus:'upper', strengthFocusPinned:true, daysToRace:40}];
  const std = mk(); g.refreshStrengthWorkouts(std, 'build', 2, {});
  const full = mk(); g.refreshStrengthWorkouts(full, 'build', 2, {longDates:new Set(['2026-10-09'])});
  const taper = mk(); g.refreshStrengthWorkouts(taper, 'taper', 9, {longDates:new Set(['2026-10-09'])});
  const bad=[];
  if(!(std[0].strengthLongable && !std[0].strengthLong && std[0].strengthTimeMin===22 && std[0].strengthExercises.length===4)) bad.push('standard upper session is not 4 lines / 22 min by default');
  if(!(full[0].strengthLong && full[0].strengthTimeMin===35 && full[0].strengthExercises.length===6)) bad.push('full upper session is not 6 lines / 35 min: '+full[0].strengthExercises.length);
  if(!(full[0].strengthExercises.slice(0,2).join('|')===std[0].strengthExercises.slice(0,2).join('|'))) bad.push('full upper session does not start with the standard pull and push');
  if(taper[0].strengthLongable || taper[0].strengthLong || taper[0].strengthTimeMin!==22) bad.push('full upper session offered in a taper week');
  const names = full[0].strengthExercises.map(l=>l.replace(/^\d+×\S+\s+/,'').split(' (')[0]); if(new Set(names).size!==names.length) bad.push('full upper session repeats an exercise: '+names.join(', '));
  console.log('\n=== upper session standard vs full ==='); if(bad.length){ failures++; bad.forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 166 weight guidance follows the rep target and the phase, and never clashes with a cue
{
  const html = require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  const i = html.indexOf('function loadSuggestion('), j = html.indexOf('function plannedRepsFor(');
  const { loadSuggestion } = new Function('parseDate','niceDate', html.slice(i,j)+'; return {loadSuggestion};')(g.parseDate, d=>d.toDateString());
  const L = (v, r) => ({date:'2026-10-09', value:v, reps:r, unit:'lb'});
  const bad = [];
  const v = (last, reps, tier) => loadSuggestion(last, reps, tier, 'lb').value;
  if(!(v(L(45,10),10,'heavy') > 45)) bad.push('same reps in a build week does not go up');
  if(v(L(45,10),10,'maintain') !== 45) bad.push('same reps in a peak week does not hold');
  if(!(v(L(45,8),10,'heavy') < 45)) bad.push('more reps does not read lighter');
  if(!(v(L(45,10),8,'heavy') > 45)) bad.push('fewer reps in a build week does not read heavier');
  if(v(L(185,5),4,'maintain') !== 185) bad.push('a peak week with fewer reps suggests a different load (it should keep it)');
  if(!(v(L(30,8),12,'light') < 30)) bad.push('more reps in a taper week does not read lighter');
  if(/same reps/i.test(loadSuggestion({date:'2026-10-09', value:45, unit:'lb'}, 10, 'heavy', 'lb').text)) bad.push('claims "same reps" without knowing last time\'s reps');
  // no cue on a loaded lift tells the runner to go lighter or heavier: the weight box owns load
  const pl = g.generatePlan({units:'mi', raceKey:'half', raceDistanceKm:21.0975, raceDate:'2026-12-20', currentWeeklyKm:30*MI, recentDistanceKm:5, recentTimeSec:23*60, longDow:0, weekStartDow:0, ...g.deriveScheduleFromLongDow(0,3), runsPerWeek:5, strengthPerWeek:3, longRunEmphasis:'balanced', speedEmphasis:'balanced', hillsMode:'flat', skipBase:false, taperMode:'full'}, g.parseDate('2026-08-15'));
  const days = pl.weeks.flatMap(w=>w.days).filter(d=>d.strength && d.strengthExercises);
  days.forEach(d=>{ g.refreshStrengthWorkouts([d], 'build', 3, {longDates:new Set([d.date])}); });
  const lines = days.flatMap(d=>d.strengthExercises);
  const clash = lines.filter(l=>/a little lighter|go lighter|lighter than last|heavier than last/i.test(l));
  if(clash.length) bad.push('a cue still sets the load: '+clash[0]);
  if(!days.every(d=>d.strengthTier)) bad.push('a strength day has no session type for the weight guidance');
  console.log('\n=== weight guidance follows reps and phase ==='); if(bad.length){ failures++; bad.forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 171 one-day swaps: every alternative is the same job, from the runner's equipment, keeps
// the sets, never repeats an exercise already in the session, and reads as a normal line
{
  const RE = /^(\d+)×(\S+) (.+?) \(([^)]*)\) — (.*?)\.?(?: Rest (.+?) between sets\.)?$/;
  const base = n => n.replace(/ (each side|each hand|each way)$/, '');
  const slotOf = (name, equip) => Object.keys(g.STRENGTH_EXERCISES).find(k=>g.STRENGTH_EXERCISES[k].variants.some(v=>v.name===name && v.equip===equip)) || Object.keys(g.STRENGTH_EXERCISES).find(k=>g.STRENGTH_EXERCISES[k].variants.some(v=>v.name===name));
  const famOf = slot => g.SWAP_FAMILIES.findIndex(f=>f.includes(slot));
  const bad = []; let checked = 0;
  for(const equipment of [g.DEFAULT_EQUIPMENT.slice(), [], ['dumbbells','bench']]){
    const avail = g.equipmentSet(equipment);
    const pl = g.generatePlan({units:'mi', raceKey:'half', raceDistanceKm:21.0975, raceDate:'2027-01-31', currentWeeklyKm:30*MI, recentDistanceKm:5, recentTimeSec:23*60, longestRecentRunKm:10*MI, longDow:6, weekStartDow:0, ...g.deriveScheduleFromLongDow(6, 3), runsPerWeek:5, strengthPerWeek:3, equipment, goalTimeSec:null, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'flat', skipBase:false, taperMode:'full', buildPace:'standard'}, g.parseDate('2026-09-06'));
    pl.weeks.flatMap(w=>w.days).filter(d=>d.strengthExercises).forEach(d=>{
      const session = d.strengthExercises, names = new Set(session.map(l=>{ const m = l.match(RE); return m ? base(m[3]) : null; }));
      session.forEach(l=>{
        const m = l.match(RE); if(!m) return;
        const fam = famOf(slotOf(base(m[3]), m[4]));
        g.strengthSwapOptions(l, session, avail).forEach(o=>{
          checked++;
          const q = o.line.match(RE);
          if(!q){ bad.push('unreadable swap line: '+o.line); return; }
          if(q[1]!==m[1]) bad.push(`sets changed ${m[1]}→${q[1]}: ${o.line}`);
          if(names.has(base(q[3]))) bad.push('swap repeats an exercise in the session: '+o.line);
          if(famOf(slotOf(base(q[3]), q[4]))!==fam && !g.SWAP_FAMILIES[fam].some(k=>g.STRENGTH_EXERCISES[k].variants.some(v=>v.name===base(q[3])))) bad.push(`swap changes the job: ${m[3]} → ${q[3]}`);
          const v = Object.values(g.STRENGTH_EXERCISES).flatMap(e=>e.variants).find(x=>x.name===base(q[3]) && x.equip===q[4]);
          if(!v || !v.needs.every(id=>avail.has(id))) bad.push('swap needs equipment the runner lacks: '+o.line);
          if(/bodyweight/i.test(q[4]) && /^heavy/.test(q[5])) bad.push('bodyweight swap told to go heavy: '+o.line);
          if(/undefined|NaN/.test(o.line)) bad.push('broken swap line: '+o.line);
        });
      });
    });
  }
  // the owner's case: a barbell squat traded for the leg press
  const sq = '4×5 Back squat (barbell across the upper back) — heavy — 1–2 reps left in the tank. Rest 2–3 min between sets.';
  const lp = g.strengthSwapOptions(sq, [sq]).find(o=>o.name==='Leg press');
  if(!lp || !/^4×5 Leg press \(machine\) — heavy — 1–2 reps left in the tank\. Rest 2 min between sets\.$/.test(lp.line)) bad.push('back squat does not offer the leg press as 4×5: '+(lp && lp.line));
  // 176 the slot's job decides which kind is the better replacement; one-leg leg press is offered
  if(g.strengthSlotRole(sq)!=='main') bad.push('back squat not read as the main lift');
  const bss = '3×6/leg Bulgarian split squat (dumbbells in hand) — moderate-heavy, 2 left in the tank. Rest 75s between sets.';
  if(g.strengthSlotRole(bss)!=='single') bad.push('Bulgarian split squat not read as the single-leg lift');
  const sl = g.strengthSwapOptions(sq, [sq]);
  if(!sl.some(o=>o.name==='Single-leg leg press' && o.singleLeg)) bad.push('single-leg leg press not offered for a squat');
  if(!(sl.some(o=>o.singleLeg) && sl.some(o=>!o.singleLeg && !o.bodyweight))) bad.push('squat swap does not offer both kinds');
  if(g.resolveExercise(g.STRENGTH_EXERCISES.legPress, g.equipmentSet()).name!=='Leg press') bad.push('single-leg leg press became the planned default');
  console.log(`\n=== one-day exercise swaps (${checked} alternatives) ===`); if(bad.length){ failures++; [...new Set(bad)].slice(0,10).forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 172 variety: the owner's layout (one lower day, an upper day the day after, a second
// upper day) never repeats an exercise on back-to-back days, meets every pull and push
// pairing, and walks every lift in the lower pools even at one lower session a week
{
  const nm = l => l.replace(/^\S+\s+/,'').split(' (')[0];
  const st = {units:'mi', raceKey:'half', raceDistanceKm:21.0975, raceDate:'2027-03-14', currentWeeklyKm:22*MI, recentDistanceKm:5, recentTimeSec:24*60, longestRecentRunKm:7*MI, longDow:0, weekStartDow:0, ...g.deriveScheduleFromLongDow(0, 3), runsPerWeek:5, strengthPerWeek:3, equipment:g.DEFAULT_EQUIPMENT.slice(), goalTimeSec:null, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'flat', skipBase:false, taperMode:'full', buildPace:'standard'};
  const pl = g.generatePlan(st, g.parseDate('2026-09-06'));
  const weeks = pl.weeks.filter(w=>w.phase==='base'||w.phase==='build').slice(0,12);
  const bad = [];
  // Mon lower, Tue upper, Sat upper (the owner's); and Sun upper, Wed lower, Sat upper, so a
  // Saturday session meets the next week's Sunday one across the week boundary
  for(const layout of [[[1,'lower'],[2,'upper'],[6,'upper']], [[0,'upper'],[3,'lower'],[6,'upper']]]){
  const seq = [];
  weeks.forEach((w,k)=>{
    w.days.forEach(d=>{ d.strength=false; d.strengthFocus=null; });
    layout.forEach(([i,f])=>{ w.days[i].strength=true; w.days[i].strengthFocus=f; });
    g.refreshStrengthWorkouts(w.days, w.phase, w.weekIndex, {equipment:st.equipment, weekInBlock:w.weekIndex%4, prevNames: g.strengthNamesBefore(weeks[k-1])});
    w.days.filter(d=>d.strengthExercises).forEach(d=>seq.push({date:d.date, focus:d.strengthFocus, names:d.strengthExercises.map(nm)}));
  });
  for(let i=1;i<seq.length;i++){ const gap = (g.parseDate(seq[i].date)-g.parseDate(seq[i-1].date))/864e5; const rep = seq[i].names.filter(n=>seq[i-1].names.includes(n) && !/calf/i.test(n)); if(gap<=1 && rep.length) bad.push(`${seq[i-1].date} → ${seq[i].date} repeat ${rep.join(', ')}`); }
  const up = seq.filter(x=>x.focus==='upper'), lo = seq.filter(x=>x.focus!=='upper');
  const pairs = new Set(up.map(x=>x.names.slice(0,2).join('+'))).size;
  if(pairs < 9) bad.push(`only ${pairs} pull+push pairings in ${up.length} upper sessions`);
  for(const n of ['Kettlebell swing','Single-leg Romanian deadlift','Hamstring curl']) if(!lo.some(x=>x.names.includes(n))) bad.push(`${n} never comes up at one lower session a week`);
  for(const n of ['Back squat','Leg press','Romanian deadlift','Barbell hip thrust']) if(!lo.some(x=>x.names.includes(n))) bad.push(`${n} never comes up at one lower session a week`);
  }
  console.log(`\n=== strength variety, one lower and two upper a week ===`); if(bad.length){ failures++; bad.slice(0,8).forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 173 the full upper session's second pull and push work the other plane from the first
{
  const nm = l => l.replace(/^\S+\s+/,'').split(' (')[0];
  const vPull = /Pull-ups|pulldown|Assisted pull-ups/i, vPush = /shoulder press|Overhead press|Kettlebell press|Pike push-ups|^Shoulder press$/i;
  const bad = [];
  for(let v=0; v<18; v++){
    const n = g.buildUpperStrengthWorkout(v, g.equipmentSet(), true).map(nm);
    if(vPull.test(n[0])===vPull.test(n[2])) bad.push(`variant ${v}: both pulls in one plane: ${n[0]}, ${n[2]}`);
    if(vPush.test(n[1])===vPush.test(n[3])) bad.push(`variant ${v}: both pushes in one plane: ${n[1]}, ${n[3]}`);
  }
  console.log('\n=== full upper session: second pull and push in the other plane ==='); if(bad.length){ failures++; bad.slice(0,6).forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 174 history is never rewritten: a rebuild keeps every past day and the runner's own edits
// ahead, and a strength refresh from today leaves earlier sessions exactly as they were
{
  const html = require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  const i = html.indexOf('function keepHistoryAndEdits('), j = html.indexOf('/* ============================= strava');
  const keep = new Function('fmtDate','todayDate','round1','startedStrengthDates', html.slice(html.indexOf('function keepHistoryAndEdits('), j)+'; return keepHistoryAndEdits;')(g.fmtDate, ()=>g.parseDate('2026-10-20'), g.round1, ()=>new Set());
  const st = {units:'mi', raceKey:'half', raceDistanceKm:21.0975, raceDate:'2027-01-31', currentWeeklyKm:20*MI, recentDistanceKm:5, recentTimeSec:23*60, longestRecentRunKm:10*MI, longDow:0, weekStartDow:0, ...g.deriveScheduleFromLongDow(0, 3), runsPerWeek:5, strengthPerWeek:3, equipment:g.DEFAULT_EQUIPMENT.slice(), goalTimeSec:null, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'flat', skipBase:false, taperMode:'full', buildPace:'standard'};
  const old = g.generatePlan(st, g.parseDate('2026-09-06')), fresh = g.generatePlan(st, g.parseDate('2026-09-06'));
  const od = old.weeks.flatMap(w=>w.days);
  od.forEach(d=>{ d.mark = 'old'; });
  const edited = od.find(d=>d.date>'2026-10-20' && d.type==='easy'); edited.userEdited = true;
  keep(old, fresh);
  const fd = fresh.weeks.flatMap(w=>w.days);
  const bad = [];
  if(fd.some(d=>d.date<'2026-10-20' && d.mark!=='old')) bad.push('a past day was replaced by the rebuild');
  if(fd.find(d=>d.date===edited.date).mark!=='old') bad.push("the runner's edited day ahead was lost");
  if(fd.some(d=>d.date>='2026-10-20' && d.date!==edited.date && d.mark==='old')) bad.push('an unedited day ahead kept the old rules');
  // refresh from a date: earlier days untouched, later ones rebuilt
  const w = fresh.weeks.find(x=>x.days.filter(d=>d.strength).length>=2);
  const sd = w.days.filter(d=>d.strength);
  sd[0].strengthExercises = ['3×8 Marker lift (none) — x.']; const marked = JSON.stringify(sd[0]);
  sd[1].strengthExercises = ['3×8 Marker lift (none) — x.'];
  g.refreshStrengthWorkouts(w.days, w.phase, w.weekIndex, {equipment:st.equipment, fromDate: sd[1].date});
  if(JSON.stringify(sd[0])!==marked) bad.push('a refresh from today rewrote an earlier session');
  if(/Marker/.test(sd[1].strengthExercises.join())) bad.push('a refresh from today did not rebuild the session on that day');
  sd[1].strengthExercises = ['3×8 Marker lift (none) — x.'];
  g.refreshStrengthWorkouts(w.days, w.phase, w.weekIndex, {equipment:st.equipment, fromDate: sd[1].date, keepDates:new Set([sd[1].date])});
  if(!/Marker/.test(sd[1].strengthExercises.join())) bad.push("a refresh rebuilt today's session after it was started");
  g.refreshStrengthWorkouts(w.days, w.phase, w.weekIndex, {equipment:st.equipment, fromDate: sd[1].date, rebuildDates:new Set([sd[0].date])});
  if(/Marker/.test(sd[0].strengthExercises.join())) bad.push('an explicit change to a past day did not rebuild it');
  // 175 a past day with weights logged but no session is rebuilt from them
  const r = g.rebuildLoggedSession({date:'2026-10-16', dow:5, type:'rest', km:0, daysToRace:60}, ['Dumbbell bench press','Single-arm dumbbell row'], 'build', 6, {keepDates:new Set(['2026-10-16'])});
  const rn = (r.strengthExercises||[]).join(' | ');
  if(!(r.strength && r.strengthFocus==='upper' && /Dumbbell bench press/.test(rn) && /Single-arm dumbbell row/.test(rn) && r.strengthRestored)) bad.push('session not rebuilt from logged weights: '+rn);
  const rl = g.rebuildLoggedSession({date:'2026-10-16', dow:5, type:'rest', km:0, daysToRace:60}, ['Back squat'], 'build', 6, {});
  const main = (rl.strengthExercises||[]).find(l=>/^\d+×5 /.test(l)) || '';
  if(rl.strengthFocus!=='lower' || !/Back squat/.test(main)) bad.push('a logged back squat is not the main lift of the rebuilt session: '+rl.strengthExercises.join(' | '));
  console.log('\n=== history kept through rebuilds and refreshes ==='); if(bad.length){ failures++; bad.forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 161 treadmill days show a rough mile equivalent beside every metre distance (miles only)
{
  const { loadPageRenderers } = require('./render-helpers.js'); const ui = loadPageRenderers();
  const pl = g.generatePlan({units:'mi', raceKey:'10k', raceDistanceKm:10, raceDate:'2026-10-31', currentWeeklyKm:30*MI, recentDistanceKm:5, recentTimeSec:23*60, longDow:6, weekStartDow:0, ...g.deriveScheduleFromLongDow(6,2), runsPerWeek:5, strengthPerWeek:2, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'flat', skipBase:false, taperMode:'full'}, g.parseDate('2026-08-15'));
  const bad = []; let seen = 0;
  pl.weeks.forEach(w=>w.days.filter(d=>/\d{3,5}m\b/.test(d.descBase||'')).forEach(d=>{
    seen++;
    const tm = {...d, treadmill:true};
    const parts = ui.workoutPartsFor(tm, w.paces, 'mi', 'speed').join(' | ');
    const summary = ui.daySummaryText(tm, w.paces, 'mi', 'speed');
    for(const [where, text] of [['day sheet', parts], ['day card', summary]]){
      const bare = (text.match(/\b\d{3,5}m\b(?! \(\d)/g)||[]);
      if(bare.length) bad.push(`${d.date} ${d.type} ${where}: metres without miles: ${bare.join(', ')} in "${text.slice(0,100)}"`);
    }
    const off = ui.workoutPartsFor(d, w.paces, 'mi', 'pace').join(' | ');
    if(/\d+m \(\d/.test(off)) bad.push(`${d.date}: mile equivalents shown off the treadmill`);
    const km = ui.workoutPartsFor(tm, w.paces, 'km', 'speed').join(' | ');
    if(/\d+m \(\d/.test(km)) bad.push(`${d.date}: mile equivalents shown in km`);
  }));
  const one = pl.weeks.flatMap(w=>w.days.map(d=>({d,w}))).find(x=>/800m/.test(x.d.descBase||''));
  if(one && !ui.workoutPartsFor({...one.d, treadmill:true}, one.w.paces, 'mi', 'speed').join(' ').includes('800m (0.5 mi)')) bad.push('800m is not shown as 0.5 mi');
  if(seen < 3) bad.push('only '+seen+' days with metre distances checked');
  console.log(`\n=== treadmill days show miles beside metres (${seen} days) ===`); if(bad.length){ failures++; [...new Set(bad)].slice(0,6).forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 157 what the runner reads adds up: on every day with a warm-up, the session text's warm-up,
// main set and cool-down sum to the day's total as shown, and the parts sheet prefills the
// same figures (owner: 1.2 + 2.8 + 0.9 mi read on a 5.0 mi day, logged 4.9 vs 5.0 planned)
{
  const html = require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  const i = html.indexOf('function entryBy('), j = html.indexOf('function partHintText(', i);
  const names = Object.keys(g).filter(k=>/^[A-Za-z_$][\w$]*$/.test(k));
  const page = new Function('g', `${names.map(k=>`const ${k} = g.${k};`).join('\n')}\n${html.slice(i, j)}\nreturn {partsDraftFor, partsFromDraft};`)(g);
  const { loadPageRenderers } = require('./render-helpers.js'); const ui = loadPageRenderers();
  const bad = []; let checked = 0;
  const profiles = [{race:'10k', km:10, mpw:20, runs:5, longDow:6, dayOne:'2026-08-15', raceDate:'2026-10-31'}, {race:'half', km:21.0975, mpw:30, runs:5, longDow:0, weeks:14}, {race:'marathon', km:42.195, mpw:40, runs:5, longDow:0, weeks:18}, {race:'5k', km:5, mpw:15, runs:4, longDow:6, weeks:10}];
  profiles.forEach(pr=>{
    let rd = pr.raceDate; if(!rd){ let d = g.addDays(g.todayDate(), pr.weeks*7); while(d.getDay()!==6) d = g.addDays(d,1); rd = g.fmtDate(d); }
    const pl = g.generatePlan({units:'mi', raceKey:pr.race, raceDistanceKm:pr.km, raceDate:rd, currentWeeklyKm:pr.mpw*MI, recentDistanceKm:5, recentTimeSec:24*60, longDow:pr.longDow, weekStartDow:0, ...g.deriveScheduleFromLongDow(pr.longDow,2), runsPerWeek:pr.runs, strengthPerWeek:2, longRunEmphasis:'balanced', speedEmphasis:'balanced', hillsMode:'flat', skipBase:false, taperMode:'full'}, pr.dayOne ? g.parseDate(pr.dayOne) : undefined);
    pl.weeks.forEach(w=>w.days.filter(d=>((d.warmupKm||0)+(d.cooldownKm||0))>0.15 && d.type!=='race').forEach(day=>{
      for(const unit of ['mi','km']){
        checked++;
        const total = Number(g.kmToUnit(day.km, unit).toFixed(1));
        if(day.type==='tempo' || day.type==='racepace'){
          const text = ui.workoutPartsFor(day, w.paces, unit, 'pace').join(' | ');
          const num = re => { const m = text.match(re); return m ? Number(m[1]) : null; };
          const wu = num(new RegExp('Warm up ([\\d.]+) '+unit)), cd = num(new RegExp('[Cc]ool down ([\\d.]+) '+unit)), main = num(new RegExp('\\| ([\\d.]+) '+unit+' (?:continuous|at)'));
          if(wu==null || main==null) bad.push(`${day.date} ${day.type} (${unit}): parts not found in "${text.slice(0,120)}"`);
          else if(Math.abs(wu + main + (cd||0) - total) > 0.001) bad.push(`${day.date} ${day.type} (${unit}): text reads ${wu} + ${main} + ${cd||0} = ${(wu+main+(cd||0)).toFixed(1)}, day shows ${total}`);
        }
        const draft = page.partsDraftFor(day, unit, null);
        const sum = ['warmup','main','cooldown'].reduce((a,p)=>a+(Number(draft[p].dist)||0),0);
        if(Math.abs(sum - total) > 0.001) bad.push(`${day.date} ${day.type} (${unit}): parts sheet prefills ${sum.toFixed(1)}, day shows ${total}`);
      }
    }));
  });
  if(checked < 20) bad.push('only '+checked+' warm-up days checked');
  // a distance the runner types is saved as typed
  const pl = g.generatePlan({units:'mi', raceKey:'10k', raceDistanceKm:10, raceDate:'2026-10-31', currentWeeklyKm:20*MI, recentDistanceKm:5, recentTimeSec:23*60+15, longDow:6, weekStartDow:0, ...g.deriveScheduleFromLongDow(6,3), runsPerWeek:5, strengthPerWeek:3, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'hilly', skipBase:false, taperMode:'full'}, g.parseDate('2026-08-15'));
  const day = pl.weeks.flatMap(w=>w.days).find(d=>d.warmupKm>0.15);
  const typed = page.partsDraftFor(day, 'mi', null); ['warmup','main','cooldown'].forEach(p=>{ typed[p].time = '10:00'; }); typed.cooldown.dist = '1.1';
  const t = page.partsFromDraft(typed, 'mi', day);
  if(Math.abs(t.parts[2].km - 1.1*MI) > 0.002) bad.push('a typed cool-down distance was not used as typed: '+t.parts[2].km);
  console.log(`\n=== what the runner reads adds up (${checked} warm-up days, mi and km) ===`); if(bad.length){ failures++; [...new Set(bad)].slice(0,6).forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 152 race-pace wording follows whether a goal is set: no goal means the pace is the
// predicted one, and the page must not call it "your goal pace"
{
  const html = require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  const i = html.indexOf('const WORKOUT_PURPOSE = {'), j = html.indexOf('function niceDate(', i);
  const { workoutPurposeFor } = new Function(html.slice(i, j)+'\nreturn {workoutPurposeFor};')();
  const bad = [];
  const noGoal = {raceDistanceKm:10, goalRacePerKm:null}, withGoal = {raceDistanceKm:10, goalRacePerKm:290}, general = {raceDistanceKm:null, goalRacePerKm:null};
  ['racepace','race'].forEach(t=>{
    const a = workoutPurposeFor(t, noGoal);
    if(/goal/i.test(a.purpose+a.effort) && !/set a goal/i.test(a.purpose)) bad.push(t+' says goal with no goal set: '+a.purpose+' / '+a.effort);
    const b = workoutPurposeFor(t, withGoal);
    if(!/goal|target/i.test(b.purpose+b.effort)) bad.push(t+' with a goal no longer mentions it');
  });
  if(workoutPurposeFor('tempo', noGoal)!==workoutPurposeFor('tempo', withGoal)) bad.push('tempo wording changed with the goal');
  if(!workoutPurposeFor('easy', general)) bad.push('general plan lost its easy-run purpose');
  console.log('\n=== race-pace wording with and without a goal ==='); if(bad.length){ failures++; bad.forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 150 lower body: Full or Shorter is offered only in build weeks; the peak-week session is
// already the short one and its chip claimed 40 min against a 28-min header
{
  const mk = () => [{date:'2026-10-11', dow:0, type:'easy', km:8, strength:true, strengthFocus:'lower', daysToRace:40}];
  const build = mk(); g.refreshStrengthWorkouts(build, 'build', 2, {});
  const buildShort = mk(); g.refreshStrengthWorkouts(buildShort, 'build', 2, {shortDates:new Set(['2026-10-11'])});
  const peak = mk(); g.refreshStrengthWorkouts(peak, 'peak', 9, {shortDates:new Set(['2026-10-11'])});
  const bad=[];
  if(!(build[0].strengthShortable && !build[0].strengthShort && build[0].strengthTimeMin===40)) bad.push('build-week lower session is not shortable at 40 min: '+build[0].strengthTimeMin);
  if(!(buildShort[0].strengthShort && buildShort[0].strengthTimeMin===25)) bad.push('build-week shorter session is not 25 min');
  if(peak[0].strengthFocus==='lower' && (peak[0].strengthShortable || peak[0].strengthShort)) bad.push('peak-week lower session still offers Full/Shorter ('+peak[0].strengthTimeMin+' min)');
  console.log('\n=== lower session full vs shorter ==='); if(bad.length){ failures++; bad.forEach(b=>console.log('  FAIL: '+b)); } else console.log('  ok');
}
// 149 the run count the plan promised is held in every training week (race week may differ)
const promisedRunsHeld = (p) => p.weeks.filter(w=>!w.days.some(d=>d.type==='race') && !w.beginnerStructure && w.runsPerWeek < p.runsWeekOne).map(w=>`w${w.weekIndex+1} has ${w.runsPerWeek} run days, plan promised ${p.runsWeekOne}`);
check('10k, 20 mpw, 5 runs, skip base, train through (reported: weeks with 4 runs)', {race:'10k', mpw:20, weeks:4, recentSec:23*60+15, runs:5, longest:10, skipBase:true, taperMode:'none', longDow:6, raceDow:6}, (p)=>promisedRunsHeld(p));
check('Half, 3 strength/wk, long Saturday', {race:'half', mpw:30, weeks:12, recentSec:23*60, strength:3, longDow:6});
check('5k, 1 strength, skip base', {race:'5k', mpw:30, weeks:8, recentSec:21*60, strength:1, skipBase:true});
check('10k, 24 mpw, long Friday (reported: thin cruise session)', {race:'10k', mpw:24, weeks:10, recentSec:23*60, longDow:5}, (p)=>{
  const bad=[]; p.weeks.forEach(w=>{ if(w.phase==='taper'||w.isCutback) return; w.days.forEach(d=>{ if(d.type==='cruise'||d.type==='tempo'){ const min=g.minutesForKm(d.qualityKm, w.paces.tempoPerKm); if(min<g.floorMinutesFor('tempo', w.plannedKm||40)*0.9) bad.push(`w${w.weekIndex+1} ${d.type} ${min.toFixed(0)} min`); } }); }); return bad; });
check('10k, 50 mpw (trims toward what a 10k needs)', {race:'10k', mpw:50, weeks:12, recentSec:19*60, longest:12}, (p,s)=>{ const settled=Math.max(...p.weeks.filter(w=>w.weekIndex>=4 && w.phase!=='taper').map(w=>w.plannedKm||0)); return settled <= s.currentWeeklyKm*0.92 ? [] : [`expected a ~10% trim after the first weeks, settled at ${mi(settled)} vs current ${mi(s.currentWeeklyKm)}`]; });
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

// a plan made mid-week starts on that day: the earlier days of week one are blank, hold no
// sessions, earn no credit, and the week is judged by what remains
console.log('\n=== mid-week start: a Thursday 10K plan ===');
{
  let thu = g.todayDate(); while(thu.getDay()!==4) thu = g.addDays(thu, 1);
  const s = {units:'mi', raceKey:'10k', raceDistanceKm:10, raceDate:g.fmtDate(g.addDays(thu, 60)), currentWeeklyKm:20*MI, recentDistanceKm:5, recentTimeSec:23*60+15, longDow:6, weekStartDow:0, ...g.deriveScheduleFromLongDow(6,3), runsPerWeek:5, strengthPerWeek:3, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'hilly', skipBase:false, taperMode:'full', equipment:g.DEFAULT_EQUIPMENT.slice(), planStartDate:g.fmtDate(thu)};
  const p = g.generatePlan(s); const w0 = p.weeks[0];
  const viol = [];
  if(p.startDate!==g.fmtDate(thu)) viol.push('startDate '+p.startDate);
  if(!w0.partialStart) viol.push('week 1 not marked partial');
  w0.days.forEach(d=>{ const before = g.parseDate(d.date) < thu; if(before && (d.km>0 || d.strength || !d.beforeStart)) viol.push('day before start not blank: '+d.date); if(!before && d.beforeStart) viol.push('day on/after start blanked: '+d.date); });
  if(Math.abs(w0.targetKm - w0.days.reduce((a,d)=>a+d.km,0))>0.05) viol.push('week 1 target not the remaining days');
  const f = g.projectFitness(p, [], thu, {trackingStart:g.fmtDate(thu)}); if(f.sessionsDone>0 || f.earnedGain>0) viol.push('credit earned for blank days');
  const v = g.validatePlan(p, s); if(v.length) viol.push('validator: '+v.join('; '));
  if(viol.length){ failures++; console.log('  FAIL:'); viol.forEach(x=>console.log('   - '+x)); } else console.log('  ok');
}

// easing a week after a light one: easy and long runs shrink toward the target, the key
// session is kept as written, a second session becomes easy only when the cut is deep
console.log('\n=== eased week ===');
{
  const s = {units:'mi', raceKey:'10k', raceDistanceKm:10, raceDate:g.fmtDate(g.addDays(g.todayDate(), 70)), currentWeeklyKm:25*MI, recentDistanceKm:5, recentTimeSec:23*60+15, longDow:6, weekStartDow:0, ...g.deriveScheduleFromLongDow(6,2), runsPerWeek:5, strengthPerWeek:2, longRunEmphasis:'balanced', speedEmphasis:'high', hillsMode:'flat', skipBase:true, taperMode:'full', equipment:g.DEFAULT_EQUIPMENT.slice()};
  const p = g.generatePlan(s); const viol = [];
  const wi = p.weeks.findIndex(w=>w.days.filter(d=>g.QUALITY_TYPES.includes(d.type) && d.type!=='long' && !d.easyVariety).length>=2);
  if(wi<0) viol.push('no two-session week to test');
  else {
    const before = JSON.parse(JSON.stringify(p.weeks[wi]));
    const key = before.days.find(d=>g.QUALITY_TYPES.includes(d.type) && d.type!=='long' && !d.easyVariety && !d.secondary);
    const w = g.easeWeek(p, wi, before.targetKm*0.65);
    if(!w || !w.eased) viol.push('week not eased');
    else {
      if(w.targetKm >= before.targetKm) viol.push('target did not fall');
      const keyAfter = w.days.find(d=>d.date===key.date);
      if(!keyAfter || keyAfter.type!==key.type || Math.abs(keyAfter.km-key.km)>0.05) viol.push('key session changed');
      if(w.days.some(d=>d.km>0 && d.km<3)) viol.push('a run under 3 km');
      const secondAfter = w.days.filter(d=>g.QUALITY_TYPES.includes(d.type) && d.type!=='long' && !d.easyVariety).length;
      if(secondAfter!==1) viol.push('deep cut should leave one session, left '+secondAfter);
      if(Math.abs(w.plannedKm - before.plannedKm)>0.01) viol.push('nominal volume changed');
    }
  }
  if(viol.length){ failures++; console.log('  FAIL:'); viol.forEach(x=>console.log('   - '+x)); } else console.log('  ok');
}

// prediction sanity
console.log('\n=== prediction table (5k -> others), 30 mpw, longest run 10 mi ===');
[[18],[20],[22],[25],[28],[32]].forEach(([m])=>{
  const a = {races:[{km:5, sec:m*60}], weeklyKm:30*MI, longestKm:10*MI};
  const r = k => g.predictRace(a, k);
  console.log(`  5k ${m}:00 -> 10k ${g.secToClock(r(10).sec)}  half ${g.secToClock(r(21.0975).sec)} (${g.secToClock(r(21.0975).lowSec)}–${g.secToClock(r(21.0975).highSec)})  marathon ${g.secToClock(r(42.195).sec)} (${g.secToClock(r(42.195).lowSec)}–${g.secToClock(r(42.195).highSec)})  | VDOT-only marathon ${g.secToClock(g.predictedTimeMinFromVdot(g.vdotFromRace(5,m*60),42.195)*60)}`);
});
console.log(`\n${failures ? failures+' scenario(s) FAILED' : 'all scenarios passed'}`);
process.exit(failures ? 1 : 0);
