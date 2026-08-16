# Verificación adversarial — auditoría 4 (pase 4 del PR #13)

El orquestador abrió **cada** `archivo:línea` de los CRÍTICOS antes de anotarlo.
Lo que no se pudo abrir no entra a la síntesis como hallazgo. Este archivo es lo
que mantiene honestos a los auditores de mañana.

## Los 15 CRÍTICOS, uno por uno

| ID | Rubro | Ancla | Veredicto |
|---|---|---|---|
| **A4-DAT-C1** | datos / pruebas | `supabase/migrations/0112_*.sql` × `migraciones_verificadas.test.ts:53,61` | **VERIFICADO → CERRADO** `dd65f6c` |
| **A4-FIS-C1** | fiscal | `cuadre/engine.ts:156-167` × `repo.ts:666` | **VERIFICADO → CERRADO** `5394d10` |
| **A4-BE-C1** | backend | `importar_viajes.ts:425` × `conv.ts:164-181` | **VERIFICADO — PENDIENTE** |
| **A4-BE-C2** | backend | `cron/wa-pendientes/route.ts:78-91` × `processor.ts:369-373` | **VERIFICADO — PENDIENTE** |
| **A4-AG-C1** | agéntico | `processor.ts:2276` × `2435-2471` × `770` | **REINCIDENTE 3ª ronda — PENDIENTE** |
| **A4-AG-C2** | agéntico | `startup.ts:63-70` × `conv.ts:418` | **REINCIDENTE — PENDIENTE** |
| **A4-ARQ-C1** | arquitectura | `comercial.ts:133-163` × `rentabilidad/vista.tsx:64,69` | **VERIFICADO — PENDIENTE** |
| **A4-OP-C1** | operabilidad | `cron/escalar/route.ts:90,118,140,148` | **VERIFICADO — PENDIENTE** |
| **A4-OP-C2** | operabilidad | `agentes/cobranza.ts:387,399` × `escalar_viaje.ts:392` | **VERIFICADO — PENDIENTE** |
| **A4-REND-C1** | rendimiento | `escalar_viaje.ts:260` × `cron/escalar/route.ts:14` | **REINCIDENTE 4ª ronda — PENDIENTE** |
| **A4-REND-C2** | rendimiento | `agentes/cobranza.ts:363` | **REINCIDENTE — PENDIENTE** |
| **A4-REND-C3** | rendimiento | `dashboard/agentes/cobranza/page.tsx:108` | **REINCIDENTE 3ª ronda — PENDIENTE** |
| **A4-REND-C4** | rendimiento | `consolidado.ts:649-720` | **REINCIDENTE — PENDIENTE** |
| **A4-REND-C5** | rendimiento | `cron/wa-pendientes/route.ts` (10 × 120 s en 120 s) | **VERIFICADO — PENDIENTE** |
| **A4-PR-C1** | pruebas | mismo mecanismo que A4-DAT-C1 | **VERIFICADO → CERRADO** `dd65f6c` |

## Lo que abrí yo, con la línea pegada

**A4-DAT-C1 / A4-PR-C1 — colisión del número 0112.** `ls supabase/migrations/`
devuelve `0112_agregados_rpc.sql` **y** `0112_config_llave_agentes.sql`.
`migraciones_verificadas.test.ts` traía la llave `'0112'` en `:53` y otra vez en
`:61`. La salida real antes del arreglo:

```
src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117:
An object literal cannot have multiple properties with the same name.   exit 1
```

`npx vitest run` salía **verde igual** (4,652 pruebas): JS toma la última llave
en silencio, así que la exención documentada de la 0112 de master se perdía sin
que nada lo dijera. Dos auditores independientes (datos y pruebas) lo levantaron
por su cuenta, y el de pruebas además citó los runs de CI en `failure`.
**Cerrado** renumerando a `0121` — la 0112 de master ya está referenciada por
nombre en `repo.ts:911,943,948` y en dos suites de equivalencia, así que mover
esa habría sido el cambio caro.

**A4-FIS-C1 — el CFDI que ampara N casetas.** `engine.ts:161-167` deduplicaba
con `const u = g.cfdiUuid.toLowerCase()` y nada más. `repo.ts:666` no traía
siquiera la columna `cfdi_orden`. La migración 0065 dice literal:

> "CAPUFE no factura ticket por ticket … Ocho casetas de un viaje = ocho filas
> de `gasto` y UN `cfdi_uuid`."

y por eso agregó `cfdi_orden` (1..N, `default 1`) y movió el índice único a
`(tenant_id, cfdi_uuid, cfdi_orden)`. Dos escritores lo llenan hoy
(`facturacion/al_vuelo.ts:518`, `intake/consolidado.ts:176`). El motor nunca se
enteró. Rojo comprobado antes del arreglo:

