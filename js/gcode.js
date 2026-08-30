/* =====================================================================
   gcode.js — G-code parser + 5-axis motion executor + demo program.
   Pure logic, decoupled from THREE. Hooks are supplied by app.js:
     onTarget(pos)        pos = {x,y,z,c,a}  machine coords (mm/deg)
     onLine(i)            current program line index (for highlight)
     onLaser(on)          M3/M4 (true) / M5 (false)
     onTool(t)            M6 T#
     onFeed(f)            current F (mm/min)
     onMsg(s)             status text (M0, warnings)
     onDone()             program end (M2/M30 or last block)
   Supported: G0 G1 G2 G3 G4 G17 G20 G21 G28 G54 G90 G91 G92
              M0 M2 M3 M4 M5 M6 M30 · F S T · A C words · ; and () comments
   ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // PARSER
  // ------------------------------------------------------------------
  const RAPID_RATE = 9000;          // mm/min for G0

  function stripComments(src) {
    return src
      .replace(/\([^)]*\)/g, ' ')   // ( ... )
      .replace(/;.*$/gm, ' ');      // ; ...
  }

  function parse(text) {
    const rawLines = text.replace(/\r/g, '').split('\n');
    const blocks = [];
    const modal = { motion: 0, abs: true, unit: 21, feed: 1200 };
    const off = { x: 0, y: 0, z: 0 };

    function toMachine(axis, val) {  // applies units + offsets
      let v = val;
      if (modal.unit === 20) v *= 25.4;
      if (axis in off) v += off[axis];
      return v;
    }

    rawLines.forEach((raw, li) => {
      const clean = stripComments(raw).trim();
      if (!clean) return;
      const words = [];
      const re = /([A-Za-z])\s*([-+]?\d*\.?\d+)/g;
      let m, ok = false;
      while ((m = re.exec(clean)) !== null) {
        words.push([m[1].toUpperCase(), parseFloat(m[2])]);
        ok = true;
      }
      if (!ok) return;

      let motionThis = null;                    // G word on this line
      const params = {};
      for (const [L, V] of words) {
        if (L === 'G') {
          const g = Math.round(V);
          if ([0, 1, 2, 3].includes(g)) { modal.motion = g; motionThis = g; }
          else if (g === 17) { /* XY plane (only plane) */ }
          else if (g === 20) modal.unit = 20;
          else if (g === 21) modal.unit = 21;
          else if (g === 90) modal.abs = true;
          else if (g === 91) modal.abs = false;
          else if (g === 54) { /* default WCS */ }
          else if (g === 28) blocks.push({ kind: 'home', line: li });
          else blocks.push({ kind: 'msg', text: 'G' + g + ' ignored', line: li });
        } else if (L === 'M') {
          params.M = Math.round(V);
        } else {
          params[L] = V;
        }
      }

      if (params.F !== undefined) {
        modal.feed = params.F * (modal.unit === 20 ? 25.4 : 1);
        blocks.push({ kind: 'feed', f: modal.feed, line: li });
      }
      if (params.M !== undefined) {
        const Mw = params.M;
        if (Mw === 3 || Mw === 4) blocks.push({ kind: 'laser', on: true, line: li });
        else if (Mw === 5) blocks.push({ kind: 'laser', on: false, line: li });
        else if (Mw === 6) blocks.push({ kind: 'tool', t: Math.round(params.T || 1), line: li });
        else if (Mw === 0) blocks.push({ kind: 'm0', line: li });
        else if (Mw === 2 || Mw === 30) { blocks.push({ kind: 'end', line: li }); return; }
        else if (Mw === 8 || Mw === 9) { /* coolant n/a */ }
      }
      if (params.T !== undefined && params.M === undefined)
        blocks.push({ kind: 'tool', t: Math.round(params.T), line: li });

      if (params.G !== undefined && Math.round(params.G) === 4) {
        blocks.push({ kind: 'dwell', sec: (params.P || params.X || 0), line: li });
        return;
      }
      if (params.G !== undefined && Math.round(params.G) === 92) {
        ['x', 'y', 'z'].forEach(ax => {
          if (params[ax.toUpperCase()] !== undefined)
            off[ax] = 0; // simplified: caller's current pos becomes this value
        });
        blocks.push({ kind: 'msg', text: 'G92 applied (simplified)', line: li });
        return;
      }

      const hasAxis = ['X', 'Y', 'Z', 'A', 'C', 'I', 'J', 'R'].some(k => params[k] !== undefined);
      if (motionThis === null && !hasAxis) return;
      if (!hasAxis) return;

      const mk = (ax) => {
        if (params[ax.toUpperCase()] === undefined) return null;
        const v = toMachine(ax, params[ax.toUpperCase()]);
        return modal.abs ? v : null;   // incremental resolved at exec time
      };
      const blk = {
        kind: motionThis === 0 ? 'rapid' : (motionThis === 1 ? 'linear' : 'arc'),
        cw: motionThis === 2,
        abs: modal.abs,
        x: params.X !== undefined ? { v: toMachine('x', params.X), abs: modal.abs } : null,
        y: params.Y !== undefined ? { v: toMachine('y', params.Y), abs: modal.abs } : null,
        z: params.Z !== undefined ? { v: toMachine('z', params.Z), abs: modal.abs } : null,
        a: params.A !== undefined ? params.A : null,
        c: params.C !== undefined ? params.C : null,
        i: params.I || 0, j: params.J || 0,
        r: params.R !== undefined ? params.R * (modal.unit === 20 ? 25.4 : 1) : null,
        f: modal.feed,
        line: li
      };
      blocks.push(blk);
    });

    if (!blocks.length || blocks[blocks.length - 1].kind !== 'end')
      blocks.push({ kind: 'end', line: rawLines.length - 1 });
    return { lines: rawLines, blocks };
  }

  // ------------------------------------------------------------------
  // RUNNER
  // ------------------------------------------------------------------
  function Runner() {
    this.prog = null;
    this.idx = 0;
    this.pos = { x: 0, y: 0, z: 100, c: 0, a: 0 };
    this.tMove = 0;
    this.running = false;
    this.paused = false;
    this.done = true;
    this.speed = 1;
    this.feed = 0;
    this.m0Wait = false;
    this.hooks = {};
  }

  Runner.prototype = {
    load(prog) {
      this.prog = prog;
      this.idx = 0; this.done = false; this.running = false; this.paused = false;
      this.tMove = 0; this.m0Wait = false;
      if (this.hooks.onLine) this.hooks.onLine(0);
    },
    play(startPos) {
      if (!this.prog || this.done) return;
      if (this.m0Wait) { this.m0Wait = false; this.paused = false; if (this.hooks.onMsg) this.hooks.onMsg('M0 resumed'); return; }
      if (startPos) this.pos = Object.assign({}, startPos);
      this.running = true; this.paused = false;
    },
    pause() { if (this.running) this.paused = true; },
    stop() {
      this.running = false; this.paused = false; this.done = true; this.idx = 0; this.tMove = 0;
      if (this.hooks.onLaser) this.hooks.onLaser(false);
      if (this.hooks.onMsg) this.hooks.onMsg('');
    },
    progress() {
      if (!this.prog || !this.prog.blocks.length) return 0;
      return this.idx / this.prog.blocks.length;
    },

    _target(blk) {
      const p = this.pos, t = Object.assign({}, p);
      ['x', 'y', 'z'].forEach(ax => {
        if (blk[ax]) t[ax] = blk[ax].abs ? blk[ax].v : p[ax] + blk[ax].v;
      });
      if (blk.a !== null) t.a = blk.abs ? blk.a : p.a + blk.a;
      if (blk.c !== null) t.c = blk.abs ? blk.c : p.c + blk.c;
      return t;
    },

    _dur(blk, t) {
      const p = this.pos;
      if (blk.kind === 'dwell') return Math.max(0.001, blk.sec);
      const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      const lin = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const rot = Math.max(Math.abs(t.a - p.a), Math.abs(t.c - p.c)) * 2;
      let dist;
      if (blk.kind === 'arc') {
        const r = this._arcRadius(blk, t);
        dist = Math.max(r.len, 0.01) + 0;   // arc length already incl. helix
      } else {
        dist = Math.max(lin, rot, 0.01);
      }
      const rate = blk.kind === 'rapid' ? RAPID_RATE : (blk.f || 1200);
      this.feed = rate;
      return Math.max(0.001, dist / rate * 60);
    },

    _arc(blk, t) {
      // returns {cx, cy, a0, da, r}
      const p = this.pos;
      let cx, cy;
      if (blk.r !== null) {
        const sx = p.x, sy = p.y, ex = t.x, ey = t.y;
        const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy);
        const rr = Math.abs(blk.r);
        const h = Math.sqrt(Math.max(0, rr * rr - d * d / 4));
        const ux = dx / (d || 1), uy = dy / (d || 1);
        const sgn = blk.cw ? 1 : -1;                 // CW minor: center right of path
        if (blk.r > 0) { cx = (sx + ex) / 2 + sgn * h * uy; cy = (sy + ey) / 2 - sgn * h * ux; }
        else { cx = (sx + ex) / 2 - sgn * h * uy; cy = (sy + ey) / 2 + sgn * h * ux; }
      } else {
        cx = p.x + blk.i; cy = p.y + blk.j;
      }
      const r = Math.hypot(p.x - cx, p.y - cy);
      const a0 = Math.atan2(p.y - cy, p.x - cx);
      let a1 = Math.atan2(t.y - cy, t.x - cx);
      let da = a1 - a0;
      if (blk.cw) { if (da >= -1e-9) da -= Math.PI * 2; }
      else { if (da <= 1e-9) da += Math.PI * 2; }
      return { cx, cy, a0, da, r };
    },

    _arcRadius(blk, t) {
      const a = this._arc(blk, t);
      const dz = t.z - this.pos.z;
      const len = Math.hypot(Math.abs(a.da) * a.r, dz);
      return { len, ...a };
    },

    update(dt) {
      if (!this.running || this.paused || this.done || !this.prog) return;
      let adv = dt * this.speed;
      let guard = 0;

      while (adv > 0 && guard++ < 500) {
        const blocks = this.prog.blocks;
        if (this.idx >= blocks.length) { this._finish(); return; }
        const blk = blocks[this.idx];

        // instantaneous blocks
        if (blk.kind === 'laser') { if (this.hooks.onLaser) this.hooks.onLaser(blk.on); }
        else if (blk.kind === 'tool') { if (this.hooks.onTool) this.hooks.onTool(blk.t); }
        else if (blk.kind === 'feed') { if (this.hooks.onFeed) this.hooks.onFeed(blk.f); }
        else if (blk.kind === 'msg') { if (this.hooks.onMsg) this.hooks.onMsg(blk.text); }
        else if (blk.kind === 'm0') {
          this.m0Wait = true; this.paused = true;
          if (this.hooks.onMsg) this.hooks.onMsg('M0 — program stop, press START');
          if (this.hooks.onLine) this.hooks.onLine(blk.line);
          return;
        }
        else if (blk.kind === 'end') { this._finish(blk.line); return; }
        else if (blk.kind === 'home') {
          this.pos = { x: 0, y: 0, z: 100, c: 0, a: 0 };
          if (this.hooks.onTarget) this.hooks.onTarget(this.pos);
          if (this.hooks.onLine) this.hooks.onLine(blk.line);
        }
        else if (blk.kind === 'rapid' || blk.kind === 'linear' || blk.kind === 'arc') {
          const t = this._target(blk);
          const dur = this._dur(blk, t);
          if (this.tMove === 0 && this.hooks.onLine) this.hooks.onLine(blk.line);
          this.tMove += adv;
          const u = Math.min(1, this.tMove / dur);
          const p = this.pos;
          const q = { x: p.x, y: p.y, z: p.z, c: p.c, a: p.a };

          if (blk.kind === 'arc') {
            const a = this._arc(blk, t);
            const ang = a.a0 + a.da * u;
            q.x = a.cx + Math.cos(ang) * a.r;
            q.y = a.cy + Math.sin(ang) * a.r;
            q.z = p.z + (t.z - p.z) * u;
            q.c = p.c + (t.c - p.c) * u;
            q.a = p.a + (t.a - p.a) * u;
          } else {
            ['x', 'y', 'z', 'c', 'a'].forEach(ax => { q[ax] = p[ax] + (t[ax] - p[ax]) * u; });
          }
          this._emit(q);
          if (this.hooks.onFeed) this.hooks.onFeed(blk.kind === 'rapid' ? RAPID_RATE : (blk.f || 1200));

          if (this.tMove >= dur) {
            this.pos = t;
            this.tMove = 0;
            this.idx++;
            adv -= (dur - 0);
          } else {
            adv = 0;
          }
          continue;
        }

        // non-motion block consumed
        this.idx++; this.tMove = 0;
      }
    },

    _emit(q) {
      // clamp to machine limits through hook target
      if (this.hooks.onTarget) this.hooks.onTarget(q);
    },

    _finish(line) {
      this.running = false; this.done = true; this.idx = 0; this.tMove = 0;
      if (this.hooks.onLaser) this.hooks.onLaser(false);
      if (this.hooks.onLine && line !== undefined) this.hooks.onLine(line);
      if (this.hooks.onDone) this.hooks.onDone();
    }
  };

  // ------------------------------------------------------------------
  // DEMO PROGRAM — weld a 2D window-frame grid 1200 x 800 (like the photo)
  // Tubes 40x40, top face at Z=41. 3x3 cells.
  // ------------------------------------------------------------------
  function demoFrameGcode() {
    const L = [];
    const push = (s) => L.push(s);
    const zW = 41, zHop = 70;

    push('; =====================================================');
    push('; DEMO : LASER WELD 2D WINDOW FRAME  1200 x 800 mm');
    push('; 40x40 square tubes - 3x3 grid (corner + T + cross joints)');
    push('; Tool  : T1 hand-held laser welding gun (Gweike type)');
    push('; Fields: G21 mm / G90 abs / workpiece top surface Z=40');
    push('; =====================================================');
    push('G21 G90 G17 G54            (mm, absolute, XY plane)');
    push('T1 M6                      (mount laser welding gun)');
    push('G0 X0 Y0 Z100              (safe height)');
    push('');

    const weldPass = (x1, y1, x2, y2, tag) => {
      push(`; --- ${tag}`);
      push(`G0 X${f(x1)} Y${f(y1)} Z${zHop}`);
      push(`G1 X${f(x1)} Y${f(y1)} Z${zW} F2500     (plunge to seam)`);
      push('M3 S100                    (laser ON)');
      push(`G1 X${f(x2)} Y${f(y2)} Z${zW} F1500     (weld)`);
      push('M5                         (laser OFF)');
      push(`G0 Z${zHop}`);
    };
    const CORNER = 45, ACROSS = 45;

    push('; ============ OUTER CORNERS (L-welds) ============');
    weldPass(-600 + CORNER, 400, -600, 400, 'corner TL top rail');
    weldPass(-600, 400 - CORNER, -600, 400, 'corner TL side rail');
    weldPass(600 - CORNER, 400, 600, 400, 'corner TR top rail');
    weldPass(600, 400 - CORNER, 600, 400, 'corner TR side rail');
    weldPass(-600 + CORNER, -400, -600, -400, 'corner BL top rail');
    weldPass(-600, -400 + CORNER, -600, -400, 'corner BL side rail');
    weldPass(600 - CORNER, -400, 600, -400, 'corner BR top rail');
    weldPass(600, -400 + CORNER, 600, -400, 'corner BR side rail');

    push('; ============ VERTICALS -> TOP/BOTTOM RAILS (T-welds) ============');
    [-200, 200].forEach(vx => {
      weldPass(vx - ACROSS, 400, vx + ACROSS, 400, `vertical X${vx} to top rail`);
      weldPass(vx - ACROSS, -400, vx + ACROSS, -400, `vertical X${vx} to bottom rail`);
    });

    push('; ============ HORIZONTALS -> SIDE RAILS (T-welds) ============');
    [-400 / 3, 400 / 3].forEach(hy => {
      weldPass(-600, hy - ACROSS, -600, hy + ACROSS, `horizontal Y${Math.round(hy)} to left rail`);
      weldPass(600, hy - ACROSS, 600, hy + ACROSS, `horizontal Y${Math.round(hy)} to right rail`);
    });

    push('; ============ CROSS JOINTS (4 fillet passes each) ============');
    [-200, 200].forEach(vx => {
      [-400 / 3, 400 / 3].forEach(hy => {
        push(`; --- cross joint X${vx} / Y${Math.round(hy)}`);
        weldPass(vx - ACROSS, hy, vx + ACROSS, hy, 'cross X-pass');
        weldPass(vx, hy - ACROSS, vx, hy + ACROSS, 'cross Y-pass');
      });
    });

    push('');
    push('; ============ DONE ============');
    push('G0 X0 Y0 Z100');
    push('M5');
    push('M30                        (program end)');
    return L.join('\n');

    function f(n) {
      const s = (Math.round(n * 100) / 100).toString();
      return s;
    }
  }

  // ------------------------------------------------------------------
  window.Sim = window.Sim || {};
  window.Sim.GCode = { parse, Runner, demoFrameGcode, RAPID_RATE };
})();
