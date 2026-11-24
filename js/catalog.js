// One registry for everything the app can show: the hand-written bodies in
// data.js plus every known moon from the JPL catalogue in moons-data.js.
import { BODIES } from './data.js';
import { MOONS, MOON_COUNTS, MOON_DATA_DATE } from './moons-data.js';

export { MOON_COUNTS, MOON_DATA_DATE };

// Thai names in common use (Royal Society of Thailand style). Moons not listed
// keep their IAU name or provisional designation.
export const THAI_NAMES = {
  phobos: 'โฟบอส', deimos: 'ดีมอส',
  io: 'ไอโอ', europa: 'ยูโรปา', ganymede: 'แกนีมีด', callisto: 'คัลลิสโต',
  amalthea: 'แอมัลเทีย', thebe: 'ธีบี', metis: 'มีทิส', adrastea: 'แอดราสเทีย', himalia: 'ฮิมาเลีย',
  mimas: 'ไมมัส', enceladus: 'เอนเซลาดัส', tethys: 'ทีทิส', dione: 'ไดโอนี', rhea: 'เรีย',
  titan: 'ไททัน', hyperion: 'ไฮพีเรียน', iapetus: 'ไอแอพิตัส', phoebe: 'ฟีบี',
  janus: 'เจนัส', epimetheus: 'เอพิมีเทียส', pan: 'แพน', atlas: 'แอตลาส',
  prometheus: 'โพรมีเทียส', pandora: 'แพนดอรา',
  miranda: 'มิแรนดา', ariel: 'แอเรียล', umbriel: 'อัมเบรียล', titania: 'ไททาเนีย', oberon: 'โอเบอรอน',
  puck: 'พัก',
  triton: 'ไทรทัน', nereid: 'เนรีด', proteus: 'โพรเทียส',
  charon: 'แครอน', nix: 'นิกซ์', hydra: 'ไฮดรา', kerberos: 'เคอร์เบอรอส', styx: 'สติกซ์',
};

export const PLANET_EN = { mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };

// Drawn size for moons whose size has never been measured.
export const NOMINAL_RADIUS_KM = 2;
// Beyond this many planet radii a moon counts as "irregular": a distant,
// usually eccentric and steeply inclined orbit, most likely a captured body.
const IRREGULAR_RADII = 80;

export const MOON_BY_ID = Object.fromEntries(MOONS.map((m) => [m.id, m]));
const BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));

/** Orbit facts that do not depend on rendering. */
export function orbitClass(m) {
  const parent = BY_ID[m.p];
  const el = m.el;
  if (!el) return { irregular: false, retrograde: false, radii: null };
  return {
    irregular: el.a / parent.radiusKm > IRREGULAR_RADII,
    retrograde: el.i > 90,
    radii: el.a / parent.radiusKm,
  };
}

const COLORS = { regular: '#cdd6e4', prograde: '#9cc4ec', retrograde: '#f2a46e' };

// Hand-written moons pick up their catalogue data.
for (const b of BODIES) {
  if (b.kind !== 'moon' || b.id === 'moon') continue;
  const m = MOON_BY_ID[b.id];
  if (!m) throw new Error(`moon ${b.id} is missing from moons-data.js`);
  b.data = m;
  b.radiusKm = m.r;
  b.axes = m.ax || null;
  b.en ||= `${m.n} · ${PLANET_EN[m.p]} ${m.num}`.toUpperCase();
}

const textured = new Set(BODIES.filter((b) => b.kind === 'moon').map((b) => b.id));

/** Every other moon gets a generated definition. */
export const MINOR_MOONS = MOONS.filter((m) => !textured.has(m.id)).map((m) => {
  const cls = orbitClass(m);
  return {
    id: m.id,
    name: THAI_NAMES[m.id] || m.n,
    en: designation(m),
    kind: 'moon', minor: true, parent: m.p,
    radiusKm: m.r || NOMINAL_RADIUS_KM,
    axes: m.ax || null,
    sizeKnown: !!m.r,
    flattening: 0,
    color: cls.irregular ? (cls.retrograde ? COLORS.retrograde : COLORS.prograde) : COLORS.regular,
    data: m,
  };
});

