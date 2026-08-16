# Auditoría 4 — síntesis y recalificación

**Pase 4, corrida desatendida en la nube, 16-ago-2026.** Doce rubros auditados
con contexto fresco, un agente por rubro, ninguno tocó código. Árbol **limpio**
al arrancar ⇒ autofix habilitado.

> **Ronda de CONTINUACIÓN sobre `claude/auditoria-3` / PR #13.** No se abrió PR
> nuevo: el PR seguía abierto y ya hay cinco de auditorías viejas encimados (#6,
> #7, #8, #9, #10) más tres de dependabot (#14, #15, #16). Es el pase 4 de ese
> mismo PR.

## Por qué se relanzaron los doce, y no tres

Los reportes del pase 3 se escribieron contra `87a6b44`. Desde ahí `master`
avanzó **37 commits · 110 archivos de `src/`+`supabase/`+`normas/` · +9,355 /
−650 líneas · 9 migraciones (0112→0120)**, con dos subsistemas que nunca habían
pasado por una ronda: el **Copiloto del fundador** (el único agente que cruza
tenants) y los **cimientos de Fase 2** (cola de aprobación, `agente_definicion`,
apagado durable). El objeto auditado cambió: relanzar no es repetición.

## Global: 5.5 → **4.8** (▼0.7)

Recolección 57/12 = 4.75. Al cierre 58/12 = 4.83, tras cerrar con ancla el único
crítico de fiscal y el único de datos.

**Diez rubros bajan o se quedan; uno sube.** La lectura corta, y es incómoda:
**no fue una semana mala — fue una semana buena cuya deuda empezó a cobrar
factura.** El código nuevo está, en general, bien escrito: `cola.ts` deja el
candado de estado en el esquema, las RPC de la 0112 nacen INVOKER con `revoke` y
`search_path`, el copiloto reusa las guardias del analista en vez de copiarlas, y
el aislamiento multi-tenant estrenó CI contra Postgres real. Lo que baja la nota
es otra cosa:

1. **Los abiertos del pase 3 no se movieron.** Frontend: 10 de 10 siguen. Legal:
   11 de 13. Datos: 9 de 9. Operabilidad: sus dos CRÍTICOS palabra por palabra.
   Rendimiento: los cuatro, byte por byte.
2. **El defecto característico se copió al código nuevo.** El patrón "sin reloj"
   que lleva cuatro rondas señalado reaparece en el cron `wa-pendientes` (10
   presupuestos de 120 s dentro de una invocación de 120 s) y en el Copiloto.
3. **La regla estructural de tool calling dejó de ser invariante.** Eran 14
   definiciones y hoy son **27**; nueve aceptan parámetros del modelo, y una
   —`proponer_accion`— elige **qué fila de `interruptor` se escribe**. El 7 se
   sostenía sobre "ninguna tool acepta datos del modelo". Ya no es cierto.

Que la global baje es un resultado válido, y esta vez es el más informativo del
ciclo: **el repo sabe hacerlo bien y no lo está aplicando donde ya se le dijo.**
El arreglo correcto de `escalar_viaje.ts:392` vive a doce metros del bug idéntico
de `cobranza.ts:387`; el `cfdi_orden` que la migración 0065 creó exactamente para
el caso de CAPUFE llevaba meses escrito por dos writers y el motor de cuadre
nunca lo leyó.

## Las doce notas

| Rubro | Pase 3 | Hoy | Δ | Razón del movimiento | C / A / M / B |
|---|---|---|---|---|---|
| Frontend | 6 | **5** | ▼1 | deuda que cobró factura — los 10 abiertos siguen, y las tres pantallas nuevas (Copiloto, Aprobaciones, Panel de agentes) llegaron sin una sola prueba | 0 / 7 / 6 / 5 |
| Backend y API | 6 | **5** | ▼1 | deuda que cobró factura · mirada más profunda — la cola durable del apagado tiene su propio camino de pérdida, y además lo sella como «procesado» | 2 / 6 / 5 / 2 |
| Agéntico | 3 | **4** | ▲1 | se atacó y subió — lo nuevo llegó con claim anclado y compensación; el punto es por eso, no por los dos CRÍTICOS, que siguen intactos | 2 / 6 / 4 / 2 |
| Tool calling | 7 | **5** | ▼2 | deuda que cobró factura · mirada más profunda — 27 tools (eran 14), 9 aceptan parámetros del modelo, y la regla que sostenía el 7 dejó de ser invariante | 0 / 6 / 6 / 4 |
| Seguridad | 7 | **6** | ▼1 | mirada más profunda — el aislamiento nuevo se abrió y **su capa 1 no falla cuando debería** | 0 / 4 / 14 / 7 |
| Fiscal | 4 | **3** → **3.5** | ▼0.5 | deuda que cobró factura — CRÍTICO nuevo que borraba dinero comprobado del papel. **Cerrado con ancla**: +0.5 al cierre | 1 / 6 / 3 / 2 |
| Legal | 6 | **5** | ▼1 | deuda que cobró factura — la Fase 2 abrió tres superficies de datos personales y ninguna está en un aviso | 0 / 8 / 4 / 2 |
| Arquitectura | 4 | **4** | = | lo nuevo llegó limpio, pero el ancla es categórica: dos conceptos de dinero siguen viviendo en dos casas | 1 / 6 / 5 / 4 |
| Pruebas | 6 | **5** | ▼1 | deuda que cobró factura — 5 funciones rotas a propósito, **las 5 sobrevivieron la suite entera**; cobertura 79.04 → 78.69 | 1 / 4 / 4 / 2 |
| Operabilidad | 7 | **6** | ▼1 | deuda que cobró factura — los dos CRÍTICOS del pase 3 intactos, con el arreglo correcto viviendo doce metros más allá | 2 / 5 / 7 / 4 |
| Rendimiento | 4 | **3** | ▼1 | deuda que cobró factura — REND-C1 entra en su **4ª ronda** y el defecto se replicó en los dos subsistemas nuevos | 5 / 6 / 4 / 1 |
| Modelo de datos | 6.5 | **6** → **6.5** | ▼0.5 | deuda que cobró factura — la colisión del 0112 impedía aplicar 0113→0120 por el camino documentado. **Cerrada con ancla**: +0.5 al cierre | 1 / 1 / 4 / 2 |
| **Global** | **5.5** | **4.8** | **▼0.7** | 57/12 = 4.75 en recolección · 58/12 = 4.83 al cierre | **15 / 65 / 66 / 37** |

**183 hallazgos: 15 críticos · 65 altos · 66 medios · 37 bajos.**

## Lo que este pase cambió en el código

Dos arreglos, completos, con ancla comprobada en rojo antes y verde después.
Con **quince** críticos sobre la mesa la decisión fue la del pase 3: cerrar dos
DE VERDAD antes que dejar seis a medias.

- **`dd65f6c` — A4-DAT-C1 / A4-PR-C1 (CRÍTICO).** El merge de `master` a la rama
  dejó **dos migraciones reclamando el número 0112**: `0112_agregados_rpc.sql`
  (de master) y `0112_config_llave_agentes.sql` (el arreglo DAT-C1 del pase 3).
  Aplicar por el camino documentado deja de ser determinista, y
  `migraciones_verificadas.test.ts` quedó con la llave `'0112'` **dos veces**: el
  segundo literal pisa al primero en silencio, `vitest` sale verde igual, y solo
  `tsc` lo caza (TS1117). El CI de la rama llevaba en `failure` desde el merge, y
  la suite verde era estructuralmente incapaz de verlo. Renumerada a **0121** —la
  0112 de master ya está referenciada por nombre en `repo.ts:911,943,948` y en
  dos suites de equivalencia—. Lo levantaron **dos auditores independientes**
  (datos y pruebas) además del orquestador.
- **`5394d10` — A4-FIS-C1 (CRÍTICO).** `copiasDeComprobante` deduplicaba por
  `cfdiUuid` a secas, y `getGastos` ni siquiera traía la columna `cfdi_orden`.
  La migración 0065 existe **exactamente** para el caso contrario y lo dice
  literal: *"CAPUFE no factura ticket por ticket … Ocho casetas de un viaje =
  ocho filas de `gasto` y UN `cfdi_uuid`"*, y por eso agregó `cfdi_orden` (1..N,
  `default 1`) con índice único `(tenant_id, cfdi_uuid, cfdi_orden)`. Dos
  escritores lo llenan hoy. El motor nunca se enteró: **de un lote de ocho
  casetas de $1,000, siete salían marcadas como copias** — $7,000 fuera del total
  comprobado, fuera del deducible y fuera de la base del estímulo de peaje, y
  cobrados al operador como diferencia. Al contralor se le imprimía "$1,000
  comprobados" sobre $8,000 facturados. Ancla: `cfdi_de_varias_casetas.test.ts`,
  con dos casos de reverso que prueban que el duplicado de verdad —dos fotos del
  mismo XML, ambas con el `default 1`— sigue cazándose.

