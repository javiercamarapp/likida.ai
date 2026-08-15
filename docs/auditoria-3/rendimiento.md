# Rendimiento y costo — auditoría 3 (pase 3)

**Nota: 4/10** (antes 4). Razón del movimiento: **mirada más profunda**. Lo que
se atacó se movió de verdad (`enLotes`, el reloj del cron de cobranza,
`MARGEN_LOTE_MS` de facturar, la contabilidad de intentos fallidos en
OpenRouter); lo que no se atacó está byte por byte igual; y esta ronda encontró
que la afirmación del commit `36aa0e5` —«la escala aguanta»— es **falsa en dos
consultas calientes que la mig. 0111 ni menciona**. Cinco caminos vivos suman un
peor caso que excede su propio límite y mueren en silencio: el ancla del rubro
dice 4 y no hay forma honesta de subirla.

**El riesgo mayor de hoy:** el cron horario `/api/cron/escalar` tiene un
presupuesto sumado de **~420 s contra un `maxDuration` de 120 s** — 3.5× — y el
segundo motor (Cobranza) arranca su reloj de 90 s *después* de que el primero ya
se comió la invocación, así que el reloj que sí existe mide desde el punto
equivocado.

---

## Hallazgos

### [CRÍTICO] La escalación sigue sin reloj y sola ya se come 3.5× el `maxDuration` del cron
`src/lib/likida/escalar_viaje.ts:260` (el `for`), `:113` (`.limit(100)`) ×
`src/app/api/cron/escalar/route.ts:14` (`maxDuration = 120`) y `:93`

**Escenario.** Entra: una corrida horaria con el techo de la propia consulta —
**100 viajes** vencidos (`.limit(100)`, y el comentario de `:111` dice explícito
«es el presupuesto de envíos del cron»). Por cada viaje el `for` hace, **en
serie**:

| paso | dónde | costo unitario |
|---|---|---|
| `reclamarEscalacion` (UPDATE) | `escalar_viaje.ts:266` | 0.3 s |
| `sendText` al chofer | `:300` | 1.5 s (techo real 10 s, `meta/client.ts:17`) |
| `avisarAlChofer` (plantilla, si el texto rebota) | `:304` | 1.5 s + sus lecturas |
| `sendText` al jefe | `:333` | 1.5 s |
| `sendTemplate` al jefe (si el texto rebota) | `:337` | 1.5 s |

Camino feliz (solo los dos `sendText`): `100 × (0.3 + 1.5 + 1.5)` = **330 s**.
Con las dos plantillas de respaldo —el caso *probable*, porque este agente
existe para el chofer que lleva 5 h sin contestar y por tanto trae la ventana de
24 h cerrada—: `100 × 6.3` = **630 s**. Sale: Vercel mata la invocación a los
120 s, a mitad del `for`. Los viajes ya reclamados quedan con `escalado_en`
sellado y **nunca se les mandó nada** (el sello se pone *antes* de enviar,
`:266`, a propósito); los que faltaban no se tocan. No hay log de corte porque
el proceso muere antes del `logger.info` de `:367`, no hay reintento (es un
cron, no un webhook), y el `catch` de `route.ts:96` tampoco corre.

En el archivo **no aparece ni una vez** `Date.now()`, `venceEn`, `reloj` ni
`Presupuesto` (verificado por grep: los dos únicos aciertos de «reloj» son
comentarios).

**Consecuencia.** El jefe de flota no se entera de los viajes que su chofer no
aceptó, y como quedaron sellados **no se vuelven a intentar jamás**. El
`escalado_en` es un claim sin ventana de expiración (`:450-456` lo documenta:
«quien gana la fila queda escalado para siempre»). Cada corrida rota es un lote
de hasta 100 viajes perdidos para el canal de escalación, en silencio.

**Causa raíz probable:** el `for` de `:260` no consulta ningún presupuesto, y el
techo de 100 se eligió como «presupuesto de envíos» sin multiplicarlo por el
costo de un envío.

*(REINCIDENTE — REND-C1 del pase 2, y REND-C2 del pase 1. Tercera ronda abierto,
sin una línea de cambio.)*

---

### [CRÍTICO] El reloj de Cobranza mide desde su propio arranque, no desde el de la invocación
`src/lib/likida/agentes/cobranza.ts:363` × `src/app/api/cron/escalar/route.ts:120`

