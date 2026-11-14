// Sanity checks for the ephemeris against well-known astronomical events.
// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  daysSinceJ2000, helioEcliptic, moonGeocentric, eclipticLongitude, solveKepler,
  eclipticToScene, subSolarPoint, moonPhase, orbitEllipse, bodyFrame, AU_KM,
  GALACTIC_NORTH, GALACTIC_CENTRE,
} from '../js/astro.js';

const day = (iso) => daysSinceJ2000(Date.parse(iso));
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const r = (v) => Math.hypot(v[0], v[1], v[2]);

test('Kepler solver satisfies E − e·sin E = M', () => {
  for (const e of [0, 0.0167, 0.2056, 0.2488, 0.6]) {
    for (let M = -6; M <= 6; M += 0.37) {
      const E = solveKepler(M, e);
      const Mn = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      assert.ok(Math.abs(E - e * Math.sin(E) - Mn) < 1e-9, `e=${e} M=${M}`);
    }
  }
});

test('Earth at J2000 sits opposite the Sun’s apparent position', () => {
  const p = helioEcliptic('earth', 0);
  // Sun's geocentric longitude at J2000.0 was ≈ 280.4°, so Earth is near 100.4°.
  assert.ok(angDiff(eclipticLongitude(p), 100.4) < 0.3, `lon=${eclipticLongitude(p)}`);
  // Early January is perihelion: ≈ 0.9833 AU.
  assert.ok(Math.abs(r(p) - 0.9833) < 0.001, `r=${r(p)}`);
});

test('planet distances stay within perihelion / aphelion', () => {
  const range = {
    mercury: [0.307, 0.467], venus: [0.718, 0.729], earth: [0.983, 1.017], mars: [1.381, 1.666],
    jupiter: [4.95, 5.46], saturn: [9.0, 10.1], uranus: [18.2, 20.1], neptune: [29.7, 30.4], pluto: [29.6, 49.4],
  };
  for (const [id, [lo, hi]] of Object.entries(range)) {
    for (let d = -20000; d <= 20000; d += 137) {
      const dist = r(helioEcliptic(id, d));
      assert.ok(dist > lo && dist < hi, `${id} d=${d} r=${dist}`);
    }
  }
});

test('oppositions: planet and Earth share a heliocentric longitude', () => {
  const cases = [
    ['mars', '2020-10-13T23:20:00Z'],
    ['mars', '2025-01-16T02:30:00Z'],
    ['jupiter', '2023-11-03T05:00:00Z'],
    ['saturn', '2024-09-08T04:30:00Z'],
    ['uranus', '2024-11-17T02:45:00Z'],
    ['neptune', '2024-09-21T00:15:00Z'],
  ];
  for (const [id, when] of cases) {
    const d = day(when);
    const diff = angDiff(eclipticLongitude(helioEcliptic(id, d)), eclipticLongitude(helioEcliptic('earth', d)));
    assert.ok(diff < 0.25, `${id} ${when}: Δlon=${diff.toFixed(3)}°`);
  }
});

test('Venus inferior conjunction (transit of 2012-06-06)', () => {
  const d = day('2012-06-06T01:30:00Z');
  const venus = helioEcliptic('venus', d), earth = helioEcliptic('earth', d);
  assert.ok(angDiff(eclipticLongitude(venus), eclipticLongitude(earth)) < 0.25);
  // A transit also needs Venus almost exactly in the ecliptic plane.
  assert.ok(Math.abs(venus[2]) < 0.002, `z=${venus[2]}`);
});

test('Moon: distance, new moon at a solar eclipse, full moon at a lunar eclipse', () => {
  for (let d = 0; d < 400; d += 3.3) {
    const dist = r(moonGeocentric(d));
    assert.ok(dist > 355000 && dist < 407500, `moon r=${dist}`);
  }
  const sunLon = (d) => (eclipticLongitude(helioEcliptic('earth', d)) + 180) % 360;

  const solar = day('2024-04-08T18:18:00Z'); // total solar eclipse
  const m1 = moonGeocentric(solar);
  assert.ok(angDiff(eclipticLongitude(m1), sunLon(solar)) < 0.6, 'new moon longitude');
  assert.ok(Math.abs(Math.asin(m1[2] / r(m1))) * 180 / Math.PI < 0.8, 'near the node');
  assert.ok(moonPhase(solar).illuminated < 0.002);

  const lunar = day('2025-03-14T06:59:00Z'); // total lunar eclipse
  const m2 = moonGeocentric(lunar);
  assert.ok(angDiff(eclipticLongitude(m2), sunLon(lunar) + 180) < 0.6, 'full moon longitude');
  assert.ok(moonPhase(lunar).illuminated > 0.998);

  const quarter = moonPhase(day('2025-03-06T16:32:00Z')); // first quarter
  assert.ok(Math.abs(quarter.illuminated - 0.5) < 0.02 && quarter.waxing);
});

