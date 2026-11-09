/* Marble Dash core: level data + physics. No rendering here, so it can be tested headlessly. */
(function (root) {
  'use strict';
  const R = 0.5, G = 26, JUMP = 9.6, PADJUMP = 14.5;
  const DIFFS = [
    { name: 'Easy', speed: 7, gap: 0.7, width: 1.2, lat: 6, spd: 0.7 },
    { name: 'Medium', speed: 9, gap: 1, width: 1, lat: 7.5, spd: 1 },
    { name: 'Hard', speed: 11, gap: 1.2, width: 0.88, lat: 9, spd: 1.3 }
  ];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function moveOff(p, t) { return p.move ? p.move.amp * Math.sin(t * p.move.spd + p.move.ph) : 0; }
  function cxBase(p, s) { const u = clamp((s - p.s0) / p.len, 0, 1); return p.cx0 + (p.cx1 - p.cx0) * u * u * (3 - 2 * u); }
  function cxAt(p, s, t) { return cxBase(p, s) + moveOff(p, t); }
  function yAt(p, s) { const u = clamp((s - p.s0) / p.len, 0, 1); return p.y0 + (p.y1 - p.y0) * u; }
  function pieceAt(L, s) {
    const a = L.pieces; let lo = 0, hi = a.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m].s0 <= s) lo = m; else hi = m - 1; }
    return a[lo];
  }
  function obX(o, t) { return o.amp ? o.bx + o.amp * Math.sin(t * o.spd + o.ph) : o.x; }

  /* ---------------- Levels ----------------
     b.p(len,{dx,dy,w,rail,move})  track piece      b.g(len,{dy})  gap
     b.c(n,x,t0,t1,x1,h)           coins            b.o(type,t,x,{d,...}) obstacle (d = min difficulty)
     b.w(type,t,x)                 power-up         b.boost(t) b.jpad(t) b.ck() b.hint(txt,t) b.end()
     x positions are lane fractions (-1 left edge .. 1 right edge), t is 0..1 along the piece. */
  const LEVELS = [
    { name: 'First Roll', theme: { sky: 0x8fd3ff, a: 0x5ecb6b, b: 0x4fb85d, side: 0x2f7d3c }, make(b) {
      b.p(16).hint('Slide your finger left and right to steer!', 0.1).c(5, 0, .45, .95);
      b.p(16, { dx: 3 }).c(6);
      b.p(16, { dx: -5 }).c(6);
      b.p(14).c(5, -.6, .1, .9, .6);
      b.p(12).ck().hint('Tap JUMP to hop over the gap!', 0.05).c(3, 0, .5, .9);
      b.g(2.5).c(3);
      b.p(14).c(5, .5);
      b.g(2.5).c(3);
      b.p(16, { dx: 3 }).w('magnet', .25, 0).c(4, -.7, .45, .95).c(4, .7, .45, .95);
      b.p(16, { dx: -3 }).c(5, -.7).c(5, .7);
      b.p(14).ck().boost(.3).c(6, 0, .4, 1);
      b.p(10, { dy: 2 }).c(4);
      b.p(12, { dy: -2 }).c(4);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(6).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Hop Hop', theme: { sky: 0x7fe0e0, a: 0xffd166, b: 0xf4b942, side: 0xc98a2b }, make(b) {
      b.p(14).c(4);
      b.p(16, { dx: -3 }).o('block', .55, .5).c(5, -.5);
      b.p(16, { dx: 3 }).o('block', .35, -.5).o('block', .8, .5).c(3, .5, .1, .5).c(3, -.5, .6, .95);
      b.g(3).c(3);
      b.p(10).c(3);
      b.g(3).c(3);
      b.p(10).c(3);
      b.g(3.5).c(3);
      b.p(18).ck().w('shield', .3, 0).o('block', .7, 0).c(3, -.7, .5, .9).c(3, .7, .5, .9);
      b.p(12, { dy: 2.5 }).c(4);
      b.g(3.5, { dy: -1 }).c(3);
      b.p(16).o('block', .45, -.85, { d: 1 }).o('block', .45, .85, { d: 1 }).c(5);
      b.p(14, { dx: 4, w: 4.5 }).c(6);
      b.p(14, { dx: -4, w: 4.5 }).c(6);
      b.p(14).ck().boost(.25).c(5, 0, .35, 1);
      b.p(10, { dy: 3, rail: 2 });
      b.g(5, { dy: -2 }).c(4, 0, 0, 1, 0, 2.2);
      b.p(20).c(5, 0, .3, .9).o('block', .7, -.6, { d: 2 });
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(7).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Bumper Park', theme: { sky: 0xffc6e0, a: 0xff8fb8, b: 0xff7aa8, side: 0xc44f7d }, make(b) {
      b.p(14).c(4);
      b.p(18, { w: 7 }).o('bumper', .4, -.5).o('bumper', .75, .5).c(3, .5, .2, .5).c(3, -.5, .6, .9);
      b.p(16, { dx: 4 }).c(6);
      b.p(20, { w: 7 }).o('bumper', .25, 0).o('bumper', .55, -.7).o('bumper', .55, .7).o('bumper', .85, 0, { d: 1 }).c(4, -.4, .3, .5, .4).c(4, .4, .62, .82, -.4);
      b.g(3).c(3);
      b.p(14).ck().w('magnet', .4, 0).c(4, -.7).c(4, .7);
      b.p(16, { dx: -4, w: 5 }).c(6);
      b.p(12).boost(.3).c(5, 0, .4, 1);
      b.p(12, { dy: 3, rail: 2 }).c(4);
      b.g(5, { dy: -2 }).c(4, 0, 0, 1, 0, 2.2);
      b.p(22).c(5, 0, .4, .9).o('block', .75, .6);
      b.p(16, { dx: 3 }).ck().o('bumper', .4, .4).o('block', .8, -.5).c(4, -.5, .1, .6);
      b.g(3.5).c(3);
      b.p(10).c(3);
      b.g(3.5).c(3);
      b.p(18, { w: 7 }).o('bumper', .3, -.4).o('bumper', .3, .4, { d: 1 }).o('bumper', .7, 0).w('shield', .5, 0).c(3, -.8, .5, .9).c(3, .8, .5, .9);
      b.p(12, { dy: -3 }).c(5);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(7.5).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Spiky Path', theme: { sky: 0xffb37a, a: 0xb58cff, b: 0xa279f5, side: 0x6b4fb0 }, make(b) {
      b.p(14).hint('Red spikes pop your marble. Steer around or jump!', 0.1).c(4);
      b.p(16).o('spikes', .55, -.5).c(5, .5);
      b.p(16, { dx: 3 }).o('spikes', .35, .5).o('spikes', .8, -.5).c(3, -.5, .1, .5).c(3, .5, .6, .95);
      b.p(16).w('shield', .2, 0).o('spikes', .6, 0, { hw: 1.6 }).c(3, -.8, .4, .8).c(3, .8, .4, .8);
      b.g(3).c(3);
      b.p(16).ck().o('spikes', .5, 0, { hw: 3.6, hd: .5 }).c(3, 0, .32, .68, 0, 1.4).hint('Jump over the spike strip!', 0);
      b.p(16, { dx: -4, w: 4.5 }).c(6);
      b.p(16, { w: 4.5 }).o('spikes', .35, -.6, { hw: .7 }).o('spikes', .75, .6, { hw: .7 }).c(3, .5, .2, .5).c(3, -.5, .6, .9);
      b.g(3.5).c(3);
      b.p(14).ck().boost(.3).c(5, 0, .4, 1);
      b.p(12, { dy: 3, rail: 2 });
      b.g(5.5, { dy: -2.5 }).c(4, 0, 0, 1, 0, 2.2);
      b.p(22).c(4, 0, .35, .7).o('spikes', .85, .5, { d: 1 });
      b.p(18, { dx: 4 }).o('block', .3, .5).o('spikes', .6, -.5).o('spikes', .9, .3, { d: 1 }).w('magnet', .45, .5).c(4, .5, .55, .95);
      b.p(16).ck().o('spikes', .35, 0, { hw: 3.6, hd: .5 }).o('spikes', .75, 0, { hw: 3.6, hd: .5 }).c(3, 0, .2, .5, 0, 1.4).c(3, 0, .6, .9, 0, 1.4);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(8).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Sky Bridges', theme: { sky: 0xa9c9ff, a: 0xffffff, b: 0xe3ecfb, side: 0x9fb3d9 }, make(b) {
      b.p(14).c(4);
      b.p(16).o('slider', .6, 0, { amp: .7 }).c(5);
      b.g(2.5).c(3);
      b.p(10, { move: [2.2, 1.1], rail: 1 }).hint('This bridge slides. Ride it across!', 0);
      b.g(2.5);
      b.p(14).ck().w('magnet', .5, 0).c(4, -.6).c(4, .6);
      b.p(16, { dx: 4, w: 4.5 }).c(6);
      b.p(16).o('slider', .35, 0, { amp: .7 }).o('slider', .75, 0, { amp: .7, ph: 2 }).c(5);
      b.g(3).c(3);
      b.p(9, { move: [2.4, 1.2], rail: 1 });
      b.g(2.5);
      b.p(9, { move: [2.4, 1.2, 3.1], rail: 1 });
      b.g(2.5);
      b.p(14).ck().boost(.3).c(5, 0, .4, 1);
      b.p(12, { dy: 3, rail: 2 });
      b.g(6, { dy: -2.5 }).c(4, 0, 0, 1, 0, 2.2);
      b.p(22).c(5, 0, .35, .85).o('block', .9, -.5, { d: 1 });
      b.p(18, { dx: -4 }).o('slider', .4, 0, { amp: .75 }).o('spikes', .8, .5).w('shield', .6, -.5).c(4, -.5, .65, .95);
      b.p(12, { dy: 2 }).ck().c(4);
      b.g(3, { dy: -.5 }).c(3);
      b.p(10, { move: [2.4, 1.3], rail: 1 });
      b.g(3);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(8).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Spinner City', theme: { sky: 0x2b2f6b, a: 0x4dd6d0, b: 0x3fc2bc, side: 0x1f7f7b }, make(b) {
      b.p(14).c(4);
      b.p(18, { w: 7 }).o('spinner', .6, 0).hint('Jump over the spinning bar!', 0).c(3, 0, .45, .75, 0, 1.4);
      b.p(16, { dx: -3 }).c(6);
      b.p(20, { w: 7 }).w('giant', .15, 0).o('block', .4, -.75).o('block', .4, .75).o('bumper', .6, 0).o('block', .8, 0).c(5, 0, .3, .9);
      b.g(3).c(3);
      b.p(18, { w: 7 }).ck().o('spinner', .5, 0, { spd: -1.8 }).c(3, -.8, .2, .8).c(3, .8, .2, .8);
      b.p(16, { dx: 4, w: 4.5 }).c(6);
      b.p(22, { w: 7 }).o('spinner', .3, 0).o('spinner', .75, 0, { spd: -1.6, d: 1 }).c(3, 0, .2, .4, 0, 1.4).c(4, 0, .5, .65);
      b.g(3.5).c(3);
      b.p(14).ck().boost(.3).c(5, 0, .4, 1);
      b.p(12, { dy: 3.5, rail: 2 });
      b.g(6, { dy: -3 }).c(4, 0, 0, 1, 0, 2.2);
      b.p(24).c(5, 0, .35, .8).o('spikes', .92, -.5, { d: 1 });
      b.p(16, { dx: -4 }).o('slider', .5, 0, { amp: .7 }).w('shield', .25, 0).c(4, 0, .6, .95);
      b.p(20, { w: 7 }).ck().o('spinner', .4, 0, { spd: 2 }).o('spikes', .72, .85).o('spikes', .72, -.85, { d: 2 }).c(3, 0, .3, .6, 0, 1.4);
      b.g(3).c(3);
      b.p(10, { move: [2.2, 1.2], rail: 1 });
      b.g(3);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(8.5).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Saw Valley', theme: { sky: 0x47223a, a: 0xff9d4d, b: 0xf58a36, side: 0x9c4a12 }, make(b) {
      b.p(14).hint('Watch out for the rolling saws!', 0.1).c(4);
      b.p(18).o('saw', .6, 0, { amp: .8 }).c(5);
      b.p(14, { dy: -3 }).c(5);
      b.p(18, { dx: 3 }).o('saw', .4, 0, { amp: .8 }).o('saw', .8, 0, { amp: .8, ph: 2.5, d: 1 }).w('shield', .15, 0).c(5, 0, .5, .7);
      b.g(3.5).c(3);
      b.p(16).ck().o('spikes', .4, -.55).o('spikes', .4, .55).o('saw', .8, 0, { amp: .6 }).c(4, 0, .2, .6);
      b.p(14, { dy: -3, w: 4.5 }).c(5);
      b.p(12).boost(.2).c(4, 0, .4, 1);
      b.p(12, { dy: 3.5, rail: 2 });
      b.g(7, { dy: -3.5 }).c(5, 0, 0, 1, 0, 2.4);
      b.p(24).c(5, 0, .4, .8);
      b.p(18, { dx: -4 }).ck().w('giant', .15, 0).o('saw', .45, 0, { amp: .5 }).o('block', .7, -.85).o('block', .7, .85).o('saw', .9, 0, { amp: .5, ph: 1 }).c(5, 0, .3, .95);
      b.g(3).c(3);
      b.p(10, { move: [2.3, 1.3], rail: 1 });
      b.g(3);
      b.p(18).ck().o('spinner', .5, 0).o('saw', .88, 0, { amp: .8, d: 1 }).w('magnet', .2, 0).c(3, -.8, .3, .7).c(3, .8, .3, .7);
      b.p(14, { dy: -3 }).c(5);
      b.p(16, { w: 4.5 }).o('spikes', .4, -.6, { hw: .7 }).o('spikes', .75, .6, { hw: .7 }).c(3, .5, .25, .5).c(3, -.5, .6, .9);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(8.5).c(5, 0, 0, 1, 0, 3.4);
      b.end();
    } },
    { name: 'Grand Finale', theme: { sky: 0x14122e, a: 0xffe14d, b: 0xf7d234, side: 0xa8860f }, make(b) {
      b.p(14).c(4);
      b.p(18, { dx: 3 }).o('block', .35, -.5).o('bumper', .7, .4).c(5, .5, .1, .5);
      b.g(3).c(3);
      b.p(10, { move: [2.3, 1.2], rail: 1 });
      b.g(3);
      b.p(18, { w: 7 }).ck().o('spinner', .5, 0).w('magnet', .15, 0).c(3, 0, .35, .65, 0, 1.4);
      b.p(16, { dx: -4, w: 4.5 }).c(6);
      b.p(18).o('saw', .4, 0, { amp: .8 }).o('spikes', .8, 0, { hw: 1.4 }).c(3, -.8, .6, .95).c(3, .8, .6, .95);
      b.p(12).boost(.2).c(4, 0, .4, 1);
      b.p(12, { dy: 3.5, rail: 2 });
      b.g(7, { dy: -3 }).c(5, 0, 0, 1, 0, 2.4);
      b.p(24).c(5, 0, .4, .8);
      b.p(20, { w: 7 }).ck().w('giant', .1, 0).o('block', .35, -.75).o('block', .35, .75).o('bumper', .55, 0).o('saw', .75, 0, { amp: .6 }).o('block', .92, 0).c(6, 0, .25, .95);
      b.g(3.5).c(3);
      b.p(9, { move: [2.4, 1.3], rail: 1 });
      b.g(2.5);
      b.p(9, { move: [2.4, 1.3, 3.1], rail: 1 });
      b.g(2.5);
      b.p(16).ck().o('slider', .5, 0, { amp: .7 }).w('shield', .2, 0).c(4, 0, .65, .95);
      b.p(14, { dy: -3 }).c(5);
      b.p(20, { w: 7 }).o('spikes', .3, 0, { hw: 4, hd: .5 }).o('spinner', .7, 0, { spd: -1.8 }).c(3, 0, .15, .45, 0, 1.4).c(3, 0, .55, .85, 0, 1.4);
      b.p(16, { dx: 4, w: 4.5 }).c(6);
      b.p(12, { dy: 2.5 }).ck().c(4);
      b.g(4, { dy: -1 }).c(3);
      b.p(16).o('saw', .5, 0, { amp: .8 }).o('spikes', .85, -.5, { d: 1 }).c(4, 0, .1, .35);
      b.p(12).jpad(.8).c(3, 0, .1, .6);
      b.g(9).c(6, 0, 0, 1, 0, 3.4);
      b.end();
    } }
  ];

  function build(idx, d) {
    const def = LEVELS[idx], D = DIFFS[d];
    const L = { idx, d, D, name: def.name, theme: def.theme, pieces: [], obs: [], items: [], pads: [], checks: [], hints: [], coinTotal: 0, finishS: 0 };
    let s = 0, cx = 0, y = 0, cur = null;
    const lane = (p, xf) => xf * (p.w / 2 - 0.8);
    const at = (t, xf) => { const ss = cur.s0 + t * cur.len; return { s: ss, x: cxBase(cur, ss) + lane(cur, xf || 0), y: yAt(cur, ss) }; };
    const b = {
      p(len, o) {
        o = o || {};
        cur = { kind: 'p', s0: s, s1: s + len, len, cx0: cx, cx1: cx + (o.dx || 0), y0: y, y1: y + (o.dy || 0), w: (o.w || 6) * D.width, rail: d <= (o.rail || 0), move: null };
        if (o.move) cur.move = { amp: o.move[0] * (d === 0 ? 0.5 : 1), spd: o.move[1] * D.spd, ph: o.move[2] || 0 };
        L.pieces.push(cur); s += len; cx = cur.cx1; y = cur.y1; return b;
      },
      g(len, o) {
        o = o || {}; len *= D.gap;
        cur = { kind: 'gap', s0: s, s1: s + len, len, cx0: cx, cx1: cx, y0: y, y1: y + (o.dy || 0), w: 6, rail: false, move: null };
        L.pieces.push(cur); s += len; y = cur.y1; return b;
      },
      c(n, x, t0, t1, x1, h) {
        const gap = cur.kind === 'gap';
        x = x || 0; if (t0 == null) t0 = gap ? 0.1 : 0.15; if (t1 == null) t1 = gap ? 0.9 : 0.85; if (x1 == null) x1 = x; if (h == null) h = gap ? 1.5 : 0;
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0.5 : i / (n - 1), pos = at(t0 + (t1 - t0) * u, x + (x1 - x) * u);
          L.items.push({ type: 'coin', s: pos.s, x: pos.x, y: pos.y + 0.75 + 4 * h * u * (1 - u) });
        }
        return b;
      },
      o(type, t, x, o) {
        o = o || {}; if ((o.d || 0) > d) return b;
        const pos = at(t, x), ob = { type, s: pos.s, x: pos.x, y: pos.y };
        if (type === 'block') { ob.hw = o.hw || 0.8; ob.hd = 0.8; ob.h = 1.1; }
        if (type === 'slider') { ob.hw = 1; ob.hd = 0.5; ob.h = 1.1; }
        if (type === 'bumper') ob.r = 0.75;
        if (type === 'saw') ob.r = 0.7;
        if (type === 'spikes') { ob.hw = Math.min(o.hw || 0.9, cur.w / 2); ob.hd = o.hd || 0.7; }
        if (type === 'spinner') { ob.len = Math.min(2.3, cur.w / 2 - 0.3); ob.spd = (o.spd || 1.6) * D.spd; ob.ph = o.ph || 0; }
        if (type === 'slider' || type === 'saw') { ob.bx = cxBase(cur, pos.s); ob.amp = lane(cur, o.amp || 0.8); ob.spd = (o.spd || 1.5) * D.spd; ob.ph = o.ph || 0; }
        L.obs.push(ob); return b;
      },
      w(type, t, x) { const pos = at(t, x); L.items.push({ type, s: pos.s, x: pos.x, y: pos.y + 0.9 }); return b; },
      boost(t) { const pos = at(t, 0); L.pads.push({ type: 'boost', s: pos.s, x: pos.x, y: pos.y, w: cur.w, slope: (cur.y1 - cur.y0) / cur.len, last: -9 }); return b; },
      jpad(t) { const pos = at(t, 0); L.pads.push({ type: 'jpad', s: pos.s, x: pos.x, y: pos.y, w: cur.w, slope: 0, last: -9 }); return b; },
      ck() { const pos = at(0, 0); L.checks.push({ s: cur.s0 + 1.5, x: pos.x, y: pos.y, w: cur.w, hit: false }); return b; },
      hint(txt, t) { L.hints.push({ s: cur.s0 + (t || 0) * cur.len, txt, shown: false }); return b; },
      end() { b.p(26, { rail: 2 }); L.finishS = cur.s0 + 8; L.finishW = cur.w; L.finishX = cur.cx0; L.finishY = cur.y0; return b; }
    };
    def.make(b);
    L.pieces.forEach((p, i) => {
      p.i = i;
      if (p.kind === 'gap') { const a = L.pieces[i - 1], n = L.pieces[i + 1]; p.w = Math.min(a.w, n.w); p.cx1 = n.cx0; }
    });
    L.coinTotal = L.items.filter(i => i.type === 'coin').length;
    L.start = { s: 1.5, hit: true };
    return L;
  }

  function newState(L) {
    const st = { t: 0, s: 0, x: 0, y: 0, vs: 0, vx: 0, vy: 0, grounded: false, gp: null, coyote: 0, jumpBuf: 0, boostT: 0, magnetT: 0, giantT: 0, shield: false, invulnT: 0, stun: 0, dead: false, deadT: 0, done: false, coins: 0, tries: 0, check: L.start, ev: [] };
    place(st, L); return st;
  }
  function place(st, L) {
    const c = st.check, p = pieceAt(L, c.s);
    st.s = c.s; st.x = cxAt(p, c.s, st.t); st.y = yAt(p, c.s) + R + 0.3; st.vs = 0; st.vx = 0; st.vy = 0;
    st.dead = false; st.giantT = 0; st.boostT = 0; st.stun = 0; st.grounded = false; st.gp = null;
  }
  function die(st, why) { if (st.dead || st.done) return; st.dead = true; st.deadT = 0.9; st.ev.push([why]); }

  function ground(L, x, s, t, foot) {
    const p = pieceAt(L, s); let gy = -1e9, slope = 0, gp = null;
    if (p.kind === 'p' && Math.abs(x - cxAt(p, s, t)) <= p.w / 2 + 0.2) { gy = yAt(p, s); slope = (p.y1 - p.y0) / p.len; gp = p; }
    for (const o of L.obs) {
      if (o.dead || o.type !== 'block') continue;
      if (Math.abs(o.s - s) <= o.hd + 0.25 && Math.abs(o.x - x) <= o.hw + 0.25) { const top = o.y + o.h; if (foot >= top - 0.4 && top > gy) { gy = top; slope = 0; gp = null; } }
    }
    return gy > -1e8 ? { y: gy, slope, p: gp } : null;
  }

  function step(st, L, inp, dt) {
    const D = L.D; st.t += dt; const t = st.t;
    if (st.dead) { st.deadT -= dt; if (st.deadT <= 0) { place(st, L); st.invulnT = 2; st.tries++; st.ev.push(['respawn']); } return; }
    const r = st.giantT > 0 ? 1 : R;
    if (st.boostT > 0) st.boostT -= dt;
    if (st.magnetT > 0) st.magnetT -= dt;
    if (st.giantT > 0) { st.giantT -= dt; if (st.giantT <= 0) st.ev.push(['shrink']); }
    if (st.invulnT > 0) st.invulnT -= dt;
    if (st.stun > 0) st.stun -= dt;

    const target = st.done ? 0 : D.speed * (st.boostT > 0 ? 1.8 : 1);
    st.vs += clamp(target - st.vs, -(st.done ? 10 : 6) * dt, 14 * dt);
    const k = st.stun > 0 ? 1.5 : (st.grounded ? 12 : 7);
    st.vx += ((st.done ? 0 : inp.steer) * D.lat - st.vx) * Math.min(1, k * dt);
    if (inp.jump) st.jumpBuf = 0.15; else if (st.jumpBuf > 0) st.jumpBuf -= dt;
    if (st.jumpBuf > 0 && st.coyote > 0 && !st.done) {
      st.vy = JUMP + Math.max(0, st.vy); st.grounded = false; st.coyote = 0; st.jumpBuf = 0; st.ev.push(['jump']);
    }
    if (st.grounded && st.gp && st.gp.move) st.x += moveOff(st.gp, t) - moveOff(st.gp, t - dt);
    st.s += st.vs * dt; st.x += st.vx * dt; st.vy -= G * dt; st.y += st.vy * dt;
    if (st.s < 0.6) { st.s = 0.6; st.vs = Math.max(0, st.vs); }

    let foot = st.y - r;
    const g = ground(L, st.x, st.s, t, foot), was = st.grounded;
    if (g && foot <= g.y + 0.02 && foot >= g.y - 0.7 && st.vy <= g.slope * st.vs + 0.01) {
      if (!was && st.vy < -7) st.ev.push(['land']);
      st.y = g.y + r; st.vy = g.slope * st.vs; st.grounded = true; st.gp = g.p; st.coyote = 0.12; foot = g.y;
    } else { st.grounded = false; st.gp = null; st.coyote -= dt; }

    const p = pieceAt(L, st.s), cxx = cxAt(p, st.s, t), base = yAt(p, st.s);
    const railOn = L.d === 0 ? foot > base - 0.7 : (p.kind === 'p' && p.rail && foot > base - 0.7 && foot < base + 1.3);
    if (railOn) {
      const lim = Math.max(0.1, p.w / 2 - r - 0.15);
      if (st.x > cxx + lim) { st.x = cxx + lim; if (st.vx > 0) st.vx = 0; }
      if (st.x < cxx - lim) { st.x = cxx - lim; if (st.vx < 0) st.vx = 0; }
    }
    if (st.y < base - 8) { die(st, 'fall'); return; }

    // obstacles
    for (const o of L.obs) {
      if (o.dead) continue; const ds0 = o.s - st.s; if (ds0 > 6 || ds0 < -6) continue;
      const ox = obX(o, t); let lethal = false;
      if (o.type === 'block' || o.type === 'slider') {
        if (foot >= o.y + o.h - 0.4) continue;
        let dx = st.x - clamp(st.x, ox - o.hw, ox + o.hw), ds = st.s - clamp(st.s, o.s - o.hd, o.s + o.hd);
        const d2 = dx * dx + ds * ds; if (d2 >= r * r) continue;
        if (st.giantT > 0) { o.dead = true; st.ev.push(['smash', o]); continue; }
        if (d2 < 1e-6) { st.s = o.s - o.hd - r; st.vs = -2; }
        else { const dd = Math.sqrt(d2), nx = dx / dd, ns = ds / dd, pen = r - dd; st.x += nx * pen; st.s += ns * pen;
          if (ns < -0.5) { if (st.vs > 2) st.ev.push(['bonk']); st.vs = Math.min(st.vs, -2.5); }
          else if (Math.abs(nx) > 0.5) st.vx = nx * Math.max(1.5, Math.abs(st.vx) * 0.3); }
      } else if (o.type === 'bumper') {
        if (foot >= o.y + 1.1) continue;
        const dx = st.x - ox, ds = st.s - o.s, dd = Math.hypot(dx, ds); if (dd >= r + o.r) continue;
        if (st.giantT > 0) { o.dead = true; st.ev.push(['smash', o]); continue; }
        const nx = dd > 1e-3 ? dx / dd : 0, ns = dd > 1e-3 ? ds / dd : -1;
        st.x = ox + nx * (r + o.r); st.s = o.s + ns * (r + o.r); st.vx = nx * 9; st.vs = ns * 8; st.vy = Math.max(st.vy, 3); st.stun = 0.3; o.pulse = 1; st.ev.push(['bump']);
      } else if (o.type === 'spinner') {
        if (foot >= o.y + 0.85) continue;
        const a = o.ph + t * o.spd, ux = Math.cos(a), us = Math.sin(a);
        const px = st.x - o.x, ps = st.s - o.s, tt = clamp(px * ux + ps * us, -o.len, o.len);
        const dx = px - ux * tt, ds = ps - us * tt, dd = Math.hypot(dx, ds); if (dd >= r + 0.22) continue;
        if (st.giantT > 0) { o.dead = true; st.ev.push(['smash', o]); continue; }
        const nx = dd > 1e-3 ? dx / dd : -us, ns = dd > 1e-3 ? ds / dd : ux, pen = r + 0.22 - dd;
        st.x += nx * pen; st.s += ns * pen; st.vx = nx * 8; st.vs = ns * 7; st.vy = Math.max(st.vy, 3); st.stun = 0.35; st.ev.push(['bump']);
      } else if (o.type === 'spikes') {
        lethal = Math.abs(st.x - o.x) < o.hw + r * 0.4 && Math.abs(st.s - o.s) < o.hd + r * 0.4 && foot < o.y + 0.45;
      } else if (o.type === 'saw') {
        lethal = Math.hypot(st.x - ox, st.s - o.s) < r + o.r - 0.15 && foot < o.y + 1.3;
      }
      if (lethal) {
        if (st.giantT > 0) { o.dead = true; st.ev.push(['smash', o]); }
        else if (st.invulnT > 0) { /* safe */ }
        else if (st.shield) { st.shield = false; st.invulnT = 1.5; st.ev.push(['shieldbreak']); }
        else { die(st, 'hit'); return; }
      }
    }

    // items
    for (const it of L.items) {
      if (it.got) continue; const ds = it.s - st.s; if (ds > 8 || ds < -8) continue;
      const dx = it.x - st.x, dy = it.y - st.y, dd = Math.sqrt(dx * dx + dy * dy + ds * ds);
      if (it.type === 'coin') {
        if (st.magnetT > 0 && dd < 6.5 && dd > 0.01) { const m = Math.min(dd, 18 * dt) / dd; it.x -= dx * m; it.y -= dy * m; it.s -= ds * m; }
        if (dd < r + 0.8) { it.got = true; st.coins++; st.ev.push(['coin', it]); }
      } else if (dd < r + 0.9) {
        it.got = true;
        if (it.type === 'magnet') st.magnetT = 10;
        if (it.type === 'shield') st.shield = true;
        if (it.type === 'giant') { if (st.giantT <= 0) st.y += 0.5; st.giantT = 7; }
        st.ev.push(['power', it]);
      }
    }
    // pads
    if (st.grounded) for (const pd of L.pads) {
      if (t - pd.last < 1) continue;
      if (pd.type === 'boost' && Math.abs(st.s - pd.s) < 1.2) { pd.last = t; st.boostT = 2.2; st.ev.push(['boost']); }
      if (pd.type === 'jpad' && Math.abs(st.s - pd.s) < 0.8) { pd.last = t; st.vy = PADJUMP; st.boostT = Math.max(st.boostT, 1.2); st.grounded = false; st.coyote = 0; st.ev.push(['pad']); }
    }
    for (const c of L.checks) if (!c.hit && st.s >= c.s && Math.abs(foot - base) < 4) { c.hit = true; st.check = c; st.ev.push(['check', c]); }
    for (const h of L.hints) if (!h.shown && st.s >= h.s) { h.shown = true; st.ev.push(['hint', h.txt]); }
    if (!st.done && st.s >= L.finishS) { st.done = true; st.ev.push(['finish']); }
  }

  const api = { R, DIFFS, LEVELS, build, newState, step, ground, pieceAt, cxAt, cxBase, yAt, moveOff, obX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MarbleCore = api;
})(typeof self !== 'undefined' ? self : this);
