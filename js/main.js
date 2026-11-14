import { World } from './world.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');

function fatal(message, err) {
  if (err) console.error(err);
  const loading = document.getElementById('loading');
  loading.hidden = false;
  loading.classList.remove('done');
  loading.classList.add('failed');
  document.getElementById('loading-text').textContent = message;
}

async function boot() {
  let world, ui;
  try {
    world = new World(canvas, {
      onTier: (b) => ui?.updateSurfaceStatus(b),
      onClockLimit: () => {
        ui?.setPlaying(false);
        ui?.toast('ถึงขอบเขตเวลาของแบบจำลองแล้ว (ค.ศ. 1000 ถึง 3000)');
      },
    });
  } catch (err) {
    fatal('เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับ WebGL 2 จึงแสดงภาพ 3 มิติไม่ได้ ลองเปิดด้วย Chrome, Edge, Firefox หรือ Safari รุ่นล่าสุด', err);
    return;
  }
  world.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  ui = new UI(world);

  try {
    await world.init((p) => ui.setProgress(p));
  } catch (err) {
    fatal(location.protocol === 'file:'
      ? 'เปิดไฟล์นี้โดยตรงไม่ได้ ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ เช่น รันคำสั่ง python3 -m http.server ในโฟลเดอร์นี้ แล้วเปิด http://localhost:8000'
      : 'โหลดภาพพื้นผิวดาวไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วรีเฟรชหน้านี้', err);
    return;
  }
  ui.ready();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.toast('การ์ดแสดงผลหยุดทำงานชั่วคราว กำลังกู้คืนภาพ', 4000);
  });

  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    world.update(dt);
    ui.frame(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Exposed for debugging from the console.
  window.solar = { world, ui };
}

boot();
