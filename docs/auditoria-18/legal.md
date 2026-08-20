# Cumplimiento legal — auditoría 18

**Nota: 6/10** (antes 6). Razón del movimiento: **no se mueve — deuda que cobró
factura**. El carril del operador se atacó y subió de verdad (el gate de
tratamiento ya bloquea la foto sin aviso, el integral existe y se sirve, la
solicitud ARCO se registra y la oposición del art. 26 fr. II enciende revisión
humana en el motor, el filtro de sensibles está cableado, la purga corre por
cron): ese carril solo valdría 8. Lo que lo detiene es el hueco que el anexo
lleva anotado desde el 28-jul —*"aviso de privacidad propio de Likida para sus
usuarios directos […] **los leads**"*, `docs/conocimiento/52-anexo-subencargados.md:226`—
y que **esta ronda dejó de ser un pendiente de papel**: la 0138 y el Cerebro de
prospectos empezaron a guardar y a mandar a un modelo externo los nombres de
personas decisoras con las que Likida no tiene ninguna relación. Una advertencia
que ya ocurrió no es advertencia.

**El riesgo mayor hoy:** Likida es *responsable* (no encargada) de una población
entera de titulares —los decisores de las empresas prospecto— para la que no
existe aviso, ni consentimiento, ni canal ARCO, ni plazo de conservación, y sus
nombres ya salen hacia OpenRouter.

## Hallazgos

### [CRÍTICO] El nombre del decisor de un prospecto sale hacia un modelo externo sin que exista un solo aviso que lo cubra

`src/app/api/admin/mapa-prospectos/mensaje/route.ts:64,74,83` ·
`src/lib/admin/prospectos-mapa.ts:250,278` ·
`supabase/migrations/0138_prospecto_persona.sql`

**Escenario, con el dato nombrado.** Un agente de investigación levanta del
censo/DENUE/LinkedIn a *"Ing. Ramón Treviño, Director de Operaciones"* de una
transportista de Escobedo y lo escribe en `prospecto.contacto_nombre` (o en
`prospecto_persona.nombre/puesto/correo/telefono`, tabla creada esta ronda).
Javier abre el Cerebro y pulsa "generar primer toque". La ruta lee
`contacto_nombre` (:64), lo mete literal en la ficha —`Decisor: ${p.contacto_nombre}`
(:74)— junto con `notas` recortadas a 1,500 caracteres (:76), y manda todo por
`generateStructured` a OpenRouter → `gpt-5.6-luna` (:80-89). Ese mismo nombre,
además, **puntúa a la persona/empresa**: `scoreCierre` suma +20 por
`contacto_nombre` y +10 por cada persona con contacto verificado (:250, :278), y
el resultado ordena a quién se llama primero.

**Consecuencia.** El titular afectado es Ramón Treviño, una persona física que
nunca contrató nada con Likida y no sabe que existe. Aquí Likida **no es persona
encargada**: decide sobre esos datos, o sea es **responsable** (art. 14). El
art. 14 obliga a informarle a la persona titular, por aviso, la existencia y
características principales del tratamiento; el art. 16 fr. II obliga a
proporcionar el aviso simplificado cuando los datos se obtienen por medio
electrónico —y raspar una bolsa de trabajo o un directorio *es* medio
electrónico—. No hay aviso: `/privacidad` se acota expresamente a *"quien
contrata y usa el servicio"* (`src/app/privacidad/page.tsx:50`), `/terminos` es
el contrato con la flota, y el aviso de `/aviso/[tenant]` es el de la flota
frente a sus operadores. En el esquema de prospectos (0105, 0118, 0128-0139) no
existe una sola columna de consentimiento, de aviso puesto a disposición ni de
solicitud ARCO, y `mantenimiento_de_datos` (0104) no purga nada de `prospecto`:
el dato se queda para siempre.

*Intento de refutación, que no prospera:* el art. 9 puede eximir del
**consentimiento** cuando el dato figura en fuentes de acceso público. Eso no
exime del **aviso** (arts. 14 y 16), que es una obligación autónoma, ni del
plazo de conservación, ni de darle un camino ARCO. Y `origen: 'inferido'` de la
0138 es la confesión de que parte de esos correos ni siquiera vienen de una
fuente pública: se dedujeron.

**Causa raíz probable.** El producto tiene dos sombreros y solo escribió el
documento de uno: todo el aparato legal se construyó para "Likida encargada de
la flota", y la maquinaria de adquisición creció después sin que nadie la
reclamara como tratamiento con Likida de responsable.

