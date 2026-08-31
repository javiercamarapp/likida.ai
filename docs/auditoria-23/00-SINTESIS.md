# Auditoría 23 — Síntesis y recalificación

**Global: 5.4** (anterior: **6.1**) · **▼ 0.7**

Ronda COMPLETA, desatendida, en la nube. Rama `claude/auditoria-23` sobre
`master` = `c7c3d1c`. Árbol limpio al arrancar → **autofix habilitado**.

**Esta es la primera ronda de la nube con delta real.** La 22 tuvo que calificar
en frío porque `.gitignore` ignora `docs/auditoria-*/` y su síntesis vivía fuera
del clon. Su PR #285 se mergeó, así que hoy sus doce notas son legibles y la
comparación es contra un número que sí pude leer.

## La lectura de la ronda

**La 22 arregló 34 hallazgos críticos y altos, y la 23 encontró que cinco de sus
propios arreglos abrieron algo nuevo, dejaron el hallazgo a medias, o quedaron
inertes.** No es un accidente ni mala suerte: es lo que pasa cuando trece commits
entran en una noche sin que nadie los mire, y es exactamente lo que esta rutina
existe para detectar al día siguiente.

Y hay un hecho que pesa más que las doce notas juntas: **nada de eso está en
producción.** El PR de la 22 se mergeó sin `[deploy]` en el asunto, así que
`app.likida.ai` sigue sirviendo `86813f4`. Los 34 arreglos —fiscales, legales, de
dinero— llevan cinco commits sin publicarse, y el único detector automático de esa
deriva está apagado por diseño justo en el caso que la produce.

La global baja 0.7 porque **seis de los doce rubros bajaron**. Que baje es un
resultado válido y hoy es el correcto: el código no empeoró en seis frentes a la
vez, la mirada se hizo más profunda en tres y la deuda cobró factura en tres.

## Las notas

Global = media aritmética de los 12 rubros, con un decimal (65 / 12 = 5.4).

| Rubro | Antes | Hoy | Δ | Porqué del movimiento |
|---|---|---|---|---|
| Modelo de datos | 8 | **5** | ▼3 | **Las dos formas a la vez.** *Deuda que cobró factura*: el patrón que la 22 declaró peligroso se consumó en la migración que lo declaraba. *Mirada más profunda*: el 8 se obtuvo barriendo el catálogo de restricciones como texto, y ese barrido nunca preguntó si las llaves que el SQL usa se escriben — la respuesta, para el borrado ARCO, es que no. |
| Backend y API | 7 | **7** | = | Los tres ALTO de la 22 están cerrados de verdad, verificados uno por uno. Pero dos ALTO nuevos los introdujeron esos mismos arreglos, en código sin una sola prueba. Los platillos se cancelan y la nota se queda. |
| Frontend | 7 | **7** | = | FE-1 quedó bien cerrado; su misma familia de bug reapareció en una pantalla que la 22 no abrió, y ninguno de sus seis MEDIO/BAJO se tocó. |
| Pruebas | 7 | **7** | = | *Se atacó y subió, compensado por mirada más profunda.* Las **6 mutaciones que sobrevivieron a la 22 mueren hoy**: `d3ce510` no era decoración. Pero corrió por primera vez `verificaciones.sql` contra Postgres real y encontró una compuerta de CI que **no puede reprobar**. Ver la advertencia de abajo sobre el estado de este archivo. |
| Seguridad | 7 | **6** | ▼1 | **Deuda que cobró factura.** Cero críticos y ningún camino sin autenticar a datos de un tenant — el ancla de ≤4 sigue sin cumplirse. Pero la 0273 revirtió un arreglo que la 0264 había verificado **en vivo contra producción**, y **ninguno de los cinco hallazgos de la 22 se cerró**. |
| Rendimiento y costo | 6 | **6** | = | **Mirada más profunda en las dos direcciones, y se compensan.** La premisa de la 22 —«`traerTodo` tenía UN SOLO llamador»— es falsa: hay **89**. El barrido que la 22 llamó «el trabajo de más valor por hora del repo» ya estaba hecho. A cambio, 19 de esos 89 paginan con un orden sin desempate único. |
| Arquitectura | 6 | **5** | ▼1 | **Deuda que cobró factura.** Quinta caída por el mismo hueco de las dos listas de `engine.ts`: ARQ-1 se cerró agregando el miembro que faltaba, no derivando la regla. `procesarTurno` creció de 2,874 a **2,913** líneas. |
| Tool calling | 6 | **5** | ▼1 | **Mirada más profunda.** El código del rubro casi no cambió; la nota anterior no había mirado que la tool más llamada del producto suma con una regla distinta a la del motor. TC-1 sigue abierto. |
| Cumplimiento legal | 5 | **5** | = | El alza por los cuatro tratamientos que `02d7837` sí declaró —verificados uno por uno, los cuatro ciertos— queda compensada por `df7725b`, que reintrodujo un defecto fatal en producción. |
| Sistema agéntico | 5 | **4** | ▼1 | **Mirada más profunda.** El código mejoró en dos puntos reales, pero recorriendo el ciclo aparecen tres estados donde la base dice una cosa y el humano cree otra, y uno nació dentro del propio arreglo de AGEN-C1. |
| Operabilidad y DX | 5 | **4** | ▼1 | **Deuda que cobró factura.** El modo de falla que este mismo rubro documenta —«pusheaste sin `[deploy]` y producción se queda atrás sin avisar»— se comió el arreglo del crítico de la 22. Y dos de los tres ALTO que la 22 dio por cerrados son **inertes**. |
| Cumplimiento fiscal | 4 | **4** | = | **Se atacó y no subió.** De los cuatro arreglos de la 22: dos aguantan, uno quedó a medias y **uno introdujo una regresión de dinero**. Sigue con tres críticos de pesos. |

