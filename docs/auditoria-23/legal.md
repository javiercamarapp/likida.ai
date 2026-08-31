# Cumplimiento legal — auditoría 23

**Nota: 5/10** (antes 5). Razón del movimiento: **ninguna de las tres formas
produjo movimiento neto, y decirlo así es el hallazgo**. Hay *se atacó y subió*
—`02d7837` metió al aviso los cuatro tratamientos que faltaban (voz, RFC y
licencia, salud, jornada) y los verifiqué uno por uno contra el código: los
cuatro son ciertos—, y hay *deuda que cobró factura* por el mismo importe: el
arreglo `df7725b` **reescribió `ejecutar_arco_cancelacion` partiendo del cuerpo
de la 0262 y borró el `search_path` que la 0264 había puesto para que la función
corriera en producción**. Es literalmente el patrón de falla que la 22 dejó
escrito como advertencia para hoy, cometido por el commit que la 22 escribió
para cerrar su propio ALTO. Y `5b64259` (LEG-C1) cerró **uno** de los dos crones
que tratan sin aviso: la compuerta entró a `jornada/derivar.ts` y no al poller
de GPS ni al de eventos de cámara, que corren en la misma invocación.

**El riesgo mayor del rubro, hoy:** el derecho de cancelación —el único ARCO que
este producto ejecuta con una RPC de verdad— vuelve a ser **inejecutable en
Supabase gestionado**, y la batería local no lo puede ver porque el `pgcrypto`
del andamio de CI vive en otro esquema.

---

## Hallazgos

