# Backend y API — auditoría 23

**Nota: 7/10** (antes 7). Razón del movimiento: **ninguna de las tres, y lo digo
así porque es el resultado honesto**. Los dos platillos se cancelan y la nota se
queda: por un lado *se atacó y subió* — verifiqué los tres ALTO de la 22 y los
tres están cerrados de verdad (`pdf.ts:130`, `tools.ts:342-343`,
`export/liquidaciones/route.ts:167-169`), con prueba cada uno. Por el otro,
*deuda que cobró factura en menos de 24 h*: **dos de los tres hallazgos ALTO de
hoy los introdujeron esos mismos arreglos de ayer**, viven en código sin una
sola prueba, y son de la misma familia que cerraron (el papel del cierre y el
mensaje al chofer). El ancla de 8 pide «cada camino que toca dinero tiene prueba
propia»: la recuperación de cierre de `processor.ts:3473-3486` es un camino de
cierre irreversible y tiene **cero** pruebas. No llega a 8. No baja a 6 porque
el núcleo (mutex, lease, idempotencia de `/v1`, keyset del export, CU003, RPC
del pago) sigue probado y lo pude nombrar archivo por archivo.

El riesgo mayor del rubro hoy: **la recuperación del «cierre que sí ocurrió»
—el arreglo estrella de la 22— reconstruye el cierre a medias: le devuelve al
chofer las cifras correctas y le niega el PDF que SÍ existe en el bucket, con
dos `logger.error` falsos encima.** Se arregló decir la verdad y se rompió
entregar el papel.

## Verificación de los tres ALTO de la 22 (lo primero que hice)

| Hallazgo 22 | Estado | Dónde lo comprobé |
|---|---|---|
| BE-1 — saneador de PDF deja pasar C1 | **CERRADO** | `src/lib/likida/liquidacion/pdf.ts:130` añade un `.replace(…, '?')` sobre la banda C1 (`U+007F`–`U+009F`) **antes** del rango permisivo `[ -ÿ]`. Prueba nueva: `src/lib/likida/liquidacion/pdf_controles_c1.test.ts`. |
| BE-2 — `generarPdfs` no reinicia rutas | **CERRADO** | `src/lib/likida/tools.ts:342-343` (`pdfPath = undefined; pdfOperadorPath = undefined;`) es lo primero de la función, antes del `try`. La reimpresión de CU003 (`tools.ts:401-402`) ya no puede archivar la ruta vieja. |
| BE-3 — export cierra limpio al agotar 100 páginas | **CERRADO** | `src/app/api/export/liquidaciones/route.ts:167-169`: `if (esperadas !== null && leidas < esperadas) throw new LecturaIncompleta(...)` después del `for`, antes de `controlador.close()`. El stream aborta y el navegador marca la descarga como fallida. |

Ninguno es REINCIDENTE. Eso es lo que sostiene el 7; lo que sigue es lo que
impide el 8.

## Hallazgos

### [ALTO] La recuperación AGEN-C1 arma un `ToolCallRecord` sintético con el campo equivocado: el chofer recibe «no pude generarte el PDF» sobre un PDF que sí está en Storage, y se disparan dos `logger.error` falsos

`src/lib/likida/processor.ts:3478-3481` (el registro sintético) ·
`processor.ts:3737-3738` y `:3748-3751` (los tres consumidores) ·
`processor.ts:3862-3871` (el aviso al jefe)

El arreglo AGEN-C1 de la 22 le pregunta a la base si el cierre ocurrió y, si
ocurrió, fabrica esto:

```ts
cierreParcial = {
  toolName: 'guardar_liquidacion',
  result: { liquidacion_id: liq.id, pdf_url: liq.pdfUrl },   // ← processor.ts:3480
} as ToolCallRecord;
```

