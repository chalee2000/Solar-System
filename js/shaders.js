// GLSL for the custom materials. All lighting is done in view space with the
// Sun as a single point light; `uSunPosV` is computed on the CPU in double
// precision each frame, which keeps things stable when a planet is millions of
// times smaller than its distance from the origin (true-scale mode).

const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(11.3, 7.1, 3.7); a *= 0.5; }
  return s / 0.9375;
}
`;

export const SURFACE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vTangentV;
varying vec3 vPosV;
varying vec3 vPosO;
void main() {
  vUv = uv;
  vPosO = position;
  vNormalV = normalize(normalMatrix * normal);
  // East-pointing tangent of the lat/long grid (degenerate only at the poles).
  vec3 t = cross(vec3(0.0, 1.0, 0.0), normal);
  vTangentV = (modelViewMatrix * vec4(t, 0.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const SURFACE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform sampler2D uNight;
uniform sampler2D uSpec;
uniform sampler2D uNormal;
uniform sampler2D uCloud;
uniform sampler2D uRingMap;
uniform vec3 uSunPosV;
uniform vec3 uSunDirL;      // Sun direction in the body's own (unscaled) frame
uniform float uWrap;        // terminator softness
uniform float uRadius;      // body radius in scene units
uniform float uBump;        // emboss gain for relief derived from the map's brightness
uniform float uRough;       // procedural micro-relief once the map is magnified
uniform float uNormalScale;
uniform float uFill;        // 0 = sunlight only, 1 = evenly lit
uniform float uTexW;        // width of uMap in texels
uniform float uDetail;      // strength of procedural micro-detail when magnified
uniform float uNightOn, uSpecOn, uNormalOn, uCloudOn;
uniform float uCloudShift;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec4 uRing;         // x: enabled, y: inner radius, z: outer radius, w: polar/equatorial ratio
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vTangentV;
varying vec3 vPosV;
varying vec3 vPosO;
${NOISE}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  #include <logdepthbuf_fragment>
  vec3 Ng = normalize(vNormalV);
  vec3 N = Ng;
  vec3 V = normalize(-vPosV);
  vec3 L = normalize(uSunPosV - vPosV);

  vec3 albedo = texture2D(uMap, vUv).rgb;
  vec2 dUVx = dFdx(vUv), dUVy = dFdy(vUv);
  bool seam = abs(dUVx.x) > 0.25 || abs(dUVy.x) > 0.25;

  // How far the base map is being magnified: texels per screen pixel.
  vec2 texSize = vec2(uTexW, uTexW * 0.5);
  float tpp = max(length(dUVx * texSize), length(dUVy * texSize));
  float mag = seam ? 0.0 : smoothstep(0.75, 0.12, tpp);
  // Fine grain that fades in as texels grow larger than pixels, so a close view
  // reads as terrain instead of a blurred image.
  float grain = 0.5;
  if (uDetail > 0.0 || uRough > 0.0) {
    grain = fbm(normalize(vPosO) * (uTexW / 14.0));
    albedo *= 1.0 + uDetail * mag * (grain - 0.5) * 1.5;
  }

  if (uNormalOn > 0.5) {
    vec3 T = normalize(vTangentV - Ng * dot(vTangentV, Ng));
    vec3 B = cross(Ng, T);
    vec3 n = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
    n.xy *= uNormalScale;
    N = normalize(T * n.x + B * n.y + Ng * n.z);
  } else if ((uBump > 0.0 || uRough > 0.0) && !seam) {
    // Treat brightness as height (works well for cratered and dusty worlds).
    // The height scale tracks the sampling footprint, so the emboss keeps the
    // same strength at every zoom; it fades out once texels are magnified,
    // where bilinear filtering would otherwise show up as facets.
    float texel = 6.2831853 / uTexW;
    float gain = uBump * texel * clamp(tpp, 1.0, 6.0) * smoothstep(0.25, 1.0, tpp) * uRadius;
    float h0 = luma(texture2D(uMap, vUv).rgb);
    float hx = luma(texture2D(uMap, vUv + dUVx).rgb);
    float hy = luma(texture2D(uMap, vUv + dUVy).rgb);
    float micro = grain * uRough * texel * uRadius * mag;
    float bx = (hx - h0) * gain + dFdx(micro);
    float by = (hy - h0) * gain + dFdy(micro);
    vec3 sx = dFdx(vPosV), sy = dFdy(vPosV);
    vec3 r1 = cross(sy, Ng), r2 = cross(Ng, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (bx * r1 + by * r2);
    N = normalize(abs(det) * Ng - grad);
  }

  float ndlG = dot(Ng, L);
  float diff = clamp((dot(N, L) + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  diff *= smoothstep(-uWrap - 0.12, -uWrap + 0.04, ndlG);

  float shade = 1.0;
  if (uRing.x > 0.5) {
    // Shadow of the rings: follow the ray toward the Sun to the equatorial plane.
    vec3 p = vPosO * vec3(1.0, uRing.w, 1.0);
    float t = -p.y / uSunDirL.y;
    if (t > 0.0) {
      vec3 q = p + t * uSunDirL;
      float u = (length(q.xz) - uRing.y) / (uRing.z - uRing.y);
      if (u > 0.0 && u < 1.0) shade -= 0.82 * texture2D(uRingMap, vec2(u, 0.5)).a;
    }
  }

  float cloud = 0.0;
  if (uCloudOn > 0.5) cloud = texture2D(uCloud, vec2(vUv.x + uCloudShift, vUv.y)).r;

  vec3 lit = albedo * (diff * shade * (1.0 - 0.4 * cloud) + 0.012);
  vec3 col = mix(lit, albedo, uFill);

  if (uSpecOn > 0.5) {
    float water = texture2D(uSpec, vUv).r;
    vec3 H = normalize(L + V);
    float sp = pow(max(dot(Ng, H), 0.0), 90.0) * 0.75 + pow(max(dot(Ng, H), 0.0), 12.0) * 0.08;
    col += vec3(1.0, 0.95, 0.85) * sp * water * (1.0 - cloud) * step(0.0, ndlG) * (1.0 - uFill);
  }
  if (uNightOn > 0.5) {
    float night = (1.0 - smoothstep(-0.18, 0.1, ndlG)) * (1.0 - uFill);
    vec3 lights = texture2D(uNight, vUv).rgb;
    col += lights * lights * night * 2.6 * (1.0 - 0.75 * cloud);
  }

  // Haze toward the limb on the sunlit side.
  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.2);
  float day = mix(smoothstep(-0.15, 0.45, ndlG), 1.0, uFill * 0.6);
  col += uRimColor * uRimStrength * fres * day;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const CLOUD_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSunPosV;
uniform float uFill;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalV);
  vec3 L = normalize(uSunPosV - vPosV);
  float ndl = dot(N, L);
  float diff = mix(clamp((ndl + 0.3) / 1.3, 0.0, 1.0), 1.0, uFill);
  float a = texture2D(uMap, vUv).r;
  a = smoothstep(0.02, 0.85, a);
  // Clouds near the terminator pick up a warm tint.
  vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(1.0), smoothstep(-0.05, 0.35, ndl));
  gl_FragColor = vec4(tint * (diff + 0.015), a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ATMO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPosO;
varying vec3 vCamO;
void main() {
  vPosO = position;
  vCamO = (inverse(modelViewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

// Drawn on the inside faces of a shell slightly larger than the planet. In the
// shell's object space the shell has radius 1 and the surface radius uInner.
export const ATMO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uInner;
uniform float uStrength;
uniform float uSunset;
uniform float uFill;
uniform vec3 uSunDirL;
varying vec3 vPosO;
varying vec3 vCamO;
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vPosO - vCamO);
  float tc = max(dot(-vCamO, rd), 0.0);
  vec3 pc = vCamO + rd * tc;               // point of closest approach to the centre
  float h = (length(pc) - uInner) / (1.0 - uInner);
  float a = pow(clamp(1.0 - h, 0.0, 1.0), 2.6) * smoothstep(-0.6, 0.0, h);
  float sun = dot(normalize(pc), uSunDirL);
  float day = mix(smoothstep(-0.28, 0.4, sun), 1.0, uFill * 0.6);
  vec3 col = mix(uColor, vec3(1.0, 0.5, 0.25), uSunset * 0.7 * smoothstep(0.35, -0.12, sun));
  gl_FragColor = vec4(col * a * day * uStrength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const RING_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPosL;
varying float vU;
attribute float radial;
void main() {
  vPosL = position;
  vU = radial;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const RING_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSunDirL;     // Sun direction in the ring's frame (y = planet's spin axis)
uniform vec3 uCamL;        // camera position in the same frame
uniform float uPolar;      // planet's polar / equatorial radius ratio
uniform float uFill;
uniform float uOpacity;
varying vec3 vPosL;
varying float vU;
void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(uMap, vec2(vU, 0.5));
  // Planet's shadow: does the ray toward the Sun pass through the spheroid?
  vec3 s = vec3(1.0, 1.0 / uPolar, 1.0);
  vec3 p = vPosL * s, d = uSunDirL * s;
  float pd = dot(p, d), dd = dot(d, d);
  float closest = sqrt(max(dot(p, p) - pd * pd / dd, 0.0));
  float shadow = pd < 0.0 ? 1.0 - smoothstep(0.975, 1.0, closest) : 0.0;
  // Rings are brighter when the Sun is high above the ring plane, and dimmer
  // when viewed from the side the Sun is not lighting.
  float elev = abs(uSunDirL.y);
  float lit = 0.55 + 0.45 * smoothstep(0.0, 0.35, elev);
  float sameSide = step(0.0, uSunDirL.y * uCamL.y);
  lit *= mix(0.4, 1.0, sameSide);
  lit *= 1.0 - 0.94 * shadow;
  lit = mix(lit, 1.0, uFill);
  gl_FragColor = vec4(tex.rgb * lit, tex.a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SUN_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;
varying vec3 vPosO;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vPosO);
  // Slow convection: wobble the lookup and modulate brightness.
  float n1 = fbm(p * 5.0 + vec3(uTime * 0.03, 0.0, -uTime * 0.02));
  float n2 = fbm(p * 22.0 - vec3(0.0, uTime * 0.09, uTime * 0.05));
  vec2 uv = vUv + (vec2(n1, n2) - 0.5) * 0.008;
  vec3 tex = texture2D(uMap, uv).rgb;
  float mu = max(dot(normalize(vNormalV), normalize(-vPosV)), 0.0);
  float limb = 0.42 + 0.58 * pow(mu, 0.6);
  vec3 col = tex * (1.35 + 0.55 * (n2 - 0.5) + 0.3 * (n1 - 0.5)) * limb;
  col += vec3(1.0, 0.45, 0.12) * pow(1.0 - mu, 2.5) * 0.4;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Asteroid and Kuiper belts: every point carries a circular orbit and is
// advanced on the GPU. The distance mapping matches world.js sceneDistance().
export const BELT_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aOrbit;   // a (AU), phase, inclination, node
attribute float aSeed;
uniform float uDays;
uniform float uScale;    // 0 = compressed distances, 1 = true scale
uniform float uUnit;
uniform float uSize;
varying float vBright;
void main() {
  float a = aOrbit.x;
  float th = aOrbit.y + 0.01720209895 / (a * sqrt(a)) * uDays;
  float ci = cos(aOrbit.z), si = sin(aOrbit.z), cn = cos(aOrbit.w), sn = sin(aOrbit.w);
  float ct = cos(th), st = sin(th);
  vec3 ecl = vec3(cn * ct - sn * st * ci, sn * ct + cn * st * ci, st * si);
  float dist = uUnit * pow(a, mix(0.4, 1.0, uScale));
  vec4 mv = modelViewMatrix * vec4(vec3(ecl.x, ecl.z, -ecl.y) * dist, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.55 + aSeed);
  vBright = 0.35 + 0.65 * aSeed;
  #include <logdepthbuf_vertex>
}
`;

export const BELT_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vBright;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c));
  gl_FragColor = vec4(uColor * vBright, a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