### [CRÍTICO] La migración 0273 revierte el `search_path` de la 0264: la cancelación ARCO vuelve a tronar en producción antes de escribir nada
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:41`

> Lo que el aviso afirma (`src/lib/likida/privacidad.ts:666`):
> *"**Lo que no se puede borrar ni pidiéndolo:** la foto que ya es comprobante de
> un gasto […] Lo que sí puedes pedir es que se **desligue de tu persona**, y eso
> es lo que la cancelación ejecuta."*
> Y el panel (`src/app/dashboard/arco/page.tsx:90`): *"Cancelación ejecutada: el
> titular quedó anonimizado en la base —incluido el texto libre que escribió por
> el chat—"*.
>
> Lo que el código hace: `0273:41` declara
> `set search_path = public, pg_catalog` y `0273:70` llama `digest(...)` **sin
> calificar**. La 0264 existe exactamente para eso y lo dice en su encabezado
> (`0264:9-19`): *"ERROR: 42883: function digest(text, unknown) does not exist
> […] pgcrypto […] instalada en el esquema `extensions` […] así que CUALQUIER
> llamada sin calificar a `digest()` falla siempre"*. Su arreglo fue
> `0264:59`: `set search_path = public, extensions, pg_catalog`. La 0273 es la
> última definición de la función (no hay `create or replace` posterior;
> verificado con grep sobre `supabase/`) y **dejó caer `extensions`**.

**Escenario:** Juan Pérez escribe `PRIVACIDAD … quiero que borren mis datos` por
WhatsApp. `tipoDeSolicitudArco` (`privacidad.ts:814`) la clasifica
`cancelacion`, `registrarSolicitudArco` la asienta con `vence_en` a 20 días
hábiles. El contralor abre `/dashboard/arco` y aprieta **Ejecutar cancelación**.
`ejecutarCancelacionArco` (`repo.ts:1586`) llama la RPC; Postgres evalúa la
línea 70 y lanza `42883: function digest(text, unknown) does not exist`;
`repo.ts:1590` lo convierte en `throw` y la pantalla imprime
`No se pudo ejecutar la cancelación: …`. **Cero filas tocadas**: el `digest` va
ANTES del primer `delete from wa_conversacion` (`0273:76`). Nombre, teléfono,
RFC y licencia de Juan siguen en `operador`; su texto libre sigue en
`incidencia.descripcion`. El plazo del art. 31 sigue corriendo.

**Por qué CI no lo ve, y por qué esto lo agrava:** `0001_init.sql:6` hace
`create extension if not exists "pgcrypto"` sin esquema, así que en el Postgres
local del andamio (`supabase/pruebas-aislamiento/andamio_ci.sql:14-19`) pgcrypto
queda en `public` y `digest()` sin calificar **sí** resuelve. El bloque 210 de
`verificaciones.sql:8195` llama la función de verdad y espera `ok=t`: pasa en
verde. El propio repo ya escribió este razonamiento —
`migraciones_verificadas.test.ts:57`: *"el bloque 210 […] corre sobre el
Postgres LOCAL de CI, donde `andamio_ci.sql` instala pgcrypto en `public`, así
que digest() sin calificar YA resolvía ahí antes del fix; por eso el bloque
pasaba en verde en CI mientras la función fallaba en producción"*— y aun así se
revirtió el arreglo. No hay ninguna aserción sobre el `search_path` de esta
función en `verificaciones.sql` (grep de `extensions`: solo el bloque de
`pg_trgm`, línea 7458).

**Consecuencia:** el titular no puede ejercer cancelación; la flota
—responsable, art. 14— incumple el art. 31 con el expediente entero en contra
(la solicitud registrada, el `vence_en` vencido, y cero evidencia de ejecución).
Para Likida es el hueco de producto que `normas/lfpdppp-15-16.yaml` nombra: *"sin
el mecanismo, la flota no puede cumplir aunque quiera"*.

**Causa raíz probable:** la 0273 partió del cuerpo de la **0262** creyendo que
era el vigente, cuando el vigente era el de la **0264**; el `create or replace`
no avisa de lo que estás pisando.

(REINCIDENTE del defecto de la 0173/0178 que la 0264 ya había cerrado, y
reincidencia exacta del patrón que la 22 se advirtió a sí misma por escrito.)

---

### [CRÍTICO] LEG-C1 se cerró a la mitad: el poller de GPS y el de cámaras siguen tratando al operador que nunca recibió el aviso
`src/lib/likida/conectores/sincronizar_gps.ts:148-154` · `src/lib/likida/conectores/sincronizar_eventos.ts:143-160`

> Lo que el aviso afirma (`privacidad.ts:38-42`, el principio que el propio
> módulo escribe): *"credencial activa = el cron va a intentar traer posiciones,
> y el consentimiento tiene que ser PREVIO a la primera. Esperar a que haya
> filas en `posicion` sería avisar después de tratar."*
>
> Lo que el código hace: la compuerta de la 22 existe y es correcta, pero vive
> **solo** en `jornada/derivar.ts:309` (`if (!(await tieneAvisoPrevio(...)))
> { r.sinAvisoPrevio++; continue; }`). `sincronizar_gps.ts` y
> `sincronizar_eventos.ts` **no la llaman ni la importan**: grep de
> `aviso_privacidad_en|tieneAvisoPrevio|ponerAvisoADisposicion` sobre
> `src/lib/likida/conectores/` → cero coincidencias. Y
> `ponerAvisoADisposicion` sigue teniendo un solo llamador real
> (`processor.ts:1248` y `:1403`, ambos en el camino del mensaje entrante).

**Escenario:** «Transportes del Bajío» activa su credencial Samsara en
`conector_credencial` el lunes y da de alta a Juan en `/dashboard/operadores`
(teléfono, RFC, licencia). Juan recibe sus viajes por radio y **no escribe nunca
por WhatsApp**, así que `operador.aviso_privacidad_en` sigue en `NULL`. El cron
`/api/cron/gps` (cada 5 min) escribe la posición de la unidad 12 en `posicion`
(`sincronizar_gps.ts:149`) —288 filas al día— y en la misma invocación
`sincronizar_eventos.ts:144` escribe en `evento_seguridad_flota` cada evento de
la cámara de esa unidad. El derivador de jornada, correctamente, se abstiene y
suma `sinAvisoPrevio`. Resultado: el expediente laboral no se construye, pero
**el rastro de posiciones y el historial de conducta al volante sí**, y Juan
sigue sin haber visto un aviso.

**Consecuencia:** art. 16 fr. II incumplido sobre la categoría de dato más
invasiva del producto. El expuesto es Juan; la sancionable es la flota (art. 14,
`normas/lfpdppp-15-16.yaml`). El cron de jornada al menos **lo dice**
(`api/cron/jornada/route.ts:106-107` emite el motivo); el de GPS ni siquiera
cuenta cuántos operadores está rastreando sin aviso — no hay señal de que el
hueco exista.

**Causa raíz probable:** la compuerta se puso donde estaba el hallazgo escrito
(la jornada) y no donde está el principio (el inicio del tratamiento); los dos
pollers entran por otra puerta y comparten cron.

(REINCIDENTE parcial de LEG-C1 de la auditoría 22.)

---

### [ALTO] Los eventos de la cámara: se guarda TODO el comportamiento al volante del operador, sin enumerarlo, sin finalidad declarada y sin plazo de borrado
`src/lib/likida/conectores/sincronizar_eventos.ts:18,144-157` · `supabase/migrations/0203_eventos_seguridad_flota.sql:6-7,51`

> Lo que el aviso afirma (`privacidad.ts:601-666`, la fr. II completa): enumera
> nombre, teléfono, fotos de comprobantes, contenido de mensajes, avisos del
> viaje, GPS de la unidad, notas de voz, RFC y licencia, y el dato de salud del
> accidente. Grep de `camara|cámara|video|conducci|frenad|distrac` sobre
> `privacidad.ts` y `src/app/privacidad/page.tsx`: **cero coincidencias.**
> Y el aviso cierra la fr. III con su propio candado (`privacidad.ts:709`):
> *"Cualquier finalidad que no esté escrita aquí requiere que te vuelvan a pedir
> permiso. La ley vigente ya no permite ampararse en usos 'compatibles o
> análogos'."*
>
> Lo que el código hace: `sincronizar_eventos.ts:18` — *"**TODO evento** entra a
> `evento_seguridad_flota` (el futuro agente de coaching leerá de ahí)"*. El
> upsert (`:145-157`) guarda `etiquetas` (los behavior labels crudos del
> proveedor), `max_g`, `lat`, `lng`, `url_evento` y `ocurrido_en`, ligados a
> `unidad_id`. Solo `crash`/`harshimpact`/`rolloverprotection` son «graves»
> (`eventos_seguridad.ts:74`); todo lo demás se guarda igual. Las pruebas del
> repo nombran los que NO son graves: `GenericDistraction`, `MobileUsage`,
> `ForwardCollisionWarning`, `HarshTurn`, `Braking`
> (`eventos_seguridad.test.ts:34-36`).

**Escenario:** Juan maneja la unidad 12 con cámara Samsara. Un miércoles genera
`['MobileUsage']` a las 14:03 en el km 84 y `['HarshTurn','Braking']` a las
14:41. Ninguno es grave, así que nadie recibe alerta y ninguna pantalla los
muestra (grep de `evento_seguridad_flota` en `src/`: **solo escritores**,
`sincronizar_eventos.ts:144,175,210`). Se quedan en la base con su
`url_evento` al video del proveedor, su hora y sus coordenadas —**para
siempre**: no hay `purgar_evento_seguridad_flota` (grep de `purgar_` sobre las
migraciones; `mantenimiento_de_datos` de la 0258 lista 15 purgas y esa tabla no
está en ninguna), y la cancelación ARCO de la 0273 tampoco la toca.

**Consecuencia:** un expediente de conducta profesional del operador —«usó el
celular manejando»— recolectado sin enumerar el dato (fr. II), sin declarar la
finalidad (fr. III, y con la válvula de «usos análogos» cerrada por el propio
aviso), sin plazo de conservación (art. 11) y sin destinatario actual: la
finalidad real está escrita como *futura* en el comentario. Es exactamente
recolectar hoy para una finalidad que todavía no existe.

**Causa raíz probable:** la 0203 declaró por escrito que guarda todo «para el
agente de coaching, fuera de alcance hoy», y ese «fuera de alcance» se aplicó
también al aviso y a la purga.

---

### [ALTO] «Se borra a los 90 días» es falso para dos de los tres almacenes donde acaba la geolocalización del operador
`src/lib/likida/privacidad.ts:255,257,258,625,627,628` · `src/lib/likida/asistencia_wa.ts:329-339`

> Lo que el aviso afirma, en los dos documentos y en las tres ramas del renglón
> de GPS. Simplificado (`privacidad.ts:255`): *"si compartes tu ubicación por el
> chat, también se guarda y la ve tu jefe. **Se borra a los 90 días.**"*
> Integral (`privacidad.ts:625`): *"Las posiciones se conservan **90 días** y
> después se borran solas."*
>
> Lo que el código hace: el pin que el chofer manda por el chat se escribe en
> **dos** tablas. `processor.ts:2830` llama `registrarUbicacionChofer`, que
> inserta en `posicion` (`processor.ts:148-152`) —esa sí la purga
> `purgar_posicion(90, …)` dentro de `mantenimiento_de_datos`
> (`0258:…purgar_posicion(90, p_ahora, vence)`)—; y acto seguido
> `processor.ts:2835` llama `anclarUbicacionIncidencia`, que escribe las mismas
> coordenadas en `incidencia.lat/lng` (`asistencia_wa.ts:329-336`) y las repite
> en `incidencia_evento.detalle` como `{lat, lng}` (`asistencia_wa.ts:339`).
> **Ni `incidencia` ni `incidencia_evento` aparecen en ninguna purga.** La
> tercera copia es `evento_seguridad_flota.lat/lng` (hallazgo anterior),
> tampoco purgada.

**Escenario:** Juan reporta una avería el 1-mar-2026 y el bot le pide su
ubicación; manda el pin en el km 84 de la 57. Se escriben: `posicion`
(borrada el 30-may-2026 por el cron `/api/cron/purgar`), `incidencia.lat=20.71,
lng=-100.44` y `incidencia_evento.detalle={"lat":20.71,"lng":-100.44}`. El
1-jun-2026 el operador pregunta qué queda de su ubicación: el aviso le dijo que
nada, y quedan dos filas con la coordenada exacta y la hora, indefinidamente.

**Consecuencia:** el plazo del art. 15 (y el principio de calidad del art. 11)
se afirma en el documento con el que la flota prueba su cumplimiento, y el
producto no lo ejecuta para dos de los tres destinos. Es la misma clase de falla
que el CRÍTICO de salud de la 22 —afirmación activa desmentida por el código—,
solo que del lado del plazo. **Mitigante honesto:** la cancelación ARCO de la
0273 sí suelta `incidencia.operador_id`, así que tras una cancelación la
coordenada queda desligada; sin cancelación, no.

**Causa raíz probable:** la cifra de 90 días se escribió contra
`purgar_posicion` (mig. 0155), que es donde vive el único almacén que el autor
tenía en la cabeza; la 0198 abrió dos más y nadie volvió al plazo.

---

### [ALTO] El parte de incidente saca el dato de salud del operador y el teléfono de su familiar de la flota hacia la bandeja de Likida, donde ninguna purga y ninguna cancelación ARCO los alcanzan
`src/lib/likida/agentes/direccion.ts:540,586,588,593,768` · `src/lib/likida/agentes/cola.ts:124-128`

> Lo que el aviso afirma (`privacidad.ts:666`): *"si avisas por el chat de un
> accidente o una emergencia, se guarda **si hay personas lesionadas** y el
> texto con el que lo describes, **para poder escalarlo a tu empresa** y
> atenderlo."* Y (`privacidad.ts:324`): *"Likida procesa esta información por
> cuenta de la empresa, siguiendo sus instrucciones."*
> La 0273 fijó además su propia regla (`0273:148`): *"regla para la próxima
> TABLA: si guarda texto que el titular escribió, entra a esta función."*
>
> Lo que el código hace: `correrEspecialistasIncidente` barre
> `incidencia` **sin filtro de tenant** (`direccion.ts:642-647`) y encola
> `armarParteIncidente(...)` (`direccion.ts:768`). El cuerpo del parte lleva,
> en texto plano: `· Operador: <nombre>` (`:586`), `· Descripción: <la
> descripción que escribió el chofer>` (`:588`), `· ¿Hay lesionados? SÍ,
> CONFIRMADO en el expediente.` (`:593`) y, con lesionados, la línea de la
> familia: `${c.nombre} (${c.parentesco}) — familia de ${inc.operadorNombre}` con
> `numero: c.telefono` (`:537-544`). `encolarPieza` lo inserta en
> `cola_aprobacion.cuerpo` (`cola.ts:124-128`), que se lee desde
> `/admin/aprobaciones` y `/admin/tu-turno` — consola de superadmin
> (`admin/tu-turno/page.tsx:38`, `requireSuperadmin()`), cruzando tenants a
> propósito.

**Escenario:** Juan escribe *"chocamos en la 57, traigo un herido, me duele el
pecho"*. `lesionadosSegunTexto` devuelve `true`, `incidencia.hay_lesionados =
true`, `incidencia.descripcion` guarda la frase. La corrida de
`especialistas_incidente` arma el parte y lo encola: en la bandeja de Javier
aparece *"· Operador: Juan Pérez · Descripción: chocamos en la 57, traigo un
herido, me duele el pecho · ¿Hay lesionados? SÍ, CONFIRMADO · 1. María Pérez
(esposa) — familia de Juan Pérez — 55 5512 3456"*. Semanas después Juan pide
cancelación y el contralor la ejecuta: la 0273 sustituye
`incidencia.descripcion` (`0273:94-99`) y `incidencia_evento.detalle->>texto`
(`0273:105-117`), anonimiza `operador` y `app_user` — y **no toca
`cola_aprobacion`**. La única purga que existe sobre esa tabla borra piezas de
**prospectos fríos** (`0258:188`, `delete from public.cola_aprobacion ca` dentro
de `purgar_prospecto_persona`); una pieza `parte_incidente` tiene
`prospecto_id` NULL y no cae. El panel le dice al contralor *"el titular quedó
anonimizado en la base —incluido el texto libre que escribió por el chat—"*
(`arco/page.tsx:90`) mientras la frase íntegra, con su nombre y el teléfono de
su esposa, sigue viva.

**Consecuencia:** (a) un dato **sensible** (salud, art. 3 fr. VI; agravante del
art. 59 fr. IV, `normas/lfpdppp-59.yaml`) sale del perímetro que el aviso
describe —«escalarlo a tu empresa»— hacia el buzón operativo de Likida; (b) el
dato de una **tercera persona** que nunca vio ningún aviso viaja con él; (c) la
cancelación ARCO que el producto firma como ejecutada deja el texto intacto en
una tabla que la 0273 no censó, incumpliendo la regla que la propia 0273
escribió. **Mitigante:** el lector es un único superadmin autenticado y
`direccion.ts:764-767` sí razona el punto para `fuentes` (*"los teléfonos NO
viajan en `fuentes` […] esparciría datos personales por una columna que nadie
mira"*) — pero los mete en `cuerpo`, que es la columna que sí se lee y sí
persiste.

**Causa raíz probable:** el censo de LEG-A4 se hizo sobre las tablas de
`asistencia_wa.ts` (las que el hallazgo citaba) y no sobre las que **copian** ese
texto después.

---

### [MEDIO] El contacto de emergencia del operador sigue sin aparecer en ningún aviso — y la cancelación tampoco lo borra
`src/lib/likida/emergencias.ts:265-276` · `src/lib/likida/privacidad.ts:601-666`

> Lo que el aviso afirma: la fr. II (`privacidad.ts:601-666`) enumera nueve
> categorías tras el arreglo de la 22. Grep de `familiar|contacto de
> emergencia|contactoEmergencia` sobre `privacidad.ts` y
> `src/app/privacidad/page.tsx`: **cero coincidencias.**
>
> Lo que el código hace: `crearContactoEmergencia` inserta nombre, teléfono y
> parentesco de un familiar (`emergencias.ts:265-276`, tabla de la
> `0198:93-105`); el propio comentario de la migración lo dejó escrito:
> *"esta fila guarda a un familiar que nunca aceptó ningún aviso de privacidad
> […] y el aviso de privacidad del operador debe declararlo antes de que se
> capture el primero"*.

**Escenario:** el contralor captura «María Pérez, 55 5512 3456, esposa» con la
casilla «avisar si hay lesionados». María queda en la base sin aviso propio, sin
constar en el aviso de Juan, y `ejecutar_arco_cancelacion` (0273) no la toca:
si Juan cancela, el teléfono de su esposa sigue en `contacto_emergencia` ligado
a un `operador_id` que ya es un seudónimo.

**Consecuencia:** dato de un tercero identificado, revelador de una relación
familiar, tratado sin ninguna base informativa y sin camino de baja.

**Causa raíz probable:** `02d7837` atacó las cuatro categorías que la 22 marcó
CRÍTICO/ALTO y dejó fuera la que marcó MEDIO.

(REINCIDENTE — MEDIO de la auditoría 22.)

---

### [MEDIO] El piloto de facturación sigue mandando al modelo el DOM completo y el texto visible del portal con la sesión abierta; ninguno de los dos avisos lo dice
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:473-483` · `src/app/privacidad/page.tsx:118`