---

### [ALTO] "Diferencias por operador" es un ranking nominal de personas, y el aviso promete lo contrario

`src/lib/likida/analytics.ts:283-334` · `src/app/dashboard/agentes/liquidacion/page.tsx:81-85` ·
`src/app/dashboard/agentes/liquidacion/vista.tsx:217-226` ·
promesa contradicha en `src/lib/likida/privacidad.ts:541`

**Escenario, con el dato nombrado.** *Juan Pérez*, chofer, cierra ocho viajes.
`getStatsPorOperador` cruza `operador.nombre` contra `liquidacion.diferencia` y
devuelve `{ nombre: 'Juan Pérez', viajes: 8, dieselTotal: 41230.50, diferencias: 3 }`
(:327-333). La página filtra a los que tienen `diferencias > 0`, los **ordena de
mayor a menor** y se queda con los seis primeros (`page.tsx:82-85`); la vista los
pinta como barras bajo el título *"Diferencias por operador — Liquidaciones con
diferencia, por operador"* (`vista.tsx:218-226`). Juan Pérez aparece en el
primer lugar de una lista de sospecha, con su nombre, en la pantalla de su
patrón.

**Consecuencia.** El titular es el operador. El aviso integral que él recibió
enumera las finalidades y, entre las no necesarias, escribe literalmente:
*"Medir cómo funciona el servicio para mejorarlo (estadísticas de uso, **sin
identificarte en los reportes**)"* (`privacidad.ts:541`). Este reporte lo
identifica. Ninguna otra finalidad lo cubre: la que sí está enunciada es
*"revisar si un comprobante viene repetido o alterado […] y entregarle ese
resultado a la empresa"* (`privacidad.ts:535`), que es por comprobante — una
diferencia de cuadre no es una duplicidad, y un conteo acumulado por persona no
es "ese resultado". El art. 15 fr. III obliga a enunciar las finalidades, y el
art. 11 vigente perdió las palabras *"compatible o análogo"* (así lo dice el
propio aviso en `privacidad.ts:542`): una finalidad no escrita exige
consentimiento nuevo. El propio `DOCUMENTO-MAESTRO.md:61` ya lo tenía anotado:
*"ranking de operadores/fraude requiere aviso de privacidad + revisión humana"*.
Agravante: la consulta no mira `operador.oposicion_automatizada`, así que el
operador que **ya ejerció** la oposición del art. 26 fr. II —y a quien el motor
sí honra en el cierre— sigue apareciendo en el ranking.

**Causa raíz probable.** La pantalla se diseñó como KPI de operación y nadie
volvió a cruzar la lista de finalidades del aviso contra lo que las pantallas de
verdad enseñan.

---

### [ALTO] Una solicitud ARCO se pierde sin registro cuando al tenant le falta la razón social

`src/lib/likida/processor.ts:207-252` (el `if (datos)` de :210 envuelve el
`registrarSolicitudArco` de :219; la rama sin datos es :250-251)

**Escenario, con el dato nombrado.** *Juan Pérez* escribe por WhatsApp
`"quiero que borren mis datos"` desde el 5219993700779.
`pideAtencionPrivacidad` lo reconoce (`privacidad.ts:372`) y llama a
`atenderPrivacidad`. Si su flota no capturó `razon_social` o `domicilio_fiscal`,
`getDatosResponsable` devuelve `null` (`repo.ts:766`) y el flujo salta al `else`
implícito: escribe una línea de log y le contesta *"Déjame checarlo con la
empresa y te confirmo por aquí. 🙏"* (:250-251). **No se inserta nada en
`solicitud_arco`**, no se calcula `vence_en`, y por tanto la solicitud no aparece
en `/dashboard/arco` ni en la guardia (`src/lib/admin/guardia.ts:73`). Nadie va a
confirmarle nada.

