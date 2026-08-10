# Auditoría 17 — síntesis · pase 3 · 10-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre `claude/auditoria-17`,
así que esta corrida continuó sobre él en vez de abrir uno nuevo. Árbol limpio al
arrancar (HEAD detached en `53c9d49`) → autofix habilitado.

> Las síntesis de los pases 1 y 2 siguen íntegras más abajo.

## Nota global: 4.9/10 (igual que el pase 2) — **= 0.0**

Y el empate es el hallazgo, no la ausencia de uno. **Frontend subió 1 y backend
bajó 1, y se cancelaron.** Un promedio quieto puede esconder dos movimientos
grandes en direcciones opuestas; por eso la tabla manda sobre el número.

Lo que pasó de verdad en este pase es más interesante que el 4.9:

1. **Los arreglos del pase 2 sí sirvieron** — un auditor que no los escribió los
   abrió uno por uno y confirmó que cierran. Frontend cierra su primer pase en
   cuatro rondas **sin un solo CRÍTICO**.
2. **Y al mirar de cerca apareció lo que llevaba rondas invisible:** un CRÍTICO
   de concurrencia que ninguna ronda anterior había tocado, y dos formas en que
   los arreglos del pase 2 quedaron a medio camino.

**`master` avanzó un solo commit desde el pase 2** (`20ecbb1` → `53c9d49`) y toca
únicamente `normas/.latido-vigilancia`: **cero código**. Por eso se relanzaron
**3 de 12** rubros — los que cambiaron desde que se escribió su archivo— y los
otros nueve conservan su nota marcados *no auditado este pase*.

| Rubro | p2 | p3 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 4 | **5** | ▲ | **se atacó y subió**: `d7b71a8` y `e47b124` cierran de verdad, verificados por quien no los escribió |
| Backend y API | 5 | **4** | ▼ | **mirada más profunda**: el lease del mutex (60s) era más corto que el turno que protege (72s documentados) y nadie lo había mirado nunca |
| Agéntico | 4 | **4** | = | *no auditado este pase* |
| Tool calling | 7 | **7** | = | *no auditado* — cero archivos del rubro cambiaron desde `94c0733` (2 pases por rotación) |
| Seguridad | 6 | **6** | = | *no auditado este pase* |
| Fiscal | 5 | **5** | = | *no auditado este pase* |
| Legal | 3 | **3** | = | *no auditado este pase* |
| Arquitectura | 5 | **5** | = | *no auditado este pase* |
| Pruebas | 5 | **5** | = | **se atacó y subió** (los 3 arreglos del PR mueren al revertirlos) compensado por **deuda que cobró factura** (C6 en su tercer pase idéntico) |
| Operabilidad | 5 | **5** | = | *no auditado este pase* |
| Rendimiento | 4 | **4** | = | *no auditado este pase* |
| Modelo de datos | 6 | **6** | = | *no auditado este pase* |

## Por qué la nota de backend BAJA en el pase donde su arreglo funcionó

Merece decirse claro porque parece una contradicción. `709e410` cerró su CRÍTICO
y el auditor lo confirmó: falla cerrado de verdad, no quema el sello, no deja
secuela en el cron. Aun así el rubro baja de 5 a 4, y la razón escrita es
**mirada más profunda**: el CRÍTICO del lease del mutex **no es nuevo en el
código** —lleva ahí desde que existe el mutex—, es nuevo en *lo que sabemos*.
Un rubro cuya nota sube porque arregló lo que él mismo rompió, mientras arrastra
un defecto de concurrencia que nadie había buscado, es exactamente la nota
inflada que esta serie existe para desinflar.

## Los arreglos de este pase (3) — tope de 3 vueltas agotado