**Escenario.** `PLAZO_COBRANZA_GLOBAL_MS = 90_000` (`cobranza.ts:339`) y su
comentario dice: *«90 s de los 120 del `maxDuration` del cron — el resto es
margen para la escalación que corre antes»*. Pero `:363` hace
`const venceEn = Date.now() + PLAZO_COBRANZA_GLOBAL_MS` **dentro** de
`ejecutarCobranzaGlobal`, que arranca en `route.ts:120`, o sea **después** de
que `escalarViajesSinAceptar()` (`route.ts:93`) ya gastó lo que gastó.

Los números: si la escalación consume 60 s —una décima parte de su peor caso—,
Cobranza cree tener hasta `t = 60 + 90 = 150 s` contra un `maxDuration` de
**120 s**. Los 30 s de margen que el comentario declara para la escalación no los
comprueba nadie: no hay una sola lectura del reloj de la invocación en
`route.ts`. Suma del camino completo: `0.3 (interruptor) + 330…630 (escalación) +
0.3 + 90 (cobranza)` = **421–721 s contra 120 s**.

**Consecuencia.** El corte limpio que `cortadosPorReloj` promete (`:257-263`,
«lo que no alcanzó queda intacto y la corrida de la siguiente hora lo levanta»)
no ocurre: Vercel mata la función antes de que el reloj de 90 s se agote, y los
claims de `cobranza_contacto` ya insertados quedan con `enviado=false` y
`detalle=null` — el tier del chofer consumido sin que reciba nada. Sí existe el
rescate de huérfanos (`:222-232`), pero tarda **1 hora** en habilitarse, o sea
justo una corrida perdida por cada muerte.

**Causa raíz probable:** el presupuesto es por-motor y no por-invocación; falta
un reloj único creado en `route.ts` y pasado a los dos motores.

---

### [CRÍTICO] «Ejecutar ahora» de Cobranza: el reloj se agregó al cron y NO al botón
`src/app/dashboard/agentes/cobranza/page.tsx:108` × `src/lib/likida/agentes/cobranza.ts:261`

**Escenario.** El guardia que cerró REND-C2 es
`if (opts.venceEn !== undefined && Date.now() >= opts.venceEn)` (`:261`). La
acción de servidor del botón llama
`ejecutarCobranza(tenantId, new Date(), { ignorarVentana: true })` — **sin
`venceEn`**. Con `undefined`, la condición es falsa siempre: el guardia es letra
muerta exactamente en el camino que el hallazgo nombró («Ejecutar ahora» de
Cobranza).

Y la cola ya no está topada: `colaCobranza` cambió de `.limit(500)` a
`traerTodo` (`:117-137`), así que `paraContactar` crece con la flota. Con la
flota de 750 camiones que el propio comentario de `:360` usa como escenario y
700 filas con teléfono, por fila y **en serie**: insert del claim (0.3 s) +
`sendText` (1.5 s, techo 10 s) + `sendTemplate` de respaldo (1.5 s) + update del
resultado (0.3 s) + sello 0087 (0.3 s) = **3.9 s**.

`700 × 3.9` = **2,730 s**. Más el bucle de sin-teléfono, que también es serial
(`:244-252`). Contra el límite: `page.tsx` **no declara `maxDuration`**, así que
cae al default de la plataforma — y aun leyéndolo con la máxima generosidad
posible (los 300 s de techo del plan Pro), 2,730 s son **9×** de más.

**Consecuencia.** El contralor aprieta el botón, la pantalla se queda girando, la
función muere, y en `cobranza_contacto` quedan cientos de tiers reclamados sin
mensaje enviado. Cada uno de esos choferes pierde uno de sus tres contactos
—para siempre, salvo por el rescate de 1 hora— y el acuse nunca vuelve, así que
el humano vuelve a apretar el botón y repite el daño.

**Causa raíz probable:** el arreglo se aplicó en `ejecutarCobranzaGlobal` y el
llamador manual quedó fuera; `venceEn` es opcional en vez de obligatorio.

*(REINCIDENTE — REND-C2 del pase 2. El motor se arregló, el botón no.)*

---

### [CRÍTICO] El barrido de Peajes es un bucle serial de hasta 2,000 UPDATE, sin reloj y sin `maxDuration`
`src/lib/likida/intake/consolidado.ts:649-720` × `src/app/dashboard/agentes/peajes/page.tsx:201`

