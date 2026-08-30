/* =====================================================================
   machine.js — 3D scene, CNC machine model, gripper arm kinematics,
   tool magazine (laser weld gun / endmill / gripper) and weld effects.
   Machine coordinate system: X → world X, Y → world Z, Z → world Y(up).
   Work table top = machine Z0 = world y 0.  All units millimetres.
   ===================================================================== */
window.Sim = (function () {
  'use strict';

  // ------------------------------------------------------------------
  // constants
  // ------------------------------------------------------------------
  const ARM_L = 260;                       // wrist pivot -> tool tip (mm)
  const BEAM_BOTTOM = 470;                 // world y of gantry beam underside
  const LIM = {
    x: [-600, 600], y: [-600, 600], z: [2, 200],
    c: [-180, 180], a: [-75, 75]
  };
  const D2R = Math.PI / 180;

  // ------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------
  const M = {                              // machine axes (actual)
    x: 0, y: 0, z: 100, c: 0, a: 0
  };
  const T = { x: 0, y: 0, z: 100, c: 0, a: 0 };   // commanded target
  const state = {
    tool: 1, laser: false, laserPower: 0.7,
    chase: false, homed: true,
    servoBoost: 1,
    onDro: null, onLaser: null
  };

  let scene, camera, renderer, controls, clock;
  let gantry, saddle, ramPlate, armYaw, armPitch, tipObj, flangeMesh;
  let toolGroups = {}, beamMesh, tipGlow, tipLight, laserBeam;
  let container;

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color }, opts || {}));
  }
  const MACH_BLUE = 0x35507a, DARK = 0x23262d, STEEL = 0x9aa3ad,
        YELLOW = 0xe0a80c, GREEN = 0x1f6f43;

  function box(w, h, d, material, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, material, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), material);
    m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }

  // ------------------------------------------------------------------
  // environment
  // ------------------------------------------------------------------
  function stripeTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#c8a419'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#141414';
    for (let i = -128; i < 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128);
      g.lineTo(i + 96, 128); g.lineTo(i - 32, 0); g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24);
    return t;
  }

  function buildEnvironment() {
    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      mat(0x1d2026, { roughness: 0.95, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = -300;
    floor.receiveShadow = true; scene.add(floor);

    const grid = new THREE.GridHelper(9000, 90, 0x2c3242, 0x22262f);
    grid.position.y = -299; scene.add(grid);

    // hazard stripe ring around machine
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(950, 1150, 4, 1),
      new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 4;
    ring.position.y = -298; scene.add(ring);

    // table: pedestal + top plate
    box(1300, 250, 1300, mat(0x2a2e36), 0, -175, 0);
    const top = box(1420, 50, 1420, mat(0x3a3f49, { metalness: 0.6, roughness: 0.5 }), 0, -25, 0);
    top.name = 'tableTop';
    // T-slots
    const slot = mat(0x171a1f);
    for (let i = -2; i <= 2; i++) box(1360, 3, 14, slot, 0, 1.6, i * 160);
    for (let i = -2; i <= 2; i++) box(14, 3, 1360, slot, i * 160, 1.4, 0);

    // side risers + rails (gantry travels along machine Y = world Z)
    const riserM = mat(MACH_BLUE, { metalness: 0.4, roughness: 0.55 });
    const railM = mat(STEEL, { metalness: 0.9, roughness: 0.25 });
    [-1, 1].forEach(s => {
      box(130, 560, 1560, riserM, s * 770, -20, 0);
      box(10, 14, 1500, railM, s * 700, 270, 0);
      box(90, 20, 60, mat(YELLOW), s * 770, 270, -740);
      box(90, 20, 60, mat(YELLOW), s * 770, 270, 740);
    });
    // work envelope wire box 1200 x 1200 x 200
    const env = new THREE.Box3(
      new THREE.Vector3(-600, 0, -600), new THREE.Vector3(600, 200, 600));
    const envHelp = new THREE.Box3Helper(env, 0x2f6f9f);
    envHelp.material.transparent = true; envHelp.material.opacity = 0.35;
    scene.add(envHelp);
  }

  // ------------------------------------------------------------------
  // machine (gantry + saddle + ram + gripper arm)
  // ------------------------------------------------------------------
  function buildMachine() {
    gantry = new THREE.Group(); scene.add(gantry);

    const beamM = mat(MACH_BLUE, { metalness: 0.5, roughness: 0.5 });
    box(1670, 80, 110, beamM, 0, BEAM_BOTTOM + 40, 0, gantry);           // main beam
    box(1670, 14, 130, mat(YELLOW, { metalness: 0.3 }), 0, BEAM_BOTTOM - 2, 0, gantry); // warning strip
    box(240, 60, 116, mat(0x2b3d5e), 620, BEAM_BOTTOM + 40, 0, gantry);  // charge tank
    // leg shoes riding the rails
    [-1, 1].forEach(s => {
      box(120, 110, 160, mat(0x2b3d5e, { metalness: 0.5 }), s * 700, BEAM_BOTTOM - 55, 0, gantry);
    });
    // red E-stop on beam
    const estop = cyl(16, 16, 12, 20, mat(0xd22619, { roughness: 0.4 }), gantry);
    estop.rotation.x = Math.PI / 2; estop.position.set(-700, BEAM_BOTTOM + 40, 62);
    cyl(20, 20, 6, 20, mat(0xf3d22b), gantry).rotation.x = Math.PI / 2;
    gantry.children[gantry.children.length - 1].position.set(-700, BEAM_BOTTOM + 40, 60);

    // machine name plate
    const plateCv = document.createElement('canvas'); plateCv.width = 512; plateCv.height = 64;
    const pg = plateCv.getContext('2d');
    pg.fillStyle = '#101623'; pg.fillRect(0, 0, 512, 64);
    pg.fillStyle = '#ffb020'; pg.font = 'bold 40px Arial';
    pg.textAlign = 'center'; pg.textBaseline = 'middle';
    pg.fillText('CNC  LASER  WELD  ·  5 AXES', 256, 34);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 70),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(plateCv) }));
    plate.position.set(0, BEAM_BOTTOM + 40, 58); gantry.add(plate);

    // saddle (travels X)
    saddle = new THREE.Group(); gantry.add(saddle);
    box(150, 120, 150, mat(0x2b3d5e, { metalness: 0.5 }), 0, BEAM_BOTTOM + 40, 0, saddle);
    box(160, 20, 160, mat(STEEL), 0, BEAM_BOTTOM + 40, 80, saddle);

    // ram group — origin IS the wrist pivot
    const ram = new THREE.Group(); ram.name = 'ram'; saddle.add(ram);
    box(84, 20, 60, mat(0x1d2839), 0, -10, 0, ram); // pivot yoke
    // telescoping plate (scaled each frame to reach the beam)
    const plateGeo = new THREE.BoxGeometry(64, 1, 22);
    plateGeo.translate(0, 0.5, 0);
    ramPlate = new THREE.Mesh(plateGeo, mat(0x4a5872, { metalness: 0.6, roughness: 0.4 }));
    ramPlate.castShadow = true; ram.add(ramPlate);

    // C-axis rotary flange + arm
    armYaw = new THREE.Group(); ram.add(armYaw);
    flangeMesh = cyl(36, 42, 34, 28, mat(0x37414f, { metalness: 0.8, roughness: 0.3 }), armYaw);
    box(72, 12, 72, mat(YELLOW), 0, -20, 0, armYaw);   // flange index ring

    armPitch = new THREE.Group(); armYaw.add(armPitch);
    // arm body: tapering boxes from pivot down to tool
    const armM = mat(0x2e3746, { metalness: 0.55, roughness: 0.45 });
    const seg1 = box(34, 120, 44, armM, 0, -60, 0, armPitch);
    box(28, 90, 34, armM, 0, -160, 0, armPitch);
    // elbow ring at tool end
    const elbow = cyl(26, 26, 30, 24, mat(0x37414f, { metalness: 0.8 }), armPitch);
    elbow.rotation.z = Math.PI / 2; elbow.scale.set(1, 0.55, 1);
    elbow.position.set(0, -215, 0); elbow.rotation.set(0, 0, 0);
    // cable hose from pivot to elbow (static curve, child of arm)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-22, -10, 20), new THREE.Vector3(-52, -80, 26),
      new THREE.Vector3(-46, -160, 24), new THREE.Vector3(-24, -212, 18)
    ]);
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 5.5, 8),
      mat(0x14161b, { roughness: 0.9 }));
    armPitch.add(hose);

    // wrist + tool mount + tip
    const wrist = new THREE.Group(); wrist.position.set(0, -ARM_L + 14, 0); armPitch.add(wrist);
    box(40, 26, 40, mat(0x37414f, { metalness: 0.7 }), 0, 0, 0, wrist);

    tipObj = new THREE.Object3D();
    tipObj.position.set(0, -ARM_L, 0); armPitch.add(tipObj);

    // tool magazine (each tool group built with tip at local 0,-ARM_L,0)
    toolGroups[1] = buildWeldGun();
    toolGroups[2] = buildEndmill();
    toolGroups[3] = buildGripper();
    Object.values(toolGroups).forEach(g => armPitch.add(g));
    setActiveTool(1);

    // laser beam + glow + light attached to tip
    const beamGeo = new THREE.CylinderGeometry(0.8, 2.2, 1, 10, 1, true);
    beamGeo.translate(0, -0.5, 0);
    laserBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    laserBeam.visible = false; tipObj.add(laserBeam);

    const glowTex = glowTexture();
    tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffc070, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    tipGlow.scale.set(26, 26, 1); tipGlow.visible = false; tipObj.add(tipGlow);

    tipLight = new THREE.PointLight(0xff9040, 0, 260, 2);
    tipObj.add(tipLight);
  }

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,190,90,0.8)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // ------------------------- tools ---------------------------------
  function toolBase() {
    const g = new THREE.Group();
    g.position.y = -ARM_L;          // group origin = tool tip point
    return g;
  }

  // T1 — handheld laser welding gun (Gweike Cloud style)
  function buildWeldGun() {
    const g = toolBase();
    const bodyM = mat(GREEN, { metalness: 0.35, roughness: 0.5 });
    const darkM = mat(0x14161b, { roughness: 0.85 });
    const up = new THREE.Vector3(0, 1, 0);

    // main body sits above the tip (tip = nozzle exit)
    const body = cyl(15, 18, 110, 20, bodyM, g);
    body.position.set(0, 70, 0);
    const nose = cyl(9, 15, 26, 16, darkM, g); nose.position.set(0, 8, 0);
    const nozzle = cyl(4.5, 8, 22, 14, mat(0xd7dde6, { metalness: 0.9, roughness: 0.3 }), g);
    nozzle.position.set(0, -8, 0);
    const tipRing = cyl(5.5, 5.5, 6, 12, mat(0xff5522, { emissive: 0xaa2200 }), g);
    tipRing.position.set(0, -19, 0);
    // pistol grip (angled)
    const grip = box(16, 70, 24, darkM, 0, 30, 26, g);
    grip.rotation.x = 0.35;
    // trigger
    box(6, 16, 8, mat(0xd22619), 0, 42, 12, g).rotation.x = 0.2;
    // rear connector + strain relief
    const rear = cyl(11, 13, 24, 14, darkM, g); rear.position.set(0, 128, -4);
    // hose curving back to the ram
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 132, -8), new THREE.Vector3(-16, 200, -28),
      new THREE.Vector3(-30, 280, 16), new THREE.Vector3(-34, 360, 0)
    ]);
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(hoseCurve, 28, 6, 8),
      mat(0x101216, { roughness: 0.95 }));
    hose.position.y = ARM_L;      // convert to arm space (group at -ARM_L)
    armPitch.add(hose);
    g.userData.hose = hose;
    return g;
  }

  // T2 — milling end mill
  function buildEndmill() {
    const g = toolBase();
    const collet = cyl(20, 26, 60, 20, mat(0x8f98a4, { metalness: 0.9, roughness: 0.3 }), g);
    collet.position.set(0, 46, 0);
    const shank = cyl(9, 9, 30, 16, mat(0x6d7680, { metalness: 0.9 }), g);
    shank.position.set(0, 9, 0);
    const flutes = cyl(6, 5, 26, 12, mat(0x3c424b, { metalness: 0.95, roughness: 0.25 }), g);
    flutes.position.set(0, -13, 0);
    return g;
  }

  // T3 — two-finger gripper
  function buildGripper() {
    const g = toolBase();
    const m = mat(0x37414f, { metalness: 0.7, roughness: 0.35 });
    box(70, 24, 40, m, 0, 44, 0, g);
    box(60, 34, 30, mat(0x232a35), 0, 18, 0, g);
    [-1, 1].forEach(s => {
      box(10, 46, 26, m, s * 22, -12, 0, g);
      box(12, 12, 26, mat(0xd7dde6), s * 22, -34, 0, g);
    });
    return g;
  }

  // ------------------------- workpiece ------------------------------
  function buildWorkpiece() {
    // 2D window-frame grid, 1200 x 800, 40x40 tubes, matches demo G-code
    const wp = new THREE.Group(); wp.name = 'workpiece';
    const steel = mat(0x454b54, { metalness: 0.75, roughness: 0.45 });
    const T = 40, H = 40;             // tube width / height

    function barX(len, x, y) {        // bar running along X
      const b = box(len, H, T, steel, x, H / 2, y, wp);
      return b;
    }
    function barY(len, x, y) {        // bar running along Y
      const b = box(T, H, len, steel, x, H / 2, y, wp);
      return b;
    }
    // outer frame
    barX(1200, 0, 400); barX(1200, 0, -400);
    barY(800 - T, 600, 0); barY(800 - T, -600, 0);
    // inner verticals (span between top/bottom rails)
    barY(800 - T, 200, 0); barY(800 - T, -200, 0);
    // inner horizontals (between outer side rails)
    barX(1200 - T, 0, 400 / 3); barX(1200 - T, 0, -400 / 3);
    scene.add(wp);

    // corner clamps (fixture)
    const clampM = mat(0x6a5a20, { metalness: 0.5, roughness: 0.5 });
    [[-660, -460], [660, -460], [-660, 460], [660, 460]].forEach(p => {
      box(50, 60, 50, clampM, p[0], 30, p[1], scene);
      box(70, 12, 24, mat(STEEL), p[0] * 0.94, 66, p[1] * 0.94, scene);
    });
  }

  // ------------------------------------------------------------------
  // weld effects: bead line, sparks, smoke
  // ------------------------------------------------------------------
  const MAX_SEG = 30000;
  const BEAD_W = 3.4;               // bead half-width (mm)
  const weld = {
    count: 0,
    birth: new Float32Array(MAX_SEG),
    power: new Float32Array(MAX_SEG),
    pos: null, col: null, geo: null,
    coldIdx: []
  };
  const ribbon = { pos: null, col: null, geo: null };
  const HOT_AGE = 4.0;              // seconds a bead stays bright
  let now = 0;

  function initWeld() {
    weld.pos = new Float32Array(MAX_SEG * 6);
    weld.col = new Float32Array(MAX_SEG * 6);
    weld.geo = new THREE.BufferGeometry();
    weld.geo.setAttribute('position', new THREE.BufferAttribute(weld.pos, 3));
    weld.geo.setAttribute('color', new THREE.BufferAttribute(weld.col, 3));
    weld.geo.setDrawRange(0, 0);
    const mkLine = (blend, opacity) => {
      const l = new THREE.LineSegments(weld.geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: opacity,
        blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false
      }));
      l.frustumCulled = false; scene.add(l); return l;
    };
    mkLine(false, 1.0);            // core
    mkLine(true, 0.75);            // glow halo

    // ---- solid ribbon quads (the visible bead) ----
    ribbon.pos = new Float32Array(MAX_SEG * 4 * 3);
    ribbon.col = new Float32Array(MAX_SEG * 4 * 3);
    const idx = new Uint32Array(MAX_SEG * 6);
    for (let i = 0; i < MAX_SEG; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    ribbon.geo = new THREE.BufferGeometry();
    ribbon.geo.setAttribute('position', new THREE.BufferAttribute(ribbon.pos, 3));
    ribbon.geo.setAttribute('color', new THREE.BufferAttribute(ribbon.col, 3));
    ribbon.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    ribbon.geo.setDrawRange(0, 0);
    const rm = new THREE.Mesh(ribbon.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      transparent: true, opacity: 0.96, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    rm.frustumCulled = false; rm.renderOrder = 2; scene.add(rm);
  }

  function addRibbonQuad(i, p1, p2) {
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const lenXZ = Math.hypot(dx, dz);
    let px, pz;
    if (lenXZ > 1e-4) {                 // planar seam: perpendicular in XZ
      px = -dz / lenXZ * BEAD_W; pz = dx / lenXZ * BEAD_W;
    } else {                            // vertical seam: ribbon faces +X
      px = BEAD_W; pz = 0;
    }
    const y1 = p1.y + 0.5, y2 = p2.y + 0.5;
    const o = i * 12;
    ribbon.pos[o]      = p1.x + px; ribbon.pos[o + 1]  = y1; ribbon.pos[o + 2]  = p1.z + pz;
    ribbon.pos[o + 3]  = p1.x - px; ribbon.pos[o + 4]  = y1; ribbon.pos[o + 5]  = p1.z - pz;
    ribbon.pos[o + 6]  = p2.x - px; ribbon.pos[o + 7]  = y2; ribbon.pos[o + 8]  = p2.z - pz;
    ribbon.pos[o + 9]  = p2.x + px; ribbon.pos[o + 10] = y2; ribbon.pos[o + 11] = p2.z + pz;
  }

  function beadColor(t, p, out) {    // t = age seconds, p = power 0..1
    let r, g, b;
    if (t < 0.15)      { r = 1.0;                 g = 0.98;                 b = 0.9; }
    else if (t < 0.8)  { r = 1.0;                 g = 0.55 + 0.3 * (0.8 - t) / 0.65; b = 0.12; }
    else if (t < HOT_AGE) {
      const k = (t - 0.8) / (HOT_AGE - 0.8);
      r = 0.95 - 0.45 * k; g = 0.5 - 0.34 * k; b = 0.1 - 0.05 * k;
    } else             { r = 0.55; g = 0.30; b = 0.13; }
    const s = 0.55 + 0.45 * p;
    out[0] = r * s; out[1] = g * s; out[2] = b * s;
  }

  const tmpCol = [0, 0, 0];
  function updateBeadColors() {
    const n = weld.count;
    for (let i = 0; i < n; i++) {
      const age = now - weld.birth[i];
      if (age < HOT_AGE || age < HOT_AGE + 0.2) {
        beadColor(Math.min(age, HOT_AGE + 0.19), weld.power[i], tmpCol);
        const o = i * 6, ro = i * 12;
        for (let v = 0; v < 2; v++) {
          weld.col[o + v * 3] = tmpCol[0];
          weld.col[o + v * 3 + 1] = tmpCol[1];
          weld.col[o + v * 3 + 2] = tmpCol[2];
        }
        for (let v = 0; v < 4; v++) {
          ribbon.col[ro + v * 3] = tmpCol[0] * 0.82;
          ribbon.col[ro + v * 3 + 1] = tmpCol[1] * 0.82;
          ribbon.col[ro + v * 3 + 2] = tmpCol[2] * 0.82;
        }
      }
    }
    weld.geo.attributes.color.needsUpdate = true;
    ribbon.geo.attributes.color.needsUpdate = true;
  }

  function addBeadSegment(p1, p2, power) {
    if (weld.count >= MAX_SEG) return;
    const i = weld.count++, o = i * 6;
    weld.pos[o] = p1.x; weld.pos[o + 1] = p1.y; weld.pos[o + 2] = p1.z;
    weld.pos[o + 3] = p2.x; weld.pos[o + 4] = p2.y; weld.pos[o + 5] = p2.z;
    weld.birth[i] = now; weld.power[i] = power;
    weld.geo.setDrawRange(0, weld.count * 2);
    weld.geo.attributes.position.needsUpdate = true;
    addRibbonQuad(i, p1, p2);
    ribbon.geo.setDrawRange(0, weld.count * 6);
    ribbon.geo.attributes.position.needsUpdate = true;
  }

  function clearBeads() {
    weld.count = 0;
    weld.geo.setDrawRange(0, 0);
    ribbon.geo.setDrawRange(0, 0);
  }

  // sparks -----------------------------------------------------------
  const SPARK_N = 420;
  let sparkPts, sparkPos, sparkVel, sparkLife, sparkIdx = 0, sparkAcc = 0;
  function initSparks() {
    sparkPos = new Float32Array(SPARK_N * 3);
    sparkVel = new Float32Array(SPARK_N * 3);
    sparkLife = new Float32Array(SPARK_N);
    for (let i = 0; i < SPARK_N; i++) sparkPos[i * 3 + 1] = -9999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkPts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffb050, size: 3.4, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sparkPts.frustumCulled = false; scene.add(sparkPts);
  }
  function emitSpark(p) {
    const i = sparkIdx = (sparkIdx + 1) % SPARK_N, o = i * 3;
    sparkPos[o] = p.x; sparkPos[o + 1] = p.y; sparkPos[o + 2] = p.z;
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 160;
    sparkVel[o] = Math.cos(a) * r;
    sparkVel[o + 1] = 40 + Math.random() * 200;
    sparkVel[o + 2] = Math.sin(a) * r;
    sparkLife[i] = 0.3 + Math.random() * 0.55;
  }
  function updateSparks(dt) {
    for (let i = 0; i < SPARK_N; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      const o = i * 3;
      if (sparkLife[i] <= 0) { sparkPos[o + 1] = -9999; continue; }
      sparkVel[o + 1] -= 2600 * dt;
      sparkPos[o] += sparkVel[o] * dt;
      sparkPos[o + 1] += sparkVel[o + 1] * dt;
      sparkPos[o + 2] += sparkVel[o + 2] * dt;
      if (sparkPos[o + 1] < 0.5) { sparkPos[o + 1] = 0.5; sparkVel[o + 1] *= -0.3; }
    }
    sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  // smoke -------------------------------------------------------------
  const SMOKE_N = 10;
  let smokeSprites = [], smokeIdx = 0, smokeAcc = 0;
  function initSmoke() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(200,200,200,0.35)');
    grad.addColorStop(1, 'rgba(160,160,160,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < SMOKE_N; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false
      }));
      s.scale.set(60, 60, 1); s.userData = { t: 1 };
      scene.add(s); smokeSprites.push(s);
    }
  }
  function updateSmoke(dt, tip, active) {
    smokeAcc += dt;
    if (active && smokeAcc > 0.12) {
      smokeAcc = 0;
      const s = smokeSprites[smokeIdx = (smokeIdx + 1) % SMOKE_N];
      s.position.set(tip.x + (Math.random() - 0.5) * 10, tip.y + 14, tip.z + (Math.random() - 0.5) * 10);
      s.userData.t = 0;
    }
    smokeSprites.forEach(s => {
      if (s.userData.t < 1) {
        s.userData.t += dt / 1.6;
        const t = s.userData.t;
        s.position.y += 26 * dt;
        s.material.opacity = 0.35 * (1 - t);
        const sc = 60 + t * 90; s.scale.set(sc, sc, 1);
      } else s.material.opacity = 0;
    });
  }

  // ------------------------------------------------------------------
  // kinematics
  // ------------------------------------------------------------------
  function applyKinematics() {
    const cx = Math.cos(M.c * D2R), sx = Math.sin(M.c * D2R);
    const ca = Math.cos(M.a * D2R), sa = Math.sin(M.a * D2R);
    // tip offset from pivot: R_y(c) * (L*sin a, -L*cos a, 0)
    const offX = ARM_L * sa * cx;
    const offZ = -ARM_L * sa * sx;
    const pivotX = M.x - offX;
    const pivotZ = M.y - offZ;
    const pivotY = M.z + ARM_L * ca;

    gantry.position.z = pivotZ;
    saddle.position.x = pivotX;
    ram = ram || saddle.getObjectByName('ram');
    ram.position.y = pivotY;
    ramPlate.scale.y = Math.max(12, BEAM_BOTTOM - pivotY);
    ramPlate.position.y = 14;

    armYaw.rotation.y = M.c * D2R;
    armPitch.rotation.z = M.a * D2R;
  }
  let ram = null;

  // ------------------------------------------------------------------
  // public API
  // ------------------------------------------------------------------
  function clampAxis(k, v) {
    return Math.min(LIM[k][1], Math.max(LIM[k][0], v));
  }
  function clampTarget() {
    ['x', 'y', 'z', 'c', 'a'].forEach(k => { T[k] = clampAxis(k, T[k]); });
  }

  function setActiveTool(id) {
    state.tool = id;
    Object.entries(toolGroups).forEach(([k, g]) => {
      g.visible = (+k === id);
      if (g.userData.hose) g.userData.hose.visible = (+k === id);
    });
  }

  function setLaser(on) {
    state.laser = !!on;
    laserBeam.visible = tipGlow.visible = on;
    tipLight.intensity = on ? 1.6 * (0.4 + state.laserPower) : 0;
    if (state.onLaser) state.onLaser(on);
  }

  function tipWorld(v) { return tipObj.getWorldPosition(v || new THREE.Vector3()); }

  function setCam(mode) {
    const d = 1500;
    if (mode === 'iso') animateCamTo(new THREE.Vector3(1150, 950, 1150), new THREE.Vector3(0, 60, 0));
    else if (mode === 'front') animateCamTo(new THREE.Vector3(0, 420, 1750), new THREE.Vector3(0, 80, 0));
    else if (mode === 'top') animateCamTo(new THREE.Vector3(0.01, 1750, 0.01), new THREE.Vector3(0, 0, 0));
    state.chase = false;
    if (mode === 'chase') state.chase = true;
  }

  let camAnim = null;
  function animateCamTo(pos, tgt) {
    camAnim = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: tgt, t: 0 };
  }

  function init(containerEl) {
    container = containerEl;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101318);
    scene.fog = new THREE.Fog(0x101318, 4200, 8000);

    camera = new THREE.PerspectiveCamera(50, 1, 5, 20000);
    camera.position.set(1150, 950, 1150);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    containerEl.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 60, 0);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 150; controls.maxDistance = 6000;

    // lights
    scene.add(new THREE.HemisphereLight(0xbdd0f0, 0x181008, 0.85));
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(700, 1200, 500); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1100; sun.shadow.camera.right = 1100;
    sun.shadow.camera.top = 1100; sun.shadow.camera.bottom = -1100;
    sun.shadow.camera.far = 4000; sun.shadow.bias = -0.0005;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fb0ff, 0.25);
    fill.position.set(-800, 500, -600); scene.add(fill);

    buildEnvironment();
    buildMachine();
    buildWorkpiece();
    initWeld(); initSparks(); initSmoke();

    clock = new THREE.Clock();
    window.addEventListener('resize', resize);
    resize();
    animate();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // per-frame update of weld visuals; returns tip world position
  const tipV = new THREE.Vector3();
  function updatePhysics(dt) {
    now += dt;

    // ease actual -> target (stiffer servo at high sim speeds so the
    // machine keeps up with accelerated programs)
    const rate = 14 * state.servoBoost;
    const k = 1 - Math.exp(-dt * rate);
    ['x', 'y', 'z', 'c', 'a'].forEach(ax => { M[ax] += (T[ax] - M[ax]) * k; });

    applyKinematics();
    tipObj.getWorldPosition(tipV);

    // laser beam length follows tool axis down to table
    if (state.laser) {
      const len = Math.max(2, tipV.y - 0.5);
      laserBeam.scale.y = len;
      const pw = 0.5 + state.laserPower;
      laserBeam.material.opacity = 0.55 + 0.3 * Math.sin(now * 40);
      tipGlow.material.opacity = 0.75 + 0.25 * Math.sin(now * 55);
      tipGlow.scale.setScalar(22 + 10 * pw * (0.8 + 0.2 * Math.sin(now * 30)));
    }

    updateBeadColors();
    updateSparks(dt);
    updateSmoke(dt, tipV, state.laser);

    if (state.onDro) state.onDro(M, tipV, dt);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    updatePhysics(dt);

    // camera animation / chase
    if (camAnim) {
      camAnim.t += dt / 0.9;
      const e = Math.min(1, camAnim.t), s = e * e * (3 - 2 * e);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, s);
      controls.target.lerpVectors(camAnim.t0, camAnim.t1, s);
      if (e >= 1) camAnim = null;
    }
    if (state.chase) {
      const want = new THREE.Vector3(tipV.x + 420, tipV.y + 320, tipV.z + 420);
      camera.position.lerp(want, 1 - Math.exp(-dt * 3));
      controls.target.lerp(tipV, 1 - Math.exp(-dt * 3));
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // deterministic fast-forward (headless test / power users):
  // advances physics + program without waiting for frames
  function stepSim(seconds) {
    let remaining = Math.min(seconds || 0, 3600);
    while (remaining > 0) {
      const dt = Math.min(1 / 30, remaining);
      updatePhysics(dt);
      remaining -= dt;
    }
  }

  return {
    LIM, M, T, state,
    ARM_L, D2R,
    init, clampTarget, clampAxis, setActiveTool, setLaser,
    setCam, tipWorld, addBeadSegment, clearBeads, emitSpark,
    stepSim,
    get weldCount() { return weld.count; },
    get weldData() { return { pos: weld.pos, count: weld.count }; },
    get scene() { return scene; },
    get camera() { return camera; },
    get controls() { return controls; }
  };
})();
