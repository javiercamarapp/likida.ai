# Backend y API — auditoría 25

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda — el código
no cambió y la nota anterior estaba inflada**. Desde la 24 no entró ni un commit
sobre este rubro (`git log b8a1a3a..HEAD -- src/lib/likida/conv.ts
src/lib/likida/relojes_legales.ts src/app/api/cron/wa-outbox/route.ts` → solo
`b8a1a3a`), así que **los cinco hallazgos de la 24 siguen literalmente donde
estaban**: los verifiqué línea por línea y ninguno se tocó. Lo que baja la nota
no es eso —eso ya estaba descontado—, sino que al abrir el seam de la firma
humana (0299) por el lado que la 24 no abrió —el contable, no el PDF— aparece un
segundo camino por el que un ajuste del contralor **inventa una cifra fiscal o
tira el export del periodo entero**, y sigue sin haber una sola prueba del seam.
El único cambio del rubro en la ronda (`chat/tenant.ts`, commit `66339d5`) cierra
una rama y deja la gemela abierta, con un test que la deja escrita como
comportamiento correcto.

El riesgo mayor del rubro hoy: **la firma humana escribe `gasto.monto` y los
totales de la liquidación y no toca nada más — ni el PDF, ni `sub_total`, ni
`iva_acreditable`—, así que la corrección del contralor sale por tres puertas
distintas con tres cifras distintas**, y una de ellas es la póliza que su
contador importa a ContPAQi.

## Hallazgos

### [CRÍTICO] `revisar_liquidacion(… 'ajustar')` mueve el total y no el desglose: la póliza contable carga un «IVA/IEPS no acreditable» inventado, o el export del periodo entero se cae con 409
`supabase/migrations/0299_revision_liquidacion.sql:384-397` · `src/lib/likida/contabilidad/poliza.ts:203-259` · `src/app/api/export/poliza/route.ts:170,332-368` · `supabase/migrations/0281_poliza_v2_cubetas_sin_copias.sql:80-140`

`revisar_liquidacion` en la acción `ajustar` escribe exactamente tres cosas:
`update gasto set monto = v_nuevo` (`:384`), `total_comprobado = total_comprobado
+ delta` y `diferencia = diferencia − delta` (`:391-396`). **No toca
`gasto.sub_total`, ni `gasto.iva_traslado`, ni `gasto.ieps_traslado`, ni
`liquidacion.iva_acreditable`** (verificado:
`grep -c "sub_total\|iva_traslado\|ieps_traslado\|iva_acreditable"
0299_revision_liquidacion.sql` → **0**; `iva_acreditable` es columna almacenada
desde `0007_acreditamiento.sql:10`, no derivada). Tampoco hay guardia que impida ajustar un
comprobante respaldado por CFDI: los únicos rebotes son LR018 (mismo monto) y
LR019 (duplicado / monto_invalido, `0299:369-381`). Y la pantalla ofrece
**todos** los gastos con id, con o sin XML (`src/app/dashboard/[id]/page.tsx:280`).

La póliza deriva el comprobado de la identidad de la liquidación y la base de
los comprobantes:

- `comprobado = anticipo − diferencia` (`poliza.ts:205`) — **sí se mueve con el ajuste**;
- `subtotalDeclarado` = suma de `porConcepto[].subtotal` (`poliza.ts:203-204`),
  que viene de `montoBase = g.subTotal − g.descuento` (`route.ts:170`) y ese
  `subTotal` es `gasto.sub_total` crudo de la RPC (`0281:102` y `:122`) — **no se
  mueve**;
- `ivaAcreditable` = `l.iva_acreditable` (`0281:86`) — **no se mueve**.
- `impuestoNoAcreditado = comprobado + retenciones − subtotalDeclarado − ivaAcreditable` (`poliza.ts:230`).

