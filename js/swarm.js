// The several hundred small moons that have no surface map: one instanced
// mesh, one layer of marker dots and one set of orbit lines per planet.
// Each moon also gets a light "body" object (position, radius, screen
// footprint) so the camera, labels and picking can treat it like any other.
import * as THREE from '../vendor/three/three.module.min.js';
import * as A from './astro.js';
import { orbitClass } from './catalog.js';
import { sceneRadius, satelliteSceneDistance } from './scale.js';
import * as SH from './shaders.js';

const ORBIT_SEG = 96;
const MIN_PX = 1.4; // below this a moon is drawn as a dot, not a mesh

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export class MoonSwarm {
  constructor(world, defs) {
    this.world = world;
    this.systems = [];
    this.bodies = [];
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const uniforms = { uSunPosV: world.shared.uSunPosV, uFill: world.shared.uFill };
    this.material = new THREE.ShaderMaterial({ vertexShader: SH.SWARM_VERT, fragmentShader: SH.SWARM_FRAG, uniforms });
    this.smoothMaterial = new THREE.ShaderMaterial({
      vertexShader: SH.SWARM_VERT, fragmentShader: SH.SWARM_FRAG, uniforms, defines: { SMOOTH: 1 },
    });
    const byParent = {};
    for (const def of defs) if (def.data.el) (byParent[def.parent] ||= []).push(def);

    for (const [parentId, list] of Object.entries(byParent)) {
      const planet = world.byId[parentId];
      const n = list.length;
      const sys = { planet, list, n, bodies: [], orbitDay: Infinity, orbitScale: -1, vis: 0 };

      const g = geometry.clone();
      const seed = new Float32Array(n), lump = new Float32Array(n), albedo = new Float32Array(n);
      list.forEach((def, i) => {
        const m = def.data;
        const cls = orbitClass(m);
        seed[i] = hash(def.id);
        // Bodies under ~200 km are rarely round.
        lump[i] = m.ax ? 0.12 : def.radiusKm < 60 ? 0.42 : def.radiusKm < 200 ? 0.22 : 0.06;
        // Linear reflectance from the geometric albedo; unknown ones take the
        // typical value for their kind (irregulars are charcoal-dark).
        const alb = m.alb ?? (cls.irregular ? 0.05 : 0.3);
        albedo[i] = Math.min(0.95, 0.03 + 1.1 * Math.pow(alb, 1.1));
        const body = {
          id: def.id, def, minor: true, sys, index: i, parent: planet,
          group: new THREE.Object3D(), offset: new THREE.Vector3(), km: [0, 0, 0], au: [0, 0, 0],
          radius: 0.01, minAlt: 0.6, screen: { x: 0, y: 0, r: 0, depth: 0, visible: false },
          spin: (seed[i] - 0.5) * 2 * (360 / (0.25 + seed[i] * 1.5)), // deg/day, arbitrary but steady
          hidden: false, cls,
        };
        sys.bodies.push(body);
        this.bodies.push(body);
      });
      // Instances are packed each frame so only moons big enough to see are
      // drawn; these attributes are refilled in that packed order.
      for (const name of ['aSeed', 'aLump', 'aAlbedo']) {
        g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      }
      sys.mesh = new THREE.InstancedMesh(g, this.material, n);
      sys.mesh.count = 0;
      sys.mesh.frustumCulled = false;
      sys.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      // The camera's target is drawn by a single-instance copy placed exactly,
      // which keeps a few-kilometre moon steady even in true-scale mode.
      sys.seed = seed; sys.lump = lump; sys.albedo = albedo;

      const dotGeom = new THREE.BufferGeometry();
      dotGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const colors = new Float32Array(n * 3);
      const c = new THREE.Color();
      list.forEach((def, i) => { c.set(def.color); colors.set([c.r, c.g, c.b], i * 3); });
      dotGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      dotGeom.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      sys.dots = new THREE.Points(dotGeom, new THREE.ShaderMaterial({
        vertexShader: SH.DOT_VERT, fragmentShader: SH.DOT_FRAG, transparent: true, depthWrite: false,
        uniforms: { uSize: { value: 3 }, uOpacity: { value: 0 } },
      }));
      sys.dots.frustumCulled = false;
      sys.dots.renderOrder = 6;

      // Orbit lines in two sets: inner moons, and the distant irregular swarm,
      // which only reads as a pattern once the camera has pulled back far
      // enough to see it whole.
      sys.groups = [false, true].map((irregular) => {
        const members = sys.bodies.filter((b) => b.cls.irregular === irregular);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, members.length) * ORBIT_SEG * 6), 3));
        const cols = new Float32Array(Math.max(1, members.length) * ORBIT_SEG * 6);
        members.forEach((b, i) => {
          c.set(b.def.color);
          for (let k = 0; k < ORBIT_SEG * 2; k++) cols.set([c.r, c.g, c.b], (i * ORBIT_SEG * 2 + k) * 3);
        });
        geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
        }));
        lines.frustumCulled = false;
        if (!members.length) geom.setDrawRange(0, 0);
        planet.group.add(lines);
        const sizes = members.map((b) => b.def.data.el.a).sort((p, q) => p - q);
        return { irregular, members, lines, typicalKm: sizes[Math.floor(sizes.length * 0.3)] || 0 };
      });

      planet.group.add(sys.mesh, sys.dots);
      this.systems.push(sys);
    }

    // Focus copy and highlighted orbit for the selected small moon.
    const pg = new THREE.IcosahedronGeometry(1, 6);
    for (const name of ['aSeed', 'aLump', 'aAlbedo']) pg.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
    this.proxy = new THREE.InstancedMesh(pg, this.smoothMaterial, 1);
    this.proxy.frustumCulled = false;
    this.proxy.visible = false;
    world.scene.add(this.proxy);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ORBIT_SEG + 1) * 3), 3));
    this.focusOrbit = new THREE.Line(fg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.focusOrbit.frustumCulled = false;
    this.focusOrbit.visible = false;
    world.scene.add(this.focusOrbit);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._orbit = new Float64Array(ORBIT_SEG * 3);
    this._proxyFor = null;
  }

  /** Position every small moon (scene and heliocentric) for day d at scale s. */
  place(d, s) {
    for (const sys of this.systems) {
      const parentKm = sys.planet.def.radiusKm;
      for (const b of sys.bodies) {
        const m = b.def.data;
        A.satellitePosition(m.el, b.def.parent, d, b.km);
        const km = Math.hypot(b.km[0], b.km[1], b.km[2]);
        const k = satelliteSceneDistance(km, parentKm, s) / km;
        b.offset.set(b.km[0] * k, b.km[1] * k, b.km[2] * k);
        b.group.position.copy(sys.planet.group.position).add(b.offset);
        // Heliocentric position in ecliptic axes (scene X, Y, Z = ecliptic x, z, −y).
        b.au[0] = sys.planet.au[0] + b.km[0] / A.AU_KM;
        b.au[1] = sys.planet.au[1] - b.km[2] / A.AU_KM;
        b.au[2] = sys.planet.au[2] + b.km[1] / A.AU_KM;
        b.radius = sceneRadius(b.def.radiusKm, s) * (m.ax ? Math.max(...m.ax) / b.def.radiusKm : 1);
      }
    }
  }

  _rebuildOrbits(sys, d, s) {
    for (const group of sys.groups) this._rebuildGroup(sys, group, d, s);
    sys.orbitDay = d;
    sys.orbitScale = s;
  }

  _rebuildGroup(sys, group, d, s) {
    const parentKm = sys.planet.def.radiusKm;
    const pos = group.lines.geometry.attributes.position;
    const arr = pos.array;
    let o = 0;
    for (const b of group.members) {
      if (b.hidden) { arr.fill(0, o, o + ORBIT_SEG * 6); o += ORBIT_SEG * 6; continue; }
      A.satelliteOrbit(b.def.data.el, b.def.parent, d, ORBIT_SEG, this._orbit);
      const pts = this._orbit;
      for (let k = 0; k < ORBIT_SEG; k++) {
        for (const kk of [k, (k + 1) % ORBIT_SEG]) {
          const x = pts[kk * 3], y = pts[kk * 3 + 1], z = pts[kk * 3 + 2];
          const r = Math.hypot(x, y, z);
          const f = satelliteSceneDistance(r, parentKm, s) / r;
          arr[o++] = x * f; arr[o++] = y * f; arr[o++] = z * f;
        }
      }
    }
    pos.needsUpdate = true;
  }

  /**
   * Per-frame drawing state. `visFor(sys)` gives each system's visibility
   * (0–1); `hidden(body)` hides moons not yet discovered at the shown date.
   */
  update(d, s, camera, focal, target, options, visFor, hidden) {
    const cp = camera.position;
    const m4 = this._m;
    for (const sys of this.systems) {
      const vis = visFor(sys);
      sys.vis = vis;
      const on = vis > 0.01;
      sys.mesh.visible = on;
      sys.dots.visible = on;
      for (const g of sys.groups) g.lines.visible = on && options.orbits && g.members.length > 0;
      if (!on) { for (const b of sys.bodies) b.screen.visible = false; continue; }

      // Which moons count as discovered can change with the date or the option.
      let hiddenCount = 0;
      for (const b of sys.bodies) { b.hidden = hidden(b); if (b.hidden) hiddenCount++; }
      const stale = hiddenCount !== sys.hiddenCount;
      sys.hiddenCount = hiddenCount;
      if (options.orbits && (stale || s !== sys.orbitScale || Math.abs(d - sys.orbitDay) > 2)) this._rebuildOrbits(sys, d, s);
      const camDist = cp.distanceTo(sys.planet.group.position);
      for (const g of sys.groups) {
        let o = 0.26 * vis;
        if (g.irregular) {
          const r = satelliteSceneDistance(g.typicalKm, sys.planet.def.radiusKm, s);
          const t = Math.min(1, Math.max(0, (camDist - r * 0.9) / (r * 0.7)));
          o = 0.14 * vis * t * t * (3 - 2 * t);
        }
        g.lines.material.opacity = o;
        g.lines.visible = g.lines.visible && o > 0.005;
      }
      sys.dots.material.uniforms.uOpacity.value = vis;
      sys.dots.material.uniforms.uSize.value = 3.2 * this.world.pixelRatio;

      const dotPos = sys.dots.geometry.attributes.position;
      const dotAlpha = sys.dots.geometry.attributes.alpha;
      const ga = sys.mesh.geometry.attributes;
      let k = 0;
      for (const b of sys.bodies) {
        const i = b.index;
        const dist = cp.distanceTo(b.group.position);
        const px = (b.radius / dist) * focal;
        dotPos.setXYZ(i, b.offset.x, b.offset.y, b.offset.z);
        dotAlpha.setX(i, b.hidden || b === target ? 0 : 1 - Math.min(1, Math.max(0, (px - MIN_PX * 0.6) / MIN_PX)));
        if (!b.hidden && px >= MIN_PX && b !== target) {
          this._orient(b, d, m4);
          m4.setPosition(b.offset);
          sys.mesh.setMatrixAt(k, m4);
          ga.aSeed.array[k] = sys.seed[i];
          ga.aLump.array[k] = sys.lump[i];
          ga.aAlbedo.array[k] = sys.albedo[i];
          k++;
        }
      }
      if (k || sys.mesh.count) {
        sys.mesh.instanceMatrix.needsUpdate = true;
        ga.aSeed.needsUpdate = ga.aLump.needsUpdate = ga.aAlbedo.needsUpdate = true;
      }
      sys.mesh.count = k;
      dotPos.needsUpdate = true;
      dotAlpha.needsUpdate = true;
    }

    // The selected small moon: exact placement and a bright orbit.
    const t = target?.minor ? target : null;
    this.proxy.visible = !!t;
    this.focusOrbit.visible = !!t && options.orbits;
    if (t) {
      if (this._proxyFor !== t) {
        const g = this.proxy.geometry;
        g.attributes.aSeed.setX(0, t.sys.seed[t.index]); g.attributes.aSeed.needsUpdate = true;
        g.attributes.aLump.setX(0, t.sys.lump[t.index]); g.attributes.aLump.needsUpdate = true;
        g.attributes.aAlbedo.setX(0, t.sys.albedo[t.index]); g.attributes.aAlbedo.needsUpdate = true;
        this._proxyFor = t;
      }
      this.proxy.position.copy(t.group.position);
      this._orient(t, d, m4);
      this.proxy.setMatrixAt(0, m4);
      this.proxy.instanceMatrix.needsUpdate = true;
      if (this.focusOrbit.visible) {
        const parentKm = t.parent.def.radiusKm;
        A.satelliteOrbit(t.def.data.el, t.def.parent, d, ORBIT_SEG, this._orbit);
        const pos = this.focusOrbit.geometry.attributes.position;
        for (let k = 0; k <= ORBIT_SEG; k++) {
          const kk = k % ORBIT_SEG;
          const x = this._orbit[kk * 3], y = this._orbit[kk * 3 + 1], z = this._orbit[kk * 3 + 2];
          const r = Math.hypot(x, y, z);
          const f = satelliteSceneDistance(r, parentKm, s) / r;
          pos.setXYZ(k, x * f, y * f, z * f);
        }
        pos.needsUpdate = true;
        this.focusOrbit.position.copy(t.parent.group.position);
        this.focusOrbit.material.color.set(t.def.color);
        this.focusOrbit.material.opacity = 0.75;
      }
    }
  }

  /** Rotation and scale of one small moon into m4 (no translation). */
  _orient(b, d, m4) {
    const x = this._x, y = this._y, z = this._z;
    // Inner moons keep their long axis toward the planet; distant ones tumble slowly.
    y.fromArray(A.satellitePole(b.def.data.el, b.def.parent));
    if (b.cls.retrograde) y.negate();
    if (!b.cls.irregular) {
      x.copy(b.offset).negate();
      x.addScaledVector(y, -x.dot(y)).normalize();
    } else {
      x.set(1, 0, 0).addScaledVector(y, -y.x).normalize();
      x.applyAxisAngle(y, ((b.spin * d) % 360) * A.DEG);
    }
    z.crossVectors(x, y);
    m4.makeBasis(x, y, z);
    const ax = b.def.data.ax;
    const base = sceneRadius(b.def.radiusKm, this.world.s);
    if (ax) {
      const k = base / b.def.radiusKm;
      this._scale.set(ax[0] * k, ax[2] * k, ax[1] * k);
    } else {
      this._scale.setScalar(base);
    }
    m4.scale(this._scale);
    return m4;
  }

  /** Screen footprints for moons of systems that are showing. */
  project(camera, width, height, focal) {
    const v = this._v;
    for (const sys of this.systems) {
      if (sys.vis <= 0.01) continue;
      for (const b of sys.bodies) {
        const sc = b.screen;
        v.copy(b.group.position).applyMatrix4(camera.matrixWorldInverse);
        sc.depth = -v.z;
        sc.visible = v.z < 0 && !b.hidden;
        if (!sc.visible) continue;
        v.applyMatrix4(camera.projectionMatrix);
        sc.x = (v.x * 0.5 + 0.5) * width;
        sc.y = (-v.y * 0.5 + 0.5) * height;
        sc.r = (b.radius / sc.depth) * focal;
      }
    }
  }

  /** Nearest surface distance from the camera, for the near clip plane. */
  nearest(cp, target) {
    if (!target?.minor) return Infinity;
    return cp.distanceTo(target.group.position) - target.radius * 1.4;
  }
}
