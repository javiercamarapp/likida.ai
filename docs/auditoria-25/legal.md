# Cumplimiento legal — auditoría 25

**Nota: 5/10** (antes 7). Razón del movimiento: **mirada más profunda** — el
código de este rubro **no cambió una sola línea** desde el cierre de la 24
(`git log b8a1a3a..HEAD -- src/lib/likida/privacidad.ts src/lib/agents/chat-tools.ts
src/lib/likida/agentes/direccion.ts docs/legal/ src/app/privacidad src/app/aviso
src/lib/likida/conectores/` devuelve **vacío**), así que no hay deterioro: los
tres ALTO siguen ahí byte por byte. Lo que cambió es la lectura. La 24 se puso
7 con **un flujo de dato personal identificado hacia un modelo externo que
ningún aviso enumera** ya escrito en su propia primera página; su rúbrica dice
*«3 o menos si hay transferencia de datos personales sin cobertura»*. Y esta
ronda encontró **un segundo flujo igual**, en la otra mitad del producto (la
máquina de prospección, donde Likida no es encargada sino **responsable**), más
un camino de revocación que no revoca. Con dos salidas descubiertas y la baja
rota, el 7 no se sostiene contra sus propias anclas.

**El riesgo mayor del rubro, hoy:** Likida tiene **dos** avisos que describen
menos de lo que su código manda a OpenRouter —el del operador (nombre + anticipo
por el chat del panel) y el del prospecto (su nombre, correo y teléfono, leídos
del sitio de su empresa y extraídos por el modelo)—, y en el segundo Likida es
la **responsable**, no la encargada: la sanción no la absorbe la flota.

---

## Hallazgos

### [ALTO] El aviso de prospectos no nombra al modelo de lenguaje entre sus encargadas — y el investigador le manda el texto de las páginas y le pide extraer nombre, correo y teléfono de personas
`src/lib/likida/privacidad.ts:1012` · `src/lib/likida/agentes/investigador.ts:356-363,58-63` · `src/lib/likida/agentes/runner.ts:216,1065`

Base normativa: LFPDPPP (2025) art. 15 fr. II y fr. III, y art. 35 leído con el
art. 2 fr. XII y XX (`normas/lfpdppp-15-16.yaml`, `normas/lfpdppp-2-XII-XX.yaml`,
ambas `verificado_fuente_primaria`). Art. 15: *"El aviso de privacidad deberá
contener, al menos… II. Los datos personales que serán sometidos a
tratamiento… III. Las finalidades del tratamiento"*. Aquí la **responsable es
Likida**, no la flota — lo dice el propio encabezado del módulo
(`privacidad.ts:880-884`).

> Lo que el aviso afirma, y es la cláusula **taxativa** del art. 35
> (`privacidad.ts:1012`): *"**No se venden ni se comparten con nadie para que
> los use por su cuenta.** Pasan por proveedores que trabajan por instrucción de
> Likida —**alojamiento de la base de datos, envío de correo y mensajería**—,
> que la ley llama personas encargadas (art. 2 fr. XII)…"*. Tres renglones. **El
> proveedor de modelos no está.** El único lugar donde el aviso menciona un
> modelo es `:986`, y lo hace para **negar** el flujo: *"Cuando un programa
> redacta el primer mensaje, **tu nombre no sale de Likida**: la ficha que
> recibe el modelo de lenguaje lleva un marcador en lugar de tu nombre, y sin
> tus datos de contacto"*.
>
> Lo que el código hace: el investigador (id de catálogo `enriquecedor`) baja
> hasta 4 páginas del sitio de la empresa y manda al modelo, verbatim,
> `Empresa: <nombre>\n\n=== PÁGINA: <url> ===\n<texto visible, 12,000 caracteres
> por página>` (`investigador.ts:350-363`). Y el esquema que le impone
> (`:58-63`) le pide exactamente lo contrario de minimizar:
> `correos: [{ correo, contacto_nombre, puesto, fuente }]`,
> `telefonos: [{ telefono, fuente }]`, con el `describe` *"TODOS los correos que
> aparecen en las páginas"*. No hay seudonimización en el camino: `generateStructured`
> recibe el texto crudo.