Escenario con valores. Viaje V-119, anticipo $10,000. Dos comprobantes, los dos
con CFDI: diésel (`sub_total` 6,896.55, `iva_traslado` 1,103.45, `monto` 8,000) y
caseta (`sub_total` 1,724.14, `iva_traslado` 275.86, `monto` 2,000). Comprobado
10,000, diferencia 0. Hoy la póliza cuadra: 10,000 − 8,620.69 − 1,379.31 = 0.

- **Ajuste a la baja** (el contralor ve que el CFDI de diésel es el consumo del
  mes y el de este viaje era $800; firma «ajustar» 8,000 → 800): la RPC deja
  `total_comprobado` 2,800 y `diferencia` 7,200. `comprobado` = 2,800;
  `subtotalDeclarado` sigue 8,620.69 y `ivaAcreditable` sigue 1,379.31 →
  `impuestoNoAcreditado = −7,200` → `poliza.ts:249-259` empuja «la póliza no
  cuadra… revisar la liquidación a mano», la ruta lo mete a `bloqueos`
  (`route.ts:354`) y contesta **409 `polizas_incompletas` tirando el periodo
  ENTERO** (`route.ts:357-369`), sin decir en ninguna parte que la causa fue el
  ajuste que la propia app le ofreció.
- **Ajuste al alza** (el caso canónico del feature, WA-3: el OCR leyó $800 de un
  comprobante de $8,000 que sí trae CFDI): `impuestoNoAcreditado = +7,200` →
  `poliza.ts:239-248` **agrega un movimiento «IVA/IEPS no acreditable — viaje
  V-119» por $7,200** a la cuenta del catálogo, y el archivo ContPAQi sale 200.

Consecuencia: el contador de la flota importa un asiento con un impuesto de
$7,200 que no existe en ningún CFDI, o —en el otro sentido— no puede exportar el
mes completo y el mensaje le dice que el dato de origen está roto. Es la regla
«nunca inventar una cifra» rota en el artefacto que va al ERP del cliente, y es
exactamente la clase de falla que `0281:64-65` dice haber cerrado por
constraint («un XML con signo invertido daba… un IVA no acreditable inventado
que cuadraba»): el ajuste la reabre por otra puerta, esta vez con la firma de
una persona encima.

Causa raíz probable: la 0299 se escribió como «mover el total por delta, sin
re-cuadrar» (así lo dice su propio `comment on function`, `:445`) y el resto del
sistema fiscal no lee el total, lee el desglose por comprobante que quedó viejo.

Prueba que lo cubra: **ninguna**. `grep -rn "ajust" src/lib/likida/contabilidad/*.test.ts
src/app/api/export/poliza/*.test.ts` → 0 resultados; `revision.test.ts` no
menciona póliza, ni `sub_total`, ni `iva`.

### [CRÍTICO · REINCIDENTE de la 24] `revisar_liquidacion(… 'ajustar')` cambia el total y NO regenera el PDF: el papel del contralor se queda con la cifra vieja
`src/lib/likida/revision.ts:353-424` · `supabase/migrations/0299_revision_liquidacion.sql:384-397` · `src/app/api/export/pdf/[id]/route.ts:86-105`

Verificado de nuevo, tal cual la 24 lo dejó y **sin un solo commit encima**:
`grep -n -i pdf src/lib/likida/revision.ts` → **0 resultados**;
`grep -n -i pdf supabase/migrations/0299_revision_liquidacion.sql` → **0
resultados**. `revisarLiquidacion` solo tiene un efecto posterior al RPC y es el
`sendText` del camino `rechazar` (`revision.ts:404-422`). `/api/export/pdf/[id]`
sigue leyendo `liquidacion.pdf_url` y firmando el objeto que ya está en el bucket
(`route.ts:86-102`); no regenera nada.

Entra: ajuste de $800 → $8,000 sobre V-119. Sale mal: pantalla, `/v1/liquidaciones`
y el CSV fiscal dicen comprobado $8,000; el PDF que el contralor descarga es el
mismo archivo byte por byte y dice $800.