> Lo que el aviso afirma (`privacidad/page.tsx:118`): al modelo le llegan *"los
> datos fiscales de tu empresa (RFC, razón social, código postal, régimen fiscal,
> uso CFDI y el correo de recepción) junto con capturas de pantalla del portal de
> facturación del comercio"*. Enumeración cerrada de seis campos y una captura.
>
> Lo que el código hace, en **cada paso**: el mensaje de usuario lleva
> `JSON.stringify({ campos: inv.campos.filter((c) => c.visible || c.type ===
> 'hidden'), botones … })` (`piloto_vision.ts:478`) —o sea el inventario con los
> `type="hidden"` **y su valor**— y `Texto visible:\n${inv.texto}`
> (`piloto_vision.ts:480`), el texto renderizado completo de la página. Con
> `arrancoConSesion = true` (`:468`) esa página es el portal del comercio con la
> sesión de la flota abierta.

**Escenario:** la flota factura un ticket de Pemex con sesión iniciada. La
pantalla trae arriba «Bienvenido, Ana López — analopez@transportesbajio.mx» y
abajo la tabla de las últimas 20 facturas con sus folios y montos. Todo eso, más
los `input[type=hidden]` con el id de sesión del formulario, viaja a OpenRouter
en el mensaje de usuario junto con la captura. La lista del aviso no lo cubre.

