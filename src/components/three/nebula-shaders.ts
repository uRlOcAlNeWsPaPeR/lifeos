// GLSL for the Dashboard nebula (nebula-root.tsx). Raw ShaderMaterial output —
// no tone mapping or colour-space conversion — so hsl() here reads like CSS.

const COMMON = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCT; i++) {
      v += a * vnoise(p);
      p = ROT * p;
      a *= 0.5;
    }
    return v;
  }
  float sq(float x) { return x * x; }
  vec3 hsl2rgb(float h, float s, float l) {
    vec3 rgb = clamp(abs(mod(h / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
  }
`;

/** Full-screen quads draw in clip space and ignore the camera. */
export const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/* -------------------------------------------------------------------------- */
/*  Sky: nebula clouds, stars, the planet, cursor light, ripples, flash.       */
/* -------------------------------------------------------------------------- */

export const skyFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFlow;
  uniform float uAspect;
  uniform float uHue;
  uniform float uBright;
  uniform float uFlash;
  uniform float uDay;
  uniform float uPx;
  uniform float uCursor;
  uniform vec2 uPar;
  uniform vec2 uPointer;
  uniform vec3 uPlanet;
  uniform vec4 uRipples[4];
  varying vec2 vUv;

  ${COMMON}

  float ridged(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCT_R; i++) {
      float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
      v += a * n * n;
      p = ROT * p;
      a *= 0.5;
    }
    return v;
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
  // Cellular F1 — distance to the nearest feature point — makes crater bowls.
  // x = distance to the nearest feature point, y = that point's own random id
  vec2 cell3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float d = 8.0;
    float id = 0.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = vec3(hash13(i + g), hash13(i + g + 17.1), hash13(i + g + 31.7));
      vec3 r = g + o - f;
      float dd = dot(r, r);
      if (dd < d) {
        d = dd;
        id = hash13(i + g + 5.3);
      }
    }
    return vec2(sqrt(d), id);
  }
  // Only some cells hold a crater, each its own size: a dark bowl, a lit rim,
  // and exactly 0 outside it.
  float crater(vec3 p) {
    vec2 c = cell3(p);
    float rad = 0.2 + 0.25 * c.y;
    float bowl = smoothstep(0.0, rad, c.x);
    float rim = smoothstep(rad * 0.75, rad, c.x) * (1.0 - smoothstep(rad, rad * 1.3, c.x));
    return (bowl * 0.7 + rim * 0.5 - 0.7) * step(0.45, c.y);
  }

  // Where the clouds gather — mirrors the reference: a big bank top-left that
  // pours down behind the left rocks, a glow low on the right, faint wisps
  // between, and a dark pocket behind the clock and the Core.
  float cloudMask(float u, float y) {
    float m = 0.0;
    m += 1.0 * exp(-(sq((u + 0.78) / 0.45) + sq((y - 0.18) / 0.32)));
    m += 0.6 * exp(-(sq((u + 0.62) / 0.35) + sq((y - 0.42) / 0.15)));
    m += 1.1 * exp(-(sq((u + 0.86) / 0.32) + sq((y + 0.06) / 0.17)));
    m += 0.28 * exp(-(sq((u - 0.25) / 0.5) + sq((y - 0.04) / 0.26)));
    m += 0.95 * exp(-(sq((u - 0.84) / 0.3) + sq((y + 0.19) / 0.19)));
    m += 0.18 * exp(-(sq((u - 0.05) / 0.4) + sq((y - 0.3) / 0.2)));
    m *= 1.0 - 0.6 * exp(-(sq(u / 0.42) + sq((y - 0.1) / 0.42)));
    return m;
  }

  float stars(vec2 sp, float density, float keep, float size, float seed) {
    vec2 g = sp * density;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash12(id + seed);
    if (h < keep) return 0.0;
    vec2 off = (vec2(hash12(id + seed + 1.3), hash12(id + seed + 7.1)) - 0.5) * 0.7;
    float d = length(f - off);
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + h * 2.2) + h * 40.0);
    return (1.0 - smoothstep(0.0, size, d)) * tw * (h - keep) / (1.0 - keep);
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float halfW = uAspect * 0.5;

    vec3 cDeep = hsl2rgb(uHue, 0.5, 0.03);
    vec3 cMid = hsl2rgb(uHue + 4.0, 0.7, 0.17);
    vec3 cBright = hsl2rgb(uHue + 10.0, 0.75, 0.44);
    vec3 cHot = hsl2rgb(uHue + 14.0, 0.6, 0.78);

    // ---- clouds: domain-warped noise, slowly flowing, with vein filaments
    vec2 np = p + uPar * 0.012;
    float t = uTime * 0.012 * uFlow;
    vec2 q = vec2(fbm(np * 2.2 + vec2(0.0, t)), fbm(np * 2.2 + vec2(5.2, 1.3) - t));
    vec2 r = vec2(
      fbm(np * 2.2 + 3.0 * q + vec2(1.7, 9.2) + t * 1.6),
      fbm(np * 2.2 + 3.0 * q + vec2(8.3, 2.8) - t * 0.8)
    );
    float f = fbm(np * 2.2 + 2.5 * r);
    float veins = ridged(np * 5.0 + 2.0 * r);
    float mask = cloudMask(np.x / halfW, np.y);
    float dens = (f * f * 1.5 + veins * veins * 0.8 * f) * mask;

    // ---- cursor light and tap ripples light up whatever cloud is there
    vec2 dl = p - uPointer;
    float light = exp(-dot(dl, dl) / 0.05) * uCursor;
    float ring = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 R = uRipples[i];
      if (R.z < 0.0 || uTime < R.z) continue;
      float age = uTime - R.z;
      float front = abs(length(p - R.xy) - age * 0.55);
      ring += exp(-front * front / 0.003) * exp(-age * 1.3) * R.w;
    }
    float lift = 1.0 + light * 1.1 + ring * 1.6;

    vec3 col = cDeep * (0.6 + 0.6 * f);
    col += cMid * smoothstep(0.04, 0.6, dens) * lift;
    col += cBright * smoothstep(0.3, 1.15, dens) * 0.75 * lift;
    col += cHot * smoothstep(0.85, 1.8, dens) * 0.4 * lift;
    col += cMid * (light * 0.1 + ring * 0.06);

    // ---- stars at two depths
    float s1 = stars(p + uPar * 0.004, 70.0, 0.84, 0.09, 3.0);
    float s2 = stars(p + uPar * 0.02, 26.0, 0.94, 0.07, 11.0);
    vec3 starCol = mix(vec3(0.85, 1.0, 0.92), cHot, 0.35);
    col += starCol * (s1 * 0.55 + s2 * 1.1) * (1.0 + light * 1.5 + ring * 3.0);

    // ---- the planet
    vec2 C = uPlanet.xy + uPar * 0.016;
    float Rad = uPlanet.z;
    vec2 d = (p - C) / Rad;
    float rr = length(d);
    vec3 L = normalize(vec3(-0.78, -0.62, mix(-0.7, -0.12, uDay)));
    float side = dot(d / max(rr, 1e-4), normalize(L.xy));
    vec3 rimC = hsl2rgb(uHue + 6.0, 0.75, 0.62);
    float out1 = max(rr - 1.0, 0.0) * Rad;
    col += rimC * (exp(-out1 / 0.02) * 0.5 * smoothstep(-0.2, 0.9, side)
      + exp(-out1 / 0.12) * 0.1 * smoothstep(-0.5, 1.0, side));
    float cover = 1.0 - smoothstep(1.0 - 2.0 * uPx / Rad, 1.0, rr);
    if (cover > 0.0) {
      vec3 n = vec3(d, sqrt(max(0.0, 1.0 - rr * rr)));
      float a = uTime * 0.01;
      float ct = cos(0.4), st = sin(0.4);
      vec3 tn = vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z);
      tn = vec3(cos(a) * tn.x + sin(a) * tn.z, tn.y, -sin(a) * tn.x + cos(a) * tn.z);
      float h = fbm3(tn * 2.6) + crater(tn * 4.5) * 0.24;
      #if CRATERS > 1
        h += crater(tn * 11.0 + 4.0) * 0.12;
      #endif
      vec3 albedo = mix(hsl2rgb(uHue, 0.25, 0.04), hsl2rgb(uHue + 6.0, 0.26, 0.26), clamp(h, 0.0, 1.0));
      float ndl = dot(n, L);
      float lit = smoothstep(-0.08, 0.55, ndl);
      float fres = pow(1.0 - n.z, 2.5);
      vec3 pc = albedo * (0.12 + lit * 0.85);
      pc += rimC * fres * smoothstep(-0.25, 0.85, side) * 0.9;
      pc += rimC * 0.12 * exp(-abs(ndl) * 8.0) * fres;
      vec2 toP = uPointer - C;
      vec3 Lp = normalize(vec3(toP, Rad * 0.8));
      float prox = exp(-dot(toP, toP) / (Rad * Rad * 2.5)) * uCursor;
      pc += albedo * max(dot(n, Lp), 0.0) * prox * 0.45;
      col = mix(col, pc, cover);
    }

    // ---- vignette, Core flash, overall level, dither against banding
    float v = length((vUv - 0.5) * vec2(1.0, 1.1));
    col *= mix(1.0, 0.55, smoothstep(0.35, 0.85, v));
    col += cBright * uFlash * 0.35 * exp(-dot(p, p) / 0.12);
    col *= uBright * (1.0 + uFlash * 0.5);
    col += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* -------------------------------------------------------------------------- */
/*  Ribbons: flat strips along the path, twisting like silk, with sparks.      */
/* -------------------------------------------------------------------------- */

export const ribbonVert = /* glsl */ `
  uniform float uTime;
  uniform float uHalfW;
  uniform float uPhase;
  uniform float uPull;
  uniform vec2 uPointer;
  attribute float aS;
  attribute float aSide;
  attribute vec2 aNormal;
  varying float vS;
  varying float vV;
  varying float vTwist;
  varying float vNear;
  varying float vX;
  void main() {
    float twist = 0.32 + 0.68 * abs(sin(aS * 9.0 + uTime * 0.12 + uPhase));
    float wob = sin(aS * 14.0 - uTime * 0.5 + uPhase) * 0.004
      + sin(aS * 5.0 + uTime * 0.21 + uPhase * 2.0) * 0.008;
    vec4 c = modelMatrix * vec4(position.xy + aNormal * wob, 0.0, 1.0);
    vec2 toP = uPointer - c.xy;
    float d2 = dot(toP, toP);
    c.xy += toP * 0.12 * exp(-d2 / 0.03) * uPull;
    vNear = exp(-d2 / 0.05);
    c.xy += aNormal * aSide * uHalfW * twist;
    vS = aS;
    vX = c.x;
    vV = aSide;
    vTwist = twist;
    gl_Position = projectionMatrix * viewMatrix * c;
  }
`;

export const ribbonFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uBright;
  uniform float uAlpha;
  uniform float uPhase;
  uniform float uCursor;
  uniform float uKnee;
  uniform float uFlare;
  uniform float uPulseSpeed;
  uniform float uCore;
  uniform vec2 uPulses[6];
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying float vS;
  varying float vV;
  varying float vTwist;
  varying float vNear;
  varying float vX;

  float sq(float x) { return x * x; }

  void main() {
    float av = abs(vV);
    float core = exp(-av * av * 90.0) * uCore;
    float sheet = 1.0 - smoothstep(0.0, 1.0, av);
    sheet *= sheet;
    // a strip turned edge-on catches more light
    float edgeOn = 1.0 / (0.45 + vTwist * 0.55);
    float ends = smoothstep(0.0, 0.08, vS) * (1.0 - smoothstep(0.92, 1.0, vS));
    float prof = 0.3
      + 0.9 * exp(-sq((vS - uKnee) / 0.09))
      + 1.0 * exp(-sq((vS - uFlare) / 0.06))
      + 0.12 * (0.5 + 0.5 * sin(vS * 20.0 - uTime * 0.4 * uSpeed));

    float sparks = 0.0;
    for (int k = 0; k < 4; k++) {
      float pos = fract(uTime * 0.035 * uSpeed + float(k) * 0.25 + uPhase * 0.1);
      float dd = pos - vS;
      sparks += dd >= 0.0 ? exp(-dd * 70.0) * 0.55 : exp(-dd * dd / 0.00008);
    }

    float pulses = 0.0;
    for (int k = 0; k < 6; k++) {
      vec2 P = uPulses[k];
      if (P.y < 0.0 || uTime < P.y) continue;
      float age = uTime - P.y;
      float front = abs(abs(vS - P.x) - age * uPulseSpeed);
      pulses += exp(-front * front / 0.0004) * exp(-age * 0.9);
    }

    float i = (core + sheet * 0.22) * prof * edgeOn * uBright;
    i += (core * 1.5 + sheet * 0.25) * (sparks * 0.7 + pulses * 1.8);
    i *= ends * (1.0 + vNear * uCursor * 1.3) * (1.0 - 0.45 * exp(-sq(vX / 0.32)));
    vec3 col = mix(uColor, uHot, clamp(core * (0.35 + sparks + pulses), 0.0, 1.0));
    gl_FragColor = vec4(col * i * uAlpha, 1.0);
  }
`;

/* -------------------------------------------------------------------------- */
/*  Flares: glow + anamorphic streak at the ribbon's bright points.            */
/* -------------------------------------------------------------------------- */

export const flareVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const flareFrag = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    float glow = exp(-r * r * 40.0) + exp(-r * 6.0) * 0.22;
    float streak = exp(-abs(q.y) * 90.0) * exp(-abs(q.x) * 3.5) * 0.7;
    float xs = (exp(-abs(q.x + q.y) * 60.0) + exp(-abs(q.x - q.y) * 60.0)) * exp(-r * 5.0) * 0.14;
    float edge = 1.0 - smoothstep(0.85, 1.0, r);
    float i = (glow + streak + xs) * uIntensity * edge;
    gl_FragColor = vec4(mix(uColor, uHot, clamp(glow * 2.0, 0.0, 1.0)) * i, 1.0);
  }
`;

/* -------------------------------------------------------------------------- */
/*  Rocks: two silhouetted ridges, rim-lit from the glow behind them.          */
/* -------------------------------------------------------------------------- */

/** Covers only the bottom 60% of the screen — the ridges never reach higher. */
export const rocksVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x, uv.y * 0.6);
    gl_Position = vec4(position.x, mix(-1.0, 0.2, uv.y), 0.0, 1.0);
  }
`;

export const rocksFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHue;
  uniform float uBright;
  uniform float uPx;
  uniform float uCursor;
  uniform vec2 uPar;
  uniform vec2 uPointer;
  uniform float uBack[9];
  uniform float uFront[9];
  uniform float uMinHalf;
  varying vec2 vUv;

  ${COMMON}

  float ridgeBase(float u, float k[9]) {
    float x = clamp((u + 1.0) * 4.0, 0.0, 7.999);
    float y = k[0];
    for (int i = 0; i < 8; i++) {
      if (x >= float(i)) {
        float f = clamp(x - float(i), 0.0, 1.0);
        y = mix(k[i], k[i + 1], f * f * (3.0 - 2.0 * f));
      }
    }
    return y;
  }
  float fbm1(float x, float seed) {
    return fbm(vec2(x, seed));
  }
  // the nebula glows hardest behind the left rocks and the right-hand rise
  float glowAt(float u) {
    return 0.06 + 0.94 * exp(-sq((u + 0.78) / 0.3)) + 0.75 * exp(-sq((u - 0.8) / 0.22));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float halfW = max(uAspect * 0.5, uMinHalf);
    vec3 cRim = hsl2rgb(uHue + 8.0, 0.75, 0.55);
    vec3 cRock = hsl2rgb(uHue, 0.3, 0.022);
    vec3 cRockLit = hsl2rgb(uHue + 4.0, 0.32, 0.16);
    vec2 dl = p - uPointer;
    float near = exp(-(dl.x * dl.x) / 0.05 - (dl.y * dl.y) / 0.1) * uCursor;

    vec3 col = vec3(0.0);
    float a = 0.0;

    // back ridge + the mist rising off it
    vec2 pb = p + uPar * vec2(0.03, 0.012);
    float ub = pb.x / halfW;
    float hb = ridgeBase(ub, uBack)
      + (fbm1(pb.x * 7.0, 3.1) - 0.5) * 0.08
      + (vnoise(vec2(pb.x * 18.0, 9.1)) - 0.5) * 0.035
      + (vnoise(vec2(pb.x * 60.0, 1.7)) - 0.5) * 0.008;
    float gb = glowAt(ub);
    float above = pb.y - hb;
    if (above > 0.0) {
      float mist = exp(-above * 16.0) * (0.3 + 0.7 * fbm(vec2(pb.x * 4.0 + uTime * 0.02, pb.y * 6.0)));
      col += cRim * mist * gb * 0.3 * (1.0 + near);
    }
    float db = hb - pb.y;
    float ab = smoothstep(0.0, uPx * 1.5, db);
    if (ab > 0.0) {
      float tex = smoothstep(0.25, 0.75, fbm(pb * vec2(10.0, 14.0) + 2.3));
      float spots = 0.25 + 0.75 * smoothstep(0.35, 0.75, vnoise(vec2(pb.x * 9.0, 2.0)));
      float rim = exp(-db * 70.0) * (0.08 + 0.92 * gb) * spots * (1.0 + near * 1.4);
      float shade = exp(-db * 9.0);
      vec3 rc = mix(cRock, cRockLit, tex * shade * (0.15 + gb * 0.85)) + cRim * rim * 0.85;
      col = mix(col, rc, ab);
      a = ab;
    }

    // front ridge — darker, closer, moves more with the cursor
    vec2 pf = p + uPar * vec2(0.065, 0.025);
    float uf = pf.x / halfW;
    float hf = ridgeBase(uf, uFront)
      + (fbm1(pf.x * 5.0, 11.7) - 0.5) * 0.1
      + (vnoise(vec2(pf.x * 14.0, 5.3)) - 0.5) * 0.045
      + (vnoise(vec2(pf.x * 50.0, 8.1)) - 0.5) * 0.01;
    float df = hf - pf.y;
    float af = smoothstep(0.0, uPx * 1.5, df);
    if (af > 0.0) {
      float gf = glowAt(uf);
      float tex = smoothstep(0.25, 0.75, fbm(pf * vec2(8.0, 11.0) + 7.9));
      float spots = smoothstep(0.45, 0.8, vnoise(vec2(pf.x * 7.0, 6.0)));
      float rim = exp(-df * 85.0) * (0.03 + 0.35 * gf) * spots * (1.0 + near * 1.6);
      float shade = exp(-df * 12.0);
      vec3 rc = mix(cRock * 0.6, cRockLit * 0.6, tex * shade * (0.1 + gf * 0.4)) + cRim * rim * 0.6;
      col = mix(col, rc, af);
      a = max(a, af);
    }

    gl_FragColor = vec4(col * uBright, a);
  }
`;

/* -------------------------------------------------------------------------- */
/*  Motes: a few drifting specks in front of everything, for depth.            */
/* -------------------------------------------------------------------------- */

export const motesVert = /* glsl */ `
  uniform float uTime;
  uniform float uDpr;
  uniform vec2 uPointer;
  attribute vec4 aSeed; // phase, speed, size, twinkle
  varying float vA;
  varying float vNear;
  void main() {
    vec3 p = position;
    float t = uTime * aSeed.y;
    p.x += sin(t * 0.3 + aSeed.x) * 0.03;
    p.y = mod(p.y + uTime * 0.006 * aSeed.y + 0.55, 1.1) - 0.55;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vec2 toP = uPointer - w.xy;
    vNear = exp(-dot(toP, toP) / 0.04);
    vA = 0.45 + 0.55 * sin(uTime * aSeed.w + aSeed.x * 7.0);
    gl_PointSize = aSeed.z * uDpr * (1.0 + vNear * 0.8);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const motesFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uBright;
  varying float vA;
  varying float vNear;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float k = 1.0 - smoothstep(0.0, 1.0, r);
    gl_FragColor = vec4(uColor * k * k * vA * (0.35 + vNear * 0.9) * uBright, 1.0);
  }
`;
