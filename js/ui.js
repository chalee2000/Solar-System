// DOM side of the app: body list, detail panel, time controls, labels.
import * as A from './astro.js';
import { BODIES, BODY_BY_ID, SPEEDS, SPEED_OVERVIEW, SPEED_FOCUS } from './data.js';

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
const TIER_LABEL = { '2k': '2K', '4k': '4K', '8k': '8K' };

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
    this._resize();
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
  }

  fatal(message) {
    const loading = $('loading');
    loading.hidden = false;
    loading.classList.remove('done');
    loading.classList.add('failed');
    $('loading-text').textContent = message;
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

  _buildLabels() {
    const box = $('labels');
    this.labels = {};
    for (const def of BODIES) {
      const l = el('button', 'label');
      l.type = 'button';
      l.tabIndex = -1;
      l.style.setProperty('--c', def.color);
      l.append(el('i'), el('span', null, def.name));
      l.addEventListener('click', () => this.select(def.id));
      box.append(l);
      this.labels[def.id] = { node: l, shown: false, dot: false, width: def.name.length * 8.5 + 22 };
    }
  }

  _updateLabels() {
    const w = this.world;
    const placed = [];
    const earth = w.byId.earth.screen;
    for (const id of LABEL_PRIORITY) {
      const b = w.byId[id], sc = b.screen, L = this.labels[id];
      let show = this.showLabels && sc.visible && sc.x > -40 && sc.x < w.width + 40 && sc.y > -20 && sc.y < w.height + 20;
      // A body that already fills the view needs no tag.
      if (show && sc.r > Math.min(w.width, w.height) * 0.16) show = false;
      if (show && b.parent && Math.hypot(sc.x - earth.x, sc.y - earth.y) < 26) show = false;
      if (show) {
        // Hidden behind a nearer body's disc.
        for (const o of w.bodies) {
          const os = o.screen;
          if (o !== b && os.visible && os.depth < sc.depth && Math.hypot(sc.x - os.x, sc.y - os.y) < os.r) { show = false; break; }
        }
      }
      const off = Math.max(sc.r, 3) + 7;
      const rect = show ? [sc.x - 6, sc.y - 11, sc.x + off + L.width, sc.y + 11] : null;
      if (show && id !== this.selected) {
        for (const p of placed) {
          if (rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]) { show = false; break; }
        }
      }
      if (show !== L.shown) { L.node.classList.toggle('show', show); L.shown = show; }
      if (!show) continue;
      placed.push(rect);
      const dot = sc.r < 4;
      if (dot !== L.dot) { L.node.classList.toggle('dot', dot); L.dot = dot; }
      L.node.style.transform = `translate(${sc.x.toFixed(1)}px, ${sc.y.toFixed(1)}px)`;
      L.node.style.setProperty('--off', `${off.toFixed(1)}px`);
    }
  }

  // ── selection ────────────────────────────────────────────────────────────

  select(id) {
    const def = BODY_BY_ID[id];
    if (!def) return;
    const changed = this.selected !== id;
    this.selected = id;
    for (const [key, btn] of Object.entries(this.listButtons)) {
      if (key === id) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current');
    }
    this.listButtons[id].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (changed) this._fillPanel(def);
    this.info.hidden = false;
    this.app.classList.add('has-info');
    requestAnimationFrame(() => this.info.classList.add('open'));
    this._enterMode('focus');
    this.world.focus(id);
    this.updateViewShift();
    this._liveAt = 0;
  }

  closePanel() {
    this.selected = null;
    this.info.classList.remove('open', 'expanded');
    this.app.classList.remove('has-info');
    this.sheetOpen = false;
    for (const btn of Object.values(this.listButtons)) btn.removeAttribute('aria-current');
    setTimeout(() => { if (!this.selected) this.info.hidden = true; }, 280);
    this.updateViewShift();
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
    $('btn-whole').addEventListener('click', () => this.selected && this.world.focus(this.selected));
    $('shell-input').addEventListener('change', (e) => this.selected && this.world.setShell(this.selected, e.target.checked));
    $('info-grip').addEventListener('click', () => this._setSheet(!this.sheetOpen));
    $('info-head').addEventListener('click', (e) => {
      if (!this.desktop.matches && !e.target.closest('button')) this._setSheet(!this.sheetOpen);
    });
    $('btn-overview').addEventListener('click', () => this.goOverview());

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
    $('info-icon').src = `textures/icons/${def.id}.png`;
    $('info-type').textContent = def.type;
    $('info-name').textContent = def.name;
    $('info-en').textContent = def.en;
    $('info-desc').textContent = def.desc;
    this.info.style.setProperty('--c', def.color);
    $('info-body').scrollTop = 0;

    const isSun = def.kind === 'star';
    $('btn-surface').textContent = isSun ? 'เข้าใกล้ผิวดวงอาทิตย์' : GIANT_IDS.has(def.id) ? 'ลงไปดูยอดเมฆ' : 'ลงไปดูพื้นผิว';

    const shell = $('shell-toggle');
    shell.hidden = !def.shell;
    if (def.shell) {
      $('shell-label').textContent = def.shell.label;
      $('shell-input').checked = this.world.byId[def.id].shellOn;
    }

    const facts = $('info-facts');
    facts.replaceChildren();
    for (const [label, value, note] of def.facts) {
      const row = el('div', 'fact');
      const dd = el('dd', null, value);
      if (note) dd.append(el('small', null, note));
      row.append(el('dt', null, label), dd);
      facts.append(row);
    }

    const trivia = $('info-trivia');
    trivia.replaceChildren(...def.trivia.map((t) => el('li', null, t)));

    this._fillCompare(def);
    this.updateSurfaceStatus(this.world.byId[def.id]);
  }

  // Two discs drawn to the same scale. The Sun is far too large to fit, so only
  // an arc of its limb is shown next to a true-scale Earth.
  _fillCompare(def) {
    const box = $('info-compare');
    const section = $('compare-section');
    section.hidden = def.id === 'earth';
    if (def.id === 'earth') return;
    const earth = BODY_BY_ID.earth;
    const ratio = def.radiusKm / earth.radiusKm;
    const H = 96, W = 300;
    let dBody, dEarth;
    if (ratio > 12) { dEarth = 4; dBody = dEarth * ratio; }
    else if (ratio >= 1) { dBody = 72; dEarth = 72 / ratio; }
    else { dEarth = 72; dBody = 72 * ratio; }
    const cy = 40;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${def.name}มีเส้นผ่านศูนย์กลาง ${ratio >= 1 ? num(ratio, 1) : num(ratio, 2)} เท่าของโลก`);
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
      circle(200, dEarth, earth.color);
      text(12, `${def.name} (เห็นเพียงส่วนโค้ง)`, 'start');
      text(200, 'โลก');
    } else {
      const gap = 36, total = dBody + dEarth + gap, x0 = (W - total) / 2;
      circle(x0 + dBody / 2, dBody, def.color);
      circle(x0 + dBody + gap + dEarth / 2, dEarth, earth.color);
      text(x0 + dBody / 2, def.name);
      text(x0 + dBody + gap + dEarth / 2, 'โลก');
    }
    box.replaceChildren(svg);
  }

  updateSurfaceStatus(b) {
    if (!b || b.id !== this.selected) return;
    const node = $('surface-status');
    const store = this.world.store;
    const best = store.pickTier(b.def.tex.map, '8k');
    node.classList.toggle('loading', !!b.loadingTier);
    const what = b.def.kind === 'star' ? 'ภาพผิวดวงอาทิตย์' : GIANT_IDS.has(b.id) ? 'ภาพยอดเมฆ' : 'ภาพพื้นผิว';
    if (b.loadingTier) {
      node.textContent = `กำลังโหลด${what}ความละเอียด ${TIER_LABEL[b.loadingTier]}…`;
    } else if (b.def.tex.map.width) {
      node.textContent = `${what}ความละเอียดต่ำ จากข้อมูลยานนิวฮอไรซันส์`;
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
      const hit = this.world.pick(x, y, e.pointerType === 'mouse' ? 12 : 22);
      if (hit && hit.id !== this.selected) this.select(hit.id);
    });
    c.addEventListener('pointercancel', () => { down = null; });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const [x, y] = local(e);
      const hit = this.world.pick(x, y, 12);
      c.classList.toggle('hot', !!hit && hit.id !== this.selected);
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
    this._updateClock();
    if (this.selected && now - this._liveAt > 250) { this._liveAt = now; this._updateLive(); }
  }
}

const GIANT_IDS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
