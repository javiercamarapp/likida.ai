# Rendimiento y costo — auditoría 4

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. La
mig. 0112 es trabajo real y medido —cuatro agregaciones movidas a SQL con
pruebas de equivalencia, y el ALTO del camino CALIENTE (`getAcumuladoCombustible`)
cerrado de verdad, lo verifiqué línea por línea—, pero los cuatro CRÍTICOS del
pase 3 están **byte por byte iguales** (REND-C1 entra en su **cuarta** ronda) y,
peor, el patrón que nadie atacó **se replicó en los dos subsistemas nuevos**:
el cron `wa-pendientes` (10 presupuestos de 120 s dentro de una invocación de
120 s) y el Copiloto (9 rondas de modelo más tools sin señal de aborto, 76 s
contra un `maxDuration` de 60). Un rubro que no se mueve es malo; un rubro cuyo
defecto característico se copia a código escrito esta misma semana es peor.

**El riesgo mayor de hoy:** el drenado del apagado (`/api/cron/wa-pendientes`)
suma **1,222 s contra `maxDuration = 120`** y su comentario afirma por escrito
lo contrario — es el único camino del repo cuyo trabajo son mensajes de choferes
que ya estaban guardados, y cada muerte quema un intento de la carta sin dejar
`ultimo_error`.

---

## Hallazgos

### [CRÍTICO] La escalación sigue sin reloj y sola se come 3.5× el `maxDuration` del cron
`src/lib/likida/escalar_viaje.ts:260` (el `for`), `:113` (`.limit(100)`) ×
`src/app/api/cron/escalar/route.ts:14` (`maxDuration = 120`) y `:104`

**Escenario.** El route **sí cambió** esta ronda (llegaron las palancas
`agente:conductores` y `agente:cobranza`, `:99` y `:124`, y el 500 por motor
caído, `:148`) — pero lo único que le agregó al presupuesto son **dos consultas
más**, y no un reloj. `escalarViajesSinAceptar()` se sigue llamando **sin
argumentos** (`:104`).

Entra: la corrida horaria con el techo de su propia consulta, **100 viajes**
(`:113`; el comentario de `:111` lo llama «el presupuesto de envíos del cron»).
Por viaje, **en serie**:

| paso | dónde | s |
|---|---|---|
| `reclamarEscalacion` (UPDATE) | `escalar_viaje.ts:266` | 0.3 |
| `sendText` al chofer | `:300` | 1.5 |
| `avisarAlChofer` (plantilla, si el texto rebota) | `:304` | 1.5 |
| `sendText` al jefe | `:333` | 1.5 |
| `sendTemplate` al jefe (si el texto rebota) | `:337` | 1.5 |

Camino feliz (solo los dos `sendText`): `100 × 3.3` = **330 s**. Con las dos
plantillas de respaldo —el caso *probable*: este agente existe para el chofer que
lleva 5 h sin contestar, o sea con la ventana de 24 h cerrada—: `100 × 6.3` =
**630 s**. Contra **120 s**.

Verificado por grep en el árbol de hoy: en `escalar_viaje.ts` no aparece ni una
vez `Date.now()`, `venceEn`, `Presupuesto` ni `acotar`. Los dos únicos aciertos
de «reloj» son comentarios (`:88`, sobre inyectar `ahora` en las pruebas).

**Consecuencia.** Vercel mata a mitad del `for`. Los viajes ya reclamados quedan
con `escalado_en` sellado **sin que se les mandara nada** (el sello va *antes*
de enviar, `:266`, a propósito) y el claim no expira: el jefe de flota nunca se
entera de esos viajes. No hay log de corte —el proceso muere antes del
`logger.info` de `:367`— ni reintento: es un cron.

**Causa raíz probable:** el techo de 100 se eligió como «presupuesto de envíos»
sin multiplicarlo por el costo de un envío, y el `for` no consulta ningún reloj.

*(REINCIDENTE — **cuarta ronda**: REND-C2 del pase 1, REND-C1 de los pases 2 y 3.
Sin una línea de cambio en el archivo del motor.)*

---

### [CRÍTICO] El reloj de Cobranza mide desde su propio arranque, no desde el de la invocación
`src/lib/likida/agentes/cobranza.ts:363` × `src/app/api/cron/escalar/route.ts:129`

**Escenario.** `PLAZO_COBRANZA_GLOBAL_MS = 90_000` (`cobranza.ts:339`) y su
comentario dice: «90 s de los 120 del `maxDuration` del cron — el resto es
margen para la escalación que corre antes». Pero `:363` sigue haciendo
`const venceEn = Date.now() + PLAZO_COBRANZA_GLOBAL_MS` **dentro** de
`ejecutarCobranzaGlobal`, que arranca en `route.ts:129` — o sea **después** de
que `escalarViajesSinAceptar()` (`:104`) ya gastó lo que gastó.

Suma de la invocación completa, con los pasos que el route tiene HOY:

```
0.3  estaApagado('global')            route.ts:79
0.3  estaApagado('agente:conductores')  :99
330–630  escalación                     :104
0.3  estaApagado('agente:cobranza')     :124
90   cobranza (su propio reloj)         :129
─────
421–721 s   contra  maxDuration = 120   (3.5× a 6×)
```

Si la escalación consume 60 s —una décima parte de su peor caso— Cobranza cree
tener hasta `t = 60 + 90 = 150 s`. **Nadie lee el reloj de la invocación en
`route.ts`**: los 30 s de margen que el comentario declara no los comprueba una
sola línea.

**Consecuencia.** El corte limpio que `cortadosPorReloj` promete (`:257-264`)
no ocurre: Vercel mata antes de que los 90 s se agoten, y los claims de
`cobranza_contacto` ya insertados (`:268`) quedan con `enviado=false` — el tier
del chofer consumido sin que reciba nada. El rescate de huérfanos tarda 1 hora,
o sea una corrida perdida por cada muerte.