```
AssertionError: ocho casetas de $1,000 son $8,000, no $1,000:
expected 1000 to be 8000
```

**Cerrado**: la llave pasa a `(uuid, cfdiOrden ?? 1)`. El duplicado de verdad no
se pierde — dos fotos del mismo XML nacen ambas con el `default 1` — y eso queda
probado en los dos casos de reverso de la suite nueva.

**A4-BE-C1.** `importar_viajes.ts:425` dice `estatus: 'abierto'` dentro del
`map` de las filas a insertar. Sigue byte por byte donde estaba. PENDIENTE.

**A4-BE-C2.** `cron/wa-pendientes/route.ts:78-91` hace
`await processInbound(claim.evento); await marcarPendienteProcesado(claim.id);`.
Y `processor.ts:369-372` dice: `const claim = msg.waMessageId ? await
claimMessage(msg.waMessageId) : 'nuevo'; if (claim === 'duplicado') { …
return; }`. Un evento cuyo primer intento murió a mitad vuelve como
`'duplicado'`, `processInbound` **regresa sin hacer nada**, y el cron lo estampa
`procesado_en`. El mensaje del chofer se pierde y el cron sale verde. CONFIRMADO.

**A4-ARQ-C1.** `comercial.ts:133-163` (`getRentabilidad`) trae `ingreso_flete`
de **todos** los viajes del tenant y `total_comprobado` de **todas** las
liquidaciones, sin aparearlos por viaje ni por periodo. Es exactamente lo que el
pase 3 describió; el archivo cambió esta ronda pero no en este punto.
CONFIRMADO, sin un solo cambio.

**A4-OP-C1.** `cron/escalar/route.ts:90` declara `let huboFallo = false` y las
**únicas** dos asignaciones a `true` están en `:118` y `:140`, ambas dentro de
un `catch`. `:148` cierra con `status: huboFallo ? 500 : 200`. Una corrida donde
el 100% de los envíos falla **sin lanzar** sale 200. CONFIRMADO, 3ª ronda.

**A4-OP-C2.** `cobranza.ts:387` hace `corridas.set(t, null)` en el camino sin
excepción, pase lo que pase con `r.fallos`. El hermano ya está corregido:
`escalar_viaje.ts:392` hace `cierre.set(tenantId, c.fallidos === c.intentos ?
c.ultimo : null)` y su comentario en `:373-377` dice *"Un éxito falso es peor que
no avisar: borra la racha de la flota justo cuando su problema sigue vivo"*.
CONFIRMADO. **No se arregló** — ver abajo.

## Por qué solo dos arreglos

El tope de la rutina son 3 vueltas. Se gastaron dos, completas: prueba que
reproduce en rojo → arreglo → verde → suite completa → commit atómico. Con
**quince** críticos sobre la mesa, la decisión fue la misma del pase 3: cerrar
dos DE VERDAD antes que dejar seis a medias. Los dos elegidos son los que
rompen una regla dura del producto — uno dejaba la compuerta roja y el CI de la
rama en `failure` sin que la suite verde lo pudiera ver, el otro **borraba
$7,000 de dinero comprobado** del papel que el contralor revisa.

**A4-OP-C2 quedó a un paso y se dejó PENDIENTE a propósito.** El arreglo es de
una línea y el patrón correcto ya vive en el repo, pero reproducirlo en rojo
primero exige conducir el mock de Supabase de `cobranza_global.test.ts` hasta
una flota con 40 contactos fallidos sin excepción, y eso no cabía en lo que
quedaba del turno. La regla de la rutina es explícita: **no se arregla lo que no
se pudo reproducir**. Arreglarlo a ciegas es cómo se introducen los bugs que la
auditoría de mañana encuentra.

## Descartados

**Ninguno esta ronda.** Los quince CRÍTICOS traían `archivo:línea` que resolvió
y línea que existía — es el primer pase del ciclo en el que eso pasa. Las rondas
11, 12 y 13 perdieron 17 hallazgos por referencia inválida; el cambio no es
suerte, es que el prompt de esta ronda exigió abrir el archivo del árbol de HOY
en vez de copiar la ruta del reporte anterior.

Dos notas de honestidad en la otra dirección:

- El auditor de **operabilidad** reportó como ALTO propio la compuerta en rojo,
  que es el mismo mecanismo que A4-DAT-C1. No se cuenta dos veces: se anota como
  el mismo hallazgo visto por tres rubros distintos, lo cual es señal de que era
  real, no de que haya tres.
- El auditor de **pruebas** anotó al cierre que el orquestador arregló el rojo
  mientras él escribía. Se deja tal cual: el hallazgo sigue en pie porque el
  mecanismo que lo permitió —una suite verde estructuralmente ciega a un rojo de
  `tsc`— no se tocó.
