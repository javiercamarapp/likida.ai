# Backend y API — auditoría 17 (pase 2)

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. Los
siete hallazgos del pase 1 siguen abiertos sin una línea tocada (lo verifiqué con
`git diff 94c0733..HEAD` sobre cada archivo: `cron/facturar/`, `repo.ts`,
`api/demo/`, `asistente/route.ts`, `cfdi/export/route.ts` no tienen ni un cambio;
`administracion.ts` sí cambió, pero en `crearFlota`, no en `guardarPolitica`).
Encima entró un camino nuevo que **manda WhatsApp solo a personas reales** —
`recordatorio_comprobacion.ts` — y ahí la disciplina de concurrencia sí subió
(el claim tiene prueba propia, cosa que QStash nunca tuvo), pero el **contrato de
selección** no: la consulta que decide a quién escribirle no comprueba ninguna de
las tres cosas que el mensaje afirma.

Compuerta corrida hoy por mí: `npx vitest run src/lib/likida/recordatorio_comprobacion.test.ts
src/lib/likida/escalar_viaje.test.ts src/proxy.test.ts` → 54 verdes. Coincide con
el MAPA.

**El riesgo mayor del rubro hoy:** el cron de las :00 puede mandarle al chofer del
viaje del demo —el teléfono de Javier, `seed.sql:75`— un mensaje que dice "llevas
N días sin mandarme comprobantes" sobre un viaje que tiene dos comprobantes
cargados y a la vista en la pantalla.

---

## Estado de los hallazgos del pase 1

Ninguno cerrado. Siete de siete **REINCIDENTES**, y los verifiqué por línea, no
por diff:

1. **[ALTO] El cron de facturación declara `corrio: true` cuando solo encoló** —
   **REINCIDENTE**. `cron/facturar/route.ts:308-330` intacto: sigue el
   `return NextResponse.json({corrio: true, encolado: true, …})` dentro del `if
   (process.env.UPSTASH_QSTASH_TOKEN …)`, y `cola/route.ts:25-28` sigue
   devolviendo 503 sin que el cron se entere. `grep UPSTASH_QSTASH_TOKEN
   src/app/api/cron/facturar/route.test.ts` → **vacío**; `grep -rn "facturar/cola"
   src --include=*.test.ts` → **vacío**. Sigue sin una sola prueba.
   La nota colateral también: `route.ts:258` sigue calculando `modo` sin usarlo.
2. **[ALTO] `updateGastoCfdiXml` descarta el error de su lectura y reemplaza
   `ocr_extra`** — **REINCIDENTE**. `repo.ts:415-419` sigue siendo
   `const { data: actual } = await acotada(...)` sin `error`, y `:419-420`
   sigue escribiendo `extra.ocr_extra = ocrExtra` completo.
3. **[MEDIO] La cola de QStash se presupuesta con los 300 s del cron** —
   **REINCIDENTE**. `route.ts:25` sigue en `maxDuration = 300` y `cola/route.ts:11`
   en 600; `PRESUPUESTO_LOTE_MS` sigue siendo constante de módulo.
4. **[MEDIO] Dos handlers resuelven `?tenant=` a mano sin mirar `error`** —
   **REINCIDENTE**. `api/dashboard/asistente/route.ts:57` sigue con
   `const { data: t } = await supabaseAdmin().from('tenant')…maybeSingle()`;
   `dashboard/contador/cfdi/export/route.ts:55` igual. `resolverTenantApi` sigue
   cableado solo en los dos endpoints de `export`.
5. **[MEDIO] `tenant.config` con lee-modifica-escribe desde dos módulos** —
   **REINCIDENTE**. `administracion.ts` cambió en esta ventana (`crearFlota`,
   régimen 624), pero `guardarPolitica` y `repo.ts:926-934` (`actualizarFacilidad15`)
   siguen exactamente igual.
6. **[BAJO] La URL destino del job firmado sale de la cabecera `Host`** —
   **REINCIDENTE**. `cron/facturar/route.ts:316` textual.
7. **[BAJO] `receiver.verify` sin `url`** — **REINCIDENTE**.
   `cola/route.ts:36-39`: sigue `receiver.verify({ signature, body })`.
8. **[BAJO] `/api/demo` parsea el cuerpo sin red** — **REINCIDENTE**.
   `api/demo/route.ts:32`: `const body = (await req.json()) as {…}` sin try/catch.

---