**Escenario:** el prospecto «Transportes del Norte» tiene en
`transportesdelnorte.mx/contacto` la ficha *"Ing. Laura Méndez — Gerente de
Operaciones — lmendez@transportesdelnorte.mx — 81 8123 4567"*. El runner
despacha `enriquecedor` en su vuelta de cada 4 horas (`runner.ts:216,1065`); la
página se descarga y su texto sale hacia `openrouter.ai/api/v1` con esa ficha
adentro; el modelo devuelve `{"correo":"lmendez@transportesdelnorte.mx",
"contacto_nombre":"Laura Méndez","puesto":"Gerente de Operaciones"}`, que se
persiste en `prospecto_correo`. Laura nunca contrató nada, es una persona
física identificada, y el aviso que le corresponde —el que va al pie de cada
primer toque (`pieAvisoProspectos()`)— le dice que sus datos pasan por
alojamiento, correo y mensajería, y que **su nombre no sale de Likida**.

**Consecuencia:** el titular es Laura; la sancionable es **Likida** (art. 14),
no una flota cliente. La frase de `:986` no es solo una omisión: es una
afirmación positiva y falsa dentro del documento probatorio, sobre el punto que
más caro sale (salida al extranjero, con Google/Anthropic/OpenAI debajo de
OpenRouter según el enrutado —`docs/conocimiento/52-anexo-subencargados.md`,
renglones 2a/2b/2c). El contraste que lo hace hallazgo y no interpretación: el
repo **sí** pensó este problema para el Redactor (`mapa-prospectos/mensaje/seudonimo.ts`,
citado en `privacidad.ts:899-901`) y por eso pudo escribir la frase de `:986`; no
volvió a mirar el otro agente de la misma máquina, que además es el que **cosecha**
los datos de persona.

**Causa raíz probable:** la frase del `:986` se escribió midiendo el Redactor
—el único agente de prospección que existía cuando se redactó el aviso (auditoría
18)— y el investigador (0217) entró después, con su propia llamada al modelo y
sin releer la cláusula.

---

### [ALTO] «Contesta BAJA y se borran tus datos de persona» — el BAJA no borra nada, y además reinicia el reloj de 12 meses que sí borraría
`src/lib/likida/privacidad.ts:994-995` · `src/lib/correo/respuesta_campana.ts:92,115` · `src/lib/likida/agentes/enviador.ts:358-370` · `supabase/migrations/0258_purga_satelites_prospecto.sql:146-149`

Base normativa: LFPDPPP (2025) art. 15 fr. IV — *"Las opciones y medios que el
responsable ofrezca a las personas titulares para limitar el uso o divulgación
de los datos"* (`normas/lfpdppp-15-16.yaml`, literal verificado) — y el derecho
de cancelación del art. 15 fr. V. Responsable: **Likida**.

> Lo que el aviso promete (`privacidad.ts:994`, sección «Cómo pedir que dejemos
> de contactarte», fundamento art. 15 fr. IV): *"Contesta **BAJA** al mismo
> mensaje que recibiste, o escribe a **<contacto>**. Se deja de contactarte y
> **se borran tus datos de persona**; **se te confirma por escrito**."* Y `:995`:
> *"Si no contestas nunca, también se borran solos: a los 12 meses **sin ningún
> contacto**…"*.
>
> Lo que el código hace al recibir un BAJA por respuesta de correo
> (`respuesta_campana.ts:86-130`):
> 1. `:92` → `suprimirCorreo(remitente, 'baja pedida (respuesta de campaña)')`,
>    que es un `insert` en `correo_suprimido` (`enviador.ts:358-370`). Eso
>    **añade** un dato personal (su correo, para siempre, como lista de
>    supresión); no borra ninguno.
> 2. `:115` → un `insert` en `prospecto_contacto` con
>    `resumen: 'Contestó pidiendo BAJA: «<asunto>»'` y `ocurrio_en default now()`
>    (`0118_prospecto_contacto.sql:35`).
> 3. Nada más. No hay un solo `delete`/`update` sobre `prospecto_persona`,
>    `prospecto_correo` ni sobre las columnas de persona de `prospecto` (grep de
>    `prospecto_persona` en `src/`: solo lecturas —`prospectos-mapa.ts`,
>    `leads.ts`—, cero escritores destructivos). Tampoco se cambia
>    `prospecto.estado`.
>
> Y el paso 2 tiene efecto contrario al prometido. El único borrado real es
> `purgar_prospecto_persona`, cuyo filtro de frialdad es
> (`0258:146-149`): `and not exists (select 1 from prospecto_contacto c where
> c.prospecto_id = p.id and c.ocurrio_en >= limite)`. La fila que el propio BAJA
> acaba de escribir cae dentro de la ventana.

