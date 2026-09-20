# CNC 5-Axis Laser Welding Simulator

**▶ Live demo: https://mikeassistant07-bot.github.io/cnc-weld-simulator/**
(no install — runs in any browser: phone, tablet, laptop)

A browser-based simulator of a 3-axis CNC gantry machine (X 1200 mm × Y 1200 mm × Z 200 mm)
whose spindle carries a **5-axis gripper arm**. The arm has two extra rotary axes:

- **C — yaw**: rotate the whole arm around the vertical Z axis (±180°)
- **A — tilt**: tilt the arm around the horizontal axis (±75°)

The tool tip always stays on the commanded X/Y/Z point while the arm rotates around it
(RY-Z kinematic chain, like a welding robot wrist mounted in a milling gantry).

## Run it

The simulator is plain HTML/JS — no build step. Serve this folder and open it:

```
python3 -m http.server 8777
# open http://127.0.0.1:8777
```

(Three.js r128 + OrbitControls are bundled in `vendor/`, so it works fully offline.
Because `index.html` sits at the repo root, this repo can also be published
directly with GitHub Pages.)

## Quick start — weld the frame from the photo

1. Press **🔥 DEMO 1: Weld 2D Frame** (right sidebar) — generates G-code for a
   1200 × 800 mm window-frame grid (40 × 40 tubes, 3 × 3 cells: corner, T and
   cross joints, exactly like the welded frames in the reference photo).
2. Press **▶ START**. Watch the gantry weld all 20 seams; beads glow orange-hot
   and cool down. Use **Sim speed** up to 40× for fast runs.

## Demo 2 — vertical edge welding (A/C axes in play)

Press **📐 DEMO 2: Vertikale Kanten (A/C-Achsen)** — the head welds the
**vertical butt edges** of the frame tubes (the 40 mm high end-face seams at
the 4 corners, 8 T-joints and 8 cross-rail joints). Each seam needs its own
head orientation, so this program drives the rotary axes:

- `G1 A40 C135` tilts the gun 40° onto the vertical face and yaws the whole
  arm around Z to face the seam (every seam has its own C angle: 0, ±45, ±90,
  ±135, 180°)
- the tip then welds **up the vertical edge** (`G1 Z37 F350`) while the
  kinematics keep the tool tip exactly on the seam (RTCP)
- `G1 A0` returns the head to vertical for the rapid between seams

German-language program, also shipped standalone as `demos/frame_vertical_edges.nc`.

## Manual control (left sidebar)

| Control | Action |
|---|---|
| **X/Y joystick** | jog table X/Y (machine moves in world X / depth) |
| **Z joystick** | ram up/down (2–200 mm) |
| **Jog speed** | 5–300 mm/s |
| **C / A sliders** | arm yaw / tilt, plus C→0/90/180, A→0 presets |
| **Tool magazine** | T1 laser weld gun (Gweike Cloud type) · T2 Ø6 endmill · T3 gripper |
| **Laser power / LASER ON-OFF** | manual beam control (same as M3/M5) |
| Keyboard | `W/S` Y · `A/D` X · `R/F` Z · `Q/E` yaw C · `T/G` tilt A |
| Camera | ISO / FRONT / TOP / 🎥 CHASE (follows the tool) |

## G-code support

Upload any `.nc/.gcode/.ngc/.tap` file, paste your own, or edit the demo.

```
G0 G1 G2 G3        rapid / linear / CW arc / CCW arc (I J or R)
G4 P..             dwell          G17 XY plane
G20 / G21          inch / mm      G90 / G91  absolute / incremental
G28                home           G54 work offset
M0 pause · M2/M30 end · M3/M4 laser on · M5 laser off
M6 T1..T3          tool change    F feed · S power · A tilt (deg) · C yaw (deg)
```

5-axis example — weld while tilting the arm:

```gcode
G21 G90
T1 M6
G0 X100 Y100 Z60
M3 S80
G1 X400 Y100 Z41 A30 F1200   (weld while tilting arm to 30°)
G1 X400 Y400 Z41 C45         (keep welding, yaw the arm 45°)
M5
M30
```

Arc moves (`G2/G3`) sweep in the XY plane; Z, A and C helix along the arc.

## How the simulation works

- **Kinematics** (`js/machine.js`): gantry (Y) → saddle (X) → ram (Z) → C flange →
  A pitch → tool. The wrist pivot is positioned so the tool tip lands on the
  commanded point for any C/A combination.
- **Welding**: while the laser is on, beads are deposited along the commanded
  seam — white-hot at first, cooling to dark oxide over ~4 s. Sparks and smoke
  particles follow the real tool tip.
- **Program runner** (`js/gcode.js`): time-based interpolation with modal G-codes;
  manual jog is locked while a program runs.

## Files

```
index.html          UI shell (sidebars, joysticks, DRO, G-code panel)
js/machine.js       3D scene, machine model, kinematics, weld effects
js/gcode.js         G-code parser, motion runner, demo generators
js/app.js           UI wiring, joysticks, DRO, program transport
demos/frame_demo.nc standalone demo 1: top seams of the 2D frame
demos/frame_vertical_edges.nc  standalone demo 2: vertical edges (A/C)
scripts/            headless end-to-end tests (Chrome DevTools Protocol)
vendor/             three.min.js r128, OrbitControls.js (offline)
```

`index.html?autorun=demo` loads and starts the frame demo automatically,
`index.html?autorun=demo2` starts the vertical-edge demo.
