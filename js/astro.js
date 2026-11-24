// Time and ephemeris helpers.
//
// Positions come from JPL's "Keplerian Elements for Approximate Positions of the
// Major Planets" (valid 1800–2050, degrading slowly outside that range) and the
// Astronomical Almanac's low-precision lunar series. Orientations use the IAU
// pole / prime-meridian models. Everything here is plain math with no DOM or
// WebGL dependency so it can be unit-tested in Node.
//
// Coordinate frames
//   ecliptic : x → vernal equinox, z → ecliptic north (J2000), right-handed
//   scene    : X = x_ecl, Y = z_ecl, Z = −y_ecl   (Y is "up", still right-handed)

export const DEG = Math.PI / 180;
export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const OBLIQUITY = 23.43928 * DEG;
export const LIGHT_KM_S = 299792.458;
export const EARTH_RADIUS_KM = 6378.137;

export function daysSinceJ2000(ms) {
  return (ms - J2000_MS) / DAY_MS;
}

// a (AU), e, I (deg), L (deg), long. of perihelion (deg), long. of ascending node (deg)
// followed by the same six as rates per Julian century.
const ELEMENTS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255,
    0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503,
    -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
    0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  pluto: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684,
    -0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
};

export const PLANET_IDS = Object.keys(ELEMENTS);

export function elementsAt(id, d) {
  const el = ELEMENTS[id];
  const T = d / 36525;
  return {
    a: el[0] + el[6] * T,
    e: el[1] + el[7] * T,
    I: (el[2] + el[8] * T) * DEG,
    L: (el[3] + el[9] * T) * DEG,
    peri: (el[4] + el[10] * T) * DEG,
    node: (el[5] + el[11] * T) * DEG,
  };
}

export function solveKepler(M, e) {
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  else if (M < -Math.PI) M += 2 * Math.PI;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 15; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// Rotates a point in the orbital plane (x toward perihelion) into the ecliptic frame.
function planeToEcliptic(xp, yp, w, node, I, out) {
  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);
  out[0] = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  out[1] = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  out[2] = sw * si * xp + cw * si * yp;
  return out;
}

/** Heliocentric ecliptic position in AU. */
export function helioEcliptic(id, d, out = [0, 0, 0]) {
  const el = elementsAt(id, d);
  const E = solveKepler(el.L - el.peri, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return planeToEcliptic(xp, yp, el.peri - el.node, el.node, el.I, out);
}

/** n points around the orbit ellipse (ecliptic, AU) for the elements at day d. */
export function orbitEllipse(id, d, n = 512) {
  const el = elementsAt(id, d);
  const pts = new Float64Array(n * 3);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const E = (i / n) * 2 * Math.PI;
    planeToEcliptic(el.a * (Math.cos(E) - el.e), b * Math.sin(E), el.peri - el.node, el.node, el.I, tmp);
    pts[i * 3] = tmp[0]; pts[i * 3 + 1] = tmp[1]; pts[i * 3 + 2] = tmp[2];
  }
  return pts;
}

export const MOON_MEAN_DISTANCE_KM = 384400;
export const MOON_SIDEREAL_DAYS = 27.321662;

/** Geocentric ecliptic position of the Moon in km (≈0.3° accuracy). */
export function moonGeocentric(d, out = [0, 0, 0]) {
  const T = d / 36525;
  const s = (x) => Math.sin(x * DEG);
  const c = (x) => Math.cos(x * DEG);
  const lon = 218.32 + 481267.881 * T
    + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T)
    + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T)
    - 0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T);
  const lat = 5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T)
    - 0.28 * s(318.3 + 6003.15 * T) - 0.17 * s(217.6 - 407332.21 * T);
  const parallax = 0.9508 + 0.0518 * c(135.0 + 477198.87 * T) + 0.0095 * c(259.3 - 413335.36 * T)
    + 0.0078 * c(235.7 + 890534.22 * T) + 0.0028 * c(269.9 + 954397.74 * T);
  const r = EARTH_RADIUS_KM / Math.sin(parallax * DEG);
  const cl = Math.cos(lat * DEG);
  out[0] = r * cl * Math.cos(lon * DEG);
  out[1] = r * cl * Math.sin(lon * DEG);
  out[2] = r * Math.sin(lat * DEG);
  return out;
}