## Hallazgos

### [CRÍTICO] El recordatorio afirma "sin mandarme comprobantes" sin haber mirado un solo comprobante

`src/lib/likida/recordatorio_comprobacion.ts:54-61` (la consulta) y `:84-92`
(el texto). Contrastar con `supabase/migrations/0087_recordatorio_comprobacion.sql:5`,
que describe la funcionalidad como *"un viaje abierto/en_cuadre con `fecha_inicio`
vieja **y sin comprobantes recientes**"*.

**Escenario, con valores.** La consulta filtra por cuatro cosas:
`estatus in ('abierto','en_cuadre')`, `recordatorio_comprobacion_en is null`,
`fecha_inicio is not null` y `fecha_inicio <= hoy-3d`. **No hay ni un `join`, ni
un `exists`, ni una lectura a `gasto`.** Tomo el viaje del propio seed:
`seed.sql:115-121` inserta `44444444-…-0001` / folio `VJ-2026-0001`,
`estatus='abierto'`, `fecha_inicio = current_date`, operador
`33333333-…-0001`; y `seed.sql:130-140` le carga **dos gastos**: diésel $4,200 con
CFDI timbrado y caseta $1,400. El teléfono de ese operador es
`529993700779`, y `seed.sql:71` dice qué número es: *"OP-101 (el del viaje demo)
usa el teléfono de Javier"*.

Se siembra el lunes, el demo es el jueves. El jueves a las 12:00 corre
`/api/cron/escalar`, `fecha_inicio` (lunes) ya es `<= hoy-3d`, y a ese teléfono le
entra:

> Llevas 3 días con tu viaje *VJ-2026-0001* sin mandarme comprobantes. 📋

sobre un viaje que tiene $5,600 comprobados y un CFDI con complemento
HidroYPetro ya cuadrados.

**Consecuencia.** Rompe "un rótulo tiene que ser verdad" en el único canal que el
comprador ve en vivo: el hilo de WhatsApp proyectado. El contralor de Transportes
Innovativos está viendo la pantalla donde el motor acaba de leer esos dos
comprobantes, y el producto le escribe al chofer que no mandó ninguno. En
producción es peor y más callado: el chofer que **sí** está comprobando a diario
recibe un reclamo falso, y el canal —que este repo protege en todos lados con el
argumento de "no se quema"— se quema con el primer mensaje.

**Causa raíz probable:** el predicado que el nombre de la columna, el comentario
de la migración y el texto del mensaje prometen (*sin comprobantes*) nunca se
escribió en la consulta; el único proxy es la antigüedad de `fecha_inicio`.

---

### [ALTO] El recordatorio se manda con `sendText`, que fuera de la ventana de 24 h no entrega — y el claim de un solo tiro ya se quemó

`src/lib/likida/recordatorio_comprobacion.ts:133-140` (el envío) y `:117-125`
(el claim, que ocurre antes). Contrastar con `escalar_viaje.ts:220-233`, que en el
mismo repo sí hace el fallback.

