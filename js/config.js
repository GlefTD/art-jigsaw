/**
 * Art Jigsaw — default config (v0.4.0)
 * Autosave + Cheat mode
 */
window.JIGSAW_DEFAULTS = {
  version: '0.4.4',

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

  /** Viewport table surface: default|felt|linen|papyrus|dotted|cork|wood */
  tableStyle: 'default',

  /** Cheat auto-place duration per group (ms). Lower = faster */
  cheatDuration: 550,
  /** Autosave debounce (ms) after moves */
  autosaveDebounce: 900
};