**Consecuencia:** la enumeración del art. 15 fr. II y la cláusula del art. 35
declaran **menos** de lo que sale, que es el sentido peligroso del error.

**Causa raíz probable:** la corrección de la ronda 21 auditó el `system` (donde
están los seis campos, `:457-463`) y no el mensaje de usuario.

(REINCIDENTE — MEDIO de la auditoría 22.)

---

### [MEDIO] La cláusula de transferencias de `/privacidad` omite al procesador de pagos, que recibe RFC, razón social y correo del cliente
`src/app/privacidad/page.tsx:118` · `src/lib/saas/stripe.ts:337-357`

> Lo que el aviso afirma: la lista de encargadas es taxativa —*"alojamiento de
> aplicación y base de datos, mensajería de WhatsApp, envío de correo […]
> monitoreo de errores, y los modelos de lenguaje"*— y la fr. II cierra con
> *"**No se tratan datos sensibles**, ni se piden datos bancarios o de tarjeta"*.
>
> Lo que el código hace: `crearSuscripcionTransferencia` crea un customer en
> Stripe con `email: fiscales.email` y el RFC como `tax_id`
> (`stripe.ts:337-357`), y `stripe.ts:509` expone *"el portal donde el cliente
> cambia su tarjeta o cancela"*.

**Escenario:** el contralor de «Transportes del Bajío» contrata el plan. Su
correo, el RFC y la razón social se crean como customer en Stripe (EE. UU.). Un
titular que lea `/privacidad` para saber a qué terceros llegan sus datos no
encuentra al procesador de pagos en la lista.

