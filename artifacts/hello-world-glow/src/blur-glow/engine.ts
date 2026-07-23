import { VERT, BLUR_FRAG, COMPOSITE_FRAG } from "./shaders";
import { makeWordMask } from "./text-mask";
import {
  PALETTES,
  WORDS,
  GRAIN,
  MORPH_LEAD,
  MORPH_LAG,
  CAST_DIR,
  CAST_STEP,
  HOLD_SCALE,
  LETTER_SPREAD,
  BREATH,
  WARP_RADIUS,
  WARP_AMP,
  WARP_SWIRL,
  WARP_DRAG,
  WARP_STRETCH,
  paletteUniforms,
  lerpPaletteUniforms,
  type PaletteUniforms,
} from "./params";
import type { GlowConfig } from "./config";
import { DEFAULT_CONFIG } from "./config";

const FOCUS_AMT = 1.5;

const MORPH_SEC = 0.8;
const HOLD_MS = 1200;

const LEVELS = [
  { scale: 0.5, radius: 2 },
  { scale: 0.25, radius: 3 },
  { scale: 0.125, radius: 3 },
  { scale: 0.0625, radius: 3 },
];

type Target = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

export class BlurGlow {
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;

  private blurProg: WebGLProgram | null = null;
  private compProg: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;

  private maskA: WebGLTexture | null = null;
  private maskB: WebGLTexture | null = null;
  private focusA: [number, number] = [0.35, 0.65];
  private focusB: [number, number] = [0.35, 0.65];
  private levels: { out: Target; tmp: Target }[] = [];

  private blurU: Record<string, WebGLUniformLocation | null> = {};
  private compU: Record<string, WebGLUniformLocation | null> = {};

  private cfg: GlowConfig = { ...DEFAULT_CONFIG };
  private raf = 0;
  private running = false;
  private destroyed = false;
  private start0 = 0;
  private lastT = 0;
  private revealed = false;

  /** Called whenever the engine advances to a new word (after the morph finishes). */
  onWordChange?: (wordIdx: number) => void;

  private wordIdx = 0;
  // Play-once sequencing
  private readonly LOOP_START = 4; // "and I'm not" — loop begins here
  private playedOnce = false;
  private morph = 0;
  private morphEased = 0;
  private morphGlow = 0;
  private morphBody = 0;
  private morphing = false;
  private holdUntil = 0;

  private paletteFrom: PaletteUniforms = paletteUniforms(PALETTES[0]);
  private paletteTo: PaletteUniforms = paletteUniforms(PALETTES[0]);

  private curX = 0.5;
  private curY = 0.5;
  private tgtX = 0.5;
  private tgtY = 0.5;
  private curOn = 0;
  private tgtOn = 0;

  private velX = 0;
  private velY = 0;
  private prevX = 0.5;
  private prevY = 0.5;

