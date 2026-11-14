// The 3D scene: bodies, orbits, belts, sky, camera flight and level-of-detail.
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import * as A from './astro.js';
import { BODIES } from './data.js';
import * as SH from './shaders.js';
import { TextureStore, TIER_WIDTH } from './textures.js';

// ── scale model ────────────────────────────────────────────────────────────
// s = 0: "compressed" — distances follow a^0.4 and radii (R/R⊕)^0.45 so every
//        body is visible in one view.
// s = 1: true scale — 1 AU = UNIT scene units and radii in the same units.
// In between, both are interpolated geometrically (linearly in log space).
export const UNIT = 50;
const DIST_EXP = 0.4;
const SIZE_EXP = 0.45;
const SIZE_K = 1.5;
const EARTH_R_TRUE = (UNIT * A.EARTH_RADIUS_KM) / A.AU_KM;
const MOON_COMPRESSED = 2.8; // Moon's orbit radius, in Earth radii, when compressed
const FAR = 4e5;
const MIN_MS = Date.UTC(1000, 0, 1);
const MAX_MS = Date.UTC(3000, 0, 1);
const GIANTS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
const ORBIT_SEGMENTS = 720;
const MOON_ORBIT_SEGMENTS = 120;

export function sceneDistance(au, s) {
  return UNIT * Math.pow(au, DIST_EXP + (1 - DIST_EXP) * s);
}
export function sceneRadius(km, s) {
  const rho = km / A.EARTH_RADIUS_KM;
  return Math.pow(SIZE_K * Math.pow(rho, SIZE_EXP), 1 - s) * Math.pow(EARTH_R_TRUE * rho, s);
}
function moonSceneDistance(km, parentKm, s) {
  const compressed = sceneRadius(parentKm, 0) * MOON_COMPRESSED * (km / A.MOON_MEAN_DISTANCE_KM);
  return Math.pow(compressed, 1 - s) * Math.pow((UNIT * km) / A.AU_KM, s);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sphere whose V coordinate runs top-down, matching unflipped images.
function makeSphere(widthSegments, heightSegments) {
  const g = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

// Flat annulus in the body's equatorial (XZ) plane; `radial` runs 0 → 1 outward.
function makeRing(inner, outer, segments = 256) {
  const pos = new Float32Array((segments + 1) * 6);
  const radial = new Float32Array((segments + 1) * 2);
  const index = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.set([inner * c, 0, inner * s, outer * c, 0, outer * s], i * 6);
    radial[i * 2 + 1] = 1;
    if (i < segments) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('radial', new THREE.BufferAttribute(radial, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

function radialGradientTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) grd.addColorStop(at, color);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Uranus's rings are a handful of very narrow dark bands; draw them to scale.
function uranusRingTexture(def) {
  const W = 2048, H = 4;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const kmIn = def.ring.inner * def.radiusKm, kmOut = def.ring.outer * def.radiusKm;
  const rings = [[41837, 2, 0.4], [42234, 2, 0.4], [42571, 2, 0.4], [44718, 3, 0.55], [45661, 3, 0.55],
    [47176, 2, 0.35], [47627, 3, 0.55], [48300, 3, 0.5], [51149, 9, 0.8]];
  for (const [km, width, alpha] of rings) {
    ctx.fillStyle = `rgba(168,184,196,${alpha})`;
    ctx.fillRect(((km - kmIn) / (kmOut - kmIn)) * W - width / 2, 0, width, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  return tex;
}

export class World {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
    });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, FAR);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.09, enablePan: false });

    this.store = new TextureStore(this.renderer);
    this.shared = { uSunPosV: { value: new THREE.Vector3() }, uFill: { value: 0 } };

    this.bodies = [];
    this.byId = {};
    this.target = null;
    this.fly = null;

    this.simMs = Date.now();
    this.rate = 86400;
    this.direction = 1;
    this.playing = true;

    this.s = 0;            // current scale blend
    this._scaleU = 0;      // tween parameter
    this._scaleGoal = 0;
    this._fillGoal = 0;
    this.options = { orbits: true, belts: true };

    this.width = 1; this.height = 1;
    this.freeW = 1; this.freeH = 1;
    this._shift = new THREE.Vector2();
    this._shiftGoal = new THREE.Vector2();
    this._zoomHold = 0;
    this._lastTargetPos = new THREE.Vector3();
    this._orbitEpoch = Infinity;
    this._orbitScale = -1;
    this._moonOrbitDay = Infinity;
    this._clock = 0;

    // scratch
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._q1 = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._m1 = new THREE.Matrix4();
    this._t3 = [0, 0, 0];
  }

  // ── construction ─────────────────────────────────────────────────────────

  async init(onProgress) {
    const base = {};
    const jobs = [];
    let done = 0;
    const add = (promise, assign) => jobs.push(promise.then((tex) => {
      assign(tex);
      onProgress?.(++done / jobs.length);
    }));
    for (const def of BODIES) {
      base[def.id] = {};
      for (const [key, channel] of Object.entries(def.tex)) {
        add(this.store.loadChannel(channel, channel.tiers[0]), (tex) => {
          tex.userData.tier = channel.tiers[0];
          base[def.id][key] = tex;
        });
      }
    }
    let saturnRing, stars;
    add(this.store.load('textures/saturn_ring.png'), (t) => { t.wrapS = THREE.ClampToEdgeWrapping; saturnRing = t; });
    add(this.store.load('textures/stars_4k.jpg'), (t) => { stars = t; });
    await Promise.all(jobs);

    this.sphereLo = makeSphere(64, 32);
    this.sphereHi = makeSphere(256, 128);

    this._buildSky(stars);
    for (const def of BODIES) this._buildBody(def, base[def.id], saturnRing);
    for (const b of this.bodies) if (b.def.parent) b.parent = this.byId[b.def.parent];
    this._buildOrbits();
    this._buildBelts();
    this._buildSunGlow();

    this.target = this.byId.sun;
    this._place(A.daysSinceJ2000(this.simMs));
    const dir = new THREE.Vector3(0.28, 0.52, 0.8).normalize();
    this.camera.position.copy(dir.multiplyScalar(this._overviewDistance() * 1.9));
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.overview(3.2);

    // The 8K Milky Way is a nicety; fetch it once everything else is on screen.
    if (this.store.maxTier === '8k') {
      this.store.load('textures/stars_8k.jpg').then((t) => {
        TextureStore.dispose(this.sky.material.map);
        this.sky.material.map = t;
        this.sky.material.needsUpdate = true;
      }).catch(() => {});
    }
  }

  _buildSky(tex) {
    const g = makeSphere(64, 32);
    g.scale(-1, 1, 1); // view from inside without mirroring
    const m = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false });
    m.color.setScalar(1.7);
    const sky = new THREE.Mesh(g, m);
    sky.scale.setScalar(FAR * 0.4);
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    // The panorama is in galactic coordinates with the galactic centre in the
    // middle (local −X after the mirror) and galactic north up.
    const gc = new THREE.Vector3().fromArray(A.GALACTIC_CENTRE);
    const gn = new THREE.Vector3().fromArray(A.GALACTIC_NORTH);
    const x = gc.clone().negate();
    const z = new THREE.Vector3().crossVectors(x, gn).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    sky.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.scene.add(sky);
    this.sky = sky;
  }

  _surfaceMaterial(b, tex, surface, atmosphere) {
    const rim = new THREE.Color(0, 0, 0);
    if (atmosphere) rim.setRGB(...atmosphere.color, THREE.SRGBColorSpace);
    return new THREE.ShaderMaterial({
      vertexShader: SH.SURFACE_VERT,
      fragmentShader: SH.SURFACE_FRAG,
      uniforms: {
        uMap: { value: tex.map }, uNight: { value: tex.night || null }, uSpec: { value: tex.spec || null },
        uNormal: { value: tex.normal || null }, uCloud: { value: null }, uRingMap: { value: null },
        uSunPosV: this.shared.uSunPosV, uSunDirL: { value: b.sunDirL }, uFill: this.shared.uFill,
        uWrap: { value: surface.wrap ?? 0 }, uRadius: { value: 1 }, uBump: { value: surface.bump ?? 0 },
        uRough: { value: surface.rough ?? 0 }, uNormalScale: { value: surface.normalScale ?? 1 },
        uTexW: { value: tex.map.image.width }, uDetail: { value: surface.detail ?? 0 },
        uNightOn: { value: tex.night ? 1 : 0 }, uSpecOn: { value: tex.spec ? 1 : 0 }, uNormalOn: { value: tex.normal ? 1 : 0 },
        uCloudOn: { value: 0 }, uCloudShift: { value: 0 },
        uRimColor: { value: rim }, uRimStrength: { value: atmosphere ? atmosphere.strength * 0.45 : 0 },
        uRing: { value: new THREE.Vector4(0, 1, 2, 1) },
      },
    });
  }

  _buildBody(def, base, saturnRing) {
    const b = {
      def, id: def.id, group: new THREE.Group(), spin: new THREE.Group(),
      radius: 1, au: [0, 0, 0], offset: new THREE.Vector3(), sunDirL: new THREE.Vector3(1, 0, 0),
      base, hi: null, tier: '2k', loadingTier: null, blocked: new Set(), parent: null,
      shellOn: true, screen: { x: 0, y: 0, r: 0, depth: 0, visible: false },
    };
    b.group.add(b.spin);
    this.scene.add(b.group);

    if (def.kind === 'star') {
      b.material = new THREE.ShaderMaterial({
        vertexShader: SH.SURFACE_VERT, fragmentShader: SH.SUN_FRAG,
        uniforms: { uMap: { value: base.map }, uTime: { value: 0 } },
      });
      b.minAlt = 0.3;
    } else {
      b.material = this._surfaceMaterial(b, base, def.surface, def.atmosphere);
      const best = this.store.pickTier(def.tex.map, '8k');
      const width = def.tex.map.width || TIER_WIDTH[best];
      // Closest approach: stop where a texel of the best available map would
      // cover about four pixels (cloud decks tolerate a little more).
      b.minAlt = GIANTS.has(def.id) ? clamp(1100 / width, 0.2, 0.4) : clamp(1700 / width, 0.18, 0.6);
    }
    b.mesh = new THREE.Mesh(this.sphereLo, b.material);
    b.spin.add(b.mesh);

    if (def.shell) {
      if (def.shell.kind === 'opaque') {
        b.shellMaterial = this._surfaceMaterial(b, { map: base.shell }, { wrap: def.shell.wrap ?? 0.3, detail: 0.04 }, def.atmosphere);
      } else {
        b.shellMaterial = new THREE.ShaderMaterial({
          vertexShader: SH.SURFACE_VERT, fragmentShader: SH.CLOUD_FRAG, transparent: true, depthWrite: false,
          uniforms: { uMap: { value: base.shell }, uSunPosV: this.shared.uSunPosV, uFill: this.shared.uFill, uOpacity: { value: 0.96 } },
        });
        b.material.uniforms.uCloud.value = base.shell;
        b.material.uniforms.uCloudOn.value = 1;
      }
      b.shell = new THREE.Mesh(this.sphereLo, b.shellMaterial);
      b.shell.scale.setScalar(def.shell.radius);
      b.shell.renderOrder = 1;
      b.spin.add(b.shell);
    }

    if (def.atmosphere) {
      const t = def.atmosphere.thickness;
      const floor = def.shell?.kind === 'opaque' ? def.shell.radius : 1;
      const color = new THREE.Color().setRGB(...def.atmosphere.color, THREE.SRGBColorSpace);
      b.atmosphere = new THREE.Mesh(this.sphereLo, new THREE.ShaderMaterial({
        vertexShader: SH.ATMO_VERT, fragmentShader: SH.ATMO_FRAG,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        uniforms: {
          uColor: { value: color }, uInner: { value: floor / (1 + t) }, uStrength: { value: def.atmosphere.strength },
          uSunset: { value: def.atmosphere.sunset || 0 }, uFill: this.shared.uFill, uSunDirL: { value: b.sunDirL },
        },
      }));
      b.atmosphere.scale.setScalar(1 + t);
      b.atmosphere.renderOrder = 2;
      b.spin.add(b.atmosphere);
    }

    if (def.ring) {
      const map = def.ring.procedural ? uranusRingTexture(def) : saturnRing;
      const polar = 1 - def.flattening;
      b.ringMaterial = new THREE.ShaderMaterial({
        vertexShader: SH.RING_VERT, fragmentShader: SH.RING_FRAG,
        side: THREE.DoubleSide, transparent: true, depthWrite: false,
        uniforms: {
          uMap: { value: map }, uSunDirL: { value: b.sunDirL }, uCamL: { value: new THREE.Vector3(0, 1, 0) },
          uPolar: { value: polar }, uFill: this.shared.uFill, uOpacity: { value: 1 },
        },
      });
      b.ring = new THREE.Mesh(makeRing(def.ring.inner, def.ring.outer), b.ringMaterial);
      b.ring.renderOrder = 3;
      b.spin.add(b.ring);
      b.material.uniforms.uRingMap.value = map;
      b.material.uniforms.uRing.value.set(1, def.ring.inner, def.ring.outer, polar);
    }

    this.bodies.push(b);
    this.byId[def.id] = b;
  }

  _buildOrbits() {
    for (const b of this.bodies) {
      if (b.id === 'sun') continue;
      const n = b.parent ? MOON_ORBIT_SEGMENTS + 1 : ORBIT_SEGMENTS;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new THREE.LineBasicMaterial({ color: b.def.color, transparent: true, opacity: 0.55, depthWrite: false });
      b.orbit = b.parent ? new THREE.Line(g, m) : new THREE.LineLoop(g, m);
      b.orbit.frustumCulled = false;
      (b.parent ? b.parent.group : this.scene).add(b.orbit);
    }
  }

  _buildBelts() {
    const make = (count, seed, sample, color, opacity) => {
      const rnd = mulberry32(seed);
      const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
      const orbit = new Float32Array(count * 4), seeds = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const [a, incSigma] = sample(rnd);
        orbit.set([a, rnd() * Math.PI * 2, Math.abs(gauss()) * incSigma * A.DEG, rnd() * Math.PI * 2], i * 4);
        seeds[i] = rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: SH.BELT_VERT, fragmentShader: SH.BELT_FRAG, transparent: true, depthWrite: false,
        uniforms: {
          uDays: { value: 0 }, uScale: { value: 0 }, uUnit: { value: UNIT }, uSize: { value: 2 },
          uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
        },
      });
      const points = new THREE.Points(g, m);
      points.frustumCulled = false;
      this.scene.add(points);
      return points;
    };
    // Main belt, thinned at the Kirkwood gaps (orbital resonances with Jupiter).
    const gaps = [2.502, 2.825, 2.958];
    const asteroid = (rnd) => {
      for (;;) {
        const a = 2.12 + (rnd() + rnd() + rnd()) / 3 * 1.2;
        if (!gaps.some((gap) => Math.abs(a - gap) < 0.025)) return [a, 8];
      }
    };
    const kuiper = (rnd) => [38.5 + (rnd() + rnd()) / 2 * 9.5, 7];
    this.belts = [make(2800, 7, asteroid, '#b9ab98', 0.75), make(2000, 19, kuiper, '#9fb4c8', 0.5)];
  }

  _buildSunGlow() {
    const sun = this.byId.sun;
    const corona = radialGradientTexture([
      [0, 'rgba(255,224,170,0.30)'], [0.2, 'rgba(255,206,130,0.42)'], [0.235, 'rgba(255,190,105,0.6)'],
      [0.3, 'rgba(255,150,60,0.26)'], [0.5, 'rgba(255,115,40,0.08)'], [1, 'rgba(255,90,30,0)'],
    ]);
    const flare = radialGradientTexture([
      [0, 'rgba(255,250,235,1)'], [0.08, 'rgba(255,236,190,0.9)'], [0.22, 'rgba(255,190,110,0.3)'],
      [0.55, 'rgba(255,150,70,0.06)'], [1, 'rgba(255,120,50,0)'],
    ]);
    const sprite = (map) => new THREE.Sprite(new THREE.SpriteMaterial({
      map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    this.corona = sprite(corona);
    this.flare = sprite(flare);
    this.corona.renderOrder = 4;
    this.flare.renderOrder = 5;
    sun.group.add(this.corona, this.flare);
  }

  // ── simulation ───────────────────────────────────────────────────────────

  get days() { return A.daysSinceJ2000(this.simMs); }

  setTime(ms) { this.simMs = clamp(ms, MIN_MS, MAX_MS); }

  _place(d) {
    const s = this.s, t = this._t3;
    for (const b of this.bodies) {
      b.radius = sceneRadius(b.def.radiusKm, s);
      b.spin.scale.set(b.radius, b.radius * (1 - b.def.flattening), b.radius);
      if (b.id === 'sun') {
        b.group.position.set(0, 0, 0);
      } else if (!b.def.parent) {
        A.helioEcliptic(b.id, d, b.au);
        const r = Math.hypot(b.au[0], b.au[1], b.au[2]);
        const k = sceneDistance(r, s) / r;
        b.group.position.set(b.au[0] * k, b.au[2] * k, -b.au[1] * k);
      }
    }
    for (const b of this.bodies) {
      if (!b.parent) continue;
      A.moonGeocentric(d, t);
      const km = Math.hypot(t[0], t[1], t[2]);
      const k = moonSceneDistance(km, b.parent.def.radiusKm, s) / km;
      b.offset.set(t[0] * k, t[2] * k, -t[1] * k);
      b.group.position.copy(b.parent.group.position).add(b.offset);
      for (let i = 0; i < 3; i++) b.au[i] = b.parent.au[i] + t[i] / A.AU_KM;
    }

    const x = this._v1, y = this._v2, z = this._v3;
    for (const b of this.bodies) {
      const toEarth = b.parent ? [-b.offset.x, -b.offset.y, -b.offset.z] : null;
      const f = A.bodyFrame(b.id, d, toEarth);
      x.fromArray(f.prime); y.fromArray(f.pole); z.crossVectors(x, y);
      b.spin.quaternion.setFromRotationMatrix(this._m1.makeBasis(x, y, z));
      if (b.id !== 'sun') {
        this._q1.copy(b.spin.quaternion).invert();
        b.sunDirL.copy(b.group.position).negate().normalize().applyQuaternion(this._q1);
      }
      if (b.shell) {
        const turn = ((b.def.shell.driftDegPerDay * d) % 360) * A.DEG;
        b.shell.rotation.y = turn;
        if (b.def.shell.kind === 'alpha') b.material.uniforms.uCloudShift.value = -turn / (2 * Math.PI);
      }
      if (b.material.uniforms.uRadius) b.material.uniforms.uRadius.value = b.radius;
    }
  }

  _rebuildOrbits(d) {
    const s = this.s;
    for (const b of this.bodies) {
      if (!b.orbit || b.parent) continue;
      const pts = A.orbitEllipse(b.id, d, ORBIT_SEGMENTS);
      const out = b.orbit.geometry.attributes.position;
      for (let i = 0; i < ORBIT_SEGMENTS; i++) {
        const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
        const r = Math.hypot(px, py, pz);
        const k = sceneDistance(r, s) / r;
        out.setXYZ(i, px * k, pz * k, -py * k);
      }
      out.needsUpdate = true;
    }
    this._orbitEpoch = d;
    this._orbitScale = s;
  }

  _rebuildMoonOrbits(d) {
    const s = this.s, t = this._t3;
    for (const b of this.bodies) {
      if (!b.orbit || !b.parent) continue;
      const out = b.orbit.geometry.attributes.position;
      for (let i = 0; i <= MOON_ORBIT_SEGMENTS; i++) {
        A.moonGeocentric(d + (i / MOON_ORBIT_SEGMENTS - 0.5) * A.MOON_SIDEREAL_DAYS, t);
        const km = Math.hypot(t[0], t[1], t[2]);
        const k = moonSceneDistance(km, b.parent.def.radiusKm, s) / km;
        out.setXYZ(i, t[0] * k, t[2] * k, -t[1] * k);
      }
      out.needsUpdate = true;
    }
    this._moonOrbitDay = d;
  }

  // ── camera ───────────────────────────────────────────────────────────────

  /** Distance, in radii, at which a unit sphere's disc has a radius of `px` pixels. */
  _distanceForRadius(px) {
    const focal = this.height / 2 / Math.tan((this.camera.fov * A.DEG) / 2);
    return 1 / Math.sin(Math.atan(px / focal));
  }

  _overviewAU() {
    const aspect = this.camera.aspect;
    return aspect >= 1.2 ? 31 : aspect >= 0.8 ? 11 : 2.4;
  }

  _overviewDistance() {
    const fit = sceneDistance(this._overviewAU(), this.s);
    return (fit * 1.08) / (Math.tan((this.camera.fov * A.DEG) / 2) * Math.min(this.camera.aspect, 1.65));
  }

  _viewDirection(b, yawDeg = 38, pitchDeg = 16) {
    const dir = this._v1.copy(b.group.position).negate();
    dir.y = 0;
    if (dir.lengthSq() < 1e-12) {
      dir.copy(this.camera.position).sub(this.controls.target).normalize();
      return dir.clone();
    }
    dir.normalize().applyAxisAngle(this._v2.set(0, 1, 0), yawDeg * A.DEG);
    const p = pitchDeg * A.DEG;
    return new THREE.Vector3(dir.x * Math.cos(p), Math.sin(p), dir.z * Math.cos(p));
  }

  flyTo(body, direction, distance, duration = 2.4) {
    const from = this._v1.copy(this.camera.position).sub(this.controls.target);
    if (this.reducedMotion) duration = 0.01;
    this.fly = {
      t: 0, duration, body, distance,
      fromTarget: this.controls.target.clone(),
      fromDir: from.clone().normalize(), fromDist: from.length(),
      toDir: direction.clone().normalize(),
      travel: this.controls.target.distanceTo(body.group.position),
    };
    this.controls.enabled = false;
    if (this.target !== body) {
      this.target = body;
      this.hooks.onTarget?.(body);
    }
  }

  /** Frame the whole body (and its rings). */
  focus(id, duration) {
    const b = this.byId[id];
    // Size the disc to the part of the view that is not covered by panels.
    const fit = () => {
      let k = this._distanceForRadius(0.36 * Math.min(this.freeW, this.freeH));
      if (b.def.ring) k = Math.max(k, b.def.ring.outer * this._distanceForRadius(0.46 * this.freeW));
      return b.radius * k;
    };
    this.flyTo(b, this._viewDirection(b), fit, duration);
  }

  /** Drop to low altitude over the sunlit side. */
  surface(id) {
    const b = this.byId[id];
    const alt = b.minAlt * 1.5;
    this.flyTo(b, this._viewDirection(b, 22, 8), () => b.radius * (1 + alt), 2.6);
  }

  overview(duration = 2.6) {
    const dir = this._v1.copy(this.camera.position).sub(this.controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1e-12) dir.set(0.3, 0, 0.9);
    dir.normalize();
    const p = 33 * A.DEG;
    const to = new THREE.Vector3(dir.x * Math.cos(p), Math.sin(p), dir.z * Math.cos(p));
    this.flyTo(this.byId.sun, to, () => this._overviewDistance(), duration);
  }

  get isOverview() {
    if (this.target.id !== 'sun') return false;
    return this.camera.position.distanceTo(this.controls.target) > this.target.radius * 6;
  }

  _stepFly(dt) {
    const f = this.fly;
    f.t = Math.min(1, f.t + dt / f.duration);
    const e = easeInOut(f.t);
    const goal = f.body.group.position;
    const T = this._v1.lerpVectors(f.fromTarget, goal, e);
    this._q1.setFromUnitVectors(f.fromDir, f.toDir);
    const dir = this._v2.copy(f.fromDir).applyQuaternion(this._q2.identity().slerp(this._q1, e));
    const toDist = f.distance();
    // Pull back mid-flight so the trip between two worlds reads as a journey.
    const dist = Math.exp(Math.log(f.fromDist) * (1 - e) + Math.log(toDist) * e) + 4 * e * (1 - e) * f.travel * 0.3;
    this.camera.position.copy(T).addScaledVector(dir, dist);
    this.controls.target.copy(T);
    this.camera.lookAt(T);
    if (f.t >= 1) {
      this.fly = null;
      this.controls.enabled = true;
      this._lastTargetPos.copy(goal);
      this.hooks.onArrive?.(f.body);
    }
  }

  /** dir > 0 zooms in. Called every frame while a zoom button is held. */
  holdZoom(dir) { this._zoomHold = dir; }

  /** Offset the projection centre and note how much of the view is unobstructed. */
  setViewShift(x, y, freeW = this.width, freeH = this.height) {
    this._shiftGoal.set(x, y);
    this.freeW = Math.max(120, freeW);
    this.freeH = Math.max(120, freeH);
  }

  resize(width, height) {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.freeW = Math.min(Math.max(this.freeW, 120), this.width);
    this.freeH = Math.min(Math.max(this.freeH, 120), this.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this._applyViewShift();
  }

  _applyViewShift() {
    this.camera.setViewOffset(this.width, this.height, this._shift.x, this._shift.y, this.width, this.height);
  }

  // ── options ──────────────────────────────────────────────────────────────

  setTrueScale(on) { this._scaleGoal = on ? 1 : 0; }
  get trueScale() { return this._scaleGoal === 1; }
  setFill(on) { this._fillGoal = on ? 0.94 : 0; }
  setShell(id, on) {
    const b = this.byId[id];
    if (!b?.shell) return;
    b.shellOn = on;
    b.shell.visible = on;
    if (b.def.shell.kind === 'alpha') b.material.uniforms.uCloudOn.value = on ? 1 : 0;
  }

  // ── level of detail ──────────────────────────────────────────────────────

  _applyTextures(b, set) {
    const u = b.material.uniforms;
    u.uMap.value = set.map;
    if (u.uTexW) u.uTexW.value = set.map.image.width;
    if (set.night) u.uNight.value = set.night;
    if (set.spec) u.uSpec.value = set.spec;
    if (set.normal) u.uNormal.value = set.normal;
    if (set.shell) {
      b.shellMaterial.uniforms.uMap.value = set.shell;
      if (b.shellMaterial.uniforms.uTexW) b.shellMaterial.uniforms.uTexW.value = set.shell.image.width;
      if (b.def.shell.kind === 'alpha') u.uCloud.value = set.shell;
    }
  }

  _disposeSet(b, set, keep) {
    if (!set) return;
    for (const [key, tex] of Object.entries(set)) {
      if (tex !== b.base[key] && !(keep && keep[key] === tex)) TextureStore.dispose(tex);
    }
  }

  _wantedTier(b, camDist) {
    let want = '2k';
    if (b === this.target) {
      const alt = camDist / b.radius - 1;
      want = alt < 2.2 || b.tier === '8k' || b.loadingTier === '8k' ? '8k' : '4k';
    }
    let tier = this.store.pickTier(b.def.tex.map, want);
    while (b.blocked.has(tier) && tier !== '2k') tier = tier === '8k' ? '4k' : '2k';
    return this.store.pickTier(b.def.tex.map, tier);
  }

  async _loadTier(b, tier) {
    if (tier === b.def.tex.map.tiers[0]) {
      b.loadingTier = null;
      this._applyTextures(b, b.base);
      this._disposeSet(b, b.hi);
      b.hi = null; b.tier = tier;
      this.hooks.onTier?.(b);
      return;
    }
    b.loadingTier = tier;
    this.hooks.onTier?.(b);
    const loaded = {};
    try {
      await Promise.all(Object.entries(b.def.tex).map(async ([key, channel]) => {
        const t = this.store.pickTier(channel, tier);
        if (t === channel.tiers[0]) loaded[key] = b.base[key];
        else if (b.hi?.[key]?.userData.tier === t) loaded[key] = b.hi[key];
        else {
          const tex = await this.store.loadChannel(channel, t);
          tex.userData.tier = t;
          loaded[key] = tex;
        }
      }));
    } catch (err) {
      console.warn(err);
      this._disposeSet(b, loaded, b.hi);
      if (b.loadingTier === tier) b.loadingTier = null;
      b.blocked.add(tier);
      this.hooks.onTier?.(b, err);
      return;
    }
    if (b.loadingTier !== tier) { this._disposeSet(b, loaded, b.hi); return; } // superseded
    this._applyTextures(b, loaded);
    this._disposeSet(b, b.hi, loaded);
    b.hi = loaded; b.tier = tier; b.loadingTier = null;
    this.hooks.onTier?.(b);
  }

  // ── per-frame ────────────────────────────────────────────────────────────

  update(dt) {
    this._clock += dt;
    if (this.playing) {
      const next = clamp(this.simMs + dt * this.rate * this.direction * 1000, MIN_MS, MAX_MS);
      if (next === this.simMs && dt > 0) { this.playing = false; this.hooks.onClockLimit?.(); }
      this.simMs = next;
    }
    const d = this.days;

    // Scale tween.
    const sOld = this.s;
    const radiusOld = this.target.radius;
    if (this._scaleU !== this._scaleGoal) {
      const step = dt / 2.6;
      this._scaleU = this._scaleGoal > this._scaleU ? Math.min(1, this._scaleU + step) : Math.max(0, this._scaleU - step);
      this.s = this._scaleU * this._scaleU * (3 - 2 * this._scaleU);
    }
    const fill = this.shared.uFill;
    fill.value += (this._fillGoal - fill.value) * Math.min(1, dt * 6);

    this._place(d);
    if (this.s !== this._orbitScale || Math.abs(d - this._orbitEpoch) > 3650) this._rebuildOrbits(d);
    if (this.s !== sOld || Math.abs(d - this._moonOrbitDay) > 0.2) this._rebuildMoonOrbits(d);

    const cam = this.camera;
    const tp = this.target.group.position;
    if (this.fly) {
      this._stepFly(dt);
    } else {
      // Ride along with the target.
      cam.position.add(this._v1.subVectors(tp, this._lastTargetPos));
      this.controls.target.copy(tp);
      this._lastTargetPos.copy(tp);
      const off = this._v1.subVectors(cam.position, tp);
      let dist = off.length();
      if (this.s !== sOld) {
        // Keep the same framing while the model changes size underneath.
        if (this.target.id === 'sun' && dist > radiusOld * 6) {
          const au = Math.pow(dist / UNIT, 1 / (DIST_EXP + (1 - DIST_EXP) * sOld));
          dist = sceneDistance(au, this.s);
        } else {
          dist *= this.target.radius / radiusOld;
        }
      }
      const R = this.target.radius;
      const minD = R * (1 + this.target.minAlt);
      const maxD = sceneDistance(45, this.s) * 6;
      if (this._zoomHold) {
        const alt = Math.max(dist - R, R * 1e-3) * Math.exp(-this._zoomHold * dt * 1.8);
        dist = R + alt;
      }
      dist = clamp(dist, minD, maxD);
      cam.position.copy(tp).addScaledVector(off.normalize(), dist);

      // Wheel, pinch and drag all scale with altitude, so approaching the
      // surface slows down smoothly instead of slamming into the limit.
      const h = Math.max(dist - R, 1e-9);
      this.controls.zoomSpeed = clamp(Math.log((R + 0.88 * h) / (R + h)) / Math.log(0.95), 0.02, 1.6);
      this.controls.rotateSpeed = clamp((0.3 * h) / R, 0.012, 0.9);
      this.controls.minDistance = minD;
      this.controls.maxDistance = maxD;
      this.controls.update();
    }

    // View shift keeps the subject clear of the detail panel.
    if (this._shift.distanceToSquared(this._shiftGoal) > 0.01) {
      this._shift.lerp(this._shiftGoal, Math.min(1, dt * 5));
      this._applyViewShift();
    }

    // Near plane: as far out as possible without clipping the closest surface.
    const cp = cam.position;
    let nearest = Infinity;
    for (const b of this.bodies) {
      const dist = cp.distanceTo(b.group.position);
      nearest = Math.min(nearest, dist - b.radius);
      if (b.ring) {
        const local = this._v1.subVectors(cp, b.group.position).applyQuaternion(this._q1.copy(b.spin.quaternion).invert());
        b.ringMaterial.uniforms.uCamL.value.copy(local);
        const rho = Math.hypot(local.x, local.z);
        const inner = b.def.ring.inner * b.radius, outer = b.def.ring.outer * b.radius;
        const gap = rho < inner ? inner - rho : rho > outer ? rho - outer : 0;
        nearest = Math.min(nearest, Math.hypot(gap, local.y));
      }
    }
    cam.near = clamp(nearest * 0.25, 1e-7, 40);
    cam.far = FAR;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    this.shared.uSunPosV.value.copy(this.byId.sun.group.position).applyMatrix4(cam.matrixWorldInverse);
    this.byId.sun.material.uniforms.uTime.value = this._clock;
    this.sky.position.copy(cp);

    // The Sun stays a visible point of light however far away the camera is.
    const sun = this.byId.sun;
    const sunDist = cp.distanceTo(sun.group.position);
    this.corona.scale.setScalar(Math.max(sun.radius * 8.5, sunDist * 0.035));
    this.flare.scale.setScalar(Math.max(sun.radius * 3, sunDist * 0.06));
    this.flare.material.opacity = smoothstep(0.03, 0.006, sun.radius / sunDist);

    for (const belt of this.belts) {
      const u = belt.material.uniforms;
      u.uDays.value = d; u.uScale.value = this.s; u.uSize.value = 1.9 * this.pixelRatio;
      belt.visible = this.options.belts;
    }

    const halfH = this.height / 2;
    const focal = halfH / Math.tan((cam.fov * A.DEG) / 2);
    for (const b of this.bodies) {
      const dist = cp.distanceTo(b.group.position);
      if (b.orbit) {
        const o = this.options.orbits ? 0.55 * smoothstep(5, 30, dist / b.radius) : 0;
        b.orbit.material.opacity = o;
        b.orbit.visible = o > 0.01;
      }
      const hi = b === this.target;
      if (b.mesh.geometry !== (hi ? this.sphereHi : this.sphereLo)) {
        b.mesh.geometry = hi ? this.sphereHi : this.sphereLo;
        if (b.shell) b.shell.geometry = b.mesh.geometry;
        if (b.atmosphere) b.atmosphere.geometry = b.mesh.geometry;
      }
      if (b.def.tex.map.tiers.length > 1) {
        const want = this._wantedTier(b, dist);
        if (want !== b.tier && want !== b.loadingTier) this._loadTier(b, want);
        else if (want === b.tier && b.loadingTier) { b.loadingTier = null; this.hooks.onTier?.(b); }
      }
      // Screen-space footprint, for labels and picking.
      const v = this._v1.copy(b.group.position).applyMatrix4(cam.matrixWorldInverse);
      const sc = b.screen;
      sc.depth = -v.z;
      sc.visible = v.z < 0;
      if (sc.visible) {
        v.applyMatrix4(cam.projectionMatrix);
        sc.x = (v.x * 0.5 + 0.5) * this.width;
        sc.y = (-v.y * 0.5 + 0.5) * this.height;
        sc.r = (b.radius / sc.depth) * focal;
      }
    }

    this.renderer.render(this.scene, cam);
  }

  /** Topmost body under a screen point (CSS pixels), or null. */
  pick(x, y, slop = 16) {
    let best = null;
    for (const b of this.bodies) {
      const sc = b.screen;
      if (!sc.visible) continue;
      if (Math.hypot(sc.x - x, sc.y - y) <= Math.max(sc.r, slop) && (!best || sc.depth < best.screen.depth)) best = b;
    }
    return best;
  }
}
