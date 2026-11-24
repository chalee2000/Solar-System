#!/bin/bash
# Download the NASA/JPL tables the moon catalogue is built from.
#
#   tools/fetch_moons.sh <cache_dir>
#   python3 -I tools/build_moons.py <cache_dir> js/moons-data.js
#
# Sources (NASA/JPL Solar System Dynamics):
#   https://ssd.jpl.nasa.gov/sats/elem/            mean orbital elements
#   https://ssd.jpl.nasa.gov/sats/discovery.html   discovery circumstances
#   https://ssd.jpl.nasa.gov/sats/phys_par/        physical parameters
#   https://ssd.jpl.nasa.gov/api/horizons.api      per-satellite size / albedo notes
set -euo pipefail
dir="${1:?usage: fetch_moons.sh <cache_dir>}"
mkdir -p "$dir/hz"
tools_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$dir"
base="https://ssd.jpl.nasa.gov"
curl -sSfL --retry 3 -o elem.html "$base/sats/elem/"
curl -sSfL --retry 3 -o discovery.html "$base/sats/discovery.html"
curl -sSfL --retry 3 -o phys.html "$base/sats/phys_par/"

# One Horizons object header per satellite code listed in the elements table.
codes=$(python3 -I "$tools_dir/build_moons.py" --codes "$PWD")
for c in $codes; do
  [ -s "hz/$c.txt" ] && continue
  curl -sSfL --retry 3 -o "hz/$c.txt" \
    "$base/api/horizons.api?format=text&COMMAND=%27$c%27&OBJ_DATA=YES&MAKE_EPHEM=NO" || rm -f "hz/$c.txt"
  sleep 0.3
done
echo "fetched $(ls hz | wc -l) Horizons headers into $dir"
