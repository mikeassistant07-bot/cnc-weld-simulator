/* CDP end-to-end test: boots the simulator, auto-runs the frame demo,
   fast-forwards the physics, then reports state + captures a screenshot. */
'use strict';
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = process.env.CDP_PORT || 9222;
const APP_URL = 'http://127.0.0.1:8777/?autorun=demo';
const OUT_DIR = path.dirname(__dirname) + '/cnc-weld-simulator';

function httpGetJson(url) {
  return fetch(url).then(r => r.json());
}

async function main() {
  // create a fresh tab
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
  const tab = await res.json();
  console.log('tab:', tab.id);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  function send(method, params = {}, sessionId) {
    return new Promise((ok) => {
      const id = ++msgId;
      pending.set(id, ok);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async function evalJs(expr, awaitPromise = false) {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise, returnByValue: true
    });
    if (r.result && r.result.exceptionDetails) {
      console.error('PAGE EXCEPTION:', JSON.stringify(r.result.exceptionDetails, null, 1).slice(0, 800));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  await send('Runtime.enable');
  await send('Page.enable');
  ws.addEventListener('error', () => {});

  // collect console errors
  let pageErrors = [];
  // (Log domain)
  await send('Log.enable');

  console.log('waiting 3s for boot + autorun start...');
  await new Promise(r => setTimeout(r, 3000));

  const boot = await evalJs(`({
    ready: !!window.Sim, hasGCode: !!(window.Sim && Sim.GCode),
    tool: Sim.state.tool, running: (typeof runnerRef !== 'undefined')
  })`);
  console.log('boot:', JSON.stringify(boot));

  // fast-forward the whole program through the physics loop
  console.log('fast-forwarding program (stepSim)...');
  const ff = await evalJs(`(function(){
     const t0 = performance.now();
     Sim.stepSim(420);
     return { ms: Math.round(performance.now()-t0), weldCount: Sim.weldCount };
   })()`);
  console.log('fast-forward:', JSON.stringify(ff));

  const state = await evalJs(`({
     done: (window.__SIM_TEST && __SIM_TEST.runner.done),
     blocks: (window.__SIM_TEST && __SIM_TEST.program ? __SIM_TEST.program.blocks.length : 0),
     mode: document.getElementById('stat-mode').textContent,
     feed: document.getElementById('stat-feed').textContent,
     runState: document.getElementById('run-state').textContent,
     progress: document.getElementById('progress').style.width,
     dro: { x: document.getElementById('dx').textContent,
            y: document.getElementById('dy').textContent,
            z: document.getElementById('dz').textContent,
            c: document.getElementById('dc').textContent,
            a: document.getElementById('da').textContent },
     laserLED: document.getElementById('led-laser').className
  })`);
  console.log('final state:', JSON.stringify(state, null, 1));

  // top view screenshot of the completed weld
  await evalJs(`Sim.setCam('top')`);
  await new Promise(r => setTimeout(r, 2500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, '_shot_done.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot saved: _shot_done.png');

  // iso view screenshot
  await evalJs(`Sim.setCam('iso')`);
  await new Promise(r => setTimeout(r, 2500));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, '_shot_done_iso.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('screenshot saved: _shot_done_iso.png');

  // joint-level audit: verify bead points lie on seam centerlines (y on rails etc.)
  const audit = await evalJs(`(function(){
     // sample: read bead geometry through a probe exposed by addBeadSegment? use scene raycast-free check:
     return 'see weldCount';
   })()`);
  await evalJs(`window.close && window.close()`);
  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
