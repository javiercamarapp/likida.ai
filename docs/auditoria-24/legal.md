# Cumplimiento legal — auditoría 24

**Nota: 7/10** (antes 5). Razón del movimiento: **se atacó y subió**. Los dos
CRÍTICOS de la ronda 23 están cerrados y los verifiqué línea por línea contra el
código, no contra el asunto del commit: la 0286 es la ÚLTIMA definición de
`ejecutar_arco_cancelacion` y trae `set search_path = public, extensions,
pg_catalog` (`0286:46`), y la compuerta de «no tratar antes de avisar» sí llegó a
los dos pollers (`sincronizar_gps.ts:208-219`, `sincronizar_eventos.ts:146-156`),
falla cerrada y se cuenta. Con ellos cayeron también el ALTO del plazo de 90 días
(0289), el ALTO de la cámara (declarada en el aviso + purga en la 0288), y los
tres MEDIO/BAJO de piloto de facturación, Stripe y evidencia ARCO. Lo que queda
no es el mismo hueco: son los **restos de tres cierres a medias** y un flujo que
la ronda 23 escribió por su nombre en «lo que NO alcancé a revisar» y que sí
tiene un defecto.

**El riesgo mayor del rubro, hoy:** el nombre del operador —y el anticipo de sus
viajes, que es dato patrimonial— sale hacia el modelo externo cada vez que el
contralor usa el chat del panel, y **ninguno de los dos avisos enumera esa
salida**; el mismo repositorio se niega, por escrito, a entregar ese mismo nombre
a un cliente MCP.

---

## Hallazgos

### [ALTO] El chat del panel manda el nombre del operador y el anticipo de sus viajes al modelo externo; la cláusula de transferencias del aviso no lo cubre
`src/lib/agents/chat-tools.ts:172` · `src/lib/likida/privacidad.ts:807` · `src/lib/agents/analista.ts:43`

> Lo que el aviso del operador afirma, en la sección del art. 35
> (`privacidad.ts:807`), y es una lista **taxativa**: *"Sí pasan por proveedores
> que trabajan por instrucción de la empresa […]: el proveedor de mensajería de
> WhatsApp, el de alojamiento de la base de datos, y los modelos de lenguaje: les
> llegan **las fotos de tus comprobantes** para leerlas y **el texto de tus
> mensajes** —la conversación completa— para poder contestarte."* Los otros dos
> renglones que añaden algo son las notas de voz (`:812`) y el Carta Porte hacia
> el PAC (`:813`). Nada más.
>
> Lo que el código hace: la tool `viajes_flota` devuelve al modelo, por cada
> viaje, `{ folio, origen, destino, estatus, anticipo, operador:
> v.operadorNombre, inicio }` (`chat-tools.ts:169-174`). `operadorNombre` es el
> nombre real (`repo.ts:644`, `operadorNombre: op?.nombre ?? null`). La tool está
> en `TOOLS_LECTURA` del analista (`analista.ts:43`) y se publica en cada turno
> (`analista.ts:368`, `toolSchemas([...TOOLS_LECTURA, 'entregar_respuesta'])`).
> El resultado se serializa tal cual en el mensaje `role: 'tool'` que va a
> OpenRouter; **no hay ningún filtro de PII en el camino**: `tool-executor.ts:120`
> solo acota el vocabulario de errores de Postgres, y `analista.ts` no
> seudonimiza (grep de `seudonim|anonim|etiquetaOperador` sobre
> `tool-executor.ts`, `analista.ts` y `chat-tools.ts`: cero coincidencias).

**Escenario:** el contralor de «Transportes del Bajío» abre *Pregunta a tus
datos* y escribe «¿cómo van los viajes de esta semana?». `POST
/api/dashboard/chat` (`route.ts:41`) despacha al analista; el modelo llama
`viajes_flota` y recibe, entre otros, `{"folio":"VJ-1042","origen":"Querétaro",
"destino":"Nuevo Laredo","estatus":"abierto","anticipo":18000,
"operador":"Juan Pérez","inicio":"2026-09-01"}` — hasta 25 renglones por llamada.
Ese JSON sale hacia OpenRouter. En el aviso de Juan, «los viajes y liquidaciones
en los que participas» está enumerado como dato tratado (`privacidad.ts:606`),
pero la cláusula del art. 35 dice que a los modelos les llegan sus **fotos** y
**sus** mensajes; nunca su nombre pegado al anticipo de un viaje, que además es
dato patrimonial (`docs/conocimiento/11-datos-personales.md:127`).

