# Rendimiento y costo — auditoría 3

**Nota: 4/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. Los
dos CRÍTICOS del pase 1 se dieron por cerrados y los dos arreglos están vivos
—`enLotes` en `consolidado.ts:268`, `PLAZO_COBRANZA_GLOBAL_MS` y el rescate de
claims en `cobranza.ts:207-215,315`—, pero **ninguno de los dos cierra la ruta
que medía**: REND-C1 acotó el bucle y dejó el módulo sin reloj y llamado desde
una server action sin `maxDuration`; REND-C2 le puso reloj a la cobranza y dejó
sin reloj a la escalación, que corre ANTES en la misma invocación y se come los
120 s ella sola. Además el reloj de 90 s se mide desde que arranca la cobranza,
no desde que arrancó la función. Sube el crédito por el trabajo real hecho
(`enLotes` probado, `facturar` genuinamente presupuestado, TC-A1 cobrando el
turno que truena); baja lo mismo por tres CRÍTICOS abiertos, dos de ellos
reincidentes de los arreglos que se acreditaron.

**El riesgo mayor, hoy:** el cron horario `/api/cron/escalar` no cabe en su
propio `maxDuration` **ni en el caso típico** —100 viajes × 3 envíos seriales ≈
330 s contra 120—, así que Vercel lo mata a media escalación con `escalado_en`
ya sellado (el viaje no vuelve a escalar NUNCA) y con la cobranza global sin
haber corrido una sola vez.

---

## Hallazgos

### [CRÍTICO] La escalación corre sin reloj y se come el cron entero antes de que la cobranza arranque

`src/app/api/cron/escalar/route.ts:11,73-93` · `src/lib/likida/escalar_viaje.ts:96,196-277` ·
`src/lib/likida/agentes/cobranza.ts:315` · (REINCIDENTE de REND-C2)

**Entra:** una flota con 100 viajes asignados que los choferes no aceptaron en 5 h
(`viajesSinAceptar` trae `limit(100)`, escalar_viaje.ts:96). **Sale mal:** el `for`
de `escalarViajesSinAceptar` (l.196) no consulta ningún reloj en ninguna de sus
iteraciones. Por viaje escalado:

| eslabón | dónde | típico | tope |
|---|---|---|---|
| `reclamarEscalacion` UPDATE | escalar_viaje.ts:311 | 0.3 s | sin tope (undici 300 s) |
| `sendText` al chofer | escalar_viaje.ts:228 | 1.5 s | 10 s (`SEND_TIMEOUT_MS`) |
| `avisarAlChofer` de respaldo | escalar_viaje.ts:232 | — | 3 consultas + `sendTemplate` 10 s |
| `sendText` al jefe | escalar_viaje.ts:261 | 1.5 s | 10 s |
| `sendTemplate` de respaldo | escalar_viaje.ts:263 | — | 10 s |

Típico = **3.3 s × 100 = 330 s**. Peor caso = **41.2 s × 100 = 4,120 s**. El
`maxDuration` es **120 s** (route.ts:11). El punto de equilibrio son 36 viajes;
el `limit` es 100.

