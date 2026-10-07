// Run: node tests/monte-carlo.js [count] [seed] [--show N]
// Builds hundreds of random runner profiles (race, mileage, fitness, run days, strength
// days, long-run day, week start, race weekday, emphasis, hills, caps, taper mode, units)
// and checks every rendered day of every plan against a sanity ruleset: text is complete
// and carries the right paces, sessions are the right size, strength lands where it
// should, hard days are spaced, weeks add up. Exit code 1 on any violation.
const g = require('../engine.js');
const { loadPageRenderers } = require('./render-helpers.js');
const ui = loadPageRenderers();
const MI = g.KM_PER_MI;
const args = process.argv.slice(2);
const COUNT = Number(args.find(a=>/^\d+$/.test(a))||300);
const SEED = Number(args.filter(a=>/^\d+$/.test(a))[1]||20261007);
const SHOW = args.includes('--show') ? Number(args[args.indexOf('--show')+1]||2) : 0;
const ONLY = args.includes('--only') ? String(args[args.indexOf('--only')+1]) : null;

function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = arr => arr[Math.floor(rnd()*arr.length)];
const between = (a,b) => a + rnd()*(b-a);
const intBetween = (a,b) => Math.floor(between(a, b+1));
const RACES = [{key:'5k',km:5},{key:'10k',km:10},{key:'15k',km:15},{key:'10mi',km:10*MI},{key:'half',km:21.0975},{key:'20mi',km:20*MI},{key:'marathon',km:42.195}];

function randomSetup(i){
  const race = pick(RACES);
  const mpw = Math.round(between(10, 70));
  const vdot = between(28, 60);
  const recent = pick([{km:5},{km:10},{km:21.0975}]);
  const recentSec = Math.round(g.predictedTimeMinFromVdot(vdot, recent.km)*60*between(0.98,1.04));
  const hasRecent = rnd() < 0.9;
  const second = rnd()<0.3 ? pick([{km:5},{km:10},{km:21.0975}].filter(r=>Math.abs(r.km-recent.km)>1)) : null;
  const weeks = intBetween(4, 30);
  const runs = Math.max(mpw>50 ? 4 : 3, intBetween(3, 6));
  const longDow = intBetween(0,6);
  const strength = intBetween(0,3);
  const weekStartDow = pick([0,1]);
  const raceDow = intBetween(0,6);
  const longest = rnd()<0.6 ? Math.round(mpw*between(0.2,0.42)) : null;
  const goalMode = pick(['none','none','realistic','ambitious']);
  const taperMode = pick(['full','full','light','none']);
  const units = pick(['mi','km']);
  let raceDate = g.addDays(g.todayDate(), weeks*7); while(raceDate.getDay()!==raceDow) raceDate = g.addDays(raceDate,1);
  const sched = g.deriveScheduleFromLongDow(longDow, strength);
  const setup = {
    units, raceKey:race.key, raceDistanceKm:race.km, raceDate:g.fmtDate(raceDate),
    currentWeeklyKm: mpw*MI,
    recentDistanceKm: hasRecent ? recent.km : null, recentTimeSec: hasRecent ? recentSec : null,
    recent2DistanceKm: (hasRecent && second) ? second.km : null, recent2TimeSec: (hasRecent && second) ? Math.round(g.predictedTimeMinFromVdot(vdot, second.km)*60*between(0.97,1.05)) : null,
    longestRecentRunKm: longest ? longest*MI : null,
    goalTimeSec: null,
    longDow, weekStartDow, ...sched, runsPerWeek: runs, strengthPerWeek: strength,
    maxLongRunKm: (race.km>=21 && rnd()<0.2) ? Math.round(between(14,20))*MI : null,
    maxWeeklyKm: (race.km>=21 && rnd()<0.2) ? Math.round(mpw*between(1.0,1.3))*MI : null,
    longRunEmphasis: pick(['low','balanced','balanced','high']), speedEmphasis: pick(['low','balanced','balanced','high']),
    hillsMode: rnd()<0.25 ? 'hilly' : 'flat', skipBase: rnd()<0.2, taperMode, buildPace: rnd()<0.3 ? 'faster' : 'standard',
    equipment: (()=>{ const r=rnd(); if(r<0.3) return g.DEFAULT_EQUIPMENT.slice(); if(r<0.36) return []; if(r<0.5) return ['dumbbells','bench']; return g.EQUIPMENT.map(e=>e.id).filter(()=>rnd()<0.55); })(),
  };
  if(hasRecent && goalMode!=='none'){
    const pred = g.predictRace({races:[{km:recent.km, sec:recentSec}], weeklyKm:mpw*MI, longestKm: longest?longest*MI:null}, race.km);
    setup.goalTimeSec = Math.round(goalMode==='realistic' ? pred.sec*between(0.99,1.03) : pred.lowSec*between(0.9,0.97));
  }
  return {setup, meta:{i, race:race.key, mpw, vdot:vdot.toFixed(1), weeks, runs, strength, longDow, weekStartDow, raceDow, taperMode, units, goalMode, skipBase:setup.skipBase, hilly:setup.hillsMode==='hilly'}};
}