**C11 · [backend] El lease del mutex era más corto que el turno que protege** — `3404616`
`conv.ts:419` pedía el candado con `p_ttl_ms = 60_000`. `presupuesto.ts:188-190`
documenta un peor caso de **~72s** para el turno que ese candado serializa
(lock ≤12s + intake 20s + cuadre ~40s), dentro de una invocación presupuestada a
120s, y `processor.ts:1751` nunca pasaba `ttlMs`. El fallo no es ruidoso: **el
lease vence solo**. A los 60s `try_lock_viaje` considera el viaje libre, un
segundo mensaje entra al ciclo completo mientras el primero sigue cuadrando, y
los dos cierran. Ninguno lanza —`guardar_liquidacion` no mira `viaje.estatus`,
el `on conflict do update` de la 0013 sobrescribe la fila, el `upsert: true`
sobrescribe el PDF—, así que los dos reportan éxito: el chofer se queda con un
PDF de $5,600 y la base con $7,000. La doble liquidación que la 0005 existe para
impedir, causada por el reloj del propio candado.
Prueba: `conv_lock_expira.test.ts` (5 casos) — sin el arreglo fallan 2
(`expected 60000 to be greater than or equal to 72000`). Fija la **invariante**,
no el número: si alguien sube el techo del agente sin subir el lease, se pone rojo.

**A · [frontend] «Ahorro generado» inventaba un cero** — `b9a191c` · ALTO AGRAVADO
`page.tsx:274` seguía con `resumenPerdidas?.montoRecuperable ?? 0`, dos celdas a
la derecha de la que `e47b124` arregló en el mismo grid. `resumenPerdidas` es
null exactamente cuando `cfgFiscal` o `gastosFiscales` vinieron nulos, y esos
salen de `safe()`, que se come el fallo de la consulta: el `?? 0` no cubría "la
flota no ahorró nada", cubría **"no se pudo leer"**. Con el motor fiscal caído el
panel del dueño pintaba `Ahorro generado — Ejercicio 2026   $0.00` en el KPI que
ES el diferenciador del producto, sin banda de aviso.
Prueba: `ahorro_sin_dato.test.ts` (3 casos), verificada en las dos direcciones.

**A · [backend] El arreglo del pase 2 se reabría solo en una flota grande** — `ea23059`
La consulta de comprobación que agregó `709e410` no llevaba `limit`, ni `range`,
ni `count`, ni pasaba por `traerTodo` — y su propio comentario afirmaba que "se
pide `limit` amplio". Sin acotar, PostgREST aplica `max_rows` (1,000) y **recorta
en silencio**. Con 100 viajes abiertos de 12 gastos son 1,200 filas: los gastos
de los últimos **16 viajes** quedaban fuera del `Set`, esos viajes se leían como
"sin un solo comprobante", y a sus choferes les salía por WhatsApp la acusación
falsa que el pase 2 acababa de cerrar — mientras el panel del contralor mostraba
sus doce recibos. Peor que el original, porque ahora había una consulta que
"comprueba" dando falsa confianza.
Prueba: `recordatorio_lote_truncado.test.ts` (4 casos) — sin el arreglo fallan 3
(`expected 1000 to be 1200`), con dos controles: que el escenario exceda el tope
de verdad, y que un viaje SIN gastos se siga señalando.

## Los 5 CRÍTICOS pendientes — con la razón

Ninguno es un arreglo de código pendiente por falta de ganas; **cuatro esperan
una decisión de producto** y el quinto es una sesión de trabajo propia.

- **C6 · [pruebas] El callback de QStash emite CFDI sin una sola prueba** —
  REINCIDENTE, **tercer pase idéntico**. Re-verificado en vivo hoy con mutante
  doble (verificación de firma desactivada **y** sin re-validar `cfdi_uuid`):
  **3,182 pruebas siguen verdes**, tsc y lint limpios. *Razón:* el arreglo es
  escribir el arnés de un endpoint que factura de verdad; sesión propia.
- **C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** —
  *Razón:* el denominador correcto exige un dato que el producto no tiene.
- **C5 · [legal] La foto viaja al modelo externo antes del aviso** —
  *Razón:* mover el bloqueo cambia el flujo de huérfanos (mig. 0040).
- **C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta** —
  REINCIDENTE AGRAVADO. Verificado hoy: `avisarCierreAlJefe` sigue **fuera** de
  `PASOS_CIERRE` y `MARGEN_CIERRE_MS` sigue en 12,000. *Razón:* subir el margen
  le quita techo al agente, y eso tiene efecto en el demo.
- **C10 · [legal] Likida hace el PRIMER contacto por WhatsApp sin aviso** —
  REINCIDENTE, 5 pases. *Razón:* texto de aviso y canal de baja; producto y abogado.