export const DEFS = Object.fromEntries([...BODIES, ...MINOR_MOONS].map((d) => [d.id, d]));

/** IAU numeral line, e.g. "JUPITER XVI · S/1979 J3". */
export function designation(m) {
  const parts = [];
  if (m.num) parts.push(`${PLANET_EN[m.p]} ${m.num}`);
  if (THAI_NAMES[m.id] && m.n !== THAI_NAMES[m.id]) parts.unshift(m.n);
  if (m.pv) parts.push(m.pv);
  if (!parts.length) parts.push(m.n);
  return parts.join(' · ');
}

/** All moons of a body, in order of discovery. */
export const SYSTEM_MOONS = {};
for (const d of Object.values(DEFS)) {
  if (d.kind !== 'moon') continue;
  (SYSTEM_MOONS[d.parent] ||= []).push(d);
}
const romanValue = (s) => {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let n = 0;
  for (let i = 0; i < (s || '').length; i++) {
    const a = v[s[i]], b = v[s[i + 1]] || 0;
    n += a < b ? -a : a;
  }
  return n || 9999;
};
for (const list of Object.values(SYSTEM_MOONS)) {
  list.sort((a, b) => (a.data?.y ?? 0) - (b.data?.y ?? 0) || romanValue(a.data?.num) - romanValue(b.data?.num)
    || (a.data?.n || '').localeCompare(b.data?.n || ''));
}

// ── text for the detail panel ─────────────────────────────────────────────

const G = 6.6743e-20; // km^3 kg^-1 s^-2
const num = (x, digits = 0) => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sci(x, digits = 2) {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${m.toFixed(digits)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
}
function sizeText(km) {
  if (km >= 100) return num(km);
  if (km >= 10) return num(km, 0);
  return num(km, 1);
}

export function periodText(days) {
  if (days < 1) return `${num(days * 24, 1)} ชม.`;
  if (days < 365.25) return `${num(days, days < 10 ? 2 : 1)} วัน`;
  return `${num(days / 365.25, 2)} ปี`;
}

export function discoverersText(by) {
  const names = by.split(/,\s*(?![^()]*\))/).map((s) => s.trim()).filter(Boolean);
  if (names.length <= 2) return { value: by, note: '' };
  return { value: `${names[0]} และคณะ`, note: `ผู้ค้นพบ ${names.length} คน` };
}

const FRAME_TEXT = { ecl: 'เทียบกับระนาบสุริยวิถี', lap: 'เทียบกับระนาบลาปลาซของดวงจันทร์', eq: 'เทียบกับเส้นศูนย์สูตรของดาวเคราะห์' };