`pdf_url` **no lo lee nadie**. Lo verifiqué con grep sobre todo `src/`: los
únicos consumidores de esa clave son `api/export/pdf/[id]/route.ts:86-97` y
`repo.ts:1026` (columna de la base), nunca el resultado de una tool. Los tres
campos que el bloque `if (closed)` sí lee —`pdf_generado`,
`pdf_contralor_generado`, `liquidacion_id`— **no salen del registro sintético**,
porque `:3488` hace `agentTools = parcial!` y el `find` de `:3737` exige
`&& !t.error`: la única entrada de `guardar_liquidacion` que hay en `parcial` es
la que traía `error: 'Timeout'`. `guardado` queda `undefined`.

Escenario, con valores (es el escenario que el propio comentario de
`processor.ts:3455-3462` describe):

1. El chofer escribe «listo» del viaje V-9. `guardar_liquidacion` cuadra 6
   comprobantes por $6,200 contra $6,000 de anticipo, `diferencia = −$200`.
2. `generarPdfs` sube los dos ejemplares a `t-1/v-9.pdf` y
   `t-1/v-9-operador.pdf`; `guardar_liquidacion_tx` commitea con
   `pdf_url = 't-1/v-9.pdf'`. El viaje queda `liquidado` (irreversible por los
   triggers 0036/0037).
3. El reloj del agente venció a mitad de las subidas: `raceAbort` ya devolvió
   `{success:false, error:'Timeout'}` y `runAgent` lanzó `PartialExecutionError`.
4. `getLiquidacionDeViaje('t-1','v-9')` devuelve `{ id:'L-77', pdfUrl:'t-1/v-9.pdf' }`
   → `logger.warn('agent.cierre_commiteado_tras_abortar')`, `closed = true`.
5. `processor.ts:3737`: `guardado === undefined`.
   → `pdfGenerado = false`, `pdfContralorGenerado = false`.
6. `:3751` escribe `logger.error('pdf.contralor_no_generado', { liqId: undefined })`
   — **el ejemplar del contralor existe** (`pdf_url` no es NULL, y el id estaba
   ahí, en `cierreParcial.result.liquidacion_id`, sin usarse).
7. `:3754` `throw new Error('la tool reportó pdf_generado=false')` → el `catch`
   de `:3811-3819` escribe `logger.error('pdf.no_entregado')` y le dice al chofer:
   *«Tu liquidación ya quedó cerrada ✅, pero no pude generarte el PDF»* — sobre
   `t-1/v-9-operador.pdf`, que está en el bucket y que `createSignedUrl` habría
   firmado sin problema. **La ruta es determinística**
   (`${tenantId}/${viajeId}-operador.pdf`), no hacía falta ningún dato extra.
8. `:3862-3871`: como `pdfContralorGenerado` es `false`, `urlPdfJefe` se queda
   en `null` y `avisarCierreAlJefe` sale **sin adjunto**. El jefe recibe un
   texto pelón de un cierre cuyo PDF completo existe.

Consecuencia: el chofer se queda sin su comprobante en el único canal que
tiene, y se le manda a pedírselo al contralor por un papel que él mismo ya podía
recibir. El jefe pierde el ejemplar completo. Y operaciones recibe dos errores
de nivel `error` (`pdf.contralor_no_generado` con `liqId: undefined`,
`pdf.no_entregado`) sobre un cierre **sano** — que es la clase de ruido que la
propia 22 acaba de gastar un commit entero en quitar del watchdog.

Prueba que lo cubra: **ninguna.** `src/lib/likida/processor_cierre_parcial.test.ts`
cubre solo el camino de la auditoría 21 — su fixture `cierreParcial()` (`:142-147`)
mete un `guardar_liquidacion` **exitoso** en `partialToolCalls`, con
`pdf_generado: true, pdf_contralor_generado: true`, así que nunca entra al `if`
de `:3473`. Encima su mock de `@/lib/likida/repo` (`:79-97`) **ni siquiera
exporta `getLiquidacionDeViaje`**: el camino nuevo es literalmente inejecutable
en esa suite. `src/lib/likida/agentico_aud22.test.ts` prueba AGEN-A1 (los
márgenes), no esto. Corrí los tres archivos que sí tocan la zona: 48 pruebas
verdes, ninguna pisa esta rama.

