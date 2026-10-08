// Generates the app icon, favicons and iOS launch images from the brand mark, with no
// image library: the mark is rasterised by signed distance (round-capped strokes) with
// supersampling, and the PNGs are written through node's own zlib.
//   node tools/make-icons.js
// Outputs: icons/icon-192.png, icon-512.png, apple-touch-icon.png, favicon-32.png,
// favicon-16.png, icons/splash/<w>x<h>.png (dark) and <w>x<h>-light.png.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');

// Brand colours (index.html :root): lime accent, ink on it, page backgrounds.
const LIME = [0xC3,0xF5,0x3A], INK = [0x12,0x20,0x06], BG_DARK = [0x0E,0x13,0x10], BG_LIGHT = [0xF2,0xF4,0xEE];

// The mark in its 24-unit box (icons/peak-mark.svg): a ridge line, a flagpole and a flag.
const RIDGE = [[3,19],[9,10],[11,13],[15,6],[21,19]];
const POLE = [[15,6],[15,2]];
const FLAG = [[15,2],[18.5,3.2],[15,4.4]];
const STROKE = 2; // viewBox units

function segDist(px,py, ax,ay, bx,by){ const vx=bx-ax, vy=by-ay, wx=px-ax, wy=py-ay; const L=vx*vx+vy*vy; let t = L>0 ? (wx*vx+wy*vy)/L : 0; t = Math.max(0, Math.min(1, t)); const dx=px-(ax+t*vx), dy=py-(ay+t*vy); return Math.sqrt(dx*dx+dy*dy); }
function polyDist(px,py, pts){ let d=Infinity; for(let i=1;i<pts.length;i++) d=Math.min(d, segDist(px,py, pts[i-1][0],pts[i-1][1], pts[i][0],pts[i][1])); return d; }
function inTri(px,py, a,b,c){ const s=(a[0]-c[0])*(py-c[1])-(a[1]-c[1])*(px-c[0]); const t=(b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]); if((s<0)!==(t<0) && s!==0 && t!==0) return false; const d=(c[0]-b[0])*(py-b[1])-(c[1]-b[1])*(px-b[0]); return d===0 || (d<0)===(s+t<=0); }
// 1 inside the mark, 0 outside, in viewBox coordinates.
function markCoverage(x,y){
  const half = STROKE/2;
  if(polyDist(x,y,RIDGE)<=half || polyDist(x,y,POLE)<=half) return 1;
  if(inTri(x,y, FLAG[0],FLAG[1],FLAG[2]) || polyDist(x,y,FLAG.concat([FLAG[0]]))<=half) return 1;
  return 0;
}
function roundRectDist(px,py, cx,cy, half, r){ const qx=Math.abs(px-cx)-half+r, qy=Math.abs(py-cy)-half+r; return Math.sqrt(Math.max(qx,0)**2+Math.max(qy,0)**2) + Math.min(Math.max(qx,qy),0) - r; }

// paint(x,y) returns [r,g,b] for a sample point; SS×SS supersampling per pixel.
function raster(w,h, paint, SS){
  const buf = Buffer.alloc(w*h*3); const inv = 1/(SS*SS);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let r=0,g=0,b=0;
    for(let sy=0;sy<SS;sy++) for(let sx=0;sx<SS;sx++){ const c = paint(x+(sx+0.5)/SS, y+(sy+0.5)/SS); r+=c[0]; g+=c[1]; b+=c[2]; }
    const o=(y*w+x)*3; buf[o]=Math.round(r*inv); buf[o+1]=Math.round(g*inv); buf[o+2]=Math.round(b*inv);
  }
  return buf;
}
// ---- PNG writer (RGB, 8-bit, filter 0)
const CRC = (()=>{ const t=new Int32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c; } return t; })();
function crc32(buf){ let c=-1; for(let i=0;i<buf.length;i++) c = CRC[(c^buf[i])&0xFF] ^ (c>>>8); return (c^-1)>>>0; }
function chunk(type, data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const td=Buffer.concat([Buffer.from(type,'ascii'), data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w,h, rgb){
  const raw = Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){ raw[y*(w*3+1)] = 0; rgb.copy(raw, y*(w*3+1)+1, y*w*3, (y+1)*w*3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), chunk('IHDR',ihdr), chunk('IDAT', zlib.deflateSync(raw,{level:9})), chunk('IEND',Buffer.alloc(0))]);
}
const mix = (a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

// The icon: full-bleed lime, the mark filling 58% of the side (inside the maskable safe zone).
function iconPaint(size){
  const box = size*0.58, ox = (size-box)/2, oy = (size-box)/2 + size*0.01; const s = box/24;
  return (x,y)=> markCoverage((x-ox)/s, (y-oy)/s) ? INK : LIME;
}
// The launch image: page background with a rounded lime tile holding the mark, centred.
function splashPaint(w,h, bg){
  const tile = Math.round(Math.min(w,h)*0.27), half = tile/2, r = tile*0.22, cx = w/2, cy = h/2;
  const box = tile*0.58, ox = cx-box/2, oy = cy-box/2 + tile*0.01, s = box/24;
  return (x,y)=>{ const d = roundRectDist(x,y,cx,cy,half,r); if(d>0.5) return bg; const c = markCoverage((x-ox)/s,(y-oy)/s) ? INK : LIME; return d>-0.5 ? mix(c, bg, d+0.5) : c; };
}

function write(rel, w, h, paint, SS){ const out = path.join(ROOT, rel); fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out, png(w,h, raster(w,h,paint,SS))); console.log('wrote', rel, w+'x'+h); }

for(const [rel,size] of [['icons/icon-512.png',512],['icons/icon-192.png',192],['icons/apple-touch-icon.png',180],['icons/favicon-32.png',32],['icons/favicon-16.png',16]]) write(rel, size, size, iconPaint(size), size<=32 ? 6 : 4);

const SPLASH = [[1320,2868],[1206,2622],[1290,2796],[1179,2556],[1284,2778],[1170,2532],[1125,2436],[1242,2688],[828,1792],[750,1334],[1242,2208],[640,1136]];
for(const [w,h] of SPLASH){
  // Only the tile region needs supersampling; the flat background is painted directly.
  const tile = Math.round(Math.min(w,h)*0.27), cx=w/2, cy=h/2;
  for(const [suffix,bg] of [['',BG_DARK],['-light',BG_LIGHT]]){
    const paint = splashPaint(w,h,bg);
    const fast = (x,y)=> (Math.abs(x-cx)>tile/2+2 || Math.abs(y-cy)>tile/2+2) ? bg : null;
    const buf = Buffer.alloc(w*h*3);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      let c = fast(x+0.5,y+0.5);
      if(!c){ let r=0,g=0,b=0; for(let sy=0;sy<3;sy++) for(let sx=0;sx<3;sx++){ const p=paint(x+(sx+0.5)/3, y+(sy+0.5)/3); r+=p[0]; g+=p[1]; b+=p[2]; } c=[r/9,g/9,b/9]; }
      const o=(y*w+x)*3; buf[o]=Math.round(c[0]); buf[o+1]=Math.round(c[1]); buf[o+2]=Math.round(c[2]);
    }
    const rel = `icons/splash/${w}x${h}${suffix}.png`; fs.writeFileSync(path.join(ROOT, rel), png(w,h,buf)); console.log('wrote', rel);
  }
}