**Escenario.** `barrerPorConciliar` (`:573`) lee hasta **1,000** líneas
`por_conciliar` (`.limit(1000)`, `:584`) y las recorre en un `for` anidado
(`:649`, `:653`). Por línea conciliada hace **dos** escrituras secuenciales:
`ligarLineaAGasto` (`:672`, un UPDATE) y `marcar_conciliada` (`:678`, otro
UPDATE). Por línea que sigue pendiente y cuyos candidatos cambiaron, una más
(`:716`).

`1,000 × 2 × 0.3 s` = **600 s**, y eso sin contar los candidatos: `traerTodo`
sobre `gasto` con `cfdi_uuid is null` en el rango del estado de cuenta (`:619`)
— con los ~45,000 comprobantes/mes del cliente de 15k son **45 páginas
secuenciales** = 13.5 s más. Y `conciliarLineas` (`:115`) es O(líneas ×
candidatos) = **45 millones** de comparaciones bloqueando el event loop.

Suma: **≈ 614 s**. Contra: `peajes/page.tsx` **no declara `maxDuration`**.

Esto es la misma forma exacta que `lotes.ts:1-7` documenta haber matado
(«el cruce del consolidado hacía un UPDATE serial por línea — 1,000 líneas ≈
300 s contra `maxDuration`=120 s») — y `enLotes` existe, está probado, y este
camino, escrito en la misma semana, **no lo usa**. Su gemelo sí lo usa
(`desglose_peaje.ts:711`).

**Consecuencia.** Muerte a media pasada = gastos con `cfdi_uuid` ya sellado
(`ligarLineaAGasto` ya corrió) cuya línea sigue `por_conciliar` (el segundo
UPDATE no corrió). En la siguiente pasada, esos gastos ya **no** entran en
`disponibles` —la consulta de candidatos filtra `.is('cfdi_uuid', null)`— así
que la línea pierde su único candidato correcto de forma permanente: se queda en
la cola del contador para siempre, con una lista de candidatos que ya no
contiene al bueno. Es el contador viendo «N por revisar» que nunca baja, con el
gasto ya sellado del otro lado.

**Causa raíz probable:** el arreglo `enLotes` se aplicó al camino de ingesta y al
de desglose, y el barrido manual —añadido en el mismo bloque B1— nació serial.

---

### [ALTO] «La escala aguanta»: `getAcumuladoCombustible` barre el ejercicio entero en cada cuadre, y a 100,000 filas se rinde
`src/lib/likida/repo.ts:926-968` × `src/lib/likida/tools.ts:110` y `src/lib/likida/cuadre/desde_db.ts:86` × `supabase/migrations/0111_indices_escala.sql`

**Escenario.** La 0111 nombra esta consulta por su línea
(`repo.ts:938-940 … corre EN CADA CUADRE (~12,000 veces/mes con este cliente)`)
y le pone el índice `gasto_tenant_fecha_idx`. El índice arregla el **plan**; no
arregla lo que de verdad cuesta: la función **transfiere todas las filas** de
combustible del ejercicio, de mil en mil, por PostgREST, y las suma en
JavaScript (`:949-955`).

Cliente de 15k: ~45,000 comprobantes/mes; a un 40 % de diésel son **18,000
filas/mes**, o sea **216,000 en el ejercicio**. Eso son **216 páginas
secuenciales**, `.range(leidas, leidas + 999)` = OFFSET creciente, cada una con
su viaje de red y su techo de 8 s (`acotada`). A 0.3 s por página: **65 s**.

Y se llama **dos veces por turno**: `tools.ts:110` (`cuadrar_viaje`) y
`desde_db.ts:86` (dentro de `guardar_liquidacion`/`cuadrarDesdeDB`). **130 s**
contra el `reloj.acotar(40_000)` del agente (`processor.ts:2088`) y contra los
120 s de la invocación entera.

Y hay un acantilado: `MAX_PAGINAS = 100` (`pg.ts:48`) → a **100,000 filas de
combustible en el ejercicio** el bucle sale por el techo, `leidas < esperadas` y
**lanza** (`repo.ts:968`). Con 18,000/mes eso es el **mes 6** del cliente. Los
dos llamadores lo atrapan como best-effort (`tools.ts:120`, `desde_db.ts:88`),
así que el efecto no es un error: es que el contador del 15 % de diésel en
efectivo (RFA 2.9) **desaparece en silencio de todas las liquidaciones de esa
flota**, y el motor recibe ceros y marca el efectivo «para revisar».

**Consecuencia.** Antes del mes 6: cada liquidación paga hasta 130 s en una suma
que podría ser un `sum()` de una fila, y el turno muere por presupuesto. A partir
del mes 6: la flota más grande pierde la cifra fiscal que más le importa, con un
`logger.warn` como único rastro.