**Causa raíz probable:** el presupuesto es por-motor y no por-invocación; falta
un reloj creado en `route.ts` y pasado a los dos motores.

*(REINCIDENTE — REND-C2 del pase 3.)*

---

### [CRÍTICO] «Ejecutar ahora» de Cobranza: el reloj sigue siendo opcional y el botón sigue sin pasarlo
`src/app/dashboard/agentes/cobranza/page.tsx:108` × `src/lib/likida/agentes/cobranza.ts:261`

**Escenario.** El guardia es
`if (opts.venceEn !== undefined && Date.now() >= opts.venceEn)` (`:261`), y la
acción de servidor del botón sigue llamando
`ejecutarCobranza(tenantId, new Date(), { ignorarVentana: true })` — **sin
`venceEn`** (`page.tsx:108`, leído hoy). Con `undefined` la condición es falsa
siempre: el guardia es letra muerta exactamente en el camino manual.

Y la cola no está topada: `colaCobranza` usa `traerTodo` (`cobranza.ts:114`),
así que `paraContactar` crece con la flota. Con los 750 camiones que el propio
comentario de `:258` usa como escenario y 700 filas con teléfono, por fila y
**en serie** (contado sobre el cuerpo del `for`, `:255-326`):

```
0.3  insert del claim en cobranza_contacto   :268
1.5  sendText                                :279
1.5  sendTemplate de respaldo                :295
0.3  update del resultado                    :313
0.3  sello 0087 (primer contacto)            :320
─────
3.9 s por fila  ×  700  =  2,730 s
```

Contra el límite: `page.tsx` **no declara `maxDuration`** (verificado: el grep de
`maxDuration` sobre todo `src/app` devuelve solo rutas `/api`). Aun leyéndolo con
la máxima generosidad —los 300 s de techo del plan Pro— son **9×** de más.

**Consecuencia.** El contralor aprieta el botón, la pantalla gira, la función
muere, y quedan cientos de tiers reclamados sin mensaje. Cada chofer pierde uno
de sus tres contactos; el acuse nunca vuelve, así que el humano vuelve a apretar
el botón y repite el daño.

**Causa raíz probable:** el arreglo se aplicó en `ejecutarCobranzaGlobal` y el
llamador manual quedó fuera; `venceEn` es opcional en vez de obligatorio.

*(REINCIDENTE — tercera ronda.)*

---

### [CRÍTICO] El barrido de Peajes: bucle serial de hasta 2,000 UPDATE, sin reloj y sin `maxDuration`
`src/lib/likida/intake/consolidado.ts:649-731` × `src/app/dashboard/agentes/peajes/page.tsx:212`

**Escenario.** `barrerPorConciliar` (`:573`) lee hasta **1,000** líneas
`por_conciliar` (`.limit(1000)`, `:584`) y las recorre en un `for` anidado
(`:649` por grupo, `:656` por línea). Por línea conciliada hace **dos** escrituras
secuenciales: `ligarLineaAGasto` (`:672`) y el UPDATE de `marcar_conciliada`
(`:681-690`). Por línea que sigue pendiente con candidatos cambiados, una más
(`:718-724`).

```
1,000 líneas × 2 UPDATE × 0.3 s          = 600.0 s
candidatos: traerTodo sobre `gasto` del rango, 45 págs × 0.3  =  13.5 s
conciliarLineas: O(1,000 × 45,000) = 45 M comparaciones, bloqueando el event loop
─────
≈ 613.5 s   contra  ningún maxDuration declarado en peajes/page.tsx
```

Sigue siendo la misma forma que `lotes.ts:1-7` documenta haber matado, y `enLotes`
existe, está probado y su gemelo sí lo usa (`desglose_peaje.ts`). Verificado por
grep: en `consolidado.ts` `enLotes` solo aparece en el camino de ingesta (`:337`),
no en el barrido.

**Consecuencia.** Muerte a media pasada = gastos con `cfdi_uuid` ya sellado cuya
línea sigue `por_conciliar`. En la siguiente pasada esos gastos ya **no** entran
en `disponibles` (la consulta de candidatos filtra `.is('cfdi_uuid', null)`), así
que la línea pierde su único candidato correcto de forma permanente: se queda en
la cola del contador para siempre, con una lista de candidatos que ya no contiene
al bueno.

**Causa raíz probable:** el arreglo `enLotes` se aplicó a ingesta y desglose; el
barrido manual nació serial y nadie lo alcanzó.

*(REINCIDENTE — REND-C4 del pase 3. Nota: la ruta del pase 3 decía
`src/lib/likida/consolidado.ts`; el archivo está en `src/lib/likida/intake/`.)*

---

### [CRÍTICO] El cron nuevo `wa-pendientes` corre 10 presupuestos de 120 s dentro de una invocación de 120 s
`src/app/api/cron/wa-pendientes/route.ts:37` (`LOTE = 10`), `:78-91` (el `for`) ×
`:17` (`maxDuration = 120`) × `src/lib/likida/processor.ts:393`
(`crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)`) × `src/lib/likida/presupuesto.ts:188`
(`PRESUPUESTO_WEBHOOK_MS = 120_000`)

**Escenario.** El comentario de `:28-31` afirma: «*10 por corrida drenan un apagón
típico en pocas vueltas **sin acercarse al techo de 120 s***». El número contra el
número:

`processInbound` crea su **propio** presupuesto de 120 s en su propio arranque
(`processor.ts:393`), no recibe ninguno. Su techo de trabajo es
`PRESUPUESTO_WEBHOOK_MS − MARGEN_CIERRE_MS` = 108 s, más el cierre real de 13.5 s
(ver el hallazgo de `PASOS_CIERRE`, abajo) = **121.5 s por mensaje**.