**El contraste que lo hace un hallazgo y no una interpretación:** el mismo repo
ya tomó la decisión contraria donde sí la pensó.
`src/lib/mcp/herramientas/viajes.ts:9-12`: *"MINIMIZACIÓN: el nombre del operador
NO se devuelve. Para contestar «cómo van mis viajes» no hace falta, y un cliente
MCP es un tercero: lo que no se necesita, no cruza."* El criterio existe,
está escrito, y no se aplicó al camino que sí se usa todos los días.

**Consecuencia:** la enumeración del art. 15 fr. II y la cláusula del art. 35
declaran **menos** de lo que sale, que es el sentido caro del error — el mismo
que la ronda 22 y la 23 levantaron para el DOM del piloto de facturación. Ante un
contralor haciendo due diligence, es un flujo de dato personal identificado hacia
un proveedor en el extranjero que el documento probatorio de su flota no
describe. **Por qué NO lo marco CRÍTICO:** el destinatario (los modelos vía
OpenRouter) sí está declarado como persona encargada y sí se le pide
`data_collection:'deny'` en cada llamada (`openrouter.ts`); lo que falta es el
renglón del aviso, no el contrato ni la puerta.

**Causa raíz probable:** la cláusula del art. 35 se escribió pensando en el canal
de WhatsApp del operador, y el chat del panel entró por otra puerta con las
mismas tools de lectura.

---

### [ALTO] La compuerta de LEG-1 no cubre a la unidad sin viaje vivo: el evento de cámara —con la liga al video del chofer— se guarda igual, sin aviso
`src/lib/likida/privacidad.ts:1110` · `src/lib/likida/conectores/sincronizar_eventos.ts:161`

