"""Resize and re-encode the source planet maps into the tiers the app loads.

Sources (not kept in this repository):
  * Solar System Scope texture pack, 2K-8K equirectangular maps (CC BY 4.0)
      https://www.solarsystemscope.com/textures/
  * NASA 3D Resources, "Images and Textures/Pluto/Pluto.jpg" (public domain)
      https://github.com/nasa/NASA-3D-Resources

Usage: python3 -I tools/build_textures.py <solar_system_scope_dir> <nasa_dir> <out_dir>
"""
import os
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = 200_000_000
sss, nasa, out = sys.argv[1:4]
TIERS = {"1k": (1024, 88), "2k": (2048, 86), "4k": (4096, 84), "8k": (8192, 82)}


def save(im, tier, name, gray=False, quality=None):
    width, default_quality = TIERS[tier]
    if im.width < width:  # never upscale
        return
    if im.width != width:
        im = im.resize((width, width // 2), Image.LANCZOS)
    im = im.convert("L" if gray else "RGB")
    folder = os.path.join(out, tier)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + ".jpg")
    im.save(path, "JPEG", quality=quality or default_quality, optimize=True, progressive=True,
            subsampling=0 if gray else 2)
    print(f"{tier}/{name}.jpg {im.width}x{im.height} {os.path.getsize(path) / 1e6:.2f} MB")


# (source file, output name, tiers, grayscale, per-tier quality overrides)
JOBS = [
    ("8k_sun.jpg", "sun", ["1k", "2k", "4k"], False, {}),
    ("8k_mercury.jpg", "mercury", ["1k", "2k", "4k", "8k"], False, {"8k": 74}),
    ("8k_venus_surface.jpg", "venus", ["1k", "2k", "4k", "8k"], False, {}),
    ("4k_venus_atmosphere.jpg", "venus_clouds", ["1k", "2k", "4k"], False, {}),
    ("8k_earth_daymap.jpg", "earth", ["1k", "2k", "4k", "8k"], False, {}),
    ("8k_earth_nightmap.jpg", "earth_night", ["1k", "2k", "4k"], False, {}),
    ("8k_earth_clouds.jpg", "earth_clouds", ["1k", "2k", "4k"], True, {}),
    ("8k_earth_specular_map.tif", "earth_spec", ["1k", "2k", "4k"], True, {}),
    ("8k_earth_normal_map.tif", "earth_normal", ["1k", "2k"], False, {"1k": 92, "2k": 92}),
    ("8k_moon.jpg", "moon", ["1k", "2k", "4k", "8k"], False, {"8k": 74}),
    ("8k_mars.jpg", "mars", ["1k", "2k", "4k", "8k"], False, {}),
    ("8k_jupiter.jpg", "jupiter", ["1k", "2k", "4k"], False, {}),
    ("8k_saturn.jpg", "saturn", ["1k", "2k", "4k"], False, {}),
    ("2k_uranus.jpg", "uranus", ["1k", "2k"], False, {}),
    ("2k_neptune.jpg", "neptune", ["1k", "2k"], False, {}),
]
for src, name, tiers, gray, overrides in JOBS:
    image = Image.open(os.path.join(sss, src))
    image.load()
    for tier in tiers:
        save(image, tier, name, gray, overrides.get(tier))

# Pluto (New Horizons mosaic, 720x360): kept at its native resolution.
pluto = Image.open(os.path.join(nasa, "Pluto.jpg")).convert("RGB")
os.makedirs(os.path.join(out, "1k"), exist_ok=True)
pluto.save(os.path.join(out, "1k", "pluto.jpg"), "JPEG", quality=92, optimize=True)
print("1k/pluto.jpg", pluto.size)

# Milky Way panorama (galactic coordinates).
stars = Image.open(os.path.join(sss, "8k_stars_milky_way.jpg"))
stars.load()
for width, quality in ((4096, 82), (8192, 80)):
    resized = stars if stars.width == width else stars.resize((width, width // 2), Image.LANCZOS)
    path = os.path.join(out, f"stars_{width // 1024}k.jpg")
    resized.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print(os.path.basename(path), f"{os.path.getsize(path) / 1e6:.2f} MB")

# Saturn's rings: a radial strip of colour + opacity, C ring (left) to A ring (right).
ring = Image.open(os.path.join(sss, "8k_saturn_ring_alpha.png")).convert("RGBA")
ring = ring.resize((4096, 1), Image.LANCZOS, box=(0, 200, ring.width, 300)).resize((4096, 4), Image.NEAREST)
path = os.path.join(out, "saturn_ring.png")
ring.save(path, optimize=True)
print("saturn_ring.png", ring.size, f"{os.path.getsize(path) / 1e3:.1f} KB")
