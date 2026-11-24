// DOM side of the app: body list, detail panel, time controls, labels.
import * as A from './astro.js';
import { BODIES, SPEEDS, SPEED_OVERVIEW, SPEED_FOCUS } from './data.js';
import {
  DEFS, SYSTEM_MOONS, MOON_COUNTS, moonFacts, moonDescription, orbitClass, periodText,
} from './catalog.js';
import { PLACES, PLACE_KIND_TEXT, coordText } from './places.js';

const BODY_BY_ID = DEFS;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const num = (x, digits = 0) => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const LABEL_PRIORITY = ['sun', 'jupiter', 'saturn', 'earth', 'mars', 'venus', 'mercury', 'uranus', 'neptune', 'pluto', 'moon'];
const MAX_MOON_LABELS = 36;
const MOON_LIST_PREVIEW = 12;
const TIER_LABEL = { '1k': '1K', '2k': '2K', '4k': '4K', '8k': '8K' };

function lightTime(km) {
  const s = Math.round(km / A.LIGHT_KM_S);
  if (s < 60) return `${s} วินาที`;
  if (s < 3600) return `${Math.floor(s / 60)} นาที ${s % 60} วินาที`;
  return `${Math.floor(s / 3600)} ชม. ${Math.round((s % 3600) / 60)} นาที`;
}

function distanceText(au) {
  const km = au * A.AU_KM;
  if (km < 5e6) return `${num(km)} กม.`;
  return `${num(km / 1e6, km < 1e9 ? 1 : 0)} ล้าน กม.`;
}

export class UI {
  constructor(world) {
    this.world = world;
    this.selected = null;
    this.mode = 'overview';
    this.speedIndex = SPEED_OVERVIEW;
    this.savedSpeed = { overview: SPEED_OVERVIEW, focus: SPEED_FOCUS };
    this.showLabels = true;
    this.sheetOpen = false;
    this.toldAboutSpeed = false;
    this._liveAt = 0;
    this._clockText = '';
    this.desktop = matchMedia('(min-width: 900px)');

    this.app = $('app');
    this.canvas = $('scene');
    this.info = $('info');
    this._buildBodyList();
    this._buildLabels();
    this._bindTime();
    this._bindPanel();
    this._bindSettings();
    this._bindCanvas();
    this._bindKeys();
    this.setSpeed(this.speedIndex);

    const onResize = () => { this._resize(); this.updateViewShift(); };
    new ResizeObserver(onResize).observe(this.app);
    this.desktop.addEventListener('change', onResize);
    onResize();
  }

  // ── boot ─────────────────────────────────────────────────────────────────

  setProgress(p) {
    $('loading-bar').style.transform = `scaleX(${p})`;
    $('loading-pct').textContent = `${Math.round(p * 100)}%`;
  }

  ready() {
    const loading = $('loading');
    loading.classList.add('done');
    setTimeout(() => { loading.hidden = true; }, 700);
    this.updateViewShift();
    let seen = false;
    try { seen = localStorage.getItem('solar.helpSeen') === '1'; } catch { /* storage may be unavailable */ }
    if (!seen) {
      this.toast('ลากเพื่อหมุน เลื่อนล้อเมาส์หรือถ่างนิ้วเพื่อซูม แตะดาวเพื่อดูรายละเอียด', 6500);
      try { localStorage.setItem('solar.helpSeen', '1'); } catch { /* ignore */ }
    }
    // A link such as …/#saturn opens straight on that body.
    const fromHash = () => {
      const id = location.hash.slice(1);
      if (BODY_BY_ID[id]) { if (id !== this.selected) this.select(id); } else if (this.selected && !location.hash) this.goOverview();
    };
    window.addEventListener('hashchange', fromHash);
    if (BODY_BY_ID[location.hash.slice(1)]) fromHash();
  }

  _setHash(id) {
    if (location.hash.slice(1) === (id || '')) return;
    try {
      history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
    } catch { /* some embedded viewers do not allow rewriting the address */ }
  }

