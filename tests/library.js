// Run: node tests/library.js
// Every exercise name a session can print has a library entry with a description, cues,
// a drawing that renders, and either a verified reference link or an explicit null.
const g = require('../engine.js');
const lib = require('../library.js');
let failures = 0;
function check(name, ok, detail){ if(!ok){ failures++; console.log('  FAIL '+name+(detail?' — '+detail:'')); } }
const names = new Set();
[g.STRENGTH_EXERCISES, g.OPTIONAL_EXTRAS].forEach(cat=>Object.values(cat).forEach(def=>def.variants.forEach(v=>names.add(v.name))));
let withLink = 0;
names.forEach(n=>{
  const e = lib.exerciseInfo(n);
  check('entry for "'+n+'"', !!e);
  if(!e) return;
  check(n+' summary', typeof e.summary==='string' && e.summary.length>20);
  check(n+' setup/move/cues', Array.isArray(e.setup) && e.setup.length && Array.isArray(e.move) && e.move.length && Array.isArray(e.cues) && e.cues.length);
  check(n+' mistake', typeof e.mistake==='string' && e.mistake.length>8);
  check(n+' link shape', e.link===null || (e.link && /^https:\/\/www\.acefitness\.org\/resources\/everyone\/exercise-library\/\d+\/[a-z0-9-]+\/$/.test(e.link.url)));
  if(e.link) withLink++;
  let svg = '';
  try{ svg = lib.exerciseSvg(e.art, n); }catch(err){ check(n+' drawing renders', false, String(err.message)); }
  check(n+' drawing has a figure', /<circle/.test(svg) && /<path/.test(svg) && !/NaN/.test(svg));
  if(e.art2){ let s2=''; try{ s2 = lib.exerciseSvg(e.art2, n); }catch(err){ check(n+' second angle renders', false, String(err.message)); } check(n+' second angle has a figure', /<circle/.test(s2) && !/NaN/.test(s2)); }
});
console.log(`${names.size} exercise names, ${withLink} with a reference link`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall library checks passed');
process.exit(failures ? 1 : 0);
