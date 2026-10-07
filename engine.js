/* =====================================================================================
   LongRun planning engine (v2)

   Pure, DOM-free training-plan generation. Loaded by index.html as a classic script (every
   public name lands on window) and by tests/ as a CommonJS module.

   Design: an athlete model (current volume, fitness from a race result, longest recent run)
   feeds a periodization layer (volume ramp, long-run ramp, phases, taper by days-before-race)
   which feeds a workout layer (every quality session sized by TIME at its pace and capped by
   a share of the week), then a strength layer, then a validation layer (validatePlan) that
   asserts the coaching rules on the finished plan. Output shape is the plan/week/day object
   graph the UI already renders.

   Sources, by section (all recreational-runner defaults, not elite):
   - Fitness & paces: Daniels, "Daniels' Running Formula" (VDOT equations; E/M/T/I/R zones;
     T <= 10% of weekly volume, I <= lesser of 8% or 10 km, R <= 5%; long run = lesser of
     ~25-30% of weekly volume or 150 min; strides on easy days; ~1 VDOT per 6 weeks).
   - Race-time equivalence: Vickers & Vertosick 2016, BMC Sports Sci Med Rehabil 8:26
     (Riegel k=1.07 well calibrated to the half; marathon models with weekly mileage,
     coefficients in their Additional file 1). Tanda 2011 as a marathon cross-check.
   - Periodization & long runs: Pfitzinger & Douglas, "Advanced Marathoning" / "Faster Road
     Racing" (3:1 build/recovery weeks, medium-long runs, marathon-pace long runs, LT runs
     of 20-40 min).
   - Intensity distribution: Seiler (~80% of sessions easy); Hudson/Lydiard for base.
   - Taper: Bosquet et al. 2007 meta-analysis (2-3 weeks, volume -41..-60%, keep intensity
     and frequency), Mujika & Padilla 2003.
   - Strength: Blagrove et al. 2018 (meta-analysis), Beattie et al. 2014, Rønnestad & Mujika
     2014, Balsalobre-Fernández et al. 2016: heavy resistance (>=80% 1RM equivalent, 2-4 sets
     of 3-6) plus plyometrics, 2-3x/week for >=6-8 weeks improves running economy; reduce in
     the final 1-2 weeks; avoid heavy legs the day before a key run (Doma & Deakin).
   ===================================================================================== */