## Los quince críticos y su estado

Verificados por el orquestador **abriendo el archivo**. Sin cuarta opción.
Detalle con la línea pegada en `verificacion.md`.

1. **A4-DAT-C1 / A4-PR-C1** — colisión del número 0112 → **CERRADO** `dd65f6c`.
2. **A4-FIS-C1** — un CFDI de N casetas leído como N−1 copias → **CERRADO** `5394d10`.
3. **A4-BE-C1** (reincidente) — el histórico importado sigue naciendo `abierto`. `importar_viajes.ts:425` × `conv.ts:164-181`. **PENDIENTE.**
4. **A4-BE-C2** (nuevo) — el drenado del apagado sella `procesado_en` sobre un mensaje que `processInbound` devolvió sin procesar (`claim === 'duplicado'` → `return`), y el cron sale verde. `cron/wa-pendientes/route.ts:78-91` × `processor.ts:369-373`. **PENDIENTE.**
5. **A4-AG-C1** (reincidente, 3ª ronda) — cierre parcial: la base dice `liquidado`, el operador lee "se me trabó" y su reenvío cae en "no tienes viaje abierto". **PENDIENTE.**
6. **A4-AG-C2** (reincidente) — el mutex del viaje se borra sin ser su dueño. **PENDIENTE.**
7. **A4-ARQ-C1** — la contribución mezcla ingreso de N viajes con costo de TODOS y el rótulo afirma lo contrario. `comercial.ts:133-163` × `rentabilidad/vista.tsx:64,69`. **PENDIENTE.**
8. **A4-OP-C1** (reincidente, 3ª ronda) — `huboFallo` solo se pone `true` dentro de los `catch` (`:118`, `:140`), así que 100% de fallos sin excepción sale HTTP 200. **PENDIENTE.**
9. **A4-OP-C2** (reincidente) — Cobranza cierra su incidente con un éxito falso; el hermano ya está corregido en `escalar_viaje.ts:392`. **PENDIENTE** — ver abajo.
10-13. **A4-REND-C1..C4** (los cuatro reincidentes; C1 en su **4ª ronda**) — la familia "sin reloj", entera. **PENDIENTES.**
14. **A4-REND-C5** (nuevo) — el cron `wa-pendientes` corre 10 presupuestos de 120 s dentro de una invocación de 120 s. **PENDIENTE.**