Consecuencia: el único documento que sale de Likida hacia un tercero contradice
al panel en la cifra que el contralor acaba de corregir y firmar.

Causa raíz probable: la 0299 es una transacción SQL y el PDF vive fuera de SQL
(lo sube `tools.ts` antes del RPC de cierre); nadie cerró el puente — ni
regenerando, ni invalidando `pdf_url`, ni rotulando el papel como superado.
`reabrir` sí lo contempla; `ajustar` no.

Prueba que lo cubra: **ninguna** (el grep de arriba es la prueba de que no la hay).

### [ALTO] Una factura de Stripe anulada ANTES de que su cobro se registrara no deja marca de orden: el `invoice.paid` que llega después la resucita como pagada
`src/lib/saas/suscripcion.ts:941-947` (con `:849-858`, `:896-898`, `:964-968`)

`cancelarFacturaDeStripe` sale por `return 'sin_factura'` en `:946` **antes** del
`sellarOrden` de `:967`. Es el único camino de salida de esa función que no
escribe en el ledger de orden que `aplicarFactura` consulta (`:850`).

Escenario con valores. Stripe entrega `invoice.paid` de `in_1XYZ` ($11,600 MXN,
`created` = 1756900000). El evento entra al webhook, `tenantDeCustomer(cus_A)`
devuelve `null` porque la suscripción que ata ese customer todavía no llegó, y
`route.ts:219-225` **lanza a propósito** para que Stripe reintente → 500. Stripe
reprograma el reintento (backoff de horas). En esa ventana Javier anula la
factura desde el panel de Stripe: llega `invoice.voided` (`created` =
1756903600), `cancelarFacturaDeStripe('in_1XYZ', '02', undefined, 1756903600)`,
no encuentra fila en `factura_saas` porque el `paid` nunca la creó → `logger.warn
('stripe.anulacion_sin_factura')`, `return 'sin_factura'` → el webhook sella el
evento y contesta 200. Después entra el reintento del `invoice.paid`: ahora el
customer sí resuelve, `aplicarFactura` llama `ordenAplicado('in_1XYZ','factura')`
→ **null**, porque nadie selló nada → el upsert escribe `estado='pagada'`,
`pagada_en` con el `paid_at` de Stripe y `monto` 11,600.

Sale mal: `factura_saas` afirma que una mensualidad anulada está pagada, y lo
afirma para siempre — no hay más eventos por venir. La cobranza y el ingreso de
Likida cuentan $11,600 que no existen, y si esa fila se timbra después, se emite
un CFDI de un cobro que se anuló. Es literalmente el estado que DAT-33 declaró
inaceptable («dinero devuelto, papel fiscal en pie»), reintroducido por el lado
del ORDEN en vez del lado del tipo de evento.

Consecuencia: Javier factura de más a su propio cliente y su reporte de ingresos
miente; el único rastro es un `logger.warn` que nadie lee.

Causa raíz probable: el sello de orden se trata como «efecto de haber cancelado»
en vez de «constancia de que este invoice ya recibió un evento anulatorio», así
que el camino en el que no hay nada que cancelar tampoco deja constancia.

Prueba que lo cubra: **ninguna**. `suscripcion_orden.test.ts` tiene cinco casos y
los cinco son de `aplicarSuscripcion` (`:81-128`); ninguno toca
`cancelarFacturaDeStripe`, y `stripe/webhook/route.test.ts:31` la mockea entera.

### [ALTO · REINCIDENTE de la 24] El fallback del mutex de viaje sigue cayendo por gravedad al `return 'obtenido'` cuando la segunda llamada también falla
`src/lib/likida/conv.ts:856-873`