```
0.3   urgentesVencidas(10)          route.ts:55
0.3   estaApagado('global')             :66
0.3   pendientesPorDrenar(10)           :75
10 × [ 0.3 reclamarPendiente  :79
     + 121.5 processInbound   :82
     + 0.3 marcarProcesado    :83 ]  = 1,221 s
0.3   cartasMuertas()                   :96
──────
≈ 1,222 s   contra  maxDuration = 120     (10.2×)
```

Y no hace falta el peor caso: con el costo de UNA foto que el pase 3 midió
(descarga 15 s + zxing + `reloj.senal(25_000)` + hash/subida/insert ≈ **42 s**),
`10 × 42.6` = **426 s**, 3.5×. **Dos mensajes pesados ya no caben**:
`2 × 121.5 = 243 s > 120`.

**Consecuencia.** El drenado existe precisamente para cuando hay cola —después de
un apagón—, que es cuando el lote viene lleno. `reclamarPendiente` **incrementa
`intentos` ANTES de procesar** (`wa_pendientes.ts:90`); si Vercel mata a mitad de
`processInbound`, ese intento se quemó y `anotarFalloPendiente` (`route.ts:89`)
no corre, así que la fila queda con `ultimo_error: null`. Un mensaje cuyo turno
pase de 120 s **nunca completa**: cinco corridas (≈25 min,
`MAX_INTENTOS_PENDIENTE = 5`) lo convierten en carta muerta, y la alerta que
sale dice «agotaron sus reintentos» sin una sola razón, porque el único campo que
la explicaría está vacío por construcción.

**Causa raíz probable:** el comentario dimensionó el lote contra el costo de un
mensaje *típico* y no contra el presupuesto que cada `processInbound` se
autoconcede; el límite es por invocación y el presupuesto es por mensaje — la
misma confusión exacta que ya está abierta en el webhook.

---

## Los ALTOS

### [ALTO] El Copiloto: 9 rondas de modelo más tools sin señal de aborto suman 76 s contra un `maxDuration` de 60
`src/lib/agents/copiloto.ts:197` (`opts.timeoutMs ?? 40_000`), `:206`
(`maxToolRounds: 5`), `:236` (`maxToolRounds: 4`) ×
`src/app/api/admin/copiloto/route.ts:30` (`maxDuration = 60`) ×
`src/lib/llm/openrouter.ts:717-724` y `:821`

**Escenario.** El `AbortController` de 40 s **no cubre las tools**. Verificado:
`opts.signal` viaja únicamente a `client.chat.completions.create` (`:717-724`);
el `toolExecutor` se invoca en `:821` **sin señal, sin timeout y sin reloj**. Una
tool que tarde 30 s sigue hasta el final aunque el abort ya haya disparado.

Y el `crossRound` que dedupea tools de solo lectura se declara **dentro** de
`generateWithTools` (`openrouter.ts:694`), así que el reintento correctivo
(`copiloto.ts:225`, una **segunda** llamada a `generateWithTools`) arranca con la
caché vacía y **vuelve a pagar la misma tool**.

La tool cara es `metrica_negocio` (`copiloto-tools.ts:62`) → `getResumenNegocio()`
(`negocio.ts:160`), que dispara en `Promise.all` (`:179-193`):

| lectura | filas al mes 1 del cliente de 15k | s |
|---|---|---|
| `traerTodo` sobre `tenant` | ~1 | 0.3 |
| `traerTodo` sobre **`viaje` entera** | 15,000 → 15 págs | 4.5 |
| `traerTodo` sobre **`gasto` entera** | 45,000 → 45 págs | 13.5 |
| RPC `resumen_costo_ia` con `p_desde/p_hasta` en **null** | ~1 M (la 0062 midió 400 k → 7,488 ms) | **≈ 19** |

→ la tool cuesta **19 s**. Suma del turno:

```
0.3   sesión + parse                    route.ts:55-61
36    9 completions × 4 s               copiloto.ts:206 (5) + :236 (4)
38    metrica_negocio × 2 (ciclo + reintento correctivo)
~2    bandeja + guardia + metrica_norte
──────
≈ 76.3 s   contra  maxDuration = 60
```

**Y las tres tools de bandeja llaman lo mismo tres veces.** `bandeja`
(`copiloto-tools.ts:101`), `guardia` (`:129` → `guardia.ts:114`) y `metrica_norte`
(`:152`) llaman cada una a `getBandejaEscalaciones`, que son **6 lecturas en
paralelo** (`escalaciones.ts:228-235`), tres de ellas `traerTodo` sin cota. En una
ronda que pida las tres son **18 lecturas donde bastaban 6**; el `crossRound`
llavea por nombre de tool, así que no las funde.

**Consecuencia.** El stream NDJSON no tiene `finally` de plataforma: si Vercel
mata la invocación, el `controlador.close()` de `route.ts:110` no corre, no sale
ni `{t:'fin'}` ni `{t:'error'}`, y la consola de Javier se queda girando sobre un
turno ya pagado. Al **mes 2.2** del primer cliente grande el `traerTodo` sobre
`gasto` cruza las 100,000 filas de `MAX_PAGINAS` (`pg.ts:48`) y **lanza**: la tool
devuelve error, y con ella las 18 páginas de `/admin` que llaman
`getResumenNegocio()` sin `maxDuration` ni caché.

**Causa raíz probable:** el timeout se puso donde se paga dinero (el modelo) y no
donde se gasta tiempo (las tools); y la tool más cara envuelve una función de
panel que arrastra dos tablas enteras por la red.

---

### [ALTO] El Copiloto gasta ~$0.064 por turno sin tope diario y sin dejar rastro consultable
`src/app/api/admin/copiloto/route.ts:15-19` y `:101-104` ×
`src/app/api/dashboard/chat/route.ts:33-42`

