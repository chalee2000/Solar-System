// Texture loading with resolution tiers. Every body starts on its 2K maps;
// the focused body is upgraded to 4K and, on capable desktops, 8K.
import * as THREE from '../vendor/three/three.module.min.js';

export const TIER_WIDTH = { '2k': 2048, '4k': 4096, '8k': 8192 };
const TIER_ORDER = ['2k', '4k', '8k'];

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดไฟล์ ${url} ไม่สำเร็จ (HTTP ${res.status})`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') {
    // Decoding off the main thread keeps the frame rate steady while 8K maps arrive.
    try { return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { /* fall through */ }
    try { return await createImageBitmap(blob); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`ถอดรหัสภาพ ${url} ไม่สำเร็จ`)); };
    img.src = objectUrl;
  });
}

export class TextureStore {
  constructor(renderer, base = 'textures/') {
    this.base = base;
    this.maxSize = renderer.capabilities.maxTextureSize;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const lowMemory = typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4;
    // An 8K map costs ~180 MB of GPU memory with mipmaps: desktop only.
    this.maxTier = this.maxSize >= 8192 && !coarse && !lowMemory ? '8k' : this.maxSize >= 4096 ? '4k' : '2k';
  }

  /** Highest tier a channel offers that is no larger than `wanted` and this device's limit. */
  pickTier(channel, wanted) {
    const cap = Math.min(TIER_ORDER.indexOf(wanted), TIER_ORDER.indexOf(this.maxTier));
    let best = channel.tiers[0];
    for (const t of channel.tiers) if (TIER_ORDER.indexOf(t) <= cap) best = t;
    return best;
  }

  url(channel, tier) {
    return `${this.base}${tier}/${channel.name}.jpg`;
  }

  /** Images are used unflipped (flipY = false); geometry UVs are flipped to match. */
  async load(url, { data = false } = {}) {
    const image = await loadImage(url);
    const tex = new THREE.Texture(image);
    tex.flipY = false;
    tex.premultiplyAlpha = false;
    tex.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.anisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  loadChannel(channel, tier) {
    return this.load(this.url(channel, tier), { data: !!channel.data });
  }

  static dispose(tex) {
    if (!tex) return;
    tex.dispose();
    if (tex.image && typeof tex.image.close === 'function') tex.image.close();
  }
}