Idéntico a como lo dejó la 24 (el archivo no se ha tocado desde `b8a1a3a`).
Releído completo: dentro de `if (rpcAusente(error))`, si `opts.token` está puesto
y el reintento de dos argumentos vuelve **con error**, se ejecuta `ultimoError =
viejo.error` (`:863`), la rama `if (!viejo.error)` de `:864` no entra, no hay
`continue`, y la ejecución cae al `logger.error('viaje.lock_rpc_ausente')` de
`:872` y **`return 'obtenido'`**.

Entra: la 0280 sin aplicar (la ventana que el comentario de `:851-855` dice
cubrir) más un `acotada` que se rinde a los 8 s en el reintento. Sale: el lock se
concede sobre una base que no contestó. El chofer manda «listo» dos veces con 3 s
de diferencia; los dos turnos reciben `'obtenido'`, los dos corren `runAgent`
completo y suben dos PDFs. El `unique(viaje_id)` frena la segunda fila, pero el
segundo ciclo de LLM ya se pagó y el operador recibe dos veces el cierre.

Consecuencia: es el fail-open que DAT-21 declaró inaceptable, vivo justo cuando
la infraestructura está peor; y el archivo afirma en prosa que ya no existe, así
que quien lo mantenga no va a buscar ahí.

Prueba que lo cubra: **ninguna**. `conv_lock_dueno_aud24.test.ts:69-88` prueba
fallback OK, fallback ocupado y sin token — no el cuarto caso, que es el único
que abre el mutex.

### [ALTO · REINCIDENTE de la 24] `flotaDeclaraHazmat` sigue leyendo sin mirar `error`, y sella el reloj legal para siempre
`src/lib/likida/relojes_legales.ts:337-345`

Sin cambios: `const { data } = await acotada(...)` en `:339-341`, sin `error`.
`acotada` reporta por valor, el `try/catch` de `:344` nunca dispara, y el flujo
llega a `hazmatDeclarado(null)` → `null`. Con una incidencia de tipo `siniestro`
sin CFDI emitido, `partesOperacion` y `partesDinero` quedan vacías y se escribe
`anotarEventoIncidencia(..., { aviso: 'sin_relojes_aplicables' })` (`:263-266`),
que el anti-join de `:208-213` descarta **para siempre**.

Entra: un blip de 8 s en la lectura de `tenant.perfil` durante la corrida del
cron. Sale: el jefe de flota nunca recibe el aviso de los plazos SICT/ASEA de un
siniestro con materiales peligrosos, y la bitácora afirma «sin relojes
aplicables», que es falso.

Consecuencia: un reloj legal apagado de forma irreversible por un parpadeo de
red, con evidencia escrita de que se decidió no avisar.

Prueba que lo cubra: no encontré ninguna que fuerce el `error` por valor en esa
función.

### [MEDIO] El fail-closed nuevo de `tenantEfectivoChat` cubre una rama y deja la gemela abierta — y el test la deja escrita como correcta
`src/app/api/dashboard/chat/tenant.ts:23-40` (con `:41-61` y `tenant.test.ts:51-55`)

El commit `66339d5` añadió el fail-closed **solo en el `else`** (`:49-59`: si el
tenant de la sesión/demo no existe o no se puede leer, `null`). La rama
`if (tenantPedido && sesion.rol === 'superadmin')` comprueba `error` (`:36-39`)
pero cuando `t` es `null` **se queda con `tenantId` y nunca comprueba que ese
tenant exista** (`:40`), que es precisamente lo que el `else` vino a arreglar.

Entra: Javier (superadmin, `sesion.tenantId = null` → `tenantId = tenantDemo()`)
abre un enlace guardado `/dashboard/chat?tenant=<uuid de una flota ya borrada>`
mientras `DEMO_TENANT_ID` apunta a la flota fantasma del 3-sep. La lectura de
`?tenant=` resuelve sin error y sin fila → se cae al demo **sin validarlo** →
devuelve `{tenantId: 'demo-fija'}` → `reservar_presupuesto_llm` truena por FK
violation en cada turno: exactamente los 12 `chat.analista.fallo` en 5 minutos
que el comentario de `:45-48` documenta como ya resueltos.