Causa raíz probable: el registro sintético se armó con el vocabulario de la
tabla (`pdf_url`) en vez del contrato del resultado de la tool
(`pdf_generado` / `pdf_contralor_generado`), y `agentTools = parcial` reintroduce
el registro con `error` que el `find` de abajo descarta.

### [ALTO] `cerrarRafagasPorCorte` cierra las libretas de TODOS los choferes del proceso, no la del mensaje que se quedó sin tiempo: se manda un resumen prematuro y se pierden las incidencias de las fotos en vuelo

`src/lib/likida/processor.ts:919-931` (la función) · `processor.ts:961` (la
llamada) · `src/lib/likida/intake/rafaga.ts:160-162` (`bandejasAbiertas`)

`bandejasAbiertas()` devuelve el `Map` de módulo **entero** —una entrada por
viaje, de cualquier chofer y cualquier flota— y `cerrarRafagasPorCorte` le hace
`cerrarRafaga(viajeId)` (que **borra** la entrada) a todas. Se llama en
`processInbound:961`, o sea en la rama `sin_tiempo` de **un** mensaje.

Y las cadenas de choferes distintos corren **concurrentemente en el mismo
proceso**: `src/app/api/webhook/whatsapp/route.ts:347` es
`conPool([...porChofer.values()], MAX_EN_PARALELO /* = 5 */, …)` y
`src/app/api/cron/wa-pendientes/drenado.ts:85` hace lo mismo con
`ANCHO_POOL = 5`. Además el reloj es **compartido**
(`inicioInvocacionMs: inicioInvocacion` en `route.ts:372` y `drenado.ts:111`),
así que cuando el presupuesto se agota, se agota para las cinco cadenas a la vez
— pero las que ya pasaron el `alcanza()` siguen corriendo 8-15 s más.

Escenario, con valores:

1. Un POST de Meta trae fotos de dos choferes. Cadena A = chofer A (viaje V-100,
   6 fotos); cadena B = chofer B (viaje V-200, 2 fotos). El pool corre las dos.
2. Cadena A va en su foto 4. `anotarFoto(V-100, …, '5219991111111')`
   (`processor.ts:1795`) ya la contó: `vistas = 4`. Las fotos 2 y 3 salieron
   ilegibles → dos `anotarIncidencia(V-100, {tipo:'ilegible'})`
   (`processor.ts:2009/2020`). El OCR de la foto 4 está en vuelo.
3. Cadena B arranca su segunda foto. El reloj compartido ya no alcanza
   `COSTO_MINIMO_TURNO_MS` → `processInbound` entra al `sin_tiempo` de `:948`
   y llama `cerrarRafagasPorCorte()`.
4. El bucle de `:920` toma **V-100** (no es suyo), lo borra del Map, y le manda
   al chofer A: *«De tus 4 fotos, 2 no las pude leer 🔍 … Reenvíamelas con
   buena luz»*.
5. La foto 4 de A termina, resulta ilegible, y `anotarIncidencia(V-100, …)` cae
   en `abrir(V-100)`, que **recrea la bandeja con `vistas: 0`**
   (`rafaga.ts:107-121`). Las fotos 5 y 6 la suben a `vistas: 2`, con 1
   incidencia más.
6. La última foto de A cierra por el camino normal
   (`processor.ts:2538`, `ultima ? cerrarRafaga(viajeId) : null`) y le manda un
   **segundo** mensaje: *«De tus 2 fotos, 1 no la pude leer»*.

Consecuencia: el chofer A recibe dos resúmenes contradictorios de una sola
ráfaga de 6 fotos, y **ninguno de los dos dice 6**. Es exactamente la cifra
inventada que el docstring de `rafaga.ts:129-133` declara como la línea que este
repo no cruza («el resumen diría "de tus 9 fotos" a quien mandó tres. Una cifra
inventada, que es la regla que no se rompe en este repo»). Peor: si el corte cae
entre el `anotarFoto` y el `anotarIncidencia` de la misma foto, esa incidencia
queda en una bandeja recién creada con `vistas = 0`, y un segundo corte la tira
sin decir nada — `cerrarRafagasPorCorte:922` hace `continue` cuando
`b.vistas === 0`.

