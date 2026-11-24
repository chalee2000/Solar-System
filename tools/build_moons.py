"""Build js/moons-data.js from the NASA/JPL planetary-satellite tables.

    tools/fetch_moons.sh <cache_dir>                        # download the tables
    python3 -I tools/build_moons.py <cache_dir> js/moons-data.js

Inputs in <cache_dir> (see fetch_moons.sh):
    elem.html       https://ssd.jpl.nasa.gov/sats/elem/          mean orbital elements
    discovery.html  https://ssd.jpl.nasa.gov/sats/discovery.html discovery circumstances
    phys.html       https://ssd.jpl.nasa.gov/sats/phys_par/      GM, mean radius, density
    hz/<code>.txt   Horizons object headers                      size, albedo, V(1,0) notes

Every satellite of Mars, Jupiter, Saturn, Uranus, Neptune and Pluto in the
discovery table is written out, including the few that have no published
mean elements (they keep `el: null` and are listed but not drawn).
"""
import datetime
import glob
import html
import json
import math
import os
import re
import sys

PLANETS = ["Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
LETTER = {"Mars": "M", "Jupiter": "J", "Saturn": "S", "Uranus": "U", "Neptune": "N", "Pluto": "P"}
# Typos in the elements table, keyed to the spelling in the discovery table.
NAME_FIXES = {"Magaclite": "Megaclite", "Philophrosyn": "Philophrosyne"}
J2000 = datetime.datetime(2000, 1, 1, 12)


def table_rows(text, table_id=None):
    start = text.find(f'id="{table_id}"') if table_id else text.find("<table")
    if start < 0:
        raise SystemExit(f"table {table_id or '(first)'} not found")
    chunk = text[start:text.find("</table>", start)]
    rows = []
    for tr in re.findall(r"<tr.*?</tr>", chunk, flags=re.S):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S)
        rows.append([re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip() for c in cells])
    return rows


def key(name):
    return re.sub(r"[^A-Za-z0-9]", "", name).upper()