  constructor(host: HTMLElement, cfg?: Partial<GlowConfig>) {
    this.host = host;
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };

    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      opacity: "0",
      transition: "opacity 0.6s ease",
    });
    host.appendChild(this.canvas);

    const gl = this.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    }) as WebGLRenderingContext | null;
    if (!gl) return;
    this.gl = gl;

    this.buildPrograms();
    if (!this.blurProg || !this.compProg) return;
    // resolveFont only as fallback when no fontFamily was provided
    this.resize();

    host.addEventListener("pointermove", this.onMove);
    host.addEventListener("pointerleave", this.onLeave);
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[blur-glow] shader:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  private link(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl!;
    const v = this.compile(gl.VERTEX_SHADER, vs);
    const f = this.compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[blur-glow] link:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  private buildPrograms() {
    const gl = this.gl!;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.blurProg = this.link(VERT, BLUR_FRAG);
    this.compProg = this.link(VERT, COMPOSITE_FRAG);
    if (!this.blurProg || !this.compProg) return;

    const BU = (n: string) => gl.getUniformLocation(this.blurProg!, n);
    this.blurU = {
      uTex: BU("uTex"),
      uTexB: BU("uTexB"),
      uDir: BU("uDir"),
      uMorph: BU("uMorph"),
      uUseMorph: BU("uUseMorph"),
      uFocus: BU("uFocus"),
      uFocusAmt: BU("uFocusAmt"),
      uPartOut: BU("uPartOut"),
      uPartIn: BU("uPartIn"),
      uLetterSpread: BU("uLetterSpread"),
    };
    const CU = (n: string) => gl.getUniformLocation(this.compProg!, n);
    this.compU = {
      uMask: CU("uMask"),
      uMaskB: CU("uMaskB"),
      uL0: CU("uL0"),
      uL1: CU("uL1"),
      uL2: CU("uL2"),
      uL3: CU("uL3"),
      uRes: CU("uRes"),
      uMorph: CU("uMorph"),
      uCursor: CU("uCursor"),
      uCursorOn: CU("uCursorOn"),
      uWarpRadius: CU("uWarpRadius"),
      uWarpAmp: CU("uWarpAmp"),
      uWarpSwirl: CU("uWarpSwirl"),
      uWarpVel: CU("uWarpVel"),
      uWarpDrag: CU("uWarpDrag"),
      uWarpStretch: CU("uWarpStretch"),
      uPhase: CU("uPhase"),
      uBloom: CU("uBloom"),
      uCast0: CU("uCast0"),
      uCast1: CU("uCast1"),
      uCast2: CU("uCast2"),
      uCast3: CU("uCast3"),
      uPartOut: CU("uPartOut"),
      uPartIn: CU("uPartIn"),
      uLetterSpread: CU("uLetterSpread"),
      uFront: CU("uFront"),
      uPos: CU("uPos[0]"),
      uCol: CU("uCol[0]"),
      uInk: CU("uInk"),
      uPaper: CU("uPaper"),
      uGrain: CU("uGrain"),
    };
  }

  private bindQuad(prog: WebGLProgram) {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private uploadPalette(u: { positions: number[]; colors: number[]; ink: number[]; paper: number[] }) {
    const gl = this.gl;
    if (!gl || !this.compProg) return;
    gl.useProgram(this.compProg);
    gl.uniform1fv(this.compU.uPos!, new Float32Array(u.positions));
    gl.uniform3fv(this.compU.uCol!, new Float32Array(u.colors));
    gl.uniform3fv(this.compU.uInk!, new Float32Array(u.ink));
    gl.uniform3fv(this.compU.uPaper!, new Float32Array(u.paper));
    this.canvas.style.background = `rgb(${u.paper.map((c) => Math.round(c * 255)).join(",")})`;
  }

  /** Returns palette uniforms for a phrase, with the configured ink colour applied. */
  private phraseUniforms(phraseIdx: number): PaletteUniforms {
    const base = paletteUniforms(PALETTES[phraseIdx % PALETTES.length]);
    const hex = this.cfg.phraseInkColors[phraseIdx % this.cfg.phraseInkColors.length];
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return { ...base, ink: [r, g, b] };
    }
    return base;
  }

  private applyPalette(i: number) {
    const pu = this.phraseUniforms(i);
    this.paletteFrom = pu;
    this.paletteTo = pu;
    this.uploadPalette(pu);
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  private freeLevels() {
    const gl = this.gl;
    if (!gl) return;
    for (const lv of this.levels) {
      gl.deleteFramebuffer(lv.out.fb);
      gl.deleteTexture(lv.out.tex);
      gl.deleteFramebuffer(lv.tmp.fb);
      gl.deleteTexture(lv.tmp.tex);
    }
    this.levels = [];
  }
  private allocLevels() {
    this.freeLevels();
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.levels = LEVELS.map((l) => {
      const w = Math.max(2, Math.round(W * l.scale));
      const h = Math.max(2, Math.round(H * l.scale));
      return { out: this.makeTarget(w, h), tmp: this.makeTarget(w, h) };
    });
  }

  private uploadMask(src: HTMLCanvasElement, existing: WebGLTexture | null): WebGLTexture {
    const gl = this.gl!;
    const tex = existing ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  private get words(): string[] {
    return this.cfg.words ?? WORDS;
  }

  private buildMask() {
    const gl = this.gl;
    if (!gl) return;
    const m = makeWordMask(this.words[this.wordIdx % this.words.length], this.canvas.width, this.canvas.height, this.cfg.fontFamily, this.cfg.letterSpacingFactor);
    this.maskA = this.uploadMask(m.canvas, this.maskA);
    this.focusA = [m.x0, m.x1];
  }

  private nextWordIdx(): number {
    const words = this.words;
    if (this.playedOnce || this.wordIdx === words.length - 1) {
      // Loop between LOOP_START and LOOP_START+1 (or stay on last if only one word)
      if (words.length === 1) return 0;
      const loopStart = Math.min(this.LOOP_START, words.length - 2);
      return this.wordIdx === loopStart ? loopStart + 1 : loopStart;
    }
    return this.wordIdx + 1;
  }

  private buildMaskB() {
    const gl = this.gl;
    if (!gl) return;
    const next = this.nextWordIdx();
    const m = makeWordMask(this.words[next], this.canvas.width, this.canvas.height, this.cfg.fontFamily, this.cfg.letterSpacingFactor);
    this.maskB = this.uploadMask(m.canvas, this.maskB);
    this.focusB = [m.x0, m.x1];
  }

  private resize() {
    const gl = this.gl;
    if (!gl) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h && this.levels.length) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.allocLevels();
    this.buildMask();
    this.buildMaskB();

    if (!this.morphing) this.applyPalette(this.wordIdx);
  }

  private beginMorph() {
    this.morph = 0;
    this.morphing = true;
    // Palette is 1-to-1 with word index; apply per-phrase ink colour overrides
    this.paletteFrom = this.phraseUniforms(this.wordIdx);
    this.paletteTo = this.phraseUniforms(this.nextWordIdx());
  }
  private finishMorph() {
    // If we just finished showing "an AI ;P" for the first time, mark the run complete
    if (!this.playedOnce && this.wordIdx === this.words.length - 1) {
      this.playedOnce = true;
    }

    const next = this.nextWordIdx();

    // Swap textures: B becomes the new A
    const t = this.maskA;
    this.maskA = this.maskB;
    this.maskB = t;
    this.focusA = this.focusB;
    this.morph = 0;
    this.morphing = false;

    this.wordIdx = next;
    this.buildMaskB(); // prep the texture for the word after next
    this.paletteFrom = this.paletteTo;
    this.uploadPalette(this.paletteTo);
    this.onWordChange?.(this.wordIdx);
  }

  private render(bloom: number, phase: number) {
    const gl = this.gl;
    if (!gl || !this.blurProg || !this.compProg || !this.levels.length) return;

    gl.useProgram(this.blurProg);
    this.bindQuad(this.blurProg);
    gl.disable(gl.BLEND);

    const m = this.morph;
    const em = m * m * m * (m * (m * 6 - 15) + 10);

    this.morphGlow = Math.pow(em, MORPH_LEAD);
    this.morphBody = Math.pow(em, MORPH_LAG);
    this.morphEased = em;

    const clocks = (base: number): [number, number] => [
      Math.min(1, base * (1 + BREATH)),
      Math.max(0, Math.min(1, base * (1 + BREATH) - BREATH)),
    ];
    const [glowOut, glowIn] = clocks(this.morphGlow);
    const [bodyOut, bodyIn] = clocks(this.morphBody);

    const front = this.morphing ? Math.sin(Math.PI * em) : 0;
    const fx0 = this.focusA[0] + (this.focusB[0] - this.focusA[0]) * em;
    const fx1 = this.focusA[1] + (this.focusB[1] - this.focusA[1]) * em;
    gl.uniform2f(this.blurU.uFocus!, fx0, fx1);
    gl.uniform1f(this.blurU.uFocusAmt!, FOCUS_AMT);

    gl.uniform1f(this.blurU.uMorph!, this.morphGlow);
    gl.uniform1f(this.blurU.uPartOut!, glowOut);
    gl.uniform1f(this.blurU.uPartIn!, glowIn);
    gl.uniform1f(this.blurU.uLetterSpread!, LETTER_SPREAD);
    for (let i = 0; i < this.levels.length; i++) {
      const lv = this.levels[i];
      const r = LEVELS[i].radius;
      const srcTex = i === 0 ? this.maskA! : this.levels[i - 1].out.tex;
      const useMorph = i === 0 && this.morphing ? 1 : 0;

      gl.bindFramebuffer(gl.FRAMEBUFFER, lv.tmp.fb);
      gl.viewport(0, 0, lv.tmp.w, lv.tmp.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(this.blurU.uTex!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskB ?? this.maskA!);
      gl.uniform1i(this.blurU.uTexB!, 1);
      gl.uniform1f(this.blurU.uUseMorph!, useMorph);
      gl.uniform2f(this.blurU.uDir!, r / lv.tmp.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, lv.out.fb);
      gl.viewport(0, 0, lv.out.w, lv.out.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lv.tmp.tex);
      gl.uniform1i(this.blurU.uTex!, 0);
      gl.uniform1f(this.blurU.uUseMorph!, 0);
      gl.uniform2f(this.blurU.uDir!, 0, r / lv.out.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compProg);
    this.bindQuad(this.compProg);

    if (this.morphing) {
      this.uploadPalette(lerpPaletteUniforms(this.paletteFrom, this.paletteTo, this.morphEased));
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskA!);
    gl.uniform1i(this.compU.uMask!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskB ?? this.maskA!);
    gl.uniform1i(this.compU.uMaskB!, 1);
    const levelUnits = ["uL0", "uL1", "uL2", "uL3"];
    for (let i = 0; i < this.levels.length; i++) {
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.levels[i].out.tex);
      gl.uniform1i(this.compU[levelUnits[i]]!, 2 + i);
    }
    gl.uniform2f(this.compU.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.compU.uMorph!, this.morphBody);
    gl.uniform1f(this.compU.uPartOut!, bodyOut);
    gl.uniform1f(this.compU.uPartIn!, bodyIn);
    gl.uniform1f(this.compU.uLetterSpread!, LETTER_SPREAD);
    gl.uniform1f(this.compU.uFront!, front);
    gl.uniform2f(this.compU.uCursor!, this.curX, this.curY);
    gl.uniform1f(this.compU.uCursorOn!, this.curOn);
    gl.uniform1f(this.compU.uWarpRadius!, WARP_RADIUS);
    gl.uniform1f(this.compU.uWarpAmp!, WARP_AMP);
    gl.uniform1f(this.compU.uWarpSwirl!, WARP_SWIRL);
    gl.uniform2f(this.compU.uWarpVel!, this.velX, this.velY);
    gl.uniform1f(this.compU.uWarpDrag!, WARP_DRAG);
    gl.uniform1f(this.compU.uWarpStretch!, WARP_STRETCH);
    gl.uniform1f(this.compU.uPhase!, phase);
    gl.uniform1f(this.compU.uBloom!, bloom);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const casts = [this.compU.uCast0, this.compU.uCast1, this.compU.uCast2, this.compU.uCast3];
    for (let i = 0; i < casts.length; i++) {
      const s = CAST_STEP[i];
      gl.uniform2f(casts[i]!, (CAST_DIR[0] * s) / aspect, CAST_DIR[1] * s);
    }
    gl.uniform1f(this.compU.uGrain!, GRAIN);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.reveal();
  }

  private holdFor(i: number) {
    return HOLD_MS * (HOLD_SCALE[i % this.words.length] ?? 1) / this.cfg.speedMultiplier;
  }

  private frame = (now: number) => {
    if (!this.running || this.destroyed) return;
    if (!this.start0) {
      this.start0 = now;
      this.lastT = now;
      this.holdUntil = now + this.holdFor(this.wordIdx);
    }
    const t = (now - this.start0) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastT) / 1000));
    this.lastT = now;

    this.curX = this.tgtX;
    this.curY = this.tgtY;

    this.curOn += (this.tgtOn - this.curOn) * (1 - Math.pow(1 - 0.42, dt * 60));

    const vx = (this.curX - this.prevX) / dt;
    const vy = (this.curY - this.prevY) / dt;
    this.prevX = this.curX;
    this.prevY = this.curY;
    const vk = 1 - Math.pow(1 - 0.5, dt * 60);
    this.velX += (vx - this.velX) * vk;
    this.velY += (vy - this.velY) * vk;
    const vmag = Math.hypot(this.velX, this.velY);
    const VMAX = 2.2;
    if (vmag > VMAX) {
      this.velX = (this.velX / vmag) * VMAX;
      this.velY = (this.velY / vmag) * VMAX;
    }

    // Don't morph when there is only one word — hold it forever
    if (!this.morphing && this.words.length > 1 && now >= this.holdUntil) this.beginMorph();
    if (this.morphing) {
      this.morph = Math.min(1, this.morph + dt / (MORPH_SEC / this.cfg.speedMultiplier));
      if (this.morph >= 1) {
        this.finishMorph();
        this.holdUntil = now + this.holdFor(this.wordIdx);
      }
    }

    const bloom = 1.0 + 0.16 * Math.sin(t * 0.6);
    const phase = t * 0.5;
    this.render(bloom, phase);
    this.raf = requestAnimationFrame(this.frame);
  };

  private reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.canvas.style.opacity = "1";
  }

  private onMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.tgtX = (e.clientX - r.left) / r.width;
    this.tgtY = 1 - (e.clientY - r.top) / r.height;
    this.tgtOn = 1;
  };
  private onLeave = () => {
    this.tgtOn = 0;
  };

  configure(cfg: Partial<GlowConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
    this.wordIdx = 0;
    this.playedOnce = false;
    this.morphing = false;
    this.holdUntil = 0;
    // Rebuild word textures immediately if the canvas is already sized
    if (this.canvas.width > 1 && this.gl) {
      this.buildMask();
      this.buildMaskB();
      this.applyPalette(0);
    }
  }

  start() {
    if (this.running || !this.gl || !this.compProg) return;
    this.running = true;
    this.start0 = 0;
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  renderStill(instant = false) {
    if (!this.gl || !this.compProg) return;
    if (instant && !this.revealed) {
      this.canvas.style.transition = "none";
      this.revealed = true;
      this.canvas.style.opacity = "1";
    }
    this.render(1.0, 0);
  }
  /** Apply partial config changes at runtime — live-updates the glow immediately. */
  updateConfig(patch: Partial<GlowConfig>) {
    const prev = this.cfg;
    this.cfg = { ...this.cfg, ...patch };

    const maskDirty =
      (patch.fontFamily !== undefined && patch.fontFamily !== prev.fontFamily) ||
      (patch.letterSpacingFactor !== undefined && patch.letterSpacingFactor !== prev.letterSpacingFactor);

    if (maskDirty) {
      this.buildMask();
      this.buildMaskB();
    }

    // Re-upload current palette with possibly new ink colour
    if (!this.morphing) {
      const pu = this.phraseUniforms(this.wordIdx);
      this.paletteFrom = pu;
      this.paletteTo = pu;
      this.uploadPalette(pu);
    }

    if (!this.running) this.renderStill();
  }

  onResize() {
    this.resize();
    if (!this.running) this.renderStill();
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.host.removeEventListener("pointermove", this.onMove);
    this.host.removeEventListener("pointerleave", this.onLeave);
    const gl = this.gl;
    if (gl) {
      this.freeLevels();
      if (this.maskA) gl.deleteTexture(this.maskA);
      if (this.maskB) gl.deleteTexture(this.maskB);
      if (this.quad) gl.deleteBuffer(this.quad);
      if (this.blurProg) gl.deleteProgram(this.blurProg);
      if (this.compProg) gl.deleteProgram(this.compProg);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.canvas.remove();
  }
}
