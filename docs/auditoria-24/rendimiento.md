# Rendimiento y costo — auditoría 24

**Nota: 6/10** (antes 6). Razón del movimiento: **mirada más profunda**. Los
arreglos que la rama dice haber hecho son reales y los verifiqué uno por uno
contra el SQL y el índice (0287 sondea por unidad sobre `uq_posicion_lectura`,
REN-2/REN-7 están en `sincronizar_gps.ts`, REN-9 metió el desempate en
`jornada/repo.ts`, `export/liquidaciones` pagina por keyset de verdad, y los 7
`maxDuration` de export existen). Contra eso: **la misma rama reabrió el
agujero A24** —dos pasos de red nuevos en el cierre sin renglón en la tabla del
presupuesto— y **dejó el audio fuera del guardarraíl que se construyó para la
imagen**. El rubro no bajó porque el mecanismo es bueno; no subió porque el
mecanismo se saltó dos veces en 24 horas.

El riesgo mayor hoy: la nota de voz del chofer —la capa E1, el canal de la
emergencia— reserva presupuesto por BYTE de audio, así que a partir de 1.24 MB
falla cerrado y le contesta «no pude escucharte» a alguien que puede estar
tirado en carretera, por una llamada que cuesta menos de un centavo.

## Hallazgos

### [ALTO] La nota de voz reserva por byte: 1.24 MB de audio agotan el tope de $0.50 y el chofer en emergencia oye «no pude escucharte»
`src/lib/llm/openrouter.ts:505-517` · `src/lib/llm/openrouter.ts:579` ·
`src/lib/likida/voz_transcrita.ts:102-113` · `src/lib/llm/budget.ts:356-358,368`

Escenario: `cotaEntradaEnTokens` (`openrouter.ts:505`) elide **solo** las claves
llamadas `url` cuyo valor empieza con `data:` —el arreglo que se hizo para la
foto, con `TOKENS_POR_IMAGEN = 4_000` en `:503`—. El audio no viaja así: se
adjunta en `:579` como `input_audio: { data: <base64>, format }`. La clave se
llama `data` y el valor no empieza con `data:`, así que el base64 entero se
cuenta **a un token por carácter**.

El número contra el número, con el rol real (`models.ts:149` →
`google/gemini-3.5-flash-lite`, precio `[0.3, 2.5]` en `openrouter.ts:194`) y el
tope real por corrida (`budget.ts:358`, `LIKIDA_LLM_RUN_BUDGET_USD` con default
**$0.50**):

    reserva = (N_chars_base64 × 0.3 + 1000 × 2.5) / 1e6
    N = 1,657,500 chars  →  $0.50  →  1.24 MB de audio crudo

`reserveLlmBudget` compara **antes de tocar al proveedor** (`budget.ts:368`) y
lanza `LlmBudgetExceededError('run')`. `voz_transcrita.ts:125-128` lo traduce a
`voz.sin_presupuesto` y a `RESPUESTA_SIN_PRESUPUESTO` («No pude escuchar tu nota
de voz ahora mismo 🙏 ¿me lo escribes?»).

Entra: un audio reenviado en MP3 a 128 kbps de **78 segundos** (1.24 MB), o una
nota de voz Opus larga (~7-10 min). Sale: el chofer recibe que no hay
presupuesto. Lo que de verdad costaba: un modelo de audio cobra por SEGUNDO
(≈32 tokens/s), o sea ~2,500 tokens de entrada ≈ **$0.0008** — la reserva se
equivocó por un factor de ~600×. Y por debajo del umbral el daño sigue: cada
nota de 500 KB reserva $0.20 del techo diario de la flota mientras corre.

Agrava: `downloadMediaAsDataUrl` sí acota la IMAGEN
(`meta/client.ts:47`, `MAX_IMAGEN_WHATSAPP_BYTES = 6 MB`) pero **no acota el
audio** — la Cloud API entrega hasta 16 MB, que aquí serían 21.3 M de caracteres
y una reserva calculada de $6.39.

Refutación intentada: busqué un tope de tamaño en `voz_transcrita.ts`, un
`TOKENS_POR_AUDIO` y una rama de `cotaEntradaEnTokens` para `input_audio`. No
existe ninguno; `maxTokens: 1000` (`voz_transcrita.ts:113`) acota la SALIDA, no
la entrada.

