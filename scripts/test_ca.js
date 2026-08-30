/* Quick kinematic check: rotate arm to C=90, A=45 and capture. */
'use strict';
async function main() {
  const res = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent('http://127.0.0.1:8777/'), { method: 'PUT' });
  const tab = await res.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(ok => { const id = ++msgId; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.result?.value; };

  await new Promise(r => setTimeout(r, 2500));

  // park gantry mid-table, yaw 90°, tilt 45°, jog x to +300
  await evalJs(`Sim.T.x=300; Sim.T.y=0; Sim.T.z=60; Sim.T.c=90; Sim.T.a=45;`);
  await evalJs(`Sim.setCam('front')`);
  await new Promise(r => setTimeout(r, 3000));
  const tip = await evalJs(`(function(){ const t = Sim.tipWorld(); return {x:+t.x.toFixed(1), y:+t.y.toFixed(1), z:+t.z.toFixed(1)}; })()`);
  console.log('tip at C=90 A=45 (expect z-offset from yaw, x-offset from tilt):', JSON.stringify(tip));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(require('path').dirname(__dirname) + '/cnc-weld-simulator/_shot_ca.png', Buffer.from(shot.result.data, 'base64'));
  console.log('saved _shot_ca.png');
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