/** Fact rows for any moon with catalogue data. */
export function moonFacts(def) {
  const m = def.data;
  const parent = BY_ID[def.parent];
  const cls = orbitClass(m);
  const rows = [];
  rows.push(['ค้นพบเมื่อ', `ค.ศ. ${m.ys || m.y}`, m.ys ? 'เห็นครั้งแรกแล้วยืนยันได้ในภายหลัง' : `พ.ศ. ${m.y + 543}`]);
  const who = discoverersText(m.by);
  rows.push(['ผู้ค้นพบ', who.value, who.note]);
  if (m.num || m.pv) rows.push(['ชื่อทางการ', m.num ? `${PLANET_EN[m.p]} ${m.num}` : m.n, m.pv ? `ชื่อชั่วคราว ${m.pv}` : '']);
  if (m.ax) {
    rows.push(['ขนาด', `${m.ax.map((r) => sizeText(2 * r)).join(' × ')} กม.`, 'รูปร่างไม่กลม']);
  } else if (m.r) {
    rows.push(['เส้นผ่านศูนย์กลาง', `${m.rs === 'magnitude' ? 'ราว ' : ''}${sizeText(2 * m.r)} กม.`,
      m.rs === 'magnitude' ? 'ประมาณจากความสว่าง' : '']);
  } else {
    rows.push(['เส้นผ่านศูนย์กลาง', 'ยังไม่มีการวัด', 'น่าจะเพียงไม่กี่กิโลเมตร']);
  }
  if (m.el) {
    rows.push([`ระยะห่างเฉลี่ยจาก${parent.name}`, `${num(m.el.a)} กม.`, `${num(cls.radii, cls.radii < 10 ? 1 : 0)} เท่าของรัศมี${parent.name}`]);
    rows.push(['คาบการโคจร', periodText(m.el.P)]);
    rows.push(['ทิศการโคจร', cls.retrograde ? 'สวนทาง' : 'ไปทางเดียวกับการหมุนของดาวเคราะห์',
      cls.retrograde ? 'โคจรสวนทางการหมุนของดาวเคราะห์' : '']);
    rows.push(['ความรีของวงโคจร', num(m.el.e, 3)]);
    rows.push(['ความเอียงของวงโคจร', `${num(m.el.i, 1)}°`, FRAME_TEXT[m.el.f]]);
  } else {
    rows.push(['วงโคจร', 'ยังไม่มีค่าเฉลี่ยจาก JPL', 'จึงไม่แสดงในภาพ 3 มิติ']);
  }
  if (m.gm) rows.push(['มวล', `${sci(m.gm / G)} กก.`]);
  if (m.rho) rows.push(['ความหนาแน่นเฉลี่ย', `${num(m.rho, 2)} ก./ซม.³`, m.rho < 1 ? 'น้อยกว่าน้ำ' : '']);
  if (m.gm && m.r && m.r > 50) rows.push(['แรงโน้มถ่วงพื้นผิว', `${num((m.gm / (m.r * m.r)) * 1000, 3)} ม./วินาที²`]);
  if (m.alb) rows.push(['ค่าการสะท้อนแสง', num(m.alb, 2), m.alb < 0.1 ? 'มืดเท่าถ่าน' : m.alb > 0.8 ? 'สว่างเหมือนหิมะ' : '']);
  return rows;
}

/** A short generated description for moons without a hand-written one. */
export function moonDescription(def) {
  const m = def.data;
  const parent = BY_ID[def.parent];
  const cls = orbitClass(m);
  const who = discoverersText(m.by);
  const parts = [];
  parts.push(`${def.name} เป็นดวงจันทร์ของ${parent.name} ค้นพบเมื่อ ค.ศ. ${m.y} โดย ${who.value}`);
  if (m.el) {
    parts.push(`โคจรห่างจาก${parent.name}เฉลี่ย ${num(m.el.a)} กิโลเมตร ครบรอบทุก ${periodText(m.el.P)}`);
    if (cls.irregular) {
      parts.push(`เป็นดวงจันทร์ไม่ปกติ อยู่ไกลจากดาวเคราะห์ วงโคจรรีและเอียงมาก${cls.retrograde ? ' และโคจรสวนทาง' : ''} นักดาราศาสตร์เชื่อว่าดวงจันทร์ลักษณะนี้เคยเป็นวัตถุที่ถูกแรงโน้มถ่วงของ${parent.name}จับไว้`);
    } else if (cls.radii < 4) {
      parts.push(`เป็นดวงจันทร์วงใน โคจรใกล้ระนาบเส้นศูนย์สูตรของ${parent.name}`);
    }
  } else {
    parts.push('ยังไม่มีค่าวงโคจรเฉลี่ยเผยแพร่ จึงแสดงไว้ในรายชื่อแต่ไม่ได้วาดในภาพ 3 มิติ');
  }
  if (!m.r) parts.push('ยังไม่มีการวัดขนาดโดยตรง ดวงจันทร์ที่ค้นพบในช่วงหลังส่วนใหญ่มีขนาดเพียงไม่กี่กิโลเมตรถึงไม่กี่สิบกิโลเมตร ในภาพจึงวาดด้วยขนาดสมมุติ');
  return parts.join(' ') + '';
}