**Escenario.** El chat del cliente tiene freno: `LIKIDA_CHAT_TOPE_DIA_USD`, $1/día
por tenant, comprobado antes de gastar y **fallando cerrado** (`chat/route.ts:81-95`).
El Copiloto **no tiene ninguno** — grep de `TOPE`/`ratelimit`/`limit` sobre
`api/admin/copiloto/route.ts`: cero aciertos.

Y el costo por turno no es chico. Sin caché de prompt (`soportaCache =
/anthropic\//.test(model)`, `openrouter.ts:676`, y el rol `chat` es
`google/gemini-3.5-flash-lite`, `models.ts:56`), el prefijo entero se reenvía en
cada ronda:

```
  560  SYSTEM_COPILOTO (2,013 chars, medido)          copiloto.ts:156-169
~1,300  esquemas de 13 tools                          copiloto-tools.ts + :52,:95
13,000  historial: 24 mensajes × 2,000 chars          route.ts:42,:48
──────
~14,900 tokens de prefijo, × 9 rondas   ≈ 134,000
 +12,000 de resultados de tools acumulados
──────
≈ 146,000 in  /  8,100 out (900 × 9, copiloto.ts:207/:237)
```

A `[0.30, 2.50]` por millón (`openrouter.ts:135`): `146,000×0.30/1e6 +
8,100×2.50/1e6` = **$0.064 por turno**. Cien turnos al día son **$6.40/día ≈
$192/mes**.

Nota sobre el historial: el comentario de `route.ts:39-40` dice «12 turnos», el
código admite **24 mensajes** (`:42`, `:44`) — el doble del prefijo que el
comentario presupuesta.

**Consecuencia.** Ese dinero **no aparece en ninguna consulta**: la decisión de no
escribir en `llm_costo` está tomada por escrito (`route.ts:15-19`) y el único
rastro es `logger.info('copiloto.costo')`. `/admin/costos-facturacion` lee
`resumen_costo_ia` sobre `llm_costo` (`negocio.ts:298`), así que la pantalla que
Javier usa para poner el precio del producto reporta el gasto de IA de Likida
**menos lo que gasta Javier**. Un agente sin tope y sin medidor es el único del
repo que puede gastar sin que nadie lo vea.

**Causa raíz probable:** el freno y el medidor se diseñaron para el gasto del
tenant; el gasto de la casa quedó fuera de los dos, y el `logger.info` se aceptó
como sustituto de una fila.

---

### [ALTO] `getResumenNegocio` arrastra `viaje` y `gasto` **enteras** por la red en cada carga de 18 páginas de `/admin`
`src/lib/admin/negocio.ts:179-193` × `src/lib/likida/pg.ts:45-48`

**Escenario.** El pase 3 reportó el RPC `resumen_costo_ia` (que sigue con
`p_desde`/`p_hasta` en `null`, `:82`, y la razón escrita en `:150-153`). Lo que no
se había mirado es que las **otras tres** lecturas de la misma `Promise.all` son
`traerTodo` sin filtro de fecha ni de tenant:

- `:184-187` — `viaje`, columnas `id, tenant_id`, para **contar viajes por tenant
  en JavaScript** (`:230-233`). Cliente de 15k: 180,000 filas al año.
- `:189-192` — `gasto`, columna `created_at`, para **bucketear los últimos 7 días**
  (`:242-250`). O sea: se traen 540,000 filas del año para responder por 7 días.

Al mes 1 del cliente de 15k: `45 págs × 0.3` = **13.5 s** de la lectura de
`gasto`, en paralelo con **19 s** del RPC → la función cuesta **19 s**, y ninguna
de las 18 páginas que la llama declara `maxDuration` ni usa `unstable_cache`
(grep: `negocio.ts` no importa ninguno de los dos).

Al **mes 2.2** `gasto` cruza las **100,000 filas** de `MAX_PAGINAS` (`pg.ts:48`) y
`traerTodo` **lanza** — el mismo acantilado que la 0112 fue a cerrar en cuatro
funciones, sobre una tabla que el propio comentario de `:177` nombra
(«`gasto` es la siguiente en la fila (~240 mil al año) y sigue viniendo entera:
cuando le toque, el camino ya está trazado»). El camino está trazado y no se
recorrió.

**Consecuencia.** La consola que se enseña en el demo deja de cargar en el segundo
mes del primer cliente grande, y falla como timeout de plataforma o como
`LecturaIncompleta`: pantalla de error, sin cifra.

**Causa raíz probable:** dos agregaciones triviales (`count(*) group by tenant_id`
y `count(*) group by día` de 7 días) siguen resolviéndose en JavaScript sobre la
tabla completa, en el mismo archivo que ya movió la tercera a SQL.

---

### [ALTO] Una carga de `/dashboard` dispara 566 páginas de 1,000 filas, y cuatro de ellas caducan el mes 2.2
`src/app/dashboard/inicio-contenido.tsx:88-120` × `src/lib/likida/analytics.ts:349`,
`:479`, `:555`, `:602`, `:1144` × `src/lib/likida/fiscal.ts:823`, `:945-949`

**Escenario.** El `Promise.all` de `inicio-contenido.tsx:88` lanza **15 llamadas**.
Cuatro pasaron a RPC con la 0112 y están bien; el resto sigue trayendo tablas
enteras del tenant. Al mes 1 del cliente de 15k (45,000 `gasto`, 15,000 `viaje`,
15,000 `liquidacion`), contando páginas de 1,000 filas:

| llamada | tabla | págs |
|---|---|---|
| `detectarAnomalias` (`analytics.ts:349`) | `gasto` entera, sin filtro | 45 |
| `getGastoPorSemanaSeries` ×3 (5/13/52 sem, `:479`) | `gasto` | 135 |
| `getLiquidadoPorSemanaSeries` ×3 (`:555`) | `liquidacion` | 45 |
| `getViajesPorMes` (`:602`) | `viaje` entera | 15 |
| `getTopRutasPorGastoSeries` ×3 (`:1144`) | `gasto` + **`viaje` sin filtro de ventana** | 180 |
| `getGastosFiscales` (ejercicio, `fiscal.ts:823`) | `gasto` | 45 |
| `getGastosFiscalesSeries` ×3 (`fiscal.ts:945-949`) | `gasto` | 101 |
| **total** | | **566 págs = 566,000 filas por carga** |

