/**
 * Art Jigsaw — default config (v0.4.12)
 */
window.JIGSAW_DEFAULTS = {
  version: '0.4.12',

  tabScale: 2,
  tabBaseFactor: 0.55,
  tabHeightFactor: 1,
  roundTabScale: 1,
  pathSegments: 20,

  snapFactor: 0.38,
  snapMin: 12,
  snapMax: 32,
  scatterSpread: 0.4,

  accent: '#c9a227',
  bg: '#1a1a1e',
  panel: '#25252b',
  text: '#f0e6d2',
  muted: '#9a9080',
  boardBg: '#2a2a30',
  embossStrength: 0.8,
  shadowStrength: 0.5,
  shadowBlur: 0.5,

  maxBaseSize: 1400,
  reduceMotion: false,
  createBatchSize: 256,

  tableStyle: 'default',
  mimicOpacity: 0.5,
  mimicBlur: 75,

  cheatDuration: 550,
  cheatStyle: 'largest',

  /** Wiggle visual amplitude in px */
  wiggleIntensity: 6,
  /** How long neighbours wiggle (seconds) */
  wiggleDurationSec: 2,
  /** Shake ease: 0.1 hard → 1.0 very easy (gratteux mode) */
  wiggleSensitivity: 0.55,
  /** Same-piece taps needed to trigger (2–20) */
  wiggleTapCount: 5,
  /** Second-finger arm radius in screen px */
  wiggleTouchRadius: 130,

  autosaveDebounce: 900
};