test('Earth orientation: sub-solar point follows the clock and the seasons', () => {
  const check = (iso, lat, lon, tol = 1.2) => {
    const d = day(iso);
    const e = eclipticToScene(helioEcliptic('earth', d));
    const p = subSolarPoint('earth', d, [-e[0], -e[1], -e[2]]);
    assert.ok(Math.abs(p.lat - lat) < tol, `${iso} lat=${p.lat.toFixed(2)} want ${lat}`);
    assert.ok(angDiff(p.lon, lon) < tol, `${iso} lon=${p.lon.toFixed(2)} want ${lon}`);
  };
  check('2000-01-01T12:00:00Z', -23.0, 0.8);    // noon UTC → Sun over Greenwich
  check('2024-06-20T20:51:00Z', 23.44, -132.3); // June solstice
  check('2024-03-20T03:06:00Z', 0.0, 135.4);    // March equinox
  check('2026-11-14T05:00:00Z', -18.3, 101.1);  // midday in Bangkok-ish longitudes
});

test('spin frames are orthonormal and the Moon faces Earth', () => {
  for (const id of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
    const { pole, prime } = bodyFrame(id, 1234.5);
    assert.ok(Math.abs(r(pole) - 1) < 1e-9 && Math.abs(r(prime) - 1) < 1e-9);
    assert.ok(Math.abs(pole[0] * prime[0] + pole[1] * prime[1] + pole[2] * prime[2]) < 1e-9);
  }
  const toEarth = [0.3, 0.05, -0.9];
  const { prime } = bodyFrame('moon', 10, toEarth);
  const cos = (prime[0] * toEarth[0] + prime[1] * toEarth[1] + prime[2] * toEarth[2]) / r(toEarth);
  assert.ok(cos > 0.99);
});

test('axial tilts match the textbook values', () => {
  // Angle between the spin pole and the orbit normal.
  const tilt = (id) => {
    const a = eclipticToScene(helioEcliptic(id, 0)), b = eclipticToScene(helioEcliptic(id, 30));
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const { pole } = bodyFrame(id, 0);
    return Math.acos((n[0] * pole[0] + n[1] * pole[1] + n[2] * pole[2]) / r(n)) * 180 / Math.PI;
  };
  const want = { earth: 23.44, mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 82.23, neptune: 28.32 };
  for (const [id, deg] of Object.entries(want)) {
    assert.ok(Math.abs(tilt(id) - deg) < 0.6, `${id} tilt=${tilt(id).toFixed(2)} want ${deg}`);
  }
});

test('orbit ellipse passes through the planet', () => {
  for (const id of ['mercury', 'earth', 'mars', 'pluto']) {
    const d = 9800;
    const p = helioEcliptic(id, d);
    const pts = orbitEllipse(id, d, 2048);
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      best = Math.min(best, Math.hypot(pts[i] - p[0], pts[i + 1] - p[1], pts[i + 2] - p[2]));
    }
    assert.ok(best < r(p) * 0.004, `${id} gap=${best}`);
  }
});

test('galactic frame: pole ⟂ centre, plane tilted ≈60° to the ecliptic', () => {
  const d = GALACTIC_NORTH[0] * GALACTIC_CENTRE[0] + GALACTIC_NORTH[1] * GALACTIC_CENTRE[1] + GALACTIC_NORTH[2] * GALACTIC_CENTRE[2];
  assert.ok(Math.abs(d) < 1e-3);
  const tilt = Math.acos(GALACTIC_NORTH[1]) * 180 / Math.PI; // scene Y is ecliptic north
  assert.ok(Math.abs(tilt - 60.2) < 0.3, `tilt=${tilt}`);
  assert.ok(AU_KM > 1.49e8);
});