Prueba que lo cubra: **ninguna.** `bandejasAbiertas` no aparece en ningún
`*.test.ts` (grep sobre todo `src/`), y ni `src/lib/likida/intake/rafaga.test.ts`
ni `src/lib/likida/rafaga_consolidada.test.ts` mencionan `sin_tiempo` ni el
corte.

Causa raíz probable: la libreta se indexa por `viajeId` y la función de corte no
recibe (ni filtra por) el viaje del mensaje que se quedó sin presupuesto, así
que «cerrar lo que haya» significa «cerrar lo de todos».

### [ALTO] `cancelarFactura` cuenta los pagos en una consulta y cancela en otra: un abono parcial que entra en medio deja una factura cancelada CON dinero cobrado encima — el estado que el propio mensaje declara imposible

`src/lib/likida/facturacion_escritura.ts:646-657`

Son dos viajes a la base sin nada que los serialice:

```ts
const { count } = await …from('pago_recibido').select('id',{count:'exact',head:true})
  .eq('factura_id', facturaId).eq('tenant_id', tenantId);       // :646-648
if ((count ?? 0) > 0) throw new DatoInvalido('…tiene pagos registrados…');  // :650
…from('factura_emitida').update({ estatus:'cancelada' })
  .eq('id',…).eq('tenant_id',…).in('estatus',['borrador','emitida'])        // :654-657
```

El `.in('estatus', ['borrador','emitida'])` **no ataja** un abono parcial:
`registrar_pago_tx` (0159/0237) solo escribe `pagada` cuando la suma cubre el
total, así que un pago parcial deja la factura en `emitida` y el UPDATE la
encuentra.

Escenario, con valores:

1. Factura F-100, `total = $34,800.00`, `estatus = 'emitida'`, cero pagos.
2. El contralor abre la ficha y pulsa **Cancelar**
   (`src/app/dashboard/facturacion/page.tsx:185`). `cancelarFactura` corre
   `:646` y lee `count = 0`.
3. En esa ventana, el contador (otra sesión, u otra pestaña del mismo contralor
   — el comentario de `registrarPago:583-590` admite literalmente el escenario
   de «dos pestañas abiertas») concilia la propuesta del portal:
   `conciliarPropuesta → registrarPago → registrar_pago_tx` toma la factura
   `for update`, inserta `pago_recibido` de **$10,000.00**, ve saldo $24,800 y
   deja `estatus = 'emitida'`. Commit.
4. `cancelarFactura` sigue en `:654`. El UPDATE espera el lock de fila, lo
   obtiene, re-evalúa el WHERE contra la versión nueva: `estatus` sigue siendo
   `'emitida'` → **cancela**. `data.length === 1`, ningún error.
5. Queda F-100 `cancelada` con un `pago_recibido` de $10,000 apuntándole, y la
   vista `factura_saldo` (0049:126) —que calcula `total − pagos` sin mirar el
   estatus— la reporta con saldo $24,800.

Consecuencia: el contralor tiene $10,000 cobrados contra un CFDI que ante el SAT
ya no existe, que es palabra por palabra lo que el mensaje de `:651` promete
impedir («cancelarla de un clic dejaría cobros contra nada»). Además queda una
liga de pago revocada (`:663-667`) sobre dinero ya conciliado, y la cartera del
cliente sale mal por $10,000. No hay ninguna restricción ni trigger en la base
que lo impida: revisé `0049`, `0159` y `0237` — el único candado sobre la pareja
factura/pago es el de sentido contrario (`registrar_pago_tx` rechaza abonos
sobre `cancelada`, `0159:113-115` y `0237:193-195`).

Prueba que lo cubra: **ninguna.** `src/lib/likida/facturacion_escritura_cableado.test.ts:217-236`
prueba las dos ramas **secuenciales** («con un pago encima NO cancela» y «sin
pagos cancela»); no existe ningún caso que intercale una escritura entre `:648`
y `:654`.