## Descartados

**Ninguno de este pase resultó falso.** Los tres hallazgos que se arreglaron se
abrieron uno por uno contra el código antes de anotarlos, y los tres son reales.
Lo que sí hubo fue una hipótesis que el propio auditor de pruebas cerró **a favor
del código**, y vale tanto como un hallazgo: `repo_escritura.test.ts:124` **sí
caza** el cambiazo comprobado↔anticipo y `p_ieps`←IVA en `saveLiquidacion`
(`1 failed | 3181 passed`). La *escritura* del dinero está anclada de verdad.
De 11 mutaciones intentadas, 7 sobrevivieron; las 11 se revirtieron una por una y
el árbol quedó limpio.

## Lo que este pase dice del proceso

- **Un arreglo verificado no es un arreglo completo.** Los dos arreglos de
  frontend del pase 2 cierran lo que dicen cerrar, y los dos dejaron trabajo a
  medias a dos celdas de distancia: el mismo commit que habilitó `number | null`
  no lo aplicó al llamador de su propia fila. Sale solo cuando el que revisa no
  es el que arregló.
- **Un arreglo puede reabrir el bug que cerró, a otra escala.** La consulta de
  comprobación era correcta para 8 viajes y falsa para 100. El comentario decía
  que estaba acotada y no lo estaba: la prosa de un commit no es evidencia.
- **El «arnés que aparenta» se reprodujo dentro de este mismo PR.** La prueba de
  `d7b71a8` cubre la regla (`rail-marca.ts`, 100%) y no el cableado
  (`rail.tsx`, 0%), que es donde vivía el bug: se puede devolver el CRÍTICO
  entero y la suite sigue verde. Queda como ALTO propuesto.