**Causa raíz probable:** se agregó un índice donde hacía falta una agregación en
SQL — exactamente lo que la 0062 ya hizo para `llm_costo` y que aquí no se hizo.

---

### [ALTO] `/admin` recorre `llm_costo` entera en cada carga de 18 páginas
`src/lib/admin/negocio.ts:82` × `supabase/migrations/0062_resumen_costo_ia.sql:44-56`

**Escenario.** `resumen_costo_ia` se llama con `p_desde`/`p_hasta` en `null`
(`negocio.ts:82`, y el comentario de la 0062 lo confirma: «`negocio.ts` los manda
`null` explícitos»), así que es un `Seq Scan` + `MixedAggregate` sobre la tabla
completa. La propia migración trae la medición: **400,131 filas → 7,488 ms**, y
decidió a conciencia no indexar («una agregación de tabla COMPLETA no puede
saltarse ninguna fila»).

Lo que la 0062 no volvió a mirar es cuánto crece la tabla. Su propio número:
«a 30 viajes diarios son ~2,000 filas al día» = **~67 filas por viaje**. El
cliente de 15k son 500 viajes/día → **33,000 filas/día**:

| momento | filas | tiempo del RPC (extrapolación lineal del Seq Scan) |
|---|---|---|
| día 12 | 400 k | 7.5 s (medido) |
| mes 1 | 1 M | ~19 s |
| mes 6 | 6 M | ~112 s |
| año 1 | 12 M | ~225 s |

Contra el límite: **18 páginas de `/admin`** llaman `getResumenNegocio()`
(`admin/flotas`, `admin/costos-facturacion`, `admin/configuracion`,
`admin/notificaciones`, …), todas `force-dynamic`, **ninguna con `maxDuration`**
y sin una sola capa de caché (`negocio.ts` no importa `unstable_cache` ni
`revalidate`). Y el purgador **no borra `llm_costo` a propósito** (0072: «NO SE
PURGA. SE CONSOLIDA»), así que la tabla crece para siempre.

Ni esta consulta ni esta tabla aparecen en la mig. 0111 —la del commit «la
escala aguanta»—, que barrió `gasto`, `viaje`, `liquidacion`,
`wa_mensaje_procesado` y descartó explícitamente `llm_costo` solo por
`vincularCostosALiquidacion`.

**Consecuencia.** La consola de Javier —la que se enseña en el demo— deja de
cargar en el primer mes del primer cliente grande, y falla como timeout de
plataforma: pantalla en blanco, sin log de aplicación, sin un número que diga
qué pasó.

**Causa raíz probable:** la ventana de fechas está construida y apagada («ver
abajo» en la 0062); nadie la encendió, y el consumidor sigue pidiendo el
histórico completo.

---

### [ALTO] El presupuesto del cierre enumera 13 pasos y hoy hay 14 — el que falta cuesta 4.6 s de una reserva de 12
`src/lib/likida/presupuesto.ts:37-72` × `src/lib/likida/processor.ts:2397` × `src/lib/likida/avisar_cierre.ts:90-133`

**Escenario.** `PASOS_CIERRE` suma 8.9 s y `MARGEN_CIERRE_MS = 12_000`, con 3.1 s
declarados de holgura. La prueba guardiana (`presupuesto.test.ts:105-119`)
comprueba la suma y que haya exactamente 13 entradas — pero un paso que **no
está en la tabla** es invisible para ella.

`avisarCierreAlJefe` (`processor.ts:2397`, esperado con `await`) no está en la
tabla, y son cuatro viajes de red más:

| paso | dónde | ms |
|---|---|---|
| `telefonoJefeDe` | `avisar_cierre.ts:95` | 300 |
| `resumenDeCierre` (2 consultas en `Promise.all`) | `:103` | 300 |
| `sendText` del aviso (si `requiereDecision`) | `:109` | 1,500 |
| `sendDocument` del PDF al jefe | `:127` | 2,500 |

**4.6 s.** Total real del cierre: `8.9 + 4.6` = **13.5 s contra una reserva de
12.0 s**. La holgura no es de 3.1 s: es de **−1.5 s**. Su propio comentario lo
declara fuera del presupuesto por escrito («son dos lecturas y un envío, no un
presupuesto», `processor.ts:2395`) — en el archivo cuya regla es que el número
escrito al lado del código tiene que coincidir con el código.

