// Named places on Mars and the Moon: data sanity, landers inside the features
// they explored, and that latitude/longitude land where the rotation model
// puts them.
// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/astro.js';
import { PLACES, PLACE_KIND_TEXT, placeVector, coordText } from '../js/places.js';

const RADIUS_KM = { mars: 3389.5, moon: 1737.4 };
const find = (body, id) => PLACES[body].find((p) => p.id === id);
// Great-circle distance in km.
const km = (body, a, b) => {
  const u = placeVector(a.lat, a.lon), v = placeVector(b.lat, b.lon);
  return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * RADIUS_KM[body];
};
const inside = (body, site, feature) => {
  const s = find(body, site), f = find(body, feature);
  assert.ok(km(body, s, f) < f.size / 2, `${site} in ${feature}: ${km(body, s, f).toFixed(0)} km`);
};

test('every place is complete and inside the map', () => {
  for (const [body, places] of Object.entries(PLACES)) {
    const ids = new Set();
    for (const p of places) {
      assert.ok(!ids.has(p.id), `${body}: duplicate ${p.id}`);
      ids.add(p.id);
      assert.match(p.id, /^[a-z0-9-]+$/);
      assert.ok(p.name && p.en && p.desc, `${body}: ${p.id}`);
      assert.ok(PLACE_KIND_TEXT[p.kind], `${body}: ${p.id} kind`);
      assert.ok(p.lat >= -90 && p.lat <= 90, `${body}: ${p.id} lat`);
      assert.ok(p.lon >= -180 && p.lon <= 180, `${body}: ${p.id} lon`);
      if (p.kind === 'site') assert.match(p.date, /\d{4}$/, `${body}: ${p.id} date`);
      else assert.ok(p.size > 0, `${body}: ${p.id} size`);
    }
  }
});

test('Mars: every lander, each inside the area it explored', () => {
  const sites = PLACES.mars.filter((p) => p.kind === 'site').map((p) => p.id);
  assert.deepEqual(sites.sort(), ['curiosity', 'insight', 'mars-3', 'opportunity', 'pathfinder', 'perseverance',
    'phoenix', 'spirit', 'viking-1', 'viking-2', 'zhurong'].sort());
  inside('mars', 'curiosity', 'gale');
  inside('mars', 'perseverance', 'jezero');
  inside('mars', 'viking-2', 'utopia');
  inside('mars', 'zhurong', 'utopia');
  inside('mars', 'viking-1', 'chryse');
});

test('Moon: the crewed landings and key robotic ones, in the right seas', () => {
  const sites = PLACES.moon.filter((p) => p.kind === 'site').map((p) => p.id);
  for (const n of [11, 12, 14, 15, 16, 17]) assert.ok(sites.includes(`apollo-${n}`), `Apollo ${n}`);
  assert.ok(!sites.includes('apollo-13'), 'Apollo 13 never landed');
  for (const id of ['luna-9', 'change-4', 'change-6', 'chandrayaan-3', 'slim', 'odysseus', 'blue-ghost']) assert.ok(sites.includes(id), id);
  inside('moon', 'apollo-11', 'tranquillitatis');
  inside('moon', 'luna-16', 'fecunditatis');
  inside('moon', 'luna-24', 'crisium');
  inside('moon', 'blue-ghost', 'crisium');
  inside('moon', 'change-4', 'south-pole-aitken');
  inside('moon', 'change-6', 'south-pole-aitken');
  inside('moon', 'change-3', 'imbrium');
  // Far-side landings really are on the far side (longitude 0° faces Earth).
  for (const id of ['change-4', 'change-6']) assert.ok(Math.abs(find('moon', id).lon) > 90, id);
  for (const id of ['apollo-11', 'apollo-12', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17']) assert.ok(Math.abs(find('moon', id).lon) < 40, id);
});

// Recover latitude and east longitude from a direction, the way the app's
// sub-solar point is defined (east = pole × prime).
function latLon({ pole, prime }, dir) {
  const east = [pole[1] * prime[2] - pole[2] * prime[1], pole[2] * prime[0] - pole[0] * prime[2], pole[0] * prime[1] - pole[1] * prime[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { lat: Math.asin(dot(dir, pole)) / A.DEG, lon: Math.atan2(dot(dir, east), dot(dir, prime)) / A.DEG };
}

test('latitude and east longitude follow each body\'s spin frame', () => {
  for (const d of [0, 4321.5, 9800.25]) {
    const frames = {
      mars: A.bodyFrame('mars', d),
      // Our Moon keeps longitude 0° toward Earth.
      moon: A.bodyFrame('moon', d, [0.31, 0.02, -0.95]),
    };
    for (const [body, frame] of Object.entries(frames)) {
      const { pole, prime } = frame;
      const z = [prime[1] * pole[2] - prime[2] * pole[1], prime[2] * pole[0] - prime[0] * pole[2], prime[0] * pole[1] - prime[1] * pole[0]];
      for (const p of PLACES[body]) {
        const v = placeVector(p.lat, p.lon);
        const dir = [0, 1, 2].map((i) => v[0] * prime[i] + v[1] * pole[i] + v[2] * z[i]);
        const got = latLon(frame, dir);
        assert.ok(Math.abs(got.lat - p.lat) < 1e-6, `${body} ${p.id} lat ${got.lat}`);
        if (Math.abs(p.lat) < 89.9) assert.ok(Math.abs(((got.lon - p.lon + 540) % 360) - 180) < 1e-6, `${body} ${p.id} lon ${got.lon}`);
      }
      // Same convention as the sub-solar point used for day and night.
      if (body === 'mars') {
        const p = find('mars', 'gale');
        const v = placeVector(p.lat, p.lon);
        const s = A.subSolarPoint('mars', d, [0, 1, 2].map((i) => v[0] * prime[i] + v[1] * pole[i] + v[2] * z[i]));
        assert.ok(Math.abs(s.lat - p.lat) < 1e-6 && Math.abs(s.lon - p.lon) < 1e-6);
      }
    }
  }
});

test('coordinates read naturally', () => {
  assert.equal(coordText(18.65, -133.8), '18.65° เหนือ, 133.80° ตะวันตก');
  assert.equal(coordText(-4.5895, 137.4417), '4.59° ใต้, 137.44° ตะวันออก');
});
