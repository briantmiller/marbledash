/* Marble Dash core: level data + physics. No rendering here, so it can be tested headlessly. */
(function (root) {
  'use strict';
  const R = 0.5, G = 26, JUMP = 12.5, PADJUMP = 17;
  const DIFFS = [
    { name: 'Easy', speed: 7, gap: 0.7, width: 1.2, lat: 6, spd: 0.7 },
    { name: 'Medium', speed: 9, gap: 1, width: 1, lat: 7.5, spd: 1 },
    { name: 'Hard', speed: 11, gap: 1.2, width: 0.88, lat: 9, spd: 1.3 }
  ];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function moveOff(p, t) { return p.move ? p.move.amp * Math.sin(t * p.move.spd + p.move.ph) : 0; }
  function cxBase(p, s) {
    const u = clamp((s - p.s0) / p.len, 0, 1), e = u * u * (3 - 2 * u);
    return p.par ? cxBase(p.par, s) + p.off0 + (p.off1 - p.off0) * e : p.cx0 + (p.cx1 - p.cx0) * e;
  }
  function slopeOf(p) { return p.par ? slopeOf(p.par) + (p.yo1 - p.yo0) / p.len : (p.y1 - p.y0) / p.len; }
  function cxAt(p, s, t) { return cxBase(p, s) + moveOff(p, t); }
  function yAt(p, s) {
    const u = clamp((s - p.s0) / p.len, 0, 1);
    return p.par ? yAt(p.par, s) + p.yo0 + (p.yo1 - p.yo0) * u : p.y0 + (p.y1 - p.y0) * u;
  }
  function pieceAt(L, s) {
    const a = L.pieces; let lo = 0, hi = a.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m].s0 <= s) lo = m; else hi = m - 1; }
    return a[lo];
  }
  function obX(o, t) { return o.amp ? o.bx + o.amp * Math.sin(t * o.spd + o.ph) : o.x; }

  /* ---------------- Level building blocks ----------------
     Builder: b.p(len,{dx,dy,w,rail,move}) main track piece, b.g(len,{dy}) gap, b.fork(len) empty stretch for branches,
     b.br(side,{t0,t1,y0,y1}) branch inside a fork, b.lane(side,mode,{t0,t1}) side track beside the main track,
     b.c() coins, b.o() obstacle ({d} = minimum difficulty), b.w() power-up, b.boost(t), b.jpad(t), b.hint(txt,t).
     x positions are lane fractions (-1 .. 1), t is 0..1 along the current piece. */
  const B = { // branch contents for forks: (b, side)
    safe(b, sd) { b.br(sd).c(5, 0, .15, .85); },
    coins(b, sd) { b.br(sd).c(11, 0, .08, .92); },
    boost(b, sd) { b.br(sd).boost(.1).c(10, 0, .2, .95); },
    blocks(b, sd) { b.br(sd).o('block', .3, -.5).o('block', .6, .5).o('block', .85, -.5, { d: 1 }).c(4, .5, .2, .4).c(4, -.5, .5, .7).w('magnet', .12, 0); },
    spikes(b, sd) { b.br(sd).o('spikes', .3, -.5, { hw: .7 }).o('spikes', .6, .5, { hw: .7 }).o('spikes', .85, -.5, { hw: .7, d: 1 }).c(4, .5, .2, .4).c(4, -.5, .5, .7).w('shield', .1, 0); },
    saws(b, sd) { b.br(sd).o('saw', .35, 0, { amp: .8 }).o('saw', .7, 0, { amp: .8, ph: 2 }).c(11, 0, .12, .95).w('shield', .06, 0); },
    bumpers(b, sd) { b.br(sd).o('bumper', .3, -.4).o('bumper', .55, .4).o('bumper', .8, -.4).c(4, .5, .2, .45).c(4, -.5, .5, .7).c(3, .5, .75, .95); },
    high(b, sd) {
      b.br(sd, { t1: .25, y1: 3 }).c(3); b.br(sd, { t0: .25, t1: .7, y0: 3 }).c(7).w('magnet', .5, 0); b.br(sd, { t0: .7, y0: 3, y1: 0 }).c(4);
    },
    hops(b, sd) {
      const g = (3.2 + 1.2 * b.d) / b.main.len;
      b.br(sd, { t1: .26 }).c(4); b.br(sd, { t0: .26 + g, t1: .6 }).c(4).w('shield', .5, 0); b.br(sd, { t0: .6 + g }).c(5);
    }
  };
  const S = { // sections: (b, ...args)
    start(b) { b.p(16).c(5, 0, .4, .95); },
    hint(b, txt) { b.p(9).hint(txt, 0).c(2); },
    line(b, len) { len = len || 14; b.p(len).c(Math.round(len / 3)); },
    curves(b, n, w) { for (let i = 0; i < (n || 3); i++) b.p(16, { dx: (i % 2 ? -1 : 1) * 4, w }).c(6); },
    zig(b) { b.p(20).c(4, -.7, .1, .45, .7).c(4, .7, .55, .9, -.7); },
    power(b, type) { b.p(10).w(type, .5, 0); },
    slalom(b, type, n) {
      n = n || 3; b.p(12 * n + 4); const moving = type === 'saw' || type === 'slider';
      for (let i = 0; i < n; i++) {
        const t = (i + .7) / (n + .4), x = i % 2 ? .55 : -.55;
        if (moving) { b.o(type, t, 0, { amp: .8, ph: i * 2, d: i > 2 ? 1 : 0 }); b.c(3, 0, t + .08, t + .2); }
        else { b.o(type, t, x, { d: i > 2 ? 1 : 0 }); b.c(3, -x, t - .08, t + .08); }
      }
    },
    hops(b, n, len) { b.p(6); for (let i = 0; i < (n || 3); i++) { b.g(len || 3).c(3); b.p(12).c(3); } },
    steps(b, n) { for (let i = 0; i < (n || 3); i++) { b.p(11, { dy: 1.5 }).c(3); b.g(2.5).c(3); } b.p(12).c(3); },
    hill(b) { b.p(12, { dy: 2.5 }).c(4); b.p(12, { dy: -2.5 }).c(4); },
    down(b) { b.p(18, { dy: -4 }).c(6); },
    boostJump(b, gap, drop) {
      b.p(14).boost(.3).c(5, 0, .4, 1); b.p(12, { dy: 3.2, rail: 2 });
      b.g(gap || 6, { dy: -(drop || 2.5) }).c(5, 0, 0, 1, 0, 2.6); b.p(34).c(6, 0, .45, .9);
    },
    padJump(b, gap) { b.p(12).jpad(.8).c(3, 0, .1, .6); b.g(gap || 7).c(6, 0, 0, 1, 0, 4.8); b.p(18).c(4, 0, .45, .9); },
    movers(b, n) { b.p(6); for (let i = 0; i < (n || 2); i++) { b.g(2.5); b.p(12, { move: [2.3, 1.2, i * 3.1], rail: 1 }); } b.g(2.5); b.p(12).c(4); },
    narrow(b) { b.p(16, { dx: 4, w: 4.2 }).c(6); b.p(16, { dx: -4, w: 4.2 }).c(6); },
    field(b, type) { b.p(26, { w: 7 }).o(type, .25, 0).o(type, .5, -.7).o(type, .5, .7).o(type, .78, 0, { d: 1 }).c(4, -.4, .3, .45, .4).c(4, .4, .58, .72, -.4); },
    strips(b, n) { n = n || 2; b.p(11 * n + 6); for (let i = 0; i < n; i++) { const t = (i + .8) / (n + .6); b.o('spikes', t, 0, { hw: 5, hd: .5 }).c(3, 0, t - .09, t + .09, 0, 1.8); } },
    spin(b, n) { n = n || 1; b.p(16 * n + 6, { w: 7 }); for (let i = 0; i < n; i++) { const t = (i + .8) / (n + .6); b.o('spinner', t, 0, { spd: i % 2 ? -1.7 : 1.6 }).c(3, 0, t - .09, t + .09, 0, 1.8); } },
    smash(b) { b.p(28, { w: 7 }).w('giant', .08, 0).o('block', .32, -.75).o('block', .32, .75).o('bumper', .5, 0).o('block', .68, 0).o('block', .88, -.75).o('block', .88, .75).c(8, 0, .22, .95); },
    fork(b, l, r, len) { b.p(10, { w: 11 }).c(3, -.55, .3, .9).c(3, .55, .3, .9); b.fork(len || 40); B[l](b, -1); B[r](b, 1); b.p(10, { w: 11 }).c(3); },
    // a bonus track beside the main one: jump across to get in, it curves back by itself
    sideLane(b, sd, type, pw) {
      b.p(14).c(3); b.lane(sd, 'run', { t0: .3 }).c(4);
      b.p(16).o(type, .3, -sd * .3).o(type, .78, sd * .2, { d: 1 }); b.lane(sd, 'run').c(6).w(pw || 'magnet', .5, 0);
      b.p(14).c(3, -sd * .5); b.lane(sd, 'out').c(4, 0, .1, .6);
    },
    // a side road that peels off and skips the jumps
    bypass(b, sd) {
      b.p(14).c(3, -sd * .4); b.lane(sd, 'in');
      for (let i = 0; i < 2; i++) { b.g(3).c(3); b.lane(sd, 'run'); b.p(12).c(4); b.lane(sd, 'run').c(2); }
      b.g(3).c(3); b.lane(sd, 'run'); b.p(14).c(3, -sd * .4); b.lane(sd, 'out');
    }
  };
  const TH = (sky, a, b, side) => ({ sky, a, b, side });
  const LEVELS = [
    { name: 'First Roll', theme: TH(0x8fd3ff, 0x5ecb6b, 0x4fb85d, 0x2f7d3c), seq: [
      ['hint', 'Slide your finger left and right to steer!'], ['start'], ['curves', 3], ['zig'], ['hint', 'Tap JUMP to hop over the gap!'], ['hops', 2, 2.5],
      ['power', 'magnet'], ['curves', 2], ['hill'], ['hint', 'Pick a path! Left or right?'], ['fork', 'safe', 'coins'], ['boostJump', 5, 2], ['line'], ['zig'], ['padJump', 6]] },
    { name: 'Hop Hop', theme: TH(0x7fe0e0, 0xffd166, 0xf4b942, 0xc98a2b), seq: [
      ['start'], ['slalom', 'block', 3], ['hops', 3], ['power', 'shield'], ['steps', 2], ['narrow'], ['hint', 'Jump sideways onto the bonus track!'], ['sideLane', 1, 'block'],
      ['boostJump'], ['fork', 'hops', 'blocks'], ['zig'], ['hops', 2, 3.5], ['curves', 2], ['padJump']] },
    { name: 'Bumper Park', theme: TH(0xffc6e0, 0xff8fb8, 0xff7aa8, 0xc44f7d), seq: [
      ['start'], ['field', 'bumper'], ['curves', 3], ['hops', 2], ['power', 'magnet'], ['fork', 'boost', 'bumpers'], ['slalom', 'bumper', 3], ['hint', 'The side road skips the jumps!'], ['bypass', -1],
      ['boostJump'], ['down'], ['field', 'bumper'], ['hill'], ['sideLane', -1, 'bumper', 'shield'], ['zig'], ['padJump', 7.5]] },
    { name: 'Spiky Path', theme: TH(0xffb37a, 0xb58cff, 0xa279f5, 0x6b4fb0), seq: [
      ['hint', 'Red spikes pop your marble. Steer around or jump!'], ['slalom', 'spikes', 3], ['power', 'shield'], ['hint', 'Jump over the spike strip!'], ['strips', 2], ['narrow'], ['hops', 3],
      ['fork', 'spikes', 'safe'], ['boostJump', 6, 3], ['slalom', 'spikes', 4], ['sideLane', 1, 'spikes'], ['steps', 3], ['strips', 3], ['curves', 2], ['padJump', 8]] },
    { name: 'Sky Bridges', theme: TH(0xa9c9ff, 0xffffff, 0xcfdcf5, 0x9fb3d9), seq: [
      ['start'], ['slalom', 'slider', 2], ['hint', 'This bridge slides. Ride it across!'], ['movers', 1], ['power', 'magnet'], ['narrow'], ['fork', 'high', 'coins'], ['movers', 2],
      ['boostJump', 6.5, 3], ['bypass', 1], ['slalom', 'slider', 3], ['hill'], ['sideLane', -1, 'block', 'shield'], ['movers', 2], ['zig'], ['padJump', 8]] },
    { name: 'Spinner City', theme: TH(0x2b2f6b, 0x4dd6d0, 0x3fc2bc, 0x1f7f7b), seq: [
      ['start'], ['hint', 'Jump over the spinning bar!'], ['spin', 1], ['curves', 2], ['smash'], ['hops', 3], ['fork', 'high', 'blocks'], ['spin', 2], ['narrow'],
      ['boostJump', 6.5, 3], ['power', 'shield'], ['slalom', 'slider', 3], ['sideLane', 1, 'bumper'], ['spin', 2], ['movers', 1], ['steps', 2], ['padJump', 8.5]] },
    { name: 'Saw Valley', theme: TH(0x47223a, 0xff9d4d, 0xf58a36, 0x9c4a12), seq: [
      ['hint', 'Watch out for the rolling saws!'], ['slalom', 'saw', 2], ['down'], ['power', 'shield'], ['hops', 3], ['fork', 'saws', 'safe'], ['down'], ['boostJump', 7, 3.5],
      ['smash'], ['movers', 2], ['bypass', -1], ['slalom', 'saw', 3], ['down'], ['strips', 2], ['sideLane', 1, 'saw'], ['curves', 2], ['padJump', 8.5]] },
    { name: 'Candy Canyon', theme: TH(0xbff0d4, 0xff6fa5, 0xffffff, 0xb93c6e), seq: [
      ['start'], ['field', 'bumper'], ['steps', 3], ['fork', 'hops', 'boost'], ['slalom', 'spikes', 3], ['power', 'magnet'], ['curves', 3, 4.6], ['boostJump', 7, 3],
      ['spin', 1], ['bypass', 1], ['down'], ['slalom', 'slider', 3], ['sideLane', -1, 'spikes', 'shield'], ['movers', 2], ['fork', 'bumpers', 'high'], ['strips', 2], ['padJump', 8.5]] },
    { name: 'Frosty Peaks', theme: TH(0xd8f1ff, 0x8fd8ff, 0xffffff, 0x4d8fc4), seq: [
      ['start'], ['hill'], ['slalom', 'block', 4], ['hops', 4], ['power', 'shield'], ['fork', 'saws', 'hops'], ['narrow'], ['steps', 3], ['down'], ['down'], ['boostJump', 7.5, 3.5],
      ['spin', 2], ['sideLane', 1, 'saw'], ['movers', 3], ['strips', 3], ['bypass', -1], ['smash'], ['curves', 3, 4.6], ['padJump', 9]] },
    { name: 'Jungle Jump', theme: TH(0x9be8a0, 0xc98a4b, 0xb87a3d, 0x6e4520), seq: [
      ['start'], ['hops', 4, 3.5], ['slalom', 'saw', 3], ['fork', 'high', 'spikes'], ['steps', 4], ['power', 'magnet'], ['field', 'bumper'], ['movers', 3], ['boostJump', 7.5, 3],
      ['sideLane', -1, 'spikes', 'giant'], ['smash'], ['narrow'], ['strips', 3], ['bypass', 1], ['spin', 2], ['down'], ['fork', 'hops', 'saws'], ['slalom', 'slider', 4], ['padJump', 9]] },
    { name: 'Lava Leap', theme: TH(0x3a1420, 0xff6a3d, 0xffb03d, 0x8f2a12), seq: [
      ['start'], ['slalom', 'spikes', 4], ['hops', 4, 3.5], ['power', 'shield'], ['spin', 2], ['fork', 'saws', 'bumpers'], ['movers', 3], ['steps', 3], ['boostJump', 8, 3.5],
      ['strips', 3], ['sideLane', 1, 'saw', 'giant'], ['narrow'], ['slalom', 'saw', 4], ['down'], ['bypass', -1], ['field', 'bumper'], ['fork', 'hops', 'high'], ['spin', 2], ['curves', 3, 4.6], ['padJump', 9.5]] },
    { name: 'Grand Finale', theme: TH(0x14122e, 0xffe14d, 0xf7d234, 0xa8860f), seq: [
      ['start'], ['slalom', 'block', 4], ['hops', 4, 3.5], ['spin', 2], ['fork', 'spikes', 'hops'], ['power', 'magnet'], ['movers', 3], ['boostJump', 8, 3.5], ['smash'],
      ['sideLane', -1, 'saw', 'shield'], ['strips', 3], ['steps', 4], ['slalom', 'saw', 4], ['fork', 'high', 'saws'], ['down'], ['bypass', 1], ['field', 'bumper'], ['narrow'],
      ['slalom', 'slider', 4], ['movers', 2], ['boostJump', 8, 3], ['sideLane', 1, 'spikes', 'giant'], ['spin', 2], ['fork', 'boost', 'bumpers'], ['padJump', 10]] }
  ];

  function build(idx, d) {
    const def = LEVELS[idx], D = DIFFS[d];
    const L = { idx, d, D, name: def.name, theme: def.theme, pieces: [], sides: [], obs: [], items: [], pads: [], checks: [], hints: [], coinTotal: 0, finishS: 0 };
    let s = 0, cx = 0, y = 0, cur = null, wantCk = false, lastCk = 0;
    const lane = (p, xf) => xf * (p.w / 2 - 0.8);
    const at = (t, xf) => { const ss = cur.s0 + t * cur.len; return { s: ss, x: cxBase(cur, ss) + lane(cur, xf || 0), y: yAt(cur, ss) }; };
    const b = {
      d, main: null,
      p(len, o) {
        o = o || {};
        cur = { kind: 'p', s0: s, s1: s + len, len, cx0: cx, cx1: cx + (o.dx || 0), y0: y, y1: y + (o.dy || 0), w: (o.w || 6) * D.width, rail: d <= (o.rail || 0), move: null, sides: [] };
        cur.railL = cur.railR = cur.rail;
        if (o.move) cur.move = { amp: o.move[0] * (d === 0 ? 0.5 : 1), spd: o.move[1] * D.spd, ph: o.move[2] || 0 };
        L.pieces.push(cur); b.main = cur; s += len; cx = cur.cx1; y = cur.y1;
        if (wantCk && !o.move && !o.dy) { wantCk = false; lastCk = cur.s0; L.checks.push({ s: cur.s0 + 1.5, x: cur.cx0, y: cur.y0, w: cur.w, hit: false }); }
        return b;
      },
      g(len, o) {
        o = o || {}; len *= D.gap * (len < 5 ? 1.6 : 1.3);
        cur = { kind: 'gap', s0: s, s1: s + len, len, cx0: cx, cx1: cx, y0: y, y1: y + (o.dy || 0), w: b.main ? b.main.w : 6, rail: false, move: null, sides: [] };
        L.pieces.push(cur); b.main = cur; s += len; y = cur.y1; return b;
      },
      fork(len) {
        cur = { kind: 'gap', void: true, s0: s, s1: s + len, len, cx0: cx, cx1: cx, y0: y, y1: y, w: 11 * D.width, rail: false, move: null, sides: [] };
        L.pieces.push(cur); b.main = cur; s += len; return b;
      },
      sp(off0, off1, o) {
        const par = b.main, t0 = o.t0 || 0, t1 = o.t1 == null ? 1 : o.t1, yo0 = o.y0 || 0;
        cur = { kind: 'p', par, s0: par.s0 + t0 * par.len, s1: par.s0 + t1 * par.len, off0, off1, yo0, yo1: o.y1 == null ? yo0 : o.y1, w: o.w, rail: d <= (o.rail || 0), move: null };
        cur.len = cur.s1 - cur.s0; cur.railL = cur.railR = cur.rail; par.sides.push(cur); L.sides.push(cur); return b;
      },
      br(sd, o) { const M = b.main.w, off = sd * (M / 4 + 0.5); return b.sp(off, off, Object.assign({ w: M / 2 - 1 }, o || {})); },
      lane(sd, mode, o) {
        const m = b.main, w = 3.8 * D.width, far = sd * (m.w / 2 + 1.3 + w / 2), near = sd * (m.w / 2 - w / 2);
        b.sp(mode === 'in' ? near : far, mode === 'out' ? near : far, Object.assign({ w }, o || {}));
        cur.wall = sd; // the outer edge always has a wall, so a sideways jump cannot overshoot
        if (sd > 0) { m.railR = false; cur.railL = false; cur.railR = true; } else { m.railL = false; cur.railR = false; cur.railL = true; }
        return b;
      },
      c(n, x, t0, t1, x1, h) {
        const gap = cur.kind === 'gap';
        x = x || 0; if (t0 == null) t0 = gap ? 0.1 : 0.15; if (t1 == null) t1 = gap ? 0.9 : 0.85; if (x1 == null) x1 = x; if (h == null) h = gap ? 2.4 : 0;
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
      boost(t) { const pos = at(t, 0); L.pads.push({ type: 'boost', s: pos.s, x: pos.x, y: pos.y, w: cur.w, slope: slopeOf(cur), last: -9 }); return b; },
      jpad(t) { const pos = at(t, 0); L.pads.push({ type: 'jpad', s: pos.s, x: pos.x, y: pos.y, w: cur.w, slope: 0, last: -9 }); return b; },
      hint(txt, t) { L.hints.push({ s: cur.s0 + (t || 0) * cur.len, txt, shown: false }); return b; },
      end() { b.p(30, { rail: 2 }); L.finishS = cur.s0 + 9; L.finishW = cur.w; L.finishX = cur.cx0; L.finishY = cur.y0; return b; }
    };
    for (const sec of def.seq) { if (s - lastCk >= 45) wantCk = true; S[sec[0]].apply(null, [b].concat(sec.slice(1))); }
    b.end();
    L.pieces.forEach((p, i) => {
      p.i = i;
      if (p.kind === 'gap' && !p.void) { const a = L.pieces[i - 1], n = L.pieces[i + 1]; p.w = Math.min(a.w, n.w); p.cx1 = n.cx0; }
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

  // every platform (main track, branches, side tracks) under this spot; picks the highest one the ball can stand on
  function ground(L, x, s, t, foot) {
    const p = pieceAt(L, s); let gy = -1e9, slope = 0, gp = null;
    if (p.kind === 'p' && Math.abs(x - cxAt(p, s, t)) <= p.w / 2 + 0.2) { const yy = yAt(p, s); if (foot >= yy - 0.7) { gy = yy; slope = slopeOf(p); gp = p; } }
    for (const q of p.sides) {
      if (s < q.s0 || s > q.s1 || Math.abs(x - cxBase(q, s)) > q.w / 2 + 0.2) continue;
      const yy = yAt(q, s); if (foot >= yy - 0.7 && yy > gy) { gy = yy; slope = slopeOf(q); gp = q; }
    }
    for (const o of L.obs) {
      if (o.dead || o.type !== 'block') continue;
      if (Math.abs(o.s - s) <= o.hd + 0.25 && Math.abs(o.x - x) <= o.hw + 0.25) { const top = o.y + o.h; if (foot >= top - 0.4 && top > gy) { gy = top; slope = 0; gp = null; } }
    }
    return gy > -1e8 ? { y: gy, slope, p: gp } : null;
  }

  // lateral extents [left, right, height] of the platforms at s that the ball is not underneath
  function intervals(L, s, t, foot, merge) {
    const p = pieceAt(L, s), out = [];
    if (p.kind === 'p') { const c = cxAt(p, s, t), yy = yAt(p, s); if (foot > yy - 0.7) out.push([c - p.w / 2, c + p.w / 2, yy]); }
    for (const q of p.sides) { if (s < q.s0 || s > q.s1) continue; const c = cxBase(q, s), yy = yAt(q, s); if (foot > yy - 0.7) out.push([c - q.w / 2, c + q.w / 2, yy]); }
    out.sort((a, b) => a[0] - b[0]);
    if (!merge) return out;
    const m = [];
    for (const iv of out) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + 0.05) { l[1] = Math.max(l[1], iv[1]); l[2] = Math.min(l[2], iv[2]); } else m.push(iv.slice()); }
    return m;
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

    const p = pieceAt(L, st.s);
    let base = p.kind === 'p' ? yAt(p, st.s) : 1e9;
    for (const q of p.sides) if (st.s >= q.s0 && st.s <= q.s1) base = Math.min(base, yAt(q, st.s));
    if (base > 1e8) base = yAt(p, st.s);
    if (L.d === 0) {
      // Easy: invisible walls. The ball is kept over the nearest platform unless it is jumping towards a neighbouring one.
      const iv = intervals(L, st.s, t, foot, true); let a, b2, ok = true;
      if (iv.length) {
        let near = iv[0], nd = 1e9;
        for (const v of iv) { const dd = st.x < v[0] ? v[0] - st.x : st.x > v[1] ? st.x - v[1] : 0; if (dd < nd) { nd = dd; near = v; } }
        a = near[0]; b2 = near[1];
        if (foot > near[2] + 1 && Math.abs(inp.steer) > 0.3) for (const v of iv) { if (v === near) continue; if (inp.steer > 0 ? (v[0] > b2 - 0.01 && v[0] - b2 < 4.5) : (v[1] < a + 0.01 && a - v[1] < 4.5)) ok = false; }
      } else if (!p.void && foot > base - 0.7) { const c = cxAt(p, st.s, t); a = c - p.w / 2; b2 = c + p.w / 2; } else ok = false;
      if (ok) {
        const lo = a + r + 0.15, hi = Math.max(lo, b2 - r - 0.15), m = 12 * dt;
        if (st.x > hi) { st.x = Math.max(hi, st.x - Math.max(m, st.x - hi - 1.5)); if (st.vx > 0) st.vx = 0; }
        if (st.x < lo) { st.x = Math.min(lo, st.x + Math.max(m, lo - st.x - 1.5)); if (st.vx < 0) st.vx = 0; }
      }
    } else if (st.grounded && st.gp && st.gp.rail) {
      const q = st.gp, c = cxAt(q, st.s, t), lim = Math.max(0.1, q.w / 2 - r - 0.15);
      if (q.railR && st.x > c + lim) { st.x = c + lim; if (st.vx > 0) st.vx = 0; }
      if (q.railL && st.x < c - lim) { st.x = c - lim; if (st.vx < 0) st.vx = 0; }
    }
    for (const q of p.sides) {
      if (!q.wall || st.s < q.s0 || st.s > q.s1) continue;
      const yy = yAt(q, st.s); if (foot < yy - 0.7 || foot > yy + 4.5) continue;
      const c = cxBase(q, st.s), lim = q.w / 2 - r - 0.15, rel = (st.x - c) * q.wall;
      if (rel > lim && rel < lim + 2.5) { st.x = c + q.wall * lim; if (st.vx * q.wall > 0) st.vx = 0; }
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
      if (Math.abs(st.x - pd.x) > pd.w / 2 + 0.3 || Math.abs(foot - pd.y) > 0.8) continue;
      if (pd.type === 'boost' && Math.abs(st.s - pd.s) < 1.2) { pd.last = t; st.boostT = 2.6; st.ev.push(['boost']); }
      if (pd.type === 'jpad' && Math.abs(st.s - pd.s) < 0.8) { pd.last = t; st.vy = PADJUMP; st.boostT = Math.max(st.boostT, 1.2); st.grounded = false; st.coyote = 0; st.ev.push(['pad']); }
    }
    for (const c of L.checks) if (!c.hit && st.s >= c.s) { c.hit = true; st.check = c; st.ev.push(['check', c]); }
    for (const h of L.hints) if (!h.shown && st.s >= h.s) { h.shown = true; st.ev.push(['hint', h.txt]); }
    if (!st.done && st.s >= L.finishS) { st.done = true; st.ev.push(['finish']); }
  }

  const api = { R, DIFFS, LEVELS, build, newState, step, ground, intervals, slopeOf, pieceAt, cxAt, cxBase, yAt, moveOff, obX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MarbleCore = api;
})(typeof self !== 'undefined' ? self : this);
