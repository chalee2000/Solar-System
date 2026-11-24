// Named places on Mars: data sanity, and that a place's latitude/longitude
// lands where the IAU rotation model puts it.
// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/astro.js';
import { PLACES, PLACE_KIND_TEXT, placeVector, coordText } from '../js/places.js';

const mars = PLACES.mars;

test('every place is complete and inside the map', () => {
  const ids = new Set();
  for (const p of mars) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.match(p.id, /^[a-z0-9-]+$/);
    assert.ok(p.name && p.en && p.desc, p.id);
    assert.ok(PLACE_KIND_TEXT[p.kind], `${p.id} kind`);
    assert.ok(p.lat >= -90 && p.lat <= 90, `${p.id} lat`);
    assert.ok(p.lon >= -180 && p.lon <= 180, `${p.id} lon`);
    if (p.kind === 'site') assert.match(p.date, /\d{4}$/, `${p.id} date`);
    else assert.ok(p.size > 0, `${p.id} size`);
  }
  // Every spacecraft that has landed on Mars, 1971–2021.
  const sites = mars.filter((p) => p.kind === 'site').map((p) => p.id);
  assert.deepEqual(sites.sort(), ['curiosity', 'insight', 'mars-3', 'opportunity', 'pathfinder', 'perseverance',
    'phoenix', 'spirit', 'viking-1', 'viking-2', 'zhurong'].sort());
});

test('rovers sit inside the features they explore', () => {
  const at = (id) => mars.find((p) => p.id === id);
  // Great-circle distance in km on a 3389.5 km sphere.
  const km = (a, b) => {
    const u = placeVector(a.lat, a.lon), v = placeVector(b.lat, b.lon);
    return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * 3389.5;
  };
  assert.ok(km(at('curiosity'), at('gale')) < at('gale').size / 2, 'Curiosity in Gale');
  assert.ok(km(at('perseverance'), at('jezero')) < at('jezero').size / 2, 'Perseverance in Jezero');
  assert.ok(km(at('viking-2'), at('utopia')) < at('utopia').size / 2, 'Viking 2 on Utopia');
  assert.ok(km(at('zhurong'), at('utopia')) < at('utopia').size / 2, 'Zhurong on Utopia');
  assert.ok(km(at('viking-1'), at('chryse')) < at('chryse').size / 2, 'Viking 1 on Chryse');
});

test('latitude and east longitude follow the IAU frame', () => {
  // Put the Sun straight above each place; the sub-solar point must come back
  // as that place's coordinates.
  for (const d of [0, 4321.5, 9800.25]) {
    const { pole, prime } = A.bodyFrame('mars', d);
    const z = [prime[1] * pole[2] - prime[2] * pole[1], prime[2] * pole[0] - prime[0] * pole[2], prime[0] * pole[1] - prime[1] * pole[0]];
    for (const p of mars) {
      const v = placeVector(p.lat, p.lon);
      const dir = [0, 1, 2].map((i) => v[0] * prime[i] + v[1] * pole[i] + v[2] * z[i]);
      const s = A.subSolarPoint('mars', d, dir);
      assert.ok(Math.abs(s.lat - p.lat) < 1e-6, `${p.id} lat ${s.lat}`);
      if (Math.abs(p.lat) < 89.9) assert.ok(Math.abs(((s.lon - p.lon + 540) % 360) - 180) < 1e-6, `${p.id} lon ${s.lon}`);
    }
  }
});

test('coordinates read naturally', () => {
  assert.equal(coordText(18.65, -133.8), '18.65° เหนือ, 133.80° ตะวันตก');
  assert.equal(coordText(-4.5895, 137.4417), '4.59° ใต้, 137.44° ตะวันออก');
});
