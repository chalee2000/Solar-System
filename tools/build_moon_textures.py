"""Build the moon (and Pluto) surface maps in textures/<tier>/<id>.jpg.

    python3 -I tools/build_moon_textures.py <src_dir> <out_dir>

<src_dir> holds the source maps under the names used below. Every output is
an equirectangular map centred on longitude 0° with east to the right, which
is what the renderer expects. Sources and licences are listed in
textures/SOURCES.md.
"""
import os
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 400_000_000
src, out = sys.argv[1:3]
WIDTH = {"1k": 1024, "2k": 2048, "4k": 4096}


def roll_half(im):
    """Maps centred on 180° → centred on 0°."""
    a = np.asarray(im)
    return Image.fromarray(np.roll(a, a.shape[1] // 2, axis=1))


def fill_gaps(im, threshold=6, feather=18):
    """Replace un-imaged (black) areas with the average tone of their latitude
    band, faded in so the edge of real data stays soft. Gaps are real: the
    spacecraft never saw those areas."""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    lum = a.mean(axis=2)
    gap = lum < threshold
    if not gap.any():
        return im
    # Latitude-band means over imaged pixels; bands with no data take the global mean.
    valid = ~gap
    glob = a[valid].mean(axis=0)
    rows = np.empty((a.shape[0], 3), np.float32)
    for y in range(a.shape[0]):
        v = valid[y]
        rows[y] = a[y][v].mean(axis=0) if v.sum() > a.shape[1] * 0.05 else np.nan
    # Carry the nearest valid band into fully un-imaged polar bands, then ease toward the global mean.
    idx = np.where(~np.isnan(rows[:, 0]))[0]
    for y in range(a.shape[0]):
        if np.isnan(rows[y, 0]):
            n = idx[np.argmin(np.abs(idx - y))]
            t = min(1.0, abs(y - n) / (a.shape[0] * 0.08))
            rows[y] = rows[n] * (1 - t) + glob * t
    fill = np.repeat(rows[:, None, :], a.shape[1], axis=1)
    # Soft mask: distance-like blur of the gap mask.
    mask = Image.fromarray((gap * 255).astype(np.uint8)).filter(
        __import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(feather))
    m = np.maximum(np.asarray(mask, dtype=np.float32) / 255.0, gap.astype(np.float32))[..., None]
    return Image.fromarray(np.clip(a * (1 - m) + fill * m, 0, 255).astype(np.uint8))


def desaturate(im, amount):
    """Pull exaggerated 'enhanced colour' mosaics part of the way to grey."""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    g = a.mean(axis=2, keepdims=True)
    return Image.fromarray(np.clip(g + (a - g) * (1 - amount), 0, 255).astype(np.uint8))


def save(im, name, tiers, quality=84):
    im = im.convert("RGB")
    for tier in tiers:
        w = min(WIDTH[tier], im.width)
        if WIDTH[tier] > im.width and tier != tiers[0]:
            continue  # never upscale past the first tier
        r = im if im.width == w else im.resize((w, w // 2), Image.LANCZOS)
        folder = os.path.join(out, tier)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name + ".jpg")
        r.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
        print(f"{tier}/{name}.jpg {r.width}x{r.height} {os.path.getsize(path) / 1e3:.0f} KB")


def open_rgb(name):
    im = Image.open(os.path.join(src, name))
    if im.mode in ("RGBA", "LA"):
        im = im.convert("RGB")  # Celestia keeps a specular mask in alpha
    return im.convert("RGB")


# Mars
save(open_rgb("celestia/hires_phobos.jpg"), "phobos", ["1k", "2k"])
save(open_rgb("celestia/hires_deimos.jpg"), "deimos", ["1k", "2k"])
# Jupiter
save(open_rgb("celestia/hires_io.png"), "io", ["1k", "2k", "4k"])
save(fill_gaps(roll_half(open_rgb("stellata/europa-usgs-global.jpg"))), "europa", ["1k", "2k", "4k"])
save(open_rgb("celestia/hires_ganymede.jpg"), "ganymede", ["1k", "2k", "4k"])
save(fill_gaps(roll_half(open_rgb("stellata/callisto-usgs-global.jpg"))), "callisto", ["1k", "2k", "4k"])
for small in ("amalthea", "thebe", "metis"):
    save(open_rgb(f"celestia/lores_{small}.jpg"), small, ["1k"])
# Saturn: Cassini enhanced-colour mosaics centred on 180°
for moon, pia in (("mimas", 18437), ("enceladus", 18435), ("tethys", 18439),
                  ("dione", 18434), ("rhea", 18438), ("iapetus", 18436)):
    save(desaturate(roll_half(open_rgb(f"stellata/{moon}-pia{pia}.jpg")), 0.6), moon, ["1k", "2k", "4k"])
save(open_rgb("celestia/hires_titan.png"), "titan", ["1k", "2k"])
save(open_rgb("celestia/hires_titan-clouds.jpg"), "titan_haze", ["1k", "2k"])
save(open_rgb("celestia/medres_hyperion.jpg"), "hyperion", ["1k", "2k"])
# Uranus
save(open_rgb("celestia/hires_miranda.jpg"), "miranda", ["1k", "2k"])
save(open_rgb("celestia/hires_ariel.jpg"), "ariel", ["1k", "2k"])
for moon in ("umbriel", "titania", "oberon"):
    save(open_rgb(f"celestia/medres_{moon}.jpg"), moon, ["1k", "2k"])
save(open_rgb("celestia/medres_puck.jpg"), "puck", ["1k"])
# Neptune
save(open_rgb("celestia/hires_triton.jpg"), "triton", ["1k", "2k"])
# Pluto system
pluto = fill_gaps(roll_half(open_rgb("stellata/pluto-pia11707.jpg")))
save(pluto, "pluto", ["1k", "2k", "4k"])
save(open_rgb("nasa/Pluto - Charon.jpg"), "charon", ["1k"], quality=90)
save(open_rgb("celestia/medres_nix.jpg"), "nix", ["1k"])
save(open_rgb("celestia/lores_hydra.jpg"), "hydra", ["1k"])