- **El árbol de trabajo es compartido.** Los auditores corren sobre el mismo
  checkout y el de pruebas hace mutaciones en vivo; durante esa ventana
  `git status` muestra archivos de producción modificados que no son de nadie
  que esté arreglando nada. La suite de la primera vuelta se corrió en un
  `git worktree` aparte por eso. **Nunca se commiteó un archivo mutado.**

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 260 archivos, 3,194 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que las tres líneas base)
```

Línea base al arrancar el pase 3: **3,182** verdes (idéntica al cierre del pase 2,
sin deriva). Los tres arreglos sumaron **12** pruebas y ninguno se revirtió: los
tres pasan la suite completa y los tres fallan sin su cambio, verificado
corriendo la prueba **antes** del arreglo.

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Lo que NO se hizo, y hay que decirlo

- **Nueve rubros no se auditaron.** No es descuido: `master` no movió una línea
  de código desde el pase 2, y repetir un auditor sobre código idéntico no
  produce señal. Sus notas son del pase 2, no de hoy.
- **Tool calling lleva dos pases sin auditar** por rotación. Su 7/10 es el más
  alto de la tabla y el menos reciente: conviene relanzarlo en la ronda 18
  aunque su código no cambie, para que la nota no descanse indefinidamente.
- **Backend y frontend se recalificaron con los arreglos de HOY sin auditar.**
  Los tres commits de este pase (`3404616`, `b9a191c`, `ea23059`) entraron
  después de que sus auditores escribieran. Se remiden en la 18.
- **Los 4 ALTO nuevos del auditor de pruebas quedan propuestos**, no arreglados:
  el tope de 3 vueltas se agotó con el CRÍTICO y los dos ALTO de mayor daño.

---
---

# Auditoría 17 — síntesis · pase 2 · 9-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre
`claude/auditoria-17`, así que esta corrida continuó sobre él en vez de abrir
uno nuevo. Árbol limpio al arrancar → autofix habilitado. 11 auditores con
contexto fresco, en paralelo, sobre `origin/master` = `20ecbb1` mergeado a la
rama.

> La síntesis del pase 1 (8-ago) sigue íntegra más abajo. Esto es lo que cambió
> en un día.

## Nota global: 4.9/10 (antes 5.8 en el pase 1) — **baja 0.9**

**El código no se pudrió en 24 horas.** Bajó porque en ese día `master` avanzó
**12 commits** con superficie genuinamente nueva —el rework del dashboard del
dueño, el recordatorio automático por WhatsApp y el retiro del rol `operador`—
y esa superficie llegó **sin arnés y sin la letra chica** que el resto del
producto sí tiene. De los 93 hallazgos con ficha propia de este pase, la
mayoría de los ALTO nuevos viven en código escrito en los últimos dos días.

Dicho de otra forma: este pase no midió un producto que empeoró, midió
**funcionalidad nueva entrando más rápido de lo que se ancla**. Es exactamente
el patrón que la serie histórica existe para hacer visible.

| Rubro | p1 | p2 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 6 | **4** | ▼ | deuda que cobró factura: los 5 reincidentes siguen textualmente iguales y los 5 componentes nuevos entraron con 0 pruebas de render |
| Backend y API | 6 | **5** | ▼ | deuda que cobró factura: el camino nuevo del recordatorio repitió la ceguera del anterior (afirmar sin comprobar, 200 con fallos dentro) |
| Agéntico | 5 | **4** | ▼ | deuda que cobró factura: un actor nuevo en el ciclo (el recordatorio) sin cierre definido hacia el humano |
| Tool calling | 7 | **7** | = | **no auditado este pase** — cero archivos del rubro cambiaron |
| Seguridad | 7 | **6** | ▼ | mirada más profunda: el contador "de solo lectura" puede ESCRIBIR 19 tablas por PostgREST, incluida la bitácora que lo delataría |
| Fiscal | 4 | **5** | ▲ | **se atacó y subió**: C3 cerrado (régimen 624 = Coordinados) y media superficie del ALTO del peaje |
| Legal | 4 | **3** | ▼ | deuda que cobró factura: primer contacto por WhatsApp sin aviso, y se borró el único código que implementaba el derecho de acceso |
| Arquitectura | 6 | **5** | ▼ | deuda que cobró factura: "periodo" definido cuatro veces y `hoy` calculado en UTC para ocho funciones que lo declaran en hora de México |
| Pruebas | 6 | **5** | ▼ | mirada más profunda: 6 de 8 mutantes no equivalentes sobrevivieron, y apareció la **primera prueba intermitente del repo** |
| Operabilidad | 6 | **5** | ▼ | deuda que cobró factura: el cron nuevo responde 200 con 40 fallos dentro y pierde la lista de cuáles |
| Rendimiento | 5 | **4** | ▼ | deuda que cobró factura: 214 consultas por carga de `/dashboard` y el cron a 510 s nominales contra un `maxDuration` de 120 |
| Modelo de datos | 7 | **6** | ▼ | deuda que cobró factura: tres bloques de `verificaciones.sql` abortan hoy y el test los sigue contando como comprobación |

**93 hallazgos con ficha propia: 7 CRÍTICO · 40 ALTO · 32 MEDIO · 14 BAJO**,
más los reincidentes que cada auditor lleva en su tabla de estado sin abrirles
ficha nueva.

**Fiscal es el único que sube, y sube por la única razón que vale:** hay commits
de la ronda anterior que cerraron un hallazgo suyo, verificados contra el código
por un auditor que no fue quien los escribió.

## Los 7 CRÍTICOS, uno por uno

Sin cuarta opción: commiteado con prueba, `pendiente` con razón, o `descartado`.

### Cerrados en este pase (2)

**C8 · [frontend] El panel del dueño se queda en blanco al volver del chat expandido** — `d7b71a8`
`globals.css:217` retira `.columna-centro` (`opacity: 0` + `pointer-events:
none`) mientras la raíz lleve `data-asistente="expandido"`. `rail.tsx` ponía esa
marca mirando **solo** `expandido` y la limpiaba en el `return` del efecto, que
corre al **desmontar**. En `/dashboard` el rail devuelve `null` —el Resumen va a
ancho completo— y renderizar `null` **no** desmonta: la limpieza nunca corría.
Dos clics del flujo normal del demo (expandir el chat en `/dashboard/cuadre`,
luego "Resumen" en el sidebar, que sigue clickeable bajo el chat) dejaban el
panel del dueño invisible y sin un solo control para revertirlo. A cualquier
resolución, delante del contralor.
Prueba: `rail_marca.test.ts` (4 casos, con control) — con la regla vieja fallan 2.

**C9 · [backend] El recordatorio afirmaba "sin mandarme comprobantes" sin haber mirado uno solo** — `709e410`
`viajesSinComprobar` seleccionaba por estatus + fecha + sello y nunca preguntaba
si el viaje traía gastos, pero el texto que sale afirma un hecho. El viaje del
seed del demo es exactamente ese caso: `VJ-2026-0001`, abierto, **dos gastos
precargados** ($4,200 de diésel entre ellos) y un operador cuyo teléfono es
`529993700779`, el número real del demo por WhatsApp. Tres días después de
sembrar, el cron le reclama al teléfono del demo mientras el panel de al lado
muestra los dos comprobantes. Con una flota real, el chofer que mandó doce
recibos y sigue en carretera recibe una reclamación falsa firmada por el
producto que su patrón acaba de comprar.
Prueba: 4 casos nuevos en `recordatorio_comprobacion.test.ts`, incluido el de
fallo cerrado — sin el arreglo fallan 3.

### Pendientes (5) — con la razón

**C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** — REINCIDENTE
`engine.ts:337,354` · `repo.ts:831-834`. **Razón:** el denominador correcto
exige un dato que el producto no tiene (el combustible que NO pasó por Likida).
Es decisión de producto —declarar el supuesto en el PDF o capturar el total del
ejercicio—, no un arreglo de código. Se propone, no se inventa.

**C5 · [legal] La foto viaja al modelo externo antes del aviso** — REINCIDENTE
`processor.ts:470` · `:522-525` contra el bloqueo de `:636`. **Razón:** mover el
bloqueo antes del intake cambia el flujo de huérfanos (mig. 0040) y puede dejar
fotos sin recoger. Cambio de diseño del ciclo, no de una línea.

**C6 · [pruebas] El callback de QStash emite CFDI y no tiene una sola prueba** — REINCIDENTE
`api/cron/facturar/cola/route.ts:40`, 0% de cobertura. **Razón:** el arreglo es
escribir el arnés de un endpoint que factura de verdad; sesión propia, no una
vuelta de auditoría.

**C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta** — REINCIDENTE, AGRAVADO
`presupuesto.ts`. El tramo creció 500 ms con el arreglo del pase 1 y la reserva
no se movió: **13,700 ms nominales contra `MARGEN_CIERRE_MS = 12,000`.**
**Razón:** subir el margen le quita techo al agente, y eso tiene efecto en el
demo. Decisión de producto.

**C10 · [legal] Likida hace el PRIMER contacto por WhatsApp sin aviso** — NUEVO
`operacion.ts:585` → `notificar.ts:170`, contra `normas/lfpdppp-15-16.yaml:59-61`.
Y por **plantilla**, que sí entrega fuera de la ventana de 24 h. **Razón:** el
arreglo es texto de aviso + un canal de baja, no código; requiere producto y
abogado. Mismo expediente que el ToS, reincidente desde hace cinco pases.

## Descartados

Ninguno de los 7 críticos. Los 3 nuevos se abrieron uno por uno contra el código
antes de anotarlos y los 3 son reales. Lo que sí hubo fueron **dos hipótesis que
los propios auditores refutaron** con el guardarraíl que ya existía, y eso vale
tanto como un hallazgo:

- *mis-routing por dos viajes abiertos del mismo operador* → lo cierra
  `uq_viaje_abierto_por_operador` (mig. 0029).
- *la mig. 0086 aflojó el aislamiento al quitar `and not is_operador()` de ~20
  policies* → **no**: `is_operador()` era `rol='operador'`, siempre falso para
  los cuatro roles que quedan, así que quitarlo es un no-op algebraico. Se leyó
  policy por policy antes de descartarlo.

## Un arreglo del pase 1 que dejó secuela

El auditor agéntico encontró que, tras cerrar C1 (el PDF del contralor), existe
un camino donde **el cierre es limpio, el PDF del contralor no se genera, al
jefe no le llega nada, y el log afirma que sí le llegó**. Queda como ALTO
abierto, y se anota aquí porque es la clase de hallazgo que solo aparece cuando
el auditor del pase siguiente no es quien hizo el arreglo.

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 257 archivos, 3,182 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que la línea base)
```

