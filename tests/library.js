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
// The line under each exercise name answers one question: what do I need, and how am I set
// up? Equipment first, then position only where the name leaves it unclear, in one phone
// line. Progression, easier/harder versions and assistance live in the library entry the row
// opens to, not here (owner, 2026-10-11: the lines ran from 7 to 93 characters).
const EQUIP_MAX = 35;
const TIP_WORDS = /;|\bonce\b|\bif\b|easier|harder|assistance|negatives|seconds/i;
let equipCount = 0;
[g.STRENGTH_EXERCISES, g.OPTIONAL_EXTRAS].forEach(cat=>Object.values(cat).forEach(def=>def.variants.forEach(v=>{
  equipCount++;
  check(`${v.name} note "${v.equip}" fits one line (${v.equip.length}/${EQUIP_MAX})`, v.equip.length>0 && v.equip.length<=EQUIP_MAX);
  check(`${v.name} note "${v.equip}" is setup only, no tips`, !TIP_WORDS.test(v.equip));
  check(`${v.name} note "${v.equip}" starts lower case`, v.equip.charAt(0)===v.equip.charAt(0).toLowerCase() || /^Smith/.test(v.equip));
})));
console.log(`${equipCount} equipment notes, all ${EQUIP_MAX} characters or fewer`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall library checks passed');
process.exit(failures ? 1 : 0);