> Lo que el módulo escribe como principio (`privacidad.ts:1077-1082`): *"Una
> unidad sin viaje vivo no está ligada a ninguna persona: su posición es la de un
> camión, no la de un titular, y se guarda."*
>
> Lo que el código hace: `unidadesSinAvisoPrevio` resuelve el operador SOLO por
> `viaje` con `estatus in ('abierto','en_cuadre')` (`privacidad.ts:1098-1102`); si
> ninguna unidad de la tanda tiene viaje vivo, `operadorPorUnidad.size === 0` y la
> función **devuelve el conjunto vacío** (`privacidad.ts:1110`) — o sea, «ninguna
> sin aviso». `sincronizar_eventos.ts:161` (`if (unidadId && sinAviso.has(unidadId))
> continue;`) no bloquea nada y el upsert de `:168-185` guarda el evento con
> `etiquetas`, `lat`, `lng`, `ocurrido_en` y **`url_evento`**.
>
> El argumento de «es el camión, no la persona» se sostiene para una coordenada.
> **No se sostiene para `url_evento`**: es la liga al video del proveedor, y ahí
> se ve quién va al volante. El propio aviso lo describe como dato del chofer
> (`privacidad.ts:646`: *"La conducta al volante que reporta la cámara […]
> frenadas bruscas, uso del celular al manejar, distracción […] y una liga al
> video en el sistema del proveedor"*).

**Escenario:** «Transportes del Bajío» activa su credencial Samsara. La unidad 12
no trae viaje abierto —vuelve del taller un martes a las 14:00— y Juan la maneja.
La cámara reporta `['MobileUsage']` a las 14:03 con `lat=20.71, lng=-100.44` y
`url_evento=https://cloud.samsara.com/…`. `unidadesSinAvisoPrevio(tenant,
['u12'])` no encuentra viaje vivo → `{ sinAviso: ∅ }` → el evento se guarda en
`evento_seguridad_flota` con su liga al video. Juan tiene
`operador.aviso_privacidad_en = NULL` y nunca escribió por WhatsApp. `base.sinAvisoPrevio`
queda en `undefined`, así que el cron late **`ok`**: no hay ni la señal de que el
hueco existe. Con el poller cada 5 minutos y las horas del día en que un tracto
no está en viaje, esto no es un caso de borde.

**Consecuencia:** art. 16 fr. II incumplido justo sobre la categoría que la
ronda 23 marcó como la más invasiva, en el tramo que la compuerta no miró. El
expuesto es Juan; la sancionable es la flota (art. 14).

**Causa raíz probable:** la compuerta se ancló al `viaje` porque es la única
tabla que liga unidad↔persona hoy, y se aceptó «sin viaje = sin persona» sin
separar la posición (donde el argumento vale) del evento con video (donde no).

*(REINCIDENTE — resto de LEG-C1 / LEG-C2; el cierre nuevo es real y cubre el caso
principal, este es el tramo que sobrevivió.)*

---

### [ALTO] El parte de incidente sigue sacando el dato de salud y el nombre del familiar del operador hacia la bandeja interna de Likida, donde ninguna purga y ninguna cancelación ARCO los alcanzan
`src/lib/likida/agentes/direccion.ts:540,586,601,625-628,639` · `src/lib/likida/agentes/cola.ts` (`encolarPieza`)

> Lo que el aviso afirma (`privacidad.ts:687`): *"si avisas por el chat de un
> accidente o una emergencia, se guarda **si hay personas lesionadas** y el texto
> con el que lo describes, **para poder escalarlo a tu empresa** y atenderlo."*
>
> Lo que `c1b2700` (LEG-5) arregló: la descripción cruda ya no se reproduce
> (`direccion.ts:586` la sustituyó por *"revísala en el panel de tu flota"*) y el
> teléfono del familiar tampoco (`:625-627`). Es media corrección real.
>
> Lo que sigue viajando al mismo `cola_aprobacion.cuerpo`:
> · `:586` y `:639` — `· Operador: Juan Pérez`, dos veces.
> · `:601` — `· ¿Hay lesionados? SÍ, CONFIRMADO en el expediente.`
> · `:540` (impreso por `:624`) — `1. María Pérez (esposa) — familia de Juan Pérez`.
>   Se ocultó el número; **el nombre, el parentesco y el vínculo se quedaron**.
> · `:542` — `respaldo: contacto_emergencia, capturado por la flota con la casilla
>   «avisar si hay lesionados» marcada. HAY LESIONADOS CONFIRMADOS en el expediente.`
> · y en `fuentes` (`:792`), `lesionados: inc.hayLesionados` — la misma bandera de
>   salud, en la columna que el comentario de `:783-785` dice reservar para no
>   *"esparcir datos personales por una columna que nadie mira"*.

**Escenario:** Juan escribe *"chocamos en la 57, traigo un herido"*.
`incidencia.hay_lesionados = true`. La corrida de `especialistas_incidente` encola
la pieza y en `/admin/tu-turno` (superadmin, cruza tenants) se lee:
*"· Operador: Juan Pérez · ¿Hay lesionados? SÍ, CONFIRMADO en el expediente · 1.
María Pérez (esposa) — familia de Juan Pérez"*. Meses después Juan pide
cancelación y el contralor la ejecuta: `ejecutar_arco_cancelacion` (0286) toca
`wa_conversacion`, `envio_mensaje`, `incidencia`, `incidencia_evento`, `operador`
y `app_user` — **`cola_aprobacion` no está en la función** (leída completa,
`0286:40-160`). La única purga de esa tabla borra piezas de prospecto frío
(`0258:188`), y una pieza `parte_incidente` tiene `prospecto_id` NULL. El panel de
ARCO le dice al contralor que el titular quedó anonimizado; el renglón con su
nombre, la confirmación de lesionados y el nombre de su esposa sigue vivo.

**Consecuencia:** (a) un dato **sensible** —salud, art. 2 fr. VI, con el agravante
del art. 59 fr. IV— sale del perímetro que el aviso describe («a tu empresa»)
hacia el buzón operativo de Likida; (b) el nombre y el parentesco de una **tercera
persona** que nunca vio ningún aviso viajan con él; (c) la cancelación que el
producto firma como ejecutada no lo alcanza. `docs/legal/RETENCION.md:41` lo
reconoce por escrito y lo deja abierto: *"LEG-5 — **NO CERRADO por `legal`**"*.

**Causa raíz probable:** el arreglo quitó los dos campos que el hallazgo de la 23
citaba textualmente (descripción y teléfono) y no volvió a leer el resto del
parte, donde el vínculo salud↔persona↔familiar se reconstruye entero.

*(REINCIDENTE — ALTO de la auditoría 23, cerrado a medias.)*

---

### [MEDIO] El aviso de la flota le dice al operador que sus eventos de cámara «no tienen fecha de borrado automático» — y la misma rama los purga a 180/365 días
`src/lib/likida/privacidad.ts:646,649` · `supabase/migrations/0288_purga_outbox_eventos_e_indices_posicion.sql:84-115`

> Lo que el aviso integral afirma, en dos de sus tres ramas
> (`privacidad.ts:646` y `:649`, misma frase): *"**Hoy no tienen una fecha de
> borrado automático.**"* Y el comentario que la justifica (`:640-644`) dice el
> porqué: *"NO se promete un plazo de borrado fijo para estos eventos: hoy no
> existe una purga automática que lo ejecute"*.
>
> Lo que hay en el mismo árbol: `purgar_evento_seguridad_flota(180, 365)`
> (`0288:84-115`), llamada desde `mantenimiento_de_datos` (`0288`, y de nuevo en
> `0289`), con su propio índice `evento_seguridad_ocurrido_idx`. La migración lo
> dice con todas sus letras: *"la segunda lleva lat/lng del chofer, que el aviso
> promete no conservar sin plazo (LEG-6)"*.

**Escenario:** Juan abre el aviso integral de su flota desde WhatsApp el
2-sep-2026 y lee que su historial de conducta al volante se guarda sin fecha de
borrado. El cron nocturno `/api/cron/purgar` lleva desde la 0288 borrando esos
eventos a los 180 días (365 los graves). El documento con el que la flota prueba
su cumplimiento afirma lo contrario de lo que su base ejecuta.

**Consecuencia:** el error va en la dirección segura para el titular —se declara
menos retención de la que hay— pero es una afirmación falsa dentro del documento
probatorio, en la misma categoría de dato que la ronda 23 marcó ALTO. Y le quita
a la flota el único argumento que hoy sí tiene: que ese plazo se ejecuta solo.

**Causa raíz probable:** el texto (LEG-3) y la purga (0288/DAT-9) se escribieron
en ramas paralelas el mismo día; el merge las juntó sin que ninguna releyera a la
otra.

---

### [MEDIO] `docs/legal/RETENCION.md` —la tabla que el documento declara como la lectura del código— nació desfasada del árbol que se está fusionando
`docs/legal/RETENCION.md:5,36,37,38,41`

> Lo que el documento promete de sí mismo (`:3-10`): *"no es una promesa, es una
> lectura del código. Cada fila […] viene de `mantenimiento_de_datos`
> (`0258_…sql:231-315`, **la definición vigente al 1-sep-2026**) — si esa función
> cambia, esta tabla debe cambiar con ella."*
>
> Lo que el árbol trae: `mantenimiento_de_datos` se redefinió **dos veces** después
> de la 0258 — en la 0288 (añade `purgar_wa_outbox` y
> `purgar_evento_seguridad_flota`) y en la 0289 (añade
> `purgar_geolocalizacion_incidencia`). Contra la definición vigente de verdad, la
> tabla está mal en cuatro renglones:
> · `:36` — `incidencia.lat/lng`: dice *"ninguna purga las toca"*. La 0289 las
>   retira a los 90 días de resuelta la incidencia.
> · `:37` — `incidencia_evento.detalle`: dice *"Sin purga"*. La 0289 le quita
>   `lat`/`lng` y deja `geolocalizacion_purgada_en`.
> · `:38` — `evento_seguridad_flota`: dice *"Sin purga"* y le echa la culpa al texto
>   del aviso. La 0288 la purga a 180/365 días.
> · `:41` — el parte de incidente: describe *"descripción cruda […] y teléfonos de
>   contactos de emergencia"*, que `c1b2700` ya quitó (queda lo del hallazgo de
>   arriba: nombre, parentesco y bandera de salud).
> Falta además la fila entera de `wa_outbox` (purga a 90 días, 0288), que guarda el
> `payload` de cada mensaje saliente al operador.

