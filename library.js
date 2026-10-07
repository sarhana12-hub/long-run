/* Exercise library: what each strength movement is, how to do it, the form points that
   matter, and a verified reference page. Drawings are built from joint angles by one
   renderer so every exercise shares the same figure, proportions and line style.
   Reference pages: American Council on Exercise (ACE) exercise library, each URL fetched
   and checked on 2026-10-07. Where ACE has no page for the exact variant the nearest
   movement is linked and the note says so.
   Loaded as a plain global in the browser and as CommonJS in Node (tests). */
(function(root, factory){
  const api = factory();
  if(typeof module==='object' && module.exports){ module.exports = api; }
  else { Object.assign(root, api); }
}(typeof self!=='undefined' ? self : this, function(){
'use strict';

const ACE = 'https://www.acefitness.org/resources/everyone/exercise-library/';
const L = (id, slug, note) => ({url: ACE + id + '/' + slug + '/', source: 'ACE Fitness', note: note || null});

/* ---------------- figure renderer ----------------
   Side view: the figure faces left. Angles in degrees. Torso angle is lean from vertical
   (positive = leaning forward). Leg and arm angles are measured from straight down
   (positive = swung forward, toward the face). Lengths are in a 240 x 240 box. */
const DIM = {torso:58, thigh:46, shin:46, upper:32, fore:30, head:11, foot:22};
const rad = d => d*Math.PI/180;
const fwd = (x,y,len,deg) => [x - len*Math.sin(rad(deg)), y + len*Math.cos(rad(deg))]; // from a joint, hanging down and swung forward
function sideFigure(p, opacity){
  const hip = [p.x, p.y];
  const sh = [p.x - DIM.torso*Math.sin(rad(p.torso||0)), p.y - DIM.torso*Math.cos(rad(p.torso||0))];
  const headC = [sh[0] - (DIM.head+6)*Math.sin(rad((p.torso||0)+(p.head||0))), sh[1] - (DIM.head+6)*Math.cos(rad((p.torso||0)+(p.head||0)))];
  const legs = (p.legs||[{thigh:0, shin:0}]).map(l=>{
    const k = fwd(hip[0], hip[1], DIM.thigh, l.thigh||0);
    const a = fwd(k[0], k[1], DIM.shin, l.shin||0);
    const toes = l.foot==='up' ? [a[0]-DIM.foot*0.7, a[1]-DIM.foot*0.7] : l.foot==='back' ? [a[0]+DIM.foot*0.7, a[1]+DIM.foot*0.7] : [a[0]-DIM.foot, a[1]];
    return {k, a, toes, hidden:l.hidden};
  });
  const arms = (p.arms||[{upper:0, fore:0}]).map(ar=>{
    const e = fwd(sh[0], sh[1], DIM.upper, ar.upper||0);
    const h = fwd(e[0], e[1], DIM.fore, ar.fore!=null ? ar.fore : (ar.upper||0));
    return {e, h, hidden:ar.hidden};
  });
  let s = `<g opacity="${opacity}">`;
  s += `<circle cx="${r(headC[0])}" cy="${r(headC[1])}" r="${DIM.head}"/>`;
  s += `<path d="M${r(sh[0])} ${r(sh[1])} L${r(hip[0])} ${r(hip[1])}"/>`;
  legs.forEach(l=>{ if(l.hidden) return; s += `<path d="M${r(hip[0])} ${r(hip[1])} L${r(l.k[0])} ${r(l.k[1])} L${r(l.a[0])} ${r(l.a[1])} L${r(l.toes[0])} ${r(l.toes[1])}"/>`; });
  arms.forEach(a=>{ if(a.hidden) return; s += `<path d="M${r(sh[0])} ${r(sh[1])} L${r(a.e[0])} ${r(a.e[1])} L${r(a.h[0])} ${r(a.h[1])}"/>`; });
  s += propsSvg(p.props, {hip, sh, headC, arms, legs});
  s += '</g>';
  return s;
}
/* Front view: symmetric figure facing the viewer. stance = half the distance between the
   feet; kneeOut = how far each knee sits outside the hip line; armsUp = arm angle from
   hanging (0) to overhead (180); arms may also be given per side. */
function frontFigure(p, opacity){
  const hip = [p.x, p.y], torso = DIM.torso*(p.torsoScale||1);
  const sh = [p.x, p.y - torso];
  const headC = [sh[0], sh[1] - DIM.head - 6];
  const stance = p.stance!=null ? p.stance : 14, kneeOut = p.kneeOut||0, bend = p.bend||0; // bend 0..1 lowers the hip, knees stay over feet
  const feetY = p.feetY!=null ? p.feetY : 212;
  const legY = feetY - p.y;
  const kneeY = p.y + legY*0.5 - bend*14;
  const legs = [-1, 1].map(sx=>({k:[p.x + sx*(stance*0.6 + kneeOut), kneeY], a:[p.x + sx*stance, feetY]}));
  const arms = [-1, 1].map((sx,i)=>{ const a = Array.isArray(p.arms) ? p.arms[i] : (p.arms||{}); const ang = a.angle!=null ? a.angle : (p.armsUp||10); const e = [sh[0] + sx*DIM.upper*Math.sin(rad(ang)) + sx*8, sh[1] + DIM.upper*Math.cos(rad(ang))]; const fa = a.fore!=null ? a.fore : ang; const h = [e[0] + sx*DIM.fore*Math.sin(rad(fa)), e[1] + DIM.fore*Math.cos(rad(fa))]; return {e, h, hidden:a.hidden}; });
  let s = `<g opacity="${opacity}">`;
  s += `<circle cx="${r(headC[0])}" cy="${r(headC[1])}" r="${DIM.head}"/>`;
  s += `<path d="M${r(sh[0]-14)} ${r(sh[1])} L${r(sh[0]+14)} ${r(sh[1])} M${r(sh[0])} ${r(sh[1])} L${r(hip[0])} ${r(hip[1])} M${r(hip[0]-12)} ${r(hip[1])} L${r(hip[0]+12)} ${r(hip[1])}"/>`;
  legs.forEach((l,i)=>{ const hx = hip[0] + (i===0?-12:12); s += `<path d="M${r(hx)} ${r(hip[1])} L${r(l.k[0])} ${r(l.k[1])} L${r(l.a[0])} ${r(l.a[1])} M${r(l.a[0]-9)} ${r(l.a[1])} L${r(l.a[0]+9)} ${r(l.a[1])}"/>`; });
  arms.forEach((a,i)=>{ if(a.hidden) return; const sx = sh[0] + (i===0?-14:14); s += `<path d="M${r(sx)} ${r(sh[1])} L${r(a.e[0])} ${r(a.e[1])} L${r(a.h[0])} ${r(a.h[1])}"/>`; });
  s += propsSvg(p.props, {hip, sh, headC, arms, legs, front:true});
  s += '</g>';
  return s;
}
function r(n){ return Math.round(n*10)/10; }
// Props are drawn relative to the figure: 'bar' at the hands (plate seen end-on in side view,
// a long bar in front view), 'kb' kettlebell at the hands, 'db' dumbbells, 'band' around the
// knees, and fixed scene items (bench, box, floor, pull-up bar, wall) placed by coordinates.
function propsSvg(props, j){
  if(!props) return '';
  let s = '';
  const hand = j.arms[0] ? j.arms[0].h : j.sh;
  props.forEach(pr=>{
    if(pr==='floor') s += `<line x1="16" y1="216" x2="224" y2="216" stroke-width="3" opacity=".5"/>`;
    else if(pr==='bar') s += j.front ? `<line x1="${r(j.arms[0].h[0]-26)}" y1="${r(hand[1])}" x2="${r(j.arms[1].h[0]+26)}" y2="${r(hand[1])}" stroke-width="5"/><rect x="${r(j.arms[0].h[0]-34)}" y="${r(hand[1]-12)}" width="8" height="24" rx="2"/><rect x="${r(j.arms[1].h[0]+26)}" y="${r(hand[1]-12)}" width="8" height="24" rx="2"/>` : `<circle cx="${r(hand[0])}" cy="${r(hand[1])}" r="10"/><line x1="${r(hand[0])}" y1="${r(hand[1]-13)}" x2="${r(hand[0])}" y2="${r(hand[1]+13)}" stroke-width="3"/>`;
    else if(pr==='barBack'){ const c = j.front ? [j.sh[0], j.sh[1]-6] : [j.sh[0]+15, j.sh[1]+1]; s += j.front ? `<line x1="${r(c[0]-52)}" y1="${r(c[1])}" x2="${r(c[0]+52)}" y2="${r(c[1])}" stroke-width="5"/><rect x="${r(c[0]-60)}" y="${r(c[1]-12)}" width="8" height="24" rx="2"/><rect x="${r(c[0]+52)}" y="${r(c[1]-12)}" width="8" height="24" rx="2"/>` : `<circle cx="${r(c[0])}" cy="${r(c[1])}" r="10"/><line x1="${r(c[0])}" y1="${r(c[1]-13)}" x2="${r(c[0])}" y2="${r(c[1]+13)}" stroke-width="3"/>`; }
    else if(pr==='kb') s += `<circle cx="${r(hand[0])}" cy="${r(hand[1]+14)}" r="11"/><path d="M${r(hand[0]-8)} ${r(hand[1]+6)} C${r(hand[0]-6)} ${r(hand[1]-4)} ${r(hand[0]+6)} ${r(hand[1]-4)} ${r(hand[0]+8)} ${r(hand[1]+6)}"/>`;
    else if(pr==='kbChest'){ const c=[j.sh[0]-14, j.sh[1]+16]; s += `<circle cx="${r(c[0])}" cy="${r(c[1])}" r="10"/>`; }
    else if(pr==='db') j.arms.forEach(a=>{ if(a.hidden) return; s += `<line x1="${r(a.h[0]-10)}" y1="${r(a.h[1])}" x2="${r(a.h[0]+10)}" y2="${r(a.h[1])}" stroke-width="3"/><circle cx="${r(a.h[0]-10)}" cy="${r(a.h[1])}" r="4"/><circle cx="${r(a.h[0]+10)}" cy="${r(a.h[1])}" r="4"/>`; });
    else if(pr==='dbVert') j.arms.forEach(a=>{ if(a.hidden) return; s += `<line x1="${r(a.h[0])}" y1="${r(a.h[1]-10)}" x2="${r(a.h[0])}" y2="${r(a.h[1]+10)}" stroke-width="3"/><circle cx="${r(a.h[0])}" cy="${r(a.h[1]-10)}" r="4"/><circle cx="${r(a.h[0])}" cy="${r(a.h[1]+10)}" r="4"/>`; });
    else if(pr==='band'){ const ks = j.legs.map(l=>l.k); const y = (ks[0][1]+(ks[1]?ks[1][1]:ks[0][1]))/2 - 6; const x0 = Math.min(...ks.map(k=>k[0])), x1 = Math.max(...ks.map(k=>k[0])); s += `<rect x="${r(x0-8)}" y="${r(y-4)}" width="${r(Math.max(16, x1-x0+16))}" height="8" rx="4" stroke-width="3"/>`; }
    else if(typeof pr==='object'){
      if(pr.bench) s += `<rect x="${pr.bench[0]}" y="${pr.bench[1]}" width="${pr.bench[2]}" height="10" rx="3"/><path d="M${pr.bench[0]+8} ${pr.bench[1]+10} L${pr.bench[0]+8} 214 M${pr.bench[0]+pr.bench[2]-8} ${pr.bench[1]+10} L${pr.bench[0]+pr.bench[2]-8} 214"/>`;
      if(pr.box) s += `<rect x="${pr.box[0]}" y="${pr.box[1]}" width="${pr.box[2]}" height="${214-pr.box[1]}" rx="3"/>`;
      if(pr.bar) s += `<line x1="${pr.bar[0]}" y1="${pr.bar[1]}" x2="${pr.bar[2]}" y2="${pr.bar[1]}" stroke-width="5"/>`;
      if(pr.post) s += `<line x1="${pr.post[0]}" y1="${pr.post[1]}" x2="${pr.post[0]}" y2="214" stroke-width="3"/>`;
      if(pr.wall) s += `<line x1="${pr.wall}" y1="30" x2="${pr.wall}" y2="214" stroke-width="3" opacity=".6"/>`;
      if(pr.ball) s += `<circle cx="${pr.ball[0]}" cy="${pr.ball[1]}" r="${pr.ball[2]}"/>`;
      if(pr.arrow){ const [x0,y0,x1,y1] = pr.arrow; const ang = Math.atan2(y1-y0, x1-x0); const hx = x1 - 9*Math.cos(ang-0.5), hy = y1 - 9*Math.sin(ang-0.5), hx2 = x1 - 9*Math.cos(ang+0.5), hy2 = y1 - 9*Math.sin(ang+0.5); s += `<path d="M${x0} ${y0} L${x1} ${y1} M${r(hx)} ${r(hy)} L${x1} ${y1} L${r(hx2)} ${r(hy2)}" stroke-width="3" opacity=".7"/>`; }
      if(pr.text) s += `<text x="${pr.text[0]}" y="${pr.text[1]}" font-size="11" fill="currentColor" stroke="none" opacity=".8">${pr.text[2]}</text>`;
    }
  });
  return s;
}
// One drawing: faded start pose, solid finish pose, optional scene props shared by both.
function exerciseSvg(art, label){
  if(!art) return '';
  const fig = art.view==='front' ? frontFigure : sideFigure;
  const scene = art.scene ? `<g>${propsSvg(art.scene, {hip:[0,0], sh:[0,0], headC:[0,0], arms:[{h:[0,0]}], legs:[{k:[0,0]}], front: art.view==='front'})}</g>` : '';
  return `<svg viewBox="0 0 240 240" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label||''}">${scene}${art.start ? fig(art.start, .3) : ''}${fig(art.finish, 1)}</svg>`;
}

/* ---------------- shared poses ---------------- */
const STAND = {x:120, y:120, torso:0, legs:[{thigh:0, shin:0}], arms:[{upper:5, fore:5}]};
const SQUAT_BOTTOM = {x:150, y:146, torso:28, legs:[{thigh:95, shin:-18}], arms:[{upper:40, fore:120}]};
const HINGE = {x:140, y:128, torso:80, legs:[{thigh:12, shin:-8}], arms:[{upper:95, fore:95}]};
const LUNGE_BOTTOM = {x:130, y:146, torso:4, legs:[{thigh:92, shin:0}, {thigh:-40, shin:-98, foot:'back'}], arms:[{upper:2, fore:2}]};

/* ---------------- the library ----------------
   name -> {summary, setup, move, cues, mistake, link, art (side), art2 (second angle)} */
const EXERCISE_LIBRARY = {
  'Back squat': {
    summary: 'The main lower-body strength lift: bar on the upper back, sit down and stand up.',
    setup: ['Bar across the upper back (on the muscle, not the neck), hands just outside the shoulders.', 'Feet about shoulder-width, toes turned out a little, whole foot on the floor.'],
    move: ['Break at the hips and knees together and sit down and back until the thighs are about level with the floor.', 'Drive the whole foot into the floor to stand, hips and chest rising together.'],
    cues: ['Chest up, eyes forward.', 'Knees track over the middle of the foot.', 'Breathe in at the top, brace, breathe out on the way up.'],
    mistake: 'Hips shooting up first so the chest drops and the back does the work.',
    link: L(11, 'back-squat'),
    art: {start:{...STAND, x:70, props:['barBack']}, finish:{...SQUAT_BOTTOM, props:['barBack']}, scene:['floor', {arrow:[200,88,200,150]}]},
    art2: {view:'front', start:{x:60, y:120, stance:14, arms:{angle:110, fore:175}, props:['barBack']}, finish:{x:170, y:150, stance:22, kneeOut:6, bend:1, arms:{angle:110, fore:175}, props:['barBack']}, scene:['floor', {text:[126,234,'knees over feet']}]},
  },
  'Hack squat': {
    summary: 'A machine squat that takes balance out of the picture so you can load the legs safely.',
    setup: ['Shoulders under the pads, back flat on the pad, feet mid-plate about shoulder-width.', 'Release the safeties and stand up to unlock.'],
    move: ['Lower until the thighs are about level with the plate.', 'Press back up through the whole foot, stopping just short of locking the knees.'],
    cues: ['Lower back stays on the pad the whole way.', 'Knees in line with the feet.'],
    mistake: 'Bouncing out of the bottom or locking the knees hard at the top.',
    link: L(11, 'back-squat', 'ACE has no hack-squat page; the back squat covers the same movement.'),
    art: {start:{...STAND, x:70, props:['barBack']}, finish:{...SQUAT_BOTTOM, props:['barBack']}, scene:['floor', {arrow:[200,88,200,150]}]},
  },
  'Smith machine squat': {
    summary: 'A back squat on a bar that runs in fixed rails.',
    setup: ['Bar on the upper back, feet a little in front of the bar so you can sit back into it.', 'Unrack by rotating the bar off the hooks.'],
    move: ['Sit down until the thighs are about level, then drive back up.', 'Re-hook at the top.'],
    cues: ['Chest up, whole foot on the floor.', 'Do not let the knees cave in.'],
    mistake: 'Feet directly under the bar, which forces a forward lean.',
    link: L(11, 'back-squat', 'ACE has no Smith-machine page; the back squat covers the same movement.'),
    art: {start:{...STAND, x:70, props:['barBack']}, finish:{...SQUAT_BOTTOM, props:['barBack']}, scene:['floor', {arrow:[200,88,200,150]}]},
  },
  'Goblet squat': {
    summary: 'A squat with one weight held against the chest. Teaches a tall, deep squat.',
    setup: ['Hold the kettlebell by the horns, or a dumbbell by one end, against the chest with elbows down.', 'Feet shoulder-width, toes out a little.'],
    move: ['Squat down between the knees until the elbows pass the inside of the knees.', 'Stand up tall, driving through the whole foot.'],
    cues: ['Chest up; the weight keeps you honest.', 'Knees pushed out over the toes.'],
    mistake: 'Letting the weight drift away from the chest, which tips you forward.',
    link: L(362, 'goblet-squat'),
    art: {start:{...STAND, x:70, arms:[{upper:60, fore:150}], props:['kbChest']}, finish:{...SQUAT_BOTTOM, torso:15, arms:[{upper:60, fore:150}], props:['kbChest']}, scene:['floor', {arrow:[200,88,200,150]}]},
    art2: {view:'front', start:{x:60, y:120, stance:14, arms:{angle:18, fore:178}}, finish:{x:170, y:150, stance:22, kneeOut:6, bend:1, arms:{angle:18, fore:178}}, scene:['floor', {text:[126,234,'knees out, chest tall']}]},
  },
  'Bodyweight squat': {
    summary: 'The squat with no load. Slow on the way down so it still counts.',
    setup: ['Feet shoulder-width, arms out in front for balance.'],
    move: ['Sit down and back for three seconds until the thighs are about level.', 'Stand up through the whole foot.'],
    cues: ['Chest up, knees over the toes.', 'Control the lowering; the slow part is the work.'],
    mistake: 'Dropping fast and bouncing at the bottom.',
    link: L(135, 'bodyweight-squat'),
    art: {start:{...STAND, x:70, arms:[{upper:90, fore:90}]}, finish:{...SQUAT_BOTTOM, torso:20, arms:[{upper:95, fore:95}]}, scene:['floor', {arrow:[200,88,200,150]}]},
    art2: {view:'front', start:{x:60, y:120, stance:14, arms:{angle:80}}, finish:{x:170, y:150, stance:22, kneeOut:6, bend:1, arms:{angle:80}}, scene:['floor']},
  },
  'Single-leg squat to a chair': {
    summary: 'A one-leg squat with a chair to catch you. Hard on the thigh, honest about balance.',
    setup: ['Stand on one leg a short step in front of a chair, the other leg held out in front.', 'Hold a wall or rail with the fingertips if balance is the limit.'],
    move: ['Lower slowly until you just touch the seat.', 'Stand back up on the same leg without rocking onto the other foot.'],
    cues: ['Knee over the middle of the foot.', 'Hips level; do not let the free side drop.'],
    mistake: 'Sitting fully onto the chair and pushing off it.',
    link: L(136, 'single-leg-squat'),
    art: {start:{...STAND, x:70, legs:[{thigh:0, shin:0},{thigh:50, shin:50}], arms:[{upper:80, fore:80}]}, finish:{x:140, y:150, torso:25, legs:[{thigh:85, shin:-12},{thigh:70, shin:70}], arms:[{upper:95, fore:95}]}, scene:['floor', {bench:[150,160,56]}, {arrow:[200,80,200,140]}]},
  },
  'Leg press': {
    summary: 'A seated machine press for the whole leg with the back supported.',
    setup: ['Feet shoulder-width in the middle of the plate, back and head on the pad.', 'Release the safeties with the knees slightly bent.'],
    move: ['Lower the plate until the knees are near a right angle.', 'Press back out without locking the knees.'],
    cues: ['Lower back stays on the pad; stop the descent before it peels off.', 'Knees in line with the feet.'],
    mistake: 'Going so deep the hips tuck under and the lower back lifts.',
    link: L(154, 'seated-leg-press'),
    art: {start:{x:150, y:140, torso:-40, legs:[{thigh:70, shin:30}], arms:[{upper:20, fore:60}]}, finish:{x:150, y:140, torso:-40, legs:[{thigh:120, shin:-20}], arms:[{upper:20, fore:60}]}, scene:['floor', {bar:[40,96,70]}, {post:[56,96]}, {text:[20,88,'plate']}]},
  },
  'Romanian deadlift': {
    summary: 'A hip hinge with a flat back. The main hamstring and glute lift.',
    setup: ['Stand tall holding the bar or dumbbells against the thighs, feet hip-width.', 'Soft knees, shoulders back.'],
    move: ['Push the hips back and hinge forward with a flat back until the weight reaches mid-shin.', 'Stand up by squeezing the glutes; the hips come forward, not the chest up first.'],
    cues: ['Weight brushes the legs the whole way.', 'Back flat; if it rounds, you have gone too low.', 'The knees stay slightly bent and do not bend more as you lower.'],
    mistake: 'Squatting it: bending the knees instead of pushing the hips back.',
    link: L(317, 'romanian-deadlift'),
    art: {start:{...STAND, x:70, arms:[{upper:5, fore:5}], props:['bar']}, finish:{...HINGE, props:['bar']}, scene:['floor', {arrow:[196,70,196,118]}]},
  },
  'Kettlebell deadlift': {
    summary: 'The hip hinge with a kettlebell between the feet. The pattern behind every deadlift and swing.',
    setup: ['Kettlebell between the feet, feet hip-width.', 'Hinge down with a flat back and grip the handle with both hands.'],
    move: ['Stand up by driving the hips forward until you are tall.', 'Hinge back down the same way, bell touching the floor.'],
    cues: ['Shins stay close to vertical.', 'Chest proud, back flat.'],
    mistake: 'Rounding the back to reach the handle.',
    link: L(33, 'hip-hinge'),
    art: {start:{...HINGE, x:70, torso:70, legs:[{thigh:30, shin:-10}], arms:[{upper:110, fore:110}], props:['kb']}, finish:{...STAND, x:160, arms:[{upper:5, fore:5}], props:['kb']}, scene:['floor', {arrow:[120,170,120,120]}]},
  },
  'Back extension': {
    summary: 'A hinge on the 45-degree bench. Hamstrings and glutes without a bar.',
    setup: ['Hips on the pad just above the crease, ankles locked in.', 'Hands across the chest, or holding a plate to make it harder.'],
    move: ['Hinge down with a flat back until the body is near vertical.', 'Rise until the body is one straight line. Not beyond.'],
    cues: ['Squeeze the glutes to come up.', 'Head in line with the spine.'],
    mistake: 'Arching past straight at the top.',
    link: L(317, 'romanian-deadlift', 'ACE has no back-extension bench page; it is the same hinge as the Romanian deadlift.'),
    art: {start:{x:120, y:130, torso:120, legs:[{thigh:-50, shin:-50, foot:'back'}], arms:[{upper:40, fore:130}]}, finish:{x:120, y:130, torso:50, legs:[{thigh:-50, shin:-50, foot:'back'}], arms:[{upper:40, fore:130}]}, scene:['floor', {bar:[110,140,200]}, {post:[200,140]}, {arrow:[60,190,60,130]}]},
  },
  'Single-leg glute bridge': {
    summary: 'A bridge on one leg. Glutes and hamstrings, no equipment.',
    setup: ['Lie on your back, one foot flat near the glutes, the other leg straight or knee lifted.', 'Arms by your sides.'],
    move: ['Drive the hips up through the planted heel until the body is a straight line from shoulder to knee.', 'Lower slowly without resting on the floor between reps.'],
    cues: ['Hips level; do not let the free side sag.', 'Squeeze the glute at the top for a second.'],
    mistake: 'Pushing through the toes and arching the lower back.',
    link: L(145, 'glute-bridge-single-leg-progression'),
    art: {start:{x:120, y:196, torso:90, legs:[{thigh:-100, shin:-180},{thigh:-140, shin:-140}], arms:[{upper:90, fore:90}]}, finish:{x:120, y:164, torso:70, legs:[{thigh:-110, shin:-180},{thigh:-150, shin:-150}], arms:[{upper:80, fore:80}]}, scene:['floor', {arrow:[60,196,60,160]}]},
  },
  'Barbell hip thrust': {
    summary: 'The heaviest glute exercise there is: shoulders on a bench, bar across the hips.',
    setup: ['Upper back on the edge of a bench, bar (padded) across the hips, feet flat about shoulder-width.', 'Chin tucked, eyes forward.'],
    move: ['Drive the hips up until the body is a straight line from shoulders to knees.', 'Squeeze the glutes at the top, lower under control.'],
    cues: ['Shins vertical at the top.', 'Ribs down; do not arch the back to finish.'],
    mistake: 'Pushing through the toes or hyperextending the lower back.',
    link: L(367, 'elevated-glute-bridge'),
    art: {start:{x:130, y:176, torso:60, legs:[{thigh:-110, shin:-180}], arms:[{upper:90, fore:120}], props:['bar']}, finish:{x:130, y:142, torso:85, legs:[{thigh:-130, shin:-180}], arms:[{upper:95, fore:120}], props:['bar']}, scene:['floor', {bench:[160,150,60]}, {arrow:[60,190,60,150]}]},
  },
  'Hip thrust': {
    summary: 'The hip thrust on a machine or Smith bar: shoulders supported, weight across the hips.',
    setup: ['Upper back on the pad, weight across the hips, feet flat about shoulder-width.'],
    move: ['Drive the hips up until the body is a straight line from shoulders to knees.', 'Squeeze the glutes at the top, lower under control.'],
    cues: ['Shins vertical at the top.', 'Chin tucked, ribs down.'],
    mistake: 'Arching the back instead of lifting the hips.',
    link: L(367, 'elevated-glute-bridge'),
    art: {start:{x:130, y:176, torso:60, legs:[{thigh:-110, shin:-180}], arms:[{upper:90, fore:120}], props:['bar']}, finish:{x:130, y:142, torso:85, legs:[{thigh:-130, shin:-180}], arms:[{upper:95, fore:120}], props:['bar']}, scene:['floor', {bench:[160,150,60]}, {arrow:[60,190,60,150]}]},
  },
  'Dumbbell hip thrust': {
    summary: 'The hip thrust with a dumbbell held across the hips.',
    setup: ['Upper back on a bench, dumbbell across the hips held with both hands, feet flat.'],
    move: ['Drive the hips up until the body is a straight line from shoulders to knees.', 'Squeeze the glutes at the top, lower under control.'],
    cues: ['Shins vertical at the top.', 'Chin tucked, ribs down.'],
    mistake: 'Arching the back instead of lifting the hips.',
    link: L(367, 'elevated-glute-bridge'),
    art: {start:{x:130, y:176, torso:60, legs:[{thigh:-110, shin:-180}], arms:[{upper:90, fore:120}], props:['db']}, finish:{x:130, y:142, torso:85, legs:[{thigh:-130, shin:-180}], arms:[{upper:95, fore:120}], props:['db']}, scene:['floor', {bench:[160,150,60]}, {arrow:[60,190,60,150]}]},
  },
  'Single-leg hip thrust': {
    summary: 'The hip thrust on one leg, shoulders on a chair or sofa edge.',
    setup: ['Upper back on the seat edge, one foot flat on the floor, the other leg lifted.'],
    move: ['Drive the hips up through the planted heel until the body is a straight line.', 'Lower slowly, hips level.'],
    cues: ['Do not let the free side of the hips drop.', 'Chin tucked.'],
    mistake: 'Twisting toward the working leg.',
    link: L(145, 'glute-bridge-single-leg-progression'),
    art: {start:{x:130, y:176, torso:60, legs:[{thigh:-110, shin:-180},{thigh:-150, shin:-150}], arms:[{upper:90, fore:120}]}, finish:{x:130, y:142, torso:85, legs:[{thigh:-130, shin:-180},{thigh:-160, shin:-160}], arms:[{upper:95, fore:120}]}, scene:['floor', {bench:[160,150,60]}, {arrow:[60,190,60,150]}]},
  },
  'Bulgarian split squat': {
    summary: 'A one-leg squat with the rear foot raised. The best single-leg strength builder for runners.',
    setup: ['Stand a long stride in front of a bench, top of the rear foot resting on it.', 'Weight in the hands (dumbbells at the sides, or a kettlebell at the chest) or bodyweight.'],
    move: ['Lower straight down until the front thigh is about level with the floor.', 'Drive up through the front heel.'],
    cues: ['Torso tall, a slight forward lean is fine.', 'Front knee tracks over the foot, not inside it.', 'Most of the weight on the front leg; the back leg is a kickstand.'],
    mistake: 'Standing too close to the bench, so the front knee shoots forward.',
    link: L(366, 'bulgarian-split-squat'),
    art: {start:{x:100, y:120, torso:3, legs:[{thigh:0, shin:0},{thigh:-50, shin:-120, foot:'back'}], arms:[{upper:5, fore:5}], props:['db']}, finish:{x:110, y:146, torso:8, legs:[{thigh:88, shin:-5},{thigh:-45, shin:-125, foot:'back'}], arms:[{upper:5, fore:5}], props:['db']}, scene:['floor', {bench:[160,150,60]}, {arrow:[40,90,40,150]}]},
  },
  'Reverse lunges': {
    summary: 'A lunge stepping backward. Easier on the knee than stepping forward.',
    setup: ['Stand tall, dumbbells at the sides or hands on the hips.'],
    move: ['Step one foot back and lower until both knees are near right angles.', 'Drive through the front foot to stand and bring the feet together.'],
    cues: ['Torso tall.', 'Front shin close to vertical; the back knee hovers above the floor.'],
    mistake: 'Short steps that push the front knee far forward.',
    link: L(319, 'reverse-lunge'),
    art: {start:{...STAND, x:70, props:['db']}, finish:{...LUNGE_BOTTOM, x:150, props:['db']}, scene:['floor', {arrow:[110,170,160,185]}]},
  },
  'Weighted step-ups': {
    summary: 'Step onto a box with dumbbells. One leg does all the work.',
    setup: ['Whole foot on a knee-high box, dumbbells at the sides.'],
    move: ['Stand up through the box leg without pushing off the floor foot.', 'Step down slowly under control.'],
    cues: ['Lean forward slightly from the hips, back flat.', 'Knee over the foot, not inside it.'],
    mistake: 'Bouncing off the back foot to get up.',
    link: L(28, 'step-up'),
    art: {start:{x:120, y:130, torso:15, legs:[{thigh:90, shin:-5},{thigh:-5, shin:-5}], arms:[{upper:5, fore:5}], props:['db']}, finish:{x:92, y:78, torso:3, legs:[{thigh:0, shin:0},{thigh:-25, shin:-25, foot:'back'}], arms:[{upper:5, fore:5}], props:['db']}, scene:['floor', {box:[40,170,70]}, {arrow:[180,150,180,100]}]},
  },
  'Step-ups': {
    summary: 'Step onto a box or stair. One leg does all the work.',
    setup: ['Whole foot on the box or step.'],
    move: ['Stand up through the box leg without pushing off the floor foot.', 'Step down slowly under control.'],
    cues: ['Slight forward lean from the hips, back flat.', 'Knee over the foot.'],
    mistake: 'Bouncing off the back foot to get up.',
    link: L(28, 'step-up'),
    art: {start:{x:120, y:130, torso:15, legs:[{thigh:90, shin:-5},{thigh:-5, shin:-5}], arms:[{upper:5, fore:5}]}, finish:{x:92, y:78, torso:3, legs:[{thigh:0, shin:0},{thigh:-25, shin:-25, foot:'back'}], arms:[{upper:5, fore:5}]}, scene:['floor', {box:[40,170,70]}, {arrow:[180,150,180,100]}]},
  },
  'Single-leg Romanian deadlift': {
    summary: 'The hinge on one leg. Hamstrings, glutes and balance together.',
    setup: ['Stand on one leg, soft knee, weight in the opposite hand or arms reaching forward.', 'Fingertips on a wall if balance is the limit.'],
    move: ['Hinge forward at the hip while the free leg extends behind you, back flat, until the torso is near level.', 'Return to standing by squeezing the glute of the standing leg.'],
    cues: ['Hips square to the floor; the free hip does not open up.', 'Body makes one straight line from head to heel at the bottom.'],
    mistake: 'Rounding the back or turning the hips to reach lower.',
    link: L(350, 'single-leg-romanian-dead-lift'),
    art: {start:{...STAND, x:70, arms:[{upper:5, fore:5}], props:['db']}, finish:{x:150, y:126, torso:80, legs:[{thigh:12, shin:-10},{thigh:-110, shin:-110, foot:'back'}], arms:[{upper:120, fore:120}], props:['db']}, scene:['floor', {arrow:[196,70,196,118]}]},
  },
  'Walking lunges': {
    summary: 'Lunges that travel forward. Strength plus a long stride.',
    setup: ['Stand tall, weight at the sides, at the chest, or bodyweight.'],
    move: ['Step forward and lower until both knees are near right angles.', 'Drive through the front foot straight into the next step.'],
    cues: ['Torso tall, eyes forward.', 'Front shin close to vertical.'],
    mistake: 'Letting the front knee collapse inward on the push-off.',
    link: L(363, 'lunge'),
    art: {start:{...STAND, x:70, props:['db']}, finish:{...LUNGE_BOTTOM, x:150, props:['db']}, scene:['floor', {arrow:[60,196,110,196]}]},
  },
  'Kettlebell swing': {
    summary: 'A hip snap, not a lift: hinge back, drive the hips forward, the bell floats.',
    setup: ['Feet shoulder-width, kettlebell a foot in front, hinge down and grip it with both hands.', 'Hike it back between the legs to start.'],
    move: ['Snap the hips forward and stand tall; the bell swings to chest height with straight, relaxed arms.', 'Let it fall, hinge as it passes the hips, hike it back and repeat.'],
    cues: ['Power comes from the hips, not the shoulders or arms.', 'Flat back at the bottom; shins stay close to vertical.', 'Stand tall and squeeze the glutes at the top.'],
    mistake: 'Squatting the swing, or lifting the bell with the arms.',
    link: L(391, 'swing'),
    art: {start:{x:70, y:126, torso:70, legs:[{thigh:30, shin:-10}], arms:[{upper:135, fore:135}], props:['kb']}, finish:{...STAND, x:160, arms:[{upper:88, fore:88}], props:['kb']}, scene:['floor', {arrow:[90,190,170,120]}]},
  },
  'Dumbbell swing': {
    summary: 'The swing with one dumbbell held by the end.',
    setup: ['Feet shoulder-width, hold one dumbbell by the end with both hands.', 'Hike it back between the legs.'],
    move: ['Snap the hips forward and stand tall; the dumbbell swings to chest height.', 'Hinge as it falls and repeat.'],
    cues: ['Hips do the work, arms stay relaxed.', 'Flat back at the bottom.'],
    mistake: 'Squatting instead of hinging.',
    link: L(391, 'swing'),
    art: {start:{x:70, y:126, torso:70, legs:[{thigh:30, shin:-10}], arms:[{upper:135, fore:135}], props:['dbVert']}, finish:{...STAND, x:160, arms:[{upper:88, fore:88}], props:['dbVert']}, scene:['floor', {arrow:[90,190,170,120]}]},
  },
  'Standing calf raise': {
    summary: 'The calf raise on the standing machine, one leg at a time.',
    setup: ['Ball of the foot on the edge of the platform, shoulders under the pads, knee straight.'],
    move: ['Rise as high as you can onto the ball of the foot and pause.', 'Lower over about three seconds until the heel is below the platform.'],
    cues: ['Full range at both ends.', 'No bouncing at the bottom.'],
    mistake: 'Short, fast reps that never reach the stretch.',
    link: L(294, 'calf-raise'),
    art: {start:{...STAND, x:80, legs:[{thigh:0, shin:0}]}, finish:{x:160, y:108, torso:0, legs:[{thigh:0, shin:0, foot:'up'}], arms:[{upper:5, fore:5}]}, scene:['floor', {box:[30,200,180]}, {arrow:[200,150,200,110]}]},
  },
  'Standing single-leg calf raise': {
    summary: 'A calf raise on one leg off a step. The running calf exercise.',
    setup: ['Ball of one foot on the edge of a step or stair, the other foot off the floor, fingertips on a rail or wall.', 'A dumbbell in the free hand once 12 reps are easy.'],
    move: ['Rise as high as possible onto the ball of the foot and pause.', 'Lower over three seconds until the heel drops below the step.'],
    cues: ['Knee straight but not locked.', 'Push through the big toe; do not roll to the outside.'],
    mistake: 'Bouncing at the bottom instead of the slow lowering.',
    link: L(51, 'calf-raises'),
    art: {start:{x:110, y:120, torso:0, legs:[{thigh:0, shin:0},{thigh:-15, shin:-60, foot:'back'}], arms:[{upper:60, fore:60}]}, finish:{x:110, y:106, torso:0, legs:[{thigh:0, shin:0, foot:'up'},{thigh:-15, shin:-60, foot:'back'}], arms:[{upper:60, fore:60}]}, scene:['floor', {box:[40,200,90]}, {wall:28}, {arrow:[200,150,200,110]}]},
  },
  'Seated calf raise': {
    summary: 'The calf raise with a bent knee, which works the deeper calf muscle the standing version misses.',
    setup: ['Sit with the balls of the feet on a step or the machine platform, knees at a right angle.', 'Load on the knees: the machine pad, a dumbbell or kettlebell, or press down with the hands.'],
    move: ['Raise the heels as high as possible against the load and pause.', 'Lower slowly until the heels are below the step.'],
    cues: ['Full stretch at the bottom, full squeeze at the top.', 'Keep the knee angle fixed.'],
    mistake: 'Rocking the body to help the calves.',
    link: L(51, 'calf-raises', 'ACE has no seated page; the same raise, done with the knee bent.'),
    art: {start:{x:130, y:140, torso:0, legs:[{thigh:90, shin:-5}], arms:[{upper:60, fore:130}], props:['db']}, finish:{x:130, y:136, torso:0, legs:[{thigh:90, shin:-5, foot:'up'}], arms:[{upper:60, fore:130}], props:['db']}, scene:['floor', {bench:[110,150,60]}, {arrow:[60,190,60,160]}]},
  },
  'Calf press on the leg press': {
    summary: 'A calf raise on the leg press plate.',
    setup: ['Balls of the feet on the bottom edge of the plate, legs nearly straight, safeties set.'],
    move: ['Press the plate away with the balls of the feet only and pause at full stretch of the calf.', 'Lower slowly.'],
    cues: ['A slight knee bend throughout; never lock the knees.', 'Slow lowering.'],
    mistake: 'Letting the knees lock or bending them to push.',
    link: L(294, 'calf-raise'),
    art: {start:{x:150, y:140, torso:-40, legs:[{thigh:120, shin:-22}], arms:[{upper:20, fore:60}]}, finish:{x:150, y:140, torso:-40, legs:[{thigh:120, shin:-22, foot:'up'}], arms:[{upper:20, fore:60}]}, scene:['floor', {bar:[40,96,70]}, {post:[56,96]}]},
  },
  'Hamstring curl': {
    summary: 'The hamstring machine: curl the heels toward the glutes.',
    setup: ['Lying or seated, pad just above the heels, hips pressed into the bench.'],
    move: ['Curl the heels toward the glutes.', 'Lower slowly, about three seconds.'],
    cues: ['Hips stay down; do not lift them to help.', 'Full extension at the bottom without locking.'],
    mistake: 'Jerking the weight up and dropping it.',
    link: L(131, 'prone-lying-hamstrings-curl'),
    art: {start:{x:120, y:150, torso:95, legs:[{thigh:-95, shin:-95, foot:'back'}], arms:[{upper:120, fore:120}]}, finish:{x:120, y:150, torso:95, legs:[{thigh:-95, shin:-180, foot:'back'}], arms:[{upper:120, fore:120}]}, scene:['floor', {bench:[50,156,140]}, {arrow:[200,190,200,140]}]},
  },
  'Stability-ball hamstring curl': {
    summary: 'A hamstring curl using a ball: lift the hips, pull the ball in with the heels.',
    setup: ['Lie on your back, heels on the ball, arms out to the sides.'],
    move: ['Lift the hips so the body is straight, then pull the ball toward you with the heels.', 'Roll it back out with the hips still up.'],
    cues: ['Hips stay lifted the whole set.', 'Pull with the heels, not the toes.'],
    mistake: 'Letting the hips drop as the ball comes in.',
    link: L(59, 'stability-ball-hamstring-curl'),
    art: {start:{x:100, y:186, torso:85, legs:[{thigh:-95, shin:-95}], arms:[{upper:90, fore:90}]}, finish:{x:110, y:170, torso:80, legs:[{thigh:-110, shin:-175}], arms:[{upper:90, fore:90}]}, scene:['floor', {ball:[190,186,24]}, {arrow:[200,150,150,150]}]},
  },
  'Mini-band side steps': {
    summary: 'Side steps against a mini band. Builds the hip muscles that keep the knee straight when you run.',
    setup: ['Band just above the knees, feet hip-width, slight knee bend, toes pointing forward.'],
    move: ['Step sideways, keeping tension in the band, then bring the trailing foot in without letting the band go slack.', 'Repeat the other way.'],
    cues: ['Toes forward the whole time.', 'Stay low; do not rise up between steps.', 'Knees pushed out against the band.'],
    mistake: 'Letting the knees fall in or turning the toes out.',
    link: L(290, 'walking-abduction'),
    art: {view:'front', start:{x:70, y:124, stance:14, bend:0.4, kneeOut:4, props:['band'], arms:{angle:25}}, finish:{x:160, y:124, stance:30, bend:0.4, kneeOut:6, props:['band'], arms:{angle:25}}, scene:['floor', {arrow:[100,196,150,196]}]},
  },
  'Side-lying leg raises': {
    summary: 'Lift the top leg while lying on your side. Hip muscles for a stable knee.',
    setup: ['Lie on your side, legs straight and stacked, head on the lower arm.'],
    move: ['Lift the top leg slowly to about 45 degrees with the toes pointing forward.', 'Pause, lower slowly.'],
    cues: ['Lift straight up, not forward.', 'Hips stacked; do not roll back.'],
    mistake: 'Swinging the leg or letting the toes point up.',
    link: L(290, 'walking-abduction', 'ACE has no side-lying page; this works the same hip muscles.'),
    art: {start:{x:120, y:196, torso:90, legs:[{thigh:-90, shin:-90}], arms:[{upper:120, fore:60}]}, finish:{x:120, y:196, torso:90, legs:[{thigh:-90, shin:-90},{thigh:-50, shin:-50}], arms:[{upper:120, fore:60}]}, scene:['floor', {arrow:[40,188,40,150]}]},
  },
  'Side plank': {
    summary: 'A hold on one forearm with the body straight. Trunk muscles that keep the pelvis level while you run.',
    setup: ['Lie on one side, elbow directly under the shoulder, feet stacked or staggered.'],
    move: ['Lift the hips so the body makes a straight line from head to feet.', 'Hold, breathing normally, then lower.'],
    cues: ['Hips forward and up; do not let them sag or drift back.', 'Shoulders stacked.'],
    mistake: 'Hips sagging toward the floor.',
    link: L(303, 'side-plank'),
    art: {start:{x:120, y:200, torso:90, legs:[{thigh:-90, shin:-90}], arms:[{upper:150, fore:60}]}, finish:{x:120, y:176, torso:80, legs:[{thigh:-100, shin:-100}], arms:[{upper:160, fore:75}]}, scene:['floor', {arrow:[160,196,160,164]}]},
  },
  'Suitcase carry': {
    summary: 'Walk with a heavy weight in one hand without leaning. Anti-side-bend trunk work.',
    setup: ['Pick up one heavy weight, stand tall, shoulders level.'],
    move: ['Walk 30 to 40 metres at a normal pace.', 'Set it down, switch hands, repeat.'],
    cues: ['Stay level; the trunk fights the pull.', 'Shoulders back, ribs down.'],
    mistake: 'Leaning away from the weight to balance it.',
    link: L(389, 'suitcase-carry'),
    art: {view:'front', start:{x:120, y:120, stance:12, arms:[{angle:8, hidden:true},{angle:8}], props:['kb']}, finish:{x:120, y:120, stance:12, arms:[{angle:8, hidden:true},{angle:8}], props:['kb']}, scene:['floor', {text:[40,60,'stay level']}]},
  },
  'Dead bug': {
    summary: 'Opposite arm and leg lower toward the floor while the back stays flat. Deep trunk control.',
    setup: ['Lie on your back, arms up toward the ceiling, knees over the hips at a right angle.', 'Press the lower back gently into the floor.'],
    move: ['Lower one arm overhead and the opposite leg toward the floor as far as the back stays flat.', 'Return and switch sides.'],
    cues: ['Breathe out as the limbs lower.', 'If the lower back lifts, shorten the range.'],
    mistake: 'Letting the back arch as the leg lowers.',
    link: L(147, 'supine-dead-bug'),
    art: {start:{x:120, y:196, torso:90, legs:[{thigh:-180, shin:-90},{thigh:-180, shin:-90}], arms:[{upper:180, fore:180}]}, finish:{x:120, y:196, torso:90, legs:[{thigh:-180, shin:-90},{thigh:-120, shin:-120}], arms:[{upper:180, fore:180},{upper:100, fore:100}]}, scene:['floor']},
  },
  'Plank': {
    summary: 'A hold on the forearms with the body straight.',
    setup: ['Forearms on the floor, elbows under the shoulders, feet together or hip-width.'],
    move: ['Lift to a straight line from head to heels and hold, breathing normally.'],
    cues: ['Squeeze the glutes and brace the trunk.', 'Eyes down, neck long.'],
    mistake: 'Hips sagging or piking up.',
    link: L(32, 'front-plank'),
    art: {start:{x:120, y:200, torso:95, legs:[{thigh:-95, shin:-95}], arms:[{upper:40, fore:120}]}, finish:{x:130, y:170, torso:82, legs:[{thigh:-100, shin:-100}], arms:[{upper:30, fore:120}]}, scene:['floor']},
  },
  'Bird dog': {
    summary: 'On hands and knees, reach one arm forward and the opposite leg back without moving the trunk.',
    setup: ['Hands under the shoulders, knees under the hips, back flat.'],
    move: ['Reach one arm forward and the opposite leg back until both are level with the body.', 'Hold a second, return, switch sides.'],
    cues: ['Hips stay level; nothing in the trunk moves.', 'Reach long rather than high.'],
    mistake: 'Lifting the leg so high the back arches and the hip opens.',
    link: L(14, 'bird-dog'),
    art: {start:{x:140, y:150, torso:90, legs:[{thigh:-95, shin:-180, foot:'back'}], arms:[{upper:0, fore:0}]}, finish:{x:140, y:150, torso:90, legs:[{thigh:-95, shin:-180, foot:'back', hidden:true},{thigh:-178, shin:-178, foot:'back'}], arms:[{upper:0, fore:0, hidden:true},{upper:178, fore:178}]}, scene:['floor']},
  },
  'Hanging knee raise': {
    summary: 'Hang from the bar and lift the knees. Hip flexors and deep abs.',
    setup: ['Hang with straight arms, shoulders pulled down away from the ears.'],
    move: ['Lift the knees toward the chest without swinging.', 'Lower slowly.'],
    cues: ['Tilt the pelvis up at the top; it is a curl, not just a leg lift.', 'No swinging: pause at the bottom of each rep.'],
    mistake: 'Using momentum.',
    link: L(76, 'reverse-crunch', 'ACE has no hanging version; the reverse crunch is the same movement lying down.'),
    art: {start:{x:120, y:110, torso:0, legs:[{thigh:5, shin:5}], arms:[{upper:180, fore:180}]}, finish:{x:120, y:110, torso:8, legs:[{thigh:100, shin:0}], arms:[{upper:180, fore:180}]}, scene:[{bar:[60,20,180]}, {arrow:[180,190,180,140]}]},
  },
  'Knee raise on the dip bars': {
    summary: 'Supported on straight arms, lift the knees. Hip flexors and deep abs.',
    setup: ['Support yourself on the dip bars with straight arms, shoulders down.'],
    move: ['Lift the knees toward the chest without swinging.', 'Lower slowly.'],
    cues: ['Tilt the pelvis up at the top.', 'Shoulders stay down away from the ears.'],
    mistake: 'Swinging the legs.',
    link: L(76, 'reverse-crunch', 'ACE has no dip-bar version; the reverse crunch is the same movement lying down.'),
    art: {start:{x:120, y:110, torso:0, legs:[{thigh:5, shin:5}], arms:[{upper:-10, fore:-10}]}, finish:{x:120, y:110, torso:8, legs:[{thigh:100, shin:0}], arms:[{upper:-10, fore:-10}]}, scene:[{bar:[70,134,110]}, {post:[80,134]}, {post:[170,134]}, {arrow:[200,190,200,140]}]},
  },
  'Lying leg raises': {
    summary: 'Raise straight legs to vertical while lying on your back.',
    setup: ['Lie on your back, hands under the hips, legs straight.'],
    move: ['Raise the legs to vertical.', 'Lower slowly without letting the lower back arch off the floor.'],
    cues: ['Stop the lowering where the back starts to lift.', 'Slow on the way down.'],
    mistake: 'Arching the back to lower the legs further.',
    link: L(76, 'reverse-crunch'),
    art: {start:{x:120, y:196, torso:90, legs:[{thigh:-90, shin:-90}], arms:[{upper:90, fore:90}]}, finish:{x:120, y:196, torso:90, legs:[{thigh:-180, shin:-180}], arms:[{upper:90, fore:90}]}, scene:['floor', {arrow:[40,188,40,130]}]},
  },
  'Pogo hops': {
    summary: 'Small, quick hops on the balls of the feet with stiff ankles. The spring runners use on every stride.',
    setup: ['Stand tall, feet together, knees nearly straight.'],
    move: ['Hop in place, bouncing off the balls of the feet.', 'Minimal ground contact; think of bouncing a ball, not jumping high.'],
    cues: ['Ankles do the work; the knees barely bend.', 'Land on the forefoot, heels kissing the floor.'],
    mistake: 'Deep knee bends that turn it into a squat jump.',
    link: L(176, 'jump-and-reach', 'ACE has no pogo page; this vertical jump is the closest.'),
    art: {start:{...STAND, x:80, legs:[{thigh:0, shin:0}]}, finish:{x:160, y:100, torso:0, legs:[{thigh:0, shin:0, foot:'up'}], arms:[{upper:5, fore:5}]}, scene:['floor', {arrow:[200,170,200,120]}]},
  },
  'Box jumps': {
    summary: 'Jump onto a box and land softly. Power for the push-off.',
    setup: ['Stand a short step from a knee-high box, feet hip-width.'],
    move: ['Dip into a quarter squat, swing the arms and jump, landing softly on the box with both feet.', 'Stand tall, then step down. Never jump down.'],
    cues: ['Land quietly with bent knees, feet flat on the box.', 'Full recovery between reps; quality over quantity.'],
    mistake: 'Landing in a deep squat on the box because it is too high.',
    link: L(115, 'box-jumps'),
    art: {start:{x:150, y:150, torso:25, legs:[{thigh:60, shin:-20}], arms:[{upper:-50, fore:-50}]}, finish:{x:90, y:110, torso:8, legs:[{thigh:35, shin:-10}], arms:[{upper:60, fore:60}]}, scene:['floor', {box:[40,170,70]}, {arrow:[150,110,105,80]}]},
  },
  'Hurdle hops': {
    summary: 'Two-foot hops over a row of low hurdles with quick contacts.',
    setup: ['Low hurdles in a row, a stride apart.'],
    move: ['Hop over each one with both feet, landing softly and springing straight into the next.'],
    cues: ['Quick off the ground.', 'Land on the balls of the feet, knees soft.'],
    mistake: 'Pausing and resetting between hurdles.',
    link: L(221, 'forward-hurdle-run'),
    art: {start:{x:70, y:120, torso:5, legs:[{thigh:30, shin:0}], arms:[{upper:-40, fore:-40}]}, finish:{x:150, y:96, torso:5, legs:[{thigh:60, shin:30}], arms:[{upper:50, fore:50}]}, scene:['floor', {post:[110,190]}, {post:[180,190]}, {arrow:[90,150,140,120]}]},
  },
  'Squat jumps': {
    summary: 'Jump as high as you can from a quarter squat and land softly.',
    setup: ['Feet shoulder-width, arms ready to swing.'],
    move: ['Drop into a quarter squat and jump as high as you can.', 'Land softly with bent knees, reset, repeat.'],
    cues: ['Quiet landings.', 'Full effort on each jump; rest between.'],
    mistake: 'Landing stiff-legged.',
    link: L(116, 'squat-jumps'),
    art: {start:{x:70, y:150, torso:25, legs:[{thigh:60, shin:-20}], arms:[{upper:-50, fore:-50}]}, finish:{x:160, y:84, torso:0, legs:[{thigh:0, shin:0, foot:'up'}], arms:[{upper:170, fore:170}]}, scene:['floor', {arrow:[110,150,150,100]}]},
  },
  'Dumbbell bench press': {
    summary: 'Press two dumbbells from the chest while lying on a bench.',
    setup: ['Lie on the bench, feet flat, dumbbells at the sides of the chest with the elbows about 45 degrees from the body.'],
    move: ['Press up until the arms are straight over the chest.', 'Lower under control until the dumbbells are level with the chest.'],
    cues: ['Shoulder blades pulled back and down on the bench.', 'Wrists straight over the elbows.'],
    mistake: 'Flaring the elbows straight out to the sides.',
    link: L(19, 'chest-press'),
    art: {start:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:150, fore:-100}], props:['db']}, finish:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:-90, fore:-90}], props:['db']}, scene:['floor', {bench:[40,156,130]}]},
  },
  'Barbell bench press': {
    summary: 'Press a bar from the chest while lying on a bench.',
    setup: ['Lie with the eyes under the bar, feet flat, hands a little wider than the shoulders.', 'Unrack and hold the bar over the chest.'],
    move: ['Lower the bar to the lower chest with the elbows about 45 degrees from the body.', 'Press back up to straight arms.'],
    cues: ['Shoulder blades back and down.', 'Bar path slightly diagonal, from over the shoulders to the lower chest.'],
    mistake: 'Bouncing the bar off the chest.',
    link: L(5, 'chest-press'),
    art: {start:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:150, fore:-100}], props:['bar']}, finish:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:-90, fore:-90}], props:['bar']}, scene:['floor', {bench:[40,156,130]}]},
  },
  'Chest press': {
    summary: 'The chest press machine: a bench press with the path fixed.',
    setup: ['Seat set so the handles are level with the mid-chest, back on the pad.'],
    move: ['Press the handles forward until the arms are straight.', 'Return slowly without letting the weight stack touch down.'],
    cues: ['Shoulder blades back; do not reach forward at the end.'],
    mistake: 'Letting the shoulders roll forward on each press.',
    link: L(188, 'seated-chest-press'),
    art: {start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:170}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:90}]}, scene:['floor', {bench:[110,150,60]}, {post:[200,70]}]},
  },
  'Bench press': {
    summary: 'The bench press on a Smith machine bar.',
    setup: ['Lie with the bar over the lower chest, hands a little wider than the shoulders.'],
    move: ['Lower the bar to the chest, press back up, re-hook at the top.'],
    cues: ['Shoulder blades back and down.', 'Elbows about 45 degrees from the body.'],
    mistake: 'Bouncing the bar off the chest.',
    link: L(5, 'chest-press'),
    art: {start:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:150, fore:-100}], props:['bar']}, finish:{x:130, y:150, torso:90, legs:[{thigh:-110, shin:-180}], arms:[{upper:-90, fore:-90}], props:['bar']}, scene:['floor', {bench:[40,156,130]}]},
  },
  'Push-ups': {
    summary: 'The bodyweight press. Hands on a bench to make it easier, feet on a step to make it harder.',
    setup: ['Hands a little wider than the shoulders, body in a straight line from head to heels.'],
    move: ['Lower until the chest is a fist from the floor, elbows about 45 degrees from the body.', 'Press back up to straight arms.'],
    cues: ['Squeeze the glutes; no sagging hips.', 'Eyes down, neck long.'],
    mistake: 'Hips sagging or the head reaching for the floor.',
    link: L(41, 'push-up'),
    art: {start:{x:130, y:170, torso:82, legs:[{thigh:-100, shin:-100}], arms:[{upper:-5, fore:-5}]}, finish:{x:130, y:188, torso:84, legs:[{thigh:-96, shin:-96}], arms:[{upper:-80, fore:40}]}, scene:['floor']},
  },
  'Pull-ups': {
    summary: 'Hang from the bar and pull the chin over it. The strongest upper-back exercise with no equipment but the bar.',
    setup: ['Hands a little wider than the shoulders, palms away, hang with straight arms.', 'A band looped over the bar and under a foot takes some of the weight.'],
    move: ['Pull until the chin clears the bar, leading with the chest.', 'Lower slowly to a full hang.'],
    cues: ['Start each rep by pulling the shoulder blades down.', 'No kicking or swinging.', 'Not there yet? Jump to the top and lower over three seconds.'],
    mistake: 'Half reps that never reach a full hang.',
    link: L(191, 'pull-ups'),
    art: {start:{x:120, y:130, torso:0, legs:[{thigh:5, shin:-30, foot:'back'}], arms:[{upper:180, fore:180}]}, finish:{x:120, y:88, torso:-5, legs:[{thigh:5, shin:-30, foot:'back'}], arms:[{upper:170, fore:-130}]}, scene:[{bar:[60,20,180]}, {arrow:[200,150,200,100]}]},
  },
  'Assisted pull-ups': {
    summary: 'Pull-ups on the assisted machine, which takes part of your weight.',
    setup: ['Knees or feet on the platform, hands a little wider than the shoulders.'],
    move: ['Pull until the chin clears the handles, lower slowly to straight arms.'],
    cues: ['Lead with the chest; shoulder blades pull down first.', 'Reduce the help a little each week.'],
    mistake: 'Using so much assistance that the reps are easy.',
    link: L(191, 'pull-ups'),
    art: {start:{x:120, y:130, torso:0, legs:[{thigh:90, shin:-90}], arms:[{upper:180, fore:180}]}, finish:{x:120, y:88, torso:-5, legs:[{thigh:90, shin:-90}], arms:[{upper:170, fore:-130}]}, scene:[{bar:[60,20,180]}, {arrow:[200,150,200,100]}]},
  },
  'Lat pulldown': {
    summary: 'Pull a bar down to the upper chest. The pull-up with the weight chosen for you.',
    setup: ['Thighs under the pads, hands a little wider than the shoulders, lean back a touch.'],
    move: ['Pull the bar to the upper chest, elbows driving down and back.', 'Return slowly to straight arms.'],
    cues: ['Chest up; pull the elbows to the ribs.', 'No leaning back to heave it.'],
    mistake: 'Pulling behind the neck or rocking the torso.',
    link: L(158, 'seated-lat-pulldown'),
    art: {start:{x:130, y:140, torso:-8, legs:[{thigh:90, shin:-5}], arms:[{upper:175, fore:175}]}, finish:{x:130, y:140, torso:-12, legs:[{thigh:90, shin:-5}], arms:[{upper:120, fore:-150}]}, scene:['floor', {bench:[110,150,60]}, {bar:[120,20,160]}]},
  },
  'Band pulldown': {
    summary: 'A lat pulldown with a long band anchored high.',
    setup: ['Kneel facing the anchor, band held overhead with both hands.'],
    move: ['Pull the hands down to the shoulders by squeezing the shoulder blades together.', 'Return slowly.'],
    cues: ['Elbows down and back.', 'Chest up.'],
    mistake: 'Pulling with the arms only and letting the shoulders shrug.',
    link: L(35, 'kneeling-lat-pulldown'),
    art: {start:{x:130, y:150, torso:-5, legs:[{thigh:-90, shin:-180, foot:'back'}], arms:[{upper:175, fore:175}]}, finish:{x:130, y:150, torso:-10, legs:[{thigh:-90, shin:-180, foot:'back'}], arms:[{upper:120, fore:-150}]}, scene:['floor', {post:[40,20]}]},
  },
  'Inverted row under a table': {
    summary: 'A row with no equipment: lie under a sturdy table edge and pull the chest to it.',
    setup: ['Lie under the edge of a sturdy table, grip the edge, heels on the floor, body straight.'],
    move: ['Pull the chest to the edge by squeezing the shoulder blades.', 'Lower slowly.'],
    cues: ['Body straight like a plank.', 'Bend the knees and walk the feet in to make it easier.'],
    mistake: 'Hips sagging as you pull.',
    link: L(84, 'trx-reg-back-row', 'ACE has no table version; the suspension row is the same pull.'),
    art: {start:{x:130, y:190, torso:100, legs:[{thigh:-90, shin:-90}], arms:[{upper:-90, fore:-90}]}, finish:{x:130, y:170, torso:95, legs:[{thigh:-95, shin:-95}], arms:[{upper:-130, fore:-20}]}, scene:['floor', {bar:[30,110,120]}, {post:[40,110]}, {post:[140,110]}]},
  },
  'Inverted row': {
    summary: 'Hang under a bar at hip height and pull the chest to it.',
    setup: ['Bar or rings at hip height, grip a little wider than the shoulders, heels on the floor, body straight.'],
    move: ['Pull the chest to the bar by squeezing the shoulder blades.', 'Lower slowly to straight arms.'],
    cues: ['Body straight like a plank throughout.', 'Walk the feet closer to make it easier.'],
    mistake: 'Hips sagging or the head reaching for the bar.',
    link: L(84, 'trx-reg-back-row', 'ACE lists this pull under the suspension-trainer row.'),
    art: {start:{x:130, y:190, torso:100, legs:[{thigh:-90, shin:-90}], arms:[{upper:-90, fore:-90}]}, finish:{x:130, y:170, torso:95, legs:[{thigh:-95, shin:-95}], arms:[{upper:-130, fore:-20}]}, scene:['floor', {bar:[30,110,120]}, {post:[40,110]}, {post:[140,110]}]},
  },
  'Suspension row': {
    summary: 'A row on a suspension trainer, body straight, walking the feet to set the difficulty.',
    setup: ['Hold the handles, lean back with the body straight and arms extended.'],
    move: ['Pull the chest to the handles by squeezing the shoulder blades.', 'Lower slowly.'],
    cues: ['Body straight like a plank.', 'Feet further forward makes it harder.'],
    mistake: 'Bending at the hips as you pull.',
    link: L(84, 'trx-reg-back-row'),
    art: {start:{x:130, y:170, torso:60, legs:[{thigh:-60, shin:-60}], arms:[{upper:-110, fore:-110}]}, finish:{x:130, y:150, torso:50, legs:[{thigh:-50, shin:-50}], arms:[{upper:-150, fore:-30}]}, scene:['floor', {post:[60,20]}]},
  },
  'Seated row': {
    summary: 'The seated row machine: pull the handles to the ribs.',
    setup: ['Chest on the pad or sit tall, feet braced, arms extended.'],
    move: ['Pull the handles to the ribs, elbows close to the body, shoulder blades squeezing together.', 'Return slowly to full stretch.'],
    cues: ['Chest up; do not round forward on the return.', 'Elbows, not hands, lead the pull.'],
    mistake: 'Rocking the torso to move the weight.',
    link: L(168, 'seated-row'),
    art: {start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:90}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:-20, fore:90}]}, scene:['floor', {bench:[110,150,60]}, {post:[36,80]}]},
  },
  'Cable row': {
    summary: 'A row on the low cable: pull the handle to the ribs with a tall chest.',
    setup: ['Sit tall, feet braced, arms extended, slight lean back from the hips.'],
    move: ['Pull the handle to the ribs, elbows close to the body.', 'Return slowly to full stretch without rounding.'],
    cues: ['Shoulder blades squeeze at the end.', 'Torso stays still; only the arms move.'],
    mistake: 'Rocking back and forth to move the weight.',
    link: L(48, 'seated-row'),
    art: {start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:90}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:-20, fore:90}]}, scene:['floor', {bench:[110,150,60]}, {post:[36,80]}]},
  },
  'Band row': {
    summary: 'A row against a long band anchored at chest height.',
    setup: ['Sit or stand facing the anchor, band taut with the arms extended.'],
    move: ['Pull the band to the ribs by squeezing the shoulder blades.', 'Return slowly.'],
    cues: ['Chest up; elbows close to the body.'],
    mistake: 'Shrugging the shoulders up as you pull.',
    link: L(335, 'standing-row'),
    art: {start:{...STAND, x:130, arms:[{upper:90, fore:90}]}, finish:{...STAND, x:130, arms:[{upper:-20, fore:90}]}, scene:['floor', {post:[40,20]}]},
  },
  'Bent-over dumbbell row': {
    summary: 'Hinge forward and row two dumbbells to the hips.',
    setup: ['Hinge forward with a flat back until the torso is near level, dumbbells hanging below the shoulders.'],
    move: ['Row the dumbbells to the hips leading with the elbows.', 'Lower under control.'],
    cues: ['Back flat, neck long.', 'Elbows brush the ribs; no flaring.'],
    mistake: 'Standing up as you row.',
    link: L(12, 'bent-over-row'),
    art: {start:{...HINGE, x:120, torso:75, arms:[{upper:95, fore:95}], props:['db']}, finish:{...HINGE, x:120, torso:75, arms:[{upper:40, fore:120}], props:['db']}, scene:['floor', {arrow:[40,170,40,130]}]},
  },
  'Single-arm dumbbell row': {
    summary: 'One hand braced, row a dumbbell to the hip.',
    setup: ['One hand and knee on a bench (or a hand on a rail), back flat, dumbbell hanging below the shoulder.'],
    move: ['Row the dumbbell to the hip leading with the elbow.', 'Lower under control to full stretch.'],
    cues: ['Shoulders square to the floor; do not twist to lift.', 'Elbow close to the body.'],
    mistake: 'Rotating the torso to heave the weight.',
    link: L(126, 'single-arm-row'),
    art: {start:{x:120, y:130, torso:85, legs:[{thigh:12, shin:-8},{thigh:-95, shin:-180, foot:'back'}], arms:[{upper:95, fore:95, hidden:true},{upper:95, fore:95}], props:['db']}, finish:{x:120, y:130, torso:85, legs:[{thigh:12, shin:-8},{thigh:-95, shin:-180, foot:'back'}], arms:[{upper:95, fore:95, hidden:true},{upper:40, fore:120}], props:['db']}, scene:['floor', {bench:[110,150,60]}, {arrow:[40,170,40,130]}]},
  },
  'Single-arm kettlebell row': {
    summary: 'One hand braced, row a kettlebell to the hip.',
    setup: ['Hand on a knee or rail, back flat, kettlebell hanging below the shoulder.'],
    move: ['Row to the hip leading with the elbow; lower to full stretch.'],
    cues: ['Shoulders square; no twisting.'],
    mistake: 'Rotating the torso to lift.',
    link: L(126, 'single-arm-row'),
    art: {start:{x:120, y:130, torso:80, legs:[{thigh:20, shin:-8}], arms:[{upper:95, fore:95, hidden:true},{upper:95, fore:95}], props:['kb']}, finish:{x:120, y:130, torso:80, legs:[{thigh:20, shin:-8}], arms:[{upper:95, fore:95, hidden:true},{upper:40, fore:120}], props:['kb']}, scene:['floor', {arrow:[40,170,40,130]}]},
  },
  'Single-arm cable row': {
    summary: 'A row on the low cable with one arm, keeping the shoulders square.',
    setup: ['Face the low pulley, handle in one hand, other hand braced, arm extended.'],
    move: ['Row to the ribs, elbow close, shoulder blade squeezing.', 'Return slowly.'],
    cues: ['Shoulders square; the trunk resists the twist.'],
    mistake: 'Rotating toward the pull.',
    link: L(337, 'single-arm-row'),
    art: {start:{...STAND, x:130, torso:10, arms:[{upper:90, fore:90}]}, finish:{...STAND, x:130, torso:10, arms:[{upper:-20, fore:90}]}, scene:['floor', {post:[40,60]}]},
  },
  'Dumbbell shoulder press': {
    summary: 'Press two dumbbells from the shoulders to overhead.',
    setup: ['Seated or standing, dumbbells at the sides of the shoulders, elbows under the wrists.', 'Ribs down, trunk braced.'],
    move: ['Press up until the arms are straight overhead.', 'Lower under control to the shoulders.'],
    cues: ['No leaning back; the trunk stays tall.', 'Finish with the biceps by the ears.'],
    mistake: 'Arching the lower back to finish the press.',
    link: L(45, 'seated-overhead-press'),
    art: {start:{...STAND, x:80, arms:[{upper:60, fore:170}], props:['db']}, finish:{...STAND, x:160, arms:[{upper:178, fore:178}], props:['db']}, scene:['floor', {arrow:[120,90,120,40]}]},
    art2: {view:'front', start:{x:70, y:120, stance:14, arms:{angle:95, fore:175}, props:['db']}, finish:{x:170, y:120, stance:14, arms:{angle:170, fore:178}, props:['db']}, scene:['floor']},
  },
  'Shoulder press': {
    summary: 'The shoulder press machine.',
    setup: ['Seat set so the handles are level with the shoulders, back on the pad.'],
    move: ['Press to straight arms, lower under control.'],
    cues: ['Ribs down; do not arch off the pad.'],
    mistake: 'Dropping the handles below shoulder height each rep.',
    link: L(186, 'seated-shoulder-press'),
    art: {start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:60, fore:170}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:178, fore:178}]}, scene:['floor', {bench:[110,150,60]}]},
  },
  'Overhead press': {
    summary: 'Press a barbell from the collarbones to overhead, standing.',
    setup: ['Bar at the collarbones, hands just outside the shoulders, elbows slightly in front of the bar, feet hip-width.'],
    move: ['Press straight up, moving the head back out of the way, then through to lock out overhead.', 'Lower under control to the collarbones.'],
    cues: ['Ribs down, glutes squeezed; no leaning back.', 'Bar finishes over the middle of the foot.'],
    mistake: 'Arching the back and pressing the bar forward.',
    link: L(43, 'seated-shoulder-press'),
    art: {start:{...STAND, x:80, arms:[{upper:60, fore:170}], props:['bar']}, finish:{...STAND, x:160, arms:[{upper:178, fore:178}], props:['bar']}, scene:['floor', {arrow:[120,90,120,40]}]},
  },
  'Kettlebell press': {
    summary: 'Press one kettlebell from the shoulder to overhead.',
    setup: ['Kettlebell racked at the shoulder, wrist straight, elbow tucked.'],
    move: ['Press to lockout overhead, lower under control. Alternate arms.'],
    cues: ['Ribs down; do not lean away from the bell.'],
    mistake: 'Letting the wrist bend back under the bell.',
    link: L(395, 'single-arm-overhead-press'),
    art: {start:{...STAND, x:80, arms:[{upper:5, fore:5, hidden:true},{upper:60, fore:170}], props:['kb']}, finish:{...STAND, x:160, arms:[{upper:5, fore:5, hidden:true},{upper:178, fore:178}], props:['kb']}, scene:['floor', {arrow:[120,90,120,40]}]},
  },
  'Pike push-ups': {
    summary: 'A push-up with the hips high, which turns it into a shoulder press.',
    setup: ['From a push-up position, walk the feet in so the hips are high and the body makes an upside-down V.'],
    move: ['Lower the top of the head toward the floor between the hands.', 'Press back up.'],
    cues: ['Elbows about 45 degrees from the body.', 'Keep the hips high the whole time.'],
    mistake: 'Letting the hips drop so it becomes a normal push-up.',
    link: L(41, 'push-up', 'ACE has no pike page; it is a push-up with the hips high.'),
    art: {start:{x:140, y:110, torso:150, legs:[{thigh:-130, shin:-130}], arms:[{upper:-40, fore:-40}]}, finish:{x:140, y:118, torso:150, legs:[{thigh:-130, shin:-130}], arms:[{upper:-70, fore:10}]}, scene:['floor']},
  },
  'Glute bridge': {
    summary: 'Lie on your back and lift the hips. The simplest glute exercise.',
    setup: ['Lie on your back, knees bent, feet flat near the glutes, arms by the sides.'],
    move: ['Drive the hips up through the heels until the body is a straight line from shoulders to knees.', 'Squeeze at the top, lower slowly.'],
    cues: ['Ribs down; lift with the glutes, not the lower back.'],
    mistake: 'Arching the back to get higher.',
    link: L(66, 'glute-bridge'),
    art: {start:{x:120, y:196, torso:90, legs:[{thigh:-100, shin:-180}], arms:[{upper:90, fore:90}]}, finish:{x:120, y:164, torso:70, legs:[{thigh:-110, shin:-180}], arms:[{upper:80, fore:80}]}, scene:['floor', {arrow:[60,196,60,160]}]},
  },
  'Farmer carry': {
    summary: 'Walk with a heavy weight in each hand. Grip, trunk and posture under load.',
    setup: ['Pick up the weights with a flat back, stand tall, shoulders back.'],
    move: ['Walk 30 to 40 metres at a normal pace, set them down, rest, repeat.'],
    cues: ['Tall posture, eyes forward.', 'Short, quick steps.'],
    mistake: 'Leaning forward or letting the shoulders round.',
    link: L(359, 'farmer-s-carry'),
    art: {view:'front', start:{x:120, y:120, stance:12, arms:{angle:10}, props:['db']}, finish:{x:120, y:120, stance:12, arms:{angle:10}, props:['db']}, scene:['floor', {text:[48,60,'tall, shoulders back']}]},
  },
  /* optional extras */
  'Dumbbell curls': {summary:'A biceps curl with dumbbells.', setup:['Stand tall, dumbbells at the sides, palms forward.'], move:['Curl to the shoulders without moving the elbows, lower slowly.'], cues:['Elbows stay by the ribs.'], mistake:'Swinging the body.', link: L(70, 'bicep-curl'), art:{start:{...STAND, x:80, props:['db']}, finish:{...STAND, x:160, arms:[{upper:5, fore:150}], props:['db']}, scene:['floor']}},
  'Curls': {summary:'A biceps curl on the machine.', setup:['Upper arms on the pad, handles in the hands.'], move:['Curl up, lower slowly.'], cues:['Full range, no jerking.'], mistake:'Lifting the elbows off the pad.', link: L(70, 'bicep-curl'), art:{start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:90}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:170}]}, scene:['floor', {bench:[110,150,60]}]}},
  'Cable curls': {summary:'A biceps curl on the low cable.', setup:['Face the low pulley, bar in the hands, elbows at the sides.'], move:['Curl up, lower slowly.'], cues:['Elbows stay still.'], mistake:'Leaning back.', link: L(70, 'bicep-curl'), art:{start:{...STAND, x:130}, finish:{...STAND, x:130, arms:[{upper:5, fore:150}]}, scene:['floor', {post:[40,80]}]}},
  'Barbell curls': {summary:'A biceps curl with a barbell.', setup:['Stand tall, bar in the hands, palms forward.'], move:['Curl to the shoulders, lower slowly.'], cues:['Elbows by the ribs; no swinging.'], mistake:'Swinging the body to start the lift.', link: L(70, 'bicep-curl'), art:{start:{...STAND, x:80, props:['bar']}, finish:{...STAND, x:160, arms:[{upper:5, fore:150}], props:['bar']}, scene:['floor']}},
  'Dips': {summary:'Lower and press on the dip bars.', setup:['Support on straight arms, lean forward slightly; bend the knees and use a band or a foot for help if needed.'], move:['Lower until the upper arms are about level, press back up.'], cues:['Shoulders down; stop the descent if the front of the shoulder pinches.'], mistake:'Going too deep.', link:null, art:{start:{x:120, y:110, torso:0, legs:[{thigh:-10, shin:-90, foot:'back'}], arms:[{upper:-10, fore:-10}]}, finish:{x:120, y:134, torso:10, legs:[{thigh:-10, shin:-90, foot:'back'}], arms:[{upper:-70, fore:30}]}, scene:[{bar:[70,134,110]}, {post:[80,134]}, {post:[170,134]}]}},
  'Triceps pushdowns': {summary:'Push a cable attachment down with the elbows fixed.', setup:['High cable, elbows by the ribs, forearms up.'], move:['Push down to straight arms, return slowly.'], cues:['Elbows do not move.'], mistake:'Leaning on the bar.', link: L(185, 'triceps-pushdowns'), art:{start:{...STAND, x:130, arms:[{upper:5, fore:150}]}, finish:{...STAND, x:130, arms:[{upper:5, fore:30}]}, scene:['floor', {post:[40,20]}]}},
  'Triceps extensions': {summary:'The triceps extension machine: straighten the arms against the pad.', setup:['Upper arms on the pad.'], move:['Extend to straight arms, return slowly.'], cues:['Elbows stay on the pad.'], mistake:'Rushing the return.', link: L(185, 'triceps-pushdowns'), art:{start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:170}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:90, fore:90}]}, scene:['floor', {bench:[110,150,60]}]}},
  'Overhead triceps extension': {summary:'One dumbbell held overhead with both hands, lowered behind the head.', setup:['Dumbbell overhead, elbows pointing forward, close to the head.'], move:['Lower behind the head, press back up.'], cues:['Elbows stay in.'], mistake:'Flaring the elbows.', link: L(36, 'lying-barbell-triceps-extensions', 'ACE shows the lying version; same movement.'), art:{start:{...STAND, x:80, arms:[{upper:178, fore:178}], props:['dbVert']}, finish:{...STAND, x:160, arms:[{upper:178, fore:-100}], props:['dbVert']}, scene:['floor']}},
  'Bench dips': {summary:'Dips with the hands on a bench edge and feet on the floor.', setup:['Hands on the bench edge behind you, legs out in front.'], move:['Lower until the upper arms are about level, press back up.'], cues:['Keep the hips close to the bench.'], mistake:'Going too deep for the shoulders.', link:null, art:{start:{x:100, y:150, torso:0, legs:[{thigh:60, shin:0}], arms:[{upper:-40, fore:-40}]}, finish:{x:100, y:170, torso:5, legs:[{thigh:70, shin:0}], arms:[{upper:-80, fore:-10}]}, scene:['floor', {bench:[120,150,70]}]}},
  'Lateral raises': {summary:'Raise light dumbbells out to the sides to shoulder height.', setup:['Dumbbells at the sides, slight elbow bend.'], move:['Raise to shoulder height, lower slowly.'], cues:['Lead with the elbows; no shrugging.'], mistake:'Swinging the weights up.', link: L(26, 'lateral-raise'), art:{view:'front', start:{x:70, y:120, stance:14, arms:{angle:10}, props:['db']}, finish:{x:170, y:120, stance:14, arms:{angle:95}, props:['db']}, scene:['floor']}},
  'Lateral raise': {summary:'Raise light dumbbells out to the sides to shoulder height.', setup:['Dumbbells at the sides, slight elbow bend.'], move:['Raise to shoulder height, lower slowly.'], cues:['Lead with the elbows; no shrugging.'], mistake:'Swinging the weights up.', link: L(26, 'lateral-raise'), art:{view:'front', start:{x:70, y:120, stance:14, arms:{angle:10}, props:['db']}, finish:{x:170, y:120, stance:14, arms:{angle:95}, props:['db']}, scene:['floor']}},
  'Cable lateral raises': {summary:'A lateral raise on the low cable.', setup:['Stand side-on to the low pulley, handle in the far hand.'], move:['Raise to shoulder height, lower slowly.'], cues:['No shrugging.'], mistake:'Swinging.', link: L(26, 'lateral-raise'), art:{view:'front', start:{x:120, y:120, stance:14, arms:[{angle:10, hidden:true},{angle:10}]}, finish:{x:120, y:120, stance:14, arms:[{angle:10, hidden:true},{angle:95}]}, scene:['floor']}},
  'Leg extension': {summary:'The leg extension machine.', setup:['Pad on the shins, back on the seat.'], move:['Extend to straight legs, lower slowly.'], cues:['Slow lowering; easy on the knees.'], mistake:'Kicking the weight up.', link: L(183, 'seated-leg-extension'), art:{start:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:-5}], arms:[{upper:20, fore:60}]}, finish:{x:130, y:140, torso:-5, legs:[{thigh:90, shin:85}], arms:[{upper:20, fore:60}]}, scene:['floor', {bench:[110,150,60]}]}},
};
// Names that appear in sessions under a different label.
const EXERCISE_ALIASES = {
  'Lateral raises': 'Lateral raise',
};
function exerciseInfo(name){
  if(!name) return null;
  const key = EXERCISE_LIBRARY[name] ? name : EXERCISE_ALIASES[name];
  return key ? {name:key, ...EXERCISE_LIBRARY[key]} : null;
}

return { EXERCISE_LIBRARY, EXERCISE_ALIASES, exerciseInfo, exerciseSvg, sideFigure, frontFigure };
}));
