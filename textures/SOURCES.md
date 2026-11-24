# Texture sources and licences

Every map here is an equirectangular projection centred on longitude 0° with
east to the right, resized and re-encoded from the source listed. Scripts:
`tools/build_textures.py` (Sun, planets, our Moon, Milky Way, Saturn's rings),
`tools/build_moon_textures.py` (other moons and Pluto), `tools/build_icons.py`
(the small sphere icons in `icons/`, rendered from these maps).

## Sun, planets, our Moon, Milky Way, Saturn's rings

| Files | Source | Licence |
| --- | --- | --- |
| `sun`, `mercury`, `venus`, `venus_clouds`, `earth`, `earth_night`, `earth_clouds`, `earth_spec`, `earth_normal`, `moon`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune`, `stars_*`, `saturn_ring.png` | [Solar System Scope](https://www.solarsystemscope.com/textures/), based on NASA data | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Pluto and moons

| Files | Source | Licence |
| --- | --- | --- |
| `pluto` | New Horizons global mosaic [PIA11707](https://photojournal.jpl.nasa.gov/catalog/PIA11707), NASA/JHU-APL/SwRI. Un-imaged far south filled with the tone of the nearest imaged latitudes | Public domain |
| `europa` | USGS Europa Voyager–Galileo SSI global mosaic 500 m, NASA/JPL/USGS. Small un-imaged south polar band filled the same way | Public domain |
| `callisto` | USGS Callisto Voyager–Galileo SSI global mosaic 1 km, NASA/JPL/USGS. Un-imaged gaps filled the same way | Public domain |
| `mimas`, `enceladus`, `tethys`, `dione`, `rhea`, `iapetus` | Cassini ISS global colour maps by Paul Schenk, [PIA18437](https://photojournal.jpl.nasa.gov/catalog/PIA18437), [PIA18435](https://photojournal.jpl.nasa.gov/catalog/PIA18435), [PIA18439](https://photojournal.jpl.nasa.gov/catalog/PIA18439), [PIA18434](https://photojournal.jpl.nasa.gov/catalog/PIA18434), [PIA18438](https://photojournal.jpl.nasa.gov/catalog/PIA18438), [PIA18436](https://photojournal.jpl.nasa.gov/catalog/PIA18436), NASA/JPL-Caltech/SSI/LPI. Enhanced colour pulled 60% toward grey | Public domain |
| `charon` | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), "Pluto – Charon" (a pre-New Horizons map) | Public domain |
| `io` | [Celestia](https://github.com/CelestiaProject/CelestiaContent): ItzImcool, AstroChara; NASA/JPL-Caltech/ASI/USGS; NASA/JPL/SwRI/MSSS/Gerald Eichstädt/Jason Perry/John Rogers | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `ganymede` | Celestia: Askaniy Anpilogov; NASA/JPL-Caltech/ASI/USGS; NASA/JPL-Caltech/Björn Jónsson; NASA/JPL-Caltech/SwRI/MSSS/Brian Swift | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `titan` | Celestia: Askaniy Anpilogov, Pedro Garcia, AstroChara; Martonchik & Orton (1994); Karkoschka et al. (2016); Seignovert et al. (2019); NASA/JPL-Caltech/ASI/USGS; Caltech-JPL/Univ. of Arizona/LPG-Univ. of Nantes-CNRS | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `titan_haze` | Celestia: Gordan Ugarković, Kevin M. Gill, ShadowDragon777, AstroChara | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `triton` | Celestia: Askaniy Anpilogov; NASA/JPL-Caltech/ASI/USGS | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `phobos` | Celestia: Askaniy Anpilogov; Stooke, P., Stooke Small Bodies Maps V3.0, NASA Planetary Data System, 2015 | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `deimos` | Celestia: Stooke, P., Stooke Small Bodies Maps V3.0, NASA Planetary Data System, 2015 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `amalthea`, `thebe`, `metis` | Celestia: ItzImcool | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `hyperion` | Celestia: ItzImcool | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `miranda`, `ariel`, `umbriel`, `titania`, `oberon` | Celestia: ItzImcool; Paul Schenk (2020); NASA/JPL/Ted Stryk; Umbriel also Phil Stooke (2006). The un-imaged northern hemispheres are a flat neutral tone | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — these five files, and anything made from them, stay under CC BY-SA 4.0 |
| `puck` | Celestia: Askaniy Anpilogov; Evan Davis (2004) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `nix`, `hydra` | Celestia: Askaniy Anpilogov | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

The Celestia maps keep their creators' orientation convention: the top of the
map is the pole about which the body turns anticlockwise. For Triton, which
orbits backwards, that is the pole the IAU calls south.

Moons without a map are drawn as procedural lumpy bodies; their look is not
data.
