; =====================================================
; DEMO : LASER WELD 2D WINDOW FRAME  1200 x 800 mm
; 40x40 square tubes - 3x3 grid (corner + T + cross joints)
; Tool  : T1 hand-held laser welding gun (Gweike type)
; Fields: G21 mm / G90 abs / workpiece top surface Z=40
; =====================================================
G21 G90 G17 G54            (mm, absolute, XY plane)
T1 M6                      (mount laser welding gun)
G0 X0 Y0 Z100              (safe height)

; ============ OUTER CORNERS (L-welds) ============
; --- corner TL top rail
G0 X-555 Y400 Z70
G1 X-555 Y400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner TL side rail
G0 X-600 Y355 Z70
G1 X-600 Y355 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner TR top rail
G0 X555 Y400 Z70
G1 X555 Y400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner TR side rail
G0 X600 Y355 Z70
G1 X600 Y355 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner BL top rail
G0 X-555 Y-400 Z70
G1 X-555 Y-400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner BL side rail
G0 X-600 Y-355 Z70
G1 X-600 Y-355 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner BR top rail
G0 X555 Y-400 Z70
G1 X555 Y-400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- corner BR side rail
G0 X600 Y-355 Z70
G1 X600 Y-355 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; ============ VERTICALS -> TOP/BOTTOM RAILS (T-welds) ============
; --- vertical X-200 to top rail
G0 X-245 Y400 Z70
G1 X-245 Y400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-155 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- vertical X-200 to bottom rail
G0 X-245 Y-400 Z70
G1 X-245 Y-400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-155 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- vertical X200 to top rail
G0 X155 Y400 Z70
G1 X155 Y400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X245 Y400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- vertical X200 to bottom rail
G0 X155 Y-400 Z70
G1 X155 Y-400 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X245 Y-400 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; ============ HORIZONTALS -> SIDE RAILS (T-welds) ============
; --- horizontal Y-133 to left rail
G0 X-600 Y-178.33 Z70
G1 X-600 Y-178.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y-88.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- horizontal Y-133 to right rail
G0 X600 Y-178.33 Z70
G1 X600 Y-178.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y-88.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- horizontal Y133 to left rail
G0 X-600 Y88.33 Z70
G1 X-600 Y88.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-600 Y178.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- horizontal Y133 to right rail
G0 X600 Y88.33 Z70
G1 X600 Y88.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X600 Y178.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; ============ CROSS JOINTS (4 fillet passes each) ============
; --- cross joint X-200 / Y-133
; --- cross X-pass
G0 X-245 Y-133.33 Z70
G1 X-245 Y-133.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-155 Y-133.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross Y-pass
G0 X-200 Y-178.33 Z70
G1 X-200 Y-178.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-200 Y-88.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross joint X-200 / Y133
; --- cross X-pass
G0 X-245 Y133.33 Z70
G1 X-245 Y133.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-155 Y133.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross Y-pass
G0 X-200 Y88.33 Z70
G1 X-200 Y88.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X-200 Y178.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross joint X200 / Y-133
; --- cross X-pass
G0 X155 Y-133.33 Z70
G1 X155 Y-133.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X245 Y-133.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross Y-pass
G0 X200 Y-178.33 Z70
G1 X200 Y-178.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X200 Y-88.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross joint X200 / Y133
; --- cross X-pass
G0 X155 Y133.33 Z70
G1 X155 Y133.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X245 Y133.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70
; --- cross Y-pass
G0 X200 Y88.33 Z70
G1 X200 Y88.33 Z41 F2500     (plunge to seam)
M3 S100                    (laser ON)
G1 X200 Y178.33 Z41 F1500     (weld)
M5                         (laser OFF)
G0 Z70

; ============ DONE ============
G0 X0 Y0 Z100
M5
M30                        (program end)