**Escenario, con valores:** Laura recibe el correo frío el 3-sep-2026 y contesta
«BAJA». A las 3-sep-2026 12:04 se escribe `correo_suprimido('lmendez@…')` y
`prospecto_contacto(prospecto_id=P, canal='correo', direccion='respuesta',
resumen='Contestó pidiendo BAJA: «Re: Cuánto se te va en cuadrar viajes»',
ocurrio_en=2026-09-03T12:04Z)`. Su nombre, puesto, correo y teléfono siguen en
`prospecto_persona` y en `prospecto.contacto_nombre/correo/telefono`. El cron
nocturno evalúa el 4-sep: `P` tiene un `prospecto_contacto` con
`ocurrio_en >= now()-365d` → **no es frío** → no se borra nada. Y no volverá a
serlo hasta el **3-sep-2027**. Antes de contestar BAJA, a Laura le faltaban
—digamos— 40 días para la purga automática; por ejercer su derecho, le quedan
365. Además nunca recibe la confirmación escrita que el aviso promete: el único
mensaje que sale es `alertarOperador('campania.respuesta', …)`
(`respuesta_campana.ts:122-128`), que va **hacia adentro**, a Likida.

*(La otra vía, el enlace de un clic —`api/correo/baja/route.ts:87`— hace lo
mismo: `suprimirCorreo` y nada más; ahí sí hay una página «Listo» en pantalla,
que no es una confirmación por escrito de un borrado que no ocurrió.)*

**Consecuencia:** el mecanismo que el aviso ofrece bajo la fr. IV entrega lo
contrario de lo que anuncia, y la afirmación es verificable por el propio
titular: pide su baja, y a los 20 días hábiles pide acceso — sus datos siguen
completos. Con 33,298 prospectos y 6,524 correos fríos ya enviados con esa liga
al pie (cifras del propio `privacidad.ts:995` y del comentario de
`/aviso/prospectos:19`), es la promesa más repetida del producto hacia afuera.

**Causa raíz probable:** «dejar de contactarte» (supresión de envío) y «borrar
tus datos de persona» (cancelación) se escribieron como una sola frase en el
aviso, y en el código son dos mecanismos distintos de los que solo se cableó el
primero; nadie releyó el filtro de frialdad desde el lado del titular que **sí**
contesta.

---

### [ALTO] El chat del panel manda el nombre del operador y el anticipo de sus viajes al modelo externo; la cláusula de transferencias del aviso no lo cubre
`src/lib/agents/chat-tools.ts:172` · `src/lib/likida/privacidad.ts:807` · `src/lib/agents/analista.ts:43`
**(REINCIDENTE — ALTO de la auditoría 24. Verificado hoy: idéntico, línea por línea.)**

Base normativa: LFPDPPP art. 15 fr. II y art. 35.

Verificación de esta ronda: `chat-tools.ts:172` sigue devolviendo
`anticipo: v.anticipo, operador: v.operadorNombre` dentro de `viajes_flota`
(hasta 25 renglones por llamada, `:169-175`), la tool sigue en `TOOLS_LECTURA`
del analista, y `privacidad.ts:807` sigue siendo la misma lista taxativa —
*"les llegan **las fotos de tus comprobantes** … y **el texto de tus mensajes**"*—
sin un renglón para el nombre del operador pegado a un monto. El repo sigue
tomando la decisión contraria donde sí la pensó (`mcp/herramientas/viajes.ts:9-12`,
*"MINIMIZACIÓN: el nombre del operador NO se devuelve"*).

