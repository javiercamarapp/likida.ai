# Backend y API — auditoría 3

**Nota: 5/10** (antes 6). Razón del movimiento: mirada más profunda — la lectura sigue siendo buena (mejor que en la auditoría 2: los motores puros nuevos SÍ traen prueba), pero los caminos de dinero NUEVOS (viaje.anticipo vía import y despacho por WA) se pueden escribir dos veces sin candado de base y sin una sola prueba de concurrencia, y una interacción entre dos módulos nuevos manda WhatsApp que nadie pidió a los choferes del prospecto.

**El riesgo mayor del rubro, hoy:** importar el TMS del prospecto de 750 camiones durante el PoC dispara, en la siguiente corrida del cron, cobranza por WhatsApp a cada chofer amarrado — exactamente el desastre que el importador promete evitar en su encabezado.

## Hallazgos

### [CRÍTICO] El import del kit PoC arma un bombardeo de cobranza en la siguiente corrida del cron
`src/lib/likida/importar_viajes.ts:14-17` · `src/lib/likida/agentes/cobranza.ts:105-111` · `src/lib/likida/agentes/cobranza_pura.ts:30-38` · contraste: `src/lib/likida/escalar_viaje.ts:94`

Escenario: el PoC importa 200 viajes históricos del TMS (estatus `abierto`, `fecha_inicio` de hace 10-45 días, operadores amarrados por nombre con teléfono capturado). El importador promete "NO manda WhatsApp" y cumple — pero `colaCobranza` filtra solo por `estatus in (abierto, en_cuadre)` + `fecha_inicio not null`, **sin el filtro de `avisado_en` que `escalar_viaje.ts:94` sí tiene**, y el agente de cobranza nace `activo: true` sin fila de config (`CONFIG_COBRANZA_DEFAULT`). A la siguiente corrida de `/api/cron/escalar` (horaria, `vercel.json`) dentro de la ventana 9-18 L-S: 200 mensajes "Llevas 32 días con tu viaje X sin mandarme comprobantes 📋" a choferes de una flota que ni es cliente. Combinado con el ALTO de abajo, hasta 600 mensajes en 3 horas.
Consecuencia: el PoC de 7 días con Transportes de 750 camiones se quema en la primera hora — spam a personas reales, costo de WhatsApp, y el contralor viendo a "su" agente cobrar viajes que nadie despachó por Likida.
Causa raíz: la cobranza toma "viaje abierto con fecha" como proxy de "viaje despachado por el sistema" y el import creó la primera población donde eso es falso.
Prueba que lo cubra: **NINGUNA** — `importar_viajes.test.ts` solo prueba funciones puras; `cobranza.test.ts:6-9` declara que el loop de envío no se prueba en TS.

### [ALTO] tierPendiente camina los tiers HACIA ABAJO: tres mensajes casi idénticos en tres horas
`src/lib/likida/agentes/cobranza_pura.ts:87-97` (y la condición `tiersContactados.length === 0` en `:94`)

Escenario: viaje con 20 días sin comprobar, tiers [3,7,14], sin contactos. Corrida 1: `tierPendiente(20,[3,7,14],[],false)` → 14, manda. Corrida 2 (una hora después): previos=[14] → devuelve **7**, manda "Llevas 20 días..." otra vez. Corrida 3: devuelve **3**, tercera copia. Además el tier que el sello 0087 consumió reaparece: la consumición del sello solo aplica con `tiersContactados.length === 0`, así que tras el primer contacto nuevo, el tier del recordatorio ya recibido vuelve a estar "pendiente".
Consecuencia: el chofer recibe el mismo cobro 2-3 veces en horas consecutivas — el canal "que se aprende a ignorar" que el propio encabezado del módulo (`cobranza.ts:28-30`) dice evitar, con costo por mensaje.
Causa raíz: devolver el MAYOR tier alcanzado sin consumir los menores deja a los menores como pendientes eternos.
Prueba que lo cubra: `cobranza.test.ts:76-78` fija la intención ("no se mandan tres mensajes juntos") para UNA corrida; la corrida siguiente (`previos=[14]`) **no tiene prueba** — y devuelve 7.

