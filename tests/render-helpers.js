// Loads the page's own workout-text functions (renderWorkoutText, workoutPartsFor,
// daySummaryText) out of index.html so tests can check the exact text a runner sees,
// not a re-implementation of it.
const fs = require('fs');
const path = require('path');
const g = require('../engine.js');

function loadPageRenderers(){
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const grab = (startMarker, endMarker) => {
    const i = html.indexOf(startMarker); const j = html.indexOf(endMarker, i);
    if(i<0 || j<0) throw new Error('render-helpers: marker not found: '+startMarker);
    return html.slice(i, j);
  };
  const src = [
    grab('function warmupClause(', 'function paceInputValue('),
    grab('function daySummaryText(', 'function dayDisplayText('),
    grab('function dayDisplayText(', 'function workoutPartsFor('),
  ].join('\n');
  const factory = new Function('g', 'esc', `
    ${Object.keys(g).map(k=>`const ${k} = g.${k};`).join('\n')}
    ${src}
    return {renderWorkoutText, workoutPartsFor, daySummaryText};
  `);
  return factory(g, s=>String(s==null?'':s));
}

module.exports = { loadPageRenderers };
