PARCIAL (pase 5, ronda de CONTINUACIÓN sobre el PR #9): 5 hallazgos arreglados y pusheados; quedan ~24 ALTO, ~39 MEDIO y ~16 BAJO sin arreglar, y 3 CRÍTICOS que no son de código (C12, C4, C6). El siguiente de la pila es el contraste de los KPI del Resumen.

A media ronda Javier cambió la política: se arregla TODO lo reproducible, sin tope de vueltas (skill actualizada en `a3e3b5a`). Se arreglaron 2 más bajo la política nueva y la ronda cierra PARCIAL a propósito — bajo esa regla, dejar hallazgos reproducibles vivos es trabajo pendiente de la CORRIDA, no del código.

Ronda 17, pase 5, 12-ago-2026, corrida en la nube. 6 rubros reauditados de 12 —
frontend, backend, seguridad, fiscal, arquitectura y pruebas, los únicos cuyo
código cambió desde que se escribió su archivo. Los otros seis (agéntico, tool
calling, legal, operabilidad, rendimiento, modelo de datos) conservan su nota
del pase 4, marcados "no auditado este pase".

`master` NO avanzó ni un commit desde el pase 4 (`origin/master` = `003c88a`, y
es ancestro de esta rama). Lo único que cambió de código fueron los TRES
ARREGLOS DEL PROPIO PASE 4, que entraron después de que sus auditores
entregaran. Por eso este pase fue, sobre todo, su verificación independiente —
la que el pase 4 dejó explícitamente pendiente por escrito.

Global 4.8/10 (igual que el pase 4) — delta 0.0, y el empate es una mentira
estadística: CINCO de los seis rubros auditados se movieron. frontend +2 y
pruebas +1 contra backend −1, seguridad −1 y fiscal −1. Seis puntos-rubro de
movimiento que se cancelan en un promedio quieto.

Los tres arreglos del pase 4 CIERRAN, y los tres auditores lo midieron en vez de
leerlo (revirtiendo el commit en el árbol y contando fallos). Dos de ellos con
matiz: `12cc8c6` cerró un valor y no el modo de falla, y la prueba de `58c44f9`
sobrevivía a invertir la guarda que protege. Los dos matices se volvieron
arreglos hoy.

El hallazgo de la ronda: `aplicarFactura()` NO PODÍA ESCRIBIR NUNCA. `onConflict`
contra un índice único PARCIAL es 42P10, no un upsert — verificado dos veces
contra un Postgres 16.13 con el esquema real, y falla también con la tabla vacía.
Cada `invoice.paid` daba 500 y la flota quedaba pagada sin fila en `factura_saas`
ni CFDI que timbrarle. Cero pruebas lo tapaban: las dos suites de Stripe mockean
la función entera.

1 CRÍTICO cerrado con prueba que lo reproduce y 2 ALTO cerrados. 4 CRÍTICOS
quedan pendientes con razón escrita; 3 esperan decisión de producto y 1 es una
sesión de trabajo propia. Tope de 3 vueltas agotado. Ningún arreglo revertido.
Cero falsos: los tres hallazgos que arreglé los reproduje yo antes de tocar nada.

Tres correcciones entre auditores, anotadas en vez de silenciadas: fiscal
encontró que el commit del pase 4 encadenó mal `registro.ts → facturapi.ts` (son
dos ramas distintas); arquitectura recontó lo heredado y salió PEOR (43 símbolos
sin llamador, no 29); pruebas confirmó los conteos del pase 4 salvo uno.

Compuerta final: tsc 0 · vitest 263 archivos / 3,145 verdes / 1 saltada · eslint
0 errores, 17 warnings. Línea base al arrancar: 261 / 3,134 (idéntica al cierre
del pase 4). Sin `npm run build`: en la nube no hay credenciales.
Tablero renderizado y MIRADO (tablero.png, 1400×3420): 12 rubros contados, notas
cuadran con la síntesis (suma 57 → 4.8).

---

COMPLETA (pase 4, ronda de CONTINUACIÓN sobre el PR #9)

Ronda 17, pase 4, 11-ago-2026. 7 rubros reauditados de 12 — frontend, backend,
seguridad, fiscal, arquitectura, pruebas y rendimiento, los únicos cuyo código
cambió desde que se escribió su archivo. Los otros cinco (agéntico, tool
calling, legal, operabilidad, modelo de datos) conservan su nota del pase 3,
marcados "no auditado este pase": cero archivos suyos cambiaron en los 9 commits
que master avanzó.

Global 4.8/10 (antes 4.9) — baja 0.1, y el décimo miente por lo bajo: debajo hay
frontend cayendo DOS puntos y backend subiendo uno.

El cambio que mandó la ronda es un BORRADO: master quitó 35 páginas del panel
del cliente (+385 / −6,158) para rehacerlas desde cero. Cerró pantallas, no
bugs — arquitectura cerró CERO de sus 5 hallazgos por supresión, fiscal 4 de 16
y los 12 restantes viven en el motor — y estrenó dos modos de falla propios que
no existían anteayer.

108 fichas: 5 CRÍTICO · 44 ALTO · 39 MEDIO · 20 BAJO. El CRÍTICO nuevo lo
encontraron DOS auditores por separado (frontend y arquitectura).

1 CRÍTICO nuevo cerrado con prueba que lo reproduce (el panel se quedó sin
navegación: el contador con el menú literalmente vacío) y 2 ALTO cerrados, los
dos estrenados por el borrado. 4 CRÍTICOS quedan pendientes con razón escrita;
3 esperan decisión de producto y 1 es una sesión de trabajo propia.
Tope de 3 vueltas agotado. Ningún arreglo revertido — y uno RECHAZADO por la
suite antes de commitear, con 15 fallos, por poner la guarda en la capa
equivocada.

Un hallazgo verificado A LA BAJA: el auditor fiscal declaró que el régimen
reescrito apaga la facilidad del 15%, y es falso — la elegibilidad vive en
`tenant.config`, no en `regimen_fiscal`. El defecto sí es real y se arregló con
la consecuencia corregida. Cero falsos del todo.

También se corrigió una premisa MÍA: al despachar rendimiento le escribí que sus
214 consultas por carga había que recontarlas porque el borrado se llevaba el
60%. Volvió con 214 en el SSR y 244 por navegador: nunca vivieron ahí.

Compuerta final: tsc 0 · vitest 261 archivos / 3,134 verdes / 1 saltada · eslint
0 errores, 17 warnings. Línea base al arrancar: 258 / 3,105 (bajó 89 desde el
pase 3 porque esas pruebas se fueron con sus páginas, no por regresión).
Tablero renderizado y MIRADO (tablero.png, 1400×3900): 12 rubros contados, notas
cuadran con la síntesis (suma 57 → 4.8).

--- COMPLETA (pase 3, ronda de CONTINUACIÓN sobre el PR #9)

Ronda 17, pase 3, 10-ago-2026. 3 rubros reauditados de 12 — frontend, backend y
pruebas, los únicos cuyo código cambió desde que se escribió su archivo. Los
otros nueve conservan su nota del pase 2, marcados "no auditado este pase":
master avanzó UN commit desde el pase 2 y toca solo normas/.latido-vigilancia,
cero código, así que relanzar a los doce no habría producido señal.

Global 4.9/10 (igual que el pase 2) — delta 0.0, y el empate ES el hallazgo:
frontend +1 y backend -1 se cancelan.

1 CRÍTICO nuevo cerrado con prueba que lo reproduce (el lease del mutex más
corto que el turno que protege) y 2 ALTO cerrados, uno de ellos el arreglo del
pase 2 que se reabría solo al crecer la flota. 5 CRÍTICOS quedan pendientes con
razón escrita; 4 esperan decisión de producto y 1 es una sesión de trabajo propia.
Tope de 3 vueltas de arreglo agotado. Ningún arreglo revertido. Cero falsos.

Compuerta final: tsc 0 · vitest 260 archivos / 3,194 verdes / 1 saltada · eslint
0 errores, 18 warnings. Línea base al arrancar: 3,182.
Tablero renderizado y MIRADO (tablero.png): 12 rubros contados, notas cuadran
con la síntesis (suma 59 → 4.9).

--- COMPLETA (pase 2, ronda de CONTINUACIÓN sobre el PR #9)

Ronda 17, pase 2, 9-ago-2026. 11 rubros reauditados de 12 — tool calling no se
auditó porque cero archivos suyos cambiaron, y conserva su 7/10 por rotación.
Global 4.9/10 (antes 5.8 en el pase 1) — baja 0.9.
93 hallazgos con ficha: 7 CRÍTICO · 40 ALTO · 32 MEDIO · 14 BAJO.
2 CRÍTICOS nuevos cerrados con prueba que los reproduce; 5 pendientes con razón
escrita (4 de ellos esperan decisión de producto, no código).
Tope de 3 vueltas de arreglo agotado. Ningún arreglo revertido.
Compuerta final: tsc 0 · vitest 3,182 verdes (1 saltada) · eslint 0 errores.
Tablero renderizado y mirado (tablero.png): 12 rubros, notas cuadran con la síntesis.

--- pase 1 (8-ago-2026) ---
COMPLETA

Ronda 17, 8-ago-2026. 12 rubros auditados, 12 archivos entregados.
Global 5.8/10 (antes 7.2 en la ronda 13) — baja 1.4.
113 hallazgos: 7 CRÍTICO · 36 ALTO · 47 MEDIO · 23 BAJO.
3 CRÍTICOS cerrados con prueba que los reproduce; 4 pendientes con razón escrita.
Compuerta final: tsc 0 · vitest 3,159 verdes (1 saltada) · eslint 0 errores.
Tablero renderizado y mirado (tablero.png).
