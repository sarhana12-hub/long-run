/* Workout screenshot scanner: text recognised from a screenshot (Apple Fitness / Workout,
   Strava, Garmin, Nike Run Club summary and split screens) is parsed into date, distance,
   time, pace, splits and segments. Recognition itself runs on the device (Tesseract.js,
   loaded on first use by the page); this file is the parser, so it can be tested in Node
   against sample text. Nothing here is saved without the runner confirming the numbers. */
(function(root, factory){
  const api = factory();
  if(typeof module==='object' && module.exports){ module.exports = api; }
  else { Object.assign(root, api); }
}(typeof self!=='undefined' ? self : this, function(){
'use strict';

const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const KM_PER_MI = 1.609344;
const pad2 = n => String(n).padStart(2,'0');

// Common recognition slips in the tokens we care about.
function normalise(text){
  return String(text||'')
    .replace(/\r/g,'')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/(\d),(\d{2})(?!\d)/g, '$1.$2')      // 3,52 -> 3.52
    .replace(/M1\b/g, 'MI').replace(/KN\b/g, 'KM')  // unit letters misread
    .replace(/(\d)\s*[oO]\b/g, '$10')            // trailing letter O read for zero
    .replace(/[ \t]+/g, ' ');
}
function toSec(h, m, s){ return (Number(h)||0)*3600 + (Number(m)||0)*60 + (Number(s)||0); }
// mm:ss or h:mm:ss anywhere in a line
const TIME_RE = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?![\d'"])/g;
// a pace: 9'10" /MI, 9:10 /mi, 9'10"/KM
const PACE_RE = /(\d{1,2})\s*['’:]\s*(\d{2})\s*['"’”]*\s*\/?\s*(mi|km)\b/gi;
// a distance with a unit: 3.52 MI, 10.0 km, 5.00mi
const DIST_RE = /(\d{1,3}(?:\.\d{1,2})?)\s*(mi|km)\b/gi;

function parseDate(text, today){
  today = today || new Date();
  const t = text;
  if(/\btoday\b/i.test(t)) return fmt(today);
  if(/\byesterday\b/i.test(t)) return fmt(addDays(today,-1));
  // "Oct 7, 2026", "October 7", "7 Oct 2026", "Tuesday, Oct 7"
  let m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?/i);
  let mon, day, year;
  if(m){ mon = MONTHS[m[1].toLowerCase().slice(0,4)] || MONTHS[m[1].toLowerCase().slice(0,3)]; day = Number(m[2]); year = m[3] ? Number(m[3]) : null; }
  else {
    m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/i);
    if(m){ day = Number(m[1]); mon = MONTHS[m[2].toLowerCase().slice(0,4)] || MONTHS[m[2].toLowerCase().slice(0,3)]; year = m[3] ? Number(m[3]) : null; }
  }
  if(!mon){
    // numeric 10/7/2026 or 2026-10-07
    m = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/);
    if(m){ const a=Number(m[1]), b=Number(m[2]); let y=Number(m[3]); if(y<100) y+=2000; // US order unless the first number cannot be a month
      if(a<=12){ mon=a; day=b; } else { mon=b; day=a; } year=y; }
  }
  if(!mon || !day) return null;
  if(!year){ year = today.getFullYear(); const cand = new Date(year, mon-1, day); if(cand > addDays(today, 1)) year -= 1; }
  const d = new Date(year, mon-1, day);
  if(isNaN(d.getTime())) return null;
  return fmt(d);
}
function fmt(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(d, n){ const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }

// Everything useful in the text. unitHint ('mi'|'km') breaks ties when no unit is printed.
function parseWorkoutText(rawText, opts){
  opts = opts || {};
  const text = normalise(rawText);
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const out = {date:null, distanceKm:null, unit:null, durationSec:null, paceSecPerKm:null, splits:[], segments:[], kind:null, confidence:'low', notes:[]};

  // date and workout type
  out.date = parseDate(text, opts.today);
  const kindM = text.match(/\b(outdoor run|indoor run|treadmill|trail run|track run|run|running)\b/i);
  if(kindM) out.kind = kindM[1].toLowerCase();

  // distance: first "n.nn MI/KM" that is not part of a pace or a split row
  const distances = [];
  lines.forEach((l,i)=>{ if(PACE_RE.test(l)){ PACE_RE.lastIndex=0; return; } PACE_RE.lastIndex=0; let m; DIST_RE.lastIndex=0; while((m = DIST_RE.exec(l))){ distances.push({v:Number(m[1]), u:m[2].toLowerCase(), line:i, labelled:/distance/i.test(lines[i-1]||'')||/distance/i.test(l)}); } });
  const dist = distances.find(d=>d.labelled) || distances.filter(d=>d.v>=0.5).sort((a,b)=>b.v-a.v)[0] || null;
  if(dist){ out.unit = dist.u; out.distanceKm = dist.u==='mi' ? dist.v*KM_PER_MI : dist.v; }

  // pace (average)
  const paces = [];
  lines.forEach((l,i)=>{ let m; PACE_RE.lastIndex=0; while((m = PACE_RE.exec(l))){ paces.push({sec: toSec(0, m[1], m[2]), u:m[3].toLowerCase(), line:i, labelled:/avg|average|pace/i.test(lines[i-1]||'')||/avg|average/i.test(l)}); } });
  const pace = paces.find(p=>p.labelled) || null;
  if(pace){ out.paceSecPerKm = pace.u==='mi' ? pace.sec/KM_PER_MI : pace.sec; if(!out.unit) out.unit = pace.u; }

  // duration: a time token near a time label, preferring workout/moving over elapsed/total
  const times = [];
  const labelScore = str => /workout time|moving time|duration|moving/i.test(str) ? 3 : /elapsed|total time/i.test(str) ? 2 : /\btime\b/i.test(str) ? 1 : 0;
  const LABEL_RE = /workout time|moving time|elapsed time|total time|duration|\btime\b/gi;
  lines.forEach((l,i)=>{
    if(PACE_RE.test(l)){ PACE_RE.lastIndex=0; return; } PACE_RE.lastIndex=0;
    const toks = []; let m; TIME_RE.lastIndex=0; while((m = TIME_RE.exec(l))){ const sec = toSec(m[1], m[2], m[3]); if(sec>=60 && sec<=12*3600) toks.push(sec); }
    if(!toks.length) return;
    const prev = lines[i-1]||''; const prevLabels = prev.match(LABEL_RE)||[];
    toks.forEach((sec,k)=>{
      let score, ctx;
      if(labelScore(l)){ score = labelScore(l); ctx = l; }
      // Apple's two-column layout: "Workout Time  Elapsed Time" above "0:24:57  0:26:51" -
      // the k-th value belongs to the k-th label
      else if(toks.length>1 && prevLabels.length===toks.length){ score = labelScore(prevLabels[k]); ctx = prevLabels[k]+' '+l; }
      else { score = labelScore(prev); ctx = prev+' '+l; }
      times.push({sec, line:i, score, ctx});
    });
  });
  // a time of day like "7:02 AM" is not a duration
  const plausible = times.filter(t=>!/\b(am|pm)\b/i.test(t.ctx) || t.score>=2);
  let best = plausible.sort((a,b)=>b.score-a.score || b.sec-a.sec)[0] || null;
  if(best && best.score===0 && out.distanceKm && out.paceSecPerKm){
    // no label: trust the token only if it agrees with distance x pace within 15%
    const expect = out.distanceKm*out.paceSecPerKm;
    const agree = plausible.find(t=>Math.abs(t.sec-expect)/expect < 0.15);
    best = agree || null;
  }
  if(best){ out.durationSec = best.sec; out.durationScore = best.score; }
  else if(out.distanceKm && out.paceSecPerKm){ out.durationSec = Math.round(out.distanceKm*out.paceSecPerKm); out.notes.push('Time worked out from distance and average pace.'); }

  // splits: pace tokens listed after a Splits/Mile/Km header, one per row
  const splitStart = lines.findIndex(l=>/^splits?\b|^mile splits|^km splits|\bsplits\b/i.test(l));
  if(splitStart>=0){
    // "1 Mile" / "1 Kilometer" header on Apple's Splits screen says what each split is
    const hdr = lines.slice(splitStart, splitStart+4).join(' ').match(/(\d+(?:\.\d+)?)\s*(mile|mi\b|kilomet|km\b)/i);
    const splitKm = hdr ? Number(hdr[1])*(/^(mile|mi)/i.test(hdr[2]) ? KM_PER_MI : 1) : null;
    for(let i=splitStart+1;i<lines.length;i++){
      const l = lines[i]; let m; PACE_RE.lastIndex=0; const row = []; while((m = PACE_RE.exec(l))) row.push({sec: toSec(0,m[1],m[2]), u:m[3].toLowerCase()});
      // Apple's in-page splits: "1  08:24  8'24''  133BPM" - the pace is the quote-style token
      // (minutes'seconds'' with no unit); the mm:ss before it is the split's time, not its pace.
      if(!row.length){ const q = l.match(/^\s*\d{1,2}\s+(?:\d{1,2}:\d{2}\s+)?(\d{1,2})\s*['’]\s*(\d{2})\s*['’"”]*/); if(q) row.push({sec: toSec(0,q[1],q[2]), u: out.unit||'mi'}); }
      if(row.length){
        const r = row[0]; const t = l.match(/^\s*\d{1,2}\s+(\d{1,2}):(\d{2})\b/);
        out.splits.push({index: out.splits.length+1, paceSecPerKm: r.u==='mi' ? r.sec/KM_PER_MI : r.sec, timeSec: t ? toSec(0,t[1],t[2]) : null});
        if(!out.unit) out.unit = r.u;
      }
      else if(out.splits.length && /heart|cadence|elevation|power|workout|summary/i.test(l)) break;
    }
    // A splits screen on its own still gives the whole run: time is the sum of the splits,
    // distance is the full splits plus the partial last one (its time over its pace).
    if(out.splits.length && out.splits.every(s=>s.timeSec>0)){
      // an unlabelled time token (often the phone's clock) loses to the splits' own sum
      if(!out.durationSec || !out.durationScore){ out.durationSec = out.splits.reduce((a,s)=>a+s.timeSec,0); out.durationScore = 3; out.notes.push('Time added up from the splits.'); }
      if(!out.distanceKm && splitKm){ const last = out.splits[out.splits.length-1]; out.distanceKm = Math.round(((out.splits.length-1)*splitKm + last.timeSec/last.paceSecPerKm)*100)/100; out.notes.push('Distance worked out from the splits.'); }
    }
  }
  // segments (Apple Watch "Segments", Garmin "Laps"): rows with a distance and a time
  const segStart = lines.findIndex(l=>/^segments?\b|^laps?\b|\bsegments\b|\blaps\b/i.test(l));
  if(segStart>=0){
    for(let i=segStart+1;i<lines.length;i++){
      const l = lines[i]; DIST_RE.lastIndex=0; const d = DIST_RE.exec(l); TIME_RE.lastIndex=0; const t = TIME_RE.exec(l);
      if(d && t){ const km = d[2].toLowerCase()==='mi' ? Number(d[1])*KM_PER_MI : Number(d[1]); out.segments.push({index: out.segments.length+1, km, sec: toSec(t[1],t[2],t[3])}); }
      else if(out.segments.length && /heart|cadence|elevation|power|splits|summary/i.test(l)) break;
    }
  }

  // confidence
  const have = [out.date, out.distanceKm, out.durationSec].filter(x=>x!=null).length;
  const consistent = out.distanceKm && out.durationSec && out.paceSecPerKm ? Math.abs(out.distanceKm*out.paceSecPerKm - out.durationSec)/out.durationSec < 0.15 : null;
  out.confidence = have===3 && consistent!==false ? 'high' : have>=2 ? 'medium' : 'low';
  if(consistent===false) out.notes.push('Distance, pace and time do not agree; check them.');
  if(!out.date) out.notes.push('No date found; set it below.');
  if(out.kind && /indoor|treadmill/.test(out.kind)) out.notes.push('Indoor run: treadmill distance.');
  return out;
}

// Average time per rep from segments that are about the planned rep distance (within 25%).
function repSecFromSegments(segments, repMeters){
  if(!segments || !segments.length || !repMeters) return null;
  const reps = segments.filter(s=>Math.abs(s.km*1000-repMeters)/repMeters <= 0.25 && s.sec>0);
  if(reps.length<2) return null;
  const paceSecPerM = reps.reduce((a,s)=>a+s.sec/(s.km*1000),0)/reps.length;
  return Math.round(paceSecPerM*repMeters);
}

/* Image preparation for recognition (browser only): downscale to about 1200 px wide and
   invert dark-mode screenshots, since recognition is better on dark text over light. */
async function prepareImage(file){
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200/bmp.width);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width*scale); c.height = Math.round(bmp.height*scale);
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0,0,c.width,c.height); const px = img.data; let sum = 0; const step = 16;
  for(let i=0;i<px.length;i+=4*step) sum += (px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114);
  const mean = sum/(px.length/(4*step));
  if(mean < 110){ for(let i=0;i<px.length;i+=4){ px[i]=255-px[i]; px[i+1]=255-px[i+1]; px[i+2]=255-px[i+2]; } ctx.putImageData(img,0,0); }
  return c;
}

// Exported under scan-specific names: the page already has a global parseDate (string to Date).
return { parseWorkoutText, parseScanDate: parseDate, repSecFromSegments, prepareImage: prepareImage, normaliseScanText: normalise };
}));