Consecuencia: el chofer que manda voz en vez de escribir —el caso que la capa E1
existe para atender— se queda sin canal, y el log dice «presupuesto agotado»,
que manda a Javier a subir un tope que no era el problema.

Causa raíz probable: el arreglo de la imagen se escribió sobre la forma
`image_url.url`, y cuando entró `input_audio` (capa E1) nadie volvió a
`cotaEntradaEnTokens`.

Severidad: **ALTO**.

---

### [ALTO] La tabla del presupuesto de cierre volvió a quedarse corta: dos consultas nuevas de esta misma rama sin renglón (REINCIDENTE de A24)
`src/lib/likida/presupuesto.ts:87-110` · `src/lib/likida/processor.ts:4266` ·
`src/lib/likida/processor.ts:4338` · `src/lib/likida/conv.ts:222-239` ·
`src/lib/likida/presupuesto.test.ts:133-145`

Escenario: `PASOS_CIERRE` declara **18 pasos** y de ahí se derivan
`COSTO_CIERRE_MS` (14.0 s), `MARGEN_CIERRE_MS` (39.0 s — la reserva que
`restante()` le descuenta al agente) y `TECHO_CIERRE_MS` (173.5 s). El camino
feliz del cierre hace hoy **20** viajes de red, no 18: el commit `2a3b310`
(AGEN-4, 1-sep-2026, solo en esta rama) añadió
`sellarEntregaLiquidacion(...,'entregada_operador_en')` en `processor.ts:4266` y
`sellarEntregaLiquidacion(...,'avisada_oficina_en')` en `processor.ts:4338`.
Los dos son un `UPDATE` real envuelto en `acotada` (`conv.ts:225-229`), o sea
0.3 s nominales y **9.5 s de techo** cada uno. `presupuesto.ts` no se toca desde
la auditoría 22 (`git log master..HEAD -- src/lib/likida/presupuesto.ts` está
vacío).

Los números contra los números:

| | escrito | real |
|---|---|---|
| pasos | 18 | 20 |
| `COSTO_CIERRE_MS` | 14.0 s | 14.6 s |
| `MARGEN_CIERRE_MS` (lo que se le quita al agente) | 39.0 s | 39.6 s |
| `TECHO_CIERRE_MS` | 173.5 s | **192.5 s** |

El guardarraíl que existe para exactamente esto no lo vio: la prueba de
`presupuesto.test.ts:133` cuenta los envíos leyendo **solo el fuente de
`avisar_cierre.ts`**, y los dos sellos viven en `processor.ts`. El resto de las
pruebas comparan la tabla consigo misma (`:146` verifica que haya 18 renglones —
o sea que ratifica el número viejo).

Entra: un turno que llega al cierre con `margenDuro()` justo por encima de
`MARGEN_CIERRE_CRITICO_MS` (29.5 s) — pasa el chequeo de `processor.ts:4045`,
gasta los 29.5 s en los tres pasos irrenunciables (respuesta, URL firmada, PDF) y
llega a los dos sellos + `saveConversation` con 0 ms. Sale: Vercel mata la
función después de entregar el PDF y **antes** de `saveConversation`
(`processor.ts:4351`) y antes del `finally` que suelta el lock del viaje
(`:4401`). El turno no queda en la conversación —el agente responderá el
siguiente mensaje desde una charla que le falta— y el viaje queda trabado hasta
que expire el TTL del mutex.

Consecuencia: el chofer que cierra su viaje recibe el PDF y, al mandar el
siguiente mensaje, el agente no sabe qué le dijo; el viaje queda bloqueado.
Nadie ve un error: Meta ya recibió su 200.

Causa raíz probable: el mecanismo que obliga a declarar cada paso de red del
cierre solo vigila un archivo (`avisar_cierre.ts`), y el cierre vive en dos.

(**REINCIDENTE**: es la misma forma del A24 de la auditoría 18 —
`avisarCierreAlJefe` añadió cinco pasos sin renglón— repetida una ronda
después, en la rama que se propone mergear.)

Severidad: **ALTO**.

---

### [MEDIO] `/api/admin/qa/fotos/ocr` corta en 105 s con 15 s de margen contra un peor caso de 120 s de UNA sola foto
`src/app/api/admin/qa/fotos/ocr/route.ts:52,65,171` ·
`src/lib/llm/openrouter.ts:29,699,707,718,725`

