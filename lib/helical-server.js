// Server-side HELICAL gear geometry + STL writer.
// Reuses the same transverse involute tooth profile as the spur engine, then
// extrudes with a progressive twist (helix). Lives ONLY on the server.
import * as THREE from "./three.module.js";

const invFn = a => Math.tan(a) - a;

const DIN6885 = [[8,2,1.0],[10,3,1.4],[12,4,1.8],[17,5,2.3],[22,6,2.8],[30,8,3.3],[38,10,3.3],[44,12,3.3],[50,14,3.8],[58,16,4.3],[65,18,4.4],[75,20,4.9],[85,22,5.4]];
function keyForShaft(d){for(const r of DIN6885){if(d<=r[0])return{b:r[1],t2:r[2]};}return{b:22,t2:5.4};}
function borePoints(type, p) {
  const N = 64, pts = [], r = (p.bore + 2*(p.fit||0))/2;
  if (type === 'round') { for(let i=0;i<N;i++){const t=i/N*2*Math.PI;pts.push([r*Math.cos(t),r*Math.sin(t)]);} }
  else if (type === 'd') { const f=Math.min(p.dflat||r*0.7,r-0.2),a0=Math.acos(Math.max(-1,Math.min(1,f/r)));const s=Math.round(N*0.85);for(let i=0;i<=s;i++){const t=a0+(2*Math.PI-2*a0)*(i/s);pts.push([r*Math.cos(t),r*Math.sin(t)]);} }
  else if (type === 'hex') { const R=((p.hexAF||r*1.7)+2*(p.fit||0))/Math.sqrt(3);for(let i=0;i<6;i++){const t=i/6*2*Math.PI+Math.PI/6;pts.push([R*Math.cos(t),R*Math.sin(t)]);} }
  else if (type === 'key') { const k=keyForShaft(p.bore);const kb=(p.keyW>0?p.keyW:k.b),kt=(p.keyT>0?p.keyT:k.t2);const hw=kb/2,yc=Math.sqrt(Math.max(0,r*r-hw*hw)),aR=Math.atan2(yc,hw),aL=Math.PI-aR,s=Math.round(N*0.9);for(let i=0;i<=s;i++){const t=aL+((aR+2*Math.PI)-aL)*(i/s);pts.push([r*Math.cos(t),r*Math.sin(t)]);}pts.push([hw,r+kt]);pts.push([-hw,r+kt]);}
  return pts;
}
function addBore(shape, p) {
  if (p.boreType === 'none') return;
  if (p.boreType === 'round') { const br=(p.bore+2*(p.fit||0))/2;const h=new THREE.Path();h.absarc(0,0,br,0,2*Math.PI,true);shape.holes.push(h);return; }
  const bp = borePoints(p.boreType, p);
  if (bp.length > 2) { const h=new THREE.Path();h.moveTo(bp[0][0],bp[0][1]);for(let i=1;i<bp.length;i++)h.lineTo(bp[i][0],bp[i][1]);h.closePath();shape.holes.push(h); }
}

// Build the 2D transverse tooth profile (same approach as spur, but using
// transverse module mt and transverse pressure angle alpha_t).
function helicalShape(p, teeth, x) {
  const beta = p.beta * Math.PI / 180;
  const mn = p.module;                       // normal module (user input)
  const mt = mn / Math.cos(beta);            // transverse module
  const aN = p.pa * Math.PI / 180;           // normal pressure angle
  const aT = Math.atan(Math.tan(aN) / Math.cos(beta)); // transverse PA
  const z = teeth, seg = p.res;
  const m = mt, a = aT;                       // profile is built in transverse plane
  const r = m*z/2, rb = r*Math.cos(a);
  const ra = r + mn*(1+x);                     // addendum uses normal module
  const rf = r - mn*(1.25 - x);                // dedendum uses normal module
  const invA = invFn(a), halfTooth = Math.PI/(2*z) + 2*x*Math.tan(a)/z;
  const uAt = rad => Math.sqrt(Math.max(0,(rad/rb)*(rad/rb)-1));
  const uTip = uAt(ra), rFil = Math.max(0, Math.min(p.fillet*mn, 0.45*mn));
  const rStart = Math.max(rf+rFil*0.8, rb, rf+1e-3), uStart = uAt(Math.max(rStart,rb)), step = 2*Math.PI/z;
  const inv = [];
  for (let i=0;i<=seg;i++){const u=uStart+(uTip-uStart)*(i/seg);const rad=rb*Math.sqrt(1+u*u);const phi=u-Math.atan(u);inv.push({rad,ang:halfTooth+invA-phi});}
  const angB = inv[0].ang, gapHalf = Math.max(0, step/2-angB);
  const dGap = Math.min(rFil/Math.max(rf,1), 0.8*gapHalf);
  let fil;
  if (rFil<=1e-3) fil=[{rad:rf,ang:angB}];
  else { fil=[]; const N=4, angR=angB+dGap; for(let i=0;i<=N;i++){const t=i/N;fil.push({rad:rf*(1-t*t)+rStart*t*t,ang:(1-t)*(1-t)*angR+(1-(1-t)*(1-t))*angB});} }
  const shape = new THREE.Shape(); let first=true;
  const push=(rad,ang)=>{const X=rad*Math.cos(ang),Y=rad*Math.sin(ang);if(first){shape.moveTo(X,Y);first=false;}else shape.lineTo(X,Y);};
  for (let t=0;t<z;t++){const base=t*step;
    for(const f of fil)push(f.rad,base-f.ang);
    for(let i=0;i<inv.length;i++)push(inv[i].rad,base-inv[i].ang);
    const tipAng=inv[inv.length-1].ang,arcSeg=Math.max(2,Math.round(seg/3));
    for(let i=1;i<arcSeg;i++)push(ra,base-tipAng+2*tipAng*(i/arcSeg));
    for(let i=inv.length-1;i>=0;i--)push(inv[i].rad,base+inv[i].ang);
    for(let i=fil.length-1;i>=0;i--)push(fil[i].rad,base+fil[i].ang);
    const rootA=base+fil[0].ang,rootB=(t+1)*step-fil[0].ang,rSeg=Math.max(2,Math.round(seg/3));
    for(let i=1;i<rSeg;i++)push(rf,rootA+(rootB-rootA)*(i/rSeg));
  }
  shape.closePath();
  addBore(shape, p);
  return { shape, mt };
}