**Escenario y consecuencia:** los de la 24, sin cambio. Lo que sí cambia es el
peso: ya no es un flujo descubierto, son **dos** (con el hallazgo #1), y el
patrón se lee como sistémico y no como un olvido puntual.

**Causa raíz probable:** la cláusula del art. 35 se escribió pensando en el
canal de WhatsApp del operador; el chat del panel entró por otra puerta con las
mismas tools de lectura.

---

### [ALTO] La compuerta de LEG-1 no cubre a la unidad sin viaje vivo: el evento de cámara —con la liga al video del chofer— se guarda igual, sin aviso
`src/lib/likida/privacidad.ts:1110` · `src/lib/likida/conectores/sincronizar_eventos.ts:161,168-185`
**(REINCIDENTE — ALTO de la auditoría 24. Verificado hoy: idéntico.)**

Base normativa: LFPDPPP art. 16 fr. II (el aviso va **antes** del tratamiento
por medio electrónico) y art. 14.

Verificación de esta ronda: `privacidad.ts:1110` sigue siendo
`if (operadorPorUnidad.size === 0) return { sinAviso };` — con el mapa
unidad→operador construido **solo** desde `viaje` con
`estatus in ('abierto','en_cuadre')` (`:1098-1104`). Sin viaje vivo, el conjunto
«sin aviso» sale vacío, `sincronizar_eventos.ts:161`
(`if (unidadId && sinAviso.has(unidadId)) continue;`) no filtra nada, y el upsert
de `:163-183` escribe `etiquetas`, `lat`, `lng`, `ocurrido_en` y **`url_evento`**
—la liga al video donde se ve quién va al volante, que el propio aviso describe
como dato del chofer (`privacidad.ts:646`)—. `base.sinAvisoPrevio` queda
`undefined` y el cron late `ok`: ni siquiera hay señal de que el hueco existe.

**Causa raíz probable:** la compuerta se ancló al `viaje` (la única tabla que
liga unidad↔persona hoy) y se aceptó «sin viaje = sin persona» sin separar la
posición —donde el argumento vale— del evento con video, donde no.

---

### [ALTO] El parte de incidente sigue sacando el dato de salud y el nombre del familiar del operador hacia la bandeja interna de Likida, fuera del alcance de toda purga y de la cancelación ARCO
`src/lib/likida/agentes/direccion.ts:540,586,601,625-628,639,792` · `supabase/migrations/0286_arco_por_telefono_normalizado.sql`
**(REINCIDENTE — ALTO de la auditoría 24, que a su vez venía de la 23. Verificado hoy: idéntico.)**

Base normativa: LFPDPPP art. 2 fr. VI (dato sensible) con el agravante del
art. 59 fr. IV (`normas/lfpdppp-59.yaml`), y art. 15 fr. II.

Verificación de esta ronda, línea por línea:
`:586` y `:639` — `· Operador: ${inc.operadorNombre}`, dos veces.
`:601` — `· ¿Hay lesionados? SÍ, CONFIRMADO en el expediente.`
`:540` — `${c.nombre}${c.parentesco ? ` (${c.parentesco})` : ''} — familia de
${inc.operadorNombre}`, impreso por `:624` (el arreglo de la 24 ocultó **el
número**, `:625-627`; el nombre, el parentesco y el vínculo se quedaron).
`:542` — el `respaldo` con *"HAY LESIONADOS CONFIRMADOS en el expediente"*.
`:792` — `lesionados: inc.hayLesionados` en `fuentes`, la misma bandera de salud
en el jsonb que el comentario de `:782-785` dice reservar para no *"esparcir
datos personales por una columna que nadie mira"*.

Y la salida sigue cerrada: `ejecutar_arco_cancelacion` (0286, última definición)
no toca `cola_aprobacion` (grep sobre las 281 migraciones: la única purga de esa
tabla es `0258:188`, y solo borra piezas cuyo `prospecto_id` cae en el conjunto
de prospectos fríos — una pieza `parte_incidente` tiene `prospecto_id` NULL,
`direccion.ts:786-796` no lo pasa). `docs/legal/RETENCION.md:41` lo sigue
reconociendo por escrito: *"LEG-5 — **NO CERRADO por `legal`**"*.

**Consecuencia:** la confirmación que el producto le manda al titular por
WhatsApp al ejecutar la cancelación —*"tu nombre y tu teléfono ya no están
ligados a tu información en el sistema"* (`repo.ts:1615-1618`)— es literalmente
falsa mientras esa pieza siga en la bandeja.

**Causa raíz probable:** el arreglo de la 24 quitó los dos campos que el
hallazgo de la 23 citaba textualmente y no volvió a leer el resto del parte,
donde el vínculo salud↔persona↔familiar se reconstruye entero.

---

### [MEDIO] El anexo de subencargados —el documento al que `/privacidad` remite por escrito— no tiene a Stripe ni a Cal.com, y Cal.com guarda el nombre, el correo y las respuestas del prospecto 365 días
`docs/conocimiento/52-anexo-subencargados.md:53-64` · `src/app/privacidad/page.tsx:131` · `src/lib/admin/calcom.ts:92-100` · `src/app/api/webhook/calcom/route.ts:71` · `supabase/migrations/0245_purga_prospecto_entera_y_ledger_comercial.sql:124-148`

Base normativa: art. 15 fr. II (enumerar los datos tratados) y art. 35 leído con
art. 2 fr. XII (identificar a las encargadas).

> Lo que `/privacidad` promete (`page.tsx:131`): *"El detalle de esos
> subencargados está en la documentación del producto y **se actualiza cuando
> cambia**."* El documento al que apunta es
> `docs/conocimiento/52-anexo-subencargados.md`, fechado 28-jul-2026 y que se
> presenta como *"la cadena real… derivado del código, no de suposiciones"*.
>
> Lo que falta en esa cadena de 8 renglones (grep de `stripe|cal\.com|PAC` sobre
> el archivo: **cero coincidencias**):
> · **Stripe**, cableado (`src/lib/saas/stripe.ts`, `/api/stripe/webhook`) y ya
>   declarado como encargada en `/privacidad` por la propia auditoría 24
>   (LEG-10). El aviso lo nombra; la «cadena real» no.
> · **Cal.com**, que recibe y almacena la reserva de demo del prospecto.

Y sobre Cal.com hay además un dato no enumerado: el webhook guarda el **payload
íntegro** del proveedor (`route.ts:71` → `calcom.ts:92-100`,
`payload: input.payload` sin filtro alguno) en `comercial_evento.payload`. El
comentario de la propia migración que lo purga lo dice con todas sus letras
(`0245:148`): *"vacía payload (ahí vive lo personal que Cal.com manda entero —
**nombre, correo, respuestas**)"*, y lo hace a los **365 días**. El aviso de
prospectos enumera nombre, puesto, correo, teléfono, perfil, y los
identificadores de campaña (`privacidad.ts:970-977`); **las respuestas libres que
la persona escribe al agendar no están**, ni el plazo de 365 días de ese
renglón.

