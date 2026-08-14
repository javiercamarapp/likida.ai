# Progreso — auditoría 3, pase 2 (nube, 14-ago-2026)

Una línea por acción, con su sha. Se escribe MIENTRAS avanza.

## Fase 0 — anclaje

- `INFRA` — el contenedor llegó con `node_modules/` **vacío**: `vitest`, `eslint`
  y `@types/node` no resolvían. La primera corrida de la compuerta falló por eso,
  no por el código. `npm ci` → exit 0. Anotado como INFRA, no como hallazgo.
- Rama `claude/auditoria-3` creada sobre `815d8cb` (= `origin/master`). Árbol
  limpio al arrancar → **autofix ENCENDIDO**.
- Compuerta real (tras `npm ci`), 14-ago 11:08:
  - `npm test` → **268 archivos, 3,177 pruebas verdes, 1 skip** — exit 0
  - `npx tsc --noEmit -p .` → **limpio**, exit 0
  - `npm run lint` → **0 errores, 25 warnings** (`no-unused-vars` en tests)
  - `npm run build` → **NO se corre en la nube** (pide Supabase/OpenRouter/
    Facturapi/Upstash; su fallo no diría nada del código).
- Estado heredado del pase 1 (madrugada, en local): los **6 CRÍTICOS cerrados y
  pusheados a master** (`c8bd2ac`, `444492a`, `b31460c`, `54e0648`, `bb7e228`,
  `bc3c6c3`) + el alto TC-A1 (`8066054`, `366b66d`). Los **12 reportes de rubro
  nunca se escribieron** y los 8 fixers de altos **nunca dejaron commit**.

## Fase 1 — los doce auditores

Lanzados en paralelo, contexto fresco, un archivo cada uno.

Los 12 entregaron. 125 hallazgos: 11 C · 43 A · 42 M · 29 B.

## Fase 2 — verificación adversarial (orquestador, abriendo el archivo)

- `FE-C1` **CONFIRMADO** — `chat.tsx:521-523`: el ternario cae a
  `responder(q, kpis, acred)` con `resp.ok` true y sin `bloques`.
- `BE-C1` **CONFIRMADO** — `conv.ts:164-181` ordena por `created_at desc` sin
  filtrar `avisado_en`; `importar_viajes.ts:207-217` inserta `estatus:'abierto'`
  con el operador amarrado.
- `DAT-C1` **CONFIRMADO** — `0001_init.sql:49` es `not null` y **ninguna**
  migración posterior lo altera (barrido de `supabase/migrations/`).
- `FI-C1` **CONFIRMADO en la ficha** — `normas/rfa-2026-2.9.yaml:11` transcribe
  "Título II, Capítulo VII o Título IV, Capítulo II, Sección I" y la ficha está
  `verificado_fuente_primaria` (l.27).
- `FE-A1` heredado **REFUTADO** por su propio auditor (guardarraíl en
  `engine.ts:276-279` + migración `0070`). Entra como descartado.

## Fase 4 — arreglos

- `649f248` — **FE-C1 (CRÍTICO) CERRADO**. Prueba primero
  (`src/app/dashboard/chat.test.tsx`, roja: el módulo no exportaba nada) →
  `respuestaDelTurno(ok, d)` pura y exportada, `responder()` retirada, props
  `kpis`/`acred` y sus dos consultas de dinero fuera → verde.
  **Ancla comprobada, no asumida:** con el cuerpo del arreglo revertido a la
  respuesta fabricada, 4 de los 5 casos se ponen rojos; restaurado, los 5 verdes.
  Suite completa después: 269 archivos / 3,182 verdes / 1 skip · tsc limpio ·
  eslint 0 errores.
- Los otros 10 críticos quedan **pendientes con escenario escrito**. No se
  arreglaron a ciegas: el pase 1 hizo eso y este pase encontró cuatro de sus
  rutas abiertas por el otro extremo.

## Fase 3 y 5 — cierre

- `tablero.html` + `tablero.png` — capturado con Chromium headless
  (`--force-prefers-reduced-motion`) y **mirado**: 12 rubros contados, notas
  cuadradas contra la síntesis, 11 críticos, compuerta verde.
- `00-SINTESIS.md` con las doce notas, el delta y el porqué de cada movimiento.
- `RESULTADO.md`: PARCIAL.
