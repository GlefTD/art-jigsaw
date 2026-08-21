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
      const emb = CFG.embossStrength != null ? CFG.embossStrength : 0.8;
      const sh = CFG.shadowStrength != null ? CFG.shadowStrength : 1.5;
      const sb = CFG.shadowBlur != null ? CFG.shadowBlur : 0.75;
      document.body.classList.toggle('reduce-motion', !!CFG.reduceMotion);

      // --- Inner emboss (on .piece-visual, follows clip-path) ---
      // Two zero-blur drop-shadows = edge highlight + shade along the shape alpha
      if (emb <= 0.05) {
        root.style.setProperty('--piece-emboss', 'none');
      } else {
        const off = (0.6 + emb * 0.9).toFixed(2);
        const hi = (0.25 + emb * 0.4).toFixed(3);
        const shd = (0.25 + emb * 0.35).toFixed(3);
        root.style.setProperty(
          '--piece-emboss',
          `drop-shadow(-${off}px -${off}px 0 rgba(255,255,255,${hi})) drop-shadow(${off}px ${off}px 0 rgba(0,0,0,${shd}))`
        );
      }

      // --- Outer shadow (on .piece wrapper) ---
      if (sh <= 0.05) {
        root.style.setProperty('--piece-shadow', 'none');
        root.style.setProperty('--piece-shadow-drag', 'none');
      } else if (sb <= 0.001) {
        // Hard single-sample shadow
        const dy = (2 + sh * 2).toFixed(1);
        const a = (0.35 * sh).toFixed(3);
        root.style.setProperty('--piece-shadow', `drop-shadow(0 ${dy}px 0 rgba(0,0,0,${a}))`);
        root.style.setProperty('--piece-shadow-drag', `drop-shadow(0 ${(4+sh*4).toFixed(1)}px 0 rgba(0,0,0,${(0.45*sh).toFixed(3)}))`);
      } else {
        const b1 = (3 * sb * sh).toFixed(1);
        const b2 = (10 * sb * sh).toFixed(1);
        const a1 = (0.4 * sh).toFixed(3);
        const a2 = (0.28 * sh).toFixed(3);
        root.style.setProperty(
          '--piece-shadow',
          `drop-shadow(0 ${(2*sh).toFixed(1)}px ${b1}px rgba(0,0,0,${a1})) drop-shadow(0 ${(5*sh).toFixed(1)}px ${b2}px rgba(0,0,0,${a2}))`
        );
        root.style.setProperty(
          '--piece-shadow-drag',
          `drop-shadow(0 ${(8*sh).toFixed(1)}px ${(12*sb*sh).toFixed(1)}px rgba(0,0,0,${(0.5*sh).toFixed(3)})) drop-shadow(0 ${(16*sh).toFixed(1)}px ${(24*sb*sh).toFixed(1)}px rgba(0,0,0,${(0.3*sh).toFixed(3)}))`
        );
      }

      const vt = document.getElementById('versionTag');
      if (vt) vt.textContent = 'v' + (CFG.version || '0.4.4');
    }
    applyThemeFromConfig();

    function applyTableStyle(style) {
      const v = style || (CFG && CFG.tableStyle) || 'default';
      const el = document.getElementById('viewport');
      if (!el) return;
      el.classList.remove('table-default','table-felt','table-linen','table-papyrus','table-dotted','table-cork','table-wood');
      el.classList.add('table-' + v);
      CFG.tableStyle = v;
      const sel = document.getElementById('tableStyle');
      if (sel && sel.value !== v) sel.value = v;
    }
    applyTableStyle((CFG && CFG.tableStyle) || 'default');


    const progressOverlay = document.getElementById('progress-overlay');
    const progressBar = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');
    function showProgress(label, pct) {
      if (!progressOverlay) return;
      progressOverlay.hidden = false;
      if (progressLabel) progressLabel.textContent = label || 'Working…';
      if (progressBar) progressBar.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    }
    function hideProgress() {
      if (!progressOverlay) return;
      progressOverlay.hidden = true;
      if (progressBar) progressBar.style.width = '0%';
    }
    function yieldFrame() {
      return new Promise(r => requestAnimationFrame(() => r()));
    }

    const viewport = document.getElementById('viewport');
    const world = document.getElementById('world');
    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const fitBtn = document.getElementById('fitBtn');
    const arrangeBtn = document.getElementById('arrangeBtn');
    const hintBtn = document.getElementById('hintBtn');
    const resetBtn = document.getElementById('resetBtn');
    const cheatBtn = document.getElementById('cheatBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const winOverlay = document.getElementById('win-overlay');
    const hintImg = document.getElementById('hint-img');
    const closeWinBtn = document.getElementById('closeWin');
    const zoomInfo = document.getElementById('zoomInfo');

    let img = null;
    let sessionImgBlob = null;      // Blob for IDB (never data-URL × N pieces)
    let sessionImgObjectUrl = null; // single object URL shared by all pieces
    let sessionImgIsRemote = false;
    let sessionImgRemoteUrl = null;
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

    /**
     * Load image for CSS background-image use.
     * Strategy:
     *  1) Direct load WITHOUT crossOrigin (bg-image does not need CORS; crossOrigin often breaks remote hosts)
     *  2) If that fails, try public CORS proxies → blob object URL
     *  3) File upload remains the reliable path
     */
    function loadImageFromSrc(src, useCors) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        if (useCors) image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('load failed'));
        image.src = src;
      });
    }

    async function fetchViaProxy(url) {
      const proxies = [
        // images.weserv.nl — image CDN proxy, usually solid
        'https://images.weserv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')),
        // wsrv.nl alias
        'https://wsrv.nl/?url=' + encodeURIComponent(url),
        // generic CORS proxy → blob
        'https://corsproxy.io/?' + encodeURIComponent(url)
      ];
      for (const p of proxies) {
        try {
          const img = await loadImageFromSrc(p, false);
          return img;
        } catch (_) { /* try next */ }
      }
      // last resort: fetch blob through corsproxy
      try {
        const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(url));
        if (!res.ok) throw new Error('proxy http ' + res.status);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not an image');
        const obj = URL.createObjectURL(blob);
        return await loadImageFromSrc(obj, false);
      } catch (_) {}
      throw new Error('All image proxies failed');
    }

    async function loadImage(src) {
      // blob: / data: / same-origin — direct
      if (/^(blob:|data:|\/)/.test(src)) {
        return loadImageFromSrc(src, false);
      }
      // 1) plain load (best for background-image)
      try {
        return await loadImageFromSrc(src, false);
      } catch (_) {}
      // 2) proxies
      try {
        statusEl.textContent = 'URL blocked by host — trying image proxy…';
        return await fetchViaProxy(src);
      } catch (_) {}
      throw new Error('Could not load image URL (CORS). Use File upload, or host the image on a CORS-friendly CDN.');
    }


    function revokePuzzleObjectUrl() {
      if (sessionImgObjectUrl && sessionImgObjectUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(sessionImgObjectUrl); } catch (_) {}
      }
      sessionImgObjectUrl = null;
    }

    /** One shared background for all pieces — avoids N copies of a multi-MB data URL in the DOM. */
    /** Returns a short URL (blob: or http:) shared by every piece. Never a multi-MB data-URL. */
    function setSharedPuzzleImage(imageOrUrl) {
      // Keep existing object URL if still valid and no new blob
      let url = '';
      if (sessionImgBlob) {
        // Reuse one object URL for the session blob
        if (!sessionImgObjectUrl || !sessionImgObjectUrl.startsWith('blob:')) {
          revokePuzzleObjectUrl();
          sessionImgObjectUrl = URL.createObjectURL(sessionImgBlob);
        }
        url = sessionImgObjectUrl;
      } else if (typeof imageOrUrl === 'string' && imageOrUrl && !imageOrUrl.startsWith('data:')) {
        url = imageOrUrl;
        sessionImgObjectUrl = url;
      } else if (imageOrUrl && imageOrUrl.src && !String(imageOrUrl.src).startsWith('data:')) {
        url = imageOrUrl.src;
        sessionImgObjectUrl = url;
      } else if (imageOrUrl && imageOrUrl.src && String(imageOrUrl.src).startsWith('data:')) {
        // Last resort: convert data-URL image to blob URL once
        revokePuzzleObjectUrl();
        // draw not available sync — keep data url only if tiny; otherwise empty until blob ready
        url = imageOrUrl.src;
        sessionImgObjectUrl = url;
      }
      if (url) {
        world.style.setProperty('--puzzle-img', 'url("' + url.replace(/"/g, '\"') + '")');
      } else {
        world.style.setProperty('--puzzle-img', 'none');
      }
      return url || '';
    }

    /** Downscale large images before IDB storage (keeps resume light). */
    async function blobForSession(sourceBlobOrImg) {
      try {
        let bitmap;
        if (sourceBlobOrImg instanceof Blob) {
          bitmap = await createImageBitmap(sourceBlobOrImg);
        } else {
          bitmap = await createImageBitmap(sourceBlobOrImg);
        }
        const maxEdge = 2048;
        let w = bitmap.width, h = bitmap.height;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close && bitmap.close();
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.88));
        return blob || sourceBlobOrImg;
      } catch (e) {
        console.warn('session image compress failed', e);
        return sourceBlobOrImg instanceof Blob ? sourceBlobOrImg : null;
      }
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
        // Durable image for autosave: Blob in IDB (NOT a data-URL string)
        sessionImgBlob = null;
        sessionImgRemoteUrl = null;
        if (fileInput.files && fileInput.files[0]) {
          sessionImgIsRemote = false;
          sessionImgBlob = await blobForSession(fileInput.files[0]);
        } else if (src.startsWith('blob:')) {
          sessionImgIsRemote = false;
          sessionImgBlob = await blobForSession(await (await fetch(src)).blob());
        } else if (src.startsWith('data:')) {
          sessionImgIsRemote = false;
          const r = await fetch(src);
          sessionImgBlob = await blobForSession(await r.blob());
        } else {
          sessionImgIsRemote = true;
          sessionImgRemoteUrl = (img.src && !img.src.startsWith('blob:')) ? img.src : src;
          // Also keep a compressed blob when possible for reliable resume offline
          try {
            const canvas = document.createElement('canvas');
            const maxEdge = 2048;
            const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
            canvas.width = Math.round((img.naturalWidth || img.width) * scale);
            canvas.height = Math.round((img.naturalHeight || img.height) * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            sessionImgBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.88));
            sessionImgIsRemote = false; // prefer blob for resume
          } catch (_) {}
        }
        setSharedPuzzleImage(img);
      } catch (err) {
        statusEl.textContent = err.message;
        startBtn.disabled = false;
        return;
      }

      cols = rows = parseInt(document.getElementById('gridSize').value, 10);
      window._pieceShape = document.getElementById('pieceShape').value || 'classic';
      stopCheat();
      idbImageWritten = false;
      placementDirty = false;
      await createPuzzle(null);
      // One-time session seed (image + empty progress) so Resume works later
      placementDirty = true;
      scheduleAutosave(true);
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
      if (cheatBtn) cheatBtn.disabled = false;
    }

    async function createPuzzle(restoreState) {
      if (img) setSharedPuzzleImage(img);
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

      // Prefer saved geometry when restoring so positions stay valid
      if (restoreState && restoreState.boardW) {
        boardW = restoreState.boardW;
        boardH = restoreState.boardH;
        pieceW = restoreState.pieceW;
        pieceH = restoreState.pieceH;
        if (restoreState.tabSize) tabSize = restoreState.tabSize;
      }

      // Tab size — proportional, scaled by config.tabScale
      const minDim = Math.min(pieceW, pieceH);
      if (!(restoreState && restoreState.tabSize)) {
        const tabScale = (CFG && CFG.tabScale) || 1.35;
        tabSize = Math.max(4, Math.min(minDim * 0.19, minDim * 0.22) * tabScale);
      }

      // Snap distance
      const snapF = (CFG && CFG.snapFactor) || 0.38;
      const snapMin = (CFG && CFG.snapMin) || 12;
      const snapMax = (CFG && CFG.snapMax) || 32;
      snapThreshold = Math.max(snapMin, Math.min(snapMax, minDim * snapF));

      boardEl.style.width = boardW + 'px';
      boardEl.style.height = boardH + 'px';
      boardEl.style.left = '0px';
      boardEl.style.top = '0px';

      // Tabs: restore from session or generate
      if (restoreState && restoreState.vertTabs && restoreState.horizTabs) {
        vertTabs = restoreState.vertTabs;
        horizTabs = restoreState.horizTabs;
      } else {
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
      }

      // Create interlocking pieces in batches (keeps UI responsive on low-end devices)
      const jobs = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          jobs.push({ r, c });
        }
      }
      const total = jobs.length;
      const batch = Math.max(4, (CFG && CFG.createBatchSize) || 24);
      showProgress('Creating pieces…', 0);

      for (let i = 0; i < total; i++) {
        const { r, c } = jobs[i];
          const tabs = {
            top:    r === 0 ? 0 : -horizTabs[r - 1][c],
            right:  c === cols - 1 ? 0 : vertTabs[r][c],
            bottom: r === rows - 1 ? 0 : horizTabs[r][c],
            left:   c === 0 ? 0 : -vertTabs[r][c - 1]
          };

          const shape = window._pieceShape || 'classic';
          const pad = shape === 'square' ? 1.5 : (tabSize + 1.5);
          const logicalW = pieceW + 2 * pad;
          const logicalH = pieceH + 2 * pad;

          let pathD;
          if (shape === 'square') {
            pathD = `M ${pad} ${pad} H ${pad + pieceW} V ${pad + pieceH} H ${pad} Z`;
          } else {
            pathD = buildJigsawPath(pad, pad, pieceW, pieceH, tabs, tabSize, shape);
          }

          const el = document.createElement('div');
          el.className = 'piece';
          el.style.width  = logicalW + 'px';
          el.style.height = logicalH + 'px';

          const visual = document.createElement('div');
          visual.className = 'piece-visual';
          // Short shared URL (blob:/http:) — NOT a data-URL. Same string on every piece is fine.
          const imgUrl = sessionImgObjectUrl || (img && img.src) || '';
          if (imgUrl) visual.style.backgroundImage = 'url("' + imgUrl + '")';
          visual.style.backgroundSize = boardW + 'px ' + boardH + 'px';
          visual.style.backgroundPosition = (-(c * pieceW - pad)) + 'px ' + (-(r * pieceH - pad)) + 'px';
          visual.style.backgroundRepeat = 'no-repeat';
          visual.style.clipPath = "path('" + pathD + "')";
          visual.style.webkitClipPath = "path('" + pathD + "')";
          el.appendChild(visual);

          const ox = pad;
          const oy = pad;
          const correctX = c * pieceW - ox;
          const correctY = r * pieceH - oy;

          let x, y, placedFlag = false;
          const savedPiece = restoreState && restoreState.pieces
            ? restoreState.pieces.find(sp => sp.r === r && sp.c === c)
            : null;
          if (savedPiece) {
            x = savedPiece.left;
            y = savedPiece.top;
            placedFlag = !!savedPiece.placed;
          } else {
            const margin = Math.max(pieceW, pieceH) * 0.65 + 36;
            const side = Math.floor(Math.random() * 4);
            if (side === 0) {
              x = -margin + Math.random() * (boardW + 2 * margin) - logicalW / 2;
              y = -margin - logicalH - Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
            } else if (side === 1) {
              x = boardW + margin + Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
              y = -margin + Math.random() * (boardH + 2 * margin) - logicalH / 2;
            } else if (side === 2) {
              x = -margin + Math.random() * (boardW + 2 * margin) - logicalW / 2;
              y = boardH + margin + Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
            } else {
              x = -margin - logicalW - Math.random() * (Math.max(boardH, boardW) * 0.4 + 70);
              y = -margin + Math.random() * (boardH + 2 * margin) - logicalH / 2;
            }
          }

          el.style.left = x + 'px';
          el.style.top = y + 'px';
          el.style.zIndex = placedFlag ? 5 : (10 + Math.floor(Math.random() * 40));
          if (placedFlag) el.classList.add('snapped');

          const piece = {
            el, r, c, w: logicalW, h: logicalH,
            ox, oy, correctX, correctY,
            placed: placedFlag,
            group: null
          };
          piece.group = [piece];
          pieces.push(piece);
          el.addEventListener('pointerdown', (e) => onPiecePointerDown(e, piece));
          world.appendChild(el);

        if ((i + 1) % batch === 0 || i === total - 1) {
          showProgress('Creating pieces… ' + (i + 1) + '/' + total, ((i + 1) / total) * 100);
          await yieldFrame();
        }
      }
      hideProgress();

      // Restore groups from session (groupKey shared by members)
      if (restoreState && restoreState.pieces) {
        const byKey = new Map();
        pieces.forEach(p => {
          const sp = restoreState.pieces.find(x => x.r === p.r && x.c === p.c);
          const key = sp && sp.groupKey != null ? sp.groupKey : (p.r + ',' + p.c);
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(p);
        });
        byKey.forEach(g => { g.forEach(p => { p.group = g; }); });
      }

      if (restoreState && restoreState.panX != null) {
        panX = restoreState.panX;
        panY = restoreState.panY;
        scale = restoreState.scale || 1;
        applyTransform();
      } else {
        fitToView(true);
      }

      hintImg.src = img.src;
      hintImg.style.display = 'none';

      updateStatus();
      statusEl.textContent = restoreState
        ? `Session restored — ${pieces.filter(p => p.placed).length}/${pieces.length} placed.`
        : `Puzzle ready — ${cols * rows} pieces. Autosave is on.`;
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
      const pathSegs = Math.max(4, Math.min(24, (CFG && CFG.pathSegments) || 20));

      // Sample a cubic bezier into line segments (same control points, tunable resolution)
      function cubicToLines(x0,y0,x1,y1,x2,y2,x3,y3, segs) {
        const out = [];
        for (let i = 1; i <= segs; i++) {
          const t = i / segs, u = 1 - t;
          const x = u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3;
          const y = u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3;
          out.push(`L ${f(x)} ${f(y)}`);
        }
        return out.join(' ');
      }
      // Emit either native cubics (segs high) or tessellated lines
      function emitCubic(x0,y0,x1,y1,x2,y2,x3,y3) {
        if (pathSegs >= 18) {
          return `C ${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x3)} ${f(y3)}`;
        }
        return cubicToLines(x0,y0,x1,y1,x2,y2,x3,y3, pathSegs);
      }

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
        // Same control points; pathSegments controls tessellation density
        const a0x = x0, a0y = y1;
        const a1x = x0 + 4*u, a1y = y1, a2x = x0 + 6*u, a2y = y1 + o*uh, a3x = x0 + 4*u, a3y = y1 + o*3*uh;
        const b1x = x0 + 2*u, b1y = y1 + o*5*uh, b2x = x0 + 10*u, b2y = y1 + o*5*uh, b3x = x0 + 8*u, b3y = y1 + o*3*uh;
        const c1x = x0 + 6*u, c1y = y1 + o*uh, c2x = x0 + 8*u, c2y = y1, c3x = x0 + 12*u, c3y = y1;
        return [
          `L ${f(a0x)} ${f(a0y)}`,
          emitCubic(a0x,a0y, a1x,a1y, a2x,a2y, a3x,a3y),
          emitCubic(a3x,a3y, b1x,b1y, b2x,b2y, b3x,b3y),
          emitCubic(b3x,b3y, c1x,c1y, c2x,c2y, c3x,c3y)
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
        const a0x = x1, a0y = y0;
        const a1x = x1, a1y = y0 + 4*u, a2x = x1 + o*uh, a2y = y0 + 6*u, a3x = x1 + o*3*uh, a3y = y0 + 4*u;
        const b1x = x1 + o*5*uh, b1y = y0 + 2*u, b2x = x1 + o*5*uh, b2y = y0 + 10*u, b3x = x1 + o*3*uh, b3y = y0 + 8*u;
        const c1x = x1 + o*uh, c1y = y0 + 6*u, c2x = x1, c2y = y0 + 8*u, c3x = x1, c3y = y0 + 12*u;
        return [
          `L ${f(a0x)} ${f(a0y)}`,
          emitCubic(a0x,a0y, a1x,a1y, a2x,a2y, a3x,a3y),
          emitCubic(a3x,a3y, b1x,b1y, b2x,b2y, b3x,b3y),
          emitCubic(b3x,b3y, c1x,c1y, c2x,c2y, c3x,c3y)
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
        fitToView();
        setTimeout(() => winOverlay.classList.add('show'), 320);
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

    async function rescatter() {
      if (!pieces.length) return;
      winOverlay.classList.remove('show');
      showProgress('Rescattering…', 10);
      await yieldFrame();

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
      showProgress('Rescattering…', 100);
      await yieldFrame();
      hideProgress();
      updateStatus();
      fitToView();
    }

    /**
     * Unstack: gently separate overlapping free pieces/groups.
     * Does NOT break groups. Does NOT move placed pieces.
     * Keeps everything near its current position.
     */
    async function unstackPieces() {
      if (!pieces.length) return;
      winOverlay.classList.remove('show');

      const free = pieces.filter(p => !p.placed);
      if (!free.length) {
        statusEl.textContent = 'Nothing to unstack — all pieces are placed.';
        return;
      }

      showProgress('Unstacking…', 2);
      await yieldFrame();

      // Unique free groups
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
        return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
      }

      function moveGroup(g, dx, dy) {
        g.forEach(p => {
          p.el.style.left = (parseFloat(p.el.style.left) + dx) + 'px';
          p.el.style.top = (parseFloat(p.el.style.top) + dy) + 'px';
        });
      }

      const pad = Math.max(4, Math.min(pieceW, pieceH) * 0.08);

      // Broad-phase: only pairs that currently overlap (whitelist)
      function buildOverlapPairs(list) {
        const boxes = list.map(groupBBox);
        const pairs = [];
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.maxX + pad < b.minX || b.maxX + pad < a.minX ||
                a.maxY + pad < b.minY || b.maxY + pad < a.minY) continue;
            pairs.push([i, j]);
          }
        }
        return { boxes, pairs };
      }

      let active = groups.slice();
      const maxIter = 14;
      for (let iter = 0; iter < maxIter; iter++) {
        const { boxes, pairs } = buildOverlapPairs(active);
        if (!pairs.length) {
          showProgress('Unstacking…', 100);
          break;
        }

        // Only push overlapping pairs
        for (let p = 0; p < pairs.length; p++) {
          const i = pairs[p][0], j = pairs[p][1];
          const a = boxes[i], b = boxes[j];
          let dx = a.cx - b.cx;
          let dy = a.cy - b.cy;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.5) {
            const ang = ((i * 17 + j * 31) % 360) * Math.PI / 180;
            dx = Math.cos(ang); dy = Math.sin(ang); dist = 1;
          } else {
            dx /= dist; dy /= dist;
          }
          const push = 5 + iter * 0.35;
          moveGroup(active[i], dx * push * 0.5, dy * push * 0.5);
          moveGroup(active[j], -dx * push * 0.5, -dy * push * 0.5);
        }

        // Shrink active set to groups that still appear in a pair (optional refinement)
        if (pairs.length * 2 < active.length) {
          const keep = new Set();
          pairs.forEach(([i, j]) => { keep.add(i); keep.add(j); });
          active = active.filter((_, idx) => keep.has(idx));
        }

        showProgress('Unstacking…', Math.round(((iter + 1) / maxIter) * 100));
        await yieldFrame();
      }
      hideProgress();
      updateStatus();
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
        pathSegments: 'cfg_pathSegments',
        snapFactor: 'cfg_snapFactor',
        scatterSpread: 'cfg_scatterSpread',
        accent: 'cfg_accent',
        bg: 'cfg_bg',
        panel: 'cfg_panel',
        embossStrength: 'cfg_embossStrength',
        shadowStrength: 'cfg_shadowStrength',
        shadowBlur: 'cfg_shadowBlur',
        createBatchSize: 'cfg_createBatchSize',
        cheatDuration: 'cfg_cheatDuration',
        reduceMotion: 'cfg_reduceMotion'
      };

      function fillConfigForm() {
        Object.keys(cfgKeys).forEach(k => {
          const el = document.getElementById(cfgKeys[k]);
          if (!el) return;
          if (el.type === 'checkbox') el.checked = !!CFG[k];
          else if (el.type === 'color') el.value = CFG[k] || '#000000';
          else if (el.tagName === 'SELECT') el.value = String(CFG[k]);
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
          else if (el.tagName === 'SELECT') CFG[k] = parseInt(el.value, 10);
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
              id === 'cfg_embossStrength' || id === 'cfg_shadowStrength' || id === 'cfg_shadowBlur' ||
              id === 'cfg_reduceMotion') {
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



    // ========== Session autosave (v0.4.4 — light) ==========
    const SESSION_META_KEY = 'art-jigsaw-session-meta';
    const IDB_NAME = 'art-jigsaw-db';
    const IDB_STORE = 'session';
    let autosaveTimer = null;
    let idbImageWritten = false;   // write image blob once per puzzle
    let placementDirty = false;    // only save after a real board placement
    let cheatActive = false;

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    }

    function openSessionDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbSet(key, value) {
      const db = await openSessionDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbGet(key) {
      const db = await openSessionDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbDel(key) {
      const db = await openSessionDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    function buildSessionPayload() {
      if (!pieces.length || !img) return null;
      const groupKeys = new Map();
      let gid = 0;
      pieces.forEach(p => {
        if (!groupKeys.has(p.group)) groupKeys.set(p.group, gid++);
      });
      return {
        version: '0.4.4',
        savedAt: Date.now(),
        cols, rows,
        shape: window._pieceShape || 'classic',
        boardW, boardH, pieceW, pieceH, tabSize,
        vertTabs, horizTabs,
        panX, panY, scale,
        imgRemote: sessionImgIsRemote,
        imageUrl: sessionImgIsRemote ? sessionImgRemoteUrl : null,
        pieces: pieces.map(p => ({
          r: p.r, c: p.c,
          left: parseFloat(p.el.style.left),
          top: parseFloat(p.el.style.top),
          placed: !!p.placed,
          groupKey: groupKeys.get(p.group)
        }))
      };
    }

    /** Save meta always light; image only once. */
    async function saveSession(force) {
      try {
        if (!placementDirty && !force) return;
        const payload = buildSessionPayload();
        if (!payload) return;

        // Image: write Blob once (binary, not base64 data-URL)
        if (!idbImageWritten) {
          if (sessionImgBlob) {
            await idbSet('image', sessionImgBlob);
            idbImageWritten = true;
          } else if (sessionImgIsRemote && sessionImgRemoteUrl) {
            idbImageWritten = true; // URL is in meta.imageUrl only
          }
        }

        await idbSet('meta', payload);
        try {
          localStorage.setItem(SESSION_META_KEY, JSON.stringify({
            savedAt: payload.savedAt,
            cols: payload.cols,
            rows: payload.rows,
            placed: payload.pieces.filter(x => x.placed).length,
            total: payload.pieces.length
          }));
        } catch (_) {}
        placementDirty = false;
      } catch (err) {
        console.warn('autosave failed', err);
      }
    }

    function scheduleAutosave(force) {
      // Only queue after placement (or forced)
      if (!force && !placementDirty) return;
      const delay = force ? 80 : 600;
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => saveSession(true), delay);
    }

    /** Call this only when a piece/group is locked onto the board. */
    function onPiecePlacedSave() {
      placementDirty = true;
      scheduleAutosave(false);
    }

    async function clearSession() {
      try {
        await idbDel('meta');
        await idbDel('image');
        localStorage.removeItem(SESSION_META_KEY);
        idbImageWritten = false;
        placementDirty = false;
      } catch (_) {}
      statusEl.textContent = 'Saved session cleared.';
      updateResumeButton();
    }

    function updateResumeButton() {
      if (!resumeBtn) return;
      try {
        const hint = localStorage.getItem(SESSION_META_KEY);
        if (!hint) { resumeBtn.disabled = true; return; }
        const info = JSON.parse(hint);
        resumeBtn.disabled = false;
        resumeBtn.title = `Resume ${info.placed || 0}/${info.total || '?'} · ${info.cols}×${info.rows}`;
      } catch (_) {
        resumeBtn.disabled = true;
      }
    }

    async function tryRestoreSession() {
      try {
        stopCheat();
        const meta = await idbGet('meta');
        if (!meta || !meta.pieces || !meta.pieces.length) {
          statusEl.textContent = 'No saved session found.';
          return false;
        }
        const imageData = await idbGet('image'); // Blob or legacy string
        if (!imageData && !meta.imageUrl) {
          statusEl.textContent = 'Session found but image is missing. Start a new puzzle.';
          return false;
        }

        statusEl.textContent = 'Restoring session…';
        showProgress('Restoring session…', 5);
        await yieldFrame();

        let src;
        if (imageData instanceof Blob) {
          sessionImgBlob = imageData;
          sessionImgIsRemote = false;
          src = URL.createObjectURL(imageData);
          sessionImgObjectUrl = src;
        } else if (typeof imageData === 'string') {
          // legacy data-URL or remote URL from older builds
          sessionImgBlob = null;
          src = imageData;
          sessionImgIsRemote = !imageData.startsWith('data:');
          sessionImgRemoteUrl = sessionImgIsRemote ? imageData : null;
        } else {
          sessionImgIsRemote = true;
          sessionImgRemoteUrl = meta.imageUrl;
          src = meta.imageUrl;
        }

        img = await loadImage(src);
        setSharedPuzzleImage(img);
        idbImageWritten = true;
        placementDirty = false;

        cols = rows = meta.cols;
        window._pieceShape = meta.shape || 'classic';
        const gs = document.getElementById('gridSize');
        if (gs) gs.value = String(cols);
        const ps = document.getElementById('pieceShape');
        if (ps) ps.value = window._pieceShape;

        await createPuzzle(meta);
        hideProgress();
        startBtn.disabled = false;
        fitBtn.disabled = false;
        arrangeBtn.disabled = false;
        hintBtn.disabled = false;
        resetBtn.disabled = false;
        if (cheatBtn) cheatBtn.disabled = false;
        updateResumeButton();
        return true;
      } catch (err) {
        console.warn('restore failed', err);
        hideProgress();
        statusEl.textContent = 'Restore failed. Try Start Puzzle instead.';
        return false;
      }
    }

    // ========== Cheat mode ==========
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function stopCheat() {
      cheatActive = false;
      if (cheatBtn) {
        cheatBtn.classList.remove('active');
        cheatBtn.textContent = 'Cheat!';
      }
    }

    function animateGroupHome(group, duration) {
      return new Promise(resolve => {
        const ref = group[0];
        const x0 = parseFloat(ref.el.style.left);
        const y0 = parseFloat(ref.el.style.top);
        const dx = ref.correctX - x0;
        const dy = ref.correctY - y0;
        const starts = group.map(p => ({
          p,
          x0: parseFloat(p.el.style.left),
          y0: parseFloat(p.el.style.top),
          x1: parseFloat(p.el.style.left) + dx,
          y1: parseFloat(p.el.style.top) + dy
        }));
        group.forEach(p => { p.el.style.zIndex = 180; });
        const t0 = performance.now();
        function frame(now) {
          if (!cheatActive) { resolve(false); return; }
          const t = Math.min(1, (now - t0) / duration);
          const e = easeOutCubic(t);
          starts.forEach(({ p, x0, y0, x1, y1 }) => {
            p.el.style.left = (x0 + (x1 - x0) * e) + 'px';
            p.el.style.top = (y0 + (y1 - y0) * e) + 'px';
          });
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            starts.forEach(({ p, x1, y1 }) => {
              p.el.style.left = x1 + 'px';
              p.el.style.top = y1 + 'px';
              p.placed = true;
              p.el.classList.add('snapped');
              p.el.style.zIndex = 5;
            });
            // Merge all placed group members into one shared group array
            const merged = [];
            const seen = new Set();
            starts.forEach(({ p }) => {
              p.group.forEach(m => {
                if (!seen.has(m)) { seen.add(m); merged.push(m); }
              });
            });
            merged.forEach(m => { m.group = merged; });
            flashPieces(starts.map(s => s.p));
            onPiecePlacedSave();
            resolve(true);
          }
        }
        requestAnimationFrame(frame);
      });
    }

    async function runCheatLoop() {
      const duration = Math.max(10, (CFG && CFG.cheatDuration) || 550);
      while (cheatActive) {
        const free = pieces.filter(p => !p.placed);
        if (!free.length) {
          stopCheat();
          checkWin();
          scheduleAutosave(true);
          break;
        }
        // Unique free groups — place one group at a time
        const seen = new Set();
        const groups = [];
        free.forEach(p => {
          if (seen.has(p.group)) return;
          seen.add(p.group);
          groups.push(p.group);
        });
        // Prefer larger groups first for nicer assembly
        groups.sort((a, b) => b.length - a.length);
        const g = groups[0];
        const ok = await animateGroupHome(g, duration);
        if (!ok || !cheatActive) break;
        updateStatus();
        await yieldFrame();
      }
      scheduleAutosave(true);
    }

    function toggleCheat() {
      if (!pieces.length) return;
      if (cheatActive) {
        stopCheat();
        statusEl.textContent = 'Cheat paused — continue manually.';
        scheduleAutosave(true);
        return;
      }
      cheatActive = true;
      if (cheatBtn) {
        cheatBtn.classList.add('active');
        cheatBtn.textContent = 'Stop Cheat';
      }
      statusEl.textContent = 'Cheat mode — pieces sliding home…';
      runCheatLoop();
    }

    if (cheatBtn) cheatBtn.addEventListener('click', toggleCheat);

    // Stop cheat if user grabs a piece
    const _origOnPiecePointerDown = typeof onPiecePointerDown === 'function' ? null : null;
    // Hook via wrapper: monkey-patch after definition is hard; listen on world
    world.addEventListener('pointerdown', (e) => {
      if (cheatActive && e.target && e.target.closest && e.target.closest('.piece')) {
        stopCheat();
      }
    }, true);

    if (resumeBtn) {
      resumeBtn.addEventListener('click', async () => {
        resumeBtn.disabled = true;
        await tryRestoreSession();
        updateResumeButton();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && placementDirty) saveSession(true);
    });
    window.addEventListener('pagehide', () => {
      if (placementDirty) saveSession(true);
    });

    const clearSessionBtn = document.getElementById('cfgClearSession');
    if (clearSessionBtn) {
      clearSessionBtn.addEventListener('click', () => clearSession());
    }

    updateResumeButton();
    const tableSel = document.getElementById('tableStyle');
    if (tableSel) {
      tableSel.addEventListener('change', () => {
        applyTableStyle(tableSel.value);
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const obj = raw ? JSON.parse(raw) : {};
          obj.tableStyle = tableSel.value;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, CFG, obj)));
        } catch (_) {}
        // also persist into CFG save key
        CFG.tableStyle = tableSel.value;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(CFG));
        } catch (_) {}
      });
    }

    console.info('[Art Jigsaw] v0.4.4 · table-surfaces · felt-linen-papyrus');