const HARD_TYPES = ['tempo','cruise','intervals','overunder','racepace','reps','hills'];
function sanityCheck(plan, setup){
  const v = [];
  const unit = setup.units||'mi';
  const isRace = plan.raceDistanceKm!=null;
  const mode = plan.taperMode||'full';
  const cutoff = mode==='none' ? 1 : mode==='light' ? 5 : 10;
  const paceOf = sec => g.paceStr(sec, unit);
  const push = (rule, detail) => v.push({rule, detail});
  // 70 one note per cause
  if((plan.warnings||[]).filter(x=>/doesn't fit/.test(x)).length>1) push('dup-notes', (plan.warnings||[]).filter(x=>/doesn't fit/.test(x)).join(' | ').slice(0,160));
  plan.weeks.forEach(w=>{
    const p = w.paces; const wk = `w${w.weekIndex+1}`;
    if(!(p.easyPerKm > p.tempoPerKm && p.tempoPerKm > p.intervalPerKm && p.intervalPerKm > p.repPerKm)) push('pace-order', wk);
    if(p.marathonPerKm!=null && !(p.marathonPerKm > p.tempoPerKm && p.marathonPerKm <= p.easyPerKm+1)) push('m-pace-order', `${wk} M ${paceOf(p.marathonPerKm)} T ${paceOf(p.tempoPerKm)} E ${paceOf(p.easyPerKm)}`);
    const strengthDays = w.days.filter(d=>d.strength);
    const sigs = strengthDays.map(d=>(d.strengthExercises||[]).join('|'));
    if(new Set(sigs).size !== sigs.length) push('strength-duplicate', wk);
    const wantStrength = setup.strengthPerWeek==null ? 2 : setup.strengthPerWeek;
    if(strengthDays.length > wantStrength) push('strength-count', `${wk} ${strengthDays.length} > ${wantStrength}`);
    if(wantStrength>0 && strengthDays.length===0 && w.days.every(d=>d.daysToRace==null || d.daysToRace>cutoff+1) && w.phase!=='recovery') push('strength-missing', wk);
    const long = w.days.find(d=>d.type==='long');
    const easies = w.days.filter(d=>d.type==='easy' && d.label!=='Shakeout Jog');
    const inWindow = d => d.daysToRace!=null && d.daysToRace<=Math.max(2, plan.taperDays||0); // days inside the taper window are reduced on purpose
    const rec = easies.find(d=>d.easyRole==='recovery' && !inWindow(d));
    if(rec && !w.days.some(x=>x.type==='race') && easies.some(e=>e!==rec && !inWindow(e) && e.km < rec.km-1.0)) push('recovery-not-shortest', `${wk} recovery ${rec.km} vs ${easies.map(e=>e.km).join('/')}`);
    // 74 two days out is a run when tapering (shakeout), never a rest day
    if(plan.taperMode && plan.taperMode!=='none'){ const d2 = w.days.find(x=>x.daysToRace===2); if(d2 && !(d2.km>0)) push('shakeout', `${wk} two days out is ${d2.label}`); }
    w.days.forEach((d,i)=>{
      const next = w.days[(i+1)%7];
      const parts = ui.workoutPartsFor(d, p, unit, 'pace'); const text = parts.join(' | '); const sum = ui.daySummaryText(d, p, unit, 'pace');
      if(/\{pace\}|\{easy\}|undefined|NaN|@ —|null/.test(text+' '+sum)) push('bad-text', `${wk} ${d.label}: ${text} || ${sum}`);
      // Every pace figure must sit next to the words of its own zone: the easy pace may not
      // follow "tempo", "threshold", "hard", "race pace", "interval" or "5K effort", and a
      // tempo/interval pace may not follow "easy", "jog", "recovery" or "conversational".
      // (The first defect the owner ever found, and the one that came back on progression runs.)
      {
        const zoneOf = s => { const e = paceOf(p.easyPerKm), t = p.tempoPerKm!=null && paceOf(p.tempoPerKm), i = p.intervalPerKm!=null && paceOf(p.intervalPerKm), r = p.repPerKm!=null && paceOf(p.repPerKm), m = p.marathonPerKm!=null && paceOf(p.marathonPerKm), rc = p.racePerKm!=null && paceOf(p.racePerKm), l = p.longPerKm!=null && paceOf(p.longPerKm); const easyZ = (s===e || s===l), hardZ = (s===t || s===i || s===r || s===m || s===rc); if(easyZ && hardZ) return 'ambiguous'; return s===e ? 'easy' : s===l ? 'easy' : s===t ? 'tempo' : s===i ? 'interval' : s===r ? 'rep' : s===m ? 'marathon' : s===rc ? 'race' : 'other'; };
        [...parts, sum].forEach(line=>{
          const re = /(\d{1,2}:\d{2}\/(?:mi|km))/g; let m;
          while((m = re.exec(line))){
            const zone = zoneOf(m[1]); const before = line.slice(Math.max(0, m.index-45), m.index).toLowerCase();
            const hardWords = /tempo|threshold|comfortably hard|race pace|marathon pace|interval|5k effort|\bi pace|fast and relaxed|strong/;
            const easyWords = /easy|jog|recovery|conversational|relaxed start|walk/;
            const tail = before.replace(/.*[,;(—]/, ''); // the clause the pace is attached to
            if(zone==='easy' && hardWords.test(tail) && !easyWords.test(tail)) push('pace-context', `${wk} ${d.label}: easy pace after "${tail.trim().slice(-30)}" — ${line}`);
            if((zone==='tempo' || zone==='interval' || zone==='rep') && easyWords.test(tail) && !hardWords.test(tail)) push('pace-context', `${wk} ${d.label}: ${zone} pace after "${tail.trim().slice(-30)}" — ${line}`);
          }
        });
      }
      if(d.type!=='rest' && d.km>0 && (!text.trim() || !sum.trim())) push('empty-text', `${wk} ${d.label}`);
      const raceWeek = w.days.some(x=>x.type==='race');
      if(d.km>0 && (d.type==='easy'||d.type==='long') && d.label!=='Shakeout Jog' && w.phase!=='taper' && !raceWeek && g.minutesForKm(d.km, p.easyPerKm) < (w.phase==='recovery' ? 19 : w.beginnerStructure ? 21 : 24) && !(d.daysToRace!=null && d.daysToRace<=Math.max(2, plan.taperDays||0))) push('tiny-run', `${wk} ${d.label} ${d.km} km (${g.minutesForKm(d.km,p.easyPerKm).toFixed(0)} min)`);
      if(d.type==='easy' && (!d.paceKey || p[d.paceKey]==null || !text.includes(paceOf(p.easyPerKm)))) push('easy-pace-missing', `${wk} ${d.label}: ${text}`);
      if(HARD_TYPES.includes(d.type)){
        const key = d.paceKey; const ps = key && p[key]!=null ? paceOf(p[key]) : null;
        if(d.type!=='hills' && ps && !text.includes(ps)) push('pace-missing', `${wk} ${d.label}: ${text}`);
        if(d.type!=='hills' && !ps) push('pace-key-missing', `${wk} ${d.label}`);
        const work = d.qualityKm||0; const block = Math.max(0, d.km-(d.warmupKm||0)-(d.cooldownKm||0));
        const workPace = (key && p[key]) || p.tempoPerKm;
        const min = ((d.warmupKm||0)+(d.cooldownKm||0)+Math.max(0,block-work))*p.easyPerKm/60 + work*workPace/60;
        if(min>(d.type==='racepace'?100:95)) push('quality-too-long', `${wk} ${d.label} ${min.toFixed(0)} min`);
        if(min<Math.min(20, 8+(w.plannedKm||40)*0.3) && !d.secondary) push('quality-too-short', `${wk} ${d.label} ${min.toFixed(0)} min: ${text}`);
        if(!(d.warmupKm>=1)) push('no-warmup', `${wk} ${d.label}`);
        if(long && long.km>0 && d.km>=long.km && w.phase!=='taper' && (w.plannedKm||99)>=28) push('quality-longer-than-long', `${wk} ${d.label} ${d.km} vs long ${long.km}`);
        const m = text.match(/(\d+) × (\d+)m/);
        if(m){ const reps=+m[1]; if(d.type==='intervals' && (reps<4||reps>7)) push('reps-count', `${wk} ${text}`); if(d.type==='cruise' && (reps<3||reps>6)) push('reps-count', `${wk} ${text}`); if(d.type==='reps' && (reps<6||reps>12)) push('reps-count', `${wk} ${text}`); }
        if(d.type==='hills'){ const hm = text.match(/(\d+) hill reps/); if(!hm || +hm[1]<6 || +hm[1]>10) push('hill-reps', `${wk} ${text}`); }
        if(d.type==='overunder'){ const om = text.match(/(\d+) × \(2 min/); if(!om || +om[1]<4 || +om[1]>8) push('overunder-cycles', `${wk} ${text}`); }
      }
      if(d.type==='long'){
        const lmin = d.km*p.longPerKm/60;
        if(lmin > (plan.longTimeCapMin||150)+5) push('long-too-long', `${wk} ${lmin.toFixed(0)} min (cap ${plan.longTimeCapMin||150})`);
        if(d.racePaceKm>0.5 && !text.includes(paceOf(p.racePerKm))) push('long-rp-pace-missing', `${wk}: ${text}`);
        if(!text.includes(paceOf(p.longPerKm)) && !text.includes(paceOf(p.easyPerKm))) push('long-pace-missing', `${wk}: ${text}`);
      }
      // 66 printed rep time matches rep distance × printed pace (±15 s)
      if(d.type==='intervals'){ const rm = text.match(/(\d+) × (\d+)m at ([\d:]+)\/(km|mi) \(about (\d+):(\d\d) each\)/); if(!rm) push('rep-time', `${wk} ${text}`); else { const perUnit = Number(rm[3].split(':')[0])*60+Number(rm[3].split(':')[1]); const perKm = rm[4]==='mi' ? perUnit/MI : perUnit; const want = perKm*Number(rm[2])/1000; const got = Number(rm[5])*60+Number(rm[6]); if(Math.abs(want-got)>15) push('rep-time', `${wk} ${text} (expected ${Math.round(want)}s)`); } }
      // 67 strength lines are readable
      (d.strengthExercises||[]).forEach(x=>{ if(/×1 /.test(x) || /undefined|NaN/.test(x)) push('strength-text', `${wk} ${x}`); });
      // 68 recovery label only on a short run that is the shortest easy run of the week
      if(d.type==='easy' && d.easyRole==='recovery' && d.label!=='Shakeout Jog'){ const mins = g.minutesForKm(d.km, p.easyPerKm); const others = w.days.filter(x=>x!==d && x.type==='easy' && !x.easyVariety && x.easyRole!=='aerobic' && x.label!=='Shakeout Jog' && !(x.daysToRace!=null && x.daysToRace<=2) && x.km>0).map(x=>x.km); if(mins>46 || (others.length && d.km > Math.min(...others)+0.05)) push('recovery-label', `${wk} ${d.label} ${d.km} km (${mins.toFixed(0)} min) vs easy ${others.join('/')}`); }
      if(d.label==='Shakeout Jog' && !(d.daysToRace===2 || (mode==='none' && d.daysToRace===1))) push('shakeout-misplaced', `${wk} d=${d.daysToRace}`);
      if(d.strides && d.easyRole==='recovery' && d.label!=='Shakeout Jog') push('strides-on-recovery', wk);
      if(d.easyVariety && d.type==='fartlek' && !/pickups/.test(d.descBase||'')) push('base-fartlek-hard', wk);
      if(d.strength){
        if(d.type==='race' || next.type==='race') push('strength-race-adjacent', wk);
        if(d.daysToRace!=null && d.daysToRace>=0 && d.daysToRace<=cutoff) push('strength-cutoff', `${wk} d=${d.daysToRace} mode=${mode}`);
        if(d.strengthFocus==='lower'){
          if(d.type==='rest') push('lower-on-rest', wk);
          if(d.type==='long') push('lower-on-long', wk);
          if(g.isLegDemandingDay(next) || next.type==='race') push('lower-before-hard', `${wk} ${d.label} -> ${next.label}`);
          if(g.isLegDemandingDay(d) && !d.strengthAfterRun) push('lower-on-hard-not-after-run', wk);
          if(d.strengthExpress) push('express-retired', wk);
          if(d.strengthTimeMin < 28 && !/taper|peak/.test(w.phase) && !(d.daysToRace!=null && d.daysToRace<=21)) push('lower-too-short', `${wk} ${d.strengthTimeMin} min`);
        }
        if(d.strengthFocus==='upper' && d.type==='long') push('upper-on-long', wk);
        if(!d.strengthExercises || d.strengthExercises.length<3) push('strength-empty', wk);
        // every listed exercise must be resolvable with the runner's equipment, and explained unless its variant says it needs no how-to
        const avail = g.equipmentSet(setup.equipment);
        const resolvable = new Map();
        Object.values(g.STRENGTH_EXERCISES).concat(Object.values(g.OPTIONAL_EXTRAS)).forEach(def=>{ const r=g.resolveExercise(def, avail); if(r) resolvable.set(r.name, r); });
        (d.strengthExercises||[]).forEach(line=>{ const m=line.match(/^\d+×\S+ (.+?) (each (side|way|hand) )?\(/); const nm=m?m[1].trim():''; if(!nm) return; const r=resolvable.get(nm); if(!r) push('strength-equipment', `${wk} ${nm} not available with [${[...avail].join(',')}]`); else if(r.how && !(d.strengthHowTo||[]).some(x=>x.name===nm)) push('strength-howto', `${wk} no how-to for ${nm}`); });
        (d.strengthOptional||[]).forEach(line=>{ const m=line.match(/^\d+×\S+ (.+?) \(/); const nm=m?m[1].trim():''; if(nm && !resolvable.has(nm)) push('strength-equipment', `${wk} optional ${nm} not available`); });
        if(!d.strengthTimeMin) push('strength-time', wk);
        if(d.type==='rest' && !/strength/i.test(text)) push('rest-strength-text', `${wk}: ${text}`);
      }
    });
    const hard = w.days.filter(d=>g.isLegDemandingDay(d));
    for(let a=0;a<hard.length;a++) for(let b=a+1;b<hard.length;b++) if(g.circularDayDist(hard[a].dow,hard[b].dow)<2) push('hard-adjacent', `${wk} ${hard[a].label}/${hard[b].label}`);
    const lowers = w.days.filter(d=>d.strength && d.strengthFocus==='lower');
    for(let a=0;a<lowers.length;a++) for(let b=a+1;b<lowers.length;b++) if(g.circularDayDist(lowers[a].dow,lowers[b].dow)<2) push('lower-adjacent', wk);
    if(w.plannedKm && w.phase!=='taper' && isRace){
      const tot = w.days.reduce((a,d)=>a+(d.type==='race'?0:d.km),0);
      const few = (plan.warnings||[]).some(x=>/running days/.test(x));
      if(!few && w.days.every(d=>d.daysToRace==null||d.daysToRace>2) && Math.abs(tot-w.plannedKm) > Math.max(1.5, w.plannedKm*0.08)) push('week-total-off', `${wk} ${tot.toFixed(1)} vs planned ${w.plannedKm}`);
    }
    const nomOf = x => x.nominalKm||x.plannedKm; if(w.isCutback && !w.beginnerStructure && w.weekIndex>0 && nomOf(plan.weeks[w.weekIndex-1]) && nomOf(w) >= nomOf(plan.weeks[w.weekIndex-1])) push('cutback-not-lower', wk);
    const runDays = w.days.filter(d=>d.km>0 && d.type!=='race').length;
    const expectRuns = plan.runsPerWeek || setup.runsPerWeek;
    // Fewer run days than asked is only a defect when the week's volume could have filled them (~4.5 km each).
    const fixedKm = w.days.filter(d=>d.type==='long' || HARD_TYPES.includes(d.type)).reduce((a,d)=>a+d.km,0); const fixedDays = w.days.filter(d=>d.type==='long' || HARD_TYPES.includes(d.type)).length;
    const minEasy = g.kmForMinutes(30, w.paces.easyPerKm); // Daniels: 30-minute easy runs, the engine's own standard
    const stridesKm = w.days.filter(d=>d.strides).length*0.4;
    const supportable = w.plannedKm ? Math.min(expectRuns, Math.max(2, fixedDays + Math.floor(Math.max(0, w.plannedKm-fixedKm-stridesKm)/minEasy))) : expectRuns;
    if(isRace && w.phase!=='taper' && (w.daysToRaceAtStart==null || w.daysToRaceAtStart>7) && (runDays>expectRuns || runDays<supportable)) push('run-days', `${wk} ${runDays} vs ${expectRuns} (supportable ${supportable})`);
  });
  if(isRace){
    const all = plan.weeks.flatMap(w=>w.days);
    if(!all.find(d=>d.type==='race')) push('no-race-day', '');
    const dayBefore = all.find(d=>d.daysToRace===1); if(dayBefore && g.isLegDemandingDay(dayBefore)) push('hard-day-before-race', dayBefore.label);
    if(mode==='none' && plan.weeks.some(w=>w.phase==='taper')) push('taper-when-none', '');
    if(mode!=='none' && plan.totalWeeks>3 && !plan.weeks.some(w=>w.phase==='taper')) push('no-taper', '');
    if(!plan.warnings) push('no-warnings-array', '');
  }
  return v;
}

const byRule = {}; let failedPlans = 0; let shown = 0;
const record = (meta, list) => { if(!list.length) return; failedPlans++; list.forEach(x=>{ if(x.rule==='invariant') x.rule = 'invariant: '+x.detail.replace(/^w\d+ /,'').replace(/[\d.]+/g,'#').slice(0,48); byRule[x.rule] = byRule[x.rule]||{count:0, examples:[]}; byRule[x.rule].count++; if(byRule[x.rule].examples.length<4) byRule[x.rule].examples.push(`[#${meta.i} ${meta.race} ${meta.mpw}mpw runs${meta.runs} str${meta.strength} long${meta.longDow} ws${meta.weekStartDow} race${meta.raceDow} ${meta.taperMode} ${meta.units}${meta.hilly?' hilly':''}${meta.skipBase?' skipBase':''} goal:${meta.goalMode}] ${x.detail}`); }); };

for(let i=0;i<COUNT;i++){
  const {setup, meta} = randomSetup(i);
  let plan;
  try{ plan = g.generatePlan(setup); }
  catch(e){ record(meta, [{rule:'THROWS', detail:String(e.stack||e).split('\n').slice(0,2).join(' ')}]); continue; }
  const list = g.validatePlan(plan, setup).map(d=>({rule:'invariant', detail:d})).concat(sanityCheck(plan, setup));
  record(meta, list);
  if(ONLY===String(i)){ console.log(JSON.stringify(meta)); console.log(JSON.stringify(setup)); plan.weeks.forEach(w=>{ console.log(`-- week ${w.weekIndex+1} ${w.phase}${w.isCutback?' cb':''} planned ${w.plannedKm} target ${w.targetKm}  E ${g.paceStr(w.paces.easyPerKm,'km')} T ${g.paceStr(w.paces.tempoPerKm,'km')} L ${g.paceStr(w.paces.longPerKm,'km')}`); w.days.forEach(d=>console.log(`  ${['Su','Mo','Tu','We','Th','Fr','Sa'][d.dow]} ${d.label.padEnd(16)} ${d.km.toFixed(1).padStart(5)} km d${d.daysToRace}  ${ui.workoutPartsFor(d, w.paces, setup.units, 'pace').join(' | ')}${d.strength?'  [+'+d.strengthFocus+(d.strengthAfterRun?'/after run':'')+']':''}`)); }); list.forEach(x=>console.log('  !! '+x.rule+' '+x.detail)); }
  if(SHOW && shown<SHOW && !list.length){ shown++; console.log(`\n### sample plan #${i} ${JSON.stringify(meta)}`); plan.weeks.slice(0,2).concat(plan.weeks.slice(-2)).forEach(w=>{ console.log(`-- week ${w.weekIndex+1} ${w.phase}`); w.days.forEach(d=>console.log(`  ${['Su','Mo','Tu','We','Th','Fr','Sa'][d.dow]} ${d.label.padEnd(16)} ${d.km?d.km.toFixed(1).padStart(5)+' km':'        '} ${ui.daySummaryText(d, w.paces, setup.units, 'pace')}${d.strength?'  [+strength '+d.strengthFocus+(d.strengthAfterRun?'/after run':'')+']':''}`)); }); }
}
// general plans
const kinds = ['speed','distance','maintenance','recovery'];
for(let i=0;i<Math.round(COUNT/5);i++){
  const kind = pick(kinds); const mpw = Math.round(between(10,60)); const runs = Math.max(mpw>50?4:3, intBetween(3,6)); const strength = intBetween(0,3);
  const setup = {planKind:kind, units:pick(['mi','km']), weeks: kind==='recovery'?intBetween(1,6):intBetween(4,16), currentWeeklyKm:mpw*MI, recentDistanceKm:5, recentTimeSec:Math.round(g.predictedTimeMinFromVdot(between(28,58),5)*60), longDow:intBetween(0,6), weekStartDow:pick([0,1]), ...g.deriveScheduleFromLongDow(0, strength), runsPerWeek:runs, strengthPerWeek:strength, distanceGoalMetric:pick(['weekly','longest']), distanceGoalCurrentKm:mpw*MI, distanceGoalTargetKm:mpw*MI*between(1.1,1.6)};
  if(setup.distanceGoalMetric==='longest'){ setup.distanceGoalCurrentKm = mpw*MI*0.28; setup.distanceGoalTargetKm = setup.distanceGoalCurrentKm*between(1.2,1.8); }
  const meta = {i:'g'+i, race:kind, mpw, runs, strength, longDow:setup.longDow, weekStartDow:setup.weekStartDow, raceDow:'-', taperMode:'-', units:setup.units, goalMode:'-'};
  let plan; try{ plan = g.generateGeneralPlan(setup); } catch(e){ record(meta, [{rule:'THROWS', detail:String(e.stack||e).split('\n').slice(0,2).join(' ')}]); continue; }
  record(meta, g.validatePlan(plan, setup).map(d=>({rule:'invariant', detail:d})).concat(sanityCheck(plan, setup)));
  if(ONLY===meta.i){ console.log(JSON.stringify(meta)); console.log(JSON.stringify(setup)); plan.weeks.forEach(w=>{ console.log(`-- week ${w.weekIndex+1} ${w.phase}${w.isCutback?' cb':''} planned ${w.plannedKm} target ${w.targetKm} runs ${w.runsPerWeek}`); w.days.forEach(d=>console.log(`  ${['Su','Mo','Tu','We','Th','Fr','Sa'][d.dow]} ${d.label.padEnd(16)} ${d.km.toFixed(1).padStart(5)} km  ${ui.daySummaryText(d, w.paces, setup.units, 'pace')}`)); }); (plan.warnings||[]).forEach(x=>console.log('NOTE '+x)); }
}

const rules = Object.keys(byRule).sort((a,b)=>byRule[b].count-byRule[a].count);
console.log(`\nMonte Carlo: ${COUNT} race plans + ${Math.round(COUNT/5)} general plans, seed ${SEED}: ${failedPlans} plan(s) with findings, ${rules.length} rule(s) tripped`);
rules.forEach(r=>{ console.log(`\n${r}: ${byRule[r].count}`); byRule[r].examples.forEach(e=>console.log('   '+e)); });
process.exit(rules.length ? 1 : 0);
