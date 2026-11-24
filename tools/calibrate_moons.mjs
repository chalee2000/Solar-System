// Anchor each satellite's orbital phase to JPL Horizons positions.
//
//   node tools/calibrate_moons.mjs <cache_dir> js/moons-data.js
//
// JPL's mean elements give each orbit's size, shape and orientation well, but
// carried over decades their mean anomalies drift far from where the moons
// really are (tens of degrees for many). For every satellite, Horizons
// positions at 75 epochs (fetch_moon_vectors.sh) are projected into the
// mean orbit plane; the mean anomaly at the elements' epoch is shifted and a
// small mean-motion correction `dn` (deg/day) is fitted so the moon sits where
// Horizons puts it. Positions are closest over 2016–2035 and drift
// slowly outside that span.
import fs from 'node:fs';
import path from 'node:path';
import * as A from '../js/astro.js';

const [cache, target] = process.argv.slice(2);
const mod = await import(path.resolve(target) + `?t=${Date.now()}`);
const moons = mod.MOONS.map((m) => JSON.parse(JSON.stringify(m)));

const e = A.OBLIQUITY, ce = Math.cos(e), se = Math.sin(e);
const toScene = (v) => A.eclipticToScene([v[0], v[1] * ce + v[2] * se, -v[1] * se + v[2] * ce]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const wrap = (x) => ((x % 360) + 540) % 360 - 180;

/** Mean anomaly (deg) the model needs at day d to put the moon where `r` is. */
function requiredM(el, parent, d, r) {
  const k = A.satelliteElements(el, d);
  A.satellitePosition(el, parent, d); // fills the cached reference basis
  const { X, Y, Z } = el._basis;
  const loc = [dot(r, X), dot(r, Y), dot(r, Z)];
  // Argument of latitude in the mean orbit plane, measured along the motion.
  const cn = Math.cos(k.node), sn = Math.sin(k.node), ci = Math.cos(k.i), si = Math.sin(k.i);
  const P = [cn, sn, 0], Q = [-sn * ci, cn * ci, si];
  const u = Math.atan2(dot(loc, Q), dot(loc, P));
  const nu = u - k.w;
  const E = 2 * Math.atan2(Math.sqrt(1 - k.e) * Math.sin(nu / 2), Math.sqrt(1 + k.e) * Math.cos(nu / 2));
  const M = (E - k.e * Math.sin(E)) / A.DEG;
  return { need: M, have: k.M / A.DEG };
}

let worst = [];
const refits = [];
for (const m of moons) {
  if (!m.el || !m.c) continue;
  const file = path.join(cache, 'vec', `${m.c}.csv`);
  if (!fs.existsSync(file)) { console.warn(`no Horizons vectors for ${m.n} (${m.c}); left uncalibrated`); continue; }
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => l.split(',').map(Number));
  const el = m.el;
  el.dn = 0;
  // Epochs (fetch_moon_vectors.sh): an anchor in 2026, three points within a
  // month of it, then every 100 days over 2016–2035. Walking outward from the
  // anchor, each epoch's offset is unwrapped against the line through the
  // points already taken, so no orbit is miscounted; a least-squares line
  // through all of them then gives the phase and rate.
  const pts = rows.map(([jd, x, y, z]) => ({ d: jd - 2451545, r: toScene([x, y, z]) }));
  const anchor = pts.find((p) => Math.abs(p.d - 9497) < 1)?.d ?? pts.find((p) => Math.abs(p.d - 5844) < 1)?.d ?? pts[0].d;
  pts.sort((a, b) => Math.abs(a.d - anchor) - Math.abs(b.d - anchor));
  const off = (p) => { const q = requiredM(el, m.p, p.d, p.r); return wrap(q.need - q.have); };
  const t0 = pts[0].d;
  const ys = [off(pts[0])];
  let rate = 0;
  const fit = (n) => { // least squares y = c + k (t - t0) over the first n points
    let st = 0, sy = 0, stt = 0, sty = 0;
    for (let j = 0; j < n; j++) { const t = pts[j].d - t0; st += t; sy += ys[j]; stt += t * t; sty += t * ys[j]; }
    const k = n > 1 ? (n * sty - st * sy) / (n * stt - st * st) : 0;
    return { c: (sy - k * st) / n, k };
  };
  for (let j = 1; j < pts.length; j++) {
    const line = fit(j);
    const predicted = line.c + line.k * (pts[j].d - t0);
    ys.push(predicted + wrap(off(pts[j]) - predicted));
    rate = fit(j + 1).k;
  }
  let { c: d0, k } = fit(pts.length);
  // A handful of very eccentric or very slow outer moons do not follow a
  // straight line here; a rate change of more than 5% would only push them
  // off course outside the fitted years, so keep the phase and drop the rate.
  if (Math.abs(k) > 0.05 * (360 / el.P)) { k = 0; d0 = ys[0]; refits.push(m.n); }
  rate = k;
  const p0 = { d: t0 };
  // Apply: M(t) = M_model(t) + d0 + rate (t - t0)
  el.M = +(((el.M + d0 + rate * (el.ep - p0.d)) % 360 + 360) % 360).toFixed(4);
  el.dn = +rate.toPrecision(6);
  // Residuals at every epoch, as angles between positions.
  const res = pts.map((p) => {
    const g = A.satellitePosition(el, m.p, p.d);
    return Math.acos(Math.min(1, dot(g, p.r) / Math.hypot(...g) / Math.hypot(...p.r))) / A.DEG;
  });
  worst.push([Math.max(...res), m.n, m.p]);
}
worst.sort((a, b) => b[0] - a[0]);
if (refits.length) console.log(`phase only (rate fit rejected) for ${refits.length}: ${refits.join(', ')}`);
console.log('largest residuals (deg):', worst.slice(0, 8).map((w) => `${w[1]} (${w[2]}) ${w[0].toFixed(2)}`).join(', '));

// Rewrite the module, keeping its header.
const text = fs.readFileSync(target, 'utf8');
const head = text.slice(0, text.indexOf('export const MOONS = ['));
const note = '// Orbital phases fitted to JPL Horizons positions (2016-2035) by tools/calibrate_moons.mjs.\n';
const body = moons.map((m) => '  ' + JSON.stringify(m) + ',').join('\n');
fs.writeFileSync(target, head.replace('export const MOON_DATA_DATE', note + 'export const MOON_DATA_DATE') + 'export const MOONS = [\n' + body + '\n];\n');
console.log(`calibrated ${worst.length} satellites -> ${target}`);