(function(root, factory){
  const api = factory();
  if(typeof module==='object' && module.exports){ module.exports = api; }
  else { Object.keys(api).forEach(k=>{ root[k] = api[k]; }); }
})(typeof window!=='undefined' ? window : this, function(){
'use strict';

/* ============================= constants & utils ============================= */
const KM_PER_MI = 1.609344;
const ENGINE_VERSION = 11; // bump whenever a rule change should rebuild saved plans on next load

function pad2(n){ return String(n).padStart(2,'0'); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
function round1(v){ return Math.round(v*10)/10; }
function fmtDate(d){ const dt = (d instanceof Date)? d : new Date(d+'T00:00:00'); return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`; }
function parseDate(s){ return new Date(s+'T00:00:00'); }
function addDays(d,n){ const nd = new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function startOfWeek(d, startDow){ const nd=new Date(d); const dow=nd.getDay(); const sd=startDow||0; return addDays(nd,-((dow-sd+7)%7)); }
function todayDate(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); }
function kmToUnit(km, unit){ return unit==='mi' ? km/KM_PER_MI : km; }
function unitToKm(v, unit){ return unit==='mi' ? v*KM_PER_MI : v; }
function fmtDist(km, unit, digits){ digits = digits==null?1:digits; return `${kmToUnit(km,unit).toFixed(digits)} ${unit}`; }
function interp(anchors, x){
  if(x<=anchors[0][0]) return anchors[0][1];
  for(let i=0;i<anchors.length-1;i++){
    const [x0,y0]=anchors[i], [x1,y1]=anchors[i+1];
    if(x<=x1){ const t=(x-x0)/(x1-x0); return y0+t*(y1-y0); }
  }
  return anchors[anchors.length-1][1];
}
function parseDurationToSec(str){
  if(!str) return null;
  const parts = String(str).trim().split(':').map(s=>Number(s));
  if(!parts.length || parts.some(n=>isNaN(n))) return null;
  if(parts.length===1) return parts[0]*60;
  if(parts.length===2) return parts[0]*60+parts[1];
  if(parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
  return null;
}
function secToClock(totalSec){
  totalSec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  if(h>0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}
function paceStr(secPerKm, unit){ const secPerUnit = unit==='mi' ? secPerKm*KM_PER_MI : secPerKm; return `${secToClock(secPerUnit)}/${unit}`; }
function speedStr(secPerKm, unit){ const secPerUnit = unit==='mi' ? secPerKm*KM_PER_MI : secPerKm; return `${(3600/secPerUnit).toFixed(1)} ${unit==='mi'?'mph':'km/h'}`; }
function paceOrSpeedStr(secPerKm, unit, fmt){ return fmt==='speed' ? speedStr(secPerKm, unit) : paceStr(secPerKm, unit); }
function circularDayDist(a,b){ const diff=Math.abs(a-b); return Math.min(diff,7-diff); }
function kmForMinutes(min, secPerKm){ return min*60/secPerKm; }
function minutesForKm(km, secPerKm){ return km*secPerKm/60; }

/* ============================= Daniels VDOT physiology ============================= */
/* VO2 (ml/kg/min) at velocity v (m/min): VO2 = -4.60 + 0.182258v + 0.000104v^2
   %VO2max sustainable for t minutes:    0.8 + 0.1894393e^(-0.012778t) + 0.2989558e^(-0.1932605t) */
function vo2FromVelocity(v){ return -4.60 + 0.182258*v + 0.000104*v*v; }
function velocityFromVO2(vo2){ const a=0.000104, b=0.182258, c=-(4.60+vo2); return (-b + Math.sqrt(b*b - 4*a*c)) / (2*a); }
function pctMaxForDurationMin(tMin){ return 0.8 + 0.1894393*Math.exp(-0.012778*tMin) + 0.2989558*Math.exp(-0.1932605*tMin); }
function vdotFromRace(distanceKm, timeSec){ const tMin = timeSec/60; const v = (distanceKm*1000)/tMin; return vo2FromVelocity(v) / pctMaxForDurationMin(tMin); }
function paceSecPerKmFromVdotPct(vdot, pct){ const v = velocityFromVO2(vdot*pct); return (1000/v)*60; }
function predictedTimeMinFromVdot(vdot, distanceKm){
  let tMin = distanceKm*4.5;
  for(let i=0;i<8;i++){ const v = velocityFromVO2(vdot*pctMaxForDurationMin(tMin)); tMin = (distanceKm*1000)/v; }
  return tMin;
}
function predictedPaceSecPerKmFromVdot(vdot, distanceKm){ return (predictedTimeMinFromVdot(vdot, distanceKm)*60)/distanceKm; }
function impliedVdotFromPace(actualPaceSecPerKm, pct){ return vo2FromVelocity(60000/actualPaceSecPerKm)/pct; }

// Daniels' zone definitions. E sits in his 59-74% band (68% is a touch easier than the 70%
// midpoint - recreational runners run easy days too fast, not too slow). T = pace you could
// race for ~60 min. I = ~97-100% VO2max (3-5 min reps). R = ~mile race pace. M = pace of the
// runner's own predicted marathon (see predictRace - the mileage-adjusted model, not the
// elite-calibrated VDOT curve, so a 30 km/week runner's M pace is honest).
const EASY_PCT = 0.68;
const THRESHOLD_PCT = pctMaxForDurationMin(60);
const INTERVAL_PCT = 0.975;
const REP_PCT = 1.04;
const LONG_VS_MARATHON = 1.12;
function paceZonesFromVdot(vdot, marathonSecOverride){
  const marathonSec = marathonSecOverride!=null ? marathonSecOverride : predictedTimeMinFromVdot(vdot, 42.195)*60;
  const easyPerKm = paceSecPerKmFromVdotPct(vdot, EASY_PCT);
  // The mileage-adjusted marathon prediction can be slower than a low-mileage runner's
  // easy pace; as a TRAINING zone M-pace still has to sit between easy and threshold.
  const marathonPerKm = Math.min(marathonSec/42.195, easyPerKm*0.95);
  return {
    easyPerKm,
    marathonPerKm,
    tempoPerKm: paceSecPerKmFromVdotPct(vdot, THRESHOLD_PCT),
    intervalPerKm: paceSecPerKmFromVdotPct(vdot, INTERVAL_PCT),
    repPerKm: paceSecPerKmFromVdotPct(vdot, REP_PCT),
    longPerKm: Math.min(easyPerKm, marathonPerKm*LONG_VS_MARATHON),
  };
}

/* ============================= race-time prediction ============================= */
/* Riegel: T2 = T1 * (D2/D1)^k. Vickers & Vertosick (2016, n=2303 recreational runners) found
   k=1.07 well calibrated from 5K up to the half marathon, but the marathon needs weekly
   mileage: their Model 1 (one prior race) and Model 2 (two prior races) below are quoted
   from the paper's Additional file 1 (distances in metres, times in seconds, mileage in
   miles/week). The classic VDOT equivalence (k ~= 1.06) is what the app used before, and it
   ran 10+ minutes fast at the marathon for half of real recreational runners. */
const VV = { k:1.07, m1:{a:0.16018617, b:0.83076202, c:0.06423826}, m2:{a:1.4510756, b:-0.23797948, c:-0.01410023} };
function riegelSec(fromKm, fromSec, toKm, k){ return fromSec*Math.pow(toKm/fromKm, k); }
function vvMarathonSecModel1(raceKm, raceSec, weeklyMiles){
  const vRiegel = 42195/riegelSec(raceKm, raceSec, 42.195, VV.k);
  const v = VV.m1.a + VV.m1.b*vRiegel + VV.m1.c*(weeklyMiles/10);
  return 42195/v;
}
function vvMarathonSecModel2(r1, r2, weeklyMiles){ // r1 shorter, r2 longer
  const kObs = Math.log(r2.sec/r1.sec)/Math.log(r2.km/r1.km);
  const k = VV.m2.a + VV.m2.b*kObs + VV.m2.c*(weeklyMiles/10);
  return r2.sec*Math.pow(42.195/r2.km, k);
}
// Tanda 2011: marathon pace (s/km) = 17.1 + 140 e^(-0.0053 K) + 0.55 P, K = km/week, P = mean
// training pace (s/km) over the 8 weeks before. Used only as a sanity cross-check in the
// prediction notes, since it needs training data the runner hasn't produced yet at setup.
function tandaMarathonSec(weeklyKm, trainingPaceSecPerKm){ return 42.195*(17.1 + 140.0*Math.exp(-0.0053*weeklyKm) + 0.55*trainingPaceSecPerKm); }

// athlete.races: [{km, sec}] (1-2 entries). Returns {sec, lowSec, highSec, basis, notes}.
// lowSec is the optimistic end. Range widths come from the spread of k across V&V's cohort
// (+-0.015 around 1.07) and from the marathon models' residual error (~4% either side).
function predictRace(athlete, targetKm){
  const races = (athlete.races||[]).filter(r=>r && r.km>0 && r.sec>0);
  if(!races.length) return null;
  const notes = [];
  const weeklyMiles = kmToUnit(athlete.weeklyKm||0, 'mi');
  // Prefer the race closest in distance to the target; the Riegel exponent drifts with
  // distance ratio, so a 10K predicts a half better than a 5K does.
  const sorted = races.slice().sort((a,b)=>Math.abs(Math.log(a.km/targetKm))-Math.abs(Math.log(b.km/targetKm)));
  const base = sorted[0];
  let sec, lowSec, highSec, basis;
  if(targetKm>=40){
    const distinct = races.length>=2 && Math.abs(races[0].km-races[1].km)>0.5;
    if(distinct){
      const [r1,r2] = races.slice().sort((a,b)=>a.km-b.km);
      sec = vvMarathonSecModel2(r1, r2, weeklyMiles); basis = 'based on your two race results and weekly mileage';
    } else {
      sec = vvMarathonSecModel1(base.km, base.sec, weeklyMiles); basis = `based on your ${base.km>=21?'half marathon':base.km>=10?'10K':'5K'} result and weekly mileage`;
    }
    lowSec = sec*0.96; highSec = sec*1.05;
  } else {
    sec = riegelSec(base.km, base.sec, targetKm, VV.k);
    lowSec = riegelSec(base.km, base.sec, targetKm, VV.k-0.015);
    highSec = riegelSec(base.km, base.sec, targetKm, VV.k+0.02);
    basis = `based on your ${base.km>=21?'half marathon':base.km>=16?'10 mile':base.km>=15?'15K':base.km>=10?'10K':'5K'} result`;
    if(Math.abs(base.km-targetKm)<0.5){ lowSec = sec*0.99; highSec = sec*1.01; basis = 'based on your result at this distance'; }
  }
  // Specificity: nobody holds predicted pace over a distance they haven't trained near.
  if(athlete.longestKm!=null && targetKm>=15 && athlete.longestKm < 0.6*targetKm){
    highSec *= 1.04;
    notes.push('Your longest recent run is well short of race distance, so the slower end of this range is the safer expectation until the long runs build up.');
  }
  return {sec, lowSec, highSec, basis, notes, paceSecPerKm: sec/targetKm};
}
// 'realistic' goal >= predicted; 'ambitious' inside the optimistic tail (up to 3% faster than
// the fast end of the range); 'beyond' further than that - the plan then trains race pace at
// the fast end of the range instead, and says so, rather than rehearsing a pace that current
// fitness can't support (Daniels: train where you are, not where you want to be).
function assessGoal(prediction, goalSec){
  if(!prediction || !goalSec) return {status:'none'};
  if(goalSec >= prediction.sec) return {status:'realistic'};
  if(goalSec >= prediction.lowSec*0.97) return {status:'ambitious'};
  return {status:'beyond', cappedSec: prediction.lowSec*0.97};
}

/* ============================= athlete model ============================= */
function raceLabelKm(km){ return km>=42 ? 'marathon' : km>=21 ? 'half marathon' : km>=16 ? '10 mile' : km>=15 ? '15K' : km>=10 ? '10K' : '5K'; }
function runsPerWeekFor(currentKm){ if(currentKm < 32) return 3; if(currentKm < 56) return 4; return 5; }
function buildAthlete(setup){
  const races = [];
  if(setup.recentDistanceKm && setup.recentTimeSec) races.push({km:setup.recentDistanceKm, sec:setup.recentTimeSec});
  if(setup.recent2DistanceKm && setup.recent2TimeSec) races.push({km:setup.recent2DistanceKm, sec:setup.recent2TimeSec});
  const weeklyKm = Math.max(0, setup.currentWeeklyKm||0);
  let vdot, vdotBasis;
  if(races.length){
    // Daniels: when two results disagree, the better (higher) VDOT is the fitness; the
    // other race was probably a bad day. But a very short race overstates endurance paces,
    // so only let a 5K win over a longer race by a small margin.
    const withVdot = races.map(r=>({...r, vdot:vdotFromRace(r.km, r.sec)}));
    withVdot.sort((a,b)=>b.vdot-a.vdot);
    vdot = withVdot[0].vdot;
    if(withVdot.length>1 && withVdot[0].km < withVdot[1].km) vdot = Math.min(vdot, withVdot[1].vdot+1.0);
    vdotBasis = 'race';
  } else {
    // No race given: a rough 5K-equivalent by weekly mileage tier, converted to VDOT.
    const tierPace = interp([[10,7.5*60],[30,6.6*60],[50,5.9*60],[80,5.3*60]], weeklyKm||20);
    vdot = vdotFromRace(5, tierPace*5); vdotBasis = 'mileage estimate';
  }
  const longestKm = setup.longestRecentRunKm>0 ? setup.longestRecentRunKm : null;
  const marathonPred = races.length ? predictRace({races, weeklyKm, longestKm}, 42.195) : null;
  const zones = paceZonesFromVdot(vdot, marathonPred ? marathonPred.sec : null);
  return {races, weeklyKm, longestKm, vdot, vdotBasis, zones, marathonSec: marathonPred ? marathonPred.sec : predictedTimeMinFromVdot(vdot,42.195)*60};
}
// Week paces from a VDOT, keeping marathon pace anchored to the athlete's mileage-adjusted
// marathon prediction (scaled with VDOT so it moves as fitness does).
function zonesForVdot(athlete, vdot){
  const marathonSec = athlete.marathonSec * (predictedTimeMinFromVdot(vdot,42.195)/predictedTimeMinFromVdot(athlete.vdot,42.195));
  return paceZonesFromVdot(vdot, marathonSec);
}
// Same thing from a saved plan (which carries a compact athlete summary), for the UI's live
// pace display and recalibration. Older plans without a summary fall back to pure VDOT.
function zonesForPlanVdot(plan, vdot){
  if(plan && plan.athlete && plan.athlete.marathonSec) return zonesForVdot(plan.athlete, vdot);
  return paceZonesFromVdot(vdot);
}
// Race-time projection for the Progress tab: scale the athlete's recorded races to the
// given VDOT (what they'd run those distances at today) and run the mileage-adjusted
// prediction from there, so the headline projection uses the same honest model as setup.
function projectRaceTime(plan, vdot, km){
  const a = plan && plan.athlete;
  if(a && a.races && a.races.length && a.vdot){
    const races = a.races.map(r=>({km:r.km, sec:r.sec*predictedTimeMinFromVdot(vdot, r.km)/predictedTimeMinFromVdot(a.vdot, r.km)}));
    const p = predictRace({races, weeklyKm:a.weeklyKm, longestKm:a.longestKm}, km);
    if(p) return {sec:p.sec, lowSec:p.lowSec, highSec:p.highSec};
  }
  const sec = predictedTimeMinFromVdot(vdot, km)*60;
  return {sec, lowSec:sec*0.98, highSec:sec*1.03};
}

/* ============================= workout catalogue ============================= */
const QUALITY_TYPES = ['long','tempo','intervals','hills','fartlek','overunder','progression','cruise','racepace','reps'];
const WARMUP_ELIGIBLE_TYPES = ['tempo','cruise','intervals','overunder','racepace','reps','hills'];
const STRIDES_ELIGIBLE_TYPES = ['easy','fartlek','progression'];
const STRIDES_REPS = 6;
const STRIDES_EXTRA_KM = unitToKm(0.25, 'mi');
const HILL_STRIDES_EXTRA_KM = unitToKm(0.1, 'mi');
const QUALITY_WARMUP_KM = 2.0;   // ~12-15 min easy before any hard running
const QUALITY_COOLDOWN_KM = 1.5; // ~8-10 min easy after

const TYPE_LABELS = {
  rest:'Rest', easy:'Easy Run', long:'Long Run', tempo:'Tempo', intervals:'Intervals', hills:'Hill Repeats',
  fartlek:'Fartlek', overunder:'Over/Unders', progression:'Progression Run', cruise:'Cruise Intervals',
  racepace:'Race Pace', reps:'Repetitions', race:'Race Day',
};

// A day worth protecting from added leg fatigue: the long run, or a real quality session
// (base-phase variety picks are flagged easyVariety and are intensity-neutral by design).
function isLegDemandingDay(day){ return day.type==='long' || (QUALITY_TYPES.includes(day.type) && !day.easyVariety); }

// Reps/cycles for a structured session given the km of its structured BLOCK (hard work plus
// the recovery jogs between reps - everything between warm-up and cool-down). Returns the
// block distance actually consumed (structuredKm), the hard-running share (workKm), and the
// description. Shared by buildWorkoutMeta (final text) and sizeQuality (sizing).
const BLOCK_RATIO = {intervals:1.5, reps:2.0, hills:2.0, cruise:1.2};
function structuredEffort(type, blockKm, raceDistanceKm, treadmillHills){
  switch(type){
    case 'intervals':{
      // 3-5 min reps (Daniels I): pick the longest rep length whose minimum 4 reps fit the
      // budget, so a low-volume week gets 4 x 600 m rather than an oversized 4 x 1000 m.
      const options = raceDistanceKm<=10 ? [1000,800,600,400] : [1200,1000,800,600];
      const recFor = m => Math.round(m*0.5/100)*100;
      const repM = options.find(m => 4*(m+recFor(m)) <= blockKm*1000+1) || options[options.length-1];
      const recM = recFor(repM);
      const reps = clamp(Math.floor((blockKm*1000)/(repM+recM)+1e-6), 4, raceDistanceKm<=10 ? 6 : 7);
      return {structuredKm: reps*(repM+recM)/1000, workKm: reps*repM/1000, descBase:`${reps} × ${repM}m at {pace} (about ${Math.round(repM/250)} min each), jog ${recM}m easy ({easy}) between`, paceKey:'intervalPerKm'};
    }
    case 'reps':{
      const options = raceDistanceKm<=5 ? [400,300,200] : [300,200];
      const repM = options.find(m => 6*m*2 <= blockKm*1000+1) || 200;
      const reps = clamp(Math.floor((blockKm*1000)/(repM*2)+1e-6), 6, 12);
      return {structuredKm: reps*repM*2/1000, workKm: reps*repM/1000, descBase:`${reps} × ${repM}m fast and relaxed at {pace}, walk or jog ${repM}m to recover fully between — speed and form, not a grind`, paceKey:'repPerKm'};
    }
    case 'hills':{
      const reps = clamp(Math.floor(blockKm/0.6+1e-6), 6, 10);
      const descBase = treadmillHills
        ? `${reps} hill reps of 60–90s at 6% incline and {pace}, flat and an easy walk to recover between each`
        : `${reps} hill reps — 60–90s strong uphill effort (about 5K effort, tall posture, quick steps), jog back down to recover`;
      return {structuredKm: reps*0.6, workKm: reps*0.3, descBase, paceKey: treadmillHills ? 'tempoPerKm' : null};
    }
    case 'overunder':{
      const cycles = clamp(Math.floor(blockKm/1.0+1e-6), 4, 8);
      return {structuredKm: cycles*1.0, workKm: cycles*1.0, descBase:`Over/unders — ${cycles} × (2 min a touch faster than {pace} / 1 min a touch slower), continuous`, paceKey:'tempoPerKm'};
    }
    case 'cruise':{
      const options = [1600,1200,1000,800];
      const recFor = m => m>=1600 ? 300 : 200;
      const repM = options.find(m => 3*(m+recFor(m)) <= blockKm*1000+1) || options[options.length-1];
      const recM = recFor(repM);
      const reps = clamp(Math.floor((blockKm*1000)/(repM+recM)+1e-6), 3, 6);
      return {structuredKm: reps*(repM+recM)/1000, workKm: reps*repM/1000, descBase:`Cruise intervals — ${reps} × ${repM}m at threshold pace ({pace}), 60–90s easy jog ({easy}) between`, paceKey:'tempoPerKm'};
    }
    case 'tempo': return {structuredKm: blockKm, workKm: blockKm, descBase:'Continuous, comfortably hard at {pace}', paceKey:'tempoPerKm'};
    case 'racepace': return {structuredKm: blockKm, workKm: blockKm, descBase: raceDistanceKm>=40 ? 'Continuous at marathon pace ({pace}) — rehearses the rhythm, fueling and focus of race day' : 'Continuous at race pace ({pace}) — rehearses exactly what race day should feel like', paceKey:'racePerKm'};
    default: return {structuredKm: blockKm, workKm: blockKm, descBase:'', paceKey:null};
  }
}

// Description + pace keys for a day. The pace string itself is rendered live by the UI so
// unit/speed toggles and recalibrated paces stay in sync without regenerating the plan.
// Called at generation and again from the edit modal whenever a day's type/km changes.
function buildWorkoutMeta(day, raceDistanceKm){
  const raceKm = raceDistanceKm || 10;
  switch(day.type){
    case 'long':{
      const meta = {descBase:'Steady, relaxed aerobic effort — conversational start, settle into rhythm', paceKey:'longPerKm'};
      if(day.racePaceKm>0.5){
        meta.descBase = 'Easy to steady for most of it, then finish strong at race pace';
        meta.paceKey2 = 'racePerKm'; meta.desc2 = `final ${day.racePaceKmLabel||'portion'}`;
      }
      return meta;
    }
    case 'easy':{
      const descBase = day.easyRole==='recovery' ? 'Very easy, short recovery jog — slower than feels necessary'
        : day.easyRole==='aerobic' ? 'Medium-long aerobic run, conversational pace throughout'
        : 'Conversational, easy effort';
      return {descBase, paceKey:'easyPerKm'};
    }
    case 'tempo': case 'intervals': case 'overunder': case 'cruise': case 'racepace': case 'reps': case 'hills':{
      const warmupKm = day.warmupKm||0, cooldownKm = day.cooldownKm||0;
      const blockKm = Math.max(0, day.km - warmupKm - cooldownKm);
      const {descBase, paceKey, workKm} = structuredEffort(day.type, blockKm, raceKm, day.treadmillHills);
      return {descBase, paceKey, warmupKm, cooldownKm, qualityKm: round1(Math.min(workKm, blockKm))};
    }
    case 'fartlek':{
      if(day.easyVariety){
        // Base-phase variety: an easy run with a little rhythm in it. Short, relaxed pickups
        // around 10K effort - not a session, so it never counts as a hard day.
        const pickups = clamp(Math.round(day.km/2), 4, 6);
        return {
          descBase: `Easy run with ${pickups} relaxed 1-minute pickups spread through the middle (around 10K effort, smooth not strained), 2 min easy between — still an easy day`,
          paceKey: 'easyPerKm', paceKey2: 'tempoPerKm', desc2: 'pickups, roughly',
        };
      }
      const surges = clamp(Math.round(day.km/1.5), 4, 8);
      return {
        descBase: `${surges} surges woven into a continuous run — about 1–2 min quick but controlled (roughly 5K effort), 2 min easy jog between; the rest of the run stays easy`,
        paceKey: 'easyPerKm', paceKey2: 'intervalPerKm', desc2: 'each surge',
      };
    }
    case 'progression':{
      return day.progressionEasy
        ? {descBase:'Progression — start at an easy jog, gradually quicken through the second half, staying comfortable the whole way', paceKey:'easyPerKm', paceKey2:'marathonPerKm', desc2:'finish'}
        : {descBase:'Progression — start easy, gradually quicken so the final third sits at tempo effort', paceKey:'easyPerKm', paceKey2:'tempoPerKm', desc2:'final third'};
    }
    case 'race': return {descBase:'Goal pace effort', paceKey:'racePerKm'};
    case 'rest': return day.strength
      ? {descBase:'No running — strength session today, plus mobility', paceKey:null}
      : {descBase:'Full rest — or easy cross-training (bike, swim, elliptical) if you want to move', paceKey:null};
    default: return {descBase:'', paceKey:null};
  }
}

/* ============================= strength ============================= */
/* Equipment-aware. Every exercise declares variants, each with the equipment it needs; the
   session picks the best variant the runner actually has and names only that. An exercise
   with no available variant drops out of its rotation; if a whole slot would empty, a
   bodyweight fallback fills it so a session never shrinks silently. Everything stays a
   familiar movement, and anything beyond the obvious carries a one-sentence how-to. */
const EQUIPMENT = [
  {id:'barbell', label:'Barbell with plates and a rack', group:'Free weights'},
  {id:'dumbbells', label:'Dumbbells', group:'Free weights'},
  {id:'kettlebell', label:'Kettlebells', group:'Free weights'},
  {id:'plates', label:'Loose weight plates you can hold', group:'Free weights'},
  {id:'bench', label:'Flat bench', group:'Furniture'},
  {id:'box', label:'Knee-high box or sturdy step', group:'Furniture'},
  {id:'pullupBar', label:'Pull-up bar', group:'Furniture'},
  {id:'dipBars', label:'Dip or parallel bars', group:'Furniture'},
  {id:'lowBar', label:'Low bar or rings at hip height', group:'Furniture'},
  {id:'miniBand', label:'Mini loop bands', group:'Bands'},
  {id:'longBand', label:'Long resistance band', group:'Bands'},
  {id:'legPress', label:'Leg press', group:'Lower-body machines'},
  {id:'hackSquat', label:'Hack squat', group:'Lower-body machines'},
  {id:'hamstringCurl', label:'Hamstring curl', group:'Lower-body machines'},
  {id:'legExtension', label:'Leg extension', group:'Lower-body machines'},
  {id:'calfStanding', label:'Standing calf raise machine', group:'Lower-body machines'},
  {id:'calfSeated', label:'Seated calf raise machine', group:'Lower-body machines'},
  {id:'hipThrustMachine', label:'Hip thrust / glute drive machine', group:'Lower-body machines'},
  {id:'backExtension', label:'Back extension bench', group:'Lower-body machines'},
  {id:'smith', label:'Smith machine', group:'Lower-body machines'},
  {id:'chestPress', label:'Chest press machine', group:'Upper-body machines'},
  {id:'shoulderPressMachine', label:'Shoulder press machine', group:'Upper-body machines'},
  {id:'seatedRow', label:'Seated row machine', group:'Upper-body machines'},
  {id:'latPulldown', label:'Lat pulldown machine', group:'Upper-body machines'},
  {id:'assistedPullup', label:'Assisted pull-up machine', group:'Upper-body machines'},
  {id:'cable', label:'Cable machine', group:'Upper-body machines'},
  {id:'armMachines', label:'Curl / triceps machines', group:'Upper-body machines'},
  {id:'stabilityBall', label:'Stability ball', group:'Extras'},
  {id:'medicineBall', label:'Medicine ball', group:'Extras'},
  {id:'trx', label:'Suspension trainer (TRX / rings)', group:'Extras'},
  {id:'sled', label:'Sled or prowler', group:'Extras'},
  {id:'vest', label:'Weighted vest', group:'Extras'},
  {id:'jumpRope', label:'Jump rope', group:'Extras'},
  {id:'hurdles', label:'Plyo boxes in several heights, or low hurdles', group:'Extras'},
];
const DEFAULT_EQUIPMENT = ['barbell','dumbbells','kettlebell','plates','bench','pullupBar','dipBars','miniBand','legPress','hamstringCurl','legExtension','smith','chestPress','shoulderPressMachine','seatedRow','latPulldown','cable'];
function equipmentSet(list){ return new Set(Array.isArray(list) && list.length ? list : DEFAULT_EQUIPMENT); }

// variants: tried in order; the first whose `needs` are all available wins. A variant with
// needs:[] is the bodyweight fallback. `how` on the base applies to every variant unless the
// variant brings its own. `unit`/`per` live on the base.
const STRENGTH_EXERCISES = {
  backSquat: {unit:'reps', how:'Feet shoulder-width, sit down and back until the thighs are about level with the floor, chest up, then drive through the whole foot to stand.', variants:[
    {needs:['barbell'], name:'Back squat', equip:'barbell across the upper back'},
    {needs:['hackSquat'], name:'Hack squat', equip:'machine', how:'Shoulders under the pads, feet mid-plate, lower until the thighs are about level, press back up without locking the knees.'},
    {needs:['smith'], name:'Smith machine squat', equip:'bar across the upper back'},
    {needs:['kettlebell'], name:'Goblet squat', equip:'one heavy kettlebell held at the chest'},
    {needs:['dumbbells'], name:'Goblet squat', equip:'one heavy dumbbell held at the chest'},
    {needs:[], name:'Single-leg squat to a chair', equip:'bodyweight, a chair or bench behind you', per:'leg', how:'Stand on one leg in front of a chair, lower slowly until you just touch the seat, then stand back up without using the other foot; hold a wall or rail for balance if needed.'},
  ]},
  legPress: {unit:'reps', how:'Feet shoulder-width on the plate, lower until the knees are near a right angle without the lower back peeling off the pad, then press back without locking the knees out.', variants:[
    {needs:['legPress'], name:'Leg press', equip:'machine'},
  ]},
  romanianDeadlift: {unit:'reps', how:'Stand tall holding the weight against the thighs, push the hips back and hinge forward with a flat back until the weight reaches mid-shin, then stand up by squeezing the glutes. The knees stay slightly bent throughout.', variants:[
    {needs:['barbell'], name:'Romanian deadlift', equip:'barbell'},
    {needs:['dumbbells'], name:'Romanian deadlift', equip:'a dumbbell in each hand'},
    {needs:['kettlebell'], name:'Kettlebell deadlift', equip:'one heavy kettlebell between the feet'},
    {needs:['smith'], name:'Romanian deadlift', equip:'Smith machine bar'},
    {needs:['backExtension'], name:'Back extension', equip:'45-degree back extension bench', how:'Hips on the pad, hinge down with a flat back, then raise until the body is straight — not beyond. Hold a plate to the chest to add load.'},
    {needs:[], name:'Single-leg glute bridge', equip:'bodyweight', how:'Lie on your back, one foot flat, the other leg straight; drive the hips up through the planted heel and lower slowly.'},
  ]},
  hipThrust: {unit:'reps', how:'Upper back on a bench, feet flat, weight across the hips; drive the hips up until the body is a straight line from shoulders to knees, squeeze the glutes, lower slowly.', variants:[
    {needs:['barbell','bench'], name:'Barbell hip thrust', equip:'barbell across the hips, shoulders on a bench'},
    {needs:['hipThrustMachine'], name:'Hip thrust', equip:'hip thrust / glute drive machine'},
    {needs:['smith','bench'], name:'Hip thrust', equip:'Smith machine bar across the hips, shoulders on a bench'},
    {needs:['dumbbells','bench'], name:'Dumbbell hip thrust', equip:'a heavy dumbbell across the hips, shoulders on a bench'},
    {needs:[], name:'Single-leg hip thrust', equip:'shoulders on a chair or sofa edge, bodyweight', per:'leg', how:'Upper back on the seat edge, one foot flat on the floor, the other leg lifted; drive the hips up through the planted heel until the body is a straight line, lower slowly.'},
  ]},
  bulgarianSplitSquat: {unit:'reps', per:'leg', how:'Stand a long stride in front of a bench with the top of the rear foot resting on it; lower straight down until the front thigh is about level, then push up through the front heel.', variants:[
    {needs:['bench','dumbbells'], name:'Bulgarian split squat', equip:'rear foot on a bench, dumbbells in hand'},
    {needs:['bench','kettlebell'], name:'Bulgarian split squat', equip:'rear foot on a bench, a kettlebell held at the chest'},
    {needs:['bench'], name:'Bulgarian split squat', equip:'rear foot on a bench, bodyweight'},
    {needs:['dumbbells'], name:'Reverse lunges', equip:'dumbbells in hand', how:'Step one foot back and lower until both knees are near right angles, then drive through the front foot to stand.'},
    {needs:[], name:'Reverse lunges', equip:'bodyweight', how:'Step one foot back and lower until both knees are near right angles, then drive through the front foot to stand.'},
  ]},
  stepUps: {unit:'reps', per:'leg', how:'Place one whole foot on the box, stand up through that leg without pushing off the floor foot, then step down under control.', variants:[
    {needs:['box','dumbbells'], name:'Weighted step-ups', equip:'knee-high box, dumbbells in hand'},
    {needs:['bench','dumbbells'], name:'Weighted step-ups', equip:'onto a stable bench, dumbbells in hand'},
    {needs:['box'], name:'Step-ups', equip:'knee-high box, bodyweight'},
    {needs:['bench'], name:'Step-ups', equip:'onto a stable bench, bodyweight'},
    {needs:['dumbbells'], name:'Reverse lunges', equip:'dumbbells in hand', how:'Step one foot back and lower until both knees are near right angles, then drive through the front foot to stand.'},
    {needs:[], name:'Step-ups', equip:'onto the second or third stair, bodyweight'},
  ]},
  singleLegRDL: {unit:'reps', per:'leg', how:'Stand on one leg, hinge forward at the hip with a flat back while the free leg extends behind you, lower the weight toward the floor, then return to standing. Hold a wall if balance is the limiter.', variants:[
    {needs:['dumbbells'], name:'Single-leg Romanian deadlift', equip:'one dumbbell'},
    {needs:['kettlebell'], name:'Single-leg Romanian deadlift', equip:'one kettlebell'},
    {needs:[], name:'Single-leg Romanian deadlift', equip:'bodyweight, arms reaching forward'},
  ]},
  walkingLunges: {unit:'reps', per:'leg', how:'Step forward and lower until both knees are at about right angles, then drive through the front foot into the next step.', variants:[
    {needs:['dumbbells'], name:'Walking lunges', equip:'dumbbells in hand'},
    {needs:['kettlebell'], name:'Walking lunges', equip:'a kettlebell held at the chest'},
    {needs:[], name:'Walking lunges', equip:'bodyweight'},
  ]},
  kettlebellSwing: {unit:'reps', how:'Hinge at the hips (not a squat), hike the bell back between the legs, then snap the hips forward so the bell floats to chest height with the arms relaxed; let it swing back and repeat. Power comes from the hips, not the shoulders.', variants:[
    {needs:['kettlebell'], name:'Kettlebell swing', equip:'one kettlebell'},
    {needs:['dumbbells'], name:'Dumbbell swing', equip:'one dumbbell held by the end'},
  ]},
  calfRaiseStraight: {unit:'reps', per:'leg', how:'Rise onto the ball of the foot as high as you can, pause, then lower slowly (about three seconds) until the heel is below the step.', variants:[
    {needs:['calfStanding'], name:'Standing calf raise', equip:'machine, one leg at a time'},
    {needs:['dumbbells'], name:'Standing single-leg calf raise', equip:'ball of the foot on a step or stair, hold a rail; a dumbbell in the free hand once 12 is easy'},
    {needs:[], name:'Standing single-leg calf raise', equip:'ball of the foot on a step or stair, hold a rail'},
  ]},
  calfRaiseBent: {unit:'reps', how:'Knee bent at a right angle, raise the heel as high as possible against the weight, pause, lower slowly. Works the lower calf the standing version misses.', variants:[
    {needs:['calfSeated'], name:'Seated calf raise', equip:'machine'},
    {needs:['legPress'], name:'Calf press on the leg press', equip:'balls of the feet on the bottom edge of the plate', how:'Press the plate away with the balls of the feet only, pause at full stretch, lower slowly; keep a slight knee bend throughout.'},
    {needs:['dumbbells'], name:'Seated calf raise', equip:'sitting, a dumbbell resting on the knee'},
    {needs:['kettlebell'], name:'Seated calf raise', equip:'sitting, a kettlebell resting on the knee'},
    {needs:[], name:'Seated calf raise', equip:'sitting, press down on the knee with your hands'},
  ]},
  hamstringCurl: {unit:'reps', how:'Curl the heels toward the glutes against the resistance and lower slowly.', variants:[
    {needs:['hamstringCurl'], name:'Hamstring curl', equip:'machine'},
    {needs:['stabilityBall'], name:'Stability-ball hamstring curl', equip:'stability ball', how:'Lie on your back, heels on the ball, lift the hips, then pull the ball toward you with your heels and roll it back out.'},
    {needs:[], name:'Single-leg glute bridge', equip:'bodyweight', how:'Lie on your back, one foot flat, the other leg straight; drive the hips up through the planted heel and lower slowly.'},
  ]},
  bandWalk: {unit:'reps', per:'side', how:'Band just above the knees, feet hip-width, slight knee bend; step sideways keeping tension in the band and the toes pointing forward, then step the other way. Builds the hip muscles that keep the knee tracking straight when you run.', variants:[
    {needs:['miniBand'], name:'Mini-band side steps', equip:'mini resistance band around the legs just above the knees'},
    {needs:[], name:'Side-lying leg raises', equip:'bodyweight', how:'Lie on your side, legs straight and stacked; lift the top leg slowly to about 45 degrees with the toes pointing forward, pause, lower.'},
  ]},
  sidePlank: {unit:'hold', per:'side', how:'On one forearm with the elbow under the shoulder, lift the hips so the body makes a straight line, and hold without letting the hips sag.', variants:[{needs:[], name:'Side plank', equip:'bodyweight'}]},
  suitcaseCarry: {unit:'reps', per:'side', how:'Carry the weight in one hand like a heavy suitcase and walk tall without leaning toward or away from it; the trunk muscles do the work of staying level.', variants:[
    {needs:['kettlebell'], name:'Suitcase carry', equip:'one heavy kettlebell, 30–40 m per set'},
    {needs:['dumbbells'], name:'Suitcase carry', equip:'one heavy dumbbell, 30–40 m per set'},
    {needs:['plates'], name:'Suitcase carry', equip:'one heavy plate, 30–40 m per set'},
    {needs:[], name:'Side plank', equip:'bodyweight', unit:'hold', how:'On one forearm with the elbow under the shoulder, lift the hips so the body makes a straight line, and hold without letting the hips sag.'},
  ]},
  deadBug: {unit:'reps', per:'side', how:'Lie on your back with arms up and knees over hips; lower one arm and the opposite leg toward the floor while keeping the lower back pressed down, then switch.', variants:[{needs:[], name:'Dead bug', equip:'bodyweight, lying on your back'}]},
  plank: {unit:'hold', variants:[{needs:[], name:'Plank', equip:'forearms, bodyweight'}]},
  birdDog: {unit:'reps', per:'side', how:'On hands and knees, reach one arm forward and the opposite leg back until both are level with the body, hold a second, return without letting the hips tilt.', variants:[{needs:[], name:'Bird dog', equip:'bodyweight, on hands and knees'}]},
  hangingKneeRaise: {unit:'reps', how:'Hang from the bar with straight arms, lift the knees toward the chest without swinging, lower slowly.', variants:[
    {needs:['pullupBar'], name:'Hanging knee raise', equip:'pull-up bar'},
    {needs:['dipBars'], name:'Knee raise on the dip bars', equip:'supported on straight arms', how:'Support yourself on straight arms, lift the knees toward the chest without swinging, lower slowly.'},
    {needs:[], name:'Lying leg raises', equip:'bodyweight', how:'Lie on your back with hands under the hips, raise straight legs to vertical and lower slowly without letting the lower back arch.'},
  ]},
  pogoHops: {unit:'reps', how:'Small quick hops in place on the balls of the feet with the knees nearly straight and the ankles doing the work; think of bouncing a ball, not jumping high.', variants:[{needs:[], name:'Pogo hops', equip:'bodyweight'}]},
  boxJumps: {unit:'reps', how:'From a quarter squat, swing the arms and jump to land softly on the box with both feet; step down rather than jumping down.', variants:[
    {needs:['box'], name:'Box jumps', equip:'knee-high box'},
    {needs:['hurdles'], name:'Hurdle hops', equip:'low hurdles in a row', how:'Hop over each hurdle with both feet, landing softly and springing straight into the next; keep contacts quick.'},
    {needs:[], name:'Squat jumps', equip:'bodyweight', how:'Drop into a quarter squat, jump as high as you can, land softly with bent knees and reset before the next one.'},
  ]},
  benchPress: {unit:'reps', variants:[
    {needs:['dumbbells','bench'], name:'Dumbbell bench press', equip:'bench + dumbbells'},
    {needs:['barbell','bench'], name:'Barbell bench press', equip:'bench + barbell'},
    {needs:['chestPress'], name:'Chest press', equip:'machine'},
    {needs:['smith','bench'], name:'Bench press', equip:'Smith machine'},
    {needs:[], name:'Push-ups', equip:'bodyweight; hands on a bench to make them easier, feet on a step to make them harder'},
  ]},
  pushUps: {unit:'reps', variants:[{needs:[], name:'Push-ups', equip:'bodyweight; hands on a bench to make them easier, feet on a step to make them harder'}]},
  pullUps: {unit:'reps', how:'Hang with straight arms, pull until the chin clears the bar, lower slowly. If full pull-ups are not there yet, jump to the top and lower over three seconds, or use a band for help.', variants:[
    {needs:['pullupBar','longBand'], name:'Pull-ups', equip:'pull-up bar; loop the band over the bar and under a foot for assistance'},
    {needs:['pullupBar'], name:'Pull-ups', equip:'pull-up bar; do slow negatives if full reps are not there yet'},
    {needs:['assistedPullup'], name:'Assisted pull-ups', equip:'assisted pull-up machine'},
    {needs:['latPulldown'], name:'Lat pulldown', equip:'machine', how:null},
    {needs:['cable'], name:'Lat pulldown', equip:'cable machine with a high attachment', how:null},
    {needs:['longBand'], name:'Band pulldown', equip:'long band anchored high', how:'Kneel facing the anchor, hold the band overhead, pull the hands down to the shoulders by squeezing the shoulder blades, return slowly.'},
    {needs:[], name:'Inverted row under a table', equip:'a sturdy table edge', how:'Lie under the edge, grip it, pull the chest up to the edge by squeezing the shoulder blades, lower slowly.'},
  ]},
  invertedRow: {unit:'reps', how:'Hang under the bar with heels on the floor and body straight, pull the chest to the bar by squeezing the shoulder blades, lower slowly. Walk the feet closer to make it easier.', variants:[
    {needs:['lowBar'], name:'Inverted row', equip:'a bar or rings at hip height'},
    {needs:['smith'], name:'Inverted row', equip:'Smith machine bar set at hip height'},
    {needs:['trx'], name:'Suspension row', equip:'suspension trainer'},
    {needs:['seatedRow'], name:'Seated row', equip:'machine', how:null},
    {needs:['cable'], name:'Cable row', equip:'cable machine, low attachment', how:null},
    {needs:['longBand'], name:'Band row', equip:'long band anchored at chest height', how:'Sit or stand facing the anchor, pull the band to the ribs by squeezing the shoulder blades, return slowly.'},
    {needs:['dumbbells'], name:'Bent-over dumbbell row', equip:'dumbbells, hinged at the hips', how:'Hinge forward with a flat back, let the dumbbells hang, row them to the hips leading with the elbows, lower under control.'},
    {needs:[], name:'Inverted row under a table', equip:'a sturdy table edge'},
  ]},
  singleArmRow: {unit:'reps', per:'arm', how:'Flat back, dumbbell hanging below the shoulder, pull it to the hip leading with the elbow, lower under control.', variants:[
    {needs:['dumbbells','bench'], name:'Single-arm dumbbell row', equip:'one hand and knee on a bench'},
    {needs:['dumbbells'], name:'Single-arm dumbbell row', equip:'one hand braced on a knee or a rail'},
    {needs:['kettlebell'], name:'Single-arm kettlebell row', equip:'one hand braced on a knee or a rail'},
    {needs:['seatedRow'], name:'Seated row', equip:'machine', how:null, per:null},
    {needs:['cable'], name:'Single-arm cable row', equip:'cable machine, low attachment'},
    {needs:[], name:'Inverted row under a table', equip:'a sturdy table edge', how:'Lie under the edge, grip it, pull the chest up to the edge by squeezing the shoulder blades, lower slowly.', per:null},
  ]},
  shoulderPress: {unit:'reps', variants:[
    {needs:['dumbbells'], name:'Dumbbell shoulder press', equip:'seated or standing'},
    {needs:['shoulderPressMachine'], name:'Shoulder press', equip:'machine'},
    {needs:['barbell'], name:'Overhead press', equip:'barbell', how:'Bar at the collarbones, press straight up until the arms lock out, lower under control; keep the ribs down, no leaning back.'},
    {needs:['kettlebell'], name:'Kettlebell press', equip:'one kettlebell at a time', how:'Kettlebell racked at the shoulder, press straight up to lockout, lower under control; alternate arms.'},
    {needs:[], name:'Pike push-ups', equip:'bodyweight, hips high', how:'From a push-up position walk the feet in so the hips are high, lower the head toward the floor between the hands, press back up.'},
  ]},
  gobletSquat: {unit:'reps', how:'Hold the weight against the chest with both hands, squat down between the knees keeping the chest up, stand back up.', variants:[
    {needs:['kettlebell'], name:'Goblet squat', equip:'one kettlebell held at the chest'},
    {needs:['dumbbells'], name:'Goblet squat', equip:'one dumbbell held at the chest'},
    {needs:['plates'], name:'Goblet squat', equip:'one plate held at the chest'},
    {needs:[], name:'Bodyweight squat', equip:'bodyweight, three seconds down', how:null},
  ]},
  gluteBridge: {unit:'reps', variants:[{needs:[], name:'Glute bridge', equip:'bodyweight, lying on your back with feet flat'}]},
  farmerCarry: {unit:'reps', how:'Pick up the weights, stand tall with the shoulders back, and walk at a normal pace without leaning; set them down and rest between walks.', variants:[
    {needs:['kettlebell'], name:'Farmer carry', equip:'a heavy kettlebell in each hand, 30–40 m per set'},
    {needs:['dumbbells'], name:'Farmer carry', equip:'a heavy dumbbell in each hand, 30–40 m per set'},
    {needs:['plates'], name:'Farmer carry', equip:'a heavy plate in each hand, 30–40 m per set'},
    {needs:[], name:'Plank', equip:'forearms, bodyweight', unit:'hold', per:null, how:null},
  ]},
};
// Optional extras: isolation work has no running benefit, but the upper session is short and
// some runners want arms and shoulders for their own sake. Always marked optional.
const OPTIONAL_EXTRAS = {
  curls: {unit:'reps', variants:[
    {needs:['dumbbells'], name:'Dumbbell curls', equip:'dumbbells'},
    {needs:['armMachines'], name:'Curls', equip:'curl machine'},
    {needs:['cable'], name:'Cable curls', equip:'cable machine, low attachment'},
    {needs:['barbell'], name:'Barbell curls', equip:'barbell'},
  ]},
  triceps: {unit:'reps', variants:[
    {needs:['dipBars'], name:'Dips', equip:'dip bars; bend the knees and use a band or your feet for help if needed'},
    {needs:['cable'], name:'Triceps pushdowns', equip:'cable machine, high attachment'},
    {needs:['armMachines'], name:'Triceps extensions', equip:'triceps machine'},
    {needs:['dumbbells'], name:'Overhead triceps extension', equip:'one dumbbell held overhead with both hands'},
    {needs:['bench'], name:'Bench dips', equip:'hands on the bench edge, feet on the floor'},
  ]},
  lateralRaise: {unit:'reps', variants:[
    {needs:['dumbbells'], name:'Lateral raises', equip:'light dumbbells'},
    {needs:['cable'], name:'Cable lateral raises', equip:'cable machine, low attachment'},
  ]},
  legExtension: {unit:'reps', variants:[{needs:['legExtension'], name:'Leg extension', equip:'machine'}]},
};
// Resolve an exercise to the best variant the runner has. Returns null if none fits.
function resolveExercise(def, avail){
  if(!def) return null;
  for(const v of def.variants){
    if(v.needs.every(id=>avail.has(id))){
      return {name:v.name, equip:v.equip, unit:v.unit||def.unit, per:('per' in v) ? v.per : def.per, how:('how' in v) ? v.how : def.how, id:def._id, bodyweight: v.needs.length===0};
    }
  }
  return null;
}
Object.keys(STRENGTH_EXERCISES).forEach(k=>{ STRENGTH_EXERCISES[k]._id = k; });
Object.keys(OPTIONAL_EXTRAS).forEach(k=>{ OPTIONAL_EXTRAS[k]._id = k; });
const PRIMARY_LOWER_POOL = ['backSquat','legPress','romanianDeadlift','hipThrust','backSquat','legPress','romanianDeadlift'];
const UNILATERAL_POOL = ['bulgarianSplitSquat','stepUps','walkingLunges','stepUps','bulgarianSplitSquat'];
const POSTERIOR_POOL = ['kettlebellSwing','singleLegRDL','hamstringCurl','kettlebellSwing'];
const LOWER_CORE_POOL = ['bandWalk','sidePlank','deadBug','bandWalk','suitcaseCarry'];
const PLYO_POOL_INTRO = ['pogoHops','boxJumps'];
const UPPER_PUSH_POOL = ['benchPress','pushUps','shoulderPress'];
const UPPER_PULL_POOL = ['pullUps','singleArmRow','invertedRow'];
const UPPER_CORE_POOL = ['plank','deadBug','hangingKneeRaise','birdDog'];
const UPPER_CORE2_POOL = ['sidePlank','farmerCarry','suitcaseCarry'];
// Walk the pool from position i, skipping exercises with no available variant.
// taken: names already picked for this session, so a bodyweight-only plan doesn't list the
// same fallback movement twice.
function pickFromPool(pool, i, avail, taken){
  const n = pool.length;
  let first = null, chosen = null;
  for(let k=0;k<n;k++){ const def = STRENGTH_EXERCISES[pool[(((i+k)%n)+n)%n]]; const r = resolveExercise(def, avail); if(!r) continue; if(!first) first = r; if(!taken || !taken.has(r.name)){ chosen = r; break; } }
  chosen = chosen || first || resolveExercise(STRENGTH_EXERCISES.gobletSquat, avail) || resolveExercise(STRENGTH_EXERCISES.plank, avail);
  if(taken && chosen) taken.add(chosen.name);
  return chosen;
}
const _used = [];
function strengthSetLine(ex, sets, amount, restSec, effort){
  _used.push(ex);
  const numSuffix = ex.per==='leg' ? '/leg' : ex.per==='arm' ? '/arm' : '';
  const nameSuffix = ex.per==='side' ? (ex.name==='Mini-band side steps' ? ' each way' : ex.name==='Suitcase carry' ? ' each hand' : ' each side') : '';
  const amountStr = ex.unit==='hold' ? `${amount}s${numSuffix}` : `${amount}${numSuffix}`;
  const restStr = restSec>=120 ? (restSec%60===0 ? (restSec/60)+' min' : (Math.floor(restSec/60))+'–'+(Math.ceil(restSec/60))+' min') : restSec+'s';
  const restClause = sets>1 && restSec>0 ? ` Rest ${restStr} between sets.` : '';
  return `${sets}×${amountStr} ${ex.name}${nameSuffix} (${ex.equip}) — ${effort}.${restClause}`;
}
// Tiers: 'heavy' (base/build: strength + introduce plyometrics, 4-week wave of effort),
// 'maintain' (peak: fewer sets, keep the load, keep a little plyo), 'express' (shares a
// workout day: the two lifts that matter, ~20 min), 'light' (taper beyond the cutoff:
// bodyweight + a few hops), none inside the cutoff.
function lowerStrengthTierForPhase(phase, daysToRace, cutoffDays){
  const cutoff = cutoffDays!=null ? cutoffDays : 10;
  if(daysToRace!=null && daysToRace>=0 && daysToRace<=Math.max(1,cutoff)) return null;
  if(phase==='taper' || phase==='recovery') return 'light';
  if(phase==='peak') return 'maintain';
  return 'heavy';
}
// One line for the core/hip slot, phrased for what the exercise actually is.
function coreLine(core, sets, restSec, cue){
  if(core.name==='Mini-band side steps' || core.name==='Side-lying leg raises') return strengthSetLine(core, Math.max(2,sets), 15, 30, core.name==='Mini-band side steps' ? 'slow steps, toes forward, knees pushed out against the band' : 'slow and controlled, toes forward');
  if(core.name==='Suitcase carry') return strengthSetLine(core, Math.max(2,sets), 1, 30, 'one walk per hand, stay level');
  const amt = core.unit==='hold' ? 30 : 10;
  return strengthSetLine(core, sets, amt, restSec, cue || (core.unit==='hold' ? 'hold with good form' : 'slow and controlled'));
}
function isSwing(ex){ return /swing/i.test(ex.name); }
function isCarry(ex){ return /carry/i.test(ex.name); }
// weekInBlock: 0..3 position in the running 4-week wave (3 = cutback) - effort cue and set
// count climb over three weeks then back off, the standard mesocycle shape.
function buildLowerStrengthWorkout(tier, weekIndex, weekInBlock, avail){
  avail = avail || equipmentSet();
  const wb = weekInBlock==null ? weekIndex%4 : weekInBlock;
  const taken = new Set();
  const primary = pickFromPool(PRIMARY_LOWER_POOL, weekIndex, avail, taken);
  const uni = pickFromPool(UNILATERAL_POOL, weekIndex, avail, taken);
  const post = pickFromPool(POSTERIOR_POOL, weekIndex, avail, taken);
  const core = pickFromPool(LOWER_CORE_POOL, weekIndex, avail, taken);
  const calf = resolveExercise(STRENGTH_EXERCISES.calfRaiseStraight, avail);
  const calf2 = resolveExercise(STRENGTH_EXERCISES.calfRaiseBent, avail);
  const pogo = resolveExercise(STRENGTH_EXERCISES.pogoHops, avail);
  if(tier==='light'){
    return [
      strengthSetLine(pogo, 2, 15, 45, 'springy and relaxed'),
      strengthSetLine(resolveExercise(STRENGTH_EXERCISES.gobletSquat, avail), 2, 6, 60, 'light, smooth, nothing new'),
      strengthSetLine(resolveExercise(STRENGTH_EXERCISES.gluteBridge, avail), 2, 10, 30, 'easy'),
      coreLine(core, 1, 0, 'easy, controlled'),
    ];
  }
  if(tier==='express'){
    return [
      strengthSetLine(pogo, 2, 15, 45, 'quick off the ground'),
      primary.bodyweight ? strengthSetLine(primary, 3, 8, 60, 'slow, three seconds down, 2 reps left in the tank') : strengthSetLine(primary, 3, 5, 120, 'heavy, 2–3 reps left in the tank'),
      strengthSetLine(calf, 2, 10, 45, 'slow and controlled'),
      coreLine(core, 1, 0, 'controlled'),
    ];
  }
  if(tier==='maintain'){
    return [
      strengthSetLine(pogo, 2, 20, 45, 'quick off the ground'),
      primary.bodyweight ? strengthSetLine(primary, 3, 8, 60, 'slow and controlled, 3 reps left in the tank') : strengthSetLine(primary, 3, 4, 150, 'heavy but crisp — 3 reps left in the tank; keep the load, drop the volume'),
      uni.bodyweight ? strengthSetLine(uni, 2, 10, 45, 'slow and controlled') : strengthSetLine(uni, 2, 6, 75, 'moderate, 2–3 left in the tank'),
      strengthSetLine(calf, 2, 10, 45, 'slow and controlled'),
      coreLine(core, 2, 30, 'controlled'),
    ];
  }
  // heavy
  const sets = wb===3 ? 3 : wb===0 ? 3 : 4;
  const rir = wb===3 ? '3 reps left in the tank (easier week)' : wb===0 ? '3 reps left in the tank' : wb===1 ? '2 reps left in the tank' : '1–2 reps left in the tank';
  const plyo = wb>=1 ? pickFromPool(PLYO_POOL_INTRO, weekIndex, avail, taken) : null;
  const lines = [];
  if(plyo) lines.push(strengthSetLine(plyo, wb===3 ? 2 : 3, plyo.name==='Pogo hops' ? 20 : 5, 60, 'maximal intent, full recovery — quality over quantity; do these first while fresh'));
  lines.push(primary.bodyweight ? strengthSetLine(primary, sets, 8, 60, `slow, three seconds down — ${rir}`) : strengthSetLine(primary, sets, 5, 150, `heavy — ${rir}`));
  lines.push(uni.bodyweight ? strengthSetLine(uni, 3, 10, 45, 'slow and controlled, 2 left in the tank') : strengthSetLine(uni, 3, 6, 75, 'moderate-heavy, 2 left in the tank'));
  lines.push(isSwing(post)
    ? strengthSetLine(post, 3, 12, 60, 'crisp and powerful, hips doing the work')
    : strengthSetLine(post, 3, post.unit==='hold'?30:8, 60, 'controlled, slow lowering'));
  lines.push(strengthSetLine(calf, 3, 10, 45, 'heavy enough that 10 is work; 3s down'));
  lines.push(strengthSetLine(calf2, 2, 15, 30, 'moderate'));
  lines.push(coreLine(core, 3, 30));
  return lines;
}
function buildUpperStrengthWorkout(variant, avail){
  avail = avail || equipmentSet();
  const taken = new Set();
  const pull = pickFromPool(UPPER_PULL_POOL, variant+1, avail, taken);
  const push = pickFromPool(UPPER_PUSH_POOL, variant, avail, taken);
  const core = pickFromPool(UPPER_CORE_POOL, variant, avail, taken);
  const core2 = pickFromPool(UPPER_CORE2_POOL, variant+2, avail, taken);
  const pushReps = push.name==='Push-ups' || push.name==='Pike push-ups' ? 12 : 8;
  // Pull first: upper-back strength holds posture late in a race; the press only balances it.
  return [
    strengthSetLine(pull, 3, 8, 75, '1–2 reps left in the tank, squeeze the shoulder blades'),
    strengthSetLine(push, 3, pushReps, 75, 'same effort'),
    strengthSetLine(core, 3, core.unit==='hold'?40:10, 30, core.unit==='hold' ? 'hold with a neutral spine' : 'slow and controlled'),
    isCarry(core2) && core2.name==='Farmer carry' ? strengthSetLine(core2, 2, 1, 30, 'one walk per set, tall posture') : coreLine(core2, 2, 30, 'steady'),
  ];
}
function buildUpperOptional(variant, avail){
  avail = avail || equipmentSet();
  const keys = ['curls','triceps','lateralRaise'];
  const picks = [];
  for(let k=0;k<3 && picks.length<2;k++){ const r = resolveExercise(OPTIONAL_EXTRAS[keys[(variant+k)%3]], avail); if(r) picks.push(r); }
  return picks.map(ex=>strengthSetLine(ex, 2, 12, 45, 'moderate, 2 reps left in the tank'));
}
function buildLowerOptional(avail){
  avail = avail || equipmentSet();
  const r = resolveExercise(OPTIONAL_EXTRAS.legExtension, avail);
  return r ? [strengthSetLine(r, 2, 12, 45, 'moderate, slow lowering — easy on the knees')] : [];
}
const STRENGTH_TIME_MIN = {heavy:40, maintain:28, express:20, light:15, upper:22};
// Load is set by effort, not by a number the app can't know: "N reps left in the tank"
// means the set ends N reps before you would fail. These notes tell a runner how to pick a
// weight the first time and when to add to it.
const STRENGTH_LOAD_NOTE = {
  heavy: 'How heavy: for the main lift, pick a weight where the last rep of each set is hard but you could still do the stated number more. First time, start light and add a little each session until that is true. When you finish every set with reps to spare, add about 5% (the next dumbbell up, or 5 lb / 2.5 kg a side on a bar) next time. If you cannot complete the reps, drop back.',
  maintain: 'How heavy: keep the weights you were using in the build weeks — the sets are fewer, not lighter. Nothing new, nothing to failure.',
  express: 'How heavy: same weights as your full lower session; this is the short version, done after the run.',
  light: 'How heavy: bodyweight or very light. The aim is to stay sharp, not to build anything this close to the race.',
  bodyweight: 'No weights: make each rep slow (three seconds down) and stop with 2 reps left in the tank. When a set of 12 feels easy, move to the single-leg version or slow it down further.',
  upper: 'How heavy: pick a weight where the last rep or two of each set is hard but clean. Add a little when all sets feel comfortable. Hold the planks until form starts to slip, not until collapse.',
};

// Decide which days of an already-typed week carry strength, and what focus.
function placeStrengthDays(days, strengthDows, strengthPerWeek, phase, weekIndex, opts){
  opts = opts||{};
  days.forEach(d=>{ d.strength=false; d.strengthFocus=null; d.strengthExpress=false; d.strengthOrdinal=undefined; d.strengthExercises=undefined; d.strengthTimeMin=undefined; });
  let want = strengthPerWeek==null ? 2 : strengthPerWeek;
  if(phase==='taper' && !opts.trainThrough) want = Math.min(want, 1);
  else if(phase==='peak' && !opts.trainThrough) want = Math.min(want, 2);
  if(want<=0){ refreshStrengthWorkouts(days, phase, weekIndex, opts); return; }
  const n = days.length;
  const hard = i => isLegDemandingDay(days[i]) || days[i].type==='race';
  const cutoff = opts.strengthCutoffDays!=null ? opts.strengthCutoffDays : 10;
  const usable = i => { const d = days[i]; return d.type!=='race' && !(d.daysToRace!=null && d.daysToRace>=0 && d.daysToRace<=Math.max(1,cutoff)) && !(d.daysToRace!=null && d.daysToRace<0); };
  // Lower body pairs with a RUN day (an easy run, ideally the recovery run after the long
  // run) - a rest day is for resting the legs, so it never gets heavy leg work. Needs a
  // clear day before the next hard run; a quality day itself is the last resort (express).
  const lowerScore = i => {
    const d = days[i], next = days[(i+1)%n];
    if(!usable(i) || d.type==='rest' || d.type==='long' || hard((i+1)%n) || next.type==='race') return null;
    let sc = 0;
    if(hard(i)) sc -= 6;
    if(d.type==='easy' || d.easyVariety) sc += 2;
    if(d.easyRole==='recovery') sc += 1;
    if(strengthDows && strengthDows.includes(d.dow)) sc += 0.5;
    return sc;
  };
  // Upper body/core is light on the legs: rest days first, then the day before a quality
  // session, then any easy day. Never the long run.
  const upperScore = i => {
    const d = days[i];
    if(!usable(i) || d.type==='long') return null;
    let sc = 0;
    if(d.type==='rest') sc += 3;
    if(d.type==='easy' || d.easyVariety) sc += 1;
    if(hard(i)) sc -= 3;
    return sc;
  };
  const chosen = [];
  const taken = i => chosen.some(c=>c.i===i);
  const lowerOk = i => !chosen.some(c=>c.focus==='lower' && circularDayDist(days[c.i].dow, days[i].dow)<3);
  const bestLower = () => { let b=null; for(let i=0;i<n;i++){ if(taken(i) || !lowerOk(i)) continue; const sc=lowerScore(i); if(sc==null) continue; if(!b || sc>b.sc) b={i, sc}; } return b; };
  const bestUpper = () => { let b=null; for(let i=0;i<n;i++){ if(taken(i)) continue; const sc=upperScore(i); if(sc==null) continue; if(!b || sc>b.sc) b={i, sc}; } return b; };
  // First session is always lower body - that's the one with the running-economy evidence.
  const first = bestLower();
  if(first) chosen.push({i:first.i, focus:'lower'});
  while(chosen.length < want){
    const lowerCount = chosen.filter(c=>c.focus==='lower').length;
    const l = lowerCount<2 ? bestLower() : null;
    const u = bestUpper();
    if(!l && !u) break;
    if(l && l.sc>=0 && (!u || l.sc>=u.sc-1)) chosen.push({i:l.i, focus:'lower'});
    else if(u) chosen.push({i:u.i, focus:'upper'});
    else chosen.push({i:l.i, focus:'lower'});
  }
  chosen.forEach((c,k)=>{ const d=days[c.i]; d.strength=true; d.strengthFocus=c.focus; d.strengthExpress = c.focus==='lower' && hard(c.i); d.strengthOrdinal=k; });
  refreshStrengthWorkouts(days, phase, weekIndex, opts);
}
// After a manual swap/edit: a lower-body session that now sits the day before a hard run
// (or on the long run) flips to upper/core; an upper session on a clean slot stays upper
// (the runner chose where to put it).
function recomputeStrengthFocus(days){
  const n = days.length;
  days.forEach((day,i)=>{
    if(!day.strength){ day.strengthFocus=null; return; }
    const next = days[(i+1)%n];
    const beforeHard = isLegDemandingDay(next) || next.type==='race';
    if(beforeHard || day.type==='long') day.strengthFocus = 'upper';
    else if(!day.strengthFocus) day.strengthFocus = 'lower';
    day.strengthExpress = day.strengthFocus==='lower' && isLegDemandingDay(day);
  });
}
// Attaches exercise content to every strength day for the runner's equipment
// (opts.equipment, defaulting to DEFAULT_EQUIPMENT). Called at generation and after any
// edit, swap, or equipment change.
function refreshStrengthWorkouts(days, phase, weekIndex, opts){
  opts = opts||{};
  const avail = equipmentSet(opts.equipment);
  days.forEach(d=>{
    if(d.type==='rest') Object.assign(d, buildWorkoutMeta(d)); // rest-day text depends on whether strength landed there
    if(!d.strength){ d.strengthExercises=undefined; d.strengthTimeMin=undefined; d.strengthExpress=false; d.strengthHowTo=undefined; d.strengthLoadNote=undefined; d.strengthOptional=undefined; return; }
    const tier = lowerStrengthTierForPhase(phase, d.daysToRace!=null ? d.daysToRace : opts.minDaysToRace, opts.strengthCutoffDays);
    const variant = weekIndex*2 + (d.strengthOrdinal||0); // two sessions in a week draw different lifts
    _used.length = 0;
    if(d.strengthFocus==='upper' || tier==null){
      d.strengthFocus = 'upper';
      d.strengthExercises = buildUpperStrengthWorkout(variant, avail); d.strengthTimeMin = STRENGTH_TIME_MIN.upper;
      d.strengthLoadNote = STRENGTH_LOAD_NOTE.upper;
      const usedSoFar = _used.length; d.strengthOptional = buildUpperOptional(variant, avail); _used.length = usedSoFar; // extras need no how-to
    } else {
      const express = !!d.strengthExpress && tier!=='light';
      const useTier = express ? 'express' : tier;
      d.strengthExercises = buildLowerStrengthWorkout(useTier, variant, opts.weekInBlock, avail); d.strengthTimeMin = express ? STRENGTH_TIME_MIN.express : STRENGTH_TIME_MIN[tier];
      d.strengthLoadNote = (_used.filter(x=>!x.bodyweight).length===0) ? STRENGTH_LOAD_NOTE.bodyweight : STRENGTH_LOAD_NOTE[useTier];
      const usedSoFar = _used.length; d.strengthOptional = useTier==='heavy' ? buildLowerOptional(avail) : undefined; _used.length = usedSoFar;
    }
    // One how-to per unfamiliar exercise in this session, in the order they appear.
    const seen = new Set(); d.strengthHowTo = [];
    _used.forEach(ex=>{ if(ex.how && !seen.has(ex.name)){ seen.add(ex.name); d.strengthHowTo.push({name:ex.name, how:ex.how}); } });
    _used.length = 0;
  });
}

/* ============================= scheduling ============================= */
// Quality days sit opposite the long run: one session three days away; two sessions two
// and four days away (long Sun -> Tue/Thu), so every hard day has >= 48 h on both sides.
function qualityDowsFor(longDow, nQuality){
  if(nQuality>=2) return [(longDow+2)%7, (longDow+4)%7];
  return [(longDow+3)%7];
}
// Kept for the onboarding/setup contract (speedDow/strengthDows). Strength placement is now
// re-scored every week, so strengthDows only acts as a tie-breaker.
function deriveScheduleFromLongDow(longDow, strengthPerWeek){
  const speedDow = (longDow+3)%7;
  const strengthDows = [(longDow+1)%7, (speedDow+1)%7].slice(0, strengthPerWeek==null?2:Math.max(1,strengthPerWeek));
  return { speedDow, strengthDows };
}
function evenlySpacedPositions(n, k){
  if(k<=0 || n<=0) return [];
  const positions = [];
  for(let i=0;i<k;i++) positions.push(Math.floor((i*n)/k + n/(2*k)));
  return positions;
}
// User-facing spacing warnings (edit/swap previews). Upper-body work before a hard day is
// fine, so only lower-body strength is flagged there.
function scheduleWarnings(week){
  const warnings = [];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const longDay = week.days.find(d=>d.type==='long');
  const qualityDays = week.days.filter(d=>QUALITY_TYPES.includes(d.type) && d.type!=='long' && !d.easyVariety);
  const hardDays = longDay ? [longDay, ...qualityDays] : qualityDays;
  if(longDay) qualityDays.forEach(q=>{ if(circularDayDist(q.dow, longDay.dow)<2) warnings.push(`${q.label} (${DOW[q.dow]}) is only a day from your Long Run (${DOW[longDay.dow]}) — most coaches recommend 48+ hours between hard efforts.`); });
  for(let i=0;i<qualityDays.length;i++) for(let j=i+1;j<qualityDays.length;j++){ if(circularDayDist(qualityDays[i].dow, qualityDays[j].dow)<2) warnings.push(`${qualityDays[i].label} and ${qualityDays[j].label} are back-to-back — most coaches recommend 48+ hours between hard efforts.`); }
  week.days.filter(d=>d.strength && d.strengthFocus!=='upper').forEach(s=>{
    hardDays.forEach(h=>{
      if(h.id===s.id && h.type==='long') warnings.push(`Heavy strength on top of the Long Run (${DOW[h.dow]}) — move it to the day after, or keep it to upper body/core.`);
      else if(((h.dow-1+7)%7)===s.dow) warnings.push(`Lower-body strength on ${DOW[s.dow]} falls the day before ${h.label} (${DOW[h.dow]}) — heavy legs the day before a key run blunts the run; swap it to upper body/core or another day.`);
    });
  });
  return warnings;
}

/* ============================= periodization tables ============================= */
function raceClass(raceKm){ return raceKm>=40 ? 'marathon' : raceKm>=21 ? 'half' : raceKm>=15 ? 'mid' : raceKm>=10 ? '10k' : '5k'; }
// Days before race the taper begins (Bosquet: most of the benefit arrives in 8-14 days;
// marathons take the long end because the final long run needs 3 weeks to absorb).
function taperDaysFor(raceKm){ return raceKm>=40 ? 21 : raceKm>=21 ? 14 : raceKm>=15 ? 10 : 7; }
// How much of peak volume to run in the week whose mid-point is d days from the race.
function taperVolumeFactor(raceKm, d){
  const cls = raceClass(raceKm);
  if(cls==='marathon') return interp([[0,0.45],[6,0.55],[13,0.70],[20,0.85],[27,1]], d);
  if(cls==='half') return interp([[0,0.50],[6,0.60],[13,0.80],[20,1]], d);
  if(cls==='mid') return interp([[0,0.55],[6,0.65],[13,0.9],[16,1]], d);
  return interp([[0,0.55],[6,0.70],[13,1]], d);
}
// Long run share of peak when the long run itself falls d days before the race.
function taperLongFactor(raceKm, d){
  const cls = raceClass(raceKm);
  if(cls==='marathon') return interp([[0,0],[4,0.3],[7,0.4],[14,0.6],[21,0.8],[28,1]], d);
  if(cls==='half') return interp([[0,0],[4,0.4],[7,0.55],[14,0.8],[21,1]], d);
  return interp([[0,0],[4,0.5],[7,0.65],[14,1]], d);
}
// Safe weekly growth (fraction) as a function of current volume - the familiar "about 10%"
// at low volume, tapering as absolute jumps get bigger.
function weeklyGrowthRateFor(km){ return interp([[25,0.10],[45,0.08],[65,0.065],[90,0.05]], km); }
// Where a plan should aim its peak week, before growth limits. Short races hold volume (the
// stimulus shifts to quality, not more miles); longer races build toward a distance-specific
// floor that recreational plans converge on (Pfitzinger's lowest tiers, Higdon intermediate).
function targetPeakWeeklyKm(raceKm, currentKm, longEmphasis, nTrainWeeks){
  const cls = raceClass(raceKm);
  const floorKm = {'5k':30,'10k':38,'mid':45,'half':48,'marathon':60}[cls];
  const growth = {'5k':1.05,'10k':1.10,'mid':1.15,'half':1.22,'marathon':1.40}[cls];
  const capKm = {'5k':75,'10k':85,'mid':95,'half':100,'marathon':120}[cls];
  const emph = longEmphasis==='high' ? 1.08 : longEmphasis==='low' ? 0.94 : 1;
  // Someone already running far more than the race typically needs gains little from more
  // volume (the stimulus should shift to quality), so the growth share fades as current
  // volume climbs past the floor: full growth at/below the floor, ~30% of it at 2x the floor.
  const damp = clamp((floorKm*2 - currentKm)/floorKm, 0.3, 1);
  let target = Math.max(currentKm*((growth-1)*emph*damp+1), Math.min(floorKm, currentKm*1.6));
  if(nTrainWeeks<=4) target = Math.min(target, currentKm*1.1);
  target = Math.min(target, capKm);
  // A 5K/10K doesn't need more aerobic volume than it needs: a runner already well past
  // the "plenty" mark for the distance settles ~10% lower, which buys recovery for the
  // sharper quality work rather than carrying volume for its own sake. Longer races never
  // trim - the volume IS the specific preparation there.
  const plentyKm = {'5k':55,'10k':65,'mid':75}[cls];
  if(plentyKm && currentKm > plentyKm) return Math.max(plentyKm, currentKm*0.9);
  return Math.max(currentKm, target);
}
function peakLongTargetKm(raceKm, peakWeeklyKm, longEmphasis, runsPerWeek){
  const cls = raceClass(raceKm);
  const emph = longEmphasis==='high' ? 1.12 : longEmphasis==='low' ? 0.88 : 1;
  // Fewer run days -> each run is a bigger share, including the long one (Daniels' 25-30%
  // assumes 5-7 runs; a 4-day runner's long run sits nearer a third of the week).
  const bump = (runsPerWeek||5)<=3 ? 0.07 : (runsPerWeek||5)===4 ? 0.04 : 0;
  let t;
  if(cls==='5k') t = clamp(peakWeeklyKm*(0.26+bump), 9, 18);
  else if(cls==='10k') t = clamp(peakWeeklyKm*(0.28+bump), 11, 21);
  else if(cls==='mid') t = clamp(peakWeeklyKm*(0.30+bump), 14, 23);
  else if(cls==='half') t = clamp(Math.max(19, peakWeeklyKm*(0.30+bump)), 18, 24);
  else t = clamp(Math.max(30, peakWeeklyKm*(0.32+bump)), 29, 35);
  return t*emph;
}
// Ceiling on the long run as a share of that week's volume. Recreational marathon plans run
// higher shares than Daniels' 25-30% (Higdon's novice plans sit near 40-45%) - allowed, but
// the week still needs real easy running around it.
function longFracCap(raceKm, weeklyKm, runsPerWeek){
  const cls = raceClass(raceKm);
  const fewBump = runsPerWeek<=3 ? 0.05 : 0;
  if(cls==='marathon') return interp([[40,0.50],[55,0.45],[70,0.38],[90,0.33],[110,0.28]], weeklyKm) + fewBump;
  if(cls==='half') return interp([[30,0.42],[45,0.36],[65,0.31],[90,0.27]], weeklyKm) + fewBump;
  return interp([[25,0.40],[40,0.35],[60,0.31],[90,0.27]], weeklyKm) + (runsPerWeek<=3 ? 0.05 : 0);
}
function longTimeCapMin(raceKm){ return raceKm>=40 ? 195 : 150; }

/* ============================= session sizing ============================= */
// Minutes of hard running by type, phase and position in the phase (0..1), for the primary
// quality day. Secondary sessions run at ~65%. These are the time budgets; the percentage
// caps in sizeQuality() then trim them for low-volume weeks.
function qualityMinutes(type, cls, phase, t){
  const short = cls==='5k' || cls==='10k';
  switch(type){
    case 'tempo': return short ? interp([[0,20],[1,25]], t) : interp([[0,20],[1,phase==='peak'?40:32]], t);
    case 'cruise': return short ? interp([[0,20],[1,28]], t) : interp([[0,24],[1,36]], t);
    case 'intervals': return short ? interp([[0,14],[1,20]], t) : interp([[0,12],[1,18]], t);
    case 'reps': return interp([[0,8],[1,12]], t); // minutes at R pace, excluding recovery
    case 'hills': return interp([[0,9],[1,13]], t);  // 6-10 reps of 60-90s
    case 'overunder': return interp([[0,15],[1,18]], t);
    case 'racepace': return cls==='marathon' ? interp([[0,40],[1,55]], t) : cls==='half' ? interp([[0,25],[1,40]], t) : interp([[0,20],[1,30]], t);
    case 'progression': return 0; // sized as a whole run
    case 'fartlek': return 0;
    default: return 20;
  }
}
// Minimum worthwhile session, in minutes at the session's pace. Daniels' 20 min at T and
// ~12 min at I assume a runner at 40+ km/week; below that the floor scales down so a
// 20 km week isn't a tempo day plus scraps.
function floorMinutesFor(type, weeklyKm){
  const T = interp([[15,10],[25,14],[40,20]], weeklyKm);
  if(type==='tempo'||type==='cruise'||type==='overunder') return T;
  if(type==='intervals') return interp([[15,6],[25,9],[40,12]], weeklyKm);
  if(type==='racepace') return interp([[20,10],[40,15]], weeklyKm);
  return 0;
}
// Daniels' shares of weekly volume: T <= 10%, I <= 8% (and <= 10 km), R <= 5%.
function qualityShareCap(type){
  return type==='intervals' ? 0.08 : type==='reps' ? 0.05 : type==='hills' ? 0.08 : type==='racepace' ? 0.16 : 0.10;
}
function paceKeyForType(type){
  return type==='intervals' ? 'intervalPerKm' : type==='reps' ? 'repPerKm' : type==='racepace' ? 'racePerKm' : type==='hills' ? 'intervalPerKm' : 'tempoPerKm';
}
// Returns {qualityKm, warmupKm, cooldownKm, km} for a structured session, obeying: the time
// budget, the share cap, "quality shorter than the race" for 10K+, and the whole day
// shorter than the week's long run.
function sizeQuality(type, cls, phase, t, scale, weeklyKm, longKm, raceKm, paces){
  if(type==='progression' || type==='fartlek'){
    // a whole run, not a block: never scaled into a token jog
    const km = clamp(Math.min(weeklyKm*0.16, longKm*0.8), 4, 14);
    return {qualityKm:0, warmupKm:0, cooldownKm:0, km:round1(km)};
  }
  const pace = paces[paceKeyForType(type)] || paces.tempoPerKm;
  let qKm = kmForMinutes(qualityMinutes(type, cls, phase, t)*scale, pace);
  qKm = Math.min(qKm, weeklyKm*qualityShareCap(type));
  if(type==='intervals') qKm = Math.min(qKm, 10);
  if(raceKm>=10 && type!=='racepace') qKm = Math.min(qKm, raceKm*0.85);
  if(type==='racepace' && cls!=='marathon') qKm = Math.min(qKm, raceKm*0.6);
  // The share caps are ceilings, not targets: below a certain size a session stops being a
  // stimulus. Floors: ~20 min at threshold (3 x 1 mile), ~12 min at I pace, 6 x 200 m reps,
  // 6 hill reps. Scaled sessions (taper, secondary) keep ~70% of the floor.
  const floorKm = type==='reps' ? (weeklyKm<30 ? 1.0 : 1.2) : type==='hills' ? (weeklyKm<30 ? 1.2 : 1.8) : kmForMinutes(floorMinutesFor(type, weeklyKm), pace);
  const floorMul = scale <= 0.65 ? 0.7 : scale < 0.85 ? 0.85 : 1;
  qKm = Math.max(qKm, floorKm*floorMul);
  if(type==='tempo') qKm = Math.min(qKm, kmForMinutes(40, pace)); // Daniels: 20-40 min continuous
  let warmupKm = QUALITY_WARMUP_KM, cooldownKm = QUALITY_COOLDOWN_KM;
  // The structured block = hard work + recovery jogs; the whole session (warm-up + block +
  // cool-down) stays shorter than the long run - a quality day is never the week's biggest.
  const ratio = BLOCK_RATIO[type]||1;
  const maxDay = Math.max(7, longKm*0.9);
  let block = qKm*ratio;
  const floorBlock = floorKm*floorMul*ratio;
  for(let i=0;i<4;i++){
    if(block + warmupKm + cooldownKm <= maxDay) break;
    if(warmupKm>1.5){ warmupKm = 1.5; cooldownKm = 1.0; continue; }
    block = Math.max(floorBlock, maxDay - warmupKm - cooldownKm);
  }
  let eff = structuredEffort(type, block, raceKm);
  const floorTarget = floorKm*floorMul*0.92;
  for(const k of [1.1, 1.2, 1.3, 1.45, 1.6]){
    if(eff.workKm >= floorTarget) break;
    const tryBlock = block*k;
    if(tryBlock + warmupKm + cooldownKm > maxDay){
      if(warmupKm>1.5){ warmupKm = 1.5; cooldownKm = 1.0; }
      if(tryBlock + warmupKm + cooldownKm > maxDay && tryBlock > floorBlock*1.35) break;
    }
    const e2 = structuredEffort(type, tryBlock, raceKm);
    if(e2.workKm > eff.workKm){ eff = e2; block = tryBlock; }
  }
  block = Math.min(block, eff.structuredKm);
  const workKm = round1(Math.min(eff.workKm, block));
  return {qualityKm:workKm, warmupKm:round1(warmupKm), cooldownKm:round1(cooldownKm), km:round1(block+warmupKm+cooldownKm), blockKm:round1(block)};
}

/* ============================= session rotations ============================= */
// Daniels/Pfitzinger-style progression: build = threshold + hills + economy work; peak =
// race-specific (short races: VO2max intervals and reps around threshold; long races:
// extended threshold, race-pace rehearsal, over/unders, occasional intervals).
const ROTATIONS = {
  build:   { short:['tempo','hills','cruise','intervals','tempo','hills'], long:['tempo','hills','cruise','progression','tempo','hills'] },
  peak:    { short:['intervals','cruise','reps','intervals','tempo','reps'], long:['tempo','racepace','cruise','overunder','intervals','racepace'] },
  buildHilly: { short:['hills','tempo','hills','cruise','intervals','hills'], long:['hills','tempo','hills','cruise','progression','hills'] },
  peakHilly:  { short:['intervals','hills','cruise','reps','hills','tempo'], long:['tempo','hills','racepace','cruise','hills','overunder'] },
  secondary: { short:['hills','fartlek','cruise','progression'], long:['fartlek','progression','hills','cruise'] },
};
function rotationFor(phase, cls, isHilly, secondary){
  const key = secondary ? 'secondary' : (phase==='peak' ? (isHilly?'peakHilly':'peak') : (isHilly?'buildHilly':'build'));
  return ROTATIONS[key][cls==='5k'||cls==='10k' ? 'short' : 'long'];
}

/* ============================= week builder ============================= */
// spec: {weekStart, weeklyKm, longKm, longDow, phase, isCutback, weekIndex, weekInBlock,
//        quality:[{dow,type,km,warmupKm,cooldownKm,qualityKm}], runsPerWeek, strides:0..2,
//        strengthDows, strengthPerWeek, raceKm, raceDate(optional), paces, varietyType,
//        medLong:bool, longRacePaceKm, isHilly}
function buildWeekDays(spec){
  const days = [];
  for(let d=0; d<7; d++){
    const date = addDays(spec.weekStart, d);
    const daysToRace = spec.raceDate ? daysBetween(date, spec.raceDate) : null;
    days.push({id:uid(), date:fmtDate(date), dow:date.getDay(), type:'rest', km:0, strength:false, label:'Rest', notesOverride:null, treadmillHills:false, warmupKm:0, cooldownKm:0, daysToRace});
  }
  const longIdx = days.findIndex(x=>x.dow===spec.longDow);
  let remaining = Math.max(0, spec.weeklyKm - spec.longKm);
  const qualityIdxs = [];
  (spec.quality||[]).forEach(q=>{
    const idx = days.findIndex((x,i)=>x.dow===q.dow && x.type==='rest' && i!==longIdx);
    if(idx===-1) return;
    days[idx] = {...days[idx], type:q.type, km:q.km, label:TYPE_LABELS[q.type], warmupKm:q.warmupKm||0, cooldownKm:q.cooldownKm||0, qualityKm:q.qualityKm||0, secondary:!!q.secondary};
    qualityIdxs.push(idx);
    remaining = Math.max(0, remaining - q.km);
  });
  const usedRunDays = (spec.longKm>0?1:0) + qualityIdxs.length;
  const easyDaysNeeded = Math.max(0, spec.runsPerWeek - usedRunDays);
  const forced = new Set(spec._forceRest||[]);
  const candidateIdxs = days.map((x,i)=>i).filter(i=>i!==longIdx && !qualityIdxs.includes(i) && !forced.has(days[i].dow));
  // Easy days go where they space the week best: each pick maximises the gap to the runs
  // already placed (long + quality + earlier picks), so three run days never bunch together
  // while rest days sit unused. Ties go to the day after the long run (the recovery slot)
  // once the week has four or more runs.
  const runIdxs = [longIdx, ...qualityIdxs].filter(i=>i>=0);
  const easyIdxs = [];
  for(let k=0; k<easyDaysNeeded; k++){
    let best=null, bestScore=-Infinity;
    candidateIdxs.forEach(i=>{
      if(easyIdxs.includes(i)) return;
      const placed = runIdxs.concat(easyIdxs);
      const gap = placed.length ? Math.min(...placed.map(j=>circularDayDist(days[i].dow, days[j].dow))) : 7;
      const afterLong = longIdx>=0 && days[i].dow===(spec.longDow+1)%7;
      const nextIsHard = runIdxs.some(j=>days[j].dow===(days[i].dow+1)%7);
      const score = gap*10 + (afterLong && spec.runsPerWeek>=4 ? 3 : 0) + (nextIsHard ? 0 : 1) - i*0.01;
      if(score>bestScore){ bestScore=score; best=i; }
    });
    if(best==null) break;
    easyIdxs.push(best);
  }
  easyIdxs.sort((a,b)=>a-b);

  const recoveryIdx = easyIdxs.length>=2 ? easyIdxs.find(i=>days[i].dow===(spec.longDow+1)%7) : undefined;
  let aerobicIdx = null;
  if(spec.medLong && easyIdxs.length>=2){
    const cands = easyIdxs.filter(i=>i!==recoveryIdx);
    aerobicIdx = cands.reduce((best,i)=> circularDayDist(days[i].dow,spec.longDow) > circularDayDist(days[best].dow,spec.longDow) ? i : best, cands[0]);
  }
  const thinPool = easyIdxs.length>0 && remaining/easyIdxs.length < 4;
  const weight = i => thinPool ? 1 : i===recoveryIdx ? 0.6 : i===aerobicIdx ? 1.45 : 1.0;
  const totalW = easyIdxs.reduce((s,i)=>s+weight(i),0);
  // Caps: a plain easy day stays well under the long run; the medium-long day may reach 80%.
  // Plain easy days stay clearly shorter than the long run; the medium-long day may approach
  // it. With few run days the cap loosens (a 3-day runner's "easy" days are long by nature).
  const easyCapFrac = spec.runsPerWeek<=3 ? 0.95 : spec.runsPerWeek===4 ? 0.90 : 0.85, medCapFrac = 0.92;
  let capScale = 1;
  // Strides are funded from the easy pool first so the week total stays honest.
  const stridesEligible = easyIdxs.filter(i=>i!==recoveryIdx);
  const stridesIdxs = [];
  if(aerobicIdx!=null && spec.strides>0) stridesIdxs.push(aerobicIdx);
  stridesEligible.forEach(i=>{ if(stridesIdxs.length<(spec.strides||0) && !stridesIdxs.includes(i)) stridesIdxs.push(i); });
  const stridesKmFor = i => (i===aerobicIdx && spec.isHilly) ? HILL_STRIDES_EXTRA_KM : STRIDES_EXTRA_KM;
  const capRef = Math.max(spec.longKm, spec.capRefLongKm||0);
  const capFor = i => capRef>0 ? Math.min(capRef*0.95, (i===aerobicIdx ? capRef*medCapFrac : capRef*easyCapFrac)*capScale) - (stridesIdxs.includes(i)?stridesKmFor(i):0) : Infinity;
  remaining = Math.max(0, remaining - stridesIdxs.reduce((s,i)=>s+stridesKmFor(i),0));
  // Distribute with caps; water-fill so capped mileage flows to the other easy days.
  const alloc = {};
  let pool = remaining, open = easyIdxs.slice();
  for(let pass=0; pass<8 && pool>0.05; pass++){
    if(!open.length){ if(capScale>=1.15) break; capScale += 0.08; open = easyIdxs.slice(); } // overflow: let easy days creep toward the long run before leaving miles unplaced
    if(!open.length) break;
    const w = open.reduce((s,i)=>s+weight(i),0);
    const next = [];
    let used = 0;
    open.forEach(i=>{ const share = pool*weight(i)/w; const cap = capFor(i)-(alloc[i]||0); const give = Math.min(share, cap); alloc[i]=(alloc[i]||0)+give; used+=give; if(give<share-0.01){} else next.push(i); });
    pool -= used; open = next;
  }
  // A token easy day (under ~2 km) helps nobody: turn it into rest and give its distance to
  // the others. (Shakeout/taper days are handled by the race-week pass, not here.)
  const tooSmall = easyIdxs.filter(i=>(alloc[i]||0) < 2.0);
  if(tooSmall.length && !spec._noShrink){
    const dropIdx = tooSmall.sort((a,b)=>(alloc[a]||0)-(alloc[b]||0))[0];
    return buildWeekDays({...spec, _noShrink: spec.runsPerWeek<=1, runsPerWeek: Math.max(0, spec.runsPerWeek-1), _forceRest:(spec._forceRest||[]).concat(days[dropIdx].dow)});
  }
  const unplaced = round1(pool);
  const varietyIdx = (spec.varietyType && easyIdxs.filter(i=>i!==recoveryIdx && i!==aerobicIdx).length) ? easyIdxs.filter(i=>i!==recoveryIdx && i!==aerobicIdx)[0] : null;
  easyIdxs.forEach(i=>{
    const isVariety = i===varietyIdx;
    const role = (i===recoveryIdx && (alloc[i]||0) <= 9.5) ? 'recovery' : i===aerobicIdx ? 'aerobic' : 'easy';
    days[i] = {...days[i], type: isVariety ? spec.varietyType : 'easy', km: round1((alloc[i]||0) + (stridesIdxs.includes(i)?stridesKmFor(i):0)),
      label: isVariety ? TYPE_LABELS[spec.varietyType] : (role==='recovery' ? 'Recovery Run' : role==='aerobic' ? 'Medium-Long Run' : 'Easy Run'),
      easyRole: role, strides: stridesIdxs.includes(i), hillStrides: i===aerobicIdx && stridesIdxs.includes(i) && !!spec.isHilly,
      terrain: i===aerobicIdx ? (spec.isHilly?'hilly':'suggested') : null, progressionEasy: isVariety && spec.varietyType==='progression', easyVariety: isVariety};
  });
  if(spec.longKm>0){
    const rp = spec.longRacePaceKm||0;
    days[longIdx] = {...days[longIdx], type:'long', km:round1(spec.longKm), label:'Long Run', terrain: spec.isHilly?'hilly':'suggested', racePaceKm: rp>0.5 ? round1(rp) : 0, racePaceKmLabel: rp>0.5 ? fmtDist(rp, spec.unit||'km', spec.unit==='mi'?1:0) : null};
  }
  return {days, unplacedKm: unplaced};
}
function finishWeekDays(days, raceKm){ days.forEach(day=>{ Object.assign(day, buildWorkoutMeta(day, raceKm)); }); }

/* ============================= race plan ============================= */
function generatePlan(setup, dayOneOverride){
  const warnings = [];
  const raceDate = parseDate(setup.raceDate);
  const weekStart0 = startOfWeek(dayOneOverride || todayDate(), setup.weekStartDow);
  const totalDays = daysBetween(weekStart0, raceDate);
  const totalWeeks = Math.max(1, Math.ceil((totalDays+1)/7));
  const raceKm = setup.raceDistanceKm;
  const cls = raceClass(raceKm);
  const isHilly = setup.hillsMode==='hilly';
  const unit = setup.units||'km';
  const athlete = buildAthlete(setup);
  const currentKm = Math.max(5, athlete.weeklyKm || 10);
  // More run days than the volume can fill produces token runs; cap so the average run is
  // at least ~4.5 km, and say so.
  const requestedRuns = clamp(setup.runsPerWeek || runsPerWeekFor(currentKm), 3, 7);
  const runsPerWeek = clamp(Math.min(requestedRuns, Math.max(3, Math.floor(currentKm/5.5))), 3, 7);
  const longDow = setup.longDow ?? 0;
  const longEmphasis = setup.longRunEmphasis||'balanced', speedEmphasis = setup.speedEmphasis||'balanced';

  // --- taper geometry, by days before the race ---
  // taperMode: 'full' (default), 'light' (half the length, half the volume cut), or 'none'
  // (train through - only race day and the day before are protected; strength continues).
  const taperMode = ['full','light','none'].includes(setup.taperMode) ? setup.taperMode : 'full';
  const taperDays = taperMode==='none' ? 0 : taperMode==='light' ? Math.ceil(taperDaysFor(raceKm)/2) : taperDaysFor(raceKm);
  const strengthCutoffDays = taperMode==='none' ? 1 : taperMode==='light' ? 5 : 10;
  const weekMidDaysToRace = w => daysBetween(addDays(weekStart0, w*7+3), raceDate);
  const isTaperWeek = w => taperDays>0 && weekMidDaysToRace(w) <= taperDays;
  let nTrain = 0; while(nTrain<totalWeeks && !isTaperWeek(nTrain)) nTrain++;
  if(nTrain===0 && totalWeeks>1) nTrain = 1; // always at least one training week when there's time
  const nTaper = totalWeeks - nTrain;

  // --- volume ramp (training weeks) ---
  const userCap = setup.maxWeeklyKm>0 ? setup.maxWeeklyKm : Infinity;
  const startVol = Math.min(currentKm, userCap);
  let targetPeak = Math.min(targetPeakWeeklyKm(raceKm, currentKm, longEmphasis, nTrain), userCap);
  const trimming = targetPeak < startVol-0.5; // short race, runner well above what it needs
  // cutback every 4th week, never the final training week (the taper follows it anyway)
  const cutbackAt = new Set();
  for(let i=3;i<nTrain;i+=4) cutbackAt.add(i);
  if(cutbackAt.has(nTrain-1)){ cutbackAt.delete(nTrain-1); if(nTrain-2>=2) cutbackAt.add(nTrain-2); }
  const vols = [], cutbacks = [];
  let lastFull = startVol;
  const holding = Math.abs(targetPeak-startVol) <= 0.5;
  for(let i=0;i<nTrain;i++){
    const cb = cutbackAt.has(i);
    let v;
    if(i===0) v = startVol;
    else if(cb) v = lastFull*((holding||trimming)?0.85:0.80);
    else if(trimming) v = Math.max(targetPeak, lastFull*0.95); // ease down over a couple of weeks
    else v = Math.min(lastFull*(1+weeklyGrowthRateFor(lastFull)), targetPeak);
    if(!cb) lastFull = v;
    vols.push(round1(v)); cutbacks.push(cb);
  }
  const peakWeeklyKm = vols.length ? Math.max(...vols) : startVol;
  if(targetPeak - peakWeeklyKm > 5 && cls!=='5k' && cls!=='10k'){
    warnings.push(`${totalWeeks} weeks only allows a safe build to about ${fmtDist(peakWeeklyKm,unit,0)}/week, short of the ${fmtDist(targetPeak,unit,0)}/week a ${raceLabelKm(raceKm)} ideally peaks at from your current mileage. The plan stays conservative rather than rushing it.`);
  }

  // --- phases across training weeks ---
  const fitnessRatio = clamp(startVol/Math.max(targetPeak,1), 0, 1);
  if(runsPerWeek < requestedRuns) warnings.push(`${requestedRuns} running days at ${fmtDist(currentKm,unit,0)}/week would mean runs shorter than about 3 miles, so the plan uses ${runsPerWeek} days and keeps every run worth lacing up for. Add mileage and the extra day comes back.`);
  if(raceKm>=15 && currentKm < raceKm*1.6) warnings.push(`${fmtDist(currentKm,unit,0)}/week is low for a ${raceLabelKm(raceKm)}. The plan builds what it safely can, but expect to treat this one as a completion goal unless the mileage comes up first.`);
  if(trimming) warnings.push(`You already run more than a ${raceLabelKm(raceKm)} needs, so the plan eases volume down about 10% to ${fmtDist(targetPeak,unit,0)}/week and spends the freed-up recovery on sharper quality sessions.`);
  const baseFrac = interp([[0.5,0.45],[0.7,0.30],[0.85,0.18],[1,0.12]], fitnessRatio);
  let baseCount = setup.skipBase ? 0 : (nTrain>=4 ? clamp(Math.round(nTrain*baseFrac), 1, 6) : (nTrain>=2 && fitnessRatio<0.7 ? 1 : 0));
  if(athlete.vdotBasis!=='race' && !setup.skipBase && nTrain>=4) baseCount = Math.max(baseCount, 2);
  const rem = Math.max(0, nTrain-baseCount);
  const buildCount = rem>=2 ? Math.round(rem*0.5) : (rem===1 ? 0 : 0);
  const peakCount = rem - buildCount;
  const phaseFor = w => w>=nTrain ? 'taper' : w<baseCount ? 'base' : w<baseCount+buildCount ? 'build' : 'peak';

  // --- long run ramp ---
  const peakLong = Math.min(peakLongTargetKm(raceKm, peakWeeklyKm, longEmphasis, runsPerWeek), setup.maxLongRunKm>0 ? setup.maxLongRunKm : Infinity);
  const longStep = (cls==='marathon' ? 2.0 : cls==='half' ? 1.6 : 1.3) * (longEmphasis==='high' ? 1.15 : longEmphasis==='low' ? 0.9 : 1);
  const startFrac = 0.26 + (runsPerWeek<=3 ? 0.07 : runsPerWeek===4 ? 0.04 : 0);
  const naturalStart = athlete.longestKm!=null ? Math.min(athlete.longestKm, longFracCap(raceKm, startVol, runsPerWeek)*startVol) : startVol*startFrac;
  const startLong = clamp(naturalStart, Math.min(6, startVol*0.3), peakLong);
  const longs = [];
  let lastLong = startLong;
  for(let i=0;i<nTrain;i++){
    const weekVol = vols[i];
    const cap = Math.min(peakLong, longFracCap(raceKm, weekVol, runsPerWeek)*weekVol, kmForMinutes(longTimeCapMin(raceKm), athlete.zones.longPerKm));
    let L;
    if(i===0) L = Math.min(startLong, cap);
    else if(cutbacks[i]) L = Math.min(lastLong*0.78, cap);
    else L = Math.min(lastLong + longStep, cap);
    if(!cutbacks[i]) lastLong = L;
    longs.push(round1(L));
  }
  const achievedPeakLong = longs.length ? Math.max(...longs) : startLong;
  if(peakLong - achievedPeakLong > peakLong*0.15){
    warnings.push(`There isn't time to build the long run all the way to ${fmtDist(peakLong,unit,0)} safely — it tops out near ${fmtDist(achievedPeakLong,unit,0)}. Treat this race as a strong effort rather than an all-out time goal, or push the date back if you can.`);
  }

  // --- fitness, paces, goal ---
  const startVdot = athlete.vdot;
  const qualityWeeks = buildCount + peakCount;
  const endVdot = startVdot + Math.min(3, qualityWeeks/6); // Daniels: ~1 VDOT per 6 weeks of good training
  const prediction = athlete.races.length ? predictRace(athlete, raceKm) : null;
  const goal = assessGoal(prediction, setup.goalTimeSec);
  let racePerKm;
  if(setup.goalTimeSec){
    racePerKm = (goal.status==='beyond' ? goal.cappedSec : setup.goalTimeSec)/raceKm;
    if(goal.status==='beyond') warnings.push(`Your goal of ${secToClock(setup.goalTimeSec)} is well beyond what your recent result supports (about ${secToClock(prediction.lowSec)}–${secToClock(prediction.highSec)}). Race-pace work is set at ${secToClock(goal.cappedSec)} pace instead, so you rehearse something your fitness can hold; a tune-up race partway through can reset this.`);
    else if(goal.status==='ambitious') warnings.push(`Your goal of ${secToClock(setup.goalTimeSec)} is at the optimistic end of what your recent result supports (about ${secToClock(prediction.lowSec)}–${secToClock(prediction.highSec)}). Worth chasing, but expect the race-pace sessions to feel like work.`);
  } else {
    racePerKm = prediction ? prediction.sec/raceKm : predictedPaceSecPerKmFromVdot(endVdot, raceKm);
  }
  if(prediction) prediction.notes.forEach(n=>warnings.push(n));
  const rampWeeks = Math.max(nTrain-1, 1);
  const vdotForWeek = w => { if(w>=nTrain) return endVdot; const q0 = baseCount; if(w<q0) return startVdot; return startVdot + (endVdot-startVdot)*clamp((w-q0+1)/Math.max(qualityWeeks,1), 0, 1); };

  // --- quality configuration ---
  // Second quality day: 'balanced' adds it once the week has five runs and 40 km to carry it;
  // 'high' adds it from five runs and 30 km, or with four runs at 70+ km (the lone easy day
  // is then long enough to absorb the rest); 'low' never adds it and holds quality for the
  // final phase. Emphasis also scales the session length (0.85 / 1 / 1.1).
  const nQualityMax = speedEmphasis==='low' ? 1
    : speedEmphasis==='high' ? (((runsPerWeek>=5 && currentKm>=30) || (runsPerWeek===4 && currentKm>=70)) ? 2 : 1)
    : ((runsPerWeek>=5 && currentKm>=40) ? 2 : 1);
  const qDows = qualityDowsFor(longDow, nQualityMax);
  const introducePhase = speedEmphasis==='low' ? 'peak' : 'build';
  const sessionScale = speedEmphasis==='high' ? 1.1 : speedEmphasis==='low' ? 0.85 : 1;
  const medLong = runsPerWeek>=5 && (cls==='half' || cls==='marathon' || cls==='mid');

  const weeks = [];
  for(let w=0; w<totalWeeks; w++){
    const weekStart = addDays(weekStart0, w*7);
    const phase = phaseFor(w);
    const isCutback = w<nTrain && cutbacks[w];
    const weekInBlock = w<nTrain ? (w%4) : 0;
    const weekVdot = vdotForWeek(w);
    const paces = zonesForVdot(athlete, weekVdot); paces.racePerKm = racePerKm;
    const midD = weekMidDaysToRace(w);
    const longDate = (()=>{ for(let d=0; d<7; d++){ const dt=addDays(weekStart,d); if(dt.getDay()===longDow) return dt; } return weekStart; })();
    const longD = daysBetween(longDate, raceDate);

    let weeklyKm, longKm;
    if(w<nTrain){ weeklyKm = vols[w]; longKm = longs[w]; if(taperDays>0 && longD>0 && longD<=taperDays) longKm = round1(Math.min(longKm, achievedPeakLong*taperLongFactor(raceKm, longD))); }
    else {
      const vf = taperVolumeFactor(raceKm, Math.max(0,midD)), lf = longD>0 ? taperLongFactor(raceKm, longD) : 0;
      const soften = f => taperMode==='light' ? 1-(1-f)*0.5 : f;
      weeklyKm = round1(peakWeeklyKm*soften(vf)); longKm = longD>0 ? round1(achievedPeakLong*soften(lf)) : 0;
    }

    // quality sessions this week
    const quality = [];
    const t = phase==='build' ? clamp((w-baseCount)/Math.max(buildCount-1,1),0,1) : phase==='peak' ? clamp((w-baseCount-buildCount)/Math.max(peakCount-1,1),0,1) : 1;
    const wantsQuality = phase==='taper' || (phase==='peak') || (phase==='build' && introducePhase==='build');
    if(wantsQuality && longKm>0 || (phase==='taper' && weeklyKm>0)){
      if(phase==='taper'){
        // Keep intensity, cut volume: one race-specific sharpener at ~60% of a normal session,
        // placed on the primary quality day if it falls >= 3 days before the race.
        const qd = qDows[0];
        const qDate = (()=>{ for(let d=0; d<7; d++){ const dt=addDays(weekStart,d); if(dt.getDay()===qd) return dt; } return null; })();
        const dq = qDate ? daysBetween(qDate, raceDate) : -1;
        if(dq>=3){
          // Keep intensity, shed volume: a race-specific rehearsal three weeks out, a crisp
          // threshold session two weeks out, and a short race-pace tune-up in race week.
          const short = cls==='5k'||cls==='10k';
          const type = dq>14 ? (short ? 'intervals' : 'racepace') : dq>7 ? 'cruise' : (short ? 'reps' : 'racepace');
          const sc = (dq>14 ? 0.75 : dq>7 ? 0.65 : 0.5)*sessionScale;
          const s = sizeQuality(type, cls, 'peak', 0.3, sc, Math.max(weeklyKm, peakWeeklyKm*0.6), Math.max(longKm, achievedPeakLong*0.6), raceKm, paces);
          quality.push({dow:qd, type, scale:sc, ...s});
        }
      } else {
        const rot = rotationFor(phase, cls, isHilly, false);
        const idx = phase==='build' ? (w-baseCount) : (w-baseCount-buildCount);
        const type = rot[idx % rot.length];
        const s = sizeQuality(type, cls, phase, t, sessionScale*(isCutback?0.8:1), weeklyKm, longKm, raceKm, paces);
        quality.push({dow:qDows[0], type, scale:sessionScale*(isCutback?0.8:1), ...s});
        if(nQualityMax>=2 && !isCutback){
          const rot2 = rotationFor(phase, cls, isHilly, true);
          let type2 = rot2[idx % rot2.length]; if(type2===type) type2 = rot2[(idx+1)%rot2.length];
          const s2 = sizeQuality(type2, cls, phase, t, 0.65*sessionScale, weeklyKm, longKm, raceKm, paces);
          quality.push({dow:qDows[1], type:type2, scale:0.65*sessionScale, secondary:true, ...s2});
        }
      }
    }
    // At very low volume the session floors can make a quality day as long as the long run;
    // the long run always stays the week's longest run.
    if(quality.length && longKm>0){
      const maxQ = Math.max(...quality.map(q=>q.km));
      const qTotal = quality.reduce((a,q)=>a+q.km,0);
      const roomForEasy = weeklyKm - qTotal - 2.5*Math.max(0, runsPerWeek-1-quality.length);
      if(longKm < maxQ+0.6) longKm = round1(Math.max(longKm, Math.min(maxQ+0.6, roomForEasy, kmForMinutes(longTimeCapMin(raceKm), paces.longPerKm))));
    }
    // Race-pace finish inside the long run: half/marathon peak phase, alternate weeks.
    let longRacePaceKm = 0;
    const hasRacePaceSession = quality.some(q=>q.type==='racepace');
    if((cls==='marathon' || cls==='half') && phase==='peak' && !isCutback && !hasRacePaceSession && ((w-baseCount-buildCount)%2===1) && longKm>=14){
      longRacePaceKm = round1(longKm*(cls==='marathon' ? 0.4 : 0.3));
    }
    const varietyType = phase==='base' && w%2===1 ? (Math.floor(w/2)%2===0 ? 'fartlek' : 'progression') : null;
    const strides = phase==='base' || phase==='build' ? 2 : phase==='peak' ? 1 : (midD>2 ? 1 : 0);

    const buildOnce = vol => buildWeekDays({weekStart, weeklyKm:vol, longKm, longDow, phase, isCutback, weekIndex:w, quality, runsPerWeek, strides,
      raceKm, raceDate, paces, varietyType, medLong, longRacePaceKm, isHilly, unit, capRefLongKm: phase==='taper' ? achievedPeakLong*0.7 : 0});
    let built = buildOnce(weeklyKm);
    const firstUnplaced = built.unplacedKm;
    if(built.unplacedKm > weeklyKm*0.03 && quality.length){
      // The week can't hold its nominal volume on this many run days: shrink to what fits and
      // re-size the quality sessions against that, so every percentage rule holds for real.
      weeklyKm = round1(weeklyKm - built.unplacedKm);
      quality.forEach(q=>{ Object.assign(q, sizeQuality(q.type, cls, phase==='taper'?'peak':phase, t, q.scale||1, weeklyKm, Math.max(longKm, 4), raceKm, paces)); });
      built = buildOnce(weeklyKm);
    }
    const days = built.days;
    if(firstUnplaced>Math.max(1, weeklyKm*0.05) && w<nTrain && !warnings.some(x=>x.startsWith('With '))){
      warnings.push(`With ${runsPerWeek} running days, ${fmtDist(weeklyKm,unit,0)}/week means very long easy days. The plan caps easy runs below the long run and lets the week come in a little under target — adding a running day would fix that.`);
    }

    // race week / post-race days
    for(let i=0;i<7;i++){
      const d = days[i];
      if(d.daysToRace===0){ days[i] = {...d, type:'race', km:raceKm, label:'Race Day', strides:false, easyRole:null, terrain:null, warmupKm:0, cooldownKm:0, racePaceKm:0, easyVariety:false, progressionEasy:false}; }
      else if(d.daysToRace===1){
        // Day before: rest when tapering; training through keeps a short easy run if one
        // was planned (a hard session there is never right).
        if(taperMode==='none' && d.type!=='rest') days[i] = {...d, type:'easy', km:round1(clamp(kmForMinutes(20, paces.easyPerKm), 2, 5)), label:'Shakeout Jog', easyRole:'recovery', strides:true, hillStrides:false, terrain:null, easyVariety:false, progressionEasy:false, warmupKm:0, cooldownKm:0};
        else days[i] = {...d, type:'rest', km:0, label:'Rest', strides:false, easyRole:null, terrain:null, warmupKm:0, cooldownKm:0, easyVariety:false, progressionEasy:false};
      }
      else if(d.daysToRace===2 && d.type!=='rest' && taperMode!=='none'){ days[i] = {...d, type:'easy', km:round1(clamp(kmForMinutes(20, paces.easyPerKm), 2, 5)), label:'Shakeout Jog', easyRole:'recovery', strides:true, hillStrides:false, terrain:null, easyVariety:false, progressionEasy:false, warmupKm:0, cooldownKm:0}; }
      else if(d.daysToRace===2 && taperMode==='none' && isLegDemandingDay(d)){ days[i] = {...d, type:'easy', km:round1(Math.min(d.km, kmForMinutes(40, paces.easyPerKm))), label:'Easy Run', easyRole:'easy', strides:true, hillStrides:false, terrain:null, easyVariety:false, progressionEasy:false, warmupKm:0, cooldownKm:0, racePaceKm:0}; }
      else if(d.daysToRace!=null && d.daysToRace<0){ days[i] = {...d, type:'rest', km:0, label:'Rest', strides:false, easyRole:null, terrain:null, warmupKm:0, cooldownKm:0, easyVariety:false, progressionEasy:false}; }
    }
    finishWeekDays(days, raceKm);
    const minDaysToRace = Math.min(...days.map(d=>d.daysToRace));
    placeStrengthDays(days, setup.strengthDows, setup.strengthPerWeek, phase, w, {minDaysToRace, weekInBlock, strengthCutoffDays, trainThrough: taperMode==='none', equipment: setup.equipment});

    weeks.push({weekIndex:w, phase, isCutback, weekStart:fmtDate(weekStart), targetKm:round1(days.reduce((s,d)=>s+d.km,0)), plannedKm:weeklyKm, nominalKm: w<nTrain ? vols[w] : weeklyKm, paces, days, baselineVdot:weekVdot, daysToRaceAtStart: daysBetween(weekStart, raceDate)});
  }

  return {
    generatedAt:new Date().toISOString(), engineVersion:ENGINE_VERSION, raceDate:setup.raceDate, raceDistanceKm:raceKm, totalWeeks,
    athlete:{races:athlete.races, weeklyKm:athlete.weeklyKm, longestKm:athlete.longestKm, vdot:athlete.vdot, marathonSec:athlete.marathonSec},
    startVdot, endVdot, buildWeeksCount:nTrain, rampWeeks, taperDays, taperWeeks:nTaper, taperMode,
    goalRacePerKm: setup.goalTimeSec ? racePerKm : null, racePerKm,
    prediction, goalStatus: goal.status, peakWeeklyKm, peakLongKm: achievedPeakLong, warnings, runsPerWeek, longTimeCapMin: longTimeCapMin(raceKm),
    paces:weeks[0].paces, weeks,
  };
}

/* ============================= general (non-race) plans ============================= */
const PLAN_KIND_META = {
  speed:      { label:'Build Speed',    weeksMin:4, weeksMax:16, weeksDefault:8,  hint:'6–12 weeks is the typical effective window for a focused speed block.' },
  distance:   { label:'Build Distance', weeksMin:4, weeksMax:52, weeksDefault:10, hint:'Longer, patient ramps are safer than short aggressive ones.' },
  maintenance:{ label:'Maintenance',    weeksMin:1, weeksMax:52, weeksDefault:6,  hint:'No natural end point — regenerate to keep going whenever you like.' },
  recovery:   { label:'Recovery',       weeksMin:1, weeksMax:6,  weeksDefault:2,  hint:'Past 4 weeks this stops being "recovery" — consider Maintenance or Build Distance instead.' },
};
function finishGeneralPlan(setup, weeks, startVdot, endVdot, extra){
  const lastDay = weeks[weeks.length-1].days[6];
  const athlete = buildAthlete(setup);
  const runsUsed = Math.max(...weeks.map(w=>w.days.filter(d=>d.km>0).length));
  const shortfall = weeks.some(w=>w.plannedKm && w.targetKm < w.plannedKm*0.92);
  const warnings = shortfall ? [`With ${runsUsed} running days, ${fmtDist(athlete.weeklyKm, setup.units||'km', 0)}/week means very long easy days. The plan caps easy runs below the long run and lets the week come in under target — adding a running day would fix that.`] : [];
  return {
    runsPerWeek: runsUsed, longTimeCapMin: (setup.planKind==='distance' && setup.distanceGoalMetric==='longest') ? 195 : 150,
    generatedAt:new Date().toISOString(), engineVersion:ENGINE_VERSION, planKind:setup.planKind,
    athlete:{races:athlete.races, weeklyKm:athlete.weeklyKm, longestKm:athlete.longestKm, vdot:athlete.vdot, marathonSec:athlete.marathonSec},
    raceDate:lastDay.date, raceDistanceKm:null, totalWeeks:weeks.length,
    startVdot, endVdot, buildWeeksCount:weeks.length, rampWeeks:Math.max(weeks.length-1,1),
    goalRacePerKm:null, paces:weeks[0].paces, weeks, warnings, ...(extra||{}),
  };
}
function generalWeekCommon(setup){
  const athlete = buildAthlete(setup);
  const currentKm = Math.max(5, athlete.weeklyKm||10);
  return {athlete, currentKm, longDow:setup.longDow ?? 0, runsPerWeek: clamp(Math.min(setup.runsPerWeek || runsPerWeekFor(currentKm), Math.max(3, Math.floor(currentKm/5.5))),3,7), weekStart0: startOfWeek(setup._dayOne || todayDate(), setup.weekStartDow), unit:setup.units||'km', isHilly:false};
}
// Build Speed: 3:1 waves, two quality sessions (when the week has >= 4 runs), long run held
// near 25%, strength twice a week - the evidence-backed dose for economy gains.
function generateSpeedPlan(setup, dayOneOverride){
  const c = generalWeekCommon({...setup, _dayOne:dayOneOverride});
  const weeks = setup.weeks;
  const startVdot = c.athlete.vdot, endVdot = startVdot + Math.min(2, weeks/6);
  const nQ = c.runsPerWeek>=5 ? 2 : 1;
  const qDows = qualityDowsFor(c.longDow, nQ);
  const list = [];
  for(let w=0; w<weeks; w++){
    const weekStart = addDays(c.weekStart0, w*7);
    const cycle = Math.floor(w/4), inCycle = w%4, isCutback = inCycle===3 && w<weeks-1;
    const weeklyKm = round1(c.currentKm*(1+Math.min(cycle*0.04,0.12))*(isCutback?0.85:1+0.04*inCycle));
    const vdot = startVdot + (endVdot-startVdot)*(weeks<=1?1:w/(weeks-1));
    const paces = zonesForVdot(c.athlete, vdot); paces.racePerKm = null;
    const longKm = round1(clamp(weeklyKm*(c.runsPerWeek<=4 ? 0.32 : 0.27), 6, kmForMinutes(120, paces.longPerKm)));
    const rot = ['tempo','intervals','cruise','hills','reps','tempo'];
    const type = rot[w%rot.length];
    const s = sizeQuality(type, '10k', inCycle>=2?'peak':'build', inCycle/3, isCutback?0.8:1, weeklyKm, longKm, 10, paces);
    const quality = [{dow:qDows[0], type, ...s}];
    if(nQ>=2 && !isCutback){ const t2 = ['hills','fartlek','cruise','progression'][w%4]; const s2 = sizeQuality(t2, '10k', 'build', 0.5, 0.65, weeklyKm, longKm, 10, paces); quality.push({dow:qDows[1], type:t2, secondary:true, ...s2}); }
    const longKmAdj = Math.max(longKm, round1(Math.min(Math.max(...quality.map(q=>q.km))+0.6, kmForMinutes(150, paces.longPerKm))));
    const built = buildWeekDays({weekStart, weeklyKm, longKm:longKmAdj, longDow:c.longDow, phase:'build', isCutback, weekIndex:w, quality, runsPerWeek:c.runsPerWeek, strides:1, raceKm:10, paces, medLong:false, unit:c.unit});
    finishWeekDays(built.days, 10);
    placeStrengthDays(built.days, setup.strengthDows, setup.strengthPerWeek==null?2:setup.strengthPerWeek, isCutback?'cutback':'build', w, {weekInBlock:inCycle, equipment: setup.equipment});
    list.push({weekIndex:w, phase:isCutback?'cutback':'build', isCutback, weekStart:fmtDate(weekStart), targetKm:round1(built.days.reduce((s,d)=>s+d.km,0)), plannedKm:weeklyKm, paces, days:built.days, baselineVdot:vdot});
  }
  return finishGeneralPlan(setup, list, startVdot, endVdot);
}
const DISTANCE_LONG_FRACTION = 0.28;
function generateDistancePlan(setup, dayOneOverride){
  const c = generalWeekCommon({...setup, _dayOne:dayOneOverride});
  const weeks = setup.weeks;
  const metric = setup.distanceGoalMetric;
  const fromKm = setup.distanceGoalCurrentKm||c.currentKm, toKm = setup.distanceGoalTargetKm||fromKm;
  const paces = zonesForVdot(c.athlete, c.athlete.vdot); paces.racePerKm = null;
  const list = [];
  let prevVal = fromKm, prevFull = fromKm;
  for(let w=0; w<weeks; w++){
    const weekStart = addDays(c.weekStart0, w*7);
    const t = weeks<=1 ? 1 : w/(weeks-1);
    const isCutback = w>0 && w<weeks-1 && (w%4===3);
    // ramp toward the target, never more than 12% over the last full week; cutbacks sit 15% under
    const val = w===0 ? fromKm : isCutback ? prevFull*0.85 : Math.min(fromKm*Math.pow(toKm/fromKm, t), prevFull*1.12);
    if(!isCutback) prevFull = val;
    prevVal = val;
    let weeklyKm, longKm;
    if(metric==='longest'){ longKm = round1(Math.min(val, kmForMinutes(195, paces.longPerKm))); weeklyKm = round1(Math.max(longKm/DISTANCE_LONG_FRACTION, c.currentKm)); if(isCutback && list.length) weeklyKm = round1(Math.min(weeklyKm, list[list.length-1].plannedKm*0.85)); }
    else weeklyKm = round1(val);
    const runs = clamp(Math.min(setup.runsPerWeek || runsPerWeekFor(weeklyKm), Math.max(3, Math.floor(weeklyKm/5.5))), 3, 7);
    if(metric!=='longest') longKm = round1(Math.min(weeklyKm*(runs<=4 ? 0.33 : DISTANCE_LONG_FRACTION), kmForMinutes(150, paces.longPerKm)));
    const built = buildWeekDays({weekStart, weeklyKm, longKm, longDow:c.longDow, phase:'base', isCutback, weekIndex:w, quality:[], runsPerWeek:runs, strides:1, raceKm:10, paces, medLong:runs>=5, unit:c.unit});
    finishWeekDays(built.days, 10);
    placeStrengthDays(built.days, setup.strengthDows, setup.strengthPerWeek==null?1:setup.strengthPerWeek, isCutback?'cutback':'base', w, {weekInBlock:w%4, equipment: setup.equipment});
    list.push({weekIndex:w, phase:isCutback?'cutback':'base', isCutback, weekStart:fmtDate(weekStart), targetKm:round1(built.days.reduce((s,d)=>s+d.km,0)), plannedKm:weeklyKm, paces, days:built.days, baselineVdot:c.athlete.vdot});
  }
  return finishGeneralPlan(setup, list, c.athlete.vdot, c.athlete.vdot);
}
function generateMaintenancePlan(setup, dayOneOverride){
  const c = generalWeekCommon({...setup, _dayOne:dayOneOverride});
  const weeks = setup.weeks;
  const paces = zonesForVdot(c.athlete, c.athlete.vdot); paces.racePerKm = null;
  const longKm = round1(clamp(c.currentKm*(c.runsPerWeek<=4 ? 0.33 : DISTANCE_LONG_FRACTION), 6, kmForMinutes(120, paces.longPerKm)));
  const qDows = qualityDowsFor(c.longDow, 1);
  const list = [];
  for(let w=0; w<weeks; w++){
    const weekStart = addDays(c.weekStart0, w*7);
    const type = w%3===2 ? 'cruise' : 'tempo';
    const s = sizeQuality(type, '10k', 'build', 0.5, 0.9, c.currentKm, longKm, 10, paces);
    const longKmAdj = Math.max(longKm, round1(Math.min(s.km+0.6, kmForMinutes(150, paces.longPerKm))));
    const built = buildWeekDays({weekStart, weeklyKm:c.currentKm, longKm:longKmAdj, longDow:c.longDow, phase:'maintenance', isCutback:false, weekIndex:w, quality:[{dow:qDows[0], type, ...s}], runsPerWeek:c.runsPerWeek, strides:1, raceKm:10, paces, medLong:false, unit:c.unit});
    finishWeekDays(built.days, 10);
    placeStrengthDays(built.days, setup.strengthDows, setup.strengthPerWeek==null?1:setup.strengthPerWeek, 'maintenance', w, {weekInBlock:w%4, equipment: setup.equipment});
    list.push({weekIndex:w, phase:'maintenance', isCutback:false, weekStart:fmtDate(weekStart), targetKm:round1(built.days.reduce((s,d)=>s+d.km,0)), plannedKm:c.currentKm, paces, days:built.days, baselineVdot:c.athlete.vdot});
  }
  return finishGeneralPlan(setup, list, c.athlete.vdot, c.athlete.vdot);
}
function generateRecoveryPlan(setup, dayOneOverride){
  const c = generalWeekCommon({...setup, _dayOne:dayOneOverride});
  const weeks = setup.weeks;
  const paces = zonesForVdot(c.athlete, c.athlete.vdot); paces.racePerKm = null;
  const runs = clamp((setup.runsPerWeek || runsPerWeekFor(c.currentKm))-1, 3, 4);
  const list = [];
  for(let w=0; w<weeks; w++){
    const weekStart = addDays(c.weekStart0, w*7);
    const t = weeks<=1 ? 1 : w/(weeks-1);
    const weeklyKm = round1(c.currentKm*(0.55+0.20*t));
    const longKm = round1(Math.min(weeklyKm*(runs<=4 ? 0.33 : DISTANCE_LONG_FRACTION), kmForMinutes(120, paces.longPerKm)));
    const built = buildWeekDays({weekStart, weeklyKm, longKm, longDow:c.longDow, phase:'recovery', isCutback:false, weekIndex:w, quality:[], runsPerWeek:runs, strides:0, raceKm:10, paces, medLong:false, unit:c.unit});
    finishWeekDays(built.days, 10);
    built.days.forEach(d=>{ if(d.type==='long'){ d.paceKey='easyPerKm'; d.descBase='Longer easy run — relaxed, no pace pressure'; } });
    placeStrengthDays(built.days, [], 0, 'recovery', w, {equipment: setup.equipment});
    list.push({weekIndex:w, phase:'recovery', isCutback:false, weekStart:fmtDate(weekStart), targetKm:round1(built.days.reduce((s,d)=>s+d.km,0)), plannedKm:weeklyKm, paces, days:built.days, baselineVdot:c.athlete.vdot});
  }
  return finishGeneralPlan(setup, list, c.athlete.vdot, c.athlete.vdot);
}
function generateGeneralPlan(setup, dayOneOverride){
  if(setup.planKind==='speed') return generateSpeedPlan(setup, dayOneOverride);
  if(setup.planKind==='distance') return generateDistancePlan(setup, dayOneOverride);
  if(setup.planKind==='maintenance') return generateMaintenancePlan(setup, dayOneOverride);
  if(setup.planKind==='recovery') return generateRecoveryPlan(setup, dayOneOverride);
  return generatePlan(setup, dayOneOverride);
}

/* ============================= onboarding helpers ============================= */
function distanceGoalWarning(fromKm, toKm, weeks){
  if(!fromKm || !toKm || !weeks || toKm<=fromKm) return null;
  const weeksNeeded = Math.ceil(Math.log(toKm/fromKm)/Math.log(1.10));
  if(weeks < weeksNeeded) return `That's a bigger jump than is safe in ${weeks} week${weeks===1?'':'s'} — try at least ${weeksNeeded} weeks, or a lower target.`;
  return null;
}
// Cheap, generator-consistent preview of whether the long run can reach race readiness.
function raceLongRunWarning(raceDistanceKm, raceDate, trainingStartDate, currentWeeklyKm, longRunEmphasis, unit, longestRecentRunKm, runsPerWeek){
  if(!raceDistanceKm || !raceDate || !(currentWeeklyKm>=0)) return null;
  const raceDateP = parseDate(raceDate);
  const anchor = trainingStartDate ? parseDate(trainingStartDate) : todayDate();
  if(anchor>=raceDateP) return null;
  const weekStart0 = startOfWeek(anchor);
  const totalWeeks = Math.max(1, Math.ceil((daysBetween(weekStart0, raceDateP)+1)/7));
  const taperDays = taperDaysFor(raceDistanceKm);
  let nTrain = 0; while(nTrain<totalWeeks && daysBetween(addDays(weekStart0, nTrain*7+3), raceDateP) > taperDays) nTrain++;
  const peakWeekly = targetPeakWeeklyKm(raceDistanceKm, Math.max(5,currentWeeklyKm), longRunEmphasis, nTrain);
  const peakLong = peakLongTargetKm(raceDistanceKm, peakWeekly, longRunEmphasis, runsPerWeek);
  const step = (raceDistanceKm>=40 ? 2.0 : raceDistanceKm>=21 ? 1.6 : 1.3);
  const start = longestRecentRunKm>0 ? longestRecentRunKm : Math.max(5, currentWeeklyKm*0.26);
  const achievable = Math.min(peakLong, start + step*Math.max(nTrain-1-Math.floor(nTrain/4),0));
  if((peakLong-achievable)/peakLong < 0.20) return null;
  return `${totalWeeks} weeks isn't quite enough to build the long run to a race-ready ${fmtDist(peakLong,unit,0)} from where you are — it will top out around ${fmtDist(achievable,unit,0)}. Consider a later race date, or treat this one as a strong training race rather than a time goal.`;
}

/* ============================= validation ============================= */
// Returns a list of rule violations. Empty means the plan obeys every coaching invariant the
// engine promises. Used by tests/ and available in the browser console for any saved plan.
function validatePlan(plan, setup){
  const v = [];
  const raceKm = plan.raceDistanceKm;
  const isRace = raceKm!=null;
  const weeks = plan.weeks;
  weeks.forEach(w=>{
    // A week that contains race day has post-race rest days; judge its sessions against the
    // volume it was planned at, not the truncated total.
    const actualTot = w.days.reduce((s,d)=>s+(d.type==='race'?0:d.km),0);
    const containsRace = w.days.some(d=>d.type==='race');
    const tot = w.plannedKm ? Math.max(w.plannedKm, actualTot) : actualTot;
    const long = w.days.find(d=>d.type==='long');
    const q = w.days.filter(d=>QUALITY_TYPES.includes(d.type) && d.type!=='long' && !d.easyVariety);
    const easy = w.days.filter(d=>d.type==='easy' || d.easyVariety);
    const p = w.paces;
    const wk = `w${w.weekIndex+1}`;
    q.forEach(d=>{
      const qk = Math.max(0, (d.qualityKm!=null ? d.qualityKm : d.km-(d.warmupKm||0)-(d.cooldownKm||0)));
      const raceWeekLike = w.phase==='taper' || (w.daysToRaceAtStart!=null && w.daysToRaceAtStart<=7) || w.days.some(x=>x.daysToRace!=null && x.daysToRace>=0 && x.daysToRace<=2);
      const taperF = raceWeekLike ? 0.7 : 1;
      if(['tempo','cruise','overunder'].includes(d.type)){
        const tMin = minutesForKm(qk, p.tempoPerKm);
        const capT = Math.max((raceWeekLike?0.15:0.10)*tot, kmForMinutes(floorMinutesFor('tempo', w.plannedKm||tot), p.tempoPerKm)*taperF*1.3); // floor + whole-rep rounding
        if(qk > capT+(tot<20?0.6:0.3)) v.push(`${wk} ${d.type}: ${qk.toFixed(1)} km at threshold > 10% of ${tot.toFixed(1)} km week (and above the 20-min floor)`);
        if(tMin > 41) v.push(`${wk} ${d.type}: ${tMin.toFixed(0)} min at threshold (>40)`);
        if(isRace && raceKm>=10 && qk >= raceKm) v.push(`${wk} ${d.type}: threshold distance ${qk.toFixed(1)} >= race distance`);
      }
      if(d.type==='intervals'){ const capI = Math.max(Math.min(0.08*tot, 10)*(raceWeekLike?1.5:1), kmForMinutes(floorMinutesFor('intervals', w.plannedKm||tot), p.intervalPerKm)*taperF*1.3, 2.4); if(qk > capI+(tot<20?0.6:0.3)) v.push(`${wk} intervals: ${qk.toFixed(1)} km > 8% of week / 10 km (and above the 12-min floor)`); }
      if(d.type==='reps'){ if(qk > Math.max(0.05*tot*(raceWeekLike?1.5:1), 2.1)+0.25) v.push(`${wk} reps: ${qk.toFixed(1)} km > 5% of week`); }
      if(long && long.km>0 && d.km >= long.km && w.phase!=='taper' && (w.plannedKm||tot) >= 28) v.push(`${wk} ${d.type} day ${d.km} km >= long run ${long.km} km`);
      if(WARMUP_ELIGIBLE_TYPES.includes(d.type) && !(d.warmupKm>=1)) v.push(`${wk} ${d.type}: no warm-up`);
      if(!raceWeekLike && !w.isCutback && !d.secondary){
        const volRef = w.plannedKm || tot;
        const fT = floorMinutesFor('tempo', volRef), fI = floorMinutesFor('intervals', volRef);
        if(['tempo','cruise','overunder'].includes(d.type) && minutesForKm(qk, p.tempoPerKm) < fT*(d.type==='tempo' ? 0.95 : 0.85)) v.push(`${wk} ${d.type}: only ${minutesForKm(qk, p.tempoPerKm).toFixed(0)} min at threshold (floor ${fT.toFixed(0)})`);
        if(d.type==='intervals' && minutesForKm(qk, p.intervalPerKm) < fI*0.9) v.push(`${wk} intervals: only ${minutesForKm(qk, p.intervalPerKm).toFixed(0)} min at I pace (floor ${fI.toFixed(0)})`);
      }
    });
    if(long && long.km>0){
      const share = long.km/tot;
      const cap = isRace ? longFracCap(raceKm, tot, setup ? setup.runsPerWeek||4 : 4)+0.04 : 0.42;
      const fewDaysPlan = (plan.warnings||[]).some(x=>/running days/.test(x));
      if(w.phase!=='taper' && share > cap && !fewDaysPlan && long.km>=9) v.push(`${wk} long run ${long.km} km = ${(share*100).toFixed(0)}% of week (cap ${(cap*100).toFixed(0)}%)`);
      const lMin = minutesForKm(long.km, p.longPerKm);
      if(lMin > (plan.longTimeCapMin || (isRace ? longTimeCapMin(raceKm) : 150))+5) v.push(`${wk} long run ${lMin.toFixed(0)} min exceeds time cap`);
    }
    easy.forEach(d=>{ if(long && long.km>0 && d.km >= long.km && w.phase!=='taper') v.push(`${wk} easy day ${d.km} km >= long run`); });
    // hard-day spacing
    const hard = w.days.filter(d=>isLegDemandingDay(d));
    for(let i=0;i<hard.length;i++) for(let j=i+1;j<hard.length;j++){ if(circularDayDist(hard[i].dow, hard[j].dow)<2) v.push(`${wk} hard days back-to-back: ${hard[i].label} / ${hard[j].label}`); }
    // strength: never lower-body the day before a hard run; none in final 10 days
    w.days.forEach((d,i)=>{
      if(!d.strength) return;
      const next = w.days[(i+1)%7];
      if(d.strengthFocus!=='upper' && (isLegDemandingDay(next) || next.type==='race')) v.push(`${wk} lower-body strength on ${d.label} before ${next.label}`);
      const cutoff = (plan.taperMode||'full')==='none' ? 1 : (plan.taperMode==='light' ? 5 : 10);
      if(d.daysToRace!=null && d.daysToRace<=cutoff && d.daysToRace>=0) v.push(`${wk} strength inside the final ${cutoff} days`);
      if(d.strengthFocus!=='upper' && d.type==='rest') v.push(`${wk} lower-body strength on a rest day`);
      if(d.type==='race') v.push(`${wk} strength on race day`);
    });
    // intensity distribution: quality km (incl. long-run race-pace) <= ~30% of volume
    // race-pace running is counted at half weight: it is specific, not hard in the T/I sense
    const hardKm = q.reduce((s,d)=>s+(d.qualityKm||0)*(d.type==='racepace'?0.5:1),0) + (long ? (long.racePaceKm||0)*0.5 : 0);
    if(tot>0 && hardKm/tot > (tot<35 ? 0.5 : tot<50 ? 0.4 : 0.35) && w.phase!=='taper' && !containsRace) v.push(`${wk} hard running ${(100*hardKm/tot).toFixed(0)}% of week (>35%)`);
  });
  // week-over-week growth and taper
  const vols = weeks.map(w=>w.days.reduce((s,d)=>s+(d.type==='race'?0:d.km),0));
  const nominal = weeks.map((w,i)=>w.plannedKm!=null ? w.plannedKm : vols[i]);
  for(let i=1;i<vols.length;i++){
    if(weeks[i].phase==='taper' || weeks[i].phase==='recovery' || weeks[i-1].isCutback) continue;
    if((plan.warnings||[]).some(x=>/running days/.test(x))) continue;
    if(nominal[i] > nominal[i-1]*1.125+2.5) v.push(`w${i+1} volume +${(100*(vols[i]/vols[i-1]-1)).toFixed(0)}% over previous week`);
  }
  if(isRace && setup){
    const cur = setup.currentWeeklyKm||0;
    const fewDays = (plan.warnings||[]).some(x=>/running days/.test(x));
    if(weeks.length>1 && vols[0] < cur*0.93 && !fewDays && !(setup.maxWeeklyKm>0 && setup.maxWeeklyKm<cur)) v.push(`week 1 volume ${vols[0].toFixed(1)} below current ${cur.toFixed(1)}`);
    const peak = Math.max(...vols);
    if((raceKm<=10) && peak > Math.max(cur*1.12, 40)+0.5) v.push(`peak ${peak.toFixed(1)} km exceeds +12% over current for a short race`);
    // a real taper, measured in days before the race rather than calendar weeks
    const taperMode = plan.taperMode||'full';
    if(plan.totalWeeks > 2 && plan.buildWeeksCount>=3 && taperMode!=='none'){
      const lightF = taperMode==='light' ? 0.18 : 0;
      const allDays = weeks.flatMap(w=>w.days);
      const kmIn = (lo,hi) => allDays.filter(d=>d.daysToRace>=lo && d.daysToRace<=hi && d.type!=='race').reduce((s,d)=>s+d.km,0);
      const peakVol = Math.max(...weeks.slice(0, plan.buildWeeksCount).map((w,i)=>w.plannedKm||vols[i]));
      const cls = raceClass(raceKm);
      const last7 = kmIn(1,7)/peakVol;
      // Small weeks are dominated by fixed-size items (a 20-min session, a shakeout), so the
      // percentage caps loosen below ~30 km/week.
      const smallF = peakVol < 40 ? 0.10 : 0;
      const cap7 = (cls==='marathon' ? 0.65 : cls==='half' ? 0.72 : cls==='mid' ? 0.78 : 0.90) + smallF; // a 7-day 5K/10K taper straddles the last peak days
      if(taperMode==='full'){ if(last7 > cap7+0.05) v.push(`final 7 days carry ${(100*last7).toFixed(0)}% of peak weekly volume (cap ${(100*(cap7+lightF)).toFixed(0)}%)`); }
      if((cls==='marathon' || cls==='half') && taperMode==='full'){ const prev7 = kmIn(8,14)/peakVol; const cap14 = (cls==='marathon' ? 0.85 : 0.95) + smallF; if(prev7 > cap14) v.push(`days 8-14 before the race carry ${(100*prev7).toFixed(0)}% of peak (cap ${(100*cap14).toFixed(0)}%)`); }
      const raceDay = allDays.find(d=>d.type==='race');
      if(!raceDay) v.push('no race day');
      const hardLate = allDays.filter(d=>d.daysToRace>=1 && d.daysToRace<=2 && isLegDemandingDay(d));
      if(hardLate.length) v.push('hard session within 2 days of the race');
    }
  }
  return v;
}

return {
  KM_PER_MI, ENGINE_VERSION, pad2, uid, clamp, round1, fmtDate, parseDate, addDays, daysBetween, startOfWeek, todayDate,
  kmToUnit, unitToKm, fmtDist, interp, parseDurationToSec, secToClock, paceStr, speedStr, paceOrSpeedStr, circularDayDist,
  kmForMinutes, minutesForKm,
  vo2FromVelocity, velocityFromVO2, pctMaxForDurationMin, vdotFromRace, paceSecPerKmFromVdotPct, predictedTimeMinFromVdot,
  predictedPaceSecPerKmFromVdot, impliedVdotFromPace, EASY_PCT, THRESHOLD_PCT, INTERVAL_PCT, REP_PCT, paceZonesFromVdot,
  riegelSec, vvMarathonSecModel1, vvMarathonSecModel2, tandaMarathonSec, predictRace, assessGoal, buildAthlete, zonesForVdot, zonesForPlanVdot, projectRaceTime,
  raceLabelKm, runsPerWeekFor,
  QUALITY_TYPES, WARMUP_ELIGIBLE_TYPES, STRIDES_ELIGIBLE_TYPES, STRIDES_REPS, STRIDES_EXTRA_KM, HILL_STRIDES_EXTRA_KM, QUALITY_WARMUP_KM, QUALITY_COOLDOWN_KM,
  TYPE_LABELS, isLegDemandingDay, structuredEffort, buildWorkoutMeta,
  STRENGTH_EXERCISES, OPTIONAL_EXTRAS, EQUIPMENT, DEFAULT_EQUIPMENT, equipmentSet, resolveExercise, STRENGTH_TIME_MIN, lowerStrengthTierForPhase, buildLowerStrengthWorkout, buildUpperStrengthWorkout,
  placeStrengthDays, recomputeStrengthFocus, refreshStrengthWorkouts,
  qualityDowsFor, deriveScheduleFromLongDow, evenlySpacedPositions, scheduleWarnings,
  raceClass, taperDaysFor, taperVolumeFactor, taperLongFactor, weeklyGrowthRateFor, targetPeakWeeklyKm, peakLongTargetKm, longFracCap, longTimeCapMin,
  qualityMinutes, floorMinutesFor, sizeQuality, buildWeekDays, generatePlan,
  PLAN_KIND_META, generateSpeedPlan, generateDistancePlan, generateMaintenancePlan, generateRecoveryPlan, generateGeneralPlan,
  distanceGoalWarning, raceLongRunWarning, validatePlan,
};
});