## Arreglado, con prueba que lo reproduce

Tres vueltas, las tres retenidas. Cada una: prueba que falla sin el arreglo →
arreglo → prueba verde → suite completa → commit atómico.

| ID | Sha | Qué era |
|---|---|---|
| SEG-1 / LEG-C1 / DATOS-C1 | `8e8b17f` | La 0273 revirtió el `search_path` que la 0264 arregló. `ejecutar_arco_cancelacion` llama `digest()` sin calificar; en Supabase gestionado pgcrypto vive en `extensions`, así que la cancelación ARCO trueba con `42883` **antes de tocar una tabla**. El contralor aprieta «Ejecutar cancelación» y nada se anonimiza mientras corre el plazo de 20 días hábiles del art. 31. **Tres auditores lo encontraron por caminos independientes.** Arreglado con `alter function … set` (mig. 0275), sin recopiar el cuerpo — recopiar es la maniobra que produjo el bug. |
| FIS-1 | `c4787f7` | El arreglo FIS-C3 de la 22 metió `'99 Por definir'` en el mismo saco que `'06' Dinero electrónico`. `'99'` no es un medio de pago: es que **no se pagó** (RMF 2.7.1.29 fr. II), y `engine.ts` lo tiene escrito dos veces. Toda compra a crédito de más de $2,000 —la forma normal de comprar a crédito en México— salía del deducible y perdía su IVA. Medido: $58,000 deducible → **$0**, IVA $8,000 → **$0**. Y mataba la FASE 7 (mig. 0199) entera. |
| REN-1 | `fd80af1` | El arreglo estrella de la 22 metió `traerTodo` en el PDF del jefe y se le olvidó el `ORDER BY`, contra un contrato escrito en mayúsculas en `pg.ts:131-135`. Cuando un `UPDATE` mueve una fila entre páginas, una se repite y otra se salta — y como el conteo sigue cuadrando con `count`, `LecturaIncompleta` nunca se lanza. Medido con 1,500 viajes: **$112,475,000.00 impreso contra $112,575,000.00 reales**, con «Viajes sin liquidar: 1,500» correcto al lado. |

**El detalle que vale más que los tres arreglos:** el `lint:ratchet` entró a la
compuerta de esta ronda porque su ausencia fue lo que hizo que la 22 declarara
verde algo que CI vio rojo. Cazó un warning nuevo en mi propia prueba **antes del
primer commit**. La compuerta que se amplía por un fallo propio es la que sirve.

## Verificados contra el código, uno por uno

Abrí el archivo de cada uno antes de anotarlo.