Línea base al arrancar el pase 2: 3,168 verdes. Los tres arreglos sumaron 14
pruebas y ninguno se revirtió: los tres pasaron la suite completa y los tres
fallan sin su cambio, verificado corriendo la prueba **antes** del arreglo.

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Dos cosas que este pase dice del proceso

- **La referencia contra la que mides puede estar podrida.** El `origin/master`
  del clon apuntaba a una historia **sin ancestro común** con la línea viva
  (`git merge-base` devolvía vacío). Medido contra ella, el delta del día era
  "494 archivos, −50,315 líneas". Un `git fetch origin master` lo corrigió.
  Auditar ese diff habría producido una ronda entera de hallazgos sobre código
  que nadie borró.
- **Dos migraciones se llamaron `0086` al mismo tiempo**, una en master y otra en
  la rama de auditoría, y nada en el repo lo detecta: se aplican en orden
  indefinido. Se renumeró la de la auditoría a `0088`. Que la colisión solo se
  vea al mergear es, en sí, un hallazgo del modelo de datos.

## Lo que NO se hizo, y hay que decirlo

- **Frontend y backend se calificaron ANTES** de que entraran los tres arreglos
  de este pase. Sus notas (4 y 5) no reflejan esos cierres. La regla del modo
  desatendido permite relanzar **un** rubro reauditado por ronda; no se usó, para
  no gastar la ventana en subir un número en vez de encontrar algo. Se remide en
  la ronda 18.