Consecuencia: el bug de producción que este commit dice cerrar sigue disparable
con un enlace viejo, en las cuatro rutas que comparten la función (`chat`,
`conversaciones`, `conversaciones/[id]`, `dashboard/ingesta`). Para el equipo, el
archivo afirma que la regla es una sola y no lo es.

Causa raíz probable: la validación se puso en la rama que falló en producción en
vez de al final, sobre el `tenantId` que de verdad se devuelve.

Prueba que lo cubra: la prueba **existe y fija el comportamiento malo**:
`tenant.test.ts:51-55` («un uuid que simplemente NO existe sigue cayendo al de la
sesión») afirma `{tenantId: 'demo-fija'}` sin comprobar que ese demo exista.

### [MEDIO] La póliza contable asienta liquidaciones que el contralor RECHAZÓ; el CSV de liquidaciones, no
`supabase/migrations/0281_poliza_v2_cubetas_sin_copias.sql:139-141` · `supabase/migrations/0299_revision_liquidacion.sql:405-415` · `src/app/api/export/liquidaciones/revision.test.ts:51-56`

`revisar_liquidacion(… 'rechazar')` **no borra la fila de `liquidacion`**: le pone
`revision='rechazada'` y devuelve el viaje a `en_cuadre` (`0299:406-415`). La fila
conserva `total_comprobado`, `diferencia` e `iva_acreditable` del cierre que se
rechazó. El `where` de `poliza_datos_tenant` filtra solo por tenant y rango de
fechas (`0281:139-141`) — **no mira `revision`**.

Entra: el contralor rechaza V-119 el día 12 («el ticket de diésel no es de este
viaje») y el contador exporta la póliza del 1 al 30 el día 13, antes de que el
chofer reponga el comprobante. Sale: el archivo ContPAQi lleva el asiento de un
viaje que no está liquidado, con las cifras que el contralor acaba de rechazar
por escrito.

Consecuencia: se asienta en la contabilidad del cliente un cierre que su propio
contralor invalidó. Y el rótulo miente por asimetría: `/api/export/liquidaciones`
sí excluye las rechazadas por omisión (probado en `revision.test.ts:51-56`), así
que las dos salidas de la misma liquidación no coinciden en qué cuenta.

Causa raíz probable: la 0299 añadió el estado `rechazada` y actualizó el filtro
del CSV, pero la RPC de la póliza es de la 0281 y nadie volvió a ella.

Prueba que lo cubra: ninguna prueba de póliza menciona `revision`.

### [MEDIO] El error del segundo write de `aplicarSuscripcion` se degrada a `warn` y el evento se sella igual: una flota que canceló se queda con el plan pagado para siempre
`src/lib/saas/suscripcion.ts:712-713` (con `route.ts:106-108`)

`aplicarSuscripcion` hace dos escrituras: la fila de `suscripcion` (cuyo error sí
lanza, `:685`/`:693`) y `tenant.plan`, que **solo se loguea**: `const t = await
admin.from('tenant').update({ plan }).eq('id', ...); if (t.error)
logger.warn('stripe.tenant_plan', ...)`. La función devuelve normal, el webhook
llama `sellarEventoAplicado` y contesta 200 (`route.ts:106-108`), así que Stripe
no reintenta nunca.

Entra: `customer.subscription.deleted` de «Fletes del Golfo» (plan `empresa`);
`suscripcion.estado` pasa a `cancelada`, `otraSuscripcionViva` resuelve `demo`, y
el `update` de `tenant` se topa con un `57014` (statement timeout) del pooler.
Sale: `tenant.plan` se queda en `'empresa'` — el estado que el propio comentario
de `:700-704` describe como el bug DAT-40 («una flota que canceló su plan Empresa
quedaba con `tenant.plan='empresa'` para siempre») — y no hay reconciliador:
`grep -rn "from('tenant').update({ plan" src/` devuelve solo esta línea.