| ID | `archivo:línea` | Veredicto |
|---|---|---|
| SEG-1 | `0273:41` vs `0264:59` | **CONFIRMADO.** `set search_path = public, pg_catalog` sin `extensions`; `digest()` sin calificar en `:70` y `:124`. La 0273 es la última definición (`grep` sobre las 5 migraciones que tocan la función). |
| FIS-1 | `engine.ts:594-595` vs `:148-152` | **CONFIRMADO.** La rama de FIS-C3 juzga `g.formaPago` crudo; su hermana `medioNoAdmitidoCombustible:156` sí excluye `'99'`. Y `medio_pago_lisr27.test.ts:49` **afirmaba el bug** como comportamiento deseado. |
| REN-1 | `oficina_wa.ts:93-99` vs `pg.ts:131-135` | **CONFIRMADO.** `traerTodo` sin `.order()`. Reproducido con valores en pesos. |
| DATOS-C2 | `0273:76` vs `conv.ts:373` | **CONFIRMADO.** `wa_conversacion.operador_id` no lo escribe **ningún** escritor: `conv.ts:373` inserta sin él, y `asignar_wa.ts:190` y `despacho_wa.ts:133` lo excluyen del payload **a propósito y con comentario**. El `delete` del ARCO borra 0 filas y archiva `"wa_conversacion": 0` como evidencia de cumplimiento. |
| BE-1 | `processor.ts:3478-3481` vs `:3737` | **CONFIRMADO.** El registro sintético lleva `pdf_url`, que no lee ningún consumidor de resultado de tool; `agentTools = parcial!` y el `find` de `:3737` exige `!t.error`, así que `guardado` queda `undefined` **por construcción** en ese camino. |
| BE-2 | `processor.ts:919-931`, `rafaga.ts:160-162` | **CONFIRMADO.** `bandejasAbiertas()` devuelve el `Map` de módulo entero y `cerrarRafagasPorCorte` cierra las libretas de todos los choferes del proceso. |
| BE-3 | `facturacion_escritura.ts:646-657` | **CONFIRMADO.** Cuenta pagos y cancela en dos viajes sin nada que los serialice; `.in('estatus',['borrador','emitida'])` no ataja un abono parcial, que deja la factura en `emitida`. |
| OP-C1 | `git log`, `vercel.json:3` | **CONFIRMADO con comando.** Último asunto con `[deploy]` = `86813f4`; los 5 commits posteriores no lo llevan. El `ignoreCommand` lee solo la primera línea. |

## Descartados y corregidos

Los falsos entran al reporte como falsos. Es lo que mantiene honestos a los
auditores de mañana.

| Hallazgo | Razón |
|---|---|
| «La migración 0272 duplicó la regla de deducibilidad» | **FALSO.** Lo levantó el auditor de arquitectura como hipótesis y **lo refutó él mismo**: la RPC entrega insumos y la ruta clasifica con `cubetaDe`, la misma función que el PDF. No hay segunda copia. |
| «`traerTodo` tenía UN SOLO llamador» — premisa de la síntesis de la **22** | **FALSA, y verificable en un comando.** Hay **89** sitios de llamada y 17 de `traerPorIds`. La 22 declaró el barrido «el trabajo de más valor por hora que tiene este repo hoy» y lo dejó propuesto; ya estaba hecho. Corregir esto vale más que el hallazgo que lo motivó. |
| AGEN-1, **diagnóstico** de la 22 | **INCORRECTO.** La 22 lo apoyó en «`guardar_liquidacion` no lee `ctx.signal`, así que el handler sigue vivo y commitea». El grep sigue dando 0, pero `executeTool` corre el handler dentro de `runWithToolSignal` y `supabaseAdmin()` mete la señal en el `fetch` de toda consulta: el aborto **sí** llega. Por eso la 22 nunca pudo reproducirlo — la prueba se construía sobre una premisa falsa. **El hallazgo sobrevive por otro camino** (el techo de consulta de `acotada`), y ahora sí tiene escenario. |
| `/api/health` en producción | **NO VERIFICABLE desde aquí.** El proxy de salida devuelve `CONNECT tunnel failed, 403` contra `app.likida.ai`. Lo que se afirma del despliegue sale del log del workflow y de `git log`, **no** de una lectura directa del endpoint. |

## Los críticos que quedan PENDIENTES, con la razón

Ninguno se dejó a medias: cada uno tiene escrito por qué no se tocó.