**Descartados por falsos: 0.** Es el primer pase del ciclo en que los quince
críticos traen `archivo:línea` que resuelve y línea que existe. Las rondas 11,
12 y 13 perdieron 17 hallazgos por referencia inválida; el cambio no es suerte,
es que el prompt exigió abrir el archivo del árbol de HOY en vez de copiar la
ruta del reporte anterior.

### El que quedó a un paso, y por qué no se tocó

**A4-OP-C2** es un arreglo de una línea y el patrón correcto ya vive en el repo
(`cierre.set(tenantId, c.fallidos === c.intentos ? c.ultimo : null)`). No se
hizo porque reproducirlo en rojo primero exige conducir el mock de Supabase de
`cobranza_global.test.ts` hasta una flota con 40 contactos fallidos sin
excepción, y eso no cabía en lo que quedaba del turno. **No se arregla lo que no
se pudo reproducir**: arreglar a ciegas es cómo se introducen los bugs que la
auditoría de mañana encuentra. Es el primer candidato de la ronda 5.

## Compuerta — salida real

Al arrancar, sobre el árbol recién mergeado:

```
npx vitest run        → 348 archivos, 4,652 verdes, 1 skip              exit 0
npx tsc --noEmit -p . → ROJO — TS1117 en migraciones_verificadas.test.ts:61   exit 1
npm run lint          → 0 errores, 0 warnings                           exit 0
```

Al cerrar, sobre el árbol final:

```
npx vitest run        → 349 archivos, 4,657 verdes, 1 skip              exit 0
npx tsc --noEmit -p . → limpio                                          exit 0
npm run lint          → 0 errores, 0 warnings                           exit 0
npm run build         → NO SE CORRE en la nube (sin credenciales)
```

## INFRA — no son hallazgos del código

- **`npm ci` no corre en este contenedor**, tercera ronda consecutiva.
  `package.json:40` pide `xlsx` desde `https://cdn.sheetjs.com/...` y la política
  de red deniega ese host — verificado esta corrida con `curl`: **403 en el
  CONNECT**. npm revierte y deja `node_modules/` vacío. Se instaló `xlsx@0.18.5`
  desde el registry solo para poder correr la compuerta, y `package.json` /
  `package-lock.json` quedaron **restaurados y sin commitear**. Operabilidad lo
  reporta además como hallazgo de DX real: el repo no arranca en una máquina
  limpia sin ese CDN.
- **Siguen abiertos cinco PRs de auditoría de rondas viejas** (#6, #7, #8, #9,
  #10) cuyas ramas cuelgan de una historia que `master` ya abandonó, más tres de
  dependabot (#14, #15, #16). Alguien tiene que decidir si se cierran; no es
  decisión de la rutina.

## Cierre para la ronda 5

1. **A4-OP-C2 primero**: el arreglo es de una línea, el patrón correcto está a
   doce metros, y solo falta el arnés que lo reproduzca.
2. **La familia "sin reloj" ya no es deuda, es el rubro entero.** Cinco de los
   quince críticos son suyos y uno va en su cuarta ronda. Un rubro que no se
   mueve en cuatro rondas necesita una decisión, no un quinto reporte.
3. **Tool calling perdió su invariante estructural.** Antes de auditarlo otra
   vez hay que decidir si `proponer_accion` debe poder elegir la fila que
   escribe, porque mientras eso siga así el rubro no puede pasar de 5.
4. La suite verde no vio un `tsc` rojo durante horas. Lo que el pase 5 debería
   preguntar no es si el rojo volvió, sino **por qué la compuerta local y el CI
   pueden diverger** sin que nada avise.