### [ALTO] Un segundo «sí» del jefe crea un segundo viaje con anticipo
`src/lib/likida/despacho_wa.ts:124-155` · `:83-88` · `src/lib/likida/processor.ts:445-458` · `src/lib/likida/operacion.ts:559-569`

Escenario A (concurrencia): el jefe manda "sí" dos veces seguidas (doble tap). Son dos `waMessageId` distintos — el claim no los dedupea — y el processor no toma ningún lock en la rama oficina: ambos `cargarPendiente` ven el pendiente vivo, ambos `crearViaje` insertan (folio `null`, cero idempotencia en `operacion.ts:559`), el chofer recibe dos avisos y el Registro dos viajes con anticipo $8,000 cada uno.
Escenario B (secuencial): `crearViaje` sale bien y el clear del pendiente falla — `guardarPendiente` **solo loguea** el error (`despacho_wa.ts:87`) y la respuesta igual dice "Viaje creado ✅"; cualquier "sí" dentro de los 30 minutos de vigencia duplica el viaje.
Consecuencia: dos viajes abiertos para el mismo chofer → `decidirInicio` ambiguo, anticipo contado doble en el Registro, y dos colas de cobranza/escalación.
Causa raíz: el ciclo leer-pendiente → crear → borrar-pendiente no es atómico y no hay unique que lo respalde.
Prueba que lo cubra: `despacho_wa.test.ts:112-155` cubre el camino secuencial (incluido "si crearViaje truena, el pendiente SE CONSERVA"); **ningún test de dos «sí» en vuelo ni del clear fallido tras crear**.

### [ALTO] El dedup del import vive solo en código: dos submits concurrentes duplican los 200 viajes
`src/lib/likida/importar_viajes.ts:174-183` · `src/app/dashboard/viajes/page.tsx:73-108`

Escenario: doble click (o dos pestañas) sobre "Importar" con el mismo archivo. Ambas actions leen `existentes` antes de que la otra inserte → ambas insertan los 200 viajes. No existe `unique(tenant_id, folio)` en `viaje` — verificado contra las migraciones: los únicos folios únicos del esquema son `cotizacion_folio_unico` (0051) y `factura_folio_unico` (0049). El comentario "El mismo archivo subido dos veces no duplica viajes" solo es cierto en serie.
Consecuencia: 400 viajes con anticipos duplicados en el Registro del contralor durante el PoC, y doble población para el CRÍTICO de arriba. Nada lo señala: la segunda respuesta también dice "creados: 200".
Causa raíz: read-then-insert sin constraint — el patrón que `factura_proveedor` (0091:41) sí resolvió en la base.
Prueba que lo cubra: **NINGUNA** — `importarViajes` (la mitad que escribe) no tiene ni un test; `importar_viajes.test.ts` solo cubre `interpretarFilasViajes`/`leerCifraImportada`.

### [ALTO] Consolidado: si la segunda escritura falla, el acuse miente y el reenvío "desliga" lo ligado
`src/lib/likida/intake/consolidado.ts:287-292` (contra su propia advertencia en `:222-228` y el acuse de `:415-424`)

Escenario: XML de monedero con 10 líneas; 6 gastos quedan ligados (`cfdi_uuid` escrito en `gasto`), y el upsert de `cfdi_consolidado_linea` falla por un blip — **solo se loguea** y la función devuelve el resumen normal. El operador lee "6 ya quedaron ligados; 4 necesitan revisión — están en el panel", y el panel tiene CERO filas: la cola del contador no existe y los candidatos calculados se perdieron. Peor: el chequeo de idempotencia (`:229-236`) busca líneas existentes, no encuentra ninguna, re-corre el JOIN — y los 6 gastos ya ligados ya no son candidatos (`.is('cfdi_uuid', null)`), así que el reenvío reporta como huérfanas líneas que están bien ligadas. Es literalmente el modo de falla que el comentario de `:222-228` dice haber cerrado, reabierto por el error tragado tres pantallas abajo.
Consecuencia: cifra fiscal (litros/IEPS/IVA del 54% del gasto real) con rastro roto y un acuse que afirma lo que no quedó.
Causa raíz: dos escrituras dependientes sin propagación del error de la segunda.
Prueba que lo cubra: **NINGUNA para `guardarYConciliarConsolidado`** — `consolidado.test.ts` cubre `conciliarLineas` (puro) y `resolverLineaAMano` (con mock, carreras incluidas), pero el orquestador impuro no aparece.