**Escenario:** Laura agenda la demo y escribe en «¿Algo que debamos saber?»:
*"Mi jefe no sabe que estoy viendo esto, escríbanme a mi correo personal"*. Ese
texto queda en `comercial_evento.payload` un año, visible para cualquier
superadmin, y ni `/aviso/prospectos` lo enumera ni la cadena de subencargados
nombra a quien lo recibió primero. Si además pide BAJA, el hallazgo anterior
aplica: nada se borra.

**Atenuante honesto:** `/api/webhook/calcom` devuelve 503 sin
`CALCOM_WEBHOOK_SECRET` (`route.ts:42-43`), así que el flujo depende de que la
integración esté encendida en el entorno; el de Stripe no tiene ese atenuante.

**Causa raíz probable:** el anexo se escribió como foto del código en una fecha
y no como artefacto con dueño; cada integración nueva (Resend sí entró en ago;
Stripe y Cal.com no) depende de que alguien se acuerde.

---

### Reincidentes menores verificados hoy — sin cambio, y por eso solo se enuncian

No repito su desarrollo (está completo en `docs/auditoria-24/legal.md`); confirmo
que siguen ahí, con la línea abierta:

- **[MEDIO]** El aviso dice que los eventos de cámara *"Hoy no tienen una fecha
  de borrado automático"* (`privacidad.ts:646` y `:649`) mientras
  `purgar_evento_seguridad_flota(180, 365)` los borra
  (`0288_purga_outbox_eventos_e_indices_posicion.sql:84-115`). REINCIDENTE.
