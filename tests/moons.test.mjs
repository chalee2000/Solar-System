// Moon catalogue and positions. Reference positions are planet-centred ICRF
// vectors (km) from JPL Horizons for 2026-11-24 00:00 TDB, a date the phase
// calibration (tools/calibrate_moons.mjs) never used.
// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/astro.js';
import { MOONS, MOON_COUNTS } from '../js/moons-data.js';
import { DEFS, SYSTEM_MOONS, MINOR_MOONS, moonFacts, orbitClass } from '../js/catalog.js';
import { satelliteSceneDistance, sceneRadius } from '../js/scale.js';

const D = 2461368.5 - 2451545.0;
const REGULAR = [
  ['phobos', 7616.5, 4981.3, -1563.4],
  ['deimos', 8194.3, 20935.8, 6676.6],
  ['io', 11194.2, -380063.6, -181211.1],
  ['europa', 415519.4, -486284.9, -219183.3],
  ['ganymede', -618432.3, -784824.8, -386540.0],
  ['callisto', 990853.1, -1448453.8, -667894.7],
  ['amalthea', 174474.6, -43967.0, -18372.0],
  ['titan', -1200583.8, 362551.3, 82063.7],
  ['iapetus', -3341345.4, 1162857.4, 880393.2],
  ['ariel', -76748.0, -30642.5, 172230.2],
  ['titania', -252040.5, -41660.0, 354942.6],
  ['oberon', 406014.3, 23907.3, -417948.1],
  ['miranda', -20115.0, 39620.6, -122176.5],
  ['puck', 21062.7, -26692.1, 79774.5],
  ['triton', 100200.4, -82363.0, -330244.7],
  ['proteus', -26270.6, -89904.6, -71282.4],
  ['charon', -6237.5, -8304.9, -16619.8],
  ['hydra', -9276.8, -17903.1, -63483.2],
];
const IRREGULAR = [
  ['himalia', -11054767.6, -3821715.0, 398252.6],
  ['pasiphae', -9646525.4, 9861706.5, -1889109.0],
  ['themisto', -6471557.6, -6002882.8, 1793649.8],
  ['s2003-j2', 9197873.1, -19303153.4, -316950.1],
  ['phoebe', -775446.3, -9893594.3, -4144681.1],
  ['s2023-s1', 6299392.6, 3292474.8, -4589408.3],
  ['s2006-s9', -261722.9, -15521935.0, -5707680.7],
  ['sycorax', 2806900.4, 15120120.2, 6618910.1],
  ['nereid', -2669114.0, 4033777.2, 1907011.9],
  ['neso', -49507900.1, 65116487.2, -22981021.0],
];

const byId = Object.fromEntries(MOONS.map((m) => [m.id, m]));
const toScene = (v) => {
  const e = A.OBLIQUITY, ce = Math.cos(e), se = Math.sin(e);
  return A.eclipticToScene([v[0], v[1] * ce + v[2] * se, -v[1] * se + v[2] * ce]);
};
const angle = (a, b) => Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b))) / A.DEG;
const errorFor = ([id, x, y, z]) => {
  const m = byId[id];
  return angle(A.satellitePosition(m.el, m.p, D), toScene([x, y, z]));
};

test('every discovered moon of Mars–Pluto is in the catalogue', () => {
  // Counts in the JPL discovery table this build was made from.
  assert.deepEqual(MOON_COUNTS, { mars: 2, jupiter: 115, saturn: 293, uranus: 29, neptune: 16, pluto: 5 });
  for (const [planet, n] of Object.entries(MOON_COUNTS)) assert.equal(SYSTEM_MOONS[planet].length, n, planet);
  assert.equal(SYSTEM_MOONS.earth.length, 1);
  const ids = new Set(MOONS.map((m) => m.id));
  assert.equal(ids.size, MOONS.length, 'ids are unique');
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/, 'ids work as #links');
});