- **Tool calling no se auditó.** Conserva 7/10 por rotación, no por revisión.
- Los **4 CRÍTICOS pendientes** de fiscal, legal, pruebas y rendimiento llevan
  entre uno y cinco pases abiertos, y **ninguno es un arreglo de código**: los
  cuatro esperan una decisión de producto. Ese es hoy el cuello de botella real
  de esta rutina, no la capacidad de encontrar bugs.

---
---

# Auditoría 17 — síntesis · 8-ago-2026

**Ronda COMPLETA.** 12 auditores con contexto fresco, en paralelo, sobre
`94c0733`. Árbol limpio al arrancar → autofix habilitado. Rama
`claude/auditoria-17`, sin tocar `master`.

## Nota global: 5.8/10 (antes 7.2 en la ronda 13) — **baja 1.4**

Y esa bajada es el resultado de la ronda, no un accidente. **El código no
empeoró en tres días.** Bajó porque:

1. **La ronda 16 declaró cerrado el ciclo de auditoría** ("el loop cierra aquí")
   y dos de sus afirmaciones no se sostuvieron al comprobarlas contra el código:
   - *"el barrido anual del 15% ya es un SUM en SQL (mig. 0084)"* — la migración
     existe, pero **nadie la llama**: `grep -rn sumar_combustible src/` solo
     encuentra la cadena dentro de un test. `getAcumuladoCombustible`
     (`repo.ts:803-836`) sigue paginando hasta 100 páginas en el camino caliente.
   - *"la válvula del 15% ya no se ofrece a cualquier tenant"* — cierto como
     compuerta, pero quedó conectada al **código de régimen equivocado**.
2. **La mirada fue más profunda en tres rubros** que llevaban rondas sin que
   nadie recorriera su ciclo completo (agéntico, legal, rendimiento).

Las rondas 14, 15 y 16 no regrabaron los 12 rubros —fueron de arreglo—, así que
el delta se mide contra la **13**, la última con tabla completa.