**Escenario:** el contralor de la flota piloto pide el inventario de retención
antes de firmar. Se le entrega este archivo. Le dice que la ubicación de sus
incidentes no se borra nunca (falso desde la 0289) y que la telemetría de sus
cámaras tampoco (falso desde la 0288). Si en vez del contralor lo pide la
autoridad, la flota exhibe un inventario que no coincide con su propia base.

**Consecuencia:** el único artefacto del repo que dice «esto es lo que de verdad
se conserva» no describe el árbol donde vive. Y es la fuente de la que salió el
MEDIO anterior: el aviso repite el «sin purga» que esta tabla afirma.

**Causa raíz probable:** el documento se ancló a la 0258 por número, no a «la
última definición de `mantenimiento_de_datos`», y no hay prueba que lo vigile —
el propio archivo lo anota en `:52-59` como candidato.

---

### [MEDIO] El contacto de emergencia ya está declarado en el aviso, pero sigue sin plazo, sin baja y fuera del alcance de la cancelación ARCO
`supabase/migrations/0286_arco_por_telefono_normalizado.sql:40-160` · `src/lib/likida/emergencias.ts:265-276` · `src/lib/likida/privacidad.ts:694`

> Lo que el aviso afirma ahora, y es nuevo y correcto (`privacidad.ts:694`): *"**El
> contacto de emergencia que tu empresa capture sobre ti:** […] nombre, teléfono y
> parentesco […] ese dato se guarda con esa sola finalidad."*
>
> Lo que el código hace: `ejecutar_arco_cancelacion` (0286, la última definición)
> toca seis tablas y `contacto_emergencia` no es ninguna — grep de
> `contacto_emergencia` sobre las 279 migraciones: solo la 0198 que la crea y un
> comentario de la 0235; ni un `delete`, ni un `update`, ni una llamada desde
> `mantenimiento_de_datos`. `docs/legal/RETENCION.md:40` lo reconoce: *"Sin purga;
> no se borra al dar de baja al operador"*.