Y la tabla ya no es verificable a mano: **los 11 `donde` con línea apuntan todos
a código que no es el paso que nombran** (`processor.ts:591` es un comentario
sobre ARCO, `:658` uno sobre consolidados, `:757` un `sendText` de error de
guardado…). La prueba solo exige que el string contenga `.ts` (`:114`).

**Consecuencia.** El agente recibe `restante() = 120 − 12 − gastado` y puede
gastar hasta dejar 12 s. El cierre necesita 13.5. Vercel mata la invocación 1.5 s
tarde: cae dentro de `sendDocument`, `saveConversation` o `releaseViajeLock`. La
liquidación quedó escrita, el chofer no recibe el PDF, `pdf.no_entregado` no se
escribe porque el proceso muere antes del `catch`, y el mutex del viaje queda
tomado — el siguiente mensaje de ese chofer espera 12 s y abandona
(`processor.ts:1987`).

**Causa raíz probable:** la tabla es un inventario a mano y la prueba verifica su
aritmética, no su completitud contra `processor.ts`.

---

### [ALTO] Cada mensaje de una ráfaga estrena presupuesto de 120 s dentro de una invocación de 120 s
`src/app/api/webhook/whatsapp/route.ts:29-31` × `src/lib/likida/processor.ts:393`

**Escenario.** El comentario que justifica el pool afirma: *«cinco corriendo dan
~5 × 25 s de trabajo en vuelo, y la sexta arranca cuando una termina, **con el
presupuesto ya gastado descontado por `crearPresupuesto`**»*. Eso es falso:
`crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)` está **dentro** de `processInbound`
(`processor.ts:393`), así que cada mensaje crea el suyo con
`inicio = Date.now()` en su propio arranque. El mensaje nº 16, que empieza en
t = 75 s, cree tener 108 s por delante cuando quedan 45.

Los números del peor caso: el rate limit permite **40 mensajes por teléfono y
minuto** (`route.ts:13`) y el pool son 5 (`:40`) → **8 olas**. Por foto:
`downloadMediaAsDataUrl` (techo 15 s, `meta/client.ts:10`) + zxing síncrono +
`extraerComprobante` con `reloj.senal(25_000)` (`processor.ts:965`) + hash/subida/
insert (~2 s) = **42 s**. `8 × 42` = **336 s contra `maxDuration = 120`**. Aun con
la ráfaga «que cabe holgada» según el comentario (12 fotos, 3 olas) el peor caso
es **126 s**.

**Consecuencia.** El chofer que termina ruta y manda el fajo de veinte fotos:
las primeras 10–15 se procesan, el resto se pierde **sin una línea de log** — el
`finally` no corre, el claim de `wa_mensaje_procesado` queda tomado (así que ni
una reentrega lo recupera) y Meta ya recibió su 200. Desde su lado mandó veinte
fotos y no pasó nada. Es exactamente el modo de falla que el comentario del pool
dice haber cerrado.

**Causa raíz probable:** el presupuesto es por mensaje y el límite es por
invocación; el pool acota la concurrencia pero nadie acota el total.

---

### [MEDIO] El cruce del consolidado sigue sin reloj; lo que se arregló fue la corrupción, no el límite
`src/lib/likida/intake/consolidado.ts:200-380` × `src/lib/likida/processor.ts:466`, `:663`, `:1566`

**Escenario.** `enLotes(porLigar, 10, …)` (`:337`) sí bajó el bucle serial: 1,000
líneas conciliadas pasan de ~300 s a **100 lotes × 0.3 s = 30 s**. Y el bloque de
reanudación por sello (`:275-289`, `selladoPorIndice` leído de
`gasto.cfdi_uuid`/`cfdi_orden`) sí cierra la ventana de corrupción que el
hallazgo describía: un reenvío reconoce lo ya sellado y no re-adivina.

Lo que **no** llegó es el reloj. Nada en el archivo lee un presupuesto (grep:
solo se importa `acotada`), y el `reloj` que el processor sí tiene
(`processor.ts:393`) **no se le pasa**. Suma del peor caso desde WhatsApp:
`downloadMediaAsText` 15 s + `traerTodo` de candidatos 45 páginas × techo 8 s =
360 s + `conciliarLineas` (1,000 × 45,000 = 45 M comparaciones, bloqueando) +
`enLotes` 100 lotes × techo 8 s = 800 s + upsert de 1,000 filas. **≈ 1,175 s
contra 120 s.** En el camino sano (0.3 s por consulta) son **~64 s**, que sí
caben.

