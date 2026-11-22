/* THE RADIOACTIVE TITANIUM COCKROACH — teaser film renderer.
   Every frame is a pure function of time t (seconds), so the same code
   drives the live player and the offline MP4 render. */
(function () {
  const W = 1280, H = 720, DUR = 118, BAR = 88;
  const DISPLAY = '"Anton", Impact, "Arial Narrow", sans-serif';
  const MONO = '"IBM Plex Mono", "DejaVu Sans Mono", Menlo, monospace';
  const GREEN = '#5dff6e', HOT = '#d6ffc9';
  let SK = 1; // device scale, for shadow blur

  function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function env(t, a, b, fi = 0.35, fo = 0.35) {
    if (t < a || t > b) return 0;
    return Math.min(fi > 0 ? clamp((t - a) / fi) : 1, fo > 0 ? clamp((b - t) / fo) : 1);
  }
  const blur = (c, color, v) => { c.shadowColor = color; c.shadowBlur = v * SK; };
  const noBlur = c => { c.shadowBlur = 0; };
  function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function poly(c, pts, stroke) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); stroke ? c.stroke() : c.fill();
  }
  function vgrad(c, y0, y1, stops) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }
  function fillAll(c, style) { c.fillStyle = style; c.fillRect(0, 0, W, H); }

  /* ---------- precomputed textures ---------- */
  let grainPat = null, stone = null, cracks = null, mtn = null, ridge = null, crestCracks = null;
  function genCracks(seed, n, lenA, lenB, depth) {
    const out = []; let k = seed;
    function br(x, y, a, len, d, p0) {
      const pts = [[x, y]]; let cx = x, cy = y; const steps = 6;
      for (let i = 0; i < steps; i++) {
        a += (rnd(k++) - 0.5) * 0.9;
        cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps;
        pts.push([cx, cy]);
      }
      out.push({ pts, p0, p1: p0 + 0.35, d });
      if (d > 0) {
        const nb = 1 + (rnd(k++) > 0.4 ? 1 : 0);
        for (let j = 0; j < nb; j++) {
          const ii = 2 + Math.floor(rnd(k++) * 4);
          br(pts[ii][0], pts[ii][1], a + (rnd(k++) - 0.5) * 2.2, len * 0.6, d - 1, p0 + 0.12 + ii * 0.04);
        }
      }
    }
    for (let i = 0; i < n; i++) br(0, 0, (i / n) * Math.PI * 2 + rnd(k++) * 0.5, lenA + rnd(k++) * lenB, depth, 0);
    return out;
  }
  function drawCracks(c, list, p) {
    for (const s of list) {
      const f = clamp((p - s.p0) / (s.p1 - s.p0)); if (f <= 0) continue;
      const n = s.pts.length - 1, upto = f * n;
      c.lineWidth = 0.8 + s.d * 0.7;
      c.beginPath(); c.moveTo(s.pts[0][0], s.pts[0][1]);
      for (let i = 1; i <= Math.ceil(upto); i++) {
        const a = s.pts[i - 1], b = s.pts[i], q = Math.min(1, upto - (i - 1));
        c.lineTo(lerp(a[0], b[0], q), lerp(a[1], b[1], q));
      }
      c.stroke();
    }
  }
  function init() {
    const g = document.createElement('canvas'); g.width = g.height = 256;
    const gx = g.getContext('2d'); const id = gx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = (rnd(i * 1.37 + 0.5) * 255) | 0;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    gx.putImageData(id, 0, 0);
    grainPat = g;

    stone = document.createElement('canvas'); stone.width = W; stone.height = H;
    const s = stone.getContext('2d');
    s.fillStyle = '#16120f'; s.fillRect(0, 0, W, H);
    for (let i = 0; i < 4000; i++) {
      const x = rnd(i) * W, y = rnd(i + 9e3) * H, r = rnd(i + 2e4) * 22 + 2, lt = rnd(i + 3e4) > 0.5;
      s.fillStyle = lt ? `rgba(70,60,50,${0.04 + rnd(i + 4e4) * 0.06})` : `rgba(0,0,0,${0.08 + rnd(i + 4e4) * 0.1})`;
      s.beginPath(); s.arc(x, y, r, 0, 7); s.fill();
    }
    s.strokeStyle = 'rgba(0,0,0,0.35)'; s.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const y = rnd(i + 5e4) * H; s.beginPath(); s.moveTo(0, y);
      for (let x = 0; x <= W; x += 40) s.lineTo(x, y + (rnd(i * 31 + x) - 0.5) * 8);
      s.stroke();
    }

    cracks = genCracks(11, 7, 110, 90, 3);
    crestCracks = genCracks(77, 4, 60, 50, 2);
    mtn = []; for (let x = -20; x <= W + 20; x += 14) {
      mtn.push([x, 610 - 410 * Math.exp(-Math.pow((x - 640) / 330, 2)) + (rnd(x * 0.37) - 0.5) * 18]);
    }
    ridge = []; for (let x = 540; x <= W + 20; x += 18) {
      ridge.push([x, 530 - 280 * Math.exp(-Math.pow((x - 930) / 200, 2)) + (rnd(x * 0.91) - 0.5) * 14]);
    }
  }

  /* ---------- figures ---------- */
  function drawRoach(c, x, y, h, o = {}) {
    const t = o.t || 0, fill = o.fill || '#05070a';
    c.save(); c.translate(x, y); c.scale(h, h);
    c.fillStyle = fill; c.strokeStyle = fill; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.rim) blur(c, o.rim, o.rimBlur || 22);
    const sw = Math.sin(t * 1.7) * 0.03, sw2 = Math.sin(t * 1.3 + 1) * 0.05;
    c.lineWidth = Math.max(0.007, 1.6 / h);
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 0.03, -0.93);
      c.quadraticCurveTo(s * 0.14, -1.16 + sw * s, s * (0.4 + sw2 * 0.3), -1.22 + sw2 * s); c.stroke();
    }
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 0.2, -0.8); c.quadraticCurveTo(s * 0.38, -0.62, s * 0.34, -0.17);
      c.lineTo(s * 0.22, -0.22); c.quadraticCurveTo(s * 0.21, -0.55, s * 0.12, -0.78); c.closePath(); c.fill();
    }
    for (const s of [-1, 1]) {
      c.lineWidth = 0.075; line(c, s * 0.07, -0.47, s * 0.15, -0.27);
      c.lineWidth = 0.055; line(c, s * 0.15, -0.27, s * 0.1, -0.05);
      c.lineWidth = 0.03; line(c, s * 0.1, -0.05, s * 0.17, 0); line(c, s * 0.1, -0.05, s * 0.04, 0);
    }
    poly(c, [[-0.26, -0.8], [0.26, -0.8], [0.21, -0.62], [0.12, -0.47], [0.09, -0.4], [-0.09, -0.4], [-0.12, -0.47], [-0.21, -0.62]]);
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.25, -0.775, 0.07, 0.055, s * 0.3, 0, 7); c.fill(); }
    for (const s of [-1, 1]) {
      c.lineWidth = 0.075; line(c, s * 0.26, -0.76, s * 0.34, -0.58);
      c.lineWidth = 0.11; line(c, s * 0.34, -0.58, s * 0.32, -0.42);
      c.lineWidth = 0.022; line(c, s * 0.32, -0.4, s * 0.37, -0.32); line(c, s * 0.32, -0.4, s * 0.33, -0.3); line(c, s * 0.31, -0.4, s * 0.28, -0.32);
    }
    c.beginPath(); c.ellipse(0, -0.855, 0.066, 0.072, 0, 0, 7); c.fill();
    poly(c, [[-0.15, -0.83], [-0.11, -0.93], [0, -0.975], [0.11, -0.93], [0.15, -0.83], [0.07, -0.875], [0, -0.895], [-0.07, -0.875]]);
    c.lineWidth = 0.016;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.035, -0.81); c.quadraticCurveTo(s * 0.05, -0.78, s * 0.012, -0.765); c.stroke(); }
    noBlur(c);
    const gl = o.glow ?? 0.6;
    if (gl > 0) {
      c.globalAlpha *= clamp(gl);
      c.strokeStyle = GREEN; blur(c, GREEN, 10 * gl + 4); c.lineWidth = Math.max(0.004, 1.3 / h);
      c.beginPath(); c.moveTo(-0.13, -0.75); c.lineTo(-0.06, -0.69); c.lineTo(-0.09, -0.61); c.lineTo(-0.03, -0.53);
      c.moveTo(0.03, -0.77); c.lineTo(0.08, -0.69); c.lineTo(0.05, -0.62); c.lineTo(0.1, -0.55);
      c.moveTo(-0.33, -0.55); c.lineTo(-0.31, -0.47); c.moveTo(0.33, -0.54); c.lineTo(0.32, -0.46);
      c.moveTo(0, -0.47); c.lineTo(0, -0.41);
      c.stroke();
      c.globalAlpha /= clamp(gl) || 1;
    }
    const e = o.eyes ?? 1;
    if (e > 0) {
      c.globalAlpha *= e; c.fillStyle = HOT; blur(c, GREEN, 16 * e + 4);
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.033, -0.862, Math.max(0.024, 1.6 / h), Math.max(0.013, 1 / h), s * 0.35, 0, 7); c.fill(); }
    }
    c.restore();
  }
  function drawHuman(c, x, y, h, lean, fill, rim) {
    c.save(); c.translate(x, y); c.scale(h, h); c.fillStyle = c.strokeStyle = fill; c.lineCap = 'round';
    if (rim) blur(c, rim, 14);
    const hx = -0.18 * lean, hy = -0.9;
    c.beginPath(); c.arc(hx, hy, 0.07, 0, 7); c.fill();
    c.lineWidth = 0.13; line(c, hx * 0.9, hy + 0.12, hx * 0.3 + 0.03, -0.48);
    c.lineWidth = 0.08; line(c, hx * 0.3 + 0.03, -0.48, 0.16, -0.24); line(c, 0.16, -0.24, 0.2, 0);
    line(c, hx * 0.3, -0.48, -0.02, -0.24); line(c, -0.02, -0.24, 0.02, 0);
    c.lineWidth = 0.06; line(c, hx * 0.8, hy + 0.17, hx - 0.18, -0.7); line(c, hx - 0.18, -0.7, hx - 0.22, -0.56);
    line(c, hx * 0.8, hy + 0.17, hx - 0.14, -0.62);
    c.restore();
  }
  function hexEye(c, cx, cy, rx, ry, rot, e, cell, seed) {
    c.save(); c.translate(cx, cy); c.rotate(rot);
    c.fillStyle = '#020403'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.fill();
    if (e > 0) {
      c.save(); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.clip();
      const hw = cell * Math.sqrt(3), vh = cell * 1.5; let k = 0;
      for (let row = -Math.ceil(ry / vh) - 1; row <= Math.ceil(ry / vh) + 1; row++) {
        for (let col = -Math.ceil(rx / hw) - 1; col <= Math.ceil(rx / hw) + 1; col++) {
          const px = col * hw + (row & 1 ? hw / 2 : 0), py = row * vh; k++;
          const d = (px * px) / (rx * rx) + (py * py) / (ry * ry); if (d > 1.15) continue;
          const b = e * (0.45 + 0.55 * (1 - d)) * (0.75 + 0.25 * rnd(k + seed)) - (py < -ry * 0.3 ? 0.08 : 0);
          const r = Math.round(lerp(10, 214, b * b)), g = Math.round(lerp(40, 255, b)), bl = Math.round(lerp(14, 190, b * b * b));
          c.fillStyle = `rgb(${r},${g},${bl})`;
          c.beginPath();
          for (let a = 0; a < 6; a++) {
            const an = Math.PI / 6 + (a * Math.PI) / 3;
            c.lineTo(px + Math.cos(an) * cell * 0.9, py + Math.sin(an) * cell * 0.9);
          }
          c.fill();
        }
      }
      c.restore();
      c.globalAlpha = e; blur(c, GREEN, 40 * e); c.strokeStyle = 'rgba(120,255,140,0.5)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.stroke();
      // specular
      noBlur(c); c.globalAlpha = 0.35 * e; c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(-rx * 0.35, -ry * 0.45, rx * 0.18, ry * 0.08, -0.3, 0, 7); c.fill();
    }
    c.restore();
  }
  function metal(c, x0, y0, x1, y1) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#e6e9eb'); g.addColorStop(0.42, '#8a8d8f'); g.addColorStop(0.55, '#34383b'); g.addColorStop(1, '#a9adb0');
    return g;
  }
  function drawInsignia(c, cx, cy, s, alpha, glow) {
    c.save(); c.translate(cx, cy); c.scale(s, s); c.globalAlpha = alpha; c.lineJoin = 'round'; c.lineCap = 'round';
    // antennae
    c.strokeStyle = metal(c, -1, -1.6, 1, -0.9); c.lineWidth = 0.05;
    for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * 0.1, -0.98); c.quadraticCurveTo(k * 0.35, -1.5, k * 1.0, -1.55); c.stroke(); }
    const shield = () => {
      c.beginPath(); c.moveTo(-0.85, -0.55); c.quadraticCurveTo(-0.9, -0.97, -0.3, -1.0); c.lineTo(0.3, -1.0);
      c.quadraticCurveTo(0.9, -0.97, 0.85, -0.55); c.quadraticCurveTo(0.85, 0.35, 0, 1.05);
      c.quadraticCurveTo(-0.85, 0.35, -0.85, -0.55); c.closePath();
    };
    blur(c, 'rgba(0,0,0,0.9)', 30); shield(); c.fillStyle = metal(c, -1, -1, 1, 1); c.fill(); noBlur(c);
    c.strokeStyle = '#c9ced1'; c.lineWidth = 0.035; shield(); c.stroke();
    // pronotum line
    c.strokeStyle = '#1d2022'; c.lineWidth = 0.045;
    c.beginPath(); c.moveTo(-0.84, -0.42); c.quadraticCurveTo(0, -0.28, 0.84, -0.42); c.stroke();
    // split
    c.beginPath(); c.moveTo(0, -0.35); c.lineTo(0, 1.02); c.stroke();
    // head + trefoil cutouts
    c.fillStyle = '#101214';
    c.beginPath(); c.moveTo(-0.2, -1.0); c.lineTo(0.2, -1.0); c.lineTo(0, -0.84); c.closePath(); c.fill();
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 6 + Math.PI;
      c.beginPath(); c.arc(0, -0.66, 0.2, a0, a0 + Math.PI / 3); c.arc(0, -0.66, 0.065, a0 + Math.PI / 3, a0, true); c.closePath(); c.fill();
    }
    c.beginPath(); c.arc(0, -0.66, 0.035, 0, 7); c.fill();
    // tally
    c.strokeStyle = '#1a1c1e'; c.lineWidth = 0.03;
    for (let i = 0; i < 4; i++) line(c, -0.55 + i * 0.07, 0.02, -0.55 + i * 0.07, 0.28);
    line(c, -0.6, 0.24, -0.3, 0.06);
    // crack
    if (glow > 0) {
      c.globalAlpha = alpha * glow; c.strokeStyle = HOT; blur(c, GREEN, 26 * glow); c.lineWidth = 0.03;
      poly(c, [[-0.62, -0.3], [-0.38, -0.12], [-0.42, 0.02], [-0.15, 0.12], [-0.2, 0.3], [0.12, 0.38], [0.08, 0.52], [0.45, 0.6]], true);
    }
    c.restore();
  }

  /* ---------- text ---------- */
  function cap(c, t, a, b, text, o = {}) {
    const al = env(t, a, b, o.fi ?? 0.4, o.fo ?? 0.4); if (al <= 0) return;
    c.save(); c.globalAlpha = al; c.textAlign = o.align || 'center'; c.textBaseline = 'middle';
    const size = o.size || 26;
    c.font = `${size}px ${o.font || MONO}`; c.letterSpacing = (o.ls ?? 2) + 'px';
    c.fillStyle = o.color || '#eef1ec';
    blur(c, o.glow || 'rgba(0,0,0,0.9)', o.glow ? 22 : 12);
    const x = o.x ?? 640, y = o.y ?? 566;
    c.fillText(text, x, y);
    if (o.sub) {
      c.font = `${Math.round(Math.max(13, size * 0.5))}px ${MONO}`; c.globalAlpha = al * 0.62; c.letterSpacing = '3px';
      c.fillStyle = '#eef1ec'; c.fillText(o.sub, x, y + Math.max(26, size * 1.05));
    }
    c.restore();
  }
  const sup = (c, t, a, b, text) => cap(c, t, a, b, text, { x: 64, y: 122, size: 14, align: 'left', ls: 4, color: '#cfd6cf' });
  function card(c, t, a, b, text) {
    if (t < a || t >= b) return false;
    fillAll(c, '#000'); const lt = t - a;
    c.save(); c.translate(640, 360); const s = 1 + 0.05 * lt; c.scale(s, s);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `104px ${DISPLAY}`; c.letterSpacing = '5px';
    c.fillStyle = metal(c, 0, -60, 0, 50); c.fillText(text, 0, 0);
    c.restore();
    const f = Math.exp(-lt * 9) * 0.7; if (f > 0.01) fillAll(c, `rgba(255,255,255,${f})`);
    return true;
  }

  /* ---------- scenes ---------- */
  const S = [];
  const scene = (a, b, d, fi = 0, fo = 0) => S.push({ a, b, d, fi, fo });

  // 0 — tally in the dark
  scene(0, 9, (c, t) => {
    fillAll(c, '#000');
    if (t >= 1) {
      const n = Math.min(12, Math.floor((t - 1) / 0.45) + 1);
      c.strokeStyle = 'rgba(235,238,232,0.85)'; c.lineCap = 'round'; c.lineWidth = 4;
      const startX = 640 - (2 * 128 + 2 * 22) / 2 + 10;
      for (let m = 0; m < n; m++) {
        const g = Math.floor(m / 5), k = m % 5, gx = startX + g * 128;
        const frac = m === n - 1 ? clamp(((t - 1) % 0.45) / 0.18) : 1;
        let x1, y1, x2, y2;
        if (k < 4) { x1 = gx + k * 22 + (rnd(m) - 0.5) * 4; y1 = 300 + (rnd(m + 50) - 0.5) * 6; x2 = x1 + (rnd(m + 99) - 0.5) * 6; y2 = 372; }
        else { x1 = gx - 10; y1 = 360; x2 = gx + 76; y2 = 312; }
        line(c, x1, y1, lerp(x1, x2, frac), lerp(y1, y2, frac));
      }
    }
    cap(c, t, 3.4, 8.4, 'WHEN I WAS A KID, THEY HAD A NAME FOR ME.', { size: 22, y: 480 });
  }, 0, 0.6);

  // 1 — Ashgrove at dusk
  scene(9, 18, (c, t, lt) => {
    c.save(); c.translate(640, 400); const z = 1 + 0.05 * (lt / 9); c.scale(z, z); c.translate(-640, -400);
    fillAll(c, vgrad(c, 0, 560, [[0, '#1a1030'], [0.45, '#5d2440'], [0.78, '#d0673a'], [1, '#f4a95b']]));
    const sg = c.createRadialGradient(420, 470, 10, 420, 470, 260);
    sg.addColorStop(0, 'rgba(255,214,150,0.95)'); sg.addColorStop(0.18, 'rgba(255,170,90,0.5)'); sg.addColorStop(1, 'rgba(255,120,60,0)');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    c.fillStyle = '#3a1a2a'; c.beginPath(); c.moveTo(540, 560); ridge.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(W + 20, 560); c.fill();
    c.fillStyle = '#16090f';
    c.beginPath(); c.moveTo(445, 540); c.quadraticCurveTo(497, 455, 470, 385); c.lineTo(545, 385); c.quadraticCurveTo(520, 455, 572, 540); c.fill();
    c.fillRect(0, 528, W, H);
    // water tower
    c.strokeStyle = '#16090f'; c.lineWidth = 5; line(c, 215, 530, 233, 395); line(c, 285, 530, 267, 395); line(c, 250, 530, 250, 395);
    c.lineWidth = 2; line(c, 222, 470, 278, 440); line(c, 278, 470, 222, 440);
    c.fillStyle = '#16090f'; c.fillRect(205, 335, 90, 62); c.beginPath(); c.ellipse(250, 335, 45, 16, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#4a2630'; c.font = `17px ${DISPLAY}`; c.textAlign = 'center'; c.letterSpacing = '2px'; c.fillText('ASHGROVE', 250, 373);
    // poles
    c.strokeStyle = '#16090f'; c.lineWidth = 4;
    for (const px of [70, 360, 640]) { line(c, px, 530, px, 380); line(c, px - 24, 392, px + 24, 392); }
    c.lineWidth = 1.2; c.beginPath(); c.moveTo(46, 392); c.quadraticCurveTo(215, 430, 336, 392); c.quadraticCurveTo(500, 430, 616, 392); c.stroke();
    c.beginPath(); c.moveTo(94, 392); c.quadraticCurveTo(225, 428, 384, 392); c.quadraticCurveTo(520, 428, 664, 392); c.stroke();
    // dust
    for (let i = 0; i < 50; i++) {
      const x = (rnd(i) * W + lt * 18 * (0.5 + rnd(i + 1))) % W, y = 200 + rnd(i + 2) * 330 + Math.sin(lt + i) * 6;
      c.fillStyle = `rgba(255,200,150,${0.12 + rnd(i + 3) * 0.2})`; c.fillRect(x, y, 2, 2);
    }
    c.restore();
    sup(c, t, 9.4, 13.4, 'ASHGROVE  ·  HIGH DESERT');
    cap(c, t, 9.9, 13.3, 'BECAUSE NO MATTER HOW MANY TIMES THEY KNOCKED ME DOWN...', { size: 22 });
    cap(c, t, 13.8, 17.4, 'I GOT BACK UP.', { size: 30 });
  }, 0.6, 0.5);

  // 2 — hospital, the promise
  const ecg = ph => {
    const g = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
    return 0.1 * g(ph, 0.15, 0.03) - 0.12 * g(ph, 0.28, 0.008) + g(ph, 0.3, 0.008) - 0.26 * g(ph, 0.325, 0.009) + 0.22 * g(ph, 0.5, 0.05);
  };
  scene(18, 25, (c, t) => {
    fillAll(c, vgrad(c, 0, H, [[0, '#03100f'], [0.6, '#061a18'], [1, '#020807']]));
    c.strokeStyle = 'rgba(79,227,193,0.06)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 40) line(c, x, 88, x, 632);
    for (let y = 88; y < 632; y += 40) line(c, 0, y, W, y);
    const head = 1040, pps = 300;
    c.lineWidth = 2.5; c.lineJoin = 'round'; blur(c, '#4fe3c1', 10);
    for (let seg = 0; seg < 18; seg++) {
      const x0 = head - (seg + 1) * 50, x1 = head - seg * 50; if (x1 < 60) break;
      c.strokeStyle = `rgba(110,240,205,${0.95 * (1 - seg / 18)})`; c.beginPath();
      for (let px = x0; px <= x1; px += 2) {
        const tau = t - (head - px) / pps, ph = (((tau - 18) / 0.9) % 1 + 1) % 1;
        const y = 370 - ecg(ph) * 130; px === x0 ? c.moveTo(px, y) : c.lineTo(px, y);
      }
      c.stroke();
    }
    const ph = (((t - 18) / 0.9) % 1 + 1) % 1;
    c.fillStyle = '#d8fff3'; c.beginPath(); c.arc(head, 370 - ecg(ph) * 130, 4, 0, 7); c.fill(); noBlur(c);
    c.fillStyle = 'rgba(110,240,205,0.85)'; c.font = `44px ${MONO}`; c.textAlign = 'right'; c.fillText('48', 1210, 170);
    c.font = `13px ${MONO}`; c.letterSpacing = '3px'; c.fillText('HR  BPM', 1210, 196);
    sup(c, t, 18.3, 22, 'ASHGROVE GENERAL  ·  ONCOLOGY WARD  ·  10 YEARS EARLIER');
    cap(c, t, 18.7, 21.4, '“PROMISE YOU’LL COME HOME.”', { size: 28, sub: 'MIRA, AGE 13' });
    cap(c, t, 21.9, 24.6, '“I ALWAYS COME BACK.”', { size: 28, sub: 'TEO, AGE 19' });
  }, 0.4, 0.4);

  // 3 — descent into Kessler Deep
  scene(25, 32, (c, t, lt) => {
    fillAll(c, '#0b0806');
    const sPos = 150 * lt + 130 * lt * lt, v = 150 + 260 * lt;
    for (const [x0, x1] of [[0, 330], [950, W]]) {
      c.fillStyle = vgrad(c, 0, H, [[0, '#1d140d'], [1, '#0d0906']]); c.fillRect(x0, 0, x1 - x0, H);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
      for (let i = 0; i < 40; i++) { const y = H - ((sPos * 0.9 + i * 61 + rnd(i) * 40) % (H + 80)); line(c, x0, y, x1, y + (rnd(i + 3) - 0.5) * 10); }
    }
    for (let i = 0; i < 12; i++) {
      const x = i % 2 ? 300 : 980, y = 900 - ((sPos + i * 190) % 1140), len = 10 + v * 0.06;
      const g = c.createRadialGradient(x, y, 2, x, y, 140); g.addColorStop(0, 'rgba(255,180,80,0.55)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      c.fillStyle = g; c.fillRect(x - 150, y - 150, 300, 300);
      c.fillStyle = '#ffe2a8'; c.fillRect(x - 5, y - len / 2, 10, len);
    }
    c.fillStyle = '#030201';
    for (let x = 40; x < W; x += 120) { c.fillRect(x, 0, 16, H); }
    c.fillRect(0, 230, W, 10); c.fillRect(0, 520, W, 10);
    const d = Math.round(2000 * ss(25.3, 30.6, t));
    cap(c, t, 25.2, 31.8, `DEPTH  ${String(d).padStart(4, '0')} M`, { x: 1216, y: 122, size: 16, align: 'right', ls: 4, color: '#ffcf8a', fi: 0.2 });
    cap(c, t, 25.5, 28.0, 'KESSLER DEEP NUCLEAR REPOSITORY', { size: 40, font: DISPLAY, ls: 6, y: 360 });
    cap(c, t, 28.3, 31.7, '“LIFE IS A MATH PROBLEM. EXTINCTION IS THE ANSWER.”', { size: 24, sub: 'DR. HALVARD STRAND  ·  AEGIS MERIDIAN' });
  }, 0.4, 0.3);

  // 4 — criticality, the blast door
  scene(32, 37.6, (c, t, lt) => {
    const boom = t - 35.2;
    if (boom > 0) { const a = 18 * Math.exp(-boom * 1.6); c.translate((rnd(Math.floor(t * 60)) - 0.5) * a, (rnd(Math.floor(t * 60) + 7) - 0.5) * a); }
    fillAll(c, '#070606');
    const vx = 640, vy = 340, fx0 = 520, fx1 = 760, fy0 = 205, fy1 = 470;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2.5);
    c.fillStyle = '#141112'; poly(c, [[0, 88], [W, 88], [fx1, fy0], [fx0, fy0]]);
    c.fillStyle = '#0f0c0c'; poly(c, [[0, 632], [W, 632], [fx1, fy1], [fx0, fy1]]);
    c.fillStyle = '#1a1617'; poly(c, [[0, 88], [fx0, fy0], [fx0, fy1], [0, 632]]); poly(c, [[W, 88], [fx1, fy0], [fx1, fy1], [W, 632]]);
    c.strokeStyle = '#2a2324'; c.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      const q = Math.pow(i / 6, 1.6);
      const x0 = lerp(0, fx0, q), x1 = lerp(W, fx1, q), y0 = lerp(88, fy0, q), y1 = lerp(632, fy1, q);
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    // door
    c.fillStyle = vgrad(c, fy0, fy1, [[0, '#4a4f53'], [1, '#202325']]); c.fillRect(fx0 + 8, fy0 + 8, fx1 - fx0 - 16, fy1 - fy0 - 8);
    c.strokeStyle = '#0d0e0f'; c.lineWidth = 6; c.strokeRect(fx0 + 8, fy0 + 8, fx1 - fx0 - 16, fy1 - fy0 - 8);
    c.fillStyle = '#c9a22a'; c.beginPath(); c.arc(vx, 330, 46, 0, 7); c.fill();
    c.fillStyle = '#16120a';
    for (let i = 0; i < 3; i++) { const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 6; c.beginPath(); c.arc(vx, 330, 40, a0, a0 + Math.PI / 3); c.arc(vx, 330, 11, a0 + Math.PI / 3, a0, true); c.fill(); }
    c.beginPath(); c.arc(vx, 330, 6, 0, 7); c.fill();
    // green seep
    const seep = ss(32.5, 35.2, t);
    c.strokeStyle = GREEN; blur(c, GREEN, 25 * seep); c.globalAlpha = 0.3 + 0.7 * seep; c.lineWidth = 2 + 3 * seep;
    line(c, fx0 + 10, fy0 + 10, fx0 + 10, fy1); line(c, fx0 + 10, fy0 + 10, fx1 - 10, fy0 + 10);
    c.globalAlpha = 1; noBlur(c);
    // Teo bracing the door
    drawHuman(c, fx1 + 42, fy1, 168, 1, '#030303', `rgba(255,40,30,${0.4 + 0.5 * pulse})`);
    // alarm
    c.fillStyle = `rgba(255,20,10,${0.12 + 0.22 * pulse})`; c.globalCompositeOperation = 'screen'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    for (const bx of [260, 1020]) {
      const g = c.createRadialGradient(bx, 120, 4, bx, 120, 260); g.addColorStop(0, `rgba(255,60,40,${0.8 * pulse})`); g.addColorStop(1, 'rgba(255,0,0,0)');
      c.fillStyle = g; c.fillRect(bx - 260, 0, 520, 400);
    }
    if (boom > 0) {
      for (let i = 0; i < 260; i++) {
        const a = rnd(i) * Math.PI * 2, sp = 200 + rnd(i + 1) * 900, r = boom * sp * (1 + boom), sz = 2 + boom * (4 + rnd(i + 2) * 30);
        const x = vx + Math.cos(a) * r, y = 330 + Math.sin(a) * r * 0.7;
        c.fillStyle = `rgba(${120 + rnd(i + 3) * 100},255,${120 + rnd(i + 4) * 60},${clamp(0.8 - boom * 0.3)})`;
        c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
      }
      fillAll(c, `rgba(220,255,220,${clamp(Math.exp(-boom * 3.2))})`);
      fillAll(c, `rgba(140,255,150,${0.85 * ss(35.6, 36.8, t)})`);
    }
    cap(c, t, 32.5, 35.0, '“SOMEBODY’S GOTTA HOLD IT.”', { size: 30 });
  }, 0.2, 0.9);

  // 5 — silence, heartbeat
  scene(37.6, 40, (c, t) => {
    fillAll(c, '#000');
    let b = 0; for (const bt of [38.4, 38.65, 39.3, 39.55]) { const d = t - bt; if (d > 0) b += Math.exp(-d * 6) * (d < 0.6 ? 1 : 0); }
    const g = c.createRadialGradient(640, 360, 2, 640, 360, 220); g.addColorStop(0, `rgba(93,255,110,${0.25 * clamp(b)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });

  // 6 — 4,117 deaths
  const COLS = 43;
  const deathsAt = t => { const u = clamp((t - 40.3) / 10); return Math.floor(1 + 4116 * (Math.exp(5 * u) - 1) / (Math.exp(5) - 1)); };
  scene(40, 53.4, (c, t) => {
    const n = deathsAt(t), groups = Math.ceil(n / 5), rows = groups / COLS;
    const needW = rows <= 1 ? groups * 26.5 + 80 : 1220, needH = Math.max(1, rows) * 23.5 + 80;
    const s = clamp(Math.min(7, 1280 / needW, 544 / needH), 1, 7);
    const fx = rows <= 1 ? 70 + (groups * 26.5) / 2 : 640, fy = 108 + Math.max(1, rows) * 23.5 / 2;
    fillAll(c, '#000');
    c.save(); c.translate(640, 360); c.scale(s, s); c.translate(-clamp(fx, 640 - (640 - 640 / s), 640 + (640 - 640 / s)) , -clamp(fy, 360 - (360 - 360 / s), 360 + (360 - 360 / s)));
    c.drawImage(stone, 0, 0);
    const gg = c.createRadialGradient(640, 700, 10, 640, 700, 700); gg.addColorStop(0, 'rgba(60,255,90,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(232,228,214,0.62)'; c.lineWidth = 1.7; c.lineCap = 'round'; c.beginPath();
    for (let m = 0; m < n; m++) {
      const g = Math.floor(m / 5), k = m % 5, col = g % COLS, row = Math.floor(g / COLS);
      const gx = 70 + col * 26.5, gy = 108 + row * 23.5;
      if (k < 4) { const x = gx + k * 4.6 + (rnd(m) - 0.5) * 1.4; c.moveTo(x, gy + rnd(m + 7) * 2); c.lineTo(x + (rnd(m + 3) - 0.5) * 2, gy + 17); }
      else { c.moveTo(gx - 2, gy + 14); c.lineTo(gx + 16, gy + 3); }
    }
    c.stroke(); c.restore();
    const fin = ss(50.9, 51.3, t);
    if (fin > 0) fillAll(c, `rgba(0,0,0,${0.55 * fin})`);
    const ca = 1 - ss(50.6, 51.0, t);
    if (ca > 0) {
      c.save(); c.globalAlpha = ca;
      const bg = vgrad(c, 270, 450, [[0, 'rgba(0,0,0,0)'], [0.3, 'rgba(0,0,0,0.7)'], [0.7, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0)']]);
      c.fillStyle = bg; c.fillRect(0, 270, W, 180);
      const day = Math.min(312, 1 + Math.floor(311 * clamp((t - 40.3) / 10)));
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#cfd6cf'; c.font = `18px ${MONO}`; c.letterSpacing = '6px';
      c.fillText(`DAY ${day}`, 640, 308);
      c.font = `92px ${DISPLAY}`; c.letterSpacing = '4px'; c.fillStyle = '#f4f6f2';
      c.fillText(`DEATH ${n.toLocaleString('en-US')}`, 640, 380);
      c.restore();
    }
    if (t > 51) {
      const rev = ss(51.0, 52.1, t);
      c.save(); c.beginPath(); c.rect(0, 0, 230 + 840 * rev, H); c.clip();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `176px ${DISPLAY}`; c.letterSpacing = '10px';
      c.fillStyle = '#0b0907'; c.fillText('STILL HERE', 640, 350);
      c.strokeStyle = HOT; c.lineWidth = 2.5; blur(c, GREEN, 30); c.strokeText('STILL HERE', 640, 350);
      c.globalAlpha = 0.22; c.fillStyle = GREEN; c.fillText('STILL HERE', 640, 350);
      c.restore();
      cap(c, t, 52.0, 53.4, '312 DAYS UNDER THE MOUNTAIN.  4,117 DEATHS.', { size: 18, y: 500, ls: 4, fo: 0.3 });
    }
  }, 0.3, 0.3);

  // 7 — the mountain opens
  scene(53.4, 61, (c, t) => {
    const ox = 640, oy = 470, burst = t - 57.5;
    let sh = 3 * ss(55, 57.5, t) * (burst < 0 ? 1 : 0) + (burst > 0 ? 12 * Math.exp(-burst * 2) : 0);
    c.translate((rnd(Math.floor(t * 50)) - 0.5) * sh, (rnd(Math.floor(t * 50) + 3) - 0.5) * sh);
    fillAll(c, vgrad(c, 0, 600, [[0, '#02040b'], [0.6, '#0a1430'], [1, '#18264a']]));
    for (let i = 0; i < 220; i++) { c.fillStyle = `rgba(220,230,255,${0.2 + rnd(i + 5) * 0.6})`; c.fillRect(rnd(i) * W, 88 + rnd(i + 1) * 360, 1.4, 1.4); }
    const mg = c.createRadialGradient(230, 190, 10, 230, 190, 160); mg.addColorStop(0, 'rgba(230,236,255,0.9)'); mg.addColorStop(0.25, 'rgba(160,180,230,0.25)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mg; c.fillRect(0, 0, 500, 400);
    c.fillStyle = '#dfe6ff'; c.beginPath(); c.arc(230, 190, 34, 0, 7); c.fill();
    c.fillStyle = '#05070d'; c.beginPath(); c.moveTo(-20, H); mtn.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(W + 20, H); c.fill();
    c.strokeStyle = 'rgba(150,175,230,0.35)'; c.lineWidth = 2; c.beginPath(); mtn.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    const p = 1.45 * ss(54.4, 57.4, t);
    const gl = c.createRadialGradient(ox, oy, 4, ox, oy, 60 + 260 * clamp(p)); gl.addColorStop(0, `rgba(120,255,130,${0.55 * clamp(p)})`); gl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gl; c.fillRect(0, 0, W, H);
    c.save(); c.translate(ox, oy); c.strokeStyle = HOT; blur(c, GREEN, 16); c.lineCap = 'round'; drawCracks(c, cracks, p); c.restore();
    noBlur(c);
    if (burst > 0) {
      const hole = c.createRadialGradient(ox, oy, 4, ox, oy, 90); hole.addColorStop(0, 'rgba(230,255,220,0.95)'); hole.addColorStop(0.4, 'rgba(93,255,110,0.6)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hole; c.fillRect(ox - 100, oy - 100, 200, 200);
      const ba = clamp(1 - burst / 2.2);
      if (ba > 0) { const bg = c.createLinearGradient(ox - 50, 0, ox + 50, 0); bg.addColorStop(0, 'rgba(93,255,110,0)'); bg.addColorStop(0.5, `rgba(200,255,200,${0.7 * ba})`); bg.addColorStop(1, 'rgba(93,255,110,0)'); c.fillStyle = bg; c.fillRect(ox - 50, 0, 100, oy); }
      for (let i = 0; i < 130; i++) {
        const a = -Math.PI * (0.1 + 0.8 * rnd(i)), sp = 180 + rnd(i + 1) * 620, dt = burst;
        const x = ox + Math.cos(a) * sp * dt, y = oy + Math.sin(a) * sp * dt + 450 * dt * dt, sz = 2 + rnd(i + 2) * 9;
        if (y > H) continue;
        c.fillStyle = '#0a0c0e'; c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
        c.fillStyle = 'rgba(120,255,130,0.6)'; c.beginPath(); c.arc(x - sz * 0.3, y - sz * 0.3, sz * 0.4, 0, 7); c.fill();
      }
      const rise = ss(58.0, 59.8, t);
      if (rise > 0) {
        c.save(); c.beginPath(); c.rect(0, 0, W, oy + 30); c.clip();
        drawRoach(c, ox, lerp(oy + 160, oy + 28, rise), 132, { t, rim: GREEN, rimBlur: 26, glow: 1, eyes: ss(59.2, 59.8, t) });
        c.restore();
      }
      fillAll(c, `rgba(200,255,200,${clamp(Math.exp(-burst * 3))})`);
    }
    sup(c, t, 53.7, 56.9, 'DAY 313  ·  ASHGROVE EXCLUSION ZONE');
    cap(c, t, 59.4, 60.95, '“WHAT THE HELL IS THAT?”', { size: 26, y: 150, fo: 0.2 });
  }, 0.4, 0.15);

  // 8 — the porch
  scene(61, 64, (c, t) => {
    fillAll(c, vgrad(c, 0, H, [[0, '#0c0806'], [1, '#050302']]));
    const dx0 = 470, dx1 = 810, dy0 = 150;
    const flick = rnd(Math.floor(t * 14)) > 0.28 ? 1 : 0.25;
    c.save(); c.beginPath(); c.rect(dx0, dy0, dx1 - dx0, 632 - dy0); c.clip();
    fillAll(c, vgrad(c, dy0, 632, [[0, '#0b1424'], [1, '#1a1a1c']]));
    const pl = c.createRadialGradient(dx0 + 40, dy0 + 30, 4, dx0 + 40, dy0 + 30, 380); pl.addColorStop(0, `rgba(255,196,110,${0.7 * flick})`); pl.addColorStop(1, 'rgba(255,170,80,0)');
    c.fillStyle = pl; c.fillRect(0, 0, W, H);
    drawRoach(c, 640, 760, 600, { t, rim: `rgba(255,190,100,${0.55 * flick + 0.2})`, rimBlur: 30, glow: 1, eyes: 1 });
    c.restore();
    c.fillStyle = '#120b07'; poly(c, [[dx0, dy0], [dx0 - 120, dy0 - 40], [dx0 - 120, 690], [dx0, 632]]);
    c.strokeStyle = '#1e140d'; c.lineWidth = 14; c.strokeRect(dx0 - 7, dy0 - 7, dx1 - dx0 + 14, 660);
    c.fillStyle = 'rgba(93,255,110,0.08)'; poly(c, [[dx0, 632], [dx1, 632], [dx1 + 200, H], [dx0 - 200, H]]);
    cap(c, t, 61.4, 63.6, '“HEY, MIR. TOLD YOU.”', { size: 28, y: 584, fo: 0.15 });
  }, 0.3, 0);

  // 9 — montage
  function city(c) {
    fillAll(c, vgrad(c, 88, 600, [[0, '#06090d'], [0.7, '#1b1a1c'], [1, '#3a2614']]));
    for (let i = 0; i < 18; i++) {
      const x = i * 76 - 20, w = 60 + rnd(i) * 40, h = 160 + rnd(i + 3) * 300;
      c.fillStyle = '#07080a'; c.fillRect(x, 600 - h, w, h);
      for (let j = 0; j < 16; j++) if (rnd(i * 40 + j) > 0.7) { c.fillStyle = 'rgba(255,190,110,0.35)'; c.fillRect(x + 8 + (j % 4) * 13, 600 - h + 14 + Math.floor(j / 4) * 26, 5, 8); }
    }
    c.fillStyle = vgrad(c, 600, H, [[0, '#121214'], [1, '#050506']]); c.fillRect(0, 600, W, H);
  }
  scene(64, 81, (c, t) => {
    if (card(c, t, 64.0, 65.2, 'THEY TRIED BULLETS.')) return;
    if (card(c, t, 67.6, 68.8, 'THEY TRIED TANKS.')) return;
    if (card(c, t, 71.0, 72.2, 'THEY TRIED A NUKE.')) return;
    if (t < 67.6) {
      const lt = t - 65.2; city(c);
      const h = 360 + 40 * lt, fy = 640 + 20 * lt;
      drawRoach(c, 640, fy + Math.sin(lt * 9) * 3, h, { t, rim: 'rgba(200,220,255,0.6)', glow: 0.9, eyes: 1 });
      for (let j = 0; j < 44; j++) {
        const th = 65.25 + j * 0.054, dt = t - th; if (dt < 0 || dt > 0.32) continue;
        const px = 640 + (rnd(j) - 0.5) * 0.42 * h, py = fy - (0.35 + rnd(j + 1) * 0.55) * h;
        if (dt < 0.05) { c.fillStyle = 'rgba(255,255,230,0.9)'; c.beginPath(); c.arc(px, py, 10, 0, 7); c.fill(); }
        c.strokeStyle = `rgba(255,226,150,${1 - dt / 0.32})`; c.lineWidth = 2;
        for (let q = 0; q < 6; q++) {
          const a = rnd(j * 7 + q) * Math.PI * 2, sp = 300 + rnd(j * 9 + q) * 500;
          const x1 = px + Math.cos(a) * sp * dt, y1 = py + Math.sin(a) * sp * dt + 600 * dt * dt;
          line(c, x1, y1, x1 - Math.cos(a) * 18, y1 - Math.sin(a) * 18);
        }
      }
      const fl = Math.floor(t / 0.054);
      if (rnd(fl) > 0.35) {
        const left = fl % 2, x = left ? 80 + rnd(fl + 1) * 120 : 1200 - rnd(fl + 1) * 120, y = 560 + rnd(fl + 2) * 60;
        const g = c.createRadialGradient(x, y, 4, x, y, 120); g.addColorStop(0, 'rgba(255,250,210,0.95)'); g.addColorStop(0.3, 'rgba(255,170,60,0.5)'); g.addColorStop(1, 'rgba(255,120,0,0)');
        c.fillStyle = g; c.fillRect(x - 120, y - 120, 240, 240);
      }
      return;
    }
    if (t < 71.0) {
      fillAll(c, vgrad(c, 88, 560, [[0, '#1a1228'], [0.7, '#6a2c2a'], [1, '#b5562c']]));
      c.fillStyle = '#120a08'; c.fillRect(0, 560, W, H);
      const fire = t - 69.3, hit = t - 69.4;
      const glowUp = ss(70.4, 70.9, t);
      drawRoach(c, 960, 610, 300, { t, rim: 'rgba(255,140,60,0.7)', glow: 0.7 + glowUp, eyes: 1 });
      c.fillStyle = '#080605';
      poly(c, [[-20, 520], [370, 520], [400, 590], [-20, 600]]); poly(c, [[150, 470], [300, 470], [330, 522], [130, 522]]);
      c.save(); c.translate(300, 488); c.rotate(-0.06); c.fillRect(0, -9, 290, 18); c.fillRect(270, -13, 26, 26); c.restore();
      for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(30 + i * 62, 594, 26, 0, 7); c.fill(); }
      if (fire > 0 && fire < 0.14) { const g = c.createRadialGradient(600, 470, 4, 600, 470, 160); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.4, 'rgba(255,170,60,0.6)'); g.addColorStop(1, 'rgba(255,100,0,0)'); c.fillStyle = g; c.fillRect(440, 310, 320, 320); }
      if (fire > 0 && hit < 0) { c.strokeStyle = '#fff1c0'; c.lineWidth = 4; const q = fire / 0.1; line(c, lerp(600, 940, q) - 40, lerp(470, 420, q) + 6, lerp(600, 940, q), lerp(470, 420, q)); }
      if (hit > 0) {
        const r = 40 + 200 * (1 - Math.exp(-hit * 5)), a = clamp(1 - hit / 0.9);
        const g = c.createRadialGradient(950, 430, 4, 950, 430, r); g.addColorStop(0, `rgba(255,245,200,${a})`); g.addColorStop(0.4, `rgba(255,140,40,${a * 0.8})`); g.addColorStop(1, 'rgba(120,30,0,0)');
        c.fillStyle = g; c.fillRect(950 - r, 430 - r, 2 * r, 2 * r);
        const sm = clamp(1 - (t - 70.0) / 0.9);
        for (let i = 0; i < 34; i++) {
          const ang = rnd(i) * Math.PI * 2, d = 30 + rnd(i + 1) * 120 * (0.5 + hit);
          c.fillStyle = `rgba(40,34,32,${0.85 * sm})`; c.beginPath(); c.arc(950 + Math.cos(ang) * d, 430 + Math.sin(ang) * d * 0.7 - hit * 40, 40 + rnd(i + 2) * 50, 0, 7); c.fill();
        }
        if (hit < 0.08) fillAll(c, 'rgba(255,230,180,0.5)');
      }
      return;
    }
    if (t < 79) {
      const lt = t - 72.2, fb = t - 74.5;
      fillAll(c, vgrad(c, 88, 470, [[0, '#2b3442'], [1, '#c9b79a']]));
      c.fillStyle = vgrad(c, 470, H, [[0, '#8f8676'], [1, '#3e372f']]); c.fillRect(0, 470, W, H);
      c.strokeStyle = 'rgba(40,34,28,0.35)'; c.lineWidth = 1;
      for (let i = 0; i < 26; i++) line(c, 640 + (rnd(i) - 0.5) * 300, 472, (rnd(i + 1) - 0.2) * W * 1.4 - 100, H);
      if (fb < 0) {
        drawRoach(c, 640, 472, 46, { t, glow: 0.4, eyes: 1 });
        const y = lerp(100, 455, Math.pow(clamp(lt / 2.3), 2));
        c.fillStyle = '#fff'; blur(c, '#fff', 8); c.beginPath(); c.arc(640, y, 2.5, 0, 7); c.fill(); noBlur(c);
        cap(c, t, 72.3, 74.4, 'SIXTEEN SECONDS.', { size: 20, y: 160, ls: 6, fo: 0.1 });
      } else {
        fillAll(c, `rgba(255,140,60,${0.45 * Math.exp(-fb * 0.5)})`);
        const R = 70 + 230 * (1 - Math.exp(-fb * 1.4)), cy = 470 - 190 * ss(0, 4.2, fb);
        const sk = c.createLinearGradient(0, cy, 0, 472); sk.addColorStop(0, '#ff9a3c'); sk.addColorStop(1, '#5a2414');
        c.fillStyle = sk; poly(c, [[640 - 30 - R * 0.12, cy], [640 + 30 + R * 0.12, cy], [640 + 70 + R * 0.35, 472], [640 - 70 - R * 0.35, 472]]);
        const dust = 100 + 700 * (1 - Math.exp(-fb * 0.7));
        c.fillStyle = 'rgba(90,64,48,0.92)'; c.beginPath(); c.ellipse(640, 472, dust, dust * 0.11, 0, 0, 7); c.fill();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + fb * 0.3, rr = R * (0.55 + 0.15 * rnd(i));
          const x = 640 + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.42;
          const g = c.createRadialGradient(x, y, 2, x, y, R * 0.5);
          g.addColorStop(0, fb < 1.2 ? '#fff3c4' : '#ffb35c'); g.addColorStop(0.5, '#e0602a'); g.addColorStop(1, 'rgba(60,24,16,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, R * 0.5, 0, 7); c.fill();
        }
        const core = c.createRadialGradient(640, cy, 4, 640, cy, R * 0.75); core.addColorStop(0, '#fffbe6'); core.addColorStop(0.5, 'rgba(255,190,90,0.9)'); core.addColorStop(1, 'rgba(255,100,40,0)');
        c.fillStyle = core; c.beginPath(); c.arc(640, cy, R * 0.75, 0, 7); c.fill();
        const ring = 60 + fb * 1300; c.strokeStyle = `rgba(255,235,200,${clamp(0.8 - fb * 0.35)})`; c.lineWidth = 4;
        c.beginPath(); c.ellipse(640, 474, ring, ring * 0.1, 0, 0, 7); c.stroke();
        const walk = ss(76.0, 79.0, t);
        if (t > 75.8) {
          c.globalAlpha = ss(75.8, 76.7, t);
          drawRoach(c, 640, lerp(478, 640, walk), lerp(52, 360, walk), { t, rim: '#ff7a2a', rimBlur: 26, glow: 1, eyes: 1, fill: '#140806' });
          c.globalAlpha = 1;
        }
        fillAll(c, `rgba(255,255,250,${clamp(Math.exp(-fb * 2.6))})`);
        cap(c, t, 77.3, 79.0, 'HE WALKED OUT.', { size: 60, font: DISPLAY, ls: 6, y: 170, fo: 0.15 });
      }
      return;
    }
    // swarm
    fillAll(c, '#000');
    const e0 = ss(79.0, 80.3, t);
    for (let i = 0; i < 2400; i++) {
      let tx, ty, eye = false;
      if (i < 160) { eye = true; const s = i < 80 ? -1 : 1, a = rnd(i) * 7, r = Math.sqrt(rnd(i + 1)) * 16; tx = 640 + s * 58 + Math.cos(a) * r * 1.5; ty = 300 + Math.sin(a) * r * 0.7; }
      else if (i < 1600) { const a = rnd(i) * 7, r = Math.sqrt(rnd(i + 1)); tx = 640 + Math.cos(a) * r * 150; ty = 320 + Math.sin(a) * r * 200; }
      else { const a = Math.PI + rnd(i) * Math.PI, r = Math.sqrt(rnd(i + 1)); tx = 640 + Math.cos(a) * r * 420; ty = 660 + Math.sin(a) * r * 150; }
      const e = clamp(e0 * 1.3 - rnd(i + 5) * 0.3);
      const sx = rnd(i + 11) * W, sy = rnd(i + 13) * H;
      const x = lerp(sx, tx, e) + Math.sin(t * 9 + i) * 2, y = lerp(sy, ty, e) + Math.cos(t * 8 + i * 1.3) * 2;
      c.fillStyle = eye ? (e > 0.8 ? HOT : '#3d6a48') : (rnd(i + 17) > 0.8 ? '#7d9a86' : '#3b4a40');
      c.fillRect(x, y, 2.4, 2.4);
    }
    cap(c, t, 79.5, 80.95, '“YOU LEFT ME IN THE DARK, TEO.”', { size: 24, sub: 'MOTHER HIVE', y: 556, fo: 0.15 });
  });

  // 10 — the face
  scene(81, 88, (c, t, lt) => {
    fillAll(c, vgrad(c, 0, H, [[0, '#070a0e'], [1, '#10151a']]));
    for (let i = 0; i < 14; i++) { const g = c.createRadialGradient(rnd(i) * W, 150 + rnd(i + 1) * 400, 2, rnd(i) * W, 150 + rnd(i + 1) * 400, 40 + rnd(i + 2) * 50); g.addColorStop(0, `rgba(${rnd(i + 3) > 0.5 ? '255,170,90' : '120,160,255'},0.12)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    c.save(); c.translate(640, 380); const z = 1 + 0.07 * (lt / 7); c.scale(z, z); c.translate(-640, -380);
    const e = ss(81.3, 82.4, t);
    // antennae
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      c.strokeStyle = '#2b2f33'; c.lineWidth = 9;
      c.beginPath(); c.moveTo(640 + s * 70, 130); c.quadraticCurveTo(640 + s * 160, -40 + Math.sin(t * 1.3) * 20, 640 + s * 520, -60 + Math.sin(t * 1.1 + s) * 30); c.stroke();
      c.strokeStyle = 'rgba(200,206,210,0.35)'; c.lineWidth = 2; c.stroke();
    }
    // crest
    const crest = [[200, 320], [300, 180], [460, 100], [640, 74], [820, 100], [980, 180], [1080, 320], [920, 262], [770, 236], [640, 230], [510, 236], [360, 262]];
    c.fillStyle = vgrad(c, 74, 320, [[0, '#585e63'], [0.5, '#2d3134'], [1, '#141618']]); poly(c, crest);
    c.strokeStyle = 'rgba(190,198,204,0.55)'; c.lineWidth = 3; poly(c, crest, true);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2;
    for (let i = 0; i < 9; i++) line(c, 300 + i * 80, 150 + rnd(i) * 40, 320 + i * 80 + rnd(i + 2) * 40, 220 + rnd(i + 1) * 40);
    c.save(); c.translate(640, 150); c.strokeStyle = HOT; blur(c, GREEN, 14); c.globalAlpha = 0.4 + 0.6 * e; drawCracks(c, crestCracks, 1.3 * e); c.restore();
    noBlur(c);
    // face plate
    const plate = [[400, 262], [880, 262], [820, 470], [720, 560], [640, 578], [560, 560], [460, 470]];
    c.fillStyle = vgrad(c, 262, 578, [[0, '#2b2f32'], [1, '#0c0d0e']]); poly(c, plate);
    c.strokeStyle = 'rgba(150,158,164,0.35)'; c.lineWidth = 2; poly(c, plate, true);
    hexEye(c, 470, 350, 150, 92, -0.3, e, 13, 1);
    hexEye(c, 810, 350, 150, 92, 0.3, e, 13, 999);
    // mandibles
    const talk = (t > 83 && t < 84.8) || (t > 85.5 && t < 87.6) ? Math.abs(Math.sin(t * 12)) * 0.12 : 0;
    for (const s of [-1, 1]) {
      c.save(); c.translate(640 + s * 70, 520); c.rotate(s * talk);
      c.fillStyle = vgrad(c, -20, 170, [[0, '#3a3e42'], [1, '#050606']]);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * 110, 60, s * 40, 170); c.quadraticCurveTo(s * 10, 175, -s * 40, 150);
      c.quadraticCurveTo(s * 30, 120, s * 10, 40); c.closePath(); c.fill();
      c.fillStyle = '#050606';
      for (let k = 0; k < 4; k++) { const yy = 60 + k * 24; c.beginPath(); c.moveTo(s * (14 - k * 2), yy); c.lineTo(-s * 4, yy + 8); c.lineTo(s * (16 - k * 2), yy + 16); c.fill(); }
      c.strokeStyle = 'rgba(190,198,204,0.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * 110, 60, s * 40, 170); c.stroke();
      c.restore();
    }
    const mg = c.createRadialGradient(640, 600, 4, 640, 600, 80); mg.addColorStop(0, `rgba(93,255,110,${0.35 * e})`); mg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mg; c.fillRect(540, 500, 200, 200);
    c.restore();
    c.strokeStyle = 'rgba(180,200,220,0.22)'; c.lineWidth = 1.2;
    for (let i = 0; i < 220; i++) { const x = (rnd(i) * 1500 - 100 + t * 200) % 1400 - 60, y = (rnd(i + 1) * H + t * 1400 * (0.8 + rnd(i + 2) * 0.4)) % H; line(c, x, y, x - 6, y - 34); }
    cap(c, t, 83.0, 85.0, '“YOU BROUGHT A NUKE.”', { size: 30, y: 600 });
    cap(c, t, 85.5, 87.8, '“THAT’S ADORABLE.”', { size: 30, y: 600 });
  }, 0.2, 0.4);

  // 11 — the long view
  scene(88, 100, (c, t) => {
    const big = { size: 58, font: DISPLAY, ls: 6, y: 580 };
    let fade = 0;
    if (t < 91) {
      fillAll(c, vgrad(c, 88, 560, [[0, '#1c1f26'], [0.7, '#5a4436'], [1, '#a2643a']]));
      for (let i = 0; i < 16; i++) {
        const x = 40 + i * 76, w = 56 + rnd(i) * 30, h = 150 + rnd(i + 3) * 300;
        const drop = ss(88.3 + rnd(i + 9) * 0.8, 90.6 + rnd(i + 10) * 0.4, t);
        c.save(); c.beginPath(); c.rect(0, 0, W, 560); c.clip();
        c.translate(x + w / 2, 560 + drop * h * 0.9); c.rotate((rnd(i + 4) - 0.5) * 0.25 * drop);
        c.fillStyle = '#0d0c0e'; c.fillRect(-w / 2, -h, w, h);
        for (let j = 0; j < 20; j++) if (rnd(i * 50 + j) > 0.6) { c.fillStyle = 'rgba(255,190,110,0.4)'; c.fillRect(-w / 2 + 7 + (j % 4) * 12, -h + 12 + Math.floor(j / 4) * 24, 5, 8); }
        c.restore();
      }
      c.fillStyle = '#0b0a0a'; c.fillRect(0, 558, W, H);
      const du = ss(88.6, 91, t);
      for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(120,100,84,${0.35 * du})`; c.beginPath(); c.arc(rnd(i) * W, 560, 60 + rnd(i + 1) * 120 * du, 0, 7); c.fill(); }
      cap(c, t, 88.3, 90.8, 'EMPIRES COLLAPSE.', big); fade = 1 - env(t, 88, 91, 0.3, 0.3);
    } else if (t < 94) {
      fillAll(c, vgrad(c, 88, 540, [[0, '#6f6656'], [1, '#d9c39a']]));
      c.fillStyle = '#b79c74'; c.fillRect(0, 520, W, H);
      const v = 1 - ss(92.0, 93.9, t);
      c.fillStyle = `rgba(40,32,24,${v})`;
      [[220, 210], [330, 130], [440, 250], [780, 180], [890, 90], [1000, 230]].forEach(([x, h], i) => {
        c.fillRect(x, 520 - h, 48, h); c.fillRect(x - 8, 520 - h - 10 + (rnd(i) * 12), 64, 10);
      });
      c.fillRect(560, 360, 160, 20); c.fillRect(440, 270, 330, 14);
      for (let i = 0; i < 160; i++) { const x = (rnd(i) * W + (t - 91) * 300 * (0.5 + rnd(i + 1))) % W; c.fillStyle = 'rgba(230,210,170,0.35)'; c.fillRect(x, 300 + rnd(i + 2) * 280, 14, 1.5); }
      cap(c, t, 91.3, 93.8, 'CIVILIZATIONS DISAPPEAR.', big); fade = 1 - env(t, 91, 94, 0.3, 0.3);
    } else if (t < 97) {
      fillAll(c, '#000');
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${0.3 * rnd(i + 2)})`; c.fillRect(rnd(i) * W, 88 + rnd(i + 1) * 544, 1.2, 1.2); }
      const q = ss(94.3, 96.7, t), R = lerp(300, 12, q), cx = 760, cy = 330;
      const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2);
      g.addColorStop(0, q < 0.9 ? '#ffd9a8' : '#e9f0ff'); g.addColorStop(0.45, q < 0.9 ? `rgba(255,80,30,${1 - q * 0.4})` : 'rgba(170,190,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#000'; c.beginPath(); c.arc(220, 900, 420, 0, 7); c.fill();
      c.strokeStyle = `rgba(255,90,40,${0.6 * (1 - q)})`; c.lineWidth = 3; c.beginPath(); c.arc(220, 900, 420, -1.9, -0.4); c.stroke();
      cap(c, t, 94.3, 96.8, 'STARS BURN OUT.', big); fade = 1 - env(t, 94, 97, 0.3, 0.3);
    } else {
      fillAll(c, '#000');
      for (let i = 0; i < 700; i++) {
        const off = 97.2 + rnd(i + 30) * 2.4; if (t > off) continue;
        c.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * rnd(i + 2)) * (0.7 + 0.3 * Math.sin(t * 6 + i))})`; c.fillRect(rnd(i) * W, 88 + rnd(i + 1) * 544, 1.5, 1.5);
      }
      cap(c, t, 97.3, 99.7, 'THE UNIVERSE EVENTUALLY DIES.', big); fade = 1 - env(t, 97, 100, 0.3, 0.5);
    }
    if (fade > 0) fillAll(c, `rgba(0,0,0,${fade})`);
  });

  // 12 — I survive
  scene(100, 104, (c, t) => {
    fillAll(c, '#000');
    const e = ss(100.8, 101.7, t);
    c.save(); c.globalAlpha = 0.5 * e; c.strokeStyle = 'rgba(150,170,160,0.6)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(470, 300); c.quadraticCurveTo(640, 210, 810, 300); c.stroke(); c.restore();
    hexEye(c, 586, 330, 50, 30, -0.3, e, 5, 3);
    hexEye(c, 694, 330, 50, 30, 0.3, e, 5, 7);
    cap(c, t, 102.0, 104.0, 'I SURVIVE.', { size: 96, font: DISPLAY, ls: 8, y: 500, fi: 0.08, fo: 0.05, color: '#f4f6f2' });
  });

  // 13 — title
  scene(104, 112, (c, t) => {
    fillAll(c, '#000');
    const g = c.createRadialGradient(640, 300, 10, 640, 300, 600); g.addColorStop(0, 'rgba(40,70,48,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const st = ss(104.0, 104.35, t);
    drawInsignia(c, 640, 238, 88 * lerp(1.3, 1, st), st, ss(106.8, 107.6, t));
    const stamp = (a, fn) => { if (t < a) return; const q = ss(a, a + 0.22, t); c.save(); c.globalAlpha = q; fn(lerp(1.14, 1, q)); c.restore(); };
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    stamp(104.9, s => { c.translate(640, 378); c.scale(s, s); c.font = `20px ${MONO}`; c.letterSpacing = '14px'; c.fillStyle = '#cfd6cf'; c.fillText('THE', 0, 0); });
    stamp(105.4, s => {
      c.translate(640, 432); c.scale(s, s); c.font = `46px ${DISPLAY}`; c.letterSpacing = '8px';
      const a = 'RADIOACTIVE ', b = 'TITANIUM', wa = c.measureText(a).width, wb = c.measureText(b).width, x0 = -(wa + wb) / 2;
      c.textAlign = 'left'; blur(c, GREEN, 18); c.fillStyle = '#7dff8a'; c.fillText(a, x0, 0); noBlur(c);
      c.fillStyle = metal(c, 0, -40, 0, 4); c.fillText(b, x0 + wa, 0);
    });
    stamp(106.2, s => {
      c.translate(640, 560); c.scale(s, s); c.font = `128px ${DISPLAY}`; c.letterSpacing = '6px';
      const word = 'COCKROACH', wTot = c.measureText(word).width, x0 = -wTot / 2;
      c.textAlign = 'left'; blur(c, 'rgba(0,0,0,0.9)', 20); c.fillStyle = metal(c, 0, -110, 0, 6); c.fillText(word, x0, 0); noBlur(c);
      const ge = ss(107.0, 107.6, t);
      if (ge > 0) {
        const ox = x0 + c.measureText('C').width, ow = c.measureText('O').width;
        c.globalAlpha *= ge; c.strokeStyle = HOT; blur(c, GREEN, 22); c.lineWidth = 3;
        poly(c, [[ox + ow * 0.15, -100], [ox + ow * 0.45, -70], [ox + ow * 0.3, -50], [ox + ow * 0.6, -28], [ox + ow * 0.5, -10], [ox + ow * 0.75, 2]], true);
      }
    });
    cap(c, t, 108.4, 112, 'NOTHING BREAKS HIM.', { size: 18, y: 618, ls: 10, fo: 0.01, color: '#cfd6cf' });
    const f = Math.max(t > 104 && t < 104.3 ? Math.exp(-(t - 104) * 12) * 0.6 : 0, t > 106.2 && t < 106.5 ? Math.exp(-(t - 106.2) * 12) * 0.35 : 0);
    if (f > 0.01) fillAll(c, `rgba(220,255,225,${f})`);
  }, 0, 0.6);

  // 14 — stinger
  scene(112, 118, (c, t) => {
    fillAll(c, vgrad(c, 0, H, [[0, '#06080a'], [1, '#0d0f10']]));
    c.fillStyle = '#020303';
    poly(c, [[0, 88], [W, 88], [W, 200], [980, 150], [700, 190], [420, 140], [160, 210], [0, 180]]);
    poly(c, [[0, 632], [0, 520], [120, 560], [W, 590], [W, 632]]);
    const mg = c.createRadialGradient(300, 360, 10, 300, 360, 380); mg.addColorStop(0, 'rgba(95,168,255,0.35)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mg; c.fillRect(0, 0, W, H);
    for (const [x, y] of [[150, 300], [260, 290], [370, 300]]) {
      c.fillStyle = '#9cc8ff'; c.globalAlpha = 0.65 + 0.1 * Math.sin(t * 7 + x); c.fillRect(x, y, 100, 70); c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,20,50,0.4)'; for (let k = 0; k < 70; k += 4) c.fillRect(x, y + k, 100, 1.5);
    }
    c.fillStyle = '#0a0c0e'; c.fillRect(120, 380, 400, 14); c.fillRect(140, 394, 10, 180); c.fillRect(490, 394, 10, 180);
    drawHuman(c, 330, 560, 150, 0.2, '#020304', 'rgba(95,168,255,0.7)');
    const gg = c.createRadialGradient(930, 420, 10, 930, 420, 320); gg.addColorStop(0, 'rgba(93,255,110,0.14)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg; c.fillRect(0, 0, W, H);
    drawRoach(c, 930, 575, 330, { t, rim: 'rgba(93,255,110,0.35)', glow: 0.8, eyes: 1 });
    c.fillStyle = '#020303'; c.beginPath(); c.ellipse(1040, 562, 26, 11, 0, 0, 7); c.fill(); c.beginPath(); c.arc(1066, 552, 9, 0, 7); c.fill();
    cap(c, t, 112.7, 115.5, 'JUNO:  Okay, but seriously. Can we talk about the name?', { size: 22, y: 600, ls: 1 });
    cap(c, t, 115.9, 117.3, '“No.”', { size: 26, y: 600 });
  }, 0.4, 0.7);

  /* ---------- frame ---------- */
  function render(ctx, t, k = 1) {
    SK = k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    let bars = true;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (t >= s.a && t < s.b) {
        ctx.save(); s.d(ctx, t, t - s.a); ctx.restore();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        const f = 1 - env(t, s.a, s.b, s.fi, s.fo);
        if (f > 0.001) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
        if (i === 13) bars = false;
        break;
      }
    }
    // grain
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.22;
    const ox = Math.floor(rnd(Math.floor(t * 24)) * 256), oy = Math.floor(rnd(Math.floor(t * 24) + 1) * 256);
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(grainPat, x, y);
    ctx.restore();
    const v = ctx.createRadialGradient(640, 360, 300, 640, 360, 820); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (bars) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, BAR); ctx.fillRect(0, H - BAR, W, BAR); }
  }

  window.FILM = { W, H, DUR, init, render };
})();