Causa raíz probable: el resto de este archivo mueve la decisión de dinero
adentro de una transacción (`registrar_pago_tx`) precisamente por este motivo, y
`cancelarFactura` se quedó con el patrón `select`-luego-`update` que DAT-05 ya
retiró de su hermana.

### [MEDIO] El arreglo DATOS-1 amplió la LECTURA de `loadConversation` a las variantes del teléfono y dejó la RELECTURA y el nombre del índice en la forma vieja: la carrera del insert deja de recuperarse y lanza

`src/lib/likida/conv.ts:344` (la lectura, ya con variantes) · `conv.ts:379` (el
nombre del índice) · `conv.ts:387` (la relectura, todavía exacta)

La 22 cambió `:344` a `.in('telefono', variantesTelefono(telefono))` y creó el
índice `uq_wa_conversacion_tenant_telefono_norm` (mig. 0274). Pero el bloque de
recuperación de abajo no se movió:

- `:379` — `if (errInsert && !violaIndice(errInsert, 'wa_conversacion_tenant_tel_uidx')) throw …`
  nombra **solo el índice viejo** (0005, sobre el texto crudo). `violaIndice`
  hace `includes()` sobre `message`/`details`
  (`src/lib/likida/pg_errores.ts:44`), y
  `'uq_wa_conversacion_tenant_telefono_norm'` no contiene esa subcadena. Un
  choque contra el índice NUEVO —el que la 0274 creó exactamente para atrapar
  las dos formas del mismo número— se clasifica como «un bug distinto» y se
  lanza.
- `:387` — la relectura sigue siendo `.eq('telefono', telefono)`, igualdad
  exacta. Aunque llegara ahí, no puede encontrar a la ganadora si ésta se
  insertó con la otra forma del número: es el mismo defecto que `:344` acaba de
  arreglar, doce líneas más abajo.

Escenario, con valores: dos invocaciones concurrentes para el mismo chofer con
distinta forma del `wa_id` —una del webhook en vivo y otra del drenado del cron,
que se solapan por diseño (`drenado.ts:85` y `route.ts:347` corren pools de 5)—.
La invocación A inserta `telefono = '5219993700779'` y commitea. La invocación B
traía `'529993700779'`, no encontró fila en `:344` (A todavía no había
commiteado), e inserta: el crudo difiere, así que **solo** viola
`uq_wa_conversacion_tenant_telefono_norm` (ambos normalizan a `529993700779`).
`:379` no reconoce el nombre → `throw new ConsultaFallida` → el `catch` general
de `procesarTurno:3894-3932` suelta el claim, `processInbound` devuelve
`'reintentable'` y el chofer recibe *«No pude consultar tus datos en este
momento 😕»* aunque su conversación existe y está sana.

Consecuencia: un turno perdido y un mensaje de error innecesario al chofer.
**No lo subo a ALTO porque falla cerrado y se cura solo**: la fila no se sella,
el cron la vuelve a tomar y en el reintento `:344` sí la encuentra. Lo que se
pierde es la recuperación que `conv.ts:353-372` documenta como imprescindible, y
el rastro (`conv.carrera_insert`, `:398`) que permitiría medir la carrera.

Prueba que lo cubra: `src/lib/likida/conv_carrera_insert.test.ts` existe y pasa,
pero su fixture de error (`:51-52`) es literalmente
`'…violates unique constraint "wa_conversacion_tenant_tel_uidx"'` con
`Key (tenant_id, telefono)` — o sea, **solo el índice viejo**. No hay ningún
caso con el nombre del índice de la 0274.

Causa raíz probable: el arreglo tocó la consulta que motivó el hallazgo y no
recorrió las otras dos apariciones de la misma suposición en la misma función.

### [BAJO] `/api/health` ahora contesta `200 { ok: true }` con un cron en `fallo`, y el contrato escrito en la cabecera del propio archivo sigue diciendo lo contrario