Escenario: la ruta declara `maxDuration = 120` (`:52`) y `PRESUPUESTO_MS =
105_000` (`:65`), y su comentario justifica los 15 s de diferencia como «lo que
falta para que la última foto en vuelo termine de escribir su fila». El bucle
consulta el reloj **antes** de cada foto y luego llama
`extraerComprobante(dataUrl)` **sin `signal` y sin `budget`** (`:171`, con la
nota que explica por qué se decidió así).

Sin señal, el único tope es el del SDK: `TIMEOUT_LLM_MS = 30_000`
(`openrouter.ts:29`, `maxRetries: 0`). Pero `generateStructured` tiene su propia
escalera de hasta **cuatro** llamadas al proveedor: `:699` (primer intento),
`:707` (reintento con el doble de tope si truncó — y si ese falla por algo que
no sea truncamiento, el error se traga y sigue), `:718` (reintento con nota) y
`:725` (fallback cross-provider, que para el modelo de OCR sí existe:
`google/gemini-3.1-flash-lite → anthropic/claude-haiku-4.5`, `:91`).

    peor caso de UNA foto = 4 × 30 s = 120 s
    margen declarado      =        15 s
    maxDuration           =       120 s

Entra: una foto que arranca en t = 104.9 s contra un OpenRouter lento (el caso
de 429/timeout, que es justo cuando la escalera se despliega entera). Sale: la
invocación muere a los 120 s con la llamada en vuelo; las fotos ya medidas sí
dejaron su fila, pero el JSON con `sinTurno` —el mecanismo que la cabecera del
archivo describe como la razón de ser del reloj— nunca llega, y el navegador de
Javier recibe un corte sin cuerpo. El caso sin truncamiento (timeout → reintento
→ fallback) ya son 90 s, seis veces el margen.

Consecuencia: la pantalla de calidad del OCR —la que dice si el pipeline lee
bien 91 comprobantes reales antes de un demo— se cae mudo justo el día en que el
proveedor está lento, que es el día en que uno quiere mirarla.

Causa raíz probable: el margen se dimensionó contra el costo TÍPICO de una foto
(2-6 s, el número que está escrito en `openrouter.ts:50`) y no contra el techo
de la escalera de reintentos del propio gateway.

Severidad: **MEDIO** (es la consola interna, no el chofer).

---

### [MEDIO] 18 de 102 llamadores de `traerTodo` siguen paginando sin desempate único, y tres de ellos ni siquiera piden `conteo()` (REINCIDENTE)
`src/lib/likida/pg.ts:132-135` (el contrato) ·
`src/lib/likida/mesa_control.ts:80` · `:108` ·
`src/lib/likida/asistencia_escalamiento.ts:173` ·
`src/lib/likida/mantenimiento.ts:258` · `:267`

Conté hoy, como se me pidió: **102 sitios de llamada** reales (fuera de pruebas
y del propio `pg.ts`). Los **100** que construyen una consulta traen `.order()`
—el arreglo REN-1 de `fd80af1` aguanta: no queda ninguno sin orden; los dos
restantes son la definición de `traerTodoEnParalelo` y su delegación—. Pero
**18** ordenan por algo que no incluye `id`. De esos, descarté los que ordenan
por una columna con `unique (tenant_id, …)` verificada en migración
(`unidad.numero_economico`, 0047:51; `cliente.nombre`, 0048:87;
`rutina_mantenimiento.nombre`, 0209:87), y quedan **nueve** sobre columnas sin
unicidad. La ronda anterior contó 19 de 89: el conteo bajó de 19 a 18 mientras
los llamadores subían de 89 a 102. El desempate llegó a `jornada/repo.ts:339`
(REN-9, verificado: `.order('momento').order('id')`) y a los tres o cuatro
sitios que la rama menciona; el resto no se tocó.

Escenario, con el peor de los nueve: `mantenimiento.ts:267` (`taller.cerradas`)
lee **toda la historia de mantenimientos cerrados de la flota**, sin filtro de
fecha, ordenada solo por `.order('cerrada_en', { ascending: false })`. Una flota
de 800 unidades con servicio de rutina mensual genera ~9,600 filas al año: cruza
las 1,000 de `PAGINA` en cinco semanas. Como el orden es descendente por tiempo,
**cada cierre de orden que ocurra durante la lectura entra en la posición 0** y
recorre todas las demás un lugar: la última fila de la página N se repite como
primera de la N+1 y una fila se pierde. El `count` también creció, así que
`filas.length >= esperadas` (`pg.ts:204`) se cumple y `LecturaIncompleta` **no
se lanza**.