**Escenario:** el contralor captura «María Pérez, 55 5512 3456, esposa» con la
casilla de avisar. Un año después Juan se va de la flota y pide cancelación; el
contralor la ejecuta y el panel confirma. `operador.nombre` queda en `Operador
A3F19C` — y `contacto_emergencia` conserva el nombre, el teléfono y el parentesco
de María, colgados de un `operador_id` que ya es un seudónimo. María nunca vio un
aviso, no tiene canal para pedir su baja, y ahora ni siquiera se puede saber de
quién era familia.

**Consecuencia:** dato de un tercero identificado, revelador de una relación
familiar, sin plazo y sin camino de baja. Mitigante real respecto de la ronda 23:
ya está enumerado en el aviso del operador, así que el hueco es de ejecución, no
de información.

*(REINCIDENTE — MEDIO de las auditorías 22 y 23; la mitad de texto sí se cerró.)*

---

### [BAJO] Tres razonamientos del módulo de privacidad citan la LFPDPPP abrogada para definir «dato sensible» y «dato personal»
`src/lib/likida/privacidad.ts:301,668,680`

> Lo que dicen: `:301` *"(LFPDPPP art. 3 fr. IX: persona identificada o
> identificable)"*; `:668` *"La voz es dato personal por sí misma (art. 3 fr. V)"*;
> `:680` *"La salud es dato sensible (art. 3 fr. VI)"*.
>
> Lo que la ley vigente dice: el artículo de definiciones de la ley de 2025 es el
> **2**, no el 3 — `normas/lfpdppp-2-XII-XX.yaml` lo transcribe literal (fr. XII
> persona encargada, fr. XV Secretaría, fr. XX transferencia) y
> `docs/conocimiento/11-datos-personales.md:129` fija *"El art. 2 fr. VI define
> sensibles"*. `art. 3 fr. VI` es la numeración de la ley de 2010, **abrogada** por
> el Transitorio Segundo fr. I del decreto del 20-mar-2025. El mismo archivo lo
> hace bien en otros puntos (`sanitizar.ts:35` cita `art. 2 fr. VI`, y
> `privacidad.ts:596` corrigió expresamente un `fr. XX` por `fr. XII` en la
> auditoría 18).

**Escenario:** el abogado que revisa el producto antes del piloto sigue la cita de
`:680` —la que justifica el párrafo de salud del aviso, que es el que más caro
sale— al texto vigente en diputados.gob.mx y no encuentra ahí la definición de
dato sensible. El razonamiento que sostiene la decisión de producto queda sin
respaldo verificable en el momento en que alguien lo comprueba.