`src/app/api/health/route.ts:114` y `:150-153` (el código nuevo) contra
`:32-33` y `:47-48` (la cabecera, sin tocar)

OP-C1 introdujo el tercer estado `config_ausente` y lo excluyó del status
global: `status` solo es `degraded` si `cronCheck` es `'degraded'` o
`'unknown'`. La cabecera del mismo archivo sigue afirmando dos cosas que ya no
son ciertas:

- `:32-33` — «un latido no sano (`fallo`/`parcial`/`saltado`) **SIEMPRE** degrada
  el status público a 503 — eso no cambia».
- `:47-48` — «Status 200 solo cuando TODO lo medido está bien».

Escenario, con valores: `descarga-sat` late con
`estado='fallo'` y `detalle.configAusente = true`. `noSanos = ['descarga-sat']`,
`configAusente = ['descarga-sat']`, `regresiones = []` → `:114` deja
`cronCheck = 'config_ausente'` → `:150-153` da `status = 'ok'` →
`NextResponse.json(cuerpo, { status: 200 })`. Un UptimeRobot cableado según el
contrato documentado —«200 = todo bien»— se queda verde mientras la descarga de
CFDI del SAT lleva días sin correr.

Consecuencia: quien conectó el monitor externo leyendo esa cabecera tiene un
detector que ya no le va a avisar de esa clase de hueco, y no hay nada en el
archivo que se lo diga; el único aviso vive en `alertarHuecoConfiguracion`
(correo, piso de una semana). Para el equipo que mantiene esto, la contradicción
dentro del mismo archivo es la trampa: el siguiente que lea la cabecera va a
razonar con un contrato que el código ya no cumple.

Causa raíz probable: el arreglo cambió la semántica del status y actualizó el
comentario del punto de decisión (`:145-149`) sin volver al bloque de contrato
de arriba, que es el que se lee primero.

## Lo que revisé y está bien

Concurrencia, con la prueba que la cubre **nombrada** (es el sesgo que este
rubro me pide corregir: leer no es verificar). Marco con ✗ los caminos que abrí
y **no** tienen prueba, porque callarlo sería la mentira que la nota compra.

- **Reinicio de rutas de PDF en la reimpresión CU003** — `src/lib/likida/tools.ts:342-343`
  dentro de `generarPdfs`, antes del `try`. El BE-2 de la 22 quedó bien puesto:
  el `catch` de `:373` ya no puede dejar la ruta de la corrida anterior en pie.
  Cubierto por `src/lib/likida/tools_cierre_conteo.test.ts` para el mecanismo del
  reintento; ✗ el caso «la segunda impresión truena» sigue sin fixture propio,
  pero ya no puede archivar el papel viejo (el peor efecto era ése).
- **Saneador de PDF** — `src/lib/likida/liquidacion/pdf.ts:130`. La banda C1
  cae antes del rango permisivo. Cubierto por
  `src/lib/likida/liquidacion/pdf_controles_c1.test.ts`.
- **Export de liquidaciones, agotamiento de páginas** —
  `src/app/api/export/liquidaciones/route.ts:167-169`. El `throw` de salida está
  y el `controlador.error(e)` del `catch` (`:177`) aborta la descarga sobre el
  200 ya enviado. El keyset `(created_at, id)` de `:98-120` sigue intacto, con
  su prueba de fila concurrente en `src/app/api/export/rutas_export.test.ts:329`.
- **Lease + fencing del claim de mensaje** — `conv.ts:482/520/538` contra las
  RPC de la 0187. Cubierto por `src/lib/likida/conv_claim_lease.test.ts` y
  `src/lib/likida/wa_pendientes_leases.test.ts`.
- **Mutex del viaje** — `conv.ts:725` `intentarLockViaje`; el llamador
  (`processor.ts:3254-3277`) distingue `ocupado` de `indeterminado`, le dice al
  chofer cosas distintas, y suelta el claim (`soltarClaim()`) para que el cron
  reintente. Cubierto por `src/lib/likida/conv_lock.test.ts` y
  `src/lib/likida/processor_lock.test.ts`.