1. **OP-C1 · Producción lleva 5 commits atrás y los 34 arreglos de la 22 no están
   publicados.** **No es código.** El arreglo es un *Redeploy* en el panel de
   Vercel, o un commit con `[deploy]` en la primera línea. Se notificó al dueño
   durante la corrida. Lo que sí es código —que el cotejo del sha corra en el
   disparador de `schedule` y no solo en `push`— queda propuesto.

2. **OP-C2 · `config_ausente` devuelve 200 con diez crons que nunca han latido.**
   El arreglo cambia **qué significa la señal de salud de producción**, y hacerlo
   de madrugada sin nadie mirando es exactamente el riesgo que esta auditoría
   existe para bajar. Es el mismo criterio con el que la 22 se negó a tocar el
   watchdog. **Se propone, no se hace.**

3. **DATOS-C2 · El borrado ARCO de la conversación no borra nada.** Verificado y
   confirmado. El arreglo correcto (empatar por teléfono normalizado, que la 0274
   ya provee) exige **recopiar el cuerpo de la función** — la maniobra que ya
   produjo este bug dos veces, y que hoy mismo costó el crítico que sí arreglé.
   Con el tope de 3 vueltas agotado, hacerlo a las prisas es cómo se genera el
   hallazgo de mañana. **Es el candidato número uno de la ronda 24.**

4. **FIS-2 · Los gastos parcialmente deducibles se asientan al 100%.** Medido:
   viático de $2,000 con tope $750 → el PDF dice $750 y la póliza asienta
   $1,724.14. Cruza la RPC de la 0272, la ruta de export y el catálogo contable;
   **no es quirúrgico** y el módulo tiene una regla propia («ninguna cuenta se
   inventa») que exige decidir con el contador a qué cuenta va lo no deducible.

5. **FIS-3 · El comprobante duplicado se asienta dos veces.** REINCIDENTE. La RPC
   0272 lista todas las copias y el `gastoId` de la diferencia apunta al original,
   así que la ruta **no puede identificarlas**. El arreglo es de la RPC, no de la
   ruta.

6. **AGEN-1 · El backstop «la base es la autoridad» solo vive en el `catch`.**
   REINCIDENTE, con **diagnóstico corregido** (ver descartados). El disparador
   real es el techo de consulta de `acotada`, no el aborto. Tope de vueltas
   agotado.

7. **LEG-C2 · LEG-C1 se cerró a la mitad.** La compuerta entró solo a
   `jornada/derivar.ts:309`; el poller de GPS y el de eventos de cámara siguen
   tratando al operador que nunca recibió el aviso. Tope de vueltas agotado.

8. **La corrección de texto legal de LEG-1/LEG-2** sigue pendiente por la razón
   que la 22 ya escribió y que no ha cambiado: **el texto jurídico no lo redacta
   una rutina desatendida.**

## El rubro de Pruebas, y su crítico

`pruebas.md` **entregó tarde** —después de que el resto de la ronda cerró y se
abrió el PR— y se incorporó en una actualización de la rama. Es, otra vez, el
rubro que **mide en vez de leer**: 27 mutaciones contra la suite completa y
contra un Postgres real, **14 muertas y 13 sobrevivientes**. Nota **7, sin
moverse**, y las dos razones se midieron:

- *Se atacó y subió.* Las **6 mutaciones que sobrevivieron a la 22 mueren hoy**
  (6/6). Los cuatro arreglos de `d3ce510` no son decoración. Y de 8 reversiones
  de arreglos de la 22, **5 mueren** (FIS-C1, FIS-C2, FIS-C3, LEG-C1,
  `traerTodo`): esas pruebas sí anclan lo que dicen anclar.
- *Mirada más profunda.* De 9 mutaciones nuevas dirigidas, **8 sobreviven**. Los
  arreglos de la 22 cerraron **el punto que nombraron, no la clase**.

### CRÍTICO · PRU-1 — verificado, con el encuadre corregido

`scripts/ci/correr-verificaciones.mjs:388-408` (`SIN_CALIFICAR_CONOCIDOS`)