**Consecuencia:** no hay fuga ni dato mal tratado; es la deuda que el propio repo
declara cara — *"si tu abogado […] te cita «el artículo 16 de la LFPDPPP» […] está
citando la ley abrogada"* (`11-datos-personales.md:36`). Va a cobrar factura en la
primera due diligence que verifique una cita.

**Causa raíz probable:** las tres citas son de rondas anteriores a la
verificación de fuente primaria de julio-2026 y nadie barrió `art. 3 fr.` cuando
se renumeró el resto.

---

## Lo que revisé y está bien

- **La compuerta de LEG-1 en los dos pollers, para el caso principal.**
  `sincronizar_gps.ts:208-219` la aplica ANTES del upsert (guardar ya es
  tratamiento), y si la base no contesta devuelve error y **no guarda nada de esa
  flota** (`:210-212`). `sincronizar_eventos.ts:146-156` hace lo mismo y filtra en
  `:161`. Los dos cuentan `sinAvisoPrevio` en el resultado
  (`sincronizar_gps.ts:78`, `sincronizar_eventos.ts:67`) para que el cron lo pinte.
  `tieneAvisoPrevio` y `unidadesSinAvisoPrevio` viven en un solo lugar
  (`privacidad.ts:1050,1087`) y fallan cerrado en los dos bordes
  (`:1066-1068`, `:1105`, `:1123`).
- **El CRÍTICO del `search_path` está cerrado y con red.** `0286:46` es la última
  definición (`0290` solo la menciona en un comentario; verificado con grep sobre
  las 279 migraciones) y trae `extensions`. Hay red estática
  (`arco_search_path.test.ts`) y red en base (bloque 234), que es exactamente lo
  que faltaba cuando la 0273 revirtió el arreglo.
- **El BAJO de la evidencia ARCO está cerrado bien.** `0286:113-117` captura
  `v_incidencias` **antes** de soltar `operador_id`, filtrando por
  `i.operador_id = v_operador`, y los dos `update` de `:120` y `:131` van contra
  `= any(v_incidencias)`. La evidencia ya no cuenta expedientes de otros titulares.
- **0289 ejecuta el «90 días» que el aviso promete para el pin de asistencia.**
  Purga `incidencia.lat/lng` y las llaves `lat`/`lng` de `incidencia_evento`,
  contando desde `resuelta_en` (correcto: con el expediente abierto la ubicación es
  la herramienta de la mesa), deja `geolocalizacion_purgada_en` para que el hueco no
  se lea como «nunca hubo pin», conserva el renglón del siniestro, tiene piso de
  30 días y su índice parcial, y corre dentro de `mantenimiento_de_datos` en su
  propio bloque de excepción.
- **LEG-9 y LEG-10 son ciertos contra el código.** `privacidad/page.tsx:124`
  ahora describe las tres cosas que `piloto_vision.ts:549,553-554` de verdad manda
  (inventario con los `hidden`, texto visible y captura), y `:130` nombra a Stripe
  como encargada — la integración existe (`/api/stripe/webhook`,
  `STRIPE_SECRET_KEY`).
- **LEG-12 cerrado en los cuatro documentos.** `vigenteDesde="2026-09-01"` en
  `/privacidad:194`, `/terminos:239`, `/aviso/prospectos:52` y `VIGENTE_DESDE` en
  `/aviso/[tenant]:37` — ninguno imprime ya `new Date()`.
- **La señal `gps` por flota es coherente entre aviso y poller.**
  `senalGpsFlota` (`repo.ts:1123-1141`) mide sobre `IDS_GPS_AVISO` =
  `CONECTORES_GPS`, y tanto `LECTORES_POSICION` como `LECTORES_EVENTOS` tienen hoy
  el mismo único proveedor (`samsara`). No hay flota que reciba «no tienes cámara
  conectada» mientras el poller le guarda eventos. Falla a `no_medible` (caso
  amplio) en los dos bordes.