- **Doble «listo»** — `processor.ts:3283-3286`: tras tomar el lock re-verifica
  `getOpenViaje`. El `return` sin `soltarClaim()` es correcto aquí: el mensaje
  SÍ se atendió (el chofer recibió respuesta) y debe sellarse.
- **Idempotencia de `/v1`** — `src/app/api/v1/_escritura.ts:694-780`: memoria →
  `api_idempotencia` → llave natural, con el unique de la base como único
  árbitro (`:761-772`), relectura tras el 23505 y 409 cuando el contenido
  difiere. La lectura durable degrada a propósito sin abortar (`:722-728`) y eso
  es correcto: no puede duplicar nada. Cubierto por
  `src/app/api/v1/_escritura.test.ts`.
- **RPC del pago** — `facturacion_escritura.ts:582-600` (`registrar_pago_tx`),
  con la idempotencia de la propuesta en el índice parcial de la 0237 y
  `AbonoYaRegistrado` en el 23505. La decisión de dinero está dentro de la
  transacción, con la factura `for update`. Cubierto por
  `src/lib/likida/facturacion_escritura_cableado.test.ts` y
  `src/lib/likida/portal_pago_escritura.test.ts` (48 pruebas verdes al correrlo).
- **`crearFactura` y su compensación** — `facturacion_escritura.ts:424-437`: si
  las ligas a viajes fallan, la factura se **cancela** (no se borra) y el fallo
  se propaga completo; si ni cancelar se pudo, `logger.error('facturacion.alta_a_medias')`
  trae `facturaId`. Es un `catch` que sí nombra la fila. Cubierto por
  `src/lib/likida/facturacion_compensacion.test.ts`.
- **`marcarEmitida`** — `:476-492`: el UPDATE va anclado a `.eq('estatus','borrador')`
  y comprueba filas afectadas; marcar dos veces toca cero filas y lo dice. La
  serie viaja con el folio o no viaja (`:474`), que es el detalle que evita
  «serie B, folio 1» sobre un CFDI timbrado «A-1».
- **Ruta pública de pago** — `src/app/api/pago/registrar/route.ts`: tope de
  cuerpo, rate limit, honeypot, 503 (no 404) cuando la lectura no se pudo hacer
  (`:86-91`, `:99-104`), 409 explícito sobre factura cancelada (`:105-118`), y
  la puerta estructural: esta ruta **no puede** escribir en `pago_recibido`
  (`registrarPropuesta` va a otra tabla). Correcto.
- **Callback QStash de facturación** — `src/app/api/cron/facturar/cola/route.ts`:
  firma verificada antes de tocar nada (`:39-58`), kill switch con **200** y no
  5xx para que QStash no reintente lo apagado (`:70-79`), y re-lectura
  `.in(ids).is('cfdi_uuid', null)` antes de procesar (`:84-92`) con `ids` de a lo
  más `LOTE_POR_FLOTA = 20` — muy por debajo del recorte silencioso de 1,000 de
  PostgREST. Cubierto por `src/app/api/cron/facturar/cola/route.test.ts` y
  `guarda_doble_cfdi.test.ts`.
- **Export de póliza** — `src/app/api/export/poliza/route.ts:211-222`: la RPC
  `poliza_datos_tenant` (0272) devuelve **un** `jsonb`, no un `setof`, así que
  el recorte de 1,000 filas de PostgREST no aplica aquí; lo verifiqué en
  `supabase/migrations/0272_poliza_deducibilidad.sql:36` (`returns jsonb`). Lo
  descarto por escrito. Y `:227-266` arma TODAS las pólizas antes de escribir un
  byte: 409 con el desglose en vez de un archivo a medias.
- **Bus de workers** — `src/app/api/worker/bus/[accion]/route.ts:114-123`: el
  claim de orden va anclado a `.eq('estado','pendiente')` y devuelve
  `tomada: (data??[]).length === 1`. La atomicidad vive en el WHERE, como
  declara. El upsert de pieza (`:79-86`) no manda `estado`, así que no pisa el de
  una pieza aprobada. ✗ sin prueba, pero no toca dinero de flota.
