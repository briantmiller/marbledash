/* Marble Dash: rendering, input, sound and menus. Physics and levels live in core.js. */
(function () {
  'use strict';
  const C = window.MarbleCore, T = window.THREE;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- save ---------- */
  const KEY = 'marble-dash-v1';
  let save = { stars: {}, unlocked: 1, bank: 0, skin: 0, diff: 0, mute: false };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };

  const SKINS = [
    { need: 0, bands: ['#ff4d4d', '#ffffff'], css: 'repeating-linear-gradient(90deg,#ff4d4d 0 10px,#fff 10px 20px)' },
    { need: 40, bands: ['#2f8bff', '#bfe3ff'], css: 'repeating-linear-gradient(90deg,#2f8bff 0 10px,#bfe3ff 10px 20px)' },
    { need: 120, bands: ['#ffd23f', '#22252e'], css: 'repeating-linear-gradient(90deg,#ffd23f 0 10px,#22252e 10px 20px)' },
    { need: 250, bands: ['#2fbf5b', '#ff6f91'], css: 'repeating-linear-gradient(90deg,#2fbf5b 0 10px,#ff6f91 10px 20px)' },
    { need: 450, bands: ['#7a4dff', '#ffd6ff'], css: 'repeating-linear-gradient(90deg,#7a4dff 0 10px,#ffd6ff 10px 20px)' },
    { need: 700, bands: ['#ff4d4d', '#ffa23f', '#ffe14d', '#3ddc6a', '#3aa0ff', '#a45dff'], css: 'linear-gradient(90deg,#ff4d4d,#ffa23f,#ffe14d,#3ddc6a,#3aa0ff,#a45dff)' }
  ];

  /* ---------- sound ---------- */
  let ac = null;
  function audioOn() { if (ac || save.mute) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  function tone(f, d, type, vol, f2, delay) {
    if (!ac || save.mute) return;
    try {
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(vol || 0.15, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  let coinStreak = 0, coinT = 0, bonkT = 0;
  const sfx = {
    coin() { const now = performance.now(); coinStreak = now - coinT < 500 ? Math.min(coinStreak + 1, 8) : 0; coinT = now; tone(880 * Math.pow(1.06, coinStreak), 0.12, 'triangle', 0.14, 1320 * Math.pow(1.06, coinStreak)); },
    jump() { tone(300, 0.16, 'sine', 0.16, 620); },
    land() { tone(140, 0.08, 'sine', 0.12, 70); },
    bonk() { const n = performance.now(); if (n - bonkT < 250) return; bonkT = n; tone(130, 0.12, 'square', 0.08, 70); },
    bump() { tone(520, 0.14, 'square', 0.08, 900); },
    hit() { tone(320, 0.4, 'sawtooth', 0.12, 50); },
    fall() { tone(500, 0.6, 'sine', 0.14, 60); },
    pad() { tone(350, 0.35, 'triangle', 0.18, 1400); },
    boost() { tone(200, 0.4, 'sawtooth', 0.08, 900); },
    power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 0, i * 0.07)); },
    check() { tone(660, 0.12, 'triangle', 0.14); tone(990, 0.2, 'triangle', 0.14, 0, 0.1); },
    smash() { tone(180, 0.2, 'square', 0.1, 50); },
    finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, 0, i * 0.13)); }
  };

  /* ---------- renderer ---------- */
  const canvas = $('gl');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(60, 1, 0.1, 220);
  scene.add(new T.HemisphereLight(0xffffff, 0x7a86a8, 2.4));
  const sun = new T.DirectionalLight(0xffffff, 1.8); sun.position.set(4, 10, 6); scene.add(sun);
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 78 : 60; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  const lam = (color, o) => new T.MeshLambertMaterial(Object.assign({ color }, o || {}));
  const ribbonMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
  const checkerTex = canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#1d2340'; g.fillRect(i * 16, j * 16, 16, 16); } });
  const boostTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#17c964'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#eaff5c'; g.lineWidth = 16; g.lineJoin = 'round';
    for (let k = 0; k < 2; k++) { const y = 54 + k * 60; g.beginPath(); g.moveTo(22, y); g.lineTo(64, y - 38); g.lineTo(106, y); g.stroke(); }
  });
  boostTex.wrapS = T.RepeatWrapping;
  const emojiTex = {};
  function emoji(ch) {
    return emojiTex[ch] || (emojiTex[ch] = canvasTex(128, 128, (g) => { g.font = '92px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70); }));
  }
  const POWER = { magnet: { ch: '\u{1F9F2}', col: 0xff5d5d }, shield: { ch: '\u{1F6E1}️', col: 0x4db5ff }, giant: { ch: '\u{1F344}', col: 0x5fe07a } };

  /* ---------- level scene ---------- */
  let world = null, L = null, st = null, ball, ballTex, shadow, shieldMesh;
  const col = new T.Color();

  function ribbon(p, xa, xb, yOff, thick, colTop, colTop2, colSide) {
    const n = Math.max(1, Math.ceil(p.len)), pos = [], cols = [];
    const P = (i, xo, yo) => { const s = p.s0 + p.len * i / n; return [C.cxBase(p, s) + xo, C.yAt(p, s) + yOff + yo, -s]; };
    const quad = (a, b, c, d, hex) => { col.setHex(hex); for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); cols.push(col.r, col.g, col.b); } };
    for (let i = 0; i < n; i++) {
      const s = p.s0 + p.len * i / n, top = (Math.floor(s / 2) % 2) ? colTop : colTop2;
      const a = P(i, xa, 0), b = P(i, xb, 0), c = P(i + 1, xb, 0), d = P(i + 1, xa, 0);
      const a2 = P(i, xa, -thick), b2 = P(i, xb, -thick), c2 = P(i + 1, xb, -thick), d2 = P(i + 1, xa, -thick);
      quad(a, b, c, d, top); quad(a2, a, d, d2, colSide); quad(b, b2, c2, c, colSide);
      if (i === 0) quad(a2, b2, b, a, colSide);
      if (i === n - 1) quad(d, c, c2, d2, colSide);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals(); return new T.Mesh(g, ribbonMat);
  }

  function disposeWorld() {
    if (!world) return;
    world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== ribbonMat) { if (o.material.map && o.material.map !== checkerTex && o.material.map !== boostTex && !Object.values(emojiTex).includes(o.material.map) && o.material.map !== ballTex) o.material.map.dispose(); o.material.dispose(); } });
    scene.remove(world); world = null;
  }

  function makeBallTex() {
    const sk = SKINS[save.skin] || SKINS[0];
    return canvasTex(256, 128, (g, w, h) => {
      const n = sk.bands.length === 2 ? 8 : 12;
      for (let i = 0; i < n; i++) { g.fillStyle = sk.bands[i % sk.bands.length]; g.fillRect(i * w / n, 0, w / n + 1, h); }
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(64, 64, 16, 0, 7); g.fill(); g.beginPath(); g.arc(192, 64, 16, 0, 7); g.fill();
    });
  }

  function buildScene() {
    disposeWorld(); world = new T.Group(); scene.add(world);
    const th = L.theme; scene.background = new T.Color(th.sky); scene.fog = new T.Fog(th.sky, 45, 130);
    document.body.style.background = '#' + new T.Color(th.sky).getHexString();
    const railCol = 0xffffff;
    for (const p of L.pieces.concat(L.sides)) {
      if (p.kind !== 'p') continue;
      const grp = new T.Group(), lift = p.par ? 0.02 : 0; grp.add(ribbon(p, -p.w / 2, p.w / 2, lift, 0.7, th.a, th.b, th.side));
      if (p.railL) grp.add(ribbon(p, -p.w / 2, -p.w / 2 + 0.22, 0.42, 0.42, railCol, 0xff7a7a, 0xd9dde8));
      if (p.railR) grp.add(ribbon(p, p.w / 2 - 0.22, p.w / 2, 0.42, 0.42, railCol, 0xff7a7a, 0xd9dde8));
      p.mesh = grp; world.add(grp);
    }
    // clouds / floating blobs for a sense of speed
    let seed = 7 + L.idx * 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cg = new T.IcosahedronGeometry(1, 1), dark = L.idx >= 5;
    const cm = new T.MeshLambertMaterial({ color: dark ? 0x8f9bff : 0xffffff, flatShading: true });
    for (let i = 0; i < L.finishS / 9; i++) {
      const m = new T.Mesh(cg, cm), side = rnd() < 0.5 ? -1 : 1, sc = 1.5 + rnd() * 3.5;
      const p = C.pieceAt(L, i * 9);
      m.position.set(p.cx0 + side * (10 + rnd() * 26), p.y0 - 9 + rnd() * 16, -i * 9 - rnd() * 9); m.scale.set(sc * 1.6, sc * 0.8, sc); world.add(m);
    }
    // obstacles
    for (const o of L.obs) {
      let m;
      if (o.type === 'block') { m = new T.Mesh(new T.BoxGeometry(o.hw * 2, o.h, o.hd * 2), lam(0xf08a3c)); m.position.set(o.x, o.y + o.h / 2, -o.s); }
      else if (o.type === 'slider') { m = new T.Mesh(new T.BoxGeometry(o.hw * 2, o.h, o.hd * 2), lam(0x8e5cf5)); m.position.set(o.x, o.y + o.h / 2, -o.s); }
      else if (o.type === 'bumper') {
        m = new T.Group(); const a = new T.Mesh(new T.CylinderGeometry(o.r, o.r, 0.9, 20), lam(0xff4f9a)); a.position.y = 0.45;
        const b = new T.Mesh(new T.CylinderGeometry(o.r * 0.6, o.r * 0.6, 0.12, 20), lam(0xffffff)); b.position.y = 0.95; m.add(a, b); m.position.set(o.x, o.y, -o.s);
      } else if (o.type === 'spinner') {
        m = new T.Group(); const post = new T.Mesh(new T.CylinderGeometry(0.32, 0.4, 0.9, 12), lam(0xffffff)); post.position.y = 0.45;
        const bar = new T.Group();
        for (let k = 0; k < 4; k++) { const seg = new T.Mesh(new T.BoxGeometry(o.len / 2, 0.36, 0.44), lam(k % 2 ? 0xffffff : 0xff3b3b)); seg.position.set(-o.len + o.len / 4 + k * o.len / 2, 0.55, 0); bar.add(seg); }
        m.add(post, bar); o.bar = bar; m.position.set(o.x, o.y, -o.s);
      } else if (o.type === 'spikes') {
        m = new T.Group(); const base = new T.Mesh(new T.BoxGeometry(o.hw * 2, 0.1, o.hd * 2), lam(0xd93636)); base.position.y = 0.05; m.add(base);
        const nx = Math.max(1, Math.round(o.hw * 2 / 0.55)), nz = Math.max(1, Math.round(o.hd * 2 / 0.55)), cgeo = new T.ConeGeometry(0.2, 0.5, 6), cmat = lam(0xf2f4f8);
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const c = new T.Mesh(cgeo, cmat); c.position.set(-o.hw + (i + 0.5) * o.hw * 2 / nx, 0.33, -o.hd + (j + 0.5) * o.hd * 2 / nz); m.add(c); }
        m.position.set(o.x, o.y, -o.s);
      } else if (o.type === 'saw') {
        m = new T.Group(); const spin = new T.Group(); const disc = new T.Mesh(new T.CylinderGeometry(o.r * 0.8, o.r * 0.8, 0.2, 16), lam(0xe23b3b)); disc.rotation.x = Math.PI / 2; spin.add(disc);
        const hub = new T.Mesh(new T.CylinderGeometry(o.r * 0.3, o.r * 0.3, 0.26, 12), lam(0xffffff)); hub.rotation.x = Math.PI / 2; spin.add(hub);
        const tg = new T.ConeGeometry(0.16, 0.34, 4), tm = lam(0xf2f4f8);
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, c = new T.Mesh(tg, tm); c.position.set(Math.cos(a) * o.r * 0.9, Math.sin(a) * o.r * 0.9, 0); c.rotation.z = a - Math.PI / 2; spin.add(c); }
        spin.position.y = o.r; m.add(spin); o.spin = spin; m.position.set(o.x, o.y, -o.s);
      }
      o.mesh = m; world.add(m);
    }
    // items
    const coinGeo = new T.CylinderGeometry(0.38, 0.38, 0.1, 18), coinMat = lam(0xffc61a, { emissive: 0x7a4a00 });
    for (const it of L.items) {
      const g = new T.Group();
      if (it.type === 'coin') { const m = new T.Mesh(coinGeo, coinMat); m.rotation.x = Math.PI / 2; g.add(m); }
      else {
        const P = POWER[it.type];
        g.add(new T.Mesh(new T.SphereGeometry(0.62, 18, 12), new T.MeshLambertMaterial({ color: P.col, transparent: true, opacity: 0.55 })));
        const sp = new T.Sprite(new T.SpriteMaterial({ map: emoji(P.ch), depthTest: false })); sp.scale.set(0.95, 0.95, 1); g.add(sp);
      }
      g.position.set(it.x, it.y, -it.s); it.mesh = g; it.y0 = it.y; world.add(g);
    }
    // pads
    for (const pd of L.pads) {
      let m;
      if (pd.type === 'boost') {
        const tx = boostTex.clone(); tx.needsUpdate = true; tx.repeat.set(Math.round(pd.w / 1.3), 1);
        m = new T.Mesh(new T.PlaneGeometry(pd.w - 0.5, 2.4), new T.MeshBasicMaterial({ map: tx }));
        m.rotation.x = -Math.PI / 2 + Math.atan(pd.slope); m.position.set(pd.x, pd.y + 0.03, -pd.s);
      } else {
        m = new T.Group(); const a = new T.Mesh(new T.BoxGeometry(pd.w - 0.5, 0.16, 1.5), lam(0xff7b00, { emissive: 0x662200 })); a.position.y = 0.08;
        const b2 = new T.Mesh(new T.BoxGeometry(pd.w - 1.1, 0.2, 0.9), lam(0xffe14d, { emissive: 0x665500 })); b2.position.y = 0.1; m.add(a, b2); m.position.set(pd.x, pd.y, -pd.s);
      }
      pd.mesh = m; world.add(m);
    }
    // checkpoints + finish
    const gate = (x, y, s, w, mat) => {
      const g = new T.Group(), pg = new T.CylinderGeometry(0.12, 0.12, 3, 8), pm = lam(0xffffff);
      for (const sd of [-1, 1]) { const p = new T.Mesh(pg, pm); p.position.set(sd * (w / 2 - 0.12), 1.5, 0); g.add(p); }
      const ban = new T.Mesh(new T.BoxGeometry(w, 0.6, 0.12), mat); ban.position.y = 3; g.add(ban); g.position.set(x, y, -s); world.add(g); return ban;
    };
    for (const c of L.checks) c.ban = gate(c.x, c.y, c.s, c.w, lam(0xb8c0d4));
    gate(L.finishX, L.finishY, L.finishS, L.finishW, new T.MeshBasicMaterial({ map: checkerTex }));
    const strip = new T.Mesh(new T.PlaneGeometry(L.finishW, 2), new T.MeshBasicMaterial({ map: checkerTex })); strip.rotation.x = -Math.PI / 2; strip.position.set(L.finishX, L.finishY + 0.03, -L.finishS); world.add(strip);
    // ball
    ballTex = makeBallTex();
    ball = new T.Mesh(new T.SphereGeometry(0.5, 28, 18), new T.MeshLambertMaterial({ map: ballTex })); world.add(ball);
    shieldMesh = new T.Mesh(new T.SphereGeometry(0.72, 18, 12), new T.MeshLambertMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.4 })); shieldMesh.visible = false; world.add(shieldMesh);
    shadow = new T.Mesh(new T.CircleGeometry(0.5, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; world.add(shadow);
    // particles
    parts.length = 0; const pgeo = new T.BoxGeometry(0.2, 0.2, 0.2);
    for (let i = 0; i < 70; i++) { const m = new T.Mesh(pgeo, new T.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; world.add(m); parts.push({ m, life: 0, v: new T.Vector3() }); }
  }
  const parts = []; let partI = 0;
  function burst(x, y, z, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const p = parts[partI = (partI + 1) % parts.length]; p.life = 0.6 + Math.random() * 0.5; p.m.visible = true; p.m.position.set(x, y, z);
      p.m.material.color.setHex(colors[i % colors.length]); p.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
    }
  }

  /* ---------- input ---------- */
  const inp = { steer: 0, jump: false }; let touchSteer = 0, steerId = null, anchorX = 0, keyL = false, keyR = false, keySteer = 0;
  const knob = $('knob'), steerEl = $('steer'), jumpBtn = $('jump');
  canvas.addEventListener('pointerdown', e => { audioOn(); if (steerId !== null) return; steerId = e.pointerId; anchorX = e.clientX; touchSteer = 0; try { canvas.setPointerCapture(e.pointerId); } catch (er) {} });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== steerId) return;
    const range = clamp(window.innerWidth * 0.11, 60, 130); let v = clamp((e.clientX - anchorX) / range, -1, 1);
    // let the anchor follow when the finger overshoots, so reversing direction responds at once
    if (e.clientX - anchorX > range) anchorX = e.clientX - range; if (anchorX - e.clientX > range) anchorX = e.clientX + range;
    touchSteer = Math.abs(v) < 0.05 ? 0 : v;
  });
  const endSteer = e => { if (e.pointerId === steerId) { steerId = null; touchSteer = 0; } };
  canvas.addEventListener('pointerup', endSteer); canvas.addEventListener('pointercancel', endSteer);
  jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); audioOn(); inp.jump = true; jumpBtn.classList.add('down'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => jumpBtn.addEventListener(ev, () => jumpBtn.classList.remove('down')));
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = true;
    if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat) { inp.jump = true; audioOn(); }
    if (e.code === 'Escape' && mode === 'play') pause();
    if (['Space', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false; if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- game flow ---------- */
  let mode = 'home', levelIdx = 0, last = 0, acc = 0, camX = 0, camY = 0, hintT = 0, winT = 0, shake = 0;
  const hudCoins = $('coinN'), barI = $('bar').firstElementChild, hintEl = $('hint'), powersEl = $('powers');
  const show = (id, on) => $(id).classList.toggle('hidden', !on);

  function startLevel(i) {
    levelIdx = i; L = C.build(i, save.diff); st = C.newState(L); buildScene();
    $('lvlName').textContent = (i + 1) + '. ' + L.name; hudCoins.textContent = '0'; barI.style.width = '0%'; hintEl.classList.add('off'); powersEl.innerHTML = '';
    camX = st.x; camY = st.y; acc = 0; touchSteer = 0; steerId = null; inp.jump = false;
    show('home', false); show('win', false); show('paused', false); show('hud', true); mode = 'play'; last = performance.now();
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; show('paused', true); }
  function resume() { show('paused', false); mode = 'play'; last = performance.now(); }
  function goHome() { mode = 'home'; show('hud', false); show('win', false); show('paused', false); renderHome(); show('home', true); }

  function finish() {
    const frac = st.coins / Math.max(1, L.coinTotal), stars = frac >= 0.85 ? 3 : frac >= 0.5 ? 2 : 1, k = save.diff + '_' + levelIdx;
    save.stars[k] = Math.max(save.stars[k] || 0, stars); save.unlocked = Math.max(save.unlocked, Math.min(C.LEVELS.length, levelIdx + 2)); save.bank += st.coins; persist();
    $('stars').innerHTML = [0, 1, 2].map(i => i < stars ? '<b>★</b>' : '★').join('');
    $('winCoins').textContent = st.coins + ' / ' + L.coinTotal;
    const lastLevel = levelIdx === C.LEVELS.length - 1;
    $('winTitle').textContent = lastLevel ? 'You finished them all!' : ['Nice rolling!', 'Great job!', 'Perfect run!'][stars - 1];
    $('next').classList.toggle('hidden', lastLevel);
    show('hud', false); show('win', true); mode = 'win';
  }

  function handleEvents() {
    for (const e of st.ev) {
      const k = e[0];
      if (k === 'coin') { sfx.coin(); hudCoins.textContent = st.coins; burst(e[1].x, e[1].y, -e[1].s, 4, [0xffe14d, 0xffffff], 4); }
      else if (k === 'jump') sfx.jump();
      else if (k === 'land') sfx.land();
      else if (k === 'bonk') sfx.bonk();
      else if (k === 'bump') { sfx.bump(); shake = 0.15; }
      else if (k === 'pad') sfx.pad();
      else if (k === 'boost') sfx.boost();
      else if (k === 'power') { sfx.power(); burst(st.x, st.y, -st.s, 12, [POWER[e[1].type].col, 0xffffff], 6); }
      else if (k === 'check') { sfx.check(); e[1].ban.material.color.setHex(0x3ddc6a); burst(e[1].x, e[1].y + 3, -e[1].s, 14, [0x3ddc6a, 0xffffff], 6); }
      else if (k === 'smash') { sfx.smash(); const o = e[1]; o.mesh.visible = false; burst(C.obX(o, st.t), o.y + 0.6, -o.s, 14, [0xf08a3c, 0xffffff, 0xff4f9a], 8); shake = 0.15; }
      else if (k === 'shieldbreak') { sfx.bump(); burst(st.x, st.y, -st.s, 14, [0x7fd0ff, 0xffffff], 7); }
      else if (k === 'hit' || k === 'fall') { (k === 'hit' ? sfx.hit : sfx.fall)(); if (k === 'hit') burst(st.x, st.y, -st.s, 18, [0xff4d4d, 0xffffff, 0xffc61a], 8); shake = 0.25; }
      else if (k === 'hint') { hintEl.textContent = e[1]; hintEl.classList.remove('off'); hintT = 4.5; }
      else if (k === 'finish') { sfx.finish(); winT = 1.6; for (let i = 0; i < 4; i++) burst(st.x + (i - 1.5) * 1.5, st.y + 2.5, -st.s - 2, 14, [0xff4d4d, 0xffe14d, 0x3ddc6a, 0x3aa0ff, 0xff5d9e], 9); }
    }
    st.ev.length = 0;
  }

  const AX = new T.Vector3(1, 0, 0), AZ = new T.Vector3(0, 0, 1), badges = {};
  function badge(key, ch, frac) {
    let b = badges[key];
    if (frac <= 0) { if (b) { b.remove(); delete badges[key]; } return; }
    if (!b || !b.isConnected) { b = badges[key] = document.createElement('div'); b.className = 'pw'; b.innerHTML = ch + '<i></i>'; powersEl.appendChild(b); }
    b.lastElementChild.style.width = (frac * 100) + '%';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (mode !== 'play' || !st) { last = now; return; }
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    // keyboard steering ramps up so taps give small corrections
    const kt = (keyR ? 1 : 0) - (keyL ? 1 : 0); keySteer = kt === 0 ? 0 : clamp(keySteer + kt * dt * 4, -1, 1); if (kt !== 0 && Math.sign(keySteer) !== kt) keySteer = 0;
    inp.steer = clamp(touchSteer + keySteer, -1, 1);
    acc += dt; const h = 1 / 120;
    while (acc >= h) { C.step(st, L, inp, h); inp.jump = false; acc -= h; }
    handleEvents();

    const t = st.t, r = st.giantT > 0 ? 1 : 0.5;
    // ball
    ball.visible = !st.dead && !(st.invulnT > 0 && Math.floor(t * 12) % 2 === 0);
    const sc = ball.scale.x + (r * 2 - ball.scale.x) * Math.min(1, dt * 12); ball.scale.setScalar(sc);
    ball.position.set(st.x, st.y, -st.s);
    if (!st.dead) { ball.rotateOnWorldAxis(AX, -st.vs * dt / r); ball.rotateOnWorldAxis(AZ, -st.vx * dt / r); }
    shieldMesh.visible = st.shield && !st.dead; shieldMesh.position.copy(ball.position); shieldMesh.scale.setScalar(sc);
    const g = C.ground(L, st.x, st.s, t, st.y - r);
    shadow.visible = !!g && !st.dead && st.y - r >= g.y - 0.1;
    if (g) { const hgt = st.y - r - g.y, k = clamp(1 - hgt / 6, 0.35, 1) * sc; shadow.position.set(st.x, g.y + 0.04, -st.s); shadow.scale.setScalar(k); }
    // moving things
    for (const p of L.pieces) if (p.move) p.mesh.position.x = C.moveOff(p, t);
    for (const o of L.obs) {
      if (o.dead) continue;
      if (o.amp) o.mesh.position.x = C.obX(o, t);
      if (o.bar) o.bar.rotation.y = o.ph + t * o.spd;
      if (o.spin) o.spin.rotation.z = -t * 7;
      if (o.pulse > 0) { o.pulse = Math.max(0, o.pulse - dt * 5); const q = 1 + o.pulse * 0.3; o.mesh.scale.set(q, 1, q); }
    }
    for (const it of L.items) {
      if (it.got) { it.mesh.visible = false; continue; }
      if (Math.abs(it.s - st.s) > 70) continue;
      it.mesh.position.set(it.x, it.y + (it.type === 'coin' ? 0 : Math.sin(t * 3 + it.s) * 0.12), -it.s);
      if (it.type === 'coin') it.mesh.rotation.y = t * 3 + it.s;
    }
    for (const pd of L.pads) if (pd.type === 'boost') pd.mesh.material.map.offset.y = -t * 1.5;
    for (const p of parts) { if (p.life <= 0) continue; p.life -= dt; p.v.y -= 14 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6; if (p.life <= 0) p.m.visible = false; }

    // camera
    camX += (st.x * 0.85 - camX) * Math.min(1, dt * 6);
    const gy = g ? g.y + 0.5 : st.y; camY += ((st.dead ? camY : Math.min(st.y, gy + 2.5)) - camY) * Math.min(1, dt * 5);
    const boostK = st.boostT > 0 ? 1 : 0; camera.fov += (((window.innerWidth < window.innerHeight ? 78 : 60) + boostK * 9) - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    let sx = 0, sy = 0; if (shake > 0) { shake -= dt; sx = (Math.random() - 0.5) * 0.25; sy = (Math.random() - 0.5) * 0.25; }
    camera.position.set(camX + sx, camY + 4.4 + sy, -st.s + 8.4);
    camera.lookAt(camX, camY + 0.1, -st.s - 7);
    renderer.render(scene, camera);

    // HUD
    barI.style.width = clamp(st.s / L.finishS * 100, 0, 100) + '%';
    const sv = clamp(inp.steer, -1, 1), half = steerEl.clientWidth / 2 - 36; knob.style.transform = 'translateX(' + (sv * half) + 'px)';
    badge('magnet', POWER.magnet.ch, st.magnetT / 10); badge('giant', POWER.giant.ch, st.giantT / 7); badge('shield', POWER.shield.ch, st.shield ? 1 : 0);
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) hintEl.classList.add('off'); }
    if (st.done && winT > 0) { winT -= dt; if (winT <= 0) finish(); }
  }

  /* ---------- menus ---------- */
  function renderHome() {
    document.body.style.background = '#59b8ff';
    document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', +b.dataset.d === save.diff));
    const box = $('levels'); box.innerHTML = '';
    let nextUp = -1;
    C.LEVELS.forEach((lv, i) => { if (nextUp < 0 && i < save.unlocked && !save.stars[save.diff + '_' + i]) nextUp = i; });
    if (nextUp < 0) nextUp = 0;
    C.LEVELS.forEach((lv, i) => {
      const locked = i >= save.unlocked, s = save.stars[save.diff + '_' + i] || 0, b = document.createElement('button');
      b.className = 'lvl' + (locked ? ' lock' : '') + (i === nextUp && !locked ? ' next' : '');
      b.innerHTML = '<div class="n">' + (locked ? '\u{1F512}' : i + 1) + '</div><div class="t">' + lv.name + '</div><div class="s">' + [0, 1, 2].map(k => k < s ? '<b>★</b>' : '★').join('') + '</div>';
      if (!locked) b.onclick = () => { audioOn(); startLevel(i); };
      box.appendChild(b);
    });
    $('play').onclick = () => { audioOn(); startLevel(nextUp); };
    const sk = $('skins'); sk.innerHTML = '';
    SKINS.forEach((s, i) => {
      const locked = save.bank < s.need, b = document.createElement('button');
      b.className = 'skin' + (i === save.skin ? ' on' : '') + (locked ? ' lock' : ''); b.style.background = s.css; b.dataset.need = s.need; b.setAttribute('aria-label', 'Marble ' + (i + 1));
      if (!locked) b.onclick = () => { save.skin = i; persist(); renderHome(); };
      sk.appendChild(b);
    });
    $('bank').textContent = save.bank;
    $('sound').textContent = 'Sound: ' + (save.mute ? 'Off' : 'On');
  }
  document.querySelectorAll('.diff').forEach(b => b.onclick = () => { save.diff = +b.dataset.d; persist(); renderHome(); });
  $('sound').onclick = () => { save.mute = !save.mute; persist(); if (!save.mute) { audioOn(); tone(660, 0.1, 'triangle', 0.14); } renderHome(); };
  $('pause').onclick = pause; $('resume').onclick = resume; $('restart').onclick = () => startLevel(levelIdx); $('quit').onclick = goHome;
  $('next').onclick = () => startLevel(Math.min(C.LEVELS.length - 1, levelIdx + 1)); $('again').onclick = () => startLevel(levelIdx); $('toHome').onclick = goHome;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  renderHome(); requestAnimationFrame(frame);
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} }
  window.__marble = { get st() { return st; }, get L() { return L; }, startLevel, get mode() { return mode; } };
})();
