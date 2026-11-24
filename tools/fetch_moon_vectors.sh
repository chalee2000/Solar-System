#!/bin/bash
# Planet-centred ICRF position vectors from JPL Horizons for every satellite,
# used by tools/calibrate_moons.mjs to anchor each orbit's phase.
#
#   tools/fetch_moon_vectors.sh <cache_dir>
#
# Writes <cache_dir>/vec/<code>.csv with lines "jd,x,y,z" (km), 75 epochs per moon.
set -uo pipefail
dir="${1:?usage: fetch_moon_vectors.sh <cache_dir>}"
tools_dir="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$dir/vec"
center() { case "$1" in 4??) echo 499;; 5??|55???) echo 599;; 6??|65???) echo 699;; 7??|75???) echo 799;; 8??|85???) echo 899;; 9??) echo 999;; esac; }
query() { # code center "jd1 jd2 jd3"
  curl -sS --max-time 90 "https://ssd.jpl.nasa.gov/api/horizons.api" --get \
    --data-urlencode "format=text" --data-urlencode "COMMAND='$1'" --data-urlencode "CENTER='500@$2'" \
    --data-urlencode "EPHEM_TYPE=VECTORS" --data-urlencode "REF_PLANE=FRAME" --data-urlencode "REF_SYSTEM=ICRF" \
    --data-urlencode "VEC_TABLE=1" --data-urlencode "CSV_FORMAT=YES" --data-urlencode "OUT_UNITS=KM-S" \
    --data-urlencode "OBJ_DATA=NO" --data-urlencode "TIME_TYPE=TDB" --data-urlencode "TLIST=$3" |
    sed -n '/\$\$SOE/,/\$\$EOE/p' | grep -v '\$\$' | awk -F, '{gsub(/ /,""); print $1","$3","$4","$5}'
}
for code in $(python3 -I "$tools_dir/build_moons.py" --codes "$dir"); do
  out="$dir/vec/$code.csv"
  [ -s "$out" ] && continue
  c=$(center "$code")
  # An anchor at 2026-01-01 with points 2, 7 and 30 days later (so even the
  # fastest moons can be followed without miscounting orbits), then every
  # 100 days from 2016 to 2035 — 75 epochs, under Horizons' limit of 80 per
  # request. Short ephemerides (Saturn's ring moonlets end in 2018) fall back
  # to the 19 years before 2016.
  for plan in "2461041.5 3550" "2457388.5 7000"; do
    set -- $plan
    epochs=$(python3 -c "a=$1; pts=[a, a+2, a+7, a+30] + [a - $2 + 100*k for k in range(71)]; print(' '.join(f'{p:.1f}' for p in sorted(set(round(p,1) for p in pts))))")
    want=$(echo $epochs | wc -w)
    rows=$(query "$code" "$c" "$epochs")
    if [ "$(echo "$rows" | grep -c ,)" -eq "$want" ]; then echo "$rows" > "$out"; break; fi
    sleep 1
  done
  [ -s "$out" ] || echo "no vectors for $code" >&2
  sleep 0.2
done
echo "vectors for $(ls "$dir/vec" | wc -l) satellites in $dir/vec"
