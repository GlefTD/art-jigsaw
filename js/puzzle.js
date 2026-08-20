    // ---- Config (defaults from js/config.js + localStorage override) ----
    const STORAGE_KEY = 'art-jigsaw-config';
    function loadConfig() {
      const base = Object.assign({}, window.JIGSAW_DEFAULTS || {});
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) Object.assign(base, JSON.parse(raw));
      } catch (_) {}
      return base;
    }
    let CFG = loadConfig();

    function applyThemeFromConfig() {
      const root = document.documentElement;
      if (CFG.accent) root.style.setProperty('--accent', CFG.accent);
      if (CFG.bg) root.style.setProperty('--bg', CFG.bg);
      if (CFG.panel) root.style.setProperty('--panel', CFG.panel);
      if (CFG.text) root.style.setProperty('--text', CFG.text);
      if (CFG.muted) root.style.setProperty('--muted', CFG.muted);
      if (CFG.boardBg) root.style.setProperty('--board-bg', CFG.boardBg);
      root.style.setProperty('--emboss', String(CFG.embossStrength != null ? CFG.embossStrength : 1));
      root.style.setProperty('--shadow', String(CFG.shadowStrength != null ? CFG.shadowStrength : 1));
      document.body.classList.toggle('reduce-motion', !!CFG.reduceMotion);
      const vt = document.getElementById('versionTag');
      if (vt) vt.textContent = 'v' + (CFG.version || '0.3.0');
    }
    applyThemeFromConfig();

    const viewport = document.getElementById('viewport');
    const world = document.getElementById('world');
    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const fitBtn = document.getElementById('fitBtn');
    const arrangeBtn = document.getElementById('arrangeBtn');
    const hintBtn = document.getElementById('hintBtn');
    const resetBtn = document.getElementById('resetBtn');
    const winOverlay = document.getElementById('win-overlay');
    const hintImg = document.getElementById('hint-img');
    const closeWinBtn = document.getElementById('closeWin');
    const zoomInfo = document.getElementById('zoomInfo');

    let img = null;
    let cols = 4, rows = 4;
    let pieceW = 0, pieceH = 0;
    let boardW = 0, boardH = 0;
    let tabSize = 0;
    let pieces = [];
    let snapThreshold = 24;

    // View transform
    let scale = 1;
    let panX = 0;
    let panY = 0;
    const MIN_SCALE = 0.15;
    const MAX_SCALE = 5;

    // Interaction state
    let isDraggingPiece = false;
    let isPanning = false;
    let dragPiece = null;
    let dragGroup = null;          // array of pieces currently being dragged
    let dragOffsets = null;        // Map or array of {piece, ox, oy} relative offsets
    let panStartX = 0, panStartY = 0;
    let panOriginX = 0, panOriginY = 0;

    // Edge tab data
    let vertTabs = [];
    let horizTabs = [];

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image. Try file upload (CORS often blocks external URLs).'));
        image.src = src;
      });
    }

    async function startPuzzle() {
      const fileInput = document.getElementById('imageFile');
      const urlInput = document.getElementById('imageUrl');
      let src = null;

      if (fileInput.files && fileInput.files[0]) {
        src = URL.createObjectURL(fileInput.files[0]);
      } else if (urlInput.value.trim()) {
        src = urlInput.value.trim();
      } else {
        statusEl.textContent = 'Please provide an image URL or choose a file.';
        return;
      }

      startBtn.disabled = true;
      statusEl.textContent = 'Loading image…';

      try {
        img = await loadImage(src);
      } catch (err) {
        statusEl.textContent = err.message;
        startBtn.disabled = false;
        return;
      }

      cols = rows = parseInt(document.getElementById('gridSize').value, 10);
      window._pieceShape = document.getElementById('pieceShape').value || 'classic';
      createPuzzle();
      // Free up screen space on phones/tablets after starting
      if (window.matchMedia('(max-width: 720px)').matches) {
        const panel = document.getElementById('controlsPanel');
        const btn = document.getElementById('menuToggle');
        if (panel) panel.classList.remove('open');
        if (btn) {
          btn.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      }
      startBtn.disabled = false;
      fitBtn.disabled = false;
      arrangeBtn.disabled = false;
      hintBtn.disabled = false;
      resetBtn.disabled = false;
    }

    function createPuzzle() {
      // Clear
      pieces.forEach(p => p.el.remove());
      pieces = [];
      winOverlay.classList.remove('show');
      boardEl.innerHTML = '';

      // Display size (base world size) — larger base for high piece counts so pieces stay usable
      const maxBaseCap = (CFG && CFG.maxBaseSize) || 1400;
      const maxBase = cols >= 24 ? maxBaseCap : cols >= 16 ? Math.min(1200, maxBaseCap) : cols >= 10 ? 960 : 800;
      const scaleImg = Math.min(maxBase / img.width, maxBase / img.height, 1.35);
      boardW = Math.floor(img.width * scaleImg);
      boardH = Math.floor(img.height * scaleImg);

      // Make divisible
      boardW = Math.floor(boardW / cols) * cols;
      boardH = Math.floor(boardH / rows) * rows;
      pieceW = boardW / cols;
      pieceH = boardH / rows;

      // Tab size — proportional, scaled by config.tabScale
      const minDim = Math.min(pieceW, pieceH);
      const tabScale = (CFG && CFG.tabScale) || 1.35;
      tabSize = Math.max(4, Math.min(minDim * 0.19, minDim * 0.22) * tabScale);

      // Snap distance
      const snapF = (CFG && CFG.snapFactor) || 0.38;
      const snapMin = (CFG && CFG.snapMin) || 12;
      const snapMax = (CFG && CFG.snapMax) || 32;
      snapThreshold = Math.max(snapMin, Math.min(snapMax, minDim * snapF));

      boardEl.style.width = boardW + 'px';
      boardEl.style.height = boardH + 'px';
      boardEl.style.left = '0px';
      boardEl.style.top = '0px';

      // Generate consistent random tabs
      vertTabs = [];
      for (let r = 0; r < rows; r++) {
        vertTabs[r] = [];
        for (let c = 0; c < cols - 1; c++) {
          vertTabs[r][c] = Math.random() < 0.5 ? 1 : -1;
        }
      }
      horizTabs = [];
      for (let r = 0; r < rows - 1; r++) {
        horizTabs[r] = [];
        for (let c = 0; c < cols; c++) {
          horizTabs[r][c] = Math.random() < 0.5 ? 1 : -1;
        }
      }

      // Create interlocking pieces (SVG-style clip-path for resolution-independent shapes)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tabs = {
            top:    r === 0 ? 0 : -horizTabs[r - 1][c],
            right:  c === cols - 1 ? 0 : vertTabs[r][c],
            bottom: r === rows - 1 ? 0 : horizTabs[r][c],
            left:   c === 0 ? 0 : -vertTabs[r][c - 1]
          };

          const shape = window._pieceShape || 'classic';
          // Square has no tabs; classic & round need tab padding
          const pad = shape === 'square' ? 1.5 : (tabSize + 1.5);
          const logicalW = pieceW + 2 * pad;
          const logicalH = pieceH + 2 * pad;

          let pathD;
          if (shape === 'square') {
            pathD = `M ${pad} ${pad} H ${pad + pieceW} V ${pad + pieceH} H ${pad} Z`;
          } else {
            // classic = traditional jigsaw ear (like the reference photo)
            // round  = interlocking with more circular/bulbous tabs
            pathD = buildJigsawPath(pad, pad, pieceW, pieceH, tabs, tabSize, shape);
          }

          // Outer wrapper receives filters (emboss / soft shadow / glow).
          // clip-path on the SAME element kills drop-shadow in Chrome & Firefox,
          // so the painted shape lives on a child.
          const el = document.createElement('div');
          el.className = 'piece';
          el.style.width  = logicalW + 'px';
          el.style.height = logicalH + 'px';

          const visual = document.createElement('div');
          visual.className = 'piece-visual';
          visual.style.backgroundImage = `url(${img.src})`;
          visual.style.backgroundSize = `${boardW}px ${boardH}px`;
          visual.style.backgroundPosition = `${-(c * pieceW - pad)}px ${-(r * pieceH - pad)}px`;
          visual.style.backgroundRepeat = 'no-repeat';
          visual.style.clipPath = `path('${pathD}')`;
          visual.style.webkitClipPath = `path('${pathD}')`;
          el.appendChild(visual);

          const ox = pad;
          const oy = pad;
          const correctX = c * pieceW - ox;
          const correctY = r * pieceH - oy;

          // Scatter OUTSIDE the board with a clear margin
          const margin = Math.max(pieceW, pieceH) * 0.65 + 36;
          const side = Math.floor(Math.random() * 4);
          let x, y;

          if (side === 0) { // top
            x = -margin + Math.random() * (boardW + 2 * margin) - logicalW / 2;
            y = -margin - logicalH - Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
          } else if (side === 1) { // right
            x = boardW + margin + Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
            y = -margin + Math.random() * (boardH + 2 * margin) - logicalH / 2;
          } else if (side === 2) { // bottom
            x = -margin + Math.random() * (boardW + 2 * margin) - logicalW / 2;
            y = boardH + margin + Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
          } else { // left
            x = -margin - logicalW - Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
            y = -margin + Math.random() * (boardH + 2 * margin) - logicalH / 2;
          }

          el.style.left = x + 'px';
          el.style.top = y + 'px';
          el.style.zIndex = 10 + Math.floor(Math.random() * 20);

          const piece = {
            el, r, c, tabs,
            ox, oy,
            correctX, correctY,
            placed: false,
            w: logicalW,
            h: logicalH,
            group: null
          };
          piece.group = [piece];
          pieces.push(piece);

          el.addEventListener('pointerdown', (e) => onPiecePointerDown(e, piece));
          world.appendChild(el);
        }
      }

      hintImg.src = img.src;
      hintImg.style.display = 'none';

      // Initial view: fit everything
      fitToView(true);
      updateStatus();
      statusEl.textContent = `Puzzle ready — ${cols * rows} vector interlocking pieces. Connect edges to form groups.`;
    }

    /**
     * Build interlocking jigsaw path (SVG path `d`).
     * style: 'classic' = traditional ear (matches typical puzzle photo)
     *        'round'   = more circular / bulbous tabs
     * tabs: { top, right, bottom, left }  +1 = tab out, -1 = blank in, 0 = flat
     */
    /**
     * Classic interlocking path — geometry adapted from JClic ClassicJigSaw
     * (proven toy-puzzle tooth: 3 cubic beziers per tab).
     * No dependencies.
     * tabs: +1 out, -1 blank, 0 flat
     */
    function buildJigsawPath(x, y, w, h, tabs, t, style) {
      const f = (n) => Math.round(n * 1000) / 1000;
      const baseF = (CFG && CFG.tabBaseFactor) || 0.42;
      const heightF = (CFG && CFG.tabHeightFactor) || 1.05;
      const roundS = (CFG && CFG.roundTabScale) || 1.0;

      // Classic toy-puzzle tooth — JClic ClassicJigSaw geometry (3 cubics)
      function tabClassicH(x1, y1, x2, y2, outward) {
        // from (x1,y1) to (x2,y2) along horizontal top or bottom
        // outward: -1 = up (top edge tab out), +1 = down
        const L = x2 - x1;
        const baseW = Math.min(Math.abs(L) * baseF, t * 2.6);
        const mid = (x1 + x2) / 2;
        const x0 = mid - baseW / 2;
        const u = baseW / 12;
        const th = t * heightF;
        const o = outward;
        const uh = th / 5;
        return [
          `L ${f(x0)} ${f(y1)}`,
          `C ${f(x0 + 4 * u)} ${f(y1)}`,
            `${f(x0 + 6 * u)} ${f(y1 + o * uh)}`,
            `${f(x0 + 4 * u)} ${f(y1 + o * 3 * uh)}`,
          `C ${f(x0 + 2 * u)} ${f(y1 + o * 5 * uh)}`,
            `${f(x0 + 10 * u)} ${f(y1 + o * 5 * uh)}`,
            `${f(x0 + 8 * u)} ${f(y1 + o * 3 * uh)}`,
          `C ${f(x0 + 6 * u)} ${f(y1 + o * 1 * uh)}`,
            `${f(x0 + 8 * u)} ${f(y1)}`,
            `${f(x0 + 12 * u)} ${f(y1)}`
        ].join(' ');
      }

      function tabClassicV(x1, y1, x2, y2, outward) {
        // vertical edge top→bottom. outward: +1 right, -1 left
        const L = y2 - y1;
        const baseW = Math.min(Math.abs(L) * baseF, t * 2.6);
        const mid = (y1 + y2) / 2;
        const y0 = mid - baseW / 2;
        const u = baseW / 12;
        const th = t * heightF;
        const o = outward;
        const uh = th / 5;
        return [
          `L ${f(x1)} ${f(y0)}`,
          `C ${f(x1)} ${f(y0 + 4 * u)}`,
            `${f(x1 + o * uh)} ${f(y0 + 6 * u)}`,
            `${f(x1 + o * 3 * uh)} ${f(y0 + 4 * u)}`,
          `C ${f(x1 + o * 5 * uh)} ${f(y0 + 2 * u)}`,
            `${f(x1 + o * 5 * uh)} ${f(y0 + 10 * u)}`,
            `${f(x1 + o * 3 * uh)} ${f(y0 + 8 * u)}`,
          `C ${f(x1 + o * 1 * uh)} ${f(y0 + 6 * u)}`,
            `${f(x1)} ${f(y0 + 8 * u)}`,
            `${f(x1)} ${f(y0 + 12 * u)}`
        ].join(' ');
      }

      // Round style: more circular bulb
      function tabRoundH(cx, cy, outward) {
        const k = 0.5523;
        const r = t * 0.88 * roundS;
        const neck = t * 0.28;
        const shoulder = t * 0.55;
        const o = outward;
        const tip = cy + o * (neck * 0.3 + r * 1.85);
        const midY = cy + o * (neck * 0.3 + r);
        return [
          `L ${f(cx - shoulder)} ${f(cy)}`,
          `C ${f(cx - shoulder)} ${f(cy + o * neck * 0.35)}`,
            `${f(cx - r)} ${f(cy + o * neck * 0.1)}`,
            `${f(cx - r)} ${f(midY)}`,
          `C ${f(cx - r)} ${f(midY + o * r * k)}`,
            `${f(cx - r * k)} ${f(tip)}`,
            `${f(cx)} ${f(tip)}`,
          `C ${f(cx + r * k)} ${f(tip)}`,
            `${f(cx + r)} ${f(midY + o * r * k)}`,
            `${f(cx + r)} ${f(midY)}`,
          `C ${f(cx + r)} ${f(cy + o * neck * 0.1)}`,
            `${f(cx + shoulder)} ${f(cy + o * neck * 0.35)}`,
            `${f(cx + shoulder)} ${f(cy)}`
        ].join(' ');
      }

      function tabRoundV(cx, cy, outward) {
        const k = 0.5523;
        const r = t * 0.88 * roundS;
        const neck = t * 0.28;
        const shoulder = t * 0.55;
        const o = outward;
        const tip = cx + o * (neck * 0.3 + r * 1.85);
        const midX = cx + o * (neck * 0.3 + r);
        return [
          `L ${f(cx)} ${f(cy - shoulder)}`,
          `C ${f(cx + o * neck * 0.35)} ${f(cy - shoulder)}`,
            `${f(cx + o * neck * 0.1)} ${f(cy - r)}`,
            `${f(midX)} ${f(cy - r)}`,
          `C ${f(midX + o * r * k)} ${f(cy - r)}`,
            `${f(tip)} ${f(cy - r * k)}`,
            `${f(tip)} ${f(cy)}`,
          `C ${f(tip)} ${f(cy + r * k)}`,
            `${f(midX + o * r * k)} ${f(cy + r)}`,
            `${f(midX)} ${f(cy + r)}`,
          `C ${f(cx + o * neck * 0.1)} ${f(cy + r)}`,
            `${f(cx + o * neck * 0.35)} ${f(cy + shoulder)}`,
            `${f(cx)} ${f(cy + shoulder)}`
        ].join(' ');
      }

      let d = `M ${f(x)} ${f(y)}`;

      // TOP left → right
      if (tabs.top === 0) {
        d += ` L ${f(x + w)} ${f(y)}`;
      } else {
        const out = tabs.top > 0 ? -1 : 1; // +1 tab out on top means outward is up = -y
        // Wait: tabs.top +1 means tab OUT (protrudes up). outward for tabClassicH: -1 = up
        const outward = tabs.top > 0 ? -1 : 1;
        if (style === 'round') {
          d += ' ' + tabRoundH(x + w / 2, y, outward);
        } else {
          d += ' ' + tabClassicH(x, y, x + w, y, outward);
        }
        d += ` L ${f(x + w)} ${f(y)}`;
      }

      // RIGHT top → bottom
      if (tabs.right === 0) {
        d += ` L ${f(x + w)} ${f(y + h)}`;
      } else {
        const outward = tabs.right > 0 ? 1 : -1; // +1 out = right
        if (style === 'round') {
          d += ' ' + tabRoundV(x + w, y + h / 2, outward);
        } else {
          d += ' ' + tabClassicV(x + w, y, x + w, y + h, outward);
        }
        d += ` L ${f(x + w)} ${f(y + h)}`;
      }

      // BOTTOM right → left
      if (tabs.bottom === 0) {
        d += ` L ${f(x)} ${f(y + h)}`;
      } else {
        const outward = tabs.bottom > 0 ? 1 : -1; // +1 out = down
        if (style === 'round') {
          // reverse: need right-to-left — tabRoundH is left-to-right, so flip by using negative traversal
          // Build left-to-right then we'll approach from right via L first... 
          // Actually path goes right to left on bottom. Generate points in reverse order.
          const mid = x + w / 2;
          const k = 0.5523;
          const r = t * 0.88 * roundS;
          const neck = t * 0.28;
          const shoulder = t * 0.55;
          const o = outward;
          const tip = y + h + o * (neck * 0.3 + r * 1.85);
          const midY = y + h + o * (neck * 0.3 + r);
          d += ` L ${f(mid + shoulder)} ${f(y + h)}`;
          d += ` C ${f(mid + shoulder)} ${f(y + h + o * neck * 0.35)}`;
          d += ` ${f(mid + r)} ${f(y + h + o * neck * 0.1)}`;
          d += ` ${f(mid + r)} ${f(midY)}`;
          d += ` C ${f(mid + r)} ${f(midY + o * r * k)}`;
          d += ` ${f(mid + r * k)} ${f(tip)}`;
          d += ` ${f(mid)} ${f(tip)}`;
          d += ` C ${f(mid - r * k)} ${f(tip)}`;
          d += ` ${f(mid - r)} ${f(midY + o * r * k)}`;
          d += ` ${f(mid - r)} ${f(midY)}`;
          d += ` C ${f(mid - r)} ${f(y + h + o * neck * 0.1)}`;
          d += ` ${f(mid - shoulder)} ${f(y + h + o * neck * 0.35)}`;
          d += ` ${f(mid - shoulder)} ${f(y + h)}`;
        } else {
          // classic bottom, right→left: mirror of tabClassicH
          const baseW = Math.min(w * baseF, t * 2.6);
          const mid = x + w / 2;
          const x0 = mid + baseW / 2;
          const u = baseW / 12;
          const th = t * heightF;
          const o = outward;
          const uh = th / 5;
          d += ` L ${f(x0)} ${f(y + h)}`;
          d += ` C ${f(x0 - 4 * u)} ${f(y + h)}`;
          d += ` ${f(x0 - 6 * u)} ${f(y + h + o * uh)}`;
          d += ` ${f(x0 - 4 * u)} ${f(y + h + o * 3 * uh)}`;
          d += ` C ${f(x0 - 2 * u)} ${f(y + h + o * 5 * uh)}`;
          d += ` ${f(x0 - 10 * u)} ${f(y + h + o * 5 * uh)}`;
          d += ` ${f(x0 - 8 * u)} ${f(y + h + o * 3 * uh)}`;
          d += ` C ${f(x0 - 6 * u)} ${f(y + h + o * 1 * uh)}`;
          d += ` ${f(x0 - 8 * u)} ${f(y + h)}`;
          d += ` ${f(x0 - 12 * u)} ${f(y + h)}`;
        }
        d += ` L ${f(x)} ${f(y + h)}`;
      }

      // LEFT bottom → top
      if (tabs.left === 0) {
        d += ` L ${f(x)} ${f(y)}`;
      } else {
        const outward = tabs.left > 0 ? -1 : 1; // +1 out = left
        if (style === 'round') {
          const mid = y + h / 2;
          const k = 0.5523;
          const r = t * 0.88 * roundS;
          const neck = t * 0.28;
          const shoulder = t * 0.55;
          const o = outward;
          const tip = x + o * (neck * 0.3 + r * 1.85);
          const midX = x + o * (neck * 0.3 + r);
          d += ` L ${f(x)} ${f(mid + shoulder)}`;
          d += ` C ${f(x + o * neck * 0.35)} ${f(mid + shoulder)}`;
          d += ` ${f(x + o * neck * 0.1)} ${f(mid + r)}`;
          d += ` ${f(midX)} ${f(mid + r)}`;
          d += ` C ${f(midX + o * r * k)} ${f(mid + r)}`;
          d += ` ${f(tip)} ${f(mid + r * k)}`;
          d += ` ${f(tip)} ${f(mid)}`;
          d += ` C ${f(tip)} ${f(mid - r * k)}`;
          d += ` ${f(midX + o * r * k)} ${f(mid - r)}`;
          d += ` ${f(midX)} ${f(mid - r)}`;
          d += ` C ${f(x + o * neck * 0.1)} ${f(mid - r)}`;
          d += ` ${f(x + o * neck * 0.35)} ${f(mid - shoulder)}`;
          d += ` ${f(x)} ${f(mid - shoulder)}`;
        } else {
          const baseW = Math.min(h * baseF, t * 2.6);
          const mid = y + h / 2;
          const y0 = mid + baseW / 2;
          const u = baseW / 12;
          const th = t * heightF;
          const o = outward;
          const uh = th / 5;
          d += ` L ${f(x)} ${f(y0)}`;
          d += ` C ${f(x)} ${f(y0 - 4 * u)}`;
          d += ` ${f(x + o * uh)} ${f(y0 - 6 * u)}`;
          d += ` ${f(x + o * 3 * uh)} ${f(y0 - 4 * u)}`;
          d += ` C ${f(x + o * 5 * uh)} ${f(y0 - 2 * u)}`;
          d += ` ${f(x + o * 5 * uh)} ${f(y0 - 10 * u)}`;
          d += ` ${f(x + o * 3 * uh)} ${f(y0 - 8 * u)}`;
          d += ` C ${f(x + o * 1 * uh)} ${f(y0 - 6 * u)}`;
          d += ` ${f(x)} ${f(y0 - 8 * u)}`;
          d += ` ${f(x)} ${f(y0 - 12 * u)}`;
        }
        d += ` L ${f(x)} ${f(y)}`;
      }

      d += ' Z';
      return d;
    }

    function applyTransform() {
      world.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      zoomInfo.textContent = Math.round(scale * 100) + '%';
    }

    function screenToWorld(sx, sy) {
      const rect = viewport.getBoundingClientRect();
      const vx = sx - rect.left;
      const vy = sy - rect.top;
      return {
        x: (vx - panX) / scale,
        y: (vy - panY) / scale
      };
    }

    function onPiecePointerDown(e, piece) {
      if (piece.placed) return;
      // Accept mouse left button and any touch/pen
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Cancel viewport pan if we started dragging a piece
      isPanning = false;
      viewport.classList.remove('panning');
      activePointers.clear();
      pinchCenterWorld = null;

      isDraggingPiece = true;
      dragPiece = piece;
      dragGroup = piece.group.slice();

      dragGroup.forEach(p => {
        p.el.classList.add('dragging');
        p.el.style.zIndex = 300;
      });
      try { piece.el.setPointerCapture(e.pointerId); } catch (_) {}

      const worldPos = screenToWorld(e.clientX, e.clientY);
      dragOffsets = dragGroup.map(p => {
        const left = parseFloat(p.el.style.left);
        const top = parseFloat(p.el.style.top);
        return {
          piece: p,
          ox: worldPos.x - left,
          oy: worldPos.y - top
        };
      });
    }

    function onPointerMove(e) {
      if (isPanning) {
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        panX = panOriginX + dx;
        panY = panOriginY + dy;
        applyTransform();
        return;
      }

      if (!isDraggingPiece || !dragGroup) return;
      e.preventDefault();

      const worldPos = screenToWorld(e.clientX, e.clientY);
      dragOffsets.forEach(({ piece: p, ox, oy }) => {
        p.el.style.left = (worldPos.x - ox) + 'px';
        p.el.style.top  = (worldPos.y - oy) + 'px';
      });
    }

    function onPointerUp(e) {
      if (isPanning) {
        isPanning = false;
        viewport.classList.remove('panning');
        return;
      }

      if (!isDraggingPiece || !dragGroup) return;
      isDraggingPiece = false;

      dragGroup.forEach(p => p.el.classList.remove('dragging'));

      // 1. Try to connect this group to any nearby matching pieces/groups
      tryConnectGroup(dragGroup);

      // 2. Try to snap the (possibly enlarged) group to the board if close enough
      trySnapGroupToBoard(dragGroup);

      // Restore z-index for free pieces
      dragGroup.forEach(p => {
        if (!p.placed) p.el.style.zIndex = 10 + Math.floor(Math.random() * 40);
      });

      dragPiece = null;
      dragGroup = null;
      dragOffsets = null;

      checkWin();
    }

    // Merge two groups and make every member point to the same array
    function mergeGroups(g1, g2) {
      if (g1 === g2) return g1;
      const merged = g1.concat(g2);
      merged.forEach(p => { p.group = merged; });
      return merged;
    }

    // After a move, try connecting any piece of the moved group to outside pieces
    function tryConnectGroup(movedGroup) {
      // Collect candidates outside the current group
      const candidates = pieces.filter(p => !p.placed && !movedGroup.includes(p));

      let changed = true;
      while (changed) {
        changed = false;
        // Re-fetch current group members in case of previous merges
        const current = movedGroup[0].group;

        for (const p of current) {
          for (const other of candidates) {
            if (current.includes(other)) continue;
            if (areCorrectlyAdjacent(p, other)) {
              // Snap the other group relative to p
              snapRelative(p, other);
              mergeGroups(current, other.group);
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
      }
    }

    function areCorrectlyAdjacent(a, b) {
      const dr = Math.abs(a.r - b.r);
      const dc = Math.abs(a.c - b.c);
      if (dr + dc !== 1) return false;

      const expectedDx = (b.c - a.c) * pieceW;
      const expectedDy = (b.r - a.r) * pieceH;

      const ax = parseFloat(a.el.style.left);
      const ay = parseFloat(a.el.style.top);
      const bx = parseFloat(b.el.style.left);
      const by = parseFloat(b.el.style.top);

      const dist = Math.hypot((bx - ax) - expectedDx, (by - ay) - expectedDy);
      return dist < snapThreshold;
    }

    // Force relative positions so that b sits correctly next to a
    function snapRelative(a, b) {
      const expectedDx = (b.c - a.c) * pieceW;
      const expectedDy = (b.r - a.r) * pieceH;
      const ax = parseFloat(a.el.style.left);
      const ay = parseFloat(a.el.style.top);

      // Move the entire group of b
      const bGroup = b.group;
      const bx = parseFloat(b.el.style.left);
      const by = parseFloat(b.el.style.top);
      const dx = (ax + expectedDx) - bx;
      const dy = (ay + expectedDy) - by;

      bGroup.forEach(p => {
        p.el.style.left = (parseFloat(p.el.style.left) + dx) + 'px';
        p.el.style.top  = (parseFloat(p.el.style.top)  + dy) + 'px';
      });

      // Visual feedback on the newly connected pieces
      flashPieces(a.group);
    }

    // If any piece of the group is close to its absolute home, snap the whole group
    function trySnapGroupToBoard(group) {
      // Use the first non-placed piece as reference (or any)
      const ref = group.find(p => !p.placed) || group[0];
      if (ref.placed) return;

      const left = parseFloat(ref.el.style.left);
      const top  = parseFloat(ref.el.style.top);
      const dist = Math.hypot(left - ref.correctX, top - ref.correctY);

      if (dist < snapThreshold) {
        // Snap entire group using the reference piece’s offset
        const dx = ref.correctX - left;
        const dy = ref.correctY - top;

        group.forEach(p => {
          p.el.style.left = (parseFloat(p.el.style.left) + dx) + 'px';
          p.el.style.top  = (parseFloat(p.el.style.top)  + dy) + 'px';
          p.el.classList.add('snapped');
          p.placed = true;
          p.el.style.zIndex = 5;
        });

        flashPieces(group);
      }
    }

    function flashPieces(list) {
      list.forEach(p => {
        p.el.classList.remove('snap-flash');
        // Force reflow so the animation can restart
        void p.el.offsetWidth;
        p.el.classList.add('snap-flash');
      });
      setTimeout(() => {
        list.forEach(p => p.el.classList.remove('snap-flash'));
      }, 620);
    }

    function checkWin() {
      const allPlaced = pieces.every(p => p.placed);
      if (allPlaced) {
        setTimeout(() => winOverlay.classList.add('show'), 250);
      }
      updateStatus();
    }

    // ---- Touch + mouse navigation ----
    // activePointers: Map<pointerId, {x, y}>
    const activePointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchCenterWorld = null;

    function pointerDist(a, b) {
      const dx = a.x - b.x, dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }
    function pointerMid(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    // Pan: middle mouse OR single finger/pen on empty viewport
    // Pinch: two fingers
    viewport.addEventListener('pointerdown', (e) => {
      if (isDraggingPiece) return;

      // Middle mouse always pans
      if (e.button === 1) {
        e.preventDefault();
        isPanning = true;
        viewport.classList.add('panning');
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = panX;
        panOriginY = panY;
        viewport.setPointerCapture(e.pointerId);
        return;
      }

      // Primary button / touch
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}

      if (activePointers.size === 1 && e.target === viewport) {
        // One finger on empty area → pan
        isPanning = true;
        viewport.classList.add('panning');
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = panX;
        panOriginY = panY;
      } else if (activePointers.size === 2) {
        // Pinch start
        isPanning = false;
        viewport.classList.remove('panning');
        const pts = [...activePointers.values()];
        pinchStartDist = pointerDist(pts[0], pts[1]) || 1;
        pinchStartScale = scale;
        const mid = pointerMid(pts[0], pts[1]);
        const rect = viewport.getBoundingClientRect();
        const mx = mid.x - rect.left;
        const my = mid.y - rect.top;
        pinchCenterWorld = {
          x: (mx - panX) / scale,
          y: (my - panY) / scale
        };
      }
    });

    viewport.addEventListener('pointermove', (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Pinch zoom
      if (activePointers.size >= 2 && pinchCenterWorld) {
        e.preventDefault();
        const pts = [...activePointers.values()];
        const dist = pointerDist(pts[0], pts[1]) || 1;
        const ratio = dist / pinchStartDist;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * ratio));
        const mid = pointerMid(pts[0], pts[1]);
        const rect = viewport.getBoundingClientRect();
        const mx = mid.x - rect.left;
        const my = mid.y - rect.top;
        panX = mx - pinchCenterWorld.x * newScale;
        panY = my - pinchCenterWorld.y * newScale;
        scale = newScale;
        applyTransform();
        return;
      }

      onPointerMove(e);
    });

    function endPointer(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        pinchCenterWorld = null;
        pinchStartDist = 0;
      }
      // If one finger remains after pinch, re-init pan from current position
      if (activePointers.size === 1 && !isDraggingPiece) {
        const p = [...activePointers.values()][0];
        isPanning = true;
        viewport.classList.add('panning');
        panStartX = p.x;
        panStartY = p.y;
        panOriginX = panX;
        panOriginY = panY;
      }
      onPointerUp(e);
    }

    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());

    // Zoom with wheel (desktop)
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const worldX = (mx - panX) / scale;
      const worldY = (my - panY) / scale;

      const delta = -e.deltaY * 0.0012;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)));

      panX = mx - worldX * newScale;
      panY = my - worldY * newScale;
      scale = newScale;
      applyTransform();
    }, { passive: false });

    // Hamburger menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const controlsPanel = document.getElementById('controlsPanel');
    menuToggle.addEventListener('click', () => {
      const open = controlsPanel.classList.toggle('open');
      menuToggle.classList.toggle('open', open);
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // On narrow screens, start with menu closed
    if (window.matchMedia('(max-width: 720px)').matches) {
      controlsPanel.classList.remove('open');
      menuToggle.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }

    function fitToView(instant = false) {
      if (!pieces.length) return;

      // Bounding box of board + all pieces
      let minX = 0, minY = 0, maxX = boardW, maxY = boardH;
      pieces.forEach(p => {
        const left = parseFloat(p.el.style.left);
        const top = parseFloat(p.el.style.top);
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + p.w);
        maxY = Math.max(maxY, top + p.h);
      });

      const bbW = maxX - minX;
      const bbH = maxY - minY;
      const margin = 40;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;

      const fitScale = Math.min((vw - margin * 2) / bbW, (vh - margin * 2) / bbH, 1.8);
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));

      // Center the bbox
      const cx = minX + bbW / 2;
      const cy = minY + bbH / 2;
      panX = vw / 2 - cx * scale;
      panY = vh / 2 - cy * scale;
      applyTransform();
    }

    function rescatter() {
      if (!pieces.length) return;
      winOverlay.classList.remove('show');

      // Keep placed pieces + any free groups (≥2 connected) where they are.
      // Only singleton free pieces get thrown around.
      const spread = (CFG && CFG.scatterSpread != null) ? CFG.scatterSpread : 0.38;

      pieces.forEach(p => {
        if (p.placed) return;
        if (p.group && p.group.length > 1) return; // connected cluster stays put

        p.el.classList.remove('snapped');
        p.group = [p];

        const margin = Math.max(pieceW, pieceH) * 0.6 + 30;
        const side = Math.floor(Math.random() * 4);
        let x, y;

        if (side === 0) {
          x = -margin + Math.random() * (boardW + 2 * margin) - p.w / 2;
          y = -margin - p.h - Math.random() * (Math.max(boardH, boardW) * spread + 60);
        } else if (side === 1) {
          x = boardW + margin + Math.random() * (Math.max(boardH, boardW) * spread + 60);
          y = -margin + Math.random() * (boardH + 2 * margin) - p.h / 2;
        } else if (side === 2) {
          x = -margin + Math.random() * (boardW + 2 * margin) - p.w / 2;
          y = boardH + margin + Math.random() * (Math.max(boardH, boardW) * spread + 60);
        } else {
          x = -margin - p.w - Math.random() * (Math.max(boardH, boardW) * spread + 60);
          y = -margin + Math.random() * (boardH + 2 * margin) - p.h / 2;
        }

        p.el.style.left = x + 'px';
        p.el.style.top = y + 'px';
        p.el.style.zIndex = 10 + Math.floor(Math.random() * 25);
      });
      updateStatus();
      fitToView();
    }

    /**
     * Unstack: gently separate overlapping free pieces/groups.
     * Does NOT break groups. Does NOT move placed pieces.
     * Keeps everything near its current position.
     */
    function unstackPieces() {
      if (!pieces.length) return;
      winOverlay.classList.remove('show');

      const free = pieces.filter(p => !p.placed);
      if (!free.length) {
        statusEl.textContent = 'Nothing to unstack — all pieces are placed.';
        return;
      }

      // Unique free groups (connected bundles stay together)
      const groups = [];
      const seen = new Set();
      free.forEach(p => {
        if (seen.has(p.group)) return;
        seen.add(p.group);
        groups.push(p.group);
      });

      function groupBBox(g) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.forEach(p => {
          const x = parseFloat(p.el.style.left);
          const y = parseFloat(p.el.style.top);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + p.w);
          maxY = Math.max(maxY, y + p.h);
        });
        return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
      }

      function moveGroup(g, dx, dy) {
        g.forEach(p => {
          p.el.style.left = (parseFloat(p.el.style.left) + dx) + 'px';
          p.el.style.top = (parseFloat(p.el.style.top) + dy) + 'px';
        });
      }

      const pad = Math.max(4, Math.min(pieceW, pieceH) * 0.08);
      // A few relaxation passes — small pushes only
      for (let iter = 0; iter < 14; iter++) {
        for (let i = 0; i < groups.length; i++) {
          for (let j = i + 1; j < groups.length; j++) {
            const a = groupBBox(groups[i]);
            const b = groupBBox(groups[j]);
            if (a.maxX + pad < b.minX || b.maxX + pad < a.minX ||
                a.maxY + pad < b.minY || b.maxY + pad < a.minY) continue;

            let dx = a.cx - b.cx;
            let dy = a.cy - b.cy;
            let dist = Math.hypot(dx, dy);
            if (dist < 0.5) {
              // perfectly stacked — pick a stable direction from index
              const ang = ((i * 17 + j * 31) % 360) * Math.PI / 180;
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              dist = 1;
            } else {
              dx /= dist;
              dy /= dist;
            }
            const push = 5 + iter * 0.35;
            moveGroup(groups[i], dx * push * 0.5, dy * push * 0.5);
            moveGroup(groups[j], -dx * push * 0.5, -dy * push * 0.5);
          }
        }
      }

      updateStatus();
      // Do not fitToView — stay where the user is looking
    }

    function updateStatus() {
      if (!pieces.length) return;
      const placed = pieces.filter(p => p.placed).length;
      const groups = new Set(pieces.map(p => p.group)).size;
      statusEl.textContent = `Placed: ${placed} / ${pieces.length}   ·   Groups: ${groups}   ·   Scroll zoom · Middle-click pan`;
    }

    // Buttons
    startBtn.addEventListener('click', startPuzzle);
    fitBtn.addEventListener('click', () => fitToView());
    if (arrangeBtn) arrangeBtn.addEventListener('click', unstackPieces);
    resetBtn.addEventListener('click', rescatter);
    hintBtn.addEventListener('click', () => {
      hintImg.style.display = hintImg.style.display === 'none' ? 'block' : 'none';
    });

    function dismissWin(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      winOverlay.classList.remove('show');
    }
    if (closeWinBtn) {
      closeWinBtn.addEventListener('pointerdown', dismissWin);
      closeWinBtn.addEventListener('click', dismissWin);
    }
    if (winOverlay) {
      winOverlay.addEventListener('pointerdown', (e) => {
        if (e.target === winOverlay) dismissWin(e);
      });
    }

    console.info('[Art Jigsaw] v0.3.0 · config-panel · group-safe-rescatter · classic-tabs');

    document.getElementById('imageUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startPuzzle();
    });

    // Prevent middle-click auto-scroll
    window.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    // Keep the view usable when the window is resized (4K / ultrawide / etc.)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Soft re-fit only if almost everything is already on screen,
        // otherwise just leave the current pan/zoom so the user stays oriented.
        if (pieces.length && scale < 0.4) {
          fitToView();
        }
      }, 150);
    });


    // ---- Config panel UI ----
    (function setupConfigPanel() {
      const configOverlay = document.getElementById('config-overlay');
      const configBtn = document.getElementById('configBtn');
      const configClose = document.getElementById('configClose');
      if (!configOverlay || !configBtn) return;

      const cfgKeys = {
        tabScale: 'cfg_tabScale',
        tabBaseFactor: 'cfg_tabBaseFactor',
        tabHeightFactor: 'cfg_tabHeightFactor',
        roundTabScale: 'cfg_roundTabScale',
        snapFactor: 'cfg_snapFactor',
        scatterSpread: 'cfg_scatterSpread',
        accent: 'cfg_accent',
        bg: 'cfg_bg',
        panel: 'cfg_panel',
        embossStrength: 'cfg_embossStrength',
        shadowStrength: 'cfg_shadowStrength',
        reduceMotion: 'cfg_reduceMotion'
      };

      function fillConfigForm() {
        Object.keys(cfgKeys).forEach(k => {
          const el = document.getElementById(cfgKeys[k]);
          if (!el) return;
          if (el.type === 'checkbox') el.checked = !!CFG[k];
          else if (el.type === 'color') el.value = CFG[k] || '#000000';
          else {
            el.value = CFG[k];
            const span = document.querySelector('span[data-for="' + el.id + '"]');
            if (span) span.textContent = el.value;
          }
        });
      }

      function readConfigForm() {
        Object.keys(cfgKeys).forEach(k => {
          const el = document.getElementById(cfgKeys[k]);
          if (!el) return;
          if (el.type === 'checkbox') CFG[k] = el.checked;
          else if (el.type === 'color') CFG[k] = el.value;
          else CFG[k] = parseFloat(el.value);
        });
      }

      function openConfig() {
        fillConfigForm();
        configOverlay.hidden = false;
      }
      function closeConfig() {
        configOverlay.hidden = true;
      }

      configBtn.addEventListener('click', openConfig);
      if (configClose) configClose.addEventListener('click', closeConfig);
      configOverlay.addEventListener('click', (e) => {
        if (e.target === configOverlay) closeConfig();
      });

      Object.values(cfgKeys).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          const span = document.querySelector('span[data-for="' + id + '"]');
          if (span) span.textContent = el.type === 'checkbox' ? '' : el.value;
          if (id === 'cfg_accent' || id === 'cfg_bg' || id === 'cfg_panel' ||
              id === 'cfg_embossStrength' || id === 'cfg_shadowStrength' || id === 'cfg_reduceMotion') {
            readConfigForm();
            applyThemeFromConfig();
          }
        });
      });

      const saveBtn = document.getElementById('cfgSave');
      if (saveBtn) saveBtn.addEventListener('click', () => {
        readConfigForm();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(CFG)); } catch (_) {}
        applyThemeFromConfig();
        closeConfig();
        statusEl.textContent = 'Config saved. Start Puzzle again to apply tab / snap changes.';
      });

      const resetBtnCfg = document.getElementById('cfgReset');
      if (resetBtnCfg) resetBtnCfg.addEventListener('click', () => {
        CFG = Object.assign({}, window.JIGSAW_DEFAULTS || {});
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        fillConfigForm();
        applyThemeFromConfig();
        statusEl.textContent = 'Defaults restored (not saved until you hit Save).';
      });

      const exportBtn = document.getElementById('cfgExport');
      if (exportBtn) exportBtn.addEventListener('click', () => {
        readConfigForm();
        const blob = new Blob([JSON.stringify(CFG, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'art-jigsaw-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
      });

      const importBtn = document.getElementById('cfgImport');
      const importFile = document.getElementById('cfgImportFile');
      if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const data = JSON.parse(reader.result);
              CFG = Object.assign({}, window.JIGSAW_DEFAULTS || {}, data);
              fillConfigForm();
              applyThemeFromConfig();
              statusEl.textContent = 'Config imported — hit Save to keep it.';
            } catch (err) {
              statusEl.textContent = 'Invalid config JSON.';
            }
          };
          reader.readAsText(file);
          e.target.value = '';
        });
      }
    })();