**Escenario, con valores.** El destinatario de este recordatorio es, por
construcción, alguien que lleva ≥3 días sin actividad en el viaje. WhatsApp solo
entrega texto libre dentro de las 24 h desde el último mensaje **del usuario**;
`meta/client.ts:204-214` lo documenta con todas sus letras (*"Todo lo que Likida
INICIA —pedir un POD, avisar de un anticipo, recordar un cierre— tiene que ir por
aquí"*, refiriéndose a `sendTemplate`) y `meta/client.ts:285-286` ya tiene el
mensaje del error concreto: `131047`.

Corrida: viaje `v-1`, folio `VJ-104`, chofer con última respuesta hace 4 días.
`reclamarRecordatorio` (`:158-164`) escribe `recordatorio_comprobacion_en = now()`
y devuelve `ganado: true`. `sendText` (`:135`) pega a Meta, Meta contesta 400 con
`code: 131047`, `sendText` registra `wa.sendText` y devuelve `null` (`client.ts:96`),
y aquí eso se convierte en `r.fallos.push('VJ-104: WhatsApp rechazó el envío')`.
El sello ya está puesto: `recordatorio_comprobacion_en IS NULL` nunca vuelve a ser
cierto, y **ese viaje jamás vuelve a entrar a la consulta**. El único rastro es un
string dentro del JSON que devuelve el cron, que Vercel no persiste, y una línea
`wa.sendText` con el status.

Lo llamativo: `escalar_viaje.ts:222-228` resuelve exactamente esto —
`recordado = Boolean(await sendText(...)); if (!recordado) await avisarAlChofer(...)`,
y `avisarAlChofer` → `notificarAsignacion` → `sendTemplate` (`notificar.ts:170`).
El camino nuevo copió el claim de `escalar_viaje.ts` y no copió el fallback.

**Prueba que lo cubra: no existe.** `recordatorio_comprobacion.test.ts:82` fija
`sendText.mockResolvedValue('wamid.TEST')` y ningún caso lo pone en `null`. Está
probada la excepción (`:221-230`) y el teléfono ausente (`:148-157`), pero no el
rechazo de Meta, que es el caso de casi todos.

**Consecuencia.** La funcionalidad entera puede tener una tasa de entrega cercana
a cero y reportar `recordados: 0, fallos: [...]` en un cuerpo HTTP que nadie lee;
para el chofer, el recordatorio automático que Javier pidió el 8-ago simplemente
no existe, y no hay segunda oportunidad porque el sello es de un solo tiro y sin
expiración (a diferencia de `al_vuelo.ts`, que sí tiene `CLAIM_MINUTOS = 10`).

**Causa raíz probable:** se reusó el mecanismo de claim de `escalar_viaje.ts` sin
reusar su distinción entre "el canal rechazó" y "el canal entregó".

---

### [ALTO] La misma corrida del cron puede mandarle al mismo chofer dos WhatsApps contradictorios sobre el mismo viaje

`src/app/api/cron/escalar/route.ts:65-83` (los dos bloques, uno tras otro, sin
intersección) contra `escalar_viaje.ts:81-92` y
`recordatorio_comprobacion.ts:54-61`.

**Escenario, con valores.** Los dos filtros pueden ser ciertos a la vez sobre la
misma fila. `viajesSinAceptar` pide `estatus='abierto'`, `aceptado_en is null`,
`escalado_en is null`, `avisado_en <= ahora-5h`. `viajesSinComprobar` pide
`estatus in ('abierto','en_cuadre')`, `recordatorio_comprobacion_en is null`,
`fecha_inicio <= hoy-3d`. **Ninguno de los dos mira las columnas del otro.**

Caso concreto y común: el despacho captura el lunes 3 de agosto un viaje cuya
`fecha_inicio` es el **viernes 31 de julio** (registro retroactivo — el viaje ya
salió). `crear_viaje_wa.ts` llama a `avisarAlChofer`, que pone `avisado_en =
lunes 08:00`. El chofer no contesta. El lunes a las 13:00 corre el cron:

- bloque 1 (`escalarViajesSinAceptar`): `avisado_en` tiene 5 h → gana el claim de
  `escalado_en` y manda *"Te recuerdo tu viaje **VJ-104**: lo tienes asignado desde
  hace 5 horas y todavía no me confirmas si lo arrancas"* (`escalar_viaje.ts:138-146`);
- bloque 2 (`enviarRecordatoriosComprobacion`): `fecha_inicio` (31-jul) es ≤ 5-ago
  → gana el claim de `recordatorio_comprobacion_en` y manda, segundos después,
  *"Llevas 3 días con tu viaje **VJ-104** sin mandarme comprobantes"*.

Dos mensajes en la misma pantalla, en el mismo minuto, sobre el mismo folio: uno
dice que el viaje ni siquiera arrancó y el otro le reclama los comprobantes de
tres días de ese viaje.

**Consecuencia.** El chofer no puede actuar sobre ninguno de los dos y aprende a
ignorar el hilo — que es el modo de falla que los dos archivos citan como su razón
de existir (`escalar_viaje.ts:20-25`, `recordatorio_comprobacion.ts:23-29`). Si
pasa durante el demo, es el producto contradiciéndose a sí mismo por WhatsApp
delante del comprador. El encabezado de la ruta (`escalar/route.ts:15-19`) afirma
que los dos chequeos *"son 'viaje abierto que se está pasando de tiempo', misma
cadencia"* y que juntarlos era lo económico — pero juntarlos sin cruzarlos es lo
que hace posible el doble mensaje.

**Prueba que lo cubra: no existe.** No hay `route.test.ts` bajo
`src/app/api/cron/escalar/` (`find src/app/api -name "*.test.ts"` devuelve seis
archivos, ninguno del cron de escalar), y las dos suites de módulo se ejecutan
aisladas con mocks distintos, así que nada ejercita las dos consultas contra la
misma fila.

**Causa raíz probable:** los dos chequeos comparten invocación y destinatario pero
no comparten estado; ninguno excluye los viajes que el otro acaba de reclamar.

---

### [ALTO] La mig. 0087 no tiene compuerta de arranque: la primera corrida alcanza todo el histórico de viajes abiertos, con la antigüedad impresa en el mensaje

`supabase/migrations/0087_recordatorio_comprobacion.sql:14-15` (la columna nace
`NULL` para todas las filas existentes) y
`src/lib/likida/recordatorio_comprobacion.ts:52-61` (sin cota inferior de fecha),
`:134` (el cálculo de `dias`).

**Escenario, con valores.** La 0058 —el patrón que este archivo dice copiar—
quedó protegida por accidente feliz: `escalado_en` depende de `avisado_en`, una
columna que también nacía `NULL`, y su propia migración lo dice
(`0058:9-10`: *"Sin esto puesto, el viaje es INVISIBLE para la escalación"*). El
histórico entero quedó fuera. La 0087 se cuelga de `fecha_inicio`, que existe
**desde `0001_init.sql:53`** y está poblada en todo viaje jamás creado.

Entonces: se aplica la 0087 y se despliega. A la hora siguiente, la primera
corrida del cron levanta hasta **100 viajes** (`:61`, `.limit(100)`, sin `order`)
de cualquier antigüedad, con tal de que sigan en `abierto`/`en_cuadre` — o sea,
todos los viajes de prueba, de seed, y los que alguien abrió y abandonó desde que
existe la base. `dias` (`:134`) no tiene tope: un viaje de febrero produce

> Llevas 187 días con tu viaje *VJ-2026-0009* sin mandarme comprobantes. 📋

y sale a los teléfonos que estén capturados en `operador` — incluidos los
`+521111111102…105` inventados del seed (`seed.sql:76-79`) y el de Javier
(`seed.sql:75`). Todo en un solo minuto, sin reversa: los 100 claims quedan
puestos.

**Consecuencia.** Un solo despliegue dispara una ráfaga saliente proporcional al
tamaño del histórico, con textos absurdos, hacia números que el propio seed marca
como placeholders. Para la flota: mensajes del sistema que nadie pidió sobre
viajes muertos. Para Likida: consumo de mensajes de Meta y calidad del número
degradada por reportes de spam, en la cuenta con la que se hace el demo.
La única prueba que toca la fecha (`recordatorio_comprobacion.test.ts:98-104`)
verifica el **límite superior** (`lte`), y confirma que no hay inferior.

**Causa raíz probable:** el sello se diseñó como "no se le ha mandado" sin
distinguirlo de "nació antes de que esta funcionalidad existiera"; falta el
backfill o el piso de fecha que la 0058 tuvo gratis.

---

### [MEDIO] Dos lotes de envíos secuenciales comparten 120 s sin medirlos: el segundo puede no correr nunca y el resultado de los dos se pierde

`src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`), `:65-83` (los dos
bloques en serie) y `:89` (el único lugar donde salen los `fallos`).