Los tres peores por otra razón: `mesa_control.ts:80`, `mesa_control.ts:108` y
`asistencia_escalamiento.ts:173` ordenan por `abierta_en`/`created_at` **y no
pasan `conteo(desde)`** en su `.select()`. Sin `count`, `traerTodo` cae a la
prueba de la página vacía (`pg.ts:206-209`), que es exactamente la que un salto
de filas satisface: la lectura sale corta y devuelve normal, para siempre.

Consecuencia: la pantalla del taller declara «vencida» una rutina que sí se
sirvió (la fila del servicio se saltó), y la mesa de asistencia deja fuera una
incidencia abierta sin decir que la dejó fuera. El contralor cruza contra su
bitácora y no cuadra.

Causa raíz probable: el contrato está escrito en `pg.ts:132-135` pero nada lo
verifica; se aplica a mano, llamador por llamador.

Severidad: **MEDIO**. (**REINCIDENTE** de la auditoría 23.)

---

### [MEDIO] El contrato de `traerTodo` promete lo que un `.order('id')` no puede dar: `range()` por posición se salta filas con cualquier escritura concurrente
`src/lib/likida/pg.ts:132-135` · `src/lib/likida/pg.ts:190-215` ·
`src/lib/admin/prospectos-mapa.ts:548-552` (la evidencia)

Escenario: el contrato dice «LA CONSULTA TIENE QUE VENIR ORDENADA POR ALGO
ÚNICO … Todos los llamadores desempatan con `id`», y el arreglo de esta ronda
consistió en agregar `.order('id')` donde faltaba. Pero el cursor sigue siendo
`.range(desde, desde + 999)` sobre el resultado **recalculado en cada vuelta**:
un orden único elimina el empate, no el desplazamiento. Con `.order('id')`
ascendente sobre UUID v4, un `INSERT` concurrente cae en una posición aleatoria;
si cae antes del cursor, todas las filas posteriores se corren una y una se
salta. Con un orden descendente por tiempo (`repo.ts:1466`, `calidad.ts:56`,
`proveedores.ts:452`, `vendedores.ts:380`, `cotizador/lector.ts:258`) la fila
nueva cae SIEMPRE en la posición 0, así que el salto es seguro, no probable.

Esto no es teoría en este repo: `export/liquidaciones/route.ts:98-137` migró a
keyset por esta razón exacta (auditoría 21), y `prospectos-mapa.ts:548` documenta
que el bug **se vio en producción** — «se vio como pines duplicados en el mapa
(17-ago)». El resto de los 102 llamadores sigue con `range()`.

Entra: un `getLibroViaje` o un tablero de la flota que lea >1,000 filas mientras
un chofer cierra un viaje por WhatsApp. Sale: una fila duplicada y otra ausente,
con `leidas == esperadas` y sin excepción.

Consecuencia: una cifra que sale a la baja en la dirección que nadie revisa, en
el archivo por el que pasa el dinero.

Causa raíz probable: se trató el problema como «empates» cuando es «paginación
por posición sobre una tabla viva»; el arreglo correcto (keyset) ya existe en el
repo pero no se generalizó.

Severidad: **MEDIO**.

---