test('each moon has its discovery year and discoverers', () => {
  for (const m of MOONS) {
    assert.ok(m.y >= 1610 && m.y <= new Date().getFullYear(), `${m.n} year ${m.y}`);
    assert.ok(m.by && m.by.length > 1, `${m.n} discoverers`);
  }
  assert.equal(byId.io.by, 'Galileo');
  assert.equal(byId.io.y, 1610);
  assert.equal(byId.titan.y, 1655);
  assert.equal(byId.triton.y, 1846);
  assert.equal(byId.charon.y, 1978);
  // Discovery order within a system starts with the oldest.
  assert.deepEqual(SYSTEM_MOONS.jupiter.slice(0, 4).map((d) => d.id), ['io', 'europa', 'ganymede', 'callisto']);
  assert.equal(SYSTEM_MOONS.saturn[0].id, 'titan');
});

test('all but one moon have orbits; elements are physical', () => {
  const missing = MOONS.filter((m) => !m.el).map((m) => m.id);
  assert.deepEqual(missing, ['s2009-s1']); // Saturn's B-ring moonlet: no published mean elements
  for (const m of MOONS.filter((x) => x.el)) {
    const el = m.el;
    assert.ok(el.a > 5000 && el.a < 6e7, `${m.n} a=${el.a}`);
    assert.ok(el.e >= 0 && el.e < 1, `${m.n} e=${el.e}`);
    assert.ok(el.i >= 0 && el.i <= 180, `${m.n} i=${el.i}`);
    assert.ok(el.P > 0.2 && el.P < 20000, `${m.n} P=${el.P}`);
    const r = Math.hypot(...A.satellitePosition(el, m.p, D));
    assert.ok(r > el.a * (1 - el.e) * 0.999 && r < el.a * (1 + el.e) * 1.001, `${m.n} r within its orbit`);
  }
});

test('regular moons sit where JPL Horizons puts them (within 3°)', () => {
  for (const ref of REGULAR) assert.ok(errorFor(ref) < 3, `${ref[0]}: ${errorFor(ref).toFixed(2)}°`);
});

test('distant irregular moons are close on average', () => {
  // Strongly perturbed by the Sun, so mean elements only follow them roughly.
  const errs = IRREGULAR.map(errorFor).sort((a, b) => a - b);
  const median = errs[Math.floor(errs.length / 2)];
  assert.ok(median < 15, `median ${median.toFixed(1)}° (${errs.map((e) => e.toFixed(0)).join(', ')})`);
});

test('orbit directions: Triton and the outer swarms run backwards', () => {
  assert.ok(orbitClass(byId.triton).retrograde);
  assert.ok(!orbitClass(byId.triton).irregular);
  assert.ok(orbitClass(byId.phoebe).irregular && orbitClass(byId.phoebe).retrograde);
  assert.ok(!orbitClass(byId.ariel).retrograde, 'Uranian moons follow Uranus\'s spin');
  const retro = MOONS.filter((m) => m.el && orbitClass(m).retrograde).length;
  assert.ok(retro > 250, `${retro} retrograde`);
});

test('moon systems scale sensibly', () => {
  // Ring moons keep their place relative to the (inflated) planet and rings.
  const saturnKm = DEFS.saturn.radiusKm;
  const pan = satelliteSceneDistance(byId.pan.el.a, saturnKm, 0) / sceneRadius(saturnKm, 0);
  assert.ok(Math.abs(pan - byId.pan.el.a / saturnKm) < 1e-9);
  // Order is preserved, and the outermost irregulars stay within ~13 planet radii.
  const jup = DEFS.jupiter.radiusKm;
  const d = (id) => satelliteSceneDistance(byId[id].el.a, jup, 0);
  assert.ok(d('metis') < d('io') && d('io') < d('europa') && d('europa') < d('ganymede') && d('ganymede') < d('callisto') && d('callisto') < d('himalia'));
  for (const m of MOONS.filter((x) => x.el)) {
    const R = DEFS[m.p].radiusKm;
    assert.ok(satelliteSceneDistance(m.el.a * (1 + m.el.e), R, 0) / sceneRadius(R, 0) < 16, m.n);
  }
  // True scale is true scale.
  assert.ok(Math.abs(satelliteSceneDistance(421800, jup, 1) - (50 * 421800) / A.AU_KM) < 1e-12);
});

test('fact rows are generated for every small moon', () => {
  for (const def of MINOR_MOONS) {
    const rows = moonFacts(def);
    assert.ok(rows.length >= 4, def.id);
    for (const row of rows) assert.ok(row[0] && row[1] != null && !String(row[1]).includes('NaN'), `${def.id} ${row}`);
  }
});