Y desde el panel es peor: `peajes/page.tsx:100` llama a la misma función desde
una acción de servidor **sin `maxDuration`**.

**Consecuencia.** Con la base sana, cabe. Con la base lenta —el día que más
importa— la invocación muere, la oficina no recibe el acuse
`mensajeConsolidadoRecibido`, y tiene que reenviar el XML a mano para que la
reanudación haga su trabajo. Degrada y se nota, ya no corrompe.

**Causa raíz probable:** el arreglo atacó el número de escrituras, no el
presupuesto de la invocación.

*(REINCIDENTE — REND-C3 del pase 2, degradado de CRÍTICO a MEDIO por el bloque de
reanudación y `enLotes`.)*

---

### [MEDIO] El tope diario del chat vale ~17 turnos malos, no los ~200 que anuncia
`src/app/api/dashboard/chat/route.ts:33-42` × `src/lib/agents/analista.ts:317-380`

**Escenario.** El comentario del tope dice: *«a ~$0.005 el análisis medido, $1 son
~200 análisis/día»*. Ese es el promedio. El peor caso de un turno son **9
completions**: 5 rondas del primer ciclo (`analista.ts:326`) más 4 del reintento
correctivo (`:365`), que se dispara cada vez que la guardia de cifras tumba la
respuesta o el modelo no llama la tool terminal.

Y el contexto no se cachea: `soportaCache = /anthropic\//.test(model)`
(`openrouter.ts:676`) y el rol `chat` es `google/gemini-3.5-flash-lite`
(`models.ts`), así que el prefijo estable se reenvía íntegro en cada ronda. Ese
prefijo son ~1,800 tokens de system + ~2,500 de esquemas de 11 tools + **hasta
4,000 del documento adjunto** (16,000 chars, `route.ts:69`, metido *en el system*
en `analista.ts:305`) ≈ **8,300 tokens × 9 rondas = 75,000 tokens** solo de
reenvío, más el historial (12 turnos × 2,000 chars) y los resultados de tools
acumulados.

A $0.30/$2.50 por millón: ~130 k in + ~8 k out ≈ **$0.06 por turno**, 12× el
promedio anunciado. `$1.00 / $0.06` = **~17 turnos**, no 200.

**Consecuencia.** Un contralor en cierre de semana, adjuntando su Excel y
haciendo preguntas que la guardia rechaza, topa el presupuesto del día en la
primera media hora — y el chat degrada al respondedor gratis con el mensaje
«llegó a su tope diario (existe para cuidar tu costo)», que es cierto pero
describe un techo 12× más bajo del que el comentario del código promete.

**Causa raíz probable:** el tope se dimensionó contra el promedio medido y no
contra el peor caso del propio ciclo (9 rondas × prefijo sin caché).

---

### [BAJO] `soportaCache` se calcula sobre el modelo primario, no sobre el que responde
`src/lib/llm/openrouter.ts:676` × `:721-724`

**Escenario.** El breakpoint de caché se decide una sola vez con `model`
(el primario). Si el ciclo cruza al fallback (`activeModel = fallback`, `:723`)
y el fallback **sí** es Anthropic —caso real: `openai/gpt-5-nano` →
`google/gemini-3.5-flash-lite` no, pero `google/gemini-3.6-flash` →
`anthropic/claude-haiku-4.5` sí—, las rondas restantes viajan **sin**
`cache_control` y pagan entrada completa. Con el ciclo del cuadre (system con
reglas fiscales, medido en 9,543 tokens, `:169-175`) la diferencia medida es
**−91.6 %** por ronda.

**Consecuencia.** El día que OpenRouter tumbe al primario, el costo por
liquidación se multiplica ~12× en las rondas del fallback y nadie lo nota,
porque `costoReal` reporta bien lo que cobró el proveedor.

**Causa raíz probable:** `soportaCache` se evalúa fuera del bucle; debería
seguir a `activeModel`.

---

## Las sumas del peor caso