**Escenario, con valores.** `escalarViajesSinAceptar` procesa hasta 100 viajes
(`escalar_viaje.ts:92`) y por cada uno puede hacer hasta cuatro llamadas a Meta
con `AbortSignal.timeout(10_000)` cada una (`client.ts:17`): `sendText` al chofer,
`sendTemplate` de respaldo dentro de `avisarAlChofer`, `sendText` al jefe y
`sendTemplate` al jefe. Con Meta lento —no caído, lento— a 2 s por llamada y 40
viajes en el lote, el primer bloque consume ~240 s. La invocación muere a los
120 s: el `for` se corta a media lista, y **el `return` de la línea 89 nunca
ocurre**, así que se pierden los `fallos` de los dos bloques, y
`enviarRecordatoriosComprobacion` no llega a ejecutarse ni una vez. Mientras
tanto, los viajes ya reclamados en el bloque 1 quedan con `escalado_en` puesto y
sin mensaje enviado, que es el trato aceptado del claim — pero sin nadie que sepa
cuáles.

Si el volumen de viajes sin aceptar se mantiene alto, el bloque 2 se queda en
**inanición permanente**: la funcionalidad nueva nunca corre y el síntoma es
indistinguible de "no hay viajes que recordar".

**Consecuencia.** Para el equipo: el cron se ve verde salvo por el timeout en los
logs de Vercel, y el único inventario de lo que falló vive en un cuerpo HTTP que
se perdió. Es la misma clase de "cron en verde que no hace nada" que la propia
ruta declara evitar (`:33-40`) — pero por agotamiento, no por falta de secreto. El
comentario de `:8-11` dice *"el presupuesto es para los envíos"*; nada en el código
mide ese presupuesto, a diferencia de `cron/facturar/route.ts:129,158`, que sí
tiene `PRESUPUESTO_LOTE_MS` y `MARGEN_LOTE_MS`.