- **[MEDIO]** `docs/legal/RETENCION.md` sigue anclado a *"la definición vigente
  al 1-sep-2026"* de la 0258 (`:3-10`) y sigue afirmando «sin purga» para
  `incidencia.lat/lng` (`:36`), `incidencia_evento.detalle` (`:37`) y
  `evento_seguridad_flota` (`:38`) — las tres purgadas por 0288/0289 —, y le
  sigue faltando la fila de `wa_outbox`. REINCIDENTE.
- **[MEDIO]** `contacto_emergencia` sigue sin plazo, sin baja y fuera de
  `ejecutar_arco_cancelacion` (0286). REINCIDENTE (viene de la 22).
- **[BAJO]** Tres razonamientos siguen citando la LFPDPPP **abrogada** para
  definir dato personal y dato sensible: `privacidad.ts:301` («art. 3 fr. IX»),
  `:668` («art. 3 fr. V») y `:680` («art. 3 fr. VI»). En la ley de marzo-2025 el
  artículo de definiciones es el **2** (`normas/lfpdppp-2-XII-XX.yaml`).
  REINCIDENTE.

---

## Lo que revisé y está bien

- **La graduación de los 9 agentes teatro (0303) no abre ninguna puerta de datos
  personales.** Los nueve son deterministas y ninguno llama a un modelo
  (`0303_gradua_agentes_experimentales_auditados.sql:32-40`; grep de
  `openrouter|generateStructured|generateResponse` sobre
  `crecimiento.ts`/`ingenieria_producto.ts`/`leads.ts`: cero). El único que toca
  la base de personas es `cazador`, y lee **solo** campos de empresa —
  `id, empresa, estado, scian, ciudad, num_unidades, created_at`
  (`leads.ts:1519-1526`) y `estado, scian, ciudad, num_unidades` (`:1557-1562`) —
  más un conteo de `prospecto_contacto` (`:1576-1585`). Ningún nombre, ningún
  correo, ningún teléfono en su pieza. El candado que la graduación quita es el
  del runner (`runner.ts:698-699`), y sigue **detrás** del kill switch
  (`runner.test.ts:1025-1029` lo prueba en ese orden).
- **El resto de la máquina de leads sí minimiza, y por eso el hallazgo #1 es un
  hallazgo y no una diferencia de opinión.** `correrScorer` lee campos de
  empresa y un conteo de correos, nunca el correo (`leads.ts:376-424`);
  `correrDossier` —el único que sí imprime personas— pasa `d.id` como
  `prospectoId` al encolar (`leads.ts:701-707`), así que su pieza **sí** entra al
  `delete from cola_aprobacion` de `0258:188` cuando el prospecto se enfría. Es
  exactamente el cableado que le falta al `parte_incidente`.
- **El aviso simplificado sigue saliendo antes de cualquier tratamiento del
  comprobante.** `processor.ts:1698-1725`: la compuerta está izada por encima de
  la rama que descarga la foto y la manda al modelo de visión, distingue
  `sin_datos` de un blip de red en lo que le dice al chofer, y solo suelta el
  claim cuando el fallo es nuestro y transitorio.