| Rubro | R13 | R17 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 8 | **6** | ▼ | mirada más profunda + deuda que cobró factura: dos rótulos que mienten ("Vencen pronto ≤5 días" cuenta solo lo ya vencido; "Comprobación del periodo" no filtra por fecha) y el asistente <1280 px REINCIDENTE |
| Backend y API | 7 | **6** | ▼ | deuda que cobró factura: QStash entró al camino del dinero sin una sola prueba; el cron responde `corrio: true` cuando solo encoló |
| Agéntico | 8 | **5** | ▼ | mirada más profunda — la nota anterior estaba inflada: el ciclo nunca se había recorrido punto por punto. CRÍTICO del PDF del contralor + "Listo 👍" sin mutación |
| Tool calling | 7 | **7** | = | se atacó y subió (la regla `properties:{}` se respeta en todas las tools, verificado), compensado por 5 MEDIO acumulados |
| Seguridad | 8 | **7** | ▼ | mirada más profunda: sin camino sin autenticar a datos de un tenant, pero el callback público de QStash es frontera nueva y `operador_sube_su_pod` sigue |
| Fiscal | 6 | **4** | ▼ | deuda que cobró factura + mirada más profunda: **dos sitios donde el producto imprime una cifra fiscal equivocada**; 7 de 11 no-críticos son REINCIDENTES verificados |
| Legal | 7 | **4** | ▼ | deuda que cobró factura: ToS reincidente 4 rondas, ARCO con dos reglas de plazo, y la foto del operador viaja al modelo externo antes del aviso |
| Arquitectura | 7 | **6** | ▼ | deuda que cobró factura: la verdad duplicada volvió a ocurrir (bloque "Acreditable" reimplementa `filasAcreditables` y perdió tres advertencias legales) |
| Pruebas | 7 | **6** | ▼ | mirada más profunda: **10 experimentos de mutación, 6 sobrevivieron**. El motor de cuadre está anclado; el anillo que lo rodea, no |
| Operabilidad | 7 | **6** | ▼ | deuda que cobró factura: `seed.sh` sigue, y el sondeo de arranque soltaba un mutex ajeno |
| Rendimiento | 7.5 | **5** | ▼ | deuda que cobró factura: el ALTO del cron lleva 4 rondas, el 0084 nunca se llamó, y el cierre no cabe en su propia reserva |
| Modelo de datos | 7 | **7** | = | se atacó y subió (`operador_sube_su_pod` cerrado y verificado en `0081:15-19`), compensado por las 0082/0083/0085 que borran el `search_path` de `config_tenant_valida` |

**113 hallazgos: 7 CRÍTICO · 36 ALTO · 47 MEDIO · 23 BAJO.**

## Los 7 CRÍTICOS, uno por uno

Sin cuarta opción: commiteado con prueba, `pendiente` con razón, o `descartado`.

### Cerrados en esta ronda (3)

**C1 · [agéntico] Al contralor le llegaba el PDF censurado del operador** — `0d6bea7`
`processor.ts:2111` firmaba `{viaje}-operador.pdf` (filtrado con `SOLO_CONTRALOR`
para que el chofer no lea `cfdi_efos`/`cfdi_cancelado`/`rfc_receptor`) y reusaba
**esa misma liga** para `avisarCierreAlJefe`. A la oficina le llegaba un texto que
sí nombra "proveedor en lista 69-B" con un PDF adjunto que no trae esa línea, y
que contradice al que se baja del panel. En **todo** cierre.
Prueba: `cierre_pdf_del_jefe.test.ts` (3 casos) — sin el arreglo falla en 2.

**C2 · [operabilidad] El sondeo de arranque liberaba el mutex de un viaje ajeno** — `61cf600`
`unlock_viaje` (mig. 0005) es un `delete` sin token de dueño. El probe llamaba
`try_lock_viaje(viaje_real, 1ms)` y luego `unlock_viaje` **incondicionalmente**.
Si otra invocación tenía el lease, `try_lock` devuelve `false` —no un error, así
que nada se reportaba— y el probe le borraba el lock: el siguiente mensaje del
lote entra a liquidar en paralelo. La doble liquidación que la 0005 existe para
impedir, causada por el probe que la verifica.
Prueba: `startup_mutex_ajeno.test.ts` (3 casos, con control).

**C3 · [fiscal] La facilidad del 15% se abría al régimen equivocado** — `37612f1`
RFA 2.9 dice, literal (ficha `verificado_fuente_primaria`, DOF/SIDOF 5780249):
*"Título II, **Capítulo VII** o Título IV, Capítulo II, Sección I"*. Título II
Cap. VII = **Coordinados = 624**. El código usaba `['601','612']` con el
comentario *"601 (General de Ley PM — coordinados)"*, fundiendo dos claves
distintas del catálogo; y `624` no estaba ni en la lista ni en el CHECK de la
0056. Abría para quien no califica —con el PDF imprimiendo "deducible" citando
la regla— y cerraba para el coordinado real, al que ni se le podía capturar el
régimen. Es el error de jerarquía que `normas/README.md` llama *"el más caro del
dominio"*.
Prueba: `regimen_facilidad_15.test.ts` (4 casos) — sin el arreglo fallan 2.
Incluye migración `0088` + bloque 63 de `verificaciones.sql`.