### [MEDIO] Rama oficina: base caída o teléfono ambiguo = "no te tengo registrado", una afirmación falsa
`src/lib/likida/processor.ts:398-403` → `:477` · `src/lib/likida/contactos.ts:61,71`

Escenario: `resolverCuentaOficina` lanza tanto ante error de DB (`:61`) como ante `TelefonoAmbiguo` (`:71` — un contador dado de alta en dos flotas). El catch local de processor devuelve `null` con un comentario que dice "No se afirma que no existe" — y el fall-through hace exactamente esa afirmación: "Hola, no te tengo registrado como operador. Pídele a tu flota que te dé de alta". Para el teléfono ambiguo es PERMANENTE: cada mensaje del jefe, para siempre, recibe una negación falsa, y el despacho por WA queda muerto para él.
Consecuencia: el jefe registrado deja de confiar en el canal (o abre un ticket de "dado de alta y no me reconoce"), y la ambigüedad de datos nunca aflora — el catch general (`:2256-2282`) sí distingue estos casos para el chofer, aquí se tragan.
Causa raíz: un catch que colapsa "no sé" y "no existe" en el mismo `null`, tres líneas después de documentar por qué no se debe.

### [MEDIO] La cobranza trunca en silencio a 500 viajes por flota y 1,000 globales
`src/lib/likida/agentes/cobranza.ts:111` y `:261`

Escenario: la flota de 750 camiones con >500 viajes abiertos con fecha. `colaCobranza` trae `limit(500)` sin `traerTodo` ni chequeo del tope: los viajes 501+ jamás se cobran, y `vigilados` (la cifra que la página del agente pinta) reporta 500 como si fuera el total. Igual en `ejecutarCobranzaGlobal:261`: `limit(1000)` filas para derivar tenants — pasando de 1,000 viajes vivos globales, flotas enteras quedan fuera de la corrida sin una línea de log.
Consecuencia: "el agente vigila tus viajes" es falso para la cola que no cupo, y nadie se entera — el modo de falla exacto que `traerTodo()` existe para evitar y que el export de proveedor sí declara (`export/facturas-proveedor/route.ts:40-43`).
Causa raíz: límites de "bandeja" copiados a un camino de barrido total.

### [MEDIO] El CSV exporta fórmulas vivas: la descripción del XML del PROVEEDOR llega cruda a Excel
`src/lib/likida/export.ts:39-41` · `src/lib/likida/proveedores.ts:44-52` · `src/app/api/export/facturas-proveedor/route.ts:44-45`

Escenario: un CFDI de proveedor (tercero, fuera de la frontera de confianza) trae `Descripcion="=HYPERLINK(""http://malo.mx"",""ver factura"")"` — pasa el parser, se guarda, el contralor aprueba viendo texto raro pero inofensivo en pantalla, y descarga el CSV "importable a SAP/Excel". `csvCell` escapa comillas y comas pero no neutraliza `= + - @` al inicio de celda: Excel ejecuta la fórmula al abrir.
Consecuencia: inyección de fórmula clásica en el archivo que el producto explícitamente diseña para abrirse en Excel, con contenido controlado por cualquier proveedor de la flota. El export de liquidaciones solo exportaba campos propios; `descripcion` es la primera columna de texto ajeno.
Causa raíz: `toCsv` nació para filas de campos propios y el contrato nuevo le metió texto de terceros.

