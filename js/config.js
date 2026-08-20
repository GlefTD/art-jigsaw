/**
 * Art Jigsaw — default config (v0.3.0)
 * Override at runtime via Config panel → saved in localStorage.
 * Push this file to git as the project defaults.
 */
window.JIGSAW_DEFAULTS = {
  version: '0.3.0',

  // --- Tabs (classic / round) ---
  /** Multiplier on computed tab size (1 = previous default, try 1.2–1.5 if tabs feel small) */
  tabScale: 1.35,
  /** Fraction of edge length used by the tooth base (classic) */
  tabBaseFactor: 0.42,
  /** Tooth projection relative to tabSize (classic) */
  tabHeightFactor: 1.05,
  /** Round-tab head radius scale */
  roundTabScale: 1.0,

  // --- Snap / play ---
  /** Snap distance as fraction of min(pieceW, pieceH) */
  snapFactor: 0.38,
  /** Min / max snap in px */
  snapMin: 12,
  snapMax: 32,

  // --- Scatter ---
  /** How far free singletons are thrown from the board (0.2–0.6) */
  scatterSpread: 0.38,

  // --- Visual ---
  accent: '#c9a227',
  bg: '#1a1a1e',
  panel: '#25252b',
  text: '#f0e6d2',
  muted: '#9a9080',
  boardBg: '#2a2a30',
  /** Emboss / bevel strength (0–2) */
  embossStrength: 1.0,
  /** Drop-shadow strength (0–2) */
  shadowStrength: 1.0,

  // --- Performance ---
  /** Cap world base size for very high piece counts */
  maxBaseSize: 1400,
  /** Disable snap glow animation (faster on weak devices) */
  reduceMotion: false
};