### Pendientes (4) — con la razón

**C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"**
`engine.ts:337,354` · `repo.ts:826-834`. La norma dice *"del total de los pagos
efectuados por consumo de combustible"*; el denominador real es solo lo que pasó
por el producto, y con él el PDF imprime "No deducible".
**Razón de pendiente:** el denominador correcto exige un dato que el producto no
tiene (el gasto de combustible que NO pasó por Likida). No es un arreglo de
código, es una decisión de producto: o se declara el supuesto en el PDF, o se
captura el total del ejercicio. Se propone, no se inventa.

**C5 · [legal] La foto viaja al modelo externo antes del aviso**
`processor.ts:522-525` corre entero antes del bloqueo de `:647`. Sin viaje
abierto, `downloadMediaAsDataUrl` + `extraerComprobante` ya mandaron la imagen
del operador a un tercero sin aviso ni constancia. **Verificado el orden.**
**Razón de pendiente:** mover el bloqueo antes del intake cambia el flujo de
huérfanos (la sala de espera de comprobantes sin viaje, mig. 0040) y puede dejar
fotos sin recoger. Es un cambio de diseño del ciclo, no de una línea, y con el
tope de 3 vueltas agotado no se toca a ciegas.

**C6 · [pruebas] El callback de QStash emite CFDI y no tiene una sola prueba**
`api/cron/facturar/cola/route.ts:40,66`, 0% de cobertura. **Verificado en vivo:**
el auditor le quitó la verificación de firma (`if (false)`) y la re-validación de
`cfdi_uuid`, y los 3,148 tests siguieron verdes.
**Razón de pendiente:** el arreglo es escribir el arnés de un endpoint que
factura de verdad; es trabajo de una sesión propia, no de una vuelta de auditoría.

**C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta**
`presupuesto.ts:37-72`. `avisarCierreAlJefe` (2 lecturas + 1 envío) **no está en
`PASOS_CIERRE`** — verificado. Con sus propios números nominales el tramo se va a
~13.2s contra `MARGEN_CIERRE_MS = 12_000`, y dos consultas del tramo van sin
`acotada` (techo de undici: 300s contra `maxDuration=120`).
**Razón de pendiente:** subir el margen le quita techo al agente (de 48s a menos)
y esa es una decisión de producto con efecto en el demo. Lo que sí se hizo:
**anotar el paso que este mismo arreglo agregó** (`a30f7b0`), para que la
contabilidad no siga mintiendo — el archivo advierte que meter un paso sin
anotarlo es cómo la reserva deja de ser cierta.

## Descartados

Ninguno. Los 7 críticos se abrieron uno por uno contra el código y los 7 son
reales. Lo que sí hubo fue **una prueba que fijaba el bug**:
`ruta_pdf_sincronizada.test.ts` exigía que `processor.ts` NO nombrara la ruta del
contralor. Su intención era buena —que el chofer no reciba el ejemplar completo—
pero el proxy era el archivo entero, y con un solo PDF firmado eso obligaba a
mandarle al jefe el del operador. Se acotó y la garantía real pasó a la prueba de
comportamiento.

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 252 archivos, 3,159 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que la línea base)
```

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Lo que esta ronda dice del proceso

- **Un rubro que se autocalifica sube.** La ronda 16 se puso 7 en fiscal; con las
  fichas abiertas al lado del código, el rubro está en 4. La calificación de un
  arreglo no la puede dar quien lo hizo.
- **Una migración aplicada no es una migración usada.** La 0084 se dio por
  cerrada tres rondas seguidas sin que nadie comprobara la llamada.
- **La suite grande da falsa seguridad.** 3,148 pruebas verdes y 6 de 10 mutantes
  sobreviven: el motor de cuadre está anclado de verdad, el anillo que lo rodea
  no. Es el dato más accionable de la ronda.