| camino | eslabones (peor caso) | peor caso sumado | límite escrito | ¿cabe? |
|---|---|---|---|---|
| `/api/cron/escalar` | 0.3 interruptor + 100 viajes × 6.3 s + 0.3 + 90 s de cobranza | **721 s** | `maxDuration = 120` (`route.ts:14`) | **NO (6×)** |
| ídem, camino feliz (solo 2 `sendText`/viaje) | 0.3 + 330 + 0.3 + 90 | **421 s** | 120 | **NO (3.5×)** |
| «Ejecutar ahora» Cobranza (700 filas) | 0.6 config + 0.6 cola + 700 × 3.9 | **2,731 s** | *ninguno declarado* (≤300 s de techo Pro) | **NO (9×)** |
| «Ejecutar ahora» Peajes (`barrerPorConciliar`, 1,000 líneas) | 0.6 + 13.5 candidatos + 45 M comparaciones + 1,000 × 0.6 | **≈ 614 s** | *ninguno declarado* | **NO (2×)** |
| Consolidado por WhatsApp, base sana | 15 descarga + 13.5 candidatos + ~3 CPU + 30 `enLotes` + 2 | **≈ 64 s** | `maxDuration = 120` | **sí, 56 s de margen** |
| Consolidado por WhatsApp, base lenta (techo `acotada` 8 s) | 15 + 360 + 800 | **≈ 1,175 s** | 120 | **NO (10×)** |
| Ráfaga de 40 fotos en un POST | 8 olas × 42 s | **336 s** | `maxDuration = 120` | **NO (2.8×)** |
| Ráfaga de 12 fotos (la «holgada») | 3 olas × 42 s | **126 s** | 120 | **NO, por 6 s** |
| Cierre de una liquidación (post-agente) | 8.9 tabla + 4.6 `avisarCierreAlJefe` | **13.5 s** | `MARGEN_CIERRE_MS = 12_000` | **NO, por 1.5 s** |
| Turno del webhook completo | 12 lock + 20 barrera + 40 agente + 13.5 cierre + ~15 descarga/OCR | **≈ 100.5 s** | `maxDuration = 120` | **sí, 19.5 s** |
| `/admin` (RPC de costos), año 1 del cliente 15k | Seq Scan de 12 M filas | **≈ 225 s** | *ninguno declarado* | **NO** |
| `cuadrar_viaje` + `guardar_liquidacion` (216 k filas de diésel) | 2 × 216 páginas × 0.3 s | **130 s** | `reloj.acotar(40_000)` | **NO (3.2×)** |
| `/api/cron/facturar` (8 tickets, 8 flotas) | corta antes de abrir sesión si quedan <150 s | **≤ 300 s por construcción** | `maxDuration = 300` | **sí** |
| `/api/cron/facturar/cola` (QStash) | mismo lote, presupuesto propio | ≤600 s | `maxDuration = 600` | **sí** |

Método: cada eslabón se cobra a su techo declarado en el código
(`SEND_TIMEOUT_MS = 10_000` en `meta/client.ts:17`, `DOWNLOAD_TIMEOUT_MS = 15_000`
en `:10`, `TOPE_CONSULTA_MS = 8_000` en `presupuesto.ts:101`) o, cuando eso da un
número absurdo para el camino sano, a los costos unitarios que el propio repo
usa en `PASOS_CIERRE` (0.3 s consulta, 1.5 s `sendText`, 2.5 s `sendDocument`,
0.5 s URL firmada). Las cantidades de filas salen de los límites escritos en las
consultas (`.limit(100)`, `.limit(1000)`) o del cliente de 15k viajes/mes que la
0111 y `docs/escala-15k.md` toman como referencia.

---

## Lo que revisé y está bien

- **`/api/cron/facturar`** — `MARGEN_LOTE_MS = 150_000` contra
  `PRESUPUESTO_LOTE_MS = maxDuration * 1000` (`route.ts:135-165`), derivado de la
  MISMA constante y no de una copia, y comprobado **antes de abrir cada
  `conNavegador`** con el peor caso medido de una sesión (~147 s). Es el único
  camino del repo donde el reloj está anclado a la invocación y no al motor.
  Además el descargo a QStash (`cola/route.ts:12`, `maxDuration = 600`) rompe el
  techo de 300 s de forma limpia y con firma verificada.
- **`TOPE_CONSULTA_MS`** (`presupuesto.ts:101-169`) — 8 s con `abortSignal`
  **más** carrera contra temporizador, y el agotamiento entra por el mismo camino
  que un error de Postgres (`{data:null,error}`), así que cada llamador conserva
  su semántica probada. Y es ajustable por entorno sin desplegar.
- **La contabilidad de intentos fallidos de OpenRouter** (`openrouter.ts:399-438`,
  `472-476`) — se cobra ANTES de cualquier salida, el `usage` viaja dentro de
  `StructuredError`/`PartialExecutionError`, y `chat/route.ts:151-159` lo
  registra en el modo de falla que más gasta. Un negocio que cobra por
  liquidación no puede subestimar el unitario, y aquí no lo hace.