Y encima, cuando la escalación sí termina, `ejecutarCobranzaGlobal` calcula su
vencimiento con `Date.now() + PLAZO_COBRANZA_GLOBAL_MS` **dentro de sí misma**
(cobranza.ts:315), no contra el inicio de la invocación: si la escalación gastó
60 s, la cobranza se cree con derecho a 90 s más = 150 s. El comentario de la
línea 297-298 afirma lo contrario ("90 s de los 120 … el resto es margen para la
escalación que corre antes"), y no hay ningún mecanismo que lo cumpla.

**Consecuencia:** Vercel mata la invocación. Los viajes ya reclamados tienen
`escalado_en` sellado —el claim y el cierre son la MISMA escritura, por diseño
(escalar_viaje.ts:293-299)— así que el jefe nunca recibe su aviso y ese viaje
**no vuelve a escalar jamás**. La cobranza global no llega a correr ninguna hora
en que haya carga de escalación. Y el `huboFallo → 500` que OP-C1 instaló
(route.ts:99) no se ejecuta: la función muere antes del `return`.
**Causa raíz probable:** REND-C2 presupuestó el segundo motor del cron y dejó el
primero —que es el que puede llenar la invocación solo— sin reloj.

---

### [CRÍTICO] "Ejecutar ahora" de Cobranza manda hasta 500 mensajes en serie, sin reloj y sin `maxDuration`

`src/app/dashboard/agentes/cobranza/page.tsx:102` · `src/lib/likida/agentes/cobranza.ts:187,237-286`
· (REINCIDENTE de REND-C2)

**Entra:** un encargado aprieta "Ejecutar ahora" en una flota con 500 viajes en
cola (`colaCobranza` lee `.limit(500)`, cobranza.ts:117). **Sale mal:** la server
action llama `ejecutarCobranza(tenantId, new Date(), { ignorarVentana: true })`
— **sin `venceEn`**. El corte por reloj de la línea 243 es
`if (opts.venceEn !== undefined && …)`: con `undefined` no corta nunca. Por fila:
insert del claim (0.3 s) + `sendText` (1.5 s típico / 10 s tope) + update del
resultado (0.3 s) + update del sello (0.3 s) = **2.4 s típico / 10.9 s tope**.

500 × 2.4 = **1,200 s** (20 minutos). Ninguna página de `src/app/dashboard/**`
declara `maxDuration` (verificado: `grep -rn maxDuration src/app/dashboard/` → 0
resultados) y `next.config.ts` no fija ninguno, así que la acción corre con el
default de la plataforma. No cabe con ningún default plausible.

**Consecuencia:** la invocación muere a media cola con los claims YA insertados
(`enviado=false`, `detalle=null`). Esos tiers quedan consumidos sin que ningún
chofer reciba nada, y `cortadosPorReloj` reporta 0 porque el corte nunca se
evaluó — la pantalla le dice al encargado que se contactó a menos gente de la que
se cobró en tiers, sin decir que se cortó. Es exactamente el daño que REND-C2
describió ("cortar DESPUÉS de reclamar consumiría tiers sin mandar nada",
cobranza.ts:238-242) dejado abierto en el camino que un humano dispara.
**Causa raíz probable:** el presupuesto se pasó como parámetro opcional en vez de
vivir dentro de `ejecutarCobranza`, y el segundo llamador no lo pasó.

---

### [CRÍTICO] El cruce del consolidado sigue sin reloj y su ventana de corrupción sigue abierta

`src/lib/likida/intake/consolidado.ts:258-298` · `src/app/dashboard/agentes/peajes/page.tsx:19,74`
· `src/lib/likida/processor.ts:427,556,1402` · (REINCIDENTE de REND-C1)

`enLotes(porLigar, 10, …)` está vivo (consolidado.ts:268) y sí reduce el tiempo.
Pero el arreglo **no añadió presupuesto ni reanudabilidad**, que era la otra mitad
de lo que el propio hallazgo pedía, y el comentario que lo justifica sigue
midiendo contra `maxDuration=120` (l.261) — un número que **no es el límite de una
de las dos rutas que lo llaman**.

**Entra:** la oficina sube por pantalla el XML del estado de cuenta mensual del TAG.
`MAX_XML_BYTES = 4 MB` (peajes/page.tsx:19) y `cfdi_xml.ts` no acota
`lineas`: un ECC12 a ~700 bytes por concepto da **~5,000 líneas**. **Sale mal:**

| eslabón | peor caso |
|---|---|
| `upsert cfdi_xml` | 0.3 s (tope `acotada` 8 s) |
| lectura de líneas existentes | 0.3 s (8 s) |
| `candidatos_gasto` | 0.3 s (8 s) — y **sin paginar**: PostgREST recorta a 1,000 |
| `enLotes` 5,000/10 = **500 lotes** | 500 × 0.3 s = **150 s** (tope: 500 × 9.5 s) |
| `upsert` de 5,000 filas de línea | 1-2 s |

**152 s** contra los 120 s del webhook, y contra el default sin declarar de la
página. **Consecuencia:** si la invocación muere entre el bucle de ligado (l.268)
y el `upsert` de `cfdi_consolidado_linea` (l.293), los `gasto` quedan **sellados
con `cfdi_uuid` y sin una sola fila de línea**. El reenvío del mismo XML pasa el
chequeo de idempotencia de la l.230-237 (no hay líneas), vuelve a correr el JOIN,
y los gastos ya sellados quedan fuera de `candidatosDb` por el `.is('cfdi_uuid',
null)` → esas líneas se reportan huérfanas. Es literalmente la corrupción que el
comentario del arreglo dice haber evitado; el arreglo la hizo menos probable, no
imposible.
**Causa raíz probable:** se atacó el eslabón lento y no el orden de escritura.

---

### [ALTO] El rescate de claims huérfanos re-envía a quien SÍ recibió el mensaje

`src/lib/likida/agentes/cobranza.ts:199-215` vs `:272-275`

**Entra:** una corrida de cobranza que manda bien el WhatsApp (`sendText` devuelve
wamid) y falla —o muere— en el `update({ enviado, detalle })` de la l.272. Ese
update es best-effort: su error solo produce `logger.warn`
(`cobranza.resultado_sin_anotar`, l.275). **Sale mal:** la fila queda
`enviado=false`, `detalle=null`. Dos corridas horarias después
(`created_at < ahora - 3,600,000`, l.212) el rescate la **BORRA**, el unique
`(viaje, tier)` queda libre, `tierPendiente` vuelve a proponer ese mismo tier, y
el chofer recibe el mismo "Llevas N días…" **por segunda vez**.

El comentario de la l.205-206 afirma que las filas legítimas no caen ahí porque
"siempre llevan `detalle`". Es cierto de las de sin-teléfono y de las de envío
rechazado. **No es cierto del envío EXITOSO cuyo update no asentó**, que es
precisamente el escenario que REND-C2 describe (crash entre claim y resultado).
La bitácora no puede distinguir "murió antes de mandar" de "murió después de
mandar", así que el rescate es una apuesta a que fue lo primero.

**Consecuencia:** duplicados en el canal cuyo modo de falla el propio repo
documenta como fatal ("un canal que insiste todos los días se aprende a ignorar",
cobranza.ts:29-31), y doble cargo de mensaje utility de Meta ($0.008 c/u,
`costos.ts:47`) por chofer duplicado.
**Causa raíz probable:** el claim no registra el wamid, así que la evidencia de
"ya salió" se escribe en el mismo update que puede fallar.

---

### [ALTO] El presupuesto del webhook se crea POR MENSAJE: en una ráfaga, los últimos creen tener 120 s enteros

`src/lib/likida/processor.ts:354` · `src/app/api/webhook/whatsapp/route.ts:40,77,168-171`

`crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)` se ejecuta **dentro de
`processInbound`**, o sea una vez por mensaje, tomando `Date.now()` en ese
instante. El pool de 5 (route.ts:40) reparte los mensajes de UNA invocación, y su
comentario justificatorio dice "la sexta arranca cuando una termina, **con el
presupuesto ya gastado descontado por `crearPresupuesto`**" (route.ts:30-31).
Eso no ocurre: la sexta arranca con 120 s frescos.

**Entra:** Meta entrega 22 fotos en un POST (el caso que route.ts:17-27 describe
como real). **Sale mal:** peor caso por foto —`downloadMediaAsDataUrl` 2 × 15 s
(`DOWNLOAD_TIMEOUT_MS`, meta/client.ts:10) + dos pasadas de `sharp`/zxing ~2 s +
OCR `reloj.senal(25_000)` (processor.ts:586,829) + `consultarCFDI` 4 s
(sat.ts:36) + escrituras— = **~63 s**. 22 fotos / pool 5 = **5 olas**; la quinta
arrancaría en t≈254 s. Vercel mata a 120 s. Aun con los tiempos MEDIDOS que cita
el propio test (`presupuesto_camino.test.ts:85`, "fotos en paralelo ~3.5 s"), las
olas 3ª en adelante corren sin que su reloj sepa que ya se gastaron 60-80 s.

**Consecuencia:** las fotos de las últimas olas se pierden **en silencio y para
siempre**: `claimMessage` (processor.ts:330) ya tomó su `waMessageId`, así que la
reentrega de Meta —el único mecanismo de recuperación que el repo declara
(route.ts:126-137)— devuelve `'duplicado'` y no reprocesa nada.
`presupuesto_camino.test.ts` prueba el caso de UN mensaje y nunca modela la
ráfaga, que es el caso para el que el pool existe.
**Causa raíz probable:** el reloj se colocó en la unidad "mensaje" cuando el
recurso escaso es la unidad "invocación".

---

### [ALTO] El tope diario de gasto del chat falla ABIERTO: suma una lectura que PostgREST recorta a 1,000 filas

`src/app/api/dashboard/chat/route.ts:72-83` · (REINCIDENTE — `costos.ts:252-272`, "EL QUINTO CAMINO")

```
supabaseAdmin().from('llm_costo').select('costo_usd')
  .eq('tenant_id', tenantId).eq('fase', 'chat')
  .gte('created_at', inicioDiaMxIso(ahoraMs()))
```

Sin `traerTodo`, sin `range`, sin `count`, sin `limit`. Es la consulta que
`costos.ts:259` transcribe palabra por palabra como el error que se arregló en la
migración 0064, y aquí vive en el único lugar donde la consecuencia es **dinero
que se sigue gastando**.

**Entra:** un tenant con el modelo barato activo (`gpt-5-nano` a $0.05/$0.4 por
1M, openrouter.ts:134) y un bucle de cliente. Cada turno escribe 1-3 filas
(`for (const [modelo, c] of Object.entries(r.costoPorModelo))`, route.ts:108).
**Sale mal:** a partir de la fila 1,001 del día, `gastadoHoy` deja de crecer —el
`reduce` de la l.82 suma sobre un arreglo recortado en silencio— y **la
comparación `gastadoHoy >= topeDiaUsd()` no vuelve a ser cierta nunca ese día**.
El techo de $1 USD/día/tenant (l.32-41) se vuelve inaplicable exactamente en el
patrón de abuso para el que se escribió.

**Consecuencia:** el candado anti-quemadura que el producto anuncia en su propio
comentario ("tres capas", l.8-14) tiene la tercera capa rota, y falla en la
dirección cara. Encima el fallo es indistinguible del funcionamiento normal.
**Causa raíz probable:** se arregló la agregación de `/admin` (mig. 0064) y no se
barrió el resto de lecturas de `llm_costo`.

---

### [ALTO] La ventana de 40 s del analista no acota las tools, que son la parte cara

`src/lib/agents/analista.ts:313-330` · `src/lib/llm/openrouter.ts:717-728,786-835` · `src/app/api/dashboard/chat/route.ts:30`

`ejecutarAnalista` arma un `AbortController` con `setTimeout(…, 40_000)` y lo pasa
como `signal`. En `generateWithTools` ese signal llega **solo** a
`client.chat.completions.create(body(), signalOpt)` (openrouter.ts:719,724). El
`Promise.all` que ejecuta las tools (l.786-835) **no lo recibe ni lo consulta**.

**Entra:** el usuario pregunta por rutas en un tenant con 60,000 gastos.
**Sale mal:** la tool `top_rutas` (`chat-tools.ts:183`) llama
`getTopRutasPorGastoSeries`, que calcula **los tres modos** y hace 6 `traerTodo`,
tres de ellos sobre la tabla `viaje` COMPLETA (analytics.ts:1133-1136 — la
consulta de `viaje` no lleva ventana ni en el modo semanal). 60 páginas
secuenciales × 250 ms = 15 s por `traerTodo`, y ninguna lleva `acotada`
(`grep -c acotada src/lib/likida/analytics.ts` → **0**), así que su tope real es
el default de undici: 300 s.

Suma de la ruta: sesión 0.6 + tope diario 9.5 (`acotada` 8 s + 1.5 de gracia,
presupuesto.ts:104,163) + 40 de agente + **la ronda de tools en vuelo cuando
vence el reloj** (~35 s) + `registrarCosto` ×3 (0.9) + `guardarIntercambio` (0.5)
= **86.5 s contra `maxDuration = 60`**.

**Consecuencia:** la respuesta ya salió como stream `200` (route.ts:154), así que
el cliente recibe un NDJSON **sin evento `t:'fin'` y sin `t:'error'`** — la
pantalla se queda pensando. Y el costo del turno no se registra: el
`registrarCosto` de la l.108 y el del `catch` de TC-A1 (l.137) están los dos
después del punto donde muere la función.
**Causa raíz probable:** el reloj cubre el eslabón que se sospechaba caro (el
modelo) y no el que de verdad escala con los datos (las tools).

---

### [ALTO] El Inicio del panel descarga la tabla `gasto` completa ~5 veces y la `viaje` ~5 veces, en un solo render

`src/app/dashboard/inicio-contenido.tsx:88-120` · `src/lib/likida/analytics.ts:105-128,174-179,358-366,1120-1137,1169-1185`

Las 16 lecturas del `Promise.all` se solapan sobre las mismas tablas:

| función | lecturas de `gasto` | de `viaje` | de `liquidacion` |
|---|---|---|---|
| `detectarAnomalias` | 1 × TODO | — | — |
| `getSeriesKpiCards` (3× `getSerieComparativa`) | 14 d + 60 d + **TODO** (3650 d) | ídem | 3 × ~TODO |
| `getGastoPorSemanaSeries` | 35 d + 91 d + 364 d | — | — |
| `getLiquidadoPorSemanaSeries` | — | — | 35 d + 91 d + 364 d |
| `getTopRutasPorGastoSeries` | 35 d + 91 d + TODO | **3 × TODO** | — |
| `getViajesPorMes` | — | 1 × TODO | — |
| `getAcreditables`, `getKpis` | — | — | 2 |

**Entra:** una flota de ~40 camiones con un año operando ≈ 24,000 `gasto`.
**Sale mal:** ~5 barridos completos = **~120,000 filas** sobre el cable en un solo
render, ~130 viajes de red HTTP (`PAGINA = 1,000`, pg.ts:45), y el traerTodo más
profundo es una cadena **secuencial** de 24 páginas ≈ 6 s de reloj de pared
mínimo. A 60,000 gastos son ~330,000 filas y 60 páginas encadenadas ≈ 15 s. Sin
`maxDuration` declarado en la página y sin `acotada` en ninguna de las 70 llamadas
a `traerTodo` de `analytics.ts`.

Hay además un **techo duro no declarado**: `MAX_PAGINAS = 100` (pg.ts:48). Al pasar
de 100,000 filas en cualquiera de esas tablas, `traerTodo` **lanza**
`LecturaIncompleta`, el `safe()` de inicio-contenido.tsx:36 lo convierte en `null`
y las tarjetas se apagan. Honesto —no miente—, pero es una flota sana viendo un
panel muerto sin explicación de por qué.
**Causa raíz probable:** cada `*Series` se construyó agregando en JavaScript un
periodo a la vez, sin que nadie sume lo que las cinco piden juntas.

---

### [ALTO] N+1 en el importador: una lectura COMPLETA de `operador` por cada nombre distinto del archivo

`src/lib/likida/importar_viajes.ts:190-202` · `src/lib/likida/crear_viaje_wa.ts:753-785` · `src/app/dashboard/viajes/page.tsx:15,97`

**Entra:** un CSV del TMS de hasta 8 MB (`MAX_IMPORT_BYTES`, viajes/page.tsx:15) —
sin tope de filas en `interpretarFilasViajes` — con 2,000 viajes y 200 choferes
distintos. **Sale mal:** el `for (const f of nuevas)` llama
`resolverOperadorPorNombre` una vez **por nombre distinto**, en serie
(importar_viajes.ts:193). Y esa función no busca: hace un `traerTodo` de **toda la
tabla `operador` activa del tenant** (crear_viaje_wa.ts:771-778) y compara los
nombres en JavaScript.

200 nombres × (1 página + 1 página vacía de prueba, porque la llamada **no usa
`conteo(d)`**) × 250 ms = **~100 s**, más el `traerTodo` de folios (l.175) y 20
lotes de insert. Server action sin `maxDuration`.

**Consecuencia:** el import muere a media pasada. Los lotes ya insertados quedan
(el código lo asume y lo dice, l.225), pero el usuario ve la petición colgada sin
el mensaje que se escribió para eso.
**Causa raíz probable:** se reusó la función del despacho por WhatsApp —que
resuelve UN nombre por conversación— dentro de un bucle de N.

---

### [MEDIO] Las tools del chat calculan tres periodos y tiran dos

`src/lib/agents/chat-tools.ts:153,168,183,230,233` · `src/lib/likida/analytics.ts:526-530,584-586,1179-1183`

`const s = (await getGastoPorSemanaSeries(ctx.tenantId, hoyIso()))[modoDe(args)]`
— el `Series` corre las tres ventanas en `Promise.all` y el índice descarta dos.
Aplica igual a `serie_gasto`, `serie_liquidado`, `top_rutas` y `proyectar_serie`
(que además puede llamar dos `*Series` en el mismo handler, l.230-233).
**Consecuencia:** 3× las consultas y 3× las filas transferidas por cada tool que
el modelo invoque, dentro de un turno acotado a 40 s y con hasta 5 rondas.
**Causa raíz probable:** las funciones `*Series` se escribieron para una pantalla
que sí pinta las tres vistas, y la tool las reusó tal cual.

### [MEDIO] La sonda de ingesta gasta visión sin registrar el costo y sin ningún tope

`src/app/api/dashboard/ingesta/route.ts:50-54`

Corre `extraerComprobante` —el OCR real— y **loguea** `costoUsd` sin llamar nunca
a `registrarCosto`. No hay tope diario (el chat sí lo tiene, `route.ts:38`) ni
límite de frecuencia. **Consecuencia:** cualquier usuario con área `dinero` puede
gastar OpenRouter indefinidamente, y ese gasto **no existe** para
`resumen_costo_ia_tenant` ni para `getResumenCosto`, que devuelve
`estado: 'medido'`. Choca de frente con la regla del propio módulo: "cero solo se
pinta cuando cero es una medición" (`costos.ts:31`).
**Causa raíz probable:** "es una sonda, no escribe nada" se leyó como "no hay
nada que medir".

### [MEDIO] La imagen del OCR se manda al modelo sin redimensionar

`src/lib/likida/intake/ocr.ts:249,257` · `src/lib/meta/client.ts:413-432` · `src/lib/likida/intake/cfdi.ts:249`

`decodeCodigosFromImage` sí baja la foto a 1600/1000 px con `sharp` — pero solo
para leer códigos. Al modelo de visión le llega `principal`, que es el data-URL
**crudo** de `downloadMediaAsDataUrl`. Una foto de teléfono de 4032×3024 se
tesela en 6×4 = 24 bloques de 768 px (~6,200 tokens de entrada) contra 3×2 = 6
bloques (~1,550) si se bajara a 1600 px: **4× la entrada por comprobante**, más
~5 MB de base64 subidos a OpenRouter en cada llamada. `sharp` ya está instalado,
ya se invoca sobre esa misma imagen y ya está en `serverExternalPackages`.
**Causa raíz probable:** el resize se añadió para zxing y nunca se propagó al
único otro consumidor de la misma foto.

### [MEDIO] `candidatos_gasto` del consolidado sin paginar: PostgREST recorta a 1,000 y las líneas salen huérfanas

`src/lib/likida/intake/consolidado.ts:242-248`

Sin `traerTodo`, sin `range`, sin `count`. **Entra:** una flota con más de 1,000
gastos sin `cfdi_uuid` dentro de la ventana de fechas del estado de cuenta (un mes
de una flota mediana lo pasa). **Sale mal:** `candidatosDb` llega recortado en
silencio, `conciliarLineas` no encuentra el gasto que sí existe, y la línea se
reporta `por_conciliar` **con `candidatos: []`** — indistinguible de "nadie
cuadra". El contador la resuelve a mano contra una lista que no se le puede
ofrecer (`resolverLineaAMano` solo admite candidatos ya ofrecidos, l.379-382).

### [MEDIO] `ejecutarCobranzaGlobal` descubre los tenants con un `limit(1000)` sobre `viaje`

`src/lib/likida/agentes/cobranza.ts:302-309`

Se leen 1,000 filas de `viaje` solo para hacer `new Set(v.tenant_id)`. Con más de
1,000 viajes abiertos en el sistema, las flotas cuyos viajes caen fuera de esas
1,000 filas (sin `order` explícito) **nunca entran a la cobranza**, y no hay
manera de notarlo: el resultado dice `tenants: N` como si N fueran todas.

### [MEDIO] Ni una consulta del camino del cron ni del panel lleva `acotada`

`src/lib/likida/analytics.ts` (0 usos) · `agentes/cobranza.ts` (0) · `escalar_viaje.ts` (0)

`presupuesto.ts:76-101` documenta con detalle por qué esto es fatal —"Vercel mata
la función a los 120 s, o sea 180 s ANTES de que ese fetch se rinda"— y el
mecanismo se aplicó a `repo.ts`, `costos.ts`, `conv.ts` y `config.ts`. Los tres
archivos de arriba se quedaron fuera: son 70 `traerTodo` que alimentan 31 páginas
y los dos motores del cron horario. Una sola consulta colgada se lleva la
invocación entera sin dejar rastro.

---

### [BAJO] 36 de 70 `traerTodo` no piden `conteo(d)` y pagan un viaje de red extra cada uno

`src/lib/likida/pg.ts:118-130`. El propio contrato lo dice: sin `count`, la única
prueba de que la lectura está completa es una página vacía. En las lecturas de
tabla completa del Inicio eso es ~+15 % de round trips gratis de evitar.

### [BAJO] `PASOS_CIERRE` presupuesta contra líneas de `processor.ts` que ya no existen

`src/lib/likida/presupuesto.ts:37-51`. La tabla apunta a `processor.ts:591`
(hoy un comentario), `:658` (`logger.error('huerfano.error')`), `:715`
(`const llegoSola`), `:755` (`downloadMediaAsDataUrl`). `presupuesto.test.ts`
solo compara la **suma** (8.9 s) contra `MARGEN_CIERRE_MS` (12 s), no que los
trece pasos sigan siendo los del cierre. El mecanismo que la nota de la l.30-32
promete —"meter un paso más al cierre deja de ser un descuido silencioso"— no
existe: la tabla se desincronizó del código sin que nada se pusiera rojo.

---

## Sumas del peor caso

| Ruta | `maxDuration` | Eslabones y peor caso | Suma | ¿Cabe? |
|---|---|---|---|---|
| `/api/cron/escalar` | **120 s** | `escalarViajesSinAceptar` 100 viajes × (claim 0.3 + sendText 10 + avisarAlChofer ~11 + sendText 10 + sendTemplate 10) = 4,120 s · `ejecutarCobranzaGlobal` 90 s (reloj propio, medido desde su propio inicio) + rebase ~11 s | **4,221 s** (típico: **431 s**) | **NO** — ni el típico |
| server action `ejecutarAhora` (Cobranza) | **no declarado** | config 0.3 + rescate 0.3 + cola 0.6 + 500 × (claim 0.3 + sendText 10 + update 0.3 + sello 0.3) | **5,451 s** (típico **1,201 s**) | **NO** |
| `guardarYConciliarConsolidado` (webhook) | 120 s | 3 consultas 0.9 + `enLotes` 500 lotes × 0.3 + upsert 2 | **153 s** | **NO** |
| `guardarYConciliarConsolidado` (pantalla peajes) | **no declarado** | lo mismo, más las 4 lecturas de analytics del render | **>153 s** | **NO** |
| `/api/webhook/whatsapp`, 1 foto | 120 s | claim 0.3 + operador 0.3 + descarga 30 + zxing 2 + OCR 25 + SAT 4 + cierre 8.9 | **70.5 s** | sí, 49.5 s de holgura |
| `/api/webhook/whatsapp`, ráfaga de 22 fotos, pool 5 | 120 s | 5 olas × 63 s, cada ola con un presupuesto NUEVO de 120 s | **315 s** | **NO** |
| `/api/dashboard/chat` | 60 s | sesión 0.6 + tope diario 9.5 + agente 40 + ronda de tools en vuelo 35 + costos 0.9 + guardar 0.5 | **86.5 s** | **NO** |
| `/api/dashboard/ingesta` | 60 s | auth 0.3 + zxing 3 + OCR 45 (`AbortSignal.timeout`) + SAT 4 | **52.3 s** | sí, 7.7 s |
| `/api/cron/facturar` | 300 s | `MARGEN_LOTE_MS` 150 s corta antes de abrir sesión; peor caso de una sesión abierta ~147 s | **297 s** | **sí** (3 s — apretado pero medido) |
| `/dashboard` (Inicio), 24,000 gastos | **no declarado** | 24 páginas encadenadas × 250 ms en la rama más profunda; ~120,000 filas y ~130 round trips en total | **~6 s** | sí hoy; **no** a 60,000 gastos (~15 s); **rompe** a 100,000 (`MAX_PAGINAS`) |

---

## Lo que revisé y está bien

- **`/api/cron/facturar`** (`route.ts:98-158`) es el único presupuesto del repo
  que hace las tres cosas: mide el peor caso de UN eslabón (~147 s de sesión de
  portal), reserva margen para él (`MARGEN_LOTE_MS = 150_000`), y **corta antes**
  de abrir la siguiente sesión dejando lo que falta sin marcar. Es el modelo que
  los otros dos crons deberían copiar.
- **`enLotes`** (`lotes.ts`) es correcto y está bien acotado: preserva el orden,
  atrapa el error por elemento sin tumbar el lote, y rechaza `tamano < 1`.
- **`traerTodo`/`exigir`** (`pg.ts`): el contrato de "devuelve todo o lanza" está
  bien construido —cursor por filas leídas y no por página, `count` como prueba
  barata, fail-closed con log—. El problema no es el helper, es cuántas veces se
  le llama sobre la misma tabla.
- **Contabilidad de tokens y costo por modelo** (`openrouter.ts:399-404,637-652`,
  `costos.ts`): se cobra el intento fallido, se acumula por ronda con el modelo
  que de verdad respondió, `costoReal` prefiere el `cost` del proveedor sobre la
  tabla, y un modelo sin precio se estima con la tarifa más cara y grita. Es la
  parte más madura del rubro.
- **TC-A1 vive**: `chat/route.ts:137-146` registra el consumo de
  `PartialExecutionError`.
- **Topes de red de Meta**: `SEND_TIMEOUT_MS = 10_000` y
  `DOWNLOAD_TIMEOUT_MS = 15_000` están puestos en los seis `fetch` de
  `meta/client.ts`. Ninguno quedó con el default de undici.
- **Caché de prompt y dedup de tools** (`openrouter.ts:676-695,798-831`): el
  `cache_control` en el system y `llaveDeCache` para tools sin parámetros
  resuelven un desperdicio real y medido.
- **Razonamiento del OCR apagado por default con la justificación escrita**
  (`openrouter.ts:220-257`): la decisión de NO tomar el ahorro del 50 % está
  argumentada contra la regla número uno del repo. No es un descuido.

## Lo que NO alcancé a revisar

- El coste real de `sharp` + `zxing-wasm` bloqueando el event loop con 5 fotos en
  paralelo. `route.ts:33-39` cita una medición en una M2 de 8 núcleos; Vercel da
  1-2 vCPU y el efecto sobre los `setTimeout` de `acotada` y del abort del OCR
  podría ser bastante peor. Hace falta medirlo en la plataforma, no en local.
- `api/cron/purgar` (`maxDuration = 120`) y `api/cron/facturar/cola`
  (`maxDuration = 600`): abiertos, no sumados.
- El costo por liquidación **medido de verdad**. `openrouter.ts:226-231` cita 57
  llamadas reales de OCR con la salida promediada, pero no encontré ninguna cifra
  equivalente para la entrada, ni un costo end-to-end por liquidación cerrada
  contra el que comparar el precio. Sin eso, "el costo por operación está medido"
  —requisito del 8— no se puede afirmar.
- El camino del PDF (`ruta_pdf_sincronizada.test.ts` sugiere que hay un
  presupuesto propio) y `facturacion/adaptadores/pagina_playwright.ts` eslabón por
  eslabón: acepté los ~147 s que el comentario de `facturar` cita de la auditoría
  10 sin re-sumarlos yo.
- Los índices de Postgres detrás de las consultas calientes (`gasto` por
  `tenant_id, fecha`, `viaje` por `estatus, avisado_en`). Sin acceso a la base no
  pude verificar si el barrido del Inicio es además un seq scan.
