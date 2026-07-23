export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const BLUR_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uMorph;
uniform sampler2D uTexB;
uniform float uUseMorph;
uniform float uPartOut;
uniform float uPartIn;
uniform float uLetterSpread;

uniform vec2  uFocus;
uniform float uFocusAmt;

float bhash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float bvnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = bhash(i), b2 = bhash(i+vec2(1.0,0.0));
  float c = bhash(i+vec2(0.0,1.0)), d = bhash(i+vec2(1.0,1.0));
  return mix(mix(a,b2,u.x), mix(c,d,u.x), u.y);
}
float bfbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * bvnoise(p); p = p * 2.0 + 11.0; a *= 0.5; }
  return v;
}

float bTransition(vec2 uv, float m){
  vec2 q = vec2(bfbm(uv * 2.1 + 3.7), bfbm(uv * 2.1 - 1.3));
  float n = bfbm(uv * 3.0 + q * 1.1);
  float bias = (uv.x * 0.8 + uv.y * 0.2) * 0.30;
  float field = clamp(n * 0.74 + bias, 0.0, 1.0);
  const float BAND = 0.26;
  float thr = mix(1.0 + BAND, -BAND, m);
  return smoothstep(thr - BAND, thr + BAND, field);
}

float bLetterPhase(sampler2D tex, vec2 uv, float m, float spread){
  float idx = texture2D(tex, uv).r;
  return clamp((m * (1.0 + spread)) - idx * spread, 0.0, 1.0);
}
vec4 samp(vec2 uv){
  if (uUseMorph > 0.5) {
    vec4 aTex = texture2D(uTex, uv);
    vec4 bTex = texture2D(uTexB, uv);
    float outM = bTransition(uv, bLetterPhase(uTex,  uv, uPartOut, uLetterSpread));
    float inM  = bTransition(uv, bLetterPhase(uTexB, uv, uPartIn,  uLetterSpread));
    return max(aTex * (1.0 - outM), bTex * inM);
  }
  return texture2D(uTex, uv);
}
void main(){
  float mid = (uFocus.x + uFocus.y) * 0.5;
  float halfW = max(0.001, (uFocus.y - uFocus.x) * 0.5);
  float ends = clamp(abs(vUv.x - mid) / halfW, 0.0, 1.6);
  float focus = 1.0 + uFocusAmt * ends * ends;
  vec2 dir = uDir * focus;

  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  vec4 c = samp(vUv) * w0;
  c += samp(vUv + dir * 1.0) * w1;
  c += samp(vUv - dir * 1.0) * w1;
  c += samp(vUv + dir * 2.0) * w2;
  c += samp(vUv - dir * 2.0) * w2;
  c += samp(vUv + dir * 3.0) * w3;
  c += samp(vUv - dir * 3.0) * w3;
  c += samp(vUv + dir * 4.0) * w4;
  c += samp(vUv - dir * 4.0) * w4;
  gl_FragColor = c;
}`;

export const COMPOSITE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;

uniform sampler2D uMask;
uniform sampler2D uMaskB;
uniform sampler2D uL0;
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform sampler2D uL3;
uniform vec2  uRes;
uniform float uMorph;
uniform float uPartOut;
uniform float uPartIn;
uniform float uLetterSpread;
uniform float uFront;
uniform vec2  uCursor;
uniform float uCursorOn;
uniform float uWarpRadius;
uniform float uWarpAmp;
uniform float uWarpSwirl;
uniform vec2  uWarpVel;
uniform float uWarpDrag;
uniform float uWarpStretch;
uniform float uPhase;
uniform float uBloom;
uniform vec2  uCast0;
uniform vec2  uCast1;
uniform vec2  uCast2;
uniform vec2  uCast3;

uniform float uPos[5];
uniform vec3  uCol[5];
uniform vec3  uInk;
uniform vec3  uPaper;
uniform float uGrain;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b2 = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b2,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.0 + 11.0; a *= 0.5; }
  return v;
}

float transitionMask(vec2 uv, float m){
  vec2 q = vec2(fbm(uv * 2.1 + 3.7), fbm(uv * 2.1 - 1.3));
  float n = fbm(uv * 3.0 + q * 1.1);
  float bias = (uv.x * 0.8 + uv.y * 0.2) * 0.30;
  float field = clamp(n * 0.74 + bias, 0.0, 1.0);
  const float BAND = 0.26;
  float thr = mix(1.0 + BAND, -BAND, m);
  return smoothstep(thr - BAND, thr + BAND, field);
}

float letterPhase(sampler2D tex, vec2 uv, float m, float spread){
  float idx = texture2D(tex, uv).r;
  float local = (m * (1.0 + spread)) - idx * spread;
  return clamp(local, 0.0, 1.0);
}
float coverA(vec2 uv){ return texture2D(uMask, uv).a; }
float coverB(vec2 uv){ return texture2D(uMaskB, uv).a; }

float cover(vec2 uv){
  float outM = transitionMask(uv, letterPhase(uMask,  uv, uPartOut, uLetterSpread));
  float inM  = transitionMask(uv, letterPhase(uMaskB, uv, uPartIn,  uLetterSpread));
  return max(coverA(uv) * (1.0 - outM), coverB(uv) * inM);
}

vec3 gradientMap(float x){
  vec3 c = uCol[0];
  c = mix(c, uCol[1], smoothstep(uPos[0], uPos[1], x));
  c = mix(c, uCol[2], smoothstep(uPos[1], uPos[2], x));
  c = mix(c, uCol[3], smoothstep(uPos[2], uPos[3], x));
  c = mix(c, uCol[4], smoothstep(uPos[3], uPos[4], x));
  return c;
}

vec3 softLight(vec3 base, float g){
  vec3 s = vec3(g);
  vec3 lo = 2.0*base*s + base*base*(1.0 - 2.0*s);
  vec3 hi = 2.0*base*(1.0 - s) + sqrt(base)*(2.0*s - 1.0);
  return mix(lo, hi, step(0.5, s));
}

vec2 warpUV(vec2 uv){
  if (uCursorOn < 0.001) return uv;
  float asp = uRes.x / max(1.0, uRes.y);
  vec2 d = (uv - uCursor) * vec2(asp, 1.0);
  float r = length(d);
  float R = uWarpRadius;
  if (r > R || r < 1e-5) return uv;
  float f = 1.0 - r / R;
  f = f * f * (3.0 - 2.0 * f);
  vec2 dir = d / r;
  vec2 swirl = vec2(-dir.y, dir.x);
  vec2 push = mix(dir, swirl, uWarpSwirl);

  push += uWarpVel * uWarpDrag;

  float speed = length(uWarpVel);
  if (speed > 0.02) {
    vec2 vdir = uWarpVel / speed;
    float along = dot(d / r, vdir);
    float stretch = 1.0 + uWarpStretch * clamp(speed, 0.0, 1.0) * (along * along - 0.35);
    f *= clamp(stretch, 0.0, 2.2);
  }

  float ripple = 1.0 + 0.16 * sin(r / R * 3.1416 - uPhase * 5.0);

  float lead = 0.5 + 0.5 * dot(normalize(d + 1e-6), normalize(uWarpVel + 1e-6));
  float visc = mix(1.15, 0.85, lead);

  return uv + push * (f * ripple * visc * uWarpAmp * uCursorOn) / vec2(asp, 1.0);
}

void main(){
  vec2 uv = warpUV(vUv);

  float cd = distance(vUv * uRes, uCursor * uRes);
  float hot = uCursorOn * smoothstep(min(uRes.x, uRes.y) * uWarpRadius * 2.4, 0.0, cd);

  float b = 1.0 + (uBloom - 1.0) * 1.25 + 0.28 * hot;

  float glow =
      1.00 * cover(uv)
    + 0.92 * texture2D(uL0, uv + uCast0).a
    + 0.78 * texture2D(uL1, vUv + uCast1).a * b
    + 0.58 * texture2D(uL2, vUv + uCast2).a * b
    + 0.40 * texture2D(uL3, vUv + uCast3).a * b;
  glow = clamp(glow / 2.45, 0.0, 1.0);

  float field = pow(glow, 0.6);

  field = clamp(field + hot * 0.32 * field, 0.0, 1.0);

  if (uFront > 0.001) {
    vec2 q = vec2(fbm(uv * 2.1 + 3.7), fbm(uv * 2.1 - 1.3));
    float n = fbm(uv * 3.0 + q * 1.1);
    float fieldN = clamp(n * 0.74 + (uv.x * 0.8 + uv.y * 0.2) * 0.30, 0.0, 1.0);
    float thrIn = mix(1.26, -0.26, uPartIn);
    float edge = 1.0 - smoothstep(0.0, 0.30, abs(fieldN - thrIn));

    field = clamp(field + edge * uFront * 0.30 * smoothstep(0.02, 0.45, glow), 0.0, 1.0);
  }

  float drift = 0.022 * sin(uPhase + uv.x * 3.0 + uv.y * 2.0);

  float t = clamp(1.0 - field + drift - hot * 0.22, 0.0, 1.0);
  vec3 col = gradientMap(t);

  vec3 bounced = mix(uPaper, uCol[2], texture2D(uL3, vUv + uCast3).a * 0.16);
  col = mix(bounced, col, smoothstep(0.0, 0.06, field));

  float softCov = clamp(texture2D(uL0, uv).a * 1.05 + cover(uv) * 0.25, 0.0, 1.0);

  float interior = smoothstep(0.18, 0.62, softCov);

  vec3 bodyCol = mix(uInk, uCol[1], 0.5);
  bodyCol = mix(bodyCol, uCol[2], (1.0 - interior) * 0.5);

  float solid = smoothstep(0.35, 0.95, cover(uv));
  bodyCol = mix(mix(bodyCol, uCol[2], 0.30), mix(bodyCol, uInk, 0.22), solid);
  col = mix(col, bodyCol, interior * 0.9);

  float g = hash(gl_FragCoord.xy);
  vec3 grained = softLight(col, g);
  col = mix(col, grained, uGrain * (0.5 + 0.7 * field));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