Consecuencia: la flota que dejó de pagar sigue viéndose y comportándose como plan
Empresa en las pantallas que leen `tenant.plan` sin consultar `suscripcion`, y el
reporte de plan por flota de `/admin` cuenta un cliente pagado que no lo es. No
mueve una cifra fiscal, por eso no es ALTO; pero es una falla silenciosa que solo
un humano puede descubrir.

Causa raíz probable: se trató `tenant.plan` como caché conveniente y no como la
segunda mitad de una escritura que tiene que ser atómica o reintentable.

### [MEDIO · REINCIDENTE de la 24] Un 200 de Meta sin `wamid` se trata como envío fallido y el mensaje se reencola
`src/app/api/cron/wa-outbox/route.ts:116-118`

Sin cambios: `if (!id) { fallidas++; await finalizarYAvisarSiMurio(s, undefined,
'Meta aceptó sin wamid'); return; }`. Con `p_message_id` nulo,
`finalizar_wa_outbox` (`0180:112-115`) devuelve la fila a `pending` con
`proximo_intento_en = now() + 15·2^intentos`. Entra: 200 con `messages: []` sobre
«Tu liquidación del viaje V-119 se regresó a revisión». Sale: el chofer lo recibe
otra vez a los 30 s, a los 60, hasta agotar los 8 intentos, porque el primero sí
salió. El archivo ya razonó la ambigüedad para el `catch` de red
(`wa_outbox.ts:30-57`) y no la aplicó a la rama gemela, que es **menos** ambigua.

### [BAJO · REINCIDENTE de la 24] `marcarExportadas` cuenta los ids que mandó, no las filas que marcó
`src/lib/likida/proveedores.ts:519`

Sin cambios: `marcadas += tanda.length` con un `update` que lleva
`.eq('estado','aprobada').is('exportada_en', null)` y sin `.select()`. Entra: 400
ids de los que 120 ya tenían `exportada_en` → sale `{marcadas: 400}` habiendo
marcado 280. `tareasHechas` y el «no se pudo marcar N de M» del aviso dentro del
CSV reportan una cifra que no midió nada.

### [BAJO · REINCIDENTE de la 24] La sonda de OCR no registra costo cuando aborta, y el tope diario no lo ve
`src/app/api/dashboard/ingesta/route.ts:97-127`

Sin cambios: `extraerComprobante` corre con `AbortSignal.timeout(45_000)` y el
`catch` de `:124-127` contesta 502 sin llamar `registrarCosto`, así que
`gastoSondaHoyUsd` (`:87-94`) no ve un gasto que ya ocurrió.
`processor.ts:4195-4205` sí registra el costo del `PartialExecutionError` antes de
decidir nada; esta ruta no.

### [BAJO] El canje del código OAuth quema el código si `emitirPar` falla, y el reintento del cliente sale como reuso
`src/lib/mcp/oauth.ts:351-374` (contra la compensación de `:468` en adelante)

El arreglo BE-18 de la 24 devolvió a la vida el refresco cuando `emitirPar` falla
(`refrescarTokens`, `:468` en adelante). El canje del código **no** tiene esa
compensación: se marca `usado_en` en `:351-356` y si `emitirPar` falla por un
parpadeo (`:289-292` devuelve `no_disponible`), el cliente recibe 503 —que el
RFC le dice que puede reintentar— y su reintento con el mismo código entra por
`:334-337`, `revocarFamilia('codigo_reusado')` e `invalid_grant`.

Entra: `POST /api/mcp/oauth/token` con `grant_type=authorization_code` durante un
timeout del insert. Sale: el contralor tiene que rehacer el flujo de autorización
completo desde su cliente MCP en vez de reintentar. No mueve dinero y el usuario
puede recuperarse solo; por eso BAJO. Pero es la misma asimetría que BE-18
nombró, en la mitad del archivo que no se revisó.

