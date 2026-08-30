/* =====================================================================
   app.js — UI wiring: joysticks, DRO, keyboard jog, G-code panel,
   program runner hooks, weld bead deposition, camera & tool controls.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // boot 3D
  // ------------------------------------------------------------------
  Sim.init($('viewport'));

  const runner = new Sim.GCode.Runner();
  let program = null;               // parsed program
  let runningMode = false;          // program running (locks jog)
  let simSpeedMul = 6;
  let jogSpeed = 80;                // mm/s
  let laserPwr = 0.7;

  // ------------------------------------------------------------------
  // toast / alarm
  // ------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('bigtoast');
    t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = 0; }, ms || 1800);
  }
  let alarmTimer = null;
  function alarm(msg) {
    const a = $('alarm');
    a.textContent = '⚠ ' + msg; a.style.display = 'block';
    clearTimeout(alarmTimer);
    alarmTimer = setTimeout(() => { a.style.display = 'none'; }, 2500);
  }

  // ------------------------------------------------------------------
  // joysticks
  // ------------------------------------------------------------------
  function drawXYJoy(cv, nx, ny) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W / 2 - 8;
    g.clearRect(0, 0, W, H);
    // base
    const grad = g.createRadialGradient(cx, cy, 4, cx, cy, R);
    grad.addColorStop(0, '#1d2434'); grad.addColorStop(1, '#141926');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a3348'; g.lineWidth = 2; g.stroke();
    // cross + rings
    g.strokeStyle = '#26304a'; g.lineWidth = 1;
    [0.33, 0.66].forEach(k => { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); });
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    // axis labels
    g.fillStyle = '#5b6880'; g.font = '10px monospace'; g.textAlign = 'center';
    g.fillText('+Y', cx, cy - R + 12); g.fillText('-Y', cx, cy + R - 5);
    g.fillText('-X', cx - R + 12, cy + 3); g.fillText('+X', cx + R - 12, cy + 3);
    // nub
    const px = cx + nx * (R - 16), py = cy + ny * (R - 16);
    g.fillStyle = nx || ny ? '#ffb020' : '#3b4a6b';
    g.beginPath(); g.arc(px, py, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0d0f13'; g.lineWidth = 2; g.stroke();
  }

  function drawZJoy(cv, ny) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#141926'; g.fillRect(4, 4, W - 8, H - 8);
    g.strokeStyle = '#2a3348'; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8);
    g.strokeStyle = '#26304a'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = 4 + (H - 8) * i / 5;
      g.beginPath(); g.moveTo(8, y); g.lineTo(W - 8, y); g.stroke();
    }
    g.fillStyle = '#5b6880'; g.font = '10px monospace'; g.textAlign = 'center';
    g.fillText('Z+', W / 2, 16); g.fillText('Z−', W / 2, H - 8);
    const py = H / 2 + ny * (H / 2 - 26);
    g.fillStyle = ny ? '#38bdf8' : '#3b4a6b';
    g.beginPath(); g.arc(W / 2, py, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0d0f13'; g.lineWidth = 2; g.stroke();
  }

  const joyState = { x: 0, y: 0, z: 0 };

  function bindJoystick(cv, yOnly, cb) {
    let active = false;
    const R = cv.width / 2 - 8, cy0 = cv.height / 2, cx0 = cv.width / 2;
    function setFromEvt(e) {
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left - cx0, py = e.clientY - r.top - cy0;
      let nx = px / (R - 16), ny = py / (R - 16);
      if (yOnly) { nx = 0; ny = Math.max(-1, Math.min(1, py / (cy0 - 26))); }
      else {
        const len = Math.hypot(nx, ny);
        if (len > 1) { nx /= len; ny /= len; }
      }
      cb(nx, ny); drawFn(nx, ny);
    }
    const drawFn = yOnly
      ? (nx, ny) => drawZJoy(cv, ny)
      : (nx, ny) => drawXYJoy(cv, nx, ny);
    cv.addEventListener('pointerdown', e => {
      active = true; cv.setPointerCapture(e.pointerId); setFromEvt(e);
    });
    cv.addEventListener('pointermove', e => { if (active) setFromEvt(e); });
    const rel = () => { active = false; cb(0, 0); drawFn(0, 0); };
    cv.addEventListener('pointerup', rel);
    cv.addEventListener('pointercancel', rel);
    drawFn(0, 0);
  }

  bindJoystick($('joy-xy'), false, (nx, ny) => { joyState.x = nx; joyState.y = ny; });
  bindJoystick($('joy-z'), true, (nx, ny) => { joyState.z = -ny; }); // up on canvas = +Z

  // keyboard jog
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ------------------------------------------------------------------
  // DRO + per-frame logic (called from Sim's render loop)
  // ------------------------------------------------------------------
  const droEls = { x: $('dx'), y: $('dy'), z: $('dz'), c: $('dc'), a: $('da') };
  let lastBead = null;              // last weld bead point (world)
  let lastSpark = null;

  Sim.state.onDro = function (M, tip, dt) {
    dt = Math.min(0.05, dt || 0.016);

    // ---- runner update ----
    runner.update(dt);

    // ---- manual jog (locked while program runs) ----
    if (!runningMode) {
      let jx = joyState.x, jy = -joyState.y, jz = joyState.z;
      if (keys['a'] || keys['arrowleft']) jx -= 1;
      if (keys['d'] || keys['arrowright']) jx += 1;
      if (keys['w'] || keys['arrowup']) jy += 1;
      if (keys['s'] || keys['arrowdown']) jy -= 1;
      if (keys['r']) jz += 1;
      if (keys['f']) jz -= 1;
      if (keys['q']) Sim.T.c = Sim.clampAxis('c', Sim.T.c - 90 * dt);
      if (keys['e']) Sim.T.c = Sim.clampAxis('c', Sim.T.c + 90 * dt);
      if (keys['t']) Sim.T.a = Sim.clampAxis('a', Sim.T.a + 60 * dt);
      if (keys['g']) Sim.T.a = Sim.clampAxis('a', Sim.T.a - 60 * dt);
      const sp = jogSpeed;
      if (jx || jy || jz) {
        Sim.T.x = Sim.clampAxis('x', Sim.T.x + jx * sp * dt);
        Sim.T.y = Sim.clampAxis('y', Sim.T.y + jy * sp * dt);
        Sim.T.z = Sim.clampAxis('z', Sim.T.z + jz * sp * dt);
        syncAxisSliders();
      }
    }

    // ---- weld bead deposition follows the COMMANDED path so beads lie
    //      exactly on the programmed seam at any sim speed ----
    // (actual tip drives sparks/smoke below)
    if (Sim.state.laser && tip.y < 65) {
      if (!lastSpark || Math.hypot(tip.x - lastSpark.x, tip.z - lastSpark.z) > 9) {
        Sim.emitSpark(tip); Sim.emitSpark(tip);
        lastSpark = { x: tip.x, z: tip.z };
      }
    } else lastSpark = null;

    // ---- DRO DOM (throttled ~15 Hz) ----
    droFrame = (droFrame + 1) % 4;
    if (droFrame === 0) {
      droEls.x.textContent = M.x.toFixed(1);
      droEls.y.textContent = M.y.toFixed(1);
      droEls.z.textContent = M.z.toFixed(1);
      droEls.c.textContent = M.c.toFixed(1) + '°';
      droEls.a.textContent = M.a.toFixed(1) + '°';
      if (runningMode) syncAxisSliders();
    }
  };
  let droFrame = 0;

  function syncAxisSliders() {
    $('ax-c').value = Math.round(Sim.T.c);
    $('ax-a').value = Math.round(Sim.T.a);
    $('ax-c-v').textContent = Math.round(Sim.T.c) + '°';
    $('ax-a-v').textContent = Math.round(Sim.T.a) + '°';
  }

  // ------------------------------------------------------------------
  // arm axis sliders
  // ------------------------------------------------------------------
  $('ax-c').addEventListener('input', e => {
    Sim.T.c = parseFloat(e.target.value);
    $('ax-c-v').textContent = e.target.value + '°';
  });
  $('ax-a').addEventListener('input', e => {
    Sim.T.a = parseFloat(e.target.value);
    $('ax-a-v').textContent = e.target.value + '°';
  });
  $('btn-c0').onclick = () => { Sim.T.c = 0; syncAxisSliders(); };
  $('btn-c90').onclick = () => { Sim.T.c = 90; syncAxisSliders(); };
  $('btn-c180').onclick = () => { Sim.T.c = 180; syncAxisSliders(); };
  $('btn-a0').onclick = () => { Sim.T.a = 0; syncAxisSliders(); };

  // ------------------------------------------------------------------
  // jog speed / laser / tool
  // ------------------------------------------------------------------
  $('jog-speed').addEventListener('input', e => {
    jogSpeed = parseFloat(e.target.value);
    $('jog-speed-v').textContent = jogSpeed + ' mm/s';
  });
  $('laser-pwr').addEventListener('input', e => {
    laserPwr = parseFloat(e.target.value) / 100;
    Sim.state.laserPower = laserPwr;
    $('laser-pwr-v').textContent = e.target.value + ' %';
  });
  $('btn-laser').onclick = () => setLaserUI(!Sim.state.laser);

  function setLaserUI(on) {
    Sim.setLaser(on);
    $('btn-laser').classList.toggle('on', on);
    $('led-laser').classList.toggle('on', on);
  }

  const toolNames = { 1: 'T1 laser weld gun', 2: 'T2 mill cutter', 3: 'T3 gripper' };
  function setToolUI(t) {
    Sim.setActiveTool(t);
    [1, 2, 3].forEach(k => $('tool-' + k).classList.toggle('on', k === t));
  }
  [1, 2, 3].forEach(t => { $('tool-' + t).onclick = () => { setToolUI(t); toast(toolNames[t] + ' mounted'); }; });

  $('btn-home').onclick = () => {
    if (runningMode) return toast('locked — program running', 1200);
    Sim.T.x = 0; Sim.T.y = 0; Sim.T.z = 100; Sim.T.c = 0; Sim.T.a = 0;
    syncAxisSliders(); toast('Homing → X0 Y0 Z100');
  };
  $('btn-zero').onclick = () => {
    if (runningMode) return toast('locked — program running', 1200);
    Sim.T.x = 0; Sim.T.y = 0; toast('Moving to part zero X0 Y0');
  };

  // ------------------------------------------------------------------
  // camera / viewport buttons
  // ------------------------------------------------------------------
  document.querySelectorAll('#camhud button[data-cam]').forEach(b => {
    b.onclick = () => {
      const m = b.dataset.cam;
      Sim.setCam(m);
      document.querySelectorAll('#camhud button[data-cam]').forEach(x => x.classList.remove('on'));
      if (m === 'chase') b.classList.add('on');
      if (m !== 'chase') toast('Camera: ' + m.toUpperCase(), 900);
    };
  });
  $('btn-cleandise').onclick = () => { Sim.clearBeads(); toast('Welds cleared'); };

  // ------------------------------------------------------------------
  // G-code panel
  // ------------------------------------------------------------------
  const editor = $('gcode-editor'), view = $('gcode-view'), linesEl = $('gcode-lines');

  $('btn-upload').onclick = () => $('file-input').click();
  $('file-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      editor.value = rd.result;
      $('fileinfo').textContent = '📄 ' + f.name + ' · ' + rd.result.split('\n').length + ' lines · ' +
        (rd.result.length / 1024).toFixed(1) + ' KB';
      setViewMode('edit');
      toast('Loaded ' + f.name + ' — press LOAD, then START');
    };
    rd.readAsText(f);
    e.target.value = '';
  });

  $('btn-demo').onclick = () => {
    editor.value = Sim.GCode.demoFrameGcode();
    $('fileinfo').textContent = '📄 demo 1: 2D window frame 1200×800 · top seams';
    $('btn-load').onclick();          // auto-load for convenience
    toast('Demo 1 geladen — ▶ START schweisst den Rahmen');
  };

  $('btn-demo2').onclick = () => {
    editor.value = Sim.GCode.demoVerticalEdgesGcode();
    $('fileinfo').textContent = '📄 demo 2: vertikale Kanten · A/C-Achsen aktiv';
    $('btn-load').onclick();
    toast('Demo 2 geladen — ▶ START schweisst die Vertikalnähte');
  };

  function setViewMode(mode) {
    if (mode === 'edit') {
      editor.style.display = 'block'; view.style.display = 'none';
      $('view-edit').classList.add('on'); $('view-run').classList.remove('on');
    } else {
      editor.style.display = 'none'; view.style.display = 'block';
      $('view-edit').classList.remove('on'); $('view-run').classList.add('on');
    }
  }
  $('view-edit').onclick = () => setViewMode('edit');
  $('view-run').onclick = () => { if (program) setViewMode('run'); };

  function buildRunView() {
    linesEl.innerHTML = '';
    program.lines.forEach((txt, i) => {
      const d = document.createElement('div');
      d.className = 'ln'; d.id = 'ln' + i;
      const n = document.createElement('span');
      n.className = 'n'; n.textContent = (i + 1);
      d.appendChild(n);
      d.appendChild(document.createTextNode(txt || ' '));
      linesEl.appendChild(d);
    });
  }
  function highlightLine(i) {
    const prev = linesEl.querySelector('.ln.cur');
    if (prev) prev.classList.remove('cur');
    const el = $('ln' + i);
    if (el) {
      el.classList.add('cur');
      const r = view.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.top < r.top + 20 || er.bottom > r.bottom - 20)
        el.scrollIntoView({ block: 'center' });
    }
    const prevDone = linesEl.querySelectorAll('.ln.done');
    if (prevDone.length > 400) {
      for (let k = 0; k < prevDone.length - 400; k++) prevDone[k].classList.remove('done');
    }
    if (el) el.classList.remove('done');
  }
  let lastDoneLine = -1;
  function markDoneUpTo(i) {
    for (let k = lastDoneLine + 1; k < i; k++) {
      const el = $('ln' + k); if (el) { el.classList.add('done'); el.classList.remove('cur'); }
    }
    lastDoneLine = i - 1;
  }

  // ------------------------------------------------------------------
  // runner hooks
  // ------------------------------------------------------------------
  runner.hooks = {
    onTarget(q, blk) {
      const before = { x: q.x, y: q.y, z: q.z };
      Sim.T.x = Sim.clampAxis('x', q.x);
      Sim.T.y = Sim.clampAxis('y', q.y);
      Sim.T.z = Sim.clampAxis('z', q.z);
      Sim.T.c = Sim.clampAxis('c', q.c);
      Sim.T.a = Sim.clampAxis('a', q.a);
      if (Math.abs(before.x - Sim.T.x) > 1 || Math.abs(before.y - Sim.T.y) > 1)
        alarm('soft limit X/Y ±600 — program clamped');
      if (Math.abs(before.z - Sim.T.z) > 1)
        alarm('soft limit Z 2..200 — program clamped');

      // bead along commanded seam while the program runs (feed moves only,
      // so rapid hops never leave beads) — planar AND vertical seams
      if (runningMode && Sim.state.laser && blk && blk.kind === 'linear') {
        const p = { x: Sim.T.x, y: Sim.T.z + 0.5, z: Sim.T.y };
        if (!lastBead) lastBead = p;
        const dh = Math.hypot(p.x - lastBead.x, p.z - lastBead.z);
        const dz = Math.abs(p.y - lastBead.y);
        if (dh < 25 && dz < 30) {              // continuous seam path
          if (dh > 0.7 || dz > 0.7) {
            Sim.addBeadSegment(lastBead, p, laserPwr);
            lastBead = p;
          }
        } else lastBead = p;                   // teleport: restart bead
      } else lastBead = null;
    },
    onLine(i) { markDoneUpTo(i); highlightLine(i); updateProgress(); },
    onLaser(on) { setLaserUI(on); },
    onTool(t) {
      if (toolNames[t]) { setToolUI(t); toast(toolNames[t] + ' mounted (M6)', 1200); }
      else toast('T' + t + ' not in magazine — keeping current tool');
    },
    onFeed(f) { $('stat-feed').textContent = Math.round(f); },
    onMsg(s) { if (s) $('run-state').textContent = 'ℹ ' + s; },
    onDone() { finishProgram(); }
  };

  function updateProgress() {
    const p = runner.progress();
    $('progress').style.width = (p * 100).toFixed(1) + '%';
  }

  // ------------------------------------------------------------------
  // transport buttons
  // ------------------------------------------------------------------
  $('btn-load').onclick = () => {
    const txt = editor.value.trim();
    if (!txt) return toast('Nothing to load — upload a file or press DEMO');
    program = Sim.GCode.parse(txt);
    runner.load(program);
    buildRunView();
    lastDoneLine = -1;
    updateProgress();
    $('run-state').textContent = 'READY — ' + program.blocks.length + ' blocks parsed · press START';
    toast('Program loaded · ' + program.blocks.length + ' blocks');
    setViewMode('run');
  };

  $('btn-play').onclick = () => {
    if (!program || runner.done) {
      // auto-load current editor content
      $('btn-load').onclick(); if (!program) return;
    }
    if (runner.paused && !runner.m0Wait) { runner.paused = false; $('run-state').textContent = 'RUNNING (resumed)'; return; }
    runningMode = true;
    $('stat-mode').textContent = 'AUTO';
    runner.speed = simSpeedMul;
    runner.play({ x: Sim.M.x, y: Sim.M.y, z: Sim.M.z, c: Sim.M.c, a: Sim.M.a });
    $('run-state').textContent = 'RUNNING · speed ' + simSpeedMul + '×';
    setViewMode('run');
  };

  $('btn-pause').onclick = () => {
    if (runningMode && !runner.done) {
      runner.pause();
      $('run-state').textContent = 'PAUSED — press START to resume';
    }
  };

  function finishProgram() {
    runningMode = false;
    $('stat-mode').textContent = 'MANUAL';
    setLaserUI(false);
    $('progress').style.width = '100%';
    $('run-state').textContent = '✔ PROGRAM END — weld bead segments: ' + Sim.weldCount;
    toast('✔ Program finished');
  }

  $('btn-stop').onclick = () => {
    runner.stop();
    finishProgram();
    $('run-state').textContent = '■ STOPPED — program reset';
    $('progress').style.width = '0%';
    markDoneReset();
  };
  function markDoneReset() {
    linesEl.querySelectorAll('.ln').forEach(l => l.classList.remove('done', 'cur'));
    lastDoneLine = -1;
  }

  $('sim-speed').addEventListener('input', e => {
    simSpeedMul = parseFloat(e.target.value);
    runner.speed = simSpeedMul;
    Sim.state.servoBoost = Math.max(1, 1 + (simSpeedMul - 1) * 0.18);
    $('sim-speed-v').textContent = simSpeedMul.toFixed(1) + '×';
  });

  // ------------------------------------------------------------------
  // initial state
  // ------------------------------------------------------------------
  setLaserUI(false);
  setToolUI(1);
  syncAxisSliders();
  $('sim-speed-v').textContent = simSpeedMul.toFixed(1) + '×';
  toast('Simulator ready — press 🔥 DEMO, LOAD, ▶ START', 3000);

  // test hook (read-only introspection)
  window.__SIM_TEST = {
    get runner() { return runner; },
    get program() { return program; },
    get runningMode() { return runningMode; }
  };

  // auto-demo: index.html?autorun=demo|demo2  (also used for headless testing)
  const auto = new URLSearchParams(location.search).get('autorun');
  if (auto === 'demo' || auto === 'demo2') {
    setTimeout(() => {
      $(auto === 'demo2' ? 'btn-demo2' : 'btn-demo').click();
      $('sim-speed').value = 40;
      $('sim-speed').dispatchEvent(new Event('input'));
      $('btn-play').click();
    }, 400);
  }
})();