**Consecuencia.** El titular ejerció su derecho de cancelación y el sistema le
devolvió una promesa de seguimiento que ningún registro sostiene. El art. 15 fr.
V exige que el mecanismo ARCO sea real, y el art. 31 le da a la responsable 20
días hábiles para contestar, plazo que aquí nunca empieza a correr porque no hay
constancia. Es exactamente el hallazgo que ya se cerró una vez (`repo.ts:956`:
*"el aviso promete 'queda registrada tu solicitud' y la tabla existía sin un solo
insert"*) y que sobrevive en esta rama. Nótese que `registrarSolicitudArco`
acepta `operadorId: null` y `titularRef` es el teléfono: **no necesita los datos
del responsable para escribir la fila**; el acoplamiento es accidental.

**Causa raíz probable.** Se metió el registro dentro del `if` que existía para
decidir *qué texto contestar*, y se acopló "tener a quién señalar como
responsable" con "dejar constancia de que alguien pidió algo".

---

### [MEDIO] El panel del cliente cita, en pantalla, el artículo de la ley abrogada

`src/app/dashboard/arco/page.tsx:80` (texto visible) · también en
`src/lib/admin/escalaciones.ts:244`, `src/lib/admin/guardia.ts:73` (dos veces),
`src/app/admin/compliance/page.tsx:33`, `src/lib/likida/repo.ts:958`,
`src/lib/likida/privacidad.ts:642`

**Escenario, con el dato nombrado.** El contralor entra a
`/dashboard/arco` a atender la solicitud de *Juan Pérez* y lee bajo el título:
*"Solicitudes de tus operadores y cómo responderlas a tiempo (LFPDPPP art. 32:
20 días hábiles)"*. La tabla de equivalencias del propio repo, verificada contra
el texto vigente, dice que los plazos ARCO son el **art. 31** de la ley de 2025
y que el art. 32 es la numeración de la **ley abrogada de 2010**
(`docs/conocimiento/11-datos-personales.md:48` y `:656`).

**Consecuencia.** El afectado inmediato es el cliente responsable, a quien el
producto le entrega un fundamento derogado para sostener su cumplimiento ante la
Secretaría Anticorrupción y Buen Gobierno. El propio repo fijó la regla —
*"si tu abogado o cualquier blog te cita 'el artículo 16 de la LFPDPPP' […] está
citando la ley abrogada"* (`11-datos-personales.md:44`)—. Caso peor dentro del
mismo hallazgo: `privacidad.ts:642-644` no solo cita mal, **razona** con la ley
vieja: *"La LFPDPPP art. 32 fija 15, pero el DOCUMENTO dice 20 […] Si el aviso
cambia a 15, que este número lo siga"*, y le deja a quien venga la instrucción de
bajar el plazo apoyándose en un artículo que ya no existe. El valor ejecutado
(`DIAS_HABILES_ARCO = 20`, :645) sí coincide con el art. 31 vigente; lo que está
mal es el fundamento impreso y el razonamiento que lo acompaña.

**Causa raíz probable.** La renumeración se documentó en `docs/` y se aplicó al
aviso, pero nunca se barrió el resto del código en busca de la numeración vieja.

---

### [MEDIO] El aviso acota los modelos de lenguaje a "las fotos", y también viaja el texto del chofer

`src/lib/likida/privacidad.ts:592` · `src/app/privacidad/page.tsx:79` ·
camino real en `src/lib/likida/processor.ts:2160-2201`