### [MEDIO] El piloto de visión itera 14 pasos sin mirar el reloj ni pasar señal, dentro de un cron cuyo corte por portal solo garantiza 150 s
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:101,242,559-568` ·
`src/app/api/cron/facturar/lote.ts:48,80,576`

Escenario: `PASOS_MAXIMOS = 14` (`:101`) y el `for` de `:242` no consulta ningún
`venceEn` — a diferencia de `escalar_viaje.ts`, `asistencia_escalamiento.ts` y
el propio `lote.ts`, que sí lo hacen y cuyo comentario de `:80` cita al auditor
de rendimiento de la ronda 10 por esto mismo. Cada paso es un
`generateStructured` con `role: 'piloto'` = `anthropic/claude-sonnet-5`
(`models.ts:140`) **sin `signal`** (`piloto_vision.ts:559-568`), o sea sin forma
de cortarlo.

Los números: `TOPE_DURACION_S = 300` (`lote.ts:48`) y `MARGEN_LOTE_MS = 150_000`
(`:80`), así que el corte de `:576` solo garantiza que un portal **empiece**
antes de los 150 s; una vez dentro tiene los 150 s restantes y nadie más mira el
reloj. El peor caso documentado de una sesión de portal (147 s) se calculó
«sumando cada tope de `pagina_playwright.ts` y `capufe.ts`» — **sin** el piloto.
Con el piloto: 14 pasos × una llamada de visión de Sonnet con captura de pantalla
(≈10-12 s típicos) = 140-168 s solo de modelo, más 14 inventarios, 14 capturas y
14 acciones de Playwright. Y un solo paso colgado se lleva 120 s él solo (la
escalera de cuatro intentos × 30 s del hallazgo anterior).

    portal que arranca en t = 149 s  +  piloto de 14 pasos (≈160 s)  =  309 s
    maxDuration                                                     =  300 s

Sale: Vercel mata la invocación con el navegador dentro del formulario fiscal —
la muerte AMBIGUA que el comentario de `lote.ts:540` nombra por su nombre («¿se
fue el formulario antes de reventar?»), que es como se acaba con dos CFDI por el
mismo consumo.

Consecuencia: latente mientras `FACTURACION_PILOTO=si` esté apagado
(`adaptadores/registro.ts:331`), y ese es el único guardarraíl que hoy lo contiene.

Causa raíz probable: el piloto se escribió como un bucle acotado por PASOS y no
por TIEMPO, y el reloj del cron se detiene en la frontera del portal.

Severidad: **MEDIO**.

---

### [BAJO] La foto va al modelo de visión a resolución nativa, aunque el repo ya calculó la de 1600 px dos líneas antes — y se reenvía hasta cuatro veces
`src/lib/likida/intake/ocr.ts:389,399-407` ·
`src/lib/likida/intake/cfdi_imagen.ts:110` · `src/lib/meta/client.ts:47,678`

Escenario: `extraerComprobante` pasa `bufferFromDataUrl(f)` a
`decodeCodigosFromImage`, que **sí** reescala con sharp a 1600 px y luego a 1000
(`cfdi_imagen.ts:110`), y tira ese buffer. Acto seguido manda a `generateStructured`
el `principal` —el data-URL **original** que `downloadMediaAsDataUrl` armó tal
cual (`meta/client.ts:678`)—, cuyo único tope es
`MAX_IMAGEN_WHATSAPP_BYTES = 6 MB` (`:47`).

Entra: un ticket fotografiado con un iPhone reciente (4032×3024, ~4-5 MB). Sale:
5.3-6.7 MB de base64 dentro del cuerpo JSON de la llamada a OpenRouter, y el
mismo cuerpo se reenvía **hasta cuatro veces** por la escalera de
`openrouter.ts:699-725` — hasta ~27 MB subidos por un comprobante, dentro de los
25 s que `processor.ts:1809` le concede (`reloj.senal(25_000)`). En tokens de
entrada, un modelo de visión que tesela a 768 px cobra ~4× más por una foto de
3072 px de lado que por la misma a 1600 px; con la cifra de volumen que el propio
repo usa (506,000 comprobantes/mes, `models.ts:66`) la diferencia es del orden de
cientos de dólares al mes — estimación declarada, no medida: no tengo el
tokenizador del proveedor para afirmarla.

Lo que sí es cierto sin estimar: el buffer reducido ya se produjo y se descarta.

Consecuencia: tiempo de subida y tokens de entrada que nadie eligió pagar, en el
paso que corre 100% de las veces que un chofer manda un ticket.

Causa raíz probable: el reescalado se escribió para el lector de códigos de
barras y quedó encerrado en `cfdi_imagen.ts`; el camino de visión nunca lo pidió.

Severidad: **BAJO**.

## Lo que revisé y está bien

- **REN-1 aguanta.** `pg.ts:190-215` mantiene el cursor por filas leídas (no por
  número de página), la prueba del `count` y el `throw` al agotar
  `MAX_PAGINAS`. De 102 llamadores, **ninguno** construye la consulta sin
  `.order()`.
- **REN-3 / migración 0287 es real, no cosmética.**
  `0287_ultimas_posiciones_lateral.sql:63-72` reemplaza el `distinct on` de la
  0269 por un `cross join lateral … order by medida_en desc limit 1`, y el
  índice que lo sostiene existe con esa clave exacta
  (`0176_gps_ingesta.sql:66`, `uq_posicion_lectura (tenant_id, unidad_id,
  medida_en)`). `estado_rastreo_tenant` se reescribió con la misma sonda
  conservando su contrato (`comercial.ts:533-543` valida la forma y falla
  cerrado).
- **REN-2 y REN-7 están implementados.** `sincronizar_gps.ts` cambió
  `TOPE_POR_FLOTA = 500` mudo por `TOPE_LECTURAS_POR_FLOTA = 5000` + `recortadas`
  en el resultado, `error` en el log y `parcial` en el cron; y bajó los `.in()`
  de 500 a `IDS_POR_CONSULTA = 200` (7.5 KB de URL, la misma cifra que
  `IDS_POR_TANDA` de `pg.ts:140`).
- **REN-9 cerrado.** `jornada/repo.ts:339-353` pagina `jornada_asiento` con
  `.order('momento').order('id')`.
- **Los 7 `maxDuration` de export existen** (`bitacora-peaje`,
  `carta-porte-xml`, `facturas-proveedor`, `jornada`, `liquidaciones`,
  `pdf/[id]`, `poliza`, todos = 120), y `export/liquidaciones/route.ts:112-137`
  pagina por **keyset real** —`(created_at, id) < (última)` con las dos ramas
  del `or`— y aborta el stream con `LecturaIncompleta` en vez de cerrar un CSV
  corto (`:173`, `:185`).
- **`acotada` + el backstop del cliente cubren toda consulta.**
  `presupuesto.ts:219-240` impone `abortSignal` **y** una carrera contra
  temporizador; `supabase/admin.ts:32-38` pone un backstop de 25 s a cualquier
  fetch que no traiga señal propia, respetando la más estrecha. Es la respuesta
  correcta al default de 300 s de undici.
- **El presupuesto por invocación, no por mensaje** (`presupuesto.ts:308`,
  `route.ts:129`) y el pool de 5 (`route.ts:72`) están bien razonados y el
  número está justificado con la medición del bloqueo de zxing.
- **`processInbound` no arranca sin 15 s** (`processor.ts:1232`) y devuelve
  `sin_tiempo` para que la bandeja durable lo recupere; el re-chequeo del reloj
  después del agente (`:4045`, contra `MARGEN_CIERRE_CRITICO_MS`) es correcto y
  ya no cuenta la reserva dos veces.
- **No hay N+1 en `repo.ts`**: el archivo no contiene un solo `for` ni un
  `Promise.all`. Los 22 `await` dentro de bucles que encontré en `src/` están
  todos en tandas (`importar_viajes.ts:458` en lotes de 200 y 100,
  `privacidad.ts:1095,1114` en tandas de 200, `pg.ts:162-181` `traerPorIds`).
- **`costoReal` prefiere el `cost` del proveedor** sobre la tabla
  (`openrouter.ts:246-262`) con la medición de la caché documentada, y
  `calcCost` estima con la tarifa MÁS CARA ante un modelo sin precio
  (`:264-278`) — falla hacia lo ruidoso, que es lo correcto.
- **Los topes diarios por tenant leen el gasto paginado**
  (`dashboard/chat/tope.ts:31-42`, `dashboard/ingesta/tope.ts:35`) con `conteo()`
  y `acotada`, y a $1/día de tope el volumen no pasa de una página.
- **El corte por portal del cron de facturación existe** (`lote.ts:453,548,576`)
  y usa el MISMO instante de corte en los tres puntos.

## Lo que NO alcancé a revisar

- El costo por liquidación de punta a punta medido contra el objetivo de
  $0.03-0.05 (`models.ts:17`): habría que sumar OCR × N fotos + cuadre con tools
  + PDF, y no hay corrida real con la que contrastar (la base está en cero).
- El ciclo agéntico completo `generateWithTools` (`openrouter.ts:914-1196`): su
  loop-guard, su presupuesto por ronda y si `cache_control` está donde debe.
  Solo verifiqué que `generateStructured` **no** lo aplica (irrelevante hoy: sus
  únicos consumidores Anthropic son el piloto y `computer_use`, con systems de
  ~800 tokens).
- `agentes/cola.ts`, `wa_outbox.ts` y `wa_pendientes.ts` (la cola durable): sus
  leases contra `maxDuration` y el costo del drenado.
- Los crons de 300 s (`gps`, `descarga-sat`, `runner`, `wa-outbox`): verifiqué
  que todos tienen `venceEn`, no que el margen de cada uno cubra su peor caso.
- Las ~31 páginas de `/dashboard`: cuántas consultas dispara cada render y si
  alguna repite la misma lectura en dos componentes.