  toast(text, ms = 3200) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 300);
    }, ms);
  }

  _resize() {
    this.world.resize(this.app.clientWidth, this.app.clientHeight);
  }

  // ── body list and labels ─────────────────────────────────────────────────

  _buildBodyList() {
    const nav = $('bodies');
    this.listButtons = {};
    for (const def of BODIES) {
      const b = el('button', 'body-btn');
      b.type = 'button';
      b.dataset.id = def.id;
      if (def.parent) b.classList.add('is-moon');
      // Moons other than ours are listed under their planet while it is open.
      if (def.parent && def.id !== 'moon') b.hidden = true;
      const img = el('img');
      img.src = `textures/icons/${def.id}.png`;
      img.alt = '';
      img.width = 28; img.height = 28;
      img.decoding = 'async';
      b.append(img, el('span', null, def.name));
      b.addEventListener('click', () => this.select(def.id));
      nav.append(b);
      this.listButtons[def.id] = b;
    }
  }

  /** Show the moons of the open system in the body list. */
  _updateNav() {
    const def = BODY_BY_ID[this.selected];
    const system = def ? (def.parent || def.id) : null;
    for (const [id, btn] of Object.entries(this.listButtons)) {
      const d = BODY_BY_ID[id];
      if (d.parent && id !== 'moon') btn.hidden = d.parent !== system;
      if (id === this.selected) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current');
    }
  }

  _buildLabels() {
    this.labelBox = $('labels');
    this.labels = {};
    this._shown = [];
    document.fonts?.ready.then(() => { for (const L of Object.values(this.labels)) L.measured = false; });
  }

  // Labels never take pointer input themselves, so a drag or pinch that starts
  // on one still moves the camera; taps on them are resolved by the canvas.
  _label(def) {
    let L = this.labels[def.id];
    if (L) return L;
    const node = el('div', 'label');
    node.style.setProperty('--c', def.color);
    if (def.minor) node.classList.add('minor');
    node.append(el('i'), el('span', null, def.name));
    this.labelBox.append(node);
    L = this.labels[def.id] = { node, shown: false, dot: false, measured: false, width: def.name.length * 8.5 + 22 };
    return L;
  }

  _labelOffset(sc) { return Math.max(sc.r, 3) + 7; }

  /** Width of a tag's text. A hidden tag has no layout, so show it first; the
   *  end-of-frame pass hides it again if it is not placed. */
  _measure(L) {
    if (L.measured) return;
    if (!L.shown) { L.node.classList.add('show'); L.shown = true; }
    const width = L.node.lastChild.offsetWidth;
    if (width > 0) { L.width = width; L.measured = true; }
  }

  /** Body whose visible name tag covers a screen point, if any. */
  _labelAt(x, y) {
    for (const b of this._shown) {
      const L = this.labels[b.id], sc = b.screen;
      const left = sc.x + this._labelOffset(sc);
      if (x >= left - 4 && x <= left + L.width && Math.abs(y - sc.y) <= 13) return b;
    }
    return null;
  }

  _hitAt(x, y, slop) {
    return this.world.pick(x, y, slop) || this._labelAt(x, y);
  }

  _updateLabels() {
    const w = this.world;
    const placed = [];
    const earth = w.byId.earth.screen;
    // Planets first in a fixed order, then the selection, then moons by size.
    const rank = (b) => {
      const i = LABEL_PRIORITY.indexOf(b.id);
      if (i >= 0) return i;
      if (b.id === this.selected) return -1;
      return 100 - Math.log10(b.def.radiusKm + 1);
    };
    const candidates = this.showLabels ? w.labelBodies().sort((a, b) => rank(a) - rank(b)) : [];
    const next = [];
    let moonLabels = 0;
    // Fewer moon tags on small screens: roughly one per 40,000 px².
    const maxMoonLabels = Math.max(6, Math.min(MAX_MOON_LABELS, Math.round((w.width * w.height) / 40000)));
    for (const b of candidates) {
      const sc = b.screen;
      let show = sc.visible && sc.x > -40 && sc.x < w.width + 40 && sc.y > -20 && sc.y < w.height + 20;
      // A body that already fills the view needs no tag.
      if (show && sc.r > (b.id === this.selected ? 24 : Math.min(w.width, w.height) * 0.16)) show = false;
      if (show && b.id === 'moon' && Math.hypot(sc.x - earth.x, sc.y - earth.y) < 26) show = false;
      const isMoon = !!b.parent && b.id !== 'moon';
      if (show && isMoon && b.id !== this.selected && moonLabels >= maxMoonLabels) show = false;
      if (show) {
        // Hidden behind a nearer body's disc.
        for (const o of w.bodies) {
          const os = o.screen;
          if (o !== b && os.visible && os.depth < sc.depth && Math.hypot(sc.x - os.x, sc.y - os.y) < os.r) { show = false; break; }
        }
      }
      const L = show ? this._label(b.def) : this.labels[b.id];
      if (!L) continue;
      if (show) this._measure(L);
      const off = this._labelOffset(sc);
      const rect = show ? [sc.x - 6, sc.y - 11, sc.x + off + L.width, sc.y + 11] : null;
      if (show && b.id !== this.selected) {
        for (const p of placed) {
          if (rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]) { show = false; break; }
        }
      }
      if (!show) continue;
      placed.push(rect);
      next.push(b);
      if (isMoon) moonLabels++;
      const dot = sc.r < 4 && !b.minor;
      if (dot !== L.dot) { L.node.classList.toggle('dot', dot); L.dot = dot; }
      L.node.style.transform = `translate(${sc.x.toFixed(1)}px, ${sc.y.toFixed(1)}px)`;
      L.node.style.setProperty('--off', `${off.toFixed(1)}px`);
    }
    const now = new Set(next.map((b) => b.id));
    for (const [id, L] of Object.entries(this.labels)) {
      const show = now.has(id);
      if (show !== L.shown) { L.node.classList.toggle('show', show); L.shown = show; }
    }
    this._shown = next;
  }

  // ── selection ────────────────────────────────────────────────────────────

  select(id) {
    const def = BODY_BY_ID[id];
    if (!def) return;
    const changed = this.selected !== id;
    this.selected = id;
    this._updateNav();
    const btn = this.listButtons[id] || this.listButtons[def.parent];
    btn?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (changed) this._fillPanel(def);
    this.info.hidden = false;
    this.app.classList.add('has-info');
    requestAnimationFrame(() => this.info.classList.add('open'));
    this._enterMode('focus');
    this.world.focus(id);
    this.updateViewShift();
    this._liveAt = 0;
    this._setHash(id);
  }

  closePanel() {
    this.selected = null;
    this.info.classList.remove('open', 'expanded');
    this.app.classList.remove('has-info');
    this.sheetOpen = false;
    this._updateNav();
    setTimeout(() => { if (!this.selected) this.info.hidden = true; }, 280);
    this.updateViewShift();
    this._setHash(null);
  }

  goOverview() {
    this.closePanel();
    this._enterMode('overview');
    this.world.overview();
  }

  _enterMode(mode) {
    if (mode === this.mode) return;
    this.savedSpeed[this.mode] = this.speedIndex;
    this.mode = mode;
    this.setSpeed(this.savedSpeed[mode]);
    if (mode === 'focus' && !this.toldAboutSpeed) {
      this.toldAboutSpeed = true;
      this.toast(`ชะลอเวลาเป็น ${SPEEDS[this.speedIndex].label} เพื่อดูดาวหมุนรอบตัวเอง ปรับได้ที่แถบเวลา`, 5200);
    }
  }

  updateViewShift() {
    const apply = () => {
      const W = this.app.clientWidth, H = this.app.clientHeight;
      const origin = this.app.getBoundingClientRect();
      const top = $('topbar').getBoundingClientRect().bottom - origin.top;
      const bottom = H - ($('timebar').getBoundingClientRect().top - origin.top);
      let l = 0, r = 0, t = top, b = bottom;
      const list = $('bodies').getBoundingClientRect();
      const open = !!this.selected;
      if (this.desktop.matches) {
        l = list.right - origin.left;
        if (open) r = this.info.offsetWidth + 16;
      } else {
        t = list.bottom - origin.top;
        if (open) b = bottom + this.info.offsetHeight;
      }
      b = Math.min(b, H * 0.7);
      this._free = { left: l, top: t, right: W - r, bottom: H - b };
      this.world.setViewShift((r - l) / 2, (b - t) / 2, W - l - r, H - t - b);
    };
    apply();
    clearTimeout(this._shiftTimer);
    this._shiftTimer = setTimeout(apply, 340);
  }

  // ── detail panel ─────────────────────────────────────────────────────────

  _bindPanel() {
    $('info-close').addEventListener('click', () => this.closePanel());
    $('btn-surface').addEventListener('click', () => {
      if (!this.selected) return;
      this.world.surface(this.selected);
      if (!this.desktop.matches) this._setSheet(false);
    });
    $('btn-whole').addEventListener('click', () => {
      if (!this.selected) return;
      this.world.focus(this.selected);
      this.place = null;
      $('place-card').hidden = true;
      for (const btn of document.querySelectorAll('.place-row')) btn.removeAttribute('aria-current');
    });
    $('shell-input').addEventListener('change', (e) => this.selected && this.world.setShell(this.selected, e.target.checked));
    $('info-grip').addEventListener('click', () => this._setSheet(!this.sheetOpen));
    $('info-head').addEventListener('click', (e) => {
      if (!this.desktop.matches && !e.target.closest('button')) this._setSheet(!this.sheetOpen);
    });
    $('btn-overview').addEventListener('click', () => this.goOverview());
    $('moons-sort').addEventListener('change', () => this._renderMoonList());
    $('places-input').addEventListener('change', (e) => { this.world.options.placeMap = e.target.checked; });
    $('moons-more').addEventListener('click', () => {
      this._moonsAll = !this._moonsAll;
      this._renderMoonList();
    });

    for (const [id, dir] of [['zoom-in', 1], ['zoom-out', -1]]) {
      const btn = $(id);
      const stop = () => this.world.holdZoom(0);
      btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); this.world.holdZoom(dir); });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { this.world.holdZoom(dir); setTimeout(stop, 260); }
      });
    }
  }

  _setSheet(open) {
    this.sheetOpen = open;
    this.info.classList.toggle('expanded', open);
    $('info-grip').setAttribute('aria-expanded', String(open));
    this.updateViewShift();
  }

  _fillPanel(def) {
    const isMoon = def.kind === 'moon';
    const parent = isMoon ? BODY_BY_ID[def.parent] : null;
    $('info-icon').src = `textures/icons/${def.minor ? 'small-moon' : def.id}.png`;
    const type = $('info-type');
    type.replaceChildren();
    if (isMoon) {
      // Moons link back to their planet.
      const crumb = el('button', 'crumb', `ดวงจันทร์ของ${parent.name}`);
      crumb.type = 'button';
      crumb.addEventListener('click', () => this.select(parent.id));
      type.append(crumb);
    } else {
      type.textContent = def.type;
    }
    $('info-name').textContent = def.name;
    $('info-en').textContent = def.en;
    $('info-desc').textContent = def.desc || moonDescription(def);
    this.info.style.setProperty('--c', def.color);
    $('info-body').scrollTop = 0;

    const isSun = def.kind === 'star';
    $('btn-surface').textContent = isSun ? 'เข้าใกล้ผิวดวงอาทิตย์'
      : GIANT_IDS.has(def.id) ? 'ลงไปดูยอดเมฆ' : def.minor ? 'เข้าไปใกล้' : 'ลงไปดูพื้นผิว';

    const shell = $('shell-toggle');
    shell.hidden = !def.shell;
    if (def.shell) {
      $('shell-label').textContent = def.shell.label;
      $('shell-input').checked = this.world.byId[def.id].shellOn;
    }

    const facts = $('info-facts');
    facts.replaceChildren();
    for (const [label, value, note] of def.facts || moonFacts(def)) {
      const row = el('div', 'fact');
      const dd = el('dd', null, value);
      if (note) dd.append(el('small', null, note));
      row.append(el('dt', null, label), dd);
      facts.append(row);
    }

    const trivia = def.trivia || [];
    $('trivia-section').hidden = !trivia.length;
    $('info-trivia').replaceChildren(...trivia.map((t) => el('li', null, t)));

    this._fillCompare(def);
    this._fillMoons(def);
    this._fillPlaces(def);
    this.updateSurfaceStatus(this.world.byId[def.id]);
  }

  // Two discs drawn to the same scale: planets against Earth, moons against
  // our Moon. The Sun is far too large to fit, so only an arc of its limb is
  // shown next to a true-scale Earth.
  _fillCompare(def) {
    const box = $('info-compare');
    const section = $('compare-section');
    const ref = def.kind === 'moon' && def.id !== 'moon' ? BODY_BY_ID.moon : BODY_BY_ID.earth;
    const known = !def.minor || def.sizeKnown;
    const ratio = def.radiusKm / ref.radiusKm;
    section.hidden = def.id === ref.id || def.id === 'earth' || !known || ratio < 0.015;
    if (section.hidden) return;
    $('compare-title').textContent = `ขนาดเทียบกับ${ref.name}`;
    const H = 96, W = 300;
    let dBody, dRef;
    if (ratio > 12) { dRef = 4; dBody = dRef * ratio; }
    else if (ratio >= 1) { dBody = 72; dRef = 72 / ratio; }
    else { dRef = 72; dBody = Math.max(72 * ratio, 1.5); }
    const cy = 40;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${def.name}มีเส้นผ่านศูนย์กลาง ${ratio >= 1 ? num(ratio, 1) : num(ratio, 2)} เท่าของ${ref.name}`);
    const circle = (cx, d, fill) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', d / 2); c.setAttribute('fill', fill);
      svg.append(c);
    };
    const text = (x, str, anchor = 'middle') => {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x); t.setAttribute('y', H - 6); t.setAttribute('text-anchor', anchor);
      t.textContent = str;
      svg.append(t);
    };
    if (ratio > 12) {
      circle(150 - dBody / 2, dBody, def.color);   // limb reaches x = 150
      circle(200, dRef, ref.color);
      text(12, `${def.name} (เห็นเพียงส่วนโค้ง)`, 'start');
      text(200, ref.name);
    } else {
      const gap = 36, total = dBody + dRef + gap, x0 = (W - total) / 2;
      circle(x0 + dBody / 2, dBody, def.color);
      circle(x0 + dBody + gap + dRef / 2, dRef, ref.color);
      text(x0 + dBody / 2, def.name);
      text(x0 + dBody + gap + dRef / 2, ref.name);
    }
    box.replaceChildren(svg);
  }

  // ── places on a planet's surface ──────────────────────────────────────────

  _fillPlaces(def) {
    const places = PLACES[def.id];
    $('places-section').hidden = !places;
    this.place = null;
    $('place-card').hidden = true;
    if (!places) return;
    $('places-title').textContent = `แผนที่${def.name}`;
    $('places-input').checked = this.world.options.placeMap;
    const row = (p) => {
      const li = el('li');
      const btn = el('button', `place-row ${p.kind === 'site' ? 'is-site' : ''}`);
      btn.type = 'button';
      btn.append(el('i'), el('span', 'place-row-name', p.name),
        el('span', 'place-row-meta', p.kind === 'site' ? p.date.replace(/^.* (\d{4})$/, '$1') : PLACE_KIND_TEXT[p.kind]));
      btn.addEventListener('click', () => this.showPlace(p));
      li.append(btn);
      return li;
    };
    const year = (p) => +p.date.match(/\d{4}/)[0];
    $('places-sites').replaceChildren(...places.filter((p) => p.kind === 'site').sort((a, b) => year(a) - year(b)).map(row));
    $('places-features').replaceChildren(...places.filter((p) => p.kind !== 'site').map(row));
  }

  /** Fly to a place on the selected planet and describe it. */
  showPlace(p) {
    const id = this.selected;
    if (!PLACES[id]?.includes(p)) return;
    this.place = p;
    if (!this.world.options.placeMap) { this.world.options.placeMap = true; $('places-input').checked = true; }
    const card = $('place-card');
    $('place-kind').textContent = p.kind === 'site' ? `จุดลงจอด · ${p.agency} · ${p.date}` : PLACE_KIND_TEXT[p.kind];
    $('place-name').textContent = p.name;
    $('place-en').textContent = p.en;
    $('place-coord').textContent = coordText(p.lat, p.lon);
    $('place-desc').textContent = p.desc;
    card.hidden = false;
    for (const btn of document.querySelectorAll('.place-row')) btn.removeAttribute('aria-current');
    [...document.querySelectorAll('.place-row')].find((b) => b.querySelector('.place-row-name').textContent === p.name)
      ?.setAttribute('aria-current', 'true');
    this.world.viewPlace(id, p);
    if (!this.desktop.matches) this._setSheet(false);
    // A place on the night side would be dark: light it.
    if (this.world.sunElevation(id, p) < 4 && !$('opt-fill').checked) {
      $('opt-fill').checked = true;
      this.world.setFill(true);
      this.toast(`ขณะนี้เป็นเวลากลางคืนที่${p.name} จึงเปิดการส่องสว่างด้านมืดให้ ปิดได้ในเมนูการแสดงผล`, 5200);
    }
  }

  /** Name tags pinned to the surface of the selected planet. */
  _updatePlaceLabels() {
    const w = this.world;
    const b = w.byId[this.selected];
    const places = b && PLACES[b.id];
    const on = places && w.options.placeMap && w.target === b && b.screen.visible;
    const shown = new Set();
    if (on) {
      const cam = w.camera.position;
      const v = this._pv ||= new w.camera.position.constructor();
      const n = this._pn ||= new w.camera.position.constructor();
      const discPx = b.screen.r;
      const placed = [];
      // The chosen place first, then landing sites, then landforms by size.
      const order = [...places].sort((a, c) => (c === this.place) - (a === this.place)
        || (c.kind === 'site') - (a.kind === 'site') || (c.size || 0) - (a.size || 0));
      for (const p of order) {
        w.surfacePoint(b, p.lat, p.lon, v);
        w.surfaceNormal(b, p.lat, p.lon, n);
        const toCam = this._pt ||= new w.camera.position.constructor();
        toCam.subVectors(cam, v);
        const facing = n.dot(toCam.normalize());
        if (facing < 0.22) continue; // keep tags off the planet's edge
        // Landforms appear once they span enough of the screen; sites once the planet is large.
        const spanPx = p.size ? (p.size / b.def.radiusKm) * discPx : 0;
        if (p !== this.place && (p.kind === 'site' ? discPx < 90 : spanPx < 34)) continue;
        v.project(w.camera);
        if (v.z > 1) continue;
        const x = (v.x * 0.5 + 0.5) * w.width, y = (-v.y * 0.5 + 0.5) * w.height;
        // Only inside the open part of the view, clear of the bars and panels.
        const f = this._free || { left: 0, top: 0, right: w.width, bottom: w.height };
        if (x < f.left + 4 || x > f.right - 40 || y < f.top + 10 || y > f.bottom - 10) continue;
        const L = this._placeLabel(p);
        this._measure(L);
        const rect = [x - 6, y - 10, x + 10 + L.width, y + 10];
        if (p !== this.place && placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1])) continue;
        placed.push(rect);
        shown.add(p);
        L.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        L.node.style.opacity = Math.min(1, (facing - 0.22) / 0.18).toFixed(2);
        L.node.classList.toggle('current', p === this.place);
        L.x = x; L.y = y;
      }
    }
    for (const [p, L] of this.placeLabels || []) {
      const show = shown.has(p);
      if (show !== L.shown) { L.node.classList.toggle('show', show); L.shown = show; }
    }
  }

  _placeLabel(p) {
    this.placeLabels ||= new Map();
    let L = this.placeLabels.get(p);
    if (L) return L;
    const node = el('div', `place-label ${p.kind === 'site' ? 'is-site' : ''}`);
    node.append(el('i'), el('span', null, p.kind === 'site' ? `${p.name} · ${p.date.match(/\d{4}/)[0]}` : p.name));
    this.labelBox.append(node);
    L = { node, shown: false, measured: false, width: 80, x: 0, y: 0 };
    this.placeLabels.set(p, L);
    return L;
  }

  /** Place whose tag covers a screen point, if any. */
  _placeAt(x, y) {
    for (const [p, L] of this.placeLabels || []) {
      if (L.shown && x >= L.x - 8 && x <= L.x + 12 + L.width && Math.abs(y - L.y) <= 11) return p;
    }
    return null;
  }

  // ── moons of a planet ─────────────────────────────────────────────────────

  _fillMoons(def) {
    const list = SYSTEM_MOONS[def.id];
    const section = $('moons-section');
    section.hidden = !list;
    if (!list) return;
    this._moonPlanet = def;
    this._moonsAll = false;
    const total = list.length;
    $('moons-title').textContent = `ดวงจันทร์ ${num(total)} ดวง`;
    const withData = list.filter((d) => d.data?.el);
    const irregular = withData.filter((d) => orbitClass(d.data).irregular).length;
    const retro = withData.filter((d) => orbitClass(d.data).retrograde).length;
    const summary = $('moons-summary');
    if (def.id === 'earth') {
      summary.textContent = 'ดวงจันทร์ดวงเดียวของโลก รู้จักมาตั้งแต่ก่อนประวัติศาสตร์';
    } else {
      const parts = [`ดวงจันทร์ปกติ ${total - irregular} ดวง`, `ดวงจันทร์ไม่ปกติที่อยู่ไกล ${irregular} ดวง`];
      if (retro) parts.push(`โคจรสวนทาง ${retro} ดวง`);
      summary.textContent = parts.join(' · ');
    }
    this._drawDiscoveryChart(def, list);
    this._renderMoonList();
  }

  /** Step chart of how many moons were known in each year. */
  _drawDiscoveryChart(def, list) {
    const box = $('moons-chart');
    const years = list.map((d) => d.data?.y).filter(Boolean).sort((a, b) => a - b);
    box.hidden = years.length < 3;
    if (box.hidden) return;
    const ns = 'http://www.w3.org/2000/svg';
    const W = 320, H = 132, L = 34, R = 10, T = 10, B = 24;
    const x0 = Math.min(1600, Math.floor(years[0] / 50) * 50), x1 = new Date().getFullYear() + 1;
    const yMax = years.length;
    const sx = (y) => L + ((y - x0) / (x1 - x0)) * (W - L - R);
    const sy = (n) => H - B - (n / yMax) * (H - T - B);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `จำนวนดวงจันทร์ของ${def.name}ที่รู้จักในแต่ละปี จาก ${years[0]} ถึงปัจจุบัน รวม ${yMax} ดวง`);
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    // Grid and axes.
    const step = yMax > 150 ? 100 : yMax > 60 ? 50 : yMax > 20 ? 10 : 5;
    for (let n = 0; n <= yMax; n += step) {
      add('line', { x1: L, x2: W - R, y1: sy(n), y2: sy(n), class: 'grid' });
      add('text', { x: L - 6, y: sy(n) + 3.5, 'text-anchor': 'end', class: 'tick' }, n);
    }
    for (let y = Math.ceil(x0 / 100) * 100; y <= x1; y += 100) {
      add('text', { x: sx(y), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, y);
    }
    // Cumulative count as a step line with a soft fill.
    let path = `M${sx(x0)},${sy(0)}`;
    let n = 0;
    for (let i = 0; i < years.length; i++) {
      const y = years[i];
      path += ` H${sx(y).toFixed(1)}`;
      while (i + 1 < years.length && years[i + 1] === y) { i++; n++; }
      n++;
      path += ` V${sy(n).toFixed(1)}`;
    }
    path += ` H${sx(x1)}`;
    add('path', { d: `${path} V${sy(0)} Z`, class: 'area' });
    add('path', { d: path, class: 'line' });
    // The latest burst of discoveries, labelled.
    const counts = {};
    for (const y of years) counts[y] = (counts[y] || 0) + 1;
    const [peakYear, peak] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (peak >= 5) {
      const before = years.filter((y) => y <= +peakYear).length;
      add('circle', { cx: sx(+peakYear), cy: sy(before), r: 3, class: 'dot' });
      add('text', { x: sx(+peakYear) - 6, y: sy(before) + 4, 'text-anchor': 'end', class: 'note' }, `ค.ศ. ${peakYear} +${peak}`);
    }
    box.replaceChildren(svg);
  }

  _renderMoonList() {
    const def = this._moonPlanet;
    if (!def) return;
    const list = [...SYSTEM_MOONS[def.id]];
    const by = $('moons-sort').value;
    const size = (d) => (d.minor && !d.sizeKnown ? -1 : d.radiusKm);
    if (by === 'distance') list.sort((a, b) => (a.data?.el?.a ?? 1e12) - (b.data?.el?.a ?? 1e12));
    else if (by === 'size') list.sort((a, b) => size(b) - size(a));
    const shown = this._moonsAll ? list : list.slice(0, MOON_LIST_PREVIEW);
    const rows = shown.map((d) => {
      const li = el('li');
      const btn = el('button', 'moon-row');
      btn.type = 'button';
      btn.style.setProperty('--c', d.color);
      const m = d.data;
      const meta = [];
      if (by === 'distance' && m?.el) meta.push(`${num(m.el.a)} กม.`);
      else if (by === 'size') meta.push(d.minor && !d.sizeKnown ? 'ไม่ทราบขนาด' : `${num(2 * d.radiusKm, d.radiusKm < 5 ? 1 : 0)} กม.`);
      else if (m) meta.push(m.el ? periodText(m.el.P) : '');
      btn.append(el('i'), el('span', 'moon-name', d.name), el('span', 'moon-year', m ? `${m.y}` : 'โบราณ'), el('span', 'moon-meta', meta.join(' ')));
      btn.addEventListener('click', () => this.select(d.id));
      li.append(btn);
      return li;
    });
    $('moons-list').replaceChildren(...rows);
    const more = $('moons-more');
    more.hidden = list.length <= MOON_LIST_PREVIEW;
    more.textContent = this._moonsAll ? 'แสดงน้อยลง' : `แสดงทั้งหมด ${num(list.length)} ดวง`;
    $('moons-head').querySelector('.moons-col-meta').textContent = by === 'distance' ? 'ระยะห่างเฉลี่ย' : by === 'size' ? 'เส้นผ่านศูนย์กลาง' : 'คาบการโคจร';
  }

  updateSurfaceStatus(b) {
    if (!b || b.id !== this.selected) return;
    const node = $('surface-status');
    if (b.minor) {
      node.classList.remove('loading');
      node.textContent = 'ยังไม่มีแผนที่พื้นผิว แสดงเป็นรูปทรงจำลอง';
      return;
    }
    const store = this.world.store;
    const best = store.pickTier(b.def.tex.map, '8k');
    node.classList.toggle('loading', !!b.loadingTier);
    const what = b.def.kind === 'star' ? 'ภาพผิวดวงอาทิตย์' : GIANT_IDS.has(b.id) ? 'ภาพยอดเมฆ' : 'ภาพพื้นผิว';
    if (b.loadingTier) {
      node.textContent = `กำลังโหลด${what}ความละเอียด ${TIER_LABEL[b.loadingTier]}…`;
    } else if (b.def.tex.map.note) {
      node.textContent = `${what}ความละเอียดต่ำ ${b.def.tex.map.note}`;
    } else if (b.tier !== best) {
      node.textContent = `${what} ${TIER_LABEL[b.tier]} · ซูมเข้าใกล้เพื่อโหลด ${TIER_LABEL[best]}`;
    } else {
      node.textContent = `${what}ความละเอียด ${TIER_LABEL[b.tier]}`;
    }
  }

  _updateLive() {
    const w = this.world, b = w.byId[this.selected];
    if (!b) return;
    const rows = [];
    const earth = w.byId.earth;
    const rSun = Math.hypot(...b.au);
    const rEarth = Math.hypot(b.au[0] - earth.au[0], b.au[1] - earth.au[1], b.au[2] - earth.au[2]);
    if (b.id === 'sun') {
      rows.push(['ห่างจากโลกขณะนี้', `${distanceText(rEarth)} · ${num(rEarth, 3)} AU`]);
      rows.push(['แสงเดินทางถึงโลกใน', lightTime(rEarth * A.AU_KM)]);
    } else if (b.parent && b.id !== 'moon') {
      const p = b.parent;
      const rPlanet = Math.hypot(b.au[0] - p.au[0], b.au[1] - p.au[1], b.au[2] - p.au[2]) * A.AU_KM;
      rows.push([`ห่างจาก${p.def.name}ขณะนี้`, `${num(rPlanet)} กม.`]);
      rows.push(['ห่างจากโลกขณะนี้', `${distanceText(rEarth)} · ${num(rEarth, 3)} AU`]);
      rows.push(['แสงอาทิตย์เดินทางมาถึงใน', lightTime(rSun * A.AU_KM)]);
    } else if (b.id === 'moon') {
      const phase = A.moonPhase(w.days);
      const pct = Math.round(phase.illuminated * 100);
      const name = pct <= 1 ? 'จันทร์ดับ' : pct >= 99 ? 'จันทร์เพ็ญ' : phase.waxing ? 'ข้างขึ้น' : 'ข้างแรม';
      rows.push(['ห่างจากโลกขณะนี้', `${num(rEarth * A.AU_KM)} กม.`]);
      rows.push(['ดิถีเมื่อมองจากโลก', `${name} · สว่าง ${pct}%`]);
      rows.push(['แสงสะท้อนถึงโลกใน', `${num((rEarth * A.AU_KM) / A.LIGHT_KM_S, 2)} วินาที`]);
    } else {
      rows.push(['ห่างจากดวงอาทิตย์ขณะนี้', `${distanceText(rSun)} · ${num(rSun, 3)} AU`]);
      if (b.id !== 'earth') rows.push(['ห่างจากโลกขณะนี้', `${distanceText(rEarth)} · ${num(rEarth, 3)} AU`]);
      rows.push(['แสงอาทิตย์เดินทางมาถึงใน', lightTime(rSun * A.AU_KM)]);
    }
    const box = $('info-live');
    if (box.childElementCount !== rows.length) {
      box.replaceChildren(...rows.map(() => { const r = el('div', 'live-row'); r.append(el('span'), el('b')); return r; }));
    }
    rows.forEach(([k, v], i) => {
      const r = box.children[i];
      if (r.firstChild.textContent !== k) r.firstChild.textContent = k;
      if (r.lastChild.textContent !== v) r.lastChild.textContent = v;
    });
  }

  // ── time ─────────────────────────────────────────────────────────────────

  _bindTime() {
    const w = this.world;
    const speed = $('speed');
    speed.max = String(SPEEDS.length - 1);
    speed.addEventListener('input', () => this.setSpeed(Number(speed.value)));
    $('btn-play').addEventListener('click', () => this.setPlaying(!w.playing));
    $('btn-reverse').addEventListener('click', () => {
      w.direction *= -1;
      $('btn-reverse').setAttribute('aria-pressed', String(w.direction < 0));
      this.setSpeed(this.speedIndex);
      if (!w.playing) this.setPlaying(true);
    });
    $('btn-now').addEventListener('click', () => { w.setTime(Date.now()); this.toast('กลับมาที่วันและเวลาปัจจุบัน'); });

    const pop = $('datepop'), input = $('date-input');
    $('btn-date').addEventListener('click', () => {
      const open = pop.hidden;
      this._closePopovers();
      if (open) {
        const d = new Date(w.simMs);
        input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        pop.hidden = false;
        $('btn-date').setAttribute('aria-expanded', 'true');
      }
    });
    $('date-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const [y, m, d] = input.value.split('-').map(Number);
      if (!y || y < 1000 || y > 2999) { this.toast('เลือกปีได้ระหว่าง ค.ศ. 1000 ถึง 2999'); return; }
      const now = new Date(w.simMs);
      w.setTime(new Date(y, m - 1, d, now.getHours(), now.getMinutes()).getTime());
      this._closePopovers();
    });
  }

  setSpeed(i) {
    this.speedIndex = i;
    this.world.rate = SPEEDS[i].rate;
    $('speed').value = String(i);
    const back = this.world.direction < 0 ? 'ย้อน ' : '';
    $('speed-label').textContent = back + SPEEDS[i].label;
    $('speed').setAttribute('aria-valuetext', back + SPEEDS[i].label);
  }

  setPlaying(on) {
    this.world.playing = on;
    const btn = $('btn-play');
    btn.classList.toggle('paused', !on);
    btn.setAttribute('aria-label', on ? 'หยุดเวลา' : 'เล่นเวลาต่อ');
  }

  _updateClock() {
    const d = new Date(this.world.simMs);
    const y = d.getFullYear();
    const text = `${d.getDate()} ${MONTHS[d.getMonth()]} ${y + 543}|ค.ศ. ${y} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
    if (text === this._clockText) return;
    this._clockText = text;
    const [main, sub] = text.split('|');
    $('date-main').textContent = main;
    $('date-sub').textContent = sub;
  }

  // ── settings, help ───────────────────────────────────────────────────────

  _closePopovers() {
    for (const [pop, btn] of [['settings', 'btn-settings'], ['datepop', 'btn-date']]) {
      $(pop).hidden = true;
      $(btn).setAttribute('aria-expanded', 'false');
    }
  }

  _bindSettings() {
    const w = this.world;
    $('btn-settings').addEventListener('click', () => {
      const open = $('settings').hidden;
      this._closePopovers();
      $('settings').hidden = !open;
      $('btn-settings').setAttribute('aria-expanded', String(open));
    });
    $('opt-orbits').addEventListener('change', (e) => { w.options.orbits = e.target.checked; });
    $('opt-belts').addEventListener('change', (e) => { w.options.belts = e.target.checked; });
    $('opt-labels').addEventListener('change', (e) => { this.showLabels = e.target.checked; });
    $('opt-fill').addEventListener('change', (e) => w.setFill(e.target.checked));
    $('opt-discovered').addEventListener('change', (e) => {
      w.options.discovered = e.target.checked;
      this.toast(e.target.checked
        ? 'แสดงเฉพาะดวงจันทร์ที่ค้นพบแล้ว ณ ปีที่แสดง ลองย้อนเวลาไปปี 1610 ดูดาวพฤหัสบดี'
        : 'แสดงดวงจันทร์ทุกดวงที่รู้จักในปัจจุบัน', 5200);
    });
    $('opt-scale').addEventListener('change', (e) => {
      w.setTrueScale(e.target.checked);
      this.toast(e.target.checked
        ? 'มาตราส่วนจริง: ดาวเคราะห์เล็กมากเมื่อเทียบกับระยะห่าง แตะป้ายชื่อเพื่อบินไปหา'
        : 'กลับสู่มาตราส่วนย่อ ขยายขนาดดาวและย่อระยะห่างให้เห็นพร้อมกัน', 5200);
    });

    const help = $('help');
    $('btn-help').addEventListener('click', () => { this._closePopovers(); help.hidden = false; $('help-close').focus(); });
    $('help-close').addEventListener('click', () => { help.hidden = true; $('btn-help').focus(); });
    help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });

    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.popover, #btn-settings, #btn-date')) this._closePopovers();
    });
  }

  // ── canvas ───────────────────────────────────────────────────────────────

  _bindCanvas() {
    const c = this.canvas;
    let down = null;
    const local = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
    c.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 6 || !quick) return;
      const [x, y] = local(e);
      const place = this._placeAt(x, y);
      if (place) { this.showPlace(place); return; }
      const hit = this._hitAt(x, y, e.pointerType === 'mouse' ? 12 : 22);
      if (hit && hit.id !== this.selected) this.select(hit.id);
    });
    c.addEventListener('pointercancel', () => { down = null; });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const [x, y] = local(e);
      const hit = this._hitAt(x, y, 12);
      c.classList.toggle('hot', !!this._placeAt(x, y) || (!!hit && hit.id !== this.selected));
    });
  }

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') {
        if (!$('help').hidden) $('help').hidden = true;
        else if (!$('settings').hidden || !$('datepop').hidden) this._closePopovers();
        else if (this.selected) this.closePanel();
        else this.goOverview();
      } else if (e.key === ' ' && !e.target.closest('button')) {
        e.preventDefault();
        this.setPlaying(!this.world.playing);
      }
    });
  }

  // ── per-frame ────────────────────────────────────────────────────────────

  frame(now) {
    this._updateLabels();
    this._updatePlaceLabels();
    this._updateClock();
    if (this.selected && now - this._liveAt > 250) { this._liveAt = now; this._updateLive(); }
  }
}

const GIANT_IDS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