**Escenario, con el dato nombrado.** *Juan Pérez* escribe por WhatsApp
*"jefe, me quedé varado en Sabinas, gasté 600 de la grúa y ando malo del
estómago desde ayer"*. `processor.ts:2160` arma `turns = [...conv.turns, { role:
'user', content: msg.text }]` y `runAgent` (:2189) manda ese historial completo
—verbatim— por `generateWithTools` a OpenRouter → Claude Sonnet. La cláusula de
transferencias del aviso que Juan leyó dice que sus datos pasan por *"el
proveedor de mensajería de WhatsApp, el de alojamiento de la base de datos, y
**los modelos de lenguaje que leen las fotos**"* (`privacidad.ts:592`).

**Consecuencia.** El titular es el operador. La sección "Qué datos se tratan"
sí enumera *"el contenido de tus mensajes en esa conversación"*
(`privacidad.ts:512`), así que el dato no está oculto; lo que está mal enunciado
es **hacia dónde sale**: quien lee la cláusula del art. 35 concluye que lo que
escribe se queda dentro y solo sus fotos salen. Es el mismo defecto que la
auditoría 8 ya corrigió una vez en este mismo párrafo (nota en :584-589) —
describir el flujo real y no una versión más cómoda de él—. El filtro
`sanitizarProducto` no ayuda aquí: solo actúa sobre el campo `producto` del OCR,
nunca sobre el texto libre del chat.

**Causa raíz probable.** El párrafo se escribió cuando el único consumo de modelo
era el OCR de comprobantes, y el agente conversacional creció después sin volver
a tocarlo.

---

### [MEDIO] El correo de acceso metió una credencial de sesión en la cadena de Resend/AWS y el anexo de subencargados no lo dice

`src/app/api/auth/correo/route.ts:182` · `src/lib/correo/auth.ts:164-170` ·
`src/lib/correo/enviar.ts:97-122` · anexo incompleto en
`docs/conocimiento/52-anexo-subencargados.md:63`

**Escenario, con el dato nombrado.** El contralor teclea su correo en `/login`.
Supabase Auth dispara el Send Email Hook, la ruta arma la liga de verificación
—`/auth/v1/verify?token=<token_hash>&type=magiclink…` (`auth.ts:164-170`)— y la
manda con `enviarCorreo(destino, correo, { remitenteLocal: 'acceso' })`
(:182), es decir por `api.resend.com` y, según el DNS que el propio anexo
documenta, por Amazon SES. Lo que atraviesa esos dos terceros es la **dirección
de correo de una persona identificada más la llave de un solo uso que abre su
sesión**. El renglón 6 del anexo describe la salida como *"el correo de quien
recibe el aviso y el contenido del aviso (folios, número económico, conteos)"* —
la clase de dato que aquí viaja es de otro orden y no aparece.

**Consecuencia.** El titular es el usuario de la flota, de quien Likida sí es
responsable (`/privacidad`). El anexo es el documento con el que Likida acredita
su cadena de subencargados ante un contralor o ante la autoridad
(Regl. arts. 54-55); un anexo que omite la clase de dato más sensible que pasa
por un eslabón describe una cadena distinta de la real. `/privacidad:79` menciona
*"envío de correo para **los avisos del panel**"*, redacción que tampoco alcanza
al correo de acceso.

**Causa raíz probable.** El subsistema de correo se documentó cuando solo mandaba
avisos; el hook de Auth llegó el 18-ago y nadie volvió al anexo.

---

### [BAJO] El aviso integral publicado cita la fracción equivocada para "persona encargada"

`src/lib/likida/privacidad.ts:503`

**Escenario, con el dato nombrado.** *Juan Pérez* abre `/aviso/<tenant>` desde
WhatsApp y lee en la primera sección: *"Likida opera la herramienta […] es
**persona encargada** (art. 2 fr. XX)"*. La fr. XX es la definición de
**Transferencia**; "Persona encargada" es la **fr. XII** — así lo transcribe
literal la ficha verificada `normas/lfpdppp-2-XII-XX.yaml`, y así lo cita
correctamente el encabezado del mismo archivo (`privacidad.ts:5`) y el anexo
(`52-anexo-subencargados.md:38`).

**Consecuencia.** El titular recibe, en el documento del art. 15, un fundamento
mal citado justo en el renglón que define quién responde por sus datos. No cambia
el fondo (la fr. XX sí es la que excluye a la encargada de la definición de
transferencia, y se cita bien en :592), pero el aviso es la constancia que se
presenta ante la autoridad.

**Causa raíz probable.** Las dos fracciones viven en la misma ficha YAML y se
copió la del título del archivo en lugar de la del concepto.

---

### [BAJO] El código sigue afirmando que el gateway "fuerza ZDR", claim que el aviso ya dejó de hacer

`src/lib/llm/models.ts:19-23` frente a `src/lib/llm/openrouter.ts:224-231`

**Escenario, con el dato nombrado.** La foto del ticket de diésel de *Juan Pérez*
sale a OpenRouter con `provider: { data_collection: 'deny' }` (`openrouter.ts:226`),
que es una **preferencia de ruteo** que se pide en cada llamada. `models.ts:21`
la describe como *"Todo lo que lleve RFC/CFDI va SOLO a proveedores US/EU **con
Zero Data Retention**. El gateway **fuerza ZDR**"*.

**Consecuencia.** Es exactamente la afirmación que la auditoría 8 sacó del aviso
por falsa —nota en `privacidad.ts:584-589`: *"una garantía contractual que nadie
negoció con OpenRouter […] no un contrato de Zero Data Retention firmado"*— y que
el anexo mantiene como pendiente #3 (*"Confirmar el régimen de retención de
OpenRouter"*, `52-anexo:225`). Vive hoy solo en un comentario, pero es el
fundamento declarado de la decisión de arquitectura y es lo que un ingeniero
repetiría en una due diligence. El propio `11-datos-personales.md:381-395`
explica por qué no es lo mismo: ZDR se contrata por organización, no se activa
con una bandera por llamada.

**Causa raíz probable.** Se corrigió el texto que ve el titular y no la
justificación interna que lo originó.

## Inventario de salidas de datos personales

| Dato | A dónde sale | ¿Lo cubre el aviso? | ¿Hay revocación? |
|---|---|---|---|
| Nombre y teléfono del operador; texto de sus mensajes | Meta (WhatsApp Cloud API) | Sí — `privacidad.ts:510,592` | Sí: `PRIVACIDAD` por el mismo chat (`processor.ts:464`) |
| **Foto** del comprobante (con RFC, folios, y lo que salga en la imagen) | OpenRouter → Gemini/Anthropic/OpenAI | Sí, y con su límite dicho (`privacidad.ts:523`) | Parcial: se puede pedir borrar la foto; lo ya remitido no se recupera |
| **Texto libre** del chofer (historial de la conversación) | OpenRouter → Claude Sonnet (`processor.ts:2189`) | **No** — el aviso acota los modelos a "las fotos" → hallazgo MEDIO | Sí para el tratamiento futuro |
| Nombre del operador + conteo de diferencias | Pantalla del patrón (`vista.tsx:218`) | **No**, y el aviso promete "sin identificarte" → hallazgo ALTO | La oposición se registra pero **no** excluye del ranking |
| Todo lo persistido (gastos, RFC, liquidaciones) | Supabase, Vercel (cómputo en tránsito) | Sí — encargados enunciados | No: CFF art. 30 lo bloquea, y el aviso lo dice (`privacidad.ts:577`) |
| RFC, teléfono, CLABE, PAN en logs | Sentry (solo `warn`/`error`) | Sí (anexo §Sentry) | N/A — se borran antes de salir (`logger.ts:100-108`) |
| **Correo del usuario de oficina + token de sesión** | Resend → AWS SES (`enviar.ts:97`) | Parcial en `/privacidad:79`; **ausente del anexo** → hallazgo MEDIO | Sí (borrado de cuenta, `/privacidad:118`) |
| Correo del proveedor + CFDI completo adjunto | Resend → AWS SES (entrada, `api/correo/entrante`) | Sí — anexo renglón 6 | No: es fiscal (CFF 30) |
| UUID, RFC emisor/receptor, total del CFDI | SAT (`intake/sat.ts:15`) | Sí — y bien clasificado: autoridad, no subencargado | N/A |
| **Nombre, puesto, correo y teléfono del decisor de un prospecto** | OpenRouter → gpt-5.6-luna (`mensaje/route.ts:83`) | **NO EXISTE AVISO** → hallazgo CRÍTICO | **No hay ninguno** |
| Credenciales de portales de facturación del cliente | Cifradas AES-256-GCM en base, llave solo en entorno (`cofre.ts:66`) | Contrato, no aviso | Sí — `desactivarCredencial` (`credenciales.ts:171`) |

## Lo que revisé y está bien

- **El gate de tratamiento está cerrado.** `processor.ts:706-724`: si
  `ponerAvisoADisposicion` no devuelve `'puesto'`, el mensaje **no se procesa**,
  la foto no se descarga y no sale hacia ningún modelo. El hueco que
  `52-anexo:310-318` daba por abierto ("sin razón social el pipeline sigue")
  ya no existe, y los cuatro desenlaces se le explican al operador con la causa
  correcta en vez de culpar a su patrón por un blip de red.
- **La constancia del art. 16 se escribe después del envío y solo con `wamid`**
  (`repo.ts:802-830`), con reserva en SQL para no duplicar y liberación cuando
  Meta rechaza. Una constancia falsa es peor que ninguna, y aquí se trató así.
- **El reenvío por cambio de aviso es estructural**, no un contador que alguien
  recuerde subir: `versionAviso` es un hash del texto (`privacidad.ts:270`), así
  que cambiar el domicilio de la flota dispara el art. 15 fr. VI solo.
- **La oposición del art. 26 fr. II hace algo.** `processor.ts:230-245` escribe
  `operador.oposicion_automatizada` (solo si estaba en `NULL`, para conservar la
  primera fecha) y el motor exige revisión humana para cerrar. Los detectores de
  `OPOSICION`/`OPOSICION_AMBIGUA`/`RECHAZA_AUTOMATIZADO` (`privacidad.ts:298-374`)
  están calibrados a favor de la cobertura y con la razón de cada regla escrita.
- **El aviso degradado no miente.** Sin liga integral utilizable se manda el
  aviso completo diciendo que la empresa no lo ha publicado, en vez de pegar una
  dirección muerta (`privacidad.ts:252-254`); `/aviso/[tenant]` devuelve 404 en
  vez de un documento a medias y señala en pantalla lo que la flota no capturó.
- **`revisarAvisoIntegral` ya no apaga dominios reales.** El cambio de `includes`
  a frontera de palabra (`privacidad.ts:118-121`) con 37 casos en
  `privacidad_ronda6.test.ts`; `autotransportesindependientes.com.mx` pasa,
  `/aviso-pendiente` sigue cayendo.
- **El filtro de sensibles está cableado y su límite dicho.**
  `sanitizarProducto` (`sanitizar.ts:111`) descarta el valor entero en vez de
  dejar la etiqueta "[dato de salud omitido]", que seguiría siendo una inferencia
  de salud guardada; y el aviso describe el flujo real —la foto viaja completa,
  el filtro actúa después— en lugar de prometer de más (`privacidad.ts:523`).
- **Retención con ejecutor.** `mantenimiento_de_datos` corre por cron diario
  (`vercel.json`, `15 4 * * *`) y cada plazo que `/privacidad:100` promete tiene
  su función: 30 días WhatsApp, 7 idempotencia API, 90 correo, 180 corridas,
  conversaciones y códigos. Nada fiscal se toca, y la página explica por qué.
- **Redacción de PII en logs**: una sola pasada, UUID pseudonimizado y no
  borrado, RFC/teléfono/CLABE/PAN suprimidos, y Sentry alimentado por ese mismo
  camino (`logger.ts:72,157`). El `wa_id` mexicano de 13 dígitos está cubierto.
- **Custodia de credenciales**: AES-256-GCM con IV nuevo por guardado, llave solo
  en entorno, `cifrar` lanza si falta la llave en vez de guardar en claro, pistas
  de 4 caracteres al panel, y `desactivarCredencial` como camino de revocación.
- **`PROVIDER_OPTS` se aplica en las tres funciones** que hablan con OpenRouter
  (`openrouter.ts:289,441,728`): no hay un cuarto camino sin `data_collection`.
- **El aviso integral cubre los once elementos** del checklist §5.4 y marca
  `pendiente` lo que la flota no dio (art. 29) en vez de inventarlo
  (`privacidad.ts:597-610`, `aviso/[tenant]/page.tsx:100-112`).
- **El buzón de correo entrante no registra al remitente en el log**
  (`api/correo/entrante/route.ts:120`) y resuelve el tenant por destinatario,
  nunca por el `from`.
- Las 113 pruebas de `privacidad*`, `aviso_integral` y `app/privacidad` corren
  en verde.

## Lo que NO alcancé a revisar

- **La landing (`likida.ai`) vive en otro repo.** No pude comprobar si el
  formulario de `/getdemo` que alimenta `POST /api/lead` muestra aviso o casilla
  de consentimiento antes de escribir `contacto_nombre`, `correo` y `telefono` en
  `prospecto`. La ruta de este repo no guarda ninguna traza de consentimiento, así
  que si la landing lo captura, no llega hasta acá.
- **Los contratos.** Los pendientes 1 y 2 del anexo —anexo de subencargado con
  OpenRouter, y autorización de subcontratación en el contrato con la flota
  (Regl. arts. 54-55)— son documentos, no código, y no hay nada en el repo con
  qué verificarlos.
- **El banco de fotos de QA** (`qa-storage.ts`, buckets `qa-fotos`/`qa-evidencia`)
  lo carga a mano el superadmin y no tiene purga. No pude determinar si lo que se
  sube son comprobantes de clientes reales; si lo fueran, sería un tratamiento
  secundario (probar el producto) que ninguna finalidad del aviso enuncia. Queda
  como pregunta, no como hallazgo.
- **`solicitud_arco` y `bitacora_auditoria` no se purgan nunca.** Es defendible
  como evidencia de cumplimiento, pero no encontré la decisión escrita ni un
  plazo declarado; no lo reporto porque no puedo nombrar la obligación
  incumplida.
- **El texto vigente de la LFPDPPP de marzo 2025 completo.** Trabajé con los
  cuatro artículos transcritos literal en `normas/lfpdppp-*.yaml`
  (`verificado_fuente_primaria`) y con la tabla de equivalencias de
  `11-datos-personales.md:44-60`. Los artículos que cito fuera de esos —11, 14,
  31, 9— salen de esa tabla y del propio texto del aviso, no de la fuente
  primaria abierta por mí en esta ronda.
