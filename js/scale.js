// Scene scale model, shared by the world and the moon swarm.
//
// s = 0: "compressed" — distances follow a^0.4 and radii (R/R⊕)^0.45 so every
//        body is visible in one view.
// s = 1: true scale — 1 AU = UNIT scene units and radii in the same units.
// In between, both are interpolated geometrically (linearly in log space).
import * as A from './astro.js';

export const UNIT = 50;
export const DIST_EXP = 0.4;
const SIZE_EXP = 0.45;
const SIZE_K = 1.5;
const EARTH_R_TRUE = (UNIT * A.EARTH_RADIUS_KM) / A.AU_KM;
const MOON_COMPRESSED = 2.8; // our Moon's orbit radius, in Earth radii, when compressed

export function sceneDistance(au, s) {
  return UNIT * Math.pow(au, DIST_EXP + (1 - DIST_EXP) * s);
}

export function sceneRadius(km, s) {
  const rho = km / A.EARTH_RADIUS_KM;
  return Math.pow(SIZE_K * Math.pow(rho, SIZE_EXP), 1 - s) * Math.pow(EARTH_R_TRUE * rho, s);
}

const trueDistance = (km) => (UNIT * km) / A.AU_KM;

/** Our Moon: kept at 2.8 Earth radii when compressed so it stays clear of Venus and Mars. */
export function lunarSceneDistance(km, parentKm, s) {
  const compressed = sceneRadius(parentKm, 0) * MOON_COMPRESSED * (km / A.MOON_MEAN_DISTANCE_KM);
  return Math.pow(compressed, 1 - s) * Math.pow(trueDistance(km), s);
}

/**
 * Other moons, in units of the planet's own (inflated) radius when compressed:
 * true distances up to 2.5 radii, so rings and ring moons line up; the square
 * root of the distance out to 30 radii, which spreads out the large regular
 * moons; and a logarithm beyond that, which folds the distant irregular moons
 * (out to hundreds or thousands of radii) into a band a few radii wide.
 */
export function compressedRadii(x) {
  if (x <= 2.5) return x;
  if (x <= 30) return 2.5 * Math.sqrt(x / 2.5);
  return 2.5 * Math.sqrt(12) + 1.5 * Math.log(x / 30);
}

export function satelliteSceneDistance(km, parentKm, s) {
  const compressed = sceneRadius(parentKm, 0) * compressedRadii(km / parentKm);
  return Math.pow(compressed, 1 - s) * Math.pow(trueDistance(km), s);
}
