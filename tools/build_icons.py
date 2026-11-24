"""Render small lit-sphere icons for the body list from the texture maps.
Usage: python3 -I tools/build_icons.py <textures_dir>"""
import sys, os
import numpy as np
from PIL import Image

tex_dir = sys.argv[1]
out_dir = os.path.join(tex_dir, "icons")
os.makedirs(out_dir, exist_ok=True)
SIZE, SS = 112, 4            # output size, supersampling
N = SIZE * SS

def load(name, mode="RGB"):
    return np.asarray(Image.open(os.path.join(tex_dir, name)).convert(mode), dtype=np.float32) / 255.0

def sample(img, lon, lat):
    h, w = img.shape[:2]
    u = ((lon / (2 * np.pi) + 0.5) % 1.0) * (w - 1)
    v = (0.5 - lat / np.pi) * (h - 1)
    return img[np.clip(v.round().astype(int), 0, h - 1), u.round().astype(int) % w]

def best(name):
    for tier in ("2k", "1k"):
        if os.path.exists(os.path.join(tex_dir, tier, name + ".jpg")):
            return f"{tier}/{name}.jpg"
    raise FileNotFoundError(name)

def render(name, lon0=0.0, tilt=18.0, radius=0.94, emissive=False, clouds=None, ring=None, rim=None):
    img = load(best(name))
    ys, xs = np.mgrid[0:N, 0:N]
    x = (xs + 0.5) / N * 2 - 1
    y = 1 - (ys + 0.5) / N * 2
    px, py = x / radius, y / radius
    r2 = px * px + py * py
    inside = r2 <= 1.0
    pz = np.sqrt(np.clip(1 - r2, 0, 1))
    t = np.radians(tilt)
    # un-tilt: rotate the view-space normal about X so the north pole leans toward the viewer
    by = py * np.cos(t) + pz * np.sin(t)
    bz = -py * np.sin(t) + pz * np.cos(t)
    lon = np.radians(lon0) + np.arctan2(px, bz)
    lat = np.arcsin(np.clip(by, -1, 1))
    col = sample(img, lon, lat)
    if clouds is not None:
        c = sample(load(best(clouds), "L"), lon, lat)[..., None]
        col = col * (1 - 0.85 * c) + 0.85 * c
    L = np.array([-0.52, 0.48, 0.71]); L /= np.linalg.norm(L)
    ndl = px * L[0] + py * L[1] + pz * L[2]
    if emissive:
        shade = 0.55 + 0.6 * pz ** 0.6
    else:
        shade = 0.10 + 0.98 * np.clip((ndl + 0.12) / 1.12, 0, 1) ** 0.85
    col = col * shade[..., None]
    if rim is not None:
        fres = (1 - pz) ** 3 * np.clip(ndl + 0.4, 0, 1)
        col = col + np.array(rim)[None, None, :] * fres[..., None] * 0.7
    rgba = np.zeros((N, N, 4), np.float32)
    rgba[..., :3] = np.clip(col, 0, 1)
    rgba[..., 3] = inside.astype(np.float32)
    if ring is not None:
        inner, outer, rtilt = ring
        strip = np.asarray(Image.open(os.path.join(tex_dir, "saturn_ring.png")).convert("RGBA"), dtype=np.float32)[0] / 255.0
        rt = np.radians(rtilt)
        # ring plane normal (0, cos rt, sin rt): z on the plane for each pixel
        zr = -(np.cos(rt) * py) / np.sin(rt)
        rho = np.sqrt(px * px + py * py + zr * zr)
        u = (rho - inner) / (outer - inner)
        on = (u >= 0) & (u <= 1)
        s = strip[np.clip((u * (strip.shape[0] - 1)).astype(int), 0, strip.shape[0] - 1)]
        front = ~inside | (zr > pz)
        a = np.where(on & front, s[..., 3], 0.0)[..., None]
        rgba[..., :3] = rgba[..., :3] * (1 - a) + s[..., :3] * 0.95 * a
        rgba[..., 3:4] = np.clip(rgba[..., 3:4] + a * (1 - rgba[..., 3:4]), 0, 1)
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    im.save(os.path.join(out_dir, f"{name}.png"), optimize=True)
    print(name, os.path.getsize(os.path.join(out_dir, f"{name}.png")))

