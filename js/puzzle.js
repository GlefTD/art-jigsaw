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
      const maxBase = cols >= 24 ? 1400 : cols >= 16 ? 1200 : cols >= 10 ? 960 : 800;
      const scaleImg = Math.min(maxBase / img.width, maxBase / img.height, 1.35);
      boardW = Math.floor(img.width * scaleImg);
      boardH = Math.floor(img.height * scaleImg);

      // Make divisible
      boardW = Math.floor(boardW / cols) * cols;
      boardH = Math.floor(boardH / rows) * rows;
      pieceW = boardW / cols;
      pieceH = boardH / rows;

      // Tab size must stay proportional — never dominate small pieces
      // Classic look is ~16–19% of the shorter side
      const minDim = Math.min(pieceW, pieceH);
      tabSize = Math.max(4, Math.min(minDim * 0.19, minDim * 0.22));

      // Snap distance scales with piece size so high piece-counts stay playable
      snapThreshold = Math.max(12, Math.min(28, minDim * 0.38));

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
    function buildJigsawPath(x, y, w, h, tabs, t, style) {
      // classic = circular/bulb tabs (reference photo)
      // round   = alternate ear style
      const isClassic = style === 'classic';
      // Higher-precision coords → smoother curves when zoomed
      const f = (n) => (Math.round(n * 1000) / 1000);
      const neckW = isClassic ? t * 0.26 : t * 0.40;
      const headR = isClassic ? t * 1.08 : t * 0.94;
      const shoulder = isClassic ? t * 0.52 : t * 0.76;

      // Horizontal tab, left → right. s > 0 = out upward (-y)
      // Classic: near-circular bulb (kappa 0.5523)
      function tabH(cx, cy, s) {
        if (isClassic) {
          const k = 0.5523;
          const r = headR * 0.95;
          const tip = cy - s * (neckW * 0.35 + r * 2 * 0.92);
          const midY = cy - s * (neckW * 0.35 + r * 0.92);
          return [
            `L ${f(cx - shoulder)} ${f(cy)}`,
            `C ${f(cx - shoulder)} ${f(cy - s * neckW * 0.4)}`,
              `${f(cx - r)} ${f(cy - s * neckW * 0.15)}`,
              `${f(cx - r)} ${f(midY)}`,
            `C ${f(cx - r)} ${f(midY - s * r * k)}`,
              `${f(cx - r * k)} ${f(tip)}`,
              `${f(cx)} ${f(tip)}`,
            `C ${f(cx + r * k)} ${f(tip)}`,
              `${f(cx + r)} ${f(midY - s * r * k)}`,
              `${f(cx + r)} ${f(midY)}`,
            `C ${f(cx + r)} ${f(cy - s * neckW * 0.15)}`,
              `${f(cx + shoulder)} ${f(cy - s * neckW * 0.4)}`,
              `${f(cx + shoulder)} ${f(cy)}`
          ].join(' ');
        }
        return [
          `L ${f(cx - shoulder)} ${f(cy)}`,
          `C ${f(cx - shoulder * 0.65)} ${f(cy - s * t * 0.06)}`,
            `${f(cx - headR * 0.95)} ${f(cy - s * headR * 0.22)}`,
            `${f(cx - headR * 0.62)} ${f(cy - s * headR * 0.72)}`,
          `C ${f(cx - headR * 0.22)} ${f(cy - s * headR * 1.1)}`,
            `${f(cx + headR * 0.22)} ${f(cy - s * headR * 1.1)}`,
            `${f(cx + headR * 0.62)} ${f(cy - s * headR * 0.72)}`,
          `C ${f(cx + headR * 0.95)} ${f(cy - s * headR * 0.22)}`,
            `${f(cx + shoulder * 0.65)} ${f(cy - s * t * 0.06)}`,
            `${f(cx + shoulder)} ${f(cy)}`
        ].join(' ');
      }

      // Vertical tab, top → bottom. s > 0 = out right (+x)
      function tabV(cx, cy, s) {
        if (isClassic) {
          const k = 0.5523;
          const r = headR * 0.95;
          const tip = cx + s * (neckW * 0.35 + r * 2 * 0.92);
          const midX = cx + s * (neckW * 0.35 + r * 0.92);
          return [
            `L ${f(cx)} ${f(cy - shoulder)}`,
            `C ${f(cx + s * neckW * 0.4)} ${f(cy - shoulder)}`,
              `${f(cx + s * neckW * 0.15)} ${f(cy - r)}`,
              `${f(midX)} ${f(cy - r)}`,
            `C ${f(midX + s * r * k)} ${f(cy - r)}`,
              `${f(tip)} ${f(cy - r * k)}`,
              `${f(tip)} ${f(cy)}`,
            `C ${f(tip)} ${f(cy + r * k)}`,
              `${f(midX + s * r * k)} ${f(cy + r)}`,
              `${f(midX)} ${f(cy + r)}`,
            `C ${f(cx + s * neckW * 0.15)} ${f(cy + r)}`,
              `${f(cx + s * neckW * 0.4)} ${f(cy + shoulder)}`,
              `${f(cx)} ${f(cy + shoulder)}`
          ].join(' ');
        }
        return [
          `L ${f(cx)} ${f(cy - shoulder)}`,
          `C ${f(cx + s * t * 0.06)} ${f(cy - shoulder * 0.65)}`,
            `${f(cx + s * headR * 0.22)} ${f(cy - headR * 0.95)}`,
            `${f(cx + s * headR * 0.72)} ${f(cy - headR * 0.62)}`,
          `C ${f(cx + s * headR * 1.1)} ${f(cy - headR * 0.22)}`,
            `${f(cx + s * headR * 1.1)} ${f(cy + headR * 0.22)}`,
            `${f(cx + s * headR * 0.72)} ${f(cy + headR * 0.62)}`,
          `C ${f(cx + s * headR * 0.22)} ${f(cy + headR * 0.95)}`,
            `${f(cx + s * t * 0.06)} ${f(cy + shoulder * 0.65)}`,
            `${f(cx)} ${f(cy + shoulder)}`
        ].join(' ');
      }

      let d = `M ${x} ${y}`;

      // TOP left→right
      if (tabs.top === 0) {
        d += ` L ${x + w} ${y}`;
      } else {
        d += ' ' + tabH(x + w / 2, y, tabs.top);
        d += ` L ${x + w} ${y}`;
      }

      // RIGHT top→bottom
      if (tabs.right === 0) {
        d += ` L ${x + w} ${y + h}`;
      } else {
        d += ' ' + tabV(x + w, y + h / 2, tabs.right);
        d += ` L ${x + w} ${y + h}`;
      }

      // BOTTOM right→left (mirror of tabH)
      if (tabs.bottom === 0) {
        d += ` L ${x} ${y + h}`;
      } else {
        const mid = x + w / 2;
        const s = tabs.bottom;
        if (isClassic) {
          const k = 0.5523;
          const r = headR * 0.95;
          const tip = y + h + s * (neckW * 0.35 + r * 2 * 0.92);
          const midY = y + h + s * (neckW * 0.35 + r * 0.92);
          d += ` L ${f(mid + shoulder)} ${f(y + h)}`;
          d += ` C ${f(mid + shoulder)} ${f(y + h + s * neckW * 0.4)}`;
          d += ` ${f(mid + r)} ${f(y + h + s * neckW * 0.15)}`;
          d += ` ${f(mid + r)} ${f(midY)}`;
          d += ` C ${f(mid + r)} ${f(midY + s * r * k)}`;
          d += ` ${f(mid + r * k)} ${f(tip)}`;
          d += ` ${f(mid)} ${f(tip)}`;
          d += ` C ${f(mid - r * k)} ${f(tip)}`;
          d += ` ${f(mid - r)} ${f(midY + s * r * k)}`;
          d += ` ${f(mid - r)} ${f(midY)}`;
          d += ` C ${f(mid - r)} ${f(y + h + s * neckW * 0.15)}`;
          d += ` ${f(mid - shoulder)} ${f(y + h + s * neckW * 0.4)}`;
          d += ` ${f(mid - shoulder)} ${f(y + h)}`;
        } else {
          d += ` L ${f(mid + shoulder)} ${f(y + h)}`;
          d += ` C ${f(mid + shoulder * 0.65)} ${f(y + h + s * t * 0.06)}`;
          d += ` ${f(mid + headR * 0.95)} ${f(y + h + s * headR * 0.22)}`;
          d += ` ${f(mid + headR * 0.62)} ${f(y + h + s * headR * 0.72)}`;
          d += ` C ${f(mid + headR * 0.22)} ${f(y + h + s * headR * 1.1)}`;
          d += ` ${f(mid - headR * 0.22)} ${f(y + h + s * headR * 1.1)}`;
          d += ` ${f(mid - headR * 0.62)} ${f(y + h + s * headR * 0.72)}`;
          d += ` C ${f(mid - headR * 0.95)} ${f(y + h + s * headR * 0.22)}`;
          d += ` ${f(mid - shoulder * 0.65)} ${f(y + h + s * t * 0.06)}`;
          d += ` ${f(mid - shoulder)} ${f(y + h)}`;
        }
        d += ` L ${x} ${y + h}`;
      }

      // LEFT bottom→top (mirror of tabV)
      if (tabs.left === 0) {
        d += ` L ${x} ${y}`;
      } else {
        const mid = y + h / 2;
        const s = tabs.left;
        if (isClassic) {
          const k = 0.5523;
          const r = headR * 0.95;
          const tip = x - s * (neckW * 0.35 + r * 2 * 0.92);
          const midX = x - s * (neckW * 0.35 + r * 0.92);
          d += ` L ${f(x)} ${f(mid + shoulder)}`;
          d += ` C ${f(x - s * neckW * 0.4)} ${f(mid + shoulder)}`;
          d += ` ${f(x - s * neckW * 0.15)} ${f(mid + r)}`;
          d += ` ${f(midX)} ${f(mid + r)}`;
          d += ` C ${f(midX - s * r * k)} ${f(mid + r)}`;
          d += ` ${f(tip)} ${f(mid + r * k)}`;
          d += ` ${f(tip)} ${f(mid)}`;
          d += ` C ${f(tip)} ${f(mid - r * k)}`;
          d += ` ${f(midX - s * r * k)} ${f(mid - r)}`;
          d += ` ${f(midX)} ${f(mid - r)}`;
          d += ` C ${f(x - s * neckW * 0.15)} ${f(mid - r)}`;
          d += ` ${f(x - s * neckW * 0.4)} ${f(mid - shoulder)}`;
          d += ` ${f(x)} ${f(mid - shoulder)}`;
        } else {
          d += ` L ${f(x)} ${f(mid + shoulder)}`;
          d += ` C ${f(x - s * t * 0.06)} ${f(mid + shoulder * 0.65)}`;
          d += ` ${f(x - s * headR * 0.22)} ${f(mid + headR * 0.95)}`;
          d += ` ${f(x - s * headR * 0.72)} ${f(mid + headR * 0.62)}`;
          d += ` C ${f(x - s * headR * 1.1)} ${f(mid + headR * 0.22)}`;
          d += ` ${f(x - s * headR * 1.1)} ${f(mid - headR * 0.22)}`;
          d += ` ${f(x - s * headR * 0.72)} ${f(mid - headR * 0.62)}`;
          d += ` C ${f(x - s * headR * 0.22)} ${f(mid - headR * 0.95)}`;
          d += ` ${f(x - s * t * 0.06)} ${f(mid - shoulder * 0.65)}`;
          d += ` ${f(x)} ${f(mid - shoulder)}`;
        }
        d += ` L ${x} ${y}`;
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

      // Only free (not yet locked) pieces — placed ones stay on the board
      pieces.forEach(p => {
        if (p.placed) return;

        p.el.classList.remove('snapped');
        p.group = [p];

        const margin = Math.max(pieceW, pieceH) * 0.6 + 30;
        const side = Math.floor(Math.random() * 4);
        let x, y;

        if (side === 0) {
          x = -margin + Math.random() * (boardW + 2 * margin) - p.w / 2;
          y = -margin - p.h - Math.random() * (Math.max(boardH, boardW) * 0.35 + 60);
        } else if (side === 1) {
          x = boardW + margin + Math.random() * (Math.max(boardH, boardW) * 0.35 + 60);
          y = -margin + Math.random() * (boardH + 2 * margin) - p.h / 2;
        } else if (side === 2) {
          x = -margin + Math.random() * (boardW + 2 * margin) - p.w / 2;
          y = boardH + margin + Math.random() * (Math.max(boardH, boardW) * 0.35 + 60);
        } else {
          x = -margin - p.w - Math.random() * (Math.max(boardH, boardW) * 0.35 + 60);
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

    // Build stamp — if Arrange does nothing, this JS file is not the one live on CF
    console.info('[Art Jigsaw] v0.2.0 · unstack+rescatter+continue+round-tabs');

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
