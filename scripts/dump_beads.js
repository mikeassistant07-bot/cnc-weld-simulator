/* Debug helper: runs the demo program headlessly and prints the deposited
   weld bead seam lines (start/end of each merged segment chain). */
'use strict';
const APP = 'http://127.0.0.1:8777/?autorun=demo';
async function main() {
  const res = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(APP)}`, { method: 'PUT' });
  const tab = await res.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(ok => { const id = ++msgId; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.result?.value; };
  await new Promise(r => setTimeout(r, 3000));
  await evalJs(`Sim.stepSim(420)`);
  const dump = await evalJs(`(function(){
    const d = Sim.weldData; const out = [];
    for (let i = 0; i < Math.min(d.count, 4000); i++) {
      const o = i*6;
      out.push([d.pos[o], d.pos[o+2], d.pos[o+3], d.pos[o+5]].map(v=>+v.toFixed(1)));
    }
    return { count: d.count, segs: out };
  })()`);
  console.log('total segments:', dump.count);
  const lines = {};
  for (const [x1, z1, x2, z2] of dump.segs) {
    const key = [Math.round(x1 / 10) * 10, Math.round(z1 / 10) * 10, Math.round(x2 / 10) * 10, Math.round(z2 / 10) * 10].join(',');
    lines[key] = (lines[key] || 0) + 1;
  }
  console.log('seam lines (x1,z1 -> x2,z2) : segCount');
  Object.entries(lines).forEach(([k, v]) => console.log(' ', k, ':', v));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