- **El loop-guard corta antes de pagar** (`openrouter.ts:779-781`): en la última
  ronda permitida no ejecuta las tools que nadie va a leer — ni la ronda de red
  ni la posible mutación.
- **`llaveDeCache`** (`openrouter.ts:581-593`) — la caché de lectura se llaveaba
  con `JSON.stringify(args)` y acertaba **0 de 3** veces medidas; ahora las tools
  sin parámetros se llavean por nombre. Ahorro real en el ciclo del cuadre, con
  el escenario reproducido en el comentario.
- **El OCR manda UNA sola imagen** (`ocr.ts:249-257`): el decodificador de
  códigos —gratis— elige cuál, y la llamada de visión lleva `images: [principal]`.
  No hay imágenes de más ni un lote sin techo.
- **El ruteo de modelos está medido, no supuesto** (`models.ts:33-50`): OCR
  apuntado por entorno a `gemini-3.1-flash-lite`, 12.5× más barato **y** mejor en
  las tres métricas sobre 18 comprobantes reales, con el sesgo del experimento a
  favor del caro. Y `LLM_RAZONAMIENTO_OCR` viene apagado con la razón escrita.
- **Los seis agentes no gastan un token.** Verificado por grep:
  `generateResponse`/`generateStructured`/`generateWithTools` solo aparecen en
  `intake/ocr.ts`, `agents/run.ts` y `agents/analista.ts`. Cobranza, Conductores,
  Facturas, Liquidación, Peajes y Proveedores son código determinístico; su costo
  por corrida es WhatsApp y consultas, no modelo. Un turno de agente cuesta $0 en
  OpenRouter.
- **El tope diario del chat falla cerrado** (`chat/route.ts:81-95`): si no se
  puede leer el gasto del día, no se gasta más — y la lectura está paginada con
  `traerTodo`, que era el hueco por el que el freno dejaba de dispararse el día
  de más uso.
- **`traerTodo` lanza en vez de devolver un recorte** (`pg.ts:183-221`), con la
  prueba de completitud por `count` gratis en la primera página.
- **La 0062 midió tres planes y descartó el índice con `EXPLAIN ANALYZE`** en vez
  de crearlo por si acaso (`0062:44-80`). La 0111 hizo lo mismo con su lista de
  descartados. El método es correcto aunque el barrido dejó fuera dos consultas
  (arriba).
- **`enLotes` + `desglose_peaje.ts:711`** — el patrón correcto, aplicado bien en
  el gemelo del barrido.

---

## Lo que NO alcancé a revisar

- **Latencia real Vercel ↔ Supabase.** Todas las sumas de arriba usan 0.3 s por
  consulta, que es el número que el propio repo escribió en `PASOS_CIERRE`. Nadie
  lo ha medido contra producción; `presupuesto.ts:97-99` lo admite. Si el p95
  real es 0.8 s, cada suma de esta tabla se multiplica por ~2.7 y dos caminos más
  dejan de caber.
- **`src/lib/correo/**` (12 archivos, Resend)** — no revisé el costo por correo,
  el tope de adjuntos del webhook (`74adcb6`) ni si el envío tiene señal de
  aborto. Es superficie nueva de esta ronda.
- **`src/lib/observability/**` (7 archivos)** — `flushObservabilidad` se espera
  al final del `after()` del webhook; no medí cuánto puede tardar ni si tiene
  techo. Un flush lento entra directo en el peor caso del cierre.
- **`facturacion/adaptadores/pagina_playwright.ts`** — acepté los ~147 s de peor
  caso por sesión que la ronda 12 midió; no los re-sumé eslabón por eslabón.
- **`carta-porte/`** (superficie fiscal nueva, `e7b1b1f`) — el clasificador y el
  validador de 37 campos no pasaron por este rubro.
- **`api/v1/`** — no medí consultas por request de las rutas públicas ni el costo
  de la idempotencia durable (mig. 0098).
- **Índices reales en la base.** Leí las migraciones, no un `pg_indexes` contra
  el proyecto: si alguna 0092–0111 no está aplicada, los planes que asumo cambian.
- **Costo por liquidación de punta a punta.** El objetivo declarado es
  $0.03–0.05 (`models.ts:15`). No hay ninguna corrida reciente que lo verifique y
  no la puedo levantar sin llamadas de pago (`pruebas-manuales/` está prohibido
  en esta fase).
