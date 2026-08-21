/**
 * Art Jigsaw — default config (v0.4.11)
 */
window.JIGSAW_DEFAULTS = {
  version: '0.4.11',

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

  /** Cheat auto-place duration per group (ms) */
  cheatDuration: 550,
  /** Cheat placement order: largest | circular */
  cheatStyle: 'largest',
  /** Wiggle cheat intensity in px */
  wiggleIntensity: 6,
  /** Wiggle cheat duration in ms */
  wiggleDuration: 2000,

  autosaveDebounce: 900
};