export function makeHelicalSTL(p, teeth, x) {
  const { shape } = helicalShape(p, teeth, x);
  const b = p.fw;
  const beta = p.beta * Math.PI / 180;
  const r = (p.module/Math.cos(beta))*teeth/2;       // transverse pitch radius
  // total twist over the face width: phi = b * tan(beta) / r
  const totalTwist = (b * Math.tan(beta)) / r;
  // number of extrude steps: more twist -> more steps for a smooth helix
  const steps = Math.max(8, Math.min(60, Math.round(Math.abs(totalTwist)/ (Math.PI/90)) + 8));
  const g = new THREE.ExtrudeGeometry(shape,{depth:b,bevelEnabled:false,steps});
  // The bore must stay STRAIGHT (a twisted hole won't accept a straight shaft).
  // Twist scales radially: 0 inside the bore region, full twist out at the teeth.
  // Use the TRUE outer extent of the actual bore profile (keyway/hex stick out further).
  let boreR = 0;
  if (p.boreType !== 'none') {
    const bp = (p.boreType==='round') ? null : borePoints(p.boreType, p);
    if (bp && bp.length) { for (const q of bp){ const rr=Math.hypot(q[0],q[1]); if(rr>boreR) boreR=rr; } }
    else boreR = p.bore/2 + (p.fit||0);
  }
  const mn = p.module;
  const rRoot = r - 1.25*mn;                         // tooth root radius (twist must be full by here-ish)
  const rIn  = Math.min(boreR*1.12 + 0.5, rRoot - 0.5); // straight zone, never past the root
  const rOut = Math.max(rIn + 1.2, rRoot);           // fully twisted by the root circle
  const pos = g.attributes.position;
  for (let i=0;i<pos.count;i++){
    const x0=pos.getX(i), y0=pos.getY(i), z0=pos.getZ(i);
    const rad = Math.hypot(x0,y0);
    let k = (rad - rIn) / (rOut - rIn);     // 0 at bore, 1 at teeth
    k = k<0?0 : k>1?1 : k*k*(3-2*k);        // smoothstep blend
    const frac = z0 / b;
    const ang = totalTwist * frac * k;
    const c=Math.cos(ang), s=Math.sin(ang);
    pos.setXY(i, x0*c - y0*s, x0*s + y0*c);
  }
  pos.needsUpdate = true;
  g.translate(0,0,-b/2); g.rotateX(-Math.PI/2);
  g.computeVertexNormals();
  // write binary STL
  const idx=g.index, n=idx?idx.count:pos.count;
  const tris=[], vA=new THREE.Vector3(),vB=new THREE.Vector3(),vC=new THREE.Vector3(),cb=new THREE.Vector3(),ab=new THREE.Vector3();
  for(let i=0;i<n;i+=3){const a=idx?idx.getX(i):i,b2=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
    vA.fromBufferAttribute(pos,a);vB.fromBufferAttribute(pos,b2);vC.fromBufferAttribute(pos,c);
    cb.subVectors(vC,vB);ab.subVectors(vA,vB);cb.cross(ab).normalize();
    tris.push([cb.x,cb.y,cb.z,vA.x,vA.y,vA.z,vB.x,vB.y,vB.z,vC.x,vC.y,vC.z]);}
  const buf=new ArrayBuffer(84+tris.length*50),dv=new DataView(buf);
  dv.setUint32(80,tris.length,true);let o=84;
  for(const t of tris){for(let k=0;k<12;k++){dv.setFloat32(o,t[k],true);o+=4;}dv.setUint16(o,0,true);o+=2;}
  return new Uint8Array(buf);
}

export function clampHelical(raw) {
  const n=(v,lo,hi,def)=>{const x=Number(v);return isFinite(x)?Math.max(lo,Math.min(hi,x)):def;};
  return {
    module:n(raw.module,0.3,12,2), pa:n(raw.pa,10,30,20), res:Math.round(n(raw.res,6,40,16)),
    beta:n(raw.beta,1,45,20),                       // helix angle (deg)
    fillet:n(raw.fillet,0,0.45,0.38), fw:n(raw.fw,1,120,12),
    bore:n(raw.bore,0,110,6), fit:n(raw.fit,0,2,0.2),
    boreType:['round','d','key','hex','none'].includes(raw.boreType)?raw.boreType:'round',
    dflat:n(raw.dflat,0.3,60,2), hexAF:n(raw.hexAF,1,90,5), keyW:n(raw.keyW,0,30,0), keyT:n(raw.keyT,0,20,0),
    teeth:Math.round(n(raw.teeth,5,300,24)), teeth2:Math.round(n(raw.teeth2,5,400,48)),
    x1:n(raw.x1,-0.5,0.8,0), x2:n(raw.x2,-0.5,0.8,0),
    mode: raw.mode==='pair'?'pair':'single',
  };
}