def num(value):
    value = value.strip().rstrip(".") if value else ""
    if value in ("", "-", "n/a"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def first(cell):
    return num(cell.split()[0]) if cell else None


def epoch_days(text):
    # "2000-01-01.5" -> days from J2000.0
    y, m, d = text.split("-")
    day = float(d)
    t = datetime.datetime(int(y), int(m), 1) + datetime.timedelta(days=day - 1)
    return round((t - J2000).total_seconds() / 86400, 4)


def load_elements(cache):
    rows = table_rows(open(os.path.join(cache, "elem.html"), encoding="utf-8").read(), "sat_elem")
    head, body = rows[0], rows[1:]
    assert head[2] == "Satellite" and head[7].startswith("a ") and head[12].startswith("node"), head
    out = {}
    for r in body:
        planet, name, code, frame = r[1], NAME_FIXES.get(r[2], r[2]), r[3], r[5]
        if planet not in PLANETS:
            continue
        el = {
            "f": {"ecliptic": "ecl", "Laplace": "lap", "equatorial": "eq"}[frame],
            "ep": epoch_days(r[6]),
            "a": num(r[7]), "e": num(r[8]), "w": num(r[9]), "M": num(r[10]),
            "i": num(r[11]), "o": num(r[12]), "P": num(r[13]),
            "Pw": num(r[14]) or 0, "Po": num(r[15]) or 0,
        }
        if el["f"] == "lap":
            el["ra"], el["de"] = num(r[16]), num(r[17])
        k = (planet, key(name))
        # A satellite listed twice (from two ephemerides) keeps the newer fit.
        if k not in out or el["ep"] >= out[k][1]["ep"]:
            out[k] = (int(code), el)
    return out


def load_discovery(cache):
    rows = table_rows(open(os.path.join(cache, "discovery.html"), encoding="utf-8").read())
    planet, out = None, []
    for r in rows[1:]:
        if len(r) == 1:
            planet = re.search(r"of (?:Dwarf Planet )?(\w+)", r[0]).group(1)
            continue
        number, name, prov, year, who, ref = r
        # A few moons were seen, lost and recovered: "1975, 2000". Keep the first
        # year for sorting and the full text for display.
        years = [int(y) for y in re.findall(r"\d{4}", year)]
        out.append({"planet": planet, "num": number, "name": name, "prov": prov,
                    "year": years[0], "years": year if len(years) > 1 else "", "by": who, "ref": ref})
    return out


def load_physical(cache):
    rows = table_rows(open(os.path.join(cache, "phys.html"), encoding="utf-8").read(), "sat_phys_par")
    out = {}
    for r in rows[2:]:
        if len(r) < 6 or r[0] not in PLANETS:
            continue
        out[int(r[2])] = {"gm": first(r[3]), "r": first(r[4]), "rho": first(r[5])}
    return out


def load_horizons(cache):
    out = {}
    for path in glob.glob(os.path.join(cache, "hz", "*.txt")):
        text = open(path, encoding="utf-8", errors="replace").read()
        info = {}
        m = re.search(r"(?:Mean\s+)?[Rr]adius\s*\(km\)\s*=\s*~?\s*([0-9.]+)\s*(?:[xX]\s*([0-9.]+)\s*[xX]\s*([0-9.]+))?", text)
        if m:
            if m.group(2):
                info["ax"] = [float(m.group(1)), float(m.group(2)), float(m.group(3))]
            else:
                info["r"] = float(m.group(1))
        m = re.search(r"Geometric\s+Albedo\s*=\s*([0-9.]+)", text)
        if m:
            info["alb"] = float(m.group(1))
        m = re.search(r"V\(1,0\)\s*=\s*([+-]?[0-9.]+)", text)
        if m:
            info["H"] = float(m.group(1))
        out[int(os.path.basename(path)[:-4])] = info
    return out


def moon_id(planet, name, prov):
    if name:
        return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    m = re.match(r"S/(\d{4})\s*([A-Z])\s*(\d+)", prov)
    return f"s{m.group(1)}-{m.group(2).lower()}{m.group(3)}"


def main():
    if sys.argv[1] == "--codes":
        for code, _ in sorted(load_elements(sys.argv[2]).values()):
            print(code)
        return
    cache, target = sys.argv[1:3]
    elements, discovery = load_elements(cache), load_discovery(cache)
    physical, horizons = load_physical(cache), load_horizons(cache)

    moons, used = [], set()
    for d in discovery:
        k = None
        for candidate in (d["name"], d["prov"]):
            if candidate and (d["planet"], key(candidate)) in elements:
                k = (d["planet"], key(candidate))
                break
        code, el = elements[k] if k else (None, None)
        if k:
            used.add(k)
        m = {
            "id": moon_id(d["planet"], d["name"], d["prov"]),
            "p": d["planet"].lower(),
            "n": d["name"] or d["prov"],
            "num": d["num"], "pv": d["prov"] if d["name"] else "",
            "y": d["year"], "by": d["by"], "ref": d["ref"],
            "c": code, "el": el,
        }
        if d["years"]:
            m["ys"] = d["years"]
        phys, hz = physical.get(code, {}), horizons.get(code, {})
        if phys.get("gm"):
            m["gm"] = phys["gm"]
        if phys.get("rho"):
            m["rho"] = phys["rho"]
        if "ax" in hz:
            m["ax"] = hz["ax"]
            m["r"] = round((hz["ax"][0] * hz["ax"][1] * hz["ax"][2]) ** (1 / 3), 2)
            m["rs"] = "measured"
        if phys.get("r"):
            m["r"], m["rs"] = phys["r"], "measured"
        elif "r" in hz and "r" not in m:
            m["r"], m["rs"] = hz["r"], "measured"
        if "alb" in hz:
            m["alb"] = hz["alb"]
        if "H" in hz:
            m["H"] = hz["H"]
        if "r" not in m and "H" in hz:
            # Diameter from absolute magnitude: D = 1329 km / sqrt(albedo) * 10^(-H/5).
            albedo = hz.get("alb", 0.04)
            m["r"] = round(1329 / math.sqrt(albedo) * 10 ** (-hz["H"] / 5) / 2, 1)
            m["rs"] = "magnitude"
        moons.append(m)

    unused = [k for k in elements if k not in used]
    if unused:
        raise SystemExit(f"elements without a discovery row: {unused}")
    ids = [m["id"] for m in moons]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise SystemExit(f"duplicate ids: {dup}")

    counts = {p.lower(): sum(1 for m in moons if m["p"] == p.lower()) for p in PLANETS}
    today = datetime.date.today().isoformat()
    lines = [
        "// Generated by tools/build_moons.py — do not edit by hand.",
        f"// Source: NASA/JPL Solar System Dynamics planetary-satellite tables, retrieved {today}:",
        "//   mean elements  https://ssd.jpl.nasa.gov/sats/elem/",
        "//   discovery      https://ssd.jpl.nasa.gov/sats/discovery.html",
        "//   physical       https://ssd.jpl.nasa.gov/sats/phys_par/ and Horizons object notes",
        "//",
        "// Keys: p parent · n name · num IAU numeral · pv provisional designation · y year discovered",
        "//   (ys when it was seen, lost and found again) · by discoverers · c JPL code · el mean elements (f frame ecl|lap|eq, ep epoch in days from",
        "//   J2000, a km, e, w/M/i/o deg, P days, Pw/Po apsis/node precession periods in years, ra/de",
        "//   Laplace pole) · r mean radius km · rs how r is known · ax triaxial radii km · gm km^3/s^2",
        "//   rho g/cm^3 · alb geometric albedo · H absolute magnitude V(1,0)",
        f"export const MOON_DATA_DATE = '{today}';",
        f"export const MOON_COUNTS = {json.dumps(counts)};",
        "export const MOONS = [",
    ]
    for m in moons:
        lines.append("  " + json.dumps(m, ensure_ascii=False, separators=(",", ":")) + ",")
    lines.append("];")
    open(target, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    drawn = sum(1 for m in moons if m["el"])
    sized = sum(1 for m in moons if "r" in m)
    print(f"{len(moons)} moons ({drawn} with elements, {sized} with a size) -> {target}: {counts}")


if __name__ == "__main__":
    main()