## Lo que revisé y está bien

**Abiertos de la 24 verificados uno por uno:** los cinco siguen ahí sin tocar
(arriba, marcados REINCIDENTE). No encontré ninguno cerrado, y lo digo explícito
porque es lo que impide subir la nota.

**El webhook de Stripe, salvo el hueco de orden que reporté:**
- La puerta: 503 sin secreto (`route.ts:53-56`), doble tope de cuerpo declarado y
  real (`:58-60`), HMAC sobre el crudo antes de cualquier `JSON.parse` (`:64-68`),
  y `livemode` comprobado con 400 y **sin marcar el evento** (`:88-95`) para que
  quede visible como entrega fallida en el panel de Stripe.
- El ciclo de vida del evento: `marcarEvento` gana la carrera con el insert, no
  con un select, y distingue `aplicada` (200 repetido) de `pendiente`
  (re-aplicar) (`suscripcion.ts:563-584`); `sellarEventoAplicado` no lanza a
  propósito, con la fila sin sello como rastro (`:592-596`).
- La distinción que sostiene el `switch` (`route.ts:120-131`) es real: los cuatro
  casos «nos concierne y falló» **lanzan** en vez de `return`
  (`:145-146`, `:167-168`, `:178-179`, `:223-224`), que es lo que hace que Stripe
  reintente en vez de perder el cobro.
- `aplicarSuscripcion` sella el orden **al final** (`:721-723`) y `aplicarFactura`
  **después** del upsert (`:896-898`), los dos con el razonamiento escrito de por
  qué no antes. `estadoDesdeStripe` manda `incomplete` a `prueba` y no a activa
  (`:610-613`).
- `aplicarFactura` fija `metodo_cobro: 'stripe'` para no chocar con el índice
  parcial de transferencia (`:878-887`), y el `onConflict: 'stripe_invoice_id'`
  tiene su índice único real (`0052:106`).

**MCP OAuth (que la 24 no alcanzó):**
- `canjearCodigo`: prefijo, lectura por hash, reuso → `revocarFamilia`, cliente,
  expiración, `redirect_uri`, longitud del verifier y PKCE S256, y **la marca de
  usado con la condición en la base** (`.is('usado_en', null).select('id')`,
  `:351-356`) — la carrera la resuelve Postgres, no un select previo
  (`oauth.ts:317-364`).
- `refrescarTokens`: rotación con detección de reuso (`:399-402`), revalidación
  del usuario contra `mcp_oauth_usuario_vigente` antes de rotar (`:415-427`), y
  la misma condición en la base para la rotación (`:430-445`).
- `token/route.ts`: `503`/`server_error` para «la base no contestó» y jamás
  `invalid_grant` (`:32`), tope de cuerpo (`:57`), tasa por IP (`:50-52`),
  `Cache-Control: no-store` (`:44`).

**`/api/correo/entrante` (BE-21, que la 24 no alcanzó):** el orden firma → tenant
por DESTINATARIO → idempotencia está como lo describe su encabezado
(`:99-115`, `:139-165`, `:220-236`); el claim durable con lease (`reclamar_correo`,
90 s) distingue `applied` de `busy` y contesta 503 en el segundo (`:228-235`); la
llave del canal y el kill switch se comprueban **antes** de consumir el correo
(`:198-212`); y el presupuesto de tiempo reserva 3 s para poder liberar el claim
y contestar 503 (`:284-287`), con las descargas caídas devolviendo el correo a la
cola (`:371-379`).

**`/api/cron/purgar` (que la 24 no alcanzó):** `puertaCron` con 500 y no 200 sin
secreto (`:68-69`); interruptor ilegible → 500 con latido de fallo, no «apagado»
(`:81-93`); `r.error` comprobado por valor en cada vuelta (`:116-127`); y la
afirmación del comentario de `:139-147` —que una purga con `fallos` ya sale como
parcial— **es cierta**: la RPC vigente incluye `or cardinality(fallos) > 0` en su
`parcial` (`0289:172`, y lo mismo en 0288 y 0258, que son las redefiniciones
posteriores).