Camino crítico (las páginas de un mismo `traerTodo` son secuenciales, `pg.ts:190-194`):
`45 × 0.3` = **13.5 s**. Contra: `/dashboard/page.tsx` **no declara `maxDuration`**.

Y la caducidad: a 45,000 filas/mes, `gasto` cruza las 100,000 de `MAX_PAGINAS` en
el **mes 2.2**, y ahí lanzan `detectarAnomalias`, `getGastoPorSemana(13)` y
`(52)`, `getTopRutasPorGasto` y las dos fiscales. La 0112 declara por escrito ese
mes 2.2 **solo para `getGastosFiscales`** («sin resolver en esta pasada»); las
otras cinco no se mencionan y comparten fecha exacta.

**Consecuencia.** `safe()` (`inicio-contenido.tsx:36-38`) atrapa cada throw y
devuelve `null`, así que el panel degrada a estados vacíos en vez de mentir —
correcto por CLAUDE.md— pero el contralor del cliente más grande ve, desde el mes
3, un Resumen donde media página dice «falta dato» y la otra media sí carga, sin
que nada explique la línea divisoria.

**Causa raíz probable:** la 0112 priorizó por «camino caliente» y dejó las
gráficas del Resumen —que comparten la misma fecha de caducidad y corren en la
misma `Promise.all`— para después.

---

### [ALTO] El presupuesto del cierre enumera 13 pasos y hoy siguen siendo 14
`src/lib/likida/presupuesto.ts:37-51`, `:72` × `src/lib/likida/processor.ts:2411`
× `src/lib/likida/avisar_cierre.ts:95`, `:103`, `:109`, `:127`

**Escenario.** `PASOS_CIERRE` sigue con **13 entradas** y suma 8,900 ms;
`MARGEN_CIERRE_MS = 12_000` (`:72`), con 3.1 s declarados de holgura.
`avisarCierreAlJefe` sigue **esperado con `await`** en `processor.ts:2411` y sigue
**sin estar en la tabla**:

```
300  telefonoJefeDe                    avisar_cierre.ts:95
300  resumenDeCierre (2 en Promise.all)            :103
1,500 sendText del aviso                           :109
2,500 sendDocument del PDF al jefe                 :127
─────
4,600 ms
8,900 + 4,600 = 13,500 ms   contra  MARGEN_CIERRE_MS = 12,000
holgura real: −1,500 ms
```

Su propio comentario lo declara fuera del presupuesto por escrito («son dos
lecturas y un envío, no un presupuesto», `processor.ts:2409`) — en el archivo cuya
regla es que el número escrito al lado del código coincida con el código. La
prueba guardiana comprueba la suma y el conteo, no la completitud contra
`processor.ts`.

**Consecuencia.** El agente puede gastar hasta dejar 12 s; el cierre necesita 13.5.
Vercel mata 1.5 s tarde, dentro de `sendDocument`, `saveConversation` o
`releaseViajeLock`: la liquidación quedó escrita, el chofer no recibe el PDF,
`pdf.no_entregado` no se escribe porque el proceso muere antes del `catch`, y el
mutex del viaje queda tomado. **Y este número es el multiplicando del CRÍTICO de
`wa-pendientes`**: los 121.5 s por mensaje salen de aquí.

*(REINCIDENTE — pase 3.)*

---

### [ALTO] Cada mensaje de una ráfaga estrena presupuesto de 120 s dentro de una invocación de 120 s
`src/app/api/webhook/whatsapp/route.ts:79` × `src/lib/likida/processor.ts:393`

**Escenario.** Sin cambio: `crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)` está
**dentro** de `processInbound` (`:393`), así que cada mensaje crea el suyo con
`inicio = Date.now()` en su propio arranque. El rate limit permite 40 mensajes por
teléfono y minuto y el pool son 5 → **8 olas**. Por foto: `downloadMediaAsDataUrl`
(techo 15 s, `meta/client.ts:10`) + zxing síncrono + `reloj.senal(25_000)` +
hash/subida/insert ≈ **42 s**. `8 × 42` = **336 s contra `maxDuration = 120`**
(2.8×). La ráfaga «que cabe holgada» según el comentario (12 fotos, 3 olas) da
**126 s**: tampoco cabe.

**Consecuencia.** El chofer manda el fajo de veinte fotos: las primeras se
procesan, el resto se pierde sin log —el `finally` no corre, el claim de
`wa_mensaje_procesado` queda tomado y Meta ya recibió su 200—. Desde su lado
mandó veinte fotos y no pasó nada.

*(REINCIDENTE — pase 3.)*

---

## Los MEDIOS

### [MEDIO] La foto va al modelo de visión a resolución nativa, aunque `sharp` ya la reduce a 1600 px para el lector de códigos —que es gratis
`src/lib/likida/intake/ocr.ts:249`, `:257` × `src/lib/likida/intake/cfdi.ts:247-249`
× `src/lib/meta/client.ts:451-465`

**Escenario.** `downloadMediaAsDataUrl` devuelve el binario **entero** en base64
(`meta/client.ts:464`), sin comprobar ni recortar tamaño. `decodeCodigosFromImage`
—el paso **gratis**— sí lo reduce con `sharp` a 1600 y 1000 px, y el comentario
de `cfdi.ts:243-247` trae la medición: «*sobre una foto de 24 Mpx la pasada a
resolución nativa cuesta segundos… el presupuesto del request vale más que esa
cola*». Pero `ocr.ts:249` elige `principal = fotos[i]` — el **data-URL original**,
no el buffer reducido— y `ocr.ts:257` lo manda tal cual como `images: [principal]`.