**Lo verifiqué abriendo el archivo, y el hallazgo se sostiene — pero no como el
auditor lo enmarcó, y la diferencia importa.** No es que el runner ignore fallos
por descuido: el 23-ago-2026 alguien hizo justamente lo contrario y convirtió
`sin_calificar` en falla, con el comentario correcto escrito arriba («un verde
que no distingue "verifiqué y está bien" de "no supe leer el resultado" no es una
compuerta: es un adorno»). Lo que hizo fue un **trinquete nominal**: 19 bloques
que el parser no sabe leer, cada uno con su razón, y **un bloque nuevo sin
calificar sí falla**. La lista está pensada para bajar, no para crecer.

El problema real es **cuáles** son esos 19. Entre ellos está **`FINANZAS_RLS`**
—«A · "esperado 0 en las seis" es prosa, no una lista de seis ceros»—, que es
precisamente el bloque que comprueba el aislamiento por rol sobre el dinero. Ese
bloque **corre, ataca, imprime su resultado, y nadie lo lee**. El auditor lo
demostró quitándole a la policy de `pago_recibido` su guarda `ve_finanzas()`: la
batería imprimió `pagos=1` —la fuga, en su propia salida— y terminó en
`182 ok · 0 fallos`, **exit 0, «La batería pasó»**.

Así que la frase precisa no es «la compuerta no puede reprobar», sino: **para 19
bloques —entre ellos el de RLS financiero, los RPC de cobranza y los agregados—
la compuerta no puede reprobar, y la razón por la que están exentos es el formato
del mensaje, no la ausencia de riesgo.** Una deuda de parseo terminó eximiendo al
control de aislamiento del dinero.

**PENDIENTE.** El arreglo es el que el propio archivo prescribe («arregla el
mensaje del `raise` … esa lista se baja, no se sube»): volver el `raise` de
`FINANZAS_RLS` una lista alineada y sacarlo de la lista. Es mecánico, pero
**exige correr el bloque contra Postgres para confirmar que califica y pasa**, y
el tope de 3 vueltas de la ronda ya estaba agotado cuando este reporte llegó.
Empujarlo a ciegas sobre una compuerta de seguridad es exactamente lo que esta
rutina no hace. **Es, con DATOS-C2, lo primero de la ronda 24.**

## Lo que esta ronda aprendió y conviene no perder

**Un arreglo nocturno sin revisar produce, en promedio, medio hallazgo nuevo.**
De los 34 de la 22: dos aguantan enteros y verificados (FIS-C2, FIS-A1; y los tres
ALTO de backend), uno quedó a medias (FIS-C1), dos son inertes (OP-A2, OP-A3), y
tres introdujeron un modo de falla nuevo (FIS-C3→FIS-1, REN-1, AGEN-C1→BE-1). No
es argumento para dejar de arreglar: es argumento para que la ronda siguiente
audite **primero** lo que la anterior tocó, que es lo que se hizo hoy y lo que
produjo los tres arreglos.

**Copiar el cuerpo de una función para cambiarle una línea es el modo de falla
más caro del repo.** Ya cobró tres veces: el primer intento de la 0273 (perdió
guardas, la batería lo cazó), la 0273 final (perdió el `search_path`, la batería
**no** lo cazó) y —si el rubro de pruebas se confirma— la propia batería que
debía cazarlo. Cuando el cambio es de cabecera, `alter function … set`.

**Una prueba puede afirmar un bug.** `medio_pago_lisr27.test.ts` pasó dos días en
verde consagrando que `'99'` no es deducible. Verificar el código contra la norma
—y no contra la suite— es lo único que lo encuentra.

**Tres auditores independientes convergieron en la misma migración.** Seguridad,
legal y modelo de datos llegaron al `search_path` de la 0273 por caminos
distintos. Cuando eso pasa, el hallazgo se arregla primero.

## Compuerta

| Comando | Al arrancar | Al cerrar |
|---|---|---|
| `npm test` | 708 archivos · 9,995 pruebas · **verde** · 107 s | **711 archivos · 10,002 pruebas · verde** · 147 s |
| `npx tsc --noEmit -p .` | 0 errores | 0 errores |
| `npm run lint` | 0 errores · 165 advertencias | 0 errores · 165 advertencias |
| `npm run lint:ratchet` | 165/166 heredadas · 0 nuevas | 165/166 heredadas · **0 nuevas** |
| `npm run build` | no se corre en la nube (pide Supabase, OpenRouter, Facturapi, Upstash) | — |
| `pruebas-manuales/*.prueba.ts` | no se corren: llamadas reales de pago | — |