- **Agente de cobranza** — `src/lib/likida/agentes/cobranza.ts:290-296` (el
  claim es el INSERT con `unique(viaje,tier)`, el perdedor sigue de largo),
  `:340-350` (un 429 de Meta **borra** el claim para que el tier no se queme) y
  `:245-255` (rescate de claims huérfanos > 1 h). Los cuatro `.then(({error}) =>
  …)` que no lanzan sí registran el error con el `viaje` concreto — es el patrón
  que este rubro persigue, bien puesto.
- **`proxy.ts`** (lo que en Next 16 sustituyó a `middleware.ts`; el archivo del
  rubro **ya no existe con ese nombre**): el gate falla cerrado (`:143-156`), las
  cabeceras se aplican en un solo lugar al final, y el redirect a /login arrastra
  las cookies que `setAll` escribió. Cubierto por `src/proxy.test.ts`.
- **`duplicados.ts`** — puro y sin I/O; su consumidor real es la RPC
  `anomalias_gasto_tenant` (0150) vía `analytics.ts:378-395`, que **lanza** ante
  error o forma inesperada en vez de devolver «0 anomalías». Correcto.
- **`pg_errores.ts`** — `violaIndice` exige `code === '23505'` antes de mirar el
  texto, así que un mensaje que mencione el índice por casualidad no puede
  tragarse un error real. Bien escrito; el problema del hallazgo 4 es **quién lo
  llama con qué nombre**, no la función.

## Lo que NO alcancé a revisar

- **`src/lib/mcp/oauth.ts` (536 líneas) y las tres rutas de `/api/mcp`.** Sigue
  sin abrir desde la 22: rotación/revocación de tokens y el flujo del código de
  autorización. Es el hueco más grande de este reporte.
- **`src/app/api/cron/facturar/route.ts` (1,258 líneas)**: leí el encolado por
  flota, `procesarLoteEnCola` hasta el reparto por portal y el corte por reloj.
  Las ~500 líneas de `finally` (avisos, medición por flota, latido) y
  `facturarLoteAlVuelo` quedaron sin abrir. Ahí vive un camino que emite CFDI.
- **`src/lib/likida/facturacion_escritura.ts` completo**: leí `crearFactura`,
  `marcarEmitida`, `registrarPago`, `cancelarFactura` y `evaluarAbono`. No leí
  el SQL de `registrar_pago_tx` línea por línea (me apoyé en el bloque 131 de
  `verificaciones.sql` que la 22 nombra), ni `portal_pago_escritura.ts` entero
  (~535 líneas; solo `conciliarPropuesta` de refilón).
- **`cron/asistencia`, `cron/escalar`, `cron/purgar`, `cron/runner`,
  `cron/portales-vivos`, `cron/wa-outbox`**: no los abrí. Sí abrí `cron/jornada`,
  `cron/facturar/cola` y `cron/wa-pendientes/drenado`.
- **`src/app/api/admin/*` (qa, mapa-prospectos, evals)** y `src/app/api/correo/`,
  `src/app/api/webhooks/`, `src/app/api/lead/`, `src/app/api/marketing/`.
- **Las ~2,900 líneas de `procesarTurno`**: recorrí los bloques del cierre
  (3340-3900), el intake de foto (1750-1800), el de XML (2700-2820) y el mutex.
  El resto lo miré por grep, no de corrido.
- **No corrí `npm test` completo ni `npx tsc --noEmit`**: la compuerta base de la
  ronda (MAPA.md) los reporta sobre este mismo commit. Sí corrí, dirigidos,
  `npx vitest run` sobre `processor_cierre_parcial.test.ts`,
  `conv_carrera_insert.test.ts` y `facturacion_escritura_cableado.test.ts`
  (48 pruebas, verdes) para confirmar que los tres huecos que reporto son huecos
  de **cobertura**, no pruebas rojas.
