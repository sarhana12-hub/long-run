// Run: node tests/no-citations.js
// The app never shows research citations to the runner (owner decision: they read as odd and
// add text nobody needs). Sources belong in code comments and docs/RULES.md, not on screen.
// Checks two places: the page's own text outside code comments, and every string the engine
// and library generate across a spread of plans.
const fs = require('fs');
const path = require('path');
const g = require('../engine.js');
const lib = require('../library.js');
const { loadPageRenderers } = require('./render-helpers.js');
const ui = loadPageRenderers();

const CITE = /et al|\b(19|20)\d{2}\b|\b(Daniels|Pfitzinger|Higdon|Bosquet|Nielsen|Jones|Doust|Riegel|Hanson|McMillan|Magness|Galloway|Seiler|Midgley|Mujika|Tanaka|Cureton|Vickers|Tanda)\b|\bstud(y|ies)\b|\bresearch\b/i;
let failures = 0;
const fail = (where, text) => { failures++; console.log('  FAIL ' + where + ': ' + String(text).slice(0, 160)); };

// 1. The page's own text, line by line with code comments stripped. A bare year is not
//    enough here (dates and SVG addresses carry them), so the page check looks for author
//    names, "et al", a capitalised name followed by a year, or study/research wording.
//    Identifiers such as danielsPhase or riegelSec do not match: the names need word
//    boundaries on both sides.
{
  const PAGE_CITE = /et al|\b(Daniels|Pfitzinger|Higdon|Bosquet|Nielsen|Jones|Doust|Riegel|Hanson|McMillan|Magness|Galloway|Seiler|Midgley|Mujika|Tanaka|Cureton|Vickers|Tanda)\b|\b[A-Z][a-z]+(?: (?:&|and) [A-Z][a-z]+)?,? \(?(19|20)\d{2}\)?|\bstud(y|ies)\b|\bresearch\b/;
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'));
  noComments.forEach((l, i) => { if (PAGE_CITE.test(l)) fail('index.html line ' + (i + 1), l.trim()); });
}

// 2. Everything the engine generates: plan notes, day text in pace and speed formats,
//    strength lines and how-tos, and the exercise library.
{
  const MI = g.KM_PER_MI;
  const seen = new Set();
  const check = (where, s) => { if (typeof s !== 'string' || !CITE.test(s)) return; const k = where + s; if (seen.has(k)) return; seen.add(k); fail(where, s); };
  let n = 0;
  for (const km of [5, 10, 21.0975, 42.195]) for (const mpw of [12, 25, 45]) for (const runs of [3, 5]) for (const taper of ['full', 'none']) for (const goal of [false, true]) {
    n++;
    const weeks = 6 + (n % 12);
    const pred = g.predictRace({ races: [{ km: 5, sec: 1400 }], weeklyKm: mpw * MI }, km);
    const setup = { units: n % 2 ? 'mi' : 'km', raceDistanceKm: km, raceDate: g.fmtDate(g.addDays(g.todayDate(), weeks * 7)), currentWeeklyKm: mpw * MI,
      recentDistanceKm: 5, recentTimeSec: 1400, goalTimeSec: goal ? Math.round(pred.lowSec * 0.93) : null, longDow: n % 7, weekStartDow: n % 2,
      ...g.deriveScheduleFromLongDow(n % 7, n % 4), runsPerWeek: runs, strengthPerWeek: n % 4, longRunEmphasis: 'balanced', speedEmphasis: 'balanced',
      hillsMode: n % 3 ? 'flat' : 'hilly', skipBase: n % 5 === 0, taperMode: taper, buildPace: n % 4 ? 'standard' : 'faster' };
    const plan = g.generatePlan(setup);
    (plan.warnings || []).forEach(w => check('plan note', w));
    plan.weeks.forEach(w => w.days.forEach(d => {
      for (const fmt of ['pace', 'speed']) { ui.workoutPartsFor(d, w.paces, setup.units, fmt).forEach(p => check('day text', p)); check('day summary', ui.daySummaryText(d, w.paces, setup.units, fmt)); }
      (d.strengthExercises || []).concat(d.strengthOptional || []).forEach(l => check('strength line', l));
      (d.strengthHowTo || []).forEach(h => check('strength how-to', h.how));
      check('strength load note', d.strengthLoadNote);
    }));
  }
  for (const kind of ['speed', 'distance', 'maintenance', 'recovery']) {
    const plan = g.generateGeneralPlan({ planKind: kind, units: 'mi', weeks: 8, currentWeeklyKm: 25 * MI, recentDistanceKm: 5, recentTimeSec: 1500, longDow: 0, weekStartDow: 1,
      ...g.deriveScheduleFromLongDow(0, 2), runsPerWeek: 4, strengthPerWeek: 2, distanceGoalMetric: 'weekly', distanceGoalCurrentKm: 25 * MI, distanceGoalTargetKm: 35 * MI });
    (plan.warnings || []).forEach(w => check('plan note', w));
  }
  Object.entries(lib.EXERCISE_LIBRARY || {}).forEach(([name, e]) => {
    [e.summary, e.mistake, e.link && e.link.note].concat(e.setup || [], e.move || [], e.cues || []).forEach(s => check('library ' + name, s));
  });
  console.log(`${n} race plans, 4 general plans and the exercise library checked`);
}

console.log(failures ? `\n${failures} citation(s) shown to the runner` : '\nno citations shown to the runner');
process.exit(failures ? 1 : 0);