**Consecuencia:** inventario de subencargadas incompleto en el documento del
art. 35. Menor que los anteriores porque el titular es el cliente (no el
operador) y el dato es sobre todo fiscal-empresarial, pero el correo y la
identidad de la persona sí viajan.

(REINCIDENTE parcial — la 22 lo listó junto con el PAC; el PAC sí se corrigió,
el procesador de pagos no.)

---

### [BAJO] La evidencia de la cancelación ARCO cuenta filas de expedientes de OTROS titulares
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:111-116`

> Lo que el código hace: el `update incidencia_evento` filtra por
> `e.incidencia_id in (select i.id from incidencia i where i.tenant_id =
> p_tenant **and i.texto_anonimizado_en is not null**)` — o sea, TODOS los
> expedientes ya anonimizados de la flota, no los de este titular. El
> `get diagnostics n` de la línea 117 alimenta
> `evidencia.incidencia_evento_texto_anonimizado`.

**Escenario:** María canceló en abril y sus 6 eventos quedaron marcados. Juan
cancela en agosto y tiene 3 eventos propios. La RPC toca 9 filas (las 6 de
María se re-escriben con la misma marca, sin cambio real) y la evidencia que
queda en `solicitud_arco.evidencia` dice
`"incidencia_evento_texto_anonimizado": 9`.

**Consecuencia:** la constancia que la flota exhibiría ante la autoridad afirma
un alcance mayor que el ejercido. No hay fuga de dato; es un rótulo que no es
verdad, dentro del documento probatorio.

**Causa raíz probable:** el subquery se ancló al sello `texto_anonimizado_en`
(que ya se acababa de escribir) en vez de a `v_operador`.

---

## El aviso actualizado por `02d7837`, contrastado contra el código

Afirmación por afirmación, con la línea que la sostiene o la desmiente.

| Afirmación del aviso | Dónde | Veredicto |
|---|---|---|
| «Las **notas de voz** […] se transcriben a texto para poder atenderlas» | `privacidad.ts:648` | **CUBIERTA** — `processor.ts:1248` pone el aviso antes de transcribir y `voz_transcrita.ts:106` manda el audio; el flujo es el descrito. |
| «También les llegan **tus notas de voz**, completas, para transcribirlas» (transferencias) | `privacidad.ts:771` | **CUBIERTA** — `voz_transcrita.ts:106` (`audios:[{data: base64}]`) hacia OpenRouter, con `data_collection:'deny'` en la puerta. |
| «tanto el audio como su transcripción **quedan en la conversación**» | `privacidad.ts:648` | **IMPRECISA (no reportada como hallazgo)** — Likida no persiste el audio: `voz_transcrita.ts:87` lo descarga de Meta a un data-URL efímero y no lo guarda. Declara de MÁS, no de menos, así que no daña al titular; pero un ARCO de acceso sobre «mis notas de voz» no tiene qué entregar. |
| «Tu **RFC** y el **número de tu licencia** […] cuando tu empresa emite un complemento Carta Porte» | `privacidad.ts:653` | **CUBIERTA** — `carta_porte_xml.ts:183-185` emite `RFCFigura`/`NumLicencia`. |
| «el comprobante viaja al **PAC** que lo timbra […] y dentro de él van tu RFC y el número de tu licencia» | `privacidad.ts:772` | **CUBIERTA** — `pac/sw.ts:105`. |
| «**Un dato de salud, y solo uno:** […] se guarda **si hay personas lesionadas** y el texto con el que lo describes» | `privacidad.ts:666` | **CUBIERTA en lo esencial**, con dos matices: `incidencia.tipo='emergencia_medica'` (`0198:25`) es un segundo indicio de salud no nombrado, y el «y solo uno» convive con dos cosas guardadas. No lo levanto como hallazgo: la sustancia —que se guarda salud, para qué y con qué límite— ya está dicha, que era el CRÍTICO. |
| «para poder escalarlo **a tu empresa** y atenderlo» | `privacidad.ts:666` | **FALSA en su alcance** — también se escala a la bandeja de Likida (`direccion.ts:768` → `cola_aprobacion`). Ver ALTO del parte de incidente. |
| «No se usa para tu liquidación ni para evaluarte» | `privacidad.ts:666` | **CUBIERTA** — `hay_lesionados` no entra a `cuadre/engine.ts` ni a `getStatsPorOperador`; sus únicos lectores son el escalamiento y el parte. |
| «**Fuera de ese caso no se piden ni se conservan datos sensibles**» | `privacidad.ts:666` | **CUBIERTA** — `intake/sanitizar.ts` sigue excluyendo lo que se cuela por el ticket, con su límite declarado. |
| «Derivar tu **registro de jornada** […] a partir de esas mismas posiciones (LFT 132 fr. XXXIV). Puedes oponerte» | `privacidad.ts:707` | **CUBIERTA** — `jornada/derivar.ts:351-377` deriva de la primera y última posición; va entre las NO necesarias, que es donde toca. |
| «Cualquier finalidad que no esté escrita aquí requiere que te vuelvan a pedir permiso» | `privacidad.ts:709` | **DESMENTIDA por el propio producto** — `evento_seguridad_flota` guarda comportamiento al volante para «el futuro agente de coaching» (`0203:6-7`), finalidad que no está escrita. Ver ALTO de cámaras. |
| «La **posición GPS de la unidad** […] Las posiciones se conservan **90 días** y después se borran solas» | `privacidad.ts:625,628` | **FALSA para dos de los tres almacenes.** Ver ALTO de retención. |
| «**Tu teléfono no se rastrea:** el dispositivo de rastreo es del camión» | `privacidad.ts:625` | **CUBIERTA** — `sincronizar_gps.ts:133-142` escribe siempre contra `unidad_id`; el único dato del teléfono es el pin que el operador manda. |
| «Lo que sí puedes pedir es que se **desligue de tu persona**, y eso es lo que la cancelación ejecuta» | `privacidad.ts:666` | **FALSA HOY EN PRODUCCIÓN** — la RPC truena antes de escribir. Ver CRÍTICO 1. |
| «la empresa tiene **20 días hábiles** para contestarte» | `privacidad.ts:735` | **CUBIERTA** — `venceArco` cuenta 20 días hábiles (`privacidad.ts:824-836`). |
| «recibes el aviso nuevo por el mismo WhatsApp […] el sistema calcula una firma del texto y reenvía» | `privacidad.ts:795-796` | **CUBIERTA** — `versionAviso` (FNV-1a, `:347`) contra `operador.aviso_privacidad_version`; el texto por flota del GPS le da hash distinto, que es lo que dispara el reenvío. |
| «Escribe **PRIVACIDAD** por el mismo chat […] Tu solicitud queda registrada» | `privacidad.ts:725` | **CUBIERTA** — `pideAtencionPrivacidad` es determinística y corre antes del agente; `processor.ts:1021-1039` la atiende incluso para el operador dado de baja. |
| «A esos modelos en cada llamada se les **pide** explícitamente que no retengan» | `privacidad.ts:766` | **CUBIERTA** — `openrouter.ts:273-278`, `data_collection:'deny'` en las tres puertas. El verbo «pide» sigue siendo el correcto. |

**Conclusión del contraste:** de las cuatro afirmaciones que `02d7837` añadió,
**las cuatro son ciertas**. El aviso ya no describe un producto distinto en esos
cuatro puntos, y eso es trabajo real. Lo que sigue roto es el borde que ninguno
de los cuatro tocó: el alcance del escalamiento, el plazo de conservación, y la
categoría de dato que entró por la cámara.

---

## Lo que revisé y está bien

- **La compuerta de jornada, LEG-C1.** `jornada/derivar.ts:192-211` falla cerrado
  en los dos bordes (error de lectura ⇒ `false`, con `logger.error`), memoiza por
  corrida y limpia la memo en cada arranque (`:274`), y va **antes** de
  `asegurarDiaJornada` con el motivo escrito (`:302-312`): crear el expediente ya
  es tratamiento. El cron lo declara en la respuesta HTTP, no solo en el log
  (`api/cron/jornada/route.ts:98,105-107`), y lo pinta `parcial`. Es el mejor
  arreglo de la ronda 22 en este rubro.
- **El resto del cuerpo de `ejecutar_arco_cancelacion` sí se conservó verbatim.**
  Comparé `0273:50-68` contra `0264:68-86`: las tres guardas (solicitud de otra
  flota, tipo distinto de `cancelacion` con el mensaje específico de `oposicion`,
  «ya estaba cerrada») están íntegras, y el formato del seudónimo
  (`'Operador ' || upper(substr(...,1,6))`) es idéntico. La advertencia de la 22
  se atendió en todo **salvo** en el `set search_path` de la cabecera.
- **El nuevo `update incidencia`** (`0273:94-99`) es correcto en criterio: marca
  explícita en vez de vaciar (un campo vacío se leería «no escribió nada»),
  suelta `operador_id`, y el guardián `texto_anonimizado_en is null` lo hace
  idempotente.
- **`getStatsPorOperador` excluye a quien ejerció la oposición**
  (`analytics.ts:337-358`): el filtro va en SQL y el nombre se seudonimiza salvo
  `{nominal:true}`. Es la lectura correcta del art. 26 fr. II — el conteo de
  diferencias de una persona es justo la señal a la que se opuso.
- **`riesgo.ts` nunca dice «cumple»** (`jornada/riesgo.ts:16-27,46-54`): el tipo
  `Veredicto` no tiene ese valor, y una jornada derivada de GPS nunca baja una
  bandera, solo la levanta. Con el contralor decidiendo, el supuesto «sin
  intervención humana» del art. 26 fr. II no se activa —que es exactamente lo que
  `normas/lfpdppp-26-II.yaml` dice en su `nota_verificacion`.
- **`revisarAvisoIntegral`** (`privacidad.ts:131-162`): frontera de palabra, con
  los cuatro dominios medidos en el comentario. `transportistaindependiente.mx`
  sigue pasando.
- **La cadena de purgas que sí existe.** Verifiqué una por una las seis que
  `/privacidad` promete contra `mantenimiento_de_datos` (`0258`): wa_mensaje 30,
  api_idempotencia 7, correo_procesado 90, agente_corrida 180, wa_conversacion
  180, codigo_pendiente 180. **Las seis cifras del aviso coinciden con el código.**
- **El aviso de prospectos** (`privacidad.ts:895-972`): declara los dos orígenes
  (raspado e inferido), el `fbclid`, la purga a 365 días que la 0258 ejecuta, y
  que el nombre no viaja al modelo. La afirmación de `:936` («tu nombre no sale de
  Likida») está respaldada por el seudónimo del mapa de prospectos.
- **`avisoSimplificado` degradado** (`privacidad.ts:329-331`): manda el aviso sin
  liga en vez de callarse, y el texto distinto le da hash distinto, así que el día
  que la flota publique su integral el aviso bueno se reenvía solo.

---

## Lo que NO alcancé a revisar

- **El ciclo de soporte de la 0268 (`ticket_mensaje`) desde el ángulo de datos
  personales.** Confirmé que los autores son `app_user` y que el cuerpo es texto
  libre (`soporte.ts:280-288`), y que **no hay purga** de esa tabla; no verifiqué
  si el contenido llega a un modelo ni si el superadmin lee tickets de todas las
  flotas. Es el mismo patrón del parte de incidente y merece una pasada propia.
- **`cotizacion` (0225) y `mantenimiento` (0209)**, escritores nuevos desde la 22.
  No los abrí: no sé si tocan datos del operador ni si están en la fr. II.
- **El copiloto del dashboard** (`agents/copiloto*.ts`, ~8 archivos) y qué
  devuelven sus tools al modelo. La regla estructural de `properties: {}` cierra
  la entrada, no la salida.
- **`docs/conocimiento/52-anexo-subencargados.md`** — sigue sin abrir (la 22
  tampoco lo alcanzó). No puedo decir si Stripe, el PAC y Sentry están listados
  ahí aunque falten en los avisos.
- **Retención de `incidencia`, `incidencia_evento`, `jornada_dia`,
  `jornada_asiento`, `coordinacion_proveedor` y `cola_aprobacion`.** Confirmé por
  grep que ninguna aparece en `mantenimiento_de_datos` ni en una purga hermana;
  no barrí las 274 migraciones una por una para descartar un mecanismo distinto.
- **Los contratos** (DPA con la flota, contrato con OpenRouter, con Stripe, con
  el PAC). Viven en papel; `normas/lfpdppp-2-XII-XX.yaml` dice que la
  calificación de encargada no quita el pendiente contractual. Fuera del código.
- **Render de pantallas.** No levanté preview ni tomé screenshots: todos los
  hallazgos son de lectura de código, SQL y texto de aviso.
- **Ejecución.** No corrí `vitest` ni SQL: el CRÍTICO 1 es por construcción
  invisible al Postgres local de CI (el propio repo lo documenta en
  `migraciones_verificadas.test.ts:57`), así que una corrida verde no lo habría
  refutado. Se comprueba en Supabase gestionado con
  `select prosrc, proconfig from pg_proc where proname='ejecutar_arco_cancelacion'`.