/** Ecliptic longitude in degrees, 0–360. */
export function eclipticLongitude(v) {
  const l = Math.atan2(v[1], v[0]) / DEG;
  return l < 0 ? l + 360 : l;
}

// ── frames ─────────────────────────────────────────────────────────────────

export function eclipticToScene(v, out = [0, 0, 0]) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = x; out[1] = z; out[2] = -y;
  return out;
}

function equatorialToScene(v) {
  const ce = Math.cos(OBLIQUITY), se = Math.sin(OBLIQUITY);
  return eclipticToScene([v[0], v[1] * ce + v[2] * se, -v[1] * se + v[2] * ce]);
}

/** Unit vector (scene frame) for a J2000 right ascension / declination in degrees. */
export function raDecToScene(ra, dec) {
  const cd = Math.cos(dec * DEG);
  return equatorialToScene([cd * Math.cos(ra * DEG), cd * Math.sin(ra * DEG), Math.sin(dec * DEG)]);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// IAU pole (RA, Dec at J2000, degrees) and prime meridian W = w0 + wd·d (degrees, d in days).
const ROTATION = {
  sun: [286.13, 63.87, 84.176, 14.1844],
  mercury: [281.0103, 61.4155, 329.5988, 6.1385108],
  venus: [272.76, 67.16, 160.2, -1.4813688],
  earth: [0.0, 90.0, 190.147, 360.9856235],
  mars: [317.68143, 52.8865, 176.63, 350.89198226],
  jupiter: [268.056595, 64.495303, 284.95, 870.536],
  saturn: [40.589, 83.537, 38.9, 810.7939024],
  uranus: [257.311, -15.175, 203.81, -501.1600928],
  neptune: [299.36, 43.46, 249.978, 541.1397757],
  pluto: [132.993, -6.163, 302.695, 56.3625225],
};

const FRAMES = {};
for (const [id, [ra, dec, w0, wd]] of Object.entries(ROTATION)) {
  const pole = raDecToScene(ra, dec);
  // Q: ascending node of the body's equator on the J2000 equator (RA = α0 + 90°).
  const node = raDecToScene(ra + 90, 0);
  FRAMES[id] = { pole, node, east: cross(pole, node), w0, wd };
}

/**
 * Orientation of a body's spin frame in scene coordinates.
 * Returns { pole, prime } where `pole` is the spin axis and `prime` points from
 * the body's centre through longitude 0° on its equator.
 */
export function bodyFrame(id, d, moonToEarthScene = null) {
  if (id === 'moon') {
    // Tidally locked: keep the near side (longitude 0°) toward Earth. The lunar
    // axis is within 1.5° of the ecliptic pole, which is close enough here.
    const pole = [0, 1, 0];
    const v = moonToEarthScene;
    const k = dot(v, pole);
    return { pole, prime: norm([v[0] - k * pole[0], v[1] - k * pole[1], v[2] - k * pole[2]]) };
  }
  const f = FRAMES[id];
  const W = ((f.w0 + f.wd * d) % 360) * DEG;
  const c = Math.cos(W), s = Math.sin(W);
  return {
    pole: f.pole,
    prime: [c * f.node[0] + s * f.east[0], c * f.node[1] + s * f.east[1], c * f.node[2] + s * f.east[2]],
  };
}

/** Sub-solar latitude / east longitude (degrees) for a body, given the Sun direction in scene coords. */
export function subSolarPoint(id, d, sunDirScene) {
  const { pole, prime } = bodyFrame(id, d);
  const east = cross(pole, prime);
  const s = norm(sunDirScene);
  return {
    lat: Math.asin(dot(s, pole)) / DEG,
    lon: Math.atan2(dot(s, east), dot(s, prime)) / DEG,
  };
}

// Galactic frame, for orienting the Milky Way panorama.
export const GALACTIC_NORTH = raDecToScene(192.85948, 27.12825);
export const GALACTIC_CENTRE = raDecToScene(266.40499, -28.93617);

/** Fraction of the Moon's disc that is lit as seen from Earth, and whether it is waxing. */
export function moonPhase(d) {
  const moon = moonGeocentric(d);
  const earth = helioEcliptic('earth', d);
  const sunLon = (eclipticLongitude(earth) + 180) % 360;
  const elong = ((eclipticLongitude(moon) - sunLon) % 360 + 360) % 360;
  const moonDir = norm(moon);
  const sunDir = norm([-earth[0], -earth[1], -earth[2]]);
  const cosPsi = dot(moonDir, sunDir);
  return { illuminated: (1 - cosPsi) / 2, waxing: elong < 180, elongation: elong };
}

// ── planetary satellites ──────────────────────────────────────────────────
//
// Mean elements from JPL (see js/moons-data.js) describe a precessing ellipse
// in a reference plane: the ecliptic, the satellite's local Laplace plane, or
// the planet's equator. The node is measured from where that plane crosses
// the ICRF equator. Good for showing where each moon is and how its orbit is
// shaped; JPL notes they are not meant for precise ephemerides.

const ECLIPTIC_POLE_DEC = 90 - OBLIQUITY / DEG;

function satelliteBasis(el, parent) {
  if (el._basis) return el._basis;
  let ra, dec;
  if (el.f === 'ecl') { ra = 270; dec = ECLIPTIC_POLE_DEC; }
  else if (el.f === 'lap') { ra = el.ra; dec = el.de; }
  else {
    // The planet's equator, oriented by its spin (right-hand rule): for Uranus,
    // which spins backwards, that is the opposite of the IAU north pole.
    const [pra, pdec, , wd] = ROTATION[parent];
    [ra, dec] = wd < 0 ? [pra + 180, -pdec] : [pra, pdec];
  }
  const Z = raDecToScene(ra, dec);
  const X = raDecToScene(ra + 90, 0);
  Object.defineProperty(el, '_basis', { value: { X, Y: cross(Z, X), Z }, enumerable: false });
  return el._basis;
}

/**
 * Mean elements of a satellite at day d: angles in radians.
 * `dn` (deg/day) and the epoch mean anomaly come out of tools/calibrate_moons.mjs,
 * which anchors each orbit's phase to JPL Horizons positions in 2000–2028.
 */
export function satelliteElements(el, d) {
  const years = (d - el.ep) / 365.25;
  const sense = el.i <= 90 ? 1 : -1;
  // Apsides advance; nodes regress for prograde orbits and advance for retrograde ones.
  const dw = el.Pw ? 360 * years / el.Pw : 0;
  const dO = el.Po ? -sense * 360 * years / el.Po : 0;
  // P is the sidereal period: the moon's direction in space advances at
  // 360°/P whatever its apsides and node do. (For near-circular orbits JPL's
  // apsidal periods can be tiny and meaningless; this keeps them harmless.)
  const dM = (360 / el.P + (el.dn || 0)) * (d - el.ep) - dw - sense * dO;
  return {
    a: el.a, e: el.e, i: el.i * DEG,
    w: (el.w + dw) * DEG, node: (el.o + dO) * DEG, M: (el.M + dM) * DEG,
  };
}

/** Planet-centred position of a satellite in km, scene axes. */
export function satellitePosition(el, parent, d, out = [0, 0, 0]) {
  const k = satelliteElements(el, d);
  const E = solveKepler(k.M, k.e);
  const xp = k.a * (Math.cos(E) - k.e);
  const yp = k.a * Math.sqrt(1 - k.e * k.e) * Math.sin(E);
  const p = planeToEcliptic(xp, yp, k.w, k.node, k.i, [0, 0, 0]);
  const { X, Y, Z } = satelliteBasis(el, parent);
  for (let j = 0; j < 3; j++) out[j] = p[0] * X[j] + p[1] * Y[j] + p[2] * Z[j];
  return out;
}

/** n points around a satellite's orbit (km, scene axes) for the elements at day d. */
export function satelliteOrbit(el, parent, d, n = 128, out = new Float64Array(n * 3)) {
  const k = satelliteElements(el, d);
  const { X, Y, Z } = satelliteBasis(el, parent);
  const b = k.a * Math.sqrt(1 - k.e * k.e);
  const p = [0, 0, 0];
  for (let s = 0; s < n; s++) {
    const E = (s / n) * 2 * Math.PI;
    planeToEcliptic(k.a * (Math.cos(E) - k.e), b * Math.sin(E), k.w, k.node, k.i, p);
    for (let j = 0; j < 3; j++) out[s * 3 + j] = p[0] * X[j] + p[1] * Y[j] + p[2] * Z[j];
  }
  return out;
}

/** Pole of the plane a satellite orbits in (scene axes): its reference plane's pole. */
export function satellitePole(el, parent) {
  return satelliteBasis(el, parent).Z;
}
