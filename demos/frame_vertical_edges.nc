; =====================================================
; DEMO 2 : VERTIKALNAHT-SCHWEISSEN (vertical edges)
; Der Kopf schweisst die senkrechten Stosskanten (40 mm)
; der Rahmenrohre. Dafuer kommen die Rundachsen zum
; Einsatz:  A = Brenner kippen  |  C = Arm schwenken.
; Jede Naht bekommt ihre eigene A/C-Orientierung.
; Naht: je Kante Z3 -> Z37 (34 mm), F350
; =====================================================
G21 G90 G17 G54            (mm, absolut, XY-Ebene)
T1 M6                      (Laser-Schweissbrenner T1)
G0 X0 Y0 Z100              (Sicherheitsgoeshoehe)

; ============ RAHMENECKEN (Fasen-Ø 45° von innen) ============
; --- Ecke oben-links  (-580, -380), C=135°
G1 A40 C135 F1500        (Kopf kippen + schwenken)
G0 X-580 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Ecke oben-rechts ( 580, -380), C= 45°
G1 A40 C45 F1500        (Kopf kippen + schwenken)
G0 X580 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Ecke unten-rechts( 580,  380), C=-45°
G1 A40 C-45 F1500        (Kopf kippen + schwenken)
G0 X580 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Ecke unten-links (-580,  380), C=-135°
G1 A40 C-135 F1500        (Kopf kippen + schwenken)
G0 X-580 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; ============ STEG -> OBERRAHMEN (Y=380, Blick +Y) ============
; --- Steg X-220 an Oberrahmen, C=-90°
G1 A40 C-90 F1500        (Kopf kippen + schwenken)
G0 X-220 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X-180 an Oberrahmen, C=-90°
G1 A40 C-90 F1500        (Kopf kippen + schwenken)
G0 X-180 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X180 an Oberrahmen, C=-90°
G1 A40 C-90 F1500        (Kopf kippen + schwenken)
G0 X180 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X220 an Oberrahmen, C=-90°
G1 A40 C-90 F1500        (Kopf kippen + schwenken)
G0 X220 Y380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; ============ STEG -> UNTERRAHMEN (Y=-380, Blick -Y) ============
; --- Steg X-220 an Unterrahmen, C=90°
G1 A40 C90 F1500        (Kopf kippen + schwenken)
G0 X-220 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X-180 an Unterrahmen, C=90°
G1 A40 C90 F1500        (Kopf kippen + schwenken)
G0 X-180 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X180 an Unterrahmen, C=90°
G1 A40 C90 F1500        (Kopf kippen + schwenken)
G0 X180 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Steg X220 an Unterrahmen, C=90°
G1 A40 C90 F1500        (Kopf kippen + schwenken)
G0 X220 Y-380 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; ============ QUERSTAB -> LINKER RAHMEN (X=-580, Blick -X) ============
; --- Querstab Y-153.33 links, C=180°
G1 A40 C180 F1500        (Kopf kippen + schwenken)
G0 X-580 Y-153.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y-113.33 links, C=180°
G1 A40 C180 F1500        (Kopf kippen + schwenken)
G0 X-580 Y-113.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y113.33 links, C=180°
G1 A40 C180 F1500        (Kopf kippen + schwenken)
G0 X-580 Y113.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y153.33 links, C=180°
G1 A40 C180 F1500        (Kopf kippen + schwenken)
G0 X-580 Y153.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; ============ QUERSTAB -> RECHTER RAHMEN (X=580, Blick +X) ============
; --- Querstab Y-153.33 rechts, C=0°
G1 A40 C0 F1500        (Kopf kippen + schwenken)
G0 X580 Y-153.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y-113.33 rechts, C=0°
G1 A40 C0 F1500        (Kopf kippen + schwenken)
G0 X580 Y-113.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y113.33 rechts, C=0°
G1 A40 C0 F1500        (Kopf kippen + schwenken)
G0 X580 Y113.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; --- Querstab Y153.33 rechts, C=0°
G1 A40 C0 F1500        (Kopf kippen + schwenken)
G0 X580 Y153.33 Z60
G1 Z3 F800                (an Kante absenken)
M3 S100                      (Laser EIN)
G1 Z37 F350              (VERTIKALNAHT nach oben)
M5                           (Laser AUS)
G0 Z60
G1 A0 F1500                  (Kopf wieder senkrecht)

; ============ FERTIG ============
G0 X0 Y0 Z100
M5
M30                        (Programmende)