- **La revocación de credenciales sí revoca.** `desactivarCredencial`
  (`credenciales.ts:479-508`) sobrescribe `valores_cifrados` con
  `revocada:<iso>` —no solo apaga la bandera— comprueba las filas tocadas, y apaga
  además la **sesión** del portal (`invalidarSesionPortal`), que es por donde el
  robot seguiría entrando con la cookie. El cofre es AES-256-GCM con IV nuevo por
  guardado y **lanza** si falta la llave en vez de guardar en claro
  (`cofre.ts:49-57`).
- **El servidor MCP minimiza de verdad.** `mcp/herramientas/viajes.ts:9-12` no
  devuelve el nombre del operador y lo razona; `dinero.ts` tampoco (grep de
  `operador`: cero). Es el criterio correcto, y por eso su ausencia en
  `chat-tools.ts` es un hallazgo y no una diferencia de opinión.
- **La oposición del art. 26 fr. II sigue operativa de punta a punta.**
  `pideAtencionPrivacidad` es determinística y corre antes del agente;
  `processor.ts:318-329` enciende `operador.oposicion_automatizada` solo cuando el
  tipo es `oposicion` y solo si estaba en NULL; `cuadre/engine.ts:525` emite la
  diferencia `oposicion_titular`, `cierre_aviso.ts:140` la clasifica `decision`
  (el cierre no puede ser automático) y `analytics.ts:337-345` excluye a ese
  operador de la lista de rendimiento. Es la lectura correcta de
  `normas/lfpdppp-26-II.yaml`.
- **El aviso simplificado sigue saliendo antes de cualquier tratamiento.**
  `processor.ts:1704-1725`: la compuerta está izada por encima de la rama «sin
  viaje abierto» (que descarga la foto y la manda al modelo de visión), distingue
  `sin_datos` de un blip de red en lo que le dice al chofer, y suelta el claim
  solo cuando el fallo es nuestro y transitorio.
- **`/aviso/[tenant]` se degrada diciendo qué falta.** Sin domicilio o sin
  contacto del art. 29 pinta la sección como `pendiente` y lo avisa arriba
  (`page.tsx:113-124`) en vez de un 404; sin razón social sí devuelve `notFound()`,
  que es lo correcto —un aviso sin responsable no dice a quién reclamarle—.
- **El filtro de sensibles colados por el ticket sigue en pie y con su límite
  dicho.** `sanitizar.ts:46-49` declara por escrito que reduce lo que se
  PERSISTE, no lo que se remite; `sanitizarProducto` descarta el valor entero en
  vez de dejar una etiqueta —guardar «[dato de salud omitido]» sigue siendo una
  inferencia de salud—.

---

## Lo que NO alcancé a revisar

- **`ticket_mensaje` / `soporte.ts` desde el ángulo de retención.** Confirmé por
  grep que no hay purga y que no toca ningún modelo (`grep openrouter|generate|llm`
  sobre `soporte.ts`: cero). No abrí `/admin/soporte` para ver si el superadmin lee
  tickets de todas las flotas ni qué se escribe en el cuerpo.
- **`cotizacion` (0225) y `mantenimiento` (0209).** Escritores nuevos; no verifiqué
  si tocan datos del operador ni si están en la fr. II. Sigue siendo el mismo
  pendiente que dejó la 23.
- **`copiloto-tools.ts` completo.** Miré `getConteosPlataforma` (solo conteos) y el
  catálogo de acciones; no recorrí las ~15 tools cross-tenant de `/admin` buscando
  nombres de operador como el que encontré en `chat-tools.ts`.
- **`herramientas/busqueda.ts` (`search`/`fetch` del MCP).** No verifiqué qué
  documentos puede alcanzar un cliente MCP por esa vía.
- **`docs/conocimiento/52-anexo-subencargados.md`** — tercera ronda seguida sin
  abrirlo. No puedo decir si Stripe, el PAC y Sentry están ahí aunque ahora sí
  estén en los avisos.
- **Los contratos** (DPA con la flota, con OpenRouter, con Stripe, con el PAC) y la
  **corrección del texto jurídico de LEG-1/LEG-2**: siguen fuera del código y
  fuera del alcance de una rutina desatendida, por la misma razón de siempre.
- **Ejecución y render.** No corrí `vitest` ni SQL ni levanté preview: todos los
  hallazgos son de lectura de código, migraciones y texto de aviso, con
  `archivo:línea` abiertos uno por uno.
