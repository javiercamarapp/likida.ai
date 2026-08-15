# Auditoría 3 — síntesis

**Pase 3, corrida desatendida en la nube, 15-ago-2026.** Doce rubros auditados
con contexto fresco, un agente por rubro, ninguno tocó código.

> **Esta ronda tiene TRES pases y un solo PR (#13).** El pase 1 corrió en local
> de madrugada, cerró 6 críticos y murió antes de escribir un reporte. El pase 2
> relanzó los doce y encontró que **cuatro de esos seis críticos seguían con la
> ruta abierta por el otro extremo**; cerró PARCIAL con 10 de 11 críticos
> pendientes. Este pase 3 **no abrió PR nuevo**: había seis PRs de auditoría
> encimados y abrir un séptimo es el modo de falla que la regla de continuación
> existe para evitar.

## Por qué se relanzaron los doce, y no tres

Los reportes del pase 2 estaban escritos contra el commit `815d8cb`. Desde ahí
`master` avanzó **81 commits · 380 archivos · +54,356 líneas** — Carta Porte,
API pública con llaves por flota, correo transaccional con Resend,
observabilidad, seis agentes, /admin rediseñado, migraciones 0092→0111. El
pase 3 empezó mergeando `master` a la rama (`01f270e`, cero conflictos en
código). **El objeto auditado cambió entero**: relanzar los doce no es
repetición, es que los reportes viejos describían un árbol que ya no existe.

## Global: 5.3 → **5.4** en recolección · **5.5** al cierre

La lectura corta: **la ronda subió un décimo y eso es casi ruido — lo que
importa está debajo del promedio.** Siete rubros subieron porque la semana de
master trajo trabajo real y verificable (alertas cableadas, migraciones de las
mejores del repo, el rojo de cobertura cerrado midiendo y no aflojando). Tres
bajaron, y ahí está la señal: **agéntico ▼2 y arquitectura ▼1 son el precio de
meter 380 archivos en siete días**, y **fiscal ▼0.5 es Carta Porte entrando sin
arnés normativo**.

El promedio esconde que **rendimiento lleva tres rondas en 4** con la misma
familia de fallos intacta: caminos que pueden exceder su límite y no tienen
reloj. Un rubro que no se mueve en tres rondas no es un rubro estable, es un
rubro que nadie ha atacado.

## Las doce notas

| Rubro | Pase 2 | Hoy | Δ | Razón del movimiento | C / A / M / B |
|---|---|---|---|---|---|
| Frontend | 5 | **6** | ▲1 | se atacó y subió — FE-C1 sigue cerrado y no reabrió con los 81 commits | 0 / 3 / 3 / 4 |
| Backend y API | 5 | **6** | ▲1 | se atacó y subió — `17dd02b` mató el robo del viaje vivo con prueba; queda la raíz | 1 / 4 / 4 / 2 |
| Agéntico | 5 | **3** | ▼2 | mirada más profunda — el código no cambió, la nota anterior estaba inflada | 3 / 3 / 2 / 1 |
| Tool calling | 7 | **7** | = | la regla `properties:{}` aguantó las once tools nuevas (barrido de 14 definiciones) | 0 / 2 / 4 / 3 |
| Seguridad | 7 | **7** | = | dos CVE murieron de verdad; los puntos de "una sola capa" siguen intactos tras 81 commits | 0 / 3 / 6 / 7 |
| Fiscal | 3.5 | **3** | ▼0.5 | mirada más profunda — Carta Porte entró sin arnés normativo | 1 / 5 / 2 / 2 |
| Legal | 5.5 | **6** | ▲0.5 | se atacó y subió — LEG-C1 cerrado y, por primera vez, sin recaída | 0 / 5 / 4 / 2 |
| Arquitectura | 5 | **4** | ▼1 | deuda que cobró factura — 380 archivos en una semana duplicaron la verdad | 1 / 4 / 4 / 4 |
| Pruebas | 5 | **6** | ▲1 | se atacó y subió — el rojo de cobertura cerró midiendo y subiendo el umbral, no aflojándolo | 0 / 5 / 4 / 2 |
| Operabilidad | 6 | **7** | ▲1 | se atacó y subió — D1–D3 cablearon alertas que de verdad salen | 2 / 4 / 4 / 3 |
| Rendimiento | 4 | **4** | = | mirada más profunda — la familia "sin reloj" sigue entera, tercera ronda | 4 / 4 / 2 / 1 |
| Modelo de datos | 5 | **6** | ▲1 | se atacó y subió — 0098–0111 son de las mejores migraciones del repo | 1 / 4 / 3 / 2 |
| **Global** | **5.3** | **5.4** | ▲0.1 | 65/12 = 5.42. Al cierre **5.5** con fiscal 3→4 y datos 6→6.5: a cada uno se le cerró su único crítico con ancla comprobada. | **13 / 46 / 42 / 33** |

**134 hallazgos: 13 críticos · 46 altos · 42 medios · 33 bajos.**

## Lo que este pase cambió en el código

Dos arreglos, completos y con ancla que se comprobó roja. **No se abrieron
más**: con trece críticos sobre la mesa la decisión fue cerrar dos de verdad
—prueba que reproduce en rojo, arreglo, verde, suite completa, commit atómico—
en vez de dejar seis a medias. Es exactamente lo que el pase 1 hizo mal y por lo
que el pase 2 encontró cuatro rutas abiertas.

- **`285d5e3` — DAT-C1 (CRÍTICO).** `tenant.config.agentes` no estaba en la
  lista blanca de `config_tenant_valida`, y ese CHECK corre en cada update de
  `tenant`. La pantalla de estrategia de agentes **nunca** pudo guardar: fallaba
  el 100% de los intentos con una excepción de Postgres. Ninguna suite lo veía
  porque el escritor toca Supabase y los mocks aceptan cualquier objeto.
  Migración `0112` (dos líneas de diff contra la 0085) + guardián
  `config_llaves_db.test.ts`, que ata la lista blanca al tipo en los dos
  sentidos. Comprobado rojo quitando la migración y verde devolviéndola.
- **`86fb450` — FI-C1 (CRÍTICO, reincidente 3ª ronda).** La elegibilidad de la
  RFA 2.9 se derivaba de `['601','612']`. La ficha `normas/rfa-2026-2.9.yaml`
  (**`verificado_fuente_primaria`**) exige Título II Cap. VII = **624,
  Coordinados**. Fallaba en las dos direcciones: le concedía la facilidad a una
  PM 601 que no es coordinado —y el motor le deduce diésel en efectivo hasta el
  15% citando la regla en el PDF— y se la negaba al coordinado real, que ni
  siquiera podía capturarse porque el 624 no estaba en el `<select>`. Ancla:
  `rfa29_regimenes.test.ts`, que compara contra el **texto de la ficha**, no
  contra memoria.

## Los trece críticos y su estado

Verificados por el orquestador abriendo el archivo. Sin cuarta opción: cerrado,
pendiente con razón, o descartado con razón.

1. **DAT-C1** — `tenant.config.agentes` fuera de la lista blanca. → **CERRADO** `285d5e3`.
2. **FI-C1** — RFA 2.9 con el 601 en vez del 624. → **CERRADO** `86fb450`.
3. **AG-C1** (reincidente) — cierre parcial: la liquidación queda cerrada, el operador recibe "se me trabó" y su reenvío cae en "no tienes viaje abierto". `processor.ts:2276` × `2435-2471` × `770`. **PENDIENTE.**
4. **AG-C2** — el sondeo de migraciones del arranque libera el mutex de un viaje que se está liquidando. `startup.ts:63-70` × `0005_concurrencia.sql:45-50` × `conv.ts:418`. **PENDIENTE.**
5. **AG-C3** — el kill switch de 5 de los 7 agentes no lo lee nadie, y "Ejecutar ahora" de Cobranza se salta el único cableado. `interruptores.ts:32-37` contra sus únicos lectores en `cron/{escalar,facturar,purgar}`. **Verificado por mí**: el comentario de `agentes/cobranza/page.tsx:105` afirma "un agente pausado no corre ni a mano (lo dice el motor)" y el motor no lo dice — `ejecutarCobranza` nunca llama `estaApagado`. Un rótulo que miente sobre un control de seguridad. **PENDIENTE.**
6. **BE-C1** (reincidente, medio cerrado) — el histórico importado sigue naciendo `abierto`. `importar_viajes.ts:425` × `conv.ts:164-181`. `17dd02b` sí mató el robo del viaje vivo (pre-chequeo de ocupados en `:376-405`, con prueba en `importar_viajes_escritura.test.ts:214` — **verificado por mí**), pero no tocó la raíz. **PENDIENTE.**
7. **ARQ-C1** — la contribución mezcla ingreso de N viajes con costo de TODOS, y el rótulo afirma lo contrario. `comercial.ts:140-145,157-158` × `rentabilidad/vista.tsx:64,69`. **PENDIENTE.**
8. **OP-C1** (reincidente) — 100% de fallos sin excepción → HTTP 200 y nivel `info`. `cron/escalar/route.ts:90,94,121,139`. **PENDIENTE.**
9. **OP-C2** — Cobranza cierra su propio incidente con un éxito falso, el bug que su hermano ya arregló. `agentes/cobranza.ts:387,399`. **PENDIENTE.**
10. **REND-C1** (reincidente 3ª ronda) — la escalación sola se come 3.5× el `maxDuration` del cron. `escalar_viaje.ts:260` × `cron/escalar/route.ts:14`. **PENDIENTE.**
11. **REND-C2** — el reloj de Cobranza mide desde su propio arranque, no desde el de la invocación. `agentes/cobranza.ts:363`. **PENDIENTE.**
12. **REND-C3** (reincidente) — "Ejecutar ahora" no recibió el reloj que sí recibió el cron. `agentes/cobranza/page.tsx:108`. **PENDIENTE.**
13. **REND-C4** — el barrido de Peajes es un bucle serial de hasta 2,000 UPDATE sin reloj ni `maxDuration`. `consolidado.ts:649-720`. **PENDIENTE.**

## Bajados de severidad y descartados

Lo que mantiene honestos a los auditores de mañana.

- **PR-C1 → ALTO**, bajado por el propio auditor de pruebas con razón escrita.
  Confirmó el hecho (las 3 `it` de `lotes.test.ts` siguen verdes contra un bucle
  serial; la assertion `toBeLessThanOrEqual(3)` es de un solo lado y es ciega al
  serial), pero la función hoy es correcta: lo que existe es una regresión
  silenciosa habilitada, no dinero mal hoy.
- **DAT-C1 heredado del pase 2 (tres caminos escriben `operador_id` NULL) —
  MUERTO.** Verificado por mí: `importar_viajes.ts:327` manda las filas sin
  operador amarrable a `sinOperador` y nunca las inserta; `:385` lo declara
  "Fallar CERRADO". Lo cerró `17dd02b`, de master.
- **LEG-C1 — cerrado y sin recaída**, verificado en `processor.ts:617`, delante
  de `if (!viajeId)` en `:638`. Era el reincidente histórico del rubro.
- **FE-C1 — sigue cerrado.** `chat.tsx:104-119` no tiene rama heurística; no
  reabrió con los 81 commits.
- **7 CVE de `npm audit` — descartados uno por uno con razón individual.** El
  `xlsx` "high" es un artefacto de la desviación de lockfile de este contenedor,
  no del repo (ver INFRA).
- **El patrón de la purga llamable por `anon` NO se repite**: barrido de las 14
  migraciones con `SECURITY DEFINER` y los 30 `grant`/`revoke`; las siete
  funciones nuevas traen su `revoke` + `grant to service_role` + `search_path`.

## Compuerta — salida real sobre el árbol final

```
npx vitest run        → 331 archivos, 4,509 pruebas verdes, 1 skipped   exit 0
npx tsc --noEmit -p . → limpio                                          exit 0
npm run lint          → 0 errores, 23 warnings (unused-vars en tests)   exit 0
npm run build         → NO SE CORRE en la nube (sin credenciales)
```

**El rojo de cobertura del pase 2 está cerrado y bien atribuido.** El auditor de
pruebas corrió `npm run test:coverage` (la excepción autorizada): exit 0, 79.04%
de líneas contra umbral 78. No se cerró aflojando — `vitest.config.ts` excluyó
`src/app/**/*.tsx` del denominador y **subió** el umbral de 67 a 78, con la
medición que lo justifica escrita en el config.

## INFRA — no son hallazgos del código

Confundir esto con un rubro sin hallazgos es el fallo más caro de una corrida
desatendida.

- **`npm ci` no corre en este contenedor.** `package.json:38` pide `xlsx` desde
  `https://cdn.sheetjs.com/...` y la política de red del entorno deniega ese
  host (403 en el CONNECT; solo `registry.npmjs.org` está permitido). npm
  revierte y deja `node_modules/` **vacío** — la primera corrida de la compuerta
  falló por eso, no por el repo. Se instaló `xlsx@0.18.5` desde el registry para
  poder correr la compuerta, y **`package.json` y `package-lock.json` se
  restauraron intactos antes de cerrar**: la desviación no está commiteada.
  Es también un hallazgo de DX real, y así lo reporta operabilidad: el repo no
  arranca en una máquina limpia sin acceso a ese CDN.
- **El clon llegó *shallow* (depth 50) y con HEAD detached.** Hubo que
  `git fetch --deepen=200` para encontrar la base común con la rama del PR.
- **Siguen abiertos cinco PRs de auditoría de rondas viejas** (#6, #7, #8, #9,
  #10) cuyas ramas cuelgan de una historia que `master` ya abandonó. No se
  continuó sobre ellos a propósito: auditar ese árbol sería auditar código que
  ya no existe. Alguien tiene que decidir si se cierran; no es decisión de la
  rutina.