Los números por comprobante:

```
foto de celular 4032×3024 (12 Mpx)  ≈ 3.5 MB JPEG  → 4.7 MB de data-URL base64
la misma a 1600×1200                ≈ 220 KB JPEG  → 293 KB de data-URL
                                       ────────────  16×
```

WhatsApp permite hasta 5 MB, o sea 6.7 MB de base64 en el peor caso. A 20 Mbps de
egress son **1.9 s de subida por foto** que se descuentan del `reloj.senal(25_000)`
y, sumando, de los 120 s de la invocación: una ráfaga de 10 fotos gasta **19 s**
en bytes que la reducción ya demostró que no hacen falta. Al volumen del cliente
de 15k (45,000 comprobantes/mes) son **211 GB/mes de subida contra 13 GB**.
(El efecto sobre tokens de visión depende de si el proveedor reescala del lado
suyo; no lo pude verificar, así que el hallazgo se sostiene solo sobre los bytes y
el tiempo, que sí son ciertos.)

**Causa raíz probable:** `sharp` se introdujo para el lector de códigos y el
resultado reducido se descarta después del `readBarcodes`; la llamada de visión
sigue leyendo del arreglo original.

---

### [MEDIO] El tope diario del chat sigue valiendo ~17 turnos malos, no los ~200 que anuncia
`src/app/api/dashboard/chat/route.ts:33-42`, `:69` × `src/lib/agents/analista.ts:325`, `:367`

**Escenario.** Sin cambio: `maxToolRounds: 5` (`:325`) + `maxToolRounds: 4` del
reintento correctivo (`:367`) = **9 completions** en el peor caso, con el prefijo
reenviado íntegro (el rol `chat` no es Anthropic, así que `soportaCache` es falso).
El prefijo incluye **hasta 4,000 tokens del documento adjunto** (16,000 chars,
`route.ts:69`) metido *en el system* (`analista.ts:300-301`): ≈ 8,300 tokens ×
9 = **75,000** solo de reenvío. A `[0.30, 2.50]`/M: ≈ **$0.06 por turno** contra
los $0.005 que el comentario de `:35` usa para prometer «~200 análisis/día».
`$1.00 / $0.06` = **~17 turnos**.

*(REINCIDENTE — pase 3.)*

---

### [MEDIO] Los cuatro RPC nuevos de la 0112 no pasan por `acotada()`
`src/lib/likida/analytics.ts:107`, `:178`, `:640` × `src/lib/admin/negocio.ts:81`
× `src/lib/likida/presupuesto.ts:101`

**Escenario.** La 0112 hizo lo correcto —agregar en SQL— pero `getSerieComparativa`,
`getKpis`, `getAcreditables` y `traerResumenCostoIa` llaman `.rpc(...)` **pelado**,
sin el envoltorio `acotada` que impone `TOPE_CONSULTA_MS = 8_000`. El contraste
está en el mismo repo: `getAcumuladoCombustible` **sí** lo usa
(`repo.ts:924-932`). Sin él, el techo vuelve a ser el default de undici, **300 s**
(documentado en `presupuesto.ts:79-82`), sobre páginas que no declaran
`maxDuration`.

Suma: `getSeriesKpiCards` (`analytics.ts:153`) dispara **tres** de esos RPC en
paralelo, uno con ventana de 3,650 días. Un agregado lento sobre `gasto` de 10
años bloquea la carga del Resumen hasta que Vercel corte, sin el corte limpio de
8 s que el resto del repo sí tiene.

**Causa raíz probable:** `acotada` se aplicó al camino del cuadre y no se propagó
a los tres RPC de panel de la misma migración.

---

### [MEDIO] El cruce del consolidado sigue sin reloj
`src/lib/likida/intake/consolidado.ts:200-380` × `src/app/dashboard/agentes/peajes/page.tsx`

**Escenario.** Sin cambio desde el pase 3: `enLotes(porLigar, 10, …)` (`:337`) bajó
el bucle serial y el bloque de reanudación por sello cerró la corrupción, pero
nada en el archivo lee un presupuesto y el `reloj` de `processor.ts:393` no se le
pasa. Peor caso desde WhatsApp con la base lenta (cada consulta a su techo
`acotada` de 8 s): `15 descarga + 45 págs × 8 = 360 + 100 lotes × 8 = 800` ≈
**1,175 s contra 120**. Con la base sana (0.3 s/consulta) son **~64 s**, que sí
caben. Degrada y se nota; ya no corrompe.

*(REINCIDENTE — degradado a MEDIO en el pase 3, ahí se queda.)*

---

## El BAJO

### [BAJO] `soportaCache` se sigue calculando sobre el modelo primario, no sobre el que responde
`src/lib/llm/openrouter.ts:676` × `:721-724`

El breakpoint de caché se decide una sola vez con `model`. Si el ciclo cruza al
fallback (`activeModel = fallback`, `:723`) y el fallback **sí** es Anthropic
—`google/gemini-3.6-flash` → `anthropic/claude-haiku-4.5`—, las rondas restantes
viajan sin `cache_control` y pagan entrada completa. Con el system del cuadre
(9,543 tokens, medido en `:169-175`) la diferencia es **−91.6 %** por ronda.
Consecuencia: el día que OpenRouter tumbe al primario, el costo por liquidación se
multiplica ~12× en las rondas del fallback y `costoReal` lo reporta bien, así que
nadie lo nota como anomalía.

*(REINCIDENTE — pase 3.)*

---

## Las sumas del peor caso

