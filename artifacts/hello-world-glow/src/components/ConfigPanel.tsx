import { useEffect, useRef } from "react";
import type { GlowConfig } from "../blur-glow/config";
import { FONT_OPTIONS } from "../blur-glow/config";
import { WORDS } from "../blur-glow/params";

interface Props {
  open: boolean;
  config: GlowConfig;
  onChange: (patch: Partial<GlowConfig>) => void;
  onClose: () => void;
}

export default function ConfigPanel({ open, config, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const updateColor = (i: number, hex: string) => {
    const next = [...config.phraseInkColors];
    next[i] = hex;
    onChange({ phraseInkColors: next });
  };

  return (
    <div
      ref={panelRef}
      className={`cfg-panel${open ? " cfg-panel--open" : ""}`}
      aria-hidden={!open}
    >
      <div className="cfg-header">
        <span className="cfg-title">Configure</span>
        <button className="cfg-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* ── Animation speed ──────────────────────────────── */}
      <section className="cfg-section">
        <label className="cfg-label">Animation speed</label>
        <div className="cfg-row">
          <span className="cfg-hint">Slow</span>
          <input
            type="range" min="0.3" max="2.5" step="0.05"
            value={config.speedMultiplier}
            onChange={e => onChange({ speedMultiplier: parseFloat(e.target.value) })}
            className="cfg-slider"
          />
          <span className="cfg-hint">Fast</span>
        </div>
        <div className="cfg-value">{config.speedMultiplier.toFixed(2)}×</div>
      </section>

      {/* ── Font ─────────────────────────────────────────── */}
      <section className="cfg-section">
        <label className="cfg-label">Font</label>
        <div className="cfg-font-grid">
          {FONT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`cfg-font-btn${config.fontFamily === opt.value ? " cfg-font-btn--active" : ""}`}
              style={{ fontFamily: opt.value }}
              onClick={() => onChange({ fontFamily: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Letter spacing ───────────────────────────────── */}
      <section className="cfg-section">
        <label className="cfg-label">Letter spacing</label>
        <div className="cfg-row">
          <span className="cfg-hint">Tight</span>
          <input
            type="range" min="0" max="0.08" step="0.002"
            value={config.letterSpacingFactor}
            onChange={e => onChange({ letterSpacingFactor: parseFloat(e.target.value) })}
            className="cfg-slider"
          />
          <span className="cfg-hint">Wide</span>
        </div>
        <div className="cfg-value">{(config.letterSpacingFactor * 1000).toFixed(0)} / 1000 em</div>
      </section>

      {/* ── Phrase colors ────────────────────────────────── */}
      <section className="cfg-section">
        <label className="cfg-label">Phrase colours</label>
        <div className="cfg-colors">
          {WORDS.map((word, i) => (
            <div key={i} className="cfg-color-row">
              <span className="cfg-phrase">{word}</span>
              <label className="cfg-swatch-wrap" title={`Colour for "${word}"`}>
                <span className="cfg-swatch" style={{ background: config.phraseInkColors[i] }} />
                <input
                  type="color"
                  value={config.phraseInkColors[i]}
                  onChange={e => updateColor(i, e.target.value)}
                  className="cfg-color-input"
                  aria-label={`Colour for ${word}`}
                />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