- **La compuerta de LEG-1 en el caso principal (unidad con viaje vivo) sigue en
  pie y falla cerrado.** `unidadesSinAvisoPrevio` devuelve `error` en los dos
  bordes de lectura (`privacidad.ts:1105,1123`) y los dos pollers abortan la
  flota entera antes de escribir (`sincronizar_gps.ts:208-219`,
  `sincronizar_eventos.ts:141-155`), contando `sinAvisoPrevio` para el cron.
- **El ciclo de soporte de la 0268 no manda tickets a ningún modelo.**
  `src/lib/likida/soporte.ts` no importa nada de `@/lib/llm` (grep de
  `openrouter|generate`: cero); `ticket_mensaje` se escribe con `autor_id` y
  `cuerpo` acotado (`:261-290`) y la lectura verifica pertenencia antes de tocar
  la tabla (`:185-198`, que no tiene `tenant_id`). Sigue sin purga, y
  `RETENCION.md` ya lo declara así — no lo cuento dos veces.
- **La ejecución de la cancelación ARCO es real y en el orden correcto.**
  `repo.ts:1592-1618`: el teléfono se lee **antes** de la RPC (después ya está
  anonimizado), la confirmación sale **después** de que la RPC confirmó, y
  `0286:113-117` sigue capturando `v_incidencias` antes de soltar `operador_id`.
- **La revocación de credenciales de portal revoca de verdad.**
  `credenciales.ts:479-508` sobrescribe `valores_cifrados` con `revocada:<iso>`,
  comprueba filas tocadas e invalida además la sesión del portal; el cofre lanza
  si falta la llave en vez de guardar en claro (`cofre.ts:49-57`).
- **El servidor MCP sigue minimizando** (`mcp/herramientas/viajes.ts:9-12`, sin
  nombre de operador) y **el filtro de sensibles del OCR sigue cableado y con su
  límite escrito** (`sanitizar.ts:46-49`: reduce lo que se **persiste**, no lo
  que se remite — dicho, no escondido).
- **`/privacidad`, `/terminos`, `/aviso/prospectos` y `/aviso/[tenant]` siguen
  con `vigenteDesde` fijo** (`2026-09-01`), ninguno imprime `new Date()`.

---

## Lo que NO alcancé a revisar

- **`copiloto-tools.ts` a fondo.** Abrí las 14 tools por su `registerTool` y leí
  `bandeja`, `bitacora`, `ficha_cliente`, `pipeline_ventas` y `estado_runner`.
  Hay tres salidas de dato personal hacia el modelo que **no pude cerrar como
  hallazgo** porque no logré escribir el escenario con valores reales: el
  `asunto` libre de un ticket (`escalaciones.ts:318` → `bandeja`), el `actor`
  (correo) de la bitácora (`copiloto-tools.ts:314`) y el nombre del vendedor
  (`:252`). Quien retome esto: la pregunta es si `/privacidad` («el texto de tus
  mensajes y consultas») cubre el asunto de un ticket ajeno leído por el
  superadmin. **No lo resolví.**
- **`herramientas/busqueda.ts` (`search`/`fetch` del MCP)** — tercera ronda sin
  abrirlo. No sé qué documentos alcanza un cliente MCP por esa vía.
- **`cotizacion` (0225) y `mantenimiento` (0209)** — escritores vivos desde la
  23; no verifiqué si tocan datos del operador ni si están en la fr. II. Mismo
  pendiente que dejaron la 23 y la 24.
- **El PAC.** El aviso del operador promete que el Carta Porte —con su RFC y su
  licencia— viaja a un PAC (`privacidad.ts:813`). No verifiqué si existe hoy una
  integración real de timbrado (`facturapi` se retiró del `package.json` el
  28-jul) ni, por tanto, si esa cláusula declara de más o de menos.
- **Los contratos** (DPA con la flota, con OpenRouter, con Stripe, con Cal.com,
  con el PAC) y la **redacción jurídica** de los avisos: fuera del código y
  fuera del alcance de una rutina desatendida.
- **Ejecución y render.** No corrí `vitest` ni SQL ni levanté preview: todos los
  hallazgos son de lectura de código, migraciones y texto de aviso, con cada
  `archivo:línea` abierto por mí.