| camino | eslabones (peor caso) | suma | límite escrito | ¿cabe? |
|---|---|---|---|---|
| `/api/cron/escalar` | 0.9 interruptores + 100×6.3 escalación + 90 cobranza | **721 s** | `maxDuration = 120` (`route.ts:14`) | **NO (6×)** |
| ídem, camino feliz | 0.9 + 100×3.3 + 90 | **421 s** | 120 | **NO (3.5×)** |
| **`/api/cron/wa-pendientes`** | 0.9 + 10 × 121.5 + 0.3 | **1,222 s** | `maxDuration = 120` (`route.ts:17`) | **NO (10.2×)** |
| ídem, foto «típica» de 42 s | 0.9 + 10 × 42.6 | **426 s** | 120 | **NO (3.5×)** |
| ídem, **solo dos mensajes** | 2 × 121.5 | **243 s** | 120 | **NO (2×)** |
| **`/api/admin/copiloto`** | 0.3 + 9 completions×4 + 2×19 (`metrica_negocio`) + 2 | **76.3 s** | `maxDuration = 60` (`route.ts:30`) | **NO (1.3×)** |
| «Ejecutar ahora» Cobranza (700 filas) | 1.2 + 700 × 3.9 | **2,731 s** | *ninguno* (≤300 s techo Pro) | **NO (9×)** |
| «Ejecutar ahora» Peajes (1,000 líneas) | 13.5 candidatos + 1,000 × 0.6 | **613.5 s** | *ninguno* | **NO (2×)** |
| Ráfaga de 40 fotos en un POST | 8 olas × 42 | **336 s** | `maxDuration = 120` | **NO (2.8×)** |
| Ráfaga de 12 fotos («la holgada») | 3 olas × 42 | **126 s** | 120 | **NO, por 6 s** |
| Cierre de una liquidación | 8.9 tabla + 4.6 `avisarCierreAlJefe` | **13.5 s** | `MARGEN_CIERRE_MS = 12_000` | **NO, por 1.5 s** |
| `/admin` (`getResumenNegocio`), mes 1 | max(4.5 viaje ‖ 13.5 gasto ‖ 19 RPC) | **19 s** | *ninguno en 18 páginas* | cabe, pero **lanza el mes 2.2** |
| `/dashboard` inicio, mes 1 | 566 págs; camino crítico 45 × 0.3 | **13.5 s** | *ninguno* | cabe, **6 llamadas lanzan el mes 2.2** |
| Turno del webhook completo | 12 lock + 20 barrera + 40 agente + 13.5 cierre + 15 descarga | **≈ 100.5 s** | `maxDuration = 120` | **sí, 19.5 s** |
| Consolidado por WhatsApp, base sana | 15 + 13.5 + 3 + 30 + 2 | **≈ 64 s** | 120 | **sí, 56 s** |
| Consolidado por WhatsApp, base lenta | 15 + 360 + 800 | **≈ 1,175 s** | 120 | **NO (10×)** |
| `/api/cron/facturar` | corta antes de abrir sesión si quedan <150 s | **≤300 s por construcción** | `maxDuration = 300` | **sí** |
| `/api/cron/facturar/cola` (QStash) | mismo lote, presupuesto propio | ≤600 s | `maxDuration = 600` | **sí** |
| `cuadrar_viaje` + `guardar_liquidacion` | 2 × 1 RPC `sumar_combustible_ejercicio` | **≈ 0.6 s** | `reloj.acotar(40_000)` | **sí — cerró esta ronda** |

**Costo por operación:**

| operación | tokens (peor caso) | $/turno | tope | ¿medido? |
|---|---|---|---|---|
| Copiloto (`/api/admin/copiloto`) | 146 k in / 8.1 k out, sin caché | **$0.064** | **ninguno** | **no** (solo `logger.info`) |
| Chat del panel | ~130 k in / 8 k out, sin caché | **$0.06** | $1/día/tenant | sí (`llm_costo`) |
| OCR de un comprobante | 1 imagen a resolución nativa | $0.0015–0.0188 según env | — | sí |
| Los 6 agentes de flota | 0 | **$0** | — | n/a |

**Método.** Cada eslabón se cobra a su techo declarado en el código
(`SEND_TIMEOUT_MS = 10_000` y `DOWNLOAD_TIMEOUT_MS = 15_000` en `meta/client.ts:10,17`,
`TOPE_CONSULTA_MS = 8_000` en `presupuesto.ts:101`) o, cuando eso da un número
absurdo para el camino sano, a los costos unitarios que el propio repo escribe en
`PASOS_CIERRE` (0.3 s consulta, 1.5 s `sendText`, 2.5 s `sendDocument`, 0.5 s URL
firmada). Las cantidades de filas salen de los límites escritos en las consultas
(`.limit(100)`, `.limit(1000)`, `LOTE = 10`) o del cliente de 15,000 viajes/mes
que la 0111, la 0112 y `docs/escala-15k.md` toman como referencia. Los tokens del
Copiloto se midieron sobre el archivo (`SYSTEM_COPILOTO` = 2,013 chars) y sobre
los topes que valida su propia ruta (24 mensajes × 2,000 chars).

---

## Lo que revisé y está bien

- **La mig. 0112 movió agregación de verdad, no la reacomodó.** Verificado
  llamador por llamador: `getAcumuladoCombustible` (`repo.ts:918-948`) llama
  `sumar_combustible_ejercicio` **y va envuelta en `acotada`** — el ALTO del pase 3
  (216 páginas × 2 llamadas = 130 s en el camino caliente del cuadre, ~12,000
  veces/mes) queda en **≈ 0.6 s por cuadre**. `getKpis` (`analytics.ts:178`),
  `getAcreditables` (`:640`) y `getSerieComparativa` (`:107`) igual. Es el único
  arreglo de este rubro en cuatro rondas que se puede medir contra su número
  anterior, y la 0112 documenta por qué `getGastosFiscales` NO se movió (la lógica
  fiscal viviría en dos lenguajes) — un «no» razonado vale más que un sí apurado.
- **Los cuatro RPC fallan cerrado por FORMA, no solo por error.**
  `analytics.ts:119-123`, `:189-190`, `:645-646`, `negocio.ts:87-98`: si la
  migración no está aplicada, la respuesta no se lee como «cero», se lanza. Es
  exactamente la lección de `exigir()` aplicada al patrón nuevo, sin que nadie la
  pidiera.