**`importarViajes`:** el upsert con `ignoreDuplicates` **cuenta lo que el insert
devolvió**, no el tamaño del lote (`importar_viajes.ts:513-532`), y los folios que
no volvieron se reportan como saltados — el contraejemplo exacto del BAJO de
`marcarExportadas`.

**El seam de cierre del processor:** `confirmarCierreEnBase` habla el vocabulario
de la tool y no el de la tabla (`processor.ts:1160-1182`), y su lectura
`getLiquidacionDeViaje` **lanza** ante `error` (`repo.ts:1048`), así que un fallo
de red no puede leerse como «no se cerró» — es `no_verificable`, tercera
respuesta.

**Los triggers de la 0299**, que son la mitad buena del feature: `LR003` impide
firmar por fuera de la RPC (`0299:120-124` en el INSERT y `:161-165` en el
UPDATE), un re-cierre que cambia cifras **retira la firma** (`:141-158`), y
`viaje_revision_coherente` rebota los dos estados imposibles (`:210-217`). El
candado del viaje se toma antes que el de la liquidación, en el mismo orden que
`guardar_liquidacion_tx` (`:300-313`). Y el
cálculo de la delta en `:384-385` es correcto pese a la apariencia: `v_gasto` es
una copia local y el `update` de la línea anterior no la refresca.

**`conciliarPropuesta` (portal de pago):** la lectura sin `error` de `:309-311` es
deliberada y falla cerrado — un `data` ilegible cae al camino
`conciliacion_sin_sello` con `estadoAhora: 'ilegible'` y lanza en vez de suponer
(`:312-326`).

**`/api/demo`:** doble medición del cuerpo (declarado y real) y tasa por IP antes
de `JSON.parse` (`route.ts:44-52`); el GET público ya no filtra `envHealth()`.

## Lo que NO alcancé a revisar

- **`src/middleware.ts` no existe** — lo busqué en todo el repo
  (`find . -name "middleware.*" -not -path "*/node_modules/*"` → vacío). El rubro
  lo lista como superficie mía; si la puerta vive en otro lado
  (`requireSessionTenant`, `v1/_comun.ts`), el mapa está desactualizado y alguien
  puede creer que hay un middleware revisando lo que no revisa nadie.
- `src/app/api/cron/{descarga-sat,jornada,asistencia,portales-vivos,runner,escalar}`
  y `cron/gps` + `conectores/sincronizar_gps.ts` — sigo sin abrirlos, igual que la 24.
- `src/app/api/admin/qa/*` (BE-26/BE-27 de la 22 siguen sin verificar) y
  `src/app/api/admin/{copiloto,mapa-prospectos,palette}`.
- `src/app/api/cron/facturar/{route,cola,lote}.ts` — solo miré su superficie por
  el grep de `sin_facturar_3_corridas`; el lote de mensualidades no lo abrí.
- `src/app/api/worker/bus/[accion]/route.ts` y `src/lib/worker/llaves.ts` —
  confié en lo que la 24 verificó (BE-22), no lo releí.
- Los ~25 upserts de `src/lib/likida/**` fuera de los que nombré: comprobé
  `onConflict` en `importar_viajes.ts:515`, `repo.ts:47`, `wa_pendientes.ts:63` y
  `suscripcion.ts:889`; el resto no.
- `duplicados.ts` y `pg_errores.ts` no los volví a abrir: la 24 los verificó y
  no se han tocado desde `b8a1a3a`.
- **No corrí ninguna prueba.** Todo lo de arriba es lectura de fuente, de
  migraciones y de los tests existentes. Cada vez que afirmo «ninguna prueba lo
  cubre» es un `grep` sobre `*.test.ts` que dejé escrito en el hallazgo, no una
  corrida de vitest.