**Causa raíz probable:** el lote está acotado en filas (100) pero no en tiempo, y
los dos chequeos se encadenaron en una invocación sin repartir el presupuesto.

---

### [BAJO] Un viaje sin teléfono capturado quema su recordatorio para siempre, y la condición se conocía antes del claim

`src/lib/likida/recordatorio_comprobacion.ts:117` (el claim) y `:127-131` (la
comprobación del teléfono, después).

**Escenario.** Se da de alta una flota y se capturan cinco operadores sin
teléfono (`operador.telefono` es nulable; el seed marca cuatro de cinco como
placeholders). Tres días después corre el cron: los viajes ganan el claim, luego
entra el `if (!v.operadorTelefono)`, se registra `recordatorio_comprobacion.sin_telefono`
y se sigue. Cuando el encargado captura los teléfonos esa misma tarde, el
recordatorio de esos viajes **ya se consumió**: no hay reintento.

**Consecuencia.** Es la decisión documentada (`:100-108`) y probada
(`test:148-157`), heredada de `escalar_viaje.ts` — la anoto en BAJO porque, a
diferencia de allá, aquí `operadorTelefono` ya viene en la fila leída (`:75`) y se
podría descartar **antes** de gastar el claim, sin cambiar el resto del trato.
Deuda: al equipo le va a costar entender por qué un viaje "ya recordado" nunca
recibió nada.

---

### [BAJO] `viajesSinComprobar` cruza todos los tenants sin filtro de actividad ni orden

`src/lib/likida/recordatorio_comprobacion.ts:54-61`.

La consulta no lleva `tenant_id` (correcto: es un cron global) pero tampoco lleva
`order`, ni excluye tenants dados de baja, ni operadores con `activo = false`
(`seed.sql:75-79` muestra que la columna existe). Con `.limit(100)` sobre un
`select` sin `order by`, el subconjunto que Postgres devuelve es arbitrario;
como los reclamados salen de la consulta la cola se drena igual, así que el orden
no produce inanición — pero un operador dado de baja sigue recibiendo mensajes de
una flota en la que ya no trabaja, y eso sí es un dato de viaje enviado a alguien
que ya no debería recibirlo. **Consecuencia:** ruido saliente y un dato de
operación (folio, días) a un ex-empleado. **Causa raíz probable:** la consulta se
calcó de `viajesSinAceptar`, que tampoco filtra por `activo`.

---

## Lo que revisé y está bien

- **El claim del recordatorio es correcto Y tiene prueba propia — la respuesta a
  la pregunta dura del brief es NO.** Dos corridas solapadas **no** pueden mandar
  dos mensajes al mismo viaje. `recordatorio_comprobacion.ts:158-164` es un
  `UPDATE … .eq('id') .eq('tenant_id') .is('recordatorio_comprobacion_en', null)
  .select('id')`: la condición cae sobre la misma columna que el UPDATE pisa, así
  que bajo READ COMMITTED la segunda transacción bloquea, reevalúa el predicado
  sobre la fila ya actualizada y devuelve **cero filas**. Cero filas se trata como
  "perdí la carrera", no como error (`:170`), y un error de la base se trata como
  fallo cerrado: no se manda nada (`:118-121`). La prueba que lo cubre se llama
  **`recordatorio_comprobacion.test.ts:171` — "DOS CORRIDAS SOLAPADAS: solo UNA
  gana el claim y manda el mensaje"**, más `:159` (claim con error → `sendText` no
  se llama) y `:188` (un viaje malo no tumba el lote, con tres `resultadosUpdate`
  distintos). Esto es exactamente lo que le faltó a QStash en el pase 1.
- **El claim va acotado por tenant además de por id** (`:161-163`), con prueba
  nombrada (`test:207`, "el UPDATE va acotado por tenant, no solo por id").