- **`/api/cron/facturar`** — `MARGEN_LOTE_MS = 150_000` contra
  `PRESUPUESTO_LOTE_MS = maxDuration * 1000` (`route.ts:136`), derivado de la MISMA
  constante y comprobado **antes de abrir cada `conNavegador`** con el peor caso
  medido de una sesión (~147 s). Sigue siendo el único camino del repo donde el
  reloj está anclado a la invocación. Y el descargo a QStash (`cola/route.ts:12`,
  `maxDuration = 600`) rompe el techo de 300 s de forma limpia.
- **El loop-guard corta antes de pagar** (`openrouter.ts:779-781`): en la última
  ronda permitida no ejecuta las tools que nadie va a leer — ni la ronda de red ni
  la posible mutación.
- **La contabilidad de intentos fallidos de OpenRouter** (`:399-438`, `:472-476`):
  el costo se cobra ANTES de cualquier salida y el `usage` viaja dentro de
  `StructuredError`/`PartialExecutionError`. Un negocio que cobra por liquidación
  no puede subestimar el unitario.
- **`costoReal` prefiere el número del proveedor sobre la tabla** (`:182-193`), con
  la medición que lo justifica escrita al lado (caché de prompt: $0.0239 → $0.0020,
  −91.6 %, y la tabla decía lo mismo las dos veces).
- **El OCR manda UNA sola imagen** (`ocr.ts:244-257`): el decodificador de códigos
  —gratis— elige cuál y la llamada de visión lleva `images: [principal]`. El
  defecto es su resolución (arriba), no su cantidad.
- **`decodeCodigosFromImage` acotó su propio costo con medición**
  (`cfdi.ts:243-249`): dos escalas y no más, «*sobre una foto de 24 Mpx la pasada a
  resolución nativa cuesta segundos y no encuentra nada que no encuentre la de
  1600 px, medido el 27-jul-2026*». Ese es el método correcto — por eso duele que
  la llamada de pago no lo herede.
- **Los seis agentes de flota no gastan un token.** Re-verificado por grep:
  `generateResponse`/`generateStructured`/`generateWithTools` solo aparecen en
  `intake/ocr.ts`, `agents/run.ts`, `agents/analista.ts` y `agents/copiloto.ts`.
  Cobranza, Conductores, Facturas, Liquidación, Peajes y Proveedores son código
  determinístico: su costo por corrida es WhatsApp y consultas.
- **`traerTodo` lanza en vez de devolver un recorte** (`pg.ts:183-221`), con la
  prueba de completitud por `count` gratis en la primera página. Su techo de 100
  páginas es la razón de que varias caducidades de arriba sean *degradación* y no
  *mentira*, que es la elección correcta.
- **El tope diario del chat falla cerrado** (`chat/route.ts:81-95`): si no se puede
  leer el gasto del día, no se gasta más.
- **El ruteo de OCR sigue con su medición escrita** (`models.ts:32-48`): el default
  `gemini-3.6-flash` **pierde** contra `gemini-3.1-flash-lite` en las tres métricas
  y cuesta 12.5× más, y la decisión de dejar el override en `LIKIDA_MODEL_OCR` está
  argumentada. Caveat que no llega a hallazgo: en un entorno donde esa variable no
  esté puesta (preview, un proyecto nuevo), el OCR cuesta **$0.0188 vs $0.0015 por
  comprobante** — a 45,000 comprobantes/mes, $846 vs $67.

---

## Lo que NO alcancé a revisar

- **Latencia real Vercel ↔ Supabase.** Todas las sumas usan 0.3 s por consulta,
  que es el número que el propio repo escribió en `PASOS_CIERRE`. Nadie lo ha
  medido contra producción (`presupuesto.ts:97-99` lo admite). Si el p95 real es
  0.8 s, cada suma se multiplica por ~2.7 y dos caminos más dejan de caber. Es la
  cuarta ronda que este pendiente sigue abierto.
- **La cola de aprobación (mig. 0117, `agentes/cola.ts`, `/admin/aprobaciones`).**
  Solo toqué `urgentesVencidas(10)` como eslabón del cron nuevo; no conté consultas
  por request de esas pantallas ni el costo de un ciclo aprobación→ejecución.
- **`copiloto-acciones.ts`** — el camino 2 de la ruta (`route.ts:64-83`, sin modelo)
  no lo medí; asumí que una acción determinista es barata sin comprobarlo.
- **`src/lib/correo/**` (Resend)** — costo por correo, tope de adjuntos del webhook
  entrante y señal de aborto del envío. Tercera ronda sin revisar.
- **`src/lib/observability/**`** — `flushObservabilidad` se espera al final del
  `after()` del webhook; no medí su techo, y un flush lento entra directo en el
  peor caso del cierre (el mismo que ya sale −1.5 s).
- **`api/v1/`** — consultas por request de las rutas públicas y costo de la
  idempotencia durable (mig. 0098).
- **Índices reales en la base.** Leí las migraciones, no un `pg_indexes` contra el
  proyecto. Si alguna 0092–0120 no está aplicada, los planes que asumo cambian —y
  con los RPC de la 0112 eso ahora significa que la pantalla **lanza**, no que va
  lenta.
- **Tokens de visión por imagen.** No pude verificar si el proveedor reescala del
  lado suyo, así que el hallazgo del OCR se sostiene solo sobre bytes y tiempo.
- **Costo por liquidación de punta a punta.** El objetivo declarado es $0.03–0.05
  (`models.ts:17`). No hay corrida reciente que lo verifique y no la puedo levantar
  sin llamadas de pago (`pruebas-manuales/` está prohibido en esta fase). Cuarta
  ronda que la cifra que define el precio del producto sigue sin medirse.