### [MEDIO] /api/dashboard/ingesta quema visión por llamada, sin rate limit ni tope diario
`src/app/api/dashboard/ingesta/route.ts:28-50`

Escenario: el propio encabezado dice "esto GASTA dinero por llamada de visión" y la única puerta es sesión + rol dinero. Sin `rateLimit` (los exports lo tienen: `export/facturas-proveedor/route.ts:19-21`) y sin tope diario (el chat lo tiene y falla cerrado: `chat/route.ts:70-87`). Un contralor con un script — o una sesión robada — en bucle: llamadas de visión ilimitadas, ~45s cada una, facturadas a Likida.
Consecuencia: gasto de IA sin techo en un producto pre-revenue que ya mide su costo por liquidación; y contención de recursos del plan.
Causa raíz: se calcó la autorización del asistente pero no ninguno de los dos limitadores hermanos.

### [BAJO] IVA de $0 se guarda como null: el `||` borra la tasa 0%
`src/lib/likida/proveedores.ts:92`

`iva: xml.ivaTraslado || null` — una factura tasa 0% (exenta) guarda `null` ("no se pudo leer") en vez de `0`; el export imprime celda vacía donde el ERP del cliente espera 0.00. La línea de arriba (`sub_total`, `:91`) usa `typeof === 'number'` y preserva el 0 — misma fila, dos criterios.

### [BAJO] Un blip al leer el RFC de la flota se fosiliza como "no tenía RFC ese día"
`src/app/dashboard/agentes/proveedores/page.tsx:68` (y `:47-48`)

`getFiscalDeFlota(tenantId).catch(() => null)` en la action: un error transitorio produce `rfc = null` → `receptor_es_flota = null` **guardado para siempre** (la bandera se persiste al ingerir por diseño, 0091). "No pude preguntar" y "no había RFC" — la distinción que `ConsultaFallida` existe para preservar — quedan indistinguibles en un dato inmutable.

### [BAJO] La bandeja de la oficina permite adjuntar el huérfano de $0.00 que WhatsApp se niega a ofrecer
`src/app/dashboard/huerfanos/page.tsx:84-95` · `src/lib/likida/repo.ts:381-388` (sin filtro de monto) · doctrina en `src/lib/likida/processor.ts:567-573`

El flujo de WhatsApp excluye del ofrecimiento los huérfanos con `monto: 0` (fallo de OCR) porque "metería una línea de $0.00 en la liquidación del contralor, que es una cifra que nadie midió". La bandeja de la oficina los lista y los deja adjuntar sin advertencia extra. Mitigado: el humano ve el $0.00 en la fila antes de decidir.

## Lo que revisé y está bien (con archivo:línea)