render("sun", emissive=True, tilt=8)
render("mercury", lon0=-40)
render("venus_clouds", lon0=20, rim=(1.0, 0.86, 0.58))
os.replace(os.path.join(out_dir, "venus_clouds.png"), os.path.join(out_dir, "venus.png"))
render("earth", lon0=100, tilt=14, clouds="earth_clouds", rim=(0.4, 0.65, 1.0))   # South-East Asia in view
render("moon", lon0=0, tilt=4)
render("mars", lon0=-70, tilt=12, rim=(0.9, 0.6, 0.45))
render("jupiter", lon0=160, tilt=4)
render("saturn", lon0=0, tilt=20, radius=0.42, ring=(1.152, 2.341, 20.0))
render("uranus", tilt=10, rim=(0.6, 0.9, 0.95))
render("neptune", lon0=40, tilt=10, rim=(0.4, 0.56, 1.0))
render("pluto", lon0=160, tilt=10)

# Moons with surface maps
for moon, lon in (("phobos", 0), ("deimos", 0), ("io", 0), ("europa", 0), ("ganymede", 0),
                  ("callisto", 0), ("amalthea", 0), ("thebe", 0), ("metis", 0), ("mimas", 0),
                  ("enceladus", 180), ("tethys", 0), ("dione", 0), ("rhea", 0), ("titan_haze", 0),
                  ("hyperion", 0), ("iapetus", 0), ("miranda", 0), ("ariel", 0), ("umbriel", 0),
                  ("titania", 0), ("oberon", 0), ("puck", 0), ("triton", 0), ("charon", 0),
                  ("nix", 0), ("hydra", 0)):
    # Uranus's moons and Triton were imaged in one hemisphere only (the top of their maps): tilt toward it.
    tilt = 35 if moon in ("miranda", "ariel", "umbriel", "titania", "oberon", "triton") else 14
    render(moon, lon0=lon, tilt=tilt, rim=(1.0, 0.72, 0.36) if moon == "titan_haze" else None)
os.replace(os.path.join(out_dir, "titan_haze.png"), os.path.join(out_dir, "titan.png"))

# Generic icon for moons without a map: a dark, lumpy body.
rng = np.random.default_rng(7)
ys, xs = np.mgrid[0:N, 0:N]
x = (xs + 0.5) / N * 2 - 1
y = 1 - (ys + 0.5) / N * 2
ang = np.arctan2(y, x)
lump = 0.78 + 0.07 * np.sin(3 * ang + 0.6) + 0.05 * np.sin(5 * ang + 2.1) + 0.03 * np.sin(9 * ang)
r = np.hypot(x, y) / lump
inside = r <= 1.0
pz = np.sqrt(np.clip(1 - r * r, 0, 1))
L = np.array([-0.55, 0.45, 0.70]); L /= np.linalg.norm(L)
shade = 0.12 + 0.95 * np.clip(((x / lump) * L[0] + (y / lump) * L[1] + pz * L[2] + 0.1) / 1.1, 0, 1) ** 0.9
grain = np.asarray(Image.fromarray((rng.random((28, 28)) * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC), dtype=np.float32) / 255
tone = (0.42 + 0.18 * grain) * shade
rgba = np.zeros((N, N, 4), np.float32)
rgba[..., 0] = tone * 1.05; rgba[..., 1] = tone; rgba[..., 2] = tone * 0.93
rgba[..., 3] = inside
im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").resize((SIZE, SIZE), Image.LANCZOS)
im.save(os.path.join(out_dir, "small-moon.png"), optimize=True)
print("small-moon", os.path.getsize(os.path.join(out_dir, "small-moon.png")))
