"""Resize / re-encode source planet maps into the tiers the app loads.
Usage: python3 -I build_textures.py <sss_dir> <nasa_dir> <out_dir>"""
import sys, os
from PIL import Image
Image.MAX_IMAGE_PIXELS = 200_000_000
sss, nasa, out = sys.argv[1:4]
TIERS = {"2k": (2048, 86), "4k": (4096, 84), "8k": (8192, 82)}

def save(im, tier, name, gray=False, q=None):
    w, quality = TIERS[tier]
    if q: quality = q
    if im.width < w:        # never upscale
        return
    if im.width != w:
        im = im.resize((w, w // 2), Image.LANCZOS)
    im = im.convert("L" if gray else "RGB")
    d = os.path.join(out, tier); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name + ".jpg")
    im.save(p, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2 if not gray else 0)
    print(f"{tier}/{name}.jpg {im.width}x{im.height} {os.path.getsize(p)/1e6:.2f} MB")

jobs = [  # (source file, output name, tiers, grayscale)
    ("8k_sun.jpg", "sun", ["2k", "4k"], False),
    ("8k_mercury.jpg", "mercury", ["2k", "4k", "8k"], False),
    ("8k_venus_surface.jpg", "venus", ["2k", "4k", "8k"], False),
    ("4k_venus_atmosphere.jpg", "venus_clouds", ["2k", "4k"], False),
    ("8k_earth_daymap.jpg", "earth", ["2k", "4k", "8k"], False),
    ("8k_earth_nightmap.jpg", "earth_night", ["2k", "4k"], False),
    ("8k_earth_clouds.jpg", "earth_clouds", ["2k", "4k"], True),
    ("8k_earth_specular_map.tif", "earth_spec", ["2k", "4k"], True),
    ("8k_earth_normal_map.tif", "earth_normal", ["2k", "4k"], False),
    ("8k_moon.jpg", "moon", ["2k", "4k", "8k"], False),
    ("8k_mars.jpg", "mars", ["2k", "4k", "8k"], False),
    ("8k_jupiter.jpg", "jupiter", ["2k", "4k"], False),
    ("8k_saturn.jpg", "saturn", ["2k", "4k"], False),
    ("2k_uranus.jpg", "uranus", ["2k"], False),
    ("2k_neptune.jpg", "neptune", ["2k"], False),
]
for src, name, tiers, gray in jobs:
    im = Image.open(os.path.join(sss, src)); im.load()
    for t in tiers:
        save(im, t, name, gray, q=92 if name == "earth_normal" else None)

# Pluto (NASA / New Horizons, 720x360): keep native resolution
im = Image.open(os.path.join(nasa, "Pluto.jpg")).convert("RGB")
os.makedirs(os.path.join(out, "2k"), exist_ok=True)
im.save(os.path.join(out, "2k", "pluto.jpg"), "JPEG", quality=92, optimize=True)
print("2k/pluto.jpg", im.size)

# Star background
im = Image.open(os.path.join(sss, "8k_stars_milky_way.jpg")); im.load()
for w, q in ((4096, 82), (8192, 80)):
    r = im if im.width == w else im.resize((w, w // 2), Image.LANCZOS)
    p = os.path.join(out, f"stars_{w//1024}k.jpg")
    r.convert("RGB").save(p, "JPEG", quality=q, optimize=True, progressive=True)
    print(os.path.basename(p), os.path.getsize(p)/1e6, "MB")

# Saturn ring: radial strip, RGBA
ring = Image.open(os.path.join(sss, "8k_saturn_ring_alpha.png")).convert("RGBA")
ring = ring.resize((4096, 1), Image.LANCZOS, box=(0, 200, ring.width, 300)).resize((4096, 4), Image.NEAREST)
p = os.path.join(out, "saturn_ring.png"); ring.save(p, optimize=True)
print("saturn_ring.png", ring.size, os.path.getsize(p)/1e3, "KB")