- **Export facturas-proveedor**: doble puerta dato+verbo (`route.ts:26-33`), rate limit (`:19-21`), y el tope de 5,000 se DECLARA en vez de recortar callado (`:40-43`).
- **Cron escalar**: falla cerrado sin `CRON_SECRET` con 500, no 200 verde (`api/cron/escalar/route.ts:52-59`); 401 sin cuerpo (`:60-63`); los dos chequeos en try/catch independientes y los fallos van en la RESPUESTA (`:65-91`).
- **Escalación**: claim ANTES de mandar con UPDATE condicional que devuelve filas (`escalar_viaje.ts:306-327`); exige `avisado_en` (`:94`); el catch alrededor de `sendTemplate` protege el `for` completo (`:243-270`).
- **Claim de cobranza**: `unique(viaje_id, tier)` real en la base (0089:57) y verificado con corrida anotada (verificación 64, `supabase/verificaciones.sql:3117-3133`); el 23505 del perdedor no cuenta como fallo (`cobranza.ts:210-213`); el resultado se anota aunque el envío falle (`:230-233`).
- **Proveedores**: dedup EN la base (`0091:41`, verificación 66); `decidir` con candado `.eq('estado','pendiente')` que le avisa al segundo clic (`proveedores.ts:149-163`); `receptorEsFlota` con semántica null honesta (`:57-60`); contrato del layout fijado por prueba (`proveedores.test.ts:40-58`).
- **Huérfanos desde oficina**: orden addGasto→resolver (nunca un "adjuntado" sin gasto), 23505 con mensaje propio, destino re-verificado ADENTRO (`dashboard/huerfanos/page.tsx:74-101`); `.is('resuelto_en', null)` anti-carrera con aviso al perdedor (`repo.ts:449-464`).
- **Server actions de las páginas nuevas**: TODAS re-verifican sesión+rol+tenant adentro con el cruce `sesion.tenantId !== tenantId` (cobranza `page.tsx:24-29`, proveedores `:20-25`, peajes `:57-60`, facturas `:53-59`, viajes `:77-79` con gate de ASIGNAR y no solo de ver, huérfanos `:17-22`, despacho `:59-64`); el tenant viaja por closure, nunca del cliente.
- **marcarFacturada**: anclado a tenant + `.is('cfdi_uuid', null)` + 23505 distinguido + "cero filas" dicho (`agentes/facturas/page.tsx:71-88`).
- **Hitos**: sellado idempotente `.is(col, null)` anclado a tenant (`hitos_viaje.ts:99-105`), acuse que no miente la hora en el repetido (`:120-122`), lista cerrada con preguntas excluidas (`:73-78`); cableado probado (`processor_hitos.test.ts:79-118`) y orden en el pipeline correcto (antes de `pareceCierre`, después de botones/consultas — `processor.ts:1563-1577`).
- **Despacho por WA**: rol re-verificado ADENTRO en los dos brazos (`despacho_wa.ts:127-130, 172-174`); vigencia de 30 min probada (`despacho_wa.test.ts:139`); el nombre del resumen es el RESUELTO de la base (`:207-208`).
- **crearViaje**: el operador y la unidad se verifican de ESTA flota antes del insert (`operacion.ts:545-557`).
- **conv.ts**: claim de mensaje con 3 estados y el indeterminado decidido por el llamador (`:343-353`); la carrera del INSERT de conversación se pierde-y-relee en vez de upsert que pisaría turnos (`:261-286`); barrera de intake fail-closed con `null` ≠ 0 (`:488-497, 593-601`).
- **Webhook WhatsApp**: HMAC antes de parsear, pool de 5 con presupuesto compartido, 429 que convierte el descarte en re-entrega de Meta, acuses `failed` leídos (`api/webhook/whatsapp/route.ts:89-251`).
- **resolverLineaAMano**: candidato solo de los ofrecidos, doble candado de estatus, y la inconsistencia rara documentada sin deshacer a ciegas (`consolidado.ts:346-408`; carreras probadas con mock en `consolidado.test.ts:205-252`).
- **tenant-api**: `?tenant=` solo para superadmin, validado contra la tabla, y el blip de lectura es 503 — no un fallback silencioso a otra flota (`lib/auth/tenant-api.ts:56-73`).
- **Chat**: tope diario por tenant que falla CERRADO si no se pudo leer el gasto (`api/dashboard/chat/route.ts:70-87`).

## Lo que NO alcancé a revisar

- `api/cron/facturar` y `api/stripe/webhook` (el MAPA los declara sin cambios grandes; tienen tests propios que no releí).
- `lib/agents/analista.ts` y `chat-tools.ts` por dentro (rubro agéntico; solo revisé la puerta HTTP).
- `api/dashboard/archivo` y `api/dashboard/conversaciones/[id]` a fondo.
- `api/export/pdf/[id]` y `api/demo` en esta ronda.
- Las actions preexistentes de `dashboard/[id]`, `suscripcion`, `combustible-casetas` y `politicas` (auditadas en rondas previas; no re-verifiqué línea por línea).
- Del ancla vieja (`docs/conocimiento/40-auditoria-codigo.md`): los riesgos R1-R5 son mayormente del rubro fiscal/cuadre; no re-verifiqué R3 (validación de RFC ante tropiezo de base) contra la línea actual.