- **`viajesSinComprobar` falla cerrado**: `:63` lanza en vez de devolver `[]`, con
  prueba (`test:106`, "UN ERROR NO ES UNA LISTA VACÍA"). Es la regla del CLAUDE.md
  aplicada al camino nuevo.
- **El cron nuevo no afloja la puerta**: `escalar/route.ts:50-61` sigue exigiendo
  `CRON_SECRET` presente (500 si falta, no 200) y comparando el `Bearer` completo,
  y el 401 va sin cuerpo. Los dos chequeos van en `try/catch` independientes
  (`:65-83`), así que uno que truene no ciega al otro — verificado leyendo, sin
  prueba de ruta que lo cubra.
- **`startup.ts:65-85` cerró un lock que se pedía y no se respetaba**, y con
  prueba: el `unlock_viaje` incondicional del probe borraba el lease de un
  proceso ajeno (`unlock_viaje` es un `delete where viaje_id` sin token de dueño,
  mig. 0005). Ahora solo suelta si `tomado === true`. La prueba se llama
  **`startup_mutex_ajeno.test.ts`** (89 líneas nuevas). Es el único camino de
  concurrencia que este pase cerró.
- **El retiro del rol `operador` no dejó agujeros de ruteo.** `proxy.ts:110`
  reduce `RUTAS_CON_SESION` a `['/dashboard','/admin']` y las páginas
  correspondientes ya no existen (`ls src/app` no lista `chofer` ni `mis-viajes`);
  `guard.ts` perdió `requireOperador` sin dejar importadores
  (`grep -rn requireOperador src/` solo devuelve comentarios), y `PANEL_PROPIO`
  vacío hace que un `app_user` con `rol='operador'` residual caiga a `/sin-acceso`
  por el `??` de `areasDe` — fail closed. `proxy.test.ts` verde (11 pruebas).
- **El arreglo del PDF del contralor en `processor.ts:2160-2190` está bien del
  lado del servidor:** la segunda firma va dentro de `acotada` con etiqueta
  propia, distingue `error` de `!data?.signedUrl`, registra
  `pdf.contralor_no_firmado` con tenant y viaje, y degrada a "aviso sin adjunto"
  en vez de mandar el ejemplar censurado. El paso nuevo se anotó en
  `PASOS_CIERRE` (`presupuesto.ts:47-53`), que es la disciplina de ese archivo.
- **`duplicados.ts`, `pg_errores.ts`, `conv.ts` y `repo.ts`** no tienen un solo
  cambio en esta ventana (`git diff --stat 94c0733..HEAD -- src/lib/`), así que
  los cierres que verifiqué en el pase 1 sobre esos archivos siguen puestos: el
  claim del doble CFDI (`al_vuelo.ts:627-659`, probado en
  `al_vuelo.test.ts:649-790`), la transacción única del cierre
  (`repo.ts:605-620`), la idempotencia del webhook (`conv.ts:343-353`) y el mutex
  del viaje (`conv.ts:418-464`).

---

## Lo que NO alcancé a revisar

- **El comportamiento real de Meta ante el 131047 en este flujo.** El hallazgo del
  `sendText` fuera de ventana está verificado por lectura del código
  (`client.ts:204-214`, `:285-286`) y por el hecho de que `escalar_viaje.ts` ya
  hace el fallback; **no** pude ejercitarlo contra la Graph API (sin credenciales
  aquí y las `pruebas-manuales/*` están vetadas).
- **El volumen real del histórico de viajes `abierto`.** El hallazgo del arranque
  sin compuerta está verificado en el mecanismo (columna nueva `NULL` + columna
  vieja poblada desde `0001_init.sql:53`); cuántas filas dispara la primera
  corrida solo se sabe consultando la base de producción, que no tengo.
- **`processor.ts` completo** (136 KB). Solo leí el bloque que cambió
  (`:2100-2200`).
- **`cron/purgar/route.ts`** — no lo abrí en ninguno de los dos pases.
- **Las funciones plpgsql** (`try_lock_viaje`, `unlock_viaje`,
  `guardar_liquidacion_tx`, `intake_delta`): caja negra; son del auditor de modelo
  de datos. La afirmación de que `unlock_viaje` borra sin token de dueño la tomé
  del comentario de `startup.ts:70-72`, no del SQL.
- **Ninguna ruta ejercitada contra una base o un Meta reales.**
